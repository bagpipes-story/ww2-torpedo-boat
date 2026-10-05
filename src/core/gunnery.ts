// 駆逐艦の反撃（docs/02 §6.5・§6.6、v0.2.1）: 探照灯・星弾・砲撃と、艇の被害。Phaser 非依存、毎ステップ確保しない。
// 時間の単位: 探照灯の遅れ・掃引、星弾の持続・冷却、砲の発射間隔、火災は実時間秒（体感に合わせる）。砲弾の飛行は time_scale 込みの dt で積分する。
import type { BoatState } from './boat-motion';
import type { SeededRng } from './rng';
import { interceptTimeS } from './torpedo-solver';
import { degToRad, wrapDeg180, wrapDeg360 } from './units';

export interface GunParams {
  id: string;
  count: number;
  /** 夜間の有効射程 m。これより遠い艇は撃たない */
  effectiveM: number;
  /** 1 門あたりの発射速度（発/実時間分）。砲台全体の発射間隔 = 60 / (rof × count) 実秒 */
  roundsPerMinPerGun: number;
  damage: number;
  /** 砲弾の速さ m/s（game 時間。見越しと飛行時間に使う。見てかわせるよう実弾より遅い設計値） */
  shellSpeedMps: number;
  /** 有効射程での着弾のばらつき（± この程度 m。距離に比例して縮む） */
  dispersionM: number;
  /** この半径 m 以内に艇の船体があれば命中 */
  splashRadiusM: number;
  /** 命中時に火災・機関損傷を起こす確率 */
  fireChance: number;
  engineDamageChance: number;
}

export interface SearchlightParams {
  rangeM: number;
  coneDeg: number;
  /** 掃引速度 deg/実秒 */
  sweepDegS: number;
  /** 発見から点灯までの実秒 */
  onDelayS: number;
}

export interface StarshellParams {
  rangeM: number;
  illumRadiusM: number;
  durationS: number;
  cooldownS: number;
}

export interface GunneryParams {
  guns: GunParams[];
  searchlight: SearchlightParams;
  starshell: StarshellParams;
}

export interface SearchlightState {
  on: boolean;
  /** 光軸の方位（0=北、時計回り） */
  bearingDeg: number;
  /** 点灯までの残り実秒（発見中だけ減る） */
  onDelayLeftS: number;
  /** 艇が光の中にいる */
  illuminating: boolean;
}

export interface StarshellState {
  /** 照明の残り実秒。0 以下なら消えている */
  leftS: number;
  x: number;
  y: number;
  cooldownLeftS: number;
  /** 艇が照明の中にいる */
  illuminating: boolean;
}

export interface ShellState {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 着弾までの残り（game 秒） */
  leftS: number;
  impactX: number;
  impactY: number;
  gunIndex: number;
}

export interface GunneryState {
  light: SearchlightState;
  star: StarshellState;
  /** 砲台ごとの次弾までの実秒 */
  gunCooldownS: number[];
  shells: ShellState[];
  /** 探照灯か星弾のどちらかに照らされている */
  illuminated: boolean;
}

export interface ShellEvents {
  /** 発射（砲口の閃光用）。x, y は砲の位置 */
  onFire(gunIndex: number, x: number, y: number): void;
  /** 着弾。hit なら艇に当たった */
  onImpact(gunIndex: number, x: number, y: number, hit: boolean): void;
}

export function createGunneryState(p: GunneryParams, shellPoolSize: number, shipHeadingDeg: number): GunneryState {
  const shells: ShellState[] = [];
  for (let i = 0; i < shellPoolSize; i++) shells.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, leftS: 0, impactX: 0, impactY: 0, gunIndex: 0 });
  return {
    light: { on: false, bearingDeg: shipHeadingDeg, onDelayLeftS: p.searchlight.onDelayS, illuminating: false },
    star: { leftS: 0, x: 0, y: 0, cooldownLeftS: 0, illuminating: false },
    gunCooldownS: p.guns.map(() => 0),
    shells,
    illuminated: false,
  };
}

/**
 * 探照灯と星弾（実時間）。発見中は遅れの後に点灯し、艇の方位へ掃引して追う。見失えば消す。
 * 星弾は、発見中で探照灯の射程外（または掃引が届いていない）なら冷却が明けている限り艇の位置へ撃ち、一定時間その周りを照らす。
 */
