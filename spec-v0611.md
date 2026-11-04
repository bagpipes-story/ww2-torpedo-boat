# v0.6.11 仕様 — jp_03「運天港・空襲下の退避」（spec-v0611.md）

作成 2026-11-04（計画のみ。repo 未変更。main 88c9f19 = v0.6.10 マージ済み、作業ブランチ `claude/v0.6.11-next`）。
元: 勝者 **設計 C**（組に寄って号令＋狙いの予告）＋ judge.md §3 の接ぎ木 1〜11。史実は hist.md（**すべて WebSearch の抜粋・本文未読**）、コードの所在は map.md。
質問 Q1・Q2（§13）は既定 A で書いてある。B・C が選ばれたら §13 の差分だけ直す。

- **今回の変更目的**: jp_03 を出撃可にする — 昼の運天港で、最初から来る艦載機の波の下、自艇で隊の組に寄って［隠れ］［散れ］を号令し、18 隻のうち何隻残せるかを競う。
- **完了条件（Done）**: Pages の jp_03 で (1) 出撃直後から予告つきの編隊の波が来て、狙われた組に赤い輪が出る、(2) 組に寄って［隠れ］［散れ］を押すと艇が壕・陰・外海へ動き、隠れた狙いは「見失った！」で編隊が引き返す、(3) 4 分後に隊長艇の壕へ帰投すると Result に「残存 N／18（史実 5）」と達成／未達。ほかの 8 任務はビット同一（凍結 20 本・模擬 md5 35 本・setup の snapshot・再生 same:true）、ユーザーの iPhone 実機テスト 3 項目（§11）。

---

## 1. 史実の足場（何が史実で、何が作りか）

| ゲームの要素 | 根拠（hist.md） | source の書き方 |
|---|---|---|
| 18 隻・13 隻喪失・史実の残存 5 | A2・A4・A5（米の主張 12 隻と近い） | historical（抜粋のみ・本文未読） |
| 朝から夕方まで 5 回・延べ約 1,400 機、運天は 07:00 過ぎ〜15:30 | A7・A8・A9 | historical（抜粋のみ・本文未読） |
| 4 分＝その日の第 1 次の来襲の圧縮・4 波 | hist C1 | design |
| 機は東から（第38任務部隊は沖縄の東） | A6 | 方角 70° は design |
| 機の値 | 既存 `us_carrier_aircraft`（v0.6.1） | 変えない |
| 壕とレール | A16・A17 | 存在は historical。**数・枠・位置は design** |
| 屋我地島との狭い海峡 | A15 | historical。幅・向きは design |
| 屋我地島側の陰（マングローブ・崖下） | 史料に無い（hist C4） | **「design（史実の裏付け無し）」** と `*_source` に明記。Briefing で史実として書かない |
| 岸壁に並んだ艇がまとめて燃える | A11・A12 からの推論 | design（推論） |
| 撃っても落ちない | A10「友軍が応戦できなかった」 | 既存の 0.5%/発のまま |

Briefing に書くのは A1・A2・A7・A15・A16 の範囲だけ。実在の人物名を出さない（§11）。1945 年の隊の件には触れない。

## 2. 規則

### 2.1 地図（design。x 東・y 南、`bounds_m` 3200 × 1400）
- 見張り（ズーム 0.5）で港のほぼ全体が 1 画面（論理幅 1280〜1584 ÷ 0.5 = 2,560〜3,168 m × 1,440 m）。既定ズーム 0.75 で約 1,700〜2,100 m。
- 北の縁 = 屋我地島（y 0〜150 陸、y 150〜320 浅瀬 `shallows`。15 kt 超で座礁＝既存の規則。AI は `shallow_kt` 12 で入る）。南の縁 = 本部半島（運天）`coast: south`。
- 時間圧縮 5 倍（`time_scale`）。T-38 の全速は約 70 m/s＝端から端まで約 45 秒。
- 置き場所（すべて design）:

| id | 名前 | 位置 (m) | AI の枠 | 種類 |
|---|---|---|---|---|
| `home_cave` | 隊長艇の壕（＝帰投地点の輪 r 60） | (1500, 1240) | 2（自艇は帰投の輪で別。枠を使わない） | 壕 |
| `west_cave` | 西の壕 | (600, 1240) | 3 | 壕 |
| `east_cave` | 東の壕 | (2800, 1240) | 3 | 壕 |
| `west_cover` | 屋我地の陰・西 | (1000, 230) | 3 | 陰 |
| `east_cover` | 屋我地の陰・東 | (2400, 230) | 3 | 陰 |
| 散る先 | 外海（古宇利島の方） | 中心 (250, 650) r 250 | 無制限 | 散る先 |
| 散る先 | 羽地内海の口 | 中心 (2950, 700) r 250 | 無制限 | 散る先 |

- 組（6 組。組内は 12 m 間隔の横並び＝爆風 25 m の内なので 1 発で 2〜3 隻）:

| 組 | 隻数 | 停泊地 (m) | 場所の名 |
|---|---|---|---|
| 第1組 | 2（僚艇。自艇と合わせて 3）| (1420, 1205) | 隊長艇の横 |
| 第2組 | 3 | (1250, 1200) | 岸壁・西 |
| 第3組 | 3 | (1800, 1200) | 岸壁・東 |
| 第4組 | 3 | (2500, 1080) | 桟橋 |
| 第5組 | 3 | (900, 700) | 沖の浮標・西 |
| 第6組 | 3 | (2300, 620) | 沖の浮標・東 |

