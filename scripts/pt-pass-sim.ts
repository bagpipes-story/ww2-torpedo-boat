// 米PT の掃射の航過の模擬の表（v0.6.3。docs/02 §6.4、spec §F・r1 §G）: 遊び方ごとに 発見・最初の発見距離・航過（撃った/無傷）・発射・命中・HP（平均/p90）・沈没・帰投・
// 帰投の秒・燃料・夜明け後の帰投・予告から初弾・同時の航過・漂流/打ち切り、挟み撃ち（赤い線が前と反対の舷から・赤い線の間の秒・待つ PT の最接近）、T-14 の 13mm（発射・命中・当てた夜・
// 撃退の夜・撃沈の夜・最初が閃光の夜）を出す。中身は src/core/pt-pass-sim.ts（tests/pt-pass-sim*.test.ts・tests/pt-gun-sim.test.ts と同じ）。値は data。調整の順は spec r1 §G.6。
// 環境変数: MISSION（既定 jp_05）・N（夜の数。既定 400）・SEED（最初の seed。既定 1）・POL（既定 全部 22）・TABLE=1（撃たない較正の帯と ✓/✗）・TABLE=2（13mm の較正の帯と ✓/✗）・
//   上書き DETECT（base_detect_m）・DMG（guns.damage）・ROUNDS・OFFSET・PASSES・OPEN・COMMITT・RUNKT・GAP・WING・TOL（commit_heading_tol_deg）・HOLD（hold_off_m）・
//   BREAKS・BREAKM（break_max_s・break_off_m）・STATION（tactics.station_m）・RETHP・CAS・PFIRE（under_fire）・GDISP・GRPM・GCONE・MAG・RELOAD（自艇の gun_battery）・
//   ALLOT（燃料 gal）・DAWN（夜明けまでの実秒）、v0.6.3 実機 2 回目: PEFF（guns.effective_night_m）・PENG（guns.engine_damage_chance）・GR_OFF=1（航過は危ない間だけを切る）・
//   CH_OFF=1（追撃を切る。GR_OFF=1 と実機 1 回目の値の上書きで f27b266 の表。spec r2 §I.3-5）
// 実行: npx esbuild scripts/pt-pass-sim.ts --bundle --platform=node --format=esm --outfile=<scratch>/pt.mjs && node <scratch>/pt.mjs
import { gameData } from '../src/config/game-data';
import type { PtCell } from '../src/core/pt-sim-cell';
import { PT_GUN_POLICIES, PT_POLICIES, type PtPolicy } from '../src/core/pt-sim-policy';
import { mpsToKt } from '../src/core/units';
import { PT_GUN_CALIBRATION, ptGunCalibrationMisses } from '../src/systems/pt-gun-calibration';
import { PT_CALIBRATION, ptCalibrationMisses, ptCalibrationRun, type PtSimOverrides } from '../src/systems/pt-pass-sim-setup';

const num = (k: string): number | undefined => (process.env[k] !== undefined && process.env[k] !== '' ? Number(process.env[k]) : undefined);
const mission = process.env['MISSION'] ?? 'jp_05';
const n = num('N') ?? 400;
const seed = num('SEED') ?? 1;
const o: PtSimOverrides = {
  detectM: num('DETECT'), damage: num('DMG'), rounds: num('ROUNDS'), offsetM: num('OFFSET'), passes: num('PASSES'), openFireS: num('OPEN'),
  commitTcpaS: num('COMMITT'), runInKt: num('RUNKT'), passGapS: num('GAP'), wingmanDelayS: num('WING'), commitHeadingTolDeg: num('TOL'), holdOffM: num('HOLD'),
  breakMaxS: num('BREAKS'), breakOffM: num('BREAKM'), stationM: num('STATION'), retreatHp: num('RETHP'), casualty: num('CAS'), fireChance: num('PFIRE'),
  gunDisp: num('GDISP'), gunRpm: num('GRPM'), gunCone: num('GCONE'), magRounds: num('MAG'), reloadS: num('RELOAD'), fuelGal: num('ALLOT'), dawnS: num('DAWN'),
  effectiveM: num('PEFF'), engineDamage: num('PENG'), passEndOff: process.env['GR_OFF'] === '1' ? true : undefined, chaseOff: process.env['CH_OFF'] === '1' ? true : undefined,
};
const all: readonly string[] = [...PT_POLICIES, ...PT_GUN_POLICIES];
const pols = (process.env['POL'] ?? all.join(','))
  .split(',')
  .map((x) => x.trim())
  .filter((x) => x !== '') as PtPolicy[];
for (const p of pols) if (!all.includes(p)) throw new Error(`遊び方 ${p} は ${all.join(' / ')}`);

