// S5: raw を本物の DynamicsCompressor（Chromium の OfflineAudioContext）に通し、出口の頂・1.0 超え・爆発と合図の飛び出し・engine の割合を出す（scratchpad のみ）
// RAW=<dir> [BUS=0.5] [LIMIT=thr,knee,ratio] [MASTER=0.8]
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';
const [thr, knee, ratio] = (process.env.LIMIT ?? '-10,6,12').split(',').map(Number);
const LIM = { threshold: thr, knee, ratio, attack: 0.003, release: 0.25 };
const MASTER = Number(process.env.MASTER ?? 0.8), BUS = Number(process.env.BUS ?? 0.5);
async function render(o) {
  const f32 = (b64) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Float32Array(u.buffer); };
  const left = f32(o.left), right = f32(o.right), loops = f32(o.loops), engine = f32(o.engine);
  const n = left.length, sr = o.sr;
  const ctx = new OfflineAudioContext(2, n, sr);
  const shots = ctx.createBuffer(2, n, sr); shots.copyToChannel(left, 0); shots.copyToChannel(right, 1);
  const lp = ctx.createBuffer(1, n, sr); lp.copyToChannel(loops, 0);
  const comp = ctx.createDynamicsCompressor();
  for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) comp[k].value = o.lim[k];
  const master = ctx.createGain(); master.gain.value = o.master;
  comp.connect(master); master.connect(ctx.destination);
  const s1 = ctx.createBufferSource(); s1.buffer = shots; s1.connect(comp);
  const s2 = ctx.createBufferSource(); s2.buffer = lp; const bus = ctx.createGain(); bus.gain.value = o.bus; s2.connect(bus); bus.connect(master);
  s1.start(0); s2.start(0);
  const out = await ctx.startRendering();
  const L = out.getChannelData(0), R = out.getChannelData(1);
  let peak = 0, over = 0, es = 0, os = 0;
  for (let i = o.pre; i < n; i++) { const a = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (a > peak) peak = a; if (a > 1) over++; const e = engine[i] * o.bus * o.master; es += 2 * e * e; os += L[i] * L[i] + R[i] * R[i]; }
  const power = (a, b) => { let s = 0; for (let i = Math.max(0, a); i < Math.min(n, b); i++) s += L[i] * L[i] + R[i] * R[i]; return s / Math.max(1, Math.min(n, b) - Math.max(0, a)); };
  const pops = [];
  for (const on of o.onsets) {
    if (on.at < o.pre) continue;
    let h0 = 0, h1 = Math.min(Math.round(0.3 * sr), on.len);
    if (on.key === 'bomb_fall') { h0 = Math.round(0.5 * sr); h1 = Math.round(1.1 * sr); }
    pops.push({ key: on.key, fam: on.fam, snr: on.snr, pop: 10 * Math.log10((power(on.at + h0, on.at + h1) + 1e-12) / (power(on.at - sr, on.at) + 1e-12)) });
  }
  return { peak, over: over / (n - o.pre), engineShare: Math.sqrt(es / Math.max(1e-12, os)), rms: Math.sqrt(os / 2 / (n - o.pre)), pops };
}
const files = readdirSync(process.env.RAW).filter((f) => /^raw-.*\.json$/.test(f)).sort();
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
const CUES = ['alarm', 'light_on', 'bell', 'bomb_fall', 'hull_hit', 'torp_launch', 'reload', 'flare_pop', 'engine_cough', 'smoke'];
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };
const all = { peak: 0, over: 0 };
const res = [];
for (const f of files) {
  const raw = JSON.parse(readFileSync(join(process.env.RAW, f), 'utf8'));
  const r = await page.evaluate(render, { ...raw, lim: LIM, master: MASTER, bus: BUS });
  all.peak = Math.max(all.peak, r.peak); all.over = Math.max(all.over, r.over);
  const bl = r.pops.filter((p) => p.fam === 'blast' && p.key !== 'sink').map((p) => p.pop);
  const blAt = raw.onsets.filter((o) => o.fam === 'blast' && o.key !== 'sink' && o.at >= raw.pre);
  const iso = r.pops.filter((p) => p.fam === 'blast' && p.key !== 'sink').filter((p, i) => !raw.onsets.some((o) => o.fam === 'blast' && o.at < blAt[i].at && o.at >= blAt[i].at - raw.sr)).map((p) => p.pop);
  const cue = {};
  const snr = {};
  for (const p of r.pops) if (CUES.includes(p.key) && p.fam === 'cue') { (cue[p.key] ??= []).push(p.pop); (snr[p.key] ??= []).push(p.snr); }
  const cueTxt = Object.entries(cue).map(([k, v]) => `${k} ${v.length}:${med(v).toFixed(1)}/${Math.min(...v).toFixed(1)}`).join(' ');
  res.push({ name: raw.name, tag: raw.tag, ...r, snr, blastMed: med(bl), blastMin: bl.length ? Math.min(...bl) : NaN, nBlast: bl.length, isoMed: med(iso), nIso: iso.length, cue });
  console.log(`${(raw.name + '-' + raw.tag).padEnd(18)} @${raw.startS.toFixed(0).padStart(3)}s 頂 ${r.peak.toFixed(3)} 超 ${(r.over * 100).toFixed(2)}% RMS ${(20 * Math.log10(r.rms)).toFixed(1)}dB engine ${(r.engineShare * 100).toFixed(0)}%  爆発 ${bl.length}: ${bl.length ? med(bl).toFixed(1) + '/' + Math.min(...bl).toFixed(1) : '-'} 孤 ${iso.length}:${iso.length ? med(iso).toFixed(1) : '-'}  合図(数:中央/最小) ${cueTxt}`);
}
await browser.close();
console.log(`最大の頂 ${all.peak.toFixed(3)}・1.0 超え ${(all.over * 100).toFixed(3)}%  （BUS ${BUS}・LIMIT ${thr},${knee},${ratio}・MASTER ${MASTER}）`);
if (process.env.JSON) (await import('node:fs')).writeFileSync(process.env.JSON, JSON.stringify(res.map(({ pops, ...x }) => x)));
