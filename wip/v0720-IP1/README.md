# wip/v0720-IP1 — v0.7.2 IP1「実機 1 回目の直し（曲）」の作業の写し（commit の前）

基準: ブランチ claude/v0.7.2-bgm の HEAD 7a77062（S0〜S3）。repo では commit していない（lead が門を回してから commit する）。
戻し方: `git checkout 7a77062` の木で `git apply tracked.patch`、新しいファイルは `files/` を上書き。
- tracked.patch … 追跡済みのファイルの git diff HEAD
- files/ … 新しいファイル（git の追跡外）: tests/sfx-music-contrast.test.ts
- tools/ … scratchpad の道具、results/ … 文字の結果（音・画像は入れない）
- 一言: 終わり: IP1 の実装・tests 3,522 件・数（曲・違い・mix・メニュー・Chromium・live 4 つ・短い run-gates 18 組）・CHANGELOG・docs/03
