// v0.6.11 S4（spec-v0611-r2 §13 の S4・「S3b の追記」）: 空襲下の退避の世界の部品（systems/world-evac・boat-damage の divert・world-boat・arms-step の隊の砲と evac の枝・
// world-dawn・mission-end）を Phaser なしの素の値で（tests/evac-world-kit）。模擬（core/evac-sim）の mirror でこの世界を歩かせると差 0（ヘッドレスの world-vs-sim EVAC=1 の node 版）、
// 座席の振り替え（決着の前・浮いている艇があれば沈まない・命中スローなし）・決着の後は振り替えない・撃墜は evacDownPlane（passes_max 2 で 2 回目に生き返らない）・
// downsBy は 4 つの数・終わりの evacHold・昼の海・ラッチの「中」。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SEA_LIGHT_STEPS } from '../src/config/dawn-config';
import { gameData } from '../src/config/game-data';
import { AA_SRC_DAWN, AA_SRC_EVAC, AA_SRC_SEAPLANE, AA_SRC_SORTIE } from '../src/core/aa-fire';
import { AS_DONE } from '../src/core/air-strike';
import { EV_DOWN_EVAC } from '../src/core/arms-cue';
import { EF_FLYING } from '../src/core/evac-plan';
import type { EvacMirror, EvacMirrorView } from '../src/core/evac-replay';
import { runEvacTrial } from '../src/core/evac-sim';
import type { EvacPolicy } from '../src/core/evac-sim-policy';
import { evacSettle } from '../src/core/evac-seat';
import { evacLeader } from '../src/core/evac-squadron';
import { SeededRng } from '../src/core/rng';
import { MissionEnd, evacHold, type MissionEndWorld } from '../src/systems/mission-end';
import { WorldDawn } from '../src/systems/world-dawn';
import type { WorldSetup } from '../src/systems/world-setup';
import { evacSimSetup } from '../src/systems/evac-sim-setup';
import { miniWorld, type MiniWorld } from './evac-world-kit';

const TOL = 1e-6;
const SKIP = new Set(['cfg', 'p', 'drawn', 'sq', 'raid', 'flights', 'view', 'port', 'base', 'rng']);

/** 状態を平らに（scripts/headless/wvs-evac-entry と同じ歩き方） */
function flat(roots: [string, unknown][]): { paths: string[]; vals: unknown[] } {
  const paths: string[] = [];
  const vals: unknown[] = [];
  const seen = new Set<unknown>();
  const walk = (o: unknown, path: string, depth: number): void => {
    if (o === null || o === undefined) {
      paths.push(path);
      vals.push(o === null ? 'null' : 'undef');
      return;
    }
    const t = typeof o;
    if (t === 'number' || t === 'boolean' || t === 'string') {
      paths.push(path);
      vals.push(o);
      return;
    }
    if (t === 'function' || depth > 8 || seen.has(o)) return;
    seen.add(o);
    if (ArrayBuffer.isView(o) || Array.isArray(o)) {
      const a = o as unknown as ArrayLike<unknown>;
      for (let i = 0; i < a.length; i++) walk(a[i], `${path}[${i}]`, depth + 1);
      return;
    }
    for (const k of Object.keys(o as object)) if (!SKIP.has(k)) walk((o as Record<string, unknown>)[k], `${path}.${k}`, depth + 1);
  };
  for (const [k, v] of roots) walk(v, k, 0);
  return { paths, vals };
}

const same = (a: unknown, b: unknown): boolean =>
  typeof a === 'number' && typeof b === 'number' ? a === b || (Number.isNaN(a) && Number.isNaN(b)) || Math.abs(a - b) <= TOL : a === b;
const rs = (r: SeededRng): number => (r as unknown as { state: number }).state;

type V = Pick<EvacMirrorView, 'sq' | 'plan' | 'repass' | 'dawn' | 'fuel' | 'aiRng' | 'dodge' | 'dawnRng'> & { seat: unknown; aa: unknown; flags: unknown };

