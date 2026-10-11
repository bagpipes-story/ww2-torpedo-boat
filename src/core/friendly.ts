// 友軍誤射（識別。docs/02 §6.8、v0.3.3）: 帰り道に味方機が来て識別を求める。時間内に「識別」を押せば去り、押さなければ艇の真上を航過して掃射する。
// Phaser 非依存・毎ステップ確保しない（shallows.ts と同じ作法）。時計は体感の実秒（feelDt。煙幕・火災と同じで、命中スロー中は伸びる）。
// 味方機の位置は常に自艇からの相対（自艇が動いても付いてくる）。角度は方位（0=北、時計回り）。
import type { HitSpec } from './gunnery';
import { degToRad, ktToMps, radToDeg, wrapDeg360 } from './units';

/** 段階: 待機 → 識別要求（旋回） → 掃射（直線で航過） → 去る → 終了 */
export const FF_IDLE = 0;
export const FF_CHALLENGE = 1;
export const FF_STRAFE = 2;
export const FF_LEAVING = 3;
export const FF_DONE = 4;
/** 結果: 無し / 識別した / 撃ち終えて去った / 中断（輪の中・沈没・座礁・燃料切れ） */
export const FF_OUT_NONE = 0;
export const FF_OUT_IDENTIFIED = 1;
export const FF_OUT_GAVE_UP = 2;
export const FF_OUT_CANCELLED = 3;
/** stepFriendly の戻りビット: 真上を航過して撃った（被害を適用する） */
export const FF_EV_STRIKE = 1;

export interface FriendlyParams {
  /** 帰投地点の輪の縁からこの距離以内で開始条件を数える（missions_seed の friendly_aircraft.trigger_edge_m） */
  triggerEdgeM: number;
  /** (trigger_edge_m + 輪の半径)^2。中心までの距離の二乗と比べる（sqrt 無し） */
  zoneRadius2: number;
  /** 開始条件が続いていなければならない実秒 */
  quietS: number;
  /** 最初の識別の猶予・撃たれた後の猶予・飛来にかける秒（最初の猶予に含む）・去る秒 */
  windowS: number;
  rechallengeS: number;
  approachS: number;
  leaveS: number;
  /** 掃射の最大回数（これだけ撃ったら去る） */
  passesMax: number;
  /** 1 回の掃射の被害（砲弾と同じ applyShellHit に渡す） */
  hit: HitSpec;
  /** 旋回半径 m と、画面上の飛行速度 m/体感秒（aircraft_speed_kt × time_scale） */
  orbitRadiusM: number;
  flightMps: number;
  /** 航過の開始から真上まで・航過全体の秒（半径と速度から決まる） */
  overpassS: number;
  passS: number;
  /** 旋回の角速度 deg/秒 */
  orbitDegPerS: number;
}

export interface FriendlyState {
  phase: number;
  outcome: number;
  /** CHALLENGE: 残り秒。STRAFE / LEAVING: 段階に入ってからの秒 */
  timerS: number;
  /** 今の識別要求の長さ（windowS か rechallengeS。Result の「猶予」） */
  periodS: number;
  passes: number;
  /** 真上を過ぎてから押した: この航過を終えたら去る（2 回目の要求はしない） */
  pending: boolean;
  /** 開始条件が続いている秒（IDLE でだけ数える） */
  quietS: number;
  /** 開始時の自艇→帰投地点の方位（飛来・去る向き）。atan2 は開始時の 1 回だけ */
  homeBearingDeg: number;
  /** 今の旋回を始めた方位（自艇→味方機） */
  orbitStartDeg: number;
  /** 今の航過を始めた方位 */
  strafeDeg: number;
  /** 識別までの秒（押していなければ NaN）とそのときの猶予。Result の KPI */
  reactS: number;
  reactPeriodS: number;
  /** 去り始めた位置（自艇からの相対 m） */
  leaveFromDx: number;
  leaveFromDy: number;
}

/** 開始条件の材料（固定ステップで中身だけ書き換える） */
export interface FriendlyCheck {
  /** 魚雷を 1 本以上撃った（?debug&ff で強制） */
  fired: boolean;
  homeDx: number;
  homeDy: number;
  headingDeg: number;
  speedMps: number;
  /** 駆逐艦に発見されているか、探照灯・星弾に照らされている（駆逐艦が沈んでいなければ）。発見の直後は探照灯が来るので識別と重ねない */
  underFire: boolean;
  /** 命中スロー中・撃沈演出中 */
  busy: boolean;
  /** 浅瀬の警告・中・座礁のどれか */
  shallow: boolean;
  /** 沈没・座礁・燃料切れ・輪の中 */
  blocked: boolean;
}

