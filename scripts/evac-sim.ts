// 空襲下の退避の模擬の表（v0.6.11 S3。jp_03「運天港・空襲下の退避」。spec-v0611-r2 §12）。中身は src/core/evac-sim*.ts・src/systems/evac-sim-setup.ts・evac-calibration.ts（tests/evac-sim-* と同じ）。
// TABLE=1（既定）: 遊び方ごとの表（組ごと）。TABLE=2: 帯の ✓/✗（組を合わせた回で。✗ があれば終了コード 1）。PERF=1: ハードの stay で 1 ステップの計算の秒（node・ヘッドレスに依らない）。
// 環境変数: N（1 組の回。既定 400）・SEED（最初の組の最初の seed。既定 1）・BLOCKS（組の数。既定 2＝seed 1〜400・1001〜1400）・HARD=1・POL（, 区切り。既定は spec §12.3 の 10 行）・
//   つまみ（spec §12.5）DODGE・PICK・HAUL・DROP（外す隠れ場所の id を , 区切り）・COVER・COVERH・LEAD・FIRST・GAP・FPG・FOLLOW・FULLP、
//   S3b（U7）の PASSES・PASSESH（evac_raid.passes_max・hard.evac_passes_max。data 2。2 以上の時だけ表に「回数/編隊・2 回 %・波ごとの 2 回 %」の列を足す＝PASSES=1 なら表の列は S3 と同じ。
//   「見失(前)」などの終わり方は S3b から 1 回ごと（予告し直して閉じた回も数える＝core/evac-repass の closed）。
//   IP1（U8）から「早い決着%(秒)」＝全艇が隠れて 240 秒を待たずに決着した回の % とその秒の中央値（core/evac-early）
// 実行: npx esbuild scripts/evac-sim.ts --bundle --platform=node --format=esm --outfile=<scratch>/evac-sim.mjs && TABLE=2 node <scratch>/evac-sim.mjs
import { gameData } from '../src/config/game-data';
import { runEvacTrial, type EvacTrial } from '../src/core/evac-sim';
import { evacCellOf, type EvacCell } from '../src/core/evac-sim-cell';
import { EVAC_POLICIES, type EvacPolicy } from '../src/core/evac-sim-policy';
import { evacBandChecks } from '../src/systems/evac-calibration';
import { evacSimSetup, type EvacSimOverrides } from '../src/systems/evac-sim-setup';

const env = (k: string): string | undefined => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : undefined);
const num = (k: string): number | undefined => (env(k) !== undefined ? Number(env(k)) : undefined);
const n = num('N') ?? 400;
const seed0 = num('SEED') ?? 1;
const blocks = num('BLOCKS') ?? 2;
const table = env('TABLE') ?? '1';
const hard = env('HARD') === '1';
const o: EvacSimOverrides = {
  dodgeSuccess: num('DODGE'), pickS: num('PICK'), haulS: num('HAUL'), dropShelters: env('DROP')?.split(','), coverReveal: num('COVER'), coverRevealHard: num('COVERH'),
  announceLeadS: num('LEAD'), firstRunS: num('FIRST'), runGapS: num('GAP'), flightsPerGroupMax: num('FPG'), followGapM: num('FOLLOW'), fullP: num('FULLP'),
  passesMax: num('PASSES'), passesMaxHard: num('PASSESH'),
};
const pols = (env('POL')?.split(',').map((x) => x.trim()).filter((x) => x !== '') ?? [...EVAC_POLICIES]) as EvacPolicy[];
for (const p of pols) if (!(EVAC_POLICIES as readonly string[]).includes(p)) throw new Error(`遊び方 ${p} は無い（${EVAC_POLICIES.join(' / ')}）`);
const pct = (x: number): string => (Number.isFinite(x) ? `${x.toFixed(1)}%` : '—');
const fx = (x: number, d: number): string => (Number.isFinite(x) ? x.toFixed(d) : '—');
/** 組 b の最初の seed（spec §12.1: 1〜400・1001〜1400） */
const seeds = (b: number): number => seed0 + b * 1000;

function cellOf(setup: ReturnType<typeof evacSimSetup>, pol: EvacPolicy, first: number, count: number): { cell: EvacCell; trials: EvacTrial[] } {
  const trials: EvacTrial[] = [];
  for (let i = 0; i < count; i++) trials.push(runEvacTrial(setup, pol, first + i));
  return { cell: evacCellOf(trials), trials };
}

