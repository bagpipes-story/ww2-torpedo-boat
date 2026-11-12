# spec-v0710 — v0.7.1「アートと音②：合成の効果音」計画

基準: main 3a9e7aa（v0.7.0）。ブランチ claude/v0.7.1-sfx。読んだ物: CLAUDE.md・CHANGELOG v0.7.0・docs/03 の v0.7.0〜v0.7.2・docs/02 §7・src の scenes / systems / ui / config / core の該当ファイル・node_modules/phaser/src/sound・scripts/headless・v0700/tools/run-gates.sh。

## §0 目的と Done

- 目的: 全任務に効果音を足す。音はコードで合成し（U1。外部の音のファイルなし）、最初のタッチから鳴り、消音を切り替えられる。BGM は v0.7.2。命中スローは今のまま（U11）。遊びは 1 ビットも変えない。
- Done: 段 S0〜S5 の門（§9）が通り、Pages で実機テスト 3 項目（§10 の S5）を確かめた。

## §1 作法の要約と設計の決め

- v0.7.0 の型を音に写す: Phaser に依らない純粋な合成（`assets/*-shape` に当たる `assets/sfx-*`）＋定数（`config/*-art-config` に当たる `config/sfx-config`）＋起動時に 1 回の生成＋上限つきの再生＋音だけの `SeededRng`＋棚卸しと作法のテスト＋ヘッドレス A/B で遊びの不変を証明。
- D1（定数の置き場）: 音量・間引き・距離の帯・音の種は**見せ方の定数**で、ゲームの強さの値ではない。`config/sfx-config.ts` に置く（`*-art-config` の類。何も import しない＝tests が node の型検査で読める）。論理に効く値は `data/*.json` のまま。CLAUDE.md §2「アート」に明記する。
- D2（hook の方針）: 論理のファイルは 1 行も触らない。理由と形は §2・§13。
  - 位置つきの衝撃音は絵の層の口 3 本から。
  - 状態の合図とループは `BoatTelemetry` を読む純粋な観測器から。
  - UI は `MenuButton` から。
- D3（context）: Phaser が既に作っている `game.sound.context` を使う（§7）。自前の `AudioContext` は作らない。
- D4（時計）: 間引きは**ゲームの時計**（`PRE_STEP` の delta の和）、声の空きは `ctx.currentTime`。ヘッドレスは偽の時計なので、記録は間引きの前で取る（決定的）。
- D5（漏らさない規則）: 音は絵と HUD に従う。鳴らすのは次の 2 つだけ。見えていない敵のエンジン・機の爆音は鳴らさない（§6.3）。
  - 絵の層が既に出している出来事（閃光・水柱・爆発・沈没）
  - HUD が既に文で出している状態
- D6（既定の音量）: 初回は音オン。命中スローで音程は変えない（v0.7.2 で決める）。

## §2 構成（ファイルと層。どれも 300 行以下）

| 層 | ファイル | 中身 | DOM / Phaser |
| --- | --- | --- | --- |
| 定数 | `src/config/sfx-config.ts` | 鍵（`SFX_KEYS` 25）・表（秒・種 `SFX_SEED_*`・音量・優先・最小間隔・届く帯・系統）・`SFX_SAMPLE_RATE` 22050・声 16・距離の帯・パン・リミッタ・ループの値 | なし（import 0） |
| 合成 | `src/assets/sfx-dsp.ts` | 白色雑音（`SeededRng`）・1 極 LP/HP・双 2 次 BP・包絡・正弦の掃引・FM・正規化（頂 0.9）・端 2 ms の fade・ループの継ぎ目の重ね | なし |
| 合成 | `src/assets/sfx-recipes-guns.ts`・`-blasts.ts`・`-cues.ts`・`-loops.ts` | 鍵ごとの作り方（§4） | なし |
| 合成 | `src/assets/sfx-bank.ts` | `renderSfx(key): Float32Array`（鍵 → 作り方の表）。同じ鍵は同じ標本 | なし |
| 判断 | `src/core/sfx-mix.ts` | 距離の帯（2 乗の比べ）・音量とパン・間引き・声の割り当て（優先と古い順）。確保は作る時だけ | なし |
| 判断 | `src/core/sfx-cues.ts`（長ければ `sfx-loops.ts` を分ける） | `stepSfxCues(state, t: BoatTelemetry, dtS, sink)`: 立ち上がり・通し番号の変化 → 合図、状態 → ループの目標。読むだけ | なし |
| 再生 | `src/systems/sfx-engine.ts` | WebAudio の薄い層。**構造の型**（`SfxCtx` など）で書き、`AudioContext` の名を使わない＝`tsconfig.node` で型が通り、偽の context でテストできる | なし |
| 再生 | `src/systems/sfx-bus.ts` | ゲームに 1 つのエンジンの口: `sfxUi(key)`・`sfxAt(key, x, y)`・`sfxCue(key, gain, delayS)`・`sfxLoop(id, gain, rate)`・`registerSfxListener(pos \| null)`・`sfxSetMuted`。エンジンが無ければ何もしない | なし |
| 再生 | `src/systems/sfx-boot.ts` | Boot から 1 回。`game.sound` に `context` があればエンジンを作り、標本を `AudioBuffer` に入れる。`PRE_STEP` で時計。保険の resume（§7.2）。ここだけ DOM に触る | DOM・Phaser |
| 任務 | `src/systems/sfx-mission.ts` | `MissionSfx`（HudScene が作る）: 合図の状態・ループの開始と停止・`PAUSE`/`RESUME`/`SHUTDOWN` | Phaser（型） |
| 保存 | `src/systems/sfx-settings.ts` | `soundEnabled()`・`setSoundEnabled(v)`。鍵 `night-hunters.sound`（'0' で消音）。try/catch で例外を出さない（`progress-storage` の `leadMarkerEnabled` と同じ作法） | localStorage |

