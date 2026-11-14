# wip/v0720-S3 — v0.7.2 S3「命中スローの音」の作業の写し（commit の前）

基準: ブランチ claude/v0.7.2-bgm の HEAD 2bf4b5b（S0・S1・S2）。repo では commit していない（lead が門を回してから commit する）。
戻し方: `git checkout 2bf4b5b` の木で `git apply tracked.patch`、新しいファイルは `files/` を上書き。
- tracked.patch … 追跡済みのファイルの git diff HEAD
- files/ … 新しいファイル（git の追跡外）: scripts/headless/sfx-slowmo.mjs
src/systems/sfx-slowmo.ts
tests/sfx-slowmo-flow.test.ts
tests/sfx-slowmo-kit.ts
tests/sfx-slowmo.test.ts
- tools/ … scratchpad の道具、results/ … 文字の結果（音・画像は入れない）
- 一言: S3 終わり: 実装・tests 3,512 件・ヘッドレス（slowmo・music-live 4 つ・probe 31・offline 3 つ・短い run-gates 18 組）・CHANGELOG・docs/03・S2 の説明の直し
