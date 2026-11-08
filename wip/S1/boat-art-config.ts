// v0.7.0（アートと音①：コードで描く絵）の艇・艦の絵の定数。S1〜S2a の assets/*-art が起動時に 1 回だけテクスチャに描く（CLAUDE.md §7）。
// ゲームの強さの値ではないので data/*.json には置かない（evac-art-config と同じ考え）。当たり・寸法・速さなど論理に効く値は data のまま、テクスチャの寸法は
// assets/art-dims の式（v0.6.11 の placeholder と同じ。spec-v0700 D1）。ユーザーの決め（v0.7.0 の U1。2026-11-07「コードで描く・鳴らす」）。何も import しない。
// 色の意味は固定（docs/02 §7）: 自艇＝白、敵＝薄い赤、味方＝薄い青、魚雷＝黄。船体の地（最も広い面）がこの系統で、細部は同じ系統の明暗（spec-v0700 §3.3）。

/** 船体のパレット: 地（甲板）・縁（リム）・側の暗い帯・上部構造・暗い細部（砲・煙突・ハッチ）・明るい点 */
export interface HullPalette {
  readonly deck: number;
  readonly rim: number;
  readonly side: number;
  readonly superstructure: number;
  readonly detail: number;
  readonly highlight: number;
}

/** 自艇・僚艇・隼艇（白。boatTextureKey の 5 枚は僚艇・隼艇で ESCORT_TINT、jp_03 で EVAC_HIDDEN_TINT が掛かる＝無彩色に近く描く） */
export const PALETTE_PLAYER: HullPalette = { deck: 0xe6eaee, rim: 0xf7f9fb, side: 0xa7afb8, superstructure: 0xb9c1c9, detail: 0x5d6670, highlight: 0xffffff };
/** 敵（薄い赤）: 駆逐艦・米PT・大発・敵機 */
export const PALETTE_ENEMY: HullPalette = { deck: 0xd08c88, rim: 0xe6aaa6, side: 0x9c605d, superstructure: 0xb97c78, detail: 0x5a3c3a, highlight: 0xf2c4c0 };
/** 敵の輸送船（灰がかった赤＝砲台でない。v0.4.7 の COLOR_TRANSPORT の系統） */
export const PALETTE_TRANSPORT: HullPalette = { deck: 0xb89a9a, rim: 0xccb2b2, side: 0x8a7070, superstructure: 0xd8c2c2, detail: 0x4a3a3a, highlight: 0xeadcdc };
/** 味方（薄い青。ESCORT_TINT の系統）: 味方の輸送船・卯月・味方の大発 */
export const PALETTE_ALLY: HullPalette = { deck: 0x9ad0ff, rim: 0xb8e0ff, side: 0x5f8fb8, superstructure: 0x7fb3df, detail: 0x2f4a66, highlight: 0xdff1ff };
/** 魚雷（黄）: 胴・尾の 1 単位（やや暗い）・先端（明るい）。黄の面積 ≥ 85%・平均の明るさ ≥ placeholder × 0.95（R8） */
export const TORPEDO_ART = { body: 0xffe066, tail: 0xc9a630, tip: 0xfff6c8 } as const;

/** 縁の明るい帯（リム）の幅（世界単位）。暗い細部はこれより内に置く（夜の海で輪郭が欠けない） */
export const ART_RIM_UNITS = 1.5;
/** 細部（砲塔・煙突・発射管・ハッチ）の最小の大きさ（世界単位。R17: k 1.09 で 2.2 px・見張りで 1.1 canvas px。これより細い物は描かない） */
export const ART_DETAIL_MIN_UNITS = 2;
/** これより幅の狭い艇（PT・Elco・T-38・T-14・H-38・大発）は側の暗い帯を描かない（R17。見張りで 1 px 未満になり船体を暗くするだけ） */
export const ART_SIDE_BAND_MIN_BEAM_UNITS = 10;
/** 細部の明暗は地の色から明るさ ± この割合まで（小艇）・暗い細部の面積は船体のこの割合まで */
export const ART_DETAIL_LIGHTNESS_MAX = 0.2;
export const ART_DARK_DETAIL_MAX_SHARE = 0.25;
/** tint される鍵（艇の 5 枚）の色の彩度の上限（掛け算の tint で薄い青・暗い灰にきれいに変わる） */
export const ART_TINTED_SATURATION_MAX = 0.12;

/** 艇の絵の乱れの乱数の種（絵だけ。ゲームの乱数の系列とは別＝引く回数を変えない。陰の EVAC_ART_SEED と同じ考え） */
export const ART_SEED_BOAT = 7001;

/** 小艇の中間の色（発射管・架台・銃座の台。地より暗く暗い細部より明るい。小艇は平均の明るさを placeholder の −10% に保つため暗い detail は面で使わない） */
export const PALETTE_PLAYER_MID = 0x8f99a3;
export const PALETTE_ENEMY_MID = 0xa66e6b;

/** 艇の絵の形の種類（S1。spec §4.1）。boatTextureKey の id → 形。表に無い id（遊べない任務の艇）は既定 */
export type BoatArtKind = 'elco80' | 'elco77' | 't38' | 't14' | 'h38';
export const BOAT_ART_KIND_BY_ID: Readonly<Record<string, BoatArtKind>> = { us_elco80: 'elco80', us_elco77: 'elco77', jp_t38: 't38', jp_t14: 't14', jp_h38_hayabusa: 'h38' };
export const BOAT_ART_DEFAULT_KIND: BoatArtKind = 'elco80';

