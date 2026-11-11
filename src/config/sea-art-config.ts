// v0.7.0（アートと音①：コードで描く絵）の海の面・夜明けの光・月のきらめき・岸の帯の定数（S3a の assets/sea-shape・sea-art と systems/sea-fx・world-art、S3c の coast-fx）。
// ゲームの強さの値ではないので data/*.json には置かない（evac-art-config と同じ考え）。海の色（SEA_COLOR・DAY_SEA_COLOR）と夜明けの 16 段は dawn-config・ui/sea-light のまま。何も import しない。

/** 海の格子の線（100 m ごと。entities/sea）を出すか（ユーザーの決め（v0.7.0 実機 1 回目の U2）「波があったとしても格子の線はあった方がいいです」＝残す。?debug&nogrid は比べる道具のまま） */
export const SEA_GRID_ON = true;
/**
 * 格子の線の色（IP1a。ui-config の SEA_GRID_COLOR 0x1a2540 は、海の面の夜の波頭（約 #20283a）に溶けた＝少し明るく青く。昼の海 #3b5670 より暗い＝昼は暗い線のまま）。
 * 格子は海の面の上（深さ DEPTH.sea 0 ＞ SEA_ART_DEPTH）
 */
export const SEA_GRID_LINE_COLOR = 0x26375c;

/** 海の模様のテクスチャの 1 m あたりの px（k に依らない固定。陰の 1.5 px/m の先例）と模様の周期（m。512 px の 2 の累乗＝REPEAT で貼れる） */
export const SEA_ART_PX_PER_M = 0.5;
export const SEA_TILE_PERIOD_M = 1024;
/** TileSprite の局所の大きさ（px。setScale で広げる＝その canvas と GPU の写しを小さく。R21） */
export const SEA_TILE_LOCAL_W = 128;
export const SEA_TILE_LOCAL_H = 64;

/**
 * 光（data の moon: dark・half・full・day）ごとの海の面の色と α（spec-v0700 §3.2。IP1a で描き直し）: 海の面のテクスチャは白と黒の α で描き、TileSprite の tint × α で色を付ける。
 * crest は tint（白寄り。背景の上に α で重なる。tint を暗い色にすると夜の海に溶けて見えない）。夜は α ≤ SEA_NIGHT_ALPHA_MAX（艇・雷跡・字が読める）、昼は明るく青く（U2・U3）。
 * 夜明けは段（0〜16）で day の値へ線形に（段が変わった時だけ書く）。
 * glints は筋の数（月のきらめき。dark は 0。day は白波＝whitecaps が true なら同じプールを白い泡の色・α にする）。IP1a で U3「もっと派手な演出、数でも大丈夫」から倍に
 */
export interface SeaLightArt {
  readonly crest: number;
  readonly crestAlpha: number;
  readonly glints: number;
  readonly whitecaps: boolean;
}
export const SEA_LIGHT_ART: Readonly<Record<'dark' | 'half' | 'full' | 'day', SeaLightArt>> = {
  dark: { crest: 0x90b0d8, crestAlpha: 0.2, glints: 0, whitecaps: false },
  half: { crest: 0xb8ccec, crestAlpha: 0.26, glints: 24, whitecaps: false },
  full: { crest: 0xb8ccec, crestAlpha: 0.28, glints: 32, whitecaps: false },
  day: { crest: 0xb0d8ff, crestAlpha: 0.42, glints: 24, whitecaps: true },
};
/** 夜の海の面の α の上限（S3a は spec §3.2「夜は α ≤ 0.12」＝散らした弧の値。IP1a の面は画素の α が平均 約 0.3 なので層の α を上げた。tests/sea-art が画面の明るさで確かめる） */
export const SEA_NIGHT_ALPHA_MAX = 0.3;

