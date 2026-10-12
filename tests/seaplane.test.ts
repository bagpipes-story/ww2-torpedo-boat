import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { stepBoat, type BoatParams, type BoatState } from '../src/core/boat-motion';
import type { AircraftPose } from '../src/core/friendly';
import { SeededRng } from '../src/core/rng';
import {
  SP_APPROACH,
  SP_DONE,
  SP_EV_FLARE,
  SP_EV_FOUND,
  SP_EV_IMPACT,
  SP_EV_LOST,
  SP_EV_RELEASE,
  SP_FLARE_PASS,
  SP_IDLE,
  SP_LEAVING,
  SP_ORBIT,
  SP_OUT_BOMBED,
  SP_OUT_CANCELLED,
  SP_OUT_LOST,
  SP_PATROL,
  SP_RUN,
  cancelSeaplane,
  createSeaplaneState,
  seaplaneActive,
  seaplaneConditionsMet,
  seaplanePose,
  stepSeaplane,
  stepSeaplaneTrigger,
  type SeaplaneCheck,
  type SeaplaneParams,
  type SeaplaneState,
} from '../src/core/seaplane';
import { isEnemyAircraftEventRecord, isSeaplaneDataRecord, seaplaneParamsFromData, type EnemyAircraftEventRecord, type SeaplaneDataRecord } from '../src/core/seaplane-data';
import { releaseBomb } from '../src/core/seaplane-ordnance';
import { ktToMps } from '../src/core/units';
import { buildWorldSetup } from '../src/systems/world-setup';

const SETUP = buildWorldSetup(gameData, 'us_02', NaN, NaN);
const P: SeaplaneParams = SETUP.seaplane!;
const BP: BoatParams = SETUP.boatParams;
const TS = gameData.hitRateModel.world.time_scale;
const PLANE = gameData.enemies.enemies.find((e) => e.id === 'ijn_seaplane_jake') as unknown as SeaplaneDataRecord;
const EVENT = gameData.riskEvents.events.find((e) => e.id === 'enemy_aircraft') as unknown as EnemyAircraftEventRecord;
const BOAT = { silentMaxKt: 18, halfLengthM: 12.2, halfBeamM: 3.15 };
const DT = 1 / 60;
const FULL = ktToMps(39);

function check(): SeaplaneCheck {
  return { boat: { x: 0, y: 0, headingDeg: 0, speedMps: FULL }, targetX: 1000, targetY: -1000, wake: true, stormInside: false, friendlyLive: false, busy: false, blocked: false, boatSinking: false, timeS: 30, shellsFired: 0, forceTrigger: false, forceSeen: false };
}
function started(c: SeaplaneCheck = check()): SeaplaneState {
  const s = createSeaplaneState(P);
  expect(stepSeaplaneTrigger(s, { ...c, forceTrigger: true }, P, DT)).toBe(true);
  return s;
}
/** dt 刻みで seconds 進める。各ステップの前に before を呼べる。戻りは事象ビットの OR と、各事象が最初に出た秒 */
function run(s: SeaplaneState, c: SeaplaneCheck, seconds: number, rng = new SeededRng(1), before?: (t: number) => void): { ev: number; at: Map<number, number>; t: number } {
  const at = new Map<number, number>();
  let ev = 0;
  let t = 0;
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    before?.(t);
    const e = stepSeaplane(s, P, c, rng, DT);
    t += DT;
    for (const bit of [SP_EV_FOUND, SP_EV_LOST, SP_EV_FLARE, SP_EV_RELEASE, SP_EV_IMPACT]) if (e & bit && !at.has(bit)) at.set(bit, t);
    ev |= e;
  }
  return { ev, at, t };
}
const pose = (s: SeaplaneState): AircraftPose => seaplanePose(s, P, { dx: 0, dy: 0, headingDeg: 0, alpha: 0 });
const dist = (q: AircraftPose): number => Math.hypot(q.dx, q.dy);
/** 散布なしの乱数 */
const ZERO_RNG = { next: () => 0 } as unknown as SeededRng;

