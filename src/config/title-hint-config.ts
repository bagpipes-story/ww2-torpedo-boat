// Title の操作の一言（v0.6.3 で menu-config から移した。us_pt の文は同じ）。menu-config が出し直す。
// 何も import しない（tests の node 型検査から読まれても game-config → screen-fit の DOM を引かない。hud-text-config と同じ）。

export const TITLE_HINT_PX = 18;
export const TITLE_HINT_JA = '操作: 左下のスティックで進む ・ 右下で魚雷（大発は射撃）・ 右上で煙幕';
/**
 * 操作の一言はキャンペーンごと（v0.6.0。日本の魚雷艇に煙幕は無い）。無いキャンペーンは TITLE_HINT_JA。
 * 日本は v0.6.3 から魚雷を撃たない任務（jp_05「鹵獲艇の哨戒」）があるので、魚雷のある jp_06 と撃たない jp_05 のどちらでも本当の一言にした
 * （任務の名前で言う。「哨戒は撃たない」は米PT の哨戒が撃たないとも読めた。v0.6.3 レビュー。幅は任務の行 TITLE_ROW_W 960 px の内。tests/jp05-mission）。
 * v0.6.3 実機 1 回目から jp_05 の右下は T-14 の 13mm 機銃の射撃。v0.6.4 から jp_01「夜の輸送護衛」も機銃（T-38 の 25mm）なので任務の名で 2 つ言い、口径は言わない
 * （「13mm機銃」は jp_01 で嘘になる。18 px で 954 px ≤ 960。tests/jp05-mission）。
 * v0.6.7 から jp_02「孤島の哨戒」は何も撃たない（main_weapon none）ので任務の名で足す。日本のタブは 2 列の格子なので幅は格子の 1,218 px の内（18 px で 1,152 px。tests/title-grid）
 */
export const TITLE_HINT_BY_CAMPAIGN_JA: Readonly<Record<string, string>> = {
  us_pt: TITLE_HINT_JA,
  jp_hard: '操作: 左下のスティックで進む ・ 右下で魚雷（鹵獲艇の哨戒と輸送護衛は機銃・孤島の哨戒は撃たない）・ 煙幕なし（暗さと静音が頼り）',
};
