# v0.6.11 仕様 r2 — jp_03「運天港・空襲下の退避」（spec-v0611-r2.md）

作成 2026-11-04（計画のみ。repo 未変更。main 88c9f19 = v0.6.10、作業ブランチ `claude/v0.6.11-next`）。
**拘束**: `plan/user-decisions.md`（ユーザー本人の操作の方式と波の数。U1〜U6 と性能の段。旧 spec の Q1＝［隠れ］［散れ］の号令はやめた）。
**使い回し**: `plan/spec-v0611.md`（地図・隠れ場所・予告・文の作法・data・検査・昼の言い方・点）、**直し**: `plan/spec-review.md`（B1・B2・H1〜H6・M1〜M14・L1〜L8。§15 に対応表）。コードの所在は `plan/map.md`、史実は `plan/hist.md`（**すべて WebSearch の抜粋・本文未読**）。

用語（画面の言葉はユーザーの言い方にそろえる）: **隊**＝3 隻の組（第1隊〜第6隊。code では `group`）、**隊長艇**＝隊の先頭の 1 隻（プレイヤーが操る艇。各隊に 1 隻）、**僚艇**＝隊長艇の後ろに続く 2 隻、**座席**＝世界の「自艇」（`MissionWorld.boat`・`damage` など。いま操作中の隊長艇の作業用の写し）、**決着**＝240 秒（第 1 次の空襲が去る＝残存の確定）。code の名前は `evac*`（H5。`raid` は seed+4 の港内空襲と衝突するので使わない。risk の id `unten_air_raid` だけはそのまま）。

---

## 1. 目的と完了条件（各 1 行）

- **今回の変更目的**: jp_03 を出撃可にする — 昼の運天港で、6 つの隊（各 3 隻）を［切替］で操りながら隊長艇を壕・陰へ運んで隠し、操作していない隊が逃げ回る間に次々来る複数の編隊から 18 隻のうち何隻残せるかを競う。
- **完了条件（Done）**: Pages の jp_03 で (1) 出撃直後から予告（赤い輪）つきの波が来て、ノーマルは 2 編隊・ハードは 3 編隊が同時に別々の隊を狙い、(2) スティックで隊長艇を動かすと僚艇 2 隻が続き、［切替］で操る隊が替わり、壕・陰に隊ごと隠れると狙っていた編隊が「見失った！」で引き返し、(3) 4 分後に操作中の隊が隠れていれば Result に「残存 N／18（史実 5）」と達成／未達。ほかの 8 任務はビット同一（凍結 20 本・模擬 md5 35 本・setup の snapshot・再生 same:true）、ユーザーの iPhone 実機テスト 3 項目（§16）。

## 2. 史実の足場（何が史実で、何が作りか。旧 spec §1 のまま＋隊の分け方）

| ゲームの要素 | 根拠（hist.md） | source の書き方 |
|---|---|---|
| 18 隻・13 隻喪失・史実の残存 5 | A2・A4・A5（米の主張 12 隻と近い） | historical（抜粋のみ・本文未読） |
| 朝から夕方まで 5 回・延べ約 1,400 機、運天は 07:00 過ぎ〜15:30 | A7・A8・A9 | historical（抜粋のみ・本文未読） |
| 4 分＝その日の第 1 次の来襲の圧縮・4 波 | hist C1 | design |
| **6 つの隊 × 3 隻・隊長艇と僚艇** | 史料に無い（隊の編成は抜粋に無い） | **design**（ユーザーの U1。Briefing で史実として書かない） |
| 編隊の機数（2・3・3・4 機 × 同時に 2 つ／ハード 3 つ） | 史料に無い | **design**（ユーザーの U5） |
| 機は東から（第38任務部隊は沖縄の東） | A6 | 方角 70° は design |
| 機の値（120 kt・2 発 × 35・爆風 25 m・CEP 32 m） | 既存 `us_carrier_aircraft`（v0.6.1） | 変えない（6 任務で共有） |
| 壕とレール | A16・A17 | 存在は historical。**数・枠・位置・1 隻ずつ上げるは design** |
| 屋我地島との狭い海峡 | A15 | historical。幅・向きは design |
| 屋我地島側の陰 | 史料に無い（hist C4） | **「design（史実の裏付け無し）」** を `*_source` に。Briefing で史実として書かない |
| 並んだ艇がまとめて燃える | A11・A12 からの推論 | design（推論） |
| 撃っても落ちない | A10「友軍が応戦できなかった」 | 既存の 0.5%/発のまま |

Briefing に書く史実は A1・A2・A7・A15・A16 の範囲だけ。実在の人物名を出さない（CLAUDE.md §11）。1945 年の隊の件には触れない。

## 3. 規則

### 3.1 地図（design。x 東・y 南、`bounds_m` 3200 × 1250。M9 の直し）
- **北の縁 y 0 = 屋我地島の岸**（海域の縁で艇が止まる。陸は `systems/evac-terrain.ts` が縁の外に描く）。**南の縁 y 1250 = 本部半島（運天）**（既存の `coast: south` で描く）。東西の縁は海（外海・羽地内海の口の見た目だけ）。
- **浅瀬は置かない**（`shallows: []`。座礁は jp_03 で起きない＝隊長艇が島の上を走る M9 の穴と、座礁で任務が終わる逃げ場の無さが同時に消える。seed 本体の `hazards` の `grounding` は設計の記録として残し、`v0_1_prototype.hazards` には入れない）。
- 見張り（ズーム 0.5）で港のほぼ全体が 1 画面（論理幅 1280〜1584 ÷ 0.5 = 2,560〜3,168 m × 1,440 m）。既定ズーム 0.75 で約 1,700〜2,100 m。
- 時間圧縮 5 倍（`time_scale`）。T-38 の全速 27.5 kt は約 70.7 m/実秒＝端から端まで約 45 秒。
- **隠れ場所**（輪の半径 `shelter_ring_m` 70。すべて design。壕は南の岸の際、陰は北の岸の際）:

| id | 名前（画面） | 位置 (m) | 枠（隻） | 種類 |
|---|---|---|---|---|
| `home_cave` | 隊長艇の壕（＝`return_point`） | (1600, 1150) | 3 | 壕（レール 1 本） |
| `west_cave` | 西の壕 | (650, 1150) | 3 | 壕（レール 1 本） |
| `east_cave` | 東の壕 | (2550, 1150) | 3 | 壕（レール 1 本） |
| `west_cover` | 屋我地の陰（西） | (1050, 100) | 3 | 陰（止まれば隠れる・見つかる） |
| `east_cover` | 屋我地の陰（東） | (2250, 100) | 3 | 陰（止まれば隠れる・見つかる） |

  枠の合計 15 < 18 ＝**最低 1 隊は隠せない**（損害で隻数が減れば入ることもある）。名前の区切りは「（西）」（M11。並べるのは「、」）。
- **停泊地**（隊長艇の位置。僚艇はその艇尾方向に `moored_gap_m` 12 m 間隔の縦列＝爆風 25 m の内なので 1 発で 2〜3 隻）:

| 隊 | 停泊地 (m) | 艇首 | 場所の名 |
|---|---|---|---|
| 第1隊（最初に操作） | (1450, 1000) | 90° | 岸壁・中 |
| 第2隊 | (900, 1000) | 90° | 岸壁・西 |
| 第3隊 | (2100, 1000) | 90° | 岸壁・東 |
| 第4隊 | (2850, 900) | 0° | 桟橋 |
| 第5隊 | (500, 550) | 90° | 浮標・西 |
| 第6隊 | (2000, 500) | 90° | 浮標・東 |

  第1隊の隊長艇から隊長艇の壕の中心まで 212 m＝輪の縁から 142 m 外（H1 の直し。V-E2 で「停泊地のどの艇も輪の縁から 20 m 以上外」）。

### 3.2 艇の記録（18 隻。起動時に 1 回だけ確保）
- 各艇: `BoatState`（x, y, headingDeg, speedMps）・`DamageState`（hp, engineDamaged, fireLeftS）・`BoatParams` の写し（機関損傷で最高速を下げる）・`sunk`・`up`（壕に上げ終えた）・追従の `EscortState`（`core/escort.ts` の形。`boat` は記録の `BoatState` と同じ物）。
- **隊長艇＝その隊の浮いている艇のうち番号（slot 0・1・2）がいちばん小さい艇**（U1 の「沈めば次の艇が隊長艇」がそのまま成り立つ）。
- **隊長艇は全部の状態を持つ**（U4）: 被弾は `applyShellHit`（HP・火災 30%・機関 20% を、その爆弾の編隊の乱数の系列から引く＝座席の `hitBoat` と同じ引き方）、火災は `stepDamage` で燃え続ける（**操作していない隊長艇は消火しない**＝燃える隊へ切り替えて［消火］を押す理由。T-38 の火災は 16 秒で 24 HP）、乗員は HP から（`crewLost`）、旋回・加速は乗員の倍率（`setPerformance`）、機関損傷は最高速 × 0.7。
- **僚艇は HP だけ**（火災・機関の乱数を引かない。大発・僚艇の作法）。僚艇が隊長艇に上がる時は、その時の HP のまま・火災なし・機関無傷で全部の状態を持ち始める。
- 隊の段階（隊ごと。艇ごとではない＝M5 の直し）:
  `G_MOORED`（停泊。最初の全隊）→ `G_UNDERWAY`（走っている。操作中か、操作していない隊のランダム回避）→ `G_ENTERING`（操作中の隊長艇が輪の中で止まった。僚艇が枠の点へ寄る）→ 壕なら `G_HAULING`（レールで 1 隻ずつ上げる）→ `G_HIDDEN`（隠れた）／陰なら直接 `G_HIDDEN` → 陰は `G_FOUND`（見つかった）になりうる／`G_GONE`（全滅）。
