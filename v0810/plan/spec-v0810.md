# spec-v0810 — v0.8.1「米PT キャンペーン②b：オルモック湾の決着（us_06。パロンポン沖）」の仕様

作成 2026-11-16（計画のみ。repo は変えていない・commit していない）。基準: ブランチ `claude/v0.8.1-us06`（HEAD ＝ main e9d80ea ＝ v0.8.0 のマージ）。
読んだ物: CLAUDE.md（§2・§4・§7・§8・§11）・spec-v0800（§2.0 の us_06 の行・§2.2 の v0.8.1 の行と削る案 ①④・§9 Q7・§12 の v0.8.1）・CHANGELOG v0.8.0（全段と既知の制約）・docs/01 §8「多号作戦とパロンポン沖の卯月」「卯月の撃ち返し」（505〜600 行）・docs/02 §6.5・§6.12・docs/03 の v0.8.1 の行（56 行）と目安の注（136 行）・`data/*.json`（us_06・jp_04・us_02・us_04 の種、`ijn_destroyer`・`ijn_destroyer_mutsuki`・`ijn_transport`・`us_destroyer`、`hit_rate_model` の `visibility`・`kpi_measurement`・`radar`、`boats.json` の us_elco80、`torpedoes.json` の us_mk13、`scoring.json`）・コード（`core/ship-ai`・`ship-ai-data`・`strait-geometry`・`radar`・`visibility`・`hit-rate`・`dawn-withdraw`、`entities/destroyer`、`systems/destroyer-group`・`destroyer-step`・`destroyer-transit`・`destroyer-setup`・`world-setup`・`world-enemies`・`world-enemy-step`・`world-radar`・`strait-telemetry`・`mission-world`（95〜200 行）・`mission-telemetry`・`arms-step`（閃光）・`torpedo-free`・`torpedo-hits`・`kpi-storage`、`scenes/mission-scene` の endMission、`config/radar-mission-data`・`mission-hard-data`・`ship-art-config`・`dawn-data`、`assets/destroyer-art`、`ui/radar-lines`）・tests（`dawn-air` の漂流の固定・`boot-loop`・`engine-data`・`landing-neutral`・`campaign`・`briefing`・`title-grid`・`dawn-withdraw`・`jp05-mission`・`transit-world` の写しの固定・`person-denylist`）。
史実の調べ: 新しい事実はほとんど無い（docs/01 §8 の v0.6.9・v0.6.10 の表をそのまま使う）。足したのは WebSearch 1 回の抜粋（本文未読）＝第13号型駆潜艇の寸法と兵装（§4.3）。人名・人名を含む URL は書かない（CLAUDE.md §11）。PT の番号は出典の説明（`historical_note`・`source`・docs/01）にだけ書き、画面の文には出さない。

**ユーザーの決めと lead の既定（v0810/plan/decisions.md の写し。拘束）**
- U1（2026-11-16。spec-v0800 §9 Q7）: 問い「次の任務 us_06「オルモック湾の決着」（1944年12月、パロンポン沖で止まっている駆逐艦 卯月と輸送船 空知丸を夜襲する）では、史実では PT が 2 隻で攻撃しました。プレイヤーの艇に、僚艇（2 隻目の味方の PT。プレイヤーの後ろについて来て一緒に撃つ・沈むこともある）を付けますか？」への答え「付けない（推奨）」＝自艇 1 隻。
- L1（設計の既定・ユーザー未確認）: 夜明けの空は敵（日本機 4 機の空襲。空は争奪＝ユーザーの規則「制空権がない限り夜明けの後は空襲」と v0.8.0 の U1「Aのままでいいと思うよ」の前例）。
- 引き継ぐ: ほかの 10 任務はビット同一（setup の snapshot・g2 の md5・ab-replay と hud-ab を音の 3 状態・tex-ab）。基準は main e9d80ea。
- 史実の直し（spec-v0800 §2.0 で決めた。この版の S0 で種に入れる）: 場所 →「パロンポン沖（レイテ島西岸）」（題は作戦の名として残す）・月 half → dark（月没後）・目的から「特攻艇に注意」を外す。Briefing で jp_04 と同じ夜を言ってよい。

---

## §0 目的・Done・作法

- **目的（1 行）**: us_06「オルモック湾の決着」（1944-12-11〜12 の夜・パロンポン沖・月没後）を、1944 年の標準の SO レーダーで止まった卯月を捉え、暗い岸を背に忍び寄って撃ち、気づいて動き出した艦から逃れて北へ帰る任務として出撃可にする。ほかの 10 任務・音・曲・日本のタブは 1 ビットも変えない。
- **Done（1 行）**: Pages の米PT のタブ（5 枚の格子）から us_06（ノーマル・ハード）を遊べ、止まった艦が気づいて動き出す・岸を背にすると見つかりにくい・レーダーに卯月は映り泊地の輸送船は映らない・止まった艦への 1 本は通算の命中率に入らない、が出て、探りの帯（§3.9）を満たし、ほかの 10 任務とそのハードがビット同一（§5.1）で、ユーザーが iPhone で §6 の 3 項目を確かめる。
- 作法の要約（3 行）:
  1. 1 版の中を段 S0〜S4 の 1 commit ずつに刻み、段ごとに CHANGELOG（目的・変更点・既知の制約）と門。終わりは test・build・commit・push・PR と 3 点の報告（Pages URL とビルド番号・実機 3 項目・既知の制約）。実機の直しは IP1〜。
  2. 数は `data/*.json` だけ（`source` に historical／design）。新しい規則は「その任務の block があるときだけ鍵ごと出る setup part」（`radarSetupPart` の形）で、無い任務の setup・乱数・毎ステップの仕事を変えない。絵の定数は `config/*-art-config`。
  3. §7: update で確保しない・距離は 2 乗・atan2 は出来事の 1 回だけ・固定ステップ・seed 付きの乱数だけ（新しい系列を作らない）・1 ファイル 300 行以下・凍結 20 本は触らない・音と曲は絵と HUD に従う（D5）。

---

## §1 結論（推し）

1. **地図は jp_04 のまま米の側から**（6,000 × 3,000・南の岸＝レイテ島・泊地 (3000, 2760)・卯月 (3620, 2380)）。出発は北東の海 (5000, 250)、帰投の輪は北東 (4400, 400)。卯月と空知丸は t = 0 から止まっている。
2. **止まった艦の規則（新）**: 止まった艦は動かないが、見張りの規則（`core/ship-ai` の発見と雷跡）はそのまま走る。自艇を見つける・雷跡に気づく・被雷する・隊の誰かが気づいて数秒（`alarm_s`）・夜明け、のどれかで「気づき」、駆逐艦は `underway_s` 後に動き出して us_02 の AI（探照灯・砲・星弾・400 m の体当たり）になる。空知丸は揚陸を続けて一晩じゅう動かない（気づけば 76 mm を他の艦の光の下で撃つ）。包みは `core/anchored-ship`（純粋）＋`systems/destroyer-anchor`（`destroyer-transit` と同じ形）で、`core/ship-ai` は 1 字も変えない。
3. **暗い岸を背に（新）**: 艦から自艇への線を自艇の向こうへ伸ばし、`behind_m`（2,000）の内で陸の岸の線に当たれば、その艦の発見距離 × `detect_factor`（0.6）。照らされている間は効かず、機銃の閃光（1,200 m）はそのまま。2 乗の比べと割り算 1 回（平方根・atan2 なし）。`destroyer-step` で艦ごとに渡すだけで、block の無い任務は今の 1 つの値のまま。
4. **レーダー** `so_late`・`fit: own`。陸の反射 300 m に対し空知丸は岸の線から 240 m（映らない）、卯月は 620 m（映る）＝史実の「レーダーで卯月を捉えた」。v0.8.0 の 2 行目は「最初の接触」「新しい接触」「衝突の危険（動いている艦だけに直す）」が効き、列の 2 つ（ビラ・帰りの列）は出ない。
5. **命中率の KPI**: 発射の時に狙った艦の速さが `kpi_measurement.min_target_speed_kt`（5 kt）未満なら通算に数えない。今の任務の駆逐艦は AI の最も遅い時でも 8 kt（jp_06 の米駆逐艦の回避）以上＝どの 1 本も変わらない（tests で data から証す）。
6. **目的**: type `intercept_destroyer`・達成は卯月 1 隻の撃沈（`scoring.json` は変えない）。空知丸は今の輸送船の加点（400）。卯月は 2 本で沈む（史実「2 本以上」・記録の値）。夜明けは L1 の空襲（4 機）、浮いている艦は東へ退く。ハードは駆潜艇 2 隻（第13号型・止まった哨戒）。僚艇は無し（U1）。
7. **新しい模擬は作らない**（削る案 ①）。本物の世界をヘッドレスで台本で回す `scripts/headless/anchor-probe.mjs` で 6 つの遊び方 × 40 夜の帯を見る（§3.9）。

---

## §2 段と見積もり・種の直し

| 段 | 中身 | 見積もり | 区切り |
|---|---|---|---|
| S0 | data と検査（遊べない） | 0.3 | — |
| S1 | 純粋な規則と tests（誰も import しない） | 0.25 | — |
| S2 | 世界の配線（`?debug&mission=us_06`）。S2b に駆潜艇（ハード） | 0.5 ＋ 0.2 | セッションを切るならここ（Title に出ない） |
| S3 | ヘッドレスの探りと帯・つまみ | 0.3 | 切るならここも可 |
| S4 | HUD・Briefing・Result・Title・docs・最後の門 | 0.4 | PR |
| 計 | | **約 1.9**（docs/03 の 1.5〜2 の内） | 超えそうなら S2b を v0.8.1b へ（§11） |

種（`missions_seed` の us_06 の本体）の直し（S0。どれも理由を source に）:

