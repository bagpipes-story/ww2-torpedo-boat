// 「近すぎて船体の下を通過」（v0.8.2 IP1。ui/under-lines）の見せ方の定数。ゲームの強さの値ではない（武装の距離は data/hit_rate_model.json の torpedo_launch.arming_distance_m）。何も import しない。
/** 2 行目に出す ms（ほかの出来事と同じ 4 秒＝出ていた ms の和。上の行に隠れている間は待つ） */
export const UNDER_EVENT_SHOW_MS = 4000;
