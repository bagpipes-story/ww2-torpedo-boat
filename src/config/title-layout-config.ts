// Title の任務の行の置き方（論理 px。高さ 720・幅 1280〜1584）。v0.6.7 で menu-config から移し（値は同じ）、日本のタブの 2 列の格子の値を足した（spec-v067 §D.6）。menu-config が出し直す。
// 何も import しない（ui/title-grid と tests/title-grid が node の型検査で読んでも game-config → screen-fit の DOM を引かない。title-hint-config と同じ）。

/** 1 列の行（米PT の 3 任務。v0.6.0 でタブを入れた分、行 104 → 96 px・間 16 → 12。3 行で 216〜528）。x は論理幅に関わらず 160（v0.6.6 までと同じ） */
export const TITLE_ROW_X = 160;
export const TITLE_ROW_W = 960;
export const TITLE_ROW_H = 96;
export const TITLE_ROW_TOP = 216;
export const TITLE_ROW_GAP = 12;
export const TITLE_ROW_TITLE_PX = 30;
export const TITLE_ROW_SUB_PX = 20;
export const TITLE_ROW_STATUS_PX = 24;
/** 操作の一言の y（行の下。3 段の格子の下端 528 より下） */
export const TITLE_HINT_Y = 560;
/** 下の 3 つの切り替え（難易度・史実モード・マーカー）の間。格子の列の間も同じ */
export const TITLE_TOGGLE_GAP = 24;
/**
 * v0.6.7: タブの行がこの数以上なら 2 列の格子（日本ハードモードの 4 任務）。未満（米PT の 3 行）は 1 列のまま。
 * 格子は 3 段（6 任務）まで（4 段目は操作の一言にかかる。米PT の 7 任務が並ぶ版で見直す）
 */
export const TITLE_GRID_FROM = 4;
export const TITLE_GRID_ROWS_MAX = 3;
/** 格子の列の幅: 2 × 597 + 24 = 1,218（下の 3 つの切り替え 3 × 390 + 2 × 24 と同じ幅・同じ中心。論理幅 1280 でも左右に 31 px 余る）。597 × 96 px ≈ 326 × 52 pt（iPhone 15 横） */
export const TITLE_GRID_COL_W = 597;
/**
 * v0.7.1 S1: 右上の「音」ボタン（音: オン ⇄ 音: オフ。覚える＝systems/sfx-settings）。右端は画面の右 − HUD_MARGIN、上端 20・下端 100（タブの上端 108 の上）。
 * 200 × 80 px ≈ 109 × 44 pt（iPhone 15 横）。ボタンの下はタブまで 8 px しか無く、論理幅 1280 ではタブ（右端 1112）とボタン（左端 1056）の x が重なるので下には何も置けない（tests/title-sound）
 */
export const TITLE_SOUND_W = 200;
export const TITLE_SOUND_H = 80;
export const TITLE_SOUND_Y = 20;
export const TITLE_SOUND_PX = 26;
export const TITLE_SOUND_ON_JA = '音: オン';
export const TITLE_SOUND_OFF_JA = '音: オフ';
/**
 * v0.7.2 S1（spec-v0720 §4.4・brief L15）: 「音」の左に「曲」ボタン（曲: オン ⇄ 曲: オフ。「音」と別に覚える＝systems/sfx-settings）。大きさは「音」と同じ 200 × 80 px・間 12。
 * 論理幅 1280 で「曲」は 844〜1044・「音」は 1056〜1256（ロゴの右端 約 812 との間 32 px・25 字のビルド番号の右端 約 776 との間 68 px。1584 で 1148〜1348・1360〜1560）。
 * v0.7.1 の左の一言（2 行・約 180 px）は置けなくなった（1280 でロゴにかかる）ので、「音」ボタンの 2 行目「本体の消音も確認」（17 px で 136 px＝余白を引いた幅 136 に収まる）にした
 */
export const TITLE_MUSIC_GAP = 12;
export const TITLE_MUSIC_ON_JA = '曲: オン';
export const TITLE_MUSIC_OFF_JA = '曲: オフ';
export const TITLE_SOUND_SUB_JA = '本体の消音も確認';
export const TITLE_SOUND_SUB_PX = 17;