| 鍵 | 今 | 直し | 理由 |
|---|---|---|---|
| `place` | オルモック湾（レイテ島） | パロンポン沖（レイテ島西岸） | 卯月の沈没位置は 11°03'N 124°23'E＝パロンポン（docs/01 530 行・high）。jp_04 と同じ |
| `moon` | half | dark ＋ `moon_label_ja`「月没後」 | 11 日 14:11 に月没、12 日 02:45 に月の出（docs/01 571 行・計算 high） |
| `objective` | 輸送部隊の駆逐艦を雷撃。特攻艇に注意 | §3.7 D-O1 の文 | 震洋がいた記録なし。PT-323 は 12-10 の特攻**機**（別の夜・別の場所） |
| `success` | 駆逐艦撃沈または輸送船撃沈、帰投 | 帰投。卯月を撃沈すれば達成 | D-O2（空知丸は今の加点の形。§9 Q1） |
| `enemies` | ijn_destroyer・ijn_transport | ijn_destroyer_mutsuki_enemy・ijn_transport | D-S1（睦月型の寸法） |
| `historical_note` | 「PT-490・492が駆逐艦卯月を撃沈…特攻でPT-323・300喪失。」 | 「1944-12-12 1時ごろ、パロンポン沖に止まっていた卯月を PT-490・PT-492 がレーダーで捉え、暗い岸を背に約1,000 ydから6本、2本以上が命中して撃沈（日本側記録一致）。空知丸は駆潜艇2隻に導かれパロンポンで揚陸。月は沈んでいた。PT-323 は 12-10 に特攻機で失われた（別の夜）」 | 出典の説明なので艇の番号は残す（画面に出ない鍵）。間違いの「特攻で 323・300」を直す |
| `briefing_note_ja`（新） | — | §3.7 D-O5 | 画面に出るのは S4 |
| `dawn_air` | play_as contested・「昼の空は争奪（特攻とコルセア）」 | play_as **enemy**（L1）・`label_ja`「昼の空は争奪（日本機の空襲）」・refs に jp_04 の VMF-541 の頁（12 日朝に日本機 33 機がオルモック湾の米艦へ）を足す・`enemy_ships_at_dawn` retire のまま | L1。`control` contested・`confidence` medium は変えない |
| `torpedo_type`・`player_boat` | us_mk13・us_elco80 | そのまま | PT-490/492 は Elco 80・Mk XIII 4 本（docs/01 538 行・high）。Mk 13 は架台から落とす＝発射の閃光なし（`launch_flash` false） |
| `title_ja`・`date`・`order` | オルモック湾の決着・1944-12-11・6 | そのまま | 題は作戦の名（jp_04 と同じ扱い）。date は夜の始まりの日（jp_04 と同じ） |

---

## §3 設計の決め

### §3.1 地図（design。x 東・y 南。jp_04 の地図を使う）

- **D-M1 海域と岸**: `bounds_m` 6,000 × 3,000・`coast` {south, `land_m` 600, `label_ja`「レイテ島（パロンポン）」}・`shallows` []＝jp_04 の `v0_1_prototype` の値そのまま（jp_04 の source: 「南の縁が岸（パロンポンの浜は本当は西向き＝模式図）」）。岸の線は `core/strait-geometry` の `landLine('south', …)` で y＝3,000（`strait-geometry.ts:30-39`）。揚陸地点の印（`world-landing` の帯と字）は使わない（味方の揚陸の仕組みに付いた絵。候補）。
- **D-M2 艦の位置**: 空知丸＝jp_04 の `landing.anchor` (3000, 2760)・135°。卯月＝jp_04 の `ally_destroyer.station` (3620, 2380) で、針路だけ 90° → **270°**（史実: 2 本は艦橋の下の左舷と中央部＝浜の側に当たり、PT は岸の側から来た＝docs/01 529 行 medium。西向きなら左舷が南の浜）。2 隻の間は 727 m（docs/01 600 行と同じ）。岸の線まで空知丸 240 m・卯月 620 m。
- **D-M3 出発と帰投**: 出発 (5000, 250)・225°・停止（北東のカモテス海の側。jp_04 の米PT の「東から岸沿い」の線の入口の側）。帰投の輪 (4400, 400)・半径 250・`call_margin` 1.5・`torpedo_settle_max_s` 10・`torpedo_end_settle_s` 5（us_04 と同じ）。出発から卯月 2,538 m・空知丸 3,209 m・輪の中心 618 m（縁 368 m）。輪から卯月 2,128 m・空知丸 2,744 m。
- **D-M4 今夜の揺らぎ**: `night` {hazard_scale 1・optional []・enemy_jitter x ±150・y ±50・heading 0・mirror_chance 0}。艦ごとに 1 件（ノーマル 2 件・ハード 4 件。seed+16 の今の系列の回数が増えるのは us_06 だけ）。y ±50 でも空知丸は岸の線から 190〜290 m（反射 300 m の内）・卯月 570〜670 m（外）。夜の水上機・誤射・暴風は出さない（その夜の記録なし＝docs/01 の「夜の PBY…不在」「味方撃ち…不在」）。
- **D-M5 長さ**: `duration_s` **200**・`fuel_allotment_gal` **40**（どちらも初めの design。§3.9 の T・F の帯で直す）。根拠の概算（`core/fuel` の曲線を手で: アイドル 20・巡航 23 kt で 200・全速 39 kt で 500 gal/h、指数 1.857 → 画面の 1 km あたり 静音 18 kt 4.0・巡航 23 kt 4.7・30 kt 5.7・全速 6.9 gal）: 岸を回る道（出発 → (5100, 1500) 巡航 1,254 m → (5100, 2870) 静音 1,370 m → 卯月の真南 (3620, 2900) 静音 1,480 m → 狙って 15 秒 → 輪の縁まで巡航 2,369 m）は 28.9 gal・138 秒＝40 gal で残り 28%・夜明けの 62 秒前。**上限**: `tests/dawn-air` の「止まって待つと 1,500 秒未満で漂流」（`dawn-air.test.ts:396-410`）で Elco 80 は 41.6 gal まで（40 gal は 1,440 秒）。F が足りなければ燃料でなく道（出発・輪）を直す。

### §3.2 艦と止まった艦の規則

- **D-S1 卯月の記録（新 `ijn_destroyer_mutsuki_enemy`）**: 敵としての睦月型。寸法 102.7 × 9.16 m・最大 34 kt は `ijn_destroyer_mutsuki`（jp_04 の味方の記録）の historical と同じ値、主砲は 12 cm × **2**（1944-08 の兵装・medium〜high）。ほかの AI と砲の値（巡航 25・旋回 1.5・加速 0.3・`detection`・`evasion`・`ram`・`patrol`・砲の 1 門の値・25 mm・探照灯 3,000 m・星弾）は `ijn_destroyer` の値をそのまま写す（命中率の KPI を合わせた値＝触らない）。写した鍵が `ijn_destroyer` と同じことは tests で固定。`torpedo_hits_to_sink` 2（`ijn_destroyer` と同じ値で、史実「2 本以上」とも合う。任務の `enemy_hits_to_sink` は置かない）。理由: jp_04 の味方の記録は鍵が足りない（detection・evasion・ram・hull_circles が無い＝`isEnemyAiDataRecord` を通らない）し、jp_04 を変えない。`ijn_destroyer` のままでは 118 m の陽炎型の当たりになり、同じ夜の卯月の大きさが両側で食い違う。
- **D-S2 空知丸**: 今の `transport` の block（v0.4.7 の us_02 の形）で `ijn_transport`（5,000 t 級 120 × 16 m で 4,107 t を代用＝jp_04 と同じ）。隊の最後の 1 隻・1 本で沈む（記録の値）・達成に数えない。
- **D-S3 止まっている（新 `anchored` の block）**: 隊の艦（駆逐艦・輸送船・駆潜艇）は t = 0 に速さ 0 で作り、気づくまで舵も速さも動かさない（`entities/destroyer` の `anchored` が立っている間は `steerShip` と縁の押し戻しをしない。位置・針路・当たりの円は作った時のまま）。**見張りは止まっていても今のまま走る**: `updateShipAi` は毎ステップ呼ぶ（自艇の発見・雷跡の発見＝見張りの乱数 seed+17 の引き方も今の規則）。出力の舵と速さだけを使わない。
- **D-S4 気づく理由（どれか 1 つ。`core/anchored-ship`）**: ① 見た（`ai.playerDetected`。D-B の艦ごとの距離で）② 雷跡（`ai.wakeSpotted`）③ 被雷（`hitsTaken` > 0。不発は数えない＝今の `takeHit` の規則）④ 警報（隊の別の艦が ①〜③ で気づくか沈み始めてから `alarm_s` 4 秒）⑤ 夜明け（ラッチ）。機銃の閃光は ① に入る（閃光の間は見つかる距離が 1,200 m 以上＝`arms-step.ts:181-184`）。気づいた艦は 2 行目と Result の材料に理由と秒を残す。
- **D-S5 動き出す**: 駆逐艦は気づいてから `destroyer_underway_s` **6 秒**（体感の時計＝AI の反応遅れと同じ。命中スローで延びる）で `anchored` を下ろし、以後は us_02 の AI そのまま（速さ 0 から加速 0.3 m/s²＝画面で 1.5 m/s 毎秒・5 kt まで 1.7 秒・25 kt まで約 8.6 秒）。止まっている間も、見つけていれば探照灯（2.5 秒後に点く）・砲・星弾は今の `EnemyFire` のまま。卯月は y 2,380 が縁の 700 m の内なので、動き出すと海域の中央へ向き直す（`ship-ai.ts:206-211`）＝北の海へ出て探す。夜明けは遅れなし（⑤ は `underway_s` 0）で、隊の `withdraw` が東へ退かせる。
- **D-S6 空知丸は動かない**: `transport_underway` false＝一晩じゅう止まって揚陸を続ける（史実: 12 日にパロンポンで揚陸＝docs/01 528 行 medium。動く空知丸は候補）。気づけば 76 mm を他の艦の自分の光の下で撃つ（今の輸送船の規則＝`destroyer-step.ts:36`）。夜明けに退かない（`withdraw` の `retiring` は立つが止まったまま）。
- **D-S7 置き場**: 新 `core/anchored-ship.ts`（純粋・≤ 150 行。状態は固定長の配列: 段 ASLEEP → ALERT → UNDERWAY・気づいた理由と秒・警報の時刻。`stepAnchors(st, plan, ships, feelNowS, dawnReached)` が動き出した艦のビットを返す）＋新 `systems/destroyer-anchor.ts`（≤ 110 行・Phaser 非依存・乱数なし。`destroyer-transit` と同じ形で隊が持ち、`destroyer-step` の艦の段の直後に 1 回）。`core/ship-ai`（278 行）は触らない。block の無い任務は `g.anchors` が null で、`Destroyer.anchored` はいつも false＝今の分岐と同じ。
- **D-S8 駆潜艇（ハードだけ。S2b）**: 新 `ijn_subchaser`（第13号型。51 × 6.7 m・喫水 2.75 m・438 t・16 kt・76.2 mm 高角砲 1・13.2 mm 2。§4.3）を 2 隻、泊地の外の哨戒の位置 (2300, 2050)・090° と (4300, 2200)・270° に止めて置く（同じ止まった規則。`picket_underway_s` 4 秒）。動き出せば記録の AI（体当たりなし）。隊の輸送船の後ろに並べ、駆逐艦にも輸送船にも数えない（達成・KPI・撃沈 n/m・輸送船の加点の外）。魚雷は当たる（喫水 2.75 m ＞ Mk 13 の `min_run_depth_m` 2）・1 本で沈む・点は無い。レーダーは小さい艇（`small_range_m` 1,800）。理由: 史実で駆潜艇 2 隻は空知丸を導いた（docs/01 525 行 medium）が、その夜の位置は見つからない＝ノーマルは史実の攻撃の場の 2 隻だけ、ハードで「敵艦の数が増える」（ユーザーの v0.4.4 の規則）。位置は出発点から今夜の揺らぎ込みで 1,978 m 以上（V-A4）。
- **D-S9 僚艇なし（U1）**: 地図の上の味方の PT は自艇だけ。2 隻目は Briefing の史実メモだけ。

