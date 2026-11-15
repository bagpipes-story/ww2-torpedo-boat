// 迎撃の模擬の表（v0.8.0 S3。us_04「ブラケット海峡の夜」。spec-v0800 §4.11）。中身は src/core/intercept-sim*.ts・src/systems/intercept-sim-setup.ts・intercept-calibration.ts
// （tests/intercept-sim-a・b と同じ）。TABLE=1（既定）: 組ごとの遊び方の表。TABLE=2: 組を合わせた表と帯の ✓/✗（✗ があれば終了コード 1。scripts/headless/g2.sh の US04=1）。
// PERF=1: 1 夜の node の秒（radar_ambush と charge・REPS 夜）。環境変数: N（1 組の夜。既定 400）・SEED（最初の組の最初の seed。既定 1）・BLOCKS（組の数。既定 2＝seed 1〜400・1001〜1400）・
//   HARD=1・POL（, 区切り。既定は spec §4.11 の 7 行）・つまみ（spec §4.11 の順の data の鍵）SPEED（transit.speed_kt）・RANGE・SWEEP（radar.models.so_early の ship_range_m・sweep_s）・
//   LANE・UNLOAD（transit.outbound.lane_y_m・transit.unload_s）・FUEL（fuel_allotment_gal）・COVER（x,y,針路＝護衛の最初の脚 enemy_start。S3b の L38 の候補）。
//   既定の行は spec §4.11 の 7 つと参考の radar_ambush_full（spec の文のまま全速で離れる。帯なし）。列「護先」は自艇が沈んだ夜のうち護衛が最初に見つけた %、「護見」は護衛が最初に目に入った秒の中央、
//   「列≥1」は列の艦を 1 隻以上沈めた夜の %（S3c の B2a）。NOCOVER=1 は護衛のいない夜の参考の表（S3c の L45。g2 には入れない）
// 実行: npx esbuild scripts/intercept-sim.ts --bundle --platform=node --format=esm --outfile=<scratch>/intercept-sim.mjs && TABLE=2 node <scratch>/intercept-sim.mjs
import { gameData } from '../src/config/game-data';
import { runInterceptTrial, type InterceptSimSetup } from '../src/core/intercept-sim';
import { interceptCellOf, type InterceptCell, type InterceptTrial } from '../src/core/intercept-sim-cell';
import { INTERCEPT_POLICIES, type InterceptPolicy } from '../src/core/intercept-sim-policy';
import { interceptB6, interceptBandChecks, interceptNotes } from '../src/systems/intercept-calibration';
import { interceptNightSetup, withInterceptKnobs, type InterceptKnobs } from '../src/systems/intercept-sim-setup';

const env = (k: string): string | undefined => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : undefined);
const num = (k: string): number | undefined => (env(k) !== undefined ? Number(env(k)) : undefined);
const n = num('N') ?? 400;
const seed0 = num('SEED') ?? 1;
const blocks = num('BLOCKS') ?? 2;
const hard = env('HARD') === '1';
const noCover = env('NOCOVER') === '1';
const cv = env('COVER')?.split(',').map(Number);
const knobs: InterceptKnobs = { speedKt: num('SPEED'), shipRangeM: num('RANGE'), sweepS: num('SWEEP'), laneY: num('LANE'), unloadS: num('UNLOAD'), fuelGal: num('FUEL'), cover: cv ? { x: cv[0]!, y: cv[1]!, headingDeg: cv[2]! } : undefined };
const pols = (env('POL')?.split(',').map((x) => x.trim()).filter((x) => x !== '') ?? [...INTERCEPT_POLICIES, 'radar_ambush_full']) as InterceptPolicy[];
for (const p of pols) if (!([...INTERCEPT_POLICIES, 'radar_ambush_full', 'stay'] as readonly string[]).includes(p)) throw new Error(`遊び方 ${p} は無い（${INTERCEPT_POLICIES.join(' / ')} / radar_ambush_full / stay）`);
const data = withInterceptKnobs(gameData, knobs);
const seeds = (b: number): number => seed0 + b * 1000;
const setups = new Map<number, InterceptSimSetup>();
const setupOf = (seed: number): InterceptSimSetup => {
  let s = setups.get(seed);
  if (!s) setups.set(seed, (s = interceptNightSetup(data, seed, hard, noCover)));
  return s;
};
const pct = (x: number): string => (Number.isFinite(x) ? `${x.toFixed(1)}%` : '—');
const fx = (x: number, d: number): string => (Number.isFinite(x) ? x.toFixed(d) : '—');

