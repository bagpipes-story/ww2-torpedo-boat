# wip/v0720-S0 — v0.7.2 S0（骨組みと道具: 曲の定数・作曲器・合成・分けて描く・試聴の数の道具。鳴らない）の作業の写し（commit の前）

基準: ブランチ claude/v0.7.2-bgm の HEAD 35e9e77（main 35e9e77＝v0.7.1）。repo では commit していない（lead が門を回してから commit する）。
戻し方: `git checkout 35e9e77` の木で `git apply tracked.patch`、新しいファイルは `files/` を写す。
- tracked.patch … 追跡済みのファイルの git diff HEAD
- files/ … 新しいファイル（git の追跡外）: scripts/sfx-music.ts
src/assets/sfx-music-compose.ts
src/assets/sfx-music-render.ts
src/assets/sfx-music-synth.ts
src/assets/sfx-music-themes.ts
src/config/sfx-music-config.ts
tests/sfx-music-compose.test.ts
tests/sfx-music-inventory.test.ts
tests/sfx-music-render.test.ts
tests/sfx-music-synth.test.ts
- tools/ … scratchpad の道具（Chromium の費用の測り bench-*・kern-*、prof・parts・tabbench・fxbench、backup.sh、v0720/tools/run-gates.sh の写し）、results/ … 文字の結果（音・画像は入れない。WAV・PNG は scratchpad の v0720/impl/S0/music）
- 一言: S0 最終（テスト 4 本＋rules 3 件・npm test 3,326・typecheck・lint・build・束は main 35e9e77 とバイトで同じ・短い run-gates は音の 3 つの状態で全部同じ・CHANGELOG・docs/03・版 0.7.2・Chromium の費用・種 7603/7619/7621/7622/7623/7624）
