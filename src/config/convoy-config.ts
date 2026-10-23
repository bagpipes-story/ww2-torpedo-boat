// 味方の大発の輸送隊（v0.6.4。jp_01「夜の輸送護衛」。spec §D.2）の見た目と語の定数。ゲームの強さの値ではないので data/*.json には置かない（hunt-config・pt-config と同じ考え）。
// 何も import しない（ui/convoy-lines・tests から型検査ごと読める）。
/** 2 行目の出来事（「大発 1 隻 沈没」「大発 上陸 1/3」）を出す ms（大発掃討の BARGE_EVENT_SHOW_MS・米PT の PT_RESULT_SHOW_MS と同じ） */
export const CONVOY_EVENT_SHOW_MS = 2500;
/** 大発の絵のラベルと、画面外の矢印「大発 N m」のラベル（味方の青。最寄りの航行中の大発へ） */
export const CONVOY_MARKER_LABEL = '大発';
/** 米PT の隊が狙っている大発の絵のラベル（警告色。v0.6.4 レビュー ux-5: 3 隻が同じ絵・同じラベルで、赤い線の横ずらし 120 m が隊列の間隔と同じなので、どれが狙われているか見えなかった） */
export const CONVOY_TARGET_LABEL = '大発（狙われている）';
/** 矢印・離脱の尾「大発のそばへ戻れ（600 m）」の距離の刻み m（切り上げ） */
export const CONVOY_MARKER_STEP_M = 100;
/** 離脱の行に「大発のそばへ戻れ」を足す距離 m（最寄りの航行中の大発がこれより遠い） */
export const CONVOY_NEAR_WARN_M = 500;
/** 平常の行「浜まで N m」の刻み m（切り上げ。最も遅れた航行中の大発から上陸線まで） */
export const CONVOY_LEFT_STEP_M = 100;
