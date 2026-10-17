// 固定ステップの定数（v0.5.0 で game-config から分けた。window を読まないので、テスト（DOM 無し）と模擬からも読める）。game-config が再 export する。
/** 固定ステップ積分（CLAUDE.md §7）。実時間 1/60 秒 × time_scale を 1 ステップにする */
export const FIXED_STEP_S = 1 / 60;
export const MAX_STEPS_PER_FRAME = 4;
