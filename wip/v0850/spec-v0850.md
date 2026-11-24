# spec-v0850 — 米PT キャンペーン②d：D-Day・生存者救助（us_07）

基準: main 38acd73（v0.8.4 のマージ）。作業ブランチ claude/v0.8.5-us07。この文書は計画（コードは変えていない）。
数はみな design の初めの値（S3 の測りと実機で直す）。「未確認の既定」は §9 にまとめてユーザーへ報告する。

---

## §1 目的・Done・ユーザーの言葉

- **目的（1 行）**: us_07「D-Day・生存者救助」を、日の出の後の昼に初期の Higgins の PT で、触雷して沈む駆逐艦コリーの生存者を砲撃と機雷原の中で拾い、沖の駆逐艦フィッチへ渡す任務として出撃可にする。ほかの 12 任務とそのハードは 1 ビットも変えない。
- **Done（1 行）**: Title の米PT のタブ（7 任務）から us_07 に出撃でき、40 名以上をフィッチへ渡して帰投で達成、S ボートはノーマル・ハードとも来る（史実に無い想定と Briefing・Result・docs に書く）、門（§5）が全部 ✓、iPhone の実機テスト。
- ユーザーの言葉（そのまま）:
  - 2026-11-15（v0.8.0 の計画）「us_04〜us_07 の 4 つも作ってくださいね。」
  - 2026-11-24 の問い（AskUserQuestion）「us_07「D-Day・生存者救助」で、ドイツの S ボート（魚雷艇）の襲撃を入れますか？ 史実では Corry の救助（06:33 以降の昼）の間、S ボートはユタ沖に来ず…危険は沿岸砲と機雷でした。今の種の目標文には「Sボートの襲撃を避ける」とあります。」→ 答え「**両方で出す**」＝ノーマルとハードの両方で S ボートが襲う（意図した史実に無い「もしも」。Briefing・Result・docs に正直に書く）。

## §2 史実と種の直し

### §2.1 事実（lead の 2026-11-24 の調べ。すべて WebSearch の抜粋のみ・本文未読）

| 事実 | 確度 |
|---|---|
| コリーは 06:33 に被害。公式の喪失報告は機関区の下の触雷、NavSource はサン＝マルクフ（クリスベック）砲台の 21 cm 弾とする＝**食い違い** | medium |
| 日の出 06:00（UTC+2。v0.8.0 の astronomy-engine の計算は満月 99%・月没 06:04）。生存者は約 2 時間、砲撃の下で海にいた | medium |
| 救ったのはフィッチ・ホブソン・バトラーと初期の Higgins の PT 1 隻（第2戦隊）。PT の乗員の回想は約 60 名をフィッチへ移した（種の 61 名と少し違う） | medium |
| S ボート（第5・第9戦隊）は 6 月 6 日 05:00〜05:15 にシェルブールを出て最大射程で船団へ雷撃し、06:00 ごろには戻っていた。セーヌ湾への襲撃は 6 月 7〜9 日 | medium |

### §2.2 種（missions_seed.json:1140〜）の直し

| 鍵 | 今 | v0.8.5 |
|---|---|---|
| `order` | 7 | **5**（年代順。us_05 → 6・us_06 → 7。§2.3） |
| `date`・時刻 | 1944-06-06 | 同じ。Briefing は「6時33分」 |
| `moon` | dark | **day**（`moon_label_ja` 「昼（日の出の後）」） |
| `player_boat` | us_elco80 | **us_higgins78** |
| `torpedo_type` | us_mk13 | us_mk13 のまま（CLAUDE.md §2「兵装」: 全任務で魚雷と機銃を表示・使える。狙う艦が無いので発射の時に決着＝us_03 と同じ）。初期の Higgins の管か架台かは未確認＝絵は架台 |
| `enemies` | [de_sboat_enemy] | **[de_sboat_enemy, de_sboat_enemy]**（ハードは `hard.extra_pt_legs_m` で 3 隻） |
| `hazards` | mine, friendly_fire | **shore_battery, mine, enemy_ship_gunfire_or_ram（S ボートの砲）, grounding, friendly_fire** |
| `duration_min`・`duration_s` | 5 | `duration_s` 300（救助の時間。§4.5） |
| `objective` | 触雷した駆逐艦の生存者を制限時間内に収容し、Sボートの襲撃を避ける | §8.1 の文（S ボートは想定と書く） |
| `success` | 生存者40名以上収容して帰投 | 「生存者40名以上をフィッチへ渡して帰投」 |
| `historical_note`（画面に出ない＝core/briefing.ts:2） | PT-199が駆逐艦Corryの生存者61名を救助。 | §2.1 の 4 行を書き、61／約 60 の食い違いと死因の食い違いを残す（艇の番号は調べの記録なので残してよい） |
| `briefing_note_ja`（画面） | 無し | §8.1（艇の番号・人名なし） |
| `source_url` | ibiblio CloseQuarters PT-7 | Wikipedia の Corry（§10 の 4 つは historical_note に） |
| `dawn_air` | own・none | 変えない（昼の空は味方＝空襲なし） |
| `playable_from` | 無し | S5 で "v0.8.5" |

