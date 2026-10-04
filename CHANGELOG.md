# CHANGELOG

書式: `## vX.Y.Z — YYYY-MM-DD` の下に **目的 / 変更点 / 既知の制約 / 実機テスト結果** を書く。
3か月後の自分が読んで分かる粒度にする。設計値（`data/*.json` の `"source": "design"`）を変えたときは理由も書く。

## v0.1.2 — 2026-10-04（艇の運動）

- 目的: バーチャルスティックで艇が動き、カメラが追従し、速力段と舵が HUD に出る（docs/03 v0.1.2）。前回の既知の制約「描画解像度が論理解像度のまま」を解消する。
- 変更点:
  - 描画解像度: `RENDER_SCALE = max(1, FIT で表示される CSS px / 論理 px × min(devicePixelRatio, 2))` でゲームサイズを作り、各シーンのカメラを同倍率でズームして論理座標 1280×720 を保つ（CLAUDE.md §7「resolution は min(dpr,2)」を表示サイズ基準で適用。論理 px に掛けると FIT で縮む分だけ物理画素より大きな canvas を塗ってしまう）。iPhone 15 で約 1.09、デスクトップ 1920 幅で 1.5。`Text` は `style.resolution = RENDER_SCALE`、生成テクスチャも同倍率で作って `setScale(1/RENDER_SCALE)`。
  - シーン分割: `MissionScene`（ワールド、ズーム 0.75×RENDER_SCALE、艇に追従）と `HudScene`（HUD・操作、ズーム RENDER_SCALE）。Mission が `scene.launch` で HUD を手前に起動し、shutdown で止める。
  - `src/core/boat-motion.ts`: 運動モデル（docs/02 §6.1）。目標速度へ加速度/減速度で近づく、旋回 = 舵×`turn_rate_deg_s`、速度ベクトルは船首方向（横滑りなし）、方位は [0,360)（0=北=画面上、時計回り）。`throttleToTargetSpeed`（+1 全速 / 0 巡航 / `THROTTLE_SILENT`=-0.5 静音 / -1 停止の区分線形）、`nearestSpeedStep`（毎フレーム呼ぶので配列を作らない）、`clampToBounds`、`boatParamsFromData`（kt→m/s）。`BoatTelemetry` 型もここ。
  - `src/core/fixed-stepper.ts`: 固定ステップ累積器（1/60 s × time_scale、最大 4 回/フレーム。回し切っても 1 ステップ以上残る巨大 delta だけ捨て、上限ちょうどのフレームの端数は持ち越すので低フレームレートでも時間は遅れない）。`src/core/input-state.ts`: 共有入力状態と `applyDeadZone`（境界で連続）。`units.ts` に `wrapDeg360`・`clamp`。
  - `src/entities/player-boat.ts`: 自艇（白い船形ポリゴン、`sprite_scale` 倍）。`src/assets/placeholders.ts`: 艇・スティック・舵バーを起動時に 1 回だけテクスチャ化。
  - `src/systems/virtual-stick.ts`: 画面左半分のタッチ開始点に出るフローティング・スティック（半径 110、デッドゾーン 0.12）。画面端で押しても円が収まるよう原点を内側へ寄せる。X=舵、Y=スロットル（上=全速）。マルチタッチは `phaser-config.ts` の `input.activePointers`（マウス 1＋タッチ 3）。`src/systems/keyboard-input.ts`: PC デバッグ用 矢印/WASD。
  - `src/ui/boat-hud.ts`: 右下に 速力(kt)・速力段（停止/静音/巡航/全速）・針路・舵バー（静的バー＋マーカー位置のみ更新）。`debug-hud.ts` はビルド番号を上中央へ移動。
  - 海: 100 m 格子と境界線を 1 つの `Graphics` に起動時 1 回だけ記録する（線 100 本）。`TileSprite` は表示サイズ分の canvas を内部に作るため、海域全体 6,000×4,000 m（24M px）では iOS Safari の canvas 上限 16.7M px を超えて使えない（レビューで判明。ヘッドレス Chromium では再現しない）。艇は船体の半分（`length_m × sprite_scale / 2`）だけ境界の内側に押し戻す。
  - `data/missions_seed.json`: `us_02.v0_1_prototype` に `bounds_m`（6,000×4,000 m）と `player_start`（3,000, 3,200 m、北向き）を design 値として追加。理由: docs/02 §6.1 の「ミッションごとに海域境界 bounds_m を持つ」に対応する値が無かった。広さは zoom 0.75 の画面幅 ≈1,700 m と、全速 39 kt × time_scale 5 ≈ 100 m/s で 60 秒走ると端に届く長さから決めた。
  - テスト: `tests/boat-motion.test.ts`（Elco の kt→m/s を data レコードと比較、スロットル区分点と単調性、加減速の頭打ちを途中も検査、dt≠1 の旋回、方位 0=北/90=東と変位量、横滑りなし、舵ありの dt 分割、dt=0、海域 data の存在と広さ、境界押し戻し）、`tests/fixed-stepper.test.ts`（16fps で時間が遅れない回帰テスト含む）、`tests/input-state.test.ts`。
  - CLAUDE.md §3: ビルド番号の表示位置を「画面の隅」→「上部中央」に改訂（左下=スティック、右下=速力 HUD、右上=煙幕ボタン予定）。docs/04 §4 も同期。
