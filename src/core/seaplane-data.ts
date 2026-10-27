// 敵の水上機の数値（v0.4.1）: enemies.json の ijn_seaplane_jake と risk_events.json の enemy_aircraft.params から SeaplaneParams を組む。検査はここ。
// 段階と運動は seaplane.ts、照明弾と爆弾は seaplane-ordnance.ts。航跡の閾値 kt は自艇の静音の上限（boats.json の speed_bands_kt.silent_max。v0.6.7 から data に持たない）。
import type { HitSpec } from './gunnery';
import { GRAVITY_MPS2, ktToMps, radToDeg } from './units';

export interface SeaplaneParams {
  /** 画面上の飛行速度 m/体感秒（speed_kt × time_scale） */
  flightMps: number;
  /** 現れる距離 m（= wake_detect_m）、航跡を見る距離、発見確定の線、航跡が見える速力 kt（= 艇の静音の上限。HUD の「N kt 以下に減速！」） */
  spawnM: number;
  wakeDetectM: number;
  baseDetectM: number;
  wakeThresholdKt: number;
  patrolFromS: number;
  wakeTriggerS: number;
  loseS: number;
  patrolCooldownS: number;
  /** 航過の始点の半径、真上までの秒、航過全体の秒、旋回の角速度 deg/秒、旋回の秒、去る秒 */
  runRadiusM: number;
  overpassS: number;
  passS: number;
  orbitDegPerS: number;
  orbitS: number;
  leaveS: number;
  /** 照明弾: 半径の二乗、燃焼秒、光の中の艇を艦が見つける距離 */
  flareRadius2: number;
  flareDurationS: number;
  flareRevealM: number;
  /** 爆弾: 数、被害、落下の体感秒と game 秒、散布の半径（CEP × √2）、艇の半長、命中半径（半幅 + 爆風） */
  bombCount: number;
  bombHit: HitSpec;
  bombFallFeelS: number;
  bombFallGameS: number;
  /** 狙いを決める時点（爆撃進路に入った瞬間）から着弾までの game 秒（= 真上までの秒 × time_scale ＋ 落下の game 秒）。見越しはこの秒で取る */
  bombLeadGameS: number;
  bombScatterM: number;
  boatHalfLengthM: number;
  bombHitRadiusM: number;
}

export interface SeaplaneDataRecord {
  id: string;
  speed_kt: number;
  altitude_m: number;
  flare: {
    illum_radius_m: number;
    duration_s: number;
    cooldown_s: number;
    reveal_m: number;
  };
  bomb: {
    count: number;
    damage: number;
    blast_radius_m: number;
    accuracy_cep_m: number;
    fire_chance: number;
    engine_damage_chance: number;
  };
  detection: {
    base_detect_m: number;
    wake_detect_m: number;
  };
}

export interface EnemyAircraftEventRecord {
  params: {
    patrol_from_s: number;
    wake_trigger_s: number;
    lose_s: number;
    run_radius_m: number;
    orbit_s: number;
    leave_s: number;
    patrol_cooldown_s: number;
  };
}

function hasNums(v: unknown, keys: readonly string[]): boolean {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return keys.every((k) => typeof r[k] === 'number' && Number.isFinite(r[k] as number));
}

export function isSeaplaneDataRecord(v: unknown): v is SeaplaneDataRecord {
  if (!hasNums(v, ['speed_kt', 'altitude_m']) || typeof (v as Record<string, unknown>)['id'] !== 'string') return false;
  const r = v as Record<string, unknown>;
  return (
    hasNums(r['flare'], ['illum_radius_m', 'duration_s', 'cooldown_s', 'reveal_m']) &&
    hasNums(r['bomb'], ['count', 'damage', 'blast_radius_m', 'accuracy_cep_m', 'fire_chance', 'engine_damage_chance']) &&
    hasNums(r['detection'], ['base_detect_m', 'wake_detect_m'])
  );
}

export function isEnemyAircraftEventRecord(v: unknown): v is EnemyAircraftEventRecord {
  return typeof v === 'object' && v !== null && hasNums((v as Record<string, unknown>)['params'], ['patrol_from_s', 'wake_trigger_s', 'lose_s', 'run_radius_m', 'orbit_s', 'leave_s', 'patrol_cooldown_s']);
}