export function updateIllumination(g: GunneryState, ship: BoatState, player: BoatState, playerDetected: boolean, p: GunneryParams, realDt: number): void {
  const dx = player.x - ship.x;
  const dy = player.y - ship.y;
  const d2 = dx * dx + dy * dy;
  const bearingToPlayer = wrapDeg360((Math.atan2(dx, -dy) * 180) / Math.PI);
  const light = g.light;
  if (!playerDetected) {
    light.on = false;
    light.onDelayLeftS = p.searchlight.onDelayS;
    light.illuminating = false;
  } else if (!light.on) {
    light.onDelayLeftS -= realDt;
    if (light.onDelayLeftS <= 0) {
      light.on = true;
      light.bearingDeg = ship.headingDeg; // 艦首方向から振り始める
    }
    light.illuminating = false;
  } else {
    const diff = wrapDeg180(bearingToPlayer - light.bearingDeg);
    const maxTurn = p.searchlight.sweepDegS * realDt;
    light.bearingDeg = wrapDeg360(light.bearingDeg + (diff > maxTurn ? maxTurn : diff < -maxTurn ? -maxTurn : diff));
    const half = p.searchlight.coneDeg / 2;
    light.illuminating = Math.abs(wrapDeg180(bearingToPlayer - light.bearingDeg)) <= half && d2 <= p.searchlight.rangeM * p.searchlight.rangeM;
  }

  const star = g.star;
  if (star.cooldownLeftS > 0) star.cooldownLeftS -= realDt;
  if (star.leftS > 0) {
    star.leftS -= realDt;
    const sx = player.x - star.x;
    const sy = player.y - star.y;
    star.illuminating = star.leftS > 0 && sx * sx + sy * sy <= p.starshell.illumRadiusM * p.starshell.illumRadiusM;
  } else {
    star.illuminating = false;
  }
  if (playerDetected && star.leftS <= 0 && star.cooldownLeftS <= 0 && !light.illuminating && d2 <= p.starshell.rangeM * p.starshell.rangeM && d2 > p.searchlight.rangeM * p.searchlight.rangeM) {
    star.leftS = p.starshell.durationS;
    star.cooldownLeftS = p.starshell.cooldownS;
    star.x = player.x;
    star.y = player.y;
    star.illuminating = true;
  }
  g.illuminated = light.illuminating || star.illuminating;
}

/**
 * 砲撃（発射判断は実時間、弾の飛行は game 時間）。照らされていて有効射程内なら砲台ごとの間隔で撃つ。
 * 狙いは艇の現在速度に対する見越し点＋ばらつき（距離に比例）。着弾で艇の船体（カプセル）が splash 半径内なら命中。
 * canFire=false（艦が沈没中など）のときは撃たないが、飛んでいる弾は着弾まで進める。
 */
