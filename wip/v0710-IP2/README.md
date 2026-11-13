# wip/v0710-IP2 — v0.7.1 実機 1 回目の直し IP2（弾倉の交換の音を始め・終わりの 2 本に・魚雷の発射の音の作り直し・試聴の場 ?sfxlab）の作業の写し（commit の前）

基準: ブランチ claude/v0.7.1-sfx の HEAD 82eb46b（S0〜S5 ＋ IP1）。repo では commit していない（lead が長い門を回してから commit する）。
戻し方: `git checkout 82eb46b` の木で `git apply tracked.patch`、新しいファイルは `files/` を上書き。
- tracked.patch … 追跡済みのファイルの git diff HEAD
- files/ … 新しいファイル（git の追跡外）: src/assets/sfx-recipes-launch.ts
src/assets/sfx-recipes-reload.ts
src/assets/sfx-variants.ts
src/config/sound-lab-config.ts
src/scenes/sound-lab-scene.ts
src/ui/sound-lab-layout.ts
tests/sfx-variants.test.ts
tests/sound-lab.test.ts
- tools/ … scratchpad の道具（ana2・env・pair・lab-shots・tune-ip2・mixrun）、results/ … 文字の結果（音・画像は入れない。WAV と声紋は scratchpad の v0710/impl/IP2/sfx）
- 一言: 最初に動く版（案 A〜D・試聴の場・テスト緑の途中）
