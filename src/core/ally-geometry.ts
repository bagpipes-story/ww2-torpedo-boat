// 卯月の止まる位置の幾何（v0.6.10。jp_04。spec-v0610 §3.3 の V-A2〜V-A5、リードの決定 LD6・LD16）: 米PT の線（今夜の南北のずれ込み）ごとの気づかれていない斉射の点（calm point＝線の上で
// 泊地から launch_range_m に初めて入る点）・斉射の道（その点 → 泊地）・扇を測る。config/ally-destroyer-mission-data の検査と tests/ally-destroyer-data・位置の探索が読む。
// 線の今夜の形は core/pt-night の ptStartAt（線ごと南北のずれ dy・縁の余白への押し戻し込み。線に沿ったずれ dx は出発点だけを動かし線は変えない）。東西反転は見ない（揚陸の任務は mirror_chance 0）。
// Phaser 非依存。出撃の組み立てで 1 回（毎ステップは呼ばない）。
import { ptStartAt, type PtParams } from './pt-data';
import { bearingDeg } from './ship-ai';
import { clamp, wrapDeg180 } from './units';

/** 測る値（位置・扇・距離・角） */
export interface AllyGeomInput {
  /** 卯月の位置と最初に気づく扇（0 = 北・時計回り）・扇で見張る線の添字 */
  x: number; y: number; arc0Deg: number; arc1Deg: number; guardLegs: readonly number[];
  /** 泊地（輸送船の中心）と気づかれていない斉射の距離 m */
  ax: number; ay: number; launchM: number;
  /** 速い PT の見張りの距離 m・点灯と反応の間に忍び寄る PT が進む m（V-A3）・卯月の全長の半分 m（V-A5） */
  fastM: number; padM: number; halfLenM: number;
  /** 斉射の狙いの誤差 ±deg と外の魚雷の角 deg（salvo_spacing_deg × (salvo_count − 1) / 2。LD6） */
  aimDeg: number; spreadDeg: number;
  /** 今夜の南北のずれ ±m・ずれと線の上の標本の刻み m（以下）・扇の内外の余裕 deg（V-A2） */
  jitterYM: number; stepM: number; clearDeg: number;
}

/** 最も悪い値とそのときの線と南北のずれ */
export interface AllyWorst {
  value: number;
  leg: number;
  dy: number;
}

/**
 * 測った値（どれも大きいほど良い。線・ずれの最も悪い所）:
 * guardIn 見張る線の fastM の内の点の扇の内の余裕 deg（点が無ければ Infinity）・nonGuardOut 見張らない線の fastM の内の点の扇の外の余裕 deg（点が無ければ Infinity）・
 * window 見張る線の斉射の点より前で fastM の内・扇の内に clearDeg 以上の長さ m・cap 見張る線の斉射の点まで（その点を含む）の卯月からの最短 − padM（V-A3 の lookout_slow_m の上限）・
 * lane 斉射の道（点 → 泊地）から卯月まで m（V-A4）・slack 斉射の点から見た泊地と卯月の角 − 卯月の半長の見かけの角 − aimDeg − spreadDeg（V-A5）
 */
export interface AllyMargins {
  guardIn: AllyWorst; nonGuardOut: AllyWorst; window: AllyWorst; cap: AllyWorst; lane: AllyWorst; slack: AllyWorst;
}

const LEG = { x0: 0, y0: 0, x1: 0, y1: 0, x: 0, y: 0, headingDeg: 0 };
const RAD = 180 / Math.PI;

/** 方位 b（0〜360）の扇 [a0, a1] の内の余裕 deg（内なら端までの近い方で正、外なら近い端までの角を負に） */
export function allyArcMarginDeg(b: number, a0: number, a1: number): number {
  if (b >= a0 && b <= a1) return Math.min(b - a0, a1 - b);
  return -Math.min(Math.abs(wrapDeg180(b - a0)), Math.abs(wrapDeg180(b - a1)));
}

