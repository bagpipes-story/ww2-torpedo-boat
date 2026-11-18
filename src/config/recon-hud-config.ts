// 報告・無線・中継（v0.8.2。us_05「スリガオ海峡・最初の接触」）の見せ方の定数（spec-v0820 §4.11 D-A5・§4.13）。ゲームの強さの値ではない（論理に効く値は data の recon）。何も import しない。
// S2: 中継の輪（隣の分隊）の色＝帰投の輪（entities/return-point の HOME_COLOR の青）の色違いの黄と、輪の名の字の色。2 行目の文・端の印の定数は S4 で足す。

/** 中継の輪の色（帰投の輪の絵 tex-return-ring に掛ける。新しい絵の鍵は作らない）と輪の名の字の色 */
export const RELAY_RING_TINT = 0xffd84a;
export const RELAY_RING_TEXT = '#ffd84a';