- 既知の制約:
  - 旋回率 24°/s（design）は time_scale 5 で 120°/s 相当になり速く感じる可能性がある。実機で「意図通り曲がる」かを見て `boats.json` の `turn_rate_deg_s` を調整する（速度に応じた旋回率の減衰は未実装。docs/02 §6.1 どおり舵×旋回率のみ）。
  - DPR 3 の iPhone では §7 の上限 2 により canvas が物理画素の約 2/3（論理の約 1.1 倍）になり、文字はわずかに甘い。完全にシャープにするには §7 の上限を超える必要があり、ユーザー判断事項。
  - 海域境界では位置を押し戻すだけ（docs/02 §6.1 の「帰投ポイントへ戻る導線」は v0.3 の帰投で扱う）。
  - HUD の safe-area 補正は未実装（横持ちの黒帯がノッチを吸収する想定）。縦持ちは未対応。
  - 右半分のタッチは何も起きない（魚雷ボタンは v0.1.3）。
- 実機テスト結果（2026-10-04、ビルド claude/v0.1.2-boat-motion@d80631a）: 結果良好（iPhone 実機でスティック操作・カメラ追従・HUD を確認）。

## v0.1.1 — 2026-10-04（ひな形）

- 版番号の注記: 下の「vX.Y.Z（docs）」は引き継ぎ資料の版で、コードの版とは別系統。コードは docs/03 の表の番号を使い、`package.json` の version（0.1.1）はこのエントリを指す。
- 目的: Vite + Phaser 3 + TypeScript のひな形が GitHub Pages で動き、iPhone Safari で黒画面＋FPS＋ビルド番号が出る状態にする（docs/03 v0.1.1）。
- 変更点:
  - `package.json`（version 0.1.1）、`tsconfig.json`（strict）、`vite.config.ts`（`docs/snippets/vite.config.ts` 準拠: `VITE_BASE`・`VITE_BUILD_LABEL`）、`index.html`（viewport-fit=cover、touch-action none、100dvh、余白 `#000`。海の色 `#0b1020` は Phaser の backgroundColor 側）、`.gitignore`。
  - `src/main.ts`: Phaser.Game 生成のみ。1280×720、`Scale.FIT`＋`CENTER_BOTH`、Arcade は `fixedStep`。
  - `src/config/game-config.ts`（画面定数・Registry キー・シーンキー）、`src/config/game-data.ts`（`data/*.json` 6本を Vite の JSON import でバンドルし、型付きの `gameData` として提供）。
  - `src/scenes/boot-scene.ts`: `gameData` を Registry に置いて Mission へ。`src/scenes/mission-scene.ts`: 黒い海＋デバッグHUD。
  - `src/ui/debug-hud.ts`: 左上 FPS（250ms 間隔で整数化し、前回値と違うときだけ `setText`）、左下ビルド番号＋データ版、右上 論理解像度。
  - `src/core/units.ts`: kt⇄m/s（1kt=0.5144m/s）、yd⇄m、海里⇄m、度⇄rad、`wrapDeg180`。`tests/units.test.ts`（KPI 距離帯の境界 366/732/1097/1829m が `hit_rate_model.json` と一致することも検証）、`tests/core-no-phaser.test.ts`（`src/core` が phaser を import したら落ちる）。
  - 型検査: `tsconfig.json`（ブラウザ側 `src/`、Node の型なし）と `tsconfig.node.json`（`vite.config.ts`・`tests/`）に分割。`npm run build` は `typecheck` を先に走らせるので、既存の `deploy-pages.yml` を変えずに CI でも型エラーで止まる。`npm run lint` は当面 `typecheck` と同じ（ESLint は未導入）。
  - FIT の余白は黒（docs/02 §2）。海の色 `#0b1020` は Phaser の `backgroundColor` 側に置き、プレイ領域の縁が見えるようにした。
  - HUD 右上は「論理解像度 -> 実表示サイズ @DPR」。`Scale.Events.RESIZE` のときだけ更新する。
  - `.npmrc` に `legacy-peer-deps=true`。Node 22 同梱の npm 10.9.4 が vitest 4 の optional peer を解決中に落ちる不具合（`Cannot read properties of null (reading 'edgesOut')`）の回避。lockfile からの `npm ci` は .npmrc 無しでも通ることを確認済み。
