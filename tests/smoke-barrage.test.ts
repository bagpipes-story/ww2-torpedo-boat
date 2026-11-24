// v0.8.4 煙幕への乱射（史実モードだけ。ユーザーの要望 2026-11-23・範囲の答え「敵の艦すべて」）: core/smoke-barrage（引き金・狙い・散布・間隔・乱数）と data の検査（historical_mode.smoke_barrage）、
// 世界の配線（world-enemies が史実モード × 煙幕のある艇 × 艦の隊の世界だけ付ける・seed+46・普段の砲の系列は引かない・enemy-fire の順）。2 行目の文は tests/smoke-barrage-hud。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { getSmokeBarrageParams } from '../src/config/smoke-barrage-data';
import type { BoatState } from '../src/core/boat-motion';
import { createGunneryState, gunneryParamsFromData, isEnemyGunneryDataRecord, updateGuns, type GunneryParams, type ShellEvents } from '../src/core/gunnery';
import { SeededRng } from '../src/core/rng';
import { BARRAGE_SEED_OFFSET, barrageScatterM, createSmokeBarrageState, isSmokeBarrageDataRecord, noteContact, pickBarrageAim, settleBarrageShells, stepSmokeBarrage, type SmokeBarrageParams } from '../src/core/smoke-barrage';
import { createSmokeState, type SmokeState } from '../src/core/smoke';
import { code } from './core-rules-kit';
import { CountingRng, sceneOf, setupOf } from './column-world-kit';
import { chain } from './torpedo-free-kit';

const P = getSmokeBarrageParams(gameData);
const raw: unknown = gameData.enemies.enemies.find((e) => e.id === 'ijn_destroyer_mutsuki_enemy');
if (!isEnemyGunneryDataRecord(raw)) throw new Error('mutsuki');
const GP: GunneryParams = gunneryParamsFromData(raw);
const REAL = 1 / 60;

/** 艦 (0, 0)・艇 (0, −d) に止まって、艇の 30 m 北（艦の側）に煙 1 つ（ほかの煙は消えている） */
function scene(d = 300) {
  const ship: BoatState = { x: 0, y: 0, headingDeg: 90, speedMps: 0 };
  const boat: BoatState = { x: 0, y: -d, headingDeg: 90, speedMps: 0 };
  const g = createGunneryState(GP, 48, 0);
  const b = createSmokeBarrageState(GP.guns.length, 48);
  const smoke = createSmokeState(8);
  smoke.puffs[0] = { active: true, x: 0, y: -d + 30, leftS: 20 };
  return { ship, boat, g, b, smoke };
}
const fired = (n: { v: number }): ShellEvents => ({ onFire: () => { n.v++; }, onImpact: () => {} });

