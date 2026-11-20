// v0.8.2 S2（spec-v0820 §4.7 D-K1・§8 の S2「kpi-us05」、lead の L19・L26）: us_05 の命中率の KPI の的（systems/torpedo-free の 1 か所＝隊の kpiAt）を、本物の DestroyerGroup の
// 列（tests/column-world-kit）と本物の TorpedoPool・TorpedoLauncher（tests/torpedo-free-kit）で確かめる:
// - 戦艦（山城・扶桑）・重巡（最上）を狙った 1 本は kpiTarget 偽（通算の命中率に入れない）。駆逐艦（満潮・時雨）を狙った 1 本は今の規則（夜明けの前・目標の速さ ≥ 5 kt なら真・夜明けの後は偽）。
// - 記録（torpedo-hits の ShotRecord）の kpiTarget も同じ。kpiAt は kits の旗（駆逐艦の記録だけ）と同じ値。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { getKpiMinTargetSpeedMps } from '../src/config/kpi-data';
import type { ShotRecord } from '../src/core/hit-rate';
import { createTorpedoState, type TorpedoState } from '../src/core/torpedo';
import { torpedoEventsFor, type TorpedoHitWorld } from '../src/systems/torpedo-hits';
import { consumeTorpedoFire, stepLauncher, type FreeTorpedoWorld, type TorpedoAimGroup } from '../src/systems/torpedo-free';
import type { WorldEvents } from '../src/systems/world-events';
import { colRun, colWorld, type ColWorld } from './column-world-kit';
import { DT, kit } from './torpedo-free-kit';

const MIN = getKpiMinTargetSpeedMps(gameData);

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

/** 列の 7 隻がみな海域の中にいる 110 秒の世界 */
function column(): ColWorld {
  const cw = colWorld();
  colRun(cw, 110);
  expect(cw.destroyers.ships.every((d) => !d.out)).toBe(true);
  return cw;
}

/** 艦 i の道の外側（北の道は北・南の道は南へ）300 m に自艇を置いて 1 本（最寄りが艦 i であることを確かめる） */
function shotAt(cw: ColWorld, i: number, dawn = false): TorpedoState {
  const k = kit('us_05', cw.destroyers as unknown as TorpedoAimGroup);
  const d = cw.destroyers.ships[i]!.state;
  const side = d.y >= 2600 ? 1 : -1;
  k.w.boat.state.x = d.x;
  k.w.boat.state.y = d.y + side * 300;
  k.w.boat.state.headingDeg = side > 0 ? 0 : 180;
  expect(cw.destroyers.nearestAfloatIndex(k.w.boat.state.x, k.w.boat.state.y), `${i}`).toBe(i);
  return fireOne({ ...k.w, dawn: { reached: dawn }, kpiMinTargetSpeedMps: MIN });
}

describe('us_05 の KPI の的（D-K1）', () => {
  it('kpiAt は kits の旗（駆逐艦の記録だけ）: 満潮・朝雲・山雲・時雨は真、最上・山城・扶桑は偽', () => {
    const cw = column();
    const kits = cw.setup.transit!.column!;
    expect(kits.map((x, i) => [x.nameJa, cw.destroyers.kpiAt(i)])).toEqual([['満潮', true], ['朝雲', true], ['山雲', true], ['最上', false], ['時雨', true], ['山城', false], ['扶桑', false]]);
    kits.forEach((x, i) => expect(cw.destroyers.kpiAt(i)).toBe(x.kpi && x.shipClass === 'destroyer'));
  });
  it('戦艦・重巡を狙った 1 本は偽・駆逐艦は真（列の 18 kt ≥ 5 kt）。夜明けの後はどれも偽', () => {
    const cw = column();
    const got = [0, 3, 4, 5, 6].map((i) => [i, shotAt(cw, i).kpiTarget]);
    expect(got).toEqual([[0, true], [3, false], [4, true], [5, false], [6, false]]);
    for (const i of [0, 4]) expect(cw.destroyers.ships[i]!.state.speedMps).toBeGreaterThanOrEqual(MIN);
    expect([0, 5].map((i) => shotAt(cw, i, true).kpiTarget)).toEqual([false, false]);
  });
  it('記録（torpedo-hits の ShotRecord）の kpiTarget も同じ（命中・外れとも）', () => {
    const shots: ShotRecord[] = [];
    const w = { shots, hits: 0, slowMoLeftS: 0, setup: { slowMoSeconds: 1 }, destroyers: null, launcher: { clearQueue: () => undefined }, dawn: { reached: false, retireHeadingDeg: NaN }, stepTimeS: 0 };
    const ev = torpedoEventsFor(w as TorpedoHitWorld, { onTorpedoHit: () => undefined, onDestroyerSunk: () => undefined } as unknown as WorldEvents);
    const cw = column();
    for (const i of [0, 5]) ev.onMiss({ ...createTorpedoState(), kpiTarget: shotAt(cw, i).kpiTarget, rangeAtLaunchM: 300 });
    expect(shots.map((s) => s.kpiTarget)).toEqual([true, false]);
  });
});
