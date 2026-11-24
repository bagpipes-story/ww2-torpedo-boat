// 煙幕への乱射（v0.8.4。史実モードだけ。ユーザーの要望 2026-11-23「…500M以下での至近距離での煙幕発動効果を敵が見失っているものの、煙幕の範囲に無作為に攻撃をしてくるように…
// 見失って煙幕の中に向かって乱射するので命中率は高くない。でも近づくにつれて命中率があがるように」。範囲の答え「敵の艦すべて」＝探照灯で照らして撃つ艦の EnemyFire の全部）。
// 撃つのは（1 隻・1 ステップごとに全部が真の時）: 自艇を見つけている（ship-ai の playerDetected＝見失うまでの detect_hold_s 込み）・煙幕で線が遮られている（losBlocked）・
// 撃てる（艦も艇も沈み始めていない）・ほかに見えている目標が無い（2 目標の任務の僚艇が照らされていれば普段の砲がそちらを撃つ）・最後に見た点がある・艦から自艇まで max_range_m 以内。
// 狙うのは煙で、艇ではない: 最後に見た点（見つけている間に線が遮られていなかった最後のステップの自艇の位置。煙の中で見つけ直した時はその時の位置）から puff_search_m 以内の
// 生きている煙の 1 つ（一様に 1 つ。無ければ最後に見た点）に、半径 R(d)（d＝艦から狙う点。min_range_m 以下で scatter_min_m・max_range_m 以上で scatter_max_m・間は直線）の円盤の一様
// （launchShell の r = R√u）。見越しなし（艦は艇の速さを見ていない）。弾は普段の弾と同じプール・同じ飛行・同じ当たり（updateGuns・updateGunsPair の着弾の輪）・同じ被害。
// 発射間隔は砲ごとに普段の 1 / rate_factor 倍・撃てない間は負の残りを溜めない（普段と同じ規則）。乱数は世界に 1 つの別系列（seed+46。BARRAGE_SEED_OFFSET）だけを引く（普段の砲の系列は引かない）。
// 撃たないステップは乱数を引かない。Phaser 非依存・毎ステップ確保しない（状態は艦ごとに固定長）。
import type { BoatState } from './boat-motion';
import type { GunneryParams, GunneryState } from './gunnery';
import type { SeededRng } from './rng';
import { launchShell, pointNearBoat, type ShellState } from './shells';
import type { SmokeState } from './smoke';

/** 乱射の乱数の系列（seed+46。v0.8.4。史実モードで煙幕のある艇と艦の隊のいる世界だけ作る。+21 は大発の 13mm の予約のまま＝tests/landing-imports。一覧は core/night の頭） */
export const BARRAGE_SEED_OFFSET = 46;

export interface SmokeBarrageParams {
  /** 艦から自艇までこの m 以内でだけ撃つ */
  maxRangeM: number;
  /** 散布の半径の直線の両端（艦から狙う点までの m と半径 m） */
  minRangeM: number;
  scatterMaxM: number;
  scatterMinM: number;
  /** 最後に見た点からこの m 以内の煙を狙う */
  puffSearchM: number;
  /** 発射の速さの倍率（0 < f ≤ 1。間隔は普段の 1 / f 倍） */
  rateFactor: number;
}

export interface SmokeBarrageState {
  /** 最後に見た点（hasFix の間だけ意味がある）と前のステップに見つけていたか */
  hasFix: boolean;
  fixX: number;
  fixY: number;
  prevDetected: boolean;
  /** 砲ごとの次弾までの実秒（普段の砲の gunCooldownS とは別） */
  cooldownS: Float64Array;
  /** 弾のプールの枠ごとに、乱射の弾が飛んでいる（1） */
  blind: Uint8Array;
  /** 累計: 撃った・着いた・自艇の船体に当たった（着弾の輪で）・自艇から近い（nearM 以内）に落ちた */
  fired: number;
  landed: number;
  hits: number;
  near: number;
}