### §3.3 暗い岸を背に（新 `shore_backdrop` の block）

- **D-B1 規則**: 艦 S から自艇 P への線を P の向こうへ伸ばし、`behind_m` の内で陸の区間のある岸の線に当たれば、その艦がこのステップで自艇を見つける距離 ＝ max(世界の距離 × `detect_factor`, 下限)。世界の距離＝今の `w.detectRangeM`（速力帯・月・煙幕・史実モード込み＝`mission-world.ts:152`）。下限＝機銃の閃光の距離（`arms.flashM`、効いていなければ 0）と水上機の照明弾（無い任務は 0）。照らされている（隊のどれかの `illuminated`＝探照灯・星弾）間は掛けない（光の中では背景が効かない）。
- **D-B2 幾何（`core/strait-geometry` に `landBehind` を足す）**: 線ごとに a＝(線の y − P.y)×landSide（P から岸まで・海の側が正）、t＝(P.y − S.y)×landSide（陸へ近づく向きの成分）。t ≤ 0 なら当たらない。当たる条件は a²·|SP|² ≤ X²·t²（X＝`behind_m`。両辺とも非負なので 2 乗で比べる＝平方根なし）、かつ当たる x＝P.x ＋ a·(P.x − S.x)/t が陸の区間の内（割り算 1 回・atan2 なし・確保なし）。岸の線は `coast`（南・切れ目なし）か `shores`（両岸）から起動時に 1 回（新しい `landLinesOf(shores, coastSouth, w, h)`）。
- **D-B3 値**: `detect_factor` **0.6**（月の段 1 つ分＝dark 0.6 と half 1.0 の比と同じ大きさ。design。spec-v0800 §12 の値）・`behind_m` **2,000**（design。つまみ 1,000〜3,000）。卯月の見つける距離（dark・基準 2,000）: 停止 480 → 288・静音 600 → 360・巡航 1,200 → 720・全速 1,920 → 1,152 m。例: 卯月の真南 (3620, 2900)＝520 m は背に岸（100 m 後ろ）・北 (3620, 1500) は無し・浜沿い (4400, 2850)＝911 m は背に岸（291 m 後ろ）、空知丸から (4400, 2850) は岸が 2,338 m 後ろで無し。浜沿いに西から空知丸の真南を抜けるのは無理（真南の浜でも 216 m＜停止の 288 m）＝西の浜から卯月へは空知丸を北へ大きく回るか、先に空知丸を撃つ。
- **D-B4 置き場**: 新 `systems/shore-backdrop.ts`（≤ 90 行。隊が持ち、`destroyer-step.ts:18` の艦の段で艦ごとに `g.backdrop ? g.backdrop.rangeFor(i, d.state, boat, w) : w.detectRangeM` を渡す＝block の無い任務は今の値そのもの）。艦ごとの「背に岸」のビットと距離を残す（HUD・Result の材料）。煙幕と掛け算・暴風は無い任務。検査は新 `config/backdrop-mission-data.ts`（V-B1〜V-B3）。
- **D-B5 HUD の 3 行目の「見つかる距離」**: us_06（block のある任務）だけ、最寄りの浮いている艦（今の 3 行目の相手＝`enemy.focus`）に対する艦ごとの距離にする（`mission-telemetry.ts:73` の 1 行の枝）。ほかの任務は今の式。
- **D-B6 デバッグ**: `?debug&nobackdrop` でその任務の block を出さない（`radarSetupPart` の radarOff と同じ形。探りの帯 A3 と実機の比べ）。

### §3.4 レーダー

- **D-R1**: `radar` {model `so_late`, fit `own`}（1944 年は各分隊がレーダーで接触を報じた・卯月はレーダーで捉えられた＝spec-v0800 §3.1 medium）。so_late は艦 6,000・小さい艇 1,800・掃引 2 秒・陸の反射 300・丸め 25 m（`hit_rate_model.json` の `radar.models.so_late`）。V-R2（Elco 80 の `available_from` 1943-07 ≤ 1944-12）・V-R3（6,000 ＞ 視程 900・≤ 対角 6,708）は通る。
- **D-R2 陸の反射の岸の線**: `systems/world-radar.ts:55` は今 `shores` からだけ岸の線を作る（coast の任務は空＝空知丸が映ってしまう）。D-B2 の `landLinesOf` で `coast` の南の線も渡す（radar のある coast の任務は us_06 だけ。us_04 は shores で今と同じ線）。
- **D-R3 映る物**: 出撃の最初の掃引で卯月（南西 2,538 m・揺らぎ込み 2,416 m 以上＝目の 900 m の外）。空知丸は一晩じゅう映らない（岸から 190〜290 m）。卯月が動き出せば輪の並びで分かり、浜の 300 m の内を走る間は消える。駆潜艇（ハード）は 1,800 m の内で小さい艇として映る（`RADAR_KIND_SMALL`。隊の艦ごとの種類を world-radar に渡す。us_04 はどれも艦で今と同じ）。
- **D-R4 v0.8.0 の文の使い回し**: 2 行目の「レーダー探知！ 南西 2500 m ・ 接触 1 ・ 目では見えない」・「新しい接触」・緑の端の印・Result の「レーダー: 最初の接触 … ・ 目で見えない間に撃った魚雷 N 本（命中 N）」はそのまま効く。「東（ビラ）へ消えた」「帰りの列か」は `eastJa` が空なので出ない（`ui/radar-lines.ts` の nearEastEdge）。列の Result の行（`strait-result`）は transit の任務だけで出ない。**衝突の危険**（`systems/strait-telemetry` はレーダーの任務で有効＝`strait-telemetry.ts:29`）は止まった艦（`anchored`）を除く（止まった艦の艦首が自艇に向いていても「衝突の危険」と言わない）。名詞は艦の種類から（駆逐艦・駆潜艇。us_04 は駆逐艦だけで文は同じ）。

### §3.5 命中率の KPI

- **D-K1 規則**: 発射の時（`systems/torpedo-free.ts:99` の `stepLauncher`）、狙った艦（今の規則の最寄りの浮いている艦）の速さが `hit_rate_model.json` の `kpi_measurement.min_target_speed_kt` 未満なら、その魚雷の `kpiTarget` は偽（通算の命中率に入らない）。今の「駆逐艦か・夜明けの前か」の条件に掛け算で足すだけ（新しい純粋な関数 `kpiTargetAtLaunch(isDestroyer, dawnReached, targetSpeedMps, minSpeedMps)` を `core/hit-rate.ts` に）。`ShotRecord` の形・`record_version`（v0.5.0）・凍結の `core/torpedo`（kpiTarget の欄）は変えない。値は世界の setup に入れない（全任務の snapshot が変わる）: `MissionWorld` が data から 1 回読む欄 `kpiMinTargetSpeedMps`（新 `config/kpi-data.ts` ≤ 30 行の読みと検査。`mission-world` は 286 → 289 行）。
- **D-K2 値**: **5 kt**。理由: 今のどの任務の駆逐艦も、作った時の速さは巡航（`entities/destroyer.ts:50`）で、目標の速さは巡航・回避（巡航 ＋ `speed_boost_kt`）・体当たりと退くの最大・列の 30 kt のどれか＝最も遅いのは `us_destroyer`（jp_06）の回避 18 − 10 ＝ 8 kt・`ijn_destroyer` は 25 − 10 ＝ 15 kt（`ship-ai.ts:169-203`・`ship-ai-data.ts:43-62`）。沈み始めた艦は狙えない。だから 5 kt はどの任務のどの 1 本の旗も変えない。止まった艦（0 kt）と動き出して 1.7 秒の内（5 kt 未満）だけが外れる。
- **D-K3 証**: tests で (a) data から「遊べる任務の駆逐艦の AI の最も遅い目標の速さ ≥ 5 kt」（`ijn_destroyer`・`us_destroyer`・`ijn_destroyer_mutsuki_enemy`・us_04 の列）(b) 境 4.99・5.00 kt・止まった艦・夜明けの後 (c) 再生の A/B（Result の通算の行と記録が同じ）。Result に us_06 だけ「止まった艦への魚雷 N 本（命中 N・通算の命中率に数えない）」（D-O4）。