- AI 17 隻に対し AI の枠は 2 ＋ 6 ＋ 6 = **14**＝**最低 1 組は散らすか見捨てる**（V-R8 で data に守らせる。枠の数は史実でなく決断のための design）。
- 自艇 (1500, 1180) 停止・艇首 90°。

### 2.2 隊（AI。乱数は「陰の発見・自分で散る」と「回避」の 2 本だけ）
段階（艇ごと）: `MOORED` → `MOVING`（行き先へ `move_kt`。陰へは浅瀬で `shallow_kt`）→ `HAUL`（壕の入口でレールで上げる `haul_s` 6 秒。止まって見える）→ `CAVE`（安全・見えない）／`COVER`（陰で停止・見えない。見つかれば `FOUND`）／`SCATTER`（自分の散る点へ走り、**着いたら止まる**＝見えるが隠れてはいない。接ぎ木 9）／`SUNK`。
- **号令の届く組**: 自艇から `order_range_m` 以内に `MOORED` か `FOUND` の艇がいる組のうち、いちばん近い 1 組（距離の 2 乗）。白い輪と、［隠れ］の行き先への点線を出す。速さの制限なし。
- **［隠れ］**: その組の `MOORED` の艇を、組の位置から近い順に**空き枠のある壕・陰**へ 1 枠ずつ（3 隻が別の所に分かれることもある）。枠が 1 つも無ければボタンは灰色「隠れる所が無い」。`FOUND` の艇には［隠れ］を押せない（［散れ］だけ）。
- **［散れ］**: その組の `MOORED`・`FOUND` の艇をそれぞれ別の散る点へ（起動時に 2 つの散る先の輪の上へ `scatter_gap_m` 120 以上離して 17 点を並べ、近い先から使う）。
- **第1組（僚艇 2）**は普通の組（接ぎ木 8。追従は作らない）。寄って［隠れ］で隊長艇の壕の枠 2 へ。
- **号令しなかった組**: 第 2 波の予告の瞬間、6 組それぞれ確率 `self_scatter.chance` 0.25 で、その組の `MOORED` の艇が自分で散る（引く回数は 6 回固定。`MOORED` が 0 でも引く）。史実の「何もしなくても 5 隻前後は残った」の底を作るつまみ。
- 移動は `core/ship-ai.ts` の `steerShip`。経路探索はしない（地図の検査 V-R1・V-R2 で直線が陸に掛からない配置に限る）。
- 被弾: HP 60・1 発 35（`jp_t38.hull_hp` / `bomb.damage`）＝2 発で沈む。**HP だけ・火災と機関の乱数は引かない**（大発・護衛の作法）。
- 回避: `MOVING` の AI 艇が編隊の中心のとき、投下ごとに成功 `dodge.success` 0.45 で着弾点から離れる側へ `hold_s` 2 秒切る（反応 0.8 秒）。止まっている段階（MOORED・HAUL・FOUND・SCATTER 着後）は動かない。
- AI の艇は撃たない（A10）。

### 2.3 空襲の波（任務の最初から。凍結の core は 1 バイトも変えない）
- 波（ノーマル）: 予告 t 15・70・125・180 秒、編隊の数 2・3・3・4（計 12 編隊・延べ 48 機）。ハード 3・4・4・4（延べ 60 機）。1 編隊 = 4 機 × 2 発（`us_carrier_aircraft`）。
- 予告から `announce_lead_s` 10 秒で編隊が始まり、さらに約 11 秒（`first_run_s` 9 ＋爆撃進路）で最初の投下 → 2.2 秒ごとに 8 発 → 去る。**予告から最初の投下まで約 21 秒**が救いに行ける時間。
- **狙い（予告の瞬間に決める。乱数なし。接ぎ木 1）**: 編隊 i の「現れる点」= 地図の中心から方位 `from_bearing_deg + flight_offsets_deg[i]`・`spawn_m` の点。編隊 0 から順に、下の段の上から候補を探し、同じ段では現れる点に近い順（距離の 2 乗）:
  1. 停泊の組（`MOORED` が 1 隻以上の組。中心 = 停泊地にいちばん近い `MOORED` の艇）
  2. 見つかった陰の組（`FOUND` の艇がいる陰。中心 = その陰の真ん中の艇）
  3. `HAUL` の艇
  4. `MOVING` の艇 ＋ **全速の自艇**（全速で走れば囮になる）
  5. `SCATTER` の艇
  6. 自艇（全速以外）
  - 同じ組・陰・艇を 2 編隊が狙わない。**自艇は 1 波 1 編隊まで**。自艇が帰投の輪の中なら候補にしない。候補が尽きた編隊はその波は来ない。
  - 段の名と順は data（`raid.target_tiers`）。並べ替えはつまみとして使える。
