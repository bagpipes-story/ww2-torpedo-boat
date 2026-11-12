// v0.7.0 IP3（実機 3 回目の直し。ユーザーの U10「自機（魚雷艇）と大発も視覚的なクオリティを上げてください」）: 艇（自艇・僚艇・隼艇・敵の米PT）と大発を Canvas の 2D に
// 陰影つきで描く細部の定数（assets/boat-paint・barge-paint）。位置の骨組み（船体の輪郭・船室・発射管・銃座・艇尾の箱）は boat-art-config の BOAT_ART_LAYOUTS、大発の輪郭と
// 荷台・艇尾の位置は ship-art-config の BARGE_* のまま（tests/boat-art・ship-art）。ここは描き方と足す細部だけ。色は地の色 1 つから明るさだけを変える（IP2 の駆逐艦と同じ
// toneRgb: 暗くは RGB に掛け、明るくは白へ混ぜる＝色相は変わらない。自艇の灰は彩度がそのまま＝ESCORT_TINT・EVAC_HIDDEN_TINT の掛け算がきれいに効く）。
// ゲームの強さの値ではないので data/*.json には置かない。何も import しない。

/** 艇の明るさ（地の色に対する倍。> 1 は白へ混ぜる）。左舷（画面の左）が明るく右舷が暗い（光は左上から）。平均の明るさは tex-ab の門（placeholder の −10%〜+15%）の内に保つ */
export const BOAT_TONES = {
  /** 喫水の暗い縁（輪郭の外の 0.55 単位） */
  waterline: 0.72,
  /** 舷の帯（喫水の縁と甲板の縁の間。左・右） */
  sheerLeft: 1.5,
  sheerRight: 0.96,
  /** 甲板の横の陰影（左・中・右） */
  deckLeft: 1.34,
  deckMid: 1.18,
  deckRight: 1.02,
  /** 甲板の板の筋（長さに沿う細い線）の明るさと濃さ */
  plank: 0.72,
  plankAlpha: 0.16,
  /** 高い物が甲板に落とす陰の明るさと濃さ */
  shadow: 0.42,
  shadowAlpha: 0.3,
  /** 船室・操舵室（左・右）と屋根の光 */
  cabinLeft: 1.45,
  cabinRight: 0.95,
  roof: 1.75,
  /** 風防のガラス・操舵の窪み・ハッチの暗い口 */
  glass: 0.36,
  well: 0.5,
  /** 筒（発射管・魚雷）の左・右・口 */
  tubeLeft: 1.6,
  tubeRight: 0.86,
  tubeMouth: 0.34,
  /** 銃座の台（輪）・中・砲身 */
  tubRing: 1.4,
  tubInner: 0.6,
  barrel: 0.3,
  /** 艇首の舷の光（波を切る縁の明るい線） */
  bowFlare: 1.85,
  /** 縁の暗い線（部品の輪郭） */
  edge: 0.5,
} as const;

/** 喫水の暗い縁と舷の帯の幅（単位。舷の帯の内側が甲板） */
export const BOAT_WATERLINE_UNITS = 0.55;
export const BOAT_SHEER_UNITS = 0.9;
/** 甲板の板の筋の間隔（単位）と太さ（単位） */
export const BOAT_PLANK_UNITS = 1.4;
export const BOAT_PLANK_W_UNITS = 0.22;
/** 陰のずれ（単位。右舷・艇尾へ。艇が回ると一緒に回る） */
export const BOAT_SHADOW_DX = 0.7;
export const BOAT_SHADOW_DY = 0.9;
/** 艇首の舷の光の届く所（長さの割合） */
export const BOAT_BOW_FLARE_TO = 0.32;
/** 筒の太さ（単位。layout の筒の幅 2 単位の内に収める）と口の長さ（単位） */
export const BOAT_TUBE_W_UNITS = 2;
export const BOAT_TUBE_MOUTH_UNITS = 0.8;
/** 砲身の太さ（単位） */
export const BOAT_BARREL_W_UNITS = 0.45;

/**
 * 銃座・砲の描き方（layout の guns の順に 1 つずつ）: bow20＝艇首の 20 mm（台と前の砲身 1）・twin50＝連装 .50 の丸い銃座（外へ向く砲身 2）・bofors＝艇尾の 40 mm（後ろの砲身 1 と台）・
 * mg13＝13 mm（細い砲身 1）・mg25＝25 mm（盾と砲身 2）・dc＝爆雷の樽（砲身なし）
 */