data の他の直し（S0）:
- `boats.json:202` us_higgins78 に Elco 80 にあって無い 4 鍵（`damage`・`fuel_capacity_gal`・`fuel_idle_ratio`・`gun_battery`＝弾倉つき）を Elco 80 の値で足す（source「design (Elco 80 と同じ値。Higgins の値は未確認)」）。`turn_rate_deg_s` 28 はそのまま。
- `enemies.json:1086` de_sboat_enemy を米PT の記録の形（core/pt-data.ts:31 の PtDataRecord: `boat_ref` de_s100・`torpedo_immune` true・detection・patrol・attack の全鍵・guns 1 種（20 mm）・tactics・under_fire・chase）に書き直す。`name_ja`「独Sボート（S-100級）」。新しい `name_short_ja`「Sボート」（HUD の名、§4.4）。`torpedo_attack` は置かない（§4.4）。
- `risk_events.json:124` mine に `params`（§4.2）。`scoring.json` に `objective_by_type.rescue` 300 と `rescue.points_per_survivor` 8、`kill.points_by_enemy.de_sboat_enemy` 70（§4.6）。

### §2.3 order の年代順（設計の既定）

- Title は `order` 順（core/briefing.ts:92〜112。重複は例外）。`order` を読むのは Title の並びだけ（`grep` で他の読み手なし。Result に「次の任務」は無い）。世界・setup・解放（`unlock_mission_ids` は id の一覧＝campaign-data.ts:58）は変わらない。
- 固定している tests: `tests/title-grid.test.ts:44〜52`（米PT の 6 行の並び・格子が満杯）・`:80`（4〜6 任務の幾何）。ほかに us_07 を「遊べない任務」の例に使う 3 本: `tests/dawn-air.test.ts:307`・`tests/dawn-withdraw.test.ts:269`・`tests/campaign.test.ts:115`（遊べない任務が無くなるので、data を写して us_07 の `v0_1_prototype` を消した fixture で同じことを確かめる）。

## §3 遊び

昼の 06:40。プレイヤーは沖の集合点の近くから Higgins で南西へ走り、浅瀬の手前で傾いて沈みかけたコリーの周りの 12 群・60 名の生存者に寄る。拾うには群の 40 m の内で 5 kt 以下（静音のボタンが効く）。1 名 0.8 秒、乗せられるのは 20 名まで。満ちたら掃海済みの水路を通って北東の駆逐艦フィッチの輪（半径 180 m）へ行き、5 kt 以下で移す（1 名 0.25 秒）。南の岸の砲台（210 mm）は昼なので射界の中の艇は見えていれば撃ち、遅い艇の周りに落ちる砲弾は近くの生存者も奪う。煙幕で砲台との線を切れば撃たない（今の規則）。水路の外には機雷。昼なので 150 m で見えるが、全速では避けきれない。90 秒ほどで西から S ボート 2 隻（ハード 3）が来て 20 mm で航過・追撃する（今の米PT の AI）。フィッチの 1,200 m の内へ引き込めば、フィッチの砲火で 4 秒後に退く。300 秒で救助の時間が終わり、残りの生存者は他艦の内火艇が拾い、S ボートは西へ去る。40 名以上を渡して沖の集合点の輪へ帰れば達成。

地図（向きは作り。海域の南の縁＝コタンタン半島の東岸。北＝沖＝実の東、西＝実の北＝シェルブールの方、東＝実の南＝ユタ・ビーチの南）。今の岸は `side: south` だけ（config/mission-data.ts:170）なので、この回し方で今の岸・浅瀬・沿岸砲をそのまま使う:

| 物 | 位置（m。海域 6,000 × 4,000） | 理由（design） |
|---|---|---|
| 岸 `coast` | 南の縁・`land_m` 600・「コタンタン半島（サン＝マルクフ〜ユタ・ビーチ）」 | 今の south の岸 |
| 浅瀬 | y 3,750〜4,000 の帯「浅瀬（干潟）」 | 座礁の危険（今の規則） |
| 砲台（クリスベック） | x 1,600・岸から陸へ 600 m | 実の位置関係（コリーの北西の陸）。射界 2,600 m の半円がコリーと生存者を覆い、フィッチの輪は外（約 4,100 m） |
| コリー | (2,600, 2,700)・艇首 30°・沈座（動かない・当たりなし） | 砲台から約 2,150 m |
| 生存者 12 群 | コリーの 300 m の内、主に北東（流れの下）。1 群 3〜7 名・計 60 | 史実の PT の分の約 60 名 |
| フィッチ | (4,300, 1,500)・輪 180 m | コリーから約 2,100 m（巡航で約 35 秒） |
| 帰投の輪（沖の集合点） | (5,400, 500)・半径 250 | フィッチの輪と別（入れば任務が終わる＝今の mission-flow のまま） |
| 出発 | (5,300, 800)・艇首 225° | |
| 掃海済みの水路 | 帰投の輪 → フィッチ → コリーの北 400 m の幅 300 m の帯 2 本（ブイの列） | 史実の掃海水路（Corry の被害の場も火力支援区域） |
| 機雷原 | 4 つの区画に 24 個（ハード 32）。水路・輪・出発・コリー・群の 80 m の内には置かない | |
| S ボートの線 | 西の縁 (200, 1,200)→(2,400, 2,000)・(200, 1,800)→(2,300, 2,500)。去る向き 270° | シェルブールの方から |

