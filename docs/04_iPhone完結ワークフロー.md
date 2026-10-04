# iPhone完結ワークフロー（Claude Code クラウドセッション＋GitHub Pages）

- 版: v0.1.2（2026-10-02）
- 方針: **PCは不要。初回設定（約30分）も含めて、iPhoneのClaudeアプリ（Codeタブ）とSafariで開発を回し、GitHub Pagesに自動デプロイされたビルドをiPhone Safariで遊んで確認する。**
- 根拠（公式ドキュメント、2026-10-02確認）: クラウドセッションはPro/Max/Teamで使え、iPhoneアプリのCodeタブからリポジトリとブランチを選んでタスクを投げられる。VMはUbuntu 24.04、Node 20/21/22・npm・git・ghがプリインストール。既定の「Trusted」ネットワークで npm レジストリとGitHubに届く。セッションはスマホを閉じても走り続け、ブランチをpushし、PRを作れる。「このPRを監視してCI失敗を直して」と頼めばAuto-fixも効く。

## 1. 全体像

```
[iPhone] Claudeアプリ → Code → リポジトリ選択 → タスク送信
    ↓
[クラウドVM] clone → npm ci → 実装 → vitest → vite build → commit → push → PR作成
    ↓ push をトリガに
[GitHub Actions] npm ci → test → build → GitHub Pages にデプロイ（どのブランチでも最新pushが公開）
    ↓ 1〜2分
[iPhone Safari] https://<user>.github.io/ww2-torpedo-boat/ を開いて遊ぶ（ホーム画面に追加）
    ↓
[iPhone] 同じセッションに感想を返す → 修正 → 再デプロイ …… 納得したら「マージして v0.x.y にタグを打って」
```

ポイントは3つ。**(1)** コードを書くのも動かすのもクラウド。PCは要らない。**(2)** 「最新のpushがそのまま遊べる」ので、マージ前にiPhoneで試せる。**(3)** タイトル画面にビルド番号（ブランチ名＋コミット）を出し、どのビルドを見ているか迷わないようにする。

## 2. 最初だけやること（iPhoneだけで可、約30分。PC不要）

鍵は「引き継ぎzipをリポジトリに1回アップロードし、展開はClaude Codeにやらせる」こと。SafariはページメニューからPC向け表示（デスクトップ用Webサイトを表示）にすると GitHub の全メニューが出る。

| # | 作業 | どこで | 詳細 |
| --- | --- | --- | --- |
| 1 | リポジトリ作成 | Safari: github.com/new | 名前 `ww2-torpedo-boat`。「Add a README file」をオンにして作る（mainブランチができる）。可視性は §2.1 を読んで決める（試作中は **Public** 推奨） |
| 2 | zipを保存 | Claudeアプリ | この引き継ぎzipのカードをタップ → 共有 → 「"ファイル"に保存」 |
| 3 | zipをアップロード | Safari: リポジトリ → **Add file → Upload files** | 「ファイル」から zip を選んで **Commit changes**（zipがそのままmainに入る。約60KB） |
| 4 | Pagesを有効化 | Safari: **Settings → Pages** | **Build and deployment → Source: GitHub Actions** |
| 5 | 環境保護を解除 | Safari: **Settings → Environments → github-pages** | **Deployment branches and tags → No restriction**。まだ `github-pages` が無ければ、最初のデプロイが失敗した後に同じ操作をする（エラー文: not allowed to deploy to github-pages due to environment protection rules） |
| 6 | Claude CodeにGitHubを接続 | Claudeアプリ → **Code**（または Safari: claude.ai/code） | 案内に従って **Sign in with GitHub** → Claude GitHub App を `ww2-torpedo-boat` にインストール（Privateなら必須、Publicでも Auto-fix のために推奨）。Pro/Maxなら **Default** 環境（Trusted）が自動で作られる |
| 7 | 展開セッション | Claudeアプリ → Code → `ww2-torpedo-boat` → Accept edits | 下の「展開プロンプト」を貼る。Claude Codeがzipを展開してmainにpushし、Actionsがプレースホルダーを公開する |
| 8 | 配管の確認 | Safari | **Actions** が緑になったら `https://<user>.github.io/ww2-torpedo-boat/` を開く。「パイプラインは動いています」が出れば完成。「ホーム画面に追加」しておく |
| 9 | （任意）@claude用トークン | PC | GitHubのIssueから `@claude` で動かしたい場合のみ。`claude setup-token` でトークンを取得し **Settings → Secrets and variables → Actions** に `CLAUDE_CODE_OAUTH_TOKEN` を登録、`optional/claude.yml` を `.github/workflows/` に移す。通常運用には不要 |

**展開プロンプト（#7で貼る）**

```
リポジトリ直下にある ww2-torpedo-boat-handoff_*.zip を展開し、中の ww2-torpedo-boat-handoff/ の内容を（.github や .claude などドットで始まるフォルダも含めて）リポジトリ直下に移して、zipは削除して。README.md は zip の方で上書き。終わったら CLAUDE.md と docs/04 を読んで3行で要約し、PRは作らず main に直接 push して。
```

Codeセッションにファイルを添付できる場合は、#3の代わりにzipを添付して同じ指示でもよい。Node.jsのインストールは不要（ビルドはクラウドとActionsで行う）。PCを使うなら `git push` の方が速いが、必須ではない。

### 2.1 Private か Public か

| 選択 | GitHub Pages | 費用 | 向き |
| --- | --- | --- | --- |
| Public | 使える | 無料（Actionsも無制限） | 試作中。いまの中身は設計資料と数値だけで、公開されて困るものがない |
| Private + GitHub Pro | 使える | 月額約4ドル | 販売が見えてきて、コードを隠したい段階 |
| Private + Cloudflare Pages | 使わない（Cloudflareが代わり） | 無料 | Privateを無料で。ブランチごとのプレビューURL（`https://<branch>.<project>.pages.dev`）が自動で出る |