- **隠れているのは隊ごと**: 隊が `G_HIDDEN` になるのは浮いている全艇が入った時だけ。それまでは隊として「見えている」。ただし壕に上げ終えた艇（`up`）は 1 隻ずつ安全（巻き添えも受けない）。

### 3.3 座席と［切替］（U1・U4。凍結の core と既存の自艇の仕組みをそのまま使う要）
- 世界の自艇（`MissionWorld.boat` の `PlayerBoat`・`damage`・`params`・`band`・`grounded`・`extinguishHeldS`）は **いま操作中の隊長艇の作業用の写し**（座席）。HUD の HP・乗員・火災・機関・兵装・対空・帰投の判定・240 秒の後の §2 の 4 機は、今までどおり座席を読む＝**操作中の隊長艇の状態が HUD に出る**。
- 写し方（確保なし。値の代入だけ。`core/evac-seat.ts`）:
  - 入れる（切替・隊長艇の交代の時だけ）: 記録 → 座席（BoatState 4 値・DamageState 3 値・band・`BoatDamage.syncEngine(engineDamaged)`（新しい 3 行の関数: 最高速・巡航を基準 × 係数に戻す）・`fireReason` 初期化・`extinguishHeldS` 0）。
  - 出す（毎ステップ）: 位置は `stepPlayerBoat` の直後、被害は空襲の段の最後に 座席 → 記録。
  - 編隊が狙うのは**記録の `BoatState`**（座席ではない）＝切り替えても機が別の隊へ飛ばない。
- **［切替］**（右端の縦一列の段 3。§9）: タップで次の隊へ。次の隊の決め方（タップの瞬間。乱数なし）:
  1. 狙われている隊（予告の後・その編隊が去る前）のうち操作中でない隊、隊番号の順
  2. 無ければ、隠れていない隊（`G_GONE`・`G_HIDDEN` 以外）を今の隊の次から番号順
  3. 無ければ、隠れている隊を今の隊の次から番号順
  4. 無ければ切り替えない（ボタンは灰色）
  ボタンの下に次の隊の番号「→4」を出す（変わったときだけ setText）。カメラは座席の絵を今までどおり追う（隊の間を流れて移る）。
- 切替は**フレームの入力の消費で**（`systems/world-input.ts`。固定ステップの外・`stepPlayerBoat` の前）＝その フレームの最初のステップから新しい隊長艇にスティックが効く。模擬も記録した入力の再生もフレームの頭で切り替える（M6）。
- 操作をやめた隊: `G_UNDERWAY` ならその瞬間から §3.5 のランダム回避、`G_ENTERING`・`G_HAULING` なら残りを自動で済ませる（すでに出した命令。U3 の「自分では隠れに行かない」と矛盾しない）、`G_HIDDEN` はそのまま隠れる。
- **操作中の隊長艇が沈む（決着の前）**: `BoatDamage.sink` に jp_03 だけの振り替え（`divert`。null なら今のまま）を足す。振り替えは「ほかに浮いている艇が 1 隻でもいる」とき: 記録を沈没（HP 0）にし、その艇の絵が沈む（§11 の絵の作法）、隊に浮いている艇があればその艇が隊長艇（操作はその隊のまま）、無ければ §3.3 の順で次の隊へ自動で切り替え、座席に入れる。`sink` は false を返す（**命中スローを掛けない**＝M1 の直し: 決着の前の jp_03 には命中スローが 1 回も無い）。終わりの判定（`onBoatSinking`・`onBoatSunk`）は呼ばない。ほかに浮いている艇が無い時だけ今までどおり沈んで終わる。
- **決着（240 秒）の後**: 切替はできない（灰色「空襲が去った」）。振り替えもしない（座席が沈めば今の任務と同じく沈没で終わる）。

### 3.4 僚艇の追従と機銃（U1・U2）
- 僚艇 1 は隊長艇の、僚艇 2 は僚艇 1 の（沈んでいれば隊長艇の）艇尾 `follow.gap_m` 40 m に付く縦列。`core/escort.ts` の `stepEscort` をそのまま使う（定位置＝艇尾 40 m・横 0、遅れれば `catch_up_gain_per_s` で増速、`heading_deadband_m`）。40 m は爆風 25 ＋ 半長 9 ＝ 34 m より広い＝**隊長艇に真上から当たった 1 発は僚艇を巻き込まない**が、散布（半径 45 m）で巻き添えはある（V-E7）。
- 前の艇が止まれば定位置で止まる。全速では少し伸びる（同じ艇なので追い付けない。旋回で詰まる）。
- `G_ENTERING`: 僚艇は輪の中の枠の点（隊長艇の点から ±25 m 横）へ `steerShip` で寄り、5 m 以内で止まる。
- **機銃**（U2）: 操作中の隊長艇が機銃を撃つと僚艇も撃つ。対空の発の速さと弾倉を隊の浮いている隻数 n（1〜3）倍にした砲の値（起動時に n = 1・2・3 の 3 通りを作って選ぶ。確保なし）で、乱数は今の seed+24 から 1 発 1 回（ほかの任務は n = 1 で同じ値・同じ引く回数）。撃墜の確率・射程・死角・弾倉交換 3.2 秒は v0.6.8 のまま。曳光弾の絵は隊長艇からだけ（§7 の性能）。
- **閃光**: 撃てば（兵装の閃光の間 = `arms` の今の閃光の距離 `gun_battery.muzzle_flash_reveal_m` 1,200 m）その距離の内の陰に隠れている隊は**見つかる**（乱数なし）。座席の隊が隠れている間は撃てない（`atHome` で兵装が止まる今の規則）。HUD に 1 回だけ「撃てば屋我地の陰の艇も見つかる」。

### 3.5 操作していない隊（U3。乱数は seed+30 と +31）
- **離岸**: 0 秒に 6 隊それぞれ seed+30 から 1 回（計 6 回固定）引いた `ai.cast_off_s`（5〜20 秒の一様）の後、停泊している操作していない隊は岸を離れ `G_UNDERWAY` になる。操作中の隊は離岸しない（プレイヤーがスティックを倒すまで停泊）。
- **ランダム回避**（`G_UNDERWAY` の操作していない隊の隊長艇）: 時計の `ai.pick_s` 5 秒ごとに、**6 隊すべてが隊番号の順に seed+30 から 2 回ずつ引く**（隠れていても、沈んでいても、操作中でも引く＝引く回数は時計だけで決まる。M3 の作法）。使う隊だけ:
  - 針路 = 今の針路 + (2u₁ − 1) × `ai.turn_max_deg` 120°。先 `ai.look_m` 400 m の点が海域の縁から `ai.wall_m` 200 m の内側の箱の外なら、港の中心への方位 + (2u₁ − 1) × 45°。
  - 速さ = 狙われている（予告の後・編隊が去る前）か u₂ < `ai.full_p` 0.5 なら全速、それ以外は巡航（20 kt）。
  - 運動は自艇と同じ `stepBoat`（入力 {headingDeg, speed01}・その艇の `BoatParams` の写し）。隠れ場所には自分では入らない。撃たない（A10）。
- **爆撃から逃げる**: どの編隊でも投下（`AS_EV_RELEASE`）ごとに seed+31 から必ず 1 回引く（編隊の番号順。中心が座席でも引く）。中心が操作していない `G_UNDERWAY` の隊長艇で u < `ai.dodge.success` 0.5 なら、今の旋回の逆へ `ai.dodge.turn_deg` 90° 切って全速を `ai.dodge.hold_s` 2 秒（その間の §3.5 の選びは引くが使わない）。M2: S1 の tests で「回避あり／なしの 1 発の命中率の差」を出し、5 点未満なら回避をつまみから外す（引く回数は残す）。
- **見つかった陰の隊**（`G_FOUND`）: 操作していなければ `ai.found_react_s` 3 秒後に陰を出て `G_UNDERWAY`（U3 の文どおり「隠れていない隊は回避」。枠は空く）。操作中なら、プレイヤーが動かすまで止まって見えている。

### 3.6 隠れ場所（隊ごと・枠・レール・出る・見つかる）
- **入る**: 操作中の隊長艇が輪の中で `hide_max_kt` 2 kt 以下になり、その場所の空き枠 ≥ 隊の浮いている隻数 なら `G_ENTERING`（枠をその隊に取っておく＝ほかの隊と取り合わない）。足りなければ HUD「満杯」で何も起きない。**決着の後は枠を数えない**（§3.8）。
- `G_ENTERING` の間に隊長艇が `hide_max_kt` を超えたら取りやめ（枠を返して `G_UNDERWAY`）。僚艇が全部枠の点に着いて止まれば: 陰は `G_HIDDEN`、壕は `G_HAULING`。
- **壕のレールは 1 本**（H3 の直し）: 僚艇の番号の大きい順に 1 隻ずつ `haul_s` 6 秒で上げ、**隊長艇は最後**（M5 の直し: 狙いの中心＝隊長艇がいちばん長く外にいるので、隊が全部入るまで編隊は狙い続ける）。上げている艇と待つ艇は止まって見えている（巻き添えも受ける）。上げ終えた艇（`up`）は安全。3 隻で 18 秒。上げている間、座席は止めて動かない（`stepPlayerBoat` の後でその点に戻す。HUD「レールで上げている 2/3」）。
- **出る**: 操作中の隊が隠れている時、スティックを `launch_stick` 0.3 以上倒すと出る。壕はすぐ全員が入口の点に戻り（下ろすのは速い＝design）艇首は北、陰はそのまま走り出せばよい。枠は空く。
- **見つかる**（陰だけ。壕は見つからない）: 予告の瞬間に陰 2 か所ぶん seed+29 から毎回 2 回引く（隠れている隊がいなくても引く）。確率 `cover_reveal_chance` 0.25（ハード 0.35）。見つかった隊は `G_FOUND`（見えている・止まっている）。閃光でも見つかる（§3.4）。

