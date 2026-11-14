# wip/v0720-IP1 — v0.7.2 IP1「実機 1 回目の直し（曲）」の作業の写し（commit の前）

基準: ブランチ claude/v0.7.2-bgm の HEAD 7a77062（S0〜S3）。repo では commit していない（lead が門を回してから commit する）。
戻し方: `git checkout 7a77062` の木で `git apply tracked.patch`、新しいファイルは `files/` を上書き。
- tracked.patch … 追跡済みのファイルの git diff HEAD
- files/ … 新しいファイル（git の追跡外）: tests/sfx-music-contrast.test.ts
- tools/ … scratchpad の道具、results/ … 文字の結果（音・画像は入れない）
- 一言: 途中: D・E・L1・L2 の作り直し・部屋の響き・トレモロ・tests の直し（npm test の前）
