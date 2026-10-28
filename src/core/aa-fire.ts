// 対空（v0.6.8。spec-v068 §1.1 D5・§5.1。ユーザー「命中率が0.5%くらいでも飛行機に対して機銃をうってもいいはず」）: 機銃を押している間、艦艇の標的が無ければ
// 射程（hit_rate_model.json の anti_aircraft.range_m）内・射界内（艇首・艇尾の ±gun_battery.dead_cone_deg の外）の最寄りの機へ撃つ。弾道は計算しない:
// 撃った 1 発ごとに seed+24 の系列から 1 回だけ引き、hit_chance_per_round ÷ 艇の速力帯の gun_battery.spread_factor 未満なら狙った機を撃墜（撃墜そのものは呼ぶ側が core/air-down で）。
// 発射の間隔は艇の砲の組の rounds_per_min（体感の発/分。core/gun-battery と同じく撃てない間は負の残りを溜めない＝押した瞬間の一斉発射なし）。弾倉は core/magazine（交換は呼ぶ側が進める）。
// 機の位置は呼ぶ側が毎ステップ AaTargets に入れる（世界の座標。確保は createAaTargets だけ）。Phaser 非依存・毎ステップ確保しない・押していなければ乱数を引かない。
import { AS_DONE, AS_IDLE, strikePose, type AirStrikeParams, type AirStrikeState } from './air-strike';
import type { BoatState, SpeedStep } from './boat-motion';
import type { AircraftPose } from './friendly';
import type { GunBatteryParams } from './gun-battery';
import { magazineSpend, type MagazineParams, type MagazineState } from './magazine';
import type { SeededRng } from './rng';
import { degToRad } from './units';

/** 対空の乱数の系列（seed+24。v0.6.8）。+25 は艦への機銃（core/arms-cue の SHIP_GUN_SEED_OFFSET）。1 発に 1 回だけ引く */
export const AA_SEED_OFFSET = 24;
/** 機の枠の数（夜明けの 4 機 + 夜の出撃の 2 機 + 水上機 1 機 = 7 ≤ 8） */
export const AA_MAX_TARGETS = 8;
/** 機の出どころ（撃墜の振り分けと文）: 夜明けの空襲・夜の哨戒機の出撃（jp_02）・夜の水上機（us_02） */
export const AA_SRC_DAWN = 0;
export const AA_SRC_SORTIE = 1;
export const AA_SRC_SEAPLANE = 2;
/** 状態: 押していない / 撃っている / 機がいない / 艇首・艇尾の死角 / 射程外 / 艦艇を撃っている（砲は 1 つ。呼ぶ側が書く）/ 弾倉交換 */
export const AA_SAFE = 0;
export const AA_FIRING = 1;
export const AA_NO_TARGET = 2;
export const AA_OUT_OF_ARC = 3;
export const AA_OUT_OF_RANGE = 4;
export const AA_BUSY = 5;
export const AA_RELOAD = 6;

/** hit_rate_model.json の anti_aircraft と gun_flash（config/loadout-data の getAntiAircraftParams が検査して作る） */
export interface AntiAircraftParams {
  /** 停止・静音での 1 発の撃墜の確率（速力帯の spread_factor で割る） */
  hitChancePerRound: number;
  /** 撃てる距離 m（2 次元。高度は見ない） */
  rangeM: number;
  /** v0.6.8 の機銃を撃ってから敵の見つける距離を閃光の距離以上に保つ体感秒 */
  flashHoldS: number;
}

/** 機の枠（構造体の配列。n 個目までが今のステップの機）。x・y は世界の座標、src は AA_SRC_*、idx はその出どころの中の番号（空襲の機 i） */
export interface AaTargets {
  n: number;
  x: number[];
  y: number[];
  live: boolean[];
  src: number[];
  idx: number[];
}

export interface AaState {
  /** 組ごとの次の 1 発までの体感秒 */
  cooldownS: number[];
  status: number;
  /** 射程・射界の中の最寄りの機の枠（無ければ -1。弾倉交換中も候補は入る＝撃っているかは status） */
  target: number;
  /** 累計の発数と、このステップに撃ったか */
  rounds: number;
  firedThisStep: boolean;
}

export function createAaTargets(): AaTargets {
  const t: AaTargets = { n: 0, x: [], y: [], live: [], src: [], idx: [] };
  for (let i = 0; i < AA_MAX_TARGETS; i++) {
    t.x.push(0);
    t.y.push(0);
    t.live.push(false);
    t.src.push(0);
    t.idx.push(-1);
  }
  return t;
}

export function createAaState(g: GunBatteryParams): AaState {
  return { cooldownS: g.groups.map(() => 0), status: AA_SAFE, target: -1, rounds: 0, firedThisStep: false };
}

