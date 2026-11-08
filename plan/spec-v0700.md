# spec-v0700 — v0.7.0「アートと音①：コードで描く絵」

## レビュー反映（spec-review-v0700.md・2026-11-08。R 番号はレビューの表）

- R1 自艇の航跡は速力帯（`w.band`）で段を決める（静音は V なし）→ §5.2・D9
- R2 星弾・探照灯は論理の縁が見える明るさを保つ（平らな面＋縁、先端 α ≥ 0.6、平均 α ≥ 0.85）→ §5.5・§3.5
- R3 ビネットは作らない。夜明けの光は海の模様の直上（艇・艦・陸・字の下）→ §3.2・§5・§5.6・D11
- R4 夜明けの光の α は sin(π × 段/16)、昼から始まる任務は 0 → §5.6
- R5 海の TileSprite は世界の座標に置き、周期に揃えて動かす（カメラの 1 フレーム遅れ・揺れの縁を避ける）→ §5.1
- R6 格子の線は既定で残し、`?debug&title&nogrid` で比べて実機テストで聞く → §5.1・§8・D5
- R7 船体の航跡は V の腕が主、中央の泡は短く薄く（雷跡と見分ける）→ §5.2
- R8 `tex-wake-dot` は描き直さない、魚雷は黄の面積と明るさを保つ → §4.2・§5.2
- R9 月のきらめきは細長い筋・青白・ゆっくり（砲口炎の星と見分ける）→ §5.6
- R10 火災の煙は小さく黒っぽく（煙幕と見分ける）→ §5.4
- R11 爆発の小さい版（不発・小さな被弾・座礁）は水柱なし → §5.3
- R12 ExplosionFx は世界の絵が作って登録・破棄、数は 16 → §5.3・§5.7
- R13 `tests/world-visuals.test.ts` の期待に最後の 1 行ずつを足す → §7.6
- R14 Boot の呼び出しの名前と行は変えない（同じ名前を新しいファイルから） → §4・§7.3・§7.4
- R15 D3 は world-enemies が鍵を渡す（setup に足さない）→ §4.2・D3
- R16 岸の帯は陸の側だけ・波打ち際＝論理の縁、jp_03 は陰と壕の絵をよける → §4.4
- R17 平均の明るさの下限 −10%、小艇は側の暗い帯なし、細部 2 単位以上 → §3.1・§3.5・§4.1
- R18 300 行を超えそうなファイルを分ける → §7
- R19 S2 を S2a・S2b、S3 を S3a・S3b・S3c に分ける → §7
- R20 塗りの予算は既存の星弾・探照灯込みで → §5.7
- R21 TileSprite のメモリと UUID の鍵 → §5.1・§5.7・§7.2
- R22 艦の輪郭は当たりのカプセルを細らせない → §3.5・§4.2
- R23 jp_06 の米駆逐艦の見た目が当たりの大きさになる → §4.2・§9
- R24 岸の帯は 1 枚おきに左右反転 → §4.4
- R25 ADD の物は深さ ＋0.01 にまとめる → §5
- R26 見えなくなった発生源の煙は 0.3 秒で消す → §5.4
- R27 変えない物を棚卸しに書く → §2.2・§9
- R28 Boot の時間を A/B で測る → §7.2
- R29 門の組を明記（`jp04` は使わない）→ §7.1
- R30 絵の乱数は世界ごとに作る、世界の絵は論理の状態に書かない（art-rules）→ §3.1・§7.2
- R31 隠れた艇の tint 版も明るさの比を比べる → §3.5
- R32 煙幕の絵の α を今の ±10% に → §5.5

- 基準: main f5563ab（v0.6.11 マージ済み）。作業ブランチ `claude/v0.7.0-art`。基準のビルド `/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0700/base-f5563ab/`（worktree `.../v0700/wt-f5563ab` から `VITE_BASE=/ww2-torpedo-boat/` で作成済み）。
- 拘束するユーザーの決め: `.../v0700/plan/user-decisions.md` の U1（v0.7 の絵と音はコードで描く・合成する。外部の画像・音のファイルは使わない。手本は v0.6.11 IP2 の「屋我地の陰」＝`src/assets/evac-terrain-art.ts`＋`src/config/evac-art-config.ts`）。U0: ユーザーは陰の絵を「いいグラフィックです」と評価。
- 範囲（リードの計画）: v0.7.0 は艇・艦・機・大発・夜の海と演出の絵だけ。音は v0.7.1、BGM と命中スローは v0.7.2。HUD・Title・Briefing・Result の見た目は変えない。

## 1. 目的 / Done

- **目的**: 全任務の艇・艦・機・大発と夜の海（波・航跡・水柱・爆発・火災と煙・探照灯・月光・夜明け）を、陰の絵と同じ「起動時に 1 回コードで描いたテクスチャ」に置き換え、遊びは 1 ビットも変えずに見た目で損をしないようにする。
- **Done**: S0・S1・S2a・S2b・S3a・S3b・S3c・S4 の各段の門（§7）がすべて通り（模擬 OK 37 DIFF 0・再生と HUD の A/B が f5563ab と same:true・凍結 20 本・テクスチャの鍵と寸法が基準と同じ・GPU のテクスチャ ≤ +12 MB・画面の物 ≤ +40・フレーム p95 ≤ +15%）、PR の Pages でユーザーが iPhone の実機テスト 3 項目（§8）を確かめた。

## 2. 棚卸し（f5563ab）

### 2.1 前提の数（絵の密度）

- テクスチャは `RENDER_SCALE`（k）倍で作り、表示側が `setScale(1/k)` で世界単位（1 単位＝1 m の座標。艇・艦の絵は実寸 × `sprite_scale` 2）に戻す。k = max(1, FIT × min(DPR, 2))。**iPhone 15（W 1560）で k ≈ 1.09、iPhone SE（W 1280）で k ≈ 1.04**（ヘッドレス dpr 2 で同じ値）。iPad・PC の大画面だけ k → 2。
- 画面（canvas px）への倍率 = k × ズーム: 既定 0.75 → **0.82 px/単位**、見張り 0.5 → **0.55 px/単位**、最大 1.0 → 1.09。テクスチャの密度（k px/単位）はズーム 1.0 の画面と同じ＝今より細かく描いても画面には出ない。
- 画面上の大きさ（W 1560、canvas px。CSS pt はこの 1/2）:

| 物 | 世界単位（長さ × 幅） | 既定 0.75 | 見張り 0.5 |
| --- | --- | --- | --- |
| Elco 80（自艇・米PT） | 48.8 × 12.6 | 40 × 10 | 27 × 7 |
| Elco 77 | 47 × 12 | 38 × 10 | 26 × 7 |
| T-38・H-38 | 36 × 8.6 | 30 × 7 | 20 × 5 |
| T-14 | 30 × 7.3 | 25 × 6 | 16 × 4 |
| 大発（テクスチャ 8 × 33 px） | 約 30 × 7.3 | 25 × 6 | 16 × 4 |
| 日本の駆逐艦 | 236 × 21.6 | 193 × 18 | 129 × 12 |
| 米駆逐艦（フレッチャー級） | 229.6 × 24 | 188 × 20 | 125 × 13 |
| 卯月（睦月型） | 205.4 × 18.3 | 168 × 15 | 112 × 10 |
| 輸送船 | 240 × 32 | 197 × 26 | 131 × 17 |
| 機（全種の十字の箱） | 48 × 60（翼幅） | 39 × 49 | 26 × 33 |

→ 小艇は既定で幅 6〜10 px・見張りで 4〜7 px。**見張りでは形と色しか残らない**。細部（砲塔・発射管）はズーム 0.75 以上で「それらしく」見えれば十分（§3.4）。

### 2.2 テクスチャの一覧（`generateTexture`・Boot で 1 回。px は k 1.09）

道具: `/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0700/impl/plan/tex-list.mjs`（全任務を開いて `game.textures` の鍵・幅・高さ。S0 の `tex-ab.mjs` の元）。原点はすべて中央（0.5, 0.5）、艇首・機首が上（例外は表に書く）。

| 鍵 | 作る所 | px | 世界の大きさ | 使う所（任務） | 寸法を論理が読むか |
| --- | --- | --- | --- | --- | --- |
| `tex-boat-us_elco80` | placeholders `generatePlayerBoatTexture`（艇ごと `boatTextureKey`） | 14×54 | 12.6×48.8 | 自艇 us_02・us_03 | 読まない（当たりは data の hit_scale） |
| `tex-boat-us_elco77` | 同 | 14×52 | 12×47 | us_01 の自艇と僚艇（`ESCORT_TINT` で青） | 読まない |
| `tex-boat-jp_t38` | 同 | 10×40 | 8.6×36 | 自艇 jp_01・jp_04・jp_06、jp_03 の 18 隻（隠れたら `EVAC_HIDDEN_TINT`） | 読まない |
| `tex-boat-jp_t14` | 同 | 8×33 | 7.3×30 | 自艇 jp_02・jp_05 | 読まない |
| `tex-boat-jp_h38_hayabusa` | 同 | 10×40 | 8.6×36 | jp_01 ハードの隼艇（`ESCORT_TINT`） | 読まない |
| `tex-destroyer` | placeholders `generateDestroyerTexture`（us_02 の敵 ijn_destroyer の寸法） | 24×258 | 21.6×236 | us_01・us_02、**jp_06 の米駆逐艦もこの 1 枚** | 読まない（当たりは data × ship_hit_scale） |
| `tex-transport` | placeholders `generateTransportTexture` | 35×262 | 32×240 | us_02 | 読まない |
| `tex-transport-friendly` | ally-ship-placeholder | 35×262 | 32×240 | jp_04 | **読む**: `entities/ally-ship.ts:55` が `displayWidth/Height` から名前・状態の行の y |
| `tex-destroyer-friendly` | ally-destroyer-placeholder | 20×225 | 18.3×205.4 | jp_04（卯月） | **読む**: `entities/ally-destroyer.ts:53` が名前の y |
| `tex-ally-fan` | 同（`ui/ally-fan` の形） | 200×284 | 見張りの扇 | jp_04 | 形＝見張りの扇（UI。変えない） |
| `tex-barge` / `tex-barge-friendly` | barge-placeholder（長さ＝`boundsMarginM`×2、幅＝`halfBeamM`×2×sprite/hit） | 8×33 | 約 7.3×30 | us_03（座礁で灰の tint）/ jp_01 の輸送隊 | 読まない（式は保つ） |
| `tex-pt-boat` | pt-placeholder（us_elco80 × sprite_scale） | 14×54 | 12.6×48.8 | jp_01・jp_04・jp_05（去ったら `PT_RETIRED_TINT`） | 読まない |
| `tex-aircraft` | aircraft-placeholder（`HOME_COLOR`） | 66×53 | 翼幅 60×長さ 48 | us_02 の味方機（friendly-fire） | 読まない |
| `tex-aircraft-enemy` | 同（`TARGET_MARKER_COLOR`） | 66×53 | 60×48 | **全部の敵機**: 水上機 us_02（enemy-seaplane）・夜の哨戒機 jp_02（patrol-air）・夜明けの空襲（**凍結の air-strike-flight**）・jp_03 の編隊（同）・撃墜の残骸（world-arms） | 読まない |
| `tex-torpedo` | placeholders | 4×14 | 3×魚雷長×2 | 全任務（**凍結の torpedo-pool**、jp_04 の敵の魚雷も） | 読まない |
| `tex-wake-dot` | placeholders | 8×8 | 半径 2.5 | 雷跡の点（凍結の torpedo-pool。25 m ごと・240 個・25 秒・α 0.55） | 読まない。**描き直さない**（R8: 8 px に描き込む余地が無く、柔らかくすると雷跡が薄れる。jp_04 の敵の雷跡を目で避ける） |
| `tex-explosion-ring` | placeholders（半径 40 単位＋8 px） | 96×96 | 半径 40 | 水柱（splash-pool）・爆発（mission-effects）・砲口炎 7 か所・爆弾（凍結の air-strike-flight と enemy-seaplane）・見越し点・目標の輪（pt-gun・barge-hunt） | 各所の scale 定数が半径 40 を前提 |
| `tex-searchlight` | placeholders（us_02 の敵の cone_deg、長さ 256 単位。**原点は光源＝(0.5, 1)**） | 61×280 | 射程に拡大 | enemy-fire・卯月 | **読む**: scale＝射程/256、角は V-A7 で卯月と同じ |
| `tex-starshell` | placeholders（半径 128） | 282×282 | 照明半径に拡大 | 星弾・水上機と味方機の照明弾（tint） | **読む**: scale＝照明半径/128 |
| `tex-smoke-puff` | placeholders（半径 64、3 重の円） | 142×142 | 煙の半径に拡大 | 煙幕（smoke-screen） | **読む**: scale＝煙の論理の半径/64（見える広さ＝遮る広さ） |
| `tex-shell` / `tex-tracer` / `tex-gun-tracer` | placeholders・barge-placeholder | 8×8 / 4×20 / 4×20 | 5 / 2.5×18 | 砲弾・曳光弾。**`tex-tracer` は爆撃進路の線にも伸ばして使う**（凍結の air-strike-flight・pt-squadron。原点 (0, 0.5)） | 伸ばす＝無地の線のまま |
| `tex-rain-streak` | storm-placeholder | 3×31 | 雨筋 | us_01・us_02 の暴風 | 読まない |
| `tex-impact-ring`・`tex-evac-ring`・`tex-return-ring` | impact-ring-placeholder・placeholders | 81² / 79² / 289² | 論理の半径へ拡大 | 着弾点・jp_03 の輪・帰投の輪 | 半径＝論理の値（UI。変えない） |
| `tex-hp-bar-bg/fill` | placeholders | 219×11 | — | HUD・**暴風の帯と前線に伸ばす** | 変えない |
| HUD（`tex-stick-*`・`tex-rudder-*`・`tex-*-button`・`tex-*-marker`・`tex-round-button`） | placeholders・weapon-textures | — | Hud シーン | hud-ab が鍵・tint を比べる | 変えない |
| `tex-debug-ring` | ?debug だけ | 1100² | — | — | 変えない |
| `tex-evac-cover-art-<id>`・`tex-evac-cave-art` | evac-terrain-art（初めて使う時に 1 回。1.5 px/m 固定） | 1380×645 / 450×300 | — | jp_03 | 変えない（手本） |