- **見失わせる**: 予告の後、狙いの中心の艇が `CAVE`・`COVER`（見つかっていない）に入ったら、その編隊の偽の view の `atHome = true` → 凍結の core の `cancel` で引き返す。HUD「第4組を見失った！ 4機が引き返す」、Result「見失わせた編隊 N／12」。始まる前（予告の 10 秒の内）なら編隊は始めない（同じ文）。
- **途中で狙いを替えない**（機の位置は中心からの相対）。中心が沈めば core の `cancel` で去る。
- **巻き添え**: 着弾（命中・外れとも）ごとに、`CAVE`・`COVER` 以外の全艇（中心は除く＝`onPlayerHit` で済み）に `pointNearBoat`（core/gunnery。爆風 25 m・半長）。自艇への巻き添えは世界の `hit(spec, rng, x, y, 'air_strike')`（rng はその編隊の系列）。
- **陰が見つかる**: 予告の瞬間、陰 2 か所ぶん毎回 2 回引く（艇がいなくても引く）。確率 `cover_reveal_chance` 0.25（ハード 0.35）。黄の輪＋「屋我地の陰・東が見つかった！ ［散れ］で逃がせ」。
- **機銃**: 撃てば閃光（`muzzle_flash_reveal_m` 1,200 m）の内の陰の `COVER` はその場で `FOUND`（乱数なし）。撃墜は既存の 0.5%/発。HUD に 1 回だけ「撃てば陰の艇も見つかる」。
- 対空は**自艇から近い 2 編隊だけ**を `systems/aa-slots.ts` に渡す（`AA_MAX_TARGETS` 8 は上げない）。
- 自艇は今までどおり（2 発で沈む・投下の予告・旋回中は逆へ）。

### 2.4 終わり方（CLAUDE.md §2「夜明け」の読み替え＝Q2 既定 A。新しい終わり方は作らない）
- `duration_s` 240 = 第 1 次の来襲が去る。**残存はこの瞬間に確定**（以後 AI の艇は傷を受けない。走っている編隊は `atHome` で去る）。
- 帰投地点 = 隊長艇の壕。240 秒より前に輪に入っても終わらない（jp_04 の `landingHold` と同じ「待ち」。`raidHold`）。輪の中の自艇は狙いの候補にならない。出てまた号令しに行ける。
- 240 秒に輪の中なら帰投で終わる。外なら §2 どおり既存の `dawn_strike`（敵機 4 機・seed+19）が自艇だけを追う。後で帰投すれば ×0.9（`after_dawn_factor`）。
- 自艇の沈没・漂流・座礁で終われば、その時点で沈んでいない艇を残存に数える（達成には帰投が要る）。
- 海の色は最初から昼（`world-dawn.ts` に opt-in `day_start`。`durationS 0` の小細工はしない）。

### 2.5 点（`scoring.json`）
- 帰投 700（今のまま）。達成 `objective_by_type.evacuate_under_air_raid` 300 = 帰投して残存（自艇を含む）≥ `survivor_quota` 6。
- `squadron.points_per_survivor` 30 × 残った AI の艇（帰投によらない。大発の `points_per_arrival` の作法）。最大 17 × 30 = 510 < 700＝「残して死ぬより帰る方が上」を崩さない（tests で固定）。
- 見失わせた編隊・撃墜に点は付けない（文だけ）。

## 3. data の鍵（値・source）

missions_seed `jp_03`（本体の `hazards`・`success` は設計の記録としてそのまま）:

| 鍵 | 値 | source |
|---|---|---|
| `playable_from` | `"v0.6.11"`（**S4 で付ける**） | design |
| `briefing_note_ja` | 「1944年10月10日、米空母部隊の艦載機が朝から夕方まで沖縄を5回空襲した（延べ約1,400機）。運天港の第27魚雷艇隊は18隻のうち13隻を失った。港には艇を隠す壕と、海から壕へ上げるレールがあった。」 | historical（A2・A7・A16。抜粋のみ・本文未読） |
| `moon_label_ja` | 「昼（07:00 空襲警報）」 | historical（A8）/ design |
| `v0_1_prototype.enemies` | `["us_carrier_aircraft"]` | design |
| `.main_weapon` | `"guns"`（位置は §2 で固定。`main_weapon_source`「艦がいない。位置は決めない（v0.6.8）」） | design |
| `.duration_s` / `.fuel_allotment_gal` | 240 / 19 | design |
| `.day_start` | `true`（海の色を最初から昼） | design |
| `.bounds_m` | `{w 3200, h 1400}` | design |
| `.player_start` | `{x 1500, y 1180, heading_deg 90, speed_kt 0}` | design |
| `.return_point` | `{x 1500, y 1240, radius_m 60, label_ja "隊長艇の壕", …既存の settle 鍵}` | historical（壕）/ design |
| `.shallows` | `[{x 300, y 150, w 2600, h 170}]` | design（屋我地島側の浅瀬。推論） |
| `.coast` | `{side "south", land_m 400, label_ja "本部半島（運天）"}`、北は `raid.north_shore_label_ja` "屋我地島" | historical（位置関係）/ design（寸法） |
| `.hazards` | `["unten_air_raid","grounding","dawn_air_strike"]`（**`harbor_fire_explosion` は外す**＝出撃前の港内空襲の 2 択は紛らわしい） | design |
| `.dawn_strike` | `{aircraft_id "us_carrier_aircraft", count 4, from_bearing_deg 70, escort_target_planes []}` | design（§2 の検査が要求） |
| `.squadron` | `{boat "jp_t38", groups [{id 1, label_ja "第1組", place_ja "隊長艇の横", x 1420, y 1205, boats 2}, {2,"岸壁・西",1250,1200,3}, {3,"岸壁・東",1800,1200,3}, {4,"桟橋",2500,1080,3}, {5,"沖の浮標・西",900,700,3}, {6,"沖の浮標・東",2300,620,3}], spacing_m 12, heading_deg 90, order_range_m 200, move_kt 16, shallow_kt 12, scatter_gap_m 120, haul_s 6, dodge {react_s 0.8, success 0.45, hold_s 2}, self_scatter {at_wave 2, chance 0.25}, label_ja "第27魚雷艇隊"}` | 18 隻は historical、ほかは design |
| `.hide_spots` | `[{id "home_cave", label_ja "隊長艇の壕", kind "cave", x 1500, y 1240, slots 2, home true}, {"west_cave","西の壕","cave",600,1240,3}, {"east_cave","東の壕","cave",2800,1240,3}, {"west_cover","屋我地の陰・西","cover",1000,230,3}, {"east_cover","屋我地の陰・東","cover",2400,230,3}]`、`ring_m` 80、`cave_source`「壕とレールの存在は historical（A16・A17、抜粋のみ）。数・枠・位置は design」、`cover_source`「design（史実の裏付け無し）」 | 左の各 `*_source` |
| `.scatter_zones` | `[{label_ja "外海", x 250, y 650, r_m 250}, {label_ja "羽地内海の口", x 2950, y 700, r_m 250}]` | design |
| `.raid` | `{waves [{announce_s 15, flights 2}, {70, 3}, {125, 3}, {180, 4}], announce_lead_s 10, from_bearing_deg 70, flight_offsets_deg [-40, 0, 40, 80], target_tiers ["moored_group","found_group","haul","moving","scatter","player"], player_full_tier "moving", player_flights_max 1, cover_reveal_chance 0.25, survivor_quota 6, survivors_total 18, historical_survivors 5, north_shore_label_ja "屋我地島"}` | design（4 波は「5 回のうちの 1 回」の圧縮）。`historical_survivors` 5・`survivors_total` 18 は historical |
| `.hard` | `{raid_flights [3, 4, 4, 4], cover_reveal_chance 0.35}` | design |

