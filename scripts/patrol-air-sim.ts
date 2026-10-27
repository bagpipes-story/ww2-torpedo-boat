// 夜の哨戒機の模擬の表（v0.6.7。jp_02「孤島の哨戒」。docs/02 §6.8、spec-v067 §F）。中身は src/core/patrol-air-sim*.ts・src/systems/patrol-air-sim-setup.ts（tests/patrol-air-sim* と同じ）。
// TABLE=1（既定）: 台本ごとの表（組ごと）。TABLE=2: 設計の行の帯と不変（組ごと）・対の帯（組を合わせた夜）の ✓/✗（✗ があれば終了コード 1）。TABLE=3: 転舵の反応の掃き（F11。hud/0.30〜1.00・消火 2.0 秒）。
// 環境変数: N（1 組の夜。既定 400）・SEED（最初の組の最初の seed。既定 1）・BLOCKS（組の数。既定 2＝seed 1〜400・401〜800）・POL（台本の , 区切り。既定は spec §F.3 の 15 台本）・
//   上書き BOMBS（1 機の爆弾）・CEP・GAP（sweep_gap_s）・ORBIT（orbit_s）・MARGIN（hud_stop_margin_s）・RADAR（radar_passes）・HOLD（戻す秒 lo,hi）・RJIT（~ の反応 lo,hi）・STOPJIT（止める遅れ lo,hi）・CREW=0・EXT（消すまでの秒）
// 実行: npx esbuild scripts/patrol-air-sim.ts --bundle --platform=node --format=esm --outfile=<scratch>/patrol-air-sim.mjs && TABLE=2 node <scratch>/patrol-air-sim.mjs
import { gameData } from '../src/config/game-data';
import { runPatrolCell, type PatrolCell } from '../src/core/patrol-air-sim-cell';
import { PATROL_SIM_POLICIES, PATROL_SWEEP_EXTINGUISH_S, PATROL_SWEEP_REACT_S, parsePatrolPolicy } from '../src/core/patrol-air-sim-policy';
import { PATROL_CALIBRATION, patrolDesignMisses, patrolPairChecks, patrolSweepMisses } from '../src/systems/patrol-air-calibration';
import { patrolSimSetup, type PatrolSimOverrides } from '../src/systems/patrol-air-sim-setup';

const env = (k: string): string | undefined => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : undefined);
const num = (k: string): number | undefined => (env(k) !== undefined ? Number(env(k)) : undefined);
const pair = (k: string): readonly [number, number] | undefined => (env(k) !== undefined ? (env(k)!.split(',').map(Number) as unknown as readonly [number, number]) : undefined);
const n = num('N') ?? 400;
const seed0 = num('SEED') ?? 1;
const blocks = num('BLOCKS') ?? 2;
const table = env('TABLE') ?? '1';
const ext = num('EXT');
const o: PatrolSimOverrides = { bombs: num('BOMBS'), cepM: num('CEP'), sweepGapS: num('GAP'), orbitS: num('ORBIT'), marginS: num('MARGIN'), radarPasses: num('RADAR'), holdS: pair('HOLD'), reactJitterS: pair('RJIT'), stopJitterS: pair('STOPJIT'), crewOn: env('CREW') === '0' ? false : undefined };
const s = patrolSimSetup(gameData, o);
const sweep = table === '3';
const names = sweep ? PATROL_SWEEP_REACT_S.map((r) => `hud/${r.toFixed(2)}`) : (env('POL')?.split(',').map((x) => x.trim()).filter((x) => x !== '') ?? PATROL_SIM_POLICIES);
const pct = (x: number): string => `${x.toFixed(1)}%`;
const fx = (x: number, d: number): string => (Number.isFinite(x) ? x.toFixed(d) : '—');
const seeds = (b: number): number => seed0 + b * n;