describe('敵の水上機（docs/02 §6.8、v0.4.1）: data と params', () => {
  it('us_02: 120 kt → 308.64 m/s、6,000 m から、発見線 1,500 m、航跡 18 kt、真上まで 1.944 秒、旋回 29.47°/s、落下 11.06 game 秒（2.212 体感秒）、散布 56.57 m、命中半径 28.15 m、照明弾 1,200 m / 40 秒 / 6,000 m', () => {
    expect(P.flightMps).toBeCloseTo(ktToMps(120) * TS, 6);
    expect(P.flightMps).toBeCloseTo(308.64, 2);
    expect(P.spawnM).toBe(6000);
    expect(P.wakeDetectM).toBe(6000);
    expect(P.baseDetectM).toBe(1500);
    expect(P.wakeThresholdKt).toBe(18);
    expect(P.patrolFromS).toBe(20);
    expect(P.wakeTriggerS).toBe(3);
    expect(P.loseS).toBe(1.5);
    expect(P.patrolCooldownS).toBe(10);
    expect(P.runRadiusM).toBe(600);
    expect(P.overpassS).toBeCloseTo(1.944, 3);
    expect(P.passS).toBeCloseTo(3.888, 3);
    expect(P.orbitDegPerS).toBeCloseTo(29.473, 2);
    expect(P.orbitS).toBe(4);
    expect(P.leaveS).toBe(2.5);
    expect(P.bombFallGameS).toBeCloseTo(11.06, 2);
    expect(P.bombFallFeelS).toBeCloseTo(2.212, 3);
    expect(P.bombScatterM).toBeCloseTo(56.569, 3);
    expect(P.bombCount).toBe(2);
    expect(P.bombHit).toEqual({ damage: 35, fireChance: 0.3, engineDamageChance: 0.2 });
    expect(P.bombHitRadiusM).toBeCloseTo(28.15, 6);
    expect(P.boatHalfLengthM).toBeCloseTo(12.2, 6);
    expect(P.flareRadius2).toBe(1200 * 1200);
    expect(P.flareDurationS).toBe(40);
    expect(P.flareRevealM).toBe(6000);
  });
  it('壊れた設計値は例外。record の検査', () => {
    const q = EVENT.params;
    const ev = (patch: Partial<typeof q>): EnemyAircraftEventRecord => ({ params: { ...q, ...patch } });
    const pl = (patch: (p: SeaplaneDataRecord) => void): SeaplaneDataRecord => {
      const p = JSON.parse(JSON.stringify(PLANE)) as SeaplaneDataRecord;
      patch(p);
      return p;
    };
    expect(() => seaplaneParamsFromData(PLANE, ev({ run_radius_m: 1500 }), TS, BOAT)).toThrow();
    expect(() => seaplaneParamsFromData(pl((p) => (p.detection.wake_detect_m = 1000)), EVENT, TS, BOAT)).toThrow();
    expect(() => seaplaneParamsFromData(pl((p) => (p.detection.wake_speed_threshold_kt = 20)), EVENT, TS, BOAT)).toThrow(/18 kt/);
    expect(() => seaplaneParamsFromData(pl((p) => (p.bomb.count = 0)), EVENT, TS, BOAT)).toThrow();
    expect(() => seaplaneParamsFromData(pl((p) => (p.bomb.count = 1.5)), EVENT, TS, BOAT)).toThrow();
    expect(() => seaplaneParamsFromData(pl((p) => (p.bomb.accuracy_cep_m = 0)), EVENT, TS, BOAT)).toThrow();
    expect(() => seaplaneParamsFromData(pl((p) => (p.bomb.fire_chance = 1.2)), EVENT, TS, BOAT)).toThrow();
    expect(() => seaplaneParamsFromData(pl((p) => (p.flare.reveal_m = 1000)), EVENT, TS, BOAT)).toThrow();
    expect(() => seaplaneParamsFromData(PLANE, ev({ leave_s: 0 }), TS, BOAT)).toThrow();
    expect(() => seaplaneParamsFromData(PLANE, EVENT, 0, BOAT)).toThrow();
    expect(isSeaplaneDataRecord(pl((p) => delete (p as Partial<SeaplaneDataRecord>).flare))).toBe(false);
    expect(isSeaplaneDataRecord(PLANE)).toBe(true);
    expect(isEnemyAircraftEventRecord({ params: { ...q, lose_s: 'x' } })).toBe(false);
    expect(isEnemyAircraftEventRecord(EVENT)).toBe(true);
  });
});