### §3.6 絵（音・画像のファイルは使わない）

- **D-A1 敵の色の睦月型**: 新しい鍵 `tex-destroyer-mutsuki`（`config/ship-art-config` の `SHIP_ART_KEY_BY_ENEMY` に `ijn_destroyer_mutsuki_enemy` → この鍵、`SHIP_ART_KIND_BY_KEY` に 'mutsuki'、`ART_TEX_DENSITY` 2）。形は v0.7.0 の `mutsuki` の置き方（卯月の味方の絵と同じ）・色は `PALETTE_ENEMY`。`assets/destroyer-art.ts:35-38` の `generateDestroyerTexture` の形の選び方（今は fletcher か kagero）を「鍵の形をそのまま」にし（今の 2 つの鍵は同じ結果）、寸法は記録 × `sprite_scale` 2＝205.4 × 18.32 単位（味方の卯月の絵と同じ大きさ）。Boot の `generateExtraDestroyerTextures`（`destroyer-art.ts:44-58`）が `v0_1_prototype` のある任務から作るので、鍵の表を足す S2 から Boot で 1 回作られる（S0 は表が無く既定の鍵＝作らない）。
- **D-A2 駆潜艇**: 新しい形 'subchaser'（51 × 6.7 m の小艦: 前に単装の砲 1・小さな艦橋・煙突 1・後ろに爆雷の台）と鍵 `tex-subchaser`（敵の色・密度 2）。ハードの駆潜艇の記録 id から Boot で 1 回（`generateExtraDestroyerTextures` の隣に ≤ 15 行）。
- **D-A3 そのほか**: 輸送船は今の `tex-transport`。岸の帯と陸は今の `coast-fx`（jp_04 と同じ並べ方）。探照灯の絵は岸の線で切る（v0.8.0 実機 1 回目の直しを coast の駆逐艦の任務にも＝`world-enemies.ts:63` の条件に `s.mission.coast` を足す。今 coast と駆逐艦の隊を両方持つ任務は無い＝us_01・us_02・us_04・jp_06 は coast なし）。tex-ab は新しい鍵 2 つだけが B に増える（今の鍵の画素は同じ）。音・曲は足さない（気づいた・動き出した・岸を背にした で音も曲の段も変えない＝D5。曲の段は今の「見つかったら緊張・撃たれたら戦闘」のまま）。

### §3.7 目的・点・夜明け・終わり

- **D-O1 目的の文**（`objective`。Briefing で 2 行の内＝S4 の折り返しで測る）: 「パロンポン沖に止まった駆逐艦 卯月と、揚陸中の輸送船 空知丸。レーダーで捉え、暗い岸を背に忍び寄って雷撃し、動き出した艦から逃れて帰れ」。
- **D-O2 達成と点**: type `intercept_destroyer`（`scoring.json` の 300）。`objective_sink_count` 1（隊の駆逐艦は卯月 1 隻）。成功「帰投。卯月を撃沈すれば達成」＋今の尾「（帰投地点は北東の青い輪）」。空知丸の撃沈は今の輸送船の撃破点 400（`scoring.json` の `kill.points_by_enemy.ijn_transport`）と命中点。駆潜艇は点なし（`points_by_enemy` に無い）。`scoring.json` は変えない。理由: 種の「または輸送船」は、岸から 240 m に止まって 1 本で沈む空知丸を楽な道にする（西の浜から背に岸で撃てる＝D-B3）。史実で沈んだのも卯月（§9 Q1 で確かめる）。
- **D-O3 夜明け（L1）**: `dawn_strike` {`ijn_a6m2n_rufe`（零戦の形の機で陸上の日本機を代用・design）, 4, from 270°（セブ・ネグロスの側＝模式図）}・hazards に `dawn_air_strike`・`dawn_withdraw` {retire_edge **east**, force_ja「日本の艦」}（`enemy_ships_at_dawn` retire＝史実の値のまま。東＝マニラへの帰り道を模式図で・輪の北東の道を横切らない）。夜明けに止まっている駆逐艦・駆潜艇は遅れなしで動き出して東へ退く。空知丸は残る。`fleet_gone_clears` は置かない（敵の空＝帰投が要る）。
- **D-O4 終わり方**: 今のまま（帰投・沈没・漂流・座礁＝浅瀬なしなので座礁は起きない）。Result の駆逐艦の任務の行の後に us_06 の 1 行（新 `ui/anchor-result.ts`）: 「卯月: 撃沈（動き出す前） ・ 止まった艦への魚雷 3 本（命中 2・通算の命中率に数えない） ・ 岸を背にした 48 秒」（動き出していれば「出撃 85 秒に動き出した（雷跡）」）。
- **D-O5 史実メモ**（`briefing_note_ja`。3 行の内）: 「1944年12月12日1時ごろ、パロンポン沖に止まっていた駆逐艦卯月を、レーダーで捉えた米PT 2隻が暗い岸を背に忍び寄り、約900 mから魚雷6本を撃って2本以上を当てて沈めた。輸送船空知丸は駆潜艇2隻に導かれて揚陸していた。日本のタブの「多号作戦・オルモック湾へ」と同じ夜。」（PT の番号・人名は書かない）。
- **D-O6 Briefing の行**: 月「月没後 ・ 見える 900 m ・ 見つかる 巡航 1200 m／静音 600 m ・ レーダー 6000 m（陸のそばは映らない）」（尾は今の `briefing-numbers.ts:33` が coast で出す）／敵「駆逐艦 ×1・輸送船 ×1（南西に停泊）」（止まった任務の枝。ハードは「・駆潜艇 ×2」）／危険「敵艦艇の砲撃・衝突、夜明けの空襲」／条件「夜明けまで 200 秒（以後は空襲・敵は東へ退く） ・ 燃料 40 gal ・ 魚雷 4 本 …」。`core/briefing`（278 行）には ≤ 3 行（新しい語は `systems/briefing-numbers` か新しい小さな関数へ）。
- **D-O7 Title**: `playable_from` "v0.8.1"（S4）。米PT のタブは 5 枚＝今の 2 列の格子で 3 段（2・2・1。`TITLE_GRID_ROWS_MAX` 3 の内）。札は「オルモック湾の決着」・副題「1944年12月11日 ・ パロンポン沖」（`titleGridSubJa` が「（」の前まで）。`order` 6 のまま（年代の並べ直しは v0.8.3）。日本のタブの解放は米PT の 3 任務のまま（v0.8.0 の L2）。

### §3.8 人物と艇の番号（CLAUDE.md §11）

- 画面の文（題・場所・目的・成功・Briefing・史実メモ・HUD・Result・Title）に人名・階級つきの呼び方・PT の番号（`/PT-?\s*\d/`）を出さない（tests: `person-denylist` の表と、us_06 の画面の全文に PT の番号が無いこと）。艦名（卯月・空知丸）は §11 で使ってよく、jp_04 と同じ夜の橋として出す。番号は `historical_note`・`source`・docs/01 の出典の説明にだけ残す。

### §3.9 ヘッドレスの探りと帯（新しい模擬は作らない＝削る案 ①）

- **D-P1 道具**: 新 `scripts/headless/anchor-probe.mjs`（≤ 200 行。台本は `anchor-probe-policy.mjs` ≤ 200 行に分ける）。v0.8.0 の `strait-probe.mjs` の作法: S2 以降のビルドのページ（`?debug&mission=us_06&seed=N`、ハードは `&hard`、比べは `&nobackdrop`）を台本で回し、ページの `Date.now` を偽の時計（60 fps）に替える。夜ごとに 終わりの理由・卯月の撃沈・空知丸の撃沈・自艇の沈没・帰投・夜明けの前か・燃料の残り・卯月が動き出した秒と理由・撃った本数と命中・止まった艦への本数（KPI の外）・岸を背にした秒、を出し、表と md5。ゲームの束には入らない。g2（node の模擬）には入れない。
- **D-P2 台本が読む物**: 人が HUD と Briefing で知れる物だけ（地図の泊地と輪の位置・レーダーの輝点・目で見える艦・3 行目の見つかる距離と「発見された！」）。艦の AI・止まった段・本当の位置（見えない時）は読まない（strait-probe の作法。台本の import と名前を tests で走査）。反応 0.5〜2 秒・狙い ±2° の揺らぎは台本だけの乱数（seed × 7907 ＋ 40483。ゲームの系列と重ならない＝v0.8.0 S3 の L19）。
- **D-P3 遊び方（seed 1〜40・ノーマル。ハードは ★ の 2 つ）**:
  - ★`shore_east`（史実の形）: 巡航で (5100, 1500) → 静音で浜 (5100, 2870) → 静音で浜沿いに西へ、卯月の輝点か姿の真南 450〜650 m で止まり、4 本の扇（12°）→ 静音で浜沿いに東へ、見える艦から 1,200 m 離れたら巡航で輪へ（見つかれば全速）。
  - ★`open_north`: 出発から卯月の北 900 m まで静音（背に岸なし）で寄って 4 本 → 同じ離れ方。
  - `shore_east_nb`: `shore_east` を `&nobackdrop` で。
  - `charge`: 全速で卯月へ、900 m で 4 本、全速で輪へ。
  - `transport_first`: 北を大きく回って西の浜 (1800, 2880) → 静音で東へ、空知丸に 2 本 → 卯月が見えれば 2 本 → 同じ離れ方。
  - `idle`: 出発点で止まったまま（漂流と夜明けの空襲の確かめ）。