export function updateGuns(
  g: GunneryState,
  ship: BoatState,
  player: BoatState,
  canFire: boolean,
  playerHalfLengthM: number,
  playerHalfBeamM: number,
  p: GunneryParams,
  rng: SeededRng,
  realDt: number,
  dt: number,
  events: ShellEvents,
): void {
  const dx = player.x - ship.x;
  const dy = player.y - ship.y;
  const d2 = dx * dx + dy * dy;
  const ph = degToRad(player.headingDeg);
  const pvx = Math.sin(ph) * player.speedMps;
  const pvy = -Math.cos(ph) * player.speedMps;
  for (let i = 0; i < p.guns.length; i++) {
    const gun = p.guns[i]!;
    const cd = Math.max(g.gunCooldownS[i]! - realDt, -realDt);
    g.gunCooldownS[i] = cd;
    if (!canFire || !g.illuminated || cd > 0 || d2 > gun.effectiveM * gun.effectiveM) {
      if (cd < 0) g.gunCooldownS[i] = 0; // 撃てない間は負の残りを溜めない（照らした瞬間の一斉発射を防ぐ）
      continue;
    }
    const shell = findFreeShell(g.shells);
    if (!shell) continue;
    // 残りの負値を繰り越して、固定ステップの刻みに関わらず平均の発射速度を保つ
    g.gunCooldownS[i] = cd + 60 / (gun.roundsPerMinPerGun * gun.count);
    // 見越し点（解が無ければ現在位置）
    const t = interceptTimeS(ship.x, ship.y, gun.shellSpeedMps, player.x, player.y, pvx, pvy);
    let ax = player.x;
    let ay = player.y;
    if (t !== null) {
      ax += pvx * t;
      ay += pvy * t;
    }
    // ばらつき: 有効射程で ±dispersion 程度、距離に比例（2 つの一様乱数の平均で中央寄りに）
    const spread = (gun.dispersionM * Math.sqrt(d2)) / gun.effectiveM;
    ax += (rng.nextRange(-1, 1) + rng.nextRange(-1, 1)) * 0.5 * spread;
    ay += (rng.nextRange(-1, 1) + rng.nextRange(-1, 1)) * 0.5 * spread;
    const fx = ax - ship.x;
    const fy = ay - ship.y;
    const dist = Math.sqrt(fx * fx + fy * fy);
    const flight = Math.max(dist / gun.shellSpeedMps, 1e-3);
    shell.active = true;
    shell.x = ship.x;
    shell.y = ship.y;
    shell.vx = fx / flight;
    shell.vy = fy / flight;
    shell.leftS = flight;
    shell.impactX = ax;
    shell.impactY = ay;
    shell.gunIndex = i;
    events.onFire(i, ship.x, ship.y);
  }
  // 飛行と着弾
  for (let i = 0; i < g.shells.length; i++) {
    const s = g.shells[i]!;
    if (!s.active) continue;
    s.leftS -= dt;
    if (s.leftS > 0) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      continue;
    }
    s.active = false;
    const gun = p.guns[s.gunIndex]!;
    const hit = pointNearBoat(s.impactX, s.impactY, player, playerHalfLengthM, playerHalfBeamM + gun.splashRadiusM);
    events.onImpact(s.gunIndex, s.impactX, s.impactY, hit);
  }
}

function findFreeShell(shells: ShellState[]): ShellState | null {
  for (let i = 0; i < shells.length; i++) if (!shells[i]!.active) return shells[i]!;
  return null;
}

/** 点が艇（中心・方位・半長の線分）から radius 以内か（距離二乗で比較） */
export function pointNearBoat(x: number, y: number, boat: BoatState, halfLengthM: number, radiusM: number): boolean {
  const h = degToRad(boat.headingDeg);
  const ux = Math.sin(h) * halfLengthM;
  const uy = -Math.cos(h) * halfLengthM;
  const ax = boat.x - ux;
  const ay = boat.y - uy;
  const abx = 2 * ux;
  const aby = 2 * uy;
  const apx = x - ax;
  const apy = y - ay;
  const len2 = abx * abx + aby * aby;
  let t = len2 > 0 ? (apx * abx + apy * aby) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = apx - abx * t;
  const ey = apy - aby * t;
  return ex * ex + ey * ey <= radiusM * radiusM;
}

// ---------- 艇の被害（docs/02 §6.6） ----------

export interface DamageParams {
  maxHp: number;
  /** 機関損傷時の最大速力の倍率 */
  engineSpeedFactor: number;
  /** 火災の継続ダメージ（HP/実秒）と持続（実秒） */
  fireDps: number;
  fireDurationS: number;
}

export interface DamageState {
  hp: number;
  engineDamaged: boolean;
  /** 火災の残り実秒。0 以下なら消えている */
  fireLeftS: number;
}

export function createDamageState(p: DamageParams): DamageState {
  return { hp: p.maxHp, engineDamaged: false, fireLeftS: 0 };
}

export interface HitOutcome {
  destroyed: boolean;
  startedFire: boolean;
  engineHit: boolean;
}

