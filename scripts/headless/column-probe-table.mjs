// us_05 の探り（scripts/headless/column-probe.mjs）の表と帯（v0.8.2 S3。spec-v0820 §6 の帯の表、lead の L29）。node の側だけ: 夜ごとの結果を並べるだけで、ページ・世界・台本を読まない。
const pct = (rs, f) => (rs.length === 0 ? NaN : Math.round((100 * rs.filter(f).length) / rs.length));
const sum = (rs, k) => rs.reduce((s, r) => s + (r[k] ?? 0), 0);
export const median = (xs) => { const s = [...xs].sort((a, b) => a - b), h = s.length >> 1; return s.length === 0 ? NaN : s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
export const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '-');
const reported = (r) => Number.isFinite(r.sentS) || Number.isFinite(r.relayS);
/** 台本ごとの数（%・中央値・1,000 夜あたり）: 達成＝報告が届いて帰投と同じに数える終わり（Result の objectiveDone） */
export function rowOf(rs) {
  const home = rs.filter((r) => r.home), broken = rs.filter((r) => r.radio), relayed = rs.filter((r) => Number.isFinite(r.relayS)), reasons = {};
  for (const r of rs) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
  const left = rs.flatMap((r) => (r.sc ?? []).filter((s) => Number.isFinite(s[1])).map((s) => s[1])), back = rs.flatMap((r) => (r.sc ?? []).filter((s) => Number.isFinite(s[2])).map((s) => s[2]));
  return { n: rs.length, win: pct(rs, (r) => r.win), own: pct(rs, (r) => r.own), home: pct(rs, (r) => r.home), rep: pct(rs, reported), seen: pct(rs, (r) => Number.isFinite(r.seenS)),
    radio: pct(rs, (r) => r.radio), relayOfBroken: pct(broken, (r) => Number.isFinite(r.relayS)), broken: broken.length, relayAdrift: pct(relayed, (r) => r.reason === 'adrift'), relayed: relayed.length,
    bb1: pct(rs, (r) => r.hitBB >= 1), bb3: pct(rs, (r) => r.hitBB >= 3), firedN: rs.filter((r) => r.fired > 0).length, hitBB: sum(rs, 'hitBB'), hitCA: sum(rs, 'hitCA'), hitDD: sum(rs, 'hitDD'),
    h34: sum(rs, 'h34'), mgDraws: sum(rs, 'mgDraws'), mgSum: sum(rs, 'mgSum'), per1000: rs.length === 0 ? NaN : Math.round((10000 * sum(rs, 'mgSum')) / rs.length) / 10, booms: sum(rs, 'booms'),
    dmgDD: sum(rs, 'dmgDD'), dmgCA: sum(rs, 'dmgCA'), dmgBB: sum(rs, 'dmgBB'), capKpi: sum(rs, 'capKpi'), dd: sum(rs, 'dd'), ddKpi: sum(rs, 'ddKpi'), ddBad: sum(rs, 'ddBad'), fuel: median(home.map((r) => r.fuelPct)), preDawn: pct(home, (r) => r.preDawn),
    seenMed: median(rs.filter((r) => Number.isFinite(r.seenS)).map((r) => r.seenS)), sentMed: median(rs.filter((r) => Number.isFinite(r.sentS)).map((r) => r.sentS)), detMed: median(rs.map((r) => r.detections ?? 0)),
    leftMed: median(left), backMed: median(back), leftN: left.length, ends: rs.filter((r) => r.reason === 'adrift' && !r.preDawn && r.t < 1500).length, lastS: Math.max(...rs.map((r) => r.t ?? 0)),
    reasons: Object.entries(reasons).map(([k, v]) => `${k} ${v}`).join('・') };
}
/** 帯の判定: 下限・上限（null は無し）。端は帯の端から ±5 点の内（edge 偽の行＝規則の確かめと、seed 41〜80 を足した後の 80 夜の決め＝spec §14 は端にしない） */
function verdict(x, lo, hi, edge = true) {
  if (!Number.isFinite(x)) return '—';
  if (edge && ((lo !== null && Math.abs(x - lo) <= 5) || (hi !== null && Math.abs(x - hi) <= 5))) return '端';
  return (lo === null || x >= lo) && (hi === null || x <= hi) ? '✓' : '✗';
}
/** spec §6 の帯（ノーマル N1〜N4・A1・A2・M1〜M3・K・F・T・D、ハード H1・H2・K）: [名, 台本（端で seed を足す台本を + で）, 文, 判定の列]。final は 80 夜で決める（端なし） */
export function bands(R, hard, final = false) {
  const s = R.shadow_report, ra = R.report_attack, out = [];
  const add = (name, pol, parts) => out.push([name, pol, parts.map(([lab, x, lo, hi, e]) => `${lab} ${Number.isFinite(x) ? x : '-'} ${verdict(x, lo, hi, e !== false && !final)}`).join(' ・ '), parts.map(([, x, lo, hi, e]) => verdict(x, lo, hi, e !== false && !final))]);
  if (hard && s) add('H1', 'shadow_report', [['達成', s.win, 45, 75], ['沈没', s.own, null, 25]]);
  if (hard && s && ra) add('H2', 'report_attack+shadow_report', [[`達成（≤ H1 ${s.win}）`, ra.win, null, s.win]]);
  if (!hard && s) add('N1', 'shadow_report', [['達成', s.win, 60, 85], ['沈没', s.own, null, 15], ['帰投', s.home, 85, null]]);
  if (!hard && s) add('N2', 'shadow_report', [['無線が壊れた夜', s.radio, 5, 25], [`壊れた ${s.broken} 夜のうち中継`, s.relayOfBroken, 60, null]]);
  if (!hard && R.radar_only) add('N3', 'radar_only', [['報告', R.radar_only.rep, 0, 0, false]]);
  const c = R.charge, v4 = c ? [verdict(c.own, 40, null, !final), verdict(c.win, null, 30, !final)] : [];
  if (!hard && c) out.push(['N4', 'charge', `沈没 ${c.own}（≥ 40）か 達成 ${c.win}（≤ 30）`, [v4.includes('✓') ? '✓' : v4.includes('端') ? '端' : '✗']]);
  const a = R.bb_ambush;
  if (!hard && a) add('A1', 'bb_ambush', [['戦艦に 1 本以上', a.bb1, 60, 90], ['3 本以上', a.bb3, 25, 60], ['沈没', a.own, null, 35]]);
  if (!hard && ra && s) add('A2', 'report_attack+shadow_report', [[`達成（≥ N1 − 20 ＝ ${s.win - 20}）`, ra.win, s.win - 20, null], ['戦艦に 1 本以上', ra.bb1, 40, null]]);
  const all = Object.values(R), n = all.reduce((k, r) => k + r.n, 0), per = n === 0 ? NaN : Math.round((10000 * all.reduce((k, r) => k + r.mgSum, 0)) / n) / 10;
  if (!hard) add('M1', 'すべて', [[`弾薬庫の期待値 ／1,000 夜（${n} 夜）`, per, null, 10]]);
  if (!hard && a) add('M2', 'bb_ambush', [['弾薬庫の期待値 ／1,000 夜', a.per1000, 10, 60]]);
  const quiet = ['shadow_report', 'radar_only', 'idle'].filter((p) => R[p]), qd = quiet.reduce((k, p) => k + R[p].mgDraws, 0);
  if (!hard && quiet.length) out.push(['M3', quiet.join('・'), `弾薬庫を引いた回数 ${qd}`, [qd === 0 ? '✓' : '✗']]);
  const cap = all.reduce((k, r) => k + r.capKpi, 0), bad = all.reduce((k, r) => k + r.ddBad, 0), dd = all.reduce((k, r) => k + r.dd, 0);
  out.push(['K', 'すべて', `戦艦・重巡を狙った 1 本で kpiTarget が真 ${cap} 本 ・ 駆逐艦を狙った ${dd} 本のうち今の規則と違う ${bad} 本`, [cap === 0 && bad === 0 ? '✓' : '✗']]);
  if (!hard && s) add('F', 'shadow_report', [['帰投の夜の燃料の中央値 %', s.fuel, 15, 35], [`中継した ${s.relayed} 夜の漂流 %`, s.relayAdrift, null, 10]]);
  if (!hard && s) add('T', 'shadow_report', [['帰投の夜の夜明け前 %', s.preDawn, 90, null]]);
  const d = R.idle;
  if (!hard && d) out.push(['D', 'idle', `夜明けの後・1,500 秒未満に漂流 ${d.ends}/${d.n}（最も遅い ${f1(d.lastS)} 秒）`, [d.ends === d.n ? '✓' : '✗']]);
  return out;
}
export const fmtRow = (p, r) => `${p.padEnd(13)} ${String(r.n).padStart(2)} 夜 | 達成 ${r.win} | 沈没 ${r.own} | 帰投 ${r.home} | 報告 ${r.rep}（確認 ${r.seen}・確認 ${f1(r.seenMed)} 秒・送る ${f1(r.sentMed)} 秒）| 無線 ${r.radio}（${r.broken} 夜・中継 ${r.relayOfBroken}）| 戦艦 1 本以上 ${r.bb1}・3 本以上 ${r.bb3} | 命中 戦艦 ${r.hitBB} 重巡 ${r.hitCA} 駆逐艦 ${r.hitDD}（撃った夜 ${r.firedN}）| 3・4 本目 ${r.h34}・引いた ${r.mgDraws}・確率の和 ${r.mgSum.toFixed(3)}（${f1(r.per1000)}／1,000 夜）・轟沈 ${r.booms} | 被弾 駆逐艦 ${r.dmgDD}・重巡 ${r.dmgCA}・戦艦 ${r.dmgBB} | 燃料 ${f1(r.fuel)} | 夜明け前 ${r.preDawn} | 発見の中央値 ${f1(r.detMed)} | 見張り 離れた ${r.leftN}（${f1(r.leftMed)} 秒）戻った ${f1(r.backMed)} 秒 | K ${r.capKpi}・駆逐艦 ${r.ddKpi}/${r.dd}（違う ${r.ddBad}）| ${r.reasons}`;
const sc = (r) => (r.sc ?? []).map((s) => `${s[0]}:${f1(s[1])}/${f1(s[2])}`).join(',') || '-';
export const fmtNight = (c, r) => `${c.policy.padEnd(13)} seed ${String(c.seed).padStart(2)} | ${String(r.reason).padEnd(9)} 達成 ${r.win ? 1 : 0} 帰投 ${r.home ? 1 : 0} 夜明け前 ${r.preDawn ? 1 : 0} 燃料 ${r.fuelPct ?? '-'} | 報告 ${r.rep ?? '-'} 確認 ${f1(r.seenS)} 送る ${f1(r.sentS)} 中継 ${f1(r.relayS)} 無線 ${r.radio ? f1(r.radioS) : '-'}（引く ${r.radioDraws ?? '-'}）| 撃つ ${r.fired ?? '-'} 初弾 ${f1(r.firstS)} 命中 戦艦 ${r.hitBB ?? '-'} 重巡 ${r.hitCA ?? '-'} 駆逐艦 ${r.hitDD ?? '-'} 3・4 本目 ${r.h34 ?? '-'} 弾薬庫 ${r.mgDraws ?? '-'}/${Number.isFinite(r.mgSum) ? r.mgSum.toFixed(2) : '-'}/${r.booms ?? '-'} K ${r.capKpi ?? '-'}/${r.ddBad ?? '-'} | 発見 ${r.detections ?? '-'} 見張り ${sc(r)} 撃沈 ${r.sunk ?? '-'} | ${f1(r.t)} 秒${r.errors.length ? ` | page errors ${r.errors.length}（${r.errors[0]}）` : ''}`;
export const printBands = (B) => { for (const [name, pol, text, v] of B) console.log(`  ${name} ${pol.padEnd(15)} ${text}  → ${v.join('')}`); };