ほかの data:

| ファイル・鍵 | 値 | source |
|---|---|---|
| risk_events `unten_air_raid` | `label_ja`「港の空襲（任務の最初から艦載機の編隊が予告の後に来る）」、`params.sortie {spawn_m 2500, run_radius_m 500, first_run_s 9, run_gap_s 2.2, wave_rest_s 16, leave_s 2.5, spawn_offsets_deg [-30,-10,10,30], wave_rotate_deg 0, aim_turn_min_deg_s 0.5}`、1 編隊 1 波で去る（jp_02 `patrol_air.params.sortie` と同じ作法） | design |
| scoring `objective_by_type.evacuate_under_air_raid` | 300 | design |
| scoring `squadron.points_per_survivor` | 30 | design |
| hit_rate_model `visibility.moon_factor.day` | 1.0（艦の無い任務なので効かない。鍵があることだけが要る。setup の snapshot は選んだ値しか持たない＝中立） | design |

`risk_events.dawn_air_strike.params` は**触らない**（6 任務で共有）。

起動時の検査（新しい `config/raid-mission-data.ts`。例外は鍵を名指す日本語。`patrol-air-mission-data.ts` の型）:
- V-R1 置き場所・停泊地・散る先が海域の内で陸に掛からない
- V-R2 停泊地 → 各隠れ場所の直線が浅瀬を `shallow_kt` 超で通らない（陰の手前で減速が要る長さを確保）
- V-R3 `spacing_m` < 爆風（巻き添えが出る）／`scatter_gap_m` > 爆風 × 2 ＋ 半長
- V-R4 1 波の編隊数 ≤ 4（世界の `AirStrikeFlight` の数）・1 編隊 ≤ 4 機（凍結の上限）
- V-R5 `flight_offsets_deg` の長さ ≥ 最大の編隊数（ハード込み）
- V-R6 予告の間隔 ≥ `announce_lead_s` ＋ 1 編隊の長さ（first_run ＋ 8 × gap ＋ 落下 ＋ leave。約 30 秒）＝前の編隊の爆弾が空中に残らず使い回せる（接ぎ木 2）。最後の波の終わり < `duration_s`
- V-R7 散る点が `scatter_gap_m` 以上離れて AI の艇の数（17）だけとれる
- V-R8 AI の枠の合計 < AI の艇の数（「最低 1 組は散らす」）
- V-R9 `target_tiers` の名が既知の 6 つで重複なし・`player_full_tier` がその中
- `squadron` の無い任務は `raidSetupPart` が `{}` を返す（setup の snapshot が同じ＝`patrolAirSetupPart` の作法）

## 4. iPhone の操作
- 左下のスティック・右下の兵装（角が魚雷＝狙う艦なし・その左が機銃＝対空）: 今までどおり。
- **右端の縦一列の空き段に号令 2 つ**（T-38 は煙幕なし・jp_03 に識別なし。S5 で実際に空くことを確かめる）:
  - 段 0（煙幕の段・y 68）: **［隠れ］**（届く組が無い・枠が無いときは灰色）
  - 段 3（識別の段・y 404）: **［散れ］**（届く組が無いときは灰色）
  - 間に消火・見張りが挟まる＝押し間違えにくい（間 224 px 中心距離 336 px）。`SKILL_ORDER` の段は変えず、`order_hide`・`order_scatter` を `squadron` のある任務だけに足す（ほかの任務の配置は 1 px も変わらない。配置の固定 tests で確かめる）。
- **見張り（長押し）で港全体**。赤い輪・黄の輪・組の番号はズーム 0.5 でも画面上 24 px 以上。
- 地図を叩く命令・組の選択メニュー・行き先を選ぶ画面は作らない。行き先は「いちばん近い空き」で決まり、押す前に点線で見せる。

