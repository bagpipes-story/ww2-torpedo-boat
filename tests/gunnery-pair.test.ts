import { describe, expect, it } from 'vitest';
import { gameData, getEnemyRecord } from '../src/config/game-data';
import type { BoatState } from '../src/core/boat-motion';
import { createGunneryState, gunneryParamsFromData, updateGuns, updateIllumination, type GunneryState, type ShellEvents } from '../src/core/gunnery';
import { pointIlluminated, updateGunsPair, type GunTarget, type PairShellEvents } from '../src/core/gunnery-pair';
import { SeededRng } from '../src/core/rng';

const P = gunneryParamsFromData(getEnemyRecord(gameData, 'ijn_destroyer'));
const REAL = 1 / 60;
const DT = REAL * 5;
const SHIP: BoatState = { x: 3000, y: 3000, headingDeg: 90, speedMps: 12 };

function target(x: number, y: number, over: Partial<GunTarget> = {}): GunTarget {
  return { state: { x, y, headingDeg: 0, speedMps: 10 }, halfLengthM: 12, halfBeamM: 3, afloat: true, lit: true, ...over };
}
/** 探照灯を艇の方へ向けて点けた状態（発見から on_delay_s + 掃引） */
function litState(player: BoatState): GunneryState {
  const g = createGunneryState(P, 32, SHIP.headingDeg);
  for (let i = 0; i < 60 * 20; i++) updateIllumination(g, SHIP, player, true, P, REAL);
  return g;
}

describe('駆逐艦の 2 目標の砲撃（core/gunnery-pair、v0.4.4）', () => {
  it('pointIlluminated: 探照灯の扇の中の点は true、扇の外（反対側）は false。星弾の照明の中も true', () => {
    const pl: BoatState = { x: 3000, y: 2000, headingDeg: 0, speedMps: 0 }; // 艦の真北 1,000 m
    const g = litState(pl);
    expect(g.light.on).toBe(true);
    expect(g.light.illuminating).toBe(true);
    expect(pointIlluminated(g, SHIP, 3000, 2000, P)).toBe(true);
    expect(pointIlluminated(g, SHIP, 3020, 2100, P)).toBe(true); // 扇の中（12°）
    expect(pointIlluminated(g, SHIP, 3000, 4000, P)).toBe(false); // 反対側
    expect(pointIlluminated(g, SHIP, 3000, -500, P)).toBe(false); // 射程 3,000 m の外
    g.light.on = false;
    g.star.leftS = 10;
    g.star.x = 1000;
    g.star.y = 1000;
    expect(pointIlluminated(g, SHIP, 1500, 1500, P)).toBe(true);
    expect(pointIlluminated(g, SHIP, 3000, 2000, P)).toBe(false);
  });
  it('目標が 1 つ（僚艇が沈んでいる）なら updateGuns と同じ弾道・同じ乱数の消費（us_02 の再生と同じ計算）', () => {
    const pl: BoatState = { x: 3000, y: 2000, headingDeg: 0, speedMps: 10 };
    const a = litState(pl);
    const b = litState(pl);
    const ra = new SeededRng(7);
    const rb = new SeededRng(7);
    const logA: string[] = [];
    const logB: string[] = [];
    const evA: ShellEvents = { onFire: (i, x, y) => logA.push(`f${i}:${x},${y}`), onImpact: (i, x, y, hit) => logA.push(`i${i}:${x.toFixed(3)},${y.toFixed(3)},${hit}`) };
    const evB: PairShellEvents = { onFire: (i, x, y) => logB.push(`f${i}:${x},${y}`), onImpact: (i, x, y, t) => logB.push(`i${i}:${x.toFixed(3)},${y.toFixed(3)},${t === 0}`) };
    const ta = target(pl.x, pl.y, { state: pl, lit: true });
    const sunk = target(0, 0, { afloat: false, lit: false });
    for (let i = 0; i < 60 * 15; i++) {
      updateGuns(a, SHIP, pl, true, 12, 3, P, ra, REAL, DT, evA);
      ta.lit = b.illuminated;
      updateGunsPair(b, SHIP, ta, sunk, true, P, rb, REAL, DT, evB);
    }
    expect(logA.length).toBeGreaterThan(10);
    expect(logB).toEqual(logA);
    expect(ra.next()).toBe(rb.next());
  });
  it('2 目標: 近い方（僚艇）を狙い、着弾は僚艇の船体で判定して target 1 が出る。自艇が照らされていなくても僚艇が照らされていれば撃つ', () => {
    const pl: BoatState = { x: 3000, y: 1200, headingDeg: 0, speedMps: 0 }; // 1,800 m
    const g = litState(pl);
    const a = target(pl.x, pl.y, { state: pl, lit: false });
    const b = target(3000, 2400, { state: { x: 3000, y: 2400, headingDeg: 0, speedMps: 0 }, lit: true }); // 600 m
    const rng = new SeededRng(3);
    let fires = 0;
    let hitB = 0;
    let hitA = 0;
    let miss = 0;
    const ev: PairShellEvents = {
      onFire: () => fires++,
      onImpact: (_i, _x, _y, t) => {
        if (t === 1) hitB++;
        else if (t === 0) hitA++;
        else miss++;
      },
    };
    for (let i = 0; i < 60 * 30; i++) updateGunsPair(g, SHIP, a, b, true, P, rng, REAL, DT, ev);
    for (let i = 0; i < 60 * 3; i++) updateGunsPair(g, SHIP, a, b, false, P, rng, REAL, DT, ev); // 飛んでいる弾を着弾させる
    expect(fires).toBeGreaterThan(20);
    expect(hitB).toBeGreaterThan(0);
    expect(hitA).toBe(0);
    expect(hitB + miss).toBe(fires);
  });
  it('どちらも照らされていなければ撃たず、負の残りを溜めない（照らした瞬間の一斉射撃にならない）', () => {
    const pl: BoatState = { x: 3000, y: 2000, headingDeg: 0, speedMps: 0 };
    const g = litState(pl);
    const a = target(pl.x, pl.y, { state: pl, lit: false });
    const b = target(3000, 2200, { lit: false });
    let fires = 0;
    const ev: PairShellEvents = { onFire: () => fires++, onImpact: () => {} };
    const rng = new SeededRng(1);
    for (let i = 0; i < 60 * 10; i++) updateGunsPair(g, SHIP, a, b, true, P, rng, REAL, DT, ev);
    expect(fires).toBe(0);
    expect(g.gunCooldownS.every((c) => c === 0)).toBe(true);
    a.lit = true;
    updateGunsPair(g, SHIP, a, b, true, P, rng, REAL, DT, ev);
    expect(fires).toBe(P.guns.length); // 砲台ごとに 1 発ずつ（一斉射撃ではない）
  });
});
