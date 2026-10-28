// 停泊して揚陸する輸送船を米PT の雷撃から守る模擬の表（v0.6.9 S3・S4a。jp_04「多号作戦・オルモック湾へ」。docs/02 §6.11、spec-v069 §6 S3・§8・R1・R2・R4・R7・R12）: 遊び方（台本）ごとに
// 達成・揚陸・輸送船の沈没・自艇の沈没／漂流／帰投／夜明けの前の帰投・斉射・雷撃の結末・決着の前の燃料少と輪（R4）・期待値（R2）、斉射の命中（TABLE=2）、時刻（TABLE=3）を出す。
// 中身は src/core/landing-sim（S4 の tests/landing-balance と同じ）。値は data。上書きは data の写しに当て、世界と同じ検査を通す（V8・V10・V13 を破る組み合わせは例外で止まる＝R7）。
// 環境変数: MISSION（既定 jp_04）・N（1 組の夜。既定 400）・SEED（最初の seed。既定 1）・BLOCKS（組の数。既定 2＝seed 1〜400 と 401〜800）・POL（既定 全部 9）・HARD=1（ハード）・
//   TABLE（無し: 組ごとの表 / 1: 帯の ✓/✗・対の帯（組を合わせた夜）・R2 の期待値・不変 / 2: 斉射の命中と分布 / 3: 時刻。1・2 は ✗ があれば終了コード 1）・
//   上書き UNLOAD（unload_s）・LOOKOUT（lookout_m）・HITS（torpedo_hits_to_sink）・AIM（aim_error_deg）・SPACING（salvo_spacing_deg）・HURRIED（hurried_max_m）・HFACTOR（hurried_error_factor）・
//   EFACTOR（engaged_error_factor。R12）・REACQ（reacquire_s）・ALLOT（燃料 gal）。新しい鍵は env が無ければ undefined（見出しに出さない）
// 実行: npx esbuild scripts/landing-sim.ts --bundle --platform=node --format=esm --outfile=<scratch>/landing.mjs && node <scratch>/landing.mjs
import { gameData } from '../src/config/game-data';
import { quantile, salvoProbs, surviveOf, type LandingCell, type SalvoKindStats, type TimeCol } from '../src/core/landing-sim-cell';
import { LANDING_POLICIES, type LandingPolicy } from '../src/core/landing-sim-policy';
import { LANDING_CALIBRATION, LANDING_HARD_CALIBRATION, LANDING_PAIRS, LANDING_SALVO_BANDS, landingBandMisses, landingCalibrationRun, landingInvariantMisses, landingSalvoMisses, type LandingSimOverrides } from '../src/systems/landing-sim-setup';

const num = (k: string): number | undefined => (process.env[k] !== undefined && process.env[k] !== '' ? Number(process.env[k]) : undefined);
const mission = process.env['MISSION'] ?? 'jp_04';
const n = num('N') ?? 400;
const seed = num('SEED') ?? 1;
const blocks = num('BLOCKS') ?? 2;
if (!Number.isInteger(blocks) || blocks < 1) throw new Error('BLOCKS は 1 以上の整数');
const table = process.env['TABLE'] ?? '';
if (!['', '1', '2', '3'].includes(table)) throw new Error('TABLE は 1・2・3 か無し');
const o: LandingSimOverrides = {
  unloadS: num('UNLOAD'), lookoutM: num('LOOKOUT'), hitsToSink: num('HITS'), aimDeg: num('AIM'), spacingDeg: num('SPACING'), hurriedM: num('HURRIED'), hurriedFactor: num('HFACTOR'),
  engagedFactor: num('EFACTOR'), reacquireS: num('REACQ'),
  fuelGal: num('ALLOT'), hard: process.env['HARD'] === '1' ? true : undefined,
};
const pols = (process.env['POL'] ?? LANDING_POLICIES.join(',')).split(',').map((x) => x.trim()).filter((x) => x !== '') as LandingPolicy[];
for (const p of pols) if (!(LANDING_POLICIES as readonly string[]).includes(p)) throw new Error(`遊び方 ${p} は ${LANDING_POLICIES.join(' / ')}`);