触る既存ファイル（足す行の目安）:
- `scenes/boot-scene.ts` +2（`createSfx(this.game)`。頭の注「音のアンロックは v0.7 でここに足す」を直す）
- `systems/world-art.ts` +3（`registerSfxListener(w.boat.state)` と破棄で null。fx-bus・explosion の登録と同じ R12 の形）
- `systems/fx-bus.ts` +3、`systems/explosion-fx.ts` +3、`systems/sink-fx.ts` +2
- `ui/menu-ui.ts` +2、`scenes/hud-scene.ts` +6（`update(_t, delta)` に）
- `scenes/title-scene.ts` +10、`scenes/pause-scene.ts` +8、`scenes/result-scene.ts` +2、`config/menu-config.ts` +10
- `scripts/headless/lib.mjs`・`ab-replay.mjs`・`hud-ab.mjs`（`AUDIO=1`・`NOAUDIO=1`）

触らない: `mission-scene.ts`・`mission-world.ts`・`world-visuals.ts`・`mission-effects.ts`・凍結 20 本・core の既存ファイル・`TEXTURE_KEYS`・シーンの並び。

## §3 棚卸し（出来事 → 音）

### §3.1 位置つきの衝撃音（絵の層の口。固定ステップの中から来る。最大 4 ステップ/フレーム）

| 口（file:line） | 呼ぶ側（出来事） | 最悪の頻度 | 引数 | 鍵 |
| --- | --- | --- | --- | --- |
| `fx-bus.ts:16` `emitMuzzle(x,y,big)` ← `splash-pool.ts:39` | big: `enemy-fire.ts:60`（駆逐艦の砲）・`shore-battery.ts:56`（沿岸砲）・`ally-destroyer.ts:75`（卯月）。small: `pt-gun.ts:38`（自艇・隼艇の 13/25mm）・`world-arms.ts:63`（艦への機銃・対空）・`barge-hunt.ts:83`（自艇の砲）・`pt-squadron.ts:90`（米PT の機銃） | 自艇 Elco 80 は 630 発/分＝10.5/秒、T-14 7.5/秒、T-38 3.7/秒。jp_04 ハード（米PT 3＋卯月＋自艇）で合わせて 約 40/秒・同じフレームに複数 | 位置・big | big: 近い帯は `gun_near`、遠い帯は `gun_far`。small: `mg` |
| `fx-bus.ts:11` `emitSpray(x,y,hit)` ← `splash-pool.ts:25` | `enemy-fire.ts:47,63`・`shore-battery.ts:60`・`pt-gun.ts:44,47`・`world-arms.ts:67,126`・`barge-hunt.ts:86,89,99`・`pt-squadron.ts:94,100`・`ally-destroyer.ts:80`・`evac-flights.ts:42`・`world-hazards.ts:41` 経由（`enemy-seaplane.ts:115` 爆弾の外れ・`air-strike-flight.ts:117` 同・`friendly-fire.ts:141` 掃射・`storm-front.ts:90-91` 波の叩きつけ） | 発砲と同じ桁（約 40/秒）＋爆弾。爆弾は jp_03 ハードで 3 編隊 × 4 機が約 1 秒に | 位置・hit（橙） | hit: `splash_l`、外れ: `splash_s` |
| `explosion-fx.ts:67` `play(x,y,dud,torpedo)` ← `mission-effects.ts:35` ← `mission-scene.ts:81,87,91,99,114` | 魚雷の命中／不発、撃破（大発・米PT・僚艇・輸送船・輸送隊・隼艇・撃墜）、自艇・僚艇の被弾（small）、自艇の沈没、座礁（dud） | 数回/秒まで（枠 6） | 位置・dud・torpedo | `torp_hit`（torpedo で dud でない）、`blast_l`（大）、`blast_s`（dud・small） |
| `explosion-fx.ts:94` `secondary(x,y)` ← `sink-fx.ts:74` | 沈没の 2 次の爆発（艦 5 回・小艇 2 回） | 1 沈没 5 回 | 位置 | `blast_s`（音量 0.7・間隔 0.3 秒） |
| `sink-fx.ts:47` `start(…, ship)` ← `fire-fx.ts:148` | 沈み始め（艦・小艇） | まれ | 位置・ship | `sink`（小艇は rate 1.3） |

- 自艇の音は距離 0 で一番大きい帯になる（自艇と敵の区別の引数は要らない）。
- 既知の穴: 大発の 13mm の発砲は `barge-hunt.ts:93` が `onFire: () => {}` で、絵の層を通らない。v0.7.1 の既定は着弾音だけ。S2 で足すなら絵を変えない音だけの 1 行にする（`splashes.muzzle` は火花が増えて見た目が変わるので使わない）。
- 味方機の掃射も発砲の口が無い。水柱の `splash_s` と `drone` で表す。

### §3.2 状態の合図（`BoatTelemetry` の立ち上がり・通し番号。HudScene が毎フレーム 1 回。各合図は冷却つき）

| 出来事 | テレメトリの欄 | 鍵（変化） | 冷却 |
| --- | --- | --- | --- |
| 魚雷の発射（狙う艦の無い魚雷も） | `arms.torpedoesAboard` が減った（`torpedoesLeft` は輪の中・敵がいないと 0 を見せるので使わない） | `torp_launch`（一斉は 1 本ずつ） | 0.15 秒 |
| 発見された！ | `playerDetected` 偽 → 真 | `alarm` | 4 秒 |
| 探照灯に照らされた | `illuminated` 偽 → 真（`starLit` でない時） | `light_on` | 3 秒 |
| 星弾・照明弾 | `starLit` 偽 → 真、`planeFlareOn` 偽 → 真、`friendlyOutcome` が識別済みに | `flare_pop` | 2 秒 |
| 自艇の被弾 | `hp` が減った（始めのフレームは数えない） | `hull_hit`（爆発音は §3.1 が出す） | 0.2 秒 |
| 火災・消火 | `onFire` 偽 → 真 / 真 → 偽で沈んでいない | ループ `fire`（§5）／消火は `smoke` を rate 1.6 | — |
| 煙幕の展開 | `smokeLeftS` 0 → 正 | `smoke` | — |
| 弾倉の交換 | `arms.reloadN`・`gunReloadLeftS` 0 → 正 / 正 → 0 | `reload`（終わりは rate 1.3） | 0.5 秒 |
| 機関の損傷 | `engineDamaged` 偽 → 真 | `engine_cough` | — |
| 機関の不調（jp_05） | `engine.eventSeq` が変わった（WARN・FINAL・LIMP・RECOVER） | `engine_cough`（段で rate 1.0 / 0.9 / 0.8。回復は `ui_tap` を低く） | — |
| 燃料切れ・漂流 | `fuelEmpty` 偽 → 真 | `engine_cough` を rate 0.7、ループ `engine` は 0 へ | — |
| 座礁 | `shallowState` が `SHALLOW_GROUNDED` に | `blast_s` を rate 0.6（こすれる低い音。爆発音は §3.1 の dud） | — |
| 帰投せよ | `callFlags` 0 → 非 0 | `bell` 1 打 | — |
| 夜明け・空襲の決着 | `dawn.reached` 偽 → 真 | `bell` を rate 0.7 で 1 打 | — |
| 爆弾が落ちてくる | `planeBombAir` 偽 → 真、`dawn.threat`・`patrol.threat` が `AS_T_FALLING` に | `bomb_fall` | 0.6 秒 |
| 空襲の予告（jp_03） | `evac.annSeq` が変わった | `alarm` を rate 0.7（サイレンらしく） | 3 秒 |
| ［切替］（jp_03） | `evac.seatSeq` が変わった | `ui_tap` | — |
| 米PT の雷撃（jp_04） | `landing.eventSeq` が変わり `eventKind` が `LE_CALM`・`LE_HURRIED`・`LE_LIT_SALVO` | `torp_launch` を音量 0.6（HUD の報告と同じ時） | — |
| 揚陸完了（jp_04） | `landing.eventKind` が `LE_DONE` | `bell` 1 打 | — |
| 味方機の識別の要求 | `friendlyPhase` が `FF_CHALLENGE` に | `alarm` を rate 1.3・音量 0.6 | — |

