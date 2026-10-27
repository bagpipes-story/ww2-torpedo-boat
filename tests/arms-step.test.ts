// v0.6.8 S3（spec-v068 §1.1 D4・D5・§5.1・§5.3・§6.1）: 兵装の新しい道（systems/arms-step の ArmsStep。Phaser なし）を偽の世界で回す。
// 押さなければ +24・+25 の系列も見つかる距離も変わらない。艦への機銃は艦に効かず（被弾の数えを呼ばない）、撃てば閃光で 1,200 m が 1.0 秒続く。
// 対空は艦艇が先（大発の砲が標的を持てば撃たない）。撃墜は包み（core/air-down）が認めたときだけ数え、順番を飛ばす。jp_01 は米PT の砲の弾倉を使う。
// hold（終わりの待ち）で新しい道は止まる。撃墜の後に離しても・hold しても波は止まらず次の波が来る（レビュー F2）。jp_02 の夜の出撃も終わって門番は哨戒へ戻る。
// 世界の順は systems/world-enemy-step と同じ: stepShips → applyFlash →（敵）→ stepAir、空襲（夜明け）は最後、夜の哨戒は次のステップの最初。
import { describe, expect, it } from 'vitest';
import { gameData, getPrototypeMission } from '../src/config/game-data';
import { getLoadout } from '../src/config/loadout-data';
import { FIXED_STEP_S } from '../src/config/step-config';
import { AA_BUSY, AA_RELOAD, AA_SEED_OFFSET, AA_SRC_DAWN, AA_SRC_SORTIE } from '../src/core/aa-fire';
import { AS_DONE, AS_INBOUND, AS_ORBIT, createAirStrike, startAirStrike, stepAirStrike, type AirStrikeCheck, type AirStrikeParams, type AirStrikeState } from '../src/core/air-strike';
import { airSortieComplete } from '../src/core/air-sortie';
import { CUE_NONE, EV_DOWN_SORTIE, EV_DOWN_STRIKE, SHIP_GUN_SEED_OFFSET, ST_AA, ST_SHIP, createArmsTelemetry } from '../src/core/arms-cue';
import type { BoatState, BoatTelemetry, SpeedStep } from '../src/core/boat-motion';
import { GUN_FIRING, GUN_NO_TARGET } from '../src/core/gun-battery';
import { createInputState, type InputState } from '../src/core/input-state';
import { PA_HUNT, PA_SORTIE } from '../src/core/patrol-air';
import { createPtGun, type PtGunState } from '../src/core/pt-gun';
import { SeededRng } from '../src/core/rng';
import { ArmsStep, type ArmsWorld } from '../src/systems/arms-step';
import { refreshArmsTelemetry } from '../src/systems/arms-telemetry';
import { PatrolAirStep } from '../src/systems/patrol-air-step';
import { buildWorldSetup } from '../src/systems/world-setup';
import { S02, liveFlight } from './patrol-world-kit';

const DT = FIXED_STEP_S;
const BASE_DETECT = 500;
/** 系列の内部の状態（private。tests/gun-battery-generic と同じ読み方） */
const rngState = (r: SeededRng | null): number => (r as unknown as { state: number }).state;
const seed0 = (off: number): number => rngState(new SeededRng((11 + off) >>> 0));

interface FakeShip {
  state: BoatState;
  out: boolean;
  spec: { lengthM: number; beamM: number; hitScale: number };
  takeHits: number;
  takeHit(): boolean;
}
interface W extends ArmsWorld {
  input: InputState;
  boat: { state: BoatState; sinking: boolean };
  band: SpeedStep;
  atHome: boolean;
  grounded: boolean;
  stepTimeS: number;
  detectRangeM: number;
  hunt: { battery: { status: number } } | null;
  pts: { gun: { state: PtGunState } | null } | null;
  destroyers: { ships: FakeShip[] } | null;
  dawn: { reached: boolean; strike: { state: AirStrikeState; p: AirStrikeParams } | null };
  escort: null;
}
interface Rig {
  w: W;
  arms: ArmsStep;
  strike: AirStrikeState | null;
  /** 1 固定ステップ（世界の順）。detect は閃光を当てた後の見つける距離 */
  step(): number;
  run(sec: number, each?: () => void): void;
}

