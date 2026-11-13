# wip/v0710-IP3 — v0.7.1 実機 3 回目の直し IP3（弾倉の既定を B に＝U-R1・魚雷の発射の新しい案 E〜I・試聴の場の 5 行）の作業の写し（commit の前）

基準: ブランチ claude/v0.7.1-sfx の HEAD 9a71c21（S0〜S5 ＋ IP1 ＋ IP2）。repo では commit していない（lead が長い門を回してから commit する）。
戻し方: `git checkout 9a71c21` の木で `git apply tracked.patch`、新しいファイルは `files/` を上書き。
- tracked.patch … 追跡済みのファイルの git diff HEAD
- files/ … 新しいファイル（git の追跡外）: src/assets/sfx-recipes-launch2.ts
- tools/ … scratchpad の道具（ana3・fpB・lab-shots・mixrun）、results/ … 文字の結果（音・画像は入れない。WAV と声紋は scratchpad の v0710/impl/IP3/sfx）
- 一言: IP3 最終（弾倉の既定 B＝U-R1・魚雷の新しい案 E〜I・試聴の場 5 行・テスト 3,184・mix 頂 0.712・短い A/B same・CHANGELOG・docs/03）
