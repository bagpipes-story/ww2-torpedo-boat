// 空襲下の退避の模擬の台本（core/evac-sim-policy）の舵取り: 操作中の隊長艇（座席）を隠れ場所の輪へ寄せて止める（減速は「この距離で止まれる速さ」まで。
// 人は減速の誤差 ±30%・針路のぶれ ±10°）、隠さない時は港を走り回る、投下に転舵する。隠れ場所と次の隊の選び（空き枠 ≥ 浮いている隻数・見つかった陰は除く）もここ。
// Phaser 非依存・確保しない（候補の並びは固定長の作業の配列）。
import { G_FOUND, G_HIDDEN, G_MOORED, G_UNDERWAY, SHELTER_COVER } from './evac-data';
import type { EvacDriver, EvacSimView } from './evac-sim-policy';
import { EVAC_HUMAN, type EvacFrameOut } from './evac-sim-rows';
import { evacAfloat, evacLeader, type EvacGroup, type EvacSquadron } from './evac-squadron';
import { bearingDeg } from './ship-ai';
import { wrapDeg180, wrapDeg360 } from './units';

/** 舵取りの状態（EvacDriver が持つ） */
export interface EvacSteerState {
  legGroup: number;
  legShelter: number;
  /** 減速の誤差（1 ± brakeErr。大きいほど遅く減速＝行き過ぎる） */
  legBrake: number;
  jitterDeg: number;
  jitterUntil: number;
  roamK: number;
  dodgeAt: number;
  dodgeUntil: number;
  dodgeHeading: number;
  lastCmdHeading: number;
}

/** 転舵の角度・走り回りの点の切り替えの距離（m）・転舵しない隠れ場所への残りの距離（m。寄せている最中は転舵しない）・ぶれを縮める距離（m） */
const DODGE_TURN_DEG = 90;
const ROAM_SWITCH_M = 300;
const DODGE_SKIP_M = 150;
const JITTER_FADE_M = 200;
/** 隠れ場所の中心からこの距離（m。輪 70 m の内）でスティックを離す（減速の曲線は中心で止まる速さ＝ここからなら中心のあたりで止まる） */
const BRAKE_M = 25;

const cand = new Int32Array(16);
const candKey = new Float64Array(16);

/** 隠れ場所 s に隊 g が入れる（空き枠 ≥ 浮いている隻数・見つかった陰でない）。any（決着の後）はどこでも */
function roomAt(sq: EvacSquadron, g: EvacGroup, s: number, any: boolean): boolean {
  if (any) return true;
  return s !== g.foundCover && sq.p.shelters[s]!.slots - sq.shelterUsed[s]! >= evacAfloat(g);
}

/** 入れる隠れ場所を近い順（coverFirst なら陰を先）に cand へ。数を返す */
function candidates(sq: EvacSquadron, g: EvacGroup, any: boolean, coverFirst: boolean): number {
  const lead = evacLeader(g);
  if (!lead) return 0;
  let n = 0;
  for (let s = 0; s < sq.p.shelters.length; s++) {
    if (!roomAt(sq, g, s, any)) continue;
    const sh = sq.p.shelters[s]!;
    const dx = sh.x - lead.state.x;
    const dy = sh.y - lead.state.y;
    const key = dx * dx + dy * dy + (coverFirst && sh.kind !== SHELTER_COVER ? 1e12 : 0);
    let k = n++;
    while (k > 0 && candKey[k - 1]! > key) {
      candKey[k] = candKey[k - 1]!;
      cand[k] = cand[k - 1]!;
      k--;
    }
    candKey[k] = key;
    cand[k] = s;
  }
  return n;
}

/** 隊 g の最寄りの入れる隠れ場所（無ければ −1） */
export function evacRoomFor(sq: EvacSquadron, g: EvacGroup, any: boolean): number {
  return candidates(sq, g, any, false) > 0 ? cand[0]! : -1;
}

/** bot の次の隊: 入れる所がある外の隊のうち、狙われている → 止まっている → 走っている、同じ段は最寄りの入れる所に近い順（無ければ −1） */
export function evacBestGroup(sq: EvacSquadron): number {
  let best = -1;
  let bestKey = Infinity;
  for (let gi = 0; gi < sq.groups.length; gi++) {
    const g = sq.groups[gi]!;
    if (gi === sq.control || g.leader < 0 || !(g.phase === G_MOORED || g.phase === G_UNDERWAY || g.phase === G_FOUND)) continue;
    if (candidates(sq, g, false, false) === 0) continue;
    const tier = sq.targeted[gi] ? 0 : g.phase === G_UNDERWAY ? 2 : 1;
    const key = tier * 1e12 + candKey[0]!;
    if (key < bestKey) {
      bestKey = key;
      best = gi;
    }
  }
  return best;
}

/** 針路の人のぶれ（jitterEveryS ごとに ±headingJitterDeg を引き直す。目的地に近いほど小さく） */
function jitter(d: EvacDriver, t: number, distM: number): number {
  if (d.sp.bot) return 0;
  if (t >= d.jitterUntil) {
    d.jitterDeg = d.rng.nextRange(-EVAC_HUMAN.headingJitterDeg, EVAC_HUMAN.headingJitterDeg);
    d.jitterUntil = t + EVAC_HUMAN.jitterEveryS;
  }
  return d.jitterDeg * Math.min(1, distM / JITTER_FADE_M);
}

