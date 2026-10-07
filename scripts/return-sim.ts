// 帰投・燃料のオフライン模擬（Phaser 非依存。src/core と data だけ）。docs/02 §6.7、v0.3.0。
// 実際の ship-ai・魚雷・砲撃・被害・燃料曲線を使い、遊び方ごとに 帰投時の燃料残・所要時間・帰投率 を測る。
// 操作は理想化している（敵の位置を常に知り、直線で動く）ので、燃料と所要時間の目安に使い、生存率は参考にしない。
// 実行: npx esbuild scripts/return-sim.ts --bundle --platform=node --format=esm --outfile=/tmp/return-sim.mjs && node /tmp/return-sim.mjs
// 環境変数: ALLOT（割当 gal、既定は data）、DAWN（夜明け秒、既定は data）、NOGUN=1（被弾なし）、MISSFIRST=1（初弾を外す）、RUNS（回数、既定 200）
import boats from '../data/boats.json';
import enemies from '../data/enemies.json';
import hitRateModel from '../data/hit_rate_model.json';
import missionsSeed from '../data/missions_seed.json';
import torpedoes from '../data/torpedoes.json';
import { boatParamsFromData, clampToBounds, isBoatDataRecord, nextSpeedBand, stepBoat, type BoatInput, type BoatState, type SpeedStep } from '../src/core/boat-motion';
import { burnGph, fuelCurveFromData, isBoatFuelDataRecord } from '../src/core/fuel';
import {
  applyShellHit,
  createDamageState,
  createGunneryState,
  damageParamsFromData,
  gunneryParamsFromData,
  isBoatDamageDataRecord,
  isEnemyGunneryDataRecord,
  stepDamage,
  updateGuns,
  updateIllumination,
  type HitOutcome,
  type ShellEvents,
} from '../src/core/gunnery';
import { insideRing, isReturnPointDataRecord, returnPointFromData } from '../src/core/mission-flow';
import { SeededRng } from '../src/core/rng';
import { fillSalvoHeadings } from '../src/core/salvo';
import { createShipAiState, isEnemyAiDataRecord, shipAiParamsFromData, steerShip, turnRateFor, updateShipAi } from '../src/core/ship-ai';
import { createTorpedoState, isArmed, isTorpedoDataRecord, launchTorpedo, markMissIfPassed, stepTorpedo, torpedoParamsFromData, torpedoReliabilityFromData } from '../src/core/torpedo';
import { boatTouchesHull, createCircles, fillHullCircles, interceptHeadingDeg, pointHitsHull } from '../src/core/torpedo-solver';
import { SECONDS_PER_HOUR } from '../src/core/units';

const N = Number(process.env['RUNS'] ?? 200);
const NOGUN = !!process.env['NOGUN'];
const MISSFIRST = !!process.env['MISSFIRST'];

const rb: unknown = boats.boats.find((b) => b.id === 'us_elco80');
if (!isBoatDataRecord(rb) || !isBoatDamageDataRecord(rb) || !isBoatFuelDataRecord(rb)) throw new Error('boat');
const BP = boatParamsFromData(rb);
const DP = damageParamsFromData(rb);
const FC = fuelCurveFromData(rb);
const re: unknown = enemies.enemies.find((e) => e.id === 'ijn_destroyer');
if (!isEnemyAiDataRecord(re) || !isEnemyGunneryDataRecord(re)) throw new Error('enemy');
const AIP = shipAiParamsFromData(re);
const GP = gunneryParamsFromData(re);
const E = re as unknown as { length_m: number; beam_m: number; hull_circles: number; detection: { base_detect_m: number } };
const rt: unknown = torpedoes.torpedoes.find((t) => t.id === 'us_mk8');
if (!isTorpedoDataRecord(rt)) throw new Error('torp');
const TP = torpedoParamsFromData(rt, hitRateModel.torpedo_launch.arming_distance_m, hitRateModel.torpedo_launch.erratic_period_s);
const RELIABILITY = torpedoReliabilityFromData(rt);
const mission = missionsSeed.missions.find((m) => m.id === 'us_02') as unknown as {
  v0_1_prototype: { duration_s: number; fuel_allotment_gal: number; return_point: unknown; bounds_m: { width: number; height: number }; player_start: { x_m: number; y_m: number; heading_deg: number }; enemy_start: { x_m: number; y_m: number; heading_deg: number } };
};
const PROTO = mission.v0_1_prototype;
if (!isReturnPointDataRecord(PROTO.return_point)) throw new Error('return_point');
const BOUNDS = PROTO.bounds_m;
const HOME = returnPointFromData(PROTO.return_point, BOUNDS);
const ALLOT = Number(process.env['ALLOT'] ?? PROTO.fuel_allotment_gal);
const DAWN_S = Number(process.env['DAWN'] ?? PROTO.duration_s);
const TS = hitRateModel.world.time_scale;
const REAL = 1 / 60;
const GAME = REAL * TS;
const SF = hitRateModel.visibility.speed_factor as Record<SpeedStep, number>;
const HALF_LEN = rb.length_m / 2;
const HALF_BEAM = rb.beam_m / 2;
const BOAT_MARGIN = (rb.length_m * hitRateModel.world.sprite_scale) / 2;
const SHIP_MARGIN = (E.length_m * hitRateModel.world.sprite_scale) / 2;
const PASS_R2 = (E.length_m / 2 + E.beam_m) ** 2;
const SPEED_SILENT01 = BP.silentMaxMps / BP.speedMaxMps;
const SPEED_CRUISE01 = BP.speedCruiseMps / BP.speedMaxMps;

