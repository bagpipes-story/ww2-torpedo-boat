// Title の任務の行の置き方（論理 px。高さ 720・幅 1280〜1584）。v0.6.7 で menu-config から移し（値は同じ）、日本のタブの 2 列の格子の値を足した（spec-v067 §D.6）。menu-config が出し直す。
// 何も import しない（ui/title-grid と tests/title-grid が node の型検査で読んでも game-config → screen-fit の DOM を引かない。title-hint-config と同じ）。

/** 1 列の行（米PT の 3 任務。v0.6.0 でタブを入れた分、行 104 → 96 px・間 16 → 12。3 行で 216〜528）。x は論理幅に関わらず 160（v0.6.6 までと同じ） */
export const TITLE_ROW_X = 160;
export const TITLE_ROW_W = 960;
export const TITLE_ROW_H = 96;
export const TITLE_ROW_TOP = 216;
export const TITLE_ROW_GAP = 12;
export const TITLE_ROW_TITLE_PX = 30;
export const TITLE_ROW_SUB_PX = 20;
export const TITLE_ROW_STATUS_PX = 24;
/** 操作の一言の y（行の下。3 段の格子の下端 528 より下） */
export const TITLE_HINT_Y = 560;
/** 下の 3 つの切り替え（難易度・史実モード・マーカー）の間。格子の列の間も同じ */
export const TITLE_TOGGLE_GAP = 24;
/**
 * v0.6.7: タブの行がこの数以上なら 2 列の格子（日本ハードモードの 4 任務）。未満（米PT の 3 行）は 1 列のまま。
 * 格子は 3 段（6 任務）まで（4 段目は操作の一言にかかる。米PT の 7 任務が並ぶ版で見直す）
 */
export const TITLE_GRID_FROM = 4;
export const TITLE_GRID_ROWS_MAX = 3;
/** 格子の列の幅: 2 × 597 + 24 = 1,218（下の 3 つの切り替え 3 × 390 + 2 × 24 と同じ幅・同じ中心。論理幅 1280 でも左右に 31 px 余る）。597 × 96 px ≈ 326 × 52 pt（iPhone 15 横） */
export const TITLE_GRID_COL_W = 597;
