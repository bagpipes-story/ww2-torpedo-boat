// v0.7.0（アートと音①：コードで描く絵）の海の面・夜明けの光・月のきらめき・岸の帯の定数（S3a の assets/sea-shape・sea-art と systems/sea-fx・world-art、S3c の coast-fx）。
// ゲームの強さの値ではないので data/*.json には置かない（evac-art-config と同じ考え）。海の色（SEA_COLOR・DAY_SEA_COLOR）と夜明けの 16 段は dawn-config・ui/sea-light のまま。何も import しない。

/** 海の格子の線（100 m ごと。entities/sea）を出すか（R6・決め D5: 既定は残す。消すのはユーザー未確認。?debug&title&nogrid で比べ、実機テストで聞いて次の版で決める） */
export const SEA_GRID_ON = true;

/** 海の模様のテクスチャの 1 m あたりの px（k に依らない固定。陰の 1.5 px/m の先例）と模様の周期（m。512 px の 2 の累乗＝REPEAT で貼れる） */
export const SEA_ART_PX_PER_M = 0.5;
export const SEA_TILE_PERIOD_M = 1024;
/** TileSprite の局所の大きさ（px。setScale で広げる＝その canvas と GPU の写しを小さく。R21） */
export const SEA_TILE_LOCAL_W = 128;
export const SEA_TILE_LOCAL_H = 64;

/**
 * 光（data の moon: dark・half・full・day）ごとの海の模様の色と α（spec-v0700 §3.2。S3a）: 模様のテクスチャは白で描き、TileSprite の tint × α で色を付ける。
 * crest は tint（白寄り。背景の上に α で重なった結果が spec の「#1c2a46 相当」「#2a3c60 相当」「#8fb0c8 相当」になる＝tint を暗い色にすると夜の海に溶けて見えない）。
 * 夜は α ≤ 0.12（格子の線 0x1a2540 と同じくらいの薄さ）。夜明けは段（0〜16）で day の値へ線形に（段が変わった時だけ書く）。
 * glints は筋の数（月のきらめき。dark は 0。day は白波＝whitecaps が true なら同じプールを白い泡の色・α にする＝全面の層を足さずに「疎らな白波」を出す）
 */
export interface SeaLightArt {
  readonly crest: number;
  readonly crestAlpha: number;
  readonly glints: number;
  readonly whitecaps: boolean;
}
export const SEA_LIGHT_ART: Readonly<Record<'dark' | 'half' | 'full' | 'day', SeaLightArt>> = {
  dark: { crest: 0x9fb4d8, crestAlpha: 0.1, glints: 0, whitecaps: false },
  half: { crest: 0xb8ccec, crestAlpha: 0.12, glints: 12, whitecaps: false },
  full: { crest: 0xb8ccec, crestAlpha: 0.12, glints: 16, whitecaps: false },
  day: { crest: 0xdce9f2, crestAlpha: 0.16, glints: 16, whitecaps: true },
};
/** 夜の模様の α の上限（spec §3.2「夜は α ≤ 0.12」。tests/sea-art） */
export const SEA_NIGHT_ALPHA_MAX = 0.12;

/**
 * 海の模様のテクスチャ（tex-sea-tile。SEA_TILE_PERIOD_M × SEA_ART_PX_PER_M ＝ 512 px の正方形。絵だけの乱数 ART_SEED_SEA・周期の縁で折り返す）の中身:
 * 波頭の短い弧（本数・長さ px・向き＝波の来る向き −12° に ±28° の乱れ・たわみ＝長さの割合・太い下塗り 4 px α 0.32 と芯 2 px α 0.8＝細部は 2 px 以上 R17）、
 * 疎らな白波（短く太い点描。弧の上に。昼の α で見える）、ごく薄いうねり（大きな丸の濃淡）。点を一直線に並べた形は描かない（雷跡と紛れない。R7）
 */
