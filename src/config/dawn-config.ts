// 夜明け（v0.6.1。docs/02 §6.7・§6.8）の見た目の定数: 海の明るさ・夜明けの帯・着弾点の輪・爆撃進路の線。
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
export const DAWN_BANNER_OFFSET_Y = -170;
export const DAWN_BANNER_LINE_GAP = 10;
/** 着弾点の輪（爆弾の狙点。半径は自艇の命中の半径＝半幅 + 爆風）の色と濃さ。色は HUD の警告（HUD_COLOR_WARN）と同じ */
export const AIR_STRIKE_RING_TINT = 0xff8a7a;
export const AIR_STRIKE_RING_ALPHA = 0.9;
/** 爆撃進路の線（進路の機 → 狙われた艇）の色・濃さ・太さ m */
export const AIR_STRIKE_RUN_LINE_TINT = 0xff8a7a;
export const AIR_STRIKE_RUN_LINE_ALPHA = 0.35;
export const AIR_STRIKE_RUN_LINE_WIDTH_M = 4;