**変えない物（R27。art-inventory の分類「変えない」の根拠）**: 沿岸砲の砲台（赤い四角と砲身）と射界の半円＝`systems/shore-battery.ts:67-86` の Graphics（us_03）、暴風の帯・前線（HP バーの白を伸ばす）と雨筋 `tex-rain-streak`、砲弾 `tex-shell`・曳光弾 `tex-tracer`（爆撃進路の線にも伸ばす）・機銃の曳光弾 `tex-gun-tracer`、目標の輪（`pt-gun.ts:68`・`barge-hunt.ts:135`）と見越し点（`mission-effects.ts:58`）と空襲・水上機の爆弾（どれも `tex-explosion-ring`）、輪・扇・浅瀬・HUD の全部、`tex-wake-dot`（R8）。

Graphics に 1 回だけ記録して置く物（テクスチャではない）: 海の格子（100 m ごと・`SEA_GRID_COLOR`・線 2）と海域の縁（線 6）＝`entities/sea.ts`、浅瀬と岸の陸と浜の線＝`entities/shallows.ts`、沿岸砲の射界と砲台＝`systems/shore-battery.ts`、jp_03 の島・斜路・レール＝`systems/evac-terrain.ts`、上陸地点の帯＝`systems/convoy.ts`・`entities/ally-ship.ts`。

**テクスチャのメモリ（基準。k 1.09、幅×高さ×4 B）**: 全部で 10.24 MB のうち `tex-debug-ring` 4.62 MB（?debug だけ）と jp_03 の岩の絵 3.91 MB を除くと **1.71 MB**。`generateTexture` のテクスチャは Canvas なので CPU 側にも同じ量の canvas がある（iOS の canvas の総量の上限に効く）。

**物の数（Mission の children、止めた瞬間。プールの見えない物を含む）**: us_01 415・us_02 462（ハード 518）・us_03 425・jp_01 373（ハード 385）・jp_02 312・jp_03 415・jp_04 655（ハード 659）・jp_05 344・jp_06 379。

### 2.3 今の演出と描き方

| 演出 | 今の描き方 | 所 |
| --- | --- | --- |
| 海の色 | カメラの背景色 `SEA_COLOR #0b1020`（Phaser の backgroundColor） | config/dawn-config |
| 海の模様 | 格子の線（100 m・`0x1a2540`）と縁（`0x3a4a6a`）の Graphics 1 つ | entities/sea |
| 夜明けの色 | `ui/sea-light`: 背景色を `#0b1020` → `DAY_SEA_COLOR #3b5670` へ 16 段（夜明けの 20 秒前〜6 秒後）。jp_03 は最初から昼（段を最後に固定） | world-dawn |
| 月 | 絵は無い（`moon` dark/half/full/day は視程と発見の係数だけ。us_02 だけ half、jp_03 は day、ほかは dark） | — |
| 雷跡 | 白い点（凍結の torpedo-pool） | 上表 |
| 艇・艦の航跡 | **絵は無い**。論理の「航跡」はある: 自艇の速力帯が巡航・全速の間だけ（静音・停止は無し）で、夜の哨戒機・水上機の発見に効く（`core/patrol-air.ts:14-17`・`core/seaplane.ts:131-135`。駆逐艦の発見距離も速力帯の係数）。絵はこれと合わせる（R1） | — |
| 水柱 | `SplashPool`: 輪の絵を tint（外れ 青白・命中 橙）、scale 0.45/0.9、0.7 秒で薄れる。持ち主ごとのプール（敵の砲・大発・米PT・艇の砲・卯月・沿岸砲・空襲は世界のを借りる） | systems/splash-pool |
| 爆発 | `playExplosion`: **毎回 new Image＋tween**（scale 0.2 → 1.6 命中・0.6 不発、600 ms、橙/灰）。mission-scene の 5 か所から | systems/mission-effects |
| 砲口炎 | 輪の絵を tint・0.15 秒（enemy-fire・shore-battery・pt-gun・world-arms・barge-hunt・pt-squadron・卯月） | 各所 |
| 探照灯 | 一様な二等辺三角形・α 0.2（煙で遮られると × 0.4） | enemy-fire・ally-destroyer |
| 星弾・照明弾 | 一様な円・α 0.14 | enemy-fire・enemy-seaplane・friendly-fire |
| 砲弾・曳光弾・爆弾 | 点・細い矩形を tint。爆弾は輪の絵を灰で縮める | 各所 |
| 煙幕 | 3 重の円の Image のプール、α は寿命で、艦艇の上（depth 11） | systems/smoke-screen |
| 暴風 | 帯・前線（HP バーの白を伸ばして tint）・雨筋 40 本・艇の横揺れ | systems/storm-front |
| 沈没 | 絵の tween（× 0.6 に縮み・α 0・18° 傾く・2 秒） | player-boat・destroyer ほか |
| 火災 | **絵は無い**（HUD の文と消火ボタンだけ） | — |
| 被弾 | カメラの揺れ（`HIT_SHAKE_*`） | — |
| 陸・浅瀬 | 一様な塗り＋浜の線＋文字。jp_03 だけ岩と木の絵 | 上 |

### 2.4 基準の画面写し

`/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0700/before/`（49 枚・索引 `INDEX.md`）。13 件（us_01・us_01 夜明け・us_02・us_02 ハード・us_03・jp_01・jp_01 ハード・jp_02・jp_03・jp_04・jp_04 ハード・jp_05・jp_06）× W 1280・W 1560、見張り 9 件 × 2、jp_01 の reveal 2 件 × 2。遊べない us_04〜us_07 は撮れない（9 任務＋ハード 3＋夜明け 1）。見て分かったこと:

- 艇は既定ズームで白い 10×40 px の針、見張りで 7×27 px。大発・米PT は赤い短い棒、駆逐艦・輸送船は画面の 1/4 を占める一色の棒。海は格子だけで、夜の海の手触りが無い。
- 敵は夜は見えるまで描かない（`sighted`）。写しの多くで敵の絵は画面の上端（HUD の文の下）か画面外。**見えていない敵の位置を絵（航跡・煙・炎）でばらしてはいけない**（§5.2）。
- 昼の jp_03 は一様な `#3b5670` の上に格子。陰・壕の絵だけが「絵」になっている。

## 3. 絵の作法（スタイルガイド）

### 3.1 全体

- **真上から見た絵**（トップダウン）。艇首・機首が上。原点・テクスチャの寸法は今の鍵のまま（§4）。
- **色の意味は固定**（docs/02 §7）: 自艇＝白、敵＝薄い赤、味方＝薄い青、魚雷＝黄。船体の地の色（最も広い面）がこの色の系統で、細部は同じ系統の明暗で描く。リアルな塗装（PT の暗緑・日本艦の暗灰）は採らない（夜の海に沈んで読めなくなる）。
- **回る絵の陰影は回転に依らない**: 艇・艦・機は向きが変わるので、光の向き（北西など）を焼き込まない。中心線を明るく・縁を一段暗く（枕の陰影）、丸い物（砲塔・煙突・樽）は中心に明るい点。地形など回らない絵だけ北西の光（陰の絵の先例）。
- **縁の明るい帯（リム）**: 船体の外周 1 単位は地の色より明るく残し、暗い細部は縁から 1 単位以上内に置く（夜の海で輪郭が欠けない）。暗い細部の面積は船体の 25% 以下（平均の明るさを placeholder の ±15% に保つ）。
- **線の太さ・最小の大きさ**（R17）: 世界単位で、縁の帯（リム）は 1.5 単位以上、細部（砲塔・煙突・発射管・ハッチ）は **2 単位以上**（k 1.09 で 2.2 px・既定ズームで 1.6 canvas px・見張りで 1.1 canvas px）。これより細い物は描かない。艇・艦のテクスチャは NPOT（14×54 など）でミップマップが効かず、見張り（0.5 倍）の縮小で 1 texel の線は回転・移動のたびにちらつく。1 単位おきの縞（明暗の繰り返し）も描かない。
- **乱れ**: 絵だけの `SeededRng`（`ART_SEED_*` を art config に。陰の `EVAC_ART_SEED` と同じ考え）。ゲームの乱数の系列は 1 つも使わない・引く回数を変えない。描く順を固定（同じ k なら同じ画素）。毎フレーム使う乱数（きらめきの置き直し・煙の揺れ）は世界の絵を作る時に `new SeededRng(ART_SEED_*)` で作る（モジュールに 1 つ置かない＝任務の順で絵が変わらない。R30）。

