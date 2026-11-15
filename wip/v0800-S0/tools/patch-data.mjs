// v0.8.0 S0: data/hit_rate_model.json の末尾に radar を足し、data/boats.json の us_elco80・us_higgins78 の radar を直す（ほかのバイトは変えない）。
// 使い方: node patch-data.mjs <repo>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const repo = process.argv[2];
const EX = 'WebSearch の抜粋のみ・本文未読';

// ---------- hit_rate_model.json の radar ----------
const hrPath = join(repo, 'data', 'hit_rate_model.json');
const hr = readFileSync(hrPath, 'utf8');
const radar = {
  note: 'レーダー（v0.8.0。spec-v0800 §3）。目とは別の感覚で、HUD の情報だけ（敵の発見・自艇の視程・見越し点マーカー・敵の AI・命中率は何も変えない＝D-R1）。掃引ごとに射程の内の艦艇の位置だけを輝点で出す（種類・針路・速さ・こちらに気づいたかは出さない＝D-R2）。機は映さない（aircraft false＝D-R3）。陸（岸の線）から land_clutter_m の内の艦艇は映らない（D-R4）。大発・PT などの小さい艇は small_range_m の内だけ（D-R5）。位置は position_step_m の格子に丸める（乱数なし＝D-R7）。任務の v0_1_prototype.radar が型（models の鍵）と付き方（leader＝分隊の先頭の艇・own＝自艇の標準装備）を選ぶ（自艇の boats.json の radar.available_from が任務の日付以前＝V-R2。検査は core/radar-data と config/radar-mission-data）',
  aircraft: false,
  models: {
    so_early: {
      ship_range_m: 4000,
      small_range_m: 1200,
      sweep_s: 3,
      land_clutter_m: 400,
      position_step_m: 50,
      source: `historical (1943 年半ばから PT に載り始めた初期の SO 型（10 cm の水上捜索。艦船へは約 16〜20 nm＝出典で食い違う。5 インチの PPI）。岸のそばの船の反射は岸の反射と混じって見分けにくい＝spec-v0800 §3.1。${EX}) / design (v0.8.0 S0。史実の射程のままでは 6 × 4 km の海域が常に全部見え、夜の「見えない敵」が無くなるので海域の縮尺に合わせて縮めた（D-R6）: 艦 4,000 m（新月の目の 900 m の約 4.4 倍）・小さい艇 1,200 m・掃引 3 秒・陸の反射 400 m・丸め 50 m。S3 の模擬（B1・B2）と iPhone の実機で直す)`,
    },
    so_late: {
      ship_range_m: 6000,
      small_range_m: 1800,
      sweep_s: 2,
      land_clutter_m: 300,
      position_step_m: 25,
      source: `historical (1944 年後半のレイテの作戦では各分隊がレーダーで接触を報じた（全艇が積んでいたかは未確認）。1944 年末からの新しい艇は工場で SO-3 を積んで来た＝spec-v0800 §3.1。${EX}) / design (v0.8.0 S0。1944 年の型（us_05〜us_07 で使う。v0.8.1 以降）: 艦 6,000 m・小さい艇 1,800 m・掃引 2 秒・陸の反射 300 m・丸め 25 m。使う版の模擬と実機で直す)`,
    },
  },
  source: 'historical (SO 系の探知の値・PPI・岸の反射・1943 年は初期の機材＝spec-v0800 §3.1) / design (v0.8.0 S0。海域の縮尺に合わせた射程（D-R6）・掃引の秒・丸め・機は映さない（D-R3）。v0.9 のストアは任務の radar の block を足すだけでどの任務にも付けられる形＝spec-v0800 §2.3)',
};
const tail = '\n  }\n}\n';
if (!hr.endsWith(tail)) throw new Error('hit_rate_model.json の末尾が想定と違う');
const radarText = JSON.stringify({ radar }, null, 2).split('\n').slice(1, -1).join('\n');
const hrOut = hr.slice(0, hr.length - tail.length) + '\n  },\n' + radarText + '\n}\n';
JSON.parse(hrOut);
writeFileSync(hrPath, hrOut);

// ---------- boats.json の radar（us_elco80・us_higgins78） ----------
const bPath = join(repo, 'data', 'boats.json');
let b = readFileSync(bPath, 'utf8');
const oldRadar = '      "radar": {\n        "available_from": "1943-01",\n        "range_m": 31000\n      },\n';
const src = `historical (v0.8.0 S0・spec-v0800 §3.1。SO 型は 1943 年半ばから一部の艇（分隊の先頭）に載り、1943-08 のブラケット海峡では 3〜4 隻だけ。1944 年後半のレイテの作戦では各分隊がレーダーで接触を報じた。艦船への探知は約 16〜20 nm（出典で食い違う。range_m 31,000 m＝約 17 nm はその間）。available_from は 1943-01 → 1943-07（半ば）に直した。${EX}。ゲームの射程は hit_rate_model.json の radar.models（海域の縮尺）)`;
const newRadar = '      "radar": {\n        "available_from": "1943-07",\n        "range_m": 31000,\n        "type": "SO",\n        "source": ' + JSON.stringify(src) + '\n      },\n';
const parts = b.split(oldRadar);
if (parts.length !== 3) throw new Error(`boats.json の 1943-01・31000 の radar が 2 か所でない（${parts.length - 1}）`);
b = parts.join(newRadar);
const bj = JSON.parse(b);
for (const id of ['us_elco80', 'us_higgins78']) if (bj.boats.find((x) => x.id === id).radar.type !== 'SO') throw new Error(`${id} の radar が直っていない`);
writeFileSync(bPath, b);
console.log('ok');