推奨は「Publicで始めて、販売前にPrivate＋Cloudflare Pagesへ切り替える」。切り替えは1セッションで済む（Cloudflareのダッシュボードでリポジトリを接続し、ビルドコマンド `npm run build`、出力 `dist`、環境変数 `VITE_BASE=/` を設定。`deploy-pages.yml` は削除）。Cloudflareの接続操作もiPhoneのブラウザでできる。

## 3. 毎回のiPhoneループ（5ステップ）

1. **Claudeアプリ → Code → `ww2-torpedo-boat` を選択**。ブランチは `main`。モードは **Accept edits**（Autoが出る場合はAutoでも可）。
2. **プロンプトを貼る**。`prompts/claude_code_kickoff.md`（初回）または `prompts/session_template.md`（2回目以降）をメモ帳に入れておき、`{{ }}` だけ埋めて貼る。長文を打たなくていいようにしてある。
3. **放置する**。クラウドで実装・テスト・ビルド・push・PR作成まで進む。終わるとセッションに「Pages URL」と「ビルド番号」と「実機テスト項目」が書かれる。
4. **Pages URLをSafariで開いて遊ぶ**（1〜2分でデプロイされる。タイトル画面のビルド番号がPRのコミットと一致しているか確認）。
5. **同じセッションに感想を返す**。`prompts/feedback_template.md` の形式で短く。直ったら「**マージして v0.x.y にタグを打って、CHANGELOGに実機テスト結果を書いて**」と送る。

セッションは放置すると休止するが、開き直せば会話履歴ごと復元される。CIが落ちたら「このPRを監視してCI失敗を直して」と送るとAuto-fixが働く。

## 4. 仕組みの中身（Claude Codeが守ること）

| 部品 | 役割 |
| --- | --- |
| `.github/workflows/deploy-pages.yml` | どのブランチへのpushでも `npm ci → test → build → Pages` を実行。`package.json` がまだ無いときはプレースホルダーを公開する |
| `.claude/settings.json` | セッション開始時に `scripts/install_pkgs.sh` を実行（クラウドでのみ `npm ci`）。`npm`/`git`/`gh` を許可してプロンプトの承認待ちを減らす |
| `scripts/install_pkgs.sh` | `CLAUDE_CODE_REMOTE=true` のときだけ依存をインストール |
| `docs/snippets/vite.config.ts` | `base` を `VITE_BASE`（Actionsが `/ww2-torpedo-boat/` を渡す）から取り、ビルド番号を `import.meta.env` に注入する雛形 |
| ビルド番号表示 | タイトル画面（v0.1はMissionのHUD上部中央）に `VITE_BUILD_REF@VITE_BUILD_SHA(先頭7桁)` を表示。v0.5のPWA化以降はService Workerを `autoUpdate` にし、古いキャッシュで迷わないようにする |

セッションの終わり方（CLAUDE.md §6 に同じ）: 変更をcommitしてpush → `gh pr create`（既にPRがあればpushのみ）→ Pages URL・ビルド番号・実機テスト項目を報告。**ローカルで動かす前提の指示（`npm run dev -- --host` など）は使わない。**

## 5. 困ったとき

| 症状 | 対処 |
| --- | --- |
| Actionsが「not allowed to deploy to github-pages」で失敗 | §2の#4（github-pages環境の Deployment branches を No restriction） |
| Pages URLが古いまま | Actionsのデプロイ完了を待つ（1〜2分）。Safariでリロード。v0.5以降はアプリ内のビルド番号を見る |
| セッションが「Environment expired」 | セッションを開き直す。履歴は復元される。走っていたコマンドは再実行を頼む |
| `npm ci` が lockfile 不一致で失敗 | 「package-lock.json を作り直して」と頼む |
| リポジトリが一覧に出ない | Privateなら Claude GitHub App のインストール対象に入っているか確認（§2の#6） |
| 2つのセッションを同時に走らせたら表示が入れ替わる | Pagesは「最後にpushされたブランチ」を公開する。ゲームの作業は1セッションずつ |
| 「タグを打って」と頼んだのに `git push origin vX.Y.Z` が 403 / unexpected disconnect で失敗する | クラウドセッションの GitHub 経路は `refs/tags` への書き込みを許可していない（ブランチの push は通る。API のタグ作成も不可）。iPhone の Safari で **リポジトリ → Releases → Draft a new release → Choose a tag に `vX.Y.Z` を入力 → Target: main → Publish release** でタグを作る。PC があれば `git tag vX.Y.Z && git push origin vX.Y.Z` でもよい |
| PrivateリポジトリでPagesが使えない | GitHub Proにするか、Cloudflare Pages（無料、GitHub連携でブランチごとのプレビューURL `https://<branch>.<project>.pages.dev`）に切り替える。切替時は `deploy-pages.yml` を外す |

## 6. 使わないもの（混同しやすい）

- **Remote Control / Dispatch**: PCで動くClaude Codeをスマホから操作する機能。PCを起動し続ける必要があるので今回は使わない。
- **ローカル開発サーバー**: 使わない。確認は常にPages URL。
- **Routines（定期実行）**: 今は不要。将来「毎晩テストを回す」等に使える。

## 7. App Store配信（v0.8）の見通し

Capacitorでラップし、GitHub ActionsのmacOSランナーで `xcodebuild` → TestFlight へ上げる構成にすれば、iPhoneだけで配信まで回せる見込み。Apple Developer Programへの登録と、署名用の証明書・プロビジョニングの用意（`fastlane match` をCIで使う）が一度だけ必要になる。これはv0.8で詳細化する。