## §4 新しい規則（みな `src/core` の純粋な関数・固定長の状態・vitest）

### §4.0 乱数と順

- 新しい系列は **seed+47 の 1 本だけ**（core/night.ts:3 の注の最後は +46）。組み立ての時に 1 回: 群ごとに位置のずれ 2 回 → 機雷はハードの数（32）ぶん 2 回ずつ（ノーマルは前の 24 個を使う＝引く回数は難易度に依らず固定）。ステップの中では引かない（拾う・移す・触雷・フィッチの砲火はみな決定的）。
- S ボートは今の米PT の系列（+18 の砲・+20 の被弾）、砲台は +8（2 門目 +9）、夜の揺らぎ +16（`mirror_chance` 0・`shore_battery_jitter_m` 0）。
- 固定ステップの順（tests/rescue-step-order で固定）: 自艇 → 米PT の隊の段（凍結の stepPtSection＝今の world-enemy-step）→ S ボートの退き（§4.4）→ 砲台（§4.3。着弾で §4.1 の onShell）→ 生存者（§4.1）→ 機雷（§4.2。触雷は今の boat-damage へ）。

### §4.1 生存者（`core/rescue.ts`・`config/rescue-mission-data.ts`・V-Q）

- data `v0_1_prototype.rescue`: `groups`（[x, y, 人数] の配列・≤ 16）・`group_jitter_m` 40・`capacity` 20・`pickup_m` 40・`pickup_max_kt` 5・`per_person_s` 0.8・`transfer_per_person_s` 0.25・`shell_kill_m` 20・`objective_delivered` 40・`ships`（`fitch`: x・y・`ring_m` 180・`heading_deg`・`cover_m` 1,200・`cover_s` 4・`label_ja`「フィッチ」／`corry`: x・y・`heading_deg`・`label_ja`「コリー」）・`daylight`（§4.5）・`source`。
- 状態（createRescueState で 1 回。固定長）: 群ごとの残り（Int16Array）・乗せている数・渡した数・砲撃で失った数・他艦が拾った数・拾い中の群と時計・移す時計・出来事の印（数の欄だけ）。
- 拾う: 浮いていて、群の中心から `pickup_m` + 艇の半長の内で、速さ ≤ `pickup_max_kt` の間、体感秒で `per_person_s` ごとに 1 名（乗せている < `capacity` の間）。一番近い群を 1 つだけ。離れれば時計は 0 に戻す（1 名ずつは数えたまま）。
- 移す: フィッチの輪の内で速さ ≤ `pickup_max_kt` の間、`transfer_per_person_s` ごとに 1 名を「渡した」へ。
- 砲撃: 砲台の着弾が群の `shell_kill_m` の内なら、その群から 1 名を失う（1 発で 1 群まで・一番近い群）。S ボートの弾は数えない（小口径）。
- 救助の時間の終わり（§4.5。世界の夜明けの時計）: 残りの群はみな「他艦が拾った」へ（絵は消す）。乗せている分はそのまま移せる。
- 自艇が沈めば乗せている分は「沈没で失った」（Result の 1 行。点には入らない）。帰投で終われば乗せている分も渡したに数える（沖の集合点で移す。設計の既定）。
- 達成 `rescueObjectiveDone(reason, delivered, n)` = endCountsAsReturn && delivered ≥ n（core/mission-flow.ts:15 の convoyObjectiveDone の形）。
- 検査（起動時・例外は鍵を名指す日本語）: V-Q1 群は 1〜16・人数は 1 以上の整数で合計 ≥ `objective_delivered`。V-Q2 群・フィッチ・コリーは海域の中で浅瀬の外。V-Q3 `capacity` ≥ 1 かつ < `objective_delivered`（1 往復では達成しない）。V-Q4 フィッチの輪と帰投の輪が重ならない（輪に入って任務が終わらない）。V-Q5 フィッチの輪は全砲台の射界の外。V-Q6 `pickup_max_kt` ≤ 艇の `speed_bands_kt.silent_max`（静音のボタンで拾える）。V-Q7 `scoring.json` に `objective_by_type.rescue` と `rescue.points_per_survivor`。V-Q8 `rescue` は type `rescue` の任務だけ・1 任務だけ。
- tests/rescue: 速さの縁 ±0.1 kt・距離の縁・満員で止まる・群の途中で満員・輪の外では移さない・時計の戻り・着弾 1 発 1 名・時間の終わり・沈没・帰投・同じ入力で同じ出力・step の本体に確保なし（ソースの走査。tests/sfx-rules のやり方）。

### §4.2 機雷原（`core/minefield.ts`・`config/minefield-mission-data.ts`・V-X）

