# CHANGELOG

書式: `## vX.Y.Z — YYYY-MM-DD` の下に **目的 / 変更点 / 既知の制約 / 実機テスト結果** を書く。
3か月後の自分が読んで分かる粒度にする。設計値（`data/*.json` の `"source": "design"`）を変えたときは理由も書く。

## v0.1.1 — 2026-10-04（ひな形）

- 版番号の注記: 下の「vX.Y.Z（docs）」は引き継ぎ資料の版で、コードの版とは別系統。コードは docs/03 の表の番号を使い、`package.json` の version（0.1.1）はこのエントリを指す。
- 目的: Vite + Phaser 3 + TypeScript のひな形が GitHub Pages で動き、iPhone Safari で黒画面＋FPS＋ビルド番号が出る状態にする（docs/03 v0.1.1）。
- 変更点:
  - `package.json`（version 0.1.1）、`tsconfig.json`（strict）、`vite.config.ts`（`docs/snippets/vite.config.ts` 準拠: `VITE_BASE`・`VITE_BUILD_LABEL`）、`index.html`（viewport-fit=cover、touch-action none、100dvh、背景 `#0b1020`）、`.gitignore`。
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
- 実機テスト結果: （マージ時に追記）

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
