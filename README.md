# WWII魚雷艇ゲーム 引き継ぎ資料（v0.1.2）

**方針: PC不要。初回設定も含めてiPhoneだけで、Claude Codeのクラウドセッション（Claudeアプリ → Codeタブ）を回し、GitHub Pagesに自動デプロイされたビルドをiPhone Safariで遊んで確認する。**
運用の詳細は `docs/04_iPhone完結ワークフロー.md`。

## 中身

| パス | 内容 | 使い方 |
| --- | --- | --- |
| `CLAUDE.md` | プロジェクトの作法（進め方・性能ガードレール・バージョン規約・クラウド前提） | Claude Codeが毎回読む |
| `CHANGELOG.md` | 変更ログ | バージョンを上げるたびに追記 |
| `docs/01_史実リサーチ＆設計資料.md` | 史実の調査結果、確定した設計判断、命中率方針、日本側ハードモード案 | 数値や任務の根拠 |
| `docs/02_ゲーム設計書_v0.1.md` | 仕様（コアループ、操作、システム、数値、非目標） | 実装の正 |
| `docs/03_開発ロードマップ.md` | v0.1.0〜v1.0.0 のDone定義と実機テスト項目 | セッション冒頭で該当バージョンを読む |
| `docs/04_iPhone完結ワークフロー.md` | 初回PC作業（45分）と毎回のiPhoneループ、困ったとき | 運用の正 |
| `docs/snippets/vite.config.ts` | Pages用の `base` とビルド番号注入の雛形 | v0.1.1でClaude Codeが使う |
| `data/*.json` | 艇・魚雷・敵・命中率・リスク・ミッションの数値 | ゲームはここだけから数値を読む |
| `.github/workflows/deploy-pages.yml` | どのブランチのpushでもビルドしてGitHub Pagesに公開 | 触らない |
| `.claude/settings.json` ＋ `scripts/install_pkgs.sh` | クラウドセッション開始時に `npm ci`、`npm`/`git`/`gh` を許可 | 触らない |
| `prompts/claude_code_kickoff.md` | 最初のセッションで貼る短いプロンプト | v0.1.1を始めるとき |
| `prompts/session_template.md` | 2回目以降のセッション用 | 毎回 |
| `prompts/feedback_template.md` | 実機で遊んだ感想を返すときの型 | 毎回 |
| `optional/claude.yml` | 任意: GitHubのIssueから `@claude` で動かす設定 | 使うときだけ |

## 最初だけやること（iPhoneだけで可、約30分）

1. Safariで github.com/new → `ww2-torpedo-boat` を「Add a README file」オンで作る（試作中は **Public** 推奨。Privateにするなら `docs/04` §2.1）
2. Claudeアプリでこのzipを「"ファイル"に保存」
3. Safari（PC向け表示）でリポジトリ → **Add file → Upload files** → zipを選んで Commit
4. **Settings → Pages → Source: GitHub Actions**
5. **Settings → Environments → github-pages → Deployment branches and tags → No restriction**（無ければ最初のデプロイ失敗後に）
6. Claudeアプリ → **Code** → Sign in with GitHub → Claude GitHub App をこのリポジトリにインストール
7. Code でリポジトリを選び、`docs/04` §2 の「展開プロンプト」を貼る（zipを展開してmainにpushする）
8. **Actions** が緑になったら `https://<user>.github.io/ww2-torpedo-boat/` を開き「パイプラインは動いています」を確認 → ホーム画面に追加

Node.jsのインストールは不要（ビルドはクラウドとGitHub Actionsで行う）。PCがあれば `git push` でも可。

## 毎回のiPhoneループ

1. Claudeアプリ → **Code** → `ww2-torpedo-boat` → モード **Accept edits**
2. `prompts/` のテンプレを貼る（初回は kickoff、以後は session_template）
3. 放置。終わるとセッションに Pages URL・ビルド番号・実機テスト項目が書かれる
4. Pages URLをSafariで開いて遊ぶ（ビルド番号を確認）
5. 感想を `prompts/feedback_template.md` の型で返す。納得したら「マージして v0.x.y にタグを打って」

## 確定している設計判断

- 日本側は弱者視点（回避・輸送・隼艇の護衛・生還）のハードモード
- 「当たらない魚雷」はコンセプトに残すが、命中率は爽快感側に傾ける（正しく狙った1本で35〜45%が目標）
- 主軸は米PT（Elco 80ft）キャンペーン
- Phaser 3 + TypeScript + Vite、PWA先行、App StoreはCapacitor + GitHub Actions
- 開発はClaude Codeクラウドセッション、確認はGitHub Pages（iPhone完結）

## 最初にやること

v0.1.1「ひな形がPagesで動く」だけを作る。詳細は `docs/03_開発ロードマップ.md` のv0.1.0〜v0.1.3。
