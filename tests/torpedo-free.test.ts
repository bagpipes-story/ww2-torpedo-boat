// v0.6.8 S2（spec-v068 §1.1 D3・§1.2・§5.1・§6.1）: どの任務でも魚雷を撃てる。狙える艦（浮いている駆逐艦・輸送船）が無ければ「狙う艦の無い魚雷」:
// 発射の時に決着（resolved）＝記録・走査・終わり際の当たり・終わりの待ち・得点に入らない。乱数は発射管制の +0（1 本 2〜3 回）だけ。
// 本物の TorpedoPool（絵は鎖の偽物）・TorpedoLauncher・systems/torpedo-free・ArmsStep・MissionEnd・torpedoEventsFor で回す（組み立ては tests/torpedo-free-kit）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { CUE_NONE, EV_TORP_BARGE, EV_TORP_NOSHIP, EV_TORP_PT, createArmsTelemetry } from '../src/core/arms-cue';
import type { BoatTelemetry } from '../src/core/boat-motion';
import type { ShotRecord } from '../src/core/hit-rate';
import { createInputState } from '../src/core/input-state';
import type { TorpedoState } from '../src/core/torpedo';
import { refreshArmsTelemetry } from '../src/systems/arms-telemetry';
import { MissionEnd, type MissionEndWorld } from '../src/systems/mission-end';
import { torpedoEventsFor } from '../src/systems/torpedo-hits';
import { NO_TORPEDO_TARGETS, consumeTorpedoFire, stepFreeTorpedoes, stepLauncher } from '../src/systems/torpedo-free';
import type { WorldEvents } from '../src/systems/world-events';
import { buildWorldSetup } from '../src/systems/world-setup';
import { DT, fakeGroup, fakeShip, frame, kit, salvo } from './torpedo-free-kit';

describe('狙う艦の無い魚雷（駆逐艦のいない任務）', () => {
  it('プールは艇が積む本数（us_03 4・jp_01/jp_02/jp_05 2）。setup.torpedoCapacity は主兵装の本数のまま（0）', () => {
    for (const [id, n] of [['us_03', 4], ['jp_01', 2], ['jp_02', 2], ['jp_05', 2]] as const) {
      const k = kit(id);
      expect([k.w.torpedoes.capacity, k.s.torpedoCapacity], id).toEqual([n, 0]);
    }
  });
  it('一斉発射は発射の時に決着: onHit・onLateHit・onMiss は 0 回、決着待ちは 0、待ち行列は空になる。走り切るまで走査しない。数と文は兵装（種類は任務の敵）', () => {
    for (const [id, cue] of [['us_03', EV_TORP_BARGE], ['jp_01', EV_TORP_PT], ['jp_05', EV_TORP_PT], ['jp_02', EV_TORP_NOSHIP]] as const) {
      const k = kit(id);
      const n = k.w.torpedoes.capacity;
      salvo(k);
      let fired = 0;
      let maxQueued = 0;
      for (let i = 0; i < 120 / DT; i++) {
        for (const s of frame(k)) {
          fired++;
          expect([s.resolved, Number.isNaN(s.rangeAtLaunchM), Number.isNaN(s.leadErrDeg), s.kpiTarget], id).toEqual([true, true, true, false]);
        }
        maxQueued = Math.max(maxQueued, k.w.launcher.queued);
        expect(k.w.torpedoes.unresolvedCount, id).toBe(0);
        if (i === Math.round(2 / DT)) expect(k.w.torpedoes.activeCount, `${id} 発射から 2 秒は走っている`).toBe(n);
      }
      expect([fired, k.w.torpedoes.remaining, k.w.launcher.queued, maxQueued], id).toEqual([n, 0, 0, n - 1]);
      expect(k.w.torpedoes.activeCount, `${id} 射程か海域の縁で消える`).toBe(0);
      expect([k.ev.hit, k.ev.late, k.ev.miss], id).toEqual([0, 0, 0]);
      expect([k.arms.blindTorpedoes, k.arms.evCode, k.arms.evSeq], id).toEqual([n, cue, n]);
    }
  });
  it('乱数は発射管制の +0 だけで、1 本ごとの引き方（不発 → 蛇行 → 偏差）と結果は狙える艦がある道と同じ', () => {
    const blind = kit('us_01', null, 7);
    const ship = fakeShip(blind.w.boat.state.x + 400, blind.w.boat.state.y - 2000);
    const live = kit('us_01', fakeGroup([ship]), 7);
    salvo(blind);
    salvo(live);
    const a: number[][] = [];
    const b: number[][] = [];
    for (let i = 0; i < 3 / DT; i++) {
      for (const s of frame(blind)) a.push([blind.rng.draws, Number(s.dud), Number(s.erratic), s.erraticBiasDeg, s.baseHeadingDeg]);
      consumeTorpedoFire(live.w);
      const before = live.w.torpedoes.remaining;
      stepLauncher(live.w, DT);
      if (live.w.torpedoes.remaining < before) {
        const s = live.w.torpedoes.states[live.w.torpedoes.capacity - before]!;
        b.push([live.rng.draws, Number(s.dud), Number(s.erratic), s.erraticBiasDeg, s.baseHeadingDeg]);
        expect([s.resolved, s.kpiTarget, Number.isFinite(s.rangeAtLaunchM)]).toEqual([false, true, true]);
      }
    }
    expect(a.length).toBe(4);
    expect(a).toEqual(b);
    expect(blind.rng.draws).toBeGreaterThanOrEqual(8);
    expect(blind.rng.draws).toBeLessThanOrEqual(12);
    // 撃たなければ引かない
    const idle = kit('us_03');
    for (let i = 0; i < 600; i++) frame(idle);
    expect([idle.rng.draws, idle.arms.blindTorpedoes, idle.arms.evSeq]).toEqual([0, 0, 0]);
  });
});