### 3.7 空襲の波（U5。凍結の core は 1 バイトも変えない）
- **波**（data `evac_raid.waves`）: 予告 t 15・70・125・180 秒、1 編隊の機数 2・3・3・4。**同時に来る編隊の数** ノーマル 2・ハード 3（`evac_raid.flights` / `hard.evac_flights`）。1 機 2 発（`us_carrier_aircraft`）。ノーマル延べ 24 機・48 発、ハード 36 機・72 発。同時の最大はハードの第 4 波の 3 編隊 × 4 機 = 12 機（240 秒の後の §2 の 4 機とは時間が重ならない: 第 4 波は 220 秒ごろに去り終わる）。
- **編隊 = `AirStrikeFlight`（凍結）1 つ**。凍結の core は機数を作る時に決める（`createAirStrike(p)` が `p.planes` 機ぶんの状態と絵を作る）ので、波ごとに機数の違う編隊は使い回せない → **（波 × 枠）ごとに 1 つ、起動時にすべて作る**（ノーマル 8・ハード 12。1 つは 1 回だけ飛ぶ）。値は `airStrikeParamsFromData(aircraft, {id: 'unten_air_raid', params: sortie}, {aircraft_id, count: 機数, from_bearing_deg, escort_target_planes: []}, …)` を機数 2・3・4 の 3 通りだけ起動時に作り、同じ機数の編隊で共有（読むだけ）。
- **予告**（t = `announce_s`。この順で同じステップに。M4）: (1) 陰の発見 2 回（seed+29）→ (2) 狙いを選ぶ（下）→ (3) HUD の予告・赤い輪。予告から `announce_lead_s` 10 秒で編隊が始まり、約 10.6 秒後（`first_run_s` 9 ＋ 爆撃進路 1.6）に最初の投下、以後 2.2 秒ごと（2 機 4 発で最後の投下は始まりから 17.2 秒、4 機 8 発で 26.0 秒）。**予告から最初の投下まで約 21 秒**が、隠す・切り替えて逃がす時間。
- **狙い（予告の瞬間に決める。乱数なし）**:
  - 候補 = 隠れていない隊（`G_MOORED`・`G_UNDERWAY`・`G_ENTERING`・`G_HAULING`・`G_FOUND`）。段 A＝止まっている隊（`G_MOORED`・`G_ENTERING`・`G_HAULING`・`G_FOUND`）、段 B＝走っている隊（`G_UNDERWAY`）。
  - **枠 0 の編隊 = 操作中の隊**（隠れていなければ。段によらない）。U5「自身が操作している隊は敵の 1 編隊の攻撃をかわしつつ退避」。
  - ほかの枠 = 残りの候補から、段 A を先・同じ段は**その枠の現れる点**（港の中心 (1600, 625) から方位 `from_bearing_deg` 70 ＋ `flight_offsets_deg[枠]`（−30・0・30）・`spawn_m` 2,500 m の点）に近い順（距離の 2 乗。同じなら隊番号の小さい順）。
  - 1 つの隊を狙う編隊は 1 波で `flights_per_group_max` 1 まで（L7: 段をまたいで隊で数える）。候補が尽きた枠の編隊は来ない（HUD「1編隊は目標なし」）。操作中の隊が隠れていれば枠 0 もほかの枠と同じ選び方。
  - 枠 i の編隊は、始まる時に**狙った隊のその時の隊長艇**を中心に `restartAirSortie(state, p, 中心, 70 + offset[i], spawn_m, base)`（`core/air-sortie.ts`。凍結でない・編集もしない）。機は中心の方位 70 ± 30° から来る＝予告の「東から」と合う（L5）。
- **始まる時に狙いが隠れていた・全滅していた**: その編隊は始めない（「第4隊を見失った！ 3機が引き返す」／全滅は文なし）。
- **偽の view**（編隊ごとに起動時に 1 つ確保して中身だけ書き換える）: `{boat: {state: 中心の記録の BoatState, sinking: 中心の記録の sunk}, atHome: 隊が隠れた ‖ 決着 ‖ 済み, grounded: false, escort: null}`。
  - **済み**（B1 の直し）: `airSortieComplete(state)` が真になったステップの次から `atHome` を真のままにする＝凍結の core の段 6（`wave_rest_s` 後に同じ中心へ 2 波目）は `cancelled` で止まる。1 つの編隊は 1 回しか使わないので、立て直しも `restartAirSortie` の false の道も無い（新しい状態は空中に爆弾が無い。それでも false なら次のステップで試し直す道を残し、S2 の tests で固定）。
  - 隊が隠れた（予告の後・投下の途中）→ `atHome` 真 → core の `cancel` で引き返す（HUD・Result「見失わせた」）。途中で狙いを替えない（機の位置は中心からの相対）。中心が沈めば core の `cancel` で去る（隊長艇が替わっても追わない）。
- **着弾**（命中・外れとも。`systems/evac-flights.ts` の包みと `core/evac-hits.ts`）:
  - `onPlayerHit(x,y)`＝中心に当たった: 中心が座席の記録なら世界の `hitBoat(spec, その編隊の rng, x, y, 'air_strike')`、操作していない隊長艇なら記録に `applyShellHit`（同じ rng）、僚艇（隊長艇がまだ替わっていない時に中心になることは無い）は HP だけ。
  - 巻き添え: 浮いていて `up` でなく隊が隠れていない全艇（中心は除く）に `pointNearBoat(x, y, 艇, 半長, 爆風 + 半幅)`（core/gunnery。2 乗の距離。着弾のステップだけ・最大 17 隻）。当たれば隊長艇は上と同じ、僚艇は HP だけ。順は隊番号・艇番号の順（乱数を引く順が決まる）。
  - **隠れた艇（隊が `G_HIDDEN`、`up`）は落下中の爆弾にも当たらない**（H2 の直し）。決着の後に落ちた爆弾は水柱だけ（残存の確定）。
  - 水柱は世界の `SplashPool`（共有 32）。
- 対空は**操作中の隊長艇から近い編隊から順に**機を入れ、`AA_MAX_TARGETS` 8 で打ち切る（240 秒の後は今までどおり §2 の 4 機が先）。撃墜は `core/air-down.ts` の `downStrikePlane`。出どころは新しい `AA_SRC_EVAC` 3、番号は 編隊 × 4 ＋ 機（M8）。
- 操作中の隊を狙う編隊の投下は、今の「爆弾投下！ 転舵！」を出す（`strikeThreat`（凍結の air-strike-pose。import だけ）を中心が座席の記録の編隊について読む。M7）。

### 3.8 終わり方（U6。CLAUDE.md §2「夜明け」の読み替え。新しい終わり方は作らない）
- **決着の前（0〜240 秒）は任務は終わらない**: 帰投・漂流・座礁で終えない（`evacHold`。jp_04 の `landingHold` の作法）。例外は 18 隻すべてが沈んだ時（最後の座席が今までどおり沈んで終わる）。
- `atHome`（座席の帰投）＝決着の前は**操作中の隊が `G_HIDDEN`**（`stepPlayerBoat` の後で jp_03 だけ書き換える。輪の判定 `insideRing` は使わない＝H1 の穴は jp_03 で起きない）。
- **決着 = `duration_s` 240**（`dawnReached(durationS, stepTimeS)` と同じ式・同じステップ）: 残存を確定（以後 隊の艇は傷を受けない。走っている編隊は `atHome` で去る）。今の夜明けのラッチがそのまま働く: 操作中の隊が隠れていれば帰投で終わる。外なら既存の `dawn_strike`（敵機 4 機・seed+19）が座席だけを追い、決着の後は**どの隠れ場所でも輪の中で `hide_max_kt` 以下になれば帰投**（枠もレールも数えない）。後で隠れれば帰投の点 × 0.9（`after_dawn_factor`）。座席が沈めば沈没で終わる（残存から 1 引く）。
- 海の色は最初から昼（`world-dawn.ts` に opt-in `day_start`。`durationS 0` の小細工はしない）。

### 3.9 燃料（B2 の直し）
- `fuel_free_until_s` 240（新しい opt-in の鍵。`stepPlayerBoat` は `stepTimeS ≥ fuelFreeUntilS` のときだけ `stepFuel`。鍵の無い任務は 0＝今と同じ）＝空襲の間は燃料を数えない（U4）。
- 割当 `fuel_allotment_gal` 16（T-38 のアイドル 9.4118 gal/h: 16 / 9.4118 × 720 = 1,224 秒 ＋ 240 ＝ 1,464 秒 < 1,500 秒。`tests/dawn-air.test.ts` の「止まって待つと 1,500 秒未満で漂流」は `fuel_free_until_s` を足して測るように直す）。決着の後は全速 57 秒・巡航 123 秒＝どの隠れ場所にも届く（港の端から端 45 秒）。

### 3.10 点（`scoring.json`）
- 帰投 700（今のまま）。達成 `objective_by_type.evacuate_under_air_raid` 300 = 帰投と同じに数える終わりで残存（座席の艇を含む・18 中）≥ `survivor_quota` 6。
- `evac.points_per_survivor` 30 × （残存 − 1）（座席の艇は帰投の 700 で数える。大発の `points_per_arrival` の作法）。最大 17 × 30 = 510 < 700＝「残して死ぬより隠れて帰る方が上」を tests で固定。
- 見失わせた編隊・撃墜に点は付けない（文だけ）。燃料・乗員の点は今までどおり。

## 4. data の鍵（値・source）

