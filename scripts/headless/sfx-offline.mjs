// 本物のリミッタでの確かめ（v0.7.1 S3。開発の道具。ゲームは import しない）: scripts/sfx-mix.ts の RAW=1 が書いた「一番混む 10 秒」の単発の束（左右）とループの束を、
// ヘッドレスの Chromium の OfflineAudioContext の DynamicsCompressorNode（config/sfx-config の SFX_LIMITER と同じ値＝下の LIMITER）に通して、出口（× master）の頂・|出口| > 1 の割合・
// 爆発の飛び出し（頭 0.3 秒 − 直前 1 秒）を出す。scripts/sfx-mixdown.ts の模型（先読み・戻りの自動調整・自動の補正の音量が本物と違う）の代わりの数。
// つなぎの案: 「通す」＝単発＋ループ × 束の音量 をリミッタへ／「後」＝リミッタは単発だけで、ループ × 束の音量 は master へ直に（S3 の決め）。束の音量は BUS（既定 1,0.5）。
// OfflineAudioContext を使うのはこの道具だけ（ゲームは使わない＝spec-v0710 §14 L5）。WebKit の DynamicsCompressor は同じ系統の実装だが、確かめたのは Chromium。
// v0.7.2 S1: 曲の束（raw の music と musicGain。scripts/sfx-music.ts の RAW=1 が書く raw-menu-*.json）は master へ直に（リミッタを通さない＝ゲームと同じ）。uiAt（ボタンの音の位置）が
//   あれば、ボタンの音の出口の頂と、その前 0.6〜0.1 秒の曲だけの出口の RMS の差（dB。spec-v0720 §8.3「メニューは UI の音が曲より ≥ 12 dB」）を出す。
// v0.7.2 S2（任務の曲。spec-v0720 §8.3・brief L23）: 合図と爆発の頭の位置（onsets）と曲の束（music）のある任務の窓（scripts/sfx-mix.ts の RAW=1 MUSIC=1 が書く raw-<件>-busy／quiet.json）は、
//   ゲームのつなぎ（単発 → リミッタ → master・ループ × 0.5 → master・曲の束 → master）で「曲なし」と「曲あり」を 2 回通し、門を出す: 出口の頂 < 0.9・1.0 超え 0%・前の 1 秒に爆発の無い
//   爆発の飛び出し（頭 0.3 秒 − 直前 1 秒）の窓ごとの中央値 ≥ 6.5 dB・合図（鍵ごと）と爆発の飛び出しの中央値の下がり（曲なし − 曲あり）≤ 0.5 dB（警報は ≤ 0.2 dB）。爆弾の笛の頭は 0.5〜1.1 秒。
//   JSON=<file> に窓ごとの数を書く。メニューの窓（raw-menu-*.json）は S1 のまま（UI の音が曲より ≥ 12 dB）。
// v0.7.2 S3（命中スローのベッドの濾波器。spec-v0720 §4.5・brief L30）: BED=<Hz>（ゲームは config/sfx-music-config の SFX_SLOW_SHAPE.idleHz＝20000）でループの束と曲の束を低域通過（BiquadFilter・
//   Q は既定）に通してから master へ（ゲームの S3 のつなぎ）。CTX_SR=<Hz> は context の速さ（既定は raw の 22,050 Hz＝濾波器の Hz がナイキストより上で素通し。端末の 44,100・48,000 では
//   標本は context が補う）。BEDCHECK=1 は曲ありの窓を「濾波器なし（S2）」と「BED の濾波器あり（S3）」の 2 回通し、窓ごとの出口の頂・RMS・合図と爆発の頭の差（dB）の最大を出す
//   （門 ±0.3 dB）。S2_JSON=<S2 の JSON> は今の回の曲ありの数と S2 の回の数の窓ごとの差の最大を出す。
// 実行: RAW=<raw-*.json のあるディレクトリ> [BUS=1,0.5] [JSON=<file>] [BED=20000] [CTX_SR=48000] [BEDCHECK=1] [S2_JSON=<file>] node scripts/headless/sfx-offline.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from './lib.mjs';

if (!process.env.RAW) throw new Error('RAW=<raw-*.json のあるディレクトリ> が要る');
const LIMITER = { threshold: -10, knee: 6, ratio: 12, attack: 0.003, release: 0.25 };
const MASTER = 0.8;
const BUS = (process.env.BUS ?? '1,0.5').split(',').map(Number);
/** S3: ベッドの濾波器の Hz（0 は無し＝S2 のつなぎ）・context の速さ（0 は raw の速さ）・濾波器ありとなしを比べるか */
const BED = Number(process.env.BED ?? 0);
const CTX_SR = Number(process.env.CTX_SR ?? 0);
const BEDCHECK = process.env.BEDCHECK === '1';

