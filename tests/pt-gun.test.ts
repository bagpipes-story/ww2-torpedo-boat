// T-14 の 13mm 機銃（v0.6.3 実機 1 回目。core/pt-gun・gun-battery の stepGunBatteryOf、spec §D・§H）: 弾倉 30 発を 450 発/分（60 Hz で 8 ステップに 1 発）、
// 撃ち切ると 3.2 秒（体感）の交換（押していれば「弾倉交換」・離しても進む・明けに一斉発射なし）、標的は去っていない・見えている・600 m 以内・艇首尾 ±30° の外の PT、
// 去る・海域の外・沈んだ PT に落ちた弾は外れ（引かない）、乱数 = 2 × 発射 + 生きた PT への命中、撃てない（沈み始め・輪の中）は撃たない、us_03 の砲に弾倉は無い。
import { describe, expect, it } from 'vitest';
import { gameData, getGunBatteryParams, getPrototypeMission } from '../src/config/game-data';
import type { BoatState, SpeedStep } from '../src/core/boat-motion';
import { GUN_FIRING, GUN_NO_TARGET, GUN_OUT_OF_ARC, GUN_OUT_OF_RANGE, GUN_SAFE, type GunBatteryParams, type GunEvents } from '../src/core/gun-battery';
import { PT_ALERT, PT_BREAK, PT_CHASE, PT_FATE_CREW, PT_FATE_HULL, PT_LEAVE, PT_OUT, PT_PASS, PT_PATROL, PT_RUN_IN, PT_SUNK, createPtSection, ptFighting, type PtSection } from '../src/core/pt-boats';
import { PT_GUN_RELOAD, createPtGun, stepPtGun, type PtGunState } from '../src/core/pt-gun';
import { CountingRng, DT, G, P, TS, VIS2, runPtSim } from './pt-kit';

const MAG = G.magazine!;
/** 散らない 13mm（止まった PT の真ん中に落ちる。外れ・命中の判定だけを見る） */
const G0: GunBatteryParams = { ...G, groups: [{ ...G.groups[0]!, dispersionM: 0 }] };

interface Bench {
  q: PtSection;
  s: PtGunState;
  boat: BoatState;
  shotsAt: number[];
  hits: number;
  misses: number;
  rng: CountingRng;
  ev: GunEvents;
}

/** 艇は (2000, 3000) で北向きに止まり、PT0 は真東 distM（艇からの方位 bearing）に止まっている。PT1 は海域の外。stepPtSection は回さない（PT は動かない） */
function bench(distM = 300, bearingDeg = 90, g: GunBatteryParams = G): Bench {
  const q = createPtSection(P, 24);
  const boat: BoatState = { x: 2000, y: 3000, headingDeg: 0, speedMps: 0 };
  const r = (bearingDeg * Math.PI) / 180;
  Object.assign(q.boats[0]!, { x: boat.x + Math.sin(r) * distM, y: boat.y - Math.cos(r) * distM, headingDeg: 0, speedMps: 0, phase: PT_RUN_IN });
  q.boats[1]!.phase = PT_OUT;
  const b: Bench = { q, s: createPtGun(g, 8), boat, shotsAt: [], hits: 0, misses: 0, rng: new CountingRng(21), ev: { onFire: () => {}, onHit: () => void b.hits++, onMiss: () => void b.misses++ } };
  return b;
}

/** k ステップ目（記録用）。held・canFire・速力帯 */
function step(b: Bench, k: number, held: boolean, canFire = true, band: SpeedStep = 'stop', g: GunBatteryParams = G): void {
  const before = b.s.battery.shots;
  stepPtGun(b.s, g, b.boat, band, held, canFire, b.q, P, VIS2, b.rng, DT, DT * TS, b.ev);
  if (b.s.battery.shots > before) b.shotsAt.push(k);
}