export function createSmokeBarrageState(gunCount: number, shellPoolSize: number): SmokeBarrageState {
  return { hasFix: false, fixX: 0, fixY: 0, prevDetected: false, cooldownS: new Float64Array(gunCount), blind: new Uint8Array(shellPoolSize), fired: 0, landed: 0, hits: 0, near: 0 };
}

/** 最後に見た点を書く: 見つけている間に線が遮られていなければ今の位置、煙の中で見つけ直した（見つけた立ち上がり）ならその時の位置。見失えば点を捨てる */
export function noteContact(b: SmokeBarrageState, boat: BoatState, detected: boolean, losBlocked: boolean): void {
  if (detected && (!losBlocked || !b.prevDetected)) {
    b.hasFix = true;
    b.fixX = boat.x;
    b.fixY = boat.y;
  } else if (!detected) {
    b.hasFix = false;
  }
  b.prevDetected = detected;
}

/** 散布の半径 m（d＝艦から狙う点までの m）。min_range_m 以下で scatter_min_m、max_range_m 以上で scatter_max_m、間は直線 */
export function barrageScatterM(p: SmokeBarrageParams, d: number): number {
  if (d <= p.minRangeM) return p.scatterMinM;
  if (d >= p.maxRangeM) return p.scatterMaxM;
  return p.scatterMinM + ((p.scatterMaxM - p.scatterMinM) * (d - p.minRangeM)) / (p.maxRangeM - p.minRangeM);
}

/** 狙う点（散布の前）を out に書く: 最後に見た点から puff_search_m 以内の生きている煙から一様に 1 つ（乱数 1 回）。無ければ最後に見た点（乱数なし） */
export function pickBarrageAim(b: SmokeBarrageState, p: SmokeBarrageParams, smoke: SmokeState | null, rng: SeededRng, out: { x: number; y: number }): void {
  out.x = b.fixX;
  out.y = b.fixY;
  if (!smoke) return;
  const r2 = p.puffSearchM * p.puffSearchM;
  let n = 0;
  for (let i = 0; i < smoke.puffs.length; i++) if (inSearch(smoke, i, b, r2)) n++;
  if (n === 0) return;
  let k = Math.min(n - 1, Math.floor(rng.next() * n));
  for (let i = 0; i < smoke.puffs.length; i++) {
    if (!inSearch(smoke, i, b, r2)) continue;
    if (k-- === 0) {
      out.x = smoke.puffs[i]!.x;
      out.y = smoke.puffs[i]!.y;
      return;
    }
  }
}

function inSearch(smoke: SmokeState, i: number, b: SmokeBarrageState, r2: number): boolean {
  const q = smoke.puffs[i]!;
  if (!q.active) return false;
  const dx = q.x - b.fixX;
  const dy = q.y - b.fixY;
  return dx * dx + dy * dy <= r2;
}

/** 撃った時の知らせ（普段の砲の ShellEvents・PairShellEvents の onFire と同じ形。砲口の閃光と発砲の数） */
export interface BarrageFireEvents {
  onFire(gunIndex: number, x: number, y: number): void;
}

const aim = { x: 0, y: 0 };

/**
 * 1 ステップ（普段の砲の発射の前。弾は普段の砲の updateGuns・updateGunsPair が同じステップのうちに飛ばして着弾を判定する）。
 * visibleTarget＝ほかに見えている目標がある（普段の砲が撃てる）。戻りは撃った弾の数
 */
