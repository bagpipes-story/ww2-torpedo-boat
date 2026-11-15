# wip/v0720-S4 — v0.7.2 S4「仕上げ（束を門の内へ・docs）」の作業の写し（commit の前）

基準: ブランチ claude/v0.7.2-bgm の HEAD d453ac4（S0〜S3・IP1・IP2）。repo では commit していない（lead が門を回してから commit する）。
戻し方: `git checkout d453ac4` の木で `git apply tracked.patch`、新しいファイルは `files/` を上書き。
- tracked.patch … 追跡済みのファイルの git diff HEAD
- files/ … 新しいファイル（git の追跡外）: なし
- tools/ … scratchpad の道具、results/ … 文字の結果（音・画像は入れない）
- 一言: 途中: docs（CLAUDE.md・docs/02・docs/03・CHANGELOG の S4 と最終の既知の制約）・npm test 3,606 件が通る。短い run-gates と live はまだ