function roots(v: V): [string, unknown][] {
  const fls = v.plan.flights.map((f) => ({ phase: f.phase, outcome: f.outcome, target: f.target, complete: f.complete, startS: f.startS, passes: f.passes, downed: f.downed, sink: f.view.boat.sinking, home: f.view.atHome, center: v.sq.boats.findIndex((b) => b.state === f.view.boat.state), rs: rs(f.rng), st: f.port.state }));
  return [['sq', v.sq], ['seat', v.seat], ['plan', v.plan], ['fls', fls], ['repass', v.repass], ['dawn', v.dawn], ['aa', v.aa], ['fuel', v.fuel], ['ai', rs(v.aiRng)], ['dodge', rs(v.dodge)], ['dawnRng', rs(v.dawnRng)], ['rv', rs(v.plan.reveal)], ['fl', v.flags]];
}

function worldV(w: MiniWorld): V {
  const a = w.arms;
  return {
    sq: w.evac.sq, plan: w.evac.plan, repass: w.evac.air.repass, dawn: w.dawn.strike.state, fuel: w.fuel as never, aiRng: w.evac.aiRng, dodge: w.evac.air.dodge,
    dawnRng: w.dawn.strike.rng,
    seat: { state: w.boat.state, damage: w.damage, params: w.params, band: w.band },
    aa: { st: a.aa, mag: a.mag, downs: a.downs, rounds: a.aaRounds, flashUntilS: a.flashUntilS, rs: rs(a.aaRng!) },
    flags: { t: w.stepTimeS, atHome: w.atHome, latched: w.dawn.reached, sinking: w.boat.sinking, caughtOutside: w.dawn.caughtOutside, extHeldS: w.extinguishHeldS },
  };
}

/** 模擬の台本で小さな世界を歩かせ、ステップごとに比べる（maxS 秒まで） */
function mirrorRun(seed: number, hard: boolean, policy: EvacPolicy, maxS: number): { steps: number; diff: number; first: unknown; switches: number; promotions: number; downs: number; again: number; end: string } {
  const w = miniWorld(seed, hard);
  const s = evacSimSetup(gameData, hard);
  let sv: EvacMirrorView | null = null;
  let diff = 0;
  let steps = 0;
  let first: unknown = null;
  const m: EvacMirror = {
    begin: (v) => {
      sv = v;
    },
    frame: (k, fo) => {
      if (k >= maxS * 60) throw new Error('stop');
      w.input.stickActive = true;
      w.input.headingDeg = fo.headingDeg;
      w.input.speed01 = fo.speed01;
      w.input.gunHeld = fo.gunHeld;
      w.input.extinguishHeld = fo.extHeld;
      w.input.switchTap = fo.switchTap;
      w.frame();
    },
    after: (k) => {
      steps++;
      const v = sv!;
      const a = v.aa;
      const sa = flat(roots({ ...v, seat: { state: v.seat.state, damage: v.seat.damage, params: v.seat.params, band: v.seat.band }, aa: a ? { st: a.st, mag: a.mag, downs: a.downs, rounds: a.rounds, flashUntilS: a.flashUntilS, rs: rs(a.rng) } : null }));
      const wa = flat(roots(worldV(w)));
      const g = w.evac.sq.groups[w.evac.sq.control]!;
      const rec = `sq.groups[${w.evac.sq.control}].boats[${g.leader}].damage`;
      const skip = new Set(w.boat.sinking ? ['seat.state.speedMps', 'seat.damage.hp', 'seat.damage.fireLeftS', `${rec}.hp`, `${rec}.fireLeftS`] : []);
      let bad = wa.paths.length !== sa.paths.length;
      for (let i = 0; !bad && i < wa.vals.length; i++) if (wa.paths[i] !== sa.paths[i] || (!skip.has(wa.paths[i]!) && !same(wa.vals[i], sa.vals[i]))) {
        bad = true;
        if (!first) first = { k, path: wa.paths[i], world: wa.vals[i], sim: sa.vals[i] };
      }
      if (bad) {
        diff++;
        if (!first) first = { k, shape: [wa.paths.length, sa.paths.length] };
      }
    },
  };
  let end = '';
  try {
    end = runEvacTrial(s, policy, seed, null, m).end;
  } catch (e) {
    if (!(e instanceof Error) || e.message !== 'stop') throw e;
    end = 'stop';
  }
  return { steps, diff, first, switches: w.evac.sq.switches, promotions: w.evac.sq.promotions, downs: w.arms.downsBy[AA_SRC_EVAC]!, again: w.evac.air.repass.again, end };
}