- 依存の判断: Phaser は最新が 4.x だが CLAUDE.md §2 の確定判断に従い 3.90.0。Vite 8・Vitest 5・TypeScript 7 は直近のメジャー更新のため、ひな形は Vite 7.3・Vitest 4.1・TS 5.9 で組んだ。更新は別 PATCH で扱う。
- 既知の制約:
  - 描画解像度は論理解像度 1280×720 のまま（Phaser 3 には `resolution` 設定が無く、§7 の `min(dpr,2)` は「ゲームサイズ×DPR＋カメラズーム」で実現する）。高DPI 端末では文字がやや甘い。v0.1.2 で HUD と一緒に対応する。
  - HUD の safe-area 補正は未実装。横持ちでは 16:9 の黒帯がノッチを吸収するため実害は出ない想定。縦持ちは未対応（横持ち前提、docs/02 §2）。
  - data/*.json はバンドルされるため、数値変更にはビルド（push）が必要。運用上は毎回 push するので問題にしない。
  - Vite が Phaser のチャンクサイズ（約 1.2MB、gzip 約 330KB）に警告を出すが、ビルドは成功する。Vite の既定 `mainFields` により Phaser は UMD ビルド（`dist/phaser.js`）が束ねられる。動作に問題はなく、ESM ビルドへの切替は必要になったときに検討する。
- 実機テスト結果（2026-10-04、ビルド claude/v0.1.1-scaffold@b1fb814）: iPhone 18 横持ちで FPS 60、ビルド番号一致、引っ張り更新なし。

## v0.1.2（docs） — 2026-10-02 引き継ぎ資料のみ

- 目的: 初回設定もPC不要にする（iPhoneだけで開始できる手順に差し替え）。
- 変更点:
  - `docs/04` §2 を「zipをGitHubにアップロードし、展開はClaude Codeにやらせる」iPhone手順に改訂。展開プロンプトを追加。
  - `docs/04` §2.1 に Public / Private + GitHub Pro / Private + Cloudflare Pages の比較を追加。
  - `README.md` の初回手順を同期。
- 既知の制約: Codeセッションへのファイル添付が使えるかは環境により異なるため、確実な経路（GitHub Webへのzipアップロード）を主手順にした。
- 実機テスト結果: なし（docsのみ）

## v0.1.1（docs） — 2026-10-02 引き継ぎ資料のみ

- 目的: 開発をiPhoneだけで回せるように、Claude Codeクラウドセッション＋GitHub Pages自動デプロイ前提に組み替える。
- 変更点:
  - `docs/04_iPhone完結ワークフロー.md` 新規（初回PC作業45分、毎回のiPhoneループ、困ったとき）
  - `.github/workflows/deploy-pages.yml` 新規（どのブランチのpushでもビルドしてPagesに公開。`package.json` が無い間はプレースホルダー）
  - `.claude/settings.json`・`scripts/install_pkgs.sh` 新規（クラウドでのみ `npm ci`、npm/git/ghを許可）
  - `docs/snippets/vite.config.ts` 新規（Pagesの `base` とビルド番号注入）
  - `optional/claude.yml` 新規（任意の `@claude` 連携）
  - `CLAUDE.md` §3・§5・§6 をクラウド前提に改訂、§12 追加
  - `README.md`・`prompts/` をiPhoneから貼る短い形に改訂、`prompts/feedback_template.md` 追加
- 既知の制約:
  - GitHub Pages を無料プランで使うにはリポジトリを Public にする必要がある（Private は GitHub Pro か Cloudflare Pages）。
  - `github-pages` 環境の Deployment branches を「No restriction」にしないと作業ブランチからのデプロイが失敗する（docs/04 §2 #4）。
  - 2つのセッションを同時に走らせると、Pagesは最後にpushされた方を公開する。
- 実機テスト結果: なし（docsのみ）

## v0.1.0（docs） — 2026-10-02 引き継ぎ資料のみ

- 目的: Claude Codeで開発を始められる引き継ぎ一式を作る。
- 変更点:
  - `CLAUDE.md`（作法・性能ガードレール・バージョン規約）を新規作成
  - `docs/01_史実リサーチ＆設計資料.md`（史実調査、確定判断、命中率方針、日本側ハードモード案）
  - `docs/02_ゲーム設計書_v0.1.md`（仕様）
  - `docs/03_開発ロードマップ.md`（v0.1.0〜v1.0.0 のDone定義）
  - `data/*.json`（艇・魚雷・敵・命中率・リスク・ミッションの初期値）
  - `prompts/`（kickoff と セッションテンプレ）
- 既知の制約:
  - コードは未作成。v0.1.1 以降で Vite + Phaser のひな形から始める。
  - `data/*.json` の `"source": "design"` の値はプレイテスト前の提案値。
  - 史実側の未確認事項は `docs/01` §13 を参照。
- 実機テスト結果: なし（docsのみ）
