// 夜の哨戒機（v0.6.7。jp_02「孤島の哨戒」）の表示だけの定数。data（risk_events.json の patrol_air.params）ではない値を置く（ui-config.ts は 300 行を超えているので別ファイル）。
// 何も import しない（ui/patrol-lines・systems/patrol-telemetry がテストの node から読まれても game-config → screen-fit の DOM を引かない）。

/** 2 行目の結果の行（モード 33「敵機は見つけられずに去る」「敵機 去る ・ 爆弾 4 発 …」）を出す体感秒: 見つけられずに去る捜索が去り始めてから・夜の出撃が終わってから（spec-v067 §D.1） */
export const PATROL_RESULT_SHOW_S = 2.5;
/**
 * 捜索の 2 機の絵の濃さ（接近・付近の捜索。去るは leave_s で薄くなる）。夜の出撃の機（夜明けの空襲の core の絵）と同じ 1 にする:
 * 発見の瞬間に捜索の絵を隠して出撃の機を同じ位置に濃さ 1 で出すので、ここが 1 でなければ受け渡しで濃さが跳ぶ（spec §D.3・レビュー R10）
 */
export const PATROL_SEARCH_ALPHA = 1;
