# wip/v0710-S3 — v0.7.1 S3「ループ」の作業の写し

- 基準: ブランチ claude/v0.7.1-sfx の HEAD 3f4bc71（S0〜S2 が commit・push 済み）。この写しは S3 の未 commit の作業木（agent）。
- 戻し方: `files/` の中身を repo の同じ道に上書きする（足したファイルは新規、変えたファイルは置き換え）。`tools/` は scratchpad の道具（repo には入れない）。
- 中身（S3）: ループ 5 本の作り方（`src/assets/sfx-recipes-loops.ts`）・観測器（`src/core/sfx-loops.ts`）・再生（`src/systems/sfx-loop-player.ts`）・任務の音（`src/systems/sfx-mission.ts`）・
  Hud の配線・一時停止の「音」ボタン・テスト（`tests/sfx-loops*`・`sfx-engine-loops`・`sfx-engine-kit`・`sfx-engine-wake`・`sfx-synth-loops`・`pause-sound`）・
  道具（`scripts/headless/sfx-probe.mjs`・`sfx-live.mjs`・新 `sfx-offline.mjs`・`scripts/sfx-mix.ts`・`sfx-mixdown.ts`）・CHANGELOG の S3 の塊。
- 決め: ループの束はリミッタを通さず master へ直に（束の音量 0.5）。数は CHANGELOG の S3。
- 音・画像（WAV・PNG）は入れていない（scratchpad の v0710/impl/S3/sfx・shots）。