/** 任務 id の艇（砲と対空の値）・海域の真ん中に止まった自艇（北向き）。ship: 東 400 m の駆逐艦（真横＝射界の中）。strike: 夜明けの空襲を始める。p: 1 発の撃墜の確率の上書き */
function rig(id: string, o: { ship?: boolean; strike?: boolean; hunt?: boolean; pt?: boolean; p?: number } = {}): Rig {
  const s = buildWorldSetup(gameData, id);
  const lo = getLoadout(gameData, getPrototypeMission(gameData, id));
  const boat: BoatState = { x: s.mission.bounds.width / 2, y: s.mission.bounds.height / 2, headingDeg: 0, speedMps: 0 };
  const st = o.strike && s.airStrike ? createAirStrike(s.airStrike) : null;
  const ship: FakeShip | null = o.ship
    ? { state: { x: boat.x + 400, y: boat.y, headingDeg: 0, speedMps: 0 }, out: false, spec: s.destroyer!.spec, takeHits: 0, takeHit(): boolean { this.takeHits++; return false; } }
    : null;
  const w: W = {
    input: createInputState(),
    boat: { state: boat, sinking: false },
    band: 'stop',
    atHome: false,
    grounded: false,
    stepTimeS: 0,
    detectRangeM: BASE_DETECT,
    visRange2: 4000 * 4000,
    smoke: null,
    smokeParams: null,
    hunt: o.hunt ? { battery: { status: GUN_NO_TARGET } } : null,
    pts: o.pt ? { gun: { state: createPtGun(lo.gun!, 8) } } : null,
    destroyers: ship ? { ships: [ship] } : null,
    dawn: { reached: st !== null, strike: st && s.airStrike ? { state: st, p: s.airStrike } : null },
    patrol: null,
    seaplane: null,
    escort: null,
  };
  const aa = o.p === undefined ? lo.aa : { ...lo.aa, hitChancePerRound: o.p };
  const arms = new ArmsStep('noship', { gun: lo.gun, aa, seed: 11, world: w });
  const rng = new SeededRng((11 + 19) >>> 0);
  const c: AirStrikeCheck = { player: boat, playerSinking: false, escort: null, escortAfloat: false, cancel: false };
  if (st && s.airStrike) startAirStrike(st, s.airStrike, boat);
  const r: Rig = {
    w,
    arms,
    strike: st,
    step(): number {
      w.stepTimeS += DT;
      w.detectRangeM = BASE_DETECT;
      arms.stepShips(w, w.destroyers, DT * s.timeScale, DT);
      arms.applyFlash(w);
      const det = w.detectRangeM;
      arms.stepAir(w, DT * s.timeScale, DT);
      if (st && s.airStrike) stepAirStrike(st, s.airStrike, c, rng, DT);
      return det;
    },
    run(sec, each): void {
      for (let i = 0; i < Math.round(sec / DT); i++) {
        each?.();
        r.step();
      }
    },
  };
  return r;
}

/** 空襲の機が旋回（600 m＝対空の射程 650 m の中）に入るまで押さずに回す */
function untilOrbit(r: Rig): void {
  for (let i = 0; i < 60 / DT && !r.strike!.planes.some((p) => p.phase === AS_ORBIT); i++) r.step();
  expect(r.strike!.planes.some((p) => p.phase === AS_ORBIT)).toBe(true);
}

describe('押さなければ何も変わらない', () => {
  it('us_01（駆逐艦が 400 m・空襲の機が旋回）: 押さなければ +24・+25 は引かず、見つける距離は元のまま、閃光 0、発数 0、状態の文なし', () => {
    const r = rig('us_01', { ship: true, strike: true });
    expect([rngState(r.arms.aaRng), rngState(r.arms.shipRng)]).toEqual([seed0(AA_SEED_OFFSET), seed0(SHIP_GUN_SEED_OFFSET)]);
    let near = false;
    for (let i = 0; i < 90 / DT; i++) {
      expect(r.step()).toBe(BASE_DETECT);
      if (r.strike!.planes.some((p) => p.phase === AS_ORBIT)) near = true;
    }
    expect(near).toBe(true);
    expect([rngState(r.arms.aaRng), rngState(r.arms.shipRng)]).toEqual([seed0(AA_SEED_OFFSET), seed0(SHIP_GUN_SEED_OFFSET)]);
    expect([r.arms.flashM, r.arms.aaRounds, r.arms.shipRounds, r.arms.downs, r.arms.stCode, r.arms.flashUntilS]).toEqual([0, 0, 0, 0, CUE_NONE, -Infinity]);
  });
  it('+24 は機の来る任務だけ、+25 は駆逐艦の任務だけで作る（新しい道の無い任務は弾倉も持たない）', () => {
    expect(rig('us_01', { ship: true }).arms.aaRng).toBeNull();
    expect(rig('us_01', { strike: true }).arms.shipRng).toBeNull();
    const pt = rig('jp_05', { pt: true });
    expect([pt.arms.aaRng, pt.arms.shipRng, pt.arms.mag]).toEqual([null, null, null]);
    expect(new ArmsStep('pt').aaRng).toBeNull();
  });
});

