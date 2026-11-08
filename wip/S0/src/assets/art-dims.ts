// v0.7.0 S0: 世界の絵のテクスチャの寸法の式（Phaser に依らない）。v0.6.11 の placeholder（assets/placeholders・*-placeholder）の Math.ceil の式を、同じ計算の順のまま関数にした。
// S1〜S3c の絵（assets/*-art）は寸法をここから取り、鍵・寸法・原点を今のままにする（spec-v0700 D1。卯月と味方の輸送船の名前・状態の行の y は displayWidth/Height から、
// 探照灯・星弾・煙幕の scale は射程・半径 / テクスチャの単位から決まる）。tests/art-inventory が v0.6.11 の式と k ∈ {1, 375/360, 393/360, 2} で同じことを確かめる。
// k は RENDER_SCALE（テクスチャの 1 世界単位の px。iPhone 15 で 393/360・iPhone SE で 375/360）。

/** テクスチャの幅・高さ（px） */
export interface TexSize {
  readonly w: number;
  readonly h: number;
}

/** placeholders.ts の私的な値（v0.6.11。魚雷の幅・雷跡の点の半径・爆発の輪の半径。世界単位）。tests/art-inventory が placeholders.ts の行と同じことを確かめる */
export const TORPEDO_WIDTH_UNITS = 3;
export const WAKE_DOT_RADIUS_UNITS = 2.5;
export const EXPLOSION_RING_RADIUS_UNITS = 40;

/** 船形（艇・駆逐艦・輸送船・卯月・大発・米PT。艇首が上・原点は中央）: 幅 ceil(B·k) × 高さ ceil(L·k) */
export function hullTexSize(lengthUnits: number, beamUnits: number, k: number): TexSize {
  const L = lengthUnits * k;
  const B = beamUnits * k;
  return { w: Math.ceil(B), h: Math.ceil(L) };
}

/** 魚雷（先端が上）: ceil(3·k) × ceil(L·k) */
export function torpedoTexSize(lengthUnits: number, k: number): TexSize {
  return { w: Math.ceil(TORPEDO_WIDTH_UNITS * k), h: Math.ceil(lengthUnits * k) };
}

/** 機（機首が上・全種が同じ箱）: ceil(翼幅·k) × ceil(長さ·k) */
export function aircraftTexSize(spanUnits: number, lengthUnits: number, k: number): TexSize {
  return { w: Math.ceil(spanUnits * k), h: Math.ceil(lengthUnits * k) };
}

/** 丸（中心が原点）: 一辺 ceil(r·2·k) + pad。雷跡の点・星弾・煙幕は pad 2、爆発の輪は pad 8 */
export function discTexSize(radiusUnits: number, k: number, pad: number): TexSize {
  const d = Math.ceil(radiusUnits * 2 * k) + pad;
  return { w: d, h: d };
}

/** 探照灯（光源が下端の中央＝原点 (0.5, 1)・光は上へ）: 幅 ceil(tan(角/2)·L·k·2) + 2 × 高さ ceil(L·k) */
export function searchlightTexSize(coneDeg: number, lengthUnits: number, k: number): TexSize {
  const L = lengthUnits * k;
  const halfW = Math.tan(((coneDeg / 2) * Math.PI) / 180) * L;
  return { w: Math.ceil(halfW * 2) + 2, h: Math.ceil(L) };
}
