// 夜明けの空襲の模擬（v0.6.1。docs/02 §6.8）。Phaser 非依存。ゲームは使わない（tests/air-strike-sim.test.ts と scripts/dawn-strike-sim.ts が使う）。
// 夜明けの瞬間に輪の縁から全速 N 秒の所を輪へ向かって走る艇を、ゲームと同じ core（stepAirStrike・stepBoat・stepEscort・applyShellHit・stepDamage・hitEscort）と
// 同じ固定ステップ・同じ順序（艇 → 輪 → 僚艇 → 火災 → 空襲。着弾の被害は空襲の後）で動かし、遊び方（台本）ごとに 輪に着いた割合・自艇を狙った爆弾 1 発あたりの命中・僚艇の生存 を数える。
// 乱数はゲームと同じく 1 系列で散布と自艇の火災・機関を引く（僚艇の被弾は引かない）。遊び方の揺らぎ（ジグザグの位相）は別の系列。
// 省いたもの: 乗員の減りによる旋回・加速の低下、燃料、座礁、命中スロー、消火ボタンの長押し（台本の「消すまでの秒」にまとめた）。確保は 1 回の模擬の始めだけ。
import { AS_EV_IMPACT, AS_EV_RELEASE, createAirStrike, startAirStrike, stepAirStrike, type AirStrikeCheck, type AirStrikeParams } from './air-strike';
import type { BoatInput, BoatParams, BoatState, SeaBounds } from './boat-motion';
import { stepBoat } from './boat-motion';
import { createEscort, hitEscort, stepEscort, type EscortParams } from './escort';
import { applyShellHit, createDamageState, stepDamage, type DamageParams, type HitOutcome } from './gunnery';
import { SeededRng } from './rng';
import { radToDeg, wrapDeg180, wrapDeg360 } from './units';

export interface StrikeSimSetup {
  strike: AirStrikeParams;
  boat: BoatParams;
  damage: DamageParams;
  /** 僚艇（us_01）。いなければ null */
  escort: EscortParams | null;
  /** 帰投地点の輪の半径 m */
  ringRadiusM: number;
  timeScale: number;
  /** 固定ステップの実時間秒（step-config の FIXED_STEP_S） */
  stepS: number;
}

/** 遊び方の台本: 直進で帰る・止まる（隠れる）・舵いっぱいで回り続ける・帰る向き ±45° のジグザグ・投下を見て r 秒後に 90° 転舵 */
export type StrikePolicyKind = 'straight' | 'stop' | 'circle' | 'zigzag' | 'react';
/** react の転舵の向き: home＝輪に近い側、same＝今の旋回と同じ側、opp＝今の旋回と逆（same・opp は旋回していなければ home） */
export type StrikeReactSide = 'home' | 'same' | 'opp';
export interface StrikePolicy {
  kind: StrikePolicyKind;
  /** react の反応秒（投下から転舵まで。他は NaN）、転舵を保つ秒、向き */
  reactS: number;
  holdS: number;
  side: StrikeReactSide;
  /** 火災が起きてから消すまでの体感秒（消火ボタンの長押しを含む） */
  extinguishS: number;
  name: string;
}

/** 台本の値（模擬の設定。ゲームの値ではない。prototype scratchpad v061/raid-sim と同じ） */
const DODGE_TURN_DEG = 90;
const DODGE_HOLD_S = 0.9;
const ZIGZAG_DEG = 45;
const ZIGZAG_LEG_S = 2;
/** 回り続ける: 目標方位を今の針路 + 90° に置き続ける（舵いっぱい） */
const CIRCLE_AHEAD_DEG = 90;
/** 消すまでの秒: 止まる・直進 3.0、回り続ける 1.5、ジグザグ 2.0、react は反応の速さで 1.5（≤0.35 秒）・2.0（≤0.5 秒）・3.0 */
const EXTINGUISH_S = { straight: 3.0, stop: 3.0, circle: 1.5, zigzag: 2.0 } as const;
const REACT_EXTINGUISH: readonly (readonly [number, number])[] = [
  [0.35, 1.5],
  [0.5, 2.0],
  [Infinity, 3.0],
];
/** この体感秒までに輪に着かなければ「着かなかった」（止まる・回り続けるは波が続いて必ず沈む） */
const SIM_MAX_S = 400;
/** 模擬の海域（端の押し戻しも狙いの端の収めも働かない広さ。systems/air-strike-sim-setup が空襲の値にも使う）と艇の出発点 */
export const SIM_BOUNDS: SeaBounds = { width: 1e6, height: 1e6 };
const SIM_ORIGIN = 5e5;
/** 時刻の比較の丸めの余裕（1/60 秒の積み上げの誤差で 1 ステップ遅れないように） */
const TIME_EPS_S = 1e-6;

