# wip/v0720-S2 — v0.7.2 S2「任務の曲（U-M1）」の作業の写し（commit の前）

基準: ブランチ claude/v0.7.2-bgm の HEAD 4dc84a6（S0・S1）。repo では commit していない（lead が門を回してから commit する）。
戻し方: `git checkout 4dc84a6` の木で `git apply tracked.patch`、新しいファイルは `files/` を上書き。
- tracked.patch … 追跡済みのファイルの git diff HEAD
- files/ … 新しいファイル（git の追跡外）: scripts/sfx-music-stem.ts
src/core/sfx-music-mood.ts
src/systems/sfx-lab-demo.ts
src/systems/sfx-music-duck.ts
src/systems/sfx-music-slots.ts
tests/sfx-engine-mood.test.ts
tests/sfx-lab-demo.test.ts
tests/sfx-music-duck.test.ts
tests/sfx-music-mood.test.ts
- tools/ … scratchpad の道具、results/ … 文字の結果（音・画像は入れない）
- 一言: 最後（CHANGELOG の数を全部埋めた・npm test 3,488 件・296 ファイル・heap・実時間・Boot・最初のタップ。門の行は lead が足す）
