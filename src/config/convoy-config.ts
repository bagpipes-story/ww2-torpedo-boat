// 味方の大発の輸送隊（v0.6.4。jp_01「夜の輸送護衛」。spec §D.2）の見た目と語の定数。ゲームの強さの値ではないので data/*.json には置かない（hunt-config・pt-config と同じ考え）。
// 何も import しない（ui/convoy-lines・tests から型検査ごと読める）。
/**
 * 2 行目の出来事（「大発 1 隻 沈没」「大発 上陸 1/3」）を出す ms（v0.6.4 実機 1 回目のレビュー ux-2: 2,500 → 3,500。前は大発掃討の BARGE_EVENT_SHOW_MS・米PT の PT_RESULT_SHOW_MS と同じ 2.5 秒。
 * 浜の上陸は 60 m おき＝3.3 秒おきなので、2.5 秒だと「上陸 1/3」と「2/3」の間に別の行が 0.8 秒挟まった。3.5 秒なら 1/3 → 2/3 → 「上陸 3/3 ・ 帰投せよ」が続けて出る）
 */
export const CONVOY_EVENT_SHOW_MS = 3500;
/** 大発の絵のラベルと、画面外の矢印「大発 N m」のラベル（味方の青。最寄りの航行中の大発へ） */
export const CONVOY_MARKER_LABEL = '大発';
/**
 * 米PT の隊が狙っている大発の絵のラベル（警告色。v0.6.4 レビュー ux-5: 3 隻が同じ絵・同じラベルで、赤い線の横ずらし 120 m が隊列の間隔と同じなので、どれが狙われているか見えなかった）。
 * 1 行目は隣と同じ「大発」で、足す語は 2 行目（中央揃え。systems/convoy）: 1 行の「大発（狙われている）」は 22 px で 220 m と隊列の間隔 120 m より広く、隣の「大発」と重なって
 * 「大発大発（狙われている）」と読めた（v0.6.4 最終確認のヘッドレスの画像）。隣のラベルは 1 行なので 2 行目の高さには何も無い
 */
export const CONVOY_TARGET_LABEL = `${CONVOY_MARKER_LABEL}\n狙われている`;
/** 矢印・離脱の尾「大発のそばへ戻れ（600 m）」の距離の刻み m（切り上げ） */
export const CONVOY_MARKER_STEP_M = 100;
/** 離脱の行に「大発のそばへ戻れ」を足す距離 m（最寄りの航行中の大発がこれより遠い） */
export const CONVOY_NEAR_WARN_M = 500;
/** 平常の行「浜まで N m」の刻み m（切り上げ。最も遅れた航行中の大発から浜（上陸地点）まで。浜の無い隊は上陸線までの x の差） */
export const CONVOY_LEFT_STEP_M = 100;

/** 浜に上陸した大発（v0.6.4 実機 1 回目「何もない海の真ん中で消えていく」）: 絵は浜に残す（少し暗い色・不透明）、ラベルは「上陸」 */
export const CONVOY_BEACHED_LABEL = '上陸';
export const CONVOY_BEACHED_TINT = 0xb0b0b0;
export const CONVOY_BEACHED_ALPHA = 1;
/** 上陸地点の印（起動時に 1 回だけ描く。systems/convoy）: 岸の線の上の砂色の帯（上陸地点の両端から余白 m・線の幅）、陸の側のラベルとその岸からの距離 m */
export const CONVOY_LANDING_MARK_LABEL = '上陸地点';
export const CONVOY_LANDING_MARK_PAD_M = 40;
export const CONVOY_LANDING_MARK_WIDTH = 10;
export const CONVOY_LANDING_MARK_LABEL_OFFSET_M = 40;
