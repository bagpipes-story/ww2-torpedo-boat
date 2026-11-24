// v0.8.5 S3b: 値（var/final.json を us07-patch で当てた後）に source と文を直す。node us07-s3b-text.mjs → us07-splice で HEAD の字の位置へ
import { readFileSync, writeFileSync } from 'node:fs';
const F = '/home/user/ww2-torpedo-boat/data/missions_seed.json';
const d = JSON.parse(readFileSync(F, 'utf8'));
const m = d.missions.find((x) => x.id === 'us_07');
const p = m.v0_1_prototype;
const rep = (o, k, a, b) => { if (!o[k].includes(a)) throw new Error(`${k}: 「${a}」が無い`); o[k] = o[k].replace(a, b); };
// 値の確かめ（final.json が当たっていること）
const want = { sx: 5150, sy: 1850, rx: 3750, ry: 1300, disp: 110, hx: '1300,2400', w2: '3250,1850' };
const got = { sx: p.player_start.x_m, sy: p.player_start.y_m, rx: p.return_point.x_m, ry: p.return_point.y_m, disp: p.shore_battery.params.gun.dispersion_m, hx: p.hard.extra_shore_battery_x_m.join(','), w2: p.minefield.lanes[2].slice(2, 4).join(',') };
if (JSON.stringify(want) !== JSON.stringify(got)) throw new Error(`値が final でない ${JSON.stringify(got)}`);

// 地図
rep(p, 'map_source', '浅瀬は y 3,750〜4,000 の帯', 'v0.8.5 S3b（lead の決め 1: 帰投の輪は沖の集合点。S3 の (3650, 1300) は出発の真西 1,500 m で、西へ走るだけで救助の前に輪に入って終わった）で、帰投の輪を (3750, 1300)（フィッチの真北 700 m・輪の縁の間 270 m）に、出発を (5150, 1850)・264°（フィッチへ 1,408 m）に下げた＝出発の真西の線から輪の縁まで 300 m・出発 → フィッチの道から 446 m・出発 → コリーの直線から 714 m・砲台の射界の外（縁まで 3,315 m 以上）・S ボートの線から 1,300 m 以上（揺らぎ込み）・S ボートの線の始めから 4,750 m（出発で見つからない検査の内）。lead の目安 (3750, 2700) はこの地図ではフィッチの南＝岸の方（北＝沖は y の小さい方）なので、沖のまま出発を南へずらす形にした。浅瀬は y 3,750〜4,000 の帯');
// 機雷原
rep(p.minefield, 'source', '置かない円: 水路の幅の内', 'v0.8.5 S3b（lead の決め 2: 水路を使わない真っ直ぐの道に機雷を）で水路を 4 本にした: 出発 (5150, 1850) → フィッチ・帰投の輪 (3750, 1300) → フィッチ・フィッチ → (3250, 1850) → コリーの北 354 m (2650, 2350)（フィッチ → コリーを北へ回る。真っ直ぐより 1 回 149 m 長い。真っ直ぐの帯に区画を 99% 以上置ける所を空けるため）。区画は 3 つを置き直した: 真っ直ぐの道の [3140, 2240, 340, 340]・[3480, 2270, 420, 190]（出発 → コリーの直線とフィッチ → 群の直線が通り、水路・フィッチの輪の余白の外＝置ける割合 100%）と、フィッチの北西の [2900, 1400, 500, 220]（S3 の東の [4700, 1700, 1100, 1200] は新しい出発を含み、北西の [2200, 800, 1100, 800] は帰投の輪の水路から遠いので、水路の外の海へ替えた）。西の [1200, 1600, 1200, 900] はそのまま。S3b の帯（32 夜）: 出発からコリーへ全速で真っ直ぐの台本は触雷 1 個以上が多数の夜（CHANGELOG の S3b）・水路を通る丁寧な台本は触雷 0。置かない円: 水路の幅の内');
rep(p.minefield, 'source', 'lanes は掃海済みの水路の帯 [x0, y0, x1, y1, 幅]＝出発 (5150, 1250) → フィッチ (3750, 2000)・帰投の輪 (3650, 1300) → フィッチ・フィッチ → コリーの北 354 m (2650, 2350) の幅 300 m の 3 本', 'lanes は掃海済みの水路の帯 [x0, y0, x1, y1, 幅]（幅 300 m。S3 は出発 (5150, 1250) → フィッチ (3750, 2000)・帰投の輪 (3650, 1300) → フィッチ・フィッチ → コリーの北 354 m (2650, 2350) の 3 本')
// 沿岸砲
rep(p.shore_battery.params, 'source', 'dispersion_m 80（有効射程での散り）', 'dispersion_m 110（有効射程での散り。v0.8.5 S3b で 80 → 110＝lead の決め 3: ノーマルの沈没を spec の ≤ 15% へ。S3 の 80 ではノーマルの丁寧な台本の沈没 25%〔大半が砲台〕・S3b の地図で 19%。110 で 12.5%〔32 夜で 4〕。散布は今の規則で距離に比例＝コリーのそば〔約 2,150 m〕で約 91 m。比べた値: 130 は 9%・rof_per_min 1.5 は 16%）');
rep(p.shore_battery.params, 'source', 'S3 の測りで直す', 'ハードは同じ値の砲台を 2 つ足す（hard.extra_shore_battery_x_m）');
// ハード
p.hard.objective_ja = p.hard.objective_ja.replace('2つの砲台', '3つの砲台');
if (!p.hard.objective_ja.includes('3つの砲台')) throw new Error('objective_ja');
rep(p.hard, 'note_ja', '2つ目の砲台', '2つ目・3つ目の砲台');
rep(p.hard, 'source', 'フィッチの輪はこの砲台の射界の外（中心まで 3,572 m＝V-Q5）。', 'フィッチの輪はこの砲台の射界の外（中心まで 3,572 m＝V-Q5）。v0.8.5 S3b: 3 つ目の砲台 x 2,400 を足して [1300, 2400]（ノーマルの散布を 80 → 110 m に広げたので、x 1,300 の 1 つだけではハードの丁寧な台本が 78%〔32 夜〕に上がった。1 つを x 2,000・2,400・2,700 に動かすだけでは 69%・69%・63%、2 つ足すと 47%＝lead の目安 4〜5 割。フィッチの輪の縁まで 2,750 m＞射界 2,600＝V-Q5）。');
// 燃料
rep(p, 'fuel_allotment_gal_source', '全速は約 0.7 gal／秒', 'v0.8.5 S3b（帰投の輪を沖の (3750, 1300)・出発を (5150, 1850)・水路をフィッチ → コリーで北へ少し回す）でも丁寧な台本の道は約 8.4 km で、32 夜の燃料の残りは CHANGELOG の S3b の表（達成の夜の最小 ≥ 10%）。全速は約 0.7 gal／秒');
writeFileSync(F, `${JSON.stringify(d, null, 2).replace(/\u00a0/g, '\\u00a0')}\n`);
console.log('texts ok');
