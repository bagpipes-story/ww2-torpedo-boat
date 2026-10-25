// 夜の哨戒機の模擬の台本（v0.6.7。日本ハードモード⑥・jp_02「孤島の哨戒」。spec-v067 §F.1・§F.2）。core/patrol-air-sim が 1 夜ずつ回す。Phaser 非依存。
// 台本は HUD と同じ材料（門番の段・レーダーか・lock_m の線までの秒・夜の出撃と夜明けの空襲の投下）だけを読む。ここの数は模擬の設定（ゲームの値ではない。
// 試作 scratchpad v067/proto/patrol-sim-v2 と同じ）。名前は <型>[@<止める遅れ秒>][/<転舵の反応秒>][~]（~ は転舵の反応を投下ごとに揺らす）:
//   hud: 全速で輪へ。目の捜索は秒読み 0 の遅れ秒後に止まり（スティック中立）付近の捜索が終わるまで止まり、去れば全速。見つかったら（出撃・夜明けの後）全速で輪へ・投下で転舵
//   quiet: 14 kt（静音の上限の 0.4 kt 下）で輪へ。止まるのは hud と同じ／quiet_dodge: 14 kt で止まらない／quiet_nostop: 14 kt のまま止まらず、見つかっても 14 kt で転舵
//   run: 全速で止まらない（逃げるだけ）／run_straight: 全速でまっすぐ（転舵しない）／run_slow: 全速、投下でスティックを戻し落下 + 0.2 秒止める（転舵しない）
//   run_ring: 全速、着弾点の輪から離れる側へ転舵（理想）／cruise: 自艇の巡航（20 kt）で止まらない／pulse: 哨戒の間は全速と 14 kt を 2.5 秒ずつ（止まるのは hud と同じ）
//   hide_wait: 出発点で夜明けまで止まり、その後は全速でまっすぐ（退化の確認）

import type { AirStrikeParams, AirStrikeState } from './air-strike';
import type { BoatInput, BoatState } from './boat-motion';
import { PA_ORBIT, PA_PASS, PA_SORTIE, patrolLockInS, type PatrolParams, type PatrolState } from './patrol-air';
import type { SeededRng } from './rng';
import { radToDeg, wrapDeg180, wrapDeg360 } from './units';

export type PatrolPolicyKind = 'hud' | 'quiet' | 'quiet_dodge' | 'quiet_nostop' | 'run' | 'run_straight' | 'run_slow' | 'run_ring' | 'cruise' | 'pulse' | 'hide_wait';
const KINDS: readonly PatrolPolicyKind[] = ['hud', 'quiet', 'quiet_dodge', 'quiet_nostop', 'run', 'run_straight', 'run_slow', 'run_ring', 'cruise', 'pulse', 'hide_wait'];

/** 転舵の向き: opp＝旋回中（空襲の core が測った旋回率）は今の旋回と逆・直進なら帰投の側、ring＝着弾点の輪から離れる側（輪が正面なら帰投の側）、none＝転舵しない */
export type PatrolDodgeSide = 'opp' | 'ring' | 'none';
/** 見つかる前の速さ: full＝全速、cruise＝自艇の巡航、quiet＝静音の上限の少し下（航跡なし） */
export type PatrolSpeed = 'full' | 'cruise' | 'quiet';

export interface PatrolPolicy {
  name: string;
  kind: PatrolPolicyKind;
  speed: PatrolSpeed;
  /** 目の捜索で秒読み 0 の stopLagS 秒後に止まり、付近の捜索が終わるまで止まる（hud・quiet・pulse） */
  hides: boolean;
  /** 夜の出撃か夜明けの空襲が来ている間は全速（hud・quiet・quiet_dodge・pulse。ほかは見つかる前の速さのまま） */
  fullWhenAttacked: boolean;
  side: PatrolDodgeSide;
  /** 秒読み 0 から止め始めるまでの秒（@。既定 0.3） */
  stopLagS: number;
  /** 投下から転舵までの秒（/。既定 0.5）。jitter なら投下ごとに PatrolSimSetup.reactJitterS の一様 */
  reactS: number;
  jitter: boolean;
  /** 火災から消し終わるまでの体感秒（乗員の減りで伸びる消火の長押しは模擬が足す） */
  extinguishS: number;
}

