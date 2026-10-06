import { describe, expect, it } from 'vitest';
import boats from '../data/boats.json';
import enemies from '../data/enemies.json';
import type { BoatState } from '../src/core/boat-motion';
import {
  applyShellHit,
  createDamageState,
  createGunneryState,
  damageParamsFromData,
  gunneryParamsFromData,
  isBoatDamageDataRecord,
  isEnemyGunneryDataRecord,
  pointNearBoat,
  stepDamage,
  updateGuns,
  updateIllumination,
  type GunneryParams,
  type HitOutcome,
  type ShellEvents,
} from '../src/core/gunnery';
import { SeededRng } from '../src/core/rng';
import { interceptHeadingDeg, interceptTimeS } from '../src/core/torpedo-solver';
import { ktToMps } from '../src/core/units';

const rawEnemy: unknown = enemies.enemies.find((e) => e.id === 'ijn_destroyer');
if (!isEnemyGunneryDataRecord(rawEnemy)) throw new Error('enemy gunnery');
const GP: GunneryParams = gunneryParamsFromData(rawEnemy);
const rawBoat: unknown = boats.boats.find((b) => b.id === 'us_elco80');
if (!isBoatDamageDataRecord(rawBoat)) throw new Error('boat damage');
const DP = damageParamsFromData(rawBoat);
const TS = 5; // time_scale
const REAL = 1 / 60;
const GAME = REAL * TS;
const ship = (): BoatState => ({ x: 0, y: 0, headingDeg: 90, speedMps: ktToMps(25) });
const noEvents: ShellEvents = { onFire: () => {}, onImpact: () => {} };

describe('interceptTimeS', () => {
  it('静止目標なら 距離/速さ。動く目標では interceptHeadingDeg と同じ会合点になる', () => {
    expect(interceptTimeS(0, 0, 100, 300, 400, 0, 0)).toBeCloseTo(5, 9);
    const t = interceptTimeS(0, 0, 400, 2000, 0, 0, 20)!;
    const h = interceptHeadingDeg(0, 0, 400, 2000, 0, 0, 20)!;
    const hx = Math.sin((h * Math.PI) / 180) * 400 * t;
    const hy = -Math.cos((h * Math.PI) / 180) * 400 * t;
    expect(hx).toBeCloseTo(2000, 6);
    expect(hy).toBeCloseTo(20 * t, 6);
    // 目標が弾より速く遠ざかれば解なし
    expect(interceptTimeS(0, 0, 10, 1000, 0, 50, 0)).toBeNull();
  });
});

describe('探照灯', () => {
  it('発見から on_delay_s 後に点灯し、艦首方向から sweep_deg_s で艇へ振り、cone に入れば照射', () => {
    const g = createGunneryState(GP, 8, 90);
    const s = ship();
    const player: BoatState = { x: 0, y: -2000, headingDeg: 0, speedMps: 0 }; // 真北 2,000 m（射程 3,000 内）
    let t = 0;
    while (t < GP.searchlight.onDelayS - 0.01) {
      updateIllumination(g, s, player, true, GP, REAL);
      t += REAL;
      expect(g.light.on).toBe(false);
    }
    updateIllumination(g, s, player, true, GP, REAL);
    updateIllumination(g, s, player, true, GP, REAL);
    expect(g.light.on).toBe(true);
    expect(g.light.illuminating).toBe(false); // まだ艦首（90°）を向いている
    // 90° 振るのに 90/sweep 秒
    const sweepS = 90 / GP.searchlight.sweepDegS;
    for (let i = 0; i < Math.round(sweepS / REAL) + 2; i++) updateIllumination(g, s, player, true, GP, REAL);
    expect(g.light.bearingDeg).toBeCloseTo(0, 1);
    expect(g.light.illuminating).toBe(true);
    expect(g.illuminated).toBe(true);
    // 見失えば消える
    updateIllumination(g, s, player, false, GP, REAL);
    expect(g.light.on).toBe(false);
    expect(g.illuminated).toBe(false);
  });
  it('射程外は照らさない', () => {
    const g = createGunneryState(GP, 8, 0);
    const s = ship();
    const far: BoatState = { x: 0, y: -(GP.searchlight.rangeM + 100), headingDeg: 0, speedMps: 0 };
    for (let i = 0; i < 60 * 20; i++) updateIllumination(g, s, far, true, GP, REAL);
    expect(g.light.on).toBe(true);
    expect(g.light.illuminating).toBe(false);
  });
});