### 3.2 光ごとの色

| 光 | 任務 | 海（背景） | 波の模様（§5.1） | 足すもの |
| --- | --- | --- | --- | --- |
| 夜・月なし（dark） | us_01・us_03・jp_01・jp_02・jp_04・jp_05・jp_06 | `#0b1020`（今のまま） | 薄い青灰の波頭（`#1c2a46` 相当・α 低）・粗い | 月のきらめき無し |
| 夜・月あり（half/full） | us_02（half） | `#0b1020` | 波頭を一段明るく（`#2a3c60` 相当）・密に | 月のきらめき 12 個（§5.6）。full は 16 個 |
| 夜明け | 全任務（夜明けの 20 秒前〜6 秒後の移り変わり） | `sea-light` の 16 段（今のまま） | 波頭の色を同じ段で昼へ | 東（画面の右端）の海に橙の光（移り変わりの中ほどで α 0.22、夜と昼は 0。R4）。艇・艦・陸・字の下（R3） |
| 昼 | jp_03 | `#3b5670`（今のまま） | 明るい波頭（`#8fb0c8` 相当）＋疎らな白波 | 夜明けの光も無し（R4） |

艇・艦の色は光で変えない（色の意味が光で揺れないように。夜明けは背景が明るくなるだけ＝今と同じ）。そのため光の層（夜明けの光）は海の模様の直上に置き、艇・艦・機・陸・世界の字の上には何も重ねない（R3）。**ビネットは作らない**（R3: 夜の海 `#0b1020` はもともとほぼ黒で、海だけを暗くしても見えず、艇の上に重ねれば四隅から入る敵と世界の字を暗くする。全面の層 1 枚の塗りに見合わない）。

### 3.3 陣営ごとの船体の色（パレット。値は art config。下は目安）

| 系統 | 地（甲板） | 縁（リム） | 側の暗い帯 | 上部構造 | 暗い細部（砲・煙突・ハッチ） | 明るい点 |
| --- | --- | --- | --- | --- | --- | --- |
| 自艇（白。**tint される鍵**） | `#e2e6ea` | `#f4f6f8` | `#a7afb8` | `#c9cfd6` | `#5d6670` | `#ffffff` |
| 敵（薄い赤） | `#d08c88` | `#e6aaa6` | `#9c605d` | `#b97c78` | `#5a3c3a` | `#f2c4c0` |
| 敵の輸送船（灰がかった赤＝砲台でない） | `#b89a9a` | `#ccb2b2` | `#8a7070` | `#d8c2c2` | `#4a3a3a` | `#eadcdc` |
| 味方（薄い青） | `#9ad0ff` | `#b8e0ff` | `#5f8fb8` | `#7fb3df` | `#2f4a66` | `#dff1ff` |
| 魚雷 | `#ffe066` | — | `#c9a630` | — | — | 先端 `#fff6c8` |

- **tint される鍵は無彩色に近く描く**: `boatTextureKey` の 5 枚は僚艇・隼艇で `ESCORT_TINT`、jp_03 で `EVAC_HIDDEN_TINT` が掛かる（掛け算）。彩度 ≤ 0.12 の明るい灰で描けば、tint で薄い青・暗い灰にきれいに変わる。大発（座礁の灰）・米PT（去った tint）・敵機も tint されるが、地が薄い赤なので掛け算で暗い灰赤になる＝今と同じ意味（色の検査は §7.3 の tex-check）。
- 日本と米の違いは色でなく**形**で出す（米 PT は長い前甲板と操舵室・左右の銃座、日本の艇は短く低い船室と艇尾の魚雷の架台。駆逐艦は砲塔の数と配置・煙突の数）。
- **幅 10 単位未満の艇（PT・Elco・T-38・T-14・H-38・大発）は「側の暗い帯」を描かない**（R17: 見張りで 1 px 未満になり、平均色に溶けて船体を暗くするだけ）。細部の明暗は地の色から明るさ ±20% までにとどめる。

### 3.4 縮尺の決まり

- 艇・艦: テクスチャ 1 px ＝ 1/k 世界単位（今のまま）。世界の大きさ＝実寸 × `sprite_scale` 2（data の値。絵の側で変えない）。寸法は placeholder の式 `Math.ceil(B·k) × Math.ceil(L·k)` のまま（§4・§7.3）。
- 機: 全種を同じ箱（翼幅 60 × 長さ 48 単位）に収めるアイコン（実寸 × 2 より大きい。PB2Y も戦闘機と同じ箱。既知の制約）。
- 演出: 大きさは論理の値（探照灯の射程・星弾の照明半径・煙の半径）か art config の値（水柱・爆発・炎）。
- 海の模様・岸の帯は k に依らない固定の px/m（海 0.5 px/m・岸 1.0 px/m。陰の 1.5 px/m の先例）。

### 3.5 読みやすさ（iPhone のズーム 0.75 と見張り 0.5）

- 見張りで残るのは**輪郭と色だけ**。見分けの鍵（崩してはいけない輪郭）:
  - 米PT・Elco: 尖った艇首・四角い艇尾・細長い（長さ/幅 ≈ 3.9）。
  - 日本の小艇: 同じく尖るが短い（T-14 は 25 px・T-38 30 px）。
  - 大発: **艇首が平ら**（道板の四角）・ずんぐり。placeholder の輪郭（艇首の幅 0.76B）を保つ。
  - 駆逐艦: 非常に細長い（長さ/幅 ≈ 10）・クリッパー艇首。
  - 輸送船: 太い（長さ/幅 7.5）・艇首と艇尾が丸い。
  - 味方: 青。敵: 赤。自艇: 白。機: 十字（翼幅が箱の 0.8 以上）。
- 検査（§7.3 の tex-check）: 各鍵の不透明な画素の覆い ≥ placeholder の多角形の 85%（輪郭が痩せない）、平均の明るさ placeholder の **−10%〜+15%**（R17: 夜に暗く沈ませない）、色相（自艇 彩度 < 0.12・敵 330°〜20°・味方 190°〜220°）、夜の海 `#0b1020` との明るさの比 ≥ 4.5（昼の `#3b5670` に対して ≥ 3）。
  - **tint を掛けた版**（R31）: 僚艇・隼艇の `ESCORT_TINT`、jp_03 の隠れた艇の `EVAC_HIDDEN_TINT`（α 0.45 込み）、去った米PT の `PT_RETIRED_TINT`、座礁の大発の `BARGE_BEACHED_TINT` を掛けた色で、海との明るさの比が placeholder に同じ tint を掛けた比の 0.85 倍以上。
  - **艦の当たりの形**（R22）: 当たりは船幅の円を軸に並べたカプセル（`core/torpedo-solver.ts:17-34`。艦首・艦尾まで船幅いっぱい）で、v0.4.8 の「見たとおりに当たる」（ship_hit_scale 2）がある。艦（駆逐艦 3 種・輸送船 2 枚）は長さの 20〜85% で幅 ≥ 0.92B、艦首の先は画素の 0 行目、艦尾は長さの 98% 以上まで描く。
  - **遊びの手掛かりの絵**: `tex-torpedo` は黄の面積 ≥ 85%・平均の明るさ ≥ placeholder × 0.95（R8）。`tex-smoke-puff` は半径の帯（0〜0.4・0.4〜0.7・0.7〜1.0）ごとの平均 α が今の合成（0.70・0.58・0.35）の ±10%（R32）。`tex-starshell` は半径 92% までの平均 α ≥ 0.6、`tex-searchlight` は先端の行の平均 α ≥ 0.6・全体の平均 α ≥ 0.85（R2）。

### 3.6 被害・沈没の見え方

- 船体のテクスチャの「壊れた版」は作らない（鍵と呼び出しが増える）。被害は**炎と煙**で見せる（§5.4）: 火災中の自艇・僚艇・隊長艇、命中して沈んでいない駆逐艦・輸送船は炎のちらつき＋黒煙の尾。
- 沈没は今の tween（縮む・傾く・消える 2 秒）のまま、始まりに爆発（魚雷の命中なら既に出る）と、広がる泡と油の輪・煙の柱（4 秒）を足す。座礁した大発・去った米PT の tint は今のまま。

## 4. 物ごとに描くもの（鍵・寸法・原点は今のまま）

共通: 描画の道具 `src/assets/art-pen.ts`（世界単位で描くペン・k 倍・リム・枕の陰影・丸い物の明るい点・絵だけの乱数）。形（船体の輪郭の点列など）は Phaser に依らない `src/assets/*-shape.ts` に置いて vitest で検査する（§7.3）。パレット・比率・種は `src/config/boat-art-config.ts`・`ship-art-config.ts`・`aircraft-art-config.ts`（定数だけ・何も import しない＝evac-art-config の作法）。

**Boot の呼び出しは 1 字も変えない**（R14）: テストが Boot の行を固定している（`tests/world-ally.test.ts:70-78` の `generateAllyDestroyerTextures(this,` と `allyFanFor(...)` の行・1 回だけ、`tests/ally-ship-view.test.ts:99-108` の `generatePtBoatTexture(this,` → `validateLandingMissions(...)` → `if (landing) generateFriendlyTransportTexture(this, {...})` の順、`tests/boot-loop.test.ts:45-62` の `for (const id of boatIds)`）。新しい絵のファイルは今と**同じ名前の関数**（`generatePlayerBoatTexture`・`generateDestroyerTexture`・`generateTransportTexture`・`generateTorpedoTextures`・`generateBargeTextures`・`generateFriendlyBargeTexture`・`generatePtBoatTexture`・`generateFriendlyTransportTexture`・`generateAllyDestroyerTextures`・`generateAircraftTexture`・`generateGunneryTextures`・`generateSmokeTextures`）を export し、旧の `assets/*-placeholder.ts`・`placeholders.ts` はその名前を新しいファイルから再 export する（または同じ名前の中身を差し替える）。世界の絵と UI を 1 つの関数で作っているもの（`generateGunneryTextures`＝砲弾・曳光弾・探照灯・星弾・HP バー、`generateSmokeTextures`＝丸ボタン・煙、`generateTorpedoTextures`＝魚雷・雷跡の点・爆発の輪、`generateAllyDestroyerTextures`＝卯月・扇）は名前と UI の部分を今のファイルに残し、描き直す世界の絵の部分だけ新しい関数を呼ぶ。Boot の import の行だけは変わってよい（テストは呼び出しの行を見る）。足すのは `tex-destroyer-us` の 1 行と、S3a 以降の新しい鍵の生成の行だけ。UI の扇（`allyFanFor`）は今のまま。

### 4.1 自艇・僚艇・隼艇（S1。`boatTextureKey(id)`、無彩色系、tint される）

