// 海峡の両岸の絵の見せ方の定数（v0.8.0 S2。spec-v0800 §4.3・§4.10。systems/strait-terrain が読む）。陸の色・浜の線・字の色と大きさは今の岸（config/hunt-config の COAST_*）と同じ。
// ゲームの強さの値ではない（岸の幅・名・切れ目・揚陸の地の名は data/missions_seed.json の shores と transit）。何も import しない。

/** 揚陸の地の字の矢印（列が抜ける縁の向き。東の縁なら「ビラ →」・西の縁なら「← ビラ」） */
export const STRAIT_LANDING_ARROW_EAST_JA = '→';
export const STRAIT_LANDING_ARROW_WEST_JA = '←';
