// 本物のリミッタでの確かめ（v0.7.1 S3。開発の道具。ゲームは import しない）: scripts/sfx-mix.ts の RAW=1 が書いた「一番混む 10 秒」の単発の束（左右）とループの束を、
// ヘッドレスの Chromium の OfflineAudioContext の DynamicsCompressorNode（config/sfx-config の SFX_LIMITER と同じ値＝下の LIMITER）に通して、出口（× master）の頂・|出口| > 1 の割合・
// 爆発の飛び出し（頭 0.3 秒 − 直前 1 秒）を出す。scripts/sfx-mixdown.ts の模型（先読み・戻りの自動調整・自動の補正の音量が本物と違う）の代わりの数。
// つなぎの案: 「通す」＝単発＋ループ × 束の音量 をリミッタへ／「後」＝リミッタは単発だけで、ループ × 束の音量 は master へ直に（S3 の決め）。束の音量は BUS（既定 1,0.5）。
// OfflineAudioContext を使うのはこの道具だけ（ゲームは使わない＝spec-v0710 §14 L5）。WebKit の DynamicsCompressor は同じ系統の実装だが、確かめたのは Chromium。
// 実行: RAW=<raw-*.json のあるディレクトリ> [BUS=1,0.5] node scripts/headless/sfx-offline.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from './lib.mjs';

if (!process.env.RAW) throw new Error('RAW=<raw-*.json のあるディレクトリ> が要る');
const LIMITER = { threshold: -10, knee: 6, ratio: 12, attack: 0.003, release: 0.25 };
const MASTER = 0.8;
const BUS = (process.env.BUS ?? '1,0.5').split(',').map(Number);

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
  const out = await ctx.startRendering();
  const L = out.getChannelData(0), R = out.getChannelData(1);
  let peak = 0, over = 0;
  for (let i = o.pre; i < n; i++) { const a = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (a > peak) peak = a; if (a > 1) over++; }
  const power = (a, b) => { let s = 0; for (let i = Math.max(0, a); i < Math.min(n, b); i++) s += L[i] * L[i] + R[i] * R[i]; return s / Math.max(1, b - a); };
  const h = Math.round(0.3 * o.sr);
  const pops = o.blastAt.map((at) => 10 * Math.log10((power(at, at + h) + 1e-9) / (power(at - o.sr, at) + 1e-9))).sort((x, y) => x - y);
  return { peak, over: over / Math.max(1, n - o.pre), pops };
}

const files = readdirSync(process.env.RAW).filter((f) => /^raw-.*\.json$/.test(f)).sort();
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
let worst = 0;
for (const f of files) {
  const raw = JSON.parse(readFileSync(join(process.env.RAW, f), 'utf8'));
  const routes = [...BUS.map((b) => ({ name: `通す×${b}`, bus: b, through: true })), ...BUS.filter((b) => b !== 1).map((b) => ({ name: `後×${b}`, bus: b, through: false })), { name: 'ループなし', bus: 0, through: false }];
  for (const r of routes) {
    const res = await page.evaluate(render, { ...raw, limiter: LIMITER, master: MASTER, bus: r.bus, through: r.through });
    if (!r.through && r.bus > 0) worst = Math.max(worst, res.peak);
    const mid = res.pops.length ? `${res.pops[res.pops.length >> 1].toFixed(1)} dB` : '-';
    console.log(`${raw.name.padEnd(12)} ${r.name.padEnd(8)} 出口の頂 ${res.peak.toFixed(3)}・1.0 超え ${(res.over * 100).toFixed(3)}%  爆発 ${res.pops.length} 回の飛び出し 中央値 ${mid}・一番悪い ${res.pops.length ? `${res.pops[0].toFixed(1)} dB` : '-'}`);
  }
}
await browser.close();
console.log(`本物のリミッタ（Chromium）: 「後」の案の出口の頂の最大 ${worst.toFixed(3)}（1 未満が目標）`);
process.exitCode = worst < 1 ? 0 : 1;