- 表し方: 点の固定長の配列（Float64Array の x・y・Uint8Array の状態: 隠れ・見えた・爆発）。≤ 48。区画は data の矩形（`fields`: [x, y, w, h, ノーマルの数, ハードで足す数]）・水路は矩形（`lanes`: [x0, y0, x1, y1, 幅]）・置かない円は検査が data から作る（水路の幅の内・輪・出発・コリー・群 + 80 m）。置けない引き当ての点は「捨てる」（引く回数は変えない）。
- 見える: 昼なので、艇から `sight_m` 150 の内に入った機雷は見えたに変わり、以後見えたまま（絵が出る）。
- 触雷: 浮いている自艇の船体（core/shells の pointNearBoat。半幅 + `contact_m` 6）の内なら爆発（確率なし）。被害は risk_events の `mine.params`（`damage` 60・`fire_chance` 0.5・`engine_damage_chance` 0.5・`sight_m`・`contact_m`）を今の boat-damage の HitSpec で（Higgins の HP 100＝1 個では沈まず、2 個で沈む）。終了理由は新しい `mine`（core/mission-flow.ts:9 の型に足す。Result の見出し「触雷 — 沈没」）。
- S ボート・砲弾・魚雷は機雷に触れない（設計の既定）。
- 走査は機雷の数の線形（二乗距離。N ≤ 48 なので格子は要らない。見える判定は艇が 25 m 動くごとだけでもよいが、まずは毎ステップの 48 回の比較で測る）。
- 検査: V-X1 区画と水路は海域の中・数の合計 ≤ 48。V-X2 置ける面積があり、ノーマルの数の 80% 以上が置ける（seed 1〜32 の組み立てで確かめる tests）。V-X3 `sight_m` > `contact_m` > 0・`damage` < 艇の HP。V-X4 水路が帰投の輪・フィッチの輪・コリーの 400 m の内をつなぐ（道がある）。V-X5 `mine` は hazards に `mine` のある任務だけ。
- tests/minefield: 置き方の決定性（seed ごとに同じ点）・置かない円・ハードは前の 24 個を含む・見える縁・触雷の縁・爆発は 1 回・沈んだ艇は触れない・確保なし。

### §4.3 砲台（今の規則を大発なしで使う）

- 規則は今の core/shore-battery.ts:62〜97 のまま（射界・気づき・煙幕で線が切れれば撃たない・+8）。変えるのは置き場だけ:
  - 今の沿岸砲は大発の狩り（systems/barge-hunt.ts:123・:183）の中にしかなく、world-enemies.ts:102 は大発の無い任務で作らない。→ 新しい薄い持ち主 `systems/shore-guns.ts`（ShoreBattery を持ち、大発の気づき false で毎ステップ step する）を、大発が無く沿岸砲がある任務だけ world-enemies が作る（us_03 の道は 1 字も変えない）。
  - 砲の値は risk_events の 75 mm 1 種だけ（config/game-data.ts:177〜183）。→ 任務の `shore_battery.params`（形は risk_events の shore_battery.params と同じ）があればそれを使う（us_03 は無い＝今と同じ）。us_07: 21 cm 3 門・`rof_per_min` 2（10 秒に 1 発）・`effective_night_m` 2,600（鍵の名は夜のままで昼の有効射程と source に書く）・`damage` 34・`dispersion_m` 80・`splash_radius_m` 10・`shell_speed_mps` 600・`base_detect_m` 6,000・`inland_m` 600。
  - 気づきの距離 `detectOpenM` は今、大発の任務では世界の detectRangeM（月・速力込み）。us_07 は昼なので `params.base_detect_m` をそのまま（速力に依らない。射界の内なら煙幕の外は見えている）。
- テレメトリは今の沿岸砲の欄（射界の中・撃ってくる・秒・砲撃・命中）を同じ名で埋める＝3 行目「沿岸砲！」と曲の段（core/sfx-music-mood.ts:6・:14）が今のまま効く。
- 検査 V-U2: `shore_battery.params` は risk_events と同じ形・射界がコリーを含みフィッチの輪を含まない（V-Q5 と同じ点）。

### §4.4 S ボート（今の米PT の AI をそのまま。`core/sboat-cover.ts`・V-D）