missions_seed `jp_03`（本体の `hazards`・`success` は設計の記録としてそのまま）:

| 鍵 | 値 | source |
|---|---|---|
| `playable_from` | `"v0.6.11"`（**S6 で付ける**） | design |
| `briefing_note_ja` | 「1944年10月10日、米空母部隊の艦載機が朝から夕方まで沖縄を5回空襲した（延べ約1,400機）。運天港の第27魚雷艇隊は18隻のうち13隻を失った。港には艇を隠す壕と、海から壕へ上げるレールがあった。」 | historical（A2・A7・A16。抜粋のみ・本文未読） |
| `moon_label_ja` | 「昼（07:00 空襲警報）」 | historical（A8）/ design |
| `v0_1_prototype.enemies` | `["us_carrier_aircraft"]` | design |
| `.main_weapon` | `"none"`（jp_02 と同じ。兵装の位置は §2 で固定） | design |
| `.duration_s` / `.fuel_allotment_gal` / `.fuel_free_until_s` | 240 / 16 / 240 | design（§3.9） |
| `.day_start` | `true`（海の色と時計の言葉を昼に。§10.3） | design |
| `.bounds_m` | `{width 3200, height 1250}` | design（北の縁＝屋我地島の岸） |
| `.player_start` | `{x_m 1450, y_m 1000, heading_deg 90}`（第1隊の隊長艇と同じ） | design |
| `.return_point` | `{x_m 1600, y_m 1150, radius_m 70, label_ja "隊長艇の壕", call_margin 1.5, torpedo_settle_max_s 10, torpedo_end_settle_s 5}` | historical（壕）/ design |
| `.shallows` | `[]` | design（§3.1） |
| `.coast` | `{side "south", land_m 400, label_ja "本部半島（運天）"}` | historical（位置関係）/ design（寸法） |
| `.hazards` | `["unten_air_raid","dawn_air_strike"]`（`harbor_fire_explosion`・`grounding` は入れない） | design |
| `.dawn_strike` | `{aircraft_id "us_carrier_aircraft", count 4, from_bearing_deg 70, escort_target_planes []}` | design（§2 の検査が要る） |
| `.evac` | 下の表 | 各 `*_source` |
| `.evac_raid` | 下の表 | 各 `*_source` |
| `.hard` | `{evac_flights 3, evac_cover_reveal_chance 0.35, objective_ja / success_ja / note_ja（ハードの Briefing の文）}` | design（ユーザーの U5「ハードは×3」） |

`.evac`（design。18 隻だけ historical）:

| 鍵 | 値 | 意味 |
|---|---|---|
| `boat` | `"jp_t38"` | 全隻 T-38（hist B: 艇種は不明＝design） |
| `label_ja` | `"第27魚雷艇隊"` | |
| `group_size` / `start_group` | 3 / 1 | 6 隊 × 3＝18（historical の 18 を design で 6 つに分けた） |
| `groups` | §3.1 の表（`id, label_ja "第1隊", place_ja, x_m, y_m, heading_deg`） | |
| `moored_gap_m` | 12 | 停泊の縦列の間隔（< 爆風） |
| `follow` | `{gap_m 40, catch_up_gain_per_s 0.08, heading_deadband_m 15}` | 縦列（us_01 の escort と同じ増速・不感帯） |
| `shelter_ring_m` / `hide_max_kt` / `haul_s` / `launch_stick` / `slot_abeam_m` | 70 / 2 / 6 / 0.3 / 25 | §3.6（秒は実秒） |
| `shelters` | §3.1 の表（`id, label_ja, kind "cave"|"cover", x_m, y_m, slots`）、`cave_source`「壕とレールの存在は historical（A16・A17、抜粋のみ）。数・枠・位置・レール 1 本は design」、`cover_source`「design（史実の裏付け無し）」 | |
| `ai` | `{cast_off_s [5, 20], pick_s 5, turn_max_deg 120, full_p 0.5, wall_m 200, look_m 400, found_react_s 3, dodge {success 0.5, turn_deg 90, hold_s 2}}` | §3.5（秒は実秒、速さは kt で core/units が変換） |
| `flash_reveal` | `true`（閃光の距離は `gun_battery.muzzle_flash_reveal_m`。v0.6.8 のまま） | §3.4 |

`.evac_raid`（design。`historical_survivors` 5・`survivors_total` 18 は historical）:

| 鍵 | 値 |
|---|---|
| `waves` | `[{announce_s 15, planes 2}, {70, 3}, {125, 3}, {180, 4}]`（U5） |
| `flights` | 2（U5。ハードは `hard.evac_flights` 3） |
| `announce_lead_s` | 10 |
| `from_bearing_deg` / `flight_offsets_deg` / `spawn_m` | 70 / `[-30, 0, 30]` / 2500 |
| `flights_per_group_max` | 1 |
| `cover_reveal_chance` | 0.25 |
| `survivor_quota` / `survivors_total` / `historical_survivors` | 6 / 18 / 5 |
| `north_shore_label_ja` | `"屋我地島"` |

ほかの data:

| ファイル・鍵 | 値 | source |
|---|---|---|
| risk_events `unten_air_raid` | `label_ja`「港の空襲（任務の最初から、予告の後に艦載機の編隊が別々の隊を狙う）」、`count 0`・`share 0`・`enemy_direct true`・`trigger`・`game_event`・`counterplay`・`penalty`・`version "v0.6.11"`（L3。`patrol_air` の前例）、`params.sortie {spawn_m 2500, run_radius_m 500, first_run_s 9, run_gap_s 2.2, wave_rest_s 16, leave_s 2.5, spawn_offsets_deg [-30,-10,10,30], wave_rotate_deg 0, aim_turn_min_deg_s 0.5}`。`total_losses` などの合計は変えない | design |
| scoring `objective_by_type.evacuate_under_air_raid` | 300 | design |
| scoring `evac.points_per_survivor` | 30 | design |
| hit_rate_model `visibility.moon_factor.day` | 1.0（艦の無い任務なので効かない。鍵があることだけが要る。setup の snapshot は選んだ値しか持たない＝中立） | design |

`risk_events.dawn_air_strike.params`・`us_carrier_aircraft`・`jp_t38` は**触らない**（共有）。

## 5. 起動時の検査（新しい `config/evac-mission-data.ts`。例外は鍵を名指す日本語。`patrol-air-mission-data.ts` の型）
- V-E1 隠れ場所・停泊地（僚艇の縦列込み）が海域の内（縁から `boundsMarginM` 以上）
- V-E2 停泊地のどの艇も、どの隠れ場所の輪の縁からも 20 m 以上外（H1）
- V-E3 隠れ場所どうしの中心が 2 × 輪 + 100 m 以上離れる
- V-E4 枠の合計 < 18（最低 1 隊は隠せない）、どの枠も ≥ `group_size`（満員の隊が 1 つ入る）
- V-E5 1 編隊 1〜4 機（凍結の上限）、同時の編隊 ≤ `EVAC_MAX_FLIGHTS` 3（ハード込み）≤ `flight_offsets_deg` の長さ、`flights_per_group_max` ≥ 1
- V-E6 予告の間隔 ≥ `announce_lead_s` ＋ 最大機数の編隊の長さ（first_run ＋ 爆撃進路 ＋ (機 × 2 − 1) × gap ＋ 落下 ＋ leave ＋ 余裕 5 秒）、最後の波の終わり < `duration_s`（決着の時に evac の爆弾が空中に無い）
- V-E7 `follow.gap_m` > 爆風 ＋ 半長、`moored_gap_m` < 爆風
- V-E8 `return_point` が `home_cave` と同じ点・半径 = `shelter_ring_m`
- V-E9 `group_size × groups の数` = `survivors_total` 18、`survivor_quota` ≤ 18
- V-E10 `fuel_free_until_s` = `duration_s`、割当で `fuel_free_until_s ＋ アイドルで尽きる秒 ＋ 1.5 < 1,500`
- V-E11 T-38 に煙幕が無く、任務に味方機（識別）が無い（右端の段 3 を［切替］が使う。jp_04 V12 の作法）
- V-E12 確率は [0, 1]、`pick_s`・`haul_s` > 0、`cast_off_s` は [小, 大]
- `evac` の無い任務は `evacSetupPart` が `{}` を返す（setup の snapshot が同じ＝`patrolAirSetupPart` の作法）。`fuelFreeUntilS`・`dayStart` も `evac` の部分の中（ほかの任務の setup に鍵が増えない）。
- `config/mission-data.ts` の「昼は v0.6 で扱う」は `day` を通すだけ（1 行）。

## 6. 凍結の core を変えずに使う（凍結 20 本は sha256 で不変）
- 使う凍結のファイル（import だけ）: `core/air-strike.ts`・`air-strike-state.ts`・`air-strike-pose.ts`・`air-strike-data.ts`・`systems/air-strike-flight.ts`（`AirStrikeFlight`）。使わない: `core/air-strike-sim.ts`（1 隻用）、`systems/torpedo-pool.ts`（魚雷は座席の 2 本のまま＝§17）。
- 開始は `core/air-sortie.ts` の `restartAirSortie`・済みは `airSortieComplete`（凍結でない・編集もしない）。
- 編隊ごとの乱数の系列は `new SeededRng(seed + 32 + 波 × 3 + 枠)`（投下の散布 2 回と、隊長艇に当たった時の火災・機関。夜明けと同じ作法）。
- 新しい Phaser 非依存の模擬は `stepAirStrike`・`restartAirSortie` を直接呼ぶ（`core/patrol-air-sim.ts` の型）。

## 7. 乱数の系列（+29 以上は空き＝grep で確認。+21 は予約のまま）

