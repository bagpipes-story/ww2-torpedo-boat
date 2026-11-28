// 達成の表示（v0.9.0 IP2。ユーザーの言葉 2026-11-27「各シナリオとも、終了時、終了後にクリアしたのかどうかがよくわかりません。」）の語と置き方の定数。
// 終了時＝Result の見出しの頭の語と色・未達の時の「達成の条件: …」、終了後＝Title の任務の行の印「✓ 達成」（v0.9.0 IP3 で 1 つに）とタブの「達成 n/N」。
// ゲームの強さの値ではない。何も import しない（ui/achieved-texts・ui/result-heading と tests が node で読める）。色は config/hud-text-config の味方の青（達成）と警告の色（未達）を使う側が当てる。

/** Result の見出しの頭の語（「任務達成 — 帰投した」「任務未達 — 砲撃で沈没」。v0.8.5 までは成否に関わらず「任務終了」） */
export const RESULT_ACHIEVED_JA = '任務達成';
export const RESULT_NOT_ACHIEVED_JA = '任務未達';
/** 未達の Result の見出しの下の 1 行の頭（後ろは Briefing の「成功」の文＝missions_seed の success・ハードは hard.success_ja。v0.9.0 IP3 で us_02・jp_06 の success を達成の条件の文にした＝出どころは 1 つ） */
export const RESULT_CONDITION_PREFIX_JA = '達成の条件: ';

/**
 * Title の任務の行の印（v0.9.0 IP3。ユーザーの言葉 2026-11-27「別にメニュー画面に「史実カスタム」を記録・表示してほしい訳ではなく」）: どの形で達成しても「✓ 達成」の 1 つだけ
 * （IP2 の「 ・ ハード ・ 史実（カスタム）」の札と 2 段はやめた。記録のビットは残す＝Briefing のトロフィーとストアのご褒美が読む）
 */
export const TITLE_ACHIEVED_JA = '✓ 達成';
/** タブの 2 行目の後ろ「選択中 ・ 達成 3/7」（開いているタブだけ。未解放のタブは条件の文のまま） */
export const titleTabAchievedJa = (sub: string, done: number, total: number): string => `${sub} ・ 達成 ${done}/${total}`;

/**
 * 行の印の置き方（論理 px）: 行の右端（MenuButton の右の文「出撃準備 →」と同じ右端＝行の右 − 32）に右揃えの 1 段で、状態の文の上（行の上端 + 段の余白）。
 * 字は 16 px（状態 24 px・副題 18／20 px より小さい＝詰めた行 76 px で 上の段 19 ＋ 状態 29 が収まる。測り: 状態の文は行の中央 ± 14.5）。
 * 左は題の右端から TITLE_ACHIEVED_GAP 空ける。収まらなければ作る時に 1 回だけ縮める（ui/title-achieved）。
 * 史実 × デフォルトで達成した行は「✓ 達成」の左に小さなトロフィー（TITLE_TROPHY_PX の高さ・間 TITLE_TROPHY_GAP。v0.9.0 IP3。入らない行は出さない＝今の 13 行はどの幅でも入る）
 */
export const TITLE_ACHIEVED_PX = 16;
export const TITLE_ACHIEVED_PAD_X = 32;
export const TITLE_ACHIEVED_GAP = 16;
/** 段の余白: 詰めた行（高さ 76。米PT の 7 任務）と今の行（高さ 96。日本の 6 任務） */
export const TITLE_ACHIEVED_PAD_Y_COMPACT = 3;
export const TITLE_ACHIEVED_PAD_Y = 10;
export const TITLE_TROPHY_PX = 18;
export const TITLE_TROPHY_GAP = 6;