| 艇（鍵） | 描くもの（艇首から艇尾への位置は長さの %） |
| --- | --- |
| Elco 80（`tex-boat-us_elco80`） | 尖った艇首・最大幅は 55%・艇尾は幅 0.9B の四角。側の暗い帯は描かない（R17。縁は明るいリム 1.5 単位）。前甲板の 20 mm（12%・丸）。操舵室と海図室（38〜52%・幅 0.45B の角丸の塊。地より 20% 暗い程度、前に明るい風防の帯）。左右の連装 .50 の銃座（50〜56%・±0.32B・輪に明るい中心）。魚雷の発射管 4 本（両舷の縁の内 1.5 単位・前の組 25〜50%・後ろの組 56〜82%・幅 2 単位の筒に明るい筋）。艇尾の 40 mm（85%・丸）と煙幕の発生機（艇尾の 2 単位の矩形）。中心線の明るい筋 |
| Elco 77（`tex-boat-us_elco77`） | Elco 80 と同じ道具で、操舵室を前寄り（33〜47%）・艇尾の 40 mm なし・発射管 4 本（両舷 2 本ずつ、28〜78%）。us_01 は自艇と僚艇がこの 1 枚（僚艇は青の tint） |
| T-38（`tex-boat-jp_t38`。乙型） | 尖った艇首・短く低い船室（40〜55%・幅 0.5B）・13 mm 機銃（船室の上・丸）・艇尾の両舷の魚雷の架台 2 本（58〜92%）・艇尾の爆雷の小さな樽 2。jp_03 の 18 隻もこれ |
| T-14（`tex-boat-jp_t14`） | T-38 より短く幅も狭い。船室は後ろ寄り（48〜62%）・魚雷 2 本（60〜93%） |
| H-38 隼艇（`tex-boat-jp_h38_hayabusa`） | 魚雷なし。前と後ろに 25 mm の丸い銃座（22%・78%）・中央の船室。jp_01 ハードで青の tint |

### 4.2 敵・米側の艦、大発、機、味方の艦（S2a。機は S2b）

| 物（鍵） | 系統 | 描くもの |
| --- | --- | --- |
| 日本の駆逐艦（`tex-destroyer`。陽炎型の簡略） | 敵 | クリッパー艇首（尖りと外へ開く線）・船首楼の段（30% に明るい横線）・連装砲塔 A（15%）・艦橋（25〜30%・暗い塊に明るい上面）・煙突 2（37%・52%・暗い楕円に明るい縁）・四連装の発射管 2（45%・62%）・連装砲塔 X・Y（78%・86%）・丸い艦尾。us_01・us_02 |
| 米駆逐艦（**新しい鍵 `tex-destroyer-us`**。フレッチャー級） | 敵 | 平甲板・単装 5 インチ 5 基（12%・19%・72%・80%・88%）・艦橋（27%）・煙突 2（38%・50%）・五連装の発射管 2（56%・64%）・40 mm の銃座。寸法は us_destroyer（114.8 × 12 × sprite_scale）。jp_06（今は日本の駆逐艦の絵を流用している）。**決め D3**: 鍵は art config の表 `shipArtKey(enemyId)`（既定 `tex-destroyer`）。DestroyerGroup は敵の id を持たず、`DestroyerSetup` に id を足すと setup の snapshot（-u 禁止）が変わるので、**world-enemies が `shipArtKey(mission.enemyId)` を DestroyerGroup の新しい最後の引数で渡し、Destroyer の既存の `textureKey` 引数に流す**（R15。setup には何も足さない）。当たりは data のまま。見た目は 236 × 21.6 → 229.6 × 24 に変わり、前からの当たりの大きさに揃う（R23。CHANGELOG に「見た目だけ」） |
| 卯月（`tex-destroyer-friendly`。睦月型） | 味方 | 匙形の艇首・単装 12 cm 4 基（12%・35%・70%・88%）・煙突 2（30%・47%）・三連装の発射管 2（40%・58%）・船首楼の後ろの切れ込み。**寸法は厳守**（名前の y がここから決まる） |
| 輸送船（`tex-transport`／`tex-transport-friendly`） | 敵の輸送船（灰赤）／味方 | 丸い艇首・丸い艇尾・船倉のハッチ 4（明るい縁の暗い矩形・前 2 後ろ 2）・中央の船橋と煙突（帯つきの暗い楕円）・マスト 2（小さな点）と荷役の腕（細い線 1 単位）。味方の 1 枚は**寸法は厳守**（名前と状態の行の y） |
| 大発（`tex-barge`／`tex-barge-friendly`） | 敵／味方 | 平らな艇首の道板（明るい矩形・幅 0.76B を保つ）・開いた荷台（暗い内側と明るい舷）・荷台の兵や荷の小さな点 3〜4・艇尾の機関と操舵の塊。輪郭は placeholder のまま（平たい艇首が見分けの鍵） |
| 米PT（`tex-pt-boat`） | 敵 | Elco 80 と同じ道具を敵のパレットで（形は自艇と同じ＝史実。色で敵） |
| 敵機（`tex-aircraft-enemy`） | 敵 | **任務ごとに描き直す**（**決め D4**。下の 4.3） |
| 味方機（`tex-aircraft`） | 味方（`HOME_COLOR` 系） | SBD・TBF 級の単発機（us_02 の誤射の機。data の注「SBD・TBF 級」） |
| 魚雷（`tex-torpedo`） | 黄 | 黄の胴・明るい先端・尾の 1 単位をやや暗く（寸法は今のまま。凍結の torpedo-pool の絵。黄の面積 ≥ 85%・平均の明るさ ≥ placeholder × 0.95＝R8）。雷跡の点 `tex-wake-dot` は描き直さない（R8） |

### 4.3 機の種類（S2b。`tex-aircraft-enemy` を Mission の開始時に 1 回描き直す）

- 理由: 敵機の鍵は 1 つで、凍結の `air-strike-flight.ts` が使う（鍵を変えられない）。一方、任務ごとの敵機は data で 1 種類に決まる（夜明けの空襲 `dawn_strike.aircraft_id`・水上機 `enemy_aircraft.enemy_id`・夜の哨戒機 `patrol_air.aircraft_id`。jp_02 は哨戒機も空襲も us_patrol_bomber で同じ）。そこで Boot は鍵を Canvas のテクスチャとして作り、任務の世界を作る時に `paintMissionAircraft(scene, aircraftId)` が canvas を `clearRect` してその種類を描き、`refresh()` で GPU に送り直す（1 任務 1 回・66×53 px。`generateTexture` は既存の鍵へは消さずに重ね描きする＝Phaser 3.90 の実装を確認済み）。
- 種類の表（art config。id → 絵）:

| data の id | 任務 | 描く形 |
| --- | --- | --- |
| ijn_f1m2_pete（零式水上観測機） | us_01 の空襲 | 複葉（上翼をやや前）・中央の大きなフロートが機首の前へ出る・翼端の小フロート |
| ijn_seaplane_jake（零式水偵） | us_02 の水上機 | 低翼単葉・双フロート（胴の左右）・長い風防 |
| ijn_a6m2n_rufe（二式水戦） | us_03 の空襲 | 零戦の平面形（丸い翼端）＋中央フロート＋翼端の小フロート |
| us_henderson_aircraft（F4F／SBD 相当） | jp_01 の空襲 | SBD（直線テーパーの翼・長い風防・穴あきフラップは描かない） |
| us_patrol_bomber（PB2Y 相当） | jp_02 の哨戒機と空襲 | 4 発（翼のナセル 4）・艇体・双垂直尾翼・翼端フロート |
| us_carrier_aircraft（F6F 相当） | jp_03・jp_06 の空襲 | 角ばった翼端・太い胴・プロペラの円（薄い） |
| us_tacloban_aircraft（F4U 相当） | jp_04 の空襲 | 逆ガル翼（折れの位置に明るい線）・長い機首 |
| （味方機 `tex-aircraft`） | us_02 | SBD 級（青）。描き直さない |

- 国籍の標識は描かない（2〜3 px で読めず、色の意味と混ざる）。どの種類も翼幅 ≥ 箱の 0.8（十字の読み）。撃墜の残骸（world-arms）も同じ鍵＝同じ種類で出る。
- 表に無い id（遊べない任務の機など）と敵機の無い任務（jp_05）は既定の形（今の十字に近い単発機）を描く。`paintMissionAircraft` は `generateTexture(key, W, H)` に幅・高さを必ず渡す（省くとゲームの画面の大きさで描く）。

### 4.4 陸・岸（S3c。描くところだけ）

- 南の岸（us_03・jp_01・jp_02・jp_04）と jp_03 の北の島・南の半島の岸の線に沿って、**岸の帯**（砂浜の帯・寄せる波の白い線・陸の際の木々の樹冠）を 1 枚の継ぎ目の無いテクスチャ（幅 512 m・1.0 px/m）にして、岸の線に沿って Image で並べる（海域の幅 ＋ 陸の幅 × 2＝6,000 m の海域で約 7,200 m・14〜15 枚。画面に出るのは 2〜4 枚）。陸の内側は今の一様な塗りのまま。陰・壕の岩の絵（jp_03）はそのまま。
- **帯の範囲**（R16）: 波打ち際＝論理の縁（南の岸は y＝海域の高さ、北の島は y 0。艇はここで止まり、jp_01 の大発の浜はここから 12 m）。海の側は寄せ波の白だけで 8 m まで、砂浜と木々は陸の側（陸へ 112 m まで）。岸の名の字（陸の中 land_m/2＝200〜300 m）・沿岸砲の砲台（深さ 9 で帯の上）にかからない。今の浜の線（`COAST_LINE_*`）は帯の波打ち際と同じ位置なので、帯の下で見えなくなってよい（帯の白い寄せ波が同じ縁を示す）。
- **jp_03**: 陰の絵（深さ 1。隠れ場所の x ± `COVER_ART_HALF_W_M` 460 m）と壕の絵・斜路（壕の x ± `CAVE_ART_HALF_W_M`）の幅には帯を置かない（帯の深さ 1.2 が陰の絵と斜路の海の部分＝深さ 1 の上に乗るため。ユーザーが「いいグラフィック」と言った絵を覆わない）。よけた端は帯の端の 16 m を透明へ落とす。
- 512 m の繰り返しが既定のズームで 4 回見えるので、1 枚おきに `setFlipX(true)`（R24。鍵は増やさない）。
- 浅瀬（遊びの帯と文字）・沿岸砲（射界の半円は UI）は変えない。

## 5. 海と演出

すべて `systems/world-art.ts`（新・持ち主）が世界の作成時に確保し（プール・Image・TileSprite）、`updateWorldVisuals` の最後の 1 行で更新、`destroyWorldVisuals` の最後の 1 行で破棄する（mission-world は作る 1 行だけ・world-visuals は各 1 行。`tests/world-visuals.test.ts` の期待にもその 1 行ずつを足す＝R13）。中身は 300 行を超えないように分ける（R18）: `systems/sea-fx.ts`（海・夜明けの光・きらめき）・`systems/wake-fx.ts`（航跡と船体の読み口）・`systems/coast-fx.ts`（岸の帯）・`systems/explosion-fx.ts`・`systems/fire-fx.ts`。時計は `realDt`（見た目だけ）。tween は使わない（tween は作るたびに物を作る）。世界の絵は論理の状態を読むだけで、書かない（R30。art-rules で source を検査）。

