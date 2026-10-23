// 味方の大発を守る模擬の表（v0.6.4。jp_01「夜の輸送護衛」。docs/02 §6.4、spec §F.3）: 遊び方（台本）ごとに 到達・3 隻／2 隻以上／0 隻の夜・沈んだ大発・大発への命中・自艇の沈没／帰投／漂流／夜明け後・HP・被弾・燃料、
// 見つかった夜と秒・最初の標的が大発・大発／自艇への航過・連射・標的の切り替え、25mm の発射／命中／撃退／撃沈／制圧・機関損傷、不変（予告から初弾・同時の攻撃・射程と視程の外・自艇の視程の外・大発への連射・
// 1 回の攻撃の最大命中・健全な大発が 1 航過で沈んだ数・決着の秒・夜明け後の決着）を出す。中身は src/core/convoy-sim（tests/convoy-sim-*.test.ts と同じ）。値は data。
// 環境変数: MISSION（既定 jp_01）・N（夜の数。既定 400）・SEED（最初の seed。既定 1）・POL（既定 全部 14）・TABLE=1（較正の帯と ✓/✗）・
//   上書き BHP（barge_hp）・DBAND（detect_band）・KEEP（target_keep_ratio）・HOLD（target_switch_hold_s）・FLASHHOLD（flash_hold_s）・GDMG（25mm の 1 発の被害）・GRPM・GMAG・GDISP（25mm）・ALLOT（燃料 gal）・DAWN（夜明けまでの実秒）・GFLOOR（25mm の散布の最小半径 m）・FIRER（射撃ボタンを押す距離 m。近くまで待って撃つ人の型）
// 実行: npx esbuild scripts/convoy-sim.ts --bundle --platform=node --format=esm --outfile=<scratch>/convoy.mjs && node <scratch>/convoy.mjs
import { gameData, getPrototypeMission } from '../src/config/game-data';
import { convoyStartClearM } from '../src/config/pt-mission-data';
import type { SpeedStep } from '../src/core/boat-motion';
import type { ConvoyCell } from '../src/core/convoy-sim-cell';
import { CONVOY_POLICIES, type ConvoyPolicy } from '../src/core/convoy-sim-policy';
import { enemyDetectRangeM, speedFactorForBand } from '../src/core/visibility';
import { CONVOY_CALIBRATION, convoyCalibrationMisses, convoyCalibrationRun, type ConvoySimOverrides } from '../src/systems/convoy-sim-setup';

const num = (k: string): number | undefined => (process.env[k] !== undefined && process.env[k] !== '' ? Number(process.env[k]) : undefined);
const mission = process.env['MISSION'] ?? 'jp_01';
const n = num('N') ?? 400;
const seed = num('SEED') ?? 1;
const dband = process.env['DBAND'];
if (dband !== undefined && dband !== '' && !['stop', 'silent', 'cruise', 'full'].includes(dband)) throw new Error('DBAND は stop / silent / cruise / full');
const o: ConvoySimOverrides = {
  bargeHp: num('BHP'), detectBand: dband ? (dband as SpeedStep) : undefined, keepRatio: num('KEEP'), holdS: num('HOLD'), flashHoldS: num('FLASHHOLD'), gunDamage: num('GDMG'),
  gunRpm: num('GRPM'), magRounds: num('GMAG'), gunDisp: num('GDISP'), fuelGal: num('ALLOT'), dawnS: num('DAWN'), gunFloorM: num('GFLOOR'), fireRangeM: num('FIRER'),
};
const pols = (process.env['POL'] ?? CONVOY_POLICIES.join(',')).split(',').map((x) => x.trim()).filter((x) => x !== '') as ConvoyPolicy[];
for (const p of pols) if (!(CONVOY_POLICIES as readonly string[]).includes(p)) throw new Error(`遊び方 ${p} は ${CONVOY_POLICIES.join(' / ')}`);

