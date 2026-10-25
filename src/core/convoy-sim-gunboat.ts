// 味方の大発を守る模擬（core/convoy-sim）の隼艇（v0.6.6「日本ハードモード⑤：隼艇」。jp_01 のハードだけ。docs/02 §6.4、spec-v066 §C.3・§C.4・§F.5・§F.6）。
// 世界と同じ段で呼ぶ（convoy-sim）: 輸送隊の段の直後に stepConvoySimGunboat（core/gunboat の判断 → 運動 → 帯 → valid を標的スロットの末尾の船体へ）、自艇の 25mm の後に
// fireConvoySimGunboat（守りの砲＝凍結の本体を core/pt-gun で・乱数 seed+22・撃ったときだけ引く → 米PT が隼艇を見つける距離 ×target_range_factor）、標的を選んだ後に
// gunboatContactFlash（標的が隼艇なら撃ったステップの閃光は隼艇から・倍率なし）、着弾は hitConvoySimGunboat（HP だけ・乱数なし）。隼艇の撃退・撃沈は PT ごとに最後の結末を決めた砲（fateBy）。
// 数え（GunboatTrial）は §F.6 の列: 隼艇の沈没・失った HP・砲・狙われた攻撃・不変（決着の後の発射と被弾・視程か射程の外・自艇の視程の外での発射）・画面の外にいた秒（W7）。
// Phaser 非依存。確保は createConvoySimGunboat の 1 夜に 1 回だけ（毎ステップの関数は確保しない）。
import type { BoatState } from './boat-motion';
import type { ConvoyParams, ConvoyState } from './convoy';
import type { GunEvents } from './gun-battery';
import { createGunboat, hitGunboat, stepGunboat, type GunboatCtx, type GunboatParams, type GunboatState } from './gunboat';
import type { ReturnPoint } from './mission-flow';
import { GUNBOAT_GUN_SEED_OFFSET, PT_FATE_NONE, PT_FATE_SUNK, type PtCheck, type PtEvents, type PtHull, type PtSection } from './pt-boats';
import { hitPt } from './pt-damage';
import type { PtParams } from './pt-data';
import { createPtGun, stepPtGun, type PtGunState } from './pt-gun';
import { ptHeldFlashM, type PtTargetRule, type PtTargetSet } from './pt-target';
import { SeededRng } from './rng';
import { enemyDetectRangeM, speedFactorForBand, type VisibilityParams } from './visibility';

/** 画面の外の計測（W7。模擬の計測だけで遊びは変えない）: 自艇から m（画面の縦の半分＝論理の高さ 720 ÷ 既定のズーム 0.75 ÷ 2） */
export const GUNBOAT_OFFSCREEN_M = 480;
/** fateBy の値: 結末を決めた砲（0 は結末なし） */
export const FATE_BY_PLAYER = 1;
export const FATE_BY_GUNBOAT = 2;

/** 1 夜の隼艇の記録（ConvoyTrial.gunboat。隼艇の無い夜は鍵ごと無い） */
export interface GunboatTrial {
  /** 沈んだ・その体感秒（NaN は無し）・失った HP・受けた命中 */
  sunk: boolean; sunkS: number; hpLost: number; hitsTaken: number;
  /** 25mm: 発射・命中・撃退・撃沈（最後の結末を決めた砲が隼艇の PT）・制圧 */
  shots: number; hits: number; retired: number; ptSunk: number; suppressions: number;
  /** 隼艇への航過・連射・1 回の攻撃の最大命中・最初に見つかった標的が隼艇 */
  passes: number; bursts: number; worstPassHits: number; firstTarget: boolean;
  /** 不変: 決着の後に撃ったステップ・受けた命中、視程か射程の外への発射、自艇から視程（新月 900 m）の外での発射（ステップ） */
  postFire: number; postHits: number; beyond: number; beyondPlayer: number;
  /** 決着の前に隼艇と自艇が浮いていた実秒・そのうち自艇から GUNBOAT_OFFSCREEN_M の外にいた実秒 */
  watchS: number; offS: number;
}

