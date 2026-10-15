// 僚艇（docs/02 §6.4、v0.4.4）: 要人を乗せて自艇の後ろの定位置（station）に付いてくる同型の味方艇。自艇の針路・速力に合わせ、遅れれば増速して追いつく。
// Phaser 非依存・毎ステップ確保しない・乱数を使わない。操舵は駆逐艦と同じ steerShip（旋回率・加減速の上限つき）。被害は HP だけ（火災・機関損傷・座礁・波は持たない。v0.4.5 の候補）。
// 沈めば任務失敗（任務は帰投まで続く。終了理由は変えない）。駆逐艦が自艇と僚艇のどちらを撃つかは core/gunnery-pair。
import { clampToBounds, type BoatState, type SeaBounds } from './boat-motion';
import { steerShip } from './ship-ai';
import { degToRad, radToDeg } from './units';

export interface EscortParams {
  /** 定位置: 自艇の後ろ m と横 m（右舷が正、左舷が負） */
  stationAsternM: number;
  stationAbeamM: number;
  /** 自艇からこれ以上離れたら「遅れている」（HUD） */
  lagWarnM: number;
  /** 定位置より後ろ 1 m あたり自艇の速力に足す m/s（前なら引く） */
  catchUpGainPerS: number;
  /** 定位置からこの距離以内なら自艇と同じ針路（細かい揺れを止める） */
  headingDeadbandM: number;
  /** 自艇が照らされているとき、自艇からこの距離以内の僚艇も照らされた扱い（探照灯の扇の外でも砲手に見える） */
  litNearLeaderM: number;
  speedMaxMps: number;
  accelMps2: number;
  turnRateDegS: number;
  maxHp: number;
  /** 着弾判定の半長・半幅 m（hit_scale 込み）、海域境界の余白 m */
  halfLengthM: number;
  halfBeamM: number;
  boundsMarginM: number;
}

export interface EscortState {
  boat: BoatState;
  hp: number;
  /** 被弾数（Result） */
  hits: number;
  sunk: boolean;
  /** 自艇との距離の二乗（毎ステップ更新。HUD は平方根を 1 回だけ） */
  dist2: number;
  /** 最も離れたときの距離の二乗（Result） */
  maxDist2: number;
  /** 沈んだ実秒（沈んでいなければ NaN） */
  sunkAtS: number;
}

/** 定位置に置いて作る（自艇と同じ針路・停止） */
export function createEscort(p: EscortParams, player: BoatState): EscortState {
  const h = degToRad(player.headingDeg);
  const fx = Math.sin(h);
  const fy = -Math.cos(h);
  const s: EscortState = {
    boat: { x: player.x - fx * p.stationAsternM + fy * -p.stationAbeamM, y: player.y - fy * p.stationAsternM + fx * p.stationAbeamM, headingDeg: player.headingDeg, speedMps: 0 },
    hp: p.maxHp,
    hits: 0,
    sunk: false,
    dist2: 0,
    maxDist2: 0,
    sunkAtS: NaN,
  };
  updateDist(s, player);
  return s;
}

/**
 * 固定ステップ（dt は time_scale 込み）。定位置（自艇の後ろ・横）へ向かい、定位置より後ろにいれば自艇の速力に遅れ × gain を足して追いつく（前にいれば引く）。
 * playerAfloat=false（自艇が沈み始めた）なら止まる。沈んだ僚艇は動かない
 */
export function stepEscort(s: EscortState, p: EscortParams, player: BoatState, playerAfloat: boolean, bounds: SeaBounds, dt: number): void {
  if (s.sunk) return;
  const b = s.boat;
  const h = degToRad(player.headingDeg);
  const fx = Math.sin(h);
  const fy = -Math.cos(h);
  // 右舷の単位ベクトルは (−fy, fx)（北向きなら東）
  const sx = player.x - fx * p.stationAsternM - fy * p.stationAbeamM;
  const sy = player.y - fy * p.stationAsternM + fx * p.stationAbeamM;
  const dx = sx - b.x;
  const dy = sy - b.y;
  const d2 = dx * dx + dy * dy;
  const along = dx * fx + dy * fy;
  let desiredSpeed = playerAfloat ? player.speedMps + along * p.catchUpGainPerS : 0;
  if (desiredSpeed < 0) desiredSpeed = 0;
  else if (desiredSpeed > p.speedMaxMps) desiredSpeed = p.speedMaxMps;
  const desiredHeading = d2 > p.headingDeadbandM * p.headingDeadbandM ? radToDeg(Math.atan2(dx, -dy)) : player.headingDeg;
  steerShip(b, desiredHeading, desiredSpeed, p.turnRateDegS, p.accelMps2, dt);
  clampToBounds(b, bounds, p.boundsMarginM);
  updateDist(s, player);
}