describe('艦への機銃（us_01 の Elco 77ft）', () => {
  it('東 400 m の駆逐艦へ押し続けると撃ち、当たっても艦の被弾の数えは呼ばない。撃てば見つける距離 1,200 m、最後の 1 発から 1.0 秒で元へ', () => {
    const r = rig('us_01', { ship: true });
    const ship = r.w.destroyers!.ships[0]!;
    r.w.input.gunHeld = true;
    let lastShot = NaN;
    for (let i = 0; i < 3 / DT; i++) {
      const before = r.arms.shipRounds;
      const det = r.step();
      if (r.arms.shipRounds > before) {
        lastShot = r.w.stepTimeS;
        expect(det).toBe(1200);
        expect(r.arms.stCode).toBe(ST_SHIP);
      }
    }
    expect(r.arms.shipRounds).toBeGreaterThan(10);
    expect(r.arms.shipHits).toBeGreaterThan(0);
    expect(ship.takeHits).toBe(0);
    expect(rngState(r.arms.shipRng)).not.toBe(seed0(SHIP_GUN_SEED_OFFSET));
    r.w.input.gunHeld = false;
    const seen: Array<[number, number]> = [];
    for (let i = 0; i < 1.5 / DT; i++) seen.push([r.w.stepTimeS + DT - lastShot, r.step()]);
    for (const [dt, det] of seen) {
      if (dt <= 1.0 - 1e-9) expect(det, `${dt}`).toBe(1200);
      if (dt > 1.0 + DT) expect(det, `${dt}`).toBe(BASE_DETECT);
    }
    expect(r.arms.flashM).toBe(0);
    expect(r.arms.stCode).toBe(CUE_NONE);
  });
  it('hold（終わりの待ち）の後は押しても撃たない。魚雷は撃てない（torpedoUsable false）', () => {
    const r = rig('us_01', { ship: true });
    r.arms.hold();
    r.w.input.gunHeld = true;
    r.run(2);
    expect([r.arms.shipRounds, rngState(r.arms.shipRng), r.arms.flashM]).toEqual([0, seed0(SHIP_GUN_SEED_OFFSET), 0]);
    const t = { aaFiring: false, arms: createArmsTelemetry() } as BoatTelemetry;
    refreshArmsTelemetry(t, { arms: r.arms, torpedoes: { remaining: 4 }, atHome: false, boat: { sinking: false } });
    expect([t.arms.torpedoesAboard, t.arms.torpedoUsable, t.arms.gunFiring]).toEqual([4, false, false]);
  });
});

describe('対空', () => {
  it('us_03: 大発の砲が標的を持つ（GUN_FIRING）間は機へ撃たない（AA_BUSY・+24 を引かない）。標的が無くなれば撃つ', () => {
    const r = rig('us_03', { strike: true, hunt: true });
    untilOrbit(r);
    r.w.hunt!.battery.status = GUN_FIRING;
    r.w.input.gunHeld = true;
    r.run(2);
    expect([r.arms.aaRounds, r.arms.aa!.status, rngState(r.arms.aaRng)]).toEqual([0, AA_BUSY, seed0(AA_SEED_OFFSET)]);
    r.w.hunt!.battery.status = GUN_NO_TARGET;
    r.run(2);
    expect(r.arms.aaRounds).toBeGreaterThan(5);
    expect(rngState(r.arms.aaRng)).not.toBe(seed0(AA_SEED_OFFSET));
    expect(r.arms.stCode).toBe(ST_AA); // 主兵装の砲のある任務は対空の文だけ
    const t = { aaFiring: false, arms: createArmsTelemetry() } as BoatTelemetry;
    refreshArmsTelemetry(t, { arms: r.arms, torpedoes: { remaining: 4 }, atHome: false, boat: { sinking: false } });
    expect([t.aaFiring, t.arms.gunFiring, t.arms.stCode]).toEqual([r.arms.aaFiring, r.arms.firing, ST_AA]);
  });
  it('撃墜: 包みが認めた機だけ数え（夜明けの出どころ）、順番を飛ばし、文は「残り N 機」（N は波の飛んでいる機）', () => {
    const r = rig('us_01', { strike: true, p: 1 });
    untilOrbit(r);
    r.w.input.gunHeld = true;
    for (let i = 0; i < 10 / DT && r.arms.downs === 0; i++) r.step();
    expect(r.arms.downs).toBe(1);
    expect(r.arms.downsBy[AA_SRC_DAWN]).toBe(1);
    const st = r.strike!;
    expect(st.planes.filter((p) => p.phase === AS_DONE).length).toBe(1);
    expect(st.nextRun === st.totalRuns || st.planes[st.nextRun % st.planes.length]!.phase !== AS_DONE).toBe(true);
    expect([r.arms.evCode, r.arms.evN, r.arms.evSeq]).toEqual([EV_DOWN_STRIKE, 3, 1]);
  });
  it('jp_01 は米PT の砲（T-38 の 25mm）の弾倉を使う: 1 発ごとに減り、15 発で交換がすぐ始まり、交換中は撃たない（AA_RELOAD）', () => {
    const r = rig('jp_01', { strike: true, pt: true, p: 1e-9 });
    const mag = r.w.pts!.gun!.state;
    expect(r.arms.mag).toBe(mag);
    untilOrbit(r);
    r.w.input.gunHeld = true;
    for (let i = 0; i < 10 / DT && r.arms.aaRounds < 15; i++) {
      r.step();
      if (r.arms.aaRounds < 15) expect(mag.magLeft).toBe(15 - r.arms.aaRounds);
    }
    expect([r.arms.aaRounds, mag.magLeft, mag.reloadLeftS]).toEqual([15, 0, 3.2]);
    r.run(1);
    expect([r.arms.aaRounds, r.arms.aa!.status, r.arms.reloadN]).toEqual([15, AA_RELOAD, 4]);
  });
});