/** 設計値の検査込みで SeaplaneParams を作る。boat は艇の静音帯の上限 kt（＝航跡の閾値。Elco 18・T-14 14・T-38 13）と船体の半長・半幅 */
export function seaplaneParamsFromData(plane: SeaplaneDataRecord, event: EnemyAircraftEventRecord, timeScale: number, boat: { silentMaxKt: number; halfLengthM: number; halfBeamM: number }): SeaplaneParams {
  const q = event.params;
  const bad = (msg: string): never => {
    throw new Error(`enemies.json の ${plane.id} / risk_events.json の enemy_aircraft.params: ${msg}（docs/02 §6.8）`);
  };
  if (!(plane.speed_kt > 0) || !(plane.altitude_m > 0)) bad('speed_kt / altitude_m は正');
  if (!(q.run_radius_m > 0 && q.run_radius_m < plane.detection.base_detect_m && plane.detection.base_detect_m < plane.detection.wake_detect_m)) bad('0 < run_radius_m < base_detect_m < wake_detect_m');
  if (!Number.isInteger(plane.bomb.count) || plane.bomb.count < 1) bad('bomb.count は 1 以上の整数');
  if (!(plane.bomb.damage >= 0) || !(plane.bomb.blast_radius_m >= 0) || !(plane.bomb.accuracy_cep_m > 0)) bad('bomb.damage / blast_radius_m は 0 以上、accuracy_cep_m は正');
  if (!(plane.bomb.fire_chance >= 0 && plane.bomb.fire_chance <= 1) || !(plane.bomb.engine_damage_chance >= 0 && plane.bomb.engine_damage_chance <= 1)) bad('bomb.fire_chance / engine_damage_chance は 0〜1');
  if (!(plane.flare.illum_radius_m > 0) || !(plane.flare.duration_s > 0) || !(plane.flare.reveal_m >= plane.flare.illum_radius_m)) bad('flare.illum_radius_m / duration_s は正、reveal_m は illum_radius_m 以上');
  if (!(q.patrol_from_s >= 0) || !(q.wake_trigger_s >= 0) || !(q.lose_s >= 0) || !(q.orbit_s >= 0) || !(q.leave_s > 0) || !(q.patrol_cooldown_s >= 0)) bad('patrol_from_s / wake_trigger_s / lose_s / orbit_s / patrol_cooldown_s は 0 以上、leave_s は正');
  if (!(timeScale > 0) || !(boat.silentMaxKt > 0) || !(boat.halfLengthM > 0) || !(boat.halfBeamM >= 0)) throw new Error('seaplane: time_scale と艇の静音の上限・寸法が不正');
  const flightMps = ktToMps(plane.speed_kt) * timeScale;
  const overpassS = q.run_radius_m / flightMps;
  const bombFallGameS = Math.sqrt((2 * plane.altitude_m) / GRAVITY_MPS2);
  return {
    flightMps,
    spawnM: plane.detection.wake_detect_m,
    wakeDetectM: plane.detection.wake_detect_m,
    baseDetectM: plane.detection.base_detect_m,
    wakeThresholdKt: boat.silentMaxKt,
    patrolFromS: q.patrol_from_s,
    wakeTriggerS: q.wake_trigger_s,
    loseS: q.lose_s,
    patrolCooldownS: q.patrol_cooldown_s,
    runRadiusM: q.run_radius_m,
    overpassS,
    passS: overpassS * 2,
    orbitDegPerS: radToDeg(flightMps / q.run_radius_m),
    orbitS: q.orbit_s,
    leaveS: q.leave_s,
    flareRadius2: plane.flare.illum_radius_m * plane.flare.illum_radius_m,
    flareDurationS: plane.flare.duration_s,
    flareRevealM: plane.flare.reveal_m,
    bombCount: plane.bomb.count,
    bombHit: {
      damage: plane.bomb.damage,
      fireChance: plane.bomb.fire_chance,
      engineDamageChance: plane.bomb.engine_damage_chance,
    },
    bombFallFeelS: bombFallGameS / timeScale,
    bombFallGameS,
    bombLeadGameS: overpassS * timeScale + bombFallGameS,
    bombScatterM: plane.bomb.accuracy_cep_m * Math.SQRT2,
    boatHalfLengthM: boat.halfLengthM,
    bombHitRadiusM: boat.halfBeamM + plane.bomb.blast_radius_m,
  };
}