export interface AircraftPose {
  dx: number;
  dy: number;
  headingDeg: number;
  alpha: number;
}

export function createFriendlyState(): FriendlyState {
  return {
    phase: FF_IDLE,
    outcome: FF_OUT_NONE,
    timerS: 0,
    periodS: 0,
    passes: 0,
    pending: false,
    quietS: 0,
    homeBearingDeg: 0,
    orbitStartDeg: 0,
    strafeDeg: 0,
    reactS: NaN,
    reactPeriodS: NaN,
    leaveFromDx: 0,
    leaveFromDy: 0,
  };
}

/** 開始条件（docs/02 §6.8）: 撃った・輪の縁から近い・帰る向きに進んでいる・発見も照射もされていない・演出中でない・浅瀬でない・止められていない */
export function friendlyConditionsMet(c: FriendlyCheck, p: FriendlyParams): boolean {
  if (!c.fired || c.underFire || c.busy || c.shallow || c.blocked || !(c.speedMps > 0)) return false;
  if (c.homeDx * c.homeDx + c.homeDy * c.homeDy > p.zoneRadius2) return false;
  const h = degToRad(c.headingDeg);
  return Math.sin(h) * c.homeDx - Math.cos(h) * c.homeDy > 0;
}

/** IDLE でだけ: 条件が quietS 続いたら識別要求を始める（true）。1 回でも途切れたら数え直す。終わった後は二度と始まらない */
export function stepFriendlyTrigger(s: FriendlyState, c: FriendlyCheck, p: FriendlyParams, dt: number): boolean {
  if (s.phase !== FF_IDLE) return false;
  if (!friendlyConditionsMet(c, p)) {
    s.quietS = 0;
    return false;
  }
  s.quietS += dt;
  if (s.quietS < p.quietS) return false;
  startChallenge(s, p, c.homeDx, c.homeDy);
  return true;
}

/** 識別要求を始める: 帰投地点の方角から飛来し、自艇の周りを時計回りに回る */
export function startChallenge(s: FriendlyState, p: FriendlyParams, homeDx: number, homeDy: number): void {
  s.homeBearingDeg = wrapDeg360(radToDeg(Math.atan2(homeDx, -homeDy)));
  s.orbitStartDeg = s.homeBearingDeg;
  s.phase = FF_CHALLENGE;
  s.outcome = FF_OUT_NONE;
  s.periodS = p.windowS;
  s.timerS = p.windowS;
  s.passes = 0;
  s.pending = false;
}

const scratchPose: AircraftPose = { dx: 0, dy: 0, headingDeg: 0, alpha: 0 };

/** 去り始める: 今の位置を覚えて LEAVING へ */
function leave(s: FriendlyState, p: FriendlyParams, outcome: number): void {
  aircraftPose(s, p, scratchPose);
  s.leaveFromDx = scratchPose.dx;
  s.leaveFromDy = scratchPose.dy;
  s.phase = FF_LEAVING;
  s.timerS = 0;
  s.outcome = outcome;
}

/**
 * 「識別」を押した。識別要求中なら去る。航過の途中でも真上に来る前なら撃たれずに去る。真上を過ぎていればこの航過を終えて去る（2 回目はしない）。
 * それ以外（待機・去る途中・終了・すでに押した後）は何も起きない（false）。早押し・空押しに罰は無い
 */
export function identifyFriendly(s: FriendlyState, p: FriendlyParams): boolean {
  if (s.phase === FF_CHALLENGE) {
    s.reactS = s.periodS - s.timerS;
    s.reactPeriodS = s.periodS;
    leave(s, p, FF_OUT_IDENTIFIED);
    return true;
  }
  if (s.phase === FF_STRAFE && !s.pending) {
    s.reactS = s.periodS + s.timerS;
    s.reactPeriodS = s.periodS;
    if (s.timerS < p.overpassS) leave(s, p, FF_OUT_IDENTIFIED);
    else s.pending = true;
    return true;
  }
  return false;
}

