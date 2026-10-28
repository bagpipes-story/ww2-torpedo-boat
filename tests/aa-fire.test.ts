// 対空（v0.6.8。core/aa-fire。spec-v068 §1.1 D5・§5.1・§6.1）: 押していない・機がいない・撃てない（艦艇を撃っている・終わりの待ち・沈み始め＝呼ぶ側の canFire）・
// 弾倉交換中は乱数を引かず、撃てば 1 発に 1 回だけ引く。発射は組の rounds_per_min（体感の 1 分で Σ rpm ± 1）。射程 650 m は端を含み、600 m の旋回はどの方位でも射程の中。
// 艇首・艇尾の ±30° は撃たない・最寄りを撃つ。確率は速力帯の spread_factor で割る。借りた弾倉（PtGunState の形）は 15 発で交換がすぐ始まる。20 万発の撃墜の数は ±4σ に入る。
import { describe, expect, it } from 'vitest';
import { gameData, getPrototypeMission } from '../src/config/game-data';
import { getLoadout } from '../src/config/loadout-data';
import { FIXED_STEP_S } from '../src/config/step-config';
import {
  AA_FIRING,
  AA_MAX_TARGETS,
  AA_NO_TARGET,
  AA_OUT_OF_ARC,
  AA_OUT_OF_RANGE,
  AA_RELOAD,
  AA_SAFE,
  AA_SRC_DAWN,
  addStrikePlanes,
  createAaState,
  createAaTargets,
  pushAaTarget,
  stepAaFire,
  type AaTargets,
  type AntiAircraftParams,
} from '../src/core/aa-fire';
import { AS_DONE, AS_IDLE, createAirStrike, startAirStrike, stepAirStrike, strikePose, type AirStrikeCheck } from '../src/core/air-strike';
import type { BoatState, SpeedStep } from '../src/core/boat-motion';
import type { AircraftPose } from '../src/core/friendly';
import type { GunBatteryParams } from '../src/core/gun-battery';
import { createMagazine } from '../src/core/magazine';
import type { PtGunState } from '../src/core/pt-gun';
import { SeededRng } from '../src/core/rng';
import { buildWorldSetup } from '../src/systems/world-setup';

const DT = FIXED_STEP_S;
const loadout = (id: string) => getLoadout(gameData, getPrototypeMission(gameData, id));
const ELCO80 = loadout('us_03').gun!; // 40mm・37mm 150 + 20mm・12.7mm 480 発/分
const T38 = loadout('jp_01').gun!; // 25mm 220 発/分・弾倉 15
const AA = loadout('us_03').aa;
const R = AA.rangeM;

/** next() を数える乱数 */
class CountingRng extends SeededRng {
  draws = 0;
  override next(): number {
    this.draws++;
    return super.next();
  }
}

/** いつも同じ値を返す乱数（確率の割り算の検査） */
class FixedRng extends SeededRng {
  constructor(private readonly v: number) {
    super(1);
  }
  override next(): number {
    return this.v;
  }
}

/** 北向きに止まった艇と、艇からの方位 brg・距離 r の機 1 機 */
function one(r: number, brg: number, boat: BoatState = { x: 5000, y: 5000, headingDeg: 0, speedMps: 0 }): { boat: BoatState; t: AaTargets } {
  const t = createAaTargets();
  const b = (brg * Math.PI) / 180;
  pushAaTarget(t, boat.x + r * Math.sin(b), boat.y - r * Math.cos(b), AA_SRC_DAWN, 0);
  return { boat, t };
}

/** 1 ステップの状態（押している・撃てる・止まっている） */
function statusAt(r: number, brg: number, g: GunBatteryParams = ELCO80): number {
  const { boat, t } = one(r, brg);
  const st = createAaState(g);
  stepAaFire(st, g, AA, null, null, true, true, 'stop', boat, t, new SeededRng(1), DT);
  return st.status;
}

