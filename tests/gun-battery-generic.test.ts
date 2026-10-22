// 艇の砲の本体の共通化（v0.6.3 実機 1 回目）: 今の大発の stepGunBattery（型を問わない stepGunBatteryOf に bargeAfloat・bargeBlocked を渡す包み）が、
// 共通化の前（d09000b）の本体の凍結した写し（tests/gun-battery-frozen）と us_03 の大発の隊でステップごとに同じか（弾・状態・標的・KPI・事象・乱数の状態）。
// 200 seed、動く大発（stepFlotilla）・回る艇・押す／離す・撃てない・煙幕・速力帯を混ぜる。レビュー NP-2・F4: 前は包みと stepGunBatteryOf を比べていて、どちらも同じ本体を
// 通るので本体の書き違い（乱数の引く順など）を捕まえられなかった。写しが共有する shells.ts などの変化は、d09000b で測った決まった値（数と乱数の状態）で捕まえる。
import { describe, expect, it } from 'vitest';
import { gameData, getBargeParams, getGunBatteryParams, getPrototypeMission } from '../src/config/game-data';
import type { BoatState, SpeedStep } from '../src/core/boat-motion';
import { createFlotilla, hitBarge, stepFlotilla, type FlotillaCheck, type FlotillaEvents, type FlotillaState } from '../src/core/barges';
import { GUN_BLOCKED, GUN_FIRING, GUN_NO_TARGET, GUN_OUT_OF_ARC, GUN_OUT_OF_RANGE, GUN_SAFE, createGunBattery, stepGunBattery, type GunBatteryState, type GunEvents } from '../src/core/gun-battery';
import { SeededRng } from '../src/core/rng';
import { stepGunBattery as stepGunBatteryD09000b } from './gun-battery-frozen';

const DT = 1 / 60;
const TS = gameData.hitRateModel.world.time_scale;
const M = getPrototypeMission(gameData, 'us_03');
const G = getGunBatteryParams(gameData, M)!;
const P = getBargeParams(gameData, M)!;
const VIS2 = 900 * 900;
const SEEDS = 200;
const STEPS = 600;
const BANDS: readonly SpeedStep[] = ['stop', 'silent', 'cruise', 'full'];
const quietFlotilla: FlotillaEvents = { onFire: () => {}, onImpact: () => {}, onBeached: () => {} };

interface Side {
  f: FlotillaState;
  g: GunBatteryState;
  rng: SeededRng;
  bargeRng: SeededRng;
  boat: BoatState;
  check: FlotillaCheck;
  log: number[];
  ev: GunEvents;
}

function side(seed: number): Side {
  const f = createFlotilla(P, 16);
  const boat: BoatState = { x: P.leadX, y: P.leadY - 400, headingDeg: 90, speedMps: 0 };
  const log: number[] = [];
  const ev: GunEvents = {
    onFire: (x, y) => void log.push(1, x, y),
    onHit: (i, gr, x, y) => {
      log.push(2, i, gr, x, y);
      hitBarge(f, P, i, G.groups[gr]!.damage);
    },
    onMiss: (x, y) => void log.push(3, x, y),
  };
  const check: FlotillaCheck = { boat, boatHalfLengthM: 12.2, boatHalfBeamM: 3.15, detectOpenM: 600, smokeFactor: 1, smoke: null, smokeParams: null, flashM: 0, boatAfloat: true, dawn: false };
  return { f, g: createGunBattery(G, 24), rng: new SeededRng((seed + 7) >>> 0), bargeRng: new SeededRng((seed + 6) >>> 0), boat, check, log, ev };
}

const rngState = (r: SeededRng): number => (r as unknown as { state: number }).state;

/** 1 ステップ（frozen は d09000b の写し、ほかは今の包み）。艇は先頭の大発の周りを 100〜1,000 m で回りながら向きを変える */
function step(s: Side, seed: number, k: number, frozen: boolean): void {
  const lead = s.f.barges[0]!;
  const r = 550 + 450 * Math.sin((k + seed * 13) / 47);
  const a = (k * 1.7 + seed * 29) * (Math.PI / 180);
  s.boat.x = lead.x + Math.sin(a) * r;
  s.boat.y = lead.y - Math.cos(a) * r;
  s.boat.headingDeg = (seed * 37 + k * 2.3) % 360;
  for (let i = 0; i < s.f.barges.length; i++) s.f.barges[i]!.blocked = ((k >> 5) + i + seed) % 5 === 0;
  const band = BANDS[((k >> 7) + seed) % 4]!;
  const held = (k + seed) % 97 < 70;
  const canFire = k % 211 < 200;
  if (frozen) stepGunBatteryD09000b(s.g, G, s.boat, band, held, canFire, s.f.barges, P.halfLengthM, P.halfBeamM, VIS2, s.rng, DT, DT * TS, s.ev);
  else stepGunBattery(s.g, G, s.boat, band, held, canFire, s.f.barges, P.halfLengthM, P.halfBeamM, VIS2, s.rng, DT, DT * TS, s.ev);
  s.check.flashM = s.g.fired ? G.flashRevealM : 0;
  stepFlotilla(s.f, P, s.check, s.bargeRng, DT, DT * TS, quietFlotilla);
}