/** ページの中: 1 件・1 案を本物のリミッタに通して数を返す */
async function render(o) {
  const f32 = (b64) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Float32Array(u.buffer); };
  const left = f32(o.left), right = f32(o.right), loops = f32(o.loops);
  const n = left.length;
  const ctx = new OfflineAudioContext(2, n, o.sr);
  const shots = ctx.createBuffer(2, n, o.sr);
  shots.copyToChannel(left, 0);
  shots.copyToChannel(right, 1);
  const lp = ctx.createBuffer(1, n, o.sr);
  lp.copyToChannel(loops, 0);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = o.limiter.threshold; comp.knee.value = o.limiter.knee; comp.ratio.value = o.limiter.ratio; comp.attack.value = o.limiter.attack; comp.release.value = o.limiter.release;
  const master = ctx.createGain();
  master.gain.value = o.master;
  comp.connect(master);
  master.connect(ctx.destination);
  const s1 = ctx.createBufferSource();
  s1.buffer = shots;
  s1.connect(comp);
  const s2 = ctx.createBufferSource();
  s2.buffer = lp;
  const bus = ctx.createGain();
  bus.gain.value = o.bus;
  s2.connect(bus);
  bus.connect(o.through ? comp : master);
  s1.start(0);
  s2.start(0);
  if (o.music) {
    const mb = ctx.createBuffer(1, n, o.sr);
    mb.copyToChannel(f32(o.music), 0);
    const s3 = ctx.createBufferSource(), mg = ctx.createGain();
    s3.buffer = mb;
    mg.gain.value = o.musicGain;
    s3.connect(mg);
    mg.connect(master); // 曲の束は master へ直に（v0.7.2 の決め D6）
    s3.start(0);
  }
  const out = await ctx.startRendering();
  const L = out.getChannelData(0), R = out.getChannelData(1);
  let peak = 0, over = 0;
  for (let i = o.pre; i < n; i++) { const a = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (a > peak) peak = a; if (a > 1) over++; }
  const power = (a, b) => { let s = 0; for (let i = Math.max(0, a); i < Math.min(n, b); i++) s += L[i] * L[i] + R[i] * R[i]; return s / Math.max(1, b - a); };
  const h = Math.round(0.3 * o.sr);
  const pops = o.blastAt.map((at) => 10 * Math.log10((power(at, at + h) + 1e-9) / (power(at - o.sr, at) + 1e-9))).sort((x, y) => x - y);
  const db = (v) => 20 * Math.log10(v + 1e-12);
  const ui = (o.uiAt ?? []).map((at) => {
    let p = 0;
    for (let i = at; i < Math.min(n, at + Math.round(0.1 * o.sr)); i++) p = Math.max(p, Math.abs(L[i]), Math.abs(R[i]));
    return db(p) - 10 * Math.log10(power(at - Math.round(0.6 * o.sr), at - Math.round(0.1 * o.sr)) / 2 + 1e-24);
  }).sort((x, y) => x - y);
  return { peak, over: over / Math.max(1, n - o.pre), pops, ui };
}

/**
 * ページの中（S2）: 任務の窓をゲームのつなぎで通し（曲は withMusic の時だけ）、出口の頂・1.0 超え・合図と爆発の頭の飛び出しを返す。
 * S3: bedHz > 0 はループと曲を低域通過の濾波器に通す（ゲームのベッドの濾波器）。ctxSr > 0 は context の速さ（標本の位置は raw の速さから換えて読む）
 */