describe('対空（core/aa-fire）', () => {
  it('乱数: 押していない・機がいない・撃てない（canFire false）・弾倉交換中は 0 回。撃てば 1 発に 1 回だけ', () => {
    const run = (held: boolean, canFire: boolean, targets: boolean, g: GunBatteryParams, reloading: boolean): { draws: number; rounds: number; status: number } => {
      const { boat, t } = one(400, 90);
      if (!targets) t.n = 0;
      const st = createAaState(g);
      const rng = new CountingRng(3);
      const mag = g.magazine ? createMagazine(g.magazine) : null;
      if (mag && reloading) {
        mag.magLeft = 0;
        mag.reloadLeftS = 1;
      }
      for (let k = 0; k < 600; k++) stepAaFire(st, g, AA, mag, g.magazine ?? null, held, canFire, 'stop', boat, t, rng, DT);
      return { draws: rng.draws, rounds: st.rounds, status: st.status };
    };
    expect(run(false, true, true, ELCO80, false)).toEqual({ draws: 0, rounds: 0, status: AA_SAFE });
    expect(run(true, false, true, ELCO80, false)).toEqual({ draws: 0, rounds: 0, status: AA_SAFE });
    expect(run(true, true, false, ELCO80, false)).toEqual({ draws: 0, rounds: 0, status: AA_NO_TARGET });
    const fired = run(true, true, true, ELCO80, false);
    expect(fired.rounds).toBeGreaterThan(0);
    expect(fired.draws).toBe(fired.rounds); // 撃墜しても呼ぶ側が落とさない限り撃ち続ける（ここでは落とさない）
    // 弾倉交換中（借りた・自分の弾倉。交換は呼ぶ側の magazineTick が進めるので、ここではずっと交換中）
    expect(run(true, true, true, T38, true)).toEqual({ draws: 0, rounds: 0, status: AA_RELOAD });
    const t38 = run(true, true, true, T38, false);
    expect([t38.rounds, t38.draws]).toEqual([T38.magazine!.rounds, T38.magazine!.rounds]); // 交換を進めないので 1 弾倉だけ
  });

  it('発射は組の rounds_per_min: 体感の 1 分で Σ rpm ± 1（Elco 80 は 150 + 480）。押した瞬間に一斉発射しない', () => {
    for (const g of [ELCO80]) {
      const { boat, t } = one(400, 90);
      const st = createAaState(g);
      const rng = new SeededRng(5);
      // 押す前に長く待っても負の残りは溜まらない
      for (let k = 0; k < 300; k++) stepAaFire(st, g, AA, null, null, false, true, 'stop', boat, t, rng, DT);
      for (let k = 0; k < 60 * 60; k++) {
        const before = st.rounds;
        stepAaFire(st, g, AA, null, null, true, true, 'stop', boat, t, rng, DT);
        expect(st.rounds - before).toBeLessThanOrEqual(g.groups.length); // 1 ステップに組ごと 1 発まで
      }
      const sum = g.groups.reduce((a, x) => a + x.roundsPerMin, 0);
      expect(Math.abs(st.rounds - sum)).toBeLessThanOrEqual(1);
    }
  });

  it(`射程 ${R} m は端を含む・2 次元。600 m の旋回（run_radius_m）はどの方位でも射程の中（射界の外は射界外）`, () => {
    expect([statusAt(R, 90), statusAt(R + 0.01, 90), statusAt(5000, 90)]).toEqual([AA_FIRING, AA_OUT_OF_RANGE, AA_OUT_OF_RANGE]);
    const run = buildWorldSetup(gameData, 'us_01').airStrike!.runRadiusM;
    for (let brg = 0; brg < 360; brg += 5) {
      const s = statusAt(run, brg);
      expect([AA_FIRING, AA_OUT_OF_ARC], `brg ${brg}`).toContain(s);
    }
  });

  it(`射界: 艇首・艇尾の ±${ELCO80.deadConeDeg}° は撃たない（gun-battery と同じ向き）。最寄りを撃つ。待機・終わりの機と濃さ 0 の機は枠に入らない`, () => {
    expect([statusAt(400, 20), statusAt(400, 35), statusAt(400, 175), statusAt(400, 335), statusAt(400, 270), statusAt(400, 90)]).toEqual([AA_OUT_OF_ARC, AA_FIRING, AA_OUT_OF_ARC, AA_OUT_OF_ARC, AA_FIRING, AA_FIRING]);
    // 東向きの艇なら北・南が舷側
    const east: BoatState = { x: 5000, y: 5000, headingDeg: 90, speedMps: 0 };
    const st = createAaState(ELCO80);
    const a = one(400, 0, east);
    stepAaFire(st, ELCO80, AA, null, null, true, true, 'stop', east, a.t, new SeededRng(1), DT);
    expect(st.status).toBe(AA_FIRING);
    // 2 機: 遠い舷側・近い艇首（死角）・中くらいの舷側 → 中くらい
    const { boat, t } = one(500, 90);
    pushAaTarget(t, boat.x, boat.y - 200, AA_SRC_DAWN, 1); // 真北 200 m（死角）
    pushAaTarget(t, boat.x - 300, boat.y, AA_SRC_DAWN, 2); // 真西 300 m
    const s2 = createAaState(ELCO80);
    stepAaFire(s2, ELCO80, AA, null, null, true, true, 'stop', boat, t, new SeededRng(1), DT);
    expect([s2.status, s2.target, t.idx[s2.target]]).toEqual([AA_FIRING, 2, 2]);
    // 枠の上限
    const full = createAaTargets();
    for (let i = 0; i < AA_MAX_TARGETS + 3; i++) pushAaTarget(full, i, i, AA_SRC_DAWN, i);
    expect(full.n).toBe(AA_MAX_TARGETS);
    // 空襲の機: 待機（始まる前）は入らない。始めた最初のステップの前は濃さ 0（接近の秒 0）で入らず、進めば 4 機
    const p = buildWorldSetup(gameData, 'us_01').airStrike!;
    const s = createAirStrike(p);
    const b: BoatState = { x: p.boundsW / 2, y: p.boundsH / 2, headingDeg: 0, speedMps: 0 };
    const pose: AircraftPose = { dx: 0, dy: 0, headingDeg: 0, alpha: 0 };
    const tg = createAaTargets();
    addStrikePlanes(tg, s, p, b, AA_SRC_DAWN, pose);
    expect(tg.n).toBe(0);
    expect(s.planes.every((pl) => pl.phase === AS_IDLE)).toBe(true);
    startAirStrike(s, p, b);
    addStrikePlanes(tg, s, p, b, AA_SRC_DAWN, pose);
    expect(tg.n).toBe(0);
    const c: AirStrikeCheck = { player: b, playerSinking: false, escort: null, escortAfloat: false, cancel: false };
    stepAirStrike(s, p, c, new SeededRng(19), DT);
    tg.n = 0;
    addStrikePlanes(tg, s, p, b, AA_SRC_DAWN, pose);
    expect(tg.n).toBe(4);
    for (let i = 0; i < 4; i++) {
      strikePose(s, p, i, pose);
      expect([tg.x[i], tg.y[i], tg.idx[i], tg.src[i]]).toEqual([b.x + pose.dx, b.y + pose.dy, i, AA_SRC_DAWN]);
    }
    s.planes[2]!.phase = AS_DONE;
    tg.n = 0;
    addStrikePlanes(tg, s, p, b, AA_SRC_DAWN, pose);
    expect([tg.n, tg.idx[0], tg.idx[1], tg.idx[2]]).toEqual([3, 0, 1, 3]);
  });

  it('確率は速力帯の spread_factor で割る: 乱数 0.003 は止まって（0.5%）撃墜・全速（0.2%）では撃墜しない。撃墜した枠を返し、そのステップは撃ち止める', () => {
    const at = (band: SpeedStep, v: number): { down: number; rounds: number } => {
      const { boat, t } = one(400, 90);
      const st = createAaState(ELCO80);
      const down = stepAaFire(st, ELCO80, AA, null, null, true, true, band, boat, t, new FixedRng(v), DT);
      return { down, rounds: st.rounds };
    };
    const p = AA.hitChancePerRound;
    expect(ELCO80.spreadFactor.full).toBe(2.5);
    const v = (p / ELCO80.spreadFactor.full + p) / 2; // 全速の確率と止まった確率の間
    expect(at('stop', v)).toEqual({ down: 0, rounds: 1 }); // 1 組目で撃墜 → 2 組目は撃たない
    expect(at('silent', v).down).toBe(0);
    expect(at('full', v)).toEqual({ down: -1, rounds: 2 });
    expect(at('cruise', p / ELCO80.spreadFactor.cruise - 1e-9).down).toBe(0);
    expect(at('cruise', p / ELCO80.spreadFactor.cruise).down).toBe(-1); // 未満で撃墜（等しいと外れ）
  });

  it('借りた弾倉（PtGunState の形。jp_01 の T-38）: 15 発で交換がすぐ始まり（reloadLeftS = reload_s）、その次のステップから撃たない', () => {
    const { boat, t } = one(400, 90);
    const st = createAaState(T38);
    const pt = { battery: null, magLeft: T38.magazine!.rounds, reloadLeftS: 0 } as unknown as PtGunState;
    const rng = new CountingRng(9);
    let k = 0;
    for (; k < 60 * 20 && pt.reloadLeftS === 0; k++) stepAaFire(st, T38, AA, pt, T38.magazine!, true, true, 'stop', boat, t, rng, DT);
    expect([st.rounds, rng.draws, pt.magLeft, pt.reloadLeftS]).toEqual([15, 15, 0, T38.magazine!.reloadS]);
    stepAaFire(st, T38, AA, pt, T38.magazine!, true, true, 'stop', boat, t, rng, DT);
    expect([st.rounds, st.status, st.target]).toEqual([15, AA_RELOAD, 0]); // 候補は入る・撃たない
  });

  it(`20 万発（1 発 ${(AA.hitChancePerRound * 100).toFixed(1)}%、止まって）の撃墜の数は期待値 ± 4σ に入る`, () => {
    // 1 ステップに 1 発の組を 20 個（3,600 発/分）。撃墜しても落とさない（その後の組はそのステップに撃たない）
    const g: GunBatteryParams = { ...ELCO80, groups: Array.from({ length: 20 }, (_, i) => ({ ...ELCO80.groups[1]!, id: `g${i}`, roundsPerMin: 3600 })) };
    const { boat, t } = one(400, 90);
    const st = createAaState(g);
    const rng = new SeededRng(2024);
    let downs = 0;
    while (st.rounds < 200000) if (stepAaFire(st, g, AA, null, null, true, true, 'stop', boat, t, rng, DT) >= 0) downs++;
    const n = st.rounds;
    const p = AA.hitChancePerRound;
    const sd = Math.sqrt(n * p * (1 - p));
    expect(Math.abs(downs - n * p)).toBeLessThanOrEqual(4 * sd);
  });

  it('data の値（hit_rate_model.json の anti_aircraft・gun_flash）', () => {
    const a: AntiAircraftParams = AA;
    expect(a).toEqual({ hitChancePerRound: 0.005, rangeM: 650, flashHoldS: 1 });
  });
});