- 始めのフレームは前回値を写すだけで鳴らさない（火災つきで出撃する夜に「火が付いた」を鳴らさない。ループは鳴る）。
- 撃墜・撃沈・僚艇の沈没・被雷の爆発は §3.1 の口が出すので、ここで重ねない。

### §3.3 シーンと UI

| 場所 | hook | 鍵 |
| --- | --- | --- |
| Title・Briefing・Result・Pause の矩形ボタン全部 | `menu-ui.ts:146` `onUp` の決定の直前に 1 行（無効・取り消しは鳴らない） | `ui_tap` |
| 一時停止を開いた | `pause-scene.ts` の `create` に 1 行 | `ui_tap` を低く |
| Result | `result-scene.ts:152` `create`: `r.returned` なら `bell` 2 打（0.5 秒ずらす）、でなければ `bell` を rate 0.5 で 1 打（曲ではなく合図。U-C） | `bell` |
| HUD の丸ボタン | 鳴らさない（押した結果の音が出る） | — |

### §3.4 任務ごとの確かめ（S2〜S4 の門の表。9 任務＋ハード）

- us_01: 僚艇・暴風（`rain`・叩きつけ）・駆逐艦の砲と探照灯と星弾・夜明けの空襲 4 機（`drone`・`bomb_fall`）
- us_02: 駆逐艦の隊と輸送船・味方機（識別・掃射）・暴風・魚雷の命中と不発・艦への機銃
- us_03: 大発の掃討（自艇の砲 10.5/秒・弾倉 120 発／3.2 秒）・沿岸砲・大発の 13mm（既知の穴）・夜明け
- jp_01: 米PT の機銃・輸送隊・13mm の弾倉・隼艇（ハード）
- jp_02: 夜の哨戒機（`drone` は `patrol.phase`・`distM`）・夜の出撃の爆弾
- jp_03: 予告の合図・編隊の爆弾（最大 12 発が約 1 秒）・18 隻・対空・［切替］・昼
- jp_04: 米PT の雷撃・卯月の砲と探照灯・輸送船の被雷と沈没・揚陸完了
- jp_05: 機関の不調の 3 段・米PT の追撃
- jp_06: 米駆逐艦（主砲 15 km）・魚雷
- 全任務: エンジン・海・発見・煙幕・火災と消火・座礁・燃料切れ・帰投せよ・Result

### §3.5 鳴らさない物（v0.7.1）

- 見えていない敵のエンジン
- 走っている魚雷（自艇・敵）
- 探照灯の連続音
- 僚艇・輸送隊のエンジン
- 「敵影あり」の合図
- 命中スローの音程変化
- BGM

## §4 アセット（25 本。22,050 Hz・モノ・`Float32Array`。頂 0.9 に正規化・端 2 ms の fade）

