// Title・Briefing・Result のボタンと配置（論理座標 GAME_WIDTH×720（幅は画面の縦横比で 1280〜1584。v0.5.1） の px）と UI の語（v0.4.0、docs/02 §4）。ゲームの数値ではないので data/*.json には置かない。
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

/**
 * Title: ゲーム名、キャンペーンのタブ（v0.6.0。米PT｜日本ハードモード）、任務の行（3 件）、操作の一言。
 * v0.6.0 でタブを入れた分、ロゴを縮め行を詰めた（行 104 → 96 px・間 16 → 12。3 行で 216〜528。ボタンの高さは 96 px 以上のまま）
 */
export const TITLE_LOGO_TEXT = 'NIGHT HUNTERS';
export const TITLE_LOGO_Y = 52;
export const TITLE_LOGO_PX = 44;
export const TITLE_TAB_Y = 108;
export const TITLE_TAB_H = 96;
export const TITLE_TAB_W = 460;
export const TITLE_TAB_GAP = 24;
export const TITLE_TAB_PX = 26;
export const TITLE_TAB_SUB_JA = 'タップで切替';
export const TITLE_TAB_SELECTED_SUB_JA = '選択中';
/** 未解放のタブの 2 行目（解放の条件と進み。CLAUDE.md §2「米PTキャンペーンの後にアンロック」） */
export function titleCampaignLockedSubJa(prereqName: string, done: number, total: number): string {
  return `未解放 ・ ${prereqName}の ${total} 任務を帰投で（済 ${done}/${total}）`;
}
export const TITLE_ROW_X = 160;
export const TITLE_ROW_W = 960;
export const TITLE_ROW_H = 96;
export const TITLE_ROW_TOP = 216;
export const TITLE_ROW_GAP = 12;
export const TITLE_ROW_TITLE_PX = 30;
export const TITLE_ROW_SUB_PX = 20;
export const TITLE_ROW_STATUS_PX = 24;
export const TITLE_HINT_Y = 560;
export const TITLE_HINT_PX = 18;
export const TITLE_HINT_JA = '操作: 左下のスティックで進む ・ 右下で魚雷（大発は射撃）・ 右上で煙幕';
/** 操作の一言はキャンペーンごと（v0.6.0。日本の魚雷艇に煙幕は無い）。無いキャンペーンは TITLE_HINT_JA */
export const TITLE_HINT_BY_CAMPAIGN_JA: Readonly<Record<string, string>> = {
  us_pt: TITLE_HINT_JA,
  jp_hard: '操作: 左下のスティックで進む ・ 右下で魚雷 ・ 煙幕なし（暗さと静音で寄り、逃げる）',
};
/**
 * 操作の一言の下の 3 つの切り替え: 難易度（v0.4.5。タップで ノーマル ⇄ ハード）、史実モード（v0.5.2。オフ ⇄ オン）、見越し点マーカー（v0.5.2 実機 1 回目。使う ⇄ 使わない。解放前は押せない）。
 * 同じ大きさで中央に並べる。論理幅 1280 でも左右に 31 px 余る（3 × 390 + 2 × 24 = 1218）
 */