describe('T-14 の 13mm（core/pt-gun）', () => {
  it(`弾倉 ${MAG.rounds} 発を ${G.groups[0]!.roundsPerMin} 発/分（8 ステップに 1 発）→ 押したまま ${MAG.reloadS} 秒は「弾倉交換」（PT_GUN_RELOAD）で撃たない → 満ちて同じ間隔で撃つ（一斉発射なし）`, () => {
    const b = bench();
    const status: number[] = [];
    for (let k = 0; k < 60 * 12; k++) {
      step(b, k, true);
      status.push(b.s.battery.status);
    }
    const s = b.shotsAt;
    const gaps = s.slice(1).map((x, i) => x - s[i]!);
    const first = gaps.slice(0, MAG.rounds - 1);
    expect(first.every((g) => g >= 7 && g <= 9)).toBe(true);
    expect(first.reduce((a, g) => a + g, 0) / first.length).toBeCloseTo(8, 0);
    // 30 発目の次は交換の 3.2 秒（192 ステップ ± 1）の後
    const reloadSteps = gaps[MAG.rounds - 1]!;
    expect(Math.abs(reloadSteps - MAG.reloadS * 60)).toBeLessThanOrEqual(1);
    for (let k = s[MAG.rounds - 1]! + 1; k < s[MAG.rounds]!; k++) expect(status[k], `step ${k}`).toBe(PT_GUN_RELOAD);
    // 交換の明けも 8 ステップ間隔（2 弾倉目の 30 発）
    const second = gaps.slice(MAG.rounds, 2 * MAG.rounds - 1);
    expect(second.length).toBe(MAG.rounds - 1);
    expect(second.every((g) => g >= 7 && g <= 9)).toBe(true);
    expect(b.s.battery.shots).toBeGreaterThanOrEqual(2 * MAG.rounds);
    expect(b.s.magLeft).toBeGreaterThanOrEqual(0);
  });

  it('交換は離しても進む（離している間は GUN_SAFE）。押し直すと残りの秒の後に撃つ。撃てない（沈み始め・輪の中）間も進み、撃たない', () => {
    for (const mode of ['release', 'cannot'] as const) {
      const b = bench();
      let k = 0;
      for (; b.shotsAt.length < MAG.rounds; k++) step(b, k, true);
      const last = b.shotsAt[MAG.rounds - 1]!;
      expect([b.s.magLeft, b.s.reloadLeftS]).toEqual([0, MAG.reloadS]);
      for (let j = 0; j < 100; j++, k++) {
        step(b, k, mode === 'cannot', mode !== 'cannot');
        expect(b.s.battery.status).toBe(GUN_SAFE);
      }
      expect(b.shotsAt.length).toBe(MAG.rounds);
      for (; b.shotsAt.length === MAG.rounds && k < last + 400; k++) step(b, k, true);
      expect(Math.abs(b.shotsAt[MAG.rounds]! - last - MAG.reloadS * 60)).toBeLessThanOrEqual(1);
      expect(b.s.magLeft).toBe(MAG.rounds - 1);
    }
    // ずっと離していても満ちる
    const b = bench();
    let k = 0;
    for (; b.shotsAt.length < MAG.rounds; k++) step(b, k, true);
    for (let j = 0; j < MAG.reloadS * 60 + 2; j++, k++) step(b, k, false);
    expect([b.s.magLeft, b.s.reloadLeftS, b.shotsAt.length]).toEqual([MAG.rounds, 0, MAG.rounds]);
  });

  it('標的: 去っていない PT（哨戒〜追撃。ptFighting）だけ、見えていて（視程）・600 m 以内・艇首尾 ±30° の外。理由は 射界外 > 射程外 > いない。最寄りを撃つ', () => {
    const at = (distM: number, brg: number, phase = PT_RUN_IN, vis2 = VIS2): number => {
      const b = bench(distM, brg);
      b.q.boats[0]!.phase = phase;
      stepPtGun(b.s, G, b.boat, 'stop', true, true, b.q, P, vis2, b.rng, DT, DT * TS, b.ev);
      return b.s.battery.status;
    };
    for (const ph of [PT_PATROL, PT_ALERT, PT_RUN_IN, PT_PASS, PT_BREAK, PT_CHASE]) expect(at(300, 90, ph), `phase ${ph}`).toBe(GUN_FIRING);
    for (const ph of [PT_LEAVE, PT_OUT, PT_SUNK]) expect(at(300, 90, ph), `phase ${ph}`).toBe(GUN_NO_TARGET);
    expect([at(G.rangeM - 1, 90), at(G.rangeM + 10, 90), at(950, 90)]).toEqual([GUN_FIRING, GUN_OUT_OF_RANGE, GUN_NO_TARGET]);
    expect([at(300, 20), at(300, 35), at(300, 175), at(300, 360 - 25), at(300, 270)]).toEqual([GUN_OUT_OF_ARC, GUN_FIRING, GUN_OUT_OF_ARC, GUN_OUT_OF_ARC, GUN_FIRING]);
    expect(at(300, 90, PT_RUN_IN, 250 * 250)).toBe(GUN_NO_TARGET); // 艇の視程の外
    // 2 隻なら近い方
    const b = bench(400, 90);
    Object.assign(b.q.boats[1]!, { x: b.boat.x - 250, y: b.boat.y, phase: PT_BREAK });
    stepPtGun(b.s, G, b.boat, 'stop', true, true, b.q, P, VIS2, b.rng, DT, DT * TS, b.ev);
    expect([b.s.battery.status, b.s.battery.target, b.s.battery.targetM]).toEqual([GUN_FIRING, 1, 250]);
    // 撃っている間の距離の上限・視程（F10）: targetM ≤ range_m・targetM² ≤ visRange2
    expect(b.s.battery.targetM ** 2).toBeLessThanOrEqual(Math.min(VIS2, G.rangeM ** 2));
  });

  it('去る・海域の外・沈んだ PT に落ちた弾は外れで、乱数を引かない（1 発 2 回だけ）。生きた PT に落ちれば命中（呼ぶ側が 1 回引く）', () => {
    for (const [phase, hit] of [[PT_RUN_IN, true], [PT_LEAVE, false], [PT_OUT, false], [PT_SUNK, false]] as const) {
      const b = bench(300, 90, G0);
      b.ev.onHit = () => {
        b.hits++;
        b.rng.next(); // 呼ぶ側の hitPt の u
      };
      step(b, 0, true, true, 'stop', G0);
      expect([b.s.battery.shots, b.rng.draws]).toEqual([1, 2]);
      b.q.boats[0]!.phase = phase; // 弾が飛んでいる間に去る・沈む
      for (let k = 1; k < 60; k++) step(b, k, false, true, 'stop', G0);
      expect([b.hits, b.misses, b.rng.draws, b.s.battery.hits], `phase ${phase}`).toEqual(hit ? [1, 0, 3, 1] : [0, 1, 2, 0]);
    }
  });

  it('乱数（seed+20）= 2 × 発射 + 生きた PT への命中（hitPt に 1 回）: 20 夜、見えている PT がいれば押し続ける。押さなければ 0 回。PT の AI の命中・撃退・撃沈は KPI に入る', () => {
    let shots = 0;
    let hits = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const gunRng = new CountingRng((seed + 20) >>> 0);
      const s = runPtSim({
        seed, steps: 60 * 170, night: true, stopAtHome: true, gunRng,
        policy: (s) => {
          s.input.headingDeg = Math.atan2(s.p.bounds.width / 2 - s.boat.x, -(s.p.bounds.height / 2 - s.boat.y)) * (180 / Math.PI);
          s.input.speed01 = s.t < 1 ? 0 : 14 / 31;
        },
        gunHeld: (s) => s.q.boats.some((b) => ptFighting(b.phase) && (b.x - s.boat.x) ** 2 + (b.y - s.boat.y) ** 2 <= VIS2),
      });
      const bat = s.gun!.battery;
      expect(gunRng.draws, `seed ${seed}`).toBe(2 * bat.shots + bat.hits);
      expect(bat.hits).toBe(s.q.gunHits);
      // 結末は 1 隻に 1 つ（Result と同じ今の結末で）。隊の KPI q.retired は撃退された PT の数のまま（撃退されて連射・航過を抜けるところで沈んだ PT も入る。v0.6.3 実機 2 回目の連射で起きる）
      const retiredNow = s.q.boats.filter((b) => b.fate === PT_FATE_CREW || b.fate === PT_FATE_HULL).length;
      expect(retiredNow + s.q.sunk).toBeLessThanOrEqual(s.q.boats.length);
      expect(s.q.retired).toBeGreaterThanOrEqual(retiredNow);
      shots += bat.shots;
      hits += bat.hits;
      const quiet = new CountingRng((seed + 20) >>> 0);
      runPtSim({ seed, steps: 60 * 30, night: true, gunRng: quiet, policy: (s) => void (s.input.speed01 = 0.5), gunHeld: () => false });
      expect(quiet.draws).toBe(0);
    }
    expect(shots).toBeGreaterThan(500);
    expect(hits).toBeGreaterThan(10);
  });

  it(`弾倉は jp_t14 の 13mm（${G.label}・${MAG.rounds} 発・${MAG.reloadS} 秒・組 1 つ）だけ。us_03（us_elco80）の砲に magazine の鍵は無く、弾倉の無い砲では作れない`, () => {
    expect([G.label, MAG.rounds, MAG.reloadS, G.groups.length, G.rangeM, G.effectiveM, G.deadConeDeg, G.flashRevealM]).toEqual(['13mm機銃', 30, 3.2, 1, 600, 300, 30, 1200]);
    const us03 = getGunBatteryParams(gameData, getPrototypeMission(gameData, 'us_03'))!;
    expect('magazine' in us03).toBe(false);
    expect(() => createPtGun(us03, 8)).toThrow(/magazine/);
    const s = createPtGun(G, 8);
    expect([s.magLeft, s.reloadLeftS, s.battery.shells.length, s.battery.status]).toEqual([MAG.rounds, 0, 8, GUN_SAFE]);
  });

  it('確保なし: 弾倉 3 つ分回しても砲の状態・弾の配列と各弾の参照は同じ', () => {
    const b = bench();
    const refs = [b.s, b.s.battery, b.s.battery.shells, ...b.s.battery.shells, b.s.battery.cooldownS];
    for (let k = 0; k < 60 * 25; k++) step(b, k, true);
    const now = [b.s, b.s.battery, b.s.battery.shells, ...b.s.battery.shells, b.s.battery.cooldownS];
    for (let i = 0; i < refs.length; i++) expect(now[i]).toBe(refs[i]);
    expect(b.s.battery.shots).toBeGreaterThanOrEqual(3 * MAG.rounds);
  });
});