/** 模擬の隼艇（1 夜に 1 個） */
export interface ConvoySimGunboat {
  readonly p: GunboatParams;
  readonly g: GunboatState;
  readonly ctx: GunboatCtx;
  readonly gun: PtGunState;
  readonly rng: SeededRng;
  readonly ev: GunEvents;
  /** 標的スロットの船体（末尾＝大発の数 + 1）とその index */
  readonly hullRef: PtHull;
  readonly hull: number;
  /** 最後に撃った体感秒（閃光の記憶）、PT ごとに最後の結末を決めた砲（FATE_BY_*） */
  lastFireS: number;
  readonly fateBy: Int8Array;
  readonly rec: GunboatTrial;
}

/** 材料（convoy-sim の 1 夜の値）: 米PT（今夜）・隊・輸送隊（今夜）・自艇・帰投の輪・視界・弾の数 */
export interface ConvoySimGunboatInit {
  pt: PtParams; q: PtSection; f: ConvoyState; cp: ConvoyParams; player: BoatState; start: { x: number; y: number; headingDeg: number };
  ring: ReturnPoint; visRange2: number; gunShellPoolSize: number;
}

/** 出撃時に 1 回: 隼艇を自艇の出発点からの定位置に置き、標的スロットの末尾に船体を足す（createPtTargetSet の前に呼ぶ）。乱数は seed+22 の系列を作るだけ（引かない） */
export function createConvoySimGunboat(p: GunboatParams, o: ConvoySimGunboatInit, hulls: PtHull[], seed: number, ptEv: PtEvents): ConvoySimGunboat {
  const g = createGunboat(p, o.start);
  const hullRef: PtHull = { boat: g.boat, halfLengthM: p.halfLengthM, halfBeamM: p.halfBeamM, valid: true };
  const hull = hulls.length;
  hulls.push(hullRef);
  const rng = new SeededRng((seed + GUNBOAT_GUN_SEED_OFFSET) >>> 0);
  const gun = createPtGun(p.gun, o.gunShellPoolSize);
  const q = o.q;
  const rec: GunboatTrial = {
    sunk: false, sunkS: NaN, hpLost: 0, hitsTaken: 0, shots: 0, hits: 0, retired: 0, ptSunk: 0, suppressions: 0, passes: 0, bursts: 0, worstPassHits: 0, firstTarget: false,
    postFire: 0, postHits: 0, beyond: 0, beyondPlayer: 0, watchS: 0, offS: 0,
  };
  const fateBy = new Int8Array(q.boats.length);
  const range2 = p.gun.rangeM * p.gun.rangeM;
  const ev: GunEvents = {
    // 撃ったステップ（最初の 1 発）: 標的の PT までと自艇までの距離で不変を数える
    onFire: (x, y) => {
      const t = q.boats[gun.battery.target]!;
      const d2 = (t.x - x) * (t.x - x) + (t.y - y) * (t.y - y);
      if (d2 > range2 || d2 > o.visRange2) rec.beyond++;
      if ((o.player.x - x) * (o.player.x - x) + (o.player.y - y) * (o.player.y - y) > o.visRange2) rec.beyondPlayer++;
      if (g.resolved) rec.postFire++;
    },
    // 生きた PT への命中ごとに seed+22 から 1 回（世界の PtSquadron と同じ hitPt）。結末が変われば隼艇が決めた
    onHit: (i, gi) => {
      const f0 = q.boats[i]!.fate;
      hitPt(q, o.pt, i, p.gun.groups[gi]!.damage, rng.next(), ptEv);
      if (q.boats[i]!.fate !== f0) fateBy[i] = FATE_BY_GUNBOAT;
    },
    onMiss: () => {},
  };
  const ctx: GunboatCtx = { player: o.player, convoy: o.f, convoyParams: o.cp, pts: q, ring: o.ring, bounds: o.pt.bounds, visRange2: o.visRange2 };
  return { p, g, ctx, gun, rng, ev, hullRef, hull, lastFireS: -Infinity, fateBy, rec };
}

/** 輸送隊の段の直後（1 固定ステップ）: 判断 → 運動 → 帯 → valid（標的スロットの船体へ写す。今の標的が的でなくなれば targetValid を落とす）。決着の前の画面の外の秒を数える */
export function stepConvoySimGunboat(sg: ConvoySimGunboat, ts: PtTargetSet, c: PtCheck, playerSinking: boolean, realDt: number, dt: number): void {
  const g = sg.g;
  stepGunboat(g, sg.p, sg.ctx, ts.current, playerSinking, dt);
  sg.hullRef.valid = g.valid;
  if (!g.valid && ts.current === sg.hull) c.targetValid = false;
  if (g.sunk || g.resolved || playerSinking) return;
  sg.rec.watchS += realDt;
  const pl = sg.ctx.player;
  const dx = g.boat.x - pl.x;
  const dy = g.boat.y - pl.y;
  if (dx * dx + dy * dy > GUNBOAT_OFFSCREEN_M * GUNBOAT_OFFSCREEN_M) sg.rec.offS += realDt;
}