- 隊は今の `pt_boats`（凍結の core/pt-boats・pt-state・pt-contact・pt-chase・pt-damage・pt-gun。tests/frozen-files の 20 本は 1 字も変えない）。自艇の 13 mm の代わりに Higgins の機銃（gun_battery）が PT の隊を撃つ（今の systems/pt-squadron.ts:150）。
- 斉射（core/pt-torpedo）は付けない: 輸送船の揚陸（LD_UNLOADING）に結びついており（pt-torpedo.ts:1〜12）、フィッチを狙わせると沈没と渡す先の扱いが要る。S ボートは「自艇を襲う」だけ（ユーザーの問いの「襲撃」）。フィッチへの雷撃は候補（§9）。
- フィッチの砲火（新しい規則）: 去っていない・沈んでいない S ボートがフィッチから `cover_m` の内に体感秒で `cover_s` 続けて居れば、その S ボートを去らせる（PT_LEAVE）。航過の中（PT_PASS）は航過が終わるまで待つ（core/pt-damage の hitPt が航過の外の PT にだけ書くのと同じ。pt-torpedo.ts:8〜9 の「外から PT_LEAVE を書く」書き方: phase・timerS・onLeave）。乱数なし。退いた数を Result へ。絵はフィッチの砲口の閃光と S ボートの周りの水柱（決まった 4 点の順。乱数なし）で、絵が出すので音（遠い砲・水柱）も鳴らす（音は絵と HUD に従う）。
- 出る時刻: 線の始めから哨戒 12 kt、`detect_from_s` 60（出撃から 60 秒は見つけない）。昼の見つける距離は base 2,000 × 速力 × 昼の倍率（§4.5）。
- 名前: HUD の文は今「米PT」を直書き（ui/pt-lines.ts:159〜183・pt-chase-lines.ts:57〜75・pt-gun-lines.ts:114「ガソリンに引火」など）。→ 文を作る関数に名前（enemies の `name_short_ja`。無ければ「米PT」）と沈む時の言葉（ディーゼル＝「炎上」）を渡す。日本の 4 任務の文は 1 字も変わらない（hud-ab の門）。
- 絵: Boot の米PT の絵は「pt_boats を持つ最初の任務」から作る（scenes/boot-scene.ts:148〜150）。種の配列では us_07 が jp_* より前なので、そのままだと **jp_01・jp_04・jp_05 の米PT の絵が S ボートの寸法に変わる**。→ find を「PT の記録の boat_ref が us_elco80 の最初の任務」に（意図した 1 行。tex-ab で米PT の絵が同じ証）、S ボートは別の鍵 `tex-sboat`（S-100 級の形・敵の色。PtSquadron の絵の鍵を記録から）。
- 検査: 今の config/pt-mission-data.ts:24〜56（振り切れない: 突撃 40 kt・追撃 40 kt > Higgins 39 kt／1 回の航過で沈まない／見えない所から撃たない: 20 mm の有効 600 m ≤ 昼の視程／出発で見つからない（史実モード込み）／夜明けの敵艦 none）がそのまま効く。足す V-D1 `cover_m` > S ボートの砲の有効射程（フィッチの内で航過を固めない）。V-D2 フィッチの輪から最寄りの S ボートの線まで > `cover_m`（出発で退かない）。
- tests/sboat-cover: 縁 ±1 m・秒の縁・航過の中は待つ・去った後に隊の欄（owner・held・相方・追撃の目標・連射）が宙に浮かない（tests/landing-torpedoes の沈没の枝と同じ確かめ）・乱数を引かない。

### §4.5 昼と救助の時間（`config/day-mission-data` 相当を rescue に・V-U1）

- 昼の倍率: `moon_factor.day` 1.0 は jp_03 も読む（hit_rate_model.json:179〜183。jp_03 の視程と印に効く）ので変えない。→ `rescue.daylight.moon_factor` 1.8（視程 2,700 m・S ボートが巡航の艇を見つける 3,600 m）を、getVisibilityParams（config/game-data.ts:262）の任意の 4 つ目の引数で月の係数の代わりに（呼び手 11 か所のうち us_07 が通る world-setup.ts:116・pt-mission-data.ts:35/:48 だけが渡す。無い任務は今と同じ数）。V-U1: 1 ≤ 値 ≤ 3・S ボートの「出発で見つからない」を満たす（今の検査がこの値で回る）。
- 海の色は最初から昼: 今は jp_03 の `day_start`（evac だけの鍵＝config/evac-mission-data.ts:31 の EVAC_ONLY_KEYS）。→ `setup.dayStart` を「evac の dayStart か rescue がある」で作り、world-dawn.ts:89・world-art.ts:51・dawn-telemetry.ts:54 がそれを読む（jp_03 は同じ値）。
- 救助の時間: 世界の夜明けの時計（`duration_s` 300）をそのまま使い、言葉だけ替える（ui/dawn-lines.ts:38 の day_start の枝の前に rescue の枝: 「救助 残り 4:12」「救助の後 0:20」。中央の帯 §8.2）。夜明けの規則（空は味方＝空襲なし・PT は去る）は今のまま。
- レーダー: us_07 には付けない（設計の既定。v0.8.0 の spec §3.4 は so_late の予定だったが、昼の目 2,700 m が so_late の小艇の 1,800 m より遠く、輪が何も足さない。HUD を静かに保つ）。

### §4.6 点（scoring.json・core/scoring.ts:111）

- `rescue.points_per_survivor` 8（渡した 1 名ごと・帰投の有無に関わらず＝convoy・evac の作法。deliveries に足す）。`objective_by_type.rescue` 300（達成＝帰投 ＋ 40 名以上）。`kill.points_by_enemy.de_sboat_enemy` 70。
- 「沈んで死ぬより帰る方が上」: 60 名 × 8 ＝ 480 ＋ S ボート 3 隻 × 70 ＝ 210 → 690 < 帰投 700（tests/scoring-rescue で固定）。回避の点は付けない（昼で隠れられない）。

## §5 再利用と変えない物・門