## 5. 画面の文（1 行 ≤ 840 px＝22 px で全角約 38 字。概算 全角 22・半角 12 px。モジュールごとに幅の tests）

HUD（値が変わったときだけ setText。前回値をキャッシュ。爆弾の落下中は既存の「爆弾投下！ 転舵！」が最優先）:
- 1 行目（常時）: 「残存 15／18 ・ 次の波 0:18 東から 12機」（約 450 px）
- 3 行目（隊の場所。接ぎ木 3）: 「壕 4/8 ・ 陰 2/6 ・ 外海 3 ・ 沈没 3」（約 430 px）
- 2 行目（モード。上ほど優先）:
  - 予告: 「第2波 12機 東から ・ 狙い 第4組・第5組・自艇」（約 680 px）＋中央の帯 2 秒
  - 見失わせた: 「第4組を見失った！ 4機が引き返す」
  - 沈没: 「第2組 岸壁で 3 隻沈没（残存 12）」／「第5組の 1 隻 外海で沈没」
  - 陰が見つかった: 「屋我地の陰・東が見つかった！ ［散れ］で逃がせ」
  - 号令した: 「第3組 隠れろ！ 西の壕へ 2・東の陰へ 1」／「第5組 散れ！ 3 隻が外海へ」／「隠れる所が無い ・ 散らせ」
  - 届く組: 「第3組（岸壁・東 3 隻）隠れ→西の壕 ・ 散れ→外海」（約 760 px。S5 で実測、超えたら「第3組 隠れ→西の壕・散れ→外海」）
  - 届く組なし: 「組に 200 m まで寄れば号令できる」
  - 囮（自艇が狙われた波に 1 回）: 「自艇に 4 機 ・ 囮になった（旋回中は逆へ）」
  - 機銃（1 回だけ）: 「撃てば陰の艇も見つかる」
  - 待機: 「隊長艇の壕で待機 ・ 空襲が去るまで 1:05」
  - 240 秒: 「第1次の空襲が去った ・ 残存 8 で確定」→ 外なら「隊長艇の壕へ戻れ（敵機 4 機が追う）」
- 組の番号（地図の上。Text 6 個。状態が変わったときだけ色）: 灰＝停泊・白＝移動・暗い緑＝隠れた・黄＝見つかった・水色＝散開・赤＝狙われている・×＝全滅。置き場所の Text 5 個「西の壕 2/3」（変わったときだけ）。

Briefing（既存の Briefing の行幅の内）:
- 目的「隊の艇を壕・陰・外海へ散らせ。残った数で評価」
- 成功「18隻中6隻以上を残し、隊長艇の壕へ（史実は5隻）」
- 時「昼（07:00 空襲警報）」／敵「米艦載機 ・ 東から 4 波（延べ 48 機）」（ハード「延べ 60 機」）
- 号令「組に寄って［隠れ］か［散れ］ ・ 隠れ場所は 14 隻分しかない」
- 予告「狙われた組は赤い輪 ・ 壕や陰に入れば見失う ・ 岸壁の組から狙われる」
- 危険「岸壁に並んだ艇は 1 発で何隻も燃える ・ 陰は見つかることがある」
- 史実の行（`briefing_note_ja`）。陰は「作り（史料に無い）」と 1 行で添える。

Result:
- 「残存 8／18（史実 5）」
- 「壕 6 ・ 陰 2 ・ 外海 0 ／ 沈没 10（停泊 6 ・ 陰 3 ・ 外海 1）」
- 「見失わせた編隊 3／12」
- 達成「6 隻以上を残した」／未達「残存 4 隻（6 隻以上で達成）」
- 点の行「残った艇 7 隻 × 30」

## 6. 凍結の core を変えずに使う方法（凍結 20 本は sha256 で不変）
- 世界は起動時に `AirStrikeFlight`（systems/air-strike-flight。凍結）を **4 つだけ**作って使い回す。乱数は編隊の番号ごとの系列 seed+31〜+34（自艇への命中の火災・機関もその系列＝夜明けと同じ作法）。
- 各編隊には**偽の view** `{boat: {state: 中心の BoatState, sinking}, atHome: 隠れた‖240 秒, grounded: false, escort: null}` を毎ステップ渡す（構造型。view の物は起動時に 4 つ確保して書き換える）。AI の艇は `BoatState` を持つ（`ConvoyBarge extends BoatState` と同じ形）。
- 開始は `core/air-sortie.ts` の `restartAirSortie`（凍結でない・編集もしない）で、中心から `from_bearing_deg + flight_offsets_deg[i]`・`spawn_m`。**false（空中に爆弾）が返れば次のステップで再試行**（V-R6 で起きない設計だが道を持つ。S2 の tests で確かめる）。パラメタは `airStrikeParamsFromData(aircraft, {id:'unten_air_raid', params: sortie}, …)`（`config/patrol-air-mission-data.ts` L67 と同じ）。
- 命中の受け: `onPlayerHit(x,y)` は「中心に当たった」— 中心が自艇なら世界の `hit`、AI なら HP だけ。`splash`・`onPlayerHit` の包み側で巻き添え。
- 撃墜は `core/air-down.ts` の `downStrikePlane`。
- 新しい Phaser 非依存の模擬は `stepAirStrike`・`restartAirSortie` を直接呼ぶ（`core/patrol-air-sim.ts` の型）。凍結の `core/air-strike-sim.ts`（1 隻用）は使わない。