/** 最初に違う所の名前（同じなら null）。NaN 同士は同じ */
function diff(a: Side, b: Side): string | null {
  const same = (x: number, y: number): boolean => x === y || (Number.isNaN(x) && Number.isNaN(y));
  const ga = a.g;
  const gb = b.g;
  if (ga.status !== gb.status || ga.target !== gb.target || !same(ga.targetM, gb.targetM) || ga.fired !== gb.fired || ga.fast !== gb.fast) return 'status/target/targetM/fired/fast';
  if (ga.shots !== gb.shots || ga.hits !== gb.hits || !same(ga.firstShotM, gb.firstShotM) || ga.firstShotBand !== gb.firstShotBand) return 'KPI';
  for (let i = 0; i < ga.cooldownS.length; i++) if (!same(ga.cooldownS[i]!, gb.cooldownS[i]!)) return `cooldownS[${i}]`;
  for (let i = 0; i < ga.shells.length; i++) {
    const p = ga.shells[i]!;
    const q = gb.shells[i]!;
    if (p.active !== q.active || p.x !== q.x || p.y !== q.y || p.vx !== q.vx || p.vy !== q.vy || p.leftS !== q.leftS || p.impactX !== q.impactX || p.impactY !== q.impactY || p.gunIndex !== q.gunIndex) return `shells[${i}]`;
  }
  if (rngState(a.rng) !== rngState(b.rng) || rngState(a.bargeRng) !== rngState(b.bargeRng)) return 'rng';
  if (a.log.length !== b.log.length || a.log.some((v, i) => v !== b.log[i])) return 'events';
  for (let i = 0; i < a.f.barges.length; i++) {
    const p = a.f.barges[i]!;
    const q = b.f.barges[i]!;
    if (p.phase !== q.phase || p.hp !== q.hp || p.x !== q.x || p.y !== q.y || p.headingDeg !== q.headingDeg) return `barges[${i}]`;
  }
  return null;
}

describe('艇の砲の本体の共通化（v0.6.3 実機 1 回目。us_03 は同じ）', () => {
  it(`今の stepGunBattery（包み）は d09000b の本体の写しと ${SEEDS} seed × ${STEPS} ステップで毎ステップ同じ（弾・状態・標的・KPI・事象・乱数）。数と乱数の状態は d09000b で測った値`, () => {
    const seen = new Set<number>();
    const golden: number[][] = [];
    let shots = 0;
    let hits = 0;
    let sunk = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const a = side(seed);
      const b = side(seed);
      for (let k = 0; k < STEPS; k++) {
        step(a, seed, k, true);
        step(b, seed, k, false);
        const d = diff(a, b);
        if (d !== null) expect.fail(`seed ${seed} ステップ ${k}: ${d} が違う`);
        seen.add(a.g.status);
        a.log.length = 0;
        b.log.length = 0;
      }
      shots += b.g.shots;
      hits += b.g.hits;
      sunk += b.f.sunk;
      if (seed <= 3) golden.push([b.g.shots, b.g.hits, rngState(b.rng), ...b.f.barges.map((x) => x.hp)]);
    }
    // 比べた場面が薄くない: 状態の 6 つすべて・発射と命中と撃破がある
    expect([...seen].sort()).toEqual([GUN_SAFE, GUN_FIRING, GUN_NO_TARGET, GUN_OUT_OF_ARC, GUN_OUT_OF_RANGE, GUN_BLOCKED].sort());
    // d09000b の stepGunBattery で測った値（レビュー NP-2。seed 1〜3 は 600 ステップ後の 発射・命中・seed+7 の乱数の状態・4 隻の HP）
    expect(golden).toEqual([
      [21, 8, 3911320122, 0, 0, 20, 20],
      [34, 6, 4287391005, 0, 10, 20, 20],
      [33, 6, 624259380, 0, 10, 20, 20],
    ]);
    expect([shots, hits, sunk]).toEqual([5774, 1293, 155]);
  });
});