| 系列 | 用途 | 引く回数 |
|---|---|---|
| seed+29 `EVAC_SEED_OFFSET` | 予告ごとに陰の発見 2 回（陰の順） | 予告ごとに 2（固定） |
| seed+30 `EVAC_AI_SEED_OFFSET` | 0 秒の離岸 6 回、`pick_s` ごとに 6 隊 × 2 回（決着まで） | 時計だけで決まる |
| seed+31 `EVAC_DODGE_SEED_OFFSET` | 投下ごとに 1 回（編隊の番号順） | 投下の数（世界と模擬で同じ） |
| seed+32〜+43 `EVAC_FLIGHT_SEED_OFFSET` + 波 × 3 + 枠 | 編隊の散布・隊長艇への命中の火災と機関（巻き添えも同じ系列） | 凍結の core と `applyShellHit` のまま |
| seed+19 | 240 秒の後の §2 の敵機 4 機（既存） | 既存 |
| seed+24 | 対空（既存。僚艇の発も同じ系列に 1 発 1 回） | 押した発の数 |
| 模擬だけ | 人の方針の揺らぎ（seed × MUL + ADD。`core/landing-sim-policy.ts` の作法） | — |

定数は `core/evac-data.ts`。系列の一覧のコメント（`core/air-strike-state.ts` は凍結なので触らず、`core/night.ts` 等の一覧）に追記。門の文は「新しい系列は +29〜+43 だけ。既存の系列の引く回数はほかの任務で同じ」（M3）。

## 8. 固定ステップの順（世界＝模擬。M6）
フレーム: 入力の消費（［切替］はここで座席を入れ替える）→ 固定ステップ × n → 見た目。
`mission-world.ts` の `stepFn`（足すのは 2 行。ほかに欄 1 行・生成 1 行＝計 4 行で 277 行）:
1. 時計 → 夜明けのラッチ（今のまま。jp_03 では決着のラッチと同じ式）
2. 乗員の倍率 → `stepPlayerBoat`（座席。燃料は §3.9）
3. **`this.evac?.stepBoats(dt)`**: 座席の位置を記録へ → 座席を止める（`G_ENTERING` の後・`G_HAULING`・`G_HIDDEN`）→ 出る（スティック）→ 操作していない隊長艇の離岸・ランダム回避・回避の保持 → 僚艇の追従 → 隠れ場所（入る・上げる・隠れる・見つかった後の離脱）→ `atHome` を書き換え
4. 帯 → 敵の側（`stepEnemySide`。この中の兵装 `arms.stepAir` が対空。対空の枠に evac の編隊を入れる）→ 座席の火災 `stepDamage`
5. **`this.evac?.stepAir(feelDt)`**: 閃光で陰 → 決着のラッチ → 予告（陰の発見 → 狙い）→ 始まる編隊の `restartAirSortie` → 偽の view を書いて編隊を番号順に `step`（投下で seed+31・着弾で中心と巻き添え）→ 操作していない隊長艇の火災 `stepDamage` → 沈没と隊長艇の交代（座席の振り替えはここで完了）→ 座席の被害を記録へ
6. `this.dawn.step`（240 秒の後の §2 の 4 機。今のまま最後）

模擬（`core/evac-sim.ts`）も同じ順。`tests/evac-step-order.test.ts`（`patrol-step-order.test.ts` の作法）で固定。

## 9. iPhone の操作
- 左下のスティック: 操作中の隊長艇を動かす（今までどおり）。僚艇は自動で続く。
- 右下の兵装（角が魚雷＝狙う艦なし・その左が機銃＝対空）: 今までどおり。機銃は僚艇も撃つ。
- **右端の縦一列の段 3（識別の段・y 404）に［切替］**（T-38 は煙幕なし・jp_03 に識別なし。V-E11）。段 3 は技能でいちばん下＝右の親指に近い。タップだけ（長押しなし）。下に次の隊「→4」。切り替える先が無い・決着の後は灰色。`SKILL_ORDER` の段は変えず、種類 `switch` を `evac` のある任務だけに足す（ほかの任務の配置は 1 px も変わらない。配置の固定 tests で確かめる）。`InputState.switchTap`（消費して false。`createInputState`・`resetInput` に足し、`discardFireInput` は触らない）。
- 段 1 の［消火］は操作中の隊長艇の火（燃えている別の隊へ切り替えてから押す）。段 2 の見張り（長押し）で港全体。
- 地図を叩く命令・隊を選ぶ一覧・行き先を選ぶ画面は作らない。

## 10. 画面の文（1 行 ≤ 840 px。見積もりは tests/pt-ui-kit の `textWidthPx`（22 px・U+2000 未満は 0.602 em）。下の px はその式で測った値）

### 10.1 HUD 2 行目（上中央。jp_03 のモード。値が変わったときだけ setText。M13: `ui/mission-line.ts` L233 の `landingLine(…)` を新しい `specialLine(t, mode, clock)`（揚陸と jp_03 を振り分ける。新しいモジュール）に置き換える＝差し引き 0 行。モードは 38 から）
上ほど優先:

| モード | 文の例 | px |
|---|---|---|
| 操作中の隊へ爆弾が落下中 | 「爆弾投下！ 転舵！」（今の文） | 189 |
| 予告（予告から始まりまで。中央の帯 2 秒も） | 「第4波 4機×3 東から ・ 狙い 第1隊（操作中）、第4隊、第6隊」／「第2波 3機×2 東から ・ 狙い 第4隊、第5隊 ・ 第1隊は隠れている」／末尾「・ 1編隊は目標なし」 | 643 / 691 / 最長 779 |
| 見失わせた | 「第4隊を見失った！ 3機が引き返す」 | 348 |
| 沈没 | 「隊長艇 沈没！ 僚艇に乗り移った（残存 14）」／「第2隊の隊長艇 沈没 ・ 僚艇が隊長艇に（残存 14）」／「第5隊の僚艇 沈没（残存 13）」／「第2隊 全滅（残存 11）」 | 462 / 533 / 308 / 242 |
| 陰が見つかった | 「屋我地の陰（東）が見つかった！ 第4隊を動かせ」 | 488 |
| 満杯 | 「屋我地の陰（西）は満杯（空き 1 ・ 第3隊は 3 隻）」 | 546 |
| 上げている | 「西の壕 レールで上げている 2/3 ・ 隊長艇は最後 ・ 止まった艇は狙われる」 | 779 |
| 隠れた | 「第3隊 屋我地の陰（東）に隠れた ・ ［切替］で次の隊へ」 | 581 |
| ほかの隊長艇の火災 | 「第5隊の隊長艇が燃えている ・ 切り替えて消火」 | 480 |
| 機銃（1 回だけ） | 「撃てば屋我地の陰の艇も見つかる ・ 僚艇も撃つ（3隻で対空）」 | 634 |
| 隠れて待つ | 「第1隊 隊長艇の壕で待機 ・ 空襲が去るまで 1:05 ・ 倒すと出る」 | 674 |
| 隠れる所が無い | 「隠れる所が無い ・ 切り替えてほかの隊を見よ」 | 466 |
| 平常 | 「第3隊を操作中 ・ 近い隠れ場所 屋我地の陰（西）空き 3 ・ 1420 m」（距離は 20 m 刻みで変わったときだけ） | 713 |
| 240 秒 | 「第1次の空襲が去った ・ 残存 8 で確定」→ 外なら「第3隊を壕か陰へ（敵機 4 機が追う）・ 屋我地の陰（西）1420 m」 | 409 / 674 |

- jp_03 の 2 行目の全文に「夜明け」が無い（H6。tests で全モードを組んで確かめる）。帰投の呼びかけ（`CALL_DAWN`・`CALL_FUEL`）は jp_03 の特別の行が上に立つので出ない。

### 10.2 HUD 3 行目（jp_03 だけの新しい Text 1 個。2 行目の 1 段下。値が変わったときだけ）
- 「第3隊 HP 60・60・60 ・ 残存 18／18 ・ 隠れた 15 ・ 次の波 0:18」（749 px）／沈んだ艇は「沈」、最後の波の後は「波はもう無い」（731 px）。
- 左上の HP バー・乗員・火災・機関の表示は座席＝操作中の隊長艇（今のまま）。

### 10.3 昼の言い方（H6。`day_start` の任務だけ。ほかの任務はバイト同一＝`air-lines-neutral`・`result-body-neutral`・`dawn-lines` の tests）
- 左上 2 段目の時計（`ui/dawn-clock`）: 「空襲が去るまで 1:35」／後は「空襲が去った後 0:12」（各 220 px。時計の幅の上限の内）
- 240 秒の中央の帯: 「第1次の空襲が去った」（今の「夜明け — 空襲」の代わり）
- Result の時の行: 「空襲が去る時: 西の壕の中（第1隊）」／「空襲が去る時: 外（第3隊）・ 後で隠れた」

### 10.4 地図の上（Text は 11 個だけ。§11）
- 隊の番号「1」〜「6」を隊長艇の上に（6 個。位置は毎フレーム、色は段階が変わったときだけ: 灰＝停泊・白＝走る・暗い緑＝隠れた・黄＝見つかった・赤＝狙われている・×＝全滅。操作中は太い白）。ズームが変わった時だけ `setScale(1/zoom)`（L4: 見張り 0.5 でも画面上 24 px 以上）。
- 隠れ場所の札「西の壕 3/3」「屋我地の陰（東）2/3」（5 個。変わったときだけ）。
- 輪（起動時に `generateTexture` した Image）: 隠れ場所 5・狙われた隊の赤い輪 ≤ 3（隊長艇を追う）・操作中の白い輪 1・見つかった陰の黄の輪 ≤ 2・画面の外の狙われた隊の端の矢印 ≤ 3（既存の `ui/edge-marker`）＋最寄りの空いた隠れ場所の矢印 1。