type Style = 'silent' | 'standard' | 'full' | 'reattack' | 'fullReattack' | 'direct';
const STYLE_NOTE: Record<Style, string> = {
  silent: '18 kt で接近 → 1,000 m で扇射 4 本 → 全速 10 秒離脱 → 18 kt で帰投',
  standard: '18 kt で接近 → 1,000 m で扇射 4 本 → 全速 15 秒離脱 → 巡航で帰投',
  full: '全速で接近 → 550 m で扇射 4 本 → 全速で離脱・帰投',
  reattack: '18 kt で接近 → 2 本 → 全速 15 秒離脱 → 巡航で再接近 800 m → 2 本 → 巡航で帰投',
  fullReattack: '全速で接近 → 2 本 → 全速 10 秒離脱 → 全速で再接近 → 2 本 → 全速で帰投',
  direct: '攻撃せず 18 kt で直帰',
};
interface Run {
  outcome: string;
  t: number;
  fuelPct: number;
  fuelAtLaunchPct: number;
  hits: number;
  detectedOnReturn: boolean;
  minDistOnReturn: number;
  sunk: boolean;
}

function run(style: Style, seed: number): Run {
  const rng = new SeededRng(seed);
  const gunRng = new SeededRng(seed + 7777);
  const boat: BoatState = { x: PROTO.player_start.x_m, y: PROTO.player_start.y_m, headingDeg: PROTO.player_start.heading_deg, speedMps: 0 };
  const ship: BoatState = { x: PROTO.enemy_start.x_m, y: PROTO.enemy_start.y_m, headingDeg: PROTO.enemy_start.heading_deg, speedMps: AIP.cruiseSpeedMps };
  const ai = createShipAiState(ship.headingDeg, AIP.cruiseSpeedMps);
  const hull = createCircles(E.hull_circles);
  const torps = Array.from({ length: 4 }, () => createTorpedoState());
  let fired = 0;
  const g = createGunneryState(GP, 48, ship.headingDeg);
  const dmg = createDamageState(DP);
  const out: HitOutcome = { destroyed: false, startedFire: false, engineHit: false };
  let dead = false;
  const ev: ShellEvents = {
    onFire: () => {},
    onImpact: (i, _x, _y, hit) => {
      if (hit && !dead && !NOGUN) dead = applyShellHit(dmg, GP.guns[i]!, DP, gunRng, out).destroyed;
    },
  };
  let band: SpeedStep = 'stop';
  let fuel = ALLOT;
  let fuelAtLaunch = NaN;
  let sinking = false;
  let hits = 0;
  let phase: 'wait' | 'approach' | 'fire' | 'escape' | 'reapproach' | 'home' = style === 'direct' ? 'home' : 'wait';
  let attacks = 0;
  const waitS = rng.nextRange(0, 10);
  const fireRange = (style === 'full' || style === 'fullReattack' ? 550 : 1000) + rng.nextRange(-150, 150);
  const escapeS = style === 'standard' || style === 'reattack' ? 15 : 10;
  const approachSpeed01 = style === 'full' || style === 'fullReattack' ? 1 : SPEED_SILENT01;
  const reSpeed01 = style === 'fullReattack' ? 1 : SPEED_CRUISE01;
  const homeSpeed01 = style === 'silent' || style === 'direct' ? SPEED_SILENT01 : style === 'full' || style === 'fullReattack' ? 1 : SPEED_CRUISE01;
  const perAttack = style === 'reattack' || style === 'fullReattack' ? 2 : 4;
  let phaseT = 0;
  let detectedOnReturn = false;
  let minDistOnReturn = Infinity;
  let stoppedS = 0;
  const headings: number[] = [0, 0, 0, 0];
  let queue = 0;
  let qi = 0;
  let qcool = 0;
  const input: BoatInput = { headingDeg: NaN, speed01: 0 };
  const result = (outcome: string, t: number): Run => ({ outcome, t, fuelPct: (100 * fuel) / ALLOT, fuelAtLaunchPct: (100 * fuelAtLaunch) / ALLOT, hits, detectedOnReturn, minDistOnReturn, sunk: sinking });
  for (let step = 0; step < DAWN_S * 60 + 1; step++) {
    const t = step / 60;
    const dx = ship.x - boat.x;
    const dy = ship.y - boat.y;
    const dist = Math.hypot(dx, dy);
    phaseT += REAL;
    // --- 操縦 ---
    if (fuel <= 0) {
      input.headingDeg = NaN;
      input.speed01 = 0;
    } else if (phase === 'wait') {
      input.headingDeg = 0;
      input.speed01 = 0;
      if (phaseT >= waitS) {
        phase = 'approach';
        phaseT = 0;
      }
    } else if (phase === 'approach' || phase === 'reapproach') {
      // 艦の未来位置へ向かう簡易な見越し
      const lead = ((0.4 * dist) / (approachSpeed01 * BP.speedMaxMps * TS + 1)) * TS;
      const hs = (ship.headingDeg * Math.PI) / 180;
      const tx = ship.x + Math.sin(hs) * ship.speedMps * lead;
      const ty = ship.y - Math.cos(hs) * ship.speedMps * lead;
      input.headingDeg = (Math.atan2(tx - boat.x, -(ty - boat.y)) * 180) / Math.PI;
      input.speed01 = phase === 'reapproach' ? reSpeed01 : approachSpeed01;
      const fr = phase === 'reapproach' ? (style === 'fullReattack' ? fireRange : 800) : fireRange;
      if (!sinking && dist <= fr && queue === 0) {
        const h = interceptHeadingDeg(boat.x, boat.y, TP.speedMps, ship.x, ship.y, Math.sin(hs) * ship.speedMps, -Math.cos(hs) * ship.speedMps) ?? input.headingDeg;
        const n = Math.min(perAttack, 4 - fired);
        fillSalvoHeadings(h + rng.nextRange(-3, 3), n, 6, headings);
        queue = n;
        qi = 0;
        qcool = 0;
        if (Number.isNaN(fuelAtLaunch)) fuelAtLaunch = fuel;
        phase = 'fire';
        phaseT = 0;
        attacks++;
      }
      if (sinking) {
        phase = 'home';
        phaseT = 0;
      }
    } else if (phase === 'fire') {
      if (queue === 0 && phaseT > 0.2) {
        phase = 'escape';
        phaseT = 0;
      }
    } else if (phase === 'escape') {
      // 艦から遠ざかる向きへ全速
      input.headingDeg = (Math.atan2(-dx, dy) * 180) / Math.PI;
      input.speed01 = 1;
      if (phaseT >= escapeS) {
        const torpsLeft = 4 - fired;
        phase = !sinking && torpsLeft > 0 && (style === 'reattack' || style === 'fullReattack') ? 'reapproach' : 'home';
        phaseT = 0;
      }
    } else {
      input.headingDeg = (Math.atan2(HOME.x - boat.x, -(HOME.y - boat.y)) * 180) / Math.PI;
      input.speed01 = homeSpeed01;
    }
    // 発射待ち行列（salvo_interval_s 間隔）
    if (queue > 0) {
      qcool -= REAL;
      if (qcool <= 0) {
        const s = torps[fired]!;
        launchTorpedo(s, boat.x, boat.y, headings[qi]!, (MISSFIRST && attacks === 1) || rng.chance(RELIABILITY.dud), rng.chance(RELIABILITY.erratic), rng.nextRange(-3, 3), dist, 25);
        fired++;
        qi++;
        queue--;
        qcool = hitRateModel.torpedo_launch.salvo_interval_s;
      }
    }
    // --- 固定ステップ（game dt） ---
    if (!dead) {
      stepBoat(boat, input, BP, GAME);
      clampToBounds(boat, BOUNDS, BOAT_MARGIN);
      fuel = Math.max(0, fuel - (burnGph(FC, boat.speedMps) * GAME) / SECONDS_PER_HOUR);
    }
    band = nextSpeedBand(band, boat.speedMps, BP);
    const detR = E.detection.base_detect_m * SF[band] * hitRateModel.visibility.moon_factor.half;
    if (!sinking) {
      updateShipAi(ai, ship, boat, detR, hitRateModel.visibility.detect_hold_s, torps, AIP, BOUNDS, REAL);
      steerShip(ship, ai.desiredHeadingDeg, ai.desiredSpeedMps, turnRateFor(ai.mode, AIP), AIP.accelMps2, GAME);
      clampToBounds(ship, BOUNDS, SHIP_MARGIN);
      fillHullCircles(hull, ship.x, ship.y, ship.headingDeg, E.length_m, E.beam_m);
    }
    for (const s of torps) {
      if (!s.active) continue;
      stepTorpedo(s, TP, GAME, REAL);
      if (s.x < 0 || s.y < 0 || s.x > BOUNDS.width || s.y > BOUNDS.height) {
        s.active = false;
        continue;
      }
      if (sinking || s.resolved) continue;
      if (isArmed(s, TP) && pointHitsHull(s.x, s.y, hull)) {
        s.active = false;
        s.resolved = true;
        if (!s.dud) {
          hits++;
          sinking = true;
        }
        continue;
      }
      markMissIfPassed(s, TP, ship.x, ship.y, PASS_R2);
    }
    if (!sinking && !dead && boatTouchesHull(boat.x, boat.y, boat.headingDeg, HALF_LEN, hull)) return result('rammed', t);
    const detected = ai.playerDetected && !sinking;
    if (phase === 'home') {
      if (detected) detectedOnReturn = true;
      if (!sinking) minDistOnReturn = Math.min(minDistOnReturn, dist);
    }
    updateIllumination(g, ship, boat, detected, GP, REAL);
    updateGuns(g, ship, boat, !sinking && !dead, HALF_LEN, HALF_BEAM, GP, gunRng, REAL, GAME, ev);
    if (!NOGUN && !dead && stepDamage(dmg, DP, REAL)) dead = true;
    if (dead) return result('destroyed', t);
    if (insideRing(HOME, boat.x, boat.y)) return result('returned', t);
    if (fuel <= 0 && boat.speedMps <= BP.stopMaxMps) {
      stoppedS += REAL;
      if (stoppedS >= 1.5) return result('adrift', t);
    }
  }
  return result('dawn', DAWN_S);
}

