# wip/v0710-S4 — v0.7.1 S4「合図・UI・Result」の作業の写し（commit の前）

基準: ブランチ claude/v0.7.1-sfx の HEAD 91ad587（S0〜S3）。repo では commit していない（lead が長い門を回してから commit する）。
戻し方: `git checkout 91ad587` の木で `git apply tracked.patch`、新しいファイルは `files/` を上書き。
- tracked.patch … 追跡済みのファイルの git diff HEAD
- files/ … 新しいファイル（git の追跡外）: scripts/headless/sfx-probe-cases.mjs src/assets/sfx-recipes-events.ts src/core/sfx-cues.ts tests/sfx-cues.test.ts tests/sfx-synth-cues.test.ts 
- tools/ … scratchpad の道具、results/ … 文字の結果（音・画像は入れない）
- 一言: S4 仕上げ（テスト 3,125・probe 31 件 OK・sfx-live 57 ✓・短い A/B same）
