# wip/v0720-IP2 — v0.7.2 IP2「実機 2 回目の直し（D を名曲に）」の作業の写し（commit の前）

基準: ブランチ claude/v0.7.2-bgm の HEAD b9ad197（S0〜S3・IP1）。repo では commit していない（lead が門を回してから commit する）。
戻し方: `git checkout b9ad197` の木で `git apply tracked.patch`、新しいファイルは `files/` を上書き。
- tracked.patch … 追跡済みのファイルの git diff HEAD
- files/ … 新しいファイル（git の追跡外）: src/assets/sfx-music-arrange.ts
src/assets/sfx-music-plan.ts
src/assets/sfx-music-score.ts
src/assets/sfx-music-theory.ts
tests/sfx-music-plan.test.ts
tests/sfx-music-score.test.ts
- tools/ … scratchpad の道具、results/ … 文字の結果（音・画像は入れない）
- 一言: 終わり: IP2 の実装・tests 3,633 件・数（種の上位 5・指紋・作る費用・Chromium・メニューの mix・live 4 つ・短い run-gates 18 組）・CHANGELOG・docs/03