describe('小さな世界（世界の部品を mission-world の順に）と模擬（core/evac-sim）の突き合わせ', () => {
  it.each([
    [1, false, 'seq_shoot'],
    [2, true, 'seq_shoot'],
    [1, false, 'stay'],
  ] as const)('seed %i ハード %s %s: 決着（＋ 30 秒）までステップごとに差 0（切替・交代・予告し直しのある夜）', (seed, hard, policy) => {
    const r = mirrorRun(seed, hard, policy, 270);
    expect(r.first).toBeNull();
    expect(r.diff).toBe(0);
    expect(r.steps).toBeGreaterThan(8000);
    expect(r.promotions).toBeGreaterThan(0);
    expect(r.again).toBeGreaterThan(0);
    if (policy === 'seq_shoot') expect(r.switches).toBeGreaterThan(0);
  }, 120_000);
});

describe('座席の振り替え（BoatDamage.divert＝core/evac-seat の evacSinkLeader。r2 H5・M1）', () => {
  const big = { damage: 9999, fireChance: 0, engineDamageChance: 0 };
  it('決着の前に操作中の隊長艇が沈む: 自艇は沈まず命中スローもない・同じ隊の次の艇が座席へ（消火の長押し 0・一斉発射の待ちを捨てる）', () => {
    const w = miniWorld(3);
    w.extinguishHeldS = 0.7;
    const g = w.evac.sq.groups[w.evac.sq.control]!;
    const old = evacLeader(g)!;
    const clears = w.clears;
    const sinking = w.bd.applyHit(big, new SeededRng(1), w.boat.state.x, w.boat.state.y, 'air_strike');
    expect([sinking, w.boat.sinking, w.slowMoLeftS > 0]).toEqual([false, false, false]);
    expect([old.sunk, g.leader, w.evac.sq.promotions, w.extinguishHeldS, w.clears - clears]).toEqual([true, 1, 1, 0, 1]);
    expect([w.damage.hp, w.boat.state.x, w.boat.state.y]).toEqual([g.boats[1]!.damage.hp, g.boats[1]!.state.x, g.boats[1]!.state.y]);
    expect(w.damage.hp).toBeGreaterThan(0);
  });
  it('火災で沈む座席も振り替える（world の stepFn の火災 → sinkBoat → divert）', () => {
    const w = miniWorld(4);
    w.damage.hp = 0.01;
    w.damage.fireLeftS = 30;
    w.frame();
    expect([w.boat.sinking, w.evac.sq.promotions, w.slowMoLeftS]).toEqual([false, 1, 0]);
  });
  it('決着の後は振り替えない（今の任務と同じく沈没で終わる）、ほかに浮いている艇が無い時も', () => {
    const w = miniWorld(5);
    evacSettle(w.evac.sq);
    expect(w.bd.applyHit(big, new SeededRng(1), 0, 0, 'air_strike')).toBe(true);
    expect([w.boat.sinking, w.damage.hp, w.evac.sq.promotions]).toEqual([true, 0, 0]);
    const v = miniWorld(6);
    for (const b of v.evac.sq.boats) if (b.group !== v.evac.sq.control || b.slot !== 0) b.sunk = true;
    expect(v.bd.applyHit(big, new SeededRng(1), 0, 0, 'air_strike')).toBe(true);
    expect(v.boat.sinking).toBe(true);
  });
  it('mission-world: jp_03 の撃破（届くのは撃墜だけ）は爆発だけ（slowMoLeftS を立てない）。ほかの任務は今のまま', () => {
    const s = readFileSync(new URL('../src/systems/mission-world.ts', import.meta.url), 'utf8');
    expect(s).toContain('const onSunk = (x: number, y: number): void => { if (!s.evac) this.slowMoLeftS = s.slowMoSeconds; this.events.onTargetDestroyed(x, y); };');
    expect(s).toContain('this.arms = buildArms(scene, this, data, seed, onSunk);');
  });
});

