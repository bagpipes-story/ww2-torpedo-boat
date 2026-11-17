// us_06 の探り（scripts/headless/anchor-probe.mjs）の表と帯（v0.8.1 IP2 で anchor-probe.mjs から分けた。S3 の表の文と帯の式は 1 字も変えない）。node の側だけ: 夜ごとの結果を並べるだけで、
// ページ・世界・台本を読まない。夜の水上機の欄（IP2）は夜の行に水上機の記録（pl）がある時だけ足す＝?debug&noplane（NOPLANE=1）の夜の行は S3 と同じ字（md5 が S3〜IP1 と同じ）。
const pct = (rs, f) => (rs.length === 0 ? NaN : Math.round((100 * rs.filter(f).length) / rs.length));
const sum = (rs, k) => rs.reduce((s, r) => s + (r[k] ?? 0), 0);
export const median = (xs) => { const s = [...xs].sort((a, b) => a - b), h = s.length >> 1; return s.length === 0 ? NaN : s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
export const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '-');
const pls = (rs) => rs.filter((r) => r.pl).map((r) => r.pl);
/** 台本ごとの数（%・中央値）: 達成＝卯月撃沈＋帰投。A5 は撃った夜のうち撃つ前に動かなかった夜。水上機（IP2）: 接近の回数の中央値・発見確定した夜・攻撃（照明弾）の回数・爆弾・P3 の数 */
export function rowOf(rs) {
  const home = rs.filter((r) => r.home), fired = rs.filter((r) => r.fired > 0), early = fired.filter((r) => !r.moveFirst), reasons = {};
  for (const r of rs) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
  const P = pls(rs);
  const plane = P.length === 0 ? null : {
    n: P.length, appMed: median(P.map((p) => p.app)), app2: pct(P, (p) => p.app >= 2), lockN: pct(P, (p) => p.locks > 0), locks: P.reduce((s, p) => s + p.locks, 0), flares: P.reduce((s, p) => s + p.flares, 0),
    bombs: P.reduce((s, p) => s + p.bombs, 0), bombHits: P.reduce((s, p) => s + p.bombHits, 0), bombed: rs.filter((r) => r.reason === 'bombed').length, litN: pct(P, (p) => p.litS > 0), litMed: median(P.filter((p) => p.litS > 0).map((p) => p.litS)),
    shadowOff: P.filter((p) => p.shadowOff > 0).length, uzFlare: P.filter((p) => p.uzFlare).length, uzFlareMove: rs.filter((r) => r.pl && r.pl.uzFlare && Number.isFinite(r.moveS)).length, slowMed: median(P.map((p) => p.slowS)),
  };
  return { n: rs.length, win: pct(rs, (r) => r.uz && r.home), own: pct(rs, (r) => r.own), home: pct(rs, (r) => r.home), uz: pct(rs, (r) => r.uz), tr: pct(rs, (r) => r.tr),
    moveFirst: pct(fired, (r) => r.moveFirst), moveEta: pct(fired, (r) => r.moveEta), a5: pct(early, (r) => r.fan1), a5n: early.length, fuel: median(home.map((r) => r.fuelPct)), preDawn: pct(home, (r) => r.preDawn),
    k5: sum(rs, 'k5'), slow: sum(rs, 'slow'), held: sum(rs, 'held'), heldHits: sum(rs, 'heldHits'), pk: sum(rs, 'pk'), bdS: median(rs.map((r) => r.bdS ?? 0)),
    drift: rs.filter((r) => r.reason === 'adrift' && !r.preDawn && r.t < 1500).length, ends: rs.filter((r) => (r.reason === 'adrift' || r.reason === 'air_strike') && !r.preDawn && r.t < 1500).length,
    lastS: Math.max(...rs.map((r) => r.t ?? 0)), reasons: Object.entries(reasons).map(([k, v]) => `${k} ${v}`).join('・'), plane };
}
/** 帯の判定: 下限・上限（null は無し）。端は帯の端から ±5 点の内 */
function verdict(x, lo, hi) {
  if (!Number.isFinite(x)) return '—';
  if ((lo !== null && Math.abs(x - lo) <= 5) || (hi !== null && Math.abs(x - hi) <= 5)) return '端';
  return (lo === null || x >= lo) && (hi === null || x <= hi) ? '✓' : '✗';
}
/** spec §3.9 の帯（ノーマル A1〜A6・F・T・D・K、ハード H1・H2・K）: [名, 台本, 文, 判定の列]。水上機の夜（IP2）は brief の P5 の帯（P1〜P4）を足す */
export function bands(R, hard) {
  const a = R.shore_east, o = R.open_north, out = [];
  const add = (name, pol, parts) => out.push([name, pol, parts.map(([lab, x, lo, hi]) => `${lab} ${Number.isFinite(x) ? x : '-'} ${verdict(x, lo, hi)}`).join(' ・ '), parts.map(([, x, lo, hi]) => verdict(x, lo, hi))]);
  if (hard && a) add('H1', 'shore_east', [['達成', a.win, 40, 70], ['沈没', a.own, null, 20]]);
  if (hard && a && o) add('H2', 'open_north', [[`達成（≤ ${a.win - 15}）`, o.win, null, a.win - 15]]);
  if (!hard && a) add('A1', 'shore_east', [['達成', a.win, 55, 80], ['沈没', a.own, null, 10], ['帰投', a.home, 85, null]]);
  if (!hard && a && o) add('A2', 'open_north', [[`達成（≤ ${a.win - 15}）`, o.win, null, a.win - 15], ['最初の 1 本を撃つ前に動いた', o.moveFirst, 50, null]]);
  if (!hard && a && R.shore_east_nb) add('A3', 'shore_east_nb', [[`達成（≤ ${a.win - 15}）`, R.shore_east_nb.win, null, a.win - 15]]);
  const c = R.charge, v4 = c ? [verdict(c.own, 30, null), verdict(c.win, null, 35)] : [];
  if (!hard && c) out.push(['A4', 'charge', `沈没 ${c.own}（≥ 30）か 達成 ${c.win}（≤ 35）`, [v4.includes('✓') ? '✓' : v4.includes('端') ? '端' : '✗']]);
  if (!hard && a) add('A5', 'shore_east', [[`最初の扇で沈んだ（動く前に撃った ${a.a5n} 夜のうち）`, a.a5, 60, 90]]);
  if (!hard && a && R.transport_first) add('A6', 'transport_first', [['空知丸撃沈', R.transport_first.tr, 70, null], [`達成（≤ ${a.win}）`, R.transport_first.win, null, a.win]]);
  if (!hard && a) add('F', 'shore_east', [['帰投の夜の燃料の中央値 %', a.fuel, 15, 35]]);
  if (!hard && a) add('T', 'shore_east', [['帰投の夜の夜明け前 %', a.preDawn, 90, null]]);
  const d = R.idle;
  if (!hard && d) out.push(['D', 'idle', `夜明けの後・1,500 秒未満に終わった ${d.ends}/${d.n}（漂流 ${d.drift}・最も遅い ${f1(d.lastS)} 秒）`, [d.ends === d.n ? '✓' : '✗']]);
  const k = Object.values(R).reduce((s, r) => s + r.k5, 0);
  out.push(['K', 'すべて', `5 kt 未満の艦への 1 本で kpiTarget が真 ${k} 本`, [k === 0 ? '✓' : '✗']]);
  if (a && a.plane) {
    // IP2 の P5（lead の帯）: ノーマル 達成 55〜80・沈没 ≤ 15／open_north ≤ shore_east／ハード 達成 40〜70／接近の中央値 ≥ 2（浜の道）／帰投の夜の夜明け前 ≥ 90
    add('P1', 'shore_east', hard ? [['達成', a.win, 40, 70]] : [['達成', a.win, 55, 80], ['沈没', a.own, null, 15]]);
    if (o) add('P2', 'open_north', [[`達成（≤ ${a.win}）`, o.win, null, a.win]]);
    add('P3', 'shore_east', [['水上機の接近の回数の中央値', a.plane.appMed, 2, null]]);
    add('P4', 'shore_east', [['帰投の夜の夜明け前 %', a.preDawn, 90, null]]);
  }
  return out;
}
/** 水上機の欄（IP2。記録がある時だけ） */
const planeRow = (p) => (p ? ` | 敵機 夜 ${p.n}・接近の中央値 ${f1(p.appMed)}（2 回以上 ${p.app2}%）・発見確定 ${p.lockN}%（${p.locks} 回）・照明弾 ${p.flares}・爆弾 ${p.bombs} 命中 ${p.bombHits}・爆沈 ${p.bombed}・照らされた夜 ${p.litN}%（中央値 ${f1(p.litMed)} 秒）・陰を消した ${p.shadowOff} 夜・照明弾で卯月が気づいた ${p.uzFlare} 夜（動いた ${p.uzFlareMove}）・静音の秒の中央値 ${f1(p.slowMed)}` : '');
export const fmtRow = (p, r) => `${p.padEnd(15)} ${String(r.n).padStart(2)} 夜 | 達成 ${r.win} | 沈没 ${r.own} | 帰投 ${r.home} | 卯月撃沈 ${r.uz} | 空知丸撃沈 ${r.tr} | 撃つ前に動いた ${r.moveFirst}・着く前 ${r.moveEta} | A5 ${r.a5}（${r.a5n}）| 燃料 ${f1(r.fuel)} | 夜明け前 ${r.preDawn} | 止まった艦へ ${r.held}（命中 ${r.heldHits}）| 5kt 未満 ${r.slow}・K ${r.k5} | 背に岸 ${f1(r.bdS)} 秒 | 駆潜艇撃沈 ${r.pk} | ${r.reasons}${planeRow(r.plane)}`;
const planeNight = (p) => (p ? ` | 敵機 接近 ${p.app} 見失い ${p.lost} 確定 ${p.locks} 照明弾 ${p.flares} 爆弾 ${p.bombs}/${p.bombHits} 照らされ ${f1(p.litS)} 陰消し ${p.shadowOff} 卯月 ${p.uzFlare ? '照明弾' : '-'} 静音 ${f1(p.slowS)}` : '');
export const fmtNight = (c, r) => `${c.policy.padEnd(15)} seed ${String(c.seed).padStart(2)} | ${String(r.reason).padEnd(10)} 卯月 ${r.uz ?? '-'} 空知丸 ${r.tr ?? '-'} 駆潜艇 ${r.pk ?? '-'} 帰投 ${r.home ? 1 : 0} 夜明け前 ${r.preDawn ? 1 : 0} 燃料 ${r.fuelPct ?? '-'} | 気づき ${r.why ?? '-'} ${f1(r.alertS)} 動き ${f1(r.moveS)} 初弾 ${f1(r.firstS)} | 撃つ ${r.fired ?? '-'} 命中 ${r.hits ?? '-'} 止まった艦へ ${r.held ?? '-'}/${r.heldHits ?? '-'} 5kt ${r.slow ?? '-'}/${r.k5 ?? '-'} | 背に岸 ${f1(r.bdS)} | ${f1(r.t)} 秒${planeNight(r.pl)}${r.errors.length ? ` | page errors ${r.errors.length}（${r.errors[0]}）` : ''}`;
export const printBands = (B) => { for (const [name, pol, text, v] of B) console.log(`  ${name} ${pol.padEnd(15)} ${text}  → ${v.join('')}`); };
