// 計画の下調べ（v0.8.2）: 戦艦・重巡の大きさの艦へ 4 本の扇（間隔 4°・0.4 秒おき）を撃ったときの命中本数の分布。ゲームの core（凍結の torpedo・torpedo-solver と ship-ai）をそのまま使う。
// repo は変えない。scratchpad で esbuild で束ねて node で回す。
import { gameData } from '/home/user/ww2-torpedo-boat/src/config/game-data';
import { FIXED_STEP_S } from '/home/user/ww2-torpedo-boat/src/config/step-config';
import { getEnemyRecord, getTorpedoRecord, getEvasionMultiplier } from '/home/user/ww2-torpedo-boat/src/config/game-data';
import { SeededRng } from '/home/user/ww2-torpedo-boat/src/core/rng';
import { createShipAiState, steerShip, turnRateFor, updateShipAi, shipAiParamsFromData } from '/home/user/ww2-torpedo-boat/src/core/ship-ai';
import { createTorpedoState, isArmed, launchTorpedo, markMissIfPassed, stepTorpedo, torpedoParamsFromData } from '/home/user/ww2-torpedo-boat/src/core/torpedo';
import { createCircles, fillHullCircles, interceptHeadingDeg, pointHitsHull, velocityFromHeading } from '/home/user/ww2-torpedo-boat/src/core/torpedo-solver';
import { ktToMps } from '/home/user/ww2-torpedo-boat/src/core/units';

const env = (k: string, d: number): number => (process.env[k] !== undefined ? Number(process.env[k]) : d);
const world = gameData.hitRateModel.world;
const launch = gameData.hitRateModel.torpedo_launch;
const base = getEnemyRecord(gameData, process.env['ENEMY'] ?? 'ijn_destroyer');
const ai = shipAiParamsFromData(base, getEvasionMultiplier(gameData, false));
const L = env('LEN', base.length_m), B = env('BEAM', base.beam_m), CIRC = env('CIRC', base.hull_circles);
const speedKt = env('KT', 18);
ai.cruiseSpeedMps = ktToMps(speedKt); ai.maxSpeedMps = ktToMps(speedKt);
ai.evadeTurnRateDegS = env('EVADE_TURN', ai.evadeTurnRateDegS);
ai.speedBoostMps = ktToMps(env('BOOST', -10));
ai.reactionDelayS = env('REACT', ai.reactionDelayS);
ai.turnRateDegS = env('TURN', ai.turnRateDegS);
ai.accelMps2 = env('ACCEL', ai.accelMps2);
ai.ramEnabled = false;
const torp = torpedoParamsFromData(getTorpedoRecord(gameData, 'us_mk13'), launch.arming_distance_m, launch.erratic_period_s);
const N = env('N', 4), SP = env('SPACING', 4), INT = launch.salvo_interval_s, k = world.ship_hit_scale;
const hullL = L * k, hullB = B * k;
const dt = FIXED_STEP_S * world.time_scale;
function fan(rangeM: number, bearingDeg: number, errDeg: number, rng: SeededRng): number {
  const ship = { x: 5e6, y: 5e6, headingDeg: 90, speedMps: ai.cruiseSpeedMps };
  const b = (bearingDeg * Math.PI) / 180;
  const boat = { x: ship.x + Math.sin(b) * rangeM, y: ship.y - Math.cos(b) * rangeM, headingDeg: 0, speedMps: 0 };
  const vel = { x: 0, y: 0 }; velocityFromHeading(90, ship.speedMps, vel);
  const aim = interceptHeadingDeg(boat.x, boat.y, torp.speedMps, ship.x, ship.y, vel.x, vel.y);
  if (aim === null) return -1;
  const ts = Array.from({ length: N }, () => createTorpedoState());
  const done = new Array(N).fill(false); const launched = new Array(N).fill(false);
  const st = createShipAiState(90, ship.speedMps); st.desiredSpeedMps = ship.speedMps;
  const hull = createCircles(CIRC); const far = { x: 0, y: 0, headingDeg: 0, speedMps: 0 };
  const half = hullL / 2 + hullB; const pass2 = half * half;
  let hits = 0; let tReal = 0;
  const maxSteps = Math.ceil((torp.rangeM / torp.speedMps + 80) / dt);
  for (let i = 0; i < maxSteps; i++) {
    for (let j = 0; j < N; j++) if (!launched[j] && tReal >= j * INT - 1e-9) { launched[j] = true; launchTorpedo(ts[j]!, boat.x, boat.y, aim + errDeg + SP * (j - (N - 1) / 2), false, false, 0, rangeM, 25); }
    updateShipAi(st, ship, far, 0, 8, ts, ai, { width: 1e7, height: 1e7 }, FIXED_STEP_S, rng);
    steerShip(ship, st.desiredHeadingDeg, st.desiredSpeedMps, turnRateFor(st.mode, ai), ai.accelMps2, dt);
    fillHullCircles(hull, ship.x, ship.y, ship.headingDeg, hullL, hullB);
    let open = 0;
    for (let j = 0; j < N; j++) {
      const t = ts[j]!; if (!launched[j] || done[j]) { if (!launched[j]) open++; continue; }
      if (stepTorpedo(t, torp, dt, FIXED_STEP_S)) { done[j] = true; t.active = false; continue; }
      if (isArmed(t, torp) && pointHitsHull(t.x, t.y, hull)) { hits++; done[j] = true; t.active = false; continue; }
      if (markMissIfPassed(t, torp, ship.x, ship.y, pass2)) { done[j] = true; t.active = false; continue; }
      open++;
    }
    if (open === 0) break;
    tReal += FIXED_STEP_S;
  }
  return hits;
}
const ranges = (process.env['RANGES'] ?? '500,800,1000,1300,1800').split(',').map(Number);
const rng = new SeededRng(1);
const REPS = env('REPS', 6);
for (const r of ranges) {
  const dist = new Array(N + 1).fill(0); let n = 0;
  for (let bg = 0; bg <= 180; bg += 15) for (const e of [-3, -1.5, 0, 1.5, 3]) for (let q = 0; q < REPS; q++) { const h = fan(r, bg, e, rng); if (h < 0) break; dist[h]++; n++; }
  const pct = dist.map((c) => ((100 * c) / n).toFixed(1));
  const mean = dist.reduce((a, c, i) => a + c * i, 0) / n;
  console.log(`${String(r).padStart(5)} m  n=${n}  0..${N} 本: ${pct.join(' / ')} %  平均 ${mean.toFixed(2)}  3本以上 ${((100 * (dist[3] + (dist[4] ?? 0))) / n).toFixed(1)}%  4本 ${((100 * (dist[4] ?? 0)) / n).toFixed(1)}%`);
}