| 鍵 | 秒 | 作り方（1 行） |
| --- | --- | --- |
| `mg` | 0.12 | 白色雑音の短い 2 連の破裂（BP 900〜3k Hz・指数の減衰 25 ms）＋150 Hz の正弦の一打。再生のたびに rate ±8%（音だけの乱数） |
| `gun_near` | 0.6 | 雑音を LP の掃引 4k → 200 Hz（減衰 0.25 秒）＋正弦 90 → 45 Hz の一打＋最初の 5 ms の鋭い立ち上がり |
| `gun_far` | 0.9 | 雑音 LP 250 Hz（立ち上がり 40 ms・減衰 0.5 秒）＋60 Hz の正弦。こもった遠雷 |
| `splash_s` | 0.35 | 雑音 BP 1〜5k Hz・立ち上がり 5 ms・減衰 0.15 秒。rate ±12% |
| `splash_l` | 0.8 | 70 Hz の正弦の一打＋雑音 BP 300〜3k Hz（減衰 0.4 秒）。命中・至近弾・爆弾の水柱 |
| `blast_s` | 0.5 | 雑音 LP の掃引 2k → 150 Hz＋正弦 110 → 50 Hz |
| `blast_l` | 1.6 | 正弦 120 → 30 Hz（減衰 0.8 秒）＋雑音 LP の掃引 3k → 100 Hz＋尾のぱちぱち（乱数の小さな破裂） |
| `torp_hit` | 2.2 | `blast_l` の芯を低く長く（正弦 80 → 25 Hz）＋0.25 秒遅れて立つ水の柱（雑音 BP 500〜4k Hz・立ち上がり 0.3 秒・減衰 1.2 秒）。ご褒美の音 |
| `torp_launch` | 0.7 | 雑音 BP の掃引 2.5k → 400 Hz（圧縮空気）＋0.3 秒後の小さな水音 |
| `hull_hit` | 0.3 | FM の金属音（搬送 320 Hz・比 1.4・指数の減衰 0.12 秒）＋短い雑音 |
| `alarm` | 0.6 | 2 音（400 Hz・520 Hz）の角ばった波に LP 2k Hz。0.3 秒ずつ |
| `light_on` | 0.5 | 低い打音（雑音 LP 600 Hz・30 ms）＋120 Hz に倍音のうなり 0.4 秒 |
| `flare_pop` | 1.2 | 柔らかい一打（正弦 200 → 90 Hz）＋雑音 HP 3k Hz のしゅうっ（減衰 1.0 秒） |
| `bomb_fall` | 1.2 | 正弦の掃引 1.8k → 600 Hz＋6 Hz の揺れ。音量は立ち上がっていく |
| `reload` | 0.35 | 金属の 2 打（雑音 BP 2〜6k Hz・各 15 ms・間 0.18 秒） |
| `smoke` | 1.0 | 雑音 HP 2k Hz・立ち上がり 0.15 秒・減衰 0.8 秒 |
| `ui_tap` | 0.06 | 正弦 880 → 660 Hz・減衰 40 ms |
| `bell` | 1.4 | FM の鐘（搬送 660 Hz・比 2.76・指数の減衰 1.2 秒） |
| `engine_cough` | 0.8 | 低い破裂 3 つ（間は不揃い。雑音 LP 300 Hz＋70 Hz の正弦） |
| `sink` | 2.5 | 泡（雑音 LP 400 Hz を 9 Hz の乱れた AM）＋きしみ（正弦 80 → 50 Hz） |
| ループ `engine` | 1.0 | 28 Hz の点火の拍（整数周期）の倍音 6 本＋雑音 LP 500 Hz の AM。継ぎ目は周期で合う |
| ループ `sea` | 4.0 | 桃色寄りの雑音（LP 1.2k Hz）に 0.25 Hz・0.5 Hz の AM。末尾 0.3 秒を頭に等電力で重ねる |
| ループ `fire` | 2.0 | 雑音 LP 800 Hz の揺らぎ＋乱数のぱちぱち。継ぎ目は重ね |
| ループ `rain` | 2.0 | 雑音 HP 2.5k Hz（雨）＋雑音 BP 200〜500 Hz のゆっくりした揺れ（風）。継ぎ目は重ね |
| ループ `drone` | 1.5 | 96 Hz の鋸波寄り（倍音 8 本・整数周期）＋4 Hz のうなり（2 本のずれ） |

- 合計 約 28.3 秒 ＝ 約 62 万標本 ＝ 約 2.5 MB（`AudioBuffer` に写したら `Float32Array` は捨てる）。上限は 70 万標本で、`tests/sfx-inventory` が固定する。
- 乱数は音だけの `new SeededRng(SFX_SEED_<KEY>)`。ゲームの系列は 1 つも使わない。再生時の rate の揺れはエンジンの `SFX_SEED_PLAY`。

## §5 ループ（任務の間だけ。開始で 5 ノードを作り、終了で stop＝1 任務 1 回の確保）

読む場所は `HudScene.update(_t, delta)` → `MissionSfx.update(telemetry, delta)`。テレメトリは Mission が同じフレームに書き終えている。確保しない。ノードへ書くのは **10 Hz・目標が変わった時だけ**（`setTargetAtTime(v, now, 0.08)`。音量の差 > 0.01・rate の差 > 0.005）。

| ループ | 音量の目標 | rate |
| --- | --- | --- |
| `engine` | `targetStep`: 停止 0.10・静音 0.16・巡航 0.38・全速 0.60。`fuelEmpty` と沈没は 0。静音が本当に静か＝隠密の手掛かりを音で補う | 0.75 ＋ 0.75 ×（`speedMps` ÷ 艇の最大。最大は HudScene が任務の艇の data から 1 回渡す）。`engineDamaged` は ±6%・3 Hz の揺れ（時計の sin）。`engine.stage` の WARN / FINAL / LIMP は ±4 / 8 / 12% |
| `sea` | 0.10 ＋ 0.14 × 速さの割合。暴風の中は ＋0.10 | 1 |
| `fire` | `onFire` で 0.35（立ち上がり 0.3 秒・戻り 0.5 秒） | 1 |
| `rain` | `stormState`: INSIDE 0.40・NEAR 0.15・ほか 0 | 1 |
| `drone` | 次の出どころの最大を取る。水上機は `planePhase` が接近〜去るの間、`planeDistM` の帯で 0.10〜0.40。味方機は `friendlyPhase` が CHALLENGE・STRAFE で 0.40、LEAVING で 0.20。夜明けの空襲は `dawn.threat` が INBOUND なら `inboundDistM` の帯、ORBIT・RUN・FALLING は 0.45、REST は 0.10。哨戒機は `patrol.phase` が PASS・ORBIT なら `distM` の帯、`patrol.threat` は空襲と同じ | 0.9〜1.15（RUN・FALLING で上げる） |

- 未確認: jp_03 の編隊の「飛んでいる」を表すテレメトリの欄。S3 で `EvacTelemetry` を確かめる。無ければ world-art の側で `w.evac` の見えている編隊の数を読む 1 行（読むだけ）を足す。
- 一時停止: HudScene の `PAUSE` でループの束の音量を 0 へ（0.15 秒）、`RESUME` で戻す、`SHUTDOWN` で 5 本を stop。鳴り始めた単発は鳴り終わるまで（最長 2.5 秒）。
- context が running でない間はループを作らない。10 Hz の更新で running になったのを見て作る（`?debug` の直行で最初のタッチが Mission でも鳴る）。

## §6 聞き手（距離・パン・漏らさない規則）

### §6.1 聞き手と見える範囲

- 聞き手は自艇（`w.boat.state`。jp_03 は座席の隊長艇）。カメラは回らず自艇を追うので、画面の左右＝世界の x。
- 見える範囲: 論理 1280〜1584 × 720 px。既定ズーム 0.75 で 約 1,700〜2,100 × 960 m、見張り 0.5 で 約 2,560〜3,170 × 1,440 m。視程は 900 m 前後。
- 駆逐艦の主砲の射程は 10,000 m（米 15,000 m）、副砲 2,000 m、探照灯 3,000 m、星弾 6,000 m。自艇を撃つ砲のほとんどは画面の外から来る。