深さ（art config に `DEPTH` からの相対で。game-config の `DEPTH` は変えない）: 海の模様 0.05（格子・背景の上）・**夜明けの光 0.1**（海の模様の上・陸・艇・艦・世界の字の下。R3）・月のきらめき 0.2・岸の帯 1.2（陸の塗りの上・上陸地点の帯 1.5 の下）・航跡 3.5（暴風の帯 3 の上・雷跡 4 の下）・煙 11.5・炎 11.51（煙幕 11 の上・砲弾 12 の下）・爆発 20（`DEPTH.effects`。ADD の閃光と火球は 20.01）。ADD の物は同じ系統の深さ ＋0.01 にまとめ、通常の物と交互に並べない（WebGL のバッチが混合の切り替えのたびに切れる。R25）。**ビネットは作らない**（R3）。Mission の一番上に重ねる層は無い。

### 5.1 海の面（S3a）

- **方式（第 1 案）: 世界の座標に置いた TileSprite 1 枚**（R5）。Phaser 3.90 の WebGL の TileSprite は、継ぎ目の無い 2 の累乗のテクスチャを REPEAT で貼る（`TileSpriteWebGLRenderer`。`tilePosition` を書いても WebGL では描き直さない）。TileSprite は自分の局所の大きさの canvas と、それを登録した GPU のテクスチャ（UUID の鍵）を作る（WebGL では描かないが確保はする。`entities/sea.ts` の注にある iOS の canvas の上限の件はこれ）ので、**局所の大きさは小さく（例 128 × 64）して `setScale` で広げ、`tileScale` で模様を 0.5 px/m に合わせる**。
  - **画面に貼らない理由**（R5）: `setScrollFactor(0)` にしてカメラのスクロールから `tilePosition` を毎フレーム書くと、カメラの追従が `scene.update` の後の `Camera.preRender`（`node_modules/phaser/src/cameras/2d/Camera.js:489-540`）で進むため 1 フレーム遅れ、全速で約 1.4 px（固定ステップ 0・2 回のフレームで 0〜3 px）だけ波が陸・浅瀬・航跡に対して泳ぐ。揺れ（`cameras.main.shake`）の間は画面の縁に模様の無い帯も出る。
  - **置き方**: 位置は模様の周期（1,024 m）の倍数に揃え、`cameras.main.worldView` ＋ 1 周期の余白を覆う大きさ（既定のズームで約 4,100 × 3,000 m、見張りで約 5,100 × 3,500 m）。動かすのは揃えた升が変わった時（全速でも数秒に 1 回）とズームが変わった時だけ。模様は世界に固定＝海と一緒に流れる（速さの手掛かり）。カメラ（スクロール・ズーム・揺れ）には触らない。
- テクスチャ: 512×512 px（0.5 px/m ＝ 1,024 m 周期）。中身は絵だけの乱数で、周期の縁で折り返して描いた波頭の短い弧（明るい・α 低。夜は α ≤ 0.12）と、ごく薄いうねりの濃淡。点を一直線に並べた形は描かない（雷跡と紛れない。R7）。白で描いて光（§3.2）ごとに TileSprite の tint と α を変える（夜明けは `sea-light` と同じ段で、段が変わった時だけ）。
- **格子の線は既定で残す・海域の縁も残す**（**決め D5 を R6 で変更**）: 格子は距離（100 m）と速さの手掛かりで、消すのはユーザー未確認（CLAUDE.md §6.7）。art config の `SEA_GRID_ON`（既定 **true**）と、比べるための `?debug&title&nogrid`（game-config の `DEBUG_*` に 1 行）。実機テスト ② で「波の模様があれば格子を消してよいか」を聞き、決めは次の版。
- メモリ: 512² テクスチャ 1 MB（GPU）＋ その canvas 1 MB（CPU）＋ REPEAT 用の 2 の累乗の写し 1 MB（CPU の canvas）＋ 1 MB（GPU）＋ TileSprite の局所の canvas と GPU の写し（128 × 64 で各 32 KB）。tex-ab は UUID の形の鍵と `__` で始まる鍵を除いて比べる（R21）。
- 塗る量: 画面全面の α の層が 1 枚増える（iPhone 15 の canvas 1,702 × 785 ≈ 1.34 Mpx）。
- **第 2 案（S3a の計測で第 1 案が p95 +15% を超えたら）**: 全面の層をやめ、波頭のきらめきの小さな Image を 24 個プールしてカメラの周りに置き回す（世界の固定の位置・絵だけの乱数）。
- Canvas レンダラー（WebGL が無い端末）の TileSprite は毎フレーム canvas に描き直すので重い: `renderer.type` が CANVAS なら海の模様を出さない。

### 5.2 航跡（S3b）

- 船体 1 つに Image 1 枚（艇尾に頂点を置いた V 字の白いテクスチャ。`tex-wake-boat`（小艇）・`tex-wake-ship`（艦）の 2 枚）。位置＝艇尾（中心から艇首の逆へ半長）、角度＝針路、縦の倍率∝速さ（上限あり）、α∝速さ/最大の速さ × `WAKE_ALPHA_MAX`。0.5 m/s 未満は隠す。速さは船体の状態（`speedMps`。読むだけ）から取り、絵の位置の差からは取らない（固定ステップが 0・2 回のフレームでちらつく）。
- **形**（R7）: V の 2 本の腕（半角 19.5°）が主。中央の泡は艇尾から船体の長さの 0.5 倍まで（それより長い一直線は描かない）。`WAKE_ALPHA_MAX` ≤ 0.35（雷跡の点 0.55 より薄い）。jp_01・jp_04・jp_05 は米PT の雷跡を目で避ける任務なので、船体の航跡が雷跡（白い点の一直線）に見えてはいけない。
- **自艇の航跡は速力帯で決める**（R1・決め D9）: 遊びの「航跡」は速力帯が巡航か全速の時だけ（`core/patrol-air.ts:14-17` の `patrolWake`、`core/seaplane.ts:131-135`。静音は空から見えず、駆逐艦の発見距離も静音で縮む）。絵が論理と逆の手掛かりにならないように、自艇（jp_03 は座席の隊長艇）は世界の `w.band`（ヒステリシス込み・読むだけ）で段を決める: 停止＝なし、静音＝艇尾の小さな泡だけ（V なし・α ≤ 0.12）、巡航＝V、全速＝長く明るい V。僚艇・隊の艇・敵・味方は速さのまま。
- **見えない船体の航跡は出さない**: 船体の Image の `visible`・`alpha` に従う（夜の `sighted`・jp_03 の隠れた隊・沈没の tween）。敵の位置を航跡でばらさない。
- 対象（世界の公開の物から読む。私的なプールは `readonly` に出す＝v0.6.9 の smokeScreen の先例。行数は増やさない）: 自艇・僚艇・隼艇・駆逐艦・輸送船・大発（敵と味方）・米PT・卯月・味方の輸送船（停泊中は 0）・jp_03 の 18 隻。
- 自艇の曲がった航跡の点（プール）は**作らない**（予算。§5.7）。雷跡は凍結の torpedo-pool のまま、`tex-wake-dot` も描き直さない（R8）。

### 5.3 水柱・砲口炎・爆発（S3b）

- **水柱**: 新しい鍵 `tex-splash`（白い飛沫の輪＋明るい中心。寸法は `tex-explosion-ring` と同じ 96×96＝今の scale 定数で同じ世界の大きさ）を `SplashPool` の 1 行で使う。数・寿命・tint（外れ 青白・命中 橙）は今のまま。空襲の水柱も SplashPool を借りるので一緒に変わる。
- **砲口炎**: 新しい鍵 `tex-muzzle-flash`（星形の光。寸法は輪と同じ）。7 か所の 1 行ずつ（enemy-fire・shore-battery・pt-gun・world-arms・barge-hunt・pt-squadron・ally-destroyer。どれも凍結の外。pt-squadron と mission-scene は 300 行なので同じ行の中の置き換えだけ）。
- **爆発**: `playExplosion(scene, x, y, dud)` の名前と引数はそのまま（mission-scene は触らない）、中身を世界が作った `ExplosionFx` のプールに: 1 つの大きい爆発＝閃光（`tex-muzzle-flash` を大きく・0.15 秒・ADD）＋火球（新 `tex-fireball`・橙の放射グラデーション・0.5 秒で膨らむ・ADD）＋水柱（`tex-splash` 白・0.8 秒）＋**今の輪**（橙＝命中・灰＝小さい版。結果を読む印なので残す。輪もプールの物）。枠 4（5 つ目は一番古い枠を使い回す）＝Image 16。毎回の new と tween をやめる（§7 の違反の解消）。
  - **小さい版**（`dud` true。R11）: 魚雷の不発だけでなく、自艇への小さな被弾（`systems/boat-damage.ts:46` の `small`）・僚艇の被弾（`world-enemies.ts:62`）・座礁（`world-boat.ts:49`）でも呼ばれる（`scenes/mission-scene.ts:80-114`）。艇に当たった弾が水柱に見えないように、小さい版は小さな閃光（0.1 秒）＋灰の輪＋暗い玉 1 つ（火災の煙の玉の上限の大きさ）で、**水柱は出さない**。大きい版（命中・撃破・沈没）だけ水柱。
  - **持ち主と寿命**（R12）: ExplosionFx は世界の絵（world-art）が作り、mission-effects のモジュールの変数に登録、`destroyWorldVisuals` の最後の行で破棄して登録を外す。登録の無い間（世界の作成前・破棄後）の `playExplosion` は何もしない（静的なシーンごとの取り出し `forScene` は使わない＝やり直しで破棄済みの Image を握らない）。
- **爆弾は変えない**: 凍結の air-strike-flight と enemy-seaplane の爆弾は輪の絵を灰で縮める今のまま（2 か所で見た目を揃えるため enemy-seaplane も変えない）。爆撃進路の線（`tex-tracer` を伸ばす）も今のまま。

### 5.4 炎と煙（S3c）

- `FireFx`: 発生源の枠 6（自艇・僚艇・jp_03 の操作中の隊長艇の火災 `damage.fireLeftS > 0`、命中して沈んでいない駆逐艦・輸送船、HP の減った米PT、卯月・味方の輸送船の被弾）。発生源ごとに炎のちらつき 1 枚（新 `tex-flame`・ADD・α と大きさを実秒の正弦で。小艇では船幅の 0.8 倍まで＝船体の色を覆わない）と、共有の煙の玉のプール 16（`tex-smoke-puff` を tint・風下へ流れて膨らみ 2.5 秒で消える。0.25 秒ごとに 1 つ）。プールが尽きたら一番古い玉を使い回す。
- **煙幕と見分ける**（R10）: 煙幕（遮る・論理あり。玉の半径 60 m の青灰の丸い塊）と同じに見えると「煙に隠れている」と読み違える。火災の煙の玉は**半径 ≤ 15 m**（煙幕の 1/4）・黒に近い茶灰（tint `#3a3430` 相当）・α ≤ 0.5・細い尾。沈没の煙の柱も同じ上限。
- 沈没の始まり（`sinking` が立ったフレーム）: 泡と油の輪（`tex-splash` を大きく薄く・3 秒）と煙の玉 4 秒。
- 見えない発生源（`visible` false・α < 0.1）は出さない。消火すれば次の玉から止まる。玉ごとに持ち主の番号（Int8Array）を持ち、持ち主が見えなくなったらその玉は 0.3 秒で消す（流れ続けて隠れた敵の位置を指さない。R26）。

### 5.5 探照灯・星弾・煙幕（S3c。鍵・寸法・原点はそのまま）

遊びでは「照らされた＝見つかる」「煙の中＝隠れる」なので、見える広さを論理の広さに合わせ、縁を見えるまま残す（R2・R32）。

