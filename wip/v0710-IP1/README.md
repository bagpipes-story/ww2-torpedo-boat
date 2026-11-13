# wip/v0710-IP1 — v0.7.1 実機 1 回目の直し IP1（弾倉の交換の音・魚雷の発射の音の作り直し）の作業の写し（commit の前）

基準: ブランチ claude/v0.7.1-sfx の HEAD f020a1e（S0〜S5）。repo では commit していない（lead が長い門を回してから commit する）。
戻し方: `git checkout f020a1e` の木で `git apply tracked.patch`、新しいファイルは `files/` を上書き。
- tracked.patch … 追跡済みのファイルの git diff HEAD
- files/ … 新しいファイル（git の追跡外）: なし
- tools/ … scratchpad の道具（ana・peaks・tune-ip1・mixrun・cmp）、results/ … 文字の結果（音・画像は入れない。WAV と声紋は scratchpad の v0710/impl/IP1/sfx）
- 一言: 最初の動く版（reload・torp_launch の作り直し・テストの指紋。docs はまだ）