describe('駆逐艦の任務ですべて出た後', () => {
  /** 沈む船体の窓が開いている間に船体を横切る魚雷: 狙える艦があるときに撃った魚雷は終わり際の当たり、すべて出た後に撃った魚雷は記録も命中も無し */
  it('すべて出た後の魚雷は狙う艦の無い魚雷（沈む船体を横切っても hits・記録は変わらない）。出る前に撃った魚雷は終わり際の当たりに数える（対照）', () => {
    const settleS = 10;
    for (const before of [true, false]) {
      const s0 = buildWorldSetup(gameData, 'us_01');
      const boatX = s0.mission.bounds.width / 2;
      const boatY = s0.mission.bounds.height * 0.75;
      const ship = fakeShip(boatX, boatY - 600);
      const g = fakeGroup([ship]);
      const k = kit('us_01', g);
      const hitWorld = { shots: [] as ShotRecord[], hits: 0, slowMoLeftS: 0, setup: { slowMoSeconds: 1 }, destroyers: { ships: [{ takeHit: () => false, playSinking: () => undefined }], allOut: true, allSettled: false }, launcher: k.w.launcher, dawn: { reached: false, retireHeadingDeg: NaN }, stepTimeS: 0 };
      const events = { onTorpedoHit: () => undefined, onDestroyerSunk: () => undefined } as unknown as WorldEvents;
      const te = torpedoEventsFor(hitWorld, events);
      const sinkNow = (): void => {
        ship.out = true;
        ship.sinking = true;
        ship.sinkStartS = 0;
      };
      if (!before) sinkNow();
      k.w.input.fireTap = true;
      const fired: TorpedoState[] = [];
      for (let i = 0; i < 60 / DT; i++) {
        consumeTorpedoFire(k.w);
        const left = k.w.torpedoes.remaining;
        stepLauncher(k.w, DT);
        if (k.w.torpedoes.remaining < left) {
          fired.push(k.w.torpedoes.states[0]!);
          if (before) sinkNow(); // 撃った直後に沈み始める（すべて出た・窓が開いている）
        }
        hitWorld.stepTimeS = i * DT;
        k.w.torpedoes.step(DT * k.s.timeScale, DT, g.ships, 0, te, hitWorld.stepTimeS, settleS); // destroyer-step と同じ呼び方
      }
      expect(fired.length, String(before)).toBe(1);
      if (before) {
        expect([fired[0]!.resolved, hitWorld.shots.length, hitWorld.hits + Number(fired[0]!.dud)], '出る前に撃った魚雷').toEqual([true, 1, 1]);
      } else {
        expect([fired[0]!.resolved, hitWorld.shots.length, hitWorld.hits, k.arms.blindTorpedoes, k.arms.evCode], 'すべて出た後').toEqual([true, 0, 0, 1, EV_TORP_NOSHIP]);
      }
    }
  });
});

