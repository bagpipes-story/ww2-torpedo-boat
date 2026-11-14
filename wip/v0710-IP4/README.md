# wip/v0710-IP4 — v0.7.1 実機 4 回目の直し IP4（魚雷の発射の既定を F に＝U-R2・弾倉 B は確定＝U-R1・試聴の場は残す）の作業の写し（commit の前）

基準: ブランチ claude/v0.7.1-sfx の HEAD 10edb02（S0〜S5 ＋ IP1〜IP3）。repo では commit していない（lead が門を回してから commit する）。
戻し方: `git checkout 10edb02` の木で `git apply tracked.patch`、新しいファイルは `files/` を上書き。
- tracked.patch … 追跡済みのファイルの git diff HEAD
- files/ … 新しいファイル（git の追跡外）: なし
- tools/ … scratchpad の道具（fp4・anaF・lab-shots・mix）、results/ … 文字の結果（音・画像は入れない。写しは scratchpad の v0710/impl/IP4/shots）
- 一言: IP4 最終（魚雷の既定 F＝U-R2・U-R1 確定・試聴の場の説明・テスト 3,187・mix 頂 0.712・一斉発射・probe 11 件・短い A/B same・CHANGELOG・docs/02・docs/03）
