// 空襲下の退避（v0.6.11。jp_03「運天港・空襲下の退避」）の絵の定数（S4。systems/evac-boats-view・systems/evac-terrain）。ゲームの強さの値ではないので data/*.json には置かない
// （landing-config・convoy-config と同じ考え）。何も import しない。S5 から HUD の出来事の秒・中央の帯・輪・隊の番号・札・端の矢印の定数（systems/evac-telemetry・ui/evac-markers・ui/evac-lines）。

/** 隊が陰に隠れている（G_HIDDEN）間の艇の絵と、操作中の隊が隠れている間の自艇の絵の濃さ（壕に上げ終えた艇は描かない） */
export const EVAC_HIDDEN_ALPHA = 0.45;
/** 屋我地島（北の縁 y 0 の外の陸）の幅 m（南の岸は entities/shallows が mission.coast.land_m で描く） */
export const EVAC_ISLAND_LAND_M = 400;
/** 屋我地島の名の字の大きさ px（南の岸の COAST_LABEL_FONT_PX と同じ） */
export const EVAC_ISLAND_LABEL_PX = 36;
/**
 * 壕の口（v0.6.11 IP1 の U10「レールの画面での描写が線一本で何がなんだかわかりません」）: 南の岸の陸に掘った口。岩の縁の中に暗い口（楕円）。
 * 中心は岸の線 y（海域の高さ）から陸へ EVAC_CAVE_DEPTH_M。幅・高さ m と色
 */
export const EVAC_CAVE_DEPTH_M = 40;
/** 岩の縁の高さ m（% の札の位置。岩の縁の絵は v0.6.11 IP2 から assets/evac-terrain-art＝config/evac-art-config） */
export const EVAC_CAVE_ROCK_H_M = 90;
export const EVAC_CAVE_MOUTH_W_M = 66;
export const EVAC_CAVE_MOUTH_H_M = 64;
export const EVAC_CAVE_COLOR = 0x0b0f0a;
/** 壕の口の中心の y（岸の線 bounds.height から陸へ。systems/evac-terrain が描き、上げている艇はここへ入る＝systems/evac-boats-view、% の札はその下＝ui/evac-markers） */
export function evacCaveMouthY(boundsHeight: number): number {
  return boundsHeight + EVAC_CAVE_DEPTH_M;
}
/**
 * 引き上げの斜路（スリップウェイ。U10）: 隠れ場所の点の少し海側から壕の口までのコンクリートの斜路（海の中は薄く＝水に沈んだ部分）、2 本のレール、枕木。
 * 斜路の幅・海の側へ出す長さ m・色・海の中の濃さ、レールの間隔（中心から左右）・太さ m・色、枕木の幅・厚さ・間隔 m・色
 */
export const EVAC_RAMP_W_M = 36;
export const EVAC_RAMP_SEA_M = 30;
export const EVAC_RAMP_COLOR = 0xa29c8a;
export const EVAC_RAMP_SEA_ALPHA = 0.45;
export const EVAC_RAIL_GAUGE_M = 8;
export const EVAC_RAIL_WIDTH_M = 3;
export const EVAC_RAIL_COLOR = 0x2a2a2a;
export const EVAC_TIE_W_M = 28;
export const EVAC_TIE_H_M = 3;
export const EVAC_TIE_STEP_M = 9;
export const EVAC_TIE_COLOR = 0x5a4128;
/**
 * レールで上げている艇の進み（U9「一艇ずつレールで引き上げている進捗（一艇ごと）をレールの下部にでも%で表示」）: 壕の口の下（陸）の札「2隻目 45%」の字の大きさ（論理 px。
 * 隠れ場所の札と同じくズームが変わった時だけ 1/zoom＝見張り 0.5 でも画面上この大きさ）・岩の縁の下端からの間 m（負は岩の縁に少し重ねる＝W 1280 の既定のズームで右下の速力の HUD「停止」から離す）・色
 */
export const EVAC_HAUL_LABEL_PX = 22;
export const EVAC_HAUL_LABEL_GAP_M = -10;
export const EVAC_HAUL_LABEL_COLOR = '#ffe08a';

