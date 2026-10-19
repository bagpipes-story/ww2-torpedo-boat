// 夜明け（v0.6.1。docs/02 §6.7・§6.8）の見た目の定数: 海の明るさ・夜明けの帯・着弾点の輪・空襲の爆弾・爆撃進路の線。
// 何も import しない（ui/sea-light・systems/world-dawn がテストの node 型検査から読まれても game-config → screen-fit の DOM を引かない）。
// 機が現れるときに濃くなる秒（AIR_STRIKE_FADE_S）は姿勢を計算する core/air-strike-state にある（core は config を読まない）。

/** 夜の海の背景色（docs/02 §7。game-config が SEA_COLOR として出し直し、Phaser の backgroundColor に使う） */
export const SEA_COLOR = '#0b1020';
/** 昼の海の背景色（白い HUD の文字とのコントラスト約 7.8:1） */
export const DAY_SEA_COLOR = '#3b5670';
/** 海の明るさの段数（夜 0 → 昼 16。カメラの背景色を変えるのは段が変わったときだけ＝任務中に最大 16 回） */
export const SEA_LIGHT_STEPS = 16;
/** 夜明けの何秒前から明るくなり始めるか（前半 8 段。見える残り時間）、夜明けの後の何秒で昼の色になるか（後半 8 段） */
export const SEA_LIGHT_PRE_S = 20;
export const SEA_LIGHT_POST_S = 6;
/** 夜明けの帯（HUD 中央）を出す ms、終わりの何 ms で薄くするか、見出しの中央からの高さ px（論理座標。上へ負）、行の間 px */
export const DAWN_BANNER_MS = 4000;
export const DAWN_BANNER_FADE_MS = 800;
/**
 * -50: 見出し y 310〜362・説明 364〜423。上の縁の印（目標・帰投・敵機の矢印と距離。下端 y 約 297）の帯より下、スティック（上端約 436）より上。
 * -170 だと帯が上の縁の印と重なり、帰投の矢印と「敵機 N m」が夜明けの 4 秒読めなかった（v0.6.1 レビュー）。-60 より上へ戻さない
 */
export const DAWN_BANNER_OFFSET_Y = -50;
export const DAWN_BANNER_LINE_GAP = 10;
/** 着弾点の輪（爆弾の狙点。半径は自艇の命中の半径＝半幅 + 爆風）の色と濃さ。色は HUD の警告（HUD_COLOR_WARN）と同じ */
export const AIR_STRIKE_RING_TINT = 0xff8a7a;
export const AIR_STRIKE_RING_ALPHA = 0.9;
/**
 * 着弾点の輪の絵（v0.6.1。assets/impact-ring-placeholder が Boot で 1 回だけ作る。帰投地点の輪とは別）: 半径・線の太さ（単位 × RENDER_SCALE px）・塗りの濃さ。
 * 線は半径の 5/32 なので、命中の半径 約 28 m に伸ばすと約 4.4 m（ズーム 0.75 で論理 3.3 px、見張りの 0.5 で 2.2 px）。帰投地点の輪（128 に 4）を流用すると 1 px 未満だった
 */
export const AIR_STRIKE_RING_TEX_RADIUS_UNITS = 32;
export const AIR_STRIKE_RING_LINE_UNITS = 5;
export const AIR_STRIKE_RING_FILL_ALPHA = 0.12;
/**
 * 空襲の爆弾（爆発リングの絵。半径 40 m 相当 × 倍率）の投下時と着弾時の大きさの倍率。着弾時 0.55 で外周 約 23 m＝輪の線の内側（いちばん細い T-38 で約 25 m）に収まる。
 * 夜の水上機の爆弾（ui-config の BOMB_SCALE_FROM 0.6 → TO 1.4。外周 約 57 m）は変えない
 */
export const AIR_STRIKE_BOMB_SCALE_FROM = 0.25;
export const AIR_STRIKE_BOMB_SCALE_TO = 0.55;
/** 爆撃進路の線（進路の機 → 狙われた艇）の色・濃さ・太さ m */
export const AIR_STRIKE_RUN_LINE_TINT = 0xff8a7a;
export const AIR_STRIKE_RUN_LINE_ALPHA = 0.35;
export const AIR_STRIKE_RUN_LINE_WIDTH_M = 4;