### 10.5 Briefing（既存の Briefing の行幅の内。S6 の tests で幅を測る）
- 目的「空襲の下、3隻ずつ6つの隊を壕や陰へ隠せ。残った数で評価」
- 成功「18隻中6隻以上を残し、操作中の隊を隠れ場所へ（史実は5隻）」
- 時「昼（07:00 空襲警報）」／敵「米艦載機 ・ 東から4波（2機の編隊×2 → 4機の編隊×2）」（ハード「…×3」）
- 操作「スティックで隊長艇を動かすと僚艇2隻が続く ・ ［切替］で操る隊を替える ・ 機銃は僚艇も撃つ」
- 隠れ場所「壕は止まると1隻ずつレールで上げる（隊長艇は最後）・ 陰は止まれば隠れるが見つかることがある ・ 15隻分しかない」
- 予告「狙われた隊に赤い輪 ・ 操作中の隊に1編隊、ほかの編隊はほかの隊へ ・ 操作しない隊は逃げ回るだけ」
- 危険「止まった艇から狙われる ・ 並んだ艇は1発で何隻も燃える ・ 隊長艇が沈めば僚艇が隊長艇に」
- 史実の行（`briefing_note_ja`）＋「屋我地の陰と隊の分け方は作り（史料に無い）」

### 10.6 Result（`ui/evac-result.ts`。見出しは終わりの理由の今の表＋jp_03 の帰投は「退避完了」）
- 「残存 8／18（史実 5）」（233 px）
- 「壕 6 ・ 陰 2 ・ 外 0 ／ 沈没 10」（375 px）・「隊ごと 3・2・0・1・2・0」（269 px）
- 「見失わせた編隊 3／来た 7 ・ 撃墜 1 機」（427 px。分母は来た編隊＝L1）
- 時の行（§10.3）
- 達成「6隻以上を残して隠れた」／未達「残存 4 隻（6 隻以上で達成）」（379 px）
- 点の行「残った艇 7 隻 × 30」（216 px）

## 11. 性能の予算と測り方（CLAUDE.md §7。作る前に決める）

| 項目 | 予算（ハード第 4 波の最大） | 守り方 |
|---|---|---|
| 編隊 | 起動時に 12 個（ノーマル 8）。同時に動くのは ≤ 3（ほかは `step` も `updateVisuals` も呼ばない） | 状態・絵・view・乱数を起動時に確保。毎ステップは中身の書き換えだけ |
| 機・爆弾・輪の Image | 機 36・爆弾と着弾の輪 48・進路の線 12（ハード。ノーマル 24・32・8）。見えるのは ≤ 12・≤ 6・≤ 3 | `AirStrikeFlight` が作る（凍結）。隠れた Image は描かれない |
| 艇の Image | 18（隊の艇）＋座席 1。座席に入った艇の Image は隠す | 起動時。tint・alpha は段階が変わったときだけ。沈む絵は tween を使わず記録の沈んだ秒から scale・alpha（毎フレームの計算だけ） |
| Text | 隊の番号 6・隠れ場所の札 5・3 行目 1・［切替］の札 1＝13 | setText は前回値と比べて変わったときだけ |
| 輪・矢印・地形 | 約 20 Image・地形 約 10 Image | 起動時に `generateTexture`。毎フレーム `Graphics.clear()` しない |
| 1 ステップの計算 | 隊長艇 6 の `stepBoat`、僚艇 12 の `stepEscort`、編隊 ≤ 3 の `stepAirStrike`、着弾 ≤ 3 × 17 の `pointNearBoat`（2 乗の距離・着弾のステップだけ）、狙いは予告の瞬間だけ（≤ 6 隊 × 3 枠） | `filter`/`map`/リテラル/`new` 禁止。平方根は HUD の距離 1 本だけ |
| 対空 | 枠 8（`AA_MAX_TARGETS` は上げない）。編隊の中心の 2 乗の距離で ≤ 15 の番号を固定長の配列に挿入で並べ、近い順に機を入れる | 確保なし |
| 水柱 | 共有の `SPLASH_POOL_SIZE` 32（3 編隊 × 2.2 秒に 1 発 ＋ 巻き添えの水柱なし＝足りる） | 今のまま |
| ヒープ | 240 秒で段差なし・jp_04 の高さ ＋ 2 MB 以内 | 上の全部 |

**測り方（ヘッドレス。S7 で数を CHANGELOG に）**:
- 新しい `scripts/headless/evac-perf.mjs`（`lib.mjs` の偽の時計・1/60 固定ステップ・W 1280 と 1560）: jp_03 ハードを `stay` の台本（全部の隊が外＝第 4 波で 3 編隊が全部来る）で回し、t 190〜225 秒の各フレームの `updateFrame` の壁時計（`performance.now()` の差）の p50・p95・p99、`scene.children.length`（5 秒から 240 秒まで一定＝毎フレームの確保が無い）、1 秒あたりの `Text.setText` の回数（ページで数える）を出す。同じ台本で jp_04 ハードの第 2 波を基準として測る。
- 門: jp_03 の p95 ≤ jp_04 の p95 × 1.5、物の数が一定、setText ≤ 平均 10 回/秒。`heap.mjs` を `SECS=240` で jp_03 ハード（10 秒ごとの GC 後のヒープに 30 秒以降 1 MB を超える段差なし）。
- ヘッドレスの箱は iPhone ではないので数は相対。本当の値は iPhone の左上の FPS（§16 の 3）。

### 11.1 §7 の警告（実装の前に）
1. `update()` で確保しない: 狙いの候補・枠・偽の view 12・並べ替えの配列・巻き添えの走査・座席の写しはすべて起動時に固定長。狙いは予告の瞬間だけ選ぶ。
2. 艇ごとの Text を作らない（隊の番号 6 だけ）。
3. 輪・地形は起動時に `generateTexture`。点線は作らない。
4. 距離は 2 乗（隠れ場所の輪・狙いの順・巻き添え・対空の順）。
5. 固定ステップのまま（`fixedStep`）。隊の運動も m/s を dt で積分。
6. 端の矢印は狙われた隊だけ（≤ 3）＋隠れ場所 1。36 機ぶんの矢印は出さない。
7. tween は使わない（沈む絵・赤い輪の点滅は記録の秒から計算）。

## 12. 模擬・方針・帯・つまみ（人に近い行を主に＝v0.6.9/v0.6.10 の教訓）

### 12.1 作るもの
`core/evac-sim.ts`（任務の 1 本を最後まで。§8 の順。燃料・漂流・決着の後の 4 機・終わりの判定・消火・対空込み）＋ `core/evac-sim-policy.ts`（方針。人の揺らぎは別の乱数）＋ `core/evac-sim-cell.ts`（1 晩の記録）＋ `systems/evac-sim-setup.ts`（`buildWorldSetup` から）＋ `systems/evac-calibration.ts`（帯）＋ `scripts/evac-sim.ts`（N 400 × 2 組の seed（1〜400・1001〜1400）、`HARD=1`、`TABLE=1/2`、data のつまみの上書き）。世界と模擬は記録した入力（h・s・held に ［切替］`w`・消火 `x` を足す）の再生で差 0（`scripts/headless/world-vs-sim.mjs` に jp_03。決着の前は命中スローが無いので倍率の記録は要らない＝M1。S4 で `slowMoLeftS` を書く所を grep し、jp_03 で届くものが他にあれば jp_04 の `landing-replay` と同じく倍率を記録）。

### 12.2 人の揺らぎ（模擬の方針の共通の部品）
- 切り替えた後に動き出すまで 2〜6 秒、出来事（予告・隠れた・見つかった）への反応 5〜12 秒（`landing-sim-policy` と同じ幅）。
- 針路のぶれ ±10°、輪の手前で減速を始める距離の誤差 ±30%（行き過ぎたら戻る）。
- 操作中の隊への投下は 50% だけ「旋回中は逆へ」で避ける。火災は 1〜3 秒後に消火を押す。
- 隠れ場所は 80% で最寄りの入れる所、20% で 2 番目。

### 12.3 遊び方の行

| 行 | 中身 | 見るもの |
|---|---|---|
| **`seq`（主）** | 人: 操作中の隊を最寄りの入れる所へ隠し、止まって上げ始めたら［切替］（§3.3 の順）で次の隊へ。全部隠すか枠が尽きるまで。予告で狙われた隊が次の候補に来る | 主の帯（ユーザーの「急いで退避しつつ他の隊の面倒も見る」） |
| `seq_slow` | 人・遅い: 反応 4〜10 秒・巡航だけ・上げ終わるのを見届けてから切り替える | 遅い人でも遊べるか |
| `seq_cover` | 人: 陰を先に（速いが見つかる）、陰が埋まったら壕 | 陰と壕の釣り合い |
| `follow_ring` | HUD に従う人: 予告のたびに狙われた隊へ切り替えて逃がし、空けば隠す | 文と赤い輪が正しい手を教えるか |
| `seq_shoot` | seq ＋ 機が射程にいる間は機銃を押し続ける | 閃光で陰が見つかる罰と、僚艇の対空 |
| `own_only` | 自分の隊だけ隠して 240 秒まで待つ（切り替えない） | 史実（隊長艇の隊だけ残る）の近く |
| `dodge_only` | 隠さない。狙われた隊へ切り替えて避けるだけ | 回避だけが勝たないか |
| `fight` | 隠さない。操作中の隊を止めて撃ち続ける | 撃つだけが勝たないか |
| `stay` | 何もしない（停泊のまま・切り替えない） | 底 |
| `bot` | 最良の順（狙われた隊・止まった隊を先・近い所）・反応 0・回避 100% | 天井 |

