// Title・Briefing・Result のボタンと配置（論理座標 1280×720 の px）と UI の語（v0.4.0、docs/02 §4）。ゲームの数値ではないので data/*.json には置かない。
// ui-config.ts（HUD）が 270 行を超えたので分けた。ボタンの高さはどれも 96 px 以上（iPhone の表示倍率 0.483〜0.546 で 46 pt 以上）。
import { GAME_HEIGHT, GAME_WIDTH, HUD_MARGIN } from './game-config';

/** 画面ができてから押下を受けない ms（前の画面から押しっぱなしの指・2 度押しで進まない） */
export const MENU_INPUT_DELAY_MS = 300;
/** ボタンの矩形: 塗り（押下中は濃く）、枠、選んだ選択肢の枠、無効の α */
export const MENU_FILL_COLOR = 0x8fc8ff;
export const MENU_FILL_ALPHA = 0.08;
export const MENU_FILL_PRESSED_ALPHA = 0.28;
export const MENU_STROKE_PX = 2;
export const MENU_STROKE_ALPHA = 0.6;
export const MENU_SELECTED_STROKE_PX = 4;
export const MENU_SELECTED_COLOR = 0xe6eef7;
export const MENU_DISABLED_ALPHA = 0.45;
/** ボタンの中の余白、2 行のときの題と 2 行目の中心のずれ、2 行目の文字 */
export const MENU_PAD_X = 32;
export const MENU_PAD_Y = 16;
export const MENU_TWO_LINE_DY = 16;
export const MENU_SUB_PX = 18;
/** 右下の主ボタン（Briefing の「出撃」・Result の「もう一度」）は同じ x にそろえる */
export const MENU_PRIMARY_W = 320;
export const MENU_PRIMARY_X = GAME_WIDTH - HUD_MARGIN - MENU_PRIMARY_W;

/** Title: ゲーム名、キャンペーン、任務の行（3 件）、操作の一言 */
export const TITLE_LOGO_TEXT = 'NIGHT HUNTERS';
export const TITLE_LOGO_Y = 64;
export const TITLE_LOGO_PX = 56;
export const TITLE_CAMPAIGN_Y = 140;
export const TITLE_CAMPAIGN_PX = 22;
export const TITLE_CAMPAIGN_SUFFIX_JA = ' ・ 任務を選べ';
export const TITLE_ROW_X = 160;
export const TITLE_ROW_W = 960;
export const TITLE_ROW_H = 104;
export const TITLE_ROW_TOP = 184;
export const TITLE_ROW_GAP = 16;
export const TITLE_ROW_TITLE_PX = 30;
export const TITLE_ROW_SUB_PX = 20;
export const TITLE_ROW_STATUS_PX = 24;
export const TITLE_HINT_Y = 560;
export const TITLE_HINT_PX = 18;
export const TITLE_HINT_JA = '操作: 左下のスティックで進む ・ 右下で魚雷（大発は射撃）・ 右上で煙幕';
/** 難易度の切り替え（v0.4.5。操作の一言の下。タップで ノーマル ⇄ ハード） */
export const TITLE_DIFF_W = 520;
export const TITLE_DIFF_H = 88;
export const TITLE_DIFF_X = (GAME_WIDTH - TITLE_DIFF_W) / 2;
export const TITLE_DIFF_Y = 596;
export const TITLE_DIFF_PX = 26;
export const TITLE_DIFF_NORMAL_JA = '難易度: ノーマル';
export const TITLE_DIFF_HARD_JA = '難易度: ハード';
export const TITLE_DIFF_SUB_JA = 'タップで切替 ・ ハードは敵の数が増える';

/** Briefing: 日付 ・ 場所と任務名、右上の「← 任務一覧」 */
export const BRIEF_X = 64;
export const BRIEF_SUB_Y = 56;
export const BRIEF_SUB_PX = 20;
export const BRIEF_TITLE_Y = 84;
export const BRIEF_TITLE_PX = 40;
export const BRIEF_BACK_W = 240;
export const BRIEF_BACK_H = 96;
export const BRIEF_BACK_X = GAME_WIDTH - HUD_MARGIN - BRIEF_BACK_W;
export const BRIEF_BACK_Y = HUD_MARGIN;
export const BRIEF_BACK_PX = 24;
export const BRIEF_BACK_JA = '← 任務一覧';
/** 6 行（ラベルと値。値は折り返す。次の行は値の高さ＋BRIEF_ROW_GAP 下）と史実の 1 行 */
export const BRIEF_ROW_TOP = 148;
export const BRIEF_ROW_GAP = 10;
export const BRIEF_ROW_PX = 24;
export const BRIEF_VALUE_X = 160;
export const BRIEF_VALUE_WRAP = 1056;
export const BRIEF_NOTE_LABEL_JA = '史実';
export const BRIEF_NOTE_GAP = 8;
export const BRIEF_NOTE_PX = 20;
/** 出撃前の港内空襲: 見出し（空襲なしの 1 行も同じ位置）、2 択、選んだ後の 1 行 */
export const BRIEF_RAID_Y = 456;
export const BRIEF_RAID_PX = 24;
export const BRIEF_CALM_PX = 22;
export const BRIEF_CHOICE_Y = 496;
export const BRIEF_CHOICE_W = 400;
export const BRIEF_CHOICE_H = 104;
export const BRIEF_CHOICE_GAP = 16;
export const BRIEF_CHOICE_TITLE_PX = 26;
export const BRIEF_OUTCOME_Y = BRIEF_CHOICE_Y + BRIEF_CHOICE_H + MENU_PAD_Y;
export const BRIEF_OUTCOME_PX = 22;
export const BRIEF_OUTCOME_WRAP = 832;
/** 「出撃」（空襲で未選択の間は無効で、2 行目に BRIEF_SORTIE_WAIT_JA） */
export const BRIEF_SORTIE_H = 112;
export const BRIEF_SORTIE_Y = GAME_HEIGHT - HUD_MARGIN - BRIEF_SORTIE_H;
export const BRIEF_SORTIE_PX = 36;
export const BRIEF_SORTIE_JA = '出撃';
export const BRIEF_SORTIE_WAIT_JA = '先に 2 択を選ぶ';

/** Result: 左下「任務一覧」と右下「もう一度」 */
export const RESULT_BUTTON_H = 96;
export const RESULT_BUTTON_Y = GAME_HEIGHT - HUD_MARGIN - RESULT_BUTTON_H;
export const RESULT_BUTTON_PX = 32;
export const RESULT_LIST_X = HUD_MARGIN;
export const RESULT_RETRY_JA = 'もう一度';
export const RESULT_RETRY_SUB_JA = '同じ任務・新しい夜';
export const RESULT_LIST_JA = '任務一覧';