export const SEA_CREST_COUNT = 150;
export const SEA_CREST_LEN_PX: readonly [number, number] = [16, 44];
/** 弧は波の列に沿って置く（一様な網目にしない）: 列の数（タイルの高さを等分）・列のうねり（振幅 px・タイル 1 辺あたりの山の数＝整数で周期に合う）・列からの散らばり px */
export const SEA_CREST_ROWS = 12;
export const SEA_ROW_WAVE_PX = 14;
export const SEA_ROW_WAVES_PER_TILE = 2;
export const SEA_ROW_SCATTER_PX = 16;
export const SEA_CREST_BASE_DEG = -12;
export const SEA_CREST_JITTER_DEG = 28;
export const SEA_CREST_SAG: readonly [number, number] = [0.08, 0.18];
export const SEA_CREST_WIDE_PX = 4;
export const SEA_CREST_WIDE_ALPHA = 0.25;
export const SEA_CREST_CORE_PX = 2;
export const SEA_CREST_CORE_ALPHA = 0.7;
export const SEA_CAP_COUNT = 20;
export const SEA_CAP_LEN_PX: readonly [number, number] = [5, 9];
export const SEA_CAP_PX = 3;
export const SEA_CAP_ALPHA = 1;
export const SEA_SWELL_COUNT = 10;
export const SEA_SWELL_R_PX: readonly [number, number] = [60, 130];
export const SEA_SWELL_ALPHA = 0.1;
/**
 * 海の模様の出し方（S3a の計測で決めた。spec §5.1）: 'patches'＝波頭の群れの小さな Image を SEA_PATCH_COUNT 個、カメラの周りの世界の座標に置き回す（第 2 案。既定）。
 * 'tile'＝世界の座標の TileSprite 1 枚（第 1 案）。ヘッドレス（SwiftShader＝CPU のラスタ）では全面の層 1 枚が jp_03 ハードの第 4 波で p95 ×1.27（門 ≤ 1.15）だったので既定にしない。
 * iPhone の GPU では全面の層 1 枚は軽い（spec §5.7）ので、実機で見比べたければここを 'tile' にして試す（ほかは同じ・遊びは変わらない）
 */
export const SEA_LAYER_MODE: 'patches' | 'tile' = 'patches';
/** 波頭の群れ（patches）: 個数・1 枚の px（0.5 px/m ＝ 320 × 96 m）・絵の種類（同じ鍵の frame p0〜）・1 枚の弧の数・縁へ向けて薄くする幅 px（矩形の縁を見せない）・列のうねり px・散らし px */
export const SEA_PATCH_COUNT = 12;
/** 輪の置き方の列の数（画面を cols × rows の升に分けて 1 升に 1 つ＝偏らない。置き直しても同じ行・列の帯の内に戻す） */
export const SEA_PATCH_COLS = 4;
export const GLINT_COLS = 4;
export const SEA_PATCH_W_PX = 160;
export const SEA_PATCH_H_PX = 48;
export const SEA_PATCH_FRAMES = 3;
export const SEA_PATCH_ARCS = 12;
export const SEA_PATCH_EDGE_FADE_PX = 12;
export const SEA_PATCH_WAVE_PX = 7;
export const SEA_PATCH_SCATTER_PX = 5;
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
export const GLINT_W_M = 14;
export const GLINT_H_M = 6;
export const GLINT_PERIOD_MIN_S = 2;
export const GLINT_SWING_MAX = 0.5;
export const WHITECAP_COLOR = 0xf4f8fb;
export const WHITECAP_ALPHA_MAX = 0.4;

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

/** 深さ（game-config の DEPTH は変えない。ここに絶対値で）: 海の模様・夜明けの光（海の模様の直上＝陸・艇・艦・字の下。R3）・月のきらめき・岸の帯 */
export const SEA_ART_DEPTH = 0.05;
export const DAWN_GLOW_DEPTH = 0.1;
export const GLINT_DEPTH = 0.2;
export const COAST_STRIP_DEPTH = 1.2;
/** jp_03 の陰の絵の陸の側（岸の線から海へ COAST_STRIP_SEA_M まで）の深さ（S4）: 岸の帯 1.2 の上・上陸地点の帯と壕の岩の絵 1.5 の下＝帯が崖と岩の下を通る。海の側は今の 1（輪・爆撃進路の線の下）のまま */
export const EVAC_COVER_LAND_DEPTH = 1.25;

/** 海の絵の乱れの乱数の種（絵だけ。ゲームの乱数とは別。毎フレーム使うきらめきの置き直しは世界の絵を作る時に new SeededRng(ART_SEED_GLINT)＝R30） */
export const ART_SEED_SEA = 7401;
export const ART_SEED_GLINT = 7402;
export const ART_SEED_COAST = 7403;
