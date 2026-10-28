// 弾倉（v0.6.8。core/magazine。spec-v068 §3.2・§6.1）: 凍結の core/pt-gun.ts:47-60 の弾倉の勘定の写し。jp_05 の T-14 の 13mm（弾倉 30 発・3.2 秒）を本物の stepPtGun で
// 撃ち（止まった PT 1 隻が射界の中）、同じ発数を magazineTick → magazineSpend の写しに渡すと、押す・離すを乱数で 2,000 ステップ混ぜても毎ステップ magLeft・reloadLeftS が同じ。
import { describe, expect, it } from 'vitest';
import type { BoatState } from '../src/core/boat-motion';
import type { GunEvents } from '../src/core/gun-battery';
import { createMagazine, magazineReady, magazineSpend, magazineTick } from '../src/core/magazine';
import { PT_OUT, PT_RUN_IN, createPtSection } from '../src/core/pt-boats';
import { createPtGun, stepPtGun } from '../src/core/pt-gun';
import { SeededRng } from '../src/core/rng';
import { DT, G, P, TS, VIS2 } from './pt-kit';

const MAG = G.magazine!;

describe('弾倉（core/magazine）', () => {
  it('作ると満ちていて交換なし。撃てる', () => {
    const m = createMagazine(MAG);
    expect([m.magLeft, m.reloadLeftS, magazineReady(m)]).toEqual([MAG.rounds, 0, true]);
  });

  it(`撃ち切るとすぐ交換（${MAG.reloadS} 秒）。交換中は撃てない。押していなくても進み、終われば満ちる`, () => {
    const m = createMagazine(MAG);
    magazineSpend(m, MAG, MAG.rounds - 1);
    expect([m.magLeft, m.reloadLeftS]).toEqual([1, 0]);
    magazineSpend(m, MAG, 1);
    expect([m.magLeft, m.reloadLeftS, magazineReady(m)]).toEqual([0, MAG.reloadS, false]);
    let steps = 0;
    while (magazineTick(m, MAG, DT)) steps++;
    expect(Math.abs(steps + 1 - MAG.reloadS * 60)).toBeLessThanOrEqual(1);
    expect([m.magLeft, m.reloadLeftS, magazineReady(m)]).toEqual([MAG.rounds, 0, true]);
    expect(magazineTick(m, MAG, DT)).toBe(false); // 満ちていて交換なしなら何もしない
    expect([m.magLeft, m.reloadLeftS]).toEqual([MAG.rounds, 0]);
  });

  it('本物の stepPtGun（jp_05 の T-14 の 13mm）と同じ: 押す・離すを乱数で混ぜた 2,000 ステップで毎ステップ magLeft・reloadLeftS が一致（撃ったステップは写しも交換中でない）', () => {
    const q = createPtSection(P, 24);
    const boat: BoatState = { x: 2000, y: 3000, headingDeg: 0, speedMps: 0 };
    Object.assign(q.boats[0]!, { x: boat.x + 300, y: boat.y, headingDeg: 0, speedMps: 0, phase: PT_RUN_IN }); // 真東 300 m（射界の中・射程の中）
    q.boats[1]!.phase = PT_OUT;
    const gun = createPtGun(G, 8);
    const rng = new SeededRng(21);
    const pick = new SeededRng(7);
    const ev: GunEvents = { onFire: () => {}, onHit: () => {}, onMiss: () => {} };
    const m = createMagazine(MAG);
    let held = true;
    let shotsTotal = 0;
    let reloads = 0;
    for (let k = 0; k < 2000; k++) {
      if (pick.next() < 0.02) held = !held; // 平均 50 ステップごとに押す・離すを替える
      const before = gun.battery.shots;
      stepPtGun(gun, G, boat, 'stop', held, true, q, P, VIS2, rng, DT, DT * TS, ev);
      const shots = gun.battery.shots - before;
      const reloading = magazineTick(m, MAG, DT);
      if (shots > 0) expect(reloading, `step ${k}`).toBe(false);
      const wasReloading = m.reloadLeftS > 0;
      magazineSpend(m, MAG, shots);
      if (!wasReloading && m.reloadLeftS > 0) reloads++;
      shotsTotal += shots;
      expect([m.magLeft, m.reloadLeftS], `step ${k}`).toEqual([gun.magLeft, gun.reloadLeftS]);
    }
    expect(shotsTotal).toBeGreaterThan(3 * MAG.rounds); // 交換を何度もまたいだ
    expect(reloads).toBeGreaterThanOrEqual(3);
  });
});