describe('帰投地点の輪の中と終わりの待ち', () => {
  it('輪の中: 発射の要求は捨て、狙える艦が無ければ残りの一斉発射も捨てる（狙える艦があれば v0.6.7 のまま待ち行列は残る）', () => {
    const k = kit('us_03');
    salvo(k);
    frame(k);
    expect(k.w.launcher.queued).toBe(3);
    k.w.atHome = true;
    k.w.input.fireTap = true;
    frame(k);
    expect([k.w.input.fireTap, k.w.launcher.queued, k.w.torpedoes.remaining]).toEqual([false, 0, 3]);
    const ship = fakeShip(0, 0);
    const live = kit('us_01', fakeGroup([ship]));
    salvo(live);
    consumeTorpedoFire(live.w);
    stepLauncher(live.w, DT);
    live.w.atHome = true;
    live.w.input.fireTap = true;
    consumeTorpedoFire(live.w);
    expect([live.w.input.fireTap, live.w.launcher.queued]).toEqual([false, 3]);
  });
  it('狙う艦の無い魚雷だけが走っていれば、輪に入るとすぐ帰投、漂流の窓もすぐ閉じる（MissionEnd）', () => {
    const k = kit('us_03');
    salvo(k);
    for (let i = 0; i < 2 / DT; i++) frame(k);
    expect([k.w.torpedoes.activeCount, k.w.launcher.queued, k.w.torpedoes.unresolvedCount]).toEqual([4, 0, 0]);
    const rp = k.s.mission.returnPoint;
    const view = (over: Partial<{ atHome: boolean; fuelEmpty: boolean }>): MissionEndWorld => ({
      boat: { sinking: false },
      atHome: over.atHome ?? false,
      grounded: false,
      torpedoesRunning: k.w.torpedoes.unresolvedCount > 0 || k.w.launcher.queued > 0, // mission-world の torpedoesRunning と同じ式
      torpedoes: k.w.torpedoes,
      enemy: { sinkPlaying: false, allOut: false },
      fuel: { empty: over.fuelEmpty ?? false },
      band: 'stop',
      stepTimeS: 50,
    });
    expect(new MissionEnd(rp, 1.5, false).step(view({ atHome: true }), 0, 60)).toBe('returned');
    expect(new MissionEnd(rp, 1.5, false).step(view({ atHome: true }), 0, 0)).toBe('returned');
    expect(new MissionEnd(rp, 1.5, false).step(view({ fuelEmpty: true }), 1.5, 60)).toBe('adrift');
  });
  it('一斉発射の途中で輪に入っても待たない（輪の中で残りを捨てる）', () => {
    const k = kit('us_03');
    salvo(k);
    frame(k);
    k.w.atHome = true;
    frame(k);
    expect(k.w.torpedoes.unresolvedCount > 0 || k.w.launcher.queued > 0).toBe(false);
  });
  it('MissionEnd.holdFire は窓が開いたら兵装も止める（hold）。arms の無い世界（v0.6.7 の偽物）は今まで通り', () => {
    const k = kit('us_03');
    const e = new MissionEnd(k.s.mission.returnPoint, 1.5, false);
    // 決着していない魚雷が走っている（狙える艦へ撃った魚雷。漂流の窓は開いたまま待つ）
    const w: MissionEndWorld = { boat: { sinking: false }, atHome: false, grounded: false, torpedoesRunning: true, torpedoes: { unresolvedCount: 1 }, enemy: { sinkPlaying: false, allOut: false }, fuel: { empty: true }, band: 'stop', stepTimeS: 10 };
    const hw = { input: k.w.input, launcher: k.w.launcher, arms: k.arms };
    e.holdFire(hw);
    expect(k.arms.endHold).toBe(false);
    expect(e.step(w, 1.4, 60)).toBeNull();
    e.holdFire(hw);
    expect(k.arms.endHold).toBe(false);
    expect(e.step(w, 1.5, 60)).toBeNull();
    e.holdFire(hw);
    expect(k.arms.endHold).toBe(true);
    e.holdFire({ input: createInputState(), launcher: { clearQueue: () => undefined } });
  });
});

