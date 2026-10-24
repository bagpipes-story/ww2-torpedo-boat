// 機関の不調（v0.6.5。jp_05）の定数。data（risk_events.json の engine_failure.params）ではない表示と ?debug の値だけを置く（ui-config.ts は 300 行を超えているので別ファイル）。
// 何も import しない（ui/engine-lines と config/engine-mission-data がテストの node から読まれても game-config → screen-fit の DOM を引かない）。
// 右下の熱の帯の縦の位置は ui-config の寸法から ui/engine-hud が求める（ENGINE_GAUGE_GAP_PX だけここ）。

/** ?debug&enghot の出撃時の熱（spec-v065 §A.1・R11）: すぐ「過熱」が見え、全速の帯に入るまでの約 2 秒の冷えで warn_heat 0.6 を割らない */
export const DEBUG_ENGINE_HOT_HEAT = 0.75;

/** 2 行目の過熱の出来事（熱が warn_heat を下から越えた）を出す ms（赤い線・13mm の出来事・輸送隊の出来事の下では、出た秒の和が ENGINE_EVENT_MIN_SHOWN_MS になるまで待つ。spec §D.1） */
export const ENGINE_EVENT_SHOW_MS = 3500;
/** 過熱の出来事を「出た」とみなす 2 行目に出ていた ms の和（v0.6.5 のレビュー ux-2: 568 px の文は 1 秒では読めない。これより短く赤い線に替わられたら、線の後にまた出す） */
export const ENGINE_EVENT_MIN_SHOWN_MS = 2000;

/** 右下の熱の帯（spec §D.2）: 帯の幅・高さ px、字の大きさ px、帯と字の隙間 px、「針路」の文の上端からの隙間 px */
export const ENGINE_GAUGE_W_PX = 80;
export const ENGINE_GAUGE_H_PX = 8;
export const ENGINE_FONT_PX = 18;
export const ENGINE_GAUGE_TEXT_GAP_PX = 8;
export const ENGINE_GAUGE_GAP_PX = 14;
/** 帯の幅の刻み（熱を 1/50 に丸めた値が変わったときだけ書く＝全速で 0.6 秒に 1 回） */
export const ENGINE_GAUGE_STEPS = 50;

/** 帯の色（平常・過熱・限界と不調）と字の色（段 0 は HUD の地の色、段 1 は黄、段 2・3 は警告色） */
export const ENGINE_TINT_OK = 0x8fbf8f;
export const ENGINE_TINT_WARN = 0xffd060;
export const ENGINE_TINT_FINAL = 0xff8a7a;
export const ENGINE_TEXT_OK = '#9fb3c8';
export const ENGINE_TEXT_WARN = '#ffd060';
export const ENGINE_TEXT_FINAL = '#ff8a7a';
/** 限界と不調の間の点滅（識別ボタンと同じ 2.5 Hz。濃さだけ）の薄いときの濃さ */
export const ENGINE_PULSE_ALPHA_MIN = 0.45;
/** 帯の地（いっぱいの幅）の濃さ */
export const ENGINE_GAUGE_BG_ALPHA = 0.35;
