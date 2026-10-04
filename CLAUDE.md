# CLAUDE.md — WWII魚雷艇ゲーム（仮称: Night Hunters）

このファイルはClaude Codeがセッション開始時に必ず読む「プロジェクトの作法」。
変更する場合は末尾の変更履歴に1行残す。

## 1. プロジェクト概要（1行）

第二次世界大戦の魚雷艇を操作し、夜の海で「接近→魚雷発射→離脱→生還」を繰り返すiPhone向け2Dアクション。
Phaser 3 + TypeScript + Vite で作り、PWAとしてiPhone Safariで遊べるようにしてから、Capacitorで App Store 配信する。

## 2. 確定した設計判断（変更する場合はユーザーに確認）

| 論点 | 判断 |
| --- | --- |
| 命中率 | 「当たらない魚雷」はコンセプトに残すが、史実値（数%）には寄せず爽快感側に傾ける。目標は正しく狙った1本が35〜45%（`data/hit_rate_model.json`） |
| 日本側 | 弱者視点（回避・輸送・隼艇の護衛・生還）のハードモード。米PTキャンペーンの後にアンロック |
| 主軸 | 米PT（Elco 80ft）キャンペーンをまず作る |
| スタック | Phaser 3 + TypeScript（strict）+ Vite。PWA先行、App StoreはCapacitor + GitHub Actions（macOSランナー） |
| アート | v0.6まではプレースホルダー図形。画像・音の制作にセッションを使わない |

設計の根拠は `docs/01_史実リサーチ＆設計資料.md`、仕様は `docs/02_ゲーム設計書_v0.1.md`、計画は `docs/03_開発ロードマップ.md`。
数値はすべて `data/*.json` にあり、コード内にマジックナンバーを書かない。

## 3. 開発環境（iPhone完結・クラウド前提）

- **開発はClaude Codeのクラウドセッションで行う**（iPhoneのClaudeアプリ → Codeタブ、または claude.ai/code）。PCは最初の設定以外で使わない。詳細は `docs/04_iPhone完結ワークフロー.md`。
- クラウドVM: Ubuntu 24.04、Node 22（`/opt/node20` も有）、npm、git、gh。ネットワークは Trusted（npmレジストリとGitHubに届く）。
- 依存は `.claude/settings.json` の SessionStart フックが `scripts/install_pkgs.sh` で入れる（クラウドでのみ `npm ci`）。
- 主要コマンド（Claude Codeが実行する）
  - `npm ci`
  - `npm test` → vitest（`src/core` の純粋ロジック）
  - `npm run build` → `dist/`
  - `npm run lint`
- **動作確認はGitHub Pages**。どのブランチでもpushすると `.github/workflows/deploy-pages.yml` がビルドして `https://<user>.github.io/ww2-torpedo-boat/` に公開する（1〜2分）。ユーザーはこのURLをiPhone Safariで開いて実機テストする。
- `npm run dev -- --host` などローカルサーバー前提の案内はしない。ユーザーのiPhone実機テストが各バージョンの完了条件に含まれる。
- ビルド番号: `vite.config.ts` が `import.meta.env.VITE_BUILD_LABEL`（ブランチ@コミット7桁）を注入する。画面上部中央に常に表示し（左下はスティック、右下は速力HUD、右上は煙幕ボタンが使うため）、ユーザーがどのビルドを見ているか分かるようにする（雛形: `docs/snippets/vite.config.ts`）。

## 4. ディレクトリ構成

```
ww2-torpedo-boat/
  CLAUDE.md
  CHANGELOG.md                変更ログ（必須）
  README.md
  docs/                       設計資料（番号付き）
  data/                       パラメータJSON。ゲームはここだけから数値を読む
    boats.json                艇（史実値と設計値を区別）
    torpedoes.json            魚雷
    enemies.json              敵（駆逐艦・輸送船・大発・水上機など）
    hit_rate_model.json       命中率KPI・時間圧縮・信頼性
    risk_events.json          リスクイベントの重み（史実の損失比率）
    missions_seed.json        ミッションの種（史実アンカー付き）
  src/
    main.ts                   Phaser.Game生成のみ
    config/                   Phaser設定・定数（画面サイズ、スケール）
    core/                     Phaser非依存の純粋ロジック（必ずvitestでテスト）
      units.ts                kt→m/s、yd→m などの単位変換
      torpedo-solver.ts       見越し角・命中幾何
      fuel.ts                 燃料モデル
      rng.ts                  シード付き乱数
      hit-rate.ts             距離別KPIの評価（テレメトリ用）
    scenes/                   Boot / Title / Mission / Result
    entities/                 PlayerBoat / Torpedo / Destroyer / Barge / Seaplane
    systems/                  Input / Camera / Visibility / RiskEvents / Scoring / Pools
    ui/                       HUD（Phaser内描画。DOMは最小限）
    assets/                   プレースホルダー生成（Graphics.generateTexture）
  public/                     PWA manifest・アイコン
  tests/                      vitest
```

