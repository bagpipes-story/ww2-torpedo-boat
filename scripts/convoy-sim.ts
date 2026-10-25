// 味方の大発を守る模擬の表（v0.6.4。jp_01「夜の輸送護衛」。docs/02 §6.4、spec §F.3）: 遊び方（台本）ごとに 到達・3 隻／2 隻以上／0 隻の夜・沈んだ大発・大発への命中・自艇の沈没／帰投／漂流／夜明け後・HP・被弾・燃料、
// 見つかった夜と秒・最初の標的が大発・大発／自艇への航過・連射・標的の切り替え、25mm の発射／命中／撃退／撃沈／制圧・機関損傷、不変（予告から初弾・同時の攻撃・射程と視程の外・自艇の視程の外・大発への連射・
// 1 回の攻撃の最大命中・健全な大発が 1 航過で沈んだ数・決着の秒・夜明け後の決着）を出す。中身は src/core/convoy-sim（tests/convoy-sim-*.test.ts と同じ）。値は data。
// 環境変数: MISSION（既定 jp_01）・N（夜の数。既定 400）・SEED（最初の seed。既定 1）・POL（既定 全部 14）・TABLE=1（較正の帯と ✓/✗）・
//   上書き BHP（barge_hp）・DBAND（detect_band）・KEEP（target_keep_ratio）・HOLD（target_switch_hold_s）・FLASHHOLD（flash_hold_s）・GDMG（25mm の 1 発の被害）・GRPM・GMAG・GDISP（25mm）・ALLOT（燃料 gal）・DAWN（夜明けまでの実秒）・GFLOOR（25mm の散布の最小半径 m）・FIRER（射撃ボタンを押す距離 m。近くまで待って撃つ人の型）・
//   HARD=1（v0.6.6。難易度ハード: jp_01 は米PT 3 隻・隼艇・ノルマ 3。TABLE=1 とは組めない＝ノーマルの帯の ✓/✗ をハードの値に付けない）・TABLE=2（ハードの設計の帯と対の帯の ✓/✗・同じ物差し・W7。HARD=1 のときだけ。
//   N 夜の組を BLOCKS 個（既定 2＝seed 1〜400 と 401〜800）回し、行の帯と不変は組ごと、対の帯は組を合わせた夜で判定する。N 400 の 1 組では 2 つの沈没 % の差の揺れが 3 点の余裕に近い。✗ があれば終了コード 1）・
//   GUNBOAT_OFF=1（隼艇を切る。見出しに出さない＝S1 の表と同じ）・PT3_OFF=1（3 本目の哨戒線なし）・GB_FACTOR（target_range_factor）・GB_CATCHUP（追い付きの候補 m）・GB_SLOW2=1（定位置の内の速さを自艇まで）。
//   新しい鍵は env が無ければ undefined（見出しに出さない＝ノーマルの表は同じ）。隼艇の無い表は隼艇の列・凡例を出さない
// 実行: npx esbuild scripts/convoy-sim.ts --bundle --platform=node --format=esm --outfile=<scratch>/convoy.mjs && node <scratch>/convoy.mjs
import { gameData, getPrototypeMission } from '../src/config/game-data';
import { convoyStartClearM } from '../src/config/pt-mission-data';
import type { SpeedStep } from '../src/core/boat-motion';
import type { ConvoyCell } from '../src/core/convoy-sim-cell';
import { CONVOY_POLICIES, type ConvoyPolicy } from '../src/core/convoy-sim-policy';
import { enemyDetectRangeM, speedFactorForBand } from '../src/core/visibility';
import { CONVOY_HARD_CALIBRATION, CONVOY_HARD_OFFSCREEN, CONVOY_HARD_SAME_SCALE, convoyHardCalibrationRun, convoyHardDesignMisses, convoyHardPairChecks } from '../src/systems/convoy-hard-calibration';
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
  hard: process.env['HARD'] === '1' ? true : undefined, gunboatOff: process.env['GUNBOAT_OFF'] === '1' ? true : undefined, pt3Off: process.env['PT3_OFF'] === '1' ? true : undefined,
  gbFactor: num('GB_FACTOR'), gbCatchupM: num('GB_CATCHUP'), gbSlow2: process.env['GB_SLOW2'] === '1' ? true : undefined,
};
if (o.hard && process.env['TABLE'] === '1') throw new Error('HARD=1 と TABLE=1 は組めない（TABLE=1 はノーマルの帯）');
const table2 = process.env['TABLE'] === '2';
if (table2 && (!o.hard || o.gunboatOff)) throw new Error('TABLE=2（ハードの帯）は HARD=1 で隼艇のある表だけ');
const pols = (process.env['POL'] ?? CONVOY_POLICIES.join(',')).split(',').map((x) => x.trim()).filter((x) => x !== '') as ConvoyPolicy[];
for (const p of pols) if (!(CONVOY_POLICIES as readonly string[]).includes(p)) throw new Error(`遊び方 ${p} は ${CONVOY_POLICIES.join(' / ')}`);