describe('対空（S3b の追記: 撃墜は core/evac-repass の evacDownPlane）', () => {
  it('passes_max 2: 世界の対空の撃墜が fl.downed を立て、もう一度来る回でもその機は落ちたまま。downsBy は 4 つの数・文は EV_DOWN_EVAC とその編隊の残り', () => {
    const w = miniWorld(1, false, 1);
    expect(w.evac.plan.raid.passesMax).toBe(2);
    expect(w.arms.downsBy.length).toBe(4);
    let fl = -1;
    let k0 = -1;
    for (let i = 0; i < 200 * 60 && fl < 0; i++) {
      w.input.gunHeld = true;
      w.frame();
      if (w.arms.downs > 0) {
        fl = w.evac.lastDownFlight;
        const f = w.evac.plan.flights[fl]!;
        k0 = Math.log2(f.downed);
      }
    }
    expect(fl).toBeGreaterThanOrEqual(0);
    const f = w.evac.plan.flights[fl]!;
    expect([w.arms.downs, w.arms.downsBy[AA_SRC_EVAC], w.arms.evCode, w.arms.evN]).toEqual([1, 1, EV_DOWN_EVAC, f.p.planes - 1]);
    expect([AA_SRC_DAWN, AA_SRC_SORTIE, AA_SRC_SEAPLANE].map((i) => w.arms.downsBy[i])).toEqual([0, 0, 0]);
    expect(f.port.state.planes[k0]!.phase).toBe(AS_DONE);
    w.input.gunHeld = false;
    let second = false;
    for (let i = 0; i < 120 * 60 && !second; i++) {
      w.frame();
      second = f.passes >= 2 && f.phase === EF_FLYING;
    }
    expect(second).toBe(true);
    expect(f.downed & (1 << k0)).not.toBe(0);
    for (let i = 0; i < 60 && f.phase === EF_FLYING; i++) {
      expect(f.port.state.planes[k0]!.phase).toBe(AS_DONE);
      w.frame();
    }
    expect(w.arms.downs).toBe(1);
  }, 60_000);
});

describe('終わり（systems/mission-end の evacHold）と昼の海・ラッチの「中」（systems/world-dawn）', () => {
  const end = (evac: { settled: boolean } | null, over: Partial<MissionEndWorld> = {}): string | null => {
    const e = new MissionEnd({ x: 0, y: 0, radiusM: 70, label: '', callMargin: 1.5, torpedoSettleMaxS: 10, torpedoEndSettleS: 5 } as never, 1.5, false);
    const w: MissionEndWorld = { boat: { sinking: false }, atHome: true, grounded: false, torpedoesRunning: false, torpedoes: { unresolvedCount: 0 }, enemy: { sinkPlaying: false, allOut: false }, fuel: { empty: false }, band: 'stop', stepTimeS: 100, evac, ...over };
    return e.step(w, 9, 140);
  };
  it('決着の前は隠れても（atHome）・燃料が尽きて止まっても終えない。決着の後は帰投。evac の無い任務は今のまま', () => {
    expect(end({ settled: false })).toBeNull();
    expect(end({ settled: false }, { atHome: false, fuel: { empty: true } })).toBeNull();
    expect(end({ settled: true })).toBe('returned');
    expect(end(null)).toBe('returned');
    expect([evacHold({ boat: { sinking: true }, evac: { settled: false } } as MissionEndWorld), evacHold({ boat: { sinking: false } } as MissionEndWorld)]).toEqual([false, false]);
  });
  it('day_start の任務は海を最初から昼の段に（ほかの任務は夜明けの 20 秒前まで段 0＝何もしない）、ラッチの「中」は homeAtLatch', () => {
    const colors: unknown[] = [];
    const scene = { cameras: { main: { setBackgroundColor: (c: unknown) => colors.push(c) } } } as never;
    const view = { stepTimeS: 0, atHome: false, grounded: false, boat: { state: { x: 0, y: 0, headingDeg: 0, speedMps: 0 }, sinking: false }, escort: null, enemy: { withdraw: () => undefined } };
    const day = new WorldDawn(scene, { durationS: 240, dawnAir: { playAs: 'enemy' }, evac: { dayStart: true } } as unknown as WorldSetup, null);
    day.updateVisuals(view);
    expect(colors.length).toBe(1);
    const night = new WorldDawn(scene, { durationS: 240, dawnAir: { playAs: 'enemy' } } as unknown as WorldSetup, null);
    night.updateVisuals(view);
    expect(colors.length).toBe(1);
    expect(SEA_LIGHT_STEPS).toBeGreaterThan(0);
    day.homeAtLatch = () => true;
    view.stepTimeS = 240;
    day.latch(view);
    night.latch(view);
    expect([day.reached, day.caughtOutside, night.reached, night.caughtOutside]).toEqual([true, false, true, true]);
  });
});
