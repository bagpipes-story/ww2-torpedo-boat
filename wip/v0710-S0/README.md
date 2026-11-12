# wip/v0710-S0 — v0.7.1 S0（骨組みと道具）の作業の写し

基準: main 3a9e7aa（ブランチ claude/v0.7.1-sfx。まだ commit していない＝lead が commit する）。作った日 2026-11-12。

- `files/`: repo の中の変えた・足したファイル（repo からの相対の道のまま。上書きで戻せる）
  - 足した: `src/config/sfx-config.ts`・`src/assets/sfx-dsp.ts`・`sfx-bank.ts`・`sfx-recipes-{guns,blasts,cues}.ts`・`src/core/sfx-mix.ts`・
    `tests/sfx-{synth,inventory,rules,mix}.test.ts`・`scripts/sfx-mix.ts`・`scripts/sfx-files.ts`
  - 変えた: `package.json`・`package-lock.json`（0.7.1）・`CHANGELOG.md`（v0.7.1 の項）・`docs/03_開発ロードマップ.md`（v0.7.1 の行）・`scripts/headless/lib.mjs`（`AUDIO=1`・`NOAUDIO=1`）
- `tracked.patch`: 追跡しているファイルの `git diff`（3a9e7aa から）
- `tools/run-gates.sh`: scratchpad の `v0710/tools/run-gates.sh`（v0700 の写しを 3a9e7aa の基準と音の 3 つの状態に直した物）。`tools/audio-state.mjs` は 3 つの状態の確かめ
- `listen/`: `scripts/sfx-mix.ts` の出力（3 本の数 `listen-proxy.txt`・波形と声紋 `sfx-strip.png`）と、短い形の run-gates の SUMMARY 2 つ（us_02 20 秒・jp_03 ハード 40 秒）

戻し方: `cp -r files/. /home/user/ww2-torpedo-boat/`。基準のビルドは `git worktree add --detach <scratch>/v0710/wt-3a9e7aa 3a9e7aa` →
`VITE_BASE=/ww2-torpedo-boat/ VITE_BUILD_REF=main VITE_BUILD_SHA=3a9e7aa npx vite build --outDir <scratch>/v0710/base-3a9e7aa`。
全部の門: `bash <scratch>/v0710/tools/run-gates.sh S0`（45〜50 分）。S0 が commit されたらこの写しは消してよい。