const blocks = table2 ? (num('BLOCKS') ?? 2) : 1;
if (!Number.isInteger(blocks) || blocks < 1) throw new Error('BLOCKS は 1 以上の整数');
const hrs = table2 ? Array.from({ length: blocks }, (_, b) => convoyHardCalibrationRun(gameData, mission, n, seed + b * n, o)) : [];
const run = hrs[0] ?? convoyCalibrationRun(gameData, mission, n, seed, o);
const span = (b: number): string => `${seed + b * n}〜${seed + (b + 1) * n - 1}`;
const s = run.setup;
const gb = s.gunboat;
const g = s.gun!;
const cv = s.convoy;
const bargeDetectM = enemyDetectRangeM(s.pt.baseDetectM, speedFactorForBand(s.detectBand, s.vis.speedFactor), s.vis, false);
const clearM = convoyStartClearM(s.pt, getPrototypeMission(gameData, mission, o.hard));
const f = (x: number, d: number, w: number): string => (Number.isFinite(x) ? x.toFixed(d) : '-').padStart(w);
const set = Object.entries(o).filter(([k, v]) => v !== undefined && k !== 'gunboatOff').map(([k, v]) => `${k}=${String(v)}`);
console.log(`[${mission} ${s.pt.bounds.width}x${s.pt.bounds.height} N ${n} seed ${Array.from({ length: blocks }, (_, b) => span(b)).join('・')}${set.length > 0 ? ` ${set.join(' ')}` : ''}]`);
console.log(
  `大発 ${cv.count} 隻 HP ${cv.hp}・先頭 ${cv.leadX},${cv.leadY} → ${cv.beach ? `浜 ${cv.beach.x.join('/')}（y ${cv.beach.y}・転舵 ${cv.beach.turnX.map((x) => x.toFixed(0)).join('/')}・浜への道 ${cv.beach.runInM.toFixed(0)} m）` : `上陸線 ${cv.landingX}`}・間隔 ${cv.offsetsM.join('/')}・見つかる帯 ${s.detectBand}（${bargeDetectM.toFixed(0)} m）・標的 keep ${Math.sqrt(s.rule.keepRatio2).toFixed(2)} ロック ${s.rule.lockS} 秒 閃光の記憶 ${s.rule.flashHoldS} 秒 | ` +
    `自艇 ${s.start.x},${s.start.y} 輪 ${s.ring.x},${s.ring.y} 夜明け ${s.durationS} 秒 燃料 ${s.fuelGal} gal | 25mm ${g.groups[0]!.roundsPerMin} 発/分 × ${g.groups[0]!.damage}・散布 ${g.groups[0]!.dispersionM} m${g.minSpreadM !== undefined ? `（最小 ${g.minSpreadM} m）` : ''}・弾倉 ${g.magazine?.rounds ?? '-'}/${g.magazine?.reloadS ?? '-'} | PT の出発 → 船団 ≥ ${clearM.toFixed(0)} m（clamp 込み）`,
);
if (o.hard) console.log(`ハード: 米PT ${s.pt.count} 隻（線 ${Array.from({ length: s.pt.count }, (_, i) => `y ${s.pt.legs[4 * i + 1]}`).join('・')}）・上陸のノルマ ${cv.quota} 隻`);
if (gb) console.log(`隼艇: ${gb.boatId} HP ${gb.hullHp}・後ろ ${gb.stationAsternM} m・右舷 ${gb.stationAbeamM} m・戻り ${gb.rejoinM} m・撃つ ${gb.fireM} m・25mm ${gb.gun.groups[0]!.roundsPerMin} 発/分・米PT の見つかる距離 ×${gb.targetRangeFactor}${gb.catchupM !== undefined ? `・追い付き ${gb.catchupM} m` : ''}${gb.slowToPlayer ? '・定位置の内は自艇の速さまで' : ''}`);
const GB_HEAD = ' | ach% all% | GB sunk% HP hitT shots hits ret/n sunk/n supp passOn burstOn 1stGB% | worst post beyond beyondP off%';
console.log(`policy        arr/3  a3%  a2+%  a0%  bSunk bHit | pSunk% home% adrift% dawn%  HP   pHit fuel(med/p10) | det% detS 1stB%  passB passP burst  sw | gun hits ret% ret/n PTsunk% supp eng% | warn maxSim beyond beyondP bBurst worstB/P spk resolved(med) resDawn%${gb ? GB_HEAD : ''}`);
const gbCols = (c: ConvoyCell): string => {
  const g = c.gunboat;
  if (!g) return '';
  return ` | ${f(c.achievedPct, 1, 5)} ${f(c.homeAllPct, 1, 5)} | ${f(g.sunkPct, 1, 5)} ${f(g.hpLostMean, 1, 4)} ${f(g.hitsTaken, 2, 4)} ${f(g.shots, 0, 4)} ${f(g.hits, 1, 4)} ${f(g.retiredMean, 2, 4)} ${f(g.ptSunkMean, 2, 4)} ${f(g.suppressions, 2, 4)} ${f(g.passes, 2, 4)} ${f(g.bursts, 2, 4)} ${f(g.firstTargetPct, 0, 4)} | ${g.worstPassHits} ${g.postFire + g.postHits} ${g.beyond} ${g.beyondPlayer} ${f(g.offPct, 2, 5)}`;
};
const line = (c: ConvoyCell): string =>
  `${c.policy.padEnd(13)} ${f(c.arrivedMean, 2, 5)} ${f(c.arrived3Pct, 0, 4)} ${f(c.arrived2Pct, 0, 5)} ${f(c.arrived0Pct, 0, 4)}  ${f(c.bargesSunkMean, 2, 4)} ${f(c.bargeHits, 1, 4)} | ${f(c.sunkPct, 1, 6)} ${f(c.homePct, 0, 5)} ${f(c.adriftPct, 1, 7)} ${f(c.afterDawnPct, 0, 5)} ${f(c.hpMean, 1, 5)} ${f(c.playerHits, 1, 4)} ${f(c.fuelMed, 0, 4)}/${f(c.fuelP10, 0, 3)} | ` +
  `${f(c.detectedPct, 0, 4)} ${f(c.detectMedS, 0, 4)} ${f(c.firstBargePct, 0, 4)}  ${f(c.passesBarge, 2, 5)} ${f(c.passesPlayer, 2, 5)} ${f(c.bursts, 2, 5)} ${f(c.switches, 1, 4)} | ${f(c.gunShots, 0, 3)} ${f(c.gunHits, 1, 4)} ${f(c.retiredPct, 0, 4)} ${f(c.retiredMean, 2, 5)} ${f(c.ptSunkPct, 1, 6)} ${f(c.suppressions, 2, 4)} ${f(c.engineHitPct, 0, 4)} | ` +
  `${f(c.minWarnS, 2, 4)} ${c.maxPassing} ${c.beyond} ${c.beyondPlayerSight} ${c.burstsBarge} ${c.worstBarge}/${c.worstPlayer} ${c.singlePassKills} ${f(c.resolvedMedS, 0, 6)} ${f(c.resolvedAfterDawnPct, 0, 5)}${gbCols(c)}`;
