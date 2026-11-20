// 4 本の扇の命中本数の模擬（v0.8.2 S3。spec-v0820 §4.4 D-G3・§6 の「命中本数の表」、lead の L30。Phaser 非依存。src/core と data だけ）: 止まった艇から列の艦（18 kt・東向き）へ
// 正しい見越しで 4 本の扇（data の間隔・0.4 秒おき）を撃ち、距離ごとに 0〜4 本の割合・3 本以上・4 本を出す。艦の AI は記録の値（最大速力だけ列の速さ＝列の AI。回避は記録の comb_tracks）・
// 当たりは記録の寸法 × ship_hit_scale・魚雷は凍結の core/torpedo そのまま（不発・蛇行は引かない＝命中の幾何だけ）。方位は 0〜180° の 15° 刻み・狙いのずれ −3〜＋3°（1.5° 刻み）・各 REPS 回。
// 記録に弾薬庫（magazine）があれば、扇 1 回あたりの弾薬庫の期待値（＝引いた確率の和の期待値＝轟沈の確率。3 本目で on_hits の確率・4 本目は 3 本目で沈まなかった時だけ）を 1,000 回あたりで出す。
// 計画の下調べ（scratchpad の v0820/tools/fan-sim.ts）の写しを data の値で回すように直した物。
// 実行: npx esbuild scripts/fan-sim.ts --bundle --platform=node --format=esm --outfile=/tmp/fan-sim.mjs && ENEMY=ijn_battleship_fuso node /tmp/fan-sim.mjs
//   ENEMY（既定 ijn_battleship_fuso）・KT（列の速さ、既定 us_05 の transit.speed_kt）・RANGES（既定 600,800,1000,1200,1500,2000）・REPS（既定 10）・N（本数、既定 4）
import enemies from '../data/enemies.json';
import hitRateModel from '../data/hit_rate_model.json';
import missions from '../data/missions_seed.json';
import torpedoes from '../data/torpedoes.json';
import { SeededRng } from '../src/core/rng';
import { createShipAiState, steerShip, turnRateFor, updateShipAi } from '../src/core/ship-ai';
import { isEnemyAiDataRecord, shipAiParamsFromData } from '../src/core/ship-ai-data';
import { createTorpedoState, isArmed, isTorpedoDataRecord, launchTorpedo, markMissIfPassed, stepTorpedo, torpedoParamsFromData } from '../src/core/torpedo';
import { createCircles, fillHullCircles, interceptHeadingDeg, pointHitsHull, velocityFromHeading } from '../src/core/torpedo-solver';
import { ktToMps } from '../src/core/units';

const env = (k: string, d: number): number => (process.env[k] !== undefined ? Number(process.env[k]) : d);
const STEP_S = 1 / 60; // 固定ステップ（config/step-config の FIXED_STEP_S と同じ）
const world = hitRateModel.world, launch = hitRateModel.torpedo_launch;
const id = process.env['ENEMY'] ?? 'ijn_battleship_fuso';
const rec = enemies.enemies.find((e) => e.id === id) as Record<string, unknown> | undefined;
if (!rec || !isEnemyAiDataRecord(rec)) throw new Error(`enemies.json の ${id} は AI の記録でない`);
const us05 = missions.missions.find((m) => m.id === 'us_05') as { v0_1_prototype: { transit: { speed_kt: number } }; torpedo_type: string };
const tRec: unknown = torpedoes.torpedoes.find((t) => t.id === us05.torpedo_type);
if (!isTorpedoDataRecord(tRec)) throw new Error('torpedo');
const ai = shipAiParamsFromData(rec);
const colMps = ktToMps(env('KT', us05.v0_1_prototype.transit.speed_kt));
ai.maxSpeedMps = colMps; // 列の AI: 最大速力だけ列の速さ
ai.cruiseSpeedMps = Math.min(ai.cruiseSpeedMps, colMps);
ai.ramEnabled = false;
const torp = torpedoParamsFromData(tRec, launch.arming_distance_m, launch.erratic_period_s);
const N = env('N', 4), SP = launch.salvo_spacing_deg, INT = launch.salvo_interval_s, k = world.ship_hit_scale;
const L = (rec['length_m'] as number) * k, B = (rec['beam_m'] as number) * k, CIRC = rec['hull_circles'] as number;
const dt = STEP_S * world.time_scale;
const mag = (rec['magazine'] as { on_hits: number[]; chance: number[] } | undefined) ?? null;