/**
 * 艇の絵の置き方（位置はすべて長さの割合: 艇首 0・艇尾 1。幅は B の倍・半径は世界単位）。
 * hull: [割合, 半幅（B/2 の倍）] を艇首から艇尾へ（最初は艇首の先 [0, 0]・最後は艇尾＝四角い艇尾の半幅）。
 * cabin: [前, 後, 幅] 操舵室・船室（上部構造の色。前の縁に 2 単位の明るい風防の帯）。null は無し。
 * tubes: [前, 後, 中心の x] 魚雷の発射管・架台（幅 2 単位の筒。x は艇の中心から右舷が正・左舷に同じ物を写す）。
 * guns: [位置, 中心の x（B の倍。0 は中心線）, 半径] 丸い物（銃座・砲・爆雷の樽。半径 ≥ 1.5 なら中心に明るい点 半径 r−0.5）。
 * sternBoxes: [前, 後, 幅, 中心の x] 艇尾の矩形（煙幕の発生機）。
 */
export interface BoatArtLayout {
  readonly hull: readonly (readonly [number, number])[];
  readonly cabin: readonly [number, number, number] | null;
  readonly tubes: readonly (readonly [number, number, number])[];
  readonly guns: readonly (readonly [number, number, number])[];
  readonly sternBoxes: readonly (readonly [number, number, number, number])[];
}
/** 米PT の船形: 尖った艇首・最大幅は 55%・艇尾は幅 0.9B の四角（placeholder の輪郭（艇尾 0.84B・30% で最大幅）より覆いが少し増える） */
const HULL_PT: BoatArtLayout['hull'] = [[0, 0], [0.06, 0.28], [0.15, 0.62], [0.3, 0.88], [0.55, 1], [0.8, 0.98], [1, 0.9]];
/** 日本の小艇（乙型・隼艇）の船形: 同じく尖るが艇尾はやや狭い 0.88B */
const HULL_JP: BoatArtLayout['hull'] = [[0, 0], [0.07, 0.3], [0.18, 0.66], [0.35, 0.92], [0.55, 1], [0.8, 0.96], [1, 0.88]];
export const BOAT_ART_LAYOUTS: Readonly<Record<BoatArtKind, BoatArtLayout>> = {
  // Elco 80: 前甲板の 20 mm・操舵室と海図室 38〜52%・左右の連装 .50 の銃座 53%・発射管 4 本（前の組 28〜50%・後ろの組 56〜82%）・艇尾の 40 mm 86%・煙幕の発生機
  elco80: { hull: HULL_PT, cabin: [0.38, 0.52, 0.45], tubes: [[0.28, 0.5, 0.24], [0.56, 0.82, 0.3]], guns: [[0.12, 0, 1.4], [0.53, 0.28, 1.4], [0.53, -0.28, 1.4], [0.86, 0, 1.6]], sternBoxes: [[0.93, 0.975, 0.22, 0]] },
  // Elco 77（us_01 の自艇と僚艇）: 操舵室を前寄り 33〜47%・艇尾の 40 mm なし・発射管 4 本（28〜50%・57〜80%）・銃座 53%
  elco77: { hull: HULL_PT, cabin: [0.33, 0.47, 0.45], tubes: [[0.28, 0.5, 0.24], [0.57, 0.8, 0.3]], guns: [[0.53, 0.28, 1.4], [0.53, -0.28, 1.4]], sternBoxes: [[0.93, 0.975, 0.22, 0]] },
  // T-38（乙型。jp_03 の 18 隻も）: 短く低い船室 40〜55%・船室の上の 13 mm・艇尾の両舷の魚雷の架台 58〜90%・艇尾の爆雷の樽 2
  t38: { hull: HULL_JP, cabin: [0.4, 0.55, 0.5], tubes: [[0.58, 0.9, 0.21]], guns: [[0.475, 0, 1.2], [0.94, 0.18, 1], [0.94, -0.18, 1]], sternBoxes: [] },
  // T-14: 船室は後ろ寄り 48〜62%・魚雷 2 本 64〜90%
  t14: { hull: HULL_JP, cabin: [0.48, 0.62, 0.5], tubes: [[0.64, 0.9, 0.185]], guns: [[0.55, 0, 1.1]], sternBoxes: [] },
  // H-38 隼艇（jp_01 ハード。青の tint）: 魚雷なし・前と後ろの 25 mm の丸い銃座 22%・78%・中央の船室 40〜60%
  h38: { hull: HULL_JP, cabin: [0.4, 0.6, 0.5], tubes: [], guns: [[0.22, 0, 1.6], [0.78, 0, 1.6], [0.5, 0, 1]], sternBoxes: [] },
};
/** 中心線の明るい筋: 長さの 10〜95%・半幅は max(1 単位, この割合 × B)（枕の陰影。回転に依らない） */
export const BOAT_ART_CENTER_FROM = 0.1;
export const BOAT_ART_CENTER_TO = 0.95;
export const BOAT_ART_CENTER_HALF_W_OF_B = 0.08;
export const BOAT_ART_CENTER_ALPHA = 0.5;
/** 風防の帯の長さ（単位）と筒・箱の角の丸み（単位） */
export const BOAT_ART_SCREEN_UNITS = 2;
export const BOAT_ART_CORNER_UNITS = 0.8;
/** 艇首の先の内側の輪郭の下がり（リム幅の倍。尖った先は内側へ寄せるほど下がる） */
export const BOAT_ART_BOW_INSET_FACTOR = 1.8;