describe('星弾', () => {
  it('発見中で探照灯の射程外なら艇の位置へ撃ち、照明半径の中にいる間は照射。持続後に消え、冷却中は撃たない', () => {
    const g = createGunneryState(GP, 8, 0);
    const s = ship();
    const player: BoatState = { x: 4000, y: 0, headingDeg: 270, speedMps: 5 }; // 4,000 m: 探照灯 3,000 外、星弾 6,000 内。西向き＝艦へ近づく
    updateIllumination(g, s, player, true, GP, REAL);
    expect(g.star.leftS).toBe(0); // 点灯遅れの間は撃たない
    for (let i = 0; i < Math.round(GP.searchlight.onDelayS / REAL) + 2; i++) updateIllumination(g, s, player, true, GP, REAL);
    expect(g.star.leftS).toBeGreaterThan(0);
    expect(g.star.x).toBe(4000);
    expect(g.illuminated).toBe(true);
    // 照明の外へ出れば照らされない
    player.x = 4000 + GP.starshell.illumRadiusM + 10;
    updateIllumination(g, s, player, true, GP, REAL);
    expect(g.star.illuminating).toBe(false);
    // 持続が切れるまで進める → 消灯、冷却中は再発射しない
    for (let i = 0; i < Math.round(GP.starshell.durationS / REAL) + 2; i++) updateIllumination(g, s, player, true, GP, REAL);
    expect(g.star.leftS).toBeLessThanOrEqual(0);
    expect(g.star.cooldownLeftS).toBeGreaterThan(0);
    const before = g.star.cooldownLeftS;
    updateIllumination(g, s, player, true, GP, REAL);
    expect(g.star.leftS).toBeLessThanOrEqual(0);
    expect(g.star.cooldownLeftS).toBeLessThan(before);
  });
  it('遠ざかる艇には撃たない（逃げる艇への追い打ちにしない）', () => {
    const g = createGunneryState(GP, 8, 0);
    const fleeing: BoatState = { x: 4000, y: 0, headingDeg: 90, speedMps: 20 }; // 東向き＝艦から離れる
    for (let i = 0; i < 60 * 5; i++) updateIllumination(g, ship(), fleeing, true, GP, REAL);
    expect(g.light.on).toBe(true);
    expect(g.star.leftS).toBe(0);
    const stopped: BoatState = { x: 4000, y: 0, headingDeg: 90, speedMps: 0 }; // 止まっている艇にも撃たない（距離が開いていないが閉じてもいない）
    const g2 = createGunneryState(GP, 8, 0);
    for (let i = 0; i < 60 * 5; i++) updateIllumination(g2, ship(), stopped, true, GP, REAL);
    expect(g2.star.leftS).toBe(0);
  });
  it('探照灯の射程内では撃たない', () => {
    const g = createGunneryState(GP, 8, 0);
    const player: BoatState = { x: 2000, y: 0, headingDeg: 0, speedMps: 0 };
    for (let i = 0; i < 60 * 5; i++) updateIllumination(g, ship(), player, true, GP, REAL);
    expect(g.star.leftS).toBe(0);
  });
});