/** 扇 1 回の命中本数（解けない見越しは −1） */
function fan(rangeM: number, bearingDeg: number, errDeg: number, rng: SeededRng): number {
  const ship = { x: 5e6, y: 5e6, headingDeg: 90, speedMps: colMps };
  const b = (bearingDeg * Math.PI) / 180;
  const boat = { x: ship.x + Math.sin(b) * rangeM, y: ship.y - Math.cos(b) * rangeM };
  const vel = { x: 0, y: 0 };
  velocityFromHeading(90, ship.speedMps, vel);
  const aim = interceptHeadingDeg(boat.x, boat.y, torp.speedMps, ship.x, ship.y, vel.x, vel.y);
  if (aim === null) return -1;
  const ts = Array.from({ length: N }, () => createTorpedoState());
  const done = new Array<boolean>(N).fill(false), launched = new Array<boolean>(N).fill(false);
  const st = createShipAiState(90, ship.speedMps);
  st.desiredSpeedMps = ship.speedMps;
  const hull = createCircles(CIRC), far = { x: 0, y: 0, headingDeg: 0, speedMps: 0 }, half = L / 2 + B, pass2 = half * half;
  let hits = 0, tReal = 0;
  const maxSteps = Math.ceil((torp.rangeM / torp.speedMps + 80) / dt);
  for (let i = 0; i < maxSteps; i++) {
    for (let j = 0; j < N; j++) if (!launched[j] && tReal >= j * INT - 1e-9) { launched[j] = true; launchTorpedo(ts[j]!, boat.x, boat.y, aim + errDeg + SP * (j - (N - 1) / 2), false, false, 0, rangeM, 25); }
    updateShipAi(st, ship, far, 0, 8, ts, ai, { width: 1e7, height: 1e7 }, STEP_S, rng);
    steerShip(ship, st.desiredHeadingDeg, st.desiredSpeedMps, turnRateFor(st.mode, ai), ai.accelMps2, dt);
    fillHullCircles(hull, ship.x, ship.y, ship.headingDeg, L, B);
    let open = 0;
    for (let j = 0; j < N; j++) {
      const t = ts[j]!;
      if (!launched[j] || done[j]) { if (!launched[j]) open++; continue; }
      if (stepTorpedo(t, torp, dt, STEP_S)) { done[j] = true; t.active = false; continue; }
      if (isArmed(t, torp) && pointHitsHull(t.x, t.y, hull)) { hits++; done[j] = true; t.active = false; continue; }
      if (markMissIfPassed(t, torp, ship.x, ship.y, pass2)) { done[j] = true; t.active = false; continue; }
      open++;
    }
    if (open === 0) break;
    tReal += STEP_S;
  }
  return hits;
}

/** 扇 1 回の弾薬庫の期待値（命中 h 本: on_hits の本目ごとに、その前で沈まなかった確率 × その確率） */
function magazineExpect(h: number): number {
  if (!mag) return 0;
  let alive = 1, e = 0;
  mag.on_hits.forEach((n, i) => { if (h >= n) { e += alive * mag.chance[i]!; alive *= 1 - mag.chance[i]!; } });
  return e;
}

const ranges = (process.env['RANGES'] ?? '600,800,1000,1200,1500,2000').split(',').map(Number);
const rng = new SeededRng(1), REPS = env('REPS', 10);
console.log(`# fan-sim ${id}（${rec['length_m']} × ${rec['beam_m']} m・円 ${CIRC}・${env('KT', us05.v0_1_prototype.transit.speed_kt)} kt・旋回 ${ai.turnRateDegS}°/秒・回避の転舵 ${ai.evadeTurnRateDegS}°/秒・反応 ${ai.reactionDelayS} 秒）: ${N} 本の扇・間隔 ${SP}°・${INT} 秒おき${mag ? `・弾薬庫 ${mag.on_hits.join('・')} 本目 ${mag.chance.map((c) => `${c * 100}%`).join('・')}` : ''}`);
for (const r of ranges) {
  const dist = new Array<number>(N + 1).fill(0);
  let n = 0, mg = 0;
  for (let bg = 0; bg <= 180; bg += 15) for (const e of [-3, -1.5, 0, 1.5, 3]) for (let q = 0; q < REPS; q++) { const h = fan(r, bg, e, rng); if (h < 0) break; dist[h]!++; n++; mg += magazineExpect(h); }
  const pc = (c: number): string => ((100 * c) / n).toFixed(1);
  const mean = dist.reduce((a, c, i) => a + c * i, 0) / n, ge3 = dist.slice(3).reduce((a, c) => a + c, 0);
  console.log(`${String(r).padStart(5)} m  n=${n}  0..${N} 本: ${dist.map(pc).join(' / ')} %  平均 ${mean.toFixed(2)}  1 本以上 ${pc(n - dist[0]!)}%  3 本以上 ${pc(ge3)}%  ${N} 本 ${pc(dist[N]!)}%${mag ? `  弾薬庫の期待値 ${((1000 * mg) / n).toFixed(1)}／1,000 回` : ''}`);
}