describe('開始条件と接近', () => {
  it('全部そろえば true。哨戒前（19.9 秒）・航跡なし・帯の中・味方機・演出中・止められていれば false', () => {
    expect(seaplaneConditionsMet(check(), P)).toBe(true);
    expect(seaplaneConditionsMet({ ...check(), timeS: 19.9 }, P)).toBe(false);
    expect(seaplaneConditionsMet({ ...check(), wake: false }, P)).toBe(false);
    expect(seaplaneConditionsMet({ ...check(), stormInside: true }, P)).toBe(false);
    expect(seaplaneConditionsMet({ ...check(), friendlyLive: true }, P)).toBe(false);
    expect(seaplaneConditionsMet({ ...check(), busy: true }, P)).toBe(false);
    expect(seaplaneConditionsMet({ ...check(), blocked: true }, P)).toBe(false);
  });
  it('条件が 3 秒続いたら始まる。1 ステップ途切れると数え直し。forceTrigger は最初の判定で。開始時: 敵艦の方角 45° の 6,000 m 先、機首は 225°', () => {
    const s = createSeaplaneState(P);
    const c = check();
    let t = 0;
    while (!stepSeaplaneTrigger(s, c, P, DT)) t += DT;
    expect(t).toBeGreaterThan(3 - DT * 1.5);
    expect(t).toBeLessThan(3 + DT * 1.5);
    expect(s.phase).toBe(SP_APPROACH);
    expect(s.sorties).toBe(1);
    expect(s.approachDeg).toBeCloseTo(45, 6);
    expect(s.approachR).toBe(6000);
    expect(s.locked).toBe(false);
    expect(s.triggerAtS).toBe(30);
    const q = pose(s);
    expect(dist(q)).toBeCloseTo(6000, 6);
    expect(q.dx).toBeCloseTo(6000 * Math.SQRT1_2, 3);
    expect(q.headingDeg).toBeCloseTo(225, 6);
    expect(q.alpha).toBe(1);
    expect(stepSeaplaneTrigger(s, c, P, DT)).toBe(false);
    const s2 = createSeaplaneState(P);
    for (let i = 0; i < 90; i++) stepSeaplaneTrigger(s2, c, P, DT);
    stepSeaplaneTrigger(s2, { ...c, wake: false }, P, DT);
    let t2 = 0;
    while (!stepSeaplaneTrigger(s2, c, P, DT)) t2 += DT;
    expect(t2).toBeGreaterThan(3 - DT * 1.5);
    expect(started().phase).toBe(SP_APPROACH);
  });
  it('308.64 m/秒で寄る。発見確定は 14.58 秒（SP_EV_FOUND が 1 回）。確定の後は減速しても帯に入っても見失わない', () => {
    const s = started();
    const c = check();
    run(s, c, 1);
    expect(s.approachR).toBeCloseTo(6000 - 308.64, 0);
    const r = run(s, c, 20);
    expect(r.at.get(SP_EV_FOUND)!).toBeCloseTo(14.58 - 1, 1);
    expect(s.locked).toBe(true);
    run(s, { ...c, wake: false, stormInside: true }, 1);
    expect(s.phase).not.toBe(SP_LEAVING);
  });
  it('見失う: 2 秒後に航跡が消えると 1.5 秒で去る（LOST、slowReactS 2.0、lost 1）。2.5 秒で哨戒に戻り、冷却 10 秒の後にまた 3 秒で来る（DONE にはならない）', () => {
    const s = started();
    const c = check();
    run(s, c, 2);
    const r = run(s, { ...c, wake: false }, 3);
    expect(r.ev & SP_EV_LOST).toBe(SP_EV_LOST);
    expect(r.at.get(SP_EV_LOST)!).toBeCloseTo(1.5, 1);
    expect(s.outcome).toBe(SP_OUT_LOST);
    expect(s.slowReactS).toBeCloseTo(2, 1);
    expect(s.lost).toBe(1);
    expect(s.phase).toBe(SP_LEAVING);
    expect(seaplaneActive(s)).toBe(true);
    run(s, { ...c, wake: false }, 2.6 - 1.5);
    expect(s.phase).toBe(SP_PATROL);
    expect(seaplaneActive(s)).toBe(false);
    for (let i = 0; i < Math.round(9 / DT); i++) {
      stepSeaplane(s, P, c, ZERO_RNG, DT);
      expect(stepSeaplaneTrigger(s, c, P, DT)).toBe(false);
    }
    let t = 0;
    while (!stepSeaplaneTrigger(s, c, P, DT)) {
      stepSeaplane(s, P, c, ZERO_RNG, DT);
      t += DT;
    }
    expect(t).toBeLessThan(5);
    expect(s.sorties).toBe(2);
    expect(s.phase).toBe(SP_APPROACH);
  });
  it('見失いの線: 航跡が消えたとき 2,000 m なら見失う、1,900 m なら 1.5 秒以内に発見線を切って確定する。帯の中は見えない。forceSeen なら見失わない', () => {
    for (const [r0, lost] of [
      [2000, true],
      [1900, false],
    ] as const) {
      const s = started();
      s.approachR = r0;
      const r = run(s, { ...check(), wake: false }, 2);
      expect(s.outcome === SP_OUT_LOST).toBe(lost);
      expect((r.ev & SP_EV_FOUND) !== 0).toBe(!lost);
    }
    const s = started();
    run(s, { ...check(), stormInside: true }, 2);
    expect(s.outcome).toBe(SP_OUT_LOST);
    const f = started();
    run(f, { ...check(), wake: false, forceSeen: true }, 3);
    expect(f.phase).toBe(SP_APPROACH);
  });
});