const run = landingCalibrationRun(gameData, mission, pols, n, seed, blocks, o);
const s = run.setup;
const lp = s.landing;
const tp = s.torpedo;
const span = (b: number): string => `${seed + b * n}〜${seed + (b + 1) * n - 1}`;
const f = (x: number, d: number, w: number): string => (Number.isFinite(x) ? x.toFixed(d).replace(/^-/, '−') : x === Infinity ? '∞' : x === -Infinity ? '−∞' : '-').padStart(w);
const set = Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${String(v)}`);
console.log(`[${mission} ${s.pt.bounds.width}x${s.pt.bounds.height} N ${n} seed ${Array.from({ length: blocks }, (_, b) => span(b)).join('・')}${set.length > 0 ? ` ${set.join(' ')}` : ''}]`);
console.log(
  `輸送船 ${lp.shipId} 泊地 ${lp.x},${lp.y} 艇首 ${lp.headingDeg}・揚陸 ${lp.unloadS} 秒・沈むまで ${lp.hitsToSink} 本・見張り ${lp.lookoutM} m | 雷撃 ${tp.launchM} m・艇首 ±${tp.tolDeg}°・${tp.n} 本 ${tp.spacingDeg}° 間隔・狙い ±${tp.aimDeg}°・` +
    `慌てて ${tp.hurriedM} m ×${tp.hurriedFactor}・戦いながら ×${tp.engagedFactor}・見失い ${tp.reacquireS} 秒・不発 ${tp.reliability.dud}・蛇行 ${tp.reliability.erratic} | 自艇 ${s.start.x},${s.start.y} 輪 ${s.ring.x},${s.ring.y}（半径 ${s.ring.radiusM}）・夜明け ${s.durationS} 秒・燃料 ${s.fuelGal} gal | ` +
    `米PT ${s.pt.count} 隻（${Array.from({ length: s.pt.count }, (_, i) => `${lp.runDirJa[i] ?? '?'} ${s.pt.legs[4 * i]},${s.pt.legs[4 * i + 1]}→${s.pt.legs[4 * i + 2]},${s.pt.legs[4 * i + 3]}`).join('・')}）`,
);

const HEAD = 'policy         obj%  land% tSunk% unres% | own% adrift% home% preDawn% tout% | salv  calm  hurr   eng | left   gun  gone | fuel% ring% |   HP det%  detS cont lost shots';
const line = (c: LandingCell): string =>
  `${c.policy.padEnd(13)} ${f(c.objPct, 1, 5)} ${f(c.landPct, 1, 5)} ${f(c.tSunkPct, 1, 6)} ${f(c.unresPct, 1, 6)} | ${f(c.ownSunkPct, 1, 4)} ${f(c.adriftPct, 1, 6)} ${f(c.homePct, 1, 5)} ${f(c.homeBeforeDawnPct, 1, 8)} ${f(c.timeoutPct, 1, 5)} | ` +
  `${f(c.salvos, 2, 4)} ${f(c.calm, 2, 5)} ${f(c.hurried, 2, 5)} ${f(c.engaged, 2, 5)} | ${f(c.leftByPass, 2, 4)} ${f(c.gunOff, 2, 5)} ${f(c.goalGone, 2, 5)} | ${f(c.fuelCallPct, 1, 5)} ${f(c.ringEarlyPct, 1, 5)} | ` +
  `${f(c.hpMean, 1, 4)} ${f(c.detectedPct, 0, 4)} ${f(c.detectMedS, 1, 5)} ${f(c.contacts, 2, 4)} ${f(c.lostContacts, 2, 4)} ${f(c.gunShots, 0, 5)}`;
const mark = (miss: string[]): string => `  ${miss.length === 0 ? '✓' : `✗ ${miss.join('・')}`}`;
const rows = (o.hard ? LANDING_HARD_CALIBRATION : LANDING_CALIBRATION).filter((r) => pols.includes(r.policy));
let misses = 0;

if (table === '' || table === '1') {
  for (let b = 0; b < blocks; b++) {
    console.log(`組 ${b + 1}（seed ${span(b)}）${table === '1' ? ': 行の帯と不変（組ごと）' : ''}`);
    console.log(HEAD);
    for (const pol of pols) {
      const c = run.cell(pol, b);
      if (table !== '1') {
        console.log(line(c));
        continue;
      }
      const r = rows.find((x) => x.policy === pol);
      const miss = [...(r ? landingBandMisses(r, c) : []), ...landingInvariantMisses(c, s)];
      misses += miss.length;
      console.log(line(c) + mark(miss));
    }
  }
}
if (table === '1') {
  if (!o.hard) {
    console.log(`対の帯（${blocks} 組 ${blocks * n} 夜を合わせる。相手は同じ seed）: 遊び方 列（相手） | 自分 | 相手 | 差（帯）`);
    for (const pr of LANDING_PAIRS) {
      if (!pols.includes(pr.policy) || !pols.includes(pr.other)) continue;
      const a = pr.value(run.pooled(pr.policy));
      const z = pr.value(run.pooled(pr.other));
      const ok = a - z >= pr.lo && a - z <= pr.hi;
      if (!ok) misses++;
      console.log(`  ${pr.policy.padEnd(13)} ${`${pr.name}（${pr.other}）`.padEnd(18)} | ${f(a, 1, 5)} | ${f(z, 1, 5)} | ${f(a - z, 1, 6)}（${f(pr.lo, 0, 0)}〜${f(pr.hi, 0, 0)}） ${ok ? '✓' : '✗'}`);
    }
  }
  console.log('R2 の期待値（1 夜の揚陸に効く斉射の組 × 種類と PT ごとの当たりうる本数の分布＝この表の全部の夜。輸送船が沈んで去った PT は気づかれていない斉射とみなす。輸送船の運と自艇の運は別とみなす）と実測: 組ごと');
  console.log('policy        | mix 0%   C%   H%   E%  2+% | relC  relH  relE | expSurv% surv% | expObj%  obj%');
  for (let b = 0; b < blocks; b++) {
    console.log(`組 ${b + 1}（seed ${span(b)}）`);
    for (const pol of pols) {
      const c = run.cell(pol, b);
      console.log(
        `${pol.padEnd(13)} | ${f(c.mix0Pct, 1, 5)} ${f(c.mixCPct, 1, 4)} ${f(c.mixHPct, 1, 4)} ${f(c.mixEPct, 1, 4)} ${f(c.mixMultiPct, 1, 4)} | ${f(c.relCalm, 2, 4)} ${f(c.relHurried, 2, 5)} ${f(c.relEngaged, 2, 5)} | ` +
          `${f(c.expSurvivePct, 1, 8)} ${f(c.survivePct, 1, 5)} | ${f(c.expObjPct, 1, 7)} ${f(c.objPct, 1, 5)}`,
      );
    }
  }
  // 接触の規則（R2・R12）が決める斉射の組ごとの、輸送船が生き残る確率（種類の合計の分布。C は気づかれていない・H は慌てた・E は戦いながらの斉射）
  const mixes: string[] = [];
  const rep = (ch: string, kind: number, m: number): { tag: string; list: [number, number][] } => ({ tag: ch.repeat(m), list: Array.from({ length: m }, (): [number, number] => [kind, -1]) });
  for (let k = 0; k <= s.pt.count; k++) {
    for (let h = 0; h <= k; h++) {
      for (let e = 0; e <= k - h; e++) {
        const parts = [rep('C', 1, k - h - e), rep('H', 2, h), rep('E', 3, e)];
        const list = parts.flatMap((x) => x.list);
        mixes.push(`${k === 0 ? '0' : parts.map((x) => x.tag).join('')} ${f(100 * surviveOf(list, run.pooledSalvo, lp.hitsToSink), 1, 0)}`);
      }
    }
  }
  console.log(`斉射の組ごとの輸送船が生き残る %（分布から。C 気づかれていない・H 慌てた・E 戦いながら）: ${mixes.join(' ・ ')}`);
}

const kindLine = (name: string, k: SalvoKindStats, band: readonly [number, number] | null): string => {
  const pot = k.fired > 0 ? k.potHits / k.fired : NaN;
  const ok = band === null || k.salvos === 0 || (pot >= band[0] && pot <= band[1]);
  return `  ${name.padEnd(8)} ${f(k.salvos, 0, 5)} ${f(k.fired, 0, 5)} | ${f(k.fired > 0 ? k.arrivedHits / k.fired : NaN, 3, 6)} ${f(k.arrived > 0 ? k.arrivedHits / k.arrived : NaN, 3, 6)} ${f(k.arrived, 0, 5)} ${f(k.arrived > 0 ? (100 * k.arrivedDuds) / k.arrived : NaN, 1, 5)} | ` +
    `${f(pot, 3, 6)} ${f(k.salvos > 0 ? k.pot1 / k.salvos : NaN, 3, 6)} ${f(k.salvos > 0 ? k.pot2 / k.salvos : NaN, 3, 6)} ${f(k.fired > 0 ? (100 * k.potDuds) / k.fired : NaN, 1, 5)} | ` +
    `${f(quantile(k.ranges, 0.1), 0, 5)} ${f(quantile(k.ranges, 0.5), 0, 5)} ${f(quantile(k.ranges, 0.9), 0, 5)}${band ? `  ${ok ? '✓' : '✗'}（当たりうる 1 本 ${band[0]}〜${band[1]}）` : ''}`;
};
if (table === '2') {
  const SH = '  kind     salv  torp | all/t aflt/t  aflt dud% |  pot/t  pot≥1  pot≥2 pdud% | rng10 rng50 rng90';
  for (let b = 0; b < blocks; b++) {
    const st = run.salvo(b);
    console.log(`組 ${b + 1}（seed ${span(b)}）: 斉射（遊び方 ${pols.length} を合わせる）`);
    console.log(SH);
    console.log(kindLine('calm', st.calm, LANDING_SALVO_BANDS.calm));
    console.log(kindLine('hurried', st.hurried, LANDING_SALVO_BANDS.hurried));
    console.log(kindLine('engaged', st.engaged, null));
    for (let i = 0; i < s.pt.count; i++) {
      console.log(kindLine(`c PT${i}`, st.byPt[1]![i]!, null));
      console.log(kindLine(`h PT${i}`, st.byPt[2]![i]!, null));
      console.log(kindLine(`e PT${i}`, st.byPt[3]![i]!, null));
    }
    const miss = landingSalvoMisses(st);
    misses += miss.length;
  }
  const ps = run.pooledSalvo;
  console.log(`期待値の分布（${blocks} 組 × 遊び方 ${pols.length} を合わせた斉射。1 斉射の当たりうる本数 0〜${ps.n} の確率。斉射の無い組は種類の合計）`);
  for (const kind of [1, 2, 3]) {
    for (let i = 0; i < s.pt.count; i++) {
      const cnt = ps.dist[kind]![i]!.reduce((a, x) => a + x, 0);
      console.log(`  ${['', 'calm', 'hurried', 'engaged'][kind]} PT${i}（${lp.runDirJa[i] ?? '?'}） ${f(cnt, 0, 5)} 斉射: ${salvoProbs(ps, kind, i).map((x) => x.toFixed(3)).join(' / ')}`);
    }
  }
}

const tc = (x: TimeCol, perNight = false): string => `${f(perNight ? x.pct / 100 : x.pct, perNight ? 2 : 0, 4)} ${f(x.p10, 1, 5)} ${f(x.med, 1, 5)} ${f(x.p90, 1, 5)}`;
if (table === '3') {
  for (let b = 0; b < blocks; b++) {
    console.log(`組 ${b + 1}（seed ${span(b)}）: 時刻（起きた夜 % か 1 夜の数・p10・中央値・p90 の秒）`);
    console.log('policy        | report%  p10   med   p90 | near%  p10   med   p90 | det%   p10   med   p90 | calm/n p10   med   p90 | hurr/n p10   med   p90 | eng/n  p10   med   p90 | res%   p10   med   p90');
    for (const pol of pols) {
      const c = run.cell(pol, b);
      console.log(`${pol.padEnd(13)} | ${tc(c.tReport)} | ${tc(c.tNear)} | ${tc(c.tDetect)} | ${tc(c.tCalm, true)} | ${tc(c.tHurried, true)} | ${tc(c.tEngaged, true)} | ${tc(c.tResolved)}`);
    }
  }
}

if (table === '1' || table === '2') {
  console.log(`判定: ✗ ${misses} 項目`);
  if (misses > 0) process.exitCode = 1;
}
console.log(
  'obj% = 達成（揚陸完了して帰投） | land% = 揚陸完了（その後の沈没も） | tSunk% = 揚陸の前に輸送船が沈んだ | unres% = 終わりにまだ揚陸中 | own%・adrift%・home%・preDawn%・tout% = 自艇の沈没・漂流・帰投・夜明けの前の帰投・打ち切り | ' +
    'salv・calm・hurr・eng = 1 夜の斉射（気づかれていない・慌てた・戦いながら（R12）） | left・gun・gone = 1 夜の PT: 航過を撃ち尽くして去った・25mm で撃退か撃沈・輸送船が沈んで去った | fuel%・ring% = 決着の前に燃料少が立った・輪に入った（R4） | ' +
    'HP・det%・detS・cont・lost・shots = 失った HP・見つかった夜・最初の秒の中央値・1 夜の捉えられた回数・見失わせた回数・25mm の発射 | mix・relC・relH・relE = 揚陸に効く斉射（発射 + 距離 ÷ 魚雷の速さ < unload_s）の組と 1 夜の数 | ' +
    'expSurv%・expObj% = R2 の期待値 | all/t・aflt/t・pot/t = 1 本の命中（不発を除く）: 撃った本数あたり・輸送船が浮いている間に決着した本数あたり（aflt）・いつも浮いている影の船体へ（pot。帯はこれ） | pot≥1・pot≥2 = 当たりうる本数の斉射の割合',
);
