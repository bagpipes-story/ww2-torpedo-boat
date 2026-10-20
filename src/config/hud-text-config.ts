// HUD の文の色と距離の刻み（v0.6.1 で ui-config から移した。値は同じ。ui-config が出し直す）。
// 何も import しない（ui/hud-lines・ui/dawn-lines がテストの node 型検査から読まれても game-config → screen-fit の DOM を引かない）。

export const HUD_COLOR_STRONG = '#e6eef7';
export const HUD_COLOR_WARN = '#ff8a7a';
/** 味方＝薄い青（docs/02 §7）の文字色。帰投地点・識別完了 */
export const HOME_COLOR_TEXT = '#8fc8ff';
/** 帰投地点までの距離の表示刻み m */
export const HOME_MARKER_DISTANCE_STEP_M = 100;
/** 浅瀬の警告の距離の刻み m */
export const SHALLOW_WARN_STEP_M = 50;
/** 敵機（夜の水上機・夜明けの空襲）までの距離の刻み m */
export const PLANE_DISTANCE_STEP_M = 100;
/**
 * 左上 2 段目（FPS の下）の夜明けの時計（v0.6.2 実機 1 回目「別のメッセージが出ると秒数が見えなくなる」）: 文字の大きさ px、いちばん長い文（「夜明けまで 999 秒」）の幅の見積もり px
 * （Menlo の半角 0.602 em・全角 1 em。tests/dawn-lines が検査）、上中央の 2 行目との隙間 px。2 行目はこの左の幅を左右対称に避ける（ui/dawn-lines の lineFitScale）
 */
export const HUD_FONT_CLOCK_PX = 20;
export const HUD_CLOCK_MAX_W_PX = 184;
export const HUD_CLOCK_GAP_PX = 12;
