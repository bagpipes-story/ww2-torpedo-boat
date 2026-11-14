# wip/v0720-S1 — v0.7.2 S1（メニューの曲・「曲」ボタン・曲の試聴の場）の作業の写し（commit の前）

基準: ブランチ claude/v0.7.2-bgm の HEAD 89a43a3（S0）。repo では commit していない（lead が門を回してから commit する）。
戻し方: `git checkout 89a43a3` の木で `git apply tracked.patch`、新しいファイルは `files/` を写す。
- tracked.patch … 追跡済みのファイルの git diff HEAD
- files/ … 新しいファイル（git の追跡外）: src/config/music-lab-config.ts
src/scenes/music-lab-scene.ts
src/systems/sfx-music-build.ts
src/systems/sfx-music-player.ts
src/systems/sfx-watchdog.ts
src/ui/music-lab-layout.ts
- tools/ … scratchpad の道具（backup.sh・測りの道具）、results/ … 文字の結果
- 一言: 途中: 見張りを分けた・曲の再生と作る列・口・設定・Boot・MissionSfx・Title・Pause・Result・曲の試聴の場（テストはまだ）