- ファイル名は kebab-case（`torpedo-pool.ts`）、クラスは PascalCase、関数・変数は camelCase、定数は UPPER_SNAKE。
- `src/core` は `phaser` を import しない（import したらテストが壊れる設計にしておく）。
- 1ファイル300行を超えたら分割を検討する。

## 5. バージョン規約

- `v0.MINOR.PATCH`。MINORはロードマップの段階（v0.1.0 プロトタイプ → v0.2.0 夜戦 → …）、PATCHは同じ段階内の修正。
- 1セッション＝1バージョンを原則にする。終わらなければPATCHを刻んで区切る。
- バージョンを上げるときは必ず `CHANGELOG.md` に「目的・変更点・既知の制約」を書く（3か月後の自分が読んで分かる粒度）。
- `package.json` の `version` とCHANGELOGの番号を一致させる。マージ後に `git tag vX.Y.Z` を打って push する。
- ブランチ運用: クラウドセッションは自動で作業ブランチ（`claude/...`）を切る。そのままpushしてPRを作る。ユーザーがPages URLで確認して「マージして」と言ったら `gh pr merge --squash --delete-branch` でmainへ。

## 6. 必須の進め方（毎セッション）

1. 最初に「今回の変更目的」と「完了条件（Doneの定義）」を1行ずつ確定し、ユーザーに提示する。
2. `CLAUDE.md`・`CHANGELOG.md` の最新エントリ・`docs/03_開発ロードマップ.md` の該当バージョンを読み、既存の作法を3行で要約する。
3. 変更を小さく分割し、各々にバージョン番号（PATCH）を割り当てて提案する。
4. 実装前に「この書き方は遅くなる／壊れやすい。理由と回避策はこう」と構造から指摘する（§7）。
5. コード＋バージョン番号＋変更ログをセットで出す。
6. **セッションの終わり方（必ず）**: `npm test` と `npm run build` を通す → commit → push → PRが無ければ `gh pr create` → ユーザーに次の3点を短く報告する: (a) Pages URL と期待するビルド番号、(b) iPhoneで試す実機テスト項目（3つ以内）、(c) 既知の制約。ユーザーはiPhoneでしか確認しないので、ローカル実行の案内はしない。
7. ユーザーからの感想はiPhoneから短文で来る。推測で埋めず、不明点は1つだけ質問して進める。

専門用語は初出時のみ一言補足し、過剰な解説はしない。同意確認は不要。判断材料を率直に提示する。

## 7. パフォーマンス・ガードレール（実装前に必ず確認）

iPhone SafariのWebGL/Canvasで60fpsを守るための構造ルール。守れない実装は提案段階で止める。

