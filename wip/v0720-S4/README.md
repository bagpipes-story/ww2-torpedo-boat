# wip/v0720-S4 — v0.7.2 S4「仕上げ（束を門の内へ・docs）」の作業の写し（commit の前）

基準: ブランチ claude/v0.7.2-bgm の HEAD d453ac4（S0〜S3・IP1・IP2）。repo では commit していない（lead が門を回してから commit する）。
戻し方: `git checkout d453ac4` の木で `git apply tracked.patch`、新しいファイルは `files/` を上書き。
- tracked.patch … 追跡済みのファイルの git diff HEAD
- files/ … 新しいファイル（git の追跡外）: なし
- tools/ … scratchpad の道具、results/ … 文字の結果（音・画像は入れない）
- 一言: 途中: 効果音の試聴の案（魚雷の発射 A〜E・G〜I・弾倉 A・C・D）と D（前）を src から外した（tests はまだ）