- **帯**（S3 の最初の表を見てから、理由つきでだけ動かす。v0.8.0 の L8 の作法）:

| 帯 | 遊び方 | 条件 | 言いたいこと |
|---|---|---|---|
| A1 | shore_east | 達成（卯月撃沈＋帰投）55〜80%・自艇の沈没 ≤ 10%・帰投 ≥ 85% | 正しい忍び寄りは報われるが必ずではない |
| A2 | open_north | 達成 ≤ A1 − 15 点・最初の 1 本の前に卯月が動き出した夜 ≥ 50% | 背に岸の無い寄り方は気づかれる |
| A3 | shore_east_nb | 達成 ≤ A1 − 15 点 | 岸の規則が効いている（無ければ同じ道でも気づかれる） |
| A4 | charge | 自艇の沈没 ≥ 30% か 達成 ≤ 35% | 突っ込みは失敗する |
| A5 | shore_east | 動き出す前に撃てた夜のうち最初の扇で卯月が沈んだ夜 60〜90% | 止まった艦は当たるが 2 本要る（扇の向きが要る） |
| A6 | transport_first | 空知丸撃沈 ≥ 70%・達成 ≤ A1 | 加点の道はあるが目的の代わりにならない |
| F | shore_east | 帰投の夜の燃料の残りの中央値 15〜35% | 燃料が効く |
| T | shore_east | 帰投の夜の 90% 以上が夜明けの前 | 夜の長さが足りる |
| D | idle | 漂流が夜明けの後・1,500 秒未満 | 今の規則（tests/dawn-air と同じ） |
| K | すべて | 止まった艦（5 kt 未満）を狙った 1 本の `kpiTarget` 真が 0 本 | KPI の規則の確かめ |
| H1 | shore_east（ハード） | 達成 40〜70%・自艇の沈没 ≤ 20% | 駆潜艇で難しく、理不尽でない |
| H2 | open_north（ハード） | 達成 ≤ H1 − 15 点 | ハードでも岸の道が正解 |

- **40 夜の揺れ**: 50% の所で ± 約 8 点（1 標準誤差）。帯の端から ±5 点の内は「端」と書き、seed 41〜80 を足して決める。時間の見込み: strait-probe は 24 夜で約 25 秒＝ 1 夜約 1 秒。6 行 × 40 ＋ ハード 2 行 × 40 ＝ 320 夜で約 6 分（JOBS 3）。
- **つまみの順**（data だけ。変えたら CHANGELOG と source に理由）: ① 出発点と帰投の輪（F・T。艦は jp_04 と同じ夜の位置なので動かさない）② `shore_backdrop.detect_factor` 0.5〜0.7・`behind_m` 1,000〜3,000（A1・A2・A3）③ `anchored.destroyer_underway_s` 3〜10・`alarm_s` 2〜8（A1・A4）④ 卯月の沈む本数（任務の `enemy_hits_to_sink` 1 で上書き＝A5 が 60% を大きく割る時）⑤ `duration_s` 180〜240（T）⑥ `fuel_allotment_gal` 41 まで（F）⑦ ハードの駆潜艇の位置（H1・H2）。**触らない**: `ijn_destroyer` とその写し（新しい卯月の記録）の `detection`（`base_detect_m` 2,000・雷跡 2,000 m・毎秒 0.2・反応 0.5）・`evasion`・`ram`・砲の 1 門の値・探照灯・星弾、`torpedoes.json`、`world.ship_hit_scale`、`kpi_by_range`、`visibility` の係数、`radar.models`（us_05・us_07 も使う）。

### §3.10 典型の夜（ノーマル・揺らぎなし・`shore_east`。§3.1 D-M5 の概算。実秒）

| 秒 | 出来事 | HUD |
|---|---|---|
| 0 | 出発（停止）。最初の掃引で卯月（南西 2,538 m）が輝点に。空知丸は反射で映らない | 2 行目「レーダー探知！ 南西 2500 m ・ 接触 1 ・ 目では見えない」（v0.8.0 の文） |
| 約 21 | 巡航で (5100, 1500)。卯月まで 1,722 m（巡航の 1,200 m の外） | 緑の端の印「レーダー 1800 m」 |
| 約 47 | 静音で浜へ下る途中、卯月から見て背に岸になる（y 約 2,700） | 2 行目「暗い岸を背にした ・ 見つかる距離 360 m」・3 行目の数 600 → 360 |
| 約 51〜83 | 浜沿いに静音で西へ 1,480 m。卯月は 900 m で目に見える | 今の駆逐艦の任務の 3 行目（敵影あり） |
| 約 83 | 卯月の真南 520 m で止まり 4 本の扇。走る 6.0 秒（Mk 13 は画面で 86 m/秒） | 見越し点マーカー（止まった艦は艦そのもの） |
| 約 85〜89 | 卯月が雷跡に気づく（毎秒 0.2）→ 6 秒は動けない → 2 本で沈む。警報で空知丸が気づく（4 秒後。動かない・光が無ければ撃てない） | 命中スロー・「撃沈！帰投せよ」（今の文） |
| 約 95〜135 | 巡航で北東の輪へ 2,369 m（40 秒） | 帰投の印 |
| 200 | 夜明け（輪の外なら日本機 4 機。浮いている艦は東へ退く） | 今の夜明けの帯 |

外した夜: 卯月は 6 秒後に動き出して海域の中央へ向き直し（北の海へ）、見つければ探照灯（3,000 m）・砲・星弾・400 m の体当たり。背に岸のまま浜沿いを東へ離れると見つかる距離は静音 360 m・巡航 720 m。

---

## §4 data と検査

### §4.1 us_06 の `v0_1_prototype`（新。どれも source 付き。数は §3 のとおり）

`enemies` ["ijn_destroyer_mutsuki_enemy"]・`enemy_behavior`（文）・`duration_s` 200・`fuel_allotment_gal` 40・`shallows` []・`bounds_m` 6000 × 3000・`player_start` (5000, 250, 225)・`enemy_start` (3620, 2380, 270)・`transport` {enemy_id ijn_transport, start (3000, 2760, 135)}・`return_point` (4400, 400, 250, call_margin 1.5, settle 10, end_settle 5)・`coast` {south, 600, レイテ島（パロンポン）}・`hazards` [enemy_ship_gunfire_or_ram, dawn_air_strike]（本体の hazards は種の設計として残す＝jp_04 の作法）・`night`（D-M4）・`dawn_strike`（D-O3）・`dawn_withdraw`（D-O3）・`objective_sink_count` 1・`radar` {so_late, own}・**新** `anchored` {destroyer_underway_s 6, transport_underway false, picket_underway_s 4, alarm_s 4, source}・**新** `shore_backdrop` {detect_factor 0.6, behind_m 2000, source}・`hard` {extra_pickets [(2300, 2050, 90), (4300, 2200, 270)], picket_enemy_id "ijn_subchaser", source}（hard の知らない鍵は `mission-hard-data` が見ない＝今の読みは変わらない）。`main_weapon` は置かない（魚雷）。

### §4.2 hit_rate_model.json

- `kpi_measurement.min_target_speed_kt` **5**（新）と source の文に理由（D-K2）。`record_version` "v0.5.0" は変えない（今までの通算を捨てない。新しい規則は止まった艦への 1 本を入れないだけ）。ほかの値は 1 つも変えない。

### §4.3 enemies.json（新 2 記録）

- `ijn_destroyer_mutsuki_enemy`: `name_ja`「駆逐艦（睦月型・卯月）」（Briefing の「駆逐艦」）・`length_m` 102.7・`beam_m` 9.16・`speed_max_kt` 34（historical。`ijn_destroyer_mutsuki` の source と同じ）・`speed_typical_kt` 25・`turn_rate_deg_s` 1.5・`accel_mps2` 0.3・`hull_hp` 300・`hull_circles` 5・`torpedo_hits_to_sink` 2・`guns` [main_120mm count 2（ほかは `ijn_destroyer` の main_127mm の値）, aa_25mm（`ijn_destroyer` のまま）]・`searchlight`・`starshell`・`detection`・`evasion`・`ram`・`patrol` は `ijn_destroyer` の写し。source: 寸法・速さ・砲の数は historical（docs/01 590・591 行）、写した値は design「ijn_destroyer の値をそのまま（命中率の KPI を合わせた値）」。
- `ijn_subchaser`（ハードだけ）: `name_ja`「駆潜艇（第13号型）」・51 × 6.7 m・`speed_max_kt` 16（high。docs/01 515 行）・`speed_typical_kt` 12（design）・旋回 3.0・加速 0.4・`hull_hp` 100・`hull_circles` 3・`torpedo_hits_to_sink` 1・`guns` [76.2 mm 高角砲 1（輸送船の deck_gun_76mm の値の写し・design）, 13.2 mm 2（25 mm の行の値で口径の名だけ・design）]・探照灯 1,500 m（design。味方の卯月と同じ）・星弾なし・`detection`（反応 1.0・雷跡 800 m・毎秒 0.2・base 1,500＝検査のためだけ。隊は 1 つの距離を使う）・`evasion` turn_away・`ram` 無効・`patrol` 端 500 m。寸法・兵装（1940 の形）は WebSearch の抜粋 1 つ（Wikipedia の No.13-class submarine chaser と写し・本文未読）＝medium。1944 年の兵装の変化は未確認。

