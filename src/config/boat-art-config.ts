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
export const PALETTE_PLAYER: HullPalette = { deck: 0xe2e6ea, rim: 0xf4f6f8, side: 0xa7afb8, superstructure: 0xc9cfd6, detail: 0x5d6670, highlight: 0xffffff };
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