const q = (a: number[], p: number): number => {
  const s = a.slice().sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? NaN;
};
console.log(`idle ${FC.idleGph.toFixed(0)} gal/h, n=${FC.exponent.toFixed(3)}, allot=${ALLOT} gal, dawn=${DAWN_S} s, home=(${HOME.x},${HOME.y}) r${HOME.radiusM}, runs=${N}${NOGUN ? ', 被弾なし' : ''}${MISSFIRST ? ', 初弾を外す' : ''}`);
for (const style of ['silent', 'standard', 'full', 'reattack', 'fullReattack', 'direct'] as Style[]) {
  const rs = Array.from({ length: N }, (_, k) => run(style, 1000 + k));
  const cnt: Record<string, number> = {};
  for (const r of rs) cnt[r.outcome] = (cnt[r.outcome] ?? 0) + 1;
  const ret = rs.filter((r) => r.outcome === 'returned');
  const fp = ret.map((r) => r.fuelPct);
  const tt = ret.map((r) => r.t);
  const det = rs.filter((r) => r.detectedOnReturn).length;
  const sunk = rs.filter((r) => r.sunk).length;
  const fl = rs.map((r) => r.fuelAtLaunchPct).filter((x) => !Number.isNaN(x));
  console.log(
    `${style.padEnd(13)} ${JSON.stringify(cnt)} 撃沈 ${sunk} | 帰投時の燃料% p10 ${q(fp, 0.1).toFixed(0)} 中央 ${q(fp, 0.5).toFixed(0)} p90 ${q(fp, 0.9).toFixed(0)} | 所要 中央 ${q(tt, 0.5).toFixed(0)} s p90 ${q(tt, 0.9).toFixed(0)} s | 初発射時の燃料% 中央 ${q(fl, 0.5).toFixed(0)} | 帰路で発見 ${det}   ${STYLE_NOTE[style]}`,
  );
}
