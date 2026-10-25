// 隼艇（v0.6.6「日本ハードモード⑤：隼艇」。jp_01 のハードだけ。spec-v066 §D.6）の見た目と語の定数。ゲームの強さの値ではないので data/*.json には置かない（convoy-config・pt-config と同じ考え）。
// 何も import しない（ui の文・tests から型検査ごと読める）。隼艇の名（「隼艇」）は data の hard.gunboat.label_ja。
/** 隼艇の 25mm の曳光弾と砲口の閃光（薄い青。自艇の 25mm の黄 GUN_TRACER_TINT・米PT の赤 MG_TRACER_TINT と見分ける）。隼艇の砲は標的の輪を出さない（自艇の輪と見分けがつかない。レビュー R13） */
export const GUNBOAT_TRACER_TINT = 0xa8dcff;
/** 隼艇の絵のラベル: 決着の後に浜へ向かう・浜にいる間の後ろ「（浜）」、被弾した後の「 HP 44」の頭、米PT に狙われている間の 2 行目（大発の CONVOY_TARGET_LABEL と同じ語。中央揃え） */
export const GUNBOAT_BEACH_SUFFIX = '（浜）';
export const GUNBOAT_HP_PREFIX = ' HP ';
export const GUNBOAT_AIMED_SUFFIX = '\n狙われている';