const g = s.gate;
console.log(`[jp_02 N ${n} × ${blocks} 組（seed ${seed0}〜${seed0 + blocks * n - 1}）${Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => ` ${k} ${String(v)}`).join('')}${ext !== undefined ? ` EXT ${ext}` : ''}${sweep ? ` 掃き（消火 ${PATROL_SWEEP_EXTINGUISH_S} 秒）` : ''}]`);
console.log(`門番: 捜索 ${g.firstPassS} 秒・間 ${g.sweepGapS} 秒・付近 ${g.orbitS} 秒・航跡 ${g.wakeTriggerS} 秒・余白 ${g.hudStopMarginS} 秒・レーダー ${g.radarPasses} 回・${g.fromBearingDeg}°+${g.passRotateDeg}°・航跡 ${g.wakeDetectM}／発見 ${g.lockM}／船体 ${g.nearM} m・夜明け ${s.durationS} 秒`);
console.log(`出撃: ${s.sortie.planes} 機 × ${s.sortie.bombsPerPlane} 発・落下 ${s.sortie.fallFeelS.toFixed(3)} 秒・散布 R ${s.sortie.scatterM.toFixed(1)} m／夜明け ${s.dawn.planes} 機 × ${s.dawn.bombsPerPlane} 発・戻す ${s.holdS.join('〜')} 秒・反応 ${s.reactJitterS.join('〜')} 秒・乗員の効き ${s.crewOn ? 'あり' : 'なし'}`);
const cells = new Map<string, PatrolCell[]>();
for (let b = 0; b < blocks; b++) {
  console.log(`-- seed ${seeds(b)}〜${seeds(b) + n - 1}`);
  console.log(`${'台本'.padEnd(14)}沈没（夜/夜明け/火災）${''.padEnd(9)}夜明け前    中央値   捜索(航跡)    目/発見   目の夜%     夜の弾  1 発    暁の弾 止秒   回避%   燃料P10  予告最短 機 夜/暁 空 ✓`);
  for (const name of names) {
    const c = runPatrolCell(s, parsePatrolPolicy(name, sweep ? PATROL_SWEEP_EXTINGUISH_S : ext), n, seeds(b));
    cells.set(name, [...(cells.get(name) ?? []), c]);
    const row = PATROL_CALIBRATION.find((r) => r.policy === name);
    const miss = table === '2' && row ? patrolDesignMisses(row, c, s) : [];
    console.log(
      name.padEnd(16) + `${pct(c.sunkPct)} (${pct(c.sunkNightPct)}/${pct(c.sunkDawnPct)}/f${pct(c.sunkFirePct)})`.padEnd(30) + pct(c.homeBeforeDawnPct).padEnd(12) + fx(c.medHomeS, 1).padEnd(9) +
        `${c.passes.toFixed(2)}(${c.passesWake.toFixed(2)})`.padEnd(14) + `${c.findsVisual.toFixed(2)}/${c.finds.toFixed(2)}`.padEnd(10) + pct(c.findNightPct).padEnd(12) + c.nightBombs.toFixed(2).padEnd(8) +
        fx(c.hitsPerBomb, 3).padEnd(8) + c.dawnBombs.toFixed(2).padEnd(7) + c.stoppedS.toFixed(1).padEnd(7) + pct(c.evadePct).padEnd(8) + pct(c.fuelP10Pct).padEnd(9) + fx(c.minWarnS, 2).padEnd(9) +
        `${c.maxAttackNight}/${c.maxAttackDawn}`.padEnd(7) + `${c.maxBombsAir}`.padEnd(3) + (table === '2' ? (row ? (miss.length === 0 ? '✓' : `✗ ${miss.join('・')}`) : '（帯なし）') : ''),
    );
  }
}
const fails: string[] = [];
if (table === '2') {
  const pairs = patrolPairChecks((p) => cells.get(p) ?? []);
  console.log(`対の帯（${blocks} 組を合わせた ${blocks * n} 夜）:\n  ${pairs.map((x) => `${x.text} ${x.ok ? '✓' : '✗'}`).join('\n  ')}`);
  fails.push(...pairs.filter((x) => !x.ok).map((x) => x.text));
}
if (sweep) for (let b = 0; b < blocks; b++) fails.push(...patrolSweepMisses(names.map((x) => cells.get(x)![b]!.sunkPct)).map((m) => `seed ${seeds(b)}〜: ${m}`));
if (table === '2') fails.push(...PATROL_CALIBRATION.flatMap((r) => (cells.get(r.policy) ?? []).flatMap((c, b) => patrolDesignMisses(r, c, s).map((m) => `${r.policy} seed ${seeds(b)}〜: ${m}`))));
if (table === '2' || sweep) console.log(fails.length === 0 ? '帯: すべて ✓' : `帯: ✗ ${fails.length} 件\n  ${fails.join('\n  ')}`);
if (fails.length > 0) process.exitCode = 1;