export function strikePolicy(kind: StrikePolicyKind, reactS: number = NaN, side: StrikeReactSide = 'home', holdS: number = DODGE_HOLD_S): StrikePolicy {
  if (kind !== 'react') return { kind, reactS: NaN, holdS: NaN, side: 'home', extinguishS: EXTINGUISH_S[kind], name: kind };
  if (!(reactS >= 0)) throw new Error(`react の反応秒（${reactS}）は 0 以上`);
  if (!(holdS > 0)) throw new Error(`react の転舵を保つ秒（${holdS}）は正`);
  const ext = REACT_EXTINGUISH.find((e) => reactS <= e[0])![1];
  const plain = side === 'home' && holdS === DODGE_HOLD_S;
  return { kind, reactS, holdS, side, extinguishS: ext, name: plain ? `react ${reactS}` : `react ${reactS} ${side}${holdS}` };
}

/** 'straight' | 'stop' | 'circle' | 'zigzag' | 'react0.5' | 'react0.5 same2.3'（= 'react0.5same2.3'。向き home / same / opp と保つ秒。scripts の POL） */
export function parseStrikePolicy(name: string): StrikePolicy {
  const n = name.trim();
  if (n === 'straight' || n === 'stop' || n === 'circle' || n === 'zigzag') return strikePolicy(n);
  const m = /^react\s*([0-9.]+)(?:\s*(home|same|opp)\s*([0-9.]+))?$/.exec(n);
  if (m) return strikePolicy('react', Number(m[1]), (m[2] ?? 'home') as StrikeReactSide, m[3] !== undefined ? Number(m[3]) : DODGE_HOLD_S);
  throw new Error(`遊び方 ${name} は straight / stop / circle / zigzag / react<秒>（/ react<秒> home|same|opp<保つ秒>）`);
}

export interface StrikeTrial {
  survived: boolean;
  vipAlive: boolean;
  /** 自艇を狙った爆弾の着弾数と、その命中数 */
  bombsAtPlayer: number;
  hitsAtPlayer: number;
  /** 終わった体感秒（輪に着いた・沈んだ・打ち切り） */
  timeS: number;
}

/**
 * 1 回。夜明け（t = 0）に艇は全速・北向き、輪の縁は北へ distM（中心は distM + 半径）。夜明けのラッチと同じく、最初のステップの前に空襲を始める。
 * 終わり: 輪に入った（生還）・沈んだ（爆弾か火災）・SIM_MAX_S。rng は散布と自艇の被害、polRng はジグザグの位相
 */
