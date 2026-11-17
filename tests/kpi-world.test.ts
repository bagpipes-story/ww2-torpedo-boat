// v0.8.1 S2（spec-v0810 §3.5 D-K1〜D-K3・§6 の S2「tests/kpi-world」、lead の L36・L37）: 命中率の KPI の的の配線（systems/torpedo-free の stepLauncher が core/hit-rate の kpiTargetAtLaunch を
// 発射の時に呼ぶ。下限は MissionWorld が config/kpi-data から 1 回読む kpiMinTargetSpeedMps＝5 kt）を、本物の TorpedoPool・TorpedoLauncher（tests/torpedo-free-kit）と
// us_06 の小さな世界（tests/anchor-world-kit。卯月と空知丸は本物の systems/destroyer-anchor が止める）で確かめる:
// - 止まった卯月（0 kt）への 1 本は kpiTarget 偽・「止まった艦への魚雷」に数える。動き出して 5 kt 未満の間も偽（止まった艦には数えない）、5 kt 以上は真（今の規則）。空知丸は今のまま偽。
// - 動いている艦（今の任務の駆逐艦の速さ）は今のまま真・夜明けの後は偽。境は 4.99 kt 偽・5.00 kt 真。命中は torpedo-hits が数える（不発を除く・終わり際の当たりも）。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { getKpiMinTargetSpeedMps } from '../src/config/kpi-data';
import type { ShotRecord } from '../src/core/hit-rate';
import type { TorpedoState } from '../src/core/torpedo';
import { ktToMps } from '../src/core/units';
import { torpedoEventsFor } from '../src/systems/torpedo-hits';
import { consumeTorpedoFire, stepLauncher, type FreeTorpedoWorld } from '../src/systems/torpedo-free';
import type { WorldEvents } from '../src/systems/world-events';
import { anchorKit, anchorStep, runUntil } from './anchor-world-kit';
import { code } from './core-rules-kit';
import { DT, fakeGroup, fakeShip, kit } from './torpedo-free-kit';

const MIN = getKpiMinTargetSpeedMps(gameData);
const UZ = 0;
const SM = 1;

/** 1 本撃って（タップ）、撃った魚雷を返す（発射は待ち行列の最初のフレーム） */
function fireOne(w: FreeTorpedoWorld): TorpedoState {
  w.input.fireTap = true;
  consumeTorpedoFire(w);
  const pool = w.torpedoes as unknown as { remaining: number; capacity: number; states: TorpedoState[] };
  for (let i = 0; i < 30; i++) {
    const before = pool.remaining;
    stepLauncher(w, DT);
    if (pool.remaining < before) return pool.states[pool.capacity - before]!;
  }
  throw new Error('撃てなかった');
}