describe('撃墜の後に離しても波は止まらない（レビュー F2）', () => {
  for (const how of ['release', 'hold'] as const) {
    it(`夜明けの空襲（us_01）: 1 機を落として ${how === 'release' ? '離す' : 'hold（押したまま）'} → 波が終わり次の波が 4 機で来る`, () => {
      const r = rig('us_01', { strike: true, p: 1 });
      untilOrbit(r);
      r.w.input.gunHeld = true;
      for (let i = 0; i < 10 / DT && r.arms.downs === 0; i++) r.step();
      expect(r.arms.downs).toBe(1);
      if (how === 'release') r.w.input.gunHeld = false;
      else r.arms.hold();
      const st = r.strike!;
      for (let i = 0; i < 200 / DT && st.waves < 2; i++) r.step();
      expect(st.waves).toBe(2);
      expect(st.planes.filter((p) => p.phase === AS_INBOUND).length).toBe(4);
      expect(r.arms.downs).toBe(1);
    });
  }
  it('jp_02 の夜の出撃: 1 機を落として離す → 出撃は終わり（airSortieComplete）、門番は哨戒へ戻る', () => {
    const flight = liveFlight(S02.patrolAir!.sortie, 11);
    const pa = new PatrolAirStep(S02.patrolAir!, flight);
    const lo = getLoadout(gameData, getPrototypeMission(gameData, 'jp_02'));
    const boat: BoatState = { x: S02.playerStart.x, y: S02.playerStart.y, headingDeg: 0, speedMps: 0 };
    const w: W & { patrol: PatrolAirStep } = {
      input: createInputState(), boat: { state: boat, sinking: false }, band: 'stop', atHome: false, grounded: false, stepTimeS: 0, detectRangeM: BASE_DETECT, visRange2: 4000 * 4000,
      smoke: null, smokeParams: null, hunt: null, pts: null, destroyers: null, dawn: { reached: false, strike: null }, patrol: pa, seaplane: null, escort: null,
    };
    const arms = new ArmsStep('noship', { gun: lo.gun, aa: { ...lo.aa, hitChancePerRound: 1 }, seed: 11, world: w });
    let downAtSortie = false;
    let backToHunt = false;
    for (let i = 0; i < 400 / DT && !backToHunt; i++) {
      w.stepTimeS += DT;
      pa.step(DT, w);
      if (pa.state.phase === PA_SORTIE && arms.downs === 0) w.input.gunHeld = true;
      if (arms.downs > 0) w.input.gunHeld = false;
      arms.stepShips(w, null, DT * S02.timeScale, DT);
      arms.applyFlash(w);
      const before = arms.downs;
      arms.stepAir(w, DT * S02.timeScale, DT);
      if (arms.downs > before) downAtSortie = pa.state.phase === PA_SORTIE;
      if (arms.downs > 0 && pa.state.phase === PA_HUNT) {
        backToHunt = true;
        expect(airSortieComplete(flight.state)).toBe(true);
      }
    }
    expect([downAtSortie, backToHunt, arms.downs, arms.downsBy[AA_SRC_SORTIE], arms.evCode]).toEqual([true, true, 1, 1, EV_DOWN_SORTIE]);
  });
});