async function renderMission(o) {
  const f32 = (b64) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Float32Array(u.buffer); };
  const n0 = f32(o.left).length, sr0 = o.sr, sr = o.ctxSr > 0 ? o.ctxSr : sr0, k = sr / sr0, n = Math.ceil(n0 * k);
  const ctx = new OfflineAudioContext(2, n, sr);
  const buf = (chs) => { const b = ctx.createBuffer(chs.length, n0, sr0); chs.forEach((x, i) => b.copyToChannel(x, i)); return b; };
  const comp = ctx.createDynamicsCompressor();
  for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) comp[k].value = o.limiter[k];
  const master = ctx.createGain();
  master.gain.value = o.master;
  comp.connect(master);
  master.connect(ctx.destination);
  const src = (b, to, g) => { const s = ctx.createBufferSource(); s.buffer = b; const m = ctx.createGain(); m.gain.value = g; s.connect(m); m.connect(to); s.start(0); };
  let bed = master;
  if (o.bedHz > 0) { bed = ctx.createBiquadFilter(); bed.type = 'lowpass'; bed.frequency.value = o.bedHz; bed.connect(master); } // S3: ベッドの濾波器（Q は既定）
  src(buf([f32(o.left), f32(o.right)]), comp, 1);
  src(buf([f32(o.loops)]), bed, o.bus);
  if (o.withMusic) src(buf([f32(o.music)]), bed, o.musicGain);
  const out = await ctx.startRendering();
  const L = out.getChannelData(0), R = out.getChannelData(1);
  const pre = Math.round(o.pre * k);
  let peak = 0, over = 0, sum = 0;
  for (let i = pre; i < n; i++) { const a = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (a > peak) peak = a; if (a > 1) over++; sum += L[i] * L[i] + R[i] * R[i]; }
  const power = (a, b) => { let s = 0; for (let i = Math.max(0, a); i < Math.min(n, b); i++) s += L[i] * L[i] + R[i] * R[i]; return s / Math.max(1, Math.min(n, b) - Math.max(0, a)); };
  // 曲だけの出口の強さ（左右に同じ＝2 倍。cmr＝頭の強さ（曲なし）÷ 同じ頭の曲の強さ＝合図が曲より何 dB 上か）
  const mu = o.withMusic ? f32(o.music) : null, mg = o.musicGain * o.master;
  const musicPower = (a, b) => { let s = 0; for (let i = Math.max(0, a); i < Math.min(n0, b); i++) s += 2 * (mu[i] * mg) ** 2; return s / Math.max(1, Math.min(n0, b) - Math.max(0, a)); };
  const pops = o.onsets.filter((on) => on.at >= o.pre && (on.fam === 'cue' || (on.fam === 'blast' && on.key !== 'sink'))).map((on) => {
    let h0 = 0, h1 = Math.min(Math.round(0.3 * sr0), on.len);
    if (on.key === 'bomb_fall') { h0 = Math.round(0.5 * sr0); h1 = Math.round(1.1 * sr0); }
    const iso = on.fam === 'blast' && !o.onsets.some((x) => x.fam === 'blast' && x.key !== 'sink' && x.at < on.at && x.at >= on.at - sr0);
    const at = (v) => Math.round(v * k); // raw の標本 → 出口の標本
    const ph = power(at(on.at + h0), at(on.at + h1)), pp = power(at(on.at - sr0), at(on.at));
    return { key: on.key, fam: on.fam, iso, ph, pm: mu ? musicPower(on.at + h0, on.at + h1) : 0, pop: 10 * Math.log10((ph + 1e-12) / (pp + 1e-12)) };
  });
  return { peak, over: over / Math.max(1, n - pre), rms: Math.sqrt(sum / 2 / Math.max(1, n - pre)), pops };
}