const mark = (star: boolean, miss: string[]): string => `  ${star ? '★' : ' '} ${miss.length === 0 ? '✓' : `✗ ${miss.join('・')}`}`;
if (process.env['TABLE'] === '1') for (const r of CONVOY_CALIBRATION) console.log(line(run.cell(r.policy)) + mark(r.star, convoyCalibrationMisses(r, run.cell, s)));
else if (hrs.length > 0) {
  const sc = (c: ConvoyCell): string => `${f(c.homeAllPct, 1, 5)}% ・ ${f(c.arrivedMean, 2, 4)}`;
  let rowMiss = 0;
  for (const [b, hr] of hrs.entries()) {
    console.log(`組 ${b + 1}（seed ${span(b)}）: 設計の行の帯と不変（組ごと）`);
    for (const r of CONVOY_HARD_CALIBRATION) {
      const miss = convoyHardDesignMisses(r, hr);
      if (miss.length > 0) rowMiss++;
      console.log(line(hr.cell(r.policy)) + mark(r.star, miss));
    }
    console.log('同じ物差し（3 隻とも上陸して帰投 % ・ 到達）: ハード | ノーマル | 差');
    for (const pol of CONVOY_HARD_SAME_SCALE) console.log(`  ${pol.padEnd(13)} ${sc(hr.cell(pol))} | ${sc(hr.partner('normal', pol))} | ${f(hr.cell(pol).homeAllPct - hr.partner('normal', pol).homeAllPct, 1, 5)}`);
    console.log(`W7（決着の前に隼艇が自艇から 480 m の外にいた秒 % ・ 自艇から視程の外での隼艇の発射）: ${CONVOY_HARD_OFFSCREEN.map((pol) => `${pol} ${f(hr.cell(pol).gunboat!.offPct, 2, 0)}% ・ ${hr.cell(pol).gunboat!.beyondPlayer}`).join(' | ')}`);
  }
  const ends = (x: number): string => (Number.isFinite(x) ? String(x) : x > 0 ? '∞' : '−∞');
  const vals = (xs: readonly number[], p: number): string => `${xs.map((x) => x.toFixed(1)).join('/')} → ${p.toFixed(1)}`;
  console.log(`対の帯（${blocks} 組 ${Array.from({ length: blocks }, (_, b) => span(b)).join('・')} を合わせた ${blocks * n} 夜。相手は同じ seed）: 遊び方 列（相手） | ハード 組ごと → 合わせた | 相手 組ごと → 合わせた | 差（帯）`);
  let pairMiss = 0;
  for (const r of CONVOY_HARD_CALIBRATION) {
    for (const c of convoyHardPairChecks(r, hrs)) {
      if (!c.ok) pairMiss++;
      console.log(`  ${r.policy.padEnd(13)} ${`${c.name}（${c.partnerName}）`.padEnd(14)} | ${vals(c.mine, c.minePooled)} | ${vals(c.other, c.otherPooled)} | ${f(c.diff, 1, 5)}（${ends(c.lo)}〜${ends(c.hi)}） ${c.ok ? '✓' : '✗'}`);
    }
  }
  console.log(`判定: 設計の行の帯と不変の ✗ ${rowMiss} 行（${blocks} 組 × ${CONVOY_HARD_CALIBRATION.length} 行）・対の帯の ✗ ${pairMiss} 項目（合わせた ${blocks * n} 夜）`);
  if (rowMiss + pairMiss > 0) process.exitCode = 1;
} else for (const pol of pols) console.log(line(run.cell(pol)));
console.log(
  'arr/3 = 到達（3 隻中の平均） | a3%・a2+%・a0% = 3 隻／2 隻以上／0 隻の夜 | bSunk・bHit = 沈んだ大発・大発への命中 | pSunk%・home%・adrift%・dawn% = 自艇の沈没・帰投・漂流・夜明け後の帰投 | HP・pHit = 失った HP・被弾 | ' +
    'det%・detS・1stB% = 見つかった夜・秒の中央値・最初の標的が大発 | passB・passP・burst・sw = 大発への航過・自艇への航過・自艇への連射・標的の切り替え | gun…eng% = 25mm の発射・命中・撃退の夜・撃退/夜・撃沈の夜・制圧・機関損傷の夜 | ' +
    'warn = 予告から初弾の最短秒 | maxSim = 同時に撃つ攻撃 | beyond・beyondP = 射程か視程（標的から）の外・自艇の視程の外からの発射 | bBurst = 大発への連射 | worstB/P = 1 回の攻撃の最大命中（大発／自艇） | spk = 健全な大発が 1 航過で沈んだ数 | resolved・resDawn% = 決着の秒の中央値・夜明け後の決着',
);
if (gb) {
  console.log(
    'ach%・all% = 達成（帰投してノルマ以上）・3 隻とも上陸して帰投 | GB = 隼艇: 沈没の夜・失った HP・受けた命中・25mm の発射・命中・撃退/夜・撃沈/夜（最後の結末を決めた砲）・制圧・隼艇への航過・連射・最初の標的が隼艇 | ' +
      'worst・post・beyond・beyondP・off% = 隼艇への 1 回の攻撃の最大命中・決着の後の発射と被弾・視程か射程の外への発射・自艇の視程の外での発射・決着の前に自艇から 480 m の外にいた秒',
  );
}