- **探照灯** `tex-searchlight`: `textures.createCanvas` の Canvas の 2D のグラデーションで描く（`Graphics` の `fillGradientStyle` は WebGL だけで、`generateTexture` の Canvas では効かない）。光源の明るい点（α 1）→ 先端へ向かって下がるが**先端の行でも α ≥ 0.6**、横の柔らかさは半幅の外側 10% だけ（扇の縁は論理の角のまま見える）、**全体の平均 α ≥ 0.85**（今の一様 1.0 にほぼ同じ明るさ）。呼び出しの α 0.2・煙で × 0.4 は今のまま（ui-config は 302 行なので触らない）。光源 (0.5, 1)・角・長さ 256 単位・幅と高さは厳守（3,000 m の射程で約 10 倍に引き伸ばす＝テクスチャの 1 px の柔らかさは約 10 m）。
- **星弾** `tex-starshell`: 放射グラデーション。中心の明るい芯 → **半径の 92% まで α ≥ 0.6 の平らな面** → 92〜100% に細い明るい縁（照らされる範囲の境目）→ 外は 0。半径 128 単位は厳守（照明の半径＝絵の半径）。照明弾の tint も同じ絵。
- **煙幕** `tex-smoke-puff`: 柔らかい塊（大小 4〜5 つの玉を重ねた放射グラデーション。玉は半径の 90% の円の内に置く＝輪郭は丸のまま）。帯（0〜0.4・0.4〜0.7・0.7〜1.0 の半径）ごとの平均 α を今の合成（0.70・0.58・0.35）の ±10% に保ち、最後の 5% で落とす（見える広さ＝遮る広さ）。半径 64 単位は厳守。火災の煙もこの絵を tint して使う（§5.4 の大きさの上限）。

### 5.6 月光・夜明け（S3a）

- **月のきらめき**（half・full の任務＝us_02）: 小さな `tex-glint`（16×8 px）を 12 個（full 16）、カメラの見える範囲（世界の座標）に絵だけの乱数で置き、画面の外へ出たら反対側へ置き直す。dark・day は 0。**砲口炎と見分ける**（R9）: 夜の敵の位置は砲口炎（暖かい黄白の星・ぱっと光る）で知るので、きらめきは横に細長い筋（2:1 以上・星形にしない）・冷たい青白・α ≤ 0.3・ゆっくりした明滅（周期 ≥ 2 秒・振れ幅は α の 0.5 倍まで）。
- **夜明けの光**: 横のグラデーション 1 枚（新 `tex-dawn-glow` 256×64 を画面へ拡大・`setScrollFactor(0)`・揺れの縁が見えないように画面より各辺 3% 大きく）。**深さ 0.1＝海の模様の直上、陸・艇・艦・機・世界の字の下**（R3。艇・艦の色を光で変えない）。右端（東）の橙から透明へ、**α ＝ 0.22 × sin(π × 段/16)**（夜 0・移り変わりの中ほどで最大・昼 0。R4）。`dayStart` の任務（jp_03）は 0。段が変わった時だけ書く（`WorldDawn` に段の読み口を 1 つ足す。式は `sea-light` と同じ core の `seaLightStep`）。
- **ビネットは作らない**（R3。§3.2）。
- どれも **Mission のシーン**に置く（Hud のシーンに足すと hud-ab が変わる）。カメラ（スクロール・ズーム・揺れ）は触らない（CAM=1 の再生が変わる）。

### 5.7 予算（数・メモリ・塗る量・フレーム）

| 項目 | 物（作る数／画面に見える最大） | GPU のテクスチャ（k 1.09） |
| --- | --- | --- |
| 海の面（TileSprite） | 1 / 1 | 2 MB（タイル 1 MB＋REPEAT の写し 1 MB）＋局所の写し 32 KB。CPU の canvas は 2 MB＋32 KB（R21） |
| 夜明けの光 | 1 / 1（夜明けの移り変わりの 26 秒だけ見える） | 64 KB |
| 月のきらめき | 12（us_02 だけ）/ 12 | 1 KB |
| 航跡 | 船体の数（最大 jp_03 の 18＋自艇）/ 動いて見えている船体の数 | 0.15 MB（2 枚） |
| 爆発 | 4 枠 × 4（閃光・火球・水柱・輪）＝16 / 16（R12） | 下の新しい鍵に含む |
| 炎と煙 | 炎 6 ＋ 玉 16 ＝22 / 22 | 下の新しい鍵に含む（煙は `tex-smoke-puff` を流用） |
| 岸の帯 | 14〜15（岸のある任務。jp_03 は陰と壕をよけた分だけ少ない）/ 2〜4 | 0.25 MB（1.0 px/m × 512 m × 128 m の 1 枚。初めて使う時に 1 回） |
| 艇・艦・機・魚雷・水柱・砲口炎・探照灯・星弾・煙幕 | 0（鍵の描き直し。新しい鍵 `tex-destroyer-us`・`tex-splash`・`tex-muzzle-flash`・`tex-fireball`・`tex-flame`） | +0.15 MB |
| **合計** | 作る数 +約 75（見えないプールを含む。us_02 はきらめき 12 を足す） | **約 +2.7 MB（CPU の canvas を足して約 +5.5 MB）** |

- 門: GPU のテクスチャ **≤ +12 MB**（k 1.09。k 2 の大画面は ≤ +24 MB を報告）、**画面に見える Mission の物 ≤ +40**（台本の夜の p95。jp_03 ハードの第 4 波と us_02 ハードを必ず含む）、**フレーム p95 ≤ +15%**（下の art-perf）。
- **塗る量は既存の層込みで見る**（R20）: 星弾は照明半径 1,500 m＝既定のズームで直径約 2,460 px（画面の幅 1,702 px より大きい＝1 発で全面の層 1 枚）、us_02 ハードは 3 隻ぶん同時にありうる。探照灯（3,000 m・12°＝先端の幅 630 m）も隻数ぶん。最悪の場面（us_02 ハード）は 星弾 3 ＋ 探照灯 3（約 1 枚ぶん）＋ 海 1 ＋ 夜明けの光（移り変わりの間だけ・右の 1/3）≈ 5.3 枚。新しく足す全面の層は**海の 1 枚だけ**（ビネットを外した。R3）。iPhone の GPU（A15 以降）で 1.34 Mpx × 5.3 × 60 fps ≈ 0.43 Gpx/s＝余裕。ヘッドレスの SwiftShader は塗りに厳しい（CPU のラスタ）ので、そこで +15% に収まれば実機は安全側。art-perf の us_02 ハードの台本は星弾が上がっている窓を必ず含める。
- jp_03 の 18 隻の航跡で +40 を超えそうなら、操作していない隊の僚艇（各隊 2 隻）の航跡を隠す（art config の切り替え）。

## 6. §7（パフォーマンス・ガードレール）の注意と避け方

| 危ない書き方 | この版で起きうる所 | 避け方 |
| --- | --- | --- |
| update の中の new・filter/map・リテラル | 演出の発生（爆発・煙の玉・航跡） | すべて世界の作成時に確保したプール（Image と Float32Array の年齢）。発生はプールの次の枠の値を書くだけ。tween を使わない（tween は作るたびに物）。`playExplosion` の毎回の new＋tween をこの版でやめる |
| 毎フレーム Graphics.clear → 描き直し | 海・岸・機の描き直し | 絵はすべて Boot で 1 回（`generateTexture`／Canvas の 2D で描いて `refresh()`）。例外は敵機の 1 枚を任務の開始に 1 回だけ（66×53 px）と、陰と同じく初めて使う時に 1 回の岸の帯 |
| 毎フレーム setText | — | 文は足さない |
| DOM の HUD | — | 使わない（Canvas の 2D はテクスチャを作る時だけ） |
| sqrt の多用 | 航跡・炎の見える判定 | 画面の矩形との比較と船体の visible だけ。距離は使わない |
| 全物 × 全物 | — | 当たりは触らない |
| 可変ステップの物理 | 演出の時計 | 見た目は `realDt`、論理には何も返さない（固定ステップの中では何もしない） |
| フル解像度の canvas | テクスチャの密度 | 艇・艦は k（≤ 2）のまま。海・岸は k に依らない低い px/m。画面の大きさの canvas は作らない（TileSprite の局所の canvas は 128 × 64＝R5・R21） |
| JSON を毎シーン fetch | 機の種類 | 種類は setup（data を Boot で 1 回読んだ物）から |
| Math.random | 絵の乱れ・きらめき・煙の揺れ | 絵だけの `SeededRng(ART_SEED_*)`。ゲームの系列（gunRng・lookoutRng・seed+N の各系列）を引かない＝ab-replay の世界の写しと模擬の md5 が証拠 |
| 外部 CDN・音 | — | 使わない（音は v0.7.1） |
| （この版の固有）tint の掛け算 | tint される鍵（艇・大発・米PT・敵機） | 無彩色に近い・地が意味の色の系統で描き、tex-check で色相を確かめる |
| 回る絵の焼き込みの光 | 艇・艦・機 | 回転に依らない枕の陰影（§3.1） |
| 寸法から決まる字の位置 | 味方の輸送船・卯月 | テクスチャの寸法は式のまま（tex-ab で鍵ごとに一致） |
| 凍結のファイル | torpedo-pool・air-strike-flight ほか 20 本 | 1 字も触らない。絵はテクスチャの側だけで変える |
| 300 行 | placeholders.ts 329・ui-config.ts 302・mission-scene.ts 300・pt-squadron.ts 300 | placeholders.ts は世界の絵の関数を新しいファイルへ移して 300 行以下に（触るなら減らす）。ui-config は触らない（新しい定数は art config）。300 行の 2 本は同じ行の中の置き換えだけ |
| Hud・カメラ | 画面に貼る絵 | Mission のシーンに置く。カメラの揺れ・ズーム・スクロールは触らない |
| `generateTexture` の既存の鍵 | 敵機の描き直し | 既存の鍵へは消さずに重ねる → 先に canvas を `clearRect` |
| Canvas レンダラー | TileSprite・ADD | `renderer.type` が CANVAS なら海の模様と ADD の光を出さない（遊びは同じ） |
| （この版の固有）カメラの 1 フレーム遅れ | 画面に貼って世界に合わせる絵（海の模様） | カメラの追従は `Camera.preRender` で進む（scene.update の後）。世界に固定する絵は世界の座標に置く（§5.1。R5） |
| （この版の固有）論理と食い違う手掛かり | 航跡・探照灯・星弾・煙・きらめき | 航跡は自艇の速力帯（R1）、光と煙は論理の縁が見える（R2・R32）、火災の煙は煙幕と、きらめきは砲口炎と、船体の航跡は雷跡と形・色・大きさで分ける（R7・R9・R10） |
| （この版の固有）ソースを固定するテスト | Boot の呼び出し・world-visuals の本体・setup の snapshot | Boot の行は変えない（R14）、world-visuals は最後に 1 行ずつ足してテストの期待も足す（R13）、setup には何も足さない（R15） |
| （この版の固有）ADD と通常の交互 | 爆発・炎 | ADD の物は深さ ＋0.01 にまとめる（R25） |

## 7. 段と門

### 7.1 毎段の門（すべて通るまでコミットしない）