/** 転舵の間なら転舵の針路で全速（今の旋回の逆へ DODGE_TURN_DEG。直進なら左）。転舵したら true */
function dodging(d: EvacDriver, v: EvacSimView, out: EvacFrameOut): boolean {
  const t = v.t;
  if (!(t >= d.dodgeAt && t < d.dodgeUntil)) return false;
  const s = v.seat.state;
  if (Number.isNaN(d.dodgeHeading)) {
    const turn = Number.isNaN(d.lastCmdHeading) ? 0 : wrapDeg180(d.lastCmdHeading - s.headingDeg);
    d.dodgeHeading = wrapDeg360(s.headingDeg + (turn >= 0 ? -DODGE_TURN_DEG : DODGE_TURN_DEG));
  }
  out.headingDeg = d.dodgeHeading;
  out.speed01 = 1;
  return true;
}

/** 全速（seq_slow は巡航）の指令 */
function full01(d: EvacDriver, v: EvacSimView): number {
  const p = v.seat.params;
  return d.sp.cruise && p.speedMaxMps > 0 ? Math.min(1, p.speedCruiseMps / p.speedMaxMps) : 1;
}

/** 隠れ場所 s の中心へ寄せて止める（その距離で止まれる速さまで減速。輪の中で hide_max 以下なら中立＝core が入れる） */
function approach(d: EvacDriver, v: EvacSimView, s: number, out: EvacFrameOut): void {
  const sh = v.sq.p.shelters[s]!;
  const st = v.seat.state;
  const p = v.seat.params;
  const dx = sh.x - st.x;
  const dy = sh.y - st.y;
  const d2 = dx * dx + dy * dy;
  const ring = v.sq.p.shelterRingM;
  if (d2 <= ring * ring && st.speedMps <= v.sq.p.hideMaxMps) {
    out.headingDeg = NaN;
    out.speed01 = 0;
    return;
  }
  const dist = Math.sqrt(d2);
  if (dist > DODGE_SKIP_M && dodging(d, v, out)) return;
  // 中心の BRAKE_M 内（輪の中）は舵を当てずにスティックを離す（その速さなら中心の先で止まる＝回り込まない）
  if (dist <= BRAKE_M) {
    out.headingDeg = NaN;
    out.speed01 = 0;
    return;
  }
  out.headingDeg = wrapDeg360(bearingDeg(st.x, st.y, sh.x, sh.y) + jitter(d, v.t, dist));
  const want = Math.sqrt(2 * p.decelMps2 * d.legBrake * dist);
  out.speed01 = p.speedMaxMps > 0 ? Math.min(full01(d, v), want / p.speedMaxMps) : 0;
}

/** 隊 g を入れる隠れ場所へ（any は決着の後＝どこでも）。行き先が無ければ false */
function goShelter(d: EvacDriver, v: EvacSimView, g: EvacGroup, any: boolean, out: EvacFrameOut): boolean {
  const sq = v.sq;
  if (d.legGroup !== g.index || d.legShelter < 0 || !roomAt(sq, g, d.legShelter, any)) {
    const n = candidates(sq, g, any, d.sp.cover);
    if (n === 0) return false;
    const second = !d.sp.bot && n > 1 && d.rng.next() < EVAC_HUMAN.secondShelterP;
    d.legShelter = cand[second ? 1 : 0]!;
    d.legGroup = g.index;
    d.legBrake = d.sp.bot ? 1 : 1 + d.rng.nextRange(-EVAC_HUMAN.brakeErr, EVAC_HUMAN.brakeErr);
  }
  approach(d, v, d.legShelter, out);
  return true;
}

/** 港を走り回る（左右の 2 点を全速で行き来。投下には転舵） */
function roam(d: EvacDriver, v: EvacSimView, out: EvacFrameOut): void {
  if (dodging(d, v, out)) return;
  const st = v.seat.state;
  const b = v.sq.cfg.bounds;
  const wx = b.width * (d.roamK === 0 ? 0.25 : 0.75);
  const wy = b.height * 0.5;
  const dx = wx - st.x;
  const dy = wy - st.y;
  if (dx * dx + dy * dy < ROAM_SWITCH_M * ROAM_SWITCH_M) d.roamK ^= 1;
  out.headingDeg = wrapDeg360(bearingDeg(st.x, st.y, wx, wy) + jitter(d, v.t, ROAM_SWITCH_M));
  out.speed01 = full01(d, v);
}

/** 操作中の隊の舵（タップ・反応待ち・動き出す前の外。決着の後はどこかの輪で止まって帰投） */
export function evacSteer(d: EvacDriver, v: EvacSimView, out: EvacFrameOut): void {
  const sq = v.sq;
  const g = sq.groups[sq.control]!;
  out.headingDeg = NaN;
  out.speed01 = 0;
  if (sq.settled) {
    if (g.phase !== G_HIDDEN) goShelter(d, v, g, true, out);
  } else if (g.phase === G_MOORED || g.phase === G_UNDERWAY || g.phase === G_FOUND) {
    const hides = d.sp.hide === 'seq' || (d.sp.hide === 'own' && g.index === sq.p.startGroup);
    if (!(hides && goShelter(d, v, g, false, out)) && d.sp.idle === 'roam') roam(d, v, out);
    if (!hides && d.sp.idle === 'stop') {
      out.headingDeg = NaN;
      out.speed01 = 0;
    }
  }
  if (!Number.isNaN(out.headingDeg)) d.lastCmdHeading = out.headingDeg;
}