## 7. 乱数の系列（+29 以上は空き＝grep で確認済み。+21 は予約のまま）
| 系列 | 用途 | 引く回数 |
|---|---|---|
| seed+29 | 陰の発見（予告ごとに 2 回）・自分で散る（第 2 波の予告で 6 回）。この順で固定 | 波ごとに固定 |
| seed+30 | AI 艇の回避（`MOVING` の AI 艇が中心の投下ごとに 1 回） | 状態で決まる（世界と模擬で同じ） |
| seed+31〜+34 | 編隊 0〜3 の投下の散布と自艇への命中の火災・機関 | 凍結の core のまま |
| seed+19 | 240 秒後の §2 の敵機 4 機（既存） | 既存 |
| 模擬だけ | 人の方針の揺らぎ（seed×MUL+ADD。`core/landing-sim-policy.ts` の作法） | — |
定数は `core/raid-plan.ts` に `RAID_SEED_OFFSET 29`・`RAID_DODGE_SEED_OFFSET 30`・`RAID_FLIGHT_SEED_OFFSET 31`。系列の一覧のコメント（core/night 等）に追記。

## 8. 模擬と帯（人に近い行を主に＝v0.6.9/v0.6.10 の教訓）
- `core/raid-sim.ts`（任務の 1 本を最後まで: 時計 → 予告 → 方針 → 隊 → 艇 → 編隊 → 巻き添え → 240 秒 → 帰投）＋ `core/raid-sim-policy.ts` ＋ `systems/raid-sim-setup.ts`（`buildWorldSetup` から）＋ `systems/raid-calibration.ts`（帯）＋ `scripts/raid-sim.ts`（N 400 × 2 組の seed、`HARD=1`、`TABLE=1/2`）。世界と模擬は記録した入力の再生で差 0（`world-vs-sim.mjs` に jp_03）。
- 遊び方の行（人の揺らぎ: 予告の後 5〜12 秒の反応の遅れ・自艇の避けは半分）:

| 行 | 中身 | 見るもの |
|---|---|---|
| **`near`（主）** | 人: 近い組から順に寄る。隠れ 75%・散れ 25%。見つかった陰は助けない。215 秒に壕へ | 主の帯 |
| **`face`** | 人: 予告の狙いの組へ行く（間に合わなくても）。狙いが無ければ近い組 | 予告に振り回される人 |
| **`human_shoot`** | near ＋ 機を見たら機銃を撃ち続ける（接ぎ木 6） | 閃光で陰が見つかる罰が効くか |
| `cave_hide` | 第1組と最寄りの 1 組を壕へ入れ、自分も壕で待つ（史実の再現。接ぎ木 5） | Result の「史実 5」の基準 |
| `stay` | すぐ壕へ。誰にも号令しない | 底 |
| `hud` | HUD の文どおり（届く組の行き先・予告の狙いが届くなら先に・見つかった陰は［散れ］・215 秒に壕へ） | 文が正しい手を教えるか |
| `near_decoy` | near ＋ 225 秒まで全速で外にいる | 囮が割に合うか（監視） |
| `hide_only` | 隠れだけ。枠が尽きたら放っておく | ［散れ］に意味があるか |
| `scatter_all` | 全部［散れ］ | 散開が支配的でないか |
| `bot` | 最良の順（予告の狙いを先・壕を先・陰の発見に即応）と輪で避ける | 天井 |

- 帯（ノーマル。`tests/raid-sim-*.test.ts` の較正に入れる）:

| 行 | 残存の中央値 | P(残存 ≥ 6) | 自艇の沈没 |
|---|---|---|---|
| near（主） | 6〜9 | 55〜80% | ≤ 20% |
| face | 5〜8 かつ ≤ near ＋ 1 | 40〜70% | ≤ 25% |
| human_shoot | ≤ near − 0.5 | — | ≤ 25% |
| cave_hide | 4〜6 | 5〜40% | ≤ 5% |
| stay | 3〜5 | ≤ 15% | ≤ 2% |
| hud | 8〜11 | 80〜95% | ≤ 10% |
| near_decoy | near − 0.5 〜 near ＋ 2 | — | ≤ 45% |
| hide_only | ≤ hud − 1 | ≤ hud − 10 pt | — |
| scatter_all | ≤ near | ≤ near ＋ 5 pt | — |
| bot | 10〜14（18 は ≤ 2%） | ≥ 95% | ≤ 5% |

  ハード: near の P(≥6) 30〜55%・stay の中央値 ≤ 3・cave_hide 3〜5・段（near の中央値のノーマル − ハード）1.5〜3 隻。
- 玩具の当たり（protoC、抽象。参考のみ）: 波 2・3・3・4 で 人 8（94%）＝易しすぎの側。本物では反応の遅れで下に出る見込み。
- **つまみの順（data だけ）**（接ぎ木 10）: `move_kt`（16 → 14）→ `order_range_m`（200 → 160）→ `announce_lead_s`（10 → 8）→ `cover_reveal_chance` → 波の編隊の数 → `dodge.success` → `self_scatter.chance`（stay・cave_hide の底）。枠の数（AI 14）は「最低 1 組は散らす」を守るので最後まで動かさない。`target_tiers` の順は帯が全部外れたときだけ。

## 9. 段（S0〜S7）・ファイル・tests・門

