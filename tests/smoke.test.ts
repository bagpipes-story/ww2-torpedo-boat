import { describe, expect, it } from 'vitest';
import boats from '../data/boats.json';
import enemies from '../data/enemies.json';
import type { BoatState } from '../src/core/boat-motion';
import { createGunneryState, gunneryParamsFromData, isEnemyGunneryDataRecord, updateGuns, updateIllumination, type ShellEvents } from '../src/core/gunnery';
import { SeededRng } from '../src/core/rng';
import { activePuffCount, createSmokeState, isBoatSmokeDataRecord, losBlocked, smokeParamsFromData, startSmoke, updateSmoke, type SmokeParams } from '../src/core/smoke';

const raw: unknown = boats.boats.find((b) => b.id === 'us_elco80');
if (!isBoatSmokeDataRecord(raw)) throw new Error('smoke data');
const P = smokeParamsFromData(raw)!;
const REAL = 1 / 60;

describe('煙幕', () => {
  it('data から読める。発生器の無い艇は null', () => {
    expect(P.durationS).toBe(5);
    expect(P.cooldownS).toBe(20);
    expect(P.puffRadiusM).toBe(60);
    expect(smokeParamsFromData({ smoke_generator: false })).toBeNull();
    expect(isBoatSmokeDataRecord({ smoke_generator: true })).toBe(false); // 発生器ありなら smoke.* が必要
    for (const b of boats.boats) expect(isBoatSmokeDataRecord(b), b.id).toBe(true);
    // 0 以下の間隔は updateSmoke の while が止まらないので data の段階で弾く。冷却と長押しは 0 でもよい
    const base = { duration_s: 5, cooldown_s: 20, puff_interval_s: 0.5, puff_radius_m: 60, puff_lifetime_s: 25, extinguish_hold_s: 1 };
    expect(isBoatSmokeDataRecord({ smoke_generator: true, smoke: base })).toBe(true);
    expect(isBoatSmokeDataRecord({ smoke_generator: true, smoke: { ...base, puff_interval_s: 0 } })).toBe(false);
    expect(isBoatSmokeDataRecord({ smoke_generator: true, smoke: { ...base, puff_radius_m: -1 } })).toBe(false);
    expect(isBoatSmokeDataRecord({ smoke_generator: true, smoke: { ...base, puff_lifetime_s: 0 } })).toBe(false);
    expect(isBoatSmokeDataRecord({ smoke_generator: true, smoke: { ...base, duration_s: 0 } })).toBe(false);
    expect(isBoatSmokeDataRecord({ smoke_generator: true, smoke: { ...base, cooldown_s: 0, extinguish_hold_s: 0 } })).toBe(true);
  });
  it('タップで展開、duration の間 interval ごとに艇尾へ煙、冷却中は再展開できない。煙は寿命で消える', () => {
    const s = createSmokeState(32);
    const boat: BoatState = { x: 1000, y: 1000, headingDeg: 0, speedMps: 10 }; // 北向き → 艇尾は南（+y）
    expect(startSmoke(s, P)).toBe(true);
    expect(startSmoke(s, P)).toBe(false); // 展開中
    let placed = 0;
    for (let i = 0; i < Math.round(P.durationS / REAL) + 1; i++) placed += updateSmoke(s, P, boat, 12, REAL);
    const expected = Math.floor(P.durationS / P.puffIntervalS) + 1;
    expect(Math.abs(placed - expected)).toBeLessThanOrEqual(1);
    expect(s.puffs[0]!.x).toBeCloseTo(1000, 6);
    expect(s.puffs[0]!.y).toBeCloseTo(1012, 6);
    expect(s.activeLeftS).toBeLessThanOrEqual(0);
    expect(startSmoke(s, P)).toBe(false); // 冷却中
    // 冷却が明けるまで進める（展開開始から cooldown_s）
    for (let i = 0; i < Math.round((P.cooldownS - P.durationS) / REAL) + 2; i++) updateSmoke(s, P, boat, 12, REAL);
    expect(startSmoke(s, P)).toBe(true);
    // 寿命: 最初の煙は lifetime で消える
    const s2 = createSmokeState(32); // プールが一周して最初の煙が上書きされないよう大きく
    startSmoke(s2, P);
    updateSmoke(s2, P, boat, 12, REAL);
    expect(activePuffCount(s2)).toBe(1);
    for (let i = 0; i < Math.round(P.puffLifetimeS / REAL) + 2; i++) updateSmoke(s2, P, boat, 12, REAL);
    // 後から置かれた煙は残っているが、最初の煙は消えている
    expect(s2.puffs[0]!.active).toBe(false);
  });
  it('視線の遮蔽: 線分が煙の円を通れば true、脇を通れば false', () => {
    const s = createSmokeState(4);
    s.puffs[0]!.active = true;
    s.puffs[0]!.x = 500;
    s.puffs[0]!.y = 0;
    s.puffs[0]!.leftS = 10;
    expect(losBlocked(s, P, 0, 0, 1000, 0)).toBe(true); // 円の中心を通る
    expect(losBlocked(s, P, 0, 59, 1000, 59)).toBe(true); // 半径 60 の内側をかすめる
    expect(losBlocked(s, P, 0, 61, 1000, 61)).toBe(false);
    expect(losBlocked(s, P, 0, 0, 400, 0)).toBe(false); // 煙の手前で終わる線分（端点から 100 m > 60）
    s.puffs[0]!.active = false;
    expect(losBlocked(s, P, 0, 0, 1000, 0)).toBe(false);
  });
  it('煙に遮られている間は探照灯も星弾も照らせない', () => {
    const rawEnemy: unknown = enemies.enemies.find((e) => e.id === 'ijn_destroyer');
    if (!isEnemyGunneryDataRecord(rawEnemy)) throw new Error('enemy');
    const GP = gunneryParamsFromData(rawEnemy);
    const g = createGunneryState(GP, 8, 0);
    const ship: BoatState = { x: 0, y: 0, headingDeg: 0, speedMps: 0 };
    const player: BoatState = { x: 0, y: -1500, headingDeg: 0, speedMps: 0 };
    for (let i = 0; i < 60 * 10; i++) updateIllumination(g, ship, player, true, GP, REAL, false);
    expect(g.illuminated).toBe(true);
    updateIllumination(g, ship, player, true, GP, REAL, true);
    expect(g.illuminated).toBe(false);
    expect(g.light.on).toBe(true); // 光は点いたまま追い続ける
    updateIllumination(g, ship, player, true, GP, REAL, false);
    expect(g.illuminated).toBe(true);
  });
  it('煙に遮られている艇には星弾を撃たない（撃つと発射のステップだけ照らした扱いになり砲が出る）', () => {
    const rawEnemy: unknown = enemies.enemies.find((e) => e.id === 'ijn_destroyer');
    if (!isEnemyGunneryDataRecord(rawEnemy)) throw new Error('enemy');
    const GP = gunneryParamsFromData(rawEnemy);
    const g = createGunneryState(GP, 8, 0);
    const ship: BoatState = { x: 0, y: 0, headingDeg: 0, speedMps: 0 };
    // 探照灯の射程（3,000 m）の外・星弾の射程内で、艦の方へ向かう艇。探照灯が点くまで（on_delay）は遮られていない
    const player: BoatState = { x: 0, y: -3150, headingDeg: 90, speedMps: 20 };
    for (let i = 0; i < 60 * 3; i++) updateIllumination(g, ship, player, true, GP, REAL, false);
    expect(g.light.on).toBe(true);
    expect(g.star.leftS).toBe(0);
    player.headingDeg = 180; // 艦へ向く（closing）
    let fired = 0;
    const events: ShellEvents = { onFire: () => fired++, onImpact: () => {} };
    const rng = new SeededRng(1);
    for (let i = 0; i < 60; i++) {
      updateIllumination(g, ship, player, true, GP, REAL, true);
      updateGuns(g, ship, player, true, 12, 3, GP, rng, REAL, REAL * 5, events);
      expect(g.illuminated).toBe(false);
    }
    expect(g.star.leftS).toBe(0); // 星弾も冷却も消費しない
    expect(fired).toBe(0);
    // 煙が晴れれば撃つ
    updateIllumination(g, ship, player, true, GP, REAL, false);
    expect(g.star.leftS).toBeGreaterThan(0);
    expect(g.illuminated).toBe(true);
  });
});

export const SMOKE_PARAMS_FOR_SIM: SmokeParams = P;