function updateDist(s: EscortState, player: BoatState): void {
  const dx = s.boat.x - player.x;
  const dy = s.boat.y - player.y;
  s.dist2 = dx * dx + dy * dy;
  if (s.dist2 > s.maxDist2) s.maxDist2 = s.dist2;
}

/** 被弾。沈んだ（HP 0 に達した）なら true（この呼び出しで初めて） */
export function hitEscort(s: EscortState, damage: number, nowS: number): boolean {
  if (s.sunk) return false;
  s.hits++;
  s.hp = Math.max(0, s.hp - damage);
  if (s.hp > 0) return false;
  s.sunk = true;
  s.sunkAtS = nowS;
  s.boat.speedMps = 0;
  return true;
}

// ---------- data の読み出し（missions_seed の v0_1_prototype.escort と boats.json の同型艇） ----------

export interface EscortMissionBlock {
  boat: string;
  station_astern_m: number;
  station_abeam_m: number;
  lag_warn_m: number;
  catch_up_gain_per_s: number;
  heading_deadband_m: number;
  lit_near_leader_m: number;
}

export function isEscortMissionBlock(v: unknown): v is EscortMissionBlock {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return typeof r['boat'] === 'string' && ['station_astern_m', 'station_abeam_m', 'lag_warn_m', 'catch_up_gain_per_s', 'heading_deadband_m', 'lit_near_leader_m'].every((k) => typeof r[k] === 'number' && Number.isFinite(r[k] as number));
}

export interface EscortBoatRecord {
  speedMaxMps: number;
  accelMps2: number;
  turnRateDegS: number;
  lengthM: number;
  beamM: number;
  maxHp: number;
}

/** 検査込み。boat は boats.json の同型艇から運動・寸法・HP を取ったもの、hitScale / spriteScale は hit_rate_model.world */
export function escortParamsFromData(b: EscortMissionBlock, boat: EscortBoatRecord, hitScale: number, spriteScale: number): EscortParams {
  const bad = (msg: string): never => {
    throw new Error(`missions_seed の escort: ${msg}（docs/02 §6.4）`);
  };
  if (!(b.station_astern_m > 0)) bad('station_astern_m は正（自艇の後ろに付く）');
  if (!(b.lag_warn_m > b.station_astern_m)) bad('lag_warn_m は station_astern_m より大きい');
  if (!(b.catch_up_gain_per_s > 0) || !(b.heading_deadband_m >= 0) || !(b.lit_near_leader_m >= 0)) bad('catch_up_gain_per_s は正、heading_deadband_m と lit_near_leader_m は 0 以上');
  if (!(boat.speedMaxMps > 0) || !(boat.accelMps2 > 0) || !(boat.turnRateDegS > 0) || !(boat.maxHp > 0)) bad('同型艇の速力・加速・旋回率・hull_hp は正');
  return {
    stationAsternM: b.station_astern_m,
    stationAbeamM: b.station_abeam_m,
    lagWarnM: b.lag_warn_m,
    catchUpGainPerS: b.catch_up_gain_per_s,
    headingDeadbandM: b.heading_deadband_m,
    litNearLeaderM: b.lit_near_leader_m,
    speedMaxMps: boat.speedMaxMps,
    accelMps2: boat.accelMps2,
    turnRateDegS: boat.turnRateDegS,
    maxHp: boat.maxHp,
    halfLengthM: (boat.lengthM * hitScale) / 2,
    halfBeamM: (boat.beamM * hitScale) / 2,
    boundsMarginM: (boat.lengthM * spriteScale) / 2,
  };
}
