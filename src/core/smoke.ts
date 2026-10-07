// 煙幕（docs/02 §5・§6.5、v0.2.2）。Phaser 非依存、毎ステップ確保しない。
// タップで duration_s の間、艇尾に一定間隔で煙（円）を置く。煙は puff_lifetime_s 残る。艦と艇を結ぶ線分が煙に遮られていれば「隠れている」。
// 時間は実時間秒（体感に合わせる）。
import type { BoatState } from './boat-motion';
import { degToRad } from './units';

export interface SmokeParams {
  durationS: number;
  cooldownS: number;
  puffIntervalS: number;
  puffRadiusM: number;
  puffLifetimeS: number;
  /** 煙幕ボタンをこの実秒以上押し続けると消火（docs/02 §6.6） */
  extinguishHoldS: number;
}

export interface SmokePuff {
  active: boolean;
  x: number;
  y: number;
  /** 残り実秒 */
  leftS: number;
}

export interface SmokeState {
  /** 展開の残り実秒（0 以下なら展開していない） */
  activeLeftS: number;
  /** 次に展開できるまでの実秒 */
  cooldownLeftS: number;
  /** 次の煙を置くまでの実秒 */
  puffTimerS: number;
  puffs: SmokePuff[];
  nextPuff: number;
}

export function createSmokeState(poolSize: number): SmokeState {
  const puffs: SmokePuff[] = [];
  for (let i = 0; i < poolSize; i++) puffs.push({ active: false, x: 0, y: 0, leftS: 0 });
  return { activeLeftS: 0, cooldownLeftS: 0, puffTimerS: 0, puffs, nextPuff: 0 };
}

/** 展開を始める。冷却中・展開中なら false */
export function startSmoke(s: SmokeState, p: SmokeParams): boolean {
  if (s.cooldownLeftS > 0 || s.activeLeftS > 0) return false;
  s.activeLeftS = p.durationS;
  s.cooldownLeftS = p.cooldownS;
  s.puffTimerS = 0; // 最初の煙はすぐ置く
  return true;
}

/**
 * 1 ステップ（実時間）。展開中は艇尾（中心から sternOffsetM 後ろ）に puff_interval_s ごとに煙を置く。煙は寿命で消える。
 * 置いた煙の数を返す（見た目の更新用）。
 */
export function updateSmoke(s: SmokeState, p: SmokeParams, boat: BoatState, sternOffsetM: number, realDt: number): number {
  if (s.cooldownLeftS > 0) s.cooldownLeftS -= realDt;
  let placed = 0;
  if (s.activeLeftS > 0) {
    s.activeLeftS -= realDt;
    s.puffTimerS -= realDt;
    while (s.puffTimerS <= 0) {
      s.puffTimerS += p.puffIntervalS;
      const h = degToRad(boat.headingDeg);
      const puff = s.puffs[s.nextPuff]!;
      s.nextPuff = (s.nextPuff + 1) % s.puffs.length;
      puff.active = true;
      puff.x = boat.x - Math.sin(h) * sternOffsetM;
      puff.y = boat.y + Math.cos(h) * sternOffsetM;
      puff.leftS = p.puffLifetimeS;
      placed++;
    }
  }
  for (let i = 0; i < s.puffs.length; i++) {
    const puff = s.puffs[i]!;
    if (!puff.active) continue;
    puff.leftS -= realDt;
    if (puff.leftS <= 0) puff.active = false;
  }
  return placed;
}

/** 線分 A→B がどれかの煙（半径 r の円）に遮られているか（距離二乗で比較。sqrt 無し） */
export function losBlocked(s: SmokeState, p: SmokeParams, ax: number, ay: number, bx: number, by: number): boolean {
  const r2 = p.puffRadiusM * p.puffRadiusM;
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;
  for (let i = 0; i < s.puffs.length; i++) {
    const puff = s.puffs[i]!;
    if (!puff.active) continue;
    const apx = puff.x - ax;
    const apy = puff.y - ay;
    let t = len2 > 0 ? (apx * abx + apy * aby) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = apx - abx * t;
    const dy = apy - aby * t;
    if (dx * dx + dy * dy <= r2) return true;
  }
  return false;
}

export function activePuffCount(s: SmokeState): number {
  let n = 0;
  for (let i = 0; i < s.puffs.length; i++) if (s.puffs[i]!.active) n++;
  return n;
}

// ---------- data の読み出し ----------

export interface BoatSmokeDataRecord {
  smoke_generator: boolean;
  smoke?: { duration_s: number; cooldown_s: number; puff_interval_s: number; puff_radius_m: number; puff_lifetime_s: number; extinguish_hold_s: number };
}

export function isBoatSmokeDataRecord(v: unknown): v is BoatSmokeDataRecord {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  if (typeof r['smoke_generator'] !== 'boolean') return false;
  if (!r['smoke_generator']) return true;
  const s = r['smoke'] as Record<string, unknown> | undefined;
  if (!s) return false;
  const finite = (k: string): number | null => (typeof s[k] === 'number' && Number.isFinite(s[k] as number) ? (s[k] as number) : null);
  const positive = (k: string): boolean => (finite(k) ?? 0) > 0;
  const nonNegative = (k: string): boolean => (finite(k) ?? -1) >= 0;
  // puff_interval_s が 0 以下だと updateSmoke の while が止まらない。半径・寿命・時間は正、冷却と長押しは 0 でもよい
  return positive('duration_s') && positive('puff_interval_s') && positive('puff_radius_m') && positive('puff_lifetime_s') && nonNegative('cooldown_s') && nonNegative('extinguish_hold_s');
}

/** 煙幕発生器が無い艇なら null */
export function smokeParamsFromData(r: BoatSmokeDataRecord): SmokeParams | null {
  if (!r.smoke_generator || !r.smoke) return null;
  return {
    durationS: r.smoke.duration_s,
    cooldownS: r.smoke.cooldown_s,
    puffIntervalS: r.smoke.puff_interval_s,
    puffRadiusM: r.smoke.puff_radius_m,
    puffLifetimeS: r.smoke.puff_lifetime_s,
    extinguishHoldS: r.smoke.extinguish_hold_s,
  };
}