/** 自艇の 25mm の後: 隼艇の 25mm（守りの砲。canFire は船体の valid）→ 米PT が隼艇を見つける距離 = 倍率 × max(帯の発見距離, 閃光の記憶)。命中・制圧は砲の段の前後の差 */
export function fireConvoySimGunboat(sg: ConvoySimGunboat, q: PtSection, pt: PtParams, ts: PtTargetSet, rule: PtTargetRule, vis: VisibilityParams, visRange2: number, t: number, realDt: number, dt: number): void {
  const g = sg.g;
  const h0 = q.gunHits;
  const u0 = q.suppressions;
  stepPtGun(sg.gun, sg.p.gun, g.boat, g.band, g.held, g.valid, q, pt, visRange2, sg.rng, realDt, dt, sg.ev);
  sg.rec.hits += q.gunHits - h0;
  sg.rec.suppressions += q.suppressions - u0;
  if (sg.gun.battery.fired) sg.lastFireS = t;
  const bandM = enemyDetectRangeM(pt.baseDetectM, speedFactorForBand(g.band, vis.speedFactor), vis, false);
  ts.detectM[sg.hull] = sg.p.targetRangeFactor * Math.max(bandM, ptHeldFlashM(t, sg.lastFireS, rule.flashHoldS, sg.p.gun.flashRevealM));
}

/** 標的を選んだ後: 今の標的が隼艇なら、接触の閃光は隼艇がこのステップに撃ったときの閃光の距離（倍率なし）と隼艇の位置 */
export function gunboatContactFlash(sg: ConvoySimGunboat, ts: PtTargetSet, c: PtCheck): void {
  if (ts.current !== sg.hull) return;
  c.flashM = sg.gun.battery.fired ? sg.p.gun.flashRevealM : 0;
  c.flashX = sg.g.boat.x;
  c.flashY = sg.g.boat.y;
}

/** PT の弾が隼艇の船体に当たった（乱数なし）: HP だけ。沈んだ同じステップで船体の valid を落とし、今の標的なら targetValid も */
export function hitConvoySimGunboat(sg: ConvoySimGunboat, ts: PtTargetSet, c: PtCheck, damage: number, t: number): void {
  if (sg.g.resolved && !sg.g.sunk) sg.rec.postHits++;
  if (!hitGunboat(sg.g, damage, t)) return;
  sg.hullRef.valid = false;
  if (ts.current === sg.hull) c.targetValid = false;
}

/** 攻撃を固めた（標的が隼艇）: 航過か連射を数える */
export function noteGunboatAttack(sg: ConvoySimGunboat, burst: boolean): void {
  if (burst) sg.rec.bursts++;
  else sg.rec.passes++;
}

/** 自艇の 25mm の命中で PT の結末が変わった（最後の結末を決めた砲を自艇に） */
export function notePlayerFate(sg: ConvoySimGunboat, i: number): void {
  sg.fateBy[i] = FATE_BY_PLAYER;
}

/** 夜の終わり: 隼艇の状態と、最後の結末を決めた砲が隼艇の PT（撃沈・撃退）を記録へ写す */
export function finishConvoySimGunboat(sg: ConvoySimGunboat, q: PtSection): GunboatTrial {
  const r = sg.rec;
  const g = sg.g;
  r.sunk = g.sunk;
  r.sunkS = g.sunkS;
  r.hpLost = sg.p.hullHp - g.hp;
  r.hitsTaken = g.hitsTaken;
  r.shots = sg.gun.battery.shots;
  for (let i = 0; i < q.boats.length; i++) {
    if (sg.fateBy[i] !== FATE_BY_GUNBOAT) continue;
    const fate = q.boats[i]!.fate;
    if (fate === PT_FATE_SUNK) r.ptSunk++;
    else if (fate !== PT_FATE_NONE) r.retired++;
  }
  return r;
}
