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