### 12.4 帯（ノーマル。`tests/evac-sim-b.test.ts`。「残存」は座席の艇を含む 18 中＝L2、「達成」は帰投と同じに数える終わりで残存 ≥ 6）

| 行 | P(達成) | 残存の中央値 | ほか |
|---|---|---|---|
| **seq（主）** | **50〜70%** | 6〜9 | 漂流 ≤ 2% |
| seq_slow | 30〜60% かつ ≤ seq | 5〜8 | 漂流 ≤ 2% |
| seq_cover | seq ± 15 点 | — | |
| follow_ring | seq − 10 〜 seq ＋ 20 点 | — | 漂流 ≤ 2% |
| seq_shoot | seq − 25 〜 seq ＋ 5 点 | — | 撃墜の平均を表に |
| own_only | ≤ 25% | 3〜6 | |
| dodge_only | ≤ seq − 15 点 | — | |
| fight | ≤ 15% | — | |
| stay | ≤ 10% | ≤ 4 | |
| bot | ≥ 90% | ≥ 10 | 18 隻残るのは ≤ 10% |

ハード: seq 20〜45% かつ ≤ ノーマルの seq − 15 点、seq_slow ≤ seq、stay ≤ 3%、bot ≥ 60%。
表に一緒に出す（帯ではなく監視）: 枠が全部埋まった秒（M10）・見失わせた編隊／来た編隊・切替の回数・隊長艇の交代の回数・段 A／B ごとの沈没。

### 12.5 つまみの順（data だけ。変えたら CHANGELOG に理由）
1. `ai.full_p`・`ai.pick_s`（操作していない隊の逃げ方。いちばん効く）
2. `ai.dodge.success`（M2 で効かなければ飛ばす）
3. `haul_s`（壕の前で止まる長さ）
4. `cover_reveal_chance`（ノーマル・ハード）
5. `flights_per_group_max`（1 → 2。ハードだけでも）
6. 枠（陰を 3 → 2）
7. `announce_lead_s`（10 → 8）
8. `unten_air_raid.params.sortie` の `first_run_s`・`run_gap_s`（jp_03 専用）
9. `follow.gap_m`（縦列の巻き添え）
**動かさない**: 波の数 4・機数 2/3/3/4・同時の編隊 2/3（ユーザーの U5）、`us_carrier_aircraft` の値（共有）、ノルマ 6（U6）。帯が全部外れたら、S3 の最初の表と理由を書いてユーザーに 1 つだけ聞く（CLAUDE.md §6.7）。

## 13. 段（S0〜S8）— 各段の終わりに §14 の門 → commit（末尾に下の 2 行ちょうど）→ `git push origin claude/v0.6.11-next`（ネットワークの失敗は 2・4・8・16 秒で 4 回まで再試行）

commit の末尾（ちょうど この 2 行。ほかの署名・モデル名は書かない）:
```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FFamytCg2edHr8RBr7eBa7
```

| 段 | 中身（新＝新規） | tests | 追加の門 |
|---|---|---|---|
| **S0 data** | missions_seed jp_03 の `v0_1_prototype`（`evac`・`evac_raid`・`hard`。`playable_from` はまだ）・risk_events `unten_air_raid`・scoring 2 鍵・`moon_factor.day`・`mission-data.ts` の `day`・新 `config/evac-mission-data.ts`（読み＋V-E1〜V-E12＋`evacSetupPart`）・新 `core/evac-data.ts`（型・定数・系列）・`world-setup.ts` に 1 行 | 新 `tests/evac-mission-data.test.ts`（V ごとの文・既定の data が通る）・新 `tests/setup-jp03.test.ts`（新しい snapshot）・visibility / game-data の `day` | ほかの 8 任務の setup snapshot・g2 不変 |
| **S1 隊** | 新 `core/evac-squadron.ts`（記録・隊長艇＝最小の浮いている番号・段階・枠・入る/取りやめ/上げる（僚艇から・隊長艇は最後）/隠れる/出る・見つかった後の離脱・残存）・新 `core/evac-follow.ts`（`stepEscort` の縦列・枠の点へ寄る・離岸と回避 +30・逃げる +31）・新 `core/evac-seat.ts`（座席の写し・［切替］の順） | 新 `tests/evac-squadron.test.ts`（輪の縁ちょうど・2 kt ちょうど・枠が 1 足りない・取りやめで枠を返す・上げる順と 18 秒・隠れる前は全員が見えている・上げた艇は安全・交代で番号最小・残存の数え）・`tests/evac-follow.test.ts`（間隔 40 m に収まる・+30 の引く回数が時計だけで決まる（隠れ・沈没・操作中でも同じ）・+31 が投下ごとに 1・縁の箱で中心へ・狙われたら全速・回避あり/なしの命中率の差（M2））・`tests/evac-seat.test.ts`（写しの往復で値が同じ・切替の順 1→2→3→4・決着の後は灰色）・確保なし（ステップの前後で配列の長さと物が同じ） | — |
| **S2 空襲** | 新 `core/evac-plan.ts`（時計・予告（陰の発見 → 狙い）・枠 0＝操作中の隊・段 A/B と現れる点の距離順・1 隊 1 編隊まで・始まる時の見失い・済みの `atHome`（B1）・決着のラッチ）・新 `core/evac-hits.ts`（中心と巻き添え・隠れた艇と上げた艇は当たらない・決着の後は水柱だけ・隊長艇は `applyShellHit`・僚艇は HP） | 新 `tests/evac-plan.test.ts`（狙いの順・同じ隊を 2 編隊が狙わない・候補が尽きた枠は来ない・操作中の隊が隠れていれば枠 0 もほかへ・**1 予告で `state.waves` が 1 だけ増え、済みの後 60 秒 2 波目が出ない**・始まる前に隠れたら始めない・`restartAirSortie` が false なら次のステップで再試行・始め直しの 1 ステップ目の旋回率が跳ばない）・`tests/evac-hits.test.ts`（落下中に隠れた中心に当たらない（H2）・巻き添えの順と乱数の順・隊長艇の火災と機関がその編隊の系列から） | 凍結の core は import だけ（diff 空） |
| **S3 模擬** | 新 `core/evac-sim.ts`・`core/evac-sim-policy.ts`・`core/evac-sim-cell.ts`・`systems/evac-sim-setup.ts`・`systems/evac-calibration.ts`・`scripts/evac-sim.ts`。**UI の前に人の行で最初の表**（ノーマル・ハード）。§12.5 の順で data のつまみを 1 回目に合わせる | 新 `tests/evac-sim-a.test.ts`（決定性・同じ seed で同じ表・+29〜+43 の引く回数） | 表と md5 を CHANGELOG の下書きに。g2 の 35 本不変 |
| **S4 世界** | 新 `systems/world-evac.ts`（生成・`stepBoats`・`stepAir`・切替）・新 `systems/evac-flights.ts`（`AirStrikeFlight` × 8/12・偽の view・`restartAirSortie`・着弾の包み・対空の枠の並べ替え）・新 `systems/evac-boats-view.ts`（18 Image・状態の色・沈む絵）・新 `systems/evac-terrain.ts`（屋我地島・壕・陰の絵）。`mission-world.ts` に 4 行・`world-boat.ts` に燃料の 1 行（`stepTimeS` を view に）・`boat-damage.ts` に `divert` と `syncEngine`・`world-dawn.ts` に `day_start`・`mission-end.ts` に `evacHold`・`aa-fire.ts` に `AA_SRC_EVAC`・`aa-slots.ts` に evac の枝・`arms-step.ts` に隊の砲の値（≤ 2 行）・`world-input.ts` に［切替］。jp_03 はまだ Title に出ない（ヘッドレスは任務の id を直に渡す。`wvs-entry` が遊べない id を開けなければ、開ける debug の道を足す） | `tests/evac-step-order.test.ts`・`tests/evac-world.test.ts`（Phaser なしの素の値で座席の振り替え・決着の後は振り替えない・命中スローが掛からない）・mission-end の `evacHold`・world-dawn の `day_start` | `world-vs-sim.mjs` jp_03 差 0（ノーマル・ハード × 3 seed、`seq`・`seq_shoot`・`stay` の台本、切替と消火のある夜を必ず）／`ab-replay.mjs` の元の 16 件 same:true（main 88c9f19 のビルドと比べる） |
| **S5 操作と HUD** | ［切替］（段 3・`hud-layout-config` の種類 `switch`・`weapon-panel` の振り分け・`InputState.switchTap`・キーボードの `Tab`）・新 `ui/evac-lines.ts`（2 行目のモード 38〜・3 行目）・`ui/mission-line.ts` の `specialLine`（差し引き 0 行）・`ui/mission-mode.ts` のモード・新 `ui/evac-markers.ts`（赤・白・黄の輪・端の矢印・隊の番号・札）・昼の言い方（`dawn-clock`・帯・呼びかけ）・新 `systems/evac-telemetry.ts`（`t.evac`。`telemetry-create.ts` に既定） | 新 `tests/evac-lines.test.ts`（全モードの最長の文 ≤ 840 px・3 行目 ≤ 840 px・jp_03 の全文に「夜明け」なし）・`tests/evac-switch-ui.test.ts`（段 3 に［切替］は jp_03 だけ・ほかの任務の配置が同じ）・`air-lines-neutral`・`result-body-neutral`・`dawn-lines`・`hud-layout` | `hud-ab.mjs` の元の件が同じ／`brief-result.mjs` で W 1280・1560 の画面写し（見張り 0.5 で輪と番号が 24 px 以上・文が切れない・3 行目が左上の HP と右端の列に重ならない） |
| **S6 出撃可** | `playable_from "v0.6.11"`・Briefing（`config/briefing-data`・`systems/briefing-numbers`）・新 `ui/evac-result.ts`・`mission-result-extras.ts`・`ui/result-heading` の「退避完了」・`mission-objective.ts` の達成の枝・`core/scoring.ts` の残存の点・Title の日本のタブ 6 件＝2 × 3（上限） | 新 `tests/evac-score.test.ts`（17 × 30 < 700・達成は帰投 ＋ 6 以上）・`tests/evac-result.test.ts`（行の幅・分母は来た編隊）・title-grid / briefing / campaign / dawn-air（遊べる任務の一覧と、燃料の上限の式に `fuel_free_until_s`）/ jp-data / loadout / sortie の固定を 6 件に | ab-replay と hud-ab に jp_03 の新しい件を足す（元の件は same:true のまま）／Briefing と Result の画面写し |
| **S7 合わせと計測** | data のつまみだけ（§12.5）・帯を tests に・§11 の計測（`evac-perf.mjs`・`heap.mjs SECS=240`）・g2.sh に jp_03 の新しい md5（`EVAC=1`。元の 35 本は不変） | 新 `tests/evac-sim-b.test.ts`（帯 ✗ 0、N 400 × 2 組、ノーマル・ハード） | 表の md5・計測の数を CHANGELOG に／world-vs-sim をもう一度（つまみの後） |
| **S8 仕上げ** | docs/01（史料の範囲）・docs/02 §6（jp_03）・docs/03（v0.6.11 の行・実機テスト 3 項目・候補を追記）・CHANGELOG（目的・変更点・既知の制約・表・計測）・`package.json` 0.6.11・CLAUDE.md §2 に「空襲下の退避（jp_03）」1 行（U1〜U6 の要約。ユーザーがはっきり決めた）と変更履歴 1 行・`gh pr create`（本文の末尾に PR の署名） | — | §14 の門をすべてもう一度。ユーザーに (a) Pages URL と期待するビルド番号 `claude/v0.6.11-next@<7桁>` (b) 実機 3 項目 (c) 既知の制約 |