### §4.4 起動時の検査（例外は鍵を名指す日本語。Boot で 1 回ずつ＝今の 3 つの後）

- 新 `config/anchor-mission-data.ts`（≤ 160 行。`anchorSetupPart`・`anchorNightRolls`・`validateAnchorMissions`）: **V-A1** 鍵の閉じた集合・秒は 0 ＜ x ≤ 30・`transport_underway` は false だけ（動く輸送船は候補）。**V-A2** 駆逐艦の任務（`enemy_start`）だけ・`transit`・`barges`・`pt_boats`・`landing`・`ally_destroyer`・`evac`・`patrol_air`・`escort` と同居しない・`fleet_gone_clears` と同居しない。**V-A3** どの艦も（今夜の揺らぎの端で）海域の内で縁の余白（記録の長さ × sprite_scale ÷ 2）より内・輸送船の船体（ship_hit_scale）は岸の線から 50 m 以上沖。**V-A4** 出発点は今夜の揺らぎの端のどの艦（ハードの駆潜艇も）からも全速の見つかる距離（ノーマル・史実モードなし。us_06 で 1,920 m）より遠く、帰投の輪の外。**V-A5** `hard.extra_pickets` は 1〜4 隻・`transport` のある任務だけ（隊の並び: 駆逐艦 → 輸送船 → 駆潜艇）・`picket_enemy_id` は AI の記録。**V-A6** 夜明けの検査（`config/dawn-data`）と食い違わない（retire なら `dawn_withdraw` がある）。
- 新 `config/backdrop-mission-data.ts`（≤ 90 行。`backdropSetupPart`・`validateBackdropMissions`）: **V-B1** 鍵の閉じた集合・0 ＜ `detect_factor` ＜ 1・0 ＜ `behind_m` ≤ 海域の対角。**V-B2** 岸の線のある任務（`coast` の south か `shores`）・駆逐艦の任務だけ（大発・米PT の任務は発見の仕組みが別）。**V-B3** `?debug&nobackdrop` は鍵ごと出さない。
- 新 `config/kpi-data.ts`: **V-K1** `min_target_speed_kt` は 0 以上の有限の数（無ければ 0＝今の規則。だから鍵を足す前のビルドの挙動とも同じ）。

### §4.5 setup の鍵（`systems/world-setup-types.ts` に任意の 3 つ）

`anchors?: AnchorSetup`（艦ごとの動き出す秒・警報の秒）・`backdrop?: BackdropSetup`（係数・X の 2 乗）・`pickets?: PicketSetup`（`TransportSetup` と同じ形で出発点が配列）。`world-setup.ts` は 187 → 約 192 行（駆潜艇を今夜の揺らぎの `shipStarts` に入れる 2 行と part 2 行）。無い任務では鍵ごと出ない＝今の 10 任務の snapshot は `-u` なし。新 `tests/setup-us06`（ノーマル／ハード × 史実モード × seed 1・12345 の 8 つ）。

---

## §5 門と性能

### §5.1 既存の任務が 1 ビットも変わらない証（どの段も。v0.8.0 の run-gates を `v0810/tools/` に写し、基準は main e9d80ea を同じビルド番号 `VITE_BUILD_REF=main VITE_BUILD_SHA=e9d80ea` で作ったサイト）

| 門 | 値 |
|---|---|
| npm test・typecheck（2 つの tsconfig）・lint・build | 通る |
| 凍結 20 本（`tests/frozen-files`） | sha256 が同じ（`core/torpedo`・`torpedo-targets`・`torpedo-solver`・`systems/torpedo-pool` は触らない） |
| g2（`G6=1 ALLY=1 EVAC=1 US04=1`） | OK 39・DIFF 0（us4 69d56c38…・us4h f8a81b96… を含め md5 が同じ。迎撃の模擬は写しなので変わらない） |
| setup の snapshot | 今の 10 任務は `-u` なし。新しい `setup-us06` だけ |
| 再生の A/B | ab-replay all 58 を音の 3 状態（既定・`AUDIO=1`・`NOAUDIO=1`）で same。jp04base 8・jp03 4。us_04 の組（`SET=us04` 4 件・`NORADAR=1` 4 件）も same。既知の揺れ（us_02 seed 1 の最後のフレームの `.t`・Result への移り）は同じ状態・JOBS=1 で回し直し、違った件と最初の欄を SUMMARY に写す（自動で受け入れない） |
| HUD の A/B | hud-ab base 16（3 状態）・jp04base 8・jp03 4・us04 4 が same |
| tex-ab CHECK=1 | ✗ 0（B に新しい鍵 `tex-destroyer-mutsuki`・`tex-subchaser` だけ増える） |
| Title | 日本のタブは物体ごとに同じ（v0.8.0 の `title-play.mjs dump`）。米PT のタブは 5 枚（意図した変化。W 1280・1584 で字が切れない） |
| 命中率の模擬 | `tests/hit-rate-sim` の表（95・63・26・11・5%）が同じ |
| 乱数 | 新しい系列なし。seed+16 の今夜の揺らぎは us_06 だけ回数が増える（ノーマル 2・ハード 4）。見張り seed+17 は止まった艦も今の規則で引く |
| 300 行 | 足す先の見込み: `destroyer-group` 205 → 約 225・`entities/destroyer` 168 → 約 173・`destroyer-step` 46 → 約 50・`world-enemies` 81 → 約 85・`world-radar` 106 → 約 110・`strait-geometry` 120 → 約 160・`torpedo-free` 113 → 約 118・`torpedo-hits` 74 → 約 76・`mission-world` 286 → 289・`boat-telemetry` 229 → 約 245・`strait-telemetry` 56 → 約 58・`hit-rate` 66 → 約 80。`mission-scene` 300・`game-data` 294・`mission-line` 297・`ship-ai` 278・`core/briefing` 278・`result-scene` 285 は足さない（≤ 3 行まで） |
| core | phaser を import しない（`tests/core-no-phaser`） |
| commit | モデルの名前・識別子を書かない。末尾は決まりの 2 行 |

### §5.2 性能の予算（§7。作る前に決める）

| 項目 | 予算 | 守り方 |
|---|---|---|
| 背に岸 | 1 ステップ: 隊の艦 ≤ 5 × 線 1 本で掛け算 ≈ 15・割り算 1 | 2 乗の比べ。確保なし。block の無い任務は null の確かめ 1 つ |
| 止まった艦 | 1 ステップ: 艦 ≤ 5 の旗と数の比べ | 固定長の配列（Uint8Array・Float64Array）を起動時に 1 回 |
| 絵 | テクスチャ 2 枚を Boot で 1 回 | 毎フレームは今の Destroyer の同期だけ |
| Text | 2 行目の文 2 種・Result の 1 行 | setText は出来事の時だけ。3 行目の数は 100 m の刻みが変わった時だけ（今の作法） |
| 測り | 新 `scripts/headless/anchor-perf.mjs`（v0.8.0 の `strait-perf.mjs` の写し: 動き出した卯月に照らされて逃げる 60 秒の窓・dpr 2・W 1560） | 門: updateFrame の p95 を **4 組の中央値**で us_06 ≤ us_02 × 1.2（v0.8.0 の注「組を増やすか中央値で」）・30 秒ごとの物の数の最小が増えない。本当の値は iPhone の左上の FPS（実機 ③） |

---

## §6 段（どれも 1 commit。版は 0.8.1 のまま段の名で刻む）

各段の終わりに §5.1 の門 → commit → push（失敗は 4・8・16・32 秒で再試行）。