/** 枠を 1 つ足す（枠が尽きれば足さない） */
export function pushAaTarget(t: AaTargets, x: number, y: number, src: number, idx: number): void {
  if (t.n >= AA_MAX_TARGETS) return;
  const k = t.n++;
  t.x[k] = x;
  t.y[k] = y;
  t.live[k] = true;
  t.src[k] = src;
  t.idx[k] = idx;
}

/** 空襲の core の機（夜明けの空襲・夜の出撃）を足す: 待機・終わりでなく、濃さ > 0 の機。位置は艇 + strikePose の相対（pose は呼ぶ側の使い回し） */
export function addStrikePlanes(t: AaTargets, s: AirStrikeState, p: AirStrikeParams, boat: BoatState, src: number, pose: AircraftPose): void {
  for (let i = 0; i < s.planes.length; i++) {
    const ph = s.planes[i]!.phase;
    if (ph === AS_IDLE || ph === AS_DONE) continue;
    strikePose(s, p, i, pose);
    if (pose.alpha <= 0) continue;
    pushAaTarget(t, boat.x + pose.dx, boat.y + pose.dy, src, i);
  }
}

/**
 * 標的選び: 生きた枠のうち射程内（d² ≤ range2、端を含む）・射界内（艇首ベクトルとの内積² ≤ deadConeCos2·d²。gun-battery の selectTargetOf と同じ向き）の最寄り。
 * 状態（理由の優先: 死角 > 射程外 > いない）を st.status に書き、枠を返す（無ければ -1）
 */
export function selectAaTarget(st: AaState, t: AaTargets, boat: BoatState, range2: number, deadConeCos2: number): number {
  const h = degToRad(boat.headingDeg);
  const hx = Math.sin(h);
  const hy = -Math.cos(h);
  let best = -1;
  let bestD2 = Infinity;
  let any = false;
  let inRange = false;
  for (let i = 0; i < t.n; i++) {
    if (!t.live[i]) continue;
    any = true;
    const dx = t.x[i]! - boat.x;
    const dy = t.y[i]! - boat.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > range2) continue;
    inRange = true;
    const dot = dx * hx + dy * hy;
    if (dot * dot > deadConeCos2 * d2) continue;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = i;
    }
  }
  st.status = best >= 0 ? AA_FIRING : inRange ? AA_OUT_OF_ARC : any ? AA_OUT_OF_RANGE : AA_NO_TARGET;
  return best;
}

/**
 * 固定ステップ。held = 機銃を押している、canFire = 撃てる（呼ぶ側: 浮いている・輪の外・座礁していない・終わりの待ちでない・艦艇を撃っていない）。
 * 艦艇を撃っているなら呼ぶ側は canFire false で呼び、押していれば後で status を AA_BUSY にする。mag は弾倉（無い砲は null。交換は呼ぶ側の magazineTick）。
 * 組ごと: 間隔を進め、標的が無い・間隔が残る・弾倉が撃てない・このステップに撃墜した なら撃たない（負の残りは 0 に）。撃てば 1 発・間隔 + 60/rpm・弾倉 −1・
 * 乱数 1 回（< hit_chance / spread_factor[band] で撃墜）。戻り値は撃墜した枠（無ければ -1。撃墜は呼ぶ側が downStrikePlane / downSeaplane で）
 */
export function stepAaFire(
  st: AaState,
  g: GunBatteryParams,
  aa: AntiAircraftParams,
  mag: MagazineState | null,
  magParams: MagazineParams | null,
  held: boolean,
  canFire: boolean,
  band: SpeedStep,
  boat: BoatState,
  t: AaTargets,
  rng: SeededRng,
  feelDt: number,
): number {
  st.firedThisStep = false;
  const reloading = mag !== null && (mag.reloadLeftS > 0 || mag.magLeft <= 0);
  const target = held && canFire ? selectAaTarget(st, t, boat, aa.rangeM * aa.rangeM, g.deadConeCos2) : -1;
  if (!held || !canFire) st.status = AA_SAFE;
  else if (reloading) st.status = AA_RELOAD;
  st.target = target;
  const p = aa.hitChancePerRound / g.spreadFactor[band];
  let downed = -1;
  for (let i = 0; i < g.groups.length; i++) {
    const cd = Math.max(st.cooldownS[i]! - feelDt, -feelDt);
    st.cooldownS[i] = cd;
    if (target < 0 || reloading || downed >= 0 || cd > 0 || (mag !== null && mag.magLeft <= 0)) {
      if (cd < 0) st.cooldownS[i] = 0; // 撃てない間は負の残りを溜めない（押した瞬間の一斉発射を防ぐ。gun-battery と同じ）
      continue;
    }
    st.cooldownS[i] = cd + 60 / g.groups[i]!.roundsPerMin;
    st.rounds++;
    st.firedThisStep = true;
    if (mag !== null && magParams !== null) magazineSpend(mag, magParams, 1);
    if (rng.next() < p) downed = target;
  }
  return downed;
}
