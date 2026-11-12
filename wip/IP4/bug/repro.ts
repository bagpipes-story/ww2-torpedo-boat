// jp_06: after being spotted the player stops. How long do the destroyer guns keep firing? (pure core)
import boats from '/home/user/ww2-torpedo-boat/data/boats.json';
import enemies from '/home/user/ww2-torpedo-boat/data/enemies.json';
import hrm from '/home/user/ww2-torpedo-boat/data/hit_rate_model.json';
import { boatParamsFromData, nextSpeedBand, stepBoat, type BoatState, type SpeedStep } from '/home/user/ww2-torpedo-boat/src/core/boat-motion';
import { createGunneryState, gunneryParamsFromData, updateGuns, updateIllumination, type ShellEvents } from '/home/user/ww2-torpedo-boat/src/core/gunnery';
import { createShipAiState, shipAiParamsFromData, steerShip, turnRateFor, updateShipAi } from '/home/user/ww2-torpedo-boat/src/core/ship-ai';
import { SeededRng } from '/home/user/ww2-torpedo-boat/src/core/rng';
import { ktToMps } from '/home/user/ww2-torpedo-boat/src/core/units';
const E: any = enemies.enemies.find((e: any) => e.id === 'us_destroyer');
const B: any = boats.boats.find((b: any) => b.id === 'jp_t38');
const GP = gunneryParamsFromData(E); const AP = shipAiParamsFromData(E); const BP = boatParamsFromData(B);
const V: any = hrm.visibility; const TS = hrm.world.time_scale; const REAL = 1 / 60;
const base = E.detection.base_detect_m * V.moon_factor.dark;
const bounds = { width: 6000, height: 4000 };
const HOLD = V.detect_hold_s;
function run(nShips: number, lateralM: number, stopAt: 'detect' | 'lit', seed: number) {
  const ships: BoatState[] = []; const ais: any[] = []; const g: any[] = []; const rng = new SeededRng(seed); const lr = new SeededRng(seed + 17);
  const starts = [[1500, 1500, 90], [4500, 900, 270]];
  for (let i = 0; i < nShips; i++) { const [x, y, h] = starts[i]!; ships.push({ x, y, headingDeg: h, speedMps: ktToMps(E.speed_typical_kt) }); ais.push(createShipAiState(h, ktToMps(E.speed_typical_kt))); g.push(createGunneryState(GP, 64, h)); }
  // player approaches north at silent max from south of destroyer track at x such that it meets the destroyer
  const p: BoatState = { x: 2600 + lateralM, y: 3000, headingDeg: 0, speedMps: BP.silentMaxMps };
  let band: SpeedStep = 'silent'; let stopped = -1; let lastShot = -1; let shotsAfter = 0; let lastDet = -1; let lastLit = -1; let ramSeen = false; let minD = 1e9;
  const ev: ShellEvents = { onFire: () => { if (stopped >= 0) { shotsAfter++; lastShot = t; } }, onImpact: () => {} };
  let t = 0;
  for (let k = 0; k < 60 * 120; k++) {
    t = k * REAL;
    const speed01 = stopped >= 0 ? 0 : BP.silentMaxMps / BP.speedMaxMps;
    stepBoat(p, { headingDeg: NaN, speed01 }, BP, REAL * TS);
    band = nextSpeedBand(band, p.speedMps, BP);
    const det = base * V.speed_factor[band];
    let anyDet = false, anyLit = false;
    for (let i = 0; i < nShips; i++) {
      updateShipAi(ais[i], ships[i]!, p, det, HOLD, [], AP, bounds, REAL, lr);
      steerShip(ships[i]!, ais[i].desiredHeadingDeg, ais[i].desiredSpeedMps, turnRateFor(ais[i].mode, AP), AP.accelMps2, REAL * TS);
      if (ais[i].mode === 'ram' && stopped >= 0) ramSeen = true;
    }
    for (let i = 0; i < nShips; i++) {
      let lit = false; for (let j = 0; j < nShips; j++) if (j !== i && g[j].illuminated) lit = true; // = destroyer-group.othersIlluminated
      updateIllumination(g[i], ships[i]!, p, ais[i].playerDetected, GP, REAL, false, lit);
      updateGuns(g[i], ships[i]!, p, true, 7, 2, GP, rng, REAL, REAL * TS, ev);
      if (ais[i].playerDetected) anyDet = true; if (g[i].illuminated) anyLit = true;
      const dx = p.x - ships[i]!.x, dy = p.y - ships[i]!.y; if (stopped >= 0) minD = Math.min(minD, Math.hypot(dx, dy));
    }
    if (stopped < 0 && (stopAt === 'detect' ? anyDet : g.some((q) => q.light.illuminating))) stopped = t;
    if (stopped >= 0 && anyDet) lastDet = t; if (stopped >= 0 && anyLit) lastLit = t;
  }
  const f = (x: number) => (x < 0 ? '-' : (x - stopped).toFixed(1));
  return `ships=${nShips} lat=${lateralM} stopOn=${stopAt}: stop@${stopped.toFixed(1)}s detLast+${f(lastDet)} litLast+${f(lastLit)} shotLast+${f(lastShot)} shotsAfterStop=${shotsAfter} ramWhileStopped=${ramSeen} minDist=${minD.toFixed(0)}`;
}
console.log('detect m: stop', (base * V.speed_factor.stop).toFixed(0), 'silent', (base * V.speed_factor.silent).toFixed(0), 'hold', HOLD, 's; ram trigger', E.ram.trigger_m, 'giveup', E.ram.give_up_m);
for (const n of [1, 2]) for (const lat of [-1200, -600, 0, 600, 1200]) for (const s of ['detect', 'lit'] as const) console.log(run(n, lat, s, 1));