const run = ptCalibrationRun(gameData, mission, n, seed, o);
const s = run.setup;
const p = s.pt;
const g = s.gun;
const f = (x: number, d: number, w: number): string => (Number.isFinite(x) ? x.toFixed(d) : '-').padStart(w);
const set = Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${v}`);
console.log(`[${mission} N ${n} seed ${seed}〜${seed + n - 1}${set.length > 0 ? ` ${set.join(' ')}` : ''}]`);
console.log(
  `発見 ${p.baseDetectM} m・突撃 ${Math.round(mpsToKt(p.runInMps))} kt・最接近 ${p.commitTcpaS} 秒前に固める・ずらし ${p.offsetM} m・予告から ${p.openFireS} 秒・1 回 ${p.roundsPerPass} 発 × ${p.hit.damage}・` +
    `1 隻 ${p.maxPasses} 回・次まで ${p.passGapS} 秒・2 隻目 +${p.wingmanDelayS} 秒・離脱 ${p.breakMaxS} 秒/${Math.round(Math.sqrt(p.breakOff2))} m・固める針路の差 ${p.commitHeadingTolDeg}°・待つ PT ${Math.round(Math.sqrt(p.holdOff2))} m・` +
    `位置取り ${p.stationM} m（${[...p.stationRelDeg].join('・')}°）・夜明け ${s.durationS} 秒・燃料 ${s.fuelGal} gal`,
);
if (g) {
  const gr = g.groups[0]!;
  console.log(
    `13mm ${gr.roundsPerMin} 発/分 × ${gr.damage}・散布 ${gr.dispersionM} m・弾倉 ${g.magazine?.rounds ?? '-'} 発/${g.magazine?.reloadS ?? '-'} 秒・円錐 ${g.deadConeDeg}°・射程 ${g.rangeM} m・閃光 ${g.flashRevealM} m | ` +
      `PT HP ${p.hullHp}・去る ${p.retreatHp}・死傷 ${p.casualtyChance}・引火 ${p.fireChance}`,
  );
}
console.log('policy        det%  1stDet passes(fired/clean) shots hits HP(mean/p90) sunk% ret% t(med) fuel%(med/p10) dawn% warn(min) pass(min) maxSim adrift/timeout | alt  gap  held | gun hits hit%n retire% PTsunk% flash1st%');
const line = (c: PtCell): string =>
  `${c.policy.padEnd(12)} ${f(c.detectedPct, 0, 4)}  ${f(c.firstDetectMedM, 0, 6)}  ${c.passes.toFixed(2)}(${c.firedPasses.toFixed(2)}/${c.cleanPasses.toFixed(2)})  ${f(c.shots, 0, 4)} ${f(c.hits, 1, 4)}  ${f(c.hpMean, 1, 5)}/${f(c.hpP90, 0, 2)}  ` +
  `${f(c.sunkPct, 1, 5)} ${f(c.homePct, 0, 4)}  ${f(c.homeMedS, 0, 5)}  ${f(c.fuelMedPct, 0, 3)}/${f(c.fuelP10Pct, 0, 3)}  ${f(c.afterDawnPct, 0, 4)}  ${f(c.minWarnS, 2, 5)}  ${f(c.minPassS, 2, 5)}  ${c.maxPassing} ${f(c.adriftPct, 1, 4)}/${f(c.timeoutPct, 1, 3)} | ` +
  `${c.alt.toFixed(2)} ${f(c.commitGapS, 1, 4)} ${f(c.heldMinM, 0, 4)} | ${f(c.gunShots, 0, 3)} ${f(c.gunHits, 1, 4)} ${f(c.hitNightPct, 0, 4)}  ${f(c.retiredPct, 1, 5)}  ${f(c.ptSunkPct, 1, 5)}  ${f(c.flashFirstPct, 0, 4)}`;
const cellOf = run.cell;
const mark = (star: boolean, miss: string[]): string => `  ${star ? '★' : ' '} ${miss.length === 0 ? '✓' : `✗ ${miss.join('・')}`}`;
if (process.env['TABLE'] === '1') {
  const cruise = cellOf('cruise').hpMean;
  for (const r of PT_CALIBRATION) console.log(line(cellOf(r.policy)) + mark(r.star, ptCalibrationMisses(r, cellOf(r.policy), s, cruise)));
} else if (process.env['TABLE'] === '2') {
  for (const r of PT_GUN_CALIBRATION) console.log(line(cellOf(r.policy)) + mark(r.star, ptGunCalibrationMisses(r, cellOf, s)));
} else for (const pol of pols) console.log(line(cellOf(pol)));
console.log(
  'det% = 見つかった夜 | 1stDet = 最初に見つかった距離の中央値 m | passes − fired = 撃たなかった航過 | HP = 失った HP | ret% = 帰投 | t・fuel% は帰投した夜 | dawn% = 夜明けの後に帰投 | warn = 予告から初弾の最短秒 | ' +
    'pass = 予告から航過の終わりの最短秒 | maxSim = 同時に航過 | alt = 赤い線が前と反対の舷から | gap = 赤い線の間の秒 | held = 待つ PT の最接近 m | gun・hits = 13mm の 1 夜の発射・命中 | ' +
    'hit%n = 撃った夜のうち当てた夜 | retire%・PTsunk% = 撃退・撃沈した夜 | flash1st% = 最初が閃光の夜',
);