export const TITLE_DIFF_W = 390;
export const TITLE_DIFF_H = 88;
export const TITLE_TOGGLE_GAP = 24;
export const TITLE_DIFF_X = GAME_WIDTH / 2 - TITLE_TOGGLE_GAP - TITLE_DIFF_W * 1.5;
export const TITLE_HIST_X = GAME_WIDTH / 2 - TITLE_DIFF_W / 2;
export const TITLE_MARKER_X = GAME_WIDTH / 2 + TITLE_TOGGLE_GAP + TITLE_DIFF_W / 2;
export const TITLE_DIFF_Y = 596;
export const TITLE_DIFF_PX = 26;
export const TITLE_DIFF_NORMAL_JA = '難易度: ノーマル';
export const TITLE_DIFF_HARD_JA = '難易度: ハード';
export const TITLE_DIFF_SUB_JA = 'タップで切替 ・ ハードは敵の数が増える';
/** 史実モードの題は data の title_ja（「史実モード」）に「: オフ／オン」。2 行目は data の倍率と不発の確率から作る（HUD の印にも使う） */
export const TITLE_HIST_OFF_JA = ': オフ';
export const TITLE_HIST_ON_JA = ': オン';
export function titleHistSubJa(evasionMultiplier: number, dudPct: number | null): string {
  // 幅 390 に収める（実機 1 回目: 「マーカーなし」と書いていたら、オン／オフに関わらず出るので状態と読まれた → マーカーは右の切り替えに）。
  // dudPct が null（不発の上書きを掛けないキャンペーン。v0.6.0 の日本側）なら回避だけ
  return dudPct === null ? `敵の回避 ×${evasionMultiplier}` : `敵の回避 ×${evasionMultiplier} ・ 不発 ${dudPct}%`;
}
/** 見越し点マーカーの切り替え（v0.5.2 実機 1 回目「使うかどうか選択制に」）: 解放前は「未解放」で押せず、2 行目に解放までの回数 */
export const TITLE_MARKER_JA = '見越し点マーカー';
export const TITLE_MARKER_ON_JA = ': 使う';
export const TITLE_MARKER_OFF_JA = ': 使わない';
export const TITLE_MARKER_LOCKED_JA = ': 未解放';
export const TITLE_MARKER_SUB_JA = 'タップで切替 ・ 史実モードでは出ない';
export function titleMarkerLockedSubJa(sortiesLeft: number): string {
  return `あと ${sortiesLeft} 回の任務で解放`;
}
/** Briefing の 1 行目と Result の見出しに足す印 */
export const BRIEF_HISTORICAL_JA = ' ・ 史実モード';
export const RESULT_HISTORICAL_TAG_JA = '（史実）';
/** Result: 史実モードの魚雷は通算の命中率に数えない（通算はノーマルの調整の根拠。CLAUDE.md §9） */
export const RESULT_HISTORICAL_KPI_JA = '史実モード: 通算の命中率には数えない（通算はノーマルの調整の根拠）';
/** Result: 米PT以外のキャンペーンの魚雷も通算に数えない（v0.6.0。hit_rate_model.kpi_measurement.campaigns） */
export const RESULT_CAMPAIGN_KPI_JA = 'この任務の魚雷は通算の命中率に数えない（通算は米PTの調整の根拠）';

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

/**
 * 一時停止（v0.5.1 実機 1 回目。ホーム画面のアプリにはブラウザの「戻る」が無いので、任務の途中で一覧へ戻る道）。
 * 左の「一時停止」を押すと世界が止まり、この画面。右下「再開」（主ボタンの位置）、左下「任務をやめる」は 1 秒長押しで任務一覧へ（押し間違いで任務を捨てない）
 */
export const PAUSE_DIM_ALPHA = 0.62;
export const PAUSE_TITLE_JA = '一時停止';
export const PAUSE_TITLE_Y = 200;
export const PAUSE_TITLE_PX = 48;
export const PAUSE_NOTE_JA = '任務は止まっています（夜明けの時計・敵・燃料も止まる）';
export const PAUSE_NOTE_Y = 280;
export const PAUSE_NOTE_PX = 22;
export const PAUSE_RESUME_JA = '再開';
export const PAUSE_QUIT_JA = '任務をやめる';
export const PAUSE_QUIT_SUB_JA = '1 秒長押しで任務一覧へ';
export const PAUSE_QUIT_HOLD_MS = 1000;
/** 長押しの帯（警告の色）と太さ */
export const PAUSE_QUIT_BAR_COLOR = 0xff8a7a;
export const PAUSE_QUIT_BAR_H = 8;
/** 下の HUD が透けて読みにくい所（上中央のビルド番号の行・2 つのボタン）に暗幕の上から敷く黒の濃さ（ヘッドレス確認: 「再開」の下に速力と魚雷ボタンが透けた） */
export const PAUSE_BACKING_ALPHA = 0.85;
/** 再開してから Hud が押下を受けない ms（右下の「再開」の 2 度押しが、下にある魚雷・扇のボタンに入らないように） */
export const PAUSE_RESUME_GUARD_MS = 300;