**区切り（CLAUDE.md §10）**: セッションを切る必要が出たら、S3 の後（data・core・模擬の表まで。遊べない）か S5 の後（遊べないが世界と HUD まで）で区切り、CHANGELOG・push・PR を済ませ、残りを v0.6.12 としてロードマップの行を 2 つに割る（jp_03 を指す版の番号を data・docs で揃える）。

## 14. 全段共通の門
- `npm test`・`npm run typecheck`・`npm run lint`・`npm run build` が緑
- 凍結 20 本の sha256 が同じ（`tests/frozen-files.test.ts`）
- `scripts/headless/g2.sh` の模擬 md5 17 本 ＋ G6 8 ＋ ALLY 10 ＝ 35 本が同じ
- setup の snapshot は新しい `setup-jp03` のほか `-u` なし
- 新しく作る・触る src のファイルはどれも ≤ 300 行（`mission-world` 277・`mission-line` は差し引き 0・`mission-scene` 299 と `game-data` 294 には足さない）
- `src/core` は phaser を import しない（`tests/core-no-phaser`）
- 乱数: 新しい系列は +29〜+43 だけ、`Math.random` なし、既存の系列の引く回数はほかの任務で同じ
- S4 以降: `ab-replay.mjs`・`hud-ab.mjs` の元の件が main 88c9f19 のビルドと same:true
- data の値は `data/*.json` だけ・各鍵に source（historical / design）
- commit と files にモデルの名前・識別子を書かない。commit の末尾は §13 の 2 行ちょうど

## 15. spec-review の各項目の扱い

| 項目 | 扱い |
|---|---|
| B1 予告なしの 2 波目 | 編隊は 1 回だけ使い、`airSortieComplete` の次から view の `atHome` を真のまま（§3.7）。S2 の tests で「済みの後 60 秒 2 波目なし」 |
| B2 燃料 | `fuel_free_until_s` 240・割当 16 gal・idle の tests の式を直す（§3.9） |
| H1 輪の中から始まる | jp_03 の `atHome` は「操作中の隊が隠れた」で輪の判定を使わない ＋ V-E2（20 m 以上外） |
| H2 待つ輪が的 | 隠れた艇・上げた艇は落下中の爆弾にも当たらない。巻き添えも隠れていない艇だけ |
| H3 壕だけで達成 | レール 1 本・隊長艇は最後・枠は隊ごと 15 < 18。`own_only` の帯 ≤ 25% |
| H4 散開は遅れた死 | 散開をやめた。操作していない隊はランダム回避（U3）。`dodge_only` の帯で回避だけが勝たないかを見る |
| H5 `raid` の名 | `evac*` にそろえる（id `unten_air_raid` だけ残す） |
| H6 昼に「夜明け」 | `day_start` の任務だけ時計・帯・Result・2 行目の言葉を替える（§10.3）。tests で「夜明け」なし |
| M1 命中スロー | 決着の前は振り替えで `sink` が false＝スローなし。AI の艇の沈没もスローなし |
| M2 秒の単位・回避が効かない | 秒は実秒・速さは kt と data の source に明記。S1 で回避の効きを測り、5 点未満なら外す |
| M3 引く回数 | +30 は時計だけ、+31 は投下ごと、+29 は予告ごと（§7）。門の文を直した |
| M4 予告の順 | 陰の発見 → 狙い（§3.7） |
| M5 中心だけ隠す | 隠れるのは隊ごと・隊長艇は最後に上げる |
| M6 順と入力の記録 | §8 の順を固定・`switchTap` と記録の `w`・`x` |
| M7 投下の予告 | 操作中の隊を狙う編隊の `strikeThreat` を 2 行目の最優先に |
| M8 対空の枠 | `AA_SRC_EVAC`・番号 = 編隊 × 4 ＋ 機・近い編隊から |
| M9 北の陸・浅瀬 | 北の縁＝屋我地島の岸・浅瀬なし・壕は南の縁の際 |
| M10 1 分で決まる | 操作が 4 分続く形に変わった（隊を運ぶ・切り替える）。表に「枠が埋まった秒」 |
| M11 区切りの「・」 | 名前は「（西）」、並べるのは「、」 |
| M12 段が大きい | S0〜S8 に割り、各段で commit・push。区切りの道（§13） |
| M13 300 行 | `specialLine` で差し引き 0、mission-world は 4 行 |
| M14 質問の数 | U1〜U6 で決まったので聞かない。帯が全部外れた時だけ 1 つ（§12.5） |
| L1〜L8 | 分母は来た編隊（L1）・残存は座席を含む（L2）・risk の形（L3）・番号の scale（L4）・現れる点は中心から同じ方位（L5）・浅瀬なしで V-R2 は不要（L6）・1 隊 1 編隊は段をまたぐ（L7）・帯は S3 の最初の表を見てから理由つきでだけ動かす（L8） |

## 16. iPhone で試す実機テスト（3 つ）
1. 運天港で［切替］を押すと操る隊（3 隻）が替わり、後ろの 2 隻がついて来るか。壕の前で止まると 1 隻ずつ上がり、隊が全部隠れると「見失った！」で敵機が引き返すか。
2. 赤い輪で狙われたほかの隊へ切り替えて逃がしたり隠したりしながら、4 分たった時に操作中の隊が隠れていて 6 隻以上残っていると、結果に「残存 N／18（史実 5）」と達成が出るか。
3. ハードの第 4 波（3 分すぎ、4 機の編隊が 3 つ同時）のとき、見張りで港全体を見ながら、左上の「FPS」の数字はいくつか。

## 17. 既知の制約（CHANGELOG に書く）
- 史実は WebSearch の抜粋のみ（本文未読）。13 隻が「どう」失われたか・壕の数・防空は不明。屋我地島側の陰・6 つの隊の分け方・壕の枠とレール 1 本は作り。
- 操作していない隊は自分では隠れない（U3）・撃たない・消火しない・経路探索なし（縁の箱で中心へ向くだけ）。僚艇は HP だけ・定位置で続く（航跡はたどらない）。
- 敵機の狙いは決まった順（操作中の隊に 1 編隊、ほかは止まった隊から東の空に近い順）。途中で狙いを替えない。隠れた隊は見失う。
- 240 秒の後は切り替えられず、残存はその時に確定（操作中の隊長艇が §2 の 4 機に沈められた時だけ 1 減る）。
- 魚雷は座席の 2 本を全部の隊長艇で分け合う（`torpedo-pool` は凍結で数を入れ替えられない）。機銃の弾倉も座席の 1 つ（切り替えても交換の残りは続く）。
- 僚艇の対空は隊長艇の発を n 倍にした簡略（曳光弾は隊長艇からだけ）。対空は近い 8 機まで。
- 壕から出るのはすぐ（下ろす時間なし）。浅瀬・座礁は jp_03 に無い。
- 昼の「見える／見えない」の連続モデルは無い（隠れているかは段階だけ）。昼の見張り・掃射・味方戦闘機はロードマップの候補「夜明け③：昼の海」。
- 出撃前の港内空襲の 2 択は jp_03 では出ない。燃える艦の煙・誘爆は無い。
- Title の日本のタブが 2 × 3 で満杯（次の日本の任務で並べ方が要る）。
- 性能の数はヘッドレスの相対値。iPhone の FPS は実機テスト 3 で読む。

## 18. 実装中に迷った時の既定（ユーザーには聞かない）
- 数の決めが data に無い所は、上の表の値を design で入れて source に理由を書く。
- 文の幅が 840 px を超えたら場所の名を短く（「屋我地の陰（西）」→「陰（西）」）。
- S3 の最初の表で seq がノーマル 70% を大きく超えるときは、つまみ 1 → 3 → 4 の順。下回るときは逆向き。ユーザーの U5 の数（波・機・編隊）には触れない。