1. `npm test`・`npm run typecheck`・`npm run lint`・`VITE_BASE=/ww2-torpedo-boat/ npm run build`。
2. `tests/frozen-files`（20 本の sha256）。setup の snapshot は**決して -u しない**（変われば間違い）。
3. `bash scripts/headless/g2.sh` に `G6=1 ALLY=1 EVAC=1` → **OK 37 DIFF 0**（模擬は絵を読まない＝変わらないはず）。
4. `scripts/headless/ab-replay.mjs`: A＝`.../v0700/base-f5563ab`、B＝今のビルド、`CAM=1`、`SET=all`（58 件）・`SET=jp04base`（8 件）・`SET=jp03`（4 件）が **same:true**。`scripts/headless/hud-ab.mjs`: `SET=base`（16）・`jp04base`（8）・`jp03`（4）が same:true。これで「全部の組」（R29）。`SET=jp04`（B の &noally を卯月の無い基準と比べる v0.6.10 の組）は f5563ab が基準だと意味が無いので使わない。既知の揺れ: nodawn/result の us_02 の最後のフレームの `.t` が負荷で揺れる → その件だけ単独で再実行（重い絵で揺れが増えたら JOBS=2 で回す）。
5. ヘッドレスのページのエラー 0（上の全部と写し）。
6. 触った・作った `src` のファイルが 300 行以下（`git diff --name-only f5563ab -- src | xargs wc -l`）。`src/core` は Phaser を import しない（既存のテスト）。
7. 段の写し: `scripts/headless/art-shots.mjs`（S0 で作る）で 13 件 × W 1280・1560（＋見張り・reveal）を `.../v0700/impl/<段>/shots/` に。開いて見て、前の段と比べる（合否はページのエラーだけ。読みやすさの判断は §3.5 で）。艇・艦を描き直す段（S1・S2a）は、見張りのズームで 8 方位（45° ごと）に回した写しも撮り、細部のちらつきを見る（R17）。jp_03 の陰と壕の絵（ユーザーが評価した絵）は毎段の写しで前と同じか確かめる（R16）。
8. コミットは段ごとに 1 つ（件名は段の札で始める: `v0.7.0 S0: …`・`v0.7.0 S2a: …`・`v0.7.0 S3c: …`。段は S0・S1・S2a・S2b・S3a・S3b・S3c・S4 の 8 つ＝R19）。末尾は決められた 2 行だけ。`git push -u origin claude/v0.7.0-art`（失敗は 2・4・8・16 秒で再試行）。始める前に `git fetch` し、`origin/claude/v0.7.0-art` にその段の札で始まるコミットがあれば報告して止まる。作業中は約 30 分ごとに `.../notes70/wip/<段>/` へ退避（コミットしたら消す）。下書きは `.../v0700/impl/<段>/`。

### 7.2 S0 — 棚卸しの道具と骨組み（見た目は変えない）

- `package.json` の version を 0.7.0。CHANGELOG に `## v0.7.0 — 2026-11-07（アートと音①：コードで描く絵）` を立て、目的・変更点（段ごとに 1 行ずつ足す）・既知の制約・実機テスト結果（空欄）を置く。
- CLAUDE.md §2「アート」の行を「v0.6 まではプレースホルダー図形。v0.7 からは絵と音をコードで描く・合成する（外部の画像・音のファイルを使わない。ユーザーの決め U1（2026-11-07）「コードで描く・鳴らす」。手本は v0.6.11 の屋我地の陰＝`assets/evac-terrain-art`）。画像・音のファイルの制作にセッションを使わない」に替え、変更履歴に「2026-11-07 v0.7.0 §2「アート」に U1（v0.7 からの絵と音はコードで描く・合成する）」の 1 行。docs/03 の v0.7.0 の行の「権利クリア素材」を「コードで描く・合成する（U1）」にし、v0.7.1（効果音）・v0.7.2（BGM・命中スロー）に分けた予定を書く。
- art config の骨組み（定数だけ・何も import しない）: `src/config/boat-art-config.ts`・`ship-art-config.ts`・`aircraft-art-config.ts`・`fx-art-config.ts`・`sea-art-config.ts`（パレット §3.3・光 §3.2・種 `ART_SEED_*`・予算の上限・`SEA_GRID_ON`（既定 true＝R6）・機の種類の表・敵の id → 駆逐艦の鍵の表 `shipArtKey`）。新しい鍵の文字列は `TEXTURE_KEYS` に足す（art config に別の鍵の表を作らない＝重なりの検査が 1 か所）。`src/assets/art-dims.ts`（Phaser に依らない寸法の式。placeholder の `Math.ceil(B·k) × Math.ceil(L·k)` などを関数に）。
- テスト: `tests/art-inventory.test.ts`（`TEXTURE_KEYS` の 36 の値と `boatTextureKey` の形を固定し、各鍵を「描き直す世界の絵／変えない（§2.2 の「変えない物」＝R27）／演出」に分類。鍵は消さない・足すだけ・重ならない。`art-dims` の式が v0.6.11 の式と k ∈ {1, 1.0415, 1.0915, 2} で同じ）。`tests/art-rules.test.ts`（source を読む: `src/assets/*-art.ts`・`src/systems/*-fx.ts`・`world-art.ts` に `Math.random` が無い、ゲームの乱数の系列を受け取らない、`SeededRng` は `ART_SEED_*` だけ、update の本体に `new `・`.map(`・`.filter(`・`tweens.add` が無い、`Graphics.clear` が無い、**世界の絵のファイルは論理の状態へ代入しない**（`.state.`・`.speedMps =`・`.headingDeg =`・`.hp =`・`.phase =`・`.x =`／`.y =` を船体の状態に書かない。R30）。陰の `tests/evac-terrain-art.test.ts` の作法）。
- ヘッドレスの道具（`scripts/headless/`）:
  - `art-shots.mjs`（`.../v0700/impl/plan/shots.mjs` を移す。13 件 × 幅・見張り・reveal）。
  - `tex-ab.mjs`（A と B の全任務の `game.textures`: **既存の鍵の幅・高さが一致**・新しい鍵の一覧・GPU と CPU の MB の差（k 1.09＝W 1560 dpr 2 と、k 2＝ビューポート 1560×720 dpr 2）。TileSprite が作る UUID の形の鍵と `__` で始まる Phaser の鍵は除く（R21）。`tex-aircraft-enemy` は任務ごとに描き直すので任務ごとに読む。`CHECK=1` で §3.5 の tex-check（鍵ごとの canvas の画素から覆い・平均の明るさ・色相・海との明るさの比・tint を掛けた版の比・艦の幅と長さ・手掛かりの絵の α を placeholder＝A と比べる））。Boot の `create` の壁時計も A/B で出す（+200 ms 以内を目安・報告。R28）。
  - `art-perf.mjs`（A と B を交互に同じ台本で: us_02 ハード（星弾が上がっている窓を含む＝R20）・us_01 &dawn=20・us_03・jp_04 ハード・jp_02・jp_03 ハード（evac-perf の dodge_only:20 の窓）。EVERY 2 フレームに 1 回描き、描いたフレームの（進める＋描く）の壁時計の p95 と、画面に見える Mission の物の数の p95。2 回回して良い方）。
- 基準の数を CHANGELOG の S0 の行に: テクスチャの MB（k 1.09・k 2）、物の数、art-perf の p95（A 対 A で揺れの幅も）。
- 写し: 基準（この計画の `.../v0700/before/`）を `art-shots.mjs` で撮り直し、ページのエラー 0・見た目が同じこと（S0 は絵を変えない。tex-ab も A＝B で全鍵一致）。

### 7.3 S1 — 自艇・僚艇・隼艇（米と日本の艇）

- `src/assets/art-pen.ts`（描画の道具）、`src/assets/boat-shape.ts`（Phaser に依らない輪郭の点列）、`src/assets/boat-art.ts`（§4.1 の 5 枚）。`boat-art.ts` は `generatePlayerBoatTexture`（今と同じ名前・同じ引数・同じ鍵・同じ寸法）を export し、Boot の `for (const id of boatIds)` の呼び出しの行は変えない（import の行だけ。R14）。placeholders.ts からこの関数を消して（新しいファイルを指す）300 行以下に（UI の関数は残す）。
- テスト: `tests/boat-art.test.ts`（輪郭がテクスチャの矩形の内・艇首が上の中央・艇尾の幅・k ∈ {1, 1.09, 2} で寸法が art-dims と同じ・パレットの彩度 ≤ 0.12・細部の大きさ ≥ 2 単位・幅 10 単位未満は側の暗い帯なし＝R17）。
- 門: §7.1 ＋ `tex-ab.mjs CHECK=1` で 5 枚が覆い ≥ 85%・明るさ −10%〜+15%・無彩色・海との比 ≥ 4.5・tint を掛けた版の比 ≥ placeholder の 0.85 倍（R31）。僚艇（us_01）・隼艇（jp_01 ハード）の青、jp_03 の隠れた艇の暗さを写しで確かめる。見張りで 8 方位の写し。

### 7.4 S2a — 敵と米側の艦・大発・米PT・魚雷・味方の艦（R19 で S2 を分けた）

- `src/assets/ship-shape.ts`、`destroyer-art.ts`（日本の駆逐艦・**米駆逐艦 `tex-destroyer-us`（新）**・卯月）・`transport-art.ts`（輸送船 2 枚）（R18: 1 つの `ship-art.ts` だと 300 行を超える見込み）、`barge-art.ts`（2 枚）、米PT（`boat-art` の道具を敵のパレットで）、魚雷の絵（`tex-wake-dot` は描き直さない＝R8）。どれも今の関数の名前（`generateDestroyerTexture`・`generateTransportTexture`・`generateFriendlyTransportTexture`・`generateAllyDestroyerTextures`・`generateBargeTextures`・`generateFriendlyBargeTexture`・`generatePtBoatTexture`・`generateTorpedoTextures`）のまま、Boot の呼び出しの行は変えない（R14。`tests/world-ally.test.ts:70-78`・`tests/ally-ship-view.test.ts:99-108`）。Boot に足すのは `tex-destroyer-us`（us_destroyer を使う任務があれば）の 1 行だけ。D3 の鍵は world-enemies が `shipArtKey(mission.enemyId)` を DestroyerGroup の新しい最後の引数で渡す（R15。setup に足さない）。
- テスト: `tests/ship-art.test.ts`（輪郭がテクスチャの内・大発の艇首の幅 0.76B・艦の幅 ≥ 0.92B（長さの 20〜85%）と艦首 0 行目・艦尾 98%（R22）・駆逐艦の鍵の表が data の駆逐艦の id を覆う）。
- 門: §7.1（setup の snapshot が変わらない＝R15 の証拠）＋ tex-ab（既存の鍵の寸法の一致。とくに `tex-transport-friendly`・`tex-destroyer-friendly`）＋ tex-check（敵 赤・味方 青・輸送船 灰赤・魚雷の黄）。写し: jp_06 の米駆逐艦、jp_01 の reveal の米PT と大発、jp_04 の卯月と輸送船の名前の位置が基準と同じ、見張りで 8 方位。

### 7.5 S2b — 機の 8 種と任務ごとの描き直し

