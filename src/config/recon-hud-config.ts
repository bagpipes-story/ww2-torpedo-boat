// 報告・無線・中継（v0.8.2。us_05「スリガオ海峡・最初の接触」）の見せ方の定数（spec-v0820 §4.11 D-A5・§4.13）。ゲームの強さの値ではない（論理に効く値は data の recon）。何も import しない。
// S2: 中継の輪（隣の分隊）の色＝帰投の輪（entities/return-point の HOME_COLOR の青）の色違いの黄と、輪の名の字の色。2 行目の出来事・端の印の定数は S4（下）。

/** 中継の輪の色（帰投の輪の絵 tex-return-ring に掛ける。新しい絵の鍵は作らない）と輪の名の字の色 */
export const RELAY_RING_TINT = 0xffd84a;
export const RELAY_RING_TEXT = '#ffd84a';
// S4（spec-v0820 §4.13 D-H1〜D-H3・§9 の 7、lead の L42・L43）: 2 行目の出来事を出す秒・中継の端の印のラベルの頭・距離の刻み（文は ui/recon-texts、時計は ui/recon-lines、印は ui/hud-markers）。

/** 1 つの出来事を 2 行目に出す ms（2 行目に出ていた ms の和。上の行に隠れている間は待つ＝v0.8.0 のレーダーの出来事・v0.8.1 の止まった艦の出来事と同じ 4 秒） */
export const RECON_EVENT_SHOW_MS = 4000;
/** 中継の端の印「中継 2100 m」（中継待ちの間だけ。矢印の上にラベル＝帰投の印と同じ置き方・字の色は中継の輪の黄・切り上げ） */
export const RELAY_MARKER_LABEL_JA = '中継';
export const RELAY_MARKER_STEP_M = 100;