**全段共通の門**（どの段も通してから commit → `claude/v0.6.11-next` に push。ネットワーク失敗は再試行）:
`npm test`・typecheck・`npm run lint`・`npm run build` 緑／凍結 20 本の sha256 同じ（`tests/frozen-files`）／`scripts/headless/g2.sh` の模擬 md5 17 本＋G6 8＋ALLY 10 が同じ／setup の snapshot は新しい `setup-jp03` のほか `-u` なし／1 ファイル ≤ 300 行（mission-world 273 は 1 行だけ、mission-line 297・mission-scene 299・game-data 294 には足さない）／`src/core` は phaser を import しない／乱数は +29〜+34 だけ。

| 段 | 中身（新＝新規ファイル） | tests | 追加の門 |
|---|---|---|---|
| S0 data | missions_seed jp_03 の `v0_1_prototype`（`playable_from` はまだ付けない）・risk_events `unten_air_raid`・scoring の 2 鍵・`moon_factor.day`・`config/mission-data.ts` の「昼は v0.6 で扱う」を `day` だけ通す・新 `config/raid-mission-data.ts`（読み＋V-R1〜V-R9＋`raidSetupPart`） | 新 `tests/raid-mission-data.test.ts`（V ごとの日本語の文・既定の data が通る）・visibility / game-data の `day` | ほかの 8 任務の setup snapshot・g2 不変 |
| S1 隊 | 新 `core/squadron.ts`（段階・届く組・［隠れ］の枠の割り当て・［散れ］の点・残存の数え）・新 `core/squadron-move.ts`（`steerShip`・HAUL・回避 seed+30） | 新 `tests/squadron.test.ts`（200 m ちょうど・枠が 1 つだけ残る・枠ゼロで灰色・FOUND に［隠れ］不可・HAUL 6 秒・浅瀬で 12 kt・散る点 17 個）・`tests/squadron-move.test.ts`・確保なし（ステップの前後で物の数が同じ） | — |
| S2 空襲 | 新 `core/raid-plan.ts`（予告の時計・段の狙い・自艇 1 波 1 編隊・陰の発見と自分で散る seed+29・見失わせる・240 秒の確定）・新 `core/raid-hits.ts`（巻き添え・HP） | 新 `tests/raid-plan.test.ts`（狙いの段と同じ段の距離順・同じ組を 2 編隊が狙わない・輪の中の自艇は除く・乱数の引く回数が固定・**`restartAirSortie` が false なら次のステップで再試行して止まらない**・始め直しの 1 ステップ目の旋回率が跳ばない）・`tests/raid-hits.test.ts` | 凍結の core は import だけ（diff 空） |
| S3 模擬 | 新 `core/raid-sim.ts`・`core/raid-sim-policy.ts`・`systems/raid-sim-setup.ts`・`systems/raid-calibration.ts`・`scripts/raid-sim.ts`。**UI の前に人の行で最初の表** | `tests/raid-sim-a.test.ts`（決定性・同じ seed で同じ表） | 表と md5 を CHANGELOG の下書きに。g2 の 35 本不変。**90 分を超えそうならここで区切る**（下） |
| S4 世界 | 新 `systems/world-raid.ts`（`AirStrikeFlight` ×4・偽の view・`restartAirSortie`・巻き添え・対空 2 編隊・閃光で陰）・新 `systems/squadron-view.ts`（17 Image・状態の色）・新 `systems/raid-terrain.ts`（屋我地島・壕・陰の絵）。`mission-world.ts` に `buildRaid` 1 行・`world-dawn.ts` に `day_start`・`mission-end.ts` に `raidHold`・`mission-objective.ts` の達成の枝・`core/scoring.ts` の残存の点・`aa-slots.ts` に近い 2 編隊・`playable_from "v0.6.11"`・Title の日本のタブ 6 件＝2 × 3（上限） | `tests/raid-score.test.ts`（510 < 700）・title-grid / briefing / campaign / dawn-air / jp-data / loadout / sortie の固定を 6 件に・`setup-jp03.snap`（新） | `world-vs-sim.mjs` jp_03 差 0（ノーマル・ハード × 3 seed）／`ab-replay.mjs` の元の 16 件 same:true（jp_03 は新しい件として足す） |
| S5 UI | 号令の 2 ボタン（段 0・3）・届く組の白い輪と点線・組の番号と色・予告の帯と赤い輪・端の矢印（狙いだけ・最大 4）・新 `ui/raid-lines.ts`（HUD 3 行）・新 `ui/raid-markers.ts`・Briefing・新 `ui/raid-result.ts`・テレメトリ（`mission-telemetry.ts` に `t.raid`）・`mission-mode.ts` にモード 38〜 | 新 `tests/raid-lines.test.ts`（全文 ≤ 840 px）・ほかの任務のボタン配置の固定・`result-body-neutral`・`air-lines-neutral` | `hud-ab.mjs` の元の件が同じ／`brief-result.mjs` で W 1280・1560 の画面写し（見張り 0.5 で輪 24 px 以上・文が切れない） |
| S6 合わせ | data のつまみだけ（§8 の順）・帯を tests に・§7 の計測 | 新 `tests/raid-sim-b.test.ts`（帯 ✗ 0、N 400 × 2 組、ノーマル・ハード） | 表の md5 を CHANGELOG に／`heap.mjs` jp_03（120 秒で v0.6.9 の 9.2 MB ＋ 1 MB 以内・段差なし）／フレーム時間 W 1280・1560 |
| S7 仕上げ | docs/01（史料の範囲）・docs/02 §6（jp_03）・docs/03（v0.6.11 の行と実機テスト 3 項目、候補を追記）・CHANGELOG（目的・変更点・既知の制約・表）・`package.json` 0.6.11・CLAUDE.md §2 に「空襲下の退避（jp_03）」1 行と変更履歴 1 行（Q の答え）・`gh pr create` | — | 全部の門をもう一度。ユーザーに (a) Pages URL と `claude/v0.6.11-next@<7桁>` (b) 実機 3 項目 (c) 既知の制約 |