/** 波の帯（波長 m・数・波の進む向きからの広がり 度・振幅 ∝ (波長/上限)^ampPow） */
export interface SeaBandArt {
  readonly count: number;
  readonly lamM: readonly [number, number];
  readonly spreadDeg: number;
  readonly ampPow: number;
}
/**
 * 海の面のテクスチャ（tex-sea-tile。512 px の正方形＝0.5 px/m × 1,024 m。IP1a でユーザーの U2「波の模様が波に見えずにゴミのように見えます」から描き直し）:
 * 周期の縁で合う正弦の和（assets/sea-shape の seaTilePixels）。dirDeg＝波の進む向き（画面の x から時計回り。波頭の筋は −12° 前後＝S3a の向き）、
 * swell＝長いうねり（96〜256 m）・chop＝波（24〜64 m）・ripple＝さざ波（10〜20 m）・warp＝座標のゆがみ（山 1〜2 つ・warpM m ずらす＝筋がまっすぐにならない）、
 * swellGain・chopGain＝正規化した和の強さ（和は ±1 にほぼ届かないので 1 より大きく）、mix＝明暗に混ぜる割合（うねり・波・さざ波）、crestBend＝うねりの山を尖らせる割合（0＝そのまま・1＝2 乗）、
 * foam＝泡が出始めて満ちる高さ（smoothstep）、画素の α: base＝一面の下地・light＝山・dark＝谷（黒）・foamAlpha＝泡（白）。表示は SEA_LIGHT_ART の tint × α
 */
export interface SeaTexArt {
  readonly dirDeg: number;
  readonly swell: SeaBandArt;
  readonly chop: SeaBandArt;
  readonly ripple: SeaBandArt;
  readonly warp: SeaBandArt;
  readonly warpM: number;
  readonly swellGain: number;
  readonly chopGain: number;
  readonly chopOnSwell: number;
  readonly mix: readonly [number, number, number];
  readonly crestBend: number;
  readonly foam: readonly [number, number];
  readonly base: number;
  readonly band: number;
  readonly light: number;
  readonly dark: number;
  readonly foamAlpha: number;
}
export const SEA_TEX: SeaTexArt = {
  dirDeg: 78,
  swell: { count: 6, lamM: [96, 256], spreadDeg: 20, ampPow: 1 },
  chop: { count: 12, lamM: [24, 64], spreadDeg: 28, ampPow: 0.8 },
  ripple: { count: 10, lamM: [10, 20], spreadDeg: 50, ampPow: 0.5 },
  warp: { count: 3, lamM: [512, 1024], spreadDeg: 90, ampPow: 0 },
  warpM: 56,
  swellGain: 1.3,
  chopGain: 1.8,
  chopOnSwell: 0.4,
  mix: [0.25, 0.55, 0.2],
  crestBend: 0.5,
  foam: [0.6, 0.95],
  base: 0.1,
  band: 0.3,
  light: 0.5,
  dark: 0.3,
  foamAlpha: 0.3,
};
/** 波の流れ（m/秒。波の進む向き SEA_TEX.dirDeg へ。tilePosition を毎フレーム＝WebGL では描き直さない。きらめきも一緒に流す） */
export const SEA_DRIFT_MPS = 1.6;
/** 海の TileSprite が camera.worldView の外へ持つ余白 m（1 周期。升が変わるのは縁が周期の線を越えた時だけ＝全速でも数秒に 1 回。R5） */
export const SEA_VIEW_MARGIN_M = 1024;
/** Phaser.WEBGL（CONST.WEBGL ＝ 2）。sea-fx が phaser の値の import を避けて renderer.type と比べる（Canvas レンダラーでは海の模様を出さない。spec §5.1） */
export const RENDERER_WEBGL = 2;

/**
 * 夜明けの光（東＝画面の右端の橙。α ＝ 最大 × sin(π × 段/16)＝夜 0・移り変わりの中ほどで最大・昼 0。昼から始まる任務は 0。R3・R4）。テクスチャの px と画面からはみ出す割合。
 * 画面の右端から幅の DAWN_GLOW_SCREEN_SHARE だけの帯（テクスチャは左端 透明 → 右端 橙）。全面に広げると全面の層 1 枚の塗り（ヘッドレスの SwiftShader で約 +20 ms＝us_01 の夜明けの窓で p95 ×1.30）
 */
export const DAWN_GLOW_SCREEN_SHARE = 0.22;
export const DAWN_GLOW_COLOR = 0xff9a4a;
export const DAWN_GLOW_ALPHA_MAX = 0.22;
export const DAWN_GLOW_TEX_W = 256;
export const DAWN_GLOW_TEX_H = 64;
export const DAWN_GLOW_OVERSCAN = 0.03;

/**
 * 月のきらめき（R9: 砲口炎の星と見分ける＝横に細長い筋・冷たい青白・α ≤ 0.3・ゆっくりした明滅（周期 ≥ 2 秒・振れ幅は α の 0.5 倍まで））。
 * tex-glint 16 × 8 px を世界の GLINT_W_M × GLINT_H_M m で置く。明滅の周期は [MIN, MIN × 2) 秒・位相は絵だけの乱数（ART_SEED_GLINT）。
 * 画面（worldView ＋ GLINT_W_M）の外へ出たら反対側へ置き直す（置き直しの横ずれは乱数）。昼（whitecaps）は同じプールを白波の色と α で
 */
