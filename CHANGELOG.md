# CHANGELOG

書式: `## vX.Y.Z — YYYY-MM-DD` の下に **目的 / 変更点 / 既知の制約 / 実機テスト結果** を書く。
3か月後の自分が読んで分かる粒度にする。設計値（`data/*.json` の `"source": "design"`）を変えたときは理由も書く。

## v0.1.2 — 2026-10-02（docsのみ）

- 目的: 初回設定もPC不要にする（iPhoneだけで開始できる手順に差し替え）。
- 変更点:
  - `docs/04` §2 を「zipをGitHubにアップロードし、展開はClaude Codeにやらせる」iPhone手順に改訂。展開プロンプトを追加。
  - `docs/04` §2.1 に Public / Private + GitHub Pro / Private + Cloudflare Pages の比較を追加。
  - `README.md` の初回手順を同期。
- 既知の制約: Codeセッションへのファイル添付が使えるかは環境により異なるため、確実な経路（GitHub Webへのzipアップロード）を主手順にした。
- 実機テスト結果: なし（docsのみ）

## v0.1.1 — 2026-10-02（docsのみ）

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

## v0.1.0 — 2026-10-02（docsのみ）

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
