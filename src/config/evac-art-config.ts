// 空襲下の退避（v0.6.11 IP2 の U11。jp_03）の陰と壕の岩の絵の定数（assets/evac-terrain-art が起動後に 1 回だけテクスチャに描く）。ゲームの強さの値ではないので data/*.json には置かない
// （evac-config と同じ考え）。位置は隠れ場所の点（data の evac.shelters）からの相対 m。何も import しない。
// U11（ユーザー「屋我地の陰の方も視覚的に何がなんだかよくわからないので岩などを描画したりしてビジュアルのクオリティを上げてください」）。

/** テクスチャの 1 m あたりの px（既定のズーム 0.75 × RENDER_SCALE 2 ＝ 画面の 1.5 px/m に合わせる） */
export const EVAC_ART_PX_PER_M = 1.5;
/** 岩の絵の乱れの乱数の種（絵だけ。ゲームの乱数とは別） */
export const EVAC_ART_SEED = 1945;

/** 岩の色: 影・暗い面・中の面・明るい上の縁・割れ目 */
export const ROCK_SHADOW = 0x05080b;
export const ROCK_DARK = 0x3a342d;
export const ROCK_MID = 0x564c40;
export const ROCK_LIGHT = 0x8e8169;
export const ROCK_CRACK = 0x231f1b;
/** 緑（崖の上の木々）: 暗い・中・明るい */
export const TREE_DARK = 0x1d3317;
export const TREE_MID = 0x2c4a20;
export const TREE_LIGHT = 0x4b7232;
/** 岩に当たる波の白 */
export const FOAM_COLOR = 0xdfe9ee;
export const FOAM_ALPHA = 0.6;

/**
 * 陰「屋我地の陰（東）」の絵（北の岸 y 0 の際。陰の点の x から左右 COVER_ART_HALF_W_M、陸へ COVER_ART_LAND_M、海は陰の点から COVER_ART_SEA_M まで）。
 * 張り出した崖（岸から海へ COVER_LIP_M・左右の腕は COVER_ARM_M まで出る＝入り江）、その下の海に暗い陰（3 重の半楕円。陰の点の周りが一番暗い）、
 * 入り江の口の外の岩（陰の点からの dx, dy, 半径 m。輪の半径 70 m と入る道＝南から・輪の下の札の帯（dy 70〜100）の外）、崖の上の木々、岸の岩の並び（左右 COVER_ART_HALF_W_M まで小さくなる）
 */
export const COVER_ART_HALF_W_M = 460;
export const COVER_ART_LAND_M = 190;
export const COVER_ART_SEA_M = 140;
export const COVER_CLIFF_HALF_W_M = 235;
export const COVER_CLIFF_TOP_M = 70;
export const COVER_LIP_M = 26;
export const COVER_ARM_M = 92;
export const COVER_ARM_INNER_DX_M = 140;
/** 陰の半楕円（中心は岸の線の陰の点の x）: 幅の半分・海への深さ m・濃さ（外から内へ） */
export const COVER_SHADE: readonly (readonly [number, number, number])[] = [
  [260, 240, 0.1],
  [225, 220, 0.1],
  [190, 200, 0.12],
  [155, 182, 0.12],
  [120, 165, 0.12],
];
export const COVER_SHADE_COLOR = 0x03070c;
/** 入り江の口の外の岩（陰の点から dx, dy, 半径 m） */
export const COVER_BOULDERS: readonly (readonly [number, number, number])[] = [
  [-168, -18, 19], [-200, 10, 13], [-140, 26, 10], [-118, 46, 9], [-152, 54, 8], [-232, -30, 10], [-245, 30, 8],
  [160, -26, 20], [194, 4, 14], [134, 18, 10], [122, 44, 8], [214, -40, 11], [160, 60, 8], [250, 26, 8],
];
/** 崖の上の木々の塊（陰の点の x から dx、岸の線から陸へ dy m、半径 m） */
export const COVER_TREES: readonly (readonly [number, number, number])[] = [
  [-200, 95, 26], [-150, 120, 30], [-90, 100, 24], [-40, 130, 30], [20, 105, 26], [75, 128, 28], [130, 98, 24], [185, 122, 30], [230, 92, 22],
  [-120, 165, 26], [-20, 172, 24], [90, 168, 26], [200, 160, 22], [-250, 140, 20], [270, 135, 18],
];
/** 岸の岩の並び（崖の外。左右へ間隔 m・大きさは崖の際で最大・端で最小） */
export const SHORE_ROCK_STEP_M = 22;
export const SHORE_ROCK_MAX_M = 13;
export const SHORE_ROCK_MIN_M = 4;

/**
 * 壕の口の周りの岩と木（南の岸の陸。口の中心からの相対 m。斜路とレールと暗い口は systems/evac-terrain の slip が上に描く）:
 * 岩の縁は楕円（半径 CAVE_RIM_RX_M・CAVE_RIM_RY_M）に並べた岩の塊、脇の岩（dx, dy, 半径）、木々（dx, dy, 半径。口の真下は % の札のため空ける）
 */
export const CAVE_ART_HALF_W_M = 150;
export const CAVE_ART_UP_M = 70;
export const CAVE_ART_DOWN_M = 130;
export const CAVE_RIM_RX_M = 52;
export const CAVE_RIM_RY_M = 42;
export const CAVE_RIM_CHUNKS = 11;
export const CAVE_RIM_CHUNK_M = 17;
export const CAVE_SIDE_ROCKS: readonly (readonly [number, number, number])[] = [
  [-78, -12, 12], [-96, 14, 8], [80, -8, 11], [100, 18, 7],
];
export const CAVE_TREES: readonly (readonly [number, number, number])[] = [
  [-104, 50, 22], [-128, 22, 16], [-92, 96, 22], [106, 48, 22], [130, 18, 15], [96, 98, 22], [-132, 84, 16], [134, 82, 16],
];

/** 陰に隠れている艇の絵の色（evac-config の EVAC_HIDDEN_ALPHA と合わせて「陰の下」に見せる。見つかればふつうの色） */
export const EVAC_HIDDEN_TINT = 0x8796a8;