export const GLINT_COLOR = 0xcfe4ff;
export const GLINT_ALPHA_MAX = 0.3;
export const GLINT_TEX_W = 16;
export const GLINT_TEX_H = 8;
export const GLINT_W_M = 20;
export const GLINT_H_M = 5;
export const GLINT_PERIOD_MIN_S = 2;
/** IP1a: 輪の置き方の列の数（画面を cols × rows の升に分けて 1 升に 1 つ）・置く時に升の内で比べる候補の数（波頭の高い所を選ぶ）・筋の向きの乱れ 度・大きさの倍率の帯 */
export const GLINT_COLS = 6;
export const GLINT_TRIES = 6;
export const GLINT_ANGLE_JITTER_DEG = 10;
export const GLINT_SIZE_RANGE: readonly [number, number] = [0.6, 1.3];
export const GLINT_SWING_MAX = 0.5;
export const WHITECAP_COLOR = 0xf4f8fb;
/** 昼の白波の筋の大きさ m（IP1a。月のきらめきの 20 × 5 m では白い点に見えた＝波頭に沿って長く） */
export const WHITECAP_W_M = 34;
export const WHITECAP_H_M = 6;
export const WHITECAP_ALPHA_MAX = 0.32;

/** 岸の帯（S3c。砂浜・寄せ波・陸の際の木々）: 1 m あたりの px・1 枚の長さ m・陸の側の幅 m・海の側の寄せ波の幅 m・陸の端（−陸の幅・幅＋陸の幅）で透明へ落とす幅 m（R24。S4 から jp_03 も帯を切らない） */
export const COAST_ART_PX_PER_M = 1.0;
export const COAST_STRIP_LEN_M = 512;
export const COAST_STRIP_LAND_M = 112;
export const COAST_STRIP_SEA_M = 8;
export const COAST_STRIP_FADE_M = 16;
/** 岸の帯の中身（px＝m）: 砂浜の幅の平均と揺れ（周期で続く）・樹冠の数と半径・色（夜の陸 0x26301e・浜の線 0x8a7a48 と同じ系統。浜の線より明るくしない）・寄せ波の白の α と太さ */
export const COAST_SAND_M = 18;
export const COAST_SAND_WAVE_M = 6;
export const COAST_CROWNS = 240;
export const COAST_CROWN_R_M: readonly [number, number] = [5, 10];
export const COAST_WET_SAND_COLOR = 0x5e5434;
export const COAST_SAND_COLOR = 0x7e7044;
export const COAST_DRY_SAND_COLOR = 0x8a7a4a;
export const COAST_EDGE_SHADE_COLOR = 0x1c2416;
export const COAST_CROWN_COLORS: readonly number[] = [0x2b3a21, 0x324428, 0x3a4c2c];
export const COAST_CROWN_LIGHT_COLOR = 0x41542f;
export const COAST_SURF_ALPHA = 0.6;
export const COAST_SURF_PX = 2.5;

/** 深さ（game-config の DEPTH は変えない。ここに絶対値で）: 海の面（IP1a で格子の線 DEPTH.sea 0 の下へ）・夜明けの光（格子の上＝陸・艇・艦・字の下。R3）・月のきらめき・岸の帯 */
export const SEA_ART_DEPTH = -0.1;
export const DAWN_GLOW_DEPTH = 0.1;
export const GLINT_DEPTH = 0.2;
export const COAST_STRIP_DEPTH = 1.2;
/** jp_03 の陰の絵の陸の側（岸の線から海へ COAST_STRIP_SEA_M まで）の深さ（S4）: 岸の帯 1.2 の上・上陸地点の帯と壕の岩の絵 1.5 の下＝帯が崖と岩の下を通る。海の側は今の 1（輪・爆撃進路の線の下）のまま */
export const EVAC_COVER_LAND_DEPTH = 1.25;

/** 海の絵の乱れの乱数の種（絵だけ。ゲームの乱数とは別。毎フレーム使うきらめきの置き直しは世界の絵を作る時に new SeededRng(ART_SEED_GLINT)＝R30） */
export const ART_SEED_SEA = 7401;
export const ART_SEED_GLINT = 7402;
export const ART_SEED_COAST = 7403;