### §6.2 式（平方根なし。距離の 2 乗を閾値の 2 乗と比べる）

| 帯 | 距離 | 音量 |
| --- | --- | --- |
| 0 | ≤ 400 m | 1.0 |
| 1 | ≤ 1,500 m | 0.55 |
| 2 | ≤ 4,000 m | 0.30 |
| 3 | ≤ 16,000 m | 0.16 |
| — | それより遠い | 捨てる |

- 系統ごとの届く帯: `splash_s` は帯 1 まで、`mg`・`splash_l` は帯 2 まで、砲・爆発・沈没は帯 3 まで。
- 大砲は帯 0〜1 が `gun_near`、帯 2〜3 が `gun_far`（こもった遠雷＝距離が音色で分かる）。
- パン: `clamp(dx / 900, −1, 1) × 0.7`（900 m は既定ズームの画面の半幅。ズームでは変えない）。自艇から 30 m 以内は 0。`StereoPannerNode` が無い端末は中央。

### §6.3 漏らさない規則（D5）と確かめた所

- 発砲の閃光は今も視程に関係なく世界に描かれている（画面の外は見えないだけ）。音で増える情報は「画面の外で誰かが撃った・左右どちらか」。
- 発砲が起きる時、HUD は既に文で知らせている。
  - 駆逐艦: 発見された・照らされている
  - 沿岸砲: `batteryAlerted`
  - 米PT: 脅威の行と矢印
  - 卯月: 「卯月が照らした」
  - 雷撃: 見張りの報告
- 画面外マーカー（敵・敵機）が既に方向を出しているので、左右のパンは既にある情報の範囲。既定は聞かせる（U-B）。
- 鳴らさない: 見えていない敵のエンジン、HUD が黙っている間の機の爆音。水上機が見つける前の哨戒 `SP_PATROL` は `drone` 0。S3 で HUD の行が出る段と揃える。
- 見失った時の合図は入れない（HUD の「未発見」だけ）。

## §7 エンジン（WebAudio）

### §7.1 context は Phaser の物を使う

- `phaser-config.ts` に `audio` の鍵は無いが、`SoundManagerCreator` は既定で `WebAudioSoundManager` を作る。つまり**今も `AudioContext` が 1 つある**。
- Phaser が既に持つ動き:
  - `unlock()`: body の touchstart・touchend・mousedown・keydown で `context.resume()`
  - `pauseOnBlur = true`: BLUR で suspend、FOCUS で resume
  - `onGameVisible`: iOS17/18 の復帰の suspend → resume
  - 毎フレームの `onFocus`: interrupted の resume
- 2 つ目の context は作らない。`game.sound` に `context` が無い（NoAudio・HTML5）なら**エンジンは null で全部何もしない**。
- 自前のつなぎ: 声 → 単発の束 ／ ループ → ループの束 → `DynamicsCompressor`（閾値 −10 dB・比 12・立ち上がり 3 ms・戻り 250 ms）→ master（0.8・消音は 0）→ `context.destination`。Phaser の内部は `.context` しか読まない。

### §7.2 unlock と復帰

- 最初のタッチは Title（`?debug` の直行は Mission）。Phaser の unlock がそのタッチで resume する（iOS は touchend が効く）。
- 保険: `sfx-boot` が body に passive の touchend を 1 つ付けたままにし、`ctx.state !== 'running'` なら `resume()`（着信・Siri・長い裏の後）。消音を解く時のタップでも resume する。

### §7.3 単発

- 声は 16 本を起動時に作る（`GainNode` → `StereoPannerNode` → 束。ずっと使い回す）。
- 1 発ごとに作るのは `createBufferSource()` の 1 個だけ（仕様で使い捨て。閉包・`onended`・オブジェクトのリテラルは作らない）。声の空きは `ctx.currentTime` と長さで数える。
- 順に落とす:
  1. 消音か、context が running でない → 捨てる（数えるだけ）
  2. 鍵ごとの最小間隔（ゲームの時計）
  3. 距離の帯
  4. 声が満ちていれば、優先が低くて古い声を stop して奪う（同じか高ければ新しい方を捨てる）
- 優先: 合図・UI（奪われない） > 爆発・魚雷 > 砲 > 水柱。
- 最小間隔: `mg` 0.07 秒・`gun_near` 0.12・`gun_far` 0.25・`splash_s` 0.08・`splash_l` 0.15・`blast_s` 0.10・`blast_l` 0.20（値は `sfx-config`。S5 で詰める）。
- 見込み: 新しいノードは最悪でも 約 45 個/秒、ふつうは 5〜15。

### §7.4 起動

- Boot の `create` で 25 本を合成し `ctx.createBuffer(1, n, 22050)` に写す（`getChannelData(0).set`）。suspended でも作れる。
- 目安は Boot ＋60 ms 以内（ヘッドレス k 1.09）。超えたら Title の最初の数フレームに 1 本ずつ分ける（`buildNext()`）。

## §8 シーンと消音ボタン

- 保存: `night-hunters.sound`（既定オン。Safari とホーム画面のアプリは保存が別）。
- Title（`title-scene.ts`）: 右上の空き。ロゴは中央 y 52、タブは y 108 から。`MenuButton` を x = `GAME_WIDTH − HUD_MARGIN − 200`、y 20、200 × 80 px（iPhone 15 で 約 109 × 44 pt）に置く。題は「音: オン」⇄「音: オフ」。定数は `menu-config`（`TITLE_SOUND_*`）。`SHUTDOWN` で destroy。
- Pause（`pause-scene.ts`）: 下の段の中央。左「任務をやめる」（x 24〜344）と右「再開」（W−344〜W−24）の間。x = `GAME_WIDTH/2 − 160`、y = `RESULT_BUTTON_Y`、320 × 96。下に `back()` を 1 枚。W 1280 で左右に 136 px の間が残る。
- HUD には置かない（`hud-ab` を変えない・右端は技能の列で満杯）。
- やり直し・任務をやめる: 世界の破棄で聞き手が null、Hud の `SHUTDOWN` でループが止まる。エンジンは世界の物を握らない（破棄済みの物への静的な取っ手なし＝R12 と同じ）。

