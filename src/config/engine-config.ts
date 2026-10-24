// 機関の不調（v0.6.5。jp_05）の定数。data（risk_events.json の engine_failure.params）ではない表示と ?debug の値だけを置く（ui-config.ts は 300 行を超えているので別ファイル）。
// 右下の熱の帯の位置・色・点滅、2 行目の出来事の秒は表示の段（v0.6.5 の S5）でここに足す。

/** ?debug&enghot の出撃時の熱（spec-v065 §A.1・R11）: すぐ「過熱」が見え、全速の帯に入るまでの約 2 秒の冷えで warn_heat 0.6 を割らない */
export const DEBUG_ENGINE_HOT_HEAT = 0.75;