| 段 | 中身（新＝新規・行数は見込み） | tests | 追加の門 |
|---|---|---|---|
| **S0 data と検査**（遊べない） | `package.json`・lock 0.8.1。docs/03 の v0.8.1 の行（Done・実機 3 項目・段）。§2 の種の直し・§4.1 の `v0_1_prototype`（`playable_from` はまだ）・§4.2・§4.3。新 `config/anchor-mission-data`（≤ 160）・新 `config/backdrop-mission-data`（≤ 90）・新 `config/kpi-data`（≤ 30）。`world-setup`（＋5）・`world-setup-types`（＋6）・`systems/destroyer-setup`（`PicketSetup` ＋8）・`scenes/boot-scene`（検査 2 つ ＋2）。S0 では世界は何も読まない（setup の鍵が出るだけ） | 新 `anchor-data`・`backdrop-data`・`kpi-data`（V ごとの文・既定の data が通る）・`enemy-mutsuki`（写した鍵が `ijn_destroyer` と同じ・寸法と砲の数・駆潜艇の記録が AI の形）・`setup-us06`（新しい snapshot・今夜の乱数の回数・画面の文に PT の番号なし）。直す固定は §12 の S0 の行 | ほかの 10 任務の snapshot・g2・A/B（新しい import が束に入る＝ここから回す）・tex-ab |
| **S1 純粋な規則** | 新 `core/anchored-ship.ts`（≤ 150）・`core/strait-geometry.ts` に `landBehind`・`landLinesOf`（＋40）・`core/hit-rate.ts` に `kpiTargetAtLaunch`（＋14） | 新 `anchored-ship`（気づく 5 つの理由・警報の秒・動き出す秒・体感の時計・夜明けは遅れなし・空知丸は動かない・沈み始めた艦・決定性・確保なし＝`tests/core-rules-kit`）・`shore-backdrop`（us_06 の位置の例 §3.3・`behind_m` ±1 m の境・陸の区間の外・北の岸と両岸・同じ点・平方根と atan2 なし）・`kpi-target`（4.99／5.00 kt・止まった艦・夜明けの後・D-K3 の data の証） | 凍結の diff 空・束は S0 とバイト同一（誰も import しない） |
| **S2 世界の配線**（`?debug&mission=us_06` で遊べる。Title に出ない） | `entities/destroyer`（`anchored` と止まっている間の分岐 ＋5）・新 `systems/destroyer-anchor`（≤ 110）・新 `systems/shore-backdrop`（≤ 90）・`destroyer-step`（艦ごとの距離の 3 項・`g.anchors?.step` ＋4）・`destroyer-group`（anchors・backdrop を `setBeamLand` と同じ後付けで・`gunneryAt(i)`・`radarKindAt(i)` ＋15）・`world-enemies`（砲の添字を `gunneryAt`・coast の探照灯の切り取り・後付け ＋4）・`world-radar`（`landLinesOf`・艦ごとの種類 ＋4）・`torpedo-free`（D-K1 ＋5）・`mission-world`（`kpiMinTargetSpeedMps` ＋3）・`strait-telemetry`（止まった艦を除く ＋2）・`mission-telemetry`（D-B5 ＋2）・新 `systems/anchor-telemetry`（≤ 70。気づいた理由と秒・背に岸の秒・止まった艦への本数と命中＝`torpedo-hits` の WeakSet の形）・`core/boat-telemetry`（`anchor` ＋16）・`telemetry-create`（＋2）・`config/ship-art-config`・`assets/destroyer-art`（D-A1）・`config/debug-setup`・`game-config`（`nobackdrop`）。**S2b**（同じ commit か次の commit）: 駆潜艇（`destroyer-group` の並び・`PicketSetup`・D-A2 の形と鍵・レーダーの小さい艇） | 新 `anchor-world`（Phaser なしの小さな世界＝`tests/transit-world-kit` の作法: 止まった艦は動かない・5 つの理由で気づく・6 秒後に動く・空知丸は動かない・警報・夜明けに東へ・見張りの乱数の引き方が止まっていない艦と同じ・ほかの任務の `d.step` に渡る距離は `w.detectRangeM` そのもの）・`backdrop-world`（背に岸の時だけ 0.6 倍・閃光の 1,200 m・照らされている間は掛けない・煙幕と掛け算）・`radar-us06`（卯月は映り空知丸は映らない＝seed 1〜40 の今夜の揺らぎ・駆潜艇は 1,800 m）・`kpi-world`（止まった卯月への 1 本は `kpiTarget` 偽・動いている艦は今のまま）・`strait-lines`（止まった艦で衝突の危険を出さない）。直す固定は §12 の S2 の行 | A/B（3 状態）same・tex-ab（新しい鍵 2 つ）・新しい組 `SET=us06`（`ab-replay.mjs` と `hud-ab.mjs` に。ノーマル・ハード × seed 1・2 を 200 秒。A は S2 の commit のビルド＝以後の段の回帰。all には入れない） |
| **S3 探りと帯** | 新 `scripts/headless/anchor-probe.mjs`・`anchor-probe-policy.mjs`（§3.9）。最初の表 → つまみ（§3.9 の順）→ 表と md5 を CHANGELOG に | 台本の import と名前の走査（`tests/anchor-probe-scan`。読む物は §3.9 D-P2 だけ） | 帯がすべて ✓（端は seed 41〜80 を足して）。data を変えたら `setup-us06` の snapshot だけ `-u`（その 1 本）。g2 は不変 |
| **S4 HUD・Briefing・Result・出撃可・docs** | 新 `ui/anchor-lines.ts`（≤ 80。2 行目: 「暗い岸を背にした ・ 見つかる距離 360 m」＝最寄りの艦に対して背に岸が立った時・20 秒に 1 回まで／「停泊していた艦が動き出した！」＝目で見えている艦が動き出した時・艦ごとに 1 回・警告の色。どちらも 22 px で 840 px の内）・`ui/special-line`・`ui/mission-mode`・待ちの鎖（`ui/strait-line-clock` か `pt-line-clock`）へ ≤ 4 行ずつ・`ui/strait-lines`（名詞）。Briefing（D-O1・D-O5・D-O6。`systems/briefing-numbers`・`config/briefing-data`）。Result（新 `ui/anchor-result.ts` ≤ 40・`systems/mission-result-extras`・`ui/result-types`・`ui/result-body`）。`playable_from` "v0.8.1"（D-O7）。`anchor-perf.mjs`（§5.2）。`brief-result.mjs` に us_06 の形（本当の折り返し・史実の下端 ≤ 576・Result の下端 ≤ 592）。docs/01（§8 の終わりに「パロンポン沖の夜を米の側から（v0.8.1 の調べ）」: 卯月の向き・駆潜艇の寸法・何が史実で何が作りか）・docs/02（§6.5 に止まった艦と背に岸・§6.3 に KPI の規則・§6.12 に us_06）・docs/03（v0.8.1 の行と完了・候補）・CHANGELOG v0.8.1（U1・L1・表・計測）・CLAUDE.md §4 の木に新しいファイルと変更履歴 1 行（§2 は変えない: L1 は今の「夜明け」の一般の規則のとおり＝足す決めが無い） | 新 `anchor-lines`・`anchor-result`（形・幅・下端・読む欄の走査＝艦の AI・本当の位置を読まない）・`briefing`（us_06 の 6 行と史実・ほかの 10 任務の文のバイト同一＝us_04 も e9d80ea の値で固定に入れる）・`sfx-music-mood`（気づいた・動き出した・背に岸で段が変わらない）・`sfx-rules`（`sfx-*` は新しいファイルを import しない）・`person-denylist` で us_06 の全文。直す固定は §12 の S4 の行 | §5.1 の全部をもう一度・Title の物体の写し・画面写し（W 1280・1560: Briefing ノーマル・ハード、背に岸の文、動き出した卯月、Result）・Title からのタッチの遊び（v0.8.0 の `title-play.mjs play`）・`gh pr create`。報告: (a) Pages URL と `claude/v0.8.1-us06@<7桁>` (b) 実機 3 項目 (c) 既知の制約 |
| **IP1〜** | 実機の直し（data のつまみが先。仕組みを足すなら PATCH の枝番） | — | — |

**iPhone の実機テスト（3 つ）**:
1. us_06 を出撃してすぐ南西に緑の輪（卯月）が 1 つ出て、泊地の輸送船は輪に出ない（陸のそば）か。東から浜へ回って浜沿いに寄ると、2 行目に「暗い岸を背にした」が出て 3 行目の「見つかる距離」が小さくなるか。
2. 止まった卯月の真南から 4 本を撃って沈められるか（2 本で沈む）。外して動き出した卯月（照らして撃ってくる）から北東の輪へ逃げられるか。「易しすぎ／ちょうど／難しい」の一言。
3. 北から真っすぐ寄った夜（気づかれて動き出す）との違いが分かるか。ハードの駆潜艇 2 隻。卯月に照らされて逃げている間の左上の FPS。

---

## §7 §7 の警告（実装の前に構造から）

1. **艦ごとの発見距離で平方根・atan2 を使わない**（隊 × 毎ステップ）→ `landBehind` は 2 乗の比べと割り算 1 回。block の無い任務は `g.backdrop` が null で 1 つの値を渡す（今の分岐と同じ）。
2. **止まった艦の状態を毎ステップ作らない**（`filter`・`map`・リテラルは GC のカクつき）→ 固定長の配列を起動時に 1 回。動き出すのは旗を下ろすだけで、Destroyer を作り直さない（v0.8.0 の列の艦と同じ）。
3. **止まっている間に `steerShip` を 0 の速さで回さない**（`clampToBounds` と当たりの円の作り直しが無駄）→ 分岐で飛ばし、位置と円は作った時のまま。
4. **`core/ship-ai`（278 行）に止まった段を足さない**（今の 5 任務の AI の文が変わる・300 行に近い）→ 外の包み（`core/anchored-ship`）が AI の出力を使わないだけ。
5. **KPI の値を WorldSetup に入れない**（全任務の setup の snapshot が変わる）→ `MissionWorld` が data から 1 回読む欄。
6. **HUD の文を毎フレーム作らない** → 背に岸と動き出しは出来事の時だけ setText。3 行目の数は今の刻みの比べ。
7. **探照灯の切り取りを毎フレーム作り直さない** → 今の `clipBeam`（行数が変わった時だけ `setCrop`）を coast の線で使う。
8. **絵を毎フレーム描かない** → 新しい 2 枚は Boot で 1 回 `generateTexture`（今の `paintDestroyerTexture`）。
9. **太ったファイルに足さない** → `mission-world`（＋3 まで）・`mission-scene`・`game-data`・`mission-line`・`ship-ai`・`core/briefing`・`result-scene` には新しい規則を置かず、新しいファイルから呼ぶ。

---

## §8 リスク