## §9 テストと門

### §9.1 足すテスト（vitest。node の型検査で通る＝DOM と Phaser を引かない）

- `tests/sfx-synth`: 25 本それぞれについて
  - 長さ＝秒 × 22050、NaN なし
  - 頂 0.5〜1.0、直流 < 0.02
  - 単発は両端 < 1e-3
  - 2 回作って同じ。16 bit に丸めた指紋（FNV）を固定（最下位ビットの揺れに強く）
  - 系統ごとの RMS の帯、零交差の数の順（`gun_far` < `gun_near`、`splash_l` < `splash_s`）
  - ループは継ぎ目（|x[0] − x[n−1]| < 0.05、頭と末尾 10% の RMS の差 < 1.5 dB）
  - 合成の壁時計 < 400 ms
- `tests/sfx-inventory`（`art-inventory` の型）:
  - 鍵 25 本を固定（足す・消すは表と一緒に）
  - 表の欄がそろう、種は重ならない、合計 ≤ 70 万標本
  - 合図の表の鍵は全部ある、使われない鍵は無い
  - `TEXTURE_KEYS` とシーンの並びは今のまま
- `tests/sfx-rules`（`art-rules` の型。`src/**/sfx-*.ts` に自動で効く）:
  - `Math.random` なし。`new SeededRng(` の引数は `SFX_SEED_*` だけ。ゲームの系列の名なし
  - `update`・`step`・`tick`・`play`・`emit`・`cue` の本体に `new`・`.map(`・`.filter(`・オブジェクトのリテラルなし
  - 論理の状態への代入なし
  - assets・core・config の sfx は `AudioContext`・`window`・`document`・`Phaser` を書かない
  - **import の許可表**: `sfx-bus` を import してよいのは boot-scene・world-art・fx-bus・explosion-fx・sink-fx・menu-ui・hud-scene・title-scene・pause-scene・result-scene・sfx-* だけ（論理から音へ届く道が無いことの証）
  - hook の行の pin（5 ＋ 1 ＋ 各シーン）
  - 触ったファイルは 300 行以下
- `tests/sfx-mix`: 帯の境・音量の単調・パンの範囲・間引き・声の上限・優先の奪い方。
- `tests/sfx-cues`: 偽のテレメトリで §3.2 の各行が 1 回だけ鳴る・冷却・始めのフレームは鳴らない・ループの目標・一時停止で 0。
- `tests/sfx-engine`: 偽の context で
  - running でなければノードを作らない
  - 消音で作らない
  - context なしで全部何もしない
  - 声 16 を超えない
  - ループの開始と停止が対になる
  - 10 Hz より多く param に書かない

### §9.2 直す既存のテスト

- 凍結 20 本・setup の snapshot・`world-visuals`・`art-inventory` は**触らない設計**。
- `tests/fx-art*` の fx-bus・explosion-fx・sink-fx・world-art の pin は `toContain` と 300 行なので通る見込み（S1 で確かめる）。
- Title・Pause の置き方のテストがあれば矩形の重なりを 1 件足す。

### §9.3 ヘッドレスの門

A＝3a9e7aa を同じビルド番号（`VITE_BUILD_REF=main VITE_BUILD_SHA=3a9e7aa`）で作った `v0710/base-3a9e7aa`。道具は `v0700/tools/run-gates.sh` を `v0710/tools/` に写して直す。

- 遊びの不変: `ab-replay`（`CAM=1`）all 58・jp04base 8・jp03 4、`hud-ab` base 16・jp04base 8・jp03 4 が same:true。`g2.sh`（`G6=1 ALLY=1 EVAC=1`）OK 37 DIFF 0。これを音の 3 つの状態で回す:
  1. 既定（context が suspended）
  2. `AUDIO=1`（`--autoplay-policy=no-user-gesture-required`。context が running）
  3. `NOAUDIO=1`（init で `AudioContext` を消す＝エンジン null）
- `tex-ab`: 鍵・寸法が同じ（絵は触らない）。
- `scripts/headless/sfx-probe.mjs`（新）: 任務の窓ごとに、間引きの前の記録（時刻・鍵・音量・パン・rate）と、鍵ごとの回数・落とした数・同時の声の最大を出す。§3.4 の表の鍵が全部 1 回以上鳴ること。
- `scripts/sfx-mix.ts`（新・node）: probe の記録を純粋な mix で波形に直し、リミッタ前の頂・1.0 を超える標本の割合（< 1%）・RMS を報告する。偽の時計では AnalyserNode が意味を持たないための代わり。`WAV=1` で scratchpad に WAV を書く（聴く・波形を見る用。repo には入れない）。
- `scripts/headless/sfx-live.mjs`（新）: rAF を止めずに実時間で Title → タップ → us_02 を 10 秒。確かめるのは:
  - `ctx.state` が running
  - AnalyserNode の頂が 0 より大きく 1 未満
  - ページのエラー 0
  - 生きているノードが上限の内
- 速さ:
  - `art-perf` を A/B で（既定の状態）: 描いたフレームの p95 ≤ ＋5%
  - `AUDIO=1` で実時間に合わせた窓（us_03 の連射・jp_03 ハードの最後の波・us_02 ハードの星弾）: p95 ≤ ＋5%
  - `heap.mjs` を `AUDIO=1` で 120 秒: 後半の増え方が A ＋2 KB/秒 以内
  - Boot の `create` ≤ ＋60 ms
  - JS の束 ≤ ＋30 kB（gzip）

## §10 段（どれも 1 commit。版は 0.7.1 のまま、段の名で刻む＝v0.7.0 と同じ）

- **S0 骨組みと道具**（見た目も音も遊びも変えない）
  - 版 0.7.1。docs/03 の v0.7.1 の行（段 S0〜S5）。
  - `config/sfx-config`（表の形と 3 本ぶん）・`assets/sfx-dsp`・`sfx-bank`（`ui_tap`・`mg`・`blast_l`）・`core/sfx-mix`。
  - tests: `sfx-synth`・`sfx-inventory`・`sfx-rules`・`sfx-mix`。
  - 道具: 基準のビルド、`run-gates.sh` の写し、`lib.mjs` の `AUDIO`/`NOAUDIO`、`sfx-mix.ts` の WAV 出し。
  - 門: 新しいファイルはどこからも import されず、束ねは sw.js を除いてバイトで同じ。A/B 全部 same。
