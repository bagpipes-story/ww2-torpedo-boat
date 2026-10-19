// 夜明けの空襲の模擬の表（v0.6.1。docs/02 §6.8）: 夜明けの瞬間に帰投地点の輪の縁から全速 N 秒の所にいる艇について、遊び方ごとに
// 輪に着いた割合・自艇を狙った爆弾 1 発あたりの命中（h）・僚艇の生存（v。us_01）を出す。中身は src/core/air-strike-sim.ts（tests/air-strike-sim.test.ts と同じ）。
// 値は data（enemies.json の strike・risk_events.json の dawn_air_strike.params・missions_seed の dawn_strike）。調整の順は wave_rest_s → release_altitude_m → run_gap_s → CEP。
// 環境変数: MISSION（既定 us_01,jp_06）・SECS（輪の縁まで全速の体感秒。既定 20,30,40）・N（回数。既定 600）・POL（既定 straight,stop,circle,zigzag,react0.35,react0.5,react0.7）・
//   上書き ALT（release_altitude_m）・CEP（accuracy_cep_m）・GAP（run_gap_s）・REST（wave_rest_s）・VIP=0（僚艇を狙う機なし＝全弾が自艇へ）・TABLE=1（較正の行と帯。tests と同じ表）
// 実行: npx esbuild scripts/dawn-strike-sim.ts --bundle --platform=node --format=esm --outfile=<scratch>/dawn-strike-sim.mjs && node <scratch>/dawn-strike-sim.mjs
import { gameData } from '../src/config/game-data';
import { parseStrikePolicy, runStrikeCell, type StrikeCellResult } from '../src/core/air-strike-sim';
import { STRIKE_CALIBRATION, calibrationLabel, calibrationMisses, runCalibrationCell, strikeSimSetup, type StrikeSimOverrides } from '../src/systems/air-strike-sim-setup';

const num = (k: string): number | undefined => (process.env[k] !== undefined && process.env[k] !== '' ? Number(process.env[k]) : undefined);
const list = (k: string, d: string): string[] =>
  (process.env[k] ?? d)
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x !== '');
const n = num('N') ?? 600;
const o: StrikeSimOverrides = { releaseAltitudeM: num('ALT'), cepM: num('CEP'), runGapS: num('GAP'), waveRestS: num('REST'), vipAim: process.env['VIP'] === '0' ? false : undefined };
const pct = (x: number): string => (Number.isNaN(x) ? '—' : `${Math.round(x * 100)}%`);
const hpb = (x: number): string => (Number.isNaN(x) ? '—' : x.toFixed(2));
const cellText = (r: StrikeCellResult): string => `${pct(r.survived)} h${hpb(r.hitsPerBomb)}${Number.isNaN(r.vipAlive) ? '' : ` v${pct(r.vipAlive)}`}`;
const band = (b: readonly [number, number] | null, what: string, unit: string): string => (b ? ` ${what} ${b[0]}〜${b[1]}${unit}` : '');

function knobs(missionId: string): string {
  const p = strikeSimSetup(gameData, missionId, o).strike;
  const vip = p.escortPlanes.map((v, i) => (v ? i + 1 : 0)).filter((i) => i > 0);
  return `${missionId}: ${p.nameJa} ${p.planes} 機 × ${p.bombsPerPlane} 発・落下 ${p.fallFeelS.toFixed(2)} 秒・散布 R ${p.scatterM.toFixed(1)} m・間隔 ${p.runGapS} 秒・波の休み ${p.waveRestS} 秒・僚艇を狙う機 ${vip.length > 0 ? vip.join('・') + ' 番機' : 'なし'}`;
}

console.log(`[N ${n}${o.releaseAltitudeM !== undefined ? ` ALT ${o.releaseAltitudeM}` : ''}${o.cepM !== undefined ? ` CEP ${o.cepM}` : ''}${o.runGapS !== undefined ? ` GAP ${o.runGapS}` : ''}${o.waveRestS !== undefined ? ` REST ${o.waveRestS}` : ''}${o.vipAim === false ? ' VIP=0' : ''}]`);
if (process.env['TABLE'] === '1') {
  for (const id of ['us_01', 'jp_06']) console.log(knobs(id));
  console.log(`${'行'.padEnd(26)}${'実測'.padEnd(18)}${'前回'.padEnd(18)}帯（tests は N 200）`);
  for (const c of STRIKE_CALIBRATION) {
    const r = runCalibrationCell(gameData, c, n, o);
    const miss = calibrationMisses(c, r);
    const proto = `${Number.isNaN(c.protoSurvPct) ? '—' : `${c.protoSurvPct}%`} h${hpb(c.protoHitsPerBomb)}${Number.isNaN(c.protoVipPct) ? '' : ` v${c.protoVipPct}%`}`;
    console.log(`${calibrationLabel(c).padEnd(26)}${cellText(r).padEnd(18)}${proto.padEnd(18)}${band(c.survPct, '生還', '%')}${band(c.vipPct, '僚艇', '%')}${band(c.hitsPerBomb, '1 発', '')}  ${miss.length === 0 ? '✓' : `✗ ${miss.join('・')}`}`);
  }
} else {
  const secs = list('SECS', '20,30,40').map(Number);
  const pols = list('POL', 'straight,stop,circle,zigzag,react0.35,react0.5,react0.7').map(parseStrikePolicy);
  for (const id of list('MISSION', 'us_01,jp_06')) {
    const s = strikeSimSetup(gameData, id, o);
    console.log(`\n${knobs(id)}`);
    console.log('遊び方'.padEnd(14) + secs.map((x) => `${x} 秒`.padStart(18)).join(''));
    for (const pol of pols) console.log(pol.name.padEnd(14) + secs.map((x) => cellText(runStrikeCell(s, pol, x, n, 1000 + x)).padStart(18)).join(''));
  }
  console.log('\n% = 輪に着いた割合 | h = 自艇を狙った爆弾 1 発あたりの命中 | v = 僚艇の生存（us_01） | seed 1000 + 秒');
}
