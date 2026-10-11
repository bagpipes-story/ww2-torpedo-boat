// 浅瀬と座礁（docs/02 §6.8、risk_events.json の grounding、v0.3.2）。Phaser 非依存、確保しない。
// 浅瀬は軸に平行な矩形の列（missions_seed の shallows）。安全速力（params.safe_speed_kt）を超えて中に入ると座礁＝速力 0 で動けなくなり、艇喪失。
// HUD の警告: 現在の速力で進むと warn_lookahead_s 実秒以内に浅瀬へ入る（かつ安全速力を超えている）なら「浅瀬まで N m 減速」。
import { ktToMps } from './units';

export interface ShallowRect {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

export interface GroundingParams {
  safeSpeedMps: number;
  /** 現在の速力で浅瀬に入るまでの実秒がこれ以下なら警告 */
  warnLookaheadS: number;
}

/** HUD に出す浅瀬の状態 */
export const SHALLOW_NONE = 0;
/** 安全速力を超えたまま進むと warn_lookahead_s 以内に浅瀬へ入る */
export const SHALLOW_APPROACHING = 1;
/** 浅瀬の中を安全速力以下で進んでいる */
export const SHALLOW_INSIDE = 2;
/** 座礁した */
export const SHALLOW_GROUNDED = 3;

export interface ShallowStatus {
  state: number;
  /** 浅瀬の縁までの距離 m（APPROACHING のとき。それ以外は 0） */
  aheadM: number;
}

/** (x, y) が入っている浅瀬の index。無ければ -1 */
export function shallowIndexAt(rects: readonly ShallowRect[], x: number, y: number): number {
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i]!;
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
  }
  return -1;
}

const EPS = 1e-9;

/**
 * (x, y) から方位 headingDeg（0=北=−y、時計回り）へ進む半直線が最初に浅瀬へ入るまでの距離 m。中にいれば 0、入らなければ Infinity。
 * 軸平行矩形とのスラブ判定（sqrt 無し）
 */
export function distanceToShallowsM(rects: readonly ShallowRect[], x: number, y: number, headingDeg: number): number {
  const h = (headingDeg * Math.PI) / 180;
  const dx = Math.sin(h);
  const dy = -Math.cos(h);
  let best = Infinity;
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i]!;
    let tmin = 0;
    let tmax = Infinity;
    if (Math.abs(dx) < EPS) {
      if (x < r.x || x > r.x + r.w) continue;
    } else {
      let t1 = (r.x - x) / dx;
      let t2 = (r.x + r.w - x) / dx;
      if (t1 > t2) {
        const t = t1;
        t1 = t2;
        t2 = t;
      }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
    }
    if (Math.abs(dy) < EPS) {
      if (y < r.y || y > r.y + r.h) continue;
    } else {
      let t1 = (r.y - y) / dy;
      let t2 = (r.y + r.h - y) / dy;
      if (t1 > t2) {
        const t = t1;
        t1 = t2;
        t2 = t;
      }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
    }
    if (tmin <= tmax && tmin < best) best = tmin;
  }
  return best;
}

/**
 * HUD の状態を out に書く。座礁は world が決める（grounded を渡す）。中にいる（＝座礁していないので安全速力以下）なら INSIDE。
 * 外にいて安全速力を超えていれば、現在の速力（game m/s = speedMps × timeScale）で warnLookaheadS 実秒に進む距離の中に浅瀬の縁があれば APPROACHING
 */
export function updateShallowStatus(
  out: ShallowStatus,
  rects: readonly ShallowRect[],
  x: number,
  y: number,
  headingDeg: number,
  speedMps: number,
  p: GroundingParams,
  timeScale: number,
  grounded: boolean,
): void {
  out.aheadM = 0;
  if (grounded) {
    out.state = SHALLOW_GROUNDED;
    return;
  }
  if (shallowIndexAt(rects, x, y) >= 0) {
    out.state = SHALLOW_INSIDE;
    return;
  }
  if (speedMps > p.safeSpeedMps) {
    const d = distanceToShallowsM(rects, x, y, headingDeg);
    if (d <= speedMps * timeScale * p.warnLookaheadS) {
      out.state = SHALLOW_APPROACHING;
      out.aheadM = d;
      return;
    }
  }
  out.state = SHALLOW_NONE;
}

// ---------- data の読み出し ----------

export interface GroundingDataRecord {
  params: { safe_speed_kt: number; warn_lookahead_s: number };
}

export function isGroundingDataRecord(v: unknown): v is GroundingDataRecord {
  if (!v || typeof v !== 'object') return false;
  const p = (v as Record<string, unknown>)['params'] as Record<string, unknown> | undefined;
  return !!p && typeof p['safe_speed_kt'] === 'number' && p['safe_speed_kt'] > 0 && typeof p['warn_lookahead_s'] === 'number' && p['warn_lookahead_s'] >= 0;
}

export function groundingParamsFromData(r: GroundingDataRecord): GroundingParams {
  return { safeSpeedMps: ktToMps(r.params.safe_speed_kt), warnLookaheadS: r.params.warn_lookahead_s };
}

export interface ShallowRectDataRecord {
  x_m: number;
  y_m: number;
  width_m: number;
  height_m: number;
  label_ja?: string;
}

export function isShallowRectDataRecord(v: unknown): v is ShallowRectDataRecord {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return ['x_m', 'y_m', 'width_m', 'height_m'].every((k) => typeof r[k] === 'number' && Number.isFinite(r[k] as number)) && (r['label_ja'] === undefined || typeof r['label_ja'] === 'string');
}

/** 幅・高さは正、矩形は海域の中。崩れていれば例外 */
export function shallowsFromData(list: readonly ShallowRectDataRecord[], bounds: { width: number; height: number }): ShallowRect[] {
  return list.map((r, i) => {
    if (!(r.width_m > 0) || !(r.height_m > 0)) throw new Error(`shallows[${i}] の width_m / height_m は正の数`);
    if (r.x_m < 0 || r.y_m < 0 || r.x_m + r.width_m > bounds.width || r.y_m + r.height_m > bounds.height) throw new Error(`shallows[${i}] が海域（bounds_m）からはみ出している`);
    return { x: r.x_m, y: r.y_m, w: r.width_m, h: r.height_m, label: r.label_ja ?? '浅瀬' };
  });
}