export function runStrikeTrial(s: StrikeSimSetup, pol: StrikePolicy, distM: number, rng: SeededRng, polRng: SeededRng): StrikeTrial {
  const bp: BoatParams = { ...s.boat }; // 機関損傷で最大速力を下げる（boat-damage と同じ）
  const d = createDamageState(s.damage);
  const stop = pol.kind === 'stop';
  const boat: BoatState = { x: SIM_ORIGIN, y: SIM_ORIGIN, headingDeg: 0, speedMps: stop ? 0 : bp.speedMaxMps };
  const homeX = SIM_ORIGIN;
  const homeY = SIM_ORIGIN - distM - s.ringRadiusM;
  const r2 = s.ringRadiusM * s.ringRadiusM;
  const esc = s.escort ? createEscort(s.escort, boat) : null;
  if (esc) esc.boat.speedMps = boat.speedMps;
  const st = createAirStrike(s.strike);
  const c: AirStrikeCheck = { player: boat, playerSinking: false, escort: esc ? esc.boat : null, escortAfloat: esc !== null, cancel: false };
  const input: BoatInput = { headingDeg: 0, speed01: stop ? 0 : 1 };
  const hit: HitOutcome = { destroyed: false, startedFire: false, engineHit: false };
  const realDt = s.stepS;
  const dt = realDt * s.timeScale;
  const zigPhase = pol.kind === 'zigzag' ? 2 * ZIGZAG_LEG_S * polRng.next() : 0;
  const out: StrikeTrial = { survived: false, vipAlive: true, bombsAtPlayer: 0, hitsAtPlayer: 0, timeS: 0 };
  let dodgeAt = NaN;
  let dodgeUntil = -1;
  let dodgeHeading = 0;
  let fireOutAt = NaN;
  let t = 0;
  startAirStrike(st, s.strike, boat);
  while (t < SIM_MAX_S) {
    // 遊び方（毎フレームの入力に当たる。固定ステップの前）。t0 はこのステップの始まりの時刻（艇はここから realDt 進む）
    const t0 = t;
    t += realDt;
    const homeBrg = wrapDeg360(radToDeg(Math.atan2(homeX - boat.x, -(homeY - boat.y))));
    if (pol.kind === 'straight') input.headingDeg = homeBrg;
    else if (pol.kind === 'stop') input.headingDeg = NaN;
    else if (pol.kind === 'circle') input.headingDeg = wrapDeg360(boat.headingDeg + CIRCLE_AHEAD_DEG);
    else if (pol.kind === 'zigzag') input.headingDeg = wrapDeg360(homeBrg + (Math.floor((t0 + zigPhase) / ZIGZAG_LEG_S) % 2 === 0 ? ZIGZAG_DEG : -ZIGZAG_DEG));
    else {
      if (t0 >= dodgeAt - TIME_EPS_S) {
        // 投下を見て r 秒後: 90° 転舵して holdS 保ち、また輪へ。向きは輪に近い側（home）か、旋回中なら今の旋回（空襲が測った旋回率）と同じ側・逆
        const yaw = st.yawDegS;
        const turning = yaw !== 0 && Math.abs(yaw) >= s.strike.aimTurnMinDegS;
        const homeSide = wrapDeg180(homeBrg - boat.headingDeg) >= 0 ? 1 : -1;
        const dir = pol.side === 'home' || !turning ? homeSide : (yaw > 0) === (pol.side === 'same') ? 1 : -1;
        dodgeHeading = wrapDeg360(boat.headingDeg + dir * DODGE_TURN_DEG);
        dodgeUntil = t0 + pol.holdS;
        dodgeAt = NaN;
      }
      input.headingDeg = t0 < dodgeUntil - TIME_EPS_S ? dodgeHeading : homeBrg;
    }
    if (t0 >= fireOutAt - TIME_EPS_S) {
      d.fireLeftS = 0;
      fireOutAt = NaN;
    }
    // 固定ステップ（mission-world の順）: 艇 → 輪 → 僚艇 → 火災 → 空襲（最後）
    stepBoat(boat, input, bp, dt);
    const hx = boat.x - homeX;
    const hy = boat.y - homeY;
    if (hx * hx + hy * hy <= r2) {
      out.survived = true;
      break;
    }
    if (esc) stepEscort(esc, s.escort!, boat, true, SIM_BOUNDS, dt);
    if (stepDamage(d, s.damage, realDt)) break;
    c.escortAfloat = esc !== null && !esc.sunk;
    const ev = stepAirStrike(st, s.strike, c, rng, realDt);
    // 反応は本当の投下の瞬間（このステップの終わり t から core が持ち越した秒を引く）から数え、その r 秒後以降に始まる最初のステップで転舵（反応は r 〜 r + 1 ステップ）
    if (ev & AS_EV_RELEASE && pol.kind === 'react') dodgeAt = t - (st.waveT - st.lastReleaseT) + pol.reactS;
    if (ev & AS_EV_IMPACT) {
      // 投下の間隔 > 落下（検査済み）なので、1 ステップの着弾は lastImpact の 1 発だけ
      const b = st.bombs[st.lastImpact]!;
      if (!b.toEscort) {
        out.bombsAtPlayer++;
        if (b.hitPlayer) out.hitsAtPlayer++;
      }
      if (b.hitPlayer) {
        applyShellHit(d, s.strike.bombHit, s.damage, rng, hit);
        if (hit.startedFire) fireOutAt = t + pol.extinguishS;
        if (hit.engineHit) {
          bp.speedMaxMps = s.boat.speedMaxMps * s.damage.engineSpeedFactor;
          if (bp.speedCruiseMps > bp.speedMaxMps) bp.speedCruiseMps = bp.speedMaxMps;
        }
      }
      if (b.hitEscort && esc) hitEscort(esc, s.strike.bombHit.damage, t); // 世界と同じく自艇の後に僚艇（乱数は引かない）
      if (d.hp <= 0) break;
    }
  }
  out.timeS = t;
  out.vipAlive = esc === null || !esc.sunk;
  return out;
}

export interface StrikeCellResult {
  trials: number;
  /** 輪に着いた割合・僚艇が浮いていた割合（僚艇のいない任務は NaN）・自艇を狙った爆弾 1 発あたりの命中 */
  survived: number;
  vipAlive: number;
  hitsPerBomb: number;
  bombsAtPlayer: number;
}

/** n 回。輪の縁まで全速 secsFromRing 体感秒（distM = 秒 × 全速 m/s × time_scale）。乱数は seed の 1 系列（同じ seed なら同じ結果） */
export function runStrikeCell(s: StrikeSimSetup, pol: StrikePolicy, secsFromRing: number, n: number, seed: number): StrikeCellResult {
  const distM = secsFromRing * s.boat.speedMaxMps * s.timeScale;
  const rng = new SeededRng(seed >>> 0);
  const polRng = new SeededRng((seed + 1) >>> 0);
  let survived = 0;
  let vip = 0;
  let bombs = 0;
  let hits = 0;
  for (let i = 0; i < n; i++) {
    const r = runStrikeTrial(s, pol, distM, rng, polRng);
    if (r.survived) survived++;
    if (r.vipAlive) vip++;
    bombs += r.bombsAtPlayer;
    hits += r.hitsAtPlayer;
  }
  return { trials: n, survived: survived / n, vipAlive: s.escort ? vip / n : NaN, hitsPerBomb: bombs > 0 ? hits / bombs : NaN, bombsAtPlayer: bombs };
}
