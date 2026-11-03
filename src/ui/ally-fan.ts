// 卯月の見張りの扇の形（v0.6.10 S5a。jp_04。spec-v0610 リードの決定 LD15・LD16）: Boot が 1 回だけテクスチャにする多角形と、その箱。
// 座標は卯月を原点・東 +x・南 +y の m。扇 [arc0, arc1]（北 0・時計回り。data の watch_arc_deg）の半径 r（速い PT の見張りの lookout_fast_m）の弧を stepDeg 以下の刻みの折れ線にし、
// 浜の線（卯月から南へ shoreDy m。レイテ島の陸の縁＝海域の南の縁）より南を切り落とす（半平面との交わり。Sutherland–Hodgman の 1 辺）。陸の上に扇を描かない。
// テクスチャは texMPerPx m を 1 px にした粗い 1 枚（薄い一色なので粗くても見た目は同じ。800 m の扇を高 DPI の画素で作ると iPhone の GPU のメモリを食う）。
// Phaser 非依存（tests/ally-fan が形を見る。Boot と entities/ally-destroyer が同じ入力で同じ箱を得る）。確保は起動時と出撃の組み立てだけ。
import { ALLY_FAN_ARC_STEP_DEG, ALLY_FAN_TEX_M_PER_PX } from '../config/ally-config';
import { degToRad } from '../core/units';

export interface FanPoint {
  readonly x: number;
  readonly y: number;
}

/** 扇のテクスチャの形: 頂点（テクスチャの px。左上が 0）・大きさ（px）・卯月の位置の割合（setOrigin に渡す）・1 px の m（表示の倍率） */
export interface AllyFanShape {
  readonly points: readonly FanPoint[];
  readonly widthPx: number;
  readonly heightPx: number;
  readonly originX: number;
  readonly originY: number;
  readonly mPerPx: number;
}

/** 扇の多角形（m。原点が卯月）: 原点 → 弧（arc0 から arc1 へ）を浜の線 y ≤ shoreDy で切ったもの。shoreDy が Infinity なら切らない */
export function allyFanPolygon(r: number, arc0Deg: number, arc1Deg: number, shoreDy: number, stepDeg: number): FanPoint[] {
  const n = Math.max(1, Math.ceil((arc1Deg - arc0Deg) / stepDeg));
  const raw: FanPoint[] = [{ x: 0, y: 0 }];
  for (let i = 0; i <= n; i++) {
    const a = degToRad(arc0Deg + ((arc1Deg - arc0Deg) * i) / n);
    raw.push({ x: r * Math.sin(a), y: -r * Math.cos(a) });
  }
  return clipSouth(raw, shoreDy);
}

/** 半平面 y ≤ yMax との交わり（凸でなくてよい・1 辺の Sutherland–Hodgman） */
function clipSouth(poly: readonly FanPoint[], yMax: number): FanPoint[] {
  const out: FanPoint[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const ain = a.y <= yMax;
    const bin = b.y <= yMax;
    if (ain) out.push(a);
    if (ain !== bin) out.push({ x: a.x + ((b.x - a.x) * (yMax - a.y)) / (b.y - a.y), y: yMax });
  }
  return out;
}

/** 扇のテクスチャの形（Boot の絵と entities/ally-destroyer の置き方が同じ値を使う）。shoreDy は卯月から浜の線までの南の m（陸の無い任務は Infinity） */
export function allyFanShape(r: number, arc0Deg: number, arc1Deg: number, shoreDy: number, stepDeg: number, mPerPx: number): AllyFanShape {
  const poly = allyFanPolygon(r, arc0Deg, arc1Deg, shoreDy, stepDeg);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of poly) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  const widthPx = Math.max(1, Math.ceil((x1 - x0) / mPerPx));
  const heightPx = Math.max(1, Math.ceil((y1 - y0) / mPerPx));
  const points = poly.map((p) => ({ x: (p.x - x0) / mPerPx, y: (p.y - y0) / mPerPx }));
  return { points, widthPx, heightPx, originX: -x0 / mPerPx / widthPx, originY: -y0 / mPerPx / heightPx, mPerPx };
}

/** 卯月の扇の形（Boot と entities/ally-destroyer の 1 か所の式）: 半径は速い PT の見張り・扇は data のまま・陸（岸のある任務は海域の南の縁より南）を切る */
export function allyFanFor(p: { readonly y: number; readonly lookFastM: number; readonly arc0Deg: number; readonly arc1Deg: number }, hasCoast: boolean, boundsHeight: number): AllyFanShape {
  return allyFanShape(p.lookFastM, p.arc0Deg, p.arc1Deg, hasCoast ? boundsHeight - p.y : Infinity, ALLY_FAN_ARC_STEP_DEG, ALLY_FAN_TEX_M_PER_PX);
}