**区切り（CLAUDE.md §10）**: S3 の後で 90 分を超えそうなら、S0〜S3 を v0.6.11（遊べない・data・core・模擬の表まで）として CHANGELOG・push・PR、S4〜S7 を v0.6.12 にしてロードマップの行を 2 つに割る（jp_03 を指す版の番号を data・docs で揃える）。

## 10. §7 の警告（実装の前に）
1. **`update()` で確保しない**: 狙いの候補・散る点・枠・偽の view 4 つ・巻き添えの走査はすべて起動時に固定長で確保し、個数で回す。`filter`/`map`/リテラル禁止。狙いは予告の瞬間だけ選ぶ（毎ステップ選ばない）。
2. **Text を 17 隻ぶん作らない**: 組の番号 6・置き場所 5・HUD 3 行だけ。色は `setTint`／`setColor` を状態が変わったときだけ。HUD の `setText` は前回値と比べて変わったときだけ。
3. **輪・点線・壕の絵は起動時に `generateTexture`**。毎フレーム `Graphics.clear()` → 再描画しない（点線も Image を並べて位置だけ動かす）。
4. **距離は 2 乗**: 届く組（6 組）・狙いの段（≤ 17）・巻き添え（着弾ごとに ≤ 18 の `pointNearBoat`）。平方根は表示の距離だけ。
5. 物の数: AI 17 Image ＋ 編隊 4 × 約 9 Image ＋ 夜明けの 1 隊 9 ＋ 輪 約 12 ＋ Text 14 ＝ 約 90。`SPLASH_POOL_SIZE` 32 は 4 編隊 × 2.2 秒に 1 発で足りる（共有のまま）。
6. 画面端の矢印は狙われた組だけ（最大 4）。16 機ぶん出さない。
7. `AA_MAX_TARGETS` を上げない（近い 2 編隊＝8 機で上限ちょうど）。
8. 固定ステップのまま（`fixedStep`）。AI の移動も m/s を dt で積分。

## 11. iPhone で試す実機テスト（3 つ）
1. 運天港で組に近づき［隠れ］か［散れ］を押すと、点線の先へ艇が動き、壕や陰に入ったり外海へ散ったりするのが分かるか。
2. 赤い輪で狙われた組を隠すと「見失った！」と出て敵機が引き返すか。6 隻以上残して隊長艇の壕に戻ると、結果に「残存 N／18（史実 5）」と出るか。
3. 18 隻と敵機が飛ぶ中で、見張りで港全体を見てもカクつかないか。

## 12. 既知の制約（CHANGELOG に書く）
- 史実は WebSearch の抜粋のみ（本文未読）。13 隻が「どう」失われたか・壕の数・防空は不明。屋我地島側の陰は史料に無い作り。
- 敵機の狙いは決まった順（停泊の組から）。学べる代わりに読み合いは浅い。全速の自艇は「移動」の段なので、停泊の組が残る間は囮になりにくい。
- 編隊は波の途中で狙いを替えない。AI の艇は直線で走る（経路探索なし）・撃たない・火災と機関の故障なし。散った艇は外海の点で止まる。
- 昼の「見える／見えない」の連続モデルは無い（見えるかは段階だけ）。昼の見張り・掃射・味方戦闘機はロードマップの候補「夜明け③：昼の海」。
- 出撃前の港内空襲の 2 択は jp_03 では出ない。燃える艦の煙・誘爆は無い。
- 対空は自艇から近い 2 編隊だけ。
- Title の日本のタブが 2 × 3 で満杯（次の日本の任務で並べ方が要る）。

## 13. ユーザーに聞くこと（2 つ。答えが無ければ既定で進める）
**Q1（隊への指示のしかた）** 既定 **A**
- A（おすすめ）: 自艇で組（3 隻）に近づき、右端のボタン［隠れ］（近くの空いた壕・陰へ）か［散れ］（外海へ）で号令する。敵機がどの組を狙うかは 10 秒前に赤い輪で見えるので、救いに行ける。
- B: 自艇の後ろに組を引き連れて走り、壕や陰まで自分で運ぶ（手応えはあるが、ゆっくり走る細かい操作が要る）。→ B なら設計 B の列（`call_m`・`follow_gap_m`）に差し替え、S1・S5 をやり直し。
- C: 「散開」ボタンを 1 回押すだけで全隊が自動で散る。→ C なら設計 A の R6 と 1 ボタンに縮める。

**Q2（任務の終わり方。CLAUDE.md §2「夜明け」の読み替え）** 既定 **A**
- A（おすすめ）: 4 分を「第 1 次の空襲が去る時」とし、その時に残った艇の数で評価が決まる。隊長艇の壕にいればそこで帰投、外にいれば今のほかの任務と同じく敵機 4 機が自艇だけを追う（壕へ戻れば終わり）。壕に早く入っても 4 分までは「壕で待機」で、外へ出てまた号令しに行ける。
- B: 4 分たったら自艇の位置に関係なくその場で終わる。→ B なら `MissionEndReason` に新しい終わり方を 1 つ足し、CLAUDE.md §2 にも足す（`decideMissionEnd` の分岐は jp_03 だけ）。
