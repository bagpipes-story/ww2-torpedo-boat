# CHANGELOG

書式: `## vX.Y.Z — YYYY-MM-DD` の下に **目的 / 変更点 / 既知の制約 / 実機テスト結果** を書く。
3か月後の自分が読んで分かる粒度にする。設計値（`data/*.json` の `"source": "design"`）を変えたときは理由も書く。

## v0.1.3 — 2026-10-04（魚雷と命中）

- 目的: 魚雷 4 本を撃ち、雷跡が見え、直進する駆逐艦 1 隻に幾何判定で当たる・外れるが分かり、命中で沈没演出、終了後に Result を出す（docs/03 v0.1.3）。
- 変更点:
  - `src/core/rng.ts`: シード付き乱数（mulberry32）。不発・蛇行の抽選に使う（CLAUDE.md §7: Math.random は使わない）。乱数列はテストで固定し、Result に表示する seed で再現できる。
  - `src/core/torpedo.ts`: 魚雷の状態と運動（直進、走行距離、安全距離 `arming_distance_m` までは非武装、射程で消滅）、信頼性（dud=命中しても不発、erratic=発射方位に ±`jitter_deg` の一定偏差＋周期 `erratic_period_s` の小さな蛇行）、雷跡の点を置く間隔の管理。
  - `src/core/torpedo-solver.ts`: 船体円の列（`fillHullCircles`、事前確保した配列に書く）、命中判定 `pointHitsHull`（円の中心を結ぶ線分の周り半径 r のカプセル。円だけだと 118 m の艦に半径 5.4 m の円 5 個で隙間ができ、すり抜ける。レビューで判明）、見越し角 `interceptHeadingDeg`（2 次方程式、先に会う根）。
  - `src/core/salvo.ts`: 長押し時間→開き角（2°〜12°）、扇状の方位列。`src/core/hit-rate.ts`: 発射記録 `{rangeM, hit, dud, erratic}` と距離帯別の集計。`boat-motion.ts` に直進 `stepStraight`。
  - `src/entities/destroyer.ts`: 駆逐艦（薄い赤の船形、`length_m` 118 m × sprite_scale）。一定針路・速力で直進、`torpedo_hits_to_sink` 本で沈没演出（縮小・傾き・フェードの tween を 1 回。演出中は位置同期を止めて傾きが上書きされないようにする）。`src/entities/sea.ts`: 海の格子と境界（Mission から分離）。
  - `src/systems/torpedo-pool.ts`: 魚雷 4 本と雷跡の点 240 個を起動時にプール。固定ステップで運動・海域外の消滅・武装後の命中判定、毎フレームはスプライト位置と雷跡のフェードのみ。目標の脇を通り過ぎて遠ざかり始めた魚雷は「外れ」を早期確定する（`markMissIfPassed`。射程 12 km の Mk 8 が海域の端まで走るのを待たずに任務を終えられる。表示は走り続ける）。任務終了時に未確定の魚雷も外れとして確定し、Result の集計から漏れないようにする。
  - `src/systems/torpedo-launcher.ts`: 発射管制。タップで 1 本、長押し→離すで残弾を扇状に、`salvo_interval_s`（0.4 秒）間隔で 1 本ずつ。発射位置は両舷交互、信頼性ロールは発射時に 1 回。
  - `src/systems/torpedo-button.ts`: 右下の魚雷ボタン。0.3 秒未満のタップで 1 本、長押し中は開き角を予告表示。離しは押した指の pointer id をシーン全体の pointerup で拾う（指が滑って外れても確実に発射）。PC は Space で 1 本。
  - `MissionScene`: カメラを進行方向に 320 m 先読み（ズーム 0.75 の前方視界 480 m では 800yd の目標が画面に入らない）。命中で爆発リング＋カメラ揺れ（ズームの 2 乗で補正）＋スロー（`feel.hit_slowmo_*`）、不発は灰色の小さなリング。終了条件は 撃沈 / 4 本すべて消化 / `duration_s` 経過（沈没演出中は演出完了を優先）。HUD 上中央に「残り時間・命中」。`src/ui/target-marker.ts`: 画面外の駆逐艦の方向と距離を画面端に表示（v0.2 の視界モデルが入るまで常時）。
  - `ResultScene`: 命中 / 発射（不発・外れ・未発射）、距離帯別の発射/命中、駆逐艦の撃沈/健在、生還、乱数シード。任務中から押しっぱなしの指の離しでは再開せず、新しく押した指の離しで Mission を再開。
  - `main.ts`: URL に `?debug` を付けたときだけ `window.__game` を公開（ヘッドレス Chromium の自動テストと実機デバッグ用。通常の Pages URL では何もしない）。同じく `?debug` のときだけ見越し点マーカー（`src/systems/mission-effects.ts` の `LeadMarker`、docs/02 §6.3「v0.1 はデバッグ切替で常時表示可」）を出す。
  - docs/02 §6.2 の信頼性の出典を `torpedoes.json` に修正（下の「信頼性の出典」参照）。
  - data: `missions_seed.json` の `us_02.v0_1_prototype` に `enemy_start`（北西から南東へ、自艇の進路へ斜めに近づく。レビューで、東西に横切る当初案だと見越し角が 26〜43° 必要でガイド無しではほぼ当たらないと判明。斜め接近なら 8° 前後）と `enemy_hits_to_sink: 1`（プロトタイプで沈没演出を確実に見せる。`enemies.json` の 2 は後の任務用）、`hit_rate_model.json` の `torpedo_launch` に `erratic_period_s: 6`、`world` に `hit_scale: 1.0` を design 値として追加。理由: 敵の初期配置と蛇行の周期がコードに必要で data に無かった。`hit_scale` は当たり判定に使う船体寸法の倍率で、docs/02 §6.10「当たり判定は実寸のまま」に従い既定 1。表示は sprite_scale 2 倍なので、見た目の船体を横切る魚雷の多くが当たらない。見た目どおりに当てたいなら 2 にする（ユーザー判断事項）。
  - 信頼性の出典: docs/02 §6.2 は `hit_rate_model.reliability` と書いているが、data には魚雷ごとの `torpedoes.json.reliability`（`jitter_deg` 付き）があり、こちらを使った。史実モード（v0.5）で `hit_rate_model.historical_mode.reliability` に差し替える。
  - テスト 65 件: `tests/rng.test.ts`（乱数列の固定含む）、`tests/torpedo.test.ts`（安全距離・射程・蛇行の振れ幅と位相・一定偏差・雷跡間隔）、`tests/torpedo-solver.test.ts`（船体円の配置、カプセル判定が円の隙間を埋めること、全方位の符号、見越し角の根の選択と a≈0 分岐、見越し角で撃った魚雷が 800yd で直進艦の中央に当たる／3,000yd で 2° 外すと外れる）、`tests/salvo-hit-rate.test.ts`。
  - 検証: ヘッドレス Chromium（iPhone 15 相当）で `?debug` フックから入力を操作し、停止→見越しタイミングで 3 本発射→2 本命中→沈没→Result「駆逐艦を撃沈」→タップで再開、を再現。
- 既知の制約:
  - 当たり判定は実寸（`hit_scale` 1）。表示は 2 倍なので、見た目の船体の外側半分を横切る魚雷は当たらない。実機で納得感を見て `hit_scale` を決める。
  - 駆逐艦は反撃も回避もしない（v0.2）。艇は常に生還する。スコアの数値化は v0.3。
  - 見越し角ガイドは `?debug` 付き URL でのみ表示。製品での解放は v0.5（レーダー・経験）。
  - 雷跡は 240 点で約 6,000 m 分。4 本同時に長距離を走ると古い点から消える。
  - Mk 8 の射程 12,344 m は海域 6,000×4,000 m より長いので、外れた魚雷は海域の端で消える。
  - 敵マーカーは常時表示。v0.2 の視界モデル（`vis_player_m`）で見える距離に制限する。
- 実機テスト結果: （マージ時に追記）

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
