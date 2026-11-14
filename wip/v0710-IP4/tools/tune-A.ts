// IP4: IP3 の tune-ip3 の写し（今の木＝torp_launch は F）。IP2: 弾倉の終わり（記録の reload で rate ≠ 1＝S5 の 1.3）を新しい鍵 reload_end・rate 1 に置き換える（END=1）。IP1: S5 の tune に RATES=key:from=to（記録の rate の置き換え）と 'cue' の窓（torp_launch・reload が一番多い 10 秒）を足した。S5 の詰めの道具（scratchpad のみ）: probe の記録 → 混む窓と静かな窓の raw（単発の左右・ループの束・engine の束・合図と爆発の頭の位置）
// 環境: PROBE=<json> OUT=<dir> [CASES=a,b] [GAINS=key=倍,...]（記録の音量に掛ける＝SFX_TABLE の gain を変えた時の模擬） [LOOPS=engine=倍,...]
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SFX_SAMPLE_RATE as SR, SFX_TABLE, type SfxKey } from '/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0710/impl/IP4/treeA/src/config/sfx-config';
import { renderSfx } from '/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0710/impl/IP4/treeA/src/assets/sfx-bank';
import { LIMITER_MAKEUP, mixdown, busiestWindow, loopStem, type ProbeCase } from '/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0710/impl/IP4/treeA/scripts/sfx-mixdown';

const parse = (s: string | undefined): Record<string, number> => Object.fromEntries((s ?? '').split(',').filter(Boolean).map((kv) => { const [k, v] = kv.split('='); return [k!, Number(v)]; }));
const gains = parse(process.env.GAINS);
const loopsMul = parse(process.env.LOOPS);
const minInt = parse(process.env.MININT);
const fromS = parse(process.env.FROM);
const rates = (process.env.RATES ?? '').split(',').filter(Boolean).map((t) => { const [k, ft] = t.split(':'); const [f, to] = ft!.split('='); return [k!, Number(f), Number(to)] as const; });
const CUEK = ['torp_launch', 'reload', 'reload_end'];
const END = process.env.END === '1';
const out = process.env.OUT!; mkdirSync(out, { recursive: true });
const pick = process.env.CASES ? process.env.CASES.split(',') : null;
const data = JSON.parse(readFileSync(process.env.PROBE!, 'utf8')) as { cases: ProbeCase[] };
const IDS = ['engine', 'sea', 'fire', 'rain', 'drone'];
const W = 10;
for (const c0 of data.cases) {
  if (pick && !pick.includes(c0.name)) continue;
  const lastAt: Record<string, number> = {};
  const kept = c0.log.filter((r) => { const mi = minInt[r[1]]; if (mi === undefined || r[6] < 0) return true; if (r[0] - (lastAt[r[1]] ?? -1e9) < mi) return false; lastAt[r[1]] = r[0]; return true; });
  const c: ProbeCase = { ...c0, log: kept.map((r) => { const f = gains[r[1]] ?? 1; const rr = r.slice() as typeof r; rr[8] = r[8] * f; for (const [k, fr, to] of rates) if (r[1] === k && Math.abs(r[4] - fr) < 1e-6) rr[4] = to; if (END && r[1] === 'reload' && Math.abs(r[4] - 1) > 1e-6) { rr[1] = 'reload_end'; rr[4] = 1; } return rr; }) };
  const m = mixdown(c);
  const n = m.mono.length;
  // ループ: 全部（倍率つき）と engine だけ
  const stem = (only: number): Float32Array => loopStem({ ...c, loops: (c.loops ?? []).map((r) => { const rr = r.slice() as typeof r; for (let i = 0; i < 5; i++) rr[1 + i] = (only < 0 || only === i ? r[1 + i] : 0) * (loopsMul[IDS[i]!] ?? 1); return rr; }) }, n);
  const loops = stem(-1), engine = stem(0);
  const BUSG = Number(process.env.BUS ?? 0.5);
  const snrOf = (r: (typeof c.log)[number]): number => {
    const x = renderSfx(r[1] as SfxKey); const at = Math.round((r[0] - c.t0) * SR); const rate = r[4]; const g = r[8];
    let h0 = 0, h1 = Math.min(Math.round(0.3 * SR), Math.floor(x.length / rate));
    if (r[1] === 'bomb_fall') { h0 = Math.round(0.5 * SR); h1 = Math.round(1.1 * SR); }
    let own = 0, tot = 0;
    for (let i = h0; i < h1 && at + i < n; i++) { const p = i * rate, j = Math.floor(p); const v = (x[j]! + ((x[j + 1] ?? 0) - x[j]!) * (p - j)) * g; own += v * v; const lp = loops[at + i]! * BUSG / LIMITER_MAKEUP; const mo = m.mono[at + i]! + lp; tot += mo * mo; }
    return 10 * Math.log10((own + 1e-12) / (Math.max(0, tot - own) + 1e-12));
  };
  const onsets = c.log.filter((r) => r[6] >= 0).map((r) => ({ at: Math.round((r[0] - c.t0) * SR), key: r[1], fam: SFX_TABLE[r[1] as SfxKey].family, len: Math.round(SFX_TABLE[r[1] as SfxKey].seconds * SR / r[4]), snr: SFX_TABLE[r[1] as SfxKey].family === 'cue' ? snrOf(r) : 0 }));
  // 静かな窓: 位置つきの単発が一番少ない 10 秒（5 秒から）
  const total = Math.ceil(c.t1 - c.t0);
  const per = new Uint32Array(total + 1);
  for (const r of c.log) if (r[6] >= 0 && r[12] !== 1) per[Math.min(total, Math.floor(r[0] - c.t0))]!++;
  let qBest = 1e9, qAt = 5;
  for (let s = 5; s + W <= total; s++) { let k = 0; for (let i = s; i < s + W; i++) k += per[i]!; if (k < qBest) { qBest = k; qAt = s; } }
  const busy = busiestWindow(c, W);
  // 'cue' の窓: torp_launch・reload の頭が一番多い 10 秒（頭の 1 秒前から。無ければ作らない）
  const ct = c.log.filter((r) => r[6] >= 0 && CUEK.includes(r[1])).map((r) => r[0] - c.t0);
  let cAt = -1, cBest = 0;
  for (const t of ct) { const s0 = Math.max(1, t - 1); const k = ct.filter((u) => u >= s0 && u < s0 + W).length; if (k > cBest) { cBest = k; cAt = s0; } }
  const wins: [string, number][] = [['busy', fromS[c0.name] !== undefined ? Math.round(fromS[c0.name]! * SR) : busy.from], ['quiet', qAt * SR]];
  if (cAt >= 0) wins.push(['cue', Math.round(cAt * SR)]);
  for (const [tag, from0] of wins) {
    const from = from0, to = Math.min(n, from + W * SR), a = Math.max(0, from - SR);
    const sl = (x: Float32Array): string => Buffer.from(new Float32Array(x.subarray(a, to)).buffer).toString('base64');
    const on = onsets.filter((o) => o.at >= from && o.at < to).map((o) => ({ ...o, at: o.at - a }));
    writeFileSync(join(out, `raw-${c.name}-${tag}.json`), JSON.stringify({ name: c.name, tag, sr: SR, pre: from - a, startS: from / SR, onsets: on, left: sl(m.left), right: sl(m.right), loops: sl(loops), engine: sl(engine) }));
  }
}