export type BoatGunStyle = 'bow20' | 'twin50' | 'bofors' | 'mg13' | 'mg25' | 'dc';
/** 魚雷の積み方: tube＝米の発射管（筒と口）・rack＝日本の艇の架台の魚雷（明るい胴と暗い架台の帯） */
export type BoatTorpedoStyle = 'tube' | 'rack';
/** 艇の細部: 銃座の描き方（layout.guns と同じ数）・魚雷の積み方・甲板のハッチ [位置, 幅（単位）, 長さ（単位）]（中心線）・換気筒 [位置, x（B 倍）]・係船柱の位置（長さの割合） */
export interface BoatPaintDetail {
  readonly guns: readonly BoatGunStyle[];
  readonly torpedo: BoatTorpedoStyle;
  readonly hatches: readonly (readonly [number, number, number])[];
  readonly vents: readonly (readonly [number, number])[];
  readonly cleats: readonly number[];
}
export const BOAT_PAINT_DETAILS: Readonly<Record<'elco80' | 'elco77' | 't38' | 't14' | 'h38', BoatPaintDetail>> = {
  elco80: { guns: ['bow20', 'twin50', 'twin50', 'bofors'], torpedo: 'tube', hatches: [[0.22, 3.2, 2.6], [0.6, 3.4, 3], [0.71, 3.4, 3]], vents: [[0.79, 0.14], [0.79, -0.14]], cleats: [0.05, 0.95] },
  elco77: { guns: ['twin50', 'twin50'], torpedo: 'tube', hatches: [[0.18, 3.2, 2.6], [0.6, 3.4, 3], [0.71, 3.4, 3]], vents: [[0.84, 0.14], [0.84, -0.14]], cleats: [0.05, 0.95] },
  t38: { guns: ['mg13', 'dc', 'dc'], torpedo: 'rack', hatches: [[0.22, 2.4, 2.2], [0.68, 2, 2.4]], vents: [[0.33, 0.2], [0.33, -0.2]], cleats: [0.06] },
  t14: { guns: ['mg13'], torpedo: 'rack', hatches: [[0.24, 2.2, 2], [0.38, 2, 2]], vents: [[0.44, 0.2], [0.44, -0.2]], cleats: [0.06] },
  h38: { guns: ['mg25', 'mg25', 'mg13'], torpedo: 'rack', hatches: [[0.34, 2.2, 2], [0.66, 2.2, 2.2]], vents: [[0.88, 0.18], [0.88, -0.18]], cleats: [0.06, 0.95] },
};

/** 大発の明るさ（地の色に対する倍）。道板・舷の縁・荷台の床（窪み）・荷（箱・兵）・機関の覆い・艇長の台・防舷の縄 */
export const BARGE_TONES = {
  waterline: 0.72,
  gunwaleLeft: 1.45,
  gunwaleRight: 1.0,
  rampLeft: 1.38,
  rampRight: 1.04,
  rampRib: 0.76,
  hinge: 0.4,
  floor: 0.86,
  floorShade: 0.6,
  crateLeft: 1.5,
  crateRight: 1.04,
  troop: 1.6,
  housingLeft: 1.45,
  housingRight: 0.98,
  grille: 0.62,
  roof: 1.7,
  glass: 0.38,
  fender: 0.5,
  fenderLight: 1.3,
  shadow: 0.42,
  shadowAlpha: 0.32,
  plank: 0.72,
  plankAlpha: 0.24,
} as const;
/** 大発の細部（単位・長さの割合）: 舷の縁の幅・道板の後ろの端（蝶番）・道板の桁の数・荷の箱 [位置, x（B 倍）, 幅, 長さ]・兵（頭の点）の列 [位置, 数]・頭の半径・
 * 機関の覆い [前, 後, 幅（B 倍）]・艇長の台 [前, 後, 幅（B 倍）]・防舷の縄の位置（長さの割合） */
export const BARGE_GUNWALE_UNITS = 1.05;
export const BARGE_RAMP_TO = 0.19;
export const BARGE_RAMP_RIBS = 4;
export const BARGE_CRATES: readonly (readonly [number, number, number, number])[] = [[0.25, -0.12, 1.9, 1.6], [0.25, 0.16, 1.5, 1.9], [0.6, 0, 2.6, 1.7]];
export const BARGE_TROOP_ROWS: readonly (readonly [number, number])[] = [[0.335, 3], [0.385, 3], [0.435, 3], [0.485, 3], [0.535, 3]];
export const BARGE_TROOP_R = 0.52;
export const BARGE_HOUSING: readonly [number, number, number] = [0.68, 0.84, 0.56];
export const BARGE_COX: readonly [number, number, number] = [0.86, 0.95, 0.4];
export const BARGE_FENDERS: readonly number[] = [0.26, 0.44, 0.62, 0.8];