/** 台本の値（模擬の設定）: 止める遅れ・転舵の反応の既定、転舵の角、輪が正面とみなす角、pulse の秒、静音の上限からの下げ、run_slow の止める足し */
const STOP_LAG_S = 0.3;
const REACT_S = 0.5;
const DODGE_TURN_DEG = 90;
const RING_AHEAD_DEG = 10;
const PULSE_S = 2.5;
export const QUIET_BELOW_KT = 0.4;
const SLOW_EXTRA_S = 0.2;
const TIME_EPS_S = 1e-6; // 時刻の比較の丸めの余裕（1/60 秒の積み上げの誤差で 1 ステップ遅れないように）
/** 消すまでの秒: 転舵しない台本 3.0、揺らぎ（~）2.0、決まった反応は 0.35 秒以下 1.5・0.5 秒以下 2.0・ほか 3.0（夜明けの空襲の模擬と同じ段） */
const EXTINGUISH_NONE_S = 3.0;
const EXTINGUISH_JITTER_S = 2.0;
const REACT_EXTINGUISH: readonly (readonly [number, number])[] = [
  [0.35, 1.5],
  [0.5, 2.0],
  [Infinity, 3.0],
];

/** spec §F.3 の 15 台本（表の行の順。★ は hud~・quiet~） */
export const PATROL_SIM_POLICIES: readonly string[] = [
  'hud~', 'hud', 'hud/0.35', 'hud/0.7', 'hud@2.0~', 'quiet~', 'quiet_dodge~', 'quiet_nostop', 'run~', 'run_straight', 'run_slow', 'run_ring', 'cruise~', 'pulse~', 'hide_wait',
];

/** 掃き（spec C.6 の F11。scripts の TABLE=3）: hud/0.30〜hud/1.00 の 0.05 刻み（消火は 2.0 秒に揃える） */
export const PATROL_SWEEP_REACT_S: readonly number[] = Array.from({ length: 15 }, (_, i) => Math.round((0.3 + 0.05 * i) * 100) / 100);
export const PATROL_SWEEP_EXTINGUISH_S = 2.0;

/** 名前を読む。extinguishS を渡せば消すまでの秒をそれに揃える（EXT。掃きは 2.0） */
export function parsePatrolPolicy(name: string, extinguishS?: number): PatrolPolicy {
  const n = name.trim();
  const m = /^([a-z_]+?)(?:@([0-9.]+))?(?:\/([0-9.]+))?(~?)$/.exec(n);
  const kind = m?.[1] as PatrolPolicyKind | undefined;
  if (!m || !kind || !KINDS.includes(kind)) throw new Error(`台本 ${name} は ${KINDS.join(' / ')}（＋@止める遅れ秒・/転舵の反応秒・~ 揺らぎ）`);
  const stopLagS = m[2] !== undefined ? Number(m[2]) : STOP_LAG_S;
  const reactS = m[3] !== undefined ? Number(m[3]) : REACT_S;
  if (!(stopLagS >= 0) || !(reactS >= 0)) throw new Error(`台本 ${name} の秒は 0 以上`);
  const jitter = m[4] === '~';
  const side: PatrolDodgeSide = kind === 'run_straight' || kind === 'run_slow' || kind === 'hide_wait' ? 'none' : kind === 'run_ring' ? 'ring' : 'opp';
  const ext = side === 'none' ? EXTINGUISH_NONE_S : jitter ? EXTINGUISH_JITTER_S : REACT_EXTINGUISH.find((e) => reactS <= e[0])![1];
  if (extinguishS !== undefined && !(extinguishS > 0)) throw new Error(`消すまでの秒（${extinguishS}）は正`);
  return {
    name: n,
    kind,
    speed: kind === 'quiet' || kind === 'quiet_dodge' || kind === 'quiet_nostop' ? 'quiet' : kind === 'cruise' ? 'cruise' : 'full',
    hides: kind === 'hud' || kind === 'quiet' || kind === 'pulse',
    fullWhenAttacked: kind === 'hud' || kind === 'quiet' || kind === 'quiet_dodge' || kind === 'pulse',
    side,
    stopLagS,
    reactS,
    jitter,
    extinguishS: extinguishS ?? ext,
  };
}

/** 台本が読む物と台本の状態（core/patrol-air-sim が 1 夜の始めに 1 回作る。dawnLatched は世界が書く） */
export interface PatrolPolicyCtx {
  pol: PatrolPolicy;
  gate: PatrolState;
  gateP: PatrolParams;
  night: AirStrikeState;
  nightP: AirStrikeParams;
  dawn: AirStrikeState;
  dawnP: AirStrikeParams;
  boat: BoatState;
  ringX: number;
  ringY: number;
  dawnLatched: boolean;
  /** 速さの指令（全速 1）と揺らぎ（PatrolSimSetup の写し）と台本の系列 */
  quiet01: number;
  cruise01: number;
  reactJitterS: readonly [number, number];
  holdS: readonly [number, number];
  stopJitterS: readonly [number, number] | null;
  reactRng: SeededRng;
  holdRng: SeededRng;
  stopRng: SeededRng;
  /** 状態: 次に転舵する時刻・転舵を保つ終わり・転舵の向き・止める終わり（run_slow）・今の捜索の止める遅れとその捜索・pulse の秒 */
  dodgeAt: number;
  dodgeUntil: number;
  dodgeHeading: number;
  slowUntil: number;
  stopLagS: number;
  lastPassK: number;
  pulseT: number;
}

