# wip/v0720-S3 — v0.7.2 S3「命中スローの音」の作業の写し（commit の前）

基準: ブランチ claude/v0.7.2-bgm の HEAD ae67534（S0・S1・S2）。repo では commit していない（lead が門を回してから commit する）。
戻し方: `git checkout ae67534` の木で `git apply tracked.patch`、新しいファイルは `files/` を上書き。
- tracked.patch … 追跡済みのファイルの git diff HEAD
- files/ … 新しいファイル（git の追跡外）: src/systems/sfx-slowmo.ts
tests/sfx-slowmo-flow.test.ts
tests/sfx-slowmo-kit.ts
tests/sfx-slowmo.test.ts
- tools/ … scratchpad の道具、results/ … 文字の結果（音・画像は入れない）
- 一言: S3 途中: 濾波器・rate・案・試聴の行 3・tests（ヘッドレスはまだ）