describe('止まった卯月への 1 本（us_06・揺らぎなし）', () => {
  it('data の下限は 5 kt（m/s）。MissionWorld が 1 回読んで stepLauncher に渡す（setup には入れない）', () => {
    expect(MIN).toBeCloseTo(ktToMps(5), 12);
    const mw = code('src/systems/mission-world.ts');
    expect(mw).toContain('this.kpiMinTargetSpeedMps = getKpiMinTargetSpeedMps(data);');
    expect(JSON.stringify(anchorKit().setup)).not.toContain('kpiMin');
  });
  it('止まった卯月（速さ 0）は kpiTarget 偽・止まった艦への魚雷に数える。動き出して 5 kt 未満は偽（止まった艦には数えない）、5 kt 以上は真。空知丸は偽で止まった艦に数える', () => {
    const aw = anchorKit();
    const g = aw.destroyers;
    const k = kit('us_06', g);
    const w: FreeTorpedoWorld = { ...k.w, kpiMinTargetSpeedMps: MIN };
    Object.assign(w.boat.state, { x: 3620, y: 1700, headingDeg: 180 }); // 卯月の北 680 m（最寄りの浮いている艦は卯月）
    expect(g.nearestAfloatIndex(3620, 1700)).toBe(UZ);
    const log = g.anchors!.log;
    const t1 = fireOne(w);
    expect([g.ships[UZ]!.state.speedMps, t1.kpiTarget, log.heldShots]).toEqual([0, false, 1]);
    // 卯月が被雷で気づき、6 秒後に動き出す（速さ 0 から加速）
    g.ships[UZ]!.hitsTaken = 1;
    while (g.ships[UZ]!.anchored) anchorStep(aw);
    anchorStep(aw);
    const slow = g.ships[UZ]!.state.speedMps;
    expect(slow > 0 && slow < MIN).toBe(true);
    Object.assign(w.boat.state, { x: g.ships[UZ]!.state.x, y: g.ships[UZ]!.state.y - 680 });
    const t2 = fireOne(w);
    expect([t2.kpiTarget, log.heldShots]).toEqual([false, 1]); // 動き出した艦は止まった艦ではない（数えない）が、5 kt 未満は KPI の外
    runUntil(aw, aw.stepTimeS + 5);
    expect(g.ships[UZ]!.state.speedMps).toBeGreaterThanOrEqual(MIN);
    Object.assign(w.boat.state, { x: g.ships[UZ]!.state.x, y: g.ships[UZ]!.state.y - 680 });
    const t3 = fireOne(w);
    expect([t3.kpiTarget, log.heldShots]).toEqual([true, 1]);
    // 空知丸（輸送船）: KPI は今のまま偽・止まった艦への魚雷に数える
    Object.assign(w.boat.state, { x: 3000, y: 2400, headingDeg: 180 });
    expect(g.nearestAfloatIndex(3000, 2400)).toBe(SM);
    const t4 = fireOne(w);
    expect([t4.kpiTarget, log.heldShots]).toEqual([false, 2]);
    // 命中（torpedo-hits）: 止まった艦への 1 本の命中だけ数える。不発は数えない・終わり際の当たりは数える
    const hitWorld = { shots: [] as ShotRecord[], hits: 0, slowMoLeftS: 0, setup: { slowMoSeconds: 1 }, destroyers: { ships: [{ takeHit: () => false, playSinking: () => undefined }], allOut: false, allSettled: false, anchors: g.anchors }, launcher: k.w.launcher, dawn: { reached: false, retireHeadingDeg: NaN }, stepTimeS: 0 };
    const te = torpedoEventsFor(hitWorld, { onTorpedoHit: () => undefined, onDestroyerSunk: () => undefined } as unknown as WorldEvents);
    te.onHit(0, 0, 0, t3); // 動いている艦への命中は数えない
    te.onHit(0, 0, 0, t1);
    t4.dud = true;
    te.onHit(0, 0, 0, t4);
    expect(log.heldHits).toBe(1);
    t4.dud = false;
    te.onLateHit(0, 0, 0, t4);
    expect(log.heldHits).toBe(2);
    expect(hitWorld.shots.map((s) => s.kpiTarget)).toEqual([true, false, false, false]); // 記録（ShotRecord）の形と kpiTarget は発射の時の旗のまま
  });
});

describe('動いている艦（今の任務の規則のまま）', () => {
  it('駆逐艦の速さ 25 kt・回避の 8 kt は真、夜明けの後は偽。境は 4.99 kt 偽・5.00 kt 真（下限 0＝今の規則なら止まった艦も真）', () => {
    for (const [kt, dawn, min, want] of [[25, false, MIN, true], [8, false, MIN, true], [25, true, MIN, false], [4.99, false, MIN, false], [5, false, MIN, true], [0, false, 0, true]] as const) {
      const ship = fakeShip(0, 0);
      const k = kit('us_02', fakeGroup([ship]), 5);
      const b = k.w.boat.state;
      Object.assign(ship.state, { x: b.x, y: b.y - 1200, speedMps: ktToMps(kt) });
      const w: FreeTorpedoWorld = { ...k.w, dawn: { reached: dawn }, kpiMinTargetSpeedMps: min };
      expect(fireOne(w).kpiTarget, `${kt} kt dawn ${dawn} min ${min}`).toBe(want);
    }
  });
  it('止まった艦の無い隊（anchors が無い）は止まった艦への魚雷を数えない口を呼ばない（source）', () => {
    const tf = code('src/systems/torpedo-free.ts');
    expect(tf).toContain('if (s && g.anchors) g.anchors.noteLaunch(s, ti);');
    const th = code('src/systems/torpedo-hits.ts');
    expect(th).toContain('if (!dud) g?.anchors?.noteHit(s);');
    expect(th).toContain('if (!s.dud) w.destroyers?.anchors?.noteHit(s);');
  });
});