if (env('PERF') === '1') {
  const reps = num('REPS') ?? 50;
  for (const p of ['radar_ambush', 'charge', 'stay'] as InterceptPolicy[]) {
    const t0 = performance.now();
    let steps = 0;
    for (let i = 0; i < reps; i++) steps += Math.round(runInterceptTrial(setupOf(seed0 + i), p, seed0 + i).endS * 60);
    const ms = performance.now() - t0;
    console.log(`[us_04 ${hard ? 'ハード' : 'ノーマル'} ${p} × ${reps} 夜] 1 夜 ${(ms / reps).toFixed(1)} ms・1 ステップ ${((ms * 1000) / steps).toFixed(2)} μs（${steps} ステップ）`);
  }
} else {
  const s1 = setupOf(seeds(0));
  const proto = (data.missionsSeed.missions as readonly Record<string, unknown>[]).find((m) => m['id'] === 'us_04')!['v0_1_prototype'] as Record<string, unknown>;
  const tb = proto['transit'] as { speed_kt: number; spacing_s: number; unload_s: number; inbound: { lane_y_m: number }; outbound: { lane_y_m: number } };
  const r = s1.radar;
  console.log(`[us_04 ${hard ? 'ハード' : 'ノーマル'}${noCover ? '・護衛なし（参考）' : ''} N ${n} × ${blocks} 組（seed ${Array.from({ length: blocks }, (_, b) => `${seeds(b)}〜${seeds(b) + n - 1}`).join('・')}）${Object.entries(knobs).filter(([, v]) => v !== undefined).map(([k, v]) => ` ${k} ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join('')}]`);
  console.log(`列 ${s1.transit.ships} 隻・${tb.speed_kt} kt・${tb.spacing_s} 秒おき・往路の道 y ${tb.inbound.lane_y_m}・揚陸 ${tb.unload_s} 秒・復路の道 y ${tb.outbound.lane_y_m}・レーダー ${r ? `${r.shipRangeM} m・掃引 ${r.sweepS} 秒` : 'なし'}・燃料 ${s1.fuelAllotmentGal} gal・夜明け ${s1.durationS} 秒`);
  const head = `${'遊び方'.padEnd(19)}撃沈≥1  列≥1   撃沈数 沈没   衝突(護/列)      砲火   帰投   達成   座礁  漂流  打切  夜明外 発見   燃料(帰投)p10-中-p90 終了秒 撃つ 命中%  狙1本(本)    接触秒 見え秒 護先%  護見秒`;
  const row = (p: string, c: InterceptCell): string =>
    p.padEnd(20) + pct(c.sinkPct).padEnd(7) + pct(c.sinkColumnPct).padEnd(7) + fx(c.sinkMean, 2).padEnd(6) + pct(c.ownSunkPct).padEnd(7) + `${pct(c.rammedPct)}(${fx(c.rammedCoverPct, 1)}/${fx(c.rammedColumnPct, 1)})`.padEnd(17) +
    pct(c.gunSunkPct).padEnd(7) + pct(c.homePct).padEnd(7) + pct(c.achievedPct).padEnd(7) + pct(c.groundedPct).padEnd(6) + pct(c.adriftPct).padEnd(6) + pct(c.cutPct).padEnd(6) + pct(c.dawnOutPct).padEnd(7) +
    pct(c.detectedPct).padEnd(7) + `${fx(c.fuelP10, 0)}-${fx(c.fuelMed, 0)}-${fx(c.fuelP90, 0)}`.padEnd(21) + fx(c.endMed, 0).padEnd(7) + fx(c.firedMean, 2).padEnd(5) + pct(c.hitPct).padEnd(7) +
    `${pct(c.aimedPct)}(${c.aimed})`.padEnd(13) + fx(c.contactMed, 1).padEnd(7) + fx(c.sightMed, 1).padEnd(7) + pct(c.coverFirstPct).padEnd(7) + fx(c.coverSightMed, 1);
  const all = new Map<InterceptPolicy, InterceptTrial[]>();
  for (let b = 0; b < blocks; b++) {
    console.log(`-- seed ${seeds(b)}〜${seeds(b) + n - 1}`);
    console.log(head);
    for (const p of pols) {
      const ts: InterceptTrial[] = [];
      for (let i = 0; i < n; i++) ts.push(runInterceptTrial(setupOf(seeds(b) + i), p, seeds(b) + i));
      all.set(p, [...(all.get(p) ?? []), ...ts]);
      console.log(row(p, interceptCellOf(ts, s1.objectiveSinks)));
    }
  }
  if (env('TABLE') === '2') {
    const merged = new Map<InterceptPolicy, InterceptCell>();
    console.log(`-- ${blocks} 組を合わせた ${blocks * n} 夜`);
    console.log(head);
    for (const [p, ts] of all) {
      merged.set(p, interceptCellOf(ts, s1.objectiveSinks));
      console.log(row(p, merged.get(p)!));
    }
    const checks = interceptBandChecks(merged, hard, hard ? null : interceptB6(data, s1));
    console.log(`帯（${blocks * n} 夜）:\n  ${checks.map((x) => `${x.id} ${x.text} ${x.ok ? '✓' : '✗'}`).join('\n  ')}`);
    if (!hard) for (const line of interceptNotes(merged)) console.log(`  参考 ${line}`);
    const bad = checks.filter((x) => !x.ok);
    console.log(bad.length === 0 ? '帯: すべて ✓' : `帯: ✗ ${bad.length} 件`);
    if (bad.length > 0) process.exitCode = 1;
  }
}