- 変えない: 凍結の 20 本（tests/frozen-files）・core/shore-battery・core/pt-torpedo・core/landing・evac・ほかの 12 任務の data。意図して変える共有の行: Boot の米PT の find（§4.4）・getVisibilityParams の任意の引数・setup.dayStart・PT の文の名前の引数・world-enemies の沿岸砲の持ち主の枝・mission-flow の終了理由 `mine`・menu-ui の行の余白（§8.4）。
- 門（scratchpad v0840/tools/run-gates.sh を v0850/tools へ写し、基準を main 38acd73 のサイトに。音の 3 つの状態）:
  1. build・typecheck・lint・`npm test`（凍結 20 本・setup の snapshot の 8 本が変わらない。新しい `setup-us07` の snapshot）。
  2. g2（OK の数が基準と同じ。us_07 は入れない）。
  3. ab-all・hud-base（default／audio／noaudio）・jp04base・jp03・us04・us06・us05・hist／histsmoke／smokeoff を A＝基準・B＝今の木で diff 0。
  4. 新しい組 SET=us07（ノーマル・ハード × seed 1・2 を 320 秒。A＝B＝今の木＝決定性とページのエラー。S2 の後は A を S2 の commit のビルドに）。
  5. tex-ab: 今ある鍵はみな同じ画素（米PT の絵が S ボートに変わらない証）。新しい鍵（Higgins・S ボート・味方の Fletcher 型・生存者・機雷・ブイ）は一覧で出す。
  6. Title の画面写し: 日本のタブは基準と同じ画素、米PT のタブは意図した変化（7 任務）。

## §6 性能の指摘（CLAUDE.md §7。実装の前に）

- 生存者の群（≤ 16）・機雷（≤ 48）・ブイ（≤ 24）は起動時に generateTexture した 1 枚ずつを Image で置く（プール。数は data の上限で固定）。見えた機雷は setVisible を変わった時だけ。毎フレームの Graphics.clear は使わない。
- 機雷原の区画の薄い色と水路の帯は、任務の開始に 1 回描いた画像（backdrop-art と同じ作法）。夜ごとに機雷の位置は変わるが、区画と水路は data で固定なので 1 回で足りる。
- 群の人数の札・2 行目・Result の文は値が変わった時だけ setText（前の値を持つ）。
- 拾う・触雷・砲撃の判定は二乗距離（Math.sqrt なし）。線形の走査で N ≤ 48。step の本体に new・配列の filter/map・オブジェクトリテラルなし（tests のソースの走査で固定）。
- S ボートの絵は 1 枚を Boot で（tex-sboat）。フィッチの砲火の閃光と水柱は今の fx のプールを使う。
- 危ない所（壊れやすい構造）: ① Boot の find（jp の絵が変わる）② 沿岸砲が大発の持ち主の中にある（大発なしで黙って作られない）③ 文の「米PT」の直書き（jp の文を変えずに名前を差す）④ `day_start` が evac 専用の鍵（そのまま使うと evac の検査が us_07 を拒む）⑤ 遊べない任務が無くなる（3 本の tests の例）。どれも §4 の手当てで、門 3・5 が証になる。

## §7 段（PATCH の中の段）と見積もり

| 段 | 中身 | Done と門 | 担当 | 目安 |
|---|---|---|---|---|
| S0 | data（§2.2・§2.2 の他の直し）と検査（V-Q・V-X・V-D・V-U の data だけで分かる物）・`order` の年代順・3 本の tests の fixture・Boot の find・getVisibilityParams の引数・dayStart の配線（値だけ）。遊べない（`playable_from` 無し・`?debug&mission=us_07` は今のまま us_02 に落ちる） | 門 1〜3・5。title-grid は 6 行のまま（us_07 は出ない）で並びの直しだけ | 実装の agent | 0.4 |
| S1 | core/rescue・core/minefield・core/sboat-cover・点と達成・終了理由 mine と tests | `npm test`・門 1〜3（世界は配線しない） | 実装の agent | 0.5 |
| S2 | 世界の配線（systems/world-rescue: 群・フィッチ・コリー・移す／systems/shore-guns／systems/world-mines）・絵（Higgins の形 `higgins78`＝config/boat-art-config.ts:53〜55 に 1 行と置き方、S ボートの形、味方の Fletcher 型＝destroyer-art-config.ts:11 の fletcher を味方の青で〔Gleaves 型の代わり。2 本煙突で似る＝docs に書く〕、生存者・機雷・ブイ）・PT の文の名前・`?debug&mission=us_07` で遊べる・Title に出ない・SET=us07 | 門 1〜5・SET=us07 の決定性 | 実装の agent（lead が画面写しを見る） | 0.8 |
| S3 | 測り: ヘッドレスの台本 3 つ（真っ直ぐ全速・水路を通って静音で拾う・煙幕を張って拾う）× seed 1〜16 × ノーマル・ハードで、渡した数・沈没・触雷・砲撃の命中・S ボートの航過を表に。帯（初めの目安）: 水路を通る丁寧な遊び方で達成 60〜85%・沈没 ≤ 15%／全速で真っ直ぐは触雷 ≥ 50%。外れたら data（数・砲の散布・cover_m）だけで合わせる | 表と data の直し・門 1〜3 | 実装の agent・lead が帯を判断 | 0.3 |
| S4 | HUD（2 行目のモード 46〔出来事〕・47〔常の文〕を ui/rescue-lines・rescue-texts に、時計は strait-line-clock の作法）・端の印（生存者・フィッチ・帰投）・3 行目は今の沿岸砲の文だけ・Briefing・Result（ui/rescue-result）・見出し・Title の 7 任務の並べ方（§8.4）・曲の段の確かめ（新しい信号なし） | 門 1〜6・文の幅（20 px で ≤ 840 px、3 行目 ≤ 596 px）の tests | 実装の agent | 0.5 |
| S5 | `playable_from` "v0.8.5"・docs（CLAUDE.md §2 に「D-Day（us_07）」の行・§4 の層、docs/01 の直し〔§2.1〕、docs/02 の救助と機雷原の節、docs/03 の行と実機テスト項目）・CHANGELOG・package.json 0.8.5 | 門 1〜6・PR | lead | 0.3 |