describe('data（hit_rate_model.historical_mode.smoke_barrage）', () => {
  it('今の値: 500 m の内・散布 25 → 90 m（100 → 500 m）・最後に見た点から 100 m の煙・普段の半分の速さ。source は design', () => {
    expect(P).toEqual({ maxRangeM: 500, minRangeM: 100, scatterMaxM: 90, scatterMinM: 25, puffSearchM: 100, rateFactor: 0.5 });
    expect(gameData.hitRateModel.historical_mode.smoke_barrage.source).toMatch(/^design \(v0\.8\.4/);
  });
  it('検査: 有限でない・min ≥ max・min ≤ 0・scatter_min > scatter_max・scatter_min < 0・puff_search < 0・rate_factor が 0 以下か 1 より大きい・鍵が無い → 例外', () => {
    const ok = { ...gameData.hitRateModel.historical_mode.smoke_barrage };
    expect(isSmokeBarrageDataRecord(ok)).toBe(true);
    const bad: Array<Record<string, unknown>> = [
      { max_range_m: Infinity }, { min_range_m: 500 }, { min_range_m: 0 }, { scatter_min_m: 91 }, { scatter_min_m: -1 }, { puff_search_m: -1 },
      { rate_factor: 0 }, { rate_factor: 1.01 }, { rate_factor: '0.5' }, { max_range_m: undefined },
    ];
    for (const o of bad) {
      const r = { ...ok, ...o };
      expect(isSmokeBarrageDataRecord(r), JSON.stringify(o)).toBe(false);
      const d = JSON.parse(JSON.stringify(gameData)) as typeof gameData;
      (d.hitRateModel.historical_mode as Record<string, unknown>)['smoke_barrage'] = r;
      expect(() => getSmokeBarrageParams(d)).toThrow(/smoke_barrage/);
    }
    expect(isSmokeBarrageDataRecord({ ...ok, rate_factor: 1, scatter_min_m: 90, puff_search_m: 0 })).toBe(true);
  });
});

describe('散布の半径と狙う点', () => {
  it('散布は min_range_m 以下で scatter_min_m・max_range_m 以上で scatter_max_m・間は直線で、近いほど小さい（単調）', () => {
    expect([barrageScatterM(P, 0), barrageScatterM(P, 100), barrageScatterM(P, 300), barrageScatterM(P, 500), barrageScatterM(P, 900)]).toEqual([25, 25, 57.5, 90, 90]);
    let prev = -1;
    for (let d = 0; d <= 700; d += 7) {
      const r = barrageScatterM(P, d);
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
  });
  it('狙う点は最後に見た点から puff_search_m 以内の生きている煙のどれか（一様・乱数 1 回）。無ければ最後に見た点（乱数なし）。煙の状態が無ければ最後に見た点', () => {
    const b = createSmokeBarrageState(1, 4);
    b.hasFix = true;
    b.fixX = 1000;
    b.fixY = 1000;
    const smoke: SmokeState = createSmokeState(6);
    const put = (i: number, x: number, y: number, active = true): void => { smoke.puffs[i] = { active, x, y, leftS: 10 }; };
    put(0, 1050, 1000); put(1, 1000, 1099); put(2, 1101, 1000); put(3, 1000, 950, false); put(4, 930, 930);
    const out = { x: 0, y: 0 };
    const seen = new Set<string>();
    const rng = new CountingRng(3);
    for (let k = 0; k < 400; k++) {
      pickBarrageAim(b, P, smoke, rng, out);
      seen.add(`${out.x},${out.y}`);
    }
    expect([...seen].sort()).toEqual(['1000,1099', '1050,1000', '930,930']); // 101 m 先と消えた煙は選ばない
    expect(rng.draws).toBe(400);
    const none = createSmokeState(2);
    const r2 = new CountingRng(3);
    pickBarrageAim(b, P, none, r2, out);
    expect([out.x, out.y, r2.draws]).toEqual([1000, 1000, 0]);
    pickBarrageAim(b, P, null, r2, out);
    expect([out.x, out.y, r2.draws]).toEqual([1000, 1000, 0]);
  });
  it('最後に見た点: 見つけていて線が開いていれば今の位置、煙の中で見つけ直せばその時の位置、見つけて遮られている間は動かない、見失えば捨てる', () => {
    const b = createSmokeBarrageState(1, 4);
    const boat: BoatState = { x: 10, y: 20, headingDeg: 0, speedMps: 0 };
    noteContact(b, boat, true, false);
    expect([b.hasFix, b.fixX, b.fixY]).toEqual([true, 10, 20]);
    noteContact(b, { ...boat, x: 99 }, true, true);
    expect([b.hasFix, b.fixX]).toEqual([true, 10]);
    noteContact(b, boat, false, true);
    expect(b.hasFix).toBe(false);
    noteContact(b, { ...boat, x: 55 }, true, true); // 煙の中で見つけ直した
    expect([b.hasFix, b.fixX]).toEqual([true, 55]);
  });
});

describe('引き金（1 隻・1 ステップ）', () => {
  it('みな真なら撃つ（2 門とも。普段の砲の系列は引かない）。1 つでも偽なら撃たず乱数も引かない', () => {
    const run = (o: { detected?: boolean; blocked?: boolean; canFire?: boolean; visible?: boolean; lit?: boolean; d?: number; noFix?: boolean }): { shots: number; draws: number } => {
      const s = scene(o.d ?? 300);
      if (!o.noFix) noteContact(s.b, s.boat, true, false);
      else s.b.prevDetected = true; // 見つけ続けているのに点が無い（作り物の状態。見つけた立ち上がりなら点を置く＝noteContact の試し）
      if (o.lit) s.g.illuminated = true;
      const rng = new CountingRng(9);
      const n = { v: 0 };
      stepSmokeBarrage(s.b, P, GP, s.g, s.ship, s.boat, o.detected ?? true, o.blocked ?? true, o.canFire ?? true, o.visible ?? false, s.smoke, rng, REAL, fired(n));
      return { shots: n.v, draws: rng.draws };
    };
    expect(run({})).toEqual({ shots: 2, draws: 2 * 3 }); // 1 発に 3 回（煙を選ぶ 1・散布 2）
    for (const o of [{ detected: false }, { blocked: false }, { canFire: false }, { visible: true }, { lit: true }, { d: 501 }, { noFix: true }]) expect(run(o), JSON.stringify(o)).toEqual({ shots: 0, draws: 0 });
    expect(run({ d: 500 }).shots).toBe(2);
  });
  it('間隔: 砲ごとに普段の 1 / rate_factor 倍（120mm 2 門×毎分 10 → 6 秒・25mm 4 門×毎分 120 → 0.25 秒）。撃てない間は負の残りを溜めない', () => {
    const s = scene(300);
    noteContact(s.b, s.boat, true, false);
    const rng = new SeededRng(1);
    const per = [0, 0];
    const ev: ShellEvents = { onFire: (i) => { per[i]!++; }, onImpact: () => {} };
    const unused = new SeededRng(5);
    for (let k = 0; k < 60 * 60; k++) {
      stepSmokeBarrage(s.b, P, GP, s.g, s.ship, s.boat, true, true, true, false, s.smoke, rng, REAL, ev);
      updateGuns(s.g, s.ship, s.boat, true, 12.2, 3.15, GP, unused, REAL, REAL * 5, ev);
    }
    expect(per).toEqual([10, 240]); // 1 分: 普段の半分
    // 撃てない間（遮られていない）に 30 秒過ごしても、次に遮られた時に一斉には出ない
    for (let k = 0; k < 30 * 60; k++) stepSmokeBarrage(s.b, P, GP, s.g, s.ship, s.boat, true, false, true, false, s.smoke, rng, REAL, ev);
    expect(Array.from(s.b.cooldownS).every((c) => c >= 0)).toBe(true);
    const before = [...per];
    stepSmokeBarrage(s.b, P, GP, s.g, s.ship, s.boat, true, true, true, false, s.smoke, rng, REAL, ev);
    expect([per[0]! - before[0]!, per[1]! - before[1]!]).toEqual([1, 1]);
  });
  it('決定的: 同じ seed なら同じ着弾。乱射の弾は普段の弾と同じプール・同じ当たり（着いた数・当たり・近くの数を数える）', () => {
    const once = (seed: number): string => {
      const s = scene(150);
      noteContact(s.b, s.boat, true, false);
      const rng = new SeededRng(seed);
      const hits = { v: 0 };
      const ev: ShellEvents = { onFire: () => {}, onImpact: (_i, _x, _y, h) => { if (h) hits.v++; } };
      const unused = new SeededRng(5);
      for (let k = 0; k < 20 * 60; k++) {
        stepSmokeBarrage(s.b, P, GP, s.g, s.ship, s.boat, true, true, true, false, s.smoke, rng, REAL, ev);
        updateGuns(s.g, s.ship, s.boat, true, 12.2, 3.15, GP, unused, REAL, REAL * 5, ev);
        settleBarrageShells(s.b, s.g.shells, GP, s.boat, 12.2, 3.15, 150);
      }
      expect(s.b.hits).toBe(hits.v);
      expect(s.b.landed).toBeLessThanOrEqual(s.b.fired);
      expect(s.b.fired - s.b.landed).toBeLessThanOrEqual(2);
      expect(s.b.near).toBeGreaterThan(0);
      return JSON.stringify([s.b.fired, s.b.landed, s.b.hits, s.b.near]);
    };
    expect(once(7)).toBe(once(7));
    expect(once(7)).not.toBe(once(8));
  });
  it('源: Phaser・config を読まない・Math.random なし・毎ステップ確保しない（new は状態を作る時の配列 2 つだけ・push/map/filter なし）', () => {
    const src = code('src/core/smoke-barrage.ts');
    expect(src).not.toMatch(/from 'phaser'|config\/|Math\.random|\.push\(|\.map\(|\.filter\(/);
    expect(src.match(/new /g)).toEqual(['new ', 'new ']);
    expect(BARRAGE_SEED_OFFSET).toBe(46);
  });
});

describe('世界の配線（world-enemies・enemy-fire）', () => {
  type Built = { destroyers: { fires: Array<{ barrageOf: { state: { fired: number } } | null }> } | null; gunRng: SeededRng };
  type BuildEnemies = (...a: unknown[]) => Built;
  const load = async (): Promise<BuildEnemies> => ((await import(/* @vite-ignore */ ['..', 'src', 'systems', 'world-enemies'].join('/'))) as { buildEnemies: BuildEnemies }).buildEnemies;
  const boat: BoatState = { x: 0, y: 0, headingDeg: 0, speedMps: 0 };
  it('史実モード × 煙幕のある艇 × 艦の隊の世界だけ全艦に付ける（us_02・us_05・us_06）。オフ・煙幕の無い艇（jp_06 の T-38）・data を渡さない世界は付けない', async () => {
    const buildEnemies = await load();
    const has = (id: string, historical: boolean, data: unknown = gameData): boolean[] => {
      const s = setupOf(id, false, undefined, { historical });
      const e = buildEnemies(sceneOf(), s, 4, boat, chain, {}, () => undefined, () => undefined, { stepTimeS: 0 }, null, data);
      return e.destroyers!.fires.map((f) => f.barrageOf !== null);
    };
    for (const id of ['us_02', 'us_05', 'us_06']) {
      expect(has(id, true).every((x) => x), id).toBe(true);
      expect(has(id, false).some((x) => x), id).toBe(false);
      expect(has(id, true, null).some((x) => x), id).toBe(false);
    }
    expect(has('jp_06', true).some((x) => x)).toBe(false);
  });
  it('setup には入れない（史実モードの setup の snapshot は今のまま）。乱数は seed+46 を 1 本だけ作る（world-enemies の 1 か所）', () => {
    expect(Object.keys(setupOf('us_02', false, undefined, { historical: true }))).not.toContain('smokeBarrage');
    const src = code('src/systems/world-enemies.ts');
    expect(src.match(/BARRAGE_SEED_OFFSET/g)!.length).toBe(2); // import と 1 回の new SeededRng
    expect(src).toContain('if (destroyers && barrageParams && s.historical && s.smokeParams) {');
  });
  it('enemy-fire: 乱射の発射は普段の砲の発射の前・着弾の数えは後。持たない艦は普段の道（step・stepPair とも if (br) の 2 行だけ）', () => {
    const src = code('src/systems/enemy-fire.ts');
    const a = src.indexOf('if (br) br.fire(this.state, this.params, ship, player, detected, losBlocked, canFire, false, realDt, this.events);');
    const b = src.indexOf('updateGuns(this.state, ship, player, canFire, playerHalfLengthM, playerHalfBeamM, this.params, this.rng, realDt, dt, this.events);');
    const c = src.indexOf('if (br) br.settle(this.state.shells, this.params, player, playerHalfLengthM, playerHalfBeamM);');
    expect(a > 0 && b > a && c > b).toBe(true);
    const p = src.indexOf('if (br) br.fire(this.state, this.params, ship, player, detected, losBlocked, canFire, b.lit, realDt, this.pairEvents);');
    const q = src.indexOf('updateGunsPair(this.state, ship, a, b, canFire, this.params, this.rng, realDt, dt, this.pairEvents);');
    expect(p > c && q > p).toBe(true);
    expect(src.match(/br\.(fire|settle)\(/g)!.length).toBe(4);
  });
});
