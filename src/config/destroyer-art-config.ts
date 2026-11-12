// v0.7.0 IP2（実機 2 回目の直し。ユーザーの U8「相対的に駆逐艦のグラフィックがしょぼい感じになってしまったので、駆逐艦のグラフィックを見直してクオリティを上げてください。
// でも、色は現在と同じ単系統のままで表現してください。」）: 駆逐艦 3 種（陽炎型・フレッチャー級・睦月型）の描き直しの細部の定数（assets/destroyer-plan・destroyer-paint）。
// 位置の骨組み（船体の輪郭・艦橋・煙突・砲・発射管・機銃の台・マスト）は ship-art-config の SHIP_ART_LAYOUTS のまま（当たりの形 R22・形の見分け・tests/ship-art）。ここは描き方と足す細部だけ。
// 色は陣営のパレットの地の色 1 つから、明るさだけを変えて作る（暗くは RGB に掛ける・明るくは白へ混ぜる＝色相は変わらない。新しい色相は使わない）。
// ゲームの強さの値ではないので data/*.json には置かない。何も import しない。

/** 砲の描き方: 連装の砲塔（陽炎型 12.7 cm）・単装の密閉の砲塔（フレッチャー級 5 インチ）・単装の盾つきの砲（睦月型 12 cm） */
export type DestroyerGunStyle = 'twin' | 'single5' | 'single12';
/** 艦橋の描き方: 日本の段の艦橋（測距儀の腕）・米の丸い前面の艦橋（Mk37 の方位盤）・睦月型の小さな艦橋 */
export type DestroyerBridgeStyle = 'ijn' | 'usn' | 'ijnSmall';

/**
 * 1 種の細部: 砲と艦橋の描き方、発射管の数・長さ（L の割合）・前の盾、短艇 [位置, 中心の x（B 倍）]、甲板の小物（弾薬箱・通風筒）[位置, x（B 倍）]、
 * 艦尾の爆雷の軌条の有無、マストの桁の半分の長さ（B 倍）、甲板の板の継ぎ目の間隔（単位。陽炎型・睦月型はリノリウムの押さえ金、フレッチャー級は鋼の甲板の継ぎ目）
 */
export interface DestroyerDetail {
  readonly gun: DestroyerGunStyle;
  readonly bridge: DestroyerBridgeStyle;
  readonly tubeN: number;
  readonly tubeLen: number;
  readonly tubeShield: boolean;
  readonly boats: readonly (readonly [number, number])[];
  readonly lockers: readonly (readonly [number, number])[];
  readonly dcRacks: boolean;
  readonly yardHalfB: number;
  readonly panelUnits: number;
}
export const DESTROYER_DETAILS: Readonly<Record<'kagero' | 'fletcher' | 'mutsuki', DestroyerDetail>> = {
  kagero: {
    gun: 'twin', bridge: 'ijn', tubeN: 4, tubeLen: 0.06, tubeShield: true,
    boats: [[0.5, 0.36], [0.5, -0.36]], lockers: [[0.2, 0.32], [0.2, -0.32], [0.66, 0.34], [0.66, -0.34], [0.93, 0.22], [0.93, -0.22]],
    dcRacks: true, yardHalfB: 0.36, panelUnits: 5,
  },
  fletcher: {
    gun: 'single5', bridge: 'usn', tubeN: 5, tubeLen: 0.05, tubeShield: false,
    boats: [[0.44, 0.36], [0.44, -0.36]], lockers: [[0.3, 0.34], [0.3, -0.34], [0.76, 0.34], [0.76, -0.34], [0.15, 0.3], [0.15, -0.3]],
    dcRacks: true, yardHalfB: 0.38, panelUnits: 8,
  },
  mutsuki: {
    gun: 'single12', bridge: 'ijnSmall', tubeN: 3, tubeLen: 0.055, tubeShield: false,
    boats: [[0.39, 0.33], [0.39, -0.33]], lockers: [[0.64, 0.33], [0.64, -0.33], [0.8, 0.3], [0.8, -0.3]],
    dcRacks: false, yardHalfB: 0.34, panelUnits: 5,
  },
};

/** 短艇の大きさ（単位）: 長さ・幅。甲板の小物の大きさ（単位） */
export const DESTROYER_BOAT_LEN_UNITS = 7.5;
export const DESTROYER_BOAT_W_UNITS = 2.6;
export const DESTROYER_LOCKER_UNITS: readonly [number, number] = [2.2, 2];
/** 砲: 連装の砲塔の長さ（L の割合）、砲身の長さ（L の割合）と太さ（単位）、連装の砲身の間隔（中心から・単位） */
export const DESTROYER_TWIN_LEN = 0.045;
export const DESTROYER_BARREL_LEN = 0.032;
export const DESTROYER_BARREL_UNITS = 1.3;
/** 睦月型の 12 cm の砲身は短い（陽炎型・フレッチャー級の砲身に対する割合） */
export const DESTROYER_SHORT_BARREL_SHARE = 0.8;
export const DESTROYER_TWIN_DX = 2.3;
/** 陰（高い物が甲板に落とす影。右舷・艦尾へずらす。艦が回ると一緒に回る）: ずれ（単位）と濃さ */
export const DESTROYER_SHADOW_DX = 1.3;
export const DESTROYER_SHADOW_DY = 1.7;
export const DESTROYER_SHADOW_ALPHA = 0.42;
/** 船体の縁: 外の喫水の暗い縁と、その内の舷の明るい帯（単位） */
export const DESTROYER_WATERLINE_UNITS = 0.9;
export const DESTROYER_SHEER_UNITS = 1.0;
/** 船首楼の段の影の帯（単位）と、艦首の舷の明るい線の長さ（L の割合） */
export const DESTROYER_STEP_SHADOW_UNITS = 2.2;
export const DESTROYER_BOW_FLARE_TO = 0.15;
/**
 * 明るさ（地の色 1 に対して。< 1 は RGB に掛ける・> 1 は 1 を超えた分だけ白へ混ぜる）: 喫水の縁・舷の帯（左・中・右）・甲板（左の縁・中央・右の縁）・陰・暗い細部（砲身・煙突の口）・
 * 上部構造（1 段目・2 段目・屋根）・砲塔（明るい側・暗い側）・短艇・窓・継ぎ目の線の濃さ
 */
export const DESTROYER_TONES = {
  waterline: 0.45,
  sheerLeft: 1.36,
  sheerMid: 1.16,
  sheerRight: 0.9,
  deckLeft: 1.06,
  deckMid: 1.09,
  deckRight: 0.9,
  shadow: 0.36,
  dark: 0.34,
  funnel: 0.7,
  soot: 0.2,
  super1: 1.18,
  super2: 1.34,
  roof: 1.5,
  turretLight: 1.48,
  turretDark: 0.95,
  boat: 1.56,
  window: 0.32,
  panelAlpha: 0.12,
} as const;