- **S1 鳴る縦切り**（一番の不確かさ＝iOS の unlock を先に。push して実機）
  - `sfx-engine`・`sfx-bus`・`sfx-boot`・`sfx-settings`。Boot の 2 行。`MenuButton` の `ui_tap`。Title の消音ボタン。
  - `emitMuzzle` の small → `mg`、`ExplosionFx.play` → `blast_l`。距離の帯は仮（world-art の聞き手の登録）。
  - tests: `sfx-engine`。門: §9.3 の遊びの不変（3 状態）・`sfx-live`。
  - 実機の確認（早い 3 項目）:
    1. Title のボタンで音が鳴るか（マナーモードを切って）
    2. us_02 で機銃と魚雷の命中が鳴るか
    3. 消音が効くか・ホームへ戻って再開しても鳴るか
- **S2 砲・着弾・爆発の全部**
  - 残りの単発の作り方（`gun_near`・`gun_far`・`splash_s/l`・`blast_s`・`torp_hit`・`sink`）。
  - 口 5 行を全部。距離の帯とパン・間引き・声の奪い方。大発の 13mm の穴の判断。
  - `sfx-probe`。門: probe で 9 任務の衝撃音・声の最大 ≤ 16・mix の頂。
- **S3 ループ**
  - `sfx-recipes-loops`・`core/sfx-cues` のループの半分・`sfx-mission`・HudScene の update と `PAUSE`/`RESUME`/`SHUTDOWN`。Pause の消音ボタン。
  - tests: `sfx-cues`（ループ）・`sfx-engine`（10 Hz）。門: heap・実時間の perf。
- **S4 合図・UI・Result**
  - §3.2 の全行・§3.3。残りの単発（`torp_launch`・`hull_hit`・`alarm`・`light_on`・`flare_pop`・`bomb_fall`・`reload`・`smoke`・`bell`・`engine_cough`）。
  - 門: probe で §3.4 の表が全部埋まる。
- **S5 仕上げ**
  - mix の詰め（音量の表・リミッタ・うるささ）。全部の門。
  - docs: CLAUDE.md（§2「アート」の行に `sfx-config`、§4、§7 の「音を自動再生」の行を「最初のタッチまで鳴らさない・止まっている context に積まない」に、変更履歴 1 行）、docs/02 §7 に音の方針、docs/03、CHANGELOG。
  - Pages と実機 3 項目:
    1. us_02: 静音と全速でエンジンが変わり、発見の警報・探照灯・砲声と水柱・魚雷の発射と命中が聞き分けられるか・うるさくないか
    2. jp_03 ハードか us_03 の連射で FPS が落ちないか・音が割れないか
    3. 消音を Title と一時停止で切り替えて覚えているか・ホームへ戻る／着信の後に音が戻るか

## §11 リスクと §7 の警告（構造から）

| # | 壊れ方 | 避け方 |
| --- | --- | --- |
| R1 | 1 発ごとのノードの確保で GC | 声の `Gain`・`Panner` は起動時に 16 組。1 発は `createBufferSource` 1 個だけ（発射の時だけの確保＝世界の今の約束と同じ）。最小間隔で 約 45 個/秒まで。heap の門 |
| R2 | 止まっている context に積む（unlock で一斉に鳴る・ヘッドレスで溜まる） | running でなければ単発は捨て、ループは作らない |
| R3 | 毎フレームの `setTargetAtTime` で自動化の出来事が溜まる | 10 Hz・変化のある時だけ。テストで固定 |
| R4 | 声が多すぎる・音が割れる | 声 16・優先・最小間隔・正規化 0.9 × 鍵の音量 ≤ 0.9・リミッタ・master 0.8。mix の門（頂・1.0 超えの割合） |
| R5 | iOS のマナーモードで鳴らない | iOS の標準に従う（U-A）。実機テスト項目に「マナーモードを切る」と書く |
| R6 | 着信・裏から戻って鳴らない（interrupted） | Phaser の復帰＋保険の touchend の resume |
| R7 | 古い iOS に `StereoPannerNode` が無い・22,050 Hz の buffer | パンは無ければ中央。22,050 は古い WebKit の下限ちょうど（それ以上なら可）。`createBuffer` が投げたらエンジン null |
| R8 | 遅れ | 単発は `start(0)`。buffer は起動時に作り終える。合成は Boot の 1 回 |
| R9 | オフラインの PWA | 音のファイルなし。事前キャッシュは JS だけ（束 ＋30 kB 以内） |
| R10 | 電池 | Title ではループなし。任務の終わりで stop。裏は Phaser が suspend |
| R11 | イヤホンで大きすぎる | master 0.8・リミッタ・全速のエンジン ≤ 0.6・最初の音は 0.3 秒の立ち上がり |
| R12 | 音が手掛かりを隠す | 合図は奪われない最優先。爆発でリミッタがループを下げる（自然な ducking）。合図に冷却 |
| R13 | 命中スロー | 既定は何もしない（テレメトリにスローの欄が無い。U11 のまま。v0.7.2 で決める） |
| R14 | 音が論理を変える | `sfx-rules` の import の許可表・読むだけ・ゲームの乱数なし・A/B を 3 状態で |
| R15 | Boot が遅くなる | 22,050 Hz・約 28 秒。＋60 ms の門。超えたら分けて作る |
| R16 | 小数の差でハッシュが揺れる | 16 bit に丸めた指紋 |
| R17 | 300 行・凍結・pin | 触るのは絵の層と scenes / ui だけ（§2）。`mission-scene` は触らない |

## §12 ユーザーに聞く決め（既定で先に進める）

- **U-A マナーモード**: 本体の消音スイッチが入っていると鳴らない（iOS の標準）でよいか。既定は**従う**。代わりの案は `navigator.audioSession.type = 'playback'` で鳴らす（ほかのアプリの音楽を止めることがある）。
- **U-B 画面の外の音**: 見えない所の砲声・爆発を、距離で小さく・左右つきで聞かせてよいか。既定は**聞かせる**（HUD が既に知らせている出来事だけ。見えていない敵のエンジン・機の音は鳴らさない）。代わりの案は左右なし。
- **U-C 任務の終わりの合図**: Result で鐘（帰投 2 打・それ以外は低く 1 打）を鳴らしてよいか。既定は**鳴らす**（曲ではない。BGM は v0.7.2）。