// ---------- S5: HUD（2 行目の出来事・中央の帯）と地図の上の輪・番号・札（spec-v0611-r2 §10.1・§10.4・§11） ----------
/** 2 行目の出来事（見失った・沈没・撃墜・陰が見つかった・隠れた・機銃）を出す秒（世界の時計。一時停止で止まる）と、決着（第 1 次の空襲が去った）を出す秒 */
export const EVAC_EVENT_SHOW_S = 3;
export const EVAC_SETTLE_SHOW_S = 4;
/**
 * ［切替］・全滅の後の自動の切替でスティックを倒したまま引き継いだ時（latch が SW_WAIT_NEUTRAL）、2 行目の「引き継いだ ・ 離してから倒すと操る」を予告の行より上に出す秒（世界の時計。v0.6.11 S8b）。
 * カメラが新しい隊長艇へ流れる約 1 秒（CAMERA_FOLLOW_LERP）＋ 1 行を読む約 1 秒。予告は赤い輪と端の矢印で見えたままで、この後に 2 行目へ戻る（予告から始まるまで 10 秒の 2 割）
 */
export const EVAC_TAKE_HOLD_S = 2;
/** 予告の中央の帯（ui/dawn-banner を借りる）を出す ms（spec §10.1「中央の帯 2 秒」） */
export const EVAC_BANNER_MS = 2000;
/** 近い隠れ場所の距離の刻み m（2 行目と端の矢印。変わったときだけ組み直す） */
export const EVAC_DIST_STEP_M = 20;
/** 輪の絵（assets の generateEvacRingTexture。Boot で 1 回）: 半径・線の太さ（単位 × RENDER_SCALE px）。線は半径の 1/8（隊の輪 50 m で 6 m＝見張り 0.5 で 3 px） */
export const EVAC_RING_TEX_RADIUS_UNITS = 32;
export const EVAC_RING_LINE_UNITS = 4;
/** 隊の輪の半径 m（隊長艇を中心に。縦列 40 m × 2 の半ばを囲む）と隠れ場所の輪の濃さ（空き枠が隊の隻数より少ない＝満杯は薄く） */
export const EVAC_GROUP_RING_M = 50;
export const EVAC_SHELTER_RING_ALPHA = 0.55;
export const EVAC_SHELTER_FULL_ALPHA = 0.22;
/** 輪の色: 隠れ場所（味方の青）・操作中の隊（白）・狙われた隊（赤＝HUD の警告色）・見つかった陰（黄） */
export const EVAC_SHELTER_TINT = 0x8fc8ff;
export const EVAC_CONTROL_TINT = 0xffffff;
export const EVAC_TARGET_TINT = 0xff8a7a;
export const EVAC_FOUND_TINT = 0xffd166;
/** 狙われた隊の赤い輪の点滅（tween なし。世界の秒から濃さを計算）: 回/秒と濃さの幅 */
export const EVAC_TARGET_PULSE_HZ = 1.5;
export const EVAC_TARGET_ALPHA_MIN = 0.45;
export const EVAC_TARGET_ALPHA_MAX = 1;
/** 隊の番号（隊長艇の上）と隠れ場所の札の字の大きさ（論理 px。ズームが変わった時だけ 1/zoom＝見張り 0.5 でも画面上この大きさ）・隊長艇からの上へのずれ（論理 px） */
export const EVAC_NUMBER_PX = 26;
export const EVAC_LABEL_PX = 20;
export const EVAC_NUMBER_OFFSET_PX = 30;
/** 隊の番号の色: 停泊（灰）・走る（白）・隠れた（暗い緑）・見つかった（黄）・狙われている（赤）・全滅（灰の ×） */
export const EVAC_NUM_MOORED = '#9aa4ae';
export const EVAC_NUM_UNDERWAY = '#e6eef7';
export const EVAC_NUM_HIDDEN = '#3f7a4a';
export const EVAC_NUM_FOUND = '#ffd166';
export const EVAC_NUM_TARGET = '#ff8a7a';
export const EVAC_NUM_GONE = '#6b7480';
/** 画面の外の狙われた隊の端の矢印の数（同時の編隊の上限と同じ 3。spec §10.4） */
export const EVAC_EDGE_TARGETS = 3;
