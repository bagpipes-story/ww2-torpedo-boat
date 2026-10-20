// 敵の米PT（v0.6.3。spec §D.5）の見た目と仕組みの定数。ゲームの強さの値ではないので data/*.json には置かない（hunt-config と同じ考え）。
/** 米PT の弾のプール（1 隻ずつしか撃たない: 4 発/体感秒 × 飛行 0.2 秒まで。模擬 core/pt-pass-sim も同じ数） */
export const PT_SHELL_POOL_SIZE = 24;