- R1 易しすぎ（止まった艦は当たる・暗い夜は静音 600 m）: 2 本で沈む・KPI の外・A1 ≤ 80%・A5 ≤ 90%。易しければ ③（動き出す秒を短く）→ ②（背に岸を弱く）。
- R2 理不尽（規則が見えない・動き出した卯月が強い）: Briefing の目的と史実メモが「暗い岸を背に」と言う・2 行目の出来事と 3 行目の数・レーダーで卯月が見える。A1 ≥ 55%・A4 で突っ込みだけが失敗。
- R3 ほかの任務が変わる: 共有のファイル（`destroyer-step` の艦の段・`entities/destroyer` の step・`destroyer-group` の添字・`world-enemies` の砲の添字と探照灯の切り取り・`torpedo-free` の KPI・`world-radar` の岸の線・`strait-telemetry`・絵の生成）はどれも block か旗が無ければ今の式。§5.1 の A/B と snapshot・D-K3 の data の証。
- R4 KPI の境: 5 kt は今のどの AI の最も遅い 8 kt より下（D-K2）。将来 5 kt 未満で回避する艦を足す版は、この規則で外れるのを知ったうえで決める（tests の data の証が落ちて知らせる）。
- R5 300 行: `destroyer-group` 約 225・`mission-world` 289。超えそうなら `destroyer-group` の駆潜艇の並びを `systems/destroyer-pickets.ts` へ。
- R6 駆潜艇で見積もり超過: S2b を切り離せる（§11）。
- R7 レーダーの反射の境: 空知丸は岸の線から 190〜290 m（反射 300 m）。揺らぎか反射の値を変えると映りうる＝`radar-us06` が 40 夜で固定。
- R8 動き出した卯月が浜沿いへ来る: 縁の余白 102.7 m で y ≤ 2,897 まで走れる＝浜に隠れた自艇に体当たりがありうる（衝突の危険の文が出る）。今の AI のままの危険で、A1 の沈没 ≤ 10% で見る。
- R9 史実モード: 見つかる距離 × 1.3 で全速は 2,496 m。今夜の揺らぎの端では出発点から卯月 2,416 m＝史実モードで出撃直後に全速なら気づかれうる（ノーマルは V-A4 で守る）。既知の制約に書く。
- R10 探りと人のずれ: 台本は理想化した人。N 40 で ±8 点。帯は傾きの確かめで、最後は実機 ②③。
- R11 jp_04（同じ夜の日本の側）: 味方の卯月の記録・絵（`tex-destroyer-friendly`）・地図の data は触らない。卯月の針路だけ us_06 で 270°（jp_04 は 90°）＝両側の夜で向きが違う（既知の制約）。jp04base の A/B が見張る。
- R12 燃料の上限 41 gal（`tests/dawn-air` の漂流の固定）: F が届かなければ道を短くする（つまみ ①）。

---

## §9 ユーザーへの質問（1 つ。既定で進めてよい）

| 問い（そのまま聞ける形） | 既定 | いつ |
|---|---|---|
| **Q1**「オルモック湾の決着の達成を『卯月を沈めて帰投』にしました。泊地の輸送船 空知丸は沈めると加点（東京急行の輸送船と同じ 400 点）で、達成には数えません（史実で沈んだのは卯月だけ・空知丸は岸のそばに止まっていて 1 本で沈むので、達成に入れると楽な道になるため）。もとの案どおり『卯月か空知丸のどちらかを沈めれば達成』の方がよければ教えてください」 | 卯月だけ（D-O2）。S0〜S4 は既定で進め、S4 の報告（実機 1 回目の前）に添える | S4 の報告 |

聞かない（既定で進める）: 卯月の沈む本数（2）・駆潜艇をハードだけ・動き出す秒・背に岸の係数・夜明けの機の種類と方角・帰投の輪の位置・Title の 5 枚目の置き場。

---

## §10 既知の制約（v0.8.1 の CHANGELOG に書く）

- 史実: WebSearch の抜粋のみ（本文未読）。日本側の資料の本文は見ていない。地図は jp_04 の模式図（浜は本当は西向き）・出発と輪・夜の長さ・燃料・駆潜艇の位置・動き出す秒・背に岸の係数と距離・夜明けの機（零戦の形の水上戦闘機で代用）と方角は作り。卯月の向き（270°）は「左舷が浜の側に当たった」の読み（medium）。
- 地図の上の味方は自艇だけ（U1。史実の 2 隻目は Briefing の文だけ）。
- 空知丸は一晩じゅう止まって動かない（夜明けにも退かない）。揚陸の時計・終わりは無い（jp_04 の揚陸の仕組みは使わない）。揚陸地点の印は描かない。
- 背に岸は駆逐艦の隊だけ・この任務だけ（ほかの岸のある任務＝us_03・jp_01・jp_04 などには付けない。v0.9 以降の候補）。陸は南の岸の線だけで、丘の高さ・陸の遠さの違いは無い（`behind_m` の内なら同じ）。照らされている間は効かない。
- 隊の艦はみな同じ見つける距離の基準（駆逐艦の 2,000 m）を使う（今の us_02 の輸送船と同じ作り。輸送船・駆潜艇の記録の `base_detect_m` は読まない）。
- 止まった艦への 1 本は通算の命中率に入らない（5 kt 未満。動き出して 1.7 秒の内も）。Result が本数を言う。
- 駆潜艇（ハード）は点が無い・撃沈 n/m に入らない・1944 年の兵装の変化は未確認（1940 の形）。
- 3 行目の「見つかる距離」は最寄りの艦に対する値（ほかの艦には別の値）。
- 史実モードで出撃直後に全速だと、今夜の揺らぎの端で卯月に気づかれうる（R9）。
- jp_04 の卯月は 90°・us_06 の卯月は 270°（同じ夜の両側で向きが違う）。
- レーダーの既知の制約（v0.8.0）はそのまま。空知丸は反射に紛れて一晩じゅう映らない。
- 性能の数はヘッドレスの相対値。iPhone の FPS は実機 ③ で読む。

候補（docs/03 に足す）: 動く空知丸（揚陸を終えて去る）／背に岸をほかの岸の任務へ（v0.9 の見直し）／揚陸地点の印と小舟艇の絵／駆潜艇の爆雷・点／その夜の 2 隻目の PT（僚艇。U1 で今は無し）／丘の陰の強さ（陸の高さ）。

---

## §11 実装中に迷った時の既定（ユーザーには聞かない）

- data に無い数は §3・§4 の値を design で入れ、source に理由を書く。
- S2 が 90 分を超えそうなら S2b（駆潜艇）を外し、v0.8.1b（PATCH の枝番）で足す。その間のハードは今の `hard` の block を置かず（ハードの違いなし）、`jp05-mission` の固定にも足さない。
- 探りで A1 が 80% を大きく超えたら ③（`destroyer_underway_s` 6 → 4）→ ②（`detect_factor` 0.6 → 0.7）。55% を割ったら逆。A5 が 60% を大きく割ったら ④（任務の `enemy_hits_to_sink` 1）。どれも卯月の記録の写した値（KPI の根拠）には触れない。
- 文が 840 px（2 行目）・Result の下端 592 を超えたら語を短く（「停泊していた艦が動き出した！」→「艦が動き出した！」、「通算の命中率に数えない」→「通算に入れない」）。
- 帯の端（±5 点）は seed 41〜80 を足し、80 夜で決める。

---

## §12 固定を直す tests（遊べる任務の一覧・任務の数を持つもの。理由を書いて直す）

- **S0**（us_06 に `v0_1_prototype` が入る＝「遊べる世界のある任務」が 10 → 11）: `boot-loop`（34 行の PROTO_IDS の一覧に us_06・51 行の Boot の検査の順に新しい 2 つ）／`engine-data`（157 行の PROTO_IDS）／`landing-neutral`（20 行の OTHERS に us_06・23 行の「v0_1_prototype を持つのは 9 任務と jp_04」）／`dawn-air`（280 行の us_06 の夜明けの行＝enemy・新しい label、307 行の「遊べる任務でない」の例を us_05 へ）／`dawn-withdraw`（268 行の「遊べない任務は退く先を持たない（us_06）」の例を us_05 へ・us_06 は east）／`jp05-mission`（200 行のハードの違いのある任務に us_06。S2b を外したら足さない）／`strait-geometry`（61 行の注の「v0.8.1 の us_06 が coast から作る」は S1 で本当の使い手を指す）。
- **S1〜S2**: `radar`（`core/strait-geometry`・`core/radar` を import するファイルの一覧に `systems/shore-backdrop` など）・`radar-neutral`（レーダーの層の import の表）・`ship-art`（`DestroyerGroup` の最後の引数が絵の鍵のまま）・`art-inventory`（新しい鍵 2 つ）・`world-visuals`（足すなら行の順）・`transit-world`（Destroyer と destroyer-step の写しの固定は `toContain` なので残る行を保つ。kit は us_04 だけで変えない）。
- **S4**（`playable_from` で米PT の遊べる任務が 4 → 5）: `campaign`（44・69 行の `playableMissionIds`・72 行の一覧を消した時の条件・97 行の例外の文の一覧に us_06。解放は 3 のまま）／`briefing`（25〜36 行の一覧に 5 件目・79〜80 行の遊べる任務が残る例・ほかの任務の文の sha の表に us_04 と us_06 の扱い）／`title-grid`（46 行の札の表・95 行の 2 × 2 → 5 枚の格子の矩形と 3 段）／`evac-briefing`（132 行の比べから us_06 を外す＝月の行にレーダーの尾）／`dawn-air`（396〜410 行の漂流の秒の一覧に us_06 の 1,440）／`mission-end`（370 行の注の「遊べない任務」は古い言葉＝直すだけ）。
- **S4 で us_06 を含んで回り直す（直さず通ることを見る。落ちたら data を直し、その任務に限る不変なら理由を書いて直す）**: `air-strike`（486 行）・`ally-result`（51 行）・`dawn-clock`（33 行）・`evac-switch-ui`（39 行）・`game-data`（32 行）・`gunboat-data`（101 行）・`impact-ring`（19 行）・`jp-data`（34・107 行）・`jp05-mission`（71 行）・`landing-result`（47 行）。

---

## §13 出典（この計画で新しく引いた物。ほかは docs/01 §8 の v0.6.9・v0.6.10 の表）

- 第13号型駆潜艇（438 t・51 × 6.7 m・喫水 2.75 m・16 kt・1940 の兵装 76.2 mm 高角砲 1・13.2 mm 2。兵装は 1 つの出典）: https://en.wikipedia.org/wiki/No.13-class_submarine_chaser （WebSearch の抜粋のみ・本文未読。写し: https://wikiwand.com/en/No.13-class_submarine_chaser ）
- 卯月・空知丸・駆潜艇 2 隻・月と日・左舷の被雷: docs/01 515・525・528・529・530・571 行（v0.6.9 の調べ）と 590・591・600 行（v0.6.10）。
