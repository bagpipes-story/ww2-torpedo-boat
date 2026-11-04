// 停泊して揚陸する味方の輸送船（v0.6.9。jp_04「多号作戦・オルモック湾へ」。spec-v069 §3.5）の検査の定数。ゲームの強さの値ではないので data/*.json には置かない（pt-config・convoy-config と同じ考え）。
// 何も import しない（config/landing-mission-data・tests から型検査ごと読める）。HUD の定数は下（S6）。core が要る上限（揚陸の秒・命中）は core/landing-data。
/** V7: 線の終わりは泊地から launch_range_m − arrive_m − これ m の内（PT は折り返しの輪の 50 m 手前までに launch_range_m を越える） */
export const LANDING_LAUNCH_INSIDE_M = 50;
/** V5: 泊地と帰投の輪の中心の距離の下限 m（輸送船のそばで輪に入らない） */
export const LANDING_RING_CLEAR_M = 800;
/**
 * V6: unload_s + これ ≤ duration_s（揚陸はいつも夜明けの前に決着する）。v0.6.10 S0b で 30 → 20（ユーザーの選択「jp_04 の夜明けだけ 160 秒」: 揚陸 140 + 20 = 160。
 * v0.6.10 実機 2 回目に揚陸 140 → 110（110 + 20 = 130 ≤ 160。余裕は 20 のまま）。
 * 揚陸中に撃たれた米PT の魚雷は泊地まで 1,300 m でも 16 秒弱で決着する＝下の LANDING_WAKE_S_MAX の注）
 */
export const LANDING_DAWN_MARGIN_S = 20;
/** V10: 見張りの報告から慌てる距離（無ければ気づかれていない斉射の距離）まで、哨戒の速さでこれ体感秒以上 */
export const LANDING_WARN_MIN_S = 20;
/** V4: 浜の線は海域の南の縁からこれ m（jp_01 の convoy.beach.margin_m 12 と同じ）、輸送船の当たりの円はどれも浜の線からこれ m 以上沖 */
export const LANDING_BEACH_MARGIN_M = 12;
export const LANDING_BEACH_CLEAR_M = 50;

// 海の上の輸送船（v0.6.9 S5a。entities/ally-ship・ui/ally-ship-view。spec-v069 §5.4）。2 行目・時計・印の HUD の定数は S6 で足す
/** 輸送船の状態の行の揚陸の % の刻み（「揚陸 45%」。1 夜に 20 回だけ setText。spec §3.5 の LANDING_PCT_LABEL_STEP） */
export const LANDING_PCT_LABEL_STEP = 5;
/** 「雷跡！ N 秒」の秒の上限（状態の行の鍵の 7 bit の内に収める。Mk 13 は泊地まで 1,300 m でも 16 秒弱） */
export const LANDING_WAKE_S_MAX = 99;
/** 状態の行（「揚陸 45%」）の字の大きさ px と、ラベル「輸送船」の上端からの下げ m（ラベルは ESCORT_LABEL_FONT_PX 22） */
export const LANDING_STATUS_FONT_PX = 20;
export const LANDING_STATUS_DY_M = 26;
/** 沈んだ輸送船の状態の行の灰色（撃退された米PT の PT_RETIRED_TINT 0x8a8a8a と同じ色） */
export const LANDING_SUNK_TEXT_COLOR = '#8a8a8a';
/** 揚陸地点の帯の半分の長さ m（艇首の先が浜の線に届く点を中心に。帯の太さ・ラベルの下げは jp_01 の CONVOY_LANDING_MARK_*） */
export const LANDING_MARK_HALF_M = 80;

// 2 行目の揚陸の出来事（v0.6.9 S6a。ui/pt-line-clock・ui/landing-lines。spec-v069 §3.5・R5）
/** 揚陸の出来事（モード 35「米PT 雷撃！」「輸送船 被雷！」「揚陸完了！」）を出す ms（赤い線・13mm・輸送隊の出来事の下では出たとみなすまで待つ）。jp_01 の CONVOY_EVENT_SHOW_MS と同じ値（tests/landing-lines が pin） */
export const LANDING_EVENT_SHOW_MS = 3500;
/**
 * 揚陸の出来事が「出た」とみなす 2 行目に出ていた ms の和（R14 A2。機関の出来事の ENGINE_EVENT_MIN_SHOWN_MS と同じ規則・同じ値）: 届く前に赤い線・13mm・輸送隊の出来事・輸送船が射線に入るの行に
 * 隠れたら、隠れている間は待ち、消えた後にまた LANDING_EVENT_SHOW_MS 出す（前は 1 フレーム出たら出たとみなし、0.2 秒で赤い線に替わられた沈没の行が二度と出なかった）
 */
export const LANDING_EVENT_MIN_SHOWN_MS = 2000;

// 画面の端の「輸送」「雷撃」の印と海の上の ▼（v0.6.9 S6b。ui/hud-markers・ui/landing-markers・entities/landing-caret。spec-v069 §5.4・D9・R8/F12）
/** 輸送船の印のラベルの頭（「輸送 9900 m」は 18 px で 112 px＝ほかの印のラベルの幅の上限。「輸送船 9900 m」だと 130 px で入らない）と、報告の PT の印・▼ の字 */
export const LANDING_SHIP_MARKER_LABEL = '輸送';
export const LANDING_RUNNER_MARKER_LABEL = '雷撃';
export const LANDING_CARET_LABEL = '雷撃';
/**
 * 2 本の印が近いときのずらし px（ui/landing-markers の separateLandingMarker）: 左右の縁では縦に字 4 行ぶん＋8（下にラベルの矢印を上へずらしても、そのラベルが上の矢印のラベルに重ならない）、
 * 上下の縁では横にラベルの幅 112 + 8（同じ側のラベルどうしが重ならない）
 */
export const LANDING_MARKER_SEP_SIDE_PX = 80;
export const LANDING_MARKER_SEP_EDGE_PX = 120;
/** ▼ の中心・「雷撃」の下端の、報告の PT の中心からの上げ（画面の論理 px。世界ではズームで割る＝どのズームでも同じ大きさと間） */
export const LANDING_CARET_DY_PX = 16;
export const LANDING_CARET_LABEL_DY_PX = 28;
/**
 * 輸送船のラベルと状態の行・▼「雷撃」が HUD に重なるとき（S6b。S6a-fix の報告: 南を向いて輸送船のそばにいると船が画面の上に来て、船体の上の字が 2・3 行目とビルド番号に重なった）:
 * 置き場所を移るときに求める余分の空き px（上 ↔ 下 ↔ 出さないを境で行き来しない。ui/ally-ship-view の allyShipTextPlace）
 */
export const LANDING_TEXT_HYST_PX = 24;