## §13 意図した設計とコードのずれ

1. **(c) 絵と同じ場所ごとに hook は無理。** `mission-scene.ts` はちょうど 300 行、`pt-squadron.ts` 300、`arms-step.ts`・`barge-hunt.ts` 290、`mission-world.ts` 283。凍結 20 本に `torpedo-pool`・`air-strike-flight`・`gun-battery` があり、`tests/world-visuals` は行の並びを固定している。絵の層の口 3 本＋テレメトリの観測器にする。
2. **Sfx は世界ごとの物にしない。** エンジンはゲームに 1 つ（`AudioContext` が 1 つ）。世界ごとに登録して破棄で null にするのは聞き手の参照（`w.boat.state`）だけで、任務の合図は `HudScene` が持つ。
3. **Phaser は今も `AudioContext` を作っている。** `phaser-config` に `audio` の鍵が無くても `WebAudioSoundManager` が既定で、unlock・`pauseOnBlur`・iOS17/18 の復帰・interrupted の resume を持つ。自前の context と unlock は作らず `game.sound.context` を使う（保険の resume だけ足す）。
4. **(b) カメラ相対の距離減衰は合わない。** カメラは回らず自艇を追うので、聞き手は自艇で足りる。画面は約 1.8 km、主砲は 10 km（`data/enemies.json` の `range_m: 10000`）。
5. **(e) ヘッドレスは rAF を止めて `game.headlessStep` で進める。** `game.loop.now` も進まないので、音の時計は `PRE_STEP` の delta を積む。`chromium.launch()` に引数が無く、今は context が suspended のまま。`AUDIO=1`・`NOAUDIO=1` の切り替えを道具に足す。
6. **毎フレームの `sfx.update` の置き場は `HudScene.update`。** テレメトリを持つのはここ。今の署名は引数なしなので delta を足す。任務の一時停止は Hud も止めるので、`PAUSE`/`RESUME` でループを絞る口が要る。
7. **遊べる任務は 13 ではなく 9。** `tests/boot-loop` が 9 を固定している。ハードの組は 7（合わせて 16）。
8. **大発の 13mm は発砲の口が空。** `barge-hunt.ts:93` が `onFire: () => {}` で、絵の層を通らない。既定は着弾音だけ。足すなら絵を変えない音だけの 1 行。
9. **テレメトリに命中スローの欄が無い。** 既定は音程を変えない。
10. **`tsconfig.node` に DOM が無い。** `sfx-config` は何も import しない（`title-layout-config` の作法）。エンジンは構造の型で書き、DOM に触るのは `sfx-boot.ts` の 1 本だけにする。

### Critical Files for Implementation
- /home/user/ww2-torpedo-boat/src/systems/fx-bus.ts
- /home/user/ww2-torpedo-boat/src/systems/explosion-fx.ts
- /home/user/ww2-torpedo-boat/src/core/boat-telemetry.ts
- /home/user/ww2-torpedo-boat/src/scenes/hud-scene.ts
- /home/user/ww2-torpedo-boat/node_modules/phaser/src/sound/webaudio/WebAudioSoundManager.js
## §14 lead の補足（iOS の調べ `ios-audio-research.md` の反映。spec の本文とずれる所はこちらが勝つ）

- L1（消音スイッチ・U-A の既定）: 従う。`sfx-boot` で 1 回、`if ('audioSession' in navigator) navigator.audioSession.type = 'ambient'`（try/catch。Chrome には無い）。silent の `<audio>` の裏技と `playback` は使わない。Title の「音」ボタンの下に小さい字で「音が出ない時は本体の消音を確かめる」（ページからスイッチは読めない。R2）。
- L2（unlock・R1）: 効くのは touchend・pointerup・click（touchstart は効かない）。Phaser の unlock（body の touchend）に任せ、保険に window の capture の `touchend`・`pointerup` を付けたままにして `state !== 'running'` なら `ctx.resume().catch(noop)`（iOS 26 の「Failed to start the audio device」の拒否を握る。Phaser は握らない）。UI の音は Phaser の pointerup（＝DOM の touchend の中）から鳴らす（MenuButton の onUp はこれに合う）。
- L3（復帰・R3）: Phaser 3.90 が VISIBLE で 100 ms 後に suspend → resume、focus と毎フレームで resume をする。足すのは (a) L2 の保険、(b) `pageshow` で同じ resume、(c) 見張り: `state === 'running'` なのに `currentTime` が実時間 0.5 秒進まない時に suspend → resume を 1 回（10 Hz の更新の中。確保なし）。context の作り直し（`game.sound.setAudioContext`）は v0.7.1 では入れない＝実機で「戻らない」が出たら次の段（既知の制約に書く）。
- L4（消音）: `ctx.suspend()` は使わない（Phaser が次のフレームで resume する）。master の gain を 0 に（R4）。
- L5（標本の速さ）: buffer は 22,050 Hz のまま（`createBuffer(1, n, 22050)`。context の速さ（48,000／44,100）へは再生時に WebKit が直線で補う＝高い音が少し鈍る。効果音なので許す）。`AudioContext` の `sampleRate` は頼まない。`OfflineAudioContext`・`AudioWorklet` は使わない（R5）。S1 の実機で「こもる・ざらつく」が出たら context の速さで合成し直す案に替える。
- L6（ループ・R6）: buffer 全体を loop。`start(when, offset, duration)` は使わない。rate は 0.5〜2 の内。param への書き込みは 10 Hz・変化時だけ（spec §5 のとおり）。`param.value` を読み返さない。
- L7（ヘッドレス・R7）: `AUDIO=1` は `chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })`。
- L8（決めの既定）: U-A 従う・U-B 聞かせる・U-C 鳴らす、で進める（ユーザーへは報告で知らせる。変えたいと言われたら変える）。
- L9（段）: S0 の「束ねがバイトで同じ」は agent が build の JS の md5 で確かめる（長い門は S1 でまとめて）。S1 の後に push して実機（早い 3 項目）。
