// 米PT の掃射の航過の模擬の表（v0.6.3。docs/02 §6.4、spec §F）: 遊び方ごとに 発見・最初の発見距離・航過（撃った/無傷）・発射・命中・HP（平均/p90）・沈没・帰投・
// 帰投の秒・燃料・夜明け後の帰投・予告から初弾・見失わせた回数・同時の航過・漂流/打ち切り を出す。中身は src/core/pt-pass-sim.ts（tests/pt-pass-sim.test.ts と同じ）。
// 値は data（enemies.json の us_pt_enemy・boats.json の艇・missions_seed の jp_05）。調整の順は damage → rounds → offset → passes → detect → open（spec §F.4）。
// 環境変数: MISSION（既定 jp_05）・N（夜の数。既定 400）・SEED（最初の seed。既定 1）・POL（既定 全部）・TABLE=1（較正の帯と ✓/✗。tests と同じ表）・
//   上書き DETECT（base_detect_m）・DMG（guns.damage）・ROUNDS・OFFSET・PASSES・OPEN・COMMITT・RUNKT・GAP・WING・ALLOT（燃料 gal）・DAWN（夜明けまでの実秒）
// 実行: npx esbuild scripts/pt-pass-sim.ts --bundle --platform=node --format=esm --outfile=<scratch>/pt.mjs && node <scratch>/pt.mjs
import { gameData } from '../src/config/game-data';
import { PT_POLICIES, type PtCell, type PtPolicy } from '../src/core/pt-pass-sim';
import { mpsToKt } from '../src/core/units';
import { PT_CALIBRATION, ptCalibrationMisses, ptCalibrationRun, type PtSimOverrides } from '../src/systems/pt-pass-sim-setup';

const num = (k: string): number | undefined => (process.env[k] !== undefined && process.env[k] !== '' ? Number(process.env[k]) : undefined);
const mission = process.env['MISSION'] ?? 'jp_05';
const n = num('N') ?? 400;
const seed = num('SEED') ?? 1;
const o: PtSimOverrides = {
  detectM: num('DETECT'), damage: num('DMG'), rounds: num('ROUNDS'), offsetM: num('OFFSET'), passes: num('PASSES'), openFireS: num('OPEN'),
  commitTcpaS: num('COMMITT'), runInKt: num('RUNKT'), passGapS: num('GAP'), wingmanDelayS: num('WING'), fuelGal: num('ALLOT'), dawnS: num('DAWN'),
};
const pols = (process.env['POL'] ?? PT_POLICIES.join(','))
  .split(',')
  .map((x) => x.trim())
  .filter((x) => x !== '') as PtPolicy[];
for (const p of pols) if (!(PT_POLICIES as readonly string[]).includes(p)) throw new Error(`遊び方 ${p} は ${PT_POLICIES.join(' / ')}`);

const run = ptCalibrationRun(gameData, mission, n, seed, o);
const s = run.setup;
const p = s.pt;
const f = (x: number, d: number, w: number): string => (Number.isFinite(x) ? x.toFixed(d) : '-').padStart(w);
const set = Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${v}`);
console.log(`[${mission} N ${n} seed ${seed}〜${seed + n - 1}${set.length > 0 ? ` ${set.join(' ')}` : ''}]`);
console.log(
  `発見 ${p.baseDetectM} m・突撃 ${Math.round(mpsToKt(p.runInMps))} kt・最接近 ${p.commitTcpaS} 秒前に固める・ずらし ${p.offsetM} m・予告から ${p.openFireS} 秒・1 回 ${p.roundsPerPass} 発 × ${p.hit.damage}・` +
    `1 隻 ${p.maxPasses} 回・次まで ${p.passGapS} 秒・2 隻目 +${p.wingmanDelayS} 秒・夜明け ${s.durationS} 秒・燃料 ${s.fuelGal} gal`,
);
console.log('policy        det%  1stDet passes(fired/clean) shots hits HP(mean/p90) sunk% ret% t(med) fuel%(med/p10) dawn% warn(min) lost maxSim adrift/timeout');
const line = (c: PtCell): string =>
  `${c.policy.padEnd(12)} ${f(c.detectedPct, 0, 4)}  ${f(c.firstDetectMedM, 0, 6)}  ${c.passes.toFixed(2)}(${c.firedPasses.toFixed(2)}/${c.cleanPasses.toFixed(2)})  ${f(c.shots, 0, 4)} ${f(c.hits, 1, 4)}  ${f(c.hpMean, 1, 5)}/${f(c.hpP90, 0, 2)}  ` +
  `${f(c.sunkPct, 0, 4)} ${f(c.homePct, 0, 4)}  ${f(c.homeMedS, 0, 5)}  ${f(c.fuelMedPct, 0, 3)}/${f(c.fuelP10Pct, 0, 3)}  ${f(c.afterDawnPct, 0, 4)}  ${f(c.minWarnS, 2, 5)}  ${c.lostContacts.toFixed(2)} ${c.maxPassing} ${f(c.adriftPct, 1, 4)}/${f(c.timeoutPct, 1, 3)}`;
const cellOf = run.cell;
if (process.env['TABLE'] === '1') {
  const cruise = cellOf('cruise').hpMean;
  for (const r of PT_CALIBRATION) {
    const c = cellOf(r.policy);
    const miss = ptCalibrationMisses(r, c, s, cruise);
    console.log(`${line(c)}  ${r.star ? '★' : ' '} ${miss.length === 0 ? '✓' : `✗ ${miss.join('・')}`}`);
  }
} else for (const pol of pols) console.log(line(cellOf(pol)));
console.log('det% = 見つかった夜 | 1stDet = 最初に見つかった距離の中央値 m | HP = 失った HP | ret% = 帰投 | t・fuel% は帰投した夜 | dawn% = 夜明けの後に帰投 | warn = 予告から初弾の最短秒 | maxSim = 同時に航過');