const files = readdirSync(process.env.RAW).filter((f) => /^raw-.*\.json$/.test(f)).sort();
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
let worst = 0, uiBad = 0;
const med = (a) => { const x = [...a].sort((p, q) => p - q); return x.length ? x[x.length >> 1] : NaN; };
const mission = [];
const bedRows = [];
for (const f of files) {
  const raw = JSON.parse(readFileSync(join(process.env.RAW, f), 'utf8'));
  if (raw.onsets && raw.music) {
    // S2: 任務の窓（曲なし・曲あり）
    const o = { ...raw, limiter: LIMITER, master: MASTER, bus: BUS[BUS.length - 1], bedHz: BED, ctxSr: CTX_SR };
    const off = await page.evaluate(renderMission, { ...o, withMusic: false });
    const on = await page.evaluate(renderMission, { ...o, withMusic: true });
    if (BEDCHECK) bedRows.push({ n: `${raw.name}-${raw.tag}`, a: await page.evaluate(renderMission, { ...o, withMusic: true, bedHz: 0 }), b: on });
    const iso = (r) => r.pops.filter((p) => p.iso).map((p) => p.pop);
    const bl = (r) => r.pops.filter((p) => p.fam === 'blast').map((p) => p.pop);
    mission.push({ name: raw.name, tag: raw.tag, startS: raw.startS, ducks: raw.ducks, off, on });
    const fmt = (x) => (Number.isNaN(x) ? '   -' : x.toFixed(1).padStart(5));
    console.log(`${`${raw.name}-${raw.tag}`.padEnd(18)} @${raw.startS.toFixed(0).padStart(3)}s 頂 ${off.peak.toFixed(3)} → ${on.peak.toFixed(3)}  1.0 超え ${(on.over * 100).toFixed(3)}%  RMS ${(20 * Math.log10(off.rms + 1e-12)).toFixed(1)} → ${(20 * Math.log10(on.rms + 1e-12)).toFixed(1)} dB  爆発 ${bl(off).length} 回 中央値 ${fmt(med(bl(off)))} → ${fmt(med(bl(on)))}・孤立 ${iso(off).length} 回 ${fmt(med(iso(off)))} → ${fmt(med(iso(on)))} dB  下げ ${raw.ducks} 回`);
    continue;
  }
  const routes = raw.music ? [{ name: '曲は後', bus: 0, through: false }] : [...BUS.map((b) => ({ name: `通す×${b}`, bus: b, through: true })), ...BUS.filter((b) => b !== 1).map((b) => ({ name: `後×${b}`, bus: b, through: false })), { name: 'ループなし', bus: 0, through: false }];
  for (const r of routes) {
    const res = await page.evaluate(render, { ...raw, limiter: LIMITER, master: MASTER, bus: r.bus, through: r.through });
    if ((!r.through && r.bus > 0) || raw.music) worst = Math.max(worst, res.peak);
    const mid = res.pops.length ? `${res.pops[res.pops.length >> 1].toFixed(1)} dB` : '-';
    const ui = res.ui.length ? `  ボタンの音 ${res.ui.length} 回: 出口の頂 − 曲の RMS 中央値 ${res.ui[res.ui.length >> 1].toFixed(1)} dB・一番悪い ${res.ui[0].toFixed(1)} dB（門 ≥ 12）` : '';
    if (res.ui.length && res.ui[0] < 12) uiBad++;
    console.log(`${raw.name.padEnd(12)} ${r.name.padEnd(8)} 出口の頂 ${res.peak.toFixed(3)}・1.0 超え ${(res.over * 100).toFixed(3)}%  爆発 ${res.pops.length} 回の飛び出し 中央値 ${mid}・一番悪い ${res.pops.length ? `${res.pops[0].toFixed(1)} dB` : '-'}${ui}`);
  }
}
await browser.close();
let bad = 0;
if (mission.length) {
  // S2 の門（spec §8.3・brief L23）
  const check = (ok, text) => { if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${text}`); };
  const peakOn = Math.max(...mission.map((m) => m.on.peak)), peakOff = Math.max(...mission.map((m) => m.off.peak));
  const overOn = Math.max(...mission.map((m) => m.on.over));
  check(peakOn < 0.9, `曲ありの出口の頂の最大 ${peakOn.toFixed(3)} < 0.9（曲なし ${peakOff.toFixed(3)}・${mission.length} 窓）`);
  check(overOn === 0, `曲ありの 1.0 超え ${(overOn * 100).toFixed(4)}%（0%）`);
  const isoWins = mission.map((m) => ({ n: `${m.name}-${m.tag}`, off: med(m.off.pops.filter((p) => p.iso).map((p) => p.pop)), on: med(m.on.pops.filter((p) => p.iso).map((p) => p.pop)) })).filter((x) => !Number.isNaN(x.on));
  const isoMin = isoWins.reduce((a, x) => (x.on < a.on ? x : a), { n: '-', on: Infinity, off: Infinity });
  check(isoMin.on >= 6.5, `前の 1 秒に爆発の無い爆発の飛び出し（窓ごとの中央値）の最小 ${isoMin.on.toFixed(1)} dB ≥ 6.5（${isoMin.n}・曲なし ${isoMin.off.toFixed(1)}。${isoWins.length} 窓）`);
  const keys = [...new Set(mission.flatMap((m) => m.off.pops.map((p) => (p.fam === 'blast' ? '爆発' : p.key))))].sort();
  for (const k of keys) {
    const sel = (r) => r.pops.filter((p) => (p.fam === 'blast' ? '爆発' : p.key) === k).map((p) => p.pop);
    const a = mission.flatMap((m) => sel(m.off)), b = mission.flatMap((m) => sel(m.on));
    const busyA = mission.filter((m) => m.tag === 'busy').flatMap((m) => sel(m.off)), busyB = mission.filter((m) => m.tag === 'busy').flatMap((m) => sel(m.on));
    const quietA = mission.filter((m) => m.tag === 'quiet').flatMap((m) => sel(m.off)), quietB = mission.filter((m) => m.tag === 'quiet').flatMap((m) => sel(m.on));
    const drop = med(a) - med(b), lim = k === 'alarm' ? 0.2 : 0.5;
    const part = (x, y) => (x.length ? `${med(x).toFixed(1)} → ${med(y).toFixed(1)}` : '-');
    check(drop <= lim, `${k.padEnd(12)} ${String(a.length).padStart(3)} 回: 飛び出しの中央値 ${med(a).toFixed(2)} → ${med(b).toFixed(2)} dB（下がり ${drop.toFixed(2)} ≤ ${lim}）  混む窓 ${part(busyA, busyB)}・静かな窓 ${part(quietA, quietB)}`);
  }
  const ducks = mission.reduce((a, m) => a + (m.ducks ?? 0), 0);
  console.log(`曲を下げた回数（窓の中の模型）: ${ducks}`);
  // 参考（埋もれ）: 合図・爆発の頭の強さ（曲なし）が同じ頭の曲（下げの後）より何 dB 上か（cmr。12 dB 以上なら曲の上に聞こえる目安）。鍵ごとの中央値と一番悪い値
  const cm = {};
  for (const m of mission) m.off.pops.forEach((p, i) => { const q = m.on.pops[i]; if (!q || q.pm <= 0) return; (cm[p.fam === 'blast' ? '爆発' : p.key] ??= []).push(10 * Math.log10((p.ph + 1e-12) / q.pm)); });
  console.log(`参考 合図・爆発の頭 − 同じ頭の曲（cmr・中央値／一番悪い・下げの後）: ${Object.keys(cm).sort().map((k) => `${k} ${med(cm[k]).toFixed(1)}／${Math.min(...cm[k]).toFixed(1)}`).join('  ')}`);
  if (process.env.JSON) (await import('node:fs')).writeFileSync(process.env.JSON, JSON.stringify(mission.map((m) => ({ ...m, off: { ...m.off }, on: { ...m.on } }))));
  // S3: ベッドの濾波器は素通しか（同じ窓の「濾波器なし」a と今の回 b の差・S2 の回との差。dB の差の最大）
  const db = (v) => 20 * Math.log10(v + 1e-12);
  const diff = (pairs) => {
    let peak = 0, rms = 0, pop = 0, worstN = '-';
    for (const { n, a, b } of pairs) {
      const dp = Math.abs(db(a.peak) - db(b.peak)), dr = Math.abs(db(a.rms) - db(b.rms));
      const dq = a.pops.reduce((m, p, i) => (b.pops[i] ? Math.max(m, Math.abs(p.pop - b.pops[i].pop), Math.abs(10 * Math.log10((p.ph + 1e-12) / (b.pops[i].ph + 1e-12)))) : m), 0);
      if (Math.max(dp, dr, dq) > Math.max(peak, rms, pop)) worstN = n;
      peak = Math.max(peak, dp); rms = Math.max(rms, dr); pop = Math.max(pop, dq);
    }
    return { peak, rms, pop, worstN };
  };
  const bedText = `ベッドの濾波器 ${BED || 'なし'} Hz・context ${CTX_SR || '22050（raw）'} Hz`;
  if (BEDCHECK && bedRows.length) {
    const d = diff(bedRows);
    check(Math.max(d.peak, d.rms, d.pop) <= 0.3, `S3 ${bedText}: 濾波器なし → ありの差の最大（${bedRows.length} 窓）: 出口の頂 ${d.peak.toFixed(3)}・RMS ${d.rms.toFixed(3)}・合図と爆発の頭（飛び出しと強さ）${d.pop.toFixed(3)} dB（門 ±0.3・一番の窓 ${d.worstN}）`);
  }
  if (process.env.S2_JSON) {
    const s2 = JSON.parse(readFileSync(process.env.S2_JSON, 'utf8'));
    const pairs = mission.map((m) => ({ n: `${m.name}-${m.tag}`, a: (s2.find((x) => x.name === m.name && x.tag === m.tag) ?? {}).on, b: m.on })).filter((p) => p.a);
    const d = diff(pairs);
    check(pairs.length === s2.length && Math.max(d.peak, d.rms, d.pop) <= 0.3, `S3 ${bedText}: S2 の回（${process.env.S2_JSON.split('/').slice(-3).join('/')}）との差の最大（${pairs.length}/${s2.length} 窓）: 出口の頂 ${d.peak.toFixed(3)}・RMS ${d.rms.toFixed(3)}・合図と爆発の頭 ${d.pop.toFixed(3)} dB（門 ±0.3・一番の窓 ${d.worstN}）`);
  }
}
console.log(`本物のリミッタ（Chromium）: 「後」の案の出口の頂の最大 ${worst.toFixed(3)}（1 未満が目標）`);
process.exitCode = worst < 1 && uiBad === 0 && bad === 0 ? 0 : 1;