describe('砲撃', () => {
  const lit = (g: ReturnType<typeof createGunneryState>): void => {
    g.illuminated = true;
  };
  it('照らされていなければ撃たない。照らされていれば砲台ごとに 60/(rof×count) 実秒間隔で撃つ', () => {
    const g = createGunneryState(GP, 48, 0);
    const s = ship();
    const player: BoatState = { x: 1000, y: 0, headingDeg: 0, speedMps: 0 };
    const rng = new SeededRng(1);
    let fired = 0;
    const ev: ShellEvents = { onFire: () => fired++, onImpact: () => {} };
    for (let i = 0; i < 120; i++) updateGuns(g, s, player, true, 12.2, 3.15, GP, rng, REAL, GAME, ev);
    expect(fired).toBe(0);
    lit(g);
    for (let i = 0; i < g.gunCooldownS.length; i++) g.gunCooldownS[i] = 0; // 暗い間に溜まった負の残りを捨てる（実装側も撃たない間は溜めない）
    fired = 0;
    const seconds = 10;
    for (let i = 0; i < seconds * 60; i++) {
      g.illuminated = true;
      updateGuns(g, s, player, true, 12.2, 3.15, GP, rng, REAL, GAME, ev);
    }
    // 期待発射数 = Σ 砲台ごと seconds / 間隔（最初の 1 発を含む）
    let expected = 0;
    for (const gun of GP.guns) {
      if (1000 > gun.effectiveM) continue;
      const interval = 60 / (gun.roundsPerMinPerGun * gun.count);
      expected += Math.floor(seconds / interval) + 1;
    }
    expect(Math.abs(fired - expected)).toBeLessThanOrEqual(GP.guns.length);
  });
  it('有効射程の外の砲台は撃たない', () => {
    const g = createGunneryState(GP, 48, 0);
    const player: BoatState = { x: 3000, y: 0, headingDeg: 0, speedMps: 0 }; // 25mm（1,200 m）は届かない
    const firedGuns = new Set<number>();
    const ev: ShellEvents = { onFire: (i) => firedGuns.add(i), onImpact: () => {} };
    for (let i = 0; i < 60 * 5; i++) {
      g.illuminated = true;
      updateGuns(g, ship(), player, true, 12.2, 3.15, GP, new SeededRng(2), REAL, GAME, ev);
    }
    expect(firedGuns.has(0)).toBe(true);
    expect(firedGuns.has(1)).toBe(false);
  });
  it('ばらつき 0 なら静止目標に飛行時間どおりに着弾して命中。艇が動けば見越し点に落ちる', () => {
    const p: GunneryParams = { ...GP, guns: GP.guns.map((gun) => ({ ...gun, dispersionM: 0 })) };
    const g = createGunneryState(p, 48, 0);
    const s = ship();
    const player: BoatState = { x: 2000, y: 0, headingDeg: 0, speedMps: 0 };
    const impacts: Array<{ x: number; y: number; hit: boolean; gun: number }> = [];
    const ev: ShellEvents = { onFire: () => {}, onImpact: (gun, x, y, hit) => impacts.push({ x, y, hit, gun }) };
    g.illuminated = true;
    updateGuns(g, s, player, true, 12.2, 3.15, p, new SeededRng(3), REAL, GAME, ev); // 主砲 1 発
    const shell = g.shells.find((x) => x.active)!;
    const flightS = 2000 / p.guns[0]!.shellSpeedMps;
    expect(shell.leftS + GAME).toBeCloseTo(flightS, 6); // 発射した呼び出しの中で 1 ステップ進んでいる
    let steps = 0;
    while (impacts.length === 0 && steps < 10000) {
      g.illuminated = false; // 追加発射を止める
      updateGuns(g, s, player, false, 12.2, 3.15, p, new SeededRng(3), REAL, GAME, ev);
      steps++;
    }
    // 発射した呼び出しの中でも 1 ステップ進むので +1。固定ステップ 1 刻み以内
    expect(Math.abs((steps + 1) * GAME - flightS)).toBeLessThanOrEqual(GAME + 1e-9);
    expect(impacts[0]!.hit).toBe(true);
    expect(impacts[0]!.x).toBeCloseTo(2000, 6);
    // 動く艇: 北へ 20 m/s → 着弾点は北へずれる（見越し）
    const g2 = createGunneryState(p, 48, 0);
    const moving: BoatState = { x: 2000, y: 0, headingDeg: 0, speedMps: 20 };
    impacts.length = 0;
    g2.illuminated = true;
    updateGuns(g2, s, moving, true, 12.2, 3.15, p, new SeededRng(4), REAL, GAME, ev);
    const sh = g2.shells.find((x) => x.active)!;
    expect(sh.impactY).toBeLessThan(-50);
  });
});