合計 約 2.8 セッション（docs/03 の目安 2.5〜3 の内）。削る順（lead が選べる）: ① フィッチの砲火を絵なしの規則だけ（−0.1）② S3 をハードを省いた 8 夜（−0.1）③ Higgins の絵を Elco 80 の形の寸法違い（−0.2）。

画面写し（S2・S4。scripts/headless/art-shots の作法）: 出撃直後（昼の海・沖の集合点・水路のブイ）／コリーと生存者の群（拾っている最中の 2 行目）／フィッチの輪で移している所／機雷が見えた所と触雷の爆発／砲台の射界の中で煙幕を張った所／S ボートの航過（赤い線）とフィッチの砲火で退く所／救助の時間の終わりの帯／Result（達成・未達・触雷で沈没）／Briefing／Title の米PT のタブ（7 任務）と日本のタブ（同じ画素）。

## §8 文（下書き。艇の番号・人名なし。艦名はカタカナ）

### §8.1 Briefing

- 題「D-Day・生存者救助」・副題「1944年6月6日 ・ ノルマンディー沖（ユタ・ビーチ）」（格子では「（」の前まで）。月の行「昼（日の出の後） ・ 空は味方」。
- 目的（objective）: 「6時33分、ユタ沖で駆逐艦コリーが沈んでいく。砲台の210 mm弾の下、海に浮かぶ生存者を拾い、沖の駆逐艦フィッチへ渡せ。掃海された水路の外には機雷。西からSボートが来る（ゲームの想定）。」
- 達成（success）: 「生存者40名以上をフィッチへ渡して帰投」
- 史実メモ（briefing_note_ja）: 「1944年6月6日6時33分、ユタ・ビーチ沖で駆逐艦コリーが触雷して沈んだ（岸の砲台の210 mm弾も受けており、どちらが沈めたかは記録で食い違う）。乗員は約2時間、砲撃の下で海にいた。駆逐艦フィッチ・ホブソン・バトラーと初期のHiggins型のPT 1隻が救い、PTは約60名をフィッチへ移した。この朝、Sボートはユタ沖に来ていない。このゲームの襲撃は想定。」
- ハード（`hard` の objective_ja）: 「…Sボート3隻が西から来る（想定）。機雷も多い。…」

### §8.2 2 行目・帯

常の文（モード 47。値が変わった時だけ）:
- 「乗せている 12/20 名 ・ 渡した 18 名 ・ 海に 30 名」／満員「満員 20/20 名 ・ フィッチの輪へ（水路を通れ）」／拾える所「生存者 5 名 ・ 5 kt 以下で寄せて拾う（静音が効く）」

出来事（モード 46。4 秒）:
- 「収容 5 名 ・ 乗せている 17/20」／「フィッチへ 17 名を移した ・ 計 35 名」／「40 名を渡した ・ 帰投すれば達成」
- 「砲弾が生存者のそばに落ちた ・ 1 名を失った ・ 煙幕で砲台の目を切れ」
- 「機雷！ 北西 140 m ・ 水路の外」（見えた時。同じ 4 秒に 2 つ目は数だけ）／「触雷！」（被害の文は今の被弾の作法）
- 「Sボート 2 隻 西から ・ フィッチの方へ引き込め」／「フィッチの砲火 ・ Sボートが退いた」
- 救助の時間の終わりの帯: 「救助の時間が終わった ・ 残りはホブソンとバトラーの内火艇が拾う ・ 沖の集合点へ帰投せよ」

3 行目: 今の「沿岸砲！」の文だけ（新しい尾は足さない＝596 px の作法）。端の印: 「生存者 650 m」（一番近い群・画面の外）・「フィッチ 1200 m」（乗せている間）・今の帰投の印。

### §8.3 Result

- 見出し: 達成「救助成功」／未達で帰投「帰投（渡した N 名 ・ 40 名に届かず）」／触雷で沈没「触雷 — 沈没」（他は今の表）。
- 行: 「生存者: フィッチへ 44 名 ・ 帰投で 3 名 ・ 砲撃で失った 2 名 ・ 他艦が拾った 11 名」（沈没なら「沈没で失った 12 名」）／「機雷: 見えた 6 ・ 触雷 0」／「Sボート: 2 隻 ・ フィッチの砲火で退いた 1 ・ 撃沈 0」／「この朝、史実ではSボートはユタ沖に来ていない（ゲームの想定）」。

