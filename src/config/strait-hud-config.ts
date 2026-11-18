// 海峡の夜（v0.8.0 S4。us_04）の HUD の見せ方の定数（spec-v0800 §4.9・§3.2 D-R10、lead の L26〜L28）: 2 行目のレーダーと列の出来事・衝突の危険・緑の端の印「レーダー N m」。
// ゲームの強さの値ではない（射程・掃引・陸の反射・丸めは data/hit_rate_model.json の radar、列の速さ・道・揚陸は missions_seed の transit）。いつ・どう知らせるかだけを決める。何も import しない。

/** 出来事の 2 行目の文を出す実 ms（spec §4.9「1 回・4 秒」。2 行目に出ていた ms の和で数える＝上の行に隠れている間は待つ。ui/strait-line-clock） */
export const STRAIT_EVENT_SHOW_MS = 4000;
/** 「レーダー: …に新しい接触」は 10 秒に 1 回まで（spec §4.9。列の艦は 8 秒おきに現れる＝1 隻ごとには言わない） */
export const RADAR_NEW_MIN_GAP_MS = 10000;
/**
 * 東の縁の帯 m（brief L26）: 消えた接触の最後の輝点・現れた接触の最初の輝点がこの内なら「東（ビラ）へ消えた」「東に新しい接触 … 帰りの列か」と読む。
 * 列は掃引の間に最大で 速さ × time_scale × 掃引の秒 進む（30 kt × 5 × 3 秒 ≈ 231 m）＋ 縁の内外 150 m ＋ 丸めの半分 25 m ≈ 406 m。余裕を見て 500 m（tests/radar-lines が data から確かめる）
 */
export const RADAR_EAST_EDGE_MARGIN_M = 500;
/** 2 行目のレーダーの文の距離の刻み m（四捨五入。spec §4.9 の例「北西 2300 m」＝2,280 m） */
export const RADAR_LINE_STEP_M = 100;
/**
 * 衝突の危険（brief L28。spec §4.9「500 m の内で艦首が自艇へ ±15°」）: 目で見えている艦（d² ≤ 視程²＝setSighted と同じ規則）の艦首が自艇へ半角の内で、この距離の内。
 * いつ知らせるかの見せ方の値（S1 で data に入れなかった。艦の AI・体当たり・当たりは何も変えない）。艦ごとに 1 回の接近で 1 回（円錐か距離の外へ出たら次に備える）
 */
export const BOW_ON_RANGE_M = 500;
export const BOW_ON_HALF_ANGLE_DEG = 15;
/** 衝突の危険の文の距離の刻み m（切り上げ。表示が実際より近くならない＝端の印と同じ） */
export const BOW_ON_STEP_M = 100;
/** 衝突の危険の名詞（v0.8.2 S2。片道の列＝us_05 の艦種 ship_class から。systems/strait-telemetry の bowOnNounJa。ほかの任務の文は駆逐艦・駆潜艇のまま） */
export const BOW_ON_NOUN_BY_CLASS_JA: Readonly<Record<string, string>> = { destroyer: '駆逐艦', heavy_cruiser: '重巡', battleship: '戦艦' };
/** 緑の端の印（brief L27）: ラベルの頭・距離の刻み m（切り上げ・矢印の下）・色（輝点の RADAR_BLIP_COLOR 0x6dff8c と同じ字の色） */
export const RADAR_MARKER_LABEL_JA = 'レーダー';
export const RADAR_MARKER_STEP_M = 100;
export const RADAR_MARKER_TEXT_COLOR = '#6dff8c';
/**
 * 緑の印のラベル「レーダー 4000 m」（18 px で 147.9 px）は今の印の半幅 56 px（hud-layout-config の MARKER_LABEL_HALF）より 18 px 広い:
 * 右の縁（W − 352）に止まった時はその分だけ左へ寄せ、下の縁で右下の速力の HUD を避ける時もその分だけ左で止める（ラベルが兵装のパネルの左 − 8・速力の HUD に届かない。tests/radar-marker）。
 * 左の縁は画面の枠の内へ寄せる（EdgeMarker の labelInset）
 */
export const RADAR_MARKER_RIGHT_EXTRA_PX = 18;
export const RADAR_MARKER_LABEL_INSET_PX = 4;
/**
 * 赤い「敵 N m」の艦（目で見えている最寄りの艦）の近くの輝点は緑の印にしない m（brief L27「印を 2 つ出さない」）: 輝点は掃引の時の位置なので、目の内へ入ったばかりの艦の
 * 輝点はまだ目の外に残る（列は掃引の間に最大 30 kt × 5 × 3 秒 ≈ 231 m ＋ 丸めの半分 25 m 進む）。その艦の今の位置からこの内の輝点を除く（tests/radar-marker が data から確かめる）
 */
export const RADAR_MARKER_SAME_SHIP_M = 300;
/** 緑の印を敵・帰投・敵機の印から離す px（字 2 行ぶん。隼艇の印と同じ＝HUD_FONT_MARKER_PX × 2 ＋ 8） */
export const RADAR_MARKER_SEP_PX = 44;
