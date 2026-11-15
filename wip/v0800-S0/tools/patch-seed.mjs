// v0.8.0 S0: data/missions_seed.json の us_04 の object と campaigns の jp_hard だけを文字で差し替える（ほかの任務のバイトは変えない）。
// 使い方: node patch-seed.mjs <repo>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const repo = process.argv[2];
const path = join(repo, 'data', 'missions_seed.json');
const text = readFileSync(path, 'utf8');
const seed = JSON.parse(text);
const old = seed.missions.find((m) => m.id === 'us_04');
const us02 = seed.missions.find((m) => m.id === 'us_02');
const settleSrc = us02.v0_1_prototype.return_point.torpedo_end_settle_s_source;
const EX = 'WebSearch の抜粋のみ・本文未読';

const us04 = {
  id: 'us_04',
  campaign: 'us_pt',
  order: 4,
  title_ja: old.title_ja,
  date: old.date,
  place: old.place,
  type: old.type,
  player_boat: old.player_boat,
  torpedo_type: 'us_mk8',
  torpedo_type_source: `historical (v0.8.0 S0 の調べ・spec-v0800 §2.0。この夜の艇は発射管から撃った: ある艇は管の発射の火が閃光を出し、1 本の管から火が出た（NHHC の報告の抜粋。URL は書かない）＝Mk 8 と管。Mk 13 と転がして落とす架台への換装は 1943 年半ばから（Wikipedia「PT boat」「Mark 8 torpedo」の抜粋）。v0.4.0 の種は us_mk13 だった。${EX})`,
  objective: '東京急行の駆逐艦4隻がビラへ向かい、揚げ終えると同じ海峡を全速で戻る。分隊の先頭の艇としてレーダーで捉えて雷撃し、進路をよけて生きて帰れ',
  enemies: old.enemies,
  hazards: old.hazards,
  moon: old.moon,
  duration_min: old.duration_min,
  success: '帰投。1隻撃沈で達成',
  historical_note: 'PT 15隻・約30本で命中ゼロ。レーダーは分隊の先頭の艇だけ。帰りの駆逐艦に体当たりされて失われた艇があった',
  briefing_note_ja: '1943年8月1〜2日の夜、PT 15隻が4つの分隊でブラケット海峡に張ったが、約30本の魚雷は1本も当たらなかった。レーダーを積むのは分隊の先頭の艇だけで、撃ち終えた先頭の艇が引き揚げると、残った艇にはほとんど何も見えなかった。駆逐艦はビラで兵と物資を揚げ、同じ海峡を戻っていった。',
  source_url: 'https://en.wikipedia.org/wiki/Blackett_Strait',
  dawn_air: {
    control: 'contested',
    confidence: 'medium',
    play_as: 'enemy',
    enemy_ships_at_dawn: 'retire',
    label_ja: '昼の空は争奪（日本の水上機の空襲）',
    refs: [
      {
        url: 'https://pacificwrecks.com/date/1943/08/01.html',
        claim: '1943-08-01（任務の当日）の昼、日本の爆撃機がレンドバの PT 基地（ルンバリ島）を空襲し、PT-117・PT-164 の 2 隻が失われた（海上の艇でなく基地）。その夜、PT 15 隻がブラケット海峡で東京急行の駆逐艦を迎え撃った',
      },
      {
        url: 'https://img.pacificwrecks.com/ship/ptboat/bases/lumbaria/index.html',
        claim: 'レンドバのルンバリ島の PT 基地は 1943-08-01 の昼に日本の爆撃機の空襲を受けた',
      },
      old.dawn_air.refs[1],
    ],
    source: `historical (control・enemy_ships_at_dawn。refs は ${EX}（2026-10-18 の調べと v0.8.0 の調べ＝spec-v0800 §4.1）。英語・日本語の調査とも contested（英語は自軍寄り）。日本機の空襲もある（任務の当日の昼、レンドバの PT 基地へ日本の爆撃機。海上の艇でなく基地）。夜明けの帰り道に空から襲われた記録で見つけたのは味方 B-25 の誤射（PT-166、07-20）だけ。v0.8.0 S0 で refs の先頭（ある艇の艦歴の頁）を基地の空襲の頁 2 つに替えた＝CLAUDE.md §11・spec-v0800 §4.12) / design (v0.6.1。play_as・label_ja。v0.8.0 S0: play_as を own → enemy（lead の既定 L1＝ユーザーの規則「制空権がない限り夜明けの後は空襲」。空は争奪で、日本機はその日の昼に PT 基地を空襲した）。夜明けに帰投の輪の外なら日本の水上機 4 機の空襲（v0_1_prototype.dawn_strike）。遊べるようにする前（S5）にユーザーと見直す＝spec-v0800 §9 Q1)`,
  },
  v0_1_prototype: {
    enemies: ['ijn_destroyer', 'ijn_destroyer', 'ijn_destroyer', 'ijn_destroyer'],
    enemy_behavior: 'transit と ai (v0.8.0。東京急行の駆逐艦 3 隻（ハード 4）は列の通過（下の transit）: 西の縁から 30 kt で東へ抜けてビラで揚陸し、同じ海峡を戻る。往路も復路も退く動き（端で向き直さない・わざとの体当たりはしない・雷跡を見れば櫛で梳く・見つければ照らして撃つ）。護衛の駆逐艦 1 隻は enemy_start から us_02 の AI のまま見回り（端で向き直す・体当たり・照らして撃つ）、復路の最初の艦が現れると西へ退く。世界の配線は S2)',
    duration_s: 260,
    duration_s_source: 'design (v0.8.0 S0・spec-v0800 §4.5。夜明けまでの実秒。列の往路（入り 18 秒・8 秒おき）→ ビラで揚陸 40 秒 → 復路が西の縁の外へ去るまでが、揺らぎのない夜のハード 4 隻で 237.5 秒＝夜明けの 22.5 秒前（V-T3）。月の無い夜（新月）のまま。燃料と合わせて S3 の模擬で直す)',
    fuel_allotment_gal: 48,
    fuel_allotment_gal_source: 'design (v0.8.0 S0・spec-v0800 §4.6。戦闘に使える割当（us_02 と同じ考え）。260 秒の夜に、レーダーで列の前へ回り、撃って、復路をよけて南西の輪へ帰る。帰投の時の残りが 15〜35% になるよう S3 の模擬で合わせる（初めの値）)',
    bounds_m: {
      width: 6000,
      height: 4000,
      source: 'design (v0.8.0。us_02 と同じ広さ。ブラケット海峡を東西に置いた模式図（本当は北西〜南東。spec-v0800 §4.3）。北の縁（y 0）の外がコロンバンガラ島、南の縁（y 4,000）の外がアランデル島・ギゾ島（下の shores）)',
    },
    player_start: {
      x_m: 3600,
      y_m: 2600,
      heading_deg: 270,
      source: 'design (v0.8.0。海峡の中ほど・復路の道の南 300 m から西向き・停止。往路の入りの点 (150, 1500) まで 3,620 m（V-T5 の 1,500 m の外）、護衛の出発点まで 2,280 m（レーダーの 4,000 m の内＝出撃してすぐ輝点が 1 つ）、帰投の輪の中心まで 2,550 m（味方機の開始 1,750 m の外）)',
    },
    enemy_start: {
      x_m: 1800,
      y_m: 1200,
      heading_deg: 120,
      source: 'design (v0.8.0。護衛の駆逐艦（4 隻のうち輸送をしない 1 隻）。報告の「ファーガソン水道からの入口を見張るような艦がコロンバンガラの約 1 マイル沖にいた」（spec-v0800 §4.1）の当てはめ。us_02 の AI のまま見回る（端から 700 m で向き直す・見つければ 400 m で体当たり・照らして撃つ）。北の岸から 1,200 m＝レーダーの陸の反射（400 m）の外)',
    },
    return_point: {
      x_m: 1300,
      y_m: 3700,
      radius_m: 250,
      call_margin: 1.5,
      torpedo_settle_max_s: 10,
      torpedo_end_settle_s: 5,
      torpedo_end_settle_s_source: settleSrc,
      source: 'design (v0.8.0。帰投地点＝ファーガソン水道の中（南の岸の切れ目 x 700〜1,900 の真上＝V-S2。南の縁から 50 m）。出発点から 2,550 m（縁まで 2,300 m）。水道の両脇の礁の間（x 900〜1,700 の 800 m）を通って帰る。半径・call_margin・待ちは us_02 と同じ)',
    },
    shallows: [
      { x_m: 500, y_m: 3500, width_m: 400, height_m: 500, label_ja: '礁' },
      { x_m: 1700, y_m: 3500, width_m: 400, height_m: 500, label_ja: '礁' },
    ],
    shallows_source: 'design (v0.8.0。ファーガソン水道の両脇の礁（PT の喪失の最大の原因は座礁＝docs/01 §7.1）。安全速力 15 kt（risk_events の grounding.params）。輪へ全速で帰る時、真ん中の 800 m（x 900〜1,700）を外れると礁に乗る。礁は輪にも出発点にもかからない（V-S2）)',
    friendly_aircraft: {
      trigger_edge_m: 1500,
      source: 'design (v0.8.0。v0.3.3 の識別。1943-07-20 の朝に味方の B-25 が帰りの PT を敵と誤り 1 隻を沈めた（dawn_air.refs）。帰投地点の輪の縁から 1,500 m の内で数え始める。出発点（縁まで 2,300 m）は外)',
    },
    enemy_aircraft: {
      enemy_id: 'ijn_seaplane_jake',
      source: 'design (v0.8.0。v0.4.1 の夜の水上機。この夜、ある艇は水上機に航跡を見られないよう機関をアイドルにしていた（spec-v0800 §4.1）。今夜出る確率は下の night の揺らぎ（80%）)',
    },
    hazards: ['enemy_ship_gunfire_or_ram', 'enemy_aircraft', 'grounding', 'friendly_fire', 'dawn_air_strike'],
    hazards_source: 'design (v0.8.0。この世界で起きる危険を出会う順に: 駆逐艦の砲撃・衝突（護衛と列）、敵航空機（夜の水上機。night で 80%）、座礁（水道の礁）、友軍誤射（朝の帰り道。night で 80%）、夜明けの空襲（dawn_air.play_as enemy の 4 機）。上位の hazards（任務本体の設計）は変えない)',
    night: {
      hazard_scale: 8,
      optional_hazards: ['enemy_aircraft', 'friendly_fire'],
      enemy_jitter: { x_m: 400, y_m: 150, heading_deg: 20 },
      mirror_chance: 0,
      source: 'design (v0.8.0。夜の揺らぎ（seed+16）。今夜出る確率は share × 8: 敵航空機 80%・友軍誤射 80%（us_02 と同じ）。護衛の駆逐艦は x ±400・y ±150・針路 ±20°。列の通過も敵の 1 件として同じ幅で揺らす（x のずれ ÷ 列の画面上の速さ 77 m/秒＝入りの秒 ±5.2 秒・y のずれ＝往路と復路の道の y ±150 m・針路のずれは使わない＝config/transit-mission-data）。左右反転なし（mirror_chance 0。ビラは東・水道は南西＝V-T6）)',
    },
    dawn_strike: {
      aircraft_id: 'ijn_f1m2_pete',
      count: 4,
      count_source: 'design (us_01・us_03 と同じ 4 機（ユーザーの例「敵水上機戦隊四機」）。この朝に海上の PT を襲った日本機の記録は見つけていない＝その日の昼の空襲は基地へ)',
      from_bearing_deg: 315,
      escort_target_planes: [],
      source: 'design (v0.8.0 S0。dawn_air.play_as enemy（lead の既定 L1・spec-v0800 §9 Q1）の夜明けの空襲。北西＝ショートランド方面（日本の水上機の基地）の方角から（推定）。僚艇はいない)',
    },
    dawn_withdraw: {
      retire_edge: 'west',
      force_ja: '東京急行',
      source: 'design (v0.8.0。夜明けに浮いている艦（護衛と、海峡にいる列）は西へ退く（来た道＝ベラ湾の方へ。V-T2 で transit.inbound.edge と同じ）。ビラで揚陸している艦は戻らない（揚陸で残った扱い。S1）。force_ja は夜明けの帯の呼び名)',
    },
    enemy_hits_to_sink: 1,
    enemy_hits_to_sink_source: 'design (v0.8.0。us_02・jp_06 と同じ 1 本で沈没の演出。列の艦も同じ（S2）)',
    objective_sink_count: 1,
    objective_sink_count_source: 'design (v0.8.0。ノーマルも撃沈の達成は 1 隻（列 3 ＋ 護衛 1 のうち）。v0.6.0 の hard.objective_sink_count をノーマルにも読む鍵（config/mission-hard-data。この鍵の無い任務は今までどおり全隻）。史実は約 30 本で命中 0)',
    hard: {
      extra_transit_ships: 1,
      objective_sink_count: 1,
      source: 'design (v0.8.0。難易度ハード（ユーザーの v0.4.4「難易度が上がれば敵艦…の数が増えていけばよい」）: 列の艦を 1 隻足して 4 隻 ＋ 護衛 1＝暗号の解読と戦果の報告の「駆逐艦 5 隻」（史実は 4 隻）。達成は 1 隻の撃沈のまま)',
    },
    transit: {
      ships: 3,
      spacing_s: 8,
      speed_kt: 30,
      edge_inset_m: 150,
      inbound: { edge: 'west', lane_y_m: 1500, heading_deg: 90, enter_s: 18 },
      unload_s: 40,
      outbound: { edge: 'east', lane_y_m: 2300, heading_deg: 270 },
      cover_leaves_with_outbound: true,
      vila_label_ja: 'ビラ',
      source: `historical (駆逐艦 4 隻のうち 3 隻が輸送・1 隻が護衛。ベラ湾からブラケット海峡へ入り、ビラ（コロンバンガラ島）で兵約 900 と物資を揚げて同じ海峡を戻った。帰りの駆逐艦に体当たりされて失われた艇があった＝spec-v0800 §4.1。${EX}) / design (v0.8.0 S0。列の通過: 1 隻目は西の縁の内 150 m・y 1,500 に 18 秒で現れ、090°・30 kt（画面上 77 m/秒）で 8 秒おき（約 620 m の間隔）に続き、東の縁の外 150 m でビラに着く（見えない・撃てない・狙えない）。各艦は着いてから 40 秒で東の縁の内 150 m・y 2,300 に 270° で現れ、西の縁の外 150 m で去る（撃沈に数えない）。往路も復路も退く動き（列の AI は enemies.json の値のまま最大速力だけ 30 kt）。復路の最初の艦が現れると護衛も西へ退く（cover_leaves_with_outbound）。揺らぎのない夜のハード 4 隻で最後の艦が去るのは 237.5 秒（夜明け 260 秒の 22.5 秒前＝V-T3）。速さ・間隔・揚陸の秒は S3 の模擬で直す（KPI を合わせた艦の回避・見張り・砲の値には触れない）)`,
    },
    shores: {
      north: { land_m: 600, labels: [{ label_ja: 'コロンバンガラ島', x_m: 3000 }] },
      south: {
        land_m: 600,
        labels: [
          { label_ja: 'ギゾ島', x_m: 300 },
          { label_ja: 'アランデル島', x_m: 4200 },
        ],
        gaps_m: [[700, 1900]],
        gap_label_ja: 'ファーガソン水道',
      },
      source: 'historical (海峡はコロンバンガラ島（北東）とアランデル島・ギゾ島（南西）の間。PT はファーガソン水道を通って出入りした＝spec-v0800 §4.1) / design (v0.8.0 S0。東西に置いた模式図の両岸: 北の縁（y 0）の外に陸 600 m、南の縁（y 4,000）の外に陸 600 m（x 700〜1,900 は切れ目＝ファーガソン水道。陸を描かず海が南へ続く）。字は陸の上（x は字の中心）。艇は今の岸と同じく海域の縁で止まる（陸の当たりは要らない）。今の岸（coast）とは一緒に置けない（V-S3）。絵は S2)',
    },
    radar: {
      model: 'so_early',
      fit: 'leader',
      source: `historical (1943-08-01〜02 のブラケット海峡でレーダーを積んでいたのは分隊の先頭の艇だけ（3 隻とも 4 隻とも）。先頭の艇はレーダーの方位で撃ち、撃ち終えると帰る命令で、残りの艇はほとんど何も見えなかった＝spec-v0800 §3.1。${EX}) / design (v0.8.0 S0。プレイヤーをレーダーを積む先頭の艇にした（spec-v0800 §9 Q2。実機 1 回目に聞く）。型は初期の SO（hit_rate_model.json の radar.models.so_early）)`,
    },
  },
};