const run = convoyCalibrationRun(gameData, mission, n, seed, o);
const s = run.setup;
const g = s.gun!;
const cv = s.convoy;
const bargeDetectM = enemyDetectRangeM(s.pt.baseDetectM, speedFactorForBand(s.detectBand, s.vis.speedFactor), s.vis, false);
const clearM = convoyStartClearM(s.pt, getPrototypeMission(gameData, mission));
const f = (x: number, d: number, w: number): string => (Number.isFinite(x) ? x.toFixed(d) : '-').padStart(w);
const set = Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${String(v)}`);
console.log(`[${mission} ${s.pt.bounds.width}x${s.pt.bounds.height} N ${n} seed ${seed}〜${seed + n - 1}${set.length > 0 ? ` ${set.join(' ')}` : ''}]`);
console.log(
  `大発 ${cv.count} 隻 HP ${cv.hp}・先頭 ${cv.leadX},${cv.leadY} → ${cv.beach ? `浜 ${cv.beach.x.join('/')}（y ${cv.beach.y}・転舵 ${cv.beach.turnX.map((x) => x.toFixed(0)).join('/')}・浜への道 ${cv.beach.runInM.toFixed(0)} m）` : `上陸線 ${cv.landingX}`}・間隔 ${cv.offsetsM.join('/')}・見つかる帯 ${s.detectBand}（${bargeDetectM.toFixed(0)} m）・標的 keep ${Math.sqrt(s.rule.keepRatio2).toFixed(2)} ロック ${s.rule.lockS} 秒 閃光の記憶 ${s.rule.flashHoldS} 秒 | ` +
    `自艇 ${s.start.x},${s.start.y} 輪 ${s.ring.x},${s.ring.y} 夜明け ${s.durationS} 秒 燃料 ${s.fuelGal} gal | 25mm ${g.groups[0]!.roundsPerMin} 発/分 × ${g.groups[0]!.damage}・散布 ${g.groups[0]!.dispersionM} m${g.minSpreadM !== undefined ? `（最小 ${g.minSpreadM} m）` : ''}・弾倉 ${g.magazine?.rounds ?? '-'}/${g.magazine?.reloadS ?? '-'} | PT の出発 → 船団 ≥ ${clearM.toFixed(0)} m（clamp 込み）`,
);
console.log('policy        arr/3  a3%  a2+%  a0%  bSunk bHit | pSunk% home% adrift% dawn%  HP   pHit fuel(med/p10) | det% detS 1stB%  passB passP burst  sw | gun hits ret% ret/n PTsunk% supp eng% | warn maxSim beyond beyondP bBurst worstB/P spk resolved(med) resDawn%');
const line = (c: ConvoyCell): string =>
  `${c.policy.padEnd(13)} ${f(c.arrivedMean, 2, 5)} ${f(c.arrived3Pct, 0, 4)} ${f(c.arrived2Pct, 0, 5)} ${f(c.arrived0Pct, 0, 4)}  ${f(c.bargesSunkMean, 2, 4)} ${f(c.bargeHits, 1, 4)} | ${f(c.sunkPct, 1, 6)} ${f(c.homePct, 0, 5)} ${f(c.adriftPct, 1, 7)} ${f(c.afterDawnPct, 0, 5)} ${f(c.hpMean, 1, 5)} ${f(c.playerHits, 1, 4)} ${f(c.fuelMed, 0, 4)}/${f(c.fuelP10, 0, 3)} | ` +
  `${f(c.detectedPct, 0, 4)} ${f(c.detectMedS, 0, 4)} ${f(c.firstBargePct, 0, 4)}  ${f(c.passesBarge, 2, 5)} ${f(c.passesPlayer, 2, 5)} ${f(c.bursts, 2, 5)} ${f(c.switches, 1, 4)} | ${f(c.gunShots, 0, 3)} ${f(c.gunHits, 1, 4)} ${f(c.retiredPct, 0, 4)} ${f(c.retiredMean, 2, 5)} ${f(c.ptSunkPct, 1, 6)} ${f(c.suppressions, 2, 4)} ${f(c.engineHitPct, 0, 4)} | ` +
  `${f(c.minWarnS, 2, 4)} ${c.maxPassing} ${c.beyond} ${c.beyondPlayerSight} ${c.burstsBarge} ${c.worstBarge}/${c.worstPlayer} ${c.singlePassKills} ${f(c.resolvedMedS, 0, 6)} ${f(c.resolvedAfterDawnPct, 0, 5)}`;
const mark = (star: boolean, miss: string[]): string => `  ${star ? '★' : ' '} ${miss.length === 0 ? '✓' : `✗ ${miss.join('・')}`}`;
if (process.env['TABLE'] === '1') for (const r of CONVOY_CALIBRATION) console.log(line(run.cell(r.policy)) + mark(r.star, convoyCalibrationMisses(r, run.cell, s)));
else for (const pol of pols) console.log(line(run.cell(pol)));
console.log(
  'arr/3 = 到達（3 隻中の平均） | a3%・a2+%・a0% = 3 隻／2 隻以上／0 隻の夜 | bSunk・bHit = 沈んだ大発・大発への命中 | pSunk%・home%・adrift%・dawn% = 自艇の沈没・帰投・漂流・夜明け後の帰投 | HP・pHit = 失った HP・被弾 | ' +
    'det%・detS・1stB% = 見つかった夜・秒の中央値・最初の標的が大発 | passB・passP・burst・sw = 大発への航過・自艇への航過・自艇への連射・標的の切り替え | gun…eng% = 25mm の発射・命中・撃退の夜・撃退/夜・撃沈の夜・制圧・機関損傷の夜 | ' +
    'warn = 予告から初弾の最短秒 | maxSim = 同時に撃つ攻撃 | beyond・beyondP = 射程か視程（標的から）の外・自艇の視程の外からの発射 | bBurst = 大発への連射 | worstB/P = 1 回の攻撃の最大命中（大発／自艇） | spk = 健全な大発が 1 航過で沈んだ数 | resolved・resDawn% = 決着の秒の中央値・夜明け後の決着',
);
