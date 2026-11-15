// 海峡の幾何（v0.8.0 S1。us_04「ブラケット海峡の夜」。spec-v0800 §4.3・§4.9・§3.2 D-R4）: 海域の北の縁（y 0）と南の縁（y 海域の高さ）の岸の線と、
// 切れ目（水道）を除いた陸の区間、点から一番近い陸までの距離の 2 乗（レーダーの陸の反射の帯＝core/radar）、衝突の危険（艦首が自艇へ向く。2 行目の文＝S4）。
// 陸までの距離は岸の角も見る: 陸の区間の真横なら岸の線まで、切れ目の上なら切れ目の両端の陸（岸の角）まで。だから水道の中は両端の陸から遠ければ反射の外。
// 岸の線は us_04 の両岸（config/shores-mission-data の ShoresSetup。北と南・切れ目あり）からも、今の岸（coast。南だけ・切れ目なし＝v0.8.1 の us_06）からも landLine で作れる。
// Phaser 非依存・乱数なし。作る（landLine・landLinesFromShores）は起動時に 1 回だけ確保し、判定（landDist2・bowOnRisk）は確保しない（2 乗の距離と内積だけ。平方根・atan2 なし）。
import { degToRad } from './units';

/** 岸の線の縁: north は y 0 の線で陸は y < 0 の側、south は y 海域の高さの線で陸はその外 */
export type ShoreEdge = 'north' | 'south';

/** x の区間（陸の区間・切れ目。x0 < x1） */
export interface XSpan {
  readonly x0: number;
  readonly x1: number;
}

/** 岸の線 1 本 */
export interface LandLine {
  readonly edge: ShoreEdge;
  /** 線の y（north は 0・south は海域の高さ） */
  readonly y: number;
  /** 陸のある向き（north は −1＝y の小さい側・south は +1） */
  readonly landSide: -1 | 1;
  /** 陸の区間（海域の幅 0〜width から切れ目を除いた区間。昇順・重ならない。切れ目が幅の全部なら空＝陸なし） */
  readonly spans: readonly XSpan[];
}

/** 岸の線を作る（起動時に 1 回）。gaps は切れ目（昇順・重ならない＝config/shores-mission-data の V-S1）。陸は海域の幅の内だけ */
export function landLine(edge: ShoreEdge, width: number, height: number, gaps: readonly XSpan[]): LandLine {
  const spans: XSpan[] = [];
  let x = 0;
  for (const g of gaps) {
    if (g.x0 > x) spans.push({ x0: x, x1: Math.min(g.x0, width) });
    if (g.x1 > x) x = g.x1;
  }
  if (x < width) spans.push({ x0: x, x1: width });
  return { edge, y: edge === 'north' ? 0 : height, landSide: edge === 'north' ? -1 : 1, spans };
}

/** 海峡の両岸（ShoresSetup の形＝north・south の gaps）から北と南の岸の線（起動時に 1 回） */
export function landLinesFromShores(
  shores: { readonly north: { readonly gaps: readonly XSpan[] }; readonly south: { readonly gaps: readonly XSpan[] } },
  width: number,
  height: number,
): LandLine[] {
  return [landLine('north', width, height, shores.north.gaps), landLine('south', width, height, shores.south.gaps)];
}

/**
 * 点 (x, y) から一番近い陸（岸の線の上の陸の区間と、その向こう）までの距離の 2 乗。岸の線が無いか陸の区間が無ければ Infinity。
 * 線の向こう（陸の側）の点は線の上と同じに数える（陸の区間の上なら 0）
 */
export function landDist2(lines: readonly LandLine[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const a = (line.y - y) * line.landSide; // 岸の線まで（海の側が正。向こうは 0）
    const across2 = a > 0 ? a * a : 0;
    const spans = line.spans;
    for (let j = 0; j < spans.length; j++) {
      const s = spans[j]!;
      const dx = x < s.x0 ? s.x0 - x : x > s.x1 ? x - s.x1 : 0;
      const d2 = dx * dx + across2;
      if (d2 < best) best = d2;
    }
  }
  return best;
}

/** bowOnRisk の cos2（半角 halfAngleDeg の cos の 2 乗。0 < 半角 < 90。起動時に 1 回） */
export function bowOnCos2(halfAngleDeg: number): number {
  const c = Math.cos(degToRad(halfAngleDeg));
  return c * c;
}

/**
 * 衝突の危険（spec §4.9「衝突の危険！ 駆逐艦 400 m ・ 艇首がこちらへ」）: 艦 (sx, sy)（針路 headingDeg。0＝北・時計回り。x は東・y は南）から自艇 (bx, by) までが
 * range の内（range2 はその 2 乗。境界は含む）で、艦首が自艇へ半角の内（cos2＝bowOnCos2。境界は含む）。同じ点なら真。
 * 艦首の単位ベクトル (sin h, −cos h) と自艇への向きの内積と 2 乗の距離だけ（atan2・平方根なし）。目で見えている艦だけに使うのは呼ぶ側（S4）
 */
export function bowOnRisk(sx: number, sy: number, headingDeg: number, bx: number, by: number, range2: number, cos2: number): boolean {
  const dx = bx - sx;
  const dy = by - sy;
  const d2 = dx * dx + dy * dy;
  if (d2 > range2) return false;
  if (d2 === 0) return true;
  const h = degToRad(headingDeg);
  const dot = Math.sin(h) * dx - Math.cos(h) * dy;
  return dot > 0 && dot * dot >= cos2 * d2;
}
