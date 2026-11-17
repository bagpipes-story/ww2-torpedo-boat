// 止まった艦の任務（v0.8.1 S4。us_06）の 2 行目の出来事の見せ方の値（spec-v0810 §6 の S4・§5.2、lead の L61）。ゲームの強さの値ではない（論理に効く値は data の anchored・shore_backdrop）。
// 何も import しない（tests から型検査ごと読める）。文と時計は ui/anchor-lines。
/** 1 つの出来事を 2 行目に出す ms（2 行目に出ていた ms の和。上の行に隠れている間は待つ＝v0.8.0 のレーダーの出来事の STRAIT_EVENT_SHOW_MS と同じ 4 秒） */
export const ANCHOR_EVENT_SHOW_MS = 4000;
/**
 * 「暗い岸を背にした」を始める間の最短 ms。背に岸のビット（最寄りの浮いている艦に対して）は、浜沿いで最寄りの艦が替わる・岸の線の端の内外を出入りするたびに立ち直す。
 * 浜を静音で寄る間（spec §3.10 の典型の夜で約 30 秒）に同じ文を何度も出さないため 20 秒に 1 回まで（静音 18 kt は画面で約 46 m/秒＝20 秒で浜沿いを 1 km 足らず）
 */
export const ANCHOR_BACKDROP_MIN_GAP_MS = 20000;
