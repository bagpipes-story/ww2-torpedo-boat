# wip/v0710-S3 — v0.7.1 S3「ループ」の作業の写し（commit の前）

基準: ブランチ claude/v0.7.1-sfx の HEAD 3f4bc71（S0〜S2）。repo では commit していない（lead が長い門を回してから commit する）。
コンテナが作り直されたら、この写しから戻す: `git checkout 3f4bc71` の木に `files/` を上書きする（`tracked.patch` は追跡済みの 18 本の `git diff`。新しい 12 本は `files/` だけにある）。

## 入っている物（音・画像のファイルは入れていない）

- `files/` … 変えた・足したファイルの全部（30 本）
  - 新: `src/assets/sfx-recipes-loops.ts`・`src/core/sfx-loops.ts`・`src/systems/sfx-loop-player.ts`・`src/systems/sfx-mission.ts`・`scripts/headless/sfx-offline.mjs`、
    `tests/sfx-loops.test.ts`・`sfx-loops-kit.ts`・`sfx-engine-loops.test.ts`・`sfx-engine-wake.test.ts`・`sfx-engine-kit.ts`・`sfx-synth-loops.test.ts`・`pause-sound.test.ts`
  - 変: `src/config/sfx-config.ts`・`menu-config.ts`、`src/assets/sfx-dsp.ts`・`sfx-bank.ts`、`src/systems/sfx-engine.ts`・`sfx-bus.ts`・`sfx-audio-types.ts`、`src/scenes/hud-scene.ts`・`pause-scene.ts`、
    `scripts/sfx-mix.ts`・`sfx-mixdown.ts`・`scripts/headless/sfx-probe.mjs`・`sfx-live.mjs`、`tests/sfx-engine`・`sfx-synth`・`sfx-inventory`・`sfx-rules`、`CHANGELOG.md`
- `tracked.patch` … 追跡済みのファイルの `git diff`
- `tools/` … scratchpad の道具（repo には入れない）: `perf-audio.mjs`（AUDIO=1 で実時間に合わせた窓の A/B。ループの数つき）・`build-frames.mjs`（標本を作るフレームの長さ）・
  `pause-shot.mjs`（一時停止の画面の写し）・`ab-audio-state.mjs`（AUDIO=1 の再生でループが鳴っているか）・`backup.sh`・CHANGELOG の下書き
- `results/` … 文字の結果: `probe-final.log`（24 件）・`mix-final.log`・`mix-busy.log`（つなぎの案の模型の数）・`offline-final.log`（本物のリミッタ）・`numbers.txt`（ループ 5 本の数）・
  `sfx-live.log`・`heap-audio.log`・`perf-audio.log`・`build-frames.log`・`ab-audio-state.log`・短い run-gates の SUMMARY 2 本・`npm-test-tail.txt`

## 確かめた事（agent。長い門は lead）

- `npm test` 3,066 件（＋2 todo・280 ファイル）・`npm run typecheck`・`npm run build` が通る。
- `sfx-probe` 24 件 OK（ループの目標つき）。`sfx-live` 6 つの流れ OK（ループの波形・一時停止で無音・やり直し 3 回の後も音源 5 個・任務をやめて 0 個）。
- ヒープ（AUDIO=1・120 秒）: 基準 9.2 → S3 9.4 KB/秒。実時間の窓の p95 は ×0.995・×0.970。
- 短い A/B（us_02 20 秒・jp_03 ハード 40 秒 × 音の 3 つの状態）: 全部 same:true。

## 計画とのずれ（報告と CHANGELOG にも書いた）

- ループの束はリミッタを通さず master へ直に（束の音量 0.5）。本物の DynamicsCompressor に通した数で決めた（爆発の飛び出しが 3 dB 前後まで縮むため）。
- `sfx-bus` の口は `sfxLoops(targets, dtS)`・`sfxLoopsPaused`・`sfxLoopsStop`（計画の `sfxLoop(id, gain, rate)` をまとめた）。
- jp_03 の機の爆音は `EvacTelemetry` の狙いのビットと予告の行から（world-art は触らない）。新しい定数 `gainEvacOther` 0.25。
- drone の倍音は 16 本（計画は 8 本。本体のスピーカーで聞こえる帯を足すため）。engine は倍音 6 本に排気の雑音の層を足した。
- `tests/sfx-rules`: core の sfx は同じ core のファイル（テレメトリの型・段の定数）を import してよい。