- `src/assets/aircraft-shapes.ts`（Phaser に依らない 8 種の平面形の点列）・`aircraft-art.ts`（`generateAircraftTexture`（今の名前のまま）・`paintMissionAircraft`）。世界の作成時に `paintMissionAircraft`（setup の機の id。jp_05 など敵機の無い任務は既定の形）。
- テスト: `tests/aircraft-art.test.ts`（機の翼幅 ≥ 箱の 0.8・機の id の表が data の全部の機の id を覆う・表に無い id は既定の形）。
- 門: §7.1 ＋ tex-ab（任務ごとに `tex-aircraft-enemy` を読む）。写し: jp_02 の PB2Y、us_01 の夜明けの Pete、us_02 の Jake と味方機、jp_03 ハードの第 4 波、jp_04 の F4U、撃墜の残骸。

### 7.6 S3a — 海の面・夜明けの光・月のきらめき・格子の切り替え（R19 で S3 を分けた。全面の層の計測の段）

- `src/assets/sea-art.ts`（海のタイル・夜明けの光・きらめき）、`src/systems/world-art.ts`（持ち主・更新・破棄）・`sea-fx.ts`（世界の座標の TileSprite＝R5・夜明けの光・きらめき）、`entities/sea.ts` の格子（`SEA_GRID_ON` 既定 true・`?debug&title&nogrid`＝R6）、`WorldDawn` の段の読み口。world-visuals の最後に 1 行ずつ（更新・破棄）、`tests/world-visuals.test.ts` の 2 つの期待の配列の最後にもその 1 行（R13）。
- テスト: `tests/world-art.test.ts`（純粋な部分: 夜明けの光の α の式 sin(π × 段/16) と dayStart で 0（R4）・海の升の揃え方（周期の倍数・worldView を覆う）・きらめきの置き直し）。
- 門: §7.1 ＋ tex-ab（新しい鍵だけ・GPU の差）＋ art-perf（全件 p95 ≤ +15%）。超えたら §5.1 の第 2 案。写し: 夜（月なし・月あり）・夜明けの移り変わり・昼、格子あり・`&nogrid`。

### 7.7 S3b — 航跡・水柱・砲口炎・爆発のプール

- `src/assets/fx-art.ts`（`tex-splash`・`tex-muzzle-flash`・`tex-fireball`・`tex-wake-boat/ship`）、`src/systems/wake-fx.ts`（航跡と船体の読み口。自艇は `w.band`＝R1）、`explosion-fx.ts`（`ExplosionFx`・`playExplosion` の中身・小さい版＝R11・登録と破棄＝R12）。`SplashPool` と砲口炎 7 か所の鍵の 1 行（pt-squadron は同じ行の中の置き換え）。私的な絵のプール（barge-hunt・convoy・pt-squadron・evac-boats-view の `sprites`／`imgs`）は同じ行で `readonly` に出す。
- テスト: `tests/world-art.test.ts` に足す（航跡の倍率と α の式・自艇の速力帯ごとの段・見えない船体で隠す・プールの使い回しが確保をしない＝source の検査・小さい版に水柱が無い）。
- 門: §7.1 ＋ art-perf（見える物 ≤ +40。jp_03 ハードの第 4 波）＋ `evac-perf.mjs`（jp_03 の窓の updateFrame の p95 ≤ jp_04 × 1.5 のまま）。超えたら §5.7 の jp_03 の切り替え。写し: 爆発の途中（大きい版・小さい版）、静音と全速の自艇の航跡、jp_04 の米PT の航跡と雷跡が並ぶ場面。

### 7.8 S3c — 炎と煙・探照灯・星弾・煙幕・岸の帯

- `src/assets/light-art.ts`（探照灯・星弾・煙幕の Canvas の 2D のグラデーション＝R2・R32。`generateGunneryTextures`・`generateSmokeTextures` の名前と UI の部分は今のファイルのまま）、`fx-art.ts` に `tex-flame`、`src/systems/fire-fx.ts`（R10・R26）、`coast-fx.ts` と `sea-art.ts` に岸の帯（R16・R24）。
- テスト: `tests/world-art.test.ts` に足す（炎の発生源の選び方・煙の玉の大きさの上限と持ち主で消す・岸の帯が jp_03 の陰と壕の幅をよける）。
- 門: §7.1 ＋ tex-ab（GPU ≤ +12 MB）＋ tex-check（探照灯・星弾・煙幕の α）＋ art-perf（全件 p95 ≤ +15%・見える物 ≤ +40）＋ `heap.mjs`（jp_04 120 秒・jp_03 `EVAC=1` 240 秒でヒープが頭打ち）。写し: 探照灯と星弾（縁が見えるか）、煙幕の中の自艇、火災中の自艇、沈む駆逐艦、岸の 4 任務と jp_03 の陰・壕。

### 7.9 S4 — 仕上げ

- docs/02 §7 を「アート方針（v0.7 から）」に（§3 の要約: 色の意味・回転に依らない陰影・縮尺・読みやすさの検査）。docs/03 の v0.7.0 の実機テスト項目（§8）。CHANGELOG を完成（目的・変更点・既知の制約・テクスチャの MB と物の数と p95 の前後・中立の証拠）。
- 門: §7.1 をすべて ＋ tex-ab・tex-check・art-perf・evac-perf・heap を最後のビルドで。before と after の写しの見比べの 1 枚（13 件 × W 1560 の縮小を並べた画像）を `.../v0700/impl/S4/`。
- PR（無ければ `gh pr create`）。報告: Pages の URL と期待するビルド番号（`claude/v0.7.0-art@<7 桁>`）、実機テスト 3 項目、既知の制約。

## 8. 実機テスト（iPhone・3 項目）

1. どの任務でも、自分の艇（白）・敵（赤）・味方（青）が夜の海で一目で分かるか。「見張り」で引いた画面でも、魚雷艇・大発・駆逐艦・輸送船・飛行機の形の違いが分かるか。
2. 波・航跡・水柱・爆発・火災の煙・探照灯・星弾が夜の海らしく見えて、敵や弾・雷跡を見落とす邪魔になっていないか（探照灯と星弾の照らす範囲の縁が分かるか・静音では自艇の白い航跡が出ないか）。あわせて、波の模様があれば格子の線は要らないか（URL の末尾に `?debug&title&nogrid` を付けると格子なしで遊べる。R6）。
3. 撃ち合いや空襲が重なる場面（us_02 ハード、jp_03 ハードの最後の空襲）でカクつかないか（左上の FPS が 55 以上か）。

## 9. 既知の制約（予定）

- 爆弾（灰の円が縮む）と爆撃進路の線は今のまま（凍結の air-strike-flight。水上機の爆弾も揃えて変えない）。
- 機は全種が同じ大きさのアイコン（翼幅 60 単位）。PB2Y も戦闘機と同じ大きさ。国籍の標識は描かない。
- iPhone のテクスチャの密度は約 1.1 px/単位: 砲塔・発射管などはズーム 0.75 以上で「それらしく」見える程度で、見張りでは形と色だけ。
- 船体の「壊れた絵」は無い（被害は炎と煙で見せる）。光は回転に依らない陰影で、影は落とさない（昼の jp_03 の機の影も無し）。
- 海の模様は WebGL だけ（Canvas レンダラーの端末では今の格子だけの海）。格子の線は今のまま残した（消すかは実機テスト ② で聞いて次の版。`?debug&title&nogrid` で比べられる。R6）。画面の四隅を暗くするビネットは作らない（R3）。
- 浅瀬・沿岸砲（砲台と射界）・暴風の帯と雨・砲弾と曳光弾・目標の輪と見越し点・輪・扇・HUD・Title・Briefing・Result の見た目は変えない（R27）。雷跡の点も今のまま（R8）。遊べない us_04〜us_07 の艇（Higgins・Vosper など）は描かない。
- jp_06 の米駆逐艦は絵の大きさが 236 × 21.6 → 229.6 × 24 に変わる（前からの当たりの大きさに揃った。当たりは変えない。R23）。
- 岸の帯は 512 m ごとに左右反転で繰り返す（R24）。jp_03 は陰と壕の絵の幅に帯を置かない（R16）。
- 音は無い（v0.7.1 で合成の効果音・最初のタッチで鳴らし始める・消音の切り替え）。BGM と命中スローは v0.7.2。

## 10. 決め（リード向け。ユーザーの決めは U1 だけ）

| # | 決め | 理由 |
| --- | --- | --- |
| D1 | 今の鍵・寸法・原点を全部保つ（描き直すだけ） | 字の位置（卯月・味方の輸送船）・scale 定数・凍結のファイルが鍵と寸法に依る。tex-ab で一致を門にする |
| D2 | 新しい鍵は新しい物だけ（`tex-destroyer-us`・`tex-splash`・`tex-muzzle-flash`・`tex-fireball`・`tex-flame`・`tex-wake-boat`・`tex-wake-ship`・`tex-sea-tile`・`tex-dawn-glow`・`tex-glint`・`tex-coast-strip`。`tex-vignette` は R3 で外した） | 輪の絵は見越し点・目標の輪・爆弾（凍結）でも使うので、輪のまま残して水柱・砲口炎・爆発に別の絵 |
| D3 | jp_06 の米駆逐艦にフレッチャー級の絵（新しい鍵）。鍵は world-enemies が `shipArtKey(mission.enemyId)` で DestroyerGroup へ渡す（R15） | 今は日本の駆逐艦の絵を流用。当たりは data のまま＝見た目だけ。setup に足すと snapshot（-u 禁止）が変わる |
| D4 | 敵機の 1 枚を任務の開始時に描き直す | 鍵が 1 つで凍結の air-strike-flight が使う。任務ごとの敵機は data で 1 種類 |
| D5 | 海の格子の線は**残す**（R6 で変更。`SEA_GRID_ON` 既定 true、`?debug&title&nogrid` で比べる） | 格子は距離と速さの手掛かりで、消すのはユーザー未確認（CLAUDE.md §6.7）。実機テスト ② で聞いて次の版で決める |
| D6 | 色の意味（白・赤・青・黄）を地の色に残し、陰影は回転に依らない | 夜の読みやすさと tint の掛け算 |
| D7 | 爆発の中に今の輪（橙＝命中・灰＝小さい版）を残す。小さい版（不発・小さな被弾・座礁）は水柱なし（R11） | 結果を読む印。プールにして毎回の new＋tween をやめる |
| D8 | 自艇の曲がった航跡の点・機の影・船体の壊れた絵は作らない | 物の数の予算（+40）と鍵の増加を避ける |
| D9 | 自艇の航跡は速力帯（`w.band`）で段を決める（静音は V なし）（R1） | 遊びの「航跡」は巡航・全速だけで、空からの発見と駆逐艦の発見距離がこれで決まる。絵が論理と逆の手掛かりにならない |
| D10 | 光と煙は論理の範囲の縁を見えるまま残す（星弾の平らな面と縁・探照灯の先端 α ≥ 0.6・煙幕の帯の α ±10%）（R2・R32） | 照らされた＝見つかる・煙の中＝隠れる。柔らかくして範囲を小さく見せない |
| D11 | 画面に重ねる光の層は海の直上だけ（夜明けの光は深さ 0.1）。ビネットは作らない（R3） | 艇・艦の色と世界の字を光で変えない（§3.2）。夜の海はもともと暗く、ビネットは塗りに見合わない |
| D12 | 段を 8 つに分ける（S0・S1・S2a・S2b・S3a・S3b・S3c・S4）（R19） | 1 段＝1 コミットの門（A/B・写し・計測）で、外れた時に原因の絵を切り分けられる大きさ |
