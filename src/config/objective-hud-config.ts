// 任務の行（v0.8.5 IP7。上中央の 3 行目の下の固定の 4 行目「［任務］…」）の見せ方の定数。ゲームの強さの値ではない（数は data とテレメトリから）。何も import しない
// （置き場所 ui/objective-line・任務ごとの文 ui/objective-specs・救助の文 ui/rescue-texts）。
// IP5（us_07 だけ。暗い板に橙の縁）→ IP7（実機 3 回目）: ユーザー「［任務］のメッセージについては文字の色はそのままで良いですが、囲いと塗りつぶしは不要です。」で板を外し、
// 「運天港などのシナリオについても退避状況などが通常メッセージに消されやすいのでシナリオの任務メッセージはDday同様に分けて表示するように」で成否の数のある任務すべてへ。

/**
 * 字の px（3 行目と同じ 20）・3 行目の上端からの段（3 行目 20 px の行の高さ 26 ＋ すき間 8）・字の幅の上限の左右の避け px（論理幅 − 2 × 362＝W 1280 で 556・W 1560 で 836）。
 * 置き場所の根拠（tests/objective-line・IP5 の tests/rescue-mission-line）: 字は y 114〜140 ＝ 3 行目の下端 106 より下・上の縁の端の印（敵の三角の上端 170・帰投と生存者のラベルの上端 約 174）より上。
 * 左端は左上の燃料の注意「全速では届かない・減速」（x 144〜342・y 126〜149）の右、右端は右の技能の列（x ≥ W − 112）の左。収まらない文は組み直した時だけ縮める
 */
export const OBJECTIVE_LINE_PX = 20;
export const OBJECTIVE_LINE_DY = 34;
export const OBJECTIVE_LINE_SIDE_KEEP_PX = 362;
/** 字の色: 常（IP5 の生存者の橙の字＝rescue-art-config の SURVIVOR_LABEL_COLOR と同じ値。tests が確かめる）。達成は味方の青（HOME_COLOR_TEXT）・未達は警告の色（HUD_COLOR_WARN） */
export const OBJECTIVE_LINE_COLOR = '#ffd9b0';
/** 頭の札（「［史実］」と同じ全角の括弧）・達成の数に届いた尾（帰投しなければ未達のまま）・もう届かない尾 */
export const OBJECTIVE_TAG_JA = '［任務］';
export const OBJECTIVE_DONE_JA = '帰投で達成';
export const OBJECTIVE_FAIL_JA = '未達';
