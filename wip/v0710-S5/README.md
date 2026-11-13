# wip/v0710-S5 — v0.7.1 S5「仕上げ」の作業の写し（commit の前）

基準: ブランチ claude/v0.7.1-sfx の HEAD 6b64658（S0〜S4）。repo では commit していない（lead が長い門を回してから commit する）。
戻し方: `git checkout 6b64658` の木で `git apply tracked.patch`、新しいファイルは `files/` を上書き。
- tracked.patch … 追跡済みのファイルの git diff HEAD
- files/ … 新しいファイル（git の追跡外）: 
- tools/ … scratchpad の道具、results/ … 文字の結果（音・画像は入れない）
- 一言: S5 mix の詰め（世界の音 −6 dB・合図・被弾 2 秒・咳 8 秒）。docs はまだ