/** 中断（輪の中・沈没・座礁・燃料切れ）: 要求中・航過中なら撃たずに去る。真上を過ぎてから押した後（pending）なら識別として去る（押下を無かったことにしない）。それ以外は何もしない */
export function cancelFriendly(s: FriendlyState, p: FriendlyParams): void {
  if (s.phase === FF_STRAFE && s.pending) leave(s, p, FF_OUT_IDENTIFIED);
  else if (s.phase === FF_CHALLENGE || s.phase === FF_STRAFE) leave(s, p, FF_OUT_CANCELLED);
}

/** 旋回の今の方位（自艇→味方機）。最初の要求は飛来の秒を引く */
function orbitAngleDeg(s: FriendlyState, p: FriendlyParams, elapsedS: number): number {
  return s.orbitStartDeg + p.orbitDegPerS * (elapsedS - (s.passes === 0 ? p.approachS : 0));
}

/**
 * 固定ステップ（dt は体感の実秒）。段階の変化は 1 回の呼び出しで 1 つまで（余った時間は次の段階に持ち越す）。
 * 戻り値は FF_EV_* のビット。真上の通過は「前回 < overpassS <= 今回」の 1 回だけ数える
 */
export function stepFriendly(s: FriendlyState, p: FriendlyParams, dt: number): number {
  let ev = 0;
  if (s.phase === FF_CHALLENGE) {
    s.timerS -= dt;
    if (s.timerS > 0) return ev;
    // 猶予が尽きた: 今いる方位から直線で自艇の真上へ
    const over = -s.timerS;
    s.strafeDeg = orbitAngleDeg(s, p, s.periodS);
    s.phase = FF_STRAFE;
    s.timerS = over;
    s.pending = false;
    if (over >= p.overpassS) {
      s.passes++;
      ev |= FF_EV_STRIKE;
    }
    return ev;
  }
  if (s.phase === FF_STRAFE) {
    const prev = s.timerS;
    s.timerS += dt;
    if (prev < p.overpassS && s.timerS >= p.overpassS) {
      s.passes++;
      ev |= FF_EV_STRIKE;
    }
    if (s.timerS < p.passS) return ev;
    const over = s.timerS - p.passS;
    if (s.pending) {
      leave(s, p, FF_OUT_IDENTIFIED);
    } else if (s.passes < p.passesMax) {
      // もう一度識別を求める: 航過の終点からそのまま旋回に入る（飛来は無い）
      s.orbitStartDeg = wrapDeg360(s.strafeDeg + 180);
      s.phase = FF_CHALLENGE;
      s.periodS = p.rechallengeS;
      s.timerS = p.rechallengeS - over;
    } else {
      leave(s, p, FF_OUT_GAVE_UP);
    }
    return ev;
  }
  if (s.phase === FF_LEAVING) {
    s.timerS += dt;
    if (s.timerS >= p.leaveS) s.phase = FF_DONE;
  }
  return ev;
}

/** 味方機の位置（自艇からの相対 m）・機首の方位・濃さ。out に書く（確保しない）。待機・終了なら alpha 0 */
export function aircraftPose(s: FriendlyState, p: FriendlyParams, out: AircraftPose): AircraftPose {
  const R = p.orbitRadiusM;
  if (s.phase === FF_CHALLENGE) {
    const e = s.periodS - s.timerS;
    let bearing: number;
    let r: number;
    if (s.passes === 0 && e < p.approachS) {
      // 飛来: 帰投地点の方角から真っ直ぐ寄ってくる
      bearing = s.homeBearingDeg;
      r = R + p.flightMps * (p.approachS - e);
      out.headingDeg = wrapDeg360(bearing + 180);
    } else {
      bearing = orbitAngleDeg(s, p, e);
      r = R;
      out.headingDeg = wrapDeg360(bearing + 90);
    }
    const b = degToRad(bearing);
    out.dx = r * Math.sin(b);
    out.dy = -r * Math.cos(b);
    out.alpha = 1;
    return out;
  }
  if (s.phase === FF_STRAFE) {
    const k = 1 - (2 * s.timerS) / p.passS;
    const b = degToRad(s.strafeDeg);
    out.dx = R * Math.sin(b) * k;
    out.dy = -R * Math.cos(b) * k;
    out.headingDeg = wrapDeg360(s.strafeDeg + 180);
    out.alpha = 1;
    return out;
  }
  if (s.phase === FF_LEAVING) {
    const b = degToRad(s.homeBearingDeg);
    const d = p.flightMps * s.timerS;
    out.dx = s.leaveFromDx + d * Math.sin(b);
    out.dy = s.leaveFromDy - d * Math.cos(b);
    out.headingDeg = s.homeBearingDeg;
    out.alpha = Math.max(0, 1 - s.timerS / p.leaveS);
    return out;
  }
  out.dx = 0;
  out.dy = 0;
  out.headingDeg = 0;
  out.alpha = 0;
  return out;
}