/** 線の上の t（0〜1）で初めて (ax, ay) から r に入る点。始点が内なら 0、入らなければ NaN */
export function firstInsideT(x0: number, y0: number, x1: number, y1: number, ax: number, ay: number, r: number): number {
  const vx = x1 - x0;
  const vy = y1 - y0;
  const fx = x0 - ax;
  const fy = y0 - ay;
  const c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0;
  const a = vx * vx + vy * vy;
  const b = 2 * (vx * fx + vy * fy);
  const disc = b * b - 4 * a * c;
  if (a === 0 || disc < 0) return NaN;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : NaN;
}

/** 点 (px, py) と線分 (ax, ay)–(bx, by) の最短 m */
export function segDistM(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const l2 = vx * vx + vy * vy;
  const t = l2 > 0 ? clamp(((px - ax) * vx + (py - ay) * vy) / l2, 0, 1) : 0;
  return Math.hypot(ax + vx * t - px, ay + vy * t - py);
}

const worst = (): AllyWorst => ({ value: Infinity, leg: -1, dy: 0 });
function low(w: AllyWorst, v: number, leg: number, dy: number): void {
  if (v < w.value) {
    w.value = v;
    w.leg = leg;
    w.dy = dy;
  }
}

/** V-A2〜V-A5 の値を p の線（揺らぎの前の getPtParams の値。ハードなら足した線も）と今夜の南北のずれ（−jitterYM〜+jitterYM を stepM 以下の刻みで、両端を含む）で測る */
export function allyStationMargins(p: PtParams, g: AllyGeomInput): AllyMargins {
  const m: AllyMargins = { guardIn: worst(), nonGuardOut: worst(), window: worst(), cap: worst(), lane: worst(), slack: worst() };
  const steps = g.jitterYM > 0 ? Math.ceil((2 * g.jitterYM) / g.stepM) : 0;
  for (let i = 0; i < p.count; i++) {
    const guard = g.guardLegs.includes(i);
    for (let k = 0; k <= steps; k++) {
      const dy = steps === 0 ? 0 : -g.jitterYM + (2 * g.jitterYM * k) / steps;
      ptStartAt(p, i, 0, dy, false, LEG);
      const { x0, y0, x1, y1 } = LEG;
      const t = firstInsideT(x0, y0, x1, y1, g.ax, g.ay, g.launchM);
      const len = Math.hypot(x1 - x0, y1 - y0);
      const n = Math.max(1, Math.ceil(len / g.stepM));
      let win = 0;
      for (let q = 0; q <= n; q++) {
        const u = q / n;
        const px = x0 + (x1 - x0) * u;
        const py = y0 + (y1 - y0) * u;
        if (Math.hypot(px - g.x, py - g.y) > g.fastM) continue;
        const mg = allyArcMarginDeg(bearingDeg(g.x, g.y, px, py), g.arc0Deg, g.arc1Deg);
        if (!guard) {
          low(m.nonGuardOut, -mg, i, dy);
          continue;
        }
        low(m.guardIn, mg, i, dy);
        if (!Number.isNaN(t) && u <= t && mg >= g.clearDeg) win += len / n;
      }
      if (guard) low(m.window, win, i, dy);
      if (Number.isNaN(t)) continue; // 泊地の launch_range_m に入らない線は気づかれていない斉射を撃たない
      const cx = x0 + (x1 - x0) * t;
      const cy = y0 + (y1 - y0) * t;
      if (guard) low(m.cap, segDistM(g.x, g.y, x0, y0, cx, cy) - g.padM, i, dy);
      low(m.lane, segDistM(g.x, g.y, cx, cy, g.ax, g.ay), i, dy);
      const ang = Math.abs(wrapDeg180(bearingDeg(cx, cy, g.ax, g.ay) - bearingDeg(cx, cy, g.x, g.y)));
      low(m.slack, ang - Math.atan(g.halfLenM / Math.hypot(g.x - cx, g.y - cy)) * RAD - g.aimDeg - g.spreadDeg, i, dy);
    }
  }
  return m;
}