| やってはいけない | 理由 | 代わりにこうする |
| --- | --- | --- |
| `update()` 内で `new`・配列の `filter/map`・オブジェクトリテラル生成 | GCスパイクでiPhoneがカクつく | 魚雷・航跡・砲弾・曳光弾は `Phaser.GameObjects.Group` でプール。再利用する |
| 毎フレーム `Graphics.clear()` → 再描画 | 全再描画はCPU負荷が高い | プレースホルダーは起動時に `generateTexture` で1回だけ画像化し、Spriteで動かす |
| 毎フレーム HUD の `setText` | テキスト再レイアウトが重い | 値が変わったときだけ更新する（前回値をキャッシュ） |
| DOM要素でHUDを作る | Canvasと二重描画、iOSで同期ズレ | HUDはPhaser内（`Phaser.GameObjects.Text` / BitmapText）で描く |
| 距離計算で `Math.sqrt` を多用 | 大発・弾が増えると支配的になる | `Phaser.Math.Distance.Squared` で比較。本当に必要なときだけ平方根 |
| 全オブジェクト×全オブジェクトの衝突判定 | O(n²) | Arcade Physics の group overlap のみ。魚雷×艦、砲弾×艇 のペアに限定 |
| 可変タイムステップに依存した物理 | 端末ごとに挙動が変わる | `physics.arcade.fixedStep = true`、速度は m/s をdtで積分 |
| フル解像度のCanvas | iPhoneの高DPIで描画負荷4倍 | `resolution` は `Math.min(window.devicePixelRatio, 2)`、`Scale.FIT` |
| JSONを毎シーンfetch | 無駄なI/O | `data/*.json` は Boot で1回ロードし、Registryに置く |
| 乱数に `Math.random` | 再現テストができない | `src/core/rng.ts` のシード付き乱数のみ使う |
| 外部CDNからの読み込み | オフラインPWAで壊れる | 依存はnpmでバンドル |
| 音を自動再生 | iOSは初回タッチまで再生不可 | 初回タッチで `sound.unlock()`。音は v0.7 まで実装しない |

iOS固有の注意: `touch-action: none` と `user-scalable=no` でピンチ・引っ張り更新を止める。`100vh` ではなく `100dvh` か `window.innerHeight`。`env(safe-area-inset-*)` をHUD余白に使う。

## 8. データ駆動の原則

- 艇・魚雷・敵・命中率・リスク・ミッションの数値は `data/*.json` のみ。シーンやエンティティに数値を直書きしない。
- JSONの各レコードには `source` フィールドがあり、`"historical"`（史実値）か `"design"`（設計上の提案値）かを明示する。設計値を変えるときはCHANGELOGに理由を書く。
- 単位は実寸（m、m/s、kt、秒）で持ち、`src/core/units.ts` で変換する。時間圧縮は `hit_rate_model.json` の `time_scale` だけで制御する。

## 9. テスト

- `src/core` の関数は vitest で単体テストを書く（見越し角、命中幾何、燃料、乱数の再現性）。
- 各バージョンの「実機テスト項目」を `docs/03_開発ロードマップ.md` に書き、結果をCHANGELOGに1行残す。
- 命中率KPIは Mission シーンでローカル集計（発射距離帯ごとの命中数）し、Resultで表示する。これが `data/hit_rate_model.json` を調整する唯一の根拠になる。

## 10. 完璧主義ガードレール

- 1セッション90分を目安にタイムボックス。超えたらPATCHで区切って終える。
- 「動く」を「きれい」より優先。リファクタはそのバージョンのDoneに含まれない限りやらない。
- 画像・音・ストーリーテキストの作り込みは v0.6 以降。それまではプレースホルダー。
- 新機能の提案はロードマップに追記するだけにして、現バージョンのDoneを先に満たす。

## 11. 表記・権利

- 艦名・戦闘名など史実の固有名詞は使ってよい。実在の人物（ケネディ等）をキャラクターとして登場させない（v1.0までの方針。法的助言ではなく設計上の安全策）。
- 他作品の画像・音・ロゴを使わない。プレースホルダー→自作または権利クリアの素材のみ。

## 12. ファイルの場所（追加分）

```
.github/workflows/deploy-pages.yml   どのブランチのpushでもPagesに公開
.claude/settings.json                SessionStartフック＋npm/git/ghの許可
scripts/install_pkgs.sh              クラウドでのみ npm ci
docs/04_iPhone完結ワークフロー.md     運用の正
docs/snippets/vite.config.ts         base とビルド番号の雛形
optional/claude.yml                  任意: GitHubの@claude連携
```

## 変更履歴（CLAUDE.md自体）

- 2026-10-02 v0.1.0 初版（引き継ぎ資料として作成）
- 2026-10-02 v0.1.1 iPhone完結（クラウドセッション＋GitHub Pages）前提に §3・§5・§6 を改訂、§12 追加
- 2026-10-04 v0.1.2 §3 ビルド番号の表示位置を「画面の隅」から「画面上部中央」に（隅は操作系と HUD が使う）