/** 1 ステップの入力（固定ステップの前。t0 はこのステップの始まりの実秒）。燃料切れなら速さ 0、止まっていて転舵中でなければ舵なし（NaN） */
export function patrolPolicyStep(c: PatrolPolicyCtx, t0: number, realDt: number, fuelEmpty: boolean, input: BoatInput): void {
  const pol = c.pol;
  const g = c.gate;
  const boat = c.boat;
  const homeBrg = wrapDeg360(radToDeg(Math.atan2(c.ringX - boat.x, -(c.ringY - boat.y))));
  const st = c.dawnLatched ? c.dawn : g.phase === PA_SORTIE ? c.night : null;
  let spd = pol.speed === 'quiet' ? c.quiet01 : pol.speed === 'cruise' ? c.cruise01 : 1;
  if (pol.kind === 'pulse' && g.phase !== PA_PASS && g.phase !== PA_ORBIT) {
    c.pulseT += realDt;
    spd = Math.floor(c.pulseT / PULSE_S) % 2 === 0 ? 1 : c.quiet01;
  }
  if (st && pol.fullWhenAttacked) spd = 1;
  // 隠れる: 目の捜索の接近は lock_m の線の hud_stop_margin_s − 遅れ 秒前から（＝秒読み 0 の遅れ秒後）、付近の捜索は終わるまで止まる（レーダーの捜索と夜明けの後は止まらない）
  let stopHold = false;
  if (pol.hides && !c.dawnLatched && !g.radar) {
    if (g.phase === PA_PASS) {
      if (c.stopJitterS && g.k !== c.lastPassK) {
        c.lastPassK = g.k;
        c.stopLagS = c.stopJitterS[0] + (c.stopJitterS[1] - c.stopJitterS[0]) * c.stopRng.next();
      }
      stopHold = patrolLockInS(g, c.gateP) <= c.gateP.hudStopMarginS - c.stopLagS;
    } else stopHold = g.phase === PA_ORBIT;
  }
  if (pol.kind === 'hide_wait') stopHold = !c.dawnLatched;
  if (stopHold || t0 < c.slowUntil - TIME_EPS_S) spd = 0;
  let hdg = homeBrg;
  if (st && pol.side !== 'none') {
    if (t0 >= c.dodgeAt - TIME_EPS_S) {
      // 投下の r 秒後: 90° 切る（旋回中は逆へ・直進なら帰投の側、ring は着弾点の輪から離れる側）。戻す秒の後に帰投の向きへ
      const yaw = st.yawDegS;
      const turning = yaw !== 0 && Math.abs(yaw) >= (st === c.night ? c.nightP : c.dawnP).aimTurnMinDegS;
      let dir = pol.side === 'opp' && turning ? (yaw > 0 ? -1 : 1) : wrapDeg180(homeBrg - boat.headingDeg) >= 0 ? 1 : -1;
      if (pol.side === 'ring' && st.lastRelease >= 0) {
        const b = st.bombs[st.lastRelease]!;
        const rel = wrapDeg180(radToDeg(Math.atan2(b.aimX - boat.x, -(b.aimY - boat.y))) - boat.headingDeg);
        if (Math.abs(rel) > RING_AHEAD_DEG) dir = rel > 0 ? -1 : 1;
      }
      c.dodgeHeading = wrapDeg360(boat.headingDeg + dir * DODGE_TURN_DEG);
      c.dodgeUntil = t0 + (c.holdS[1] > c.holdS[0] ? c.holdS[0] + (c.holdS[1] - c.holdS[0]) * c.holdRng.next() : c.holdS[0]);
      c.dodgeAt = NaN;
    }
    if (t0 < c.dodgeUntil - TIME_EPS_S) hdg = c.dodgeHeading;
  }
  input.speed01 = fuelEmpty ? 0 : spd;
  input.headingDeg = spd === 0 && t0 >= c.dodgeUntil - TIME_EPS_S ? NaN : hdg;
}

/** 投下（夜の出撃か夜明けの空襲。t はこのステップの終わりの実秒）: 本当の投下の瞬間から反応の秒後に転舵、run_slow は落下 + 0.2 秒止める */
export function patrolPolicyRelease(c: PatrolPolicyCtx, st: AirStrikeState, p: AirStrikeParams, t: number): void {
  const pol = c.pol;
  if (pol.side !== 'none') c.dodgeAt = t - (st.waveT - st.lastReleaseT) + (pol.jitter ? c.reactJitterS[0] + (c.reactJitterS[1] - c.reactJitterS[0]) * c.reactRng.next() : pol.reactS);
  if (pol.kind === 'run_slow') c.slowUntil = t + p.fallFeelS + SLOW_EXTRA_S;
}