// us_04 の object の文字の範囲（"    {\n      \"id\": \"us_04\"" から us_05 の object の頭まで）を差し替える
const start = text.indexOf('    {\n      "id": "us_04",');
const next = text.indexOf('    {\n      "id": "us_05",');
if (start < 0 || next < start) throw new Error('us_04 の範囲が見つからない');
const body = JSON.stringify(us04, null, 2).split('\n').map((l) => '    ' + l).join('\n') + ',\n';
let out = text.slice(0, start) + body + text.slice(next);

// campaigns の jp_hard: unlock の後に unlock_mission_ids と source
const anchor = '      "unlock": "complete_us_pt",\n';
if (out.split(anchor).length !== 2) throw new Error('jp_hard の unlock が 1 か所でない');
const add = anchor + '      "unlock_mission_ids": [\n        "us_01",\n        "us_02",\n        "us_03"\n      ],\n      "unlock_mission_ids_source": ' + JSON.stringify('design (v0.8.0 S0・spec-v0800 §2.4。lead の既定 L2（ユーザー未確認・spec-v0800 §9 Q3）: 日本のタブを開く条件は今の米PT の 3 任務のまま（一覧で固定。core/campaign の parseUnlockMissionIds・config/campaign-data の unlockPrereqIds）。無ければ v0.6.0 のとおり相手のキャンペーンの遊べる任務を全部＝us_04〜us_07 が遊べるようになると 7 任務に増える。日本のタブは 3 任務の後に開く前提で作った・新しい任務は 1944 年の難しい夜が多い・ストアと殴り込みは別に「全クリア後」。すでに開いた端末は閉じない（開いた印）)') + ',\n';
out = out.replace(anchor, add);
JSON.parse(out); // 壊していない
writeFileSync(path, out);
console.log('ok', text.length, '→', out.length);