if (env('PERF') === '1') {
  // 1 ステップの計算の秒（node の performance.now。ヘッドレスのブラウザ・描画に依らない）: ハードの stay（全部の隊が外＝第 4 波で 3 編隊）で t 190〜225 秒の各ステップ
  const s = evacSimSetup(gameData, true, o);
  const samples: number[] = [];
  let last = 0;
  const reps = num('REPS') ?? 20;
  for (let r = 0; r < reps; r++) {
    last = performance.now();
    runEvacTrial(s, (env('PERFPOL') ?? 'stay') as EvacPolicy, seed0 + r, (t) => {
      const now = performance.now();
      if (t >= 190 && t <= 225) samples.push((now - last) * 1000);
      last = now;
    });
  }
  samples.sort((a, b) => a - b);
  const q = (x: number): number => samples[Math.min(samples.length - 1, Math.floor(x * samples.length))]!;
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  console.log(`[jp_03 ハード ${env('PERFPOL') ?? 'stay'} × ${reps} 回・t 190〜225 秒の ${samples.length} ステップ] 1 ステップ（模擬の全部＝台本・隊・空襲・対空・§2）の μs: 平均 ${mean.toFixed(1)}・p50 ${q(0.5).toFixed(1)}・p95 ${q(0.95).toFixed(1)}・p99 ${q(0.99).toFixed(1)}・最大 ${samples[samples.length - 1]!.toFixed(1)}`);
  console.log(`  1 フレーム（16.7 ms）に対する p95 の割合 ${((q(0.95) / 16667) * 100).toFixed(2)}%（固定ステップは 1 フレームに最大 4）`);
} else {
  const s = evacSimSetup(gameData, hard, o);
  const r = s.raid;
  // もう一度来る編隊（S3b）の列は回数が 2 以上の時だけ（1 なら S3 の表と同じ列）
  const rep = r.passesMax > 1;
  console.log(`[jp_03 ${hard ? 'ハード' : 'ノーマル'} N ${n} × ${blocks} 組（seed ${Array.from({ length: blocks }, (_, b) => `${seeds(b)}〜${seeds(b) + n - 1}`).join('・')}）${Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => ` ${k} ${String(v)}`).join('')}]`);
  console.log(`波: ${r.waves.map((w) => `${w.announceS}s×${w.planes}機`).join('・')}・同時 ${r.flights} 編隊・予告 ${r.announceLeadS} 秒・陰の発見 ${r.coverRevealChance}・1 隊 ${r.flightsPerGroupMax} 編隊・上げ ${s.params.haulS} 秒・隠れ場所 ${s.params.shelters.map((x) => `${x.id}(${x.slots})`).join(' ')}・回避 ${s.params.dodgeSuccess}・pick ${s.params.pickS} 秒・full_p ${s.params.fullP}・追従 ${s.params.followGapM} m${rep ? `・回数 ${r.passesMax}` : ''}`);
  const cells = new Map<EvacPolicy, EvacCell[]>();
  const all = new Map<EvacPolicy, EvacTrial[]>();
  for (let b = 0; b < blocks; b++) {
    console.log(`-- seed ${seeds(b)}〜${seeds(b) + n - 1}`);
    console.log(`${'遊び方'.padEnd(13)}達成    帰投    沈没   漂流  外で  残存 中央(p10-p90) 決着 18隻  埋まる%(秒)   壕満  来た 見失(前) 目標なし 切替  交代 沈A/B      段A%  隻/編隊 撃墜  §2命中 引く✗ 早い決着%(秒)${rep ? '  回数/編隊 2回%   波ごとの2回%' : ''}`);
    for (const pol of pols) {
      const { cell: c, trials } = cellOf(s, pol, seeds(b), n);
      cells.set(pol, [...(cells.get(pol) ?? []), c]);
      all.set(pol, [...(all.get(pol) ?? []), ...trials]);
      console.log(
        pol.padEnd(14) + pct(c.achievedPct).padEnd(8) + pct(c.homePct).padEnd(8) + pct(c.sunkPct).padEnd(7) + pct(c.adriftPct).padEnd(6) + pct(c.caughtPct).padEnd(7) +
          `${fx(c.medSurv, 0)}(${fx(c.p10Surv, 0)}-${fx(c.p90Surv, 0)})`.padEnd(12) + fx(c.medSurvSettle, 0).padEnd(5) + pct(c.all18Pct).padEnd(6) + `${pct(c.fillPct)}(${fx(c.medFillS, 0)})`.padEnd(14) +
          pct(c.cavesFullPct).padEnd(7) + fx(c.came, 2).padEnd(6) + `${fx(c.lostMid, 2)}(${fx(c.lostEarly, 2)})`.padEnd(11) + fx(c.noTarget, 2).padEnd(8) + fx(c.switches, 1).padEnd(6) + fx(c.promotions, 2).padEnd(5) +
          `${fx(c.sunkA, 2)}/${fx(c.sunkB, 2)}`.padEnd(11) + pct(c.tierAPct).padEnd(7) + fx(c.lossPerFlight, 2).padEnd(8) + fx(c.downs, 2).padEnd(6) + fx(c.dawnHits, 2).padEnd(7) + String(c.drawBad).padEnd(5) + `${pct(c.earlyPct)}(${fx(c.medEarlyS, 0)})`.padEnd(13) +
          (rep ? `  ${fx(c.passesPerFlight, 2).padEnd(9)}${pct(c.againPct).padEnd(8)}${c.againByWavePct.map(pct).join('/')}` : ''),
      );
    }
  }
  if (table === '2') {
    const merged = new Map<EvacPolicy, EvacCell>();
    for (const [p, ts] of all) merged.set(p, evacCellOf(ts));
    // ハードの「≤ ノーマルの seq − 15 点」: 同じ seed の組でノーマルの seq も回す
    let normalSeq = NaN;
    if (hard && pols.includes('seq')) {
      const sn = evacSimSetup(gameData, false, o);
      const ts: EvacTrial[] = [];
      for (let b = 0; b < blocks; b++) ts.push(...cellOf(sn, 'seq', seeds(b), n).trials);
      normalSeq = evacCellOf(ts).achievedPct;
    }
    const checks = evacBandChecks(merged, hard, normalSeq);
    console.log(`帯（${blocks} 組を合わせた ${blocks * n} 回）:\n  ${checks.map((x) => `${x.text} ${x.ok ? '✓' : '✗'}`).join('\n  ')}`);
    const bad = checks.filter((x) => !x.ok);
    console.log(bad.length === 0 ? '帯: すべて ✓' : `帯: ✗ ${bad.length} 件`);
    if (bad.length > 0) process.exitCode = 1;
  }
}
