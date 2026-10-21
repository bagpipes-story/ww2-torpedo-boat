// 敵の米PT（v0.6.3。spec §D.5）の見た目と仕組みの定数。ゲームの強さの値ではないので data/*.json には置かない（hunt-config と同じ考え）。
// 何も import しない（ui/pt-lines・tests から型検査ごと読める）。
/** 米PT の弾のプール（1 隻ずつしか撃たない: 4 発/体感秒 × 飛行 0.2 秒まで。模擬 core/pt-pass-sim も同じ数） */
export const PT_SHELL_POOL_SIZE = 24;
/** T-14 の 13mm の弾（曳光弾）のプール（v0.6.3 実機 1 回目: 450 発/分 = 7.5 発/体感秒 × 飛行 0.24 秒まで ≤ 2 発に余裕。模擬 core/pt-pass-sim も同じ数） */
export const PT_GUN_SHELL_POOL_SIZE = 8;
/** 外れ弾の小さい水柱のプール（命中は世界の小さな爆発） */
export const PT_SPLASH_POOL_SIZE = 24;
/** 航過の赤い線（予告）の長さ m（航過中の PT から固めた針路へ。夜明けの空襲の爆撃進路の線と同じ色・濃さ・太さ） */
export const PT_PASS_LINE_LEN_M = 700;
/** 砲口の閃光（爆発の輪を流用。赤）: 大きさの倍率・寿命 秒 */
export const PT_MUZZLE_FLASH_SCALE = 0.3;
export const PT_MUZZLE_FLASH_S = 0.08;
export const PT_MUZZLE_FLASH_TINT = 0xff8a7a;
/** 画面外の矢印のラベル（米PT の任務。駆逐艦は「敵」、大発は「大発」） */
export const PT_MARKER_LABEL = 'PT';
/** 2 行目の航過の結果（「かわした！」「被弾 N 発」）を出す ms（大発の BARGE_EVENT_SHOW_MS と同じ考え） */
export const PT_RESULT_SHOW_MS = 2500;