describe('ばらつきの模型', () => {
  it('着弾は半径 dispersion×(距離/有効射程) の円盤に一様に落ち、静止艇への命中率は 面積比 の見積もりに近い（127mm、1,000 m）', () => {
    const p: GunneryParams = { ...GP, guns: [GP.guns[0]!] };
    const s = ship();
    const player: BoatState = { x: 1000, y: 0, headingDeg: 0, speedMps: 0 };
    const rng = new SeededRng(42);
    let shots = 0;
    let hits = 0;
    let maxR = 0;
    const ev: ShellEvents = {
      onFire: () => shots++,
      onImpact: (_g, x, y, hit) => {
        if (hit) hits++;
        maxR = Math.max(maxR, Math.hypot(x - 1000, y));
      },
    };
    const g = createGunneryState(p, 48, 0);
    for (let i = 0; i < 60 * 4000; i++) {
      g.illuminated = true;
      updateGuns(g, s, player, true, 12.2, 3.15, p, rng, REAL, GAME, ev);
    }
    const spread = (p.guns[0]!.dispersionM * 1000) / p.guns[0]!.effectiveM; // 40 m
    expect(maxR).toBeLessThanOrEqual(spread + 1e-6);
    // 面積比: 艇の線分（24.4 m）を半径 (3.15 + 8) で太らせたカプセル ≈ 24.4×22.3 + π×11.15² ≈ 935 m² / 円盤 π×40² ≈ 5027 m² ≈ 0.19
    const pHit = hits / shots;
    expect(shots).toBeGreaterThan(1500);
    expect(pHit).toBeGreaterThan(0.13);
    expect(pHit).toBeLessThan(0.25);
  });
});

describe('pointNearBoat', () => {
  it('艇の線分から半径以内なら true', () => {
    const b: BoatState = { x: 100, y: 100, headingDeg: 0, speedMps: 0 }; // 南北向き、半長 12.2
    expect(pointNearBoat(100, 110, b, 12.2, 1)).toBe(true);
    expect(pointNearBoat(104, 100, b, 12.2, 5)).toBe(true);
    expect(pointNearBoat(106, 100, b, 12.2, 5)).toBe(false);
    expect(pointNearBoat(100, 100 + 12.2 + 4, b, 12.2, 5)).toBe(true);
    expect(pointNearBoat(100, 100 + 12.2 + 6, b, 12.2, 5)).toBe(false);
  });
});

describe('被害', () => {
  it('命中で HP が減り、HP 0 で撃沈。火災は実時間で燃えて持続後に消える', () => {
    const d = createDamageState(DP);
    const out: HitOutcome = { destroyed: false, startedFire: false, engineHit: false };
    const gun = GP.guns[0]!;
    const alwaysFire = { ...gun, fireChance: 1, engineDamageChance: 1 };
    applyShellHit(d, alwaysFire, DP, new SeededRng(5), out);
    expect(d.hp).toBe(DP.maxHp - gun.damage);
    expect(out.startedFire).toBe(true);
    expect(out.engineHit).toBe(true);
    expect(d.engineDamaged).toBe(true);
    const hpBefore = d.hp;
    for (let i = 0; i < 60; i++) stepDamage(d, DP, REAL); // 1 秒燃える
    expect(d.hp).toBeCloseTo(hpBefore - DP.fireDps, 6);
    for (let i = 0; i < 60 * (DP.fireDurationS + 1); i++) stepDamage(d, DP, REAL);
    expect(d.fireLeftS).toBeLessThanOrEqual(0);
    expect(d.hp).toBeCloseTo(hpBefore - DP.fireDps * DP.fireDurationS, 3);
    const never = { ...gun, fireChance: 0, engineDamageChance: 0, damage: 1000 };
    applyShellHit(d, never, DP, new SeededRng(6), out);
    expect(out.destroyed).toBe(true);
    expect(d.hp).toBe(0);
  });
  it('data から読める: 127mm と 25mm、探照灯・星弾、艇の damage', () => {
    expect(GP.guns.length).toBe(2);
    expect(GP.guns[0]!.id).toBe('main_127mm');
    expect(GP.guns[0]!.effectiveM).toBe(4000);
    expect(GP.guns[1]!.effectiveM).toBe(1200);
    expect(GP.searchlight.rangeM).toBe(3000);
    expect(GP.starshell.illumRadiusM).toBe(1500);
    expect(DP.maxHp).toBe(100);
    expect(DP.engineSpeedFactor).toBe(0.7);
    expect(isEnemyGunneryDataRecord({})).toBe(false);
  });
});