export function stepSmokeBarrage(
  b: SmokeBarrageState,
  p: SmokeBarrageParams,
  gp: GunneryParams,
  g: GunneryState,
  ship: BoatState,
  boat: BoatState,
  detected: boolean,
  losBlocked: boolean,
  canFire: boolean,
  visibleTarget: boolean,
  smoke: SmokeState | null,
  rng: SeededRng,
  realDt: number,
  events: BarrageFireEvents,
): number {
  noteContact(b, boat, detected, losBlocked);
  const dx = boat.x - ship.x;
  const dy = boat.y - ship.y;
  const d2 = dx * dx + dy * dy;
  const on = canFire && detected && losBlocked && !visibleTarget && !g.illuminated && b.hasFix && d2 <= p.maxRangeM * p.maxRangeM;
  let fired = 0;
  for (let i = 0; i < gp.guns.length; i++) {
    const gun = gp.guns[i]!;
    const cd = Math.max(b.cooldownS[i]! - realDt, -realDt);
    b.cooldownS[i] = cd;
    if (!on || cd > 0 || d2 > gun.effectiveM * gun.effectiveM) {
      if (cd < 0) b.cooldownS[i] = 0; // 撃てない間は負の残りを溜めない（普段の砲と同じ）
      continue;
    }
    const slot = freeSlot(g.shells);
    if (slot < 0) continue;
    b.cooldownS[i] = cd + 60 / (gun.roundsPerMinPerGun * gun.count * p.rateFactor);
    pickBarrageAim(b, p, smoke, rng, aim);
    const ax = aim.x - ship.x;
    const ay = aim.y - ship.y;
    launchShell(g.shells[slot]!, ship.x, ship.y, aim.x, aim.y, 0, 0, gun.shellSpeedMps, barrageScatterM(p, Math.sqrt(ax * ax + ay * ay)), i, rng);
    b.blind[slot] = 1;
    b.fired++;
    fired++;
    events.onFire(i, ship.x, ship.y);
  }
  return fired;
}

function freeSlot(shells: readonly ShellState[]): number {
  for (let i = 0; i < shells.length; i++) if (!shells[i]!.active) return i;
  return -1;
}

/**
 * 普段の砲の段の後（同じステップ）: 着いた乱射の弾を数える。当たりは普段の着弾と同じ輪（自艇の船体＋砲の splash 半径）で数え直すだけ（被害は普段の着弾の知らせが既に与えた）。
 * 戻りはこのステップに自艇から nearM 以内に落ちた乱射の弾の数（HUD の 2 行目）
 */
export function settleBarrageShells(b: SmokeBarrageState, shells: readonly ShellState[], gp: GunneryParams, boat: BoatState, halfLengthM: number, halfBeamM: number, nearM: number): number {
  let near = 0;
  for (let i = 0; i < shells.length; i++) {
    if (b.blind[i] === 0 || shells[i]!.active) continue;
    b.blind[i] = 0;
    b.landed++;
    const s = shells[i]!;
    if (pointNearBoat(s.impactX, s.impactY, boat, halfLengthM, halfBeamM + gp.guns[s.gunIndex]!.splashRadiusM)) b.hits++;
    const dx = s.impactX - boat.x;
    const dy = s.impactY - boat.y;
    if (dx * dx + dy * dy <= nearM * nearM) near++;
  }
  b.near += near;
  return near;
}

// ---------- data の読み出し（hit_rate_model.historical_mode.smoke_barrage） ----------

export interface SmokeBarrageDataRecord {
  max_range_m: number;
  min_range_m: number;
  scatter_max_m: number;
  scatter_min_m: number;
  puff_search_m: number;
  rate_factor: number;
}

/** 検査: みな有限・0 < min_range_m < max_range_m・0 ≤ scatter_min_m ≤ scatter_max_m・puff_search_m ≥ 0・0 < rate_factor ≤ 1 */
export function isSmokeBarrageDataRecord(v: unknown): v is SmokeBarrageDataRecord {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  const keys = ['max_range_m', 'min_range_m', 'scatter_max_m', 'scatter_min_m', 'puff_search_m', 'rate_factor'] as const;
  if (!keys.every((k) => typeof r[k] === 'number' && Number.isFinite(r[k]))) return false;
  const n = r as unknown as SmokeBarrageDataRecord;
  return n.min_range_m > 0 && n.min_range_m < n.max_range_m && n.scatter_min_m >= 0 && n.scatter_min_m <= n.scatter_max_m && n.puff_search_m >= 0 && n.rate_factor > 0 && n.rate_factor <= 1;
}

export function smokeBarrageParamsFromData(r: SmokeBarrageDataRecord): SmokeBarrageParams {
  return { maxRangeM: r.max_range_m, minRangeM: r.min_range_m, scatterMaxM: r.scatter_max_m, scatterMinM: r.scatter_min_m, puffSearchM: r.puff_search_m, rateFactor: r.rate_factor };
}