describe('照明弾と爆撃', () => {
  it('全速直進で 19.44 秒に照明弾（艇の位置、40 秒）。lit は 1,200 m 以内。40 秒で消える', () => {
    const s = started();
    const c = check();
    const r = run(s, { ...c, forceSeen: true }, 20);
    expect(r.at.get(SP_EV_FLARE)!).toBeCloseTo(19.44, 1);
    expect(s.ordnance.flare.x).toBe(0);
    expect(s.ordnance.flare.leftS).toBeCloseTo(40 - (20 - 19.44), 1);
    expect(s.ordnance.flare.lit).toBe(true);
    c.boat.x = 1199;
    stepSeaplane(s, P, c, ZERO_RNG, DT);
    expect(s.ordnance.flare.lit).toBe(true);
    c.boat.x = 1201;
    stepSeaplane(s, P, c, ZERO_RNG, DT);
    expect(s.ordnance.flare.lit).toBe(false);
    c.boat.x = 0;
    c.shellsFired = 5;
    run(s, { ...c, forceSeen: true }, 45);
    expect(s.ordnance.flare.leftS).toBeLessThanOrEqual(0);
    expect(s.ordnance.flare.lit).toBe(false);
    expect(s.ordnance.flare.litS).toBeCloseTo(40, 0);
    expect(s.ordnance.flare.shellsUnderFlare).toBe(5);
  });
  it('時間線: 進入 25.38 → 投下 27.33 → 着弾 29.54 → 投下 35.22 → 着弾 37.43 → 去る → DONE 39.66。dt 0.25 でも 2 発', () => {
    const s = started();
    const c = { ...check(), forceSeen: true };
    const phases: Array<[number, number]> = [];
    let last = -1;
    const r = run(s, c, 40, new SeededRng(3), (t) => {
      if (s.phase !== last) {
        phases.push([s.phase, t]);
        last = s.phase;
      }
    });
    const at = (ph: number, nth = 0): number => phases.filter((x) => x[0] === ph)[nth]![1];
    expect(at(SP_FLARE_PASS)).toBeCloseTo(17.5, 1);
    expect(at(SP_ORBIT, 0)).toBeCloseTo(21.38, 1);
    expect(at(SP_RUN, 0)).toBeCloseTo(25.38, 1);
    expect(r.at.get(SP_EV_RELEASE)!).toBeCloseTo(27.33, 1);
    expect(r.at.get(SP_EV_IMPACT)!).toBeCloseTo(29.54, 1);
    expect(at(SP_RUN, 1)).toBeCloseTo(33.27, 1);
    expect(at(SP_LEAVING)).toBeCloseTo(37.16, 1);
    expect(at(SP_DONE)).toBeCloseTo(39.66, 1);
    expect(s.ordnance.bombsDropped).toBe(2);
    expect(s.outcome).toBe(SP_OUT_BOMBED);
    expect(s.phase).toBe(SP_DONE);
    expect(stepSeaplaneTrigger(s, check(), P, DT)).toBe(false);
    const coarse = started();
    for (let i = 0; i < 160; i++) stepSeaplane(coarse, P, c, new SeededRng(3), 0.25);
    expect(coarse.ordnance.bombsDropped).toBe(2);
  });
  it('見越し（散布なし）: 北向き全速の艇 → 狙点 (0, −221.9)。直進なら命中（35）。投下の瞬間から東へ転舵すれば 270 m ずれて外れ（転舵 0.17 秒）。投下 1 秒後からでも外れる', () => {
    const scenario = (turnAfterS: number | null): SeaplaneState => {
      const s = started();
      const boat: BoatState = { x: 0, y: 0, headingDeg: 0, speedMps: FULL };
      const c = { ...check(), boat, forceSeen: true };
      let releasedAt = NaN;
      run(s, c, 31, ZERO_RNG, (t) => {
        const turn = turnAfterS !== null && !Number.isNaN(releasedAt) && t - releasedAt >= turnAfterS;
        stepBoat(boat, { headingDeg: turn ? 90 : 0, speed01: 1 }, BP, DT * TS);
        if (Number.isNaN(releasedAt) && s.ordnance.bombsDropped > 0) releasedAt = t;
      });
      return s;
    };
    const straight = scenario(null);
    const b = straight.ordnance.bombs[0]!;
    expect(b.aimX).toBeCloseTo(b.fromX, 3);
    expect(b.aimY - b.fromY).toBeCloseTo(-FULL * P.bombFallGameS, 3);
    expect(FULL * P.bombFallGameS).toBeCloseTo(221.9, 0);
    expect(b.hit).toBe(true);
    expect(Number.isNaN(b.dodgeReactS)).toBe(true);
    expect(straight.ordnance.bombsHit).toBe(1);
    expect(straight.ordnance.bombDamage).toBe(35);
    expect(straight.ordnance.lastImpact).toBe(0);
    const dodged = scenario(0);
    expect(dodged.ordnance.bombs[0]!.hit).toBe(false);
    expect(dodged.ordnance.bombs[0]!.dodgeReactS).toBeCloseTo(0.17, 1);
    expect(scenario(1.0).ordnance.bombs[0]!.hit).toBe(false);
  });
  it('散布の統計（SeededRng(7)、停止した艇、4,000 発）: 命中 0.38 ± 0.03、着弾半径の中央値 40 ± 2 m、最大 56.6 m 以下', () => {
    const rng = new SeededRng(7);
    const boat: BoatState = { x: 0, y: 0, headingDeg: 0, speedMps: 0 };
    let hits = 0;
    const radii: number[] = [];
    for (let i = 0; i < 4000; i++) {
      const s = createSeaplaneState(P);
      releaseBomb(s.ordnance, P, boat, rng);
      const b = s.ordnance.bombs[0]!;
      radii.push(Math.hypot(b.aimX, b.aimY));
      let ev = 0;
      for (let k = 0; k < 140 && !(ev & SP_EV_IMPACT); k++) ev = stepSeaplane(s, P, { ...check(), boat }, rng, DT);
      expect(ev & SP_EV_IMPACT).toBe(SP_EV_IMPACT);
      if (b.hit) hits++;
    }
    expect(hits / 4000).toBeGreaterThan(0.35);
    expect(hits / 4000).toBeLessThan(0.41);
    radii.sort((a, b) => a - b);
    expect(radii[2000]!).toBeGreaterThan(38);
    expect(radii[2000]!).toBeLessThan(42);
    expect(radii[3999]!).toBeLessThanOrEqual(56.6);
  });
  it('中断: 接近中・旋回中に沈没なら去って哨戒へ。落下中の爆弾は着弾まで進み、沈没中の艇には当たらない', () => {
    const s = started();
    run(s, check(), 2);
    cancelSeaplane(s, P);
    expect(s.phase).toBe(SP_LEAVING);
    expect(s.outcome).toBe(SP_OUT_CANCELLED);
    run(s, { ...check(), blocked: true }, 3);
    expect(s.phase).toBe(SP_PATROL);
    cancelSeaplane(s, P);
    expect(s.phase).toBe(SP_PATROL);
    const b = started();
    const c = { ...check(), forceSeen: true };
    run(b, c, 28);
    expect(b.ordnance.bombsDropped).toBe(1);
    cancelSeaplane(b, P);
    const r = run(b, { ...c, boatSinking: true, blocked: true }, 3);
    expect(r.ev & SP_EV_IMPACT).toBe(SP_EV_IMPACT);
    expect(b.ordnance.bombs[0]!.hit).toBe(false);
  });
  it('pose: 旋回は 600 m を 29.47°/s、航過は 600 m 先から真上を通って反対側へ、去る間は薄くなりながら離れる。哨戒・終了は alpha 0', () => {
    const s = started();
    const c = { ...check(), forceSeen: true };
    run(s, c, 21.5);
    expect(s.phase).toBe(SP_ORBIT);
    const q0 = pose(s);
    expect(dist(q0)).toBeCloseTo(600, 6);
    const b0 = ((Math.atan2(q0.dx, -q0.dy) * 180) / Math.PI + 360) % 360;
    run(s, c, 2);
    const q1 = pose(s);
    const b1 = ((Math.atan2(q1.dx, -q1.dy) * 180) / Math.PI + 360) % 360;
    expect(((b1 - b0 + 360) % 360)).toBeCloseTo(2 * P.orbitDegPerS, 0);
    run(s, c, 2);
    expect(s.phase).toBe(SP_RUN);
    s.timerS = P.overpassS;
    expect(dist(pose(s))).toBeCloseTo(0, 6);
    s.timerS = 0;
    expect(dist(pose(s))).toBeCloseTo(600, 6);
    const l = started();
    run(l, check(), 2);
    cancelSeaplane(l, P);
    const d0 = dist(pose(l));
    run(l, check(), 1);
    expect(dist(pose(l)) - d0).toBeCloseTo(P.flightMps, 0);
    expect(pose(l).alpha).toBeCloseTo(1 - 1 / P.leaveS, 1);
    expect(pose(createSeaplaneState(P)).alpha).toBe(0);
  });
  it('確保しない・中立: 1,000 ステップ回しても bombs は同じ配列。哨戒前（timeS < 20）は state が変わらない', () => {
    const s = started();
    const bombs = s.ordnance.bombs;
    run(s, { ...check(), forceSeen: true }, 1000 * DT, new SeededRng(2));
    expect(s.ordnance.bombs).toBe(bombs);
    const idle = createSeaplaneState(P);
    const before = JSON.stringify(idle);
    const c = { ...check(), timeS: 10 };
    for (let i = 0; i < 300; i++) {
      stepSeaplaneTrigger(idle, c, P, DT);
      stepSeaplane(idle, P, c, ZERO_RNG, DT);
    }
    expect(idle.phase).toBe(SP_IDLE);
    expect(JSON.stringify({ ...idle, clockS: 0 })).toBe(JSON.stringify({ ...JSON.parse(before), clockS: 0 }));
  });
});
