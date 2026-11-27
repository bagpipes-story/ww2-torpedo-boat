// 達成の表示（v0.9.0 IP2。ユーザーの言葉 2026-11-27「各シナリオとも、終了時、終了後にクリアしたのかどうかがよくわかりません。」）の語と置き方の定数。
// 終了時＝Result の見出しの頭の語と色・未達の時の「達成の条件: …」、終了後＝Title の任務の行の印「✓ 達成 ・ ハード ・ 史実（カスタム）」とタブの「達成 n/N」。
// ゲームの強さの値ではない。何も import しない（ui/achieved-texts・ui/result-heading と tests が node で読める）。色は config/hud-text-config の味方の青（達成）と警告の色（未達）を使う側が当てる。

/** Result の見出しの頭の語（「任務達成 — 帰投した」「任務未達 — 砲撃で沈没」。v0.8.5 までは成否に関わらず「任務終了」） */
export const RESULT_ACHIEVED_JA = '任務達成';
export const RESULT_NOT_ACHIEVED_JA = '任務未達';
/** 未達の Result の見出しの下の 1 行の頭（後ろは Briefing の「成功」の文＝missions_seed の success。食い違う任務だけ achieve_ja） */
export const RESULT_CONDITION_PREFIX_JA = '達成の条件: ';

/** Title の任務の行の印の語（HUD の「［史実・カスタム］」と Result の見出しの印「（カスタム）」と同じ語） */
export const TITLE_ACHIEVED_JA = '✓ 達成';
export const TITLE_ACHIEVED_HARD_JA = 'ハード';
export const TITLE_ACHIEVED_HISTORICAL_JA = '史実';
export const TITLE_ACHIEVED_CUSTOM_JA = '（カスタム）';
export const TITLE_ACHIEVED_SEP_JA = ' ・ ';
/** タブの 2 行目の後ろ「選択中 ・ 達成 3/7」（開いているタブだけ。未解放のタブは条件の文のまま） */
export const titleTabAchievedJa = (sub: string, done: number, total: number): string => `${sub} ・ 達成 ${done}/${total}`;

/**
 * 行の印の置き方（論理 px）: 行の右端（MenuButton の右の文「出撃準備 →」と同じ右端＝行の右 − 32）に右揃えで 2 段。上の段は状態の文の上（行の上端 + 段の余白）、下の段は状態の文の下
 * （行の下端 − 段の余白）。字は 16 px（状態 24 px・副題 18／20 px より小さい＝詰めた行 76 px で 上の段 19 ＋ 状態 29 ＋ 下の段 19 が収まる。測り: 状態の文は行の中央 ± 14.5）。
 * 左は題（上の段）・副題（下の段）の右端から TITLE_ACHIEVED_GAP 空ける。収まらない段は作る時に 1 回だけ縮める（ui/title-achieved）
 */
export const TITLE_ACHIEVED_PX = 16;
export const TITLE_ACHIEVED_PAD_X = 32;
export const TITLE_ACHIEVED_GAP = 16;
/** 段の余白: 詰めた行（高さ 76。米PT の 7 任務）と今の行（高さ 96。日本の 6 任務） */
export const TITLE_ACHIEVED_PAD_Y_COMPACT = 3;
export const TITLE_ACHIEVED_PAD_Y = 10;