describe('兵装のテレメトリ（魚雷の部分）', () => {
  const tele = (): BoatTelemetry => ({ aaFiring: false, arms: createArmsTelemetry() }) as BoatTelemetry;
  it('積んでいる本数・撃てる（輪の外・沈み始めていない・終わりの待ちでない）・出来事の文の番号と通し番号', () => {
    const k = kit('jp_01');
    const t = tele();
    const w = { arms: k.arms, torpedoes: k.w.torpedoes, atHome: false, boat: { sinking: false } };
    refreshArmsTelemetry(t, w);
    expect([t.arms.torpedoesAboard, t.arms.torpedoUsable, t.arms.evCode, t.arms.evSeq, t.aaFiring]).toEqual([2, true, CUE_NONE, 0, false]);
    k.w.input.fireTap = true;
    frame(k);
    refreshArmsTelemetry(t, w);
    expect([t.arms.torpedoesAboard, t.arms.torpedoUsable, t.arms.evCode, t.arms.evSeq]).toEqual([1, true, EV_TORP_PT, 1]);
    refreshArmsTelemetry(t, { ...w, atHome: true });
    expect(t.arms.torpedoUsable).toBe(false);
    refreshArmsTelemetry(t, { ...w, boat: { sinking: true } });
    expect(t.arms.torpedoUsable).toBe(false);
    k.arms.hold();
    refreshArmsTelemetry(t, w);
    expect(t.arms.torpedoUsable).toBe(false);
    refreshArmsTelemetry(t, { ...w, arms: null });
    expect([t.arms.torpedoesAboard, t.arms.torpedoUsable]).toEqual([1, true]);
  });
  it('出発時のテレメトリは aaFiring false・arms は初期値（systems/telemetry-create）。2 行目の世界の順は夜明けの後に兵装', () => {
    const src = readFileSync(new URL('../src/systems/telemetry-create.ts', import.meta.url), 'utf8');
    expect(src).toContain('aaFiring: false,');
    expect(src).toContain('arms: createArmsTelemetry(),');
    expect(createArmsTelemetry()).toEqual({ torpedoesAboard: 0, torpedoUsable: false, evCode: CUE_NONE, evN: 0, evSeq: 0, stCode: CUE_NONE, stN: 0, gunFiring: false, reloadN: 0 });
    const mt = readFileSync(new URL('../src/systems/mission-telemetry.ts', import.meta.url), 'utf8');
    expect(mt.indexOf('refreshArmsTelemetry(t, w)')).toBeGreaterThan(mt.indexOf('refreshDawnTelemetry(t, w, scratchPose)'));
  });
});

describe('ソースの pin（v0.6.7 の道を変えない）', () => {
  const strip = (p: string): string => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8').replace(/\/\/[^\n]*/g, '');
  it('world-input: 発射 → 煙幕と消火 → 発射管制 → 初発射時の燃料（主兵装の魚雷だけ・狙う艦の無い魚雷は除く）', () => {
    const s = strip('systems/world-input.ts');
    const fn = s.slice(s.indexOf('export function consumeFrameInput'));
    const order = ['consumeIdentifyInput(w.input, w.friendly);', 'if (w.boat.sinking) return;', 'consumeTorpedoFire(w);', 'consumeSmokeInput(', 'stepLauncher(w, realDt);', 'w.fuelAtFirstLaunchGal = w.fuel.gal;'].map((p) => fn.indexOf(p));
    expect(order.every((i, n) => i >= 0 && (n === 0 || i > order[n - 1]!)), String(order)).toBe(true);
    expect(fn).toContain("(w.setup.mainWeapon === 'torpedo' && w.torpedoes.remaining + (w.arms ? w.arms.blindTorpedoes : 0) < w.torpedoes.capacity) || (w.hunt !== null && w.hunt.battery.shots > 0)");
  });
  it('torpedo-free: 狙える艦がある道は v0.6.7 の文のまま、無ければ null の目標で撃って決着させる。world-enemy-step は駆逐艦のいない任務だけ魚雷を進める', () => {
    const s = strip('systems/torpedo-free.ts');
    expect(s).toContain('w.launcher.update(realDt, boat, g.ships[ti < 0 ? 0 : ti]!.state, ti >= 0 && ti < g.destroyerCount && !w.dawn.reached);');
    expect(s).toContain('const s = w.launcher.update(realDt, boat, null, false);');
    expect(s).toContain('s.resolved = true;');
    expect(s).toContain('w.torpedoes.step(dt, feelDt, NO_TORPEDO_TARGETS, 0, w.torpedoEvents);');
    expect(NO_TORPEDO_TARGETS.length).toBe(0);
    expect(Object.isFrozen(NO_TORPEDO_TARGETS)).toBe(true);
    const e = strip('systems/world-enemy-step.ts');
    const at = ['if (g) stepDestroyerSide(', 'w.hunt.step(dt, feelDt, w, w.input.gunHeld);', 'if (!g) stepFreeTorpedoes(w, dt, feelDt);', 'w.pts?.step(dt, feelDt, w, w.input.gunHeld);', 'w.engine?.step(w, feelDt);'].map((p) => e.indexOf(p));
    expect(at.every((i, n) => i >= 0 && (n === 0 || i > at[n - 1]!)), String(at)).toBe(true);
  });
  it('mission-world: プールは艇が積む本数・兵装は最後に作る（乱数の系列を作らない）', () => {
    const s = strip('systems/mission-world.ts');
    expect(s).toContain('this.torpedoes = new TorpedoPool(scene, s.torpedoParams, getBoatTorpedoCount(data, mission.playerBoatId), mission.bounds);');
    expect(s.indexOf('this.arms = buildArms(scene, this, data, seed, onSunk);')).toBeGreaterThan(s.indexOf('this.engine = s.engine ?'));
    expect(strip('systems/world-arms.ts')).not.toContain('SeededRng');
  });
});
