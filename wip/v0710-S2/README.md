# wip/v0710-S2 — v0.7.1 S2「砲・着弾・爆発の全部」の作業の写し（commit の前）

基準: ブランチ claude/v0.7.1-sfx の HEAD da1c750（S0＋S1）。repo では commit していない（lead が長い門を回してから commit する）。
コンテナが作り直されたら、この写しから戻す: `git checkout da1c750` の木に `files/` を上書きする（`tracked.patch` は追跡済みの 20 本の `git diff`。新しい 3 本は `files/` だけにある）。

## 入っている物（音・画像のファイルは入れていない）

- `files/` … 変えた・足したファイルの全部（23 本）
  - 新: `src/assets/sfx-recipes-splashes.ts`・`scripts/headless/sfx-probe.mjs`・`scripts/sfx-mixdown.ts`
  - 変: `src/config/sfx-config.ts`、`src/assets/sfx-dsp.ts`・`sfx-bank.ts`・`sfx-recipes-guns.ts`・`sfx-recipes-blasts.ts`、`src/core/sfx-mix.ts`、`src/systems/sfx-engine.ts`・`sfx-bus.ts`・`sfx-boot.ts`・`fx-bus.ts`・`explosion-fx.ts`・`sink-fx.ts`、`scripts/sfx-mix.ts`・`sfx-files.ts`、`tests/sfx-synth`・`sfx-inventory`・`sfx-rules`・`sfx-mix`・`sfx-engine`、`CHANGELOG.md`
- `tracked.patch` … 追跡済みのファイルの `git diff`
- `tools/` … scratchpad の道具（repo には入れない）: `perf-audio.mjs`（AUDIO=1 で実時間に合わせた窓の A/B）・`boot-time.mjs`（Boot の create と音の起動の分）
- `results/` … 文字の結果: `probe-final.log`（20 件の probe）・`mix-final.log`（詰めた後の mix）・`mix-0.log`（詰める前）・`numbers.txt`（10 本の音の数）・`boot-time.log`・`perf-audio.log`・`sfx-live.log`・`ab-long.log`・短い run-gates の SUMMARY 2 本・`npm-test-tail.txt`

## 確かめた事（agent。長い門は lead）

- `npm test` 2,975 件（＋2 todo）・`npm run typecheck`・`npm run build` が通る。
- `sfx-probe` 20 件 OK（同時の声の最大 12・S2 の 9 鍵が全部鳴る）。mix: 一番混む 10 秒の 1.0 超え最大 0.52%。
- `sfx-live`（AUDIO=1・既定・既定の直行・NOAUDIO=1）OK。Boot の create は基準との差 −2〜＋15 ms。
- 短い A/B（main 3a9e7aa と同じビルド番号）: us_02 20 秒・jp_03 ハード 40 秒と、音の鳴る長い 7 件を、音の 3 つの状態で＝全部 same:true。

## 計画とのずれ（報告と CHANGELOG にも書いた）

- 標本は Boot で ui_tap だけ作り、残りは 1 フレームに 1 本（Boot ＋60 ms の門のため。spec §7.4 の `buildNext`）。
- `gun_near` の最小間隔 0.12 → 0.2 秒（フレームの刻みで 1 発おきが揺れるため）。音量の表を詰めた（機銃・近い砲・水柱を下げ、爆発を上げた）。
- 大発の 13mm の発砲音は足さない（着弾音だけ。絵に閃光が無い＝D5）。
- 沈没の 2 次の爆発の「間隔 0.3 秒」は、`core/sfx-mix` の `playAt` の 1 発だけの最小間隔で作った。
- probe は、ページの中で本物の `SfxMixer` をゲームの時計で回す形（偽の時計では再生の時計が進まないため）。エンジンに確かめの口 `tap` と `clockS` を足した。
- mix の道具にリミッタの模型と「小さいスピーカーの目安」を足した（計画には無い）。