/** 命中の適用。戻り値は再利用する out に書く（確保しない） */
export function applyShellHit(d: DamageState, gun: GunParams, p: DamageParams, rng: SeededRng, out: HitOutcome): HitOutcome {
  d.hp = Math.max(0, d.hp - gun.damage);
  out.startedFire = false;
  out.engineHit = false;
  if (d.hp > 0) {
    if (d.fireLeftS <= 0 && rng.chance(gun.fireChance)) {
      d.fireLeftS = p.fireDurationS;
      out.startedFire = true;
    }
    if (!d.engineDamaged && rng.chance(gun.engineDamageChance)) {
      d.engineDamaged = true;
      out.engineHit = true;
    }
  }
  out.destroyed = d.hp <= 0;
  return out;
}

/** 火災の継続ダメージ（実時間）。HP が 0 になれば true */
export function stepDamage(d: DamageState, p: DamageParams, realDt: number): boolean {
  if (d.fireLeftS > 0 && d.hp > 0) {
    d.fireLeftS -= realDt;
    d.hp = Math.max(0, d.hp - p.fireDps * realDt);
  }
  return d.hp <= 0;
}

// ---------- data の読み出し ----------

export interface EnemyGunneryDataRecord {
  guns: Array<{
    id: string;
    count: number;
    effective_night_m: number;
    rof_per_min: number;
    damage: number;
    shell_speed_mps: number;
    dispersion_m: number;
    splash_radius_m: number;
    fire_chance: number;
    engine_damage_chance: number;
  }>;
  searchlight: { range_m: number; cone_deg: number; sweep_deg_s: number; on_delay_s: number };
  starshell: { range_m: number; illum_radius_m: number; duration_s: number; cooldown_s: number };
}

function hasNums(o: unknown, keys: readonly string[]): o is Record<string, number> {
  if (!o || typeof o !== 'object') return false;
  const r = o as Record<string, unknown>;
  return keys.every((k) => typeof r[k] === 'number' && Number.isFinite(r[k]));
}

export function isEnemyGunneryDataRecord(v: unknown): v is EnemyGunneryDataRecord {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  const guns = r['guns'];
  if (!Array.isArray(guns) || guns.length === 0) return false;
  for (const g of guns) {
    if (typeof (g as Record<string, unknown>)['id'] !== 'string') return false;
    if (!hasNums(g, ['count', 'effective_night_m', 'rof_per_min', 'damage', 'shell_speed_mps', 'dispersion_m', 'splash_radius_m', 'fire_chance', 'engine_damage_chance'])) return false;
  }
  return hasNums(r['searchlight'], ['range_m', 'cone_deg', 'sweep_deg_s', 'on_delay_s']) && hasNums(r['starshell'], ['range_m', 'illum_radius_m', 'duration_s', 'cooldown_s']);
}

export function gunneryParamsFromData(r: EnemyGunneryDataRecord): GunneryParams {
  return {
    guns: r.guns.map((g) => ({
      id: g.id,
      count: g.count,
      effectiveM: g.effective_night_m,
      roundsPerMinPerGun: g.rof_per_min,
      damage: g.damage,
      shellSpeedMps: g.shell_speed_mps,
      dispersionM: g.dispersion_m,
      splashRadiusM: g.splash_radius_m,
      fireChance: g.fire_chance,
      engineDamageChance: g.engine_damage_chance,
    })),
    searchlight: { rangeM: r.searchlight.range_m, coneDeg: r.searchlight.cone_deg, sweepDegS: r.searchlight.sweep_deg_s, onDelayS: r.searchlight.on_delay_s },
    starshell: { rangeM: r.starshell.range_m, illumRadiusM: r.starshell.illum_radius_m, durationS: r.starshell.duration_s, cooldownS: r.starshell.cooldown_s },
  };
}

export interface BoatDamageDataRecord {
  hull_hp: number;
  damage: { engine_damage_speed_factor: number; fire_dps: number; fire_duration_s: number };
}

export function isBoatDamageDataRecord(v: unknown): v is BoatDamageDataRecord {
  return hasNums(v, ['hull_hp']) && hasNums((v as Record<string, unknown>)['damage'], ['engine_damage_speed_factor', 'fire_dps', 'fire_duration_s']);
}

export function damageParamsFromData(r: BoatDamageDataRecord): DamageParams {
  return { maxHp: r.hull_hp, engineSpeedFactor: r.damage.engine_damage_speed_factor, fireDps: r.damage.fire_dps, fireDurationS: r.damage.fire_duration_s };
}
