// 停泊して揚陸する味方の輸送船（v0.6.9。jp_04「多号作戦・オルモック湾へ」。spec-v069 §3.5）の検査の定数。ゲームの強さの値ではないので data/*.json には置かない（pt-config・convoy-config と同じ考え）。
// 何も import しない（config/landing-mission-data・tests から型検査ごと読める）。HUD の定数は S6 で足す。core が要る上限（揚陸の秒・命中）は core/landing-data。
/** V7: 線の終わりは泊地から launch_range_m − arrive_m − これ m の内（PT は折り返しの輪の 50 m 手前までに launch_range_m を越える） */
export const LANDING_LAUNCH_INSIDE_M = 50;
/** V5: 泊地と帰投の輪の中心の距離の下限 m（輸送船のそばで輪に入らない） */
export const LANDING_RING_CLEAR_M = 800;
/** V6: unload_s + これ ≤ duration_s（揚陸はいつも夜明けの前に決着する） */
export const LANDING_DAWN_MARGIN_S = 30;
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