// ---------- data の読み出し ----------

export interface FriendlyFireDataRecord {
  params: {
    window_s: number;
    rechallenge_s: number;
    passes_max: number;
    damage_per_pass: number;
    fire_chance: number;
    engine_damage_chance: number;
    aircraft_speed_kt: number;
    orbit_radius_m: number;
    approach_s: number;
    leave_s: number;
    quiet_s: number;
  };
}

const PARAM_KEYS = [
  'window_s',
  'rechallenge_s',
  'passes_max',
  'damage_per_pass',
  'fire_chance',
  'engine_damage_chance',
  'aircraft_speed_kt',
  'orbit_radius_m',
  'approach_s',
  'leave_s',
  'quiet_s',
] as const;

export function isFriendlyFireDataRecord(v: unknown): v is FriendlyFireDataRecord {
  if (typeof v !== 'object' || v === null) return false;
  const p = (v as Record<string, unknown>)['params'];
  if (typeof p !== 'object' || p === null) return false;
  const r = p as Record<string, unknown>;
  return PARAM_KEYS.every((k) => typeof r[k] === 'number' && Number.isFinite(r[k] as number));
}

/** 設計値の検査込みで FriendlyParams を作る。ringRadiusM は帰投地点の輪の半径、timeScale は hit_rate_model.world.time_scale */
export function friendlyParamsFromData(r: FriendlyFireDataRecord, triggerEdgeM: number, ringRadiusM: number, timeScale: number): FriendlyParams {
  const q = r.params;
  const bad = (msg: string): never => {
    throw new Error(`risk_events.json の friendly_fire.params: ${msg}（docs/02 §6.8）`);
  };
  if (!(q.approach_s >= 0) || !(q.approach_s < q.window_s)) bad('0 <= approach_s < window_s');
  if (!(q.rechallenge_s > 0)) bad('rechallenge_s は正');
  if (!Number.isInteger(q.passes_max) || q.passes_max < 1) bad('passes_max は 1 以上の整数');
  if (!(q.damage_per_pass >= 0)) bad('damage_per_pass は 0 以上');
  if (!(q.fire_chance >= 0 && q.fire_chance <= 1) || !(q.engine_damage_chance >= 0 && q.engine_damage_chance <= 1)) bad('fire_chance / engine_damage_chance は 0〜1');
  if (!(q.aircraft_speed_kt > 0)) bad('aircraft_speed_kt は正');
  if (!(q.orbit_radius_m > 0)) bad('orbit_radius_m は正');
  if (!(q.leave_s > 0)) bad('leave_s は正');
  if (!(q.quiet_s >= 0)) bad('quiet_s は 0 以上');
  if (!(triggerEdgeM > 0)) throw new Error('friendly_aircraft.trigger_edge_m は正（docs/02 §6.8）');
  if (!(ringRadiusM >= 0) || !(timeScale > 0)) throw new Error('friendly: 輪の半径と time_scale が不正');
  const flightMps = ktToMps(q.aircraft_speed_kt) * timeScale;
  const overpassS = q.orbit_radius_m / flightMps;
  const zone = triggerEdgeM + ringRadiusM;
  return {
    triggerEdgeM,
    zoneRadius2: zone * zone,
    quietS: q.quiet_s,
    windowS: q.window_s,
    rechallengeS: q.rechallenge_s,
    approachS: q.approach_s,
    leaveS: q.leave_s,
    passesMax: q.passes_max,
    hit: { damage: q.damage_per_pass, fireChance: q.fire_chance, engineDamageChance: q.engine_damage_chance },
    orbitRadiusM: q.orbit_radius_m,
    flightMps,
    overpassS,
    passS: overpassS * 2,
    orbitDegPerS: radToDeg(flightMps / q.orbit_radius_m),
  };
}