### §8.4 Title の 7 任務の並べ方

今: 4 行以上で 2 列の格子・3 段まで（title-layout-config.ts:21〜24。行 96・間 12・216〜528。操作の一言 y 560・下の切り替え y 596）。7 任務は 4 段目が一言と切り替えにかかる。

| 案 | 中身 | 良い | 悪い |
|---|---|---|---|
| **A（推し）** | 7 行以上だけ 2 列 × 4 段の詰めた行: 高さ 76・間 12（216〜556）・題 26 px・副題 18 px・上下の余白 10（MenuButton の spec に任意の `padY`。無い物は今の 16） | 列 597 のまま題も状態「出撃準備 →」も横に収まる。日本のタブ（6 行）は 1 px も変わらない。並び（行優先・order 順）は今のまま | 行の高さ 76 px ≈ 41 pt（44 pt の目安に少し足りない。幅は 326 pt あるので押し違いは少ない） |
| B | 3 列 × 3 段（列 390＝下の 3 つの切り替えと同じ幅）・行 96 | 押す所が大きい。9 枠まで | 題「スリガオ海峡・最初の接触」30 px で 360 px＋状態は入らない（状態を 2 行目へ・題を 24 px に） |
| C | 2 列 × 3 段＋「次へ」 | 今の行のまま | 隠れた任務・押す手間が増える |

A の tests: 1,280〜1,584 の全幅で 7 行が画面の内・重ならない（間 ≥ 12）・下端 ≤ 560、6 行以下は今の矩形と同じ。並び（年代順）: 左上 us_01・右上 us_02・左 2 us_03・右 2 us_04・左 3 us_07・右 3 us_05・左 4 us_06。

## §9 未確認の設計の既定（ユーザーへ報告）とユーザーへの問い

未確認の既定（変えるときはユーザーに聞く）:
1. `order` を年代順（us_07 → 5・us_05 → 6・us_06 → 7）。Title の並びだけが変わる。
2. 拾うのは群の 40 m の内で 5 kt 以下・1 名 0.8 秒・乗せられるのは 20 名・移すのはフィッチの輪で 5 kt 以下・1 名 0.25 秒。帰投で乗せている分も渡したに数える。
3. 砲台は今の規則（射界の中で見えていれば撃つ・煙幕で線が切れれば撃たない）を 210 mm の値で。昼なので速力に依らず見えている。近くに落ちた砲弾は生存者を 1 名奪う。
4. 空は味方（空襲なし）・昼（海の色は最初から昼・昼の視程の倍率 1.8 は us_07 だけ）・300 秒で救助の時間が終わり、残りは他艦が拾う（言葉は「夜明け」でなく「救助」）。
5. コリーの沈みの原因は触雷（公式の喪失報告）とし、砲台も撃っていたと書く（死因の食い違いを Briefing と docs に残す）。
6. 機雷は水路の外の 4 区画に 24 個（ハード 32）・昼なので 150 m で見える・触れれば必ず爆発（被害 60＝1 個では沈まない）・S ボートは触れない。
7. S ボートは自艇を襲うだけ（フィッチへの雷撃なし）・60 秒後から見つける・フィッチの 1,200 m の内に 4 秒居れば退く・ディーゼルなので燃えにくい・撃沈 70 点。
8. レーダーは付けない（昼の目の方が遠い）。
9. 絵: フィッチとコリーは Fletcher 型の絵を味方の青で（Gleaves 型の代わり）・初期の Higgins は魚雷を架台で描く（管か架台かは未確認）。
10. Title の 7 任務は案 A（2 列 × 4 段の詰めた行）。
11. 渡した 1 名 8 点・達成 300。新しい音は作らない（今の爆発・遠い砲・水柱を使う）、曲の段は今の信号だけ。

ユーザーへの問い: **なし**（どれも実機の後に直せる。S ボートの有無はユーザーが決めた）。

## §10 出典（すべて WebSearch の抜粋のみ・本文未読。lead の 2026-11-24 の調べ）

- コリー: https://en.wikipedia.org/wiki/USS_Corry_(DD-463) ／ https://www.navsource.org/archives/05/463.htm ／ https://ibiblio.org/hyperwar/USN/ships/dafs/DD/dd463.html
- 救助した PT の乗員の回想: https://uss-corry-dd463.com/d-day_u-boat_photos/d-day_pt-199.htm
- S ボート: https://bletchleypark.org.uk/our-story/d-day-decrypts-transcripts/ ／ https://www.usni.org/magazines/naval-history-magazine/2009/june/d-days-wake ／ https://en.wikipedia.org/wiki/E-boat
- 前の計画: scratchpad v0800/plan/spec-v0800.md（§2.0 の 4 行目・§2.4・§3.4・§12 v0.8.3 us_07・§13 の月と日の計算）／docs/03_開発ロードマップ.md:60（v0.8.5 の行）
- 確かめていない事: Higgins の乗せられる数・初期の Higgins の魚雷の発射の形（管／架台）・PT が何回に分けて移したか・砲台と機雷原の正確な位置・掃海水路の幅（どれも design）。
