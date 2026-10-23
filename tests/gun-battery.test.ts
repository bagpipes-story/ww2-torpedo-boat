import { describe, expect, it } from 'vitest';
import { gameData, getBargeParams, getGunBatteryParams, getPrototypeMission } from '../src/config/game-data';
import type { BoatState, SpeedStep } from '../src/core/boat-motion';
import { BARGE_SUNK, createFlotilla, hitBarge } from '../src/core/barges';
import { GUN_BLOCKED, GUN_FIRING, GUN_NO_TARGET, GUN_OUT_OF_ARC, GUN_OUT_OF_RANGE, GUN_SAFE, createGunBattery, gunBatteryParamsFromData, isGunBatteryDataRecord, selectTarget, stepGunBattery, stepGunBatteryOf, type GunBatteryDataRecord, type GunBatteryParams, type GunEvents } from '../src/core/gun-battery';
import { SeededRng } from '../src/core/rng';
import { stepGunBattery as stepGunBatteryD09000b } from './gun-battery-frozen';

const DT = 1 / 60;
const TS = 5;
const M = getPrototypeMission(gameData, 'us_03');
const G = getGunBatteryParams(gameData, M)!;
const P = getBargeParams(gameData, M)!;
const VIS2 = 900 * 900;
const rawOf = (id: string): GunBatteryDataRecord => JSON.parse(JSON.stringify((gameData.boats.boats.find((b) => b.id === id) as unknown as { gun_battery: GunBatteryDataRecord }).gun_battery)) as GunBatteryDataRecord;
const raw = (): GunBatteryDataRecord => rawOf('us_elco80');
const quiet: GunEvents = { onFire: () => {}, onHit: () => {}, onMiss: () => {} };

/** 大発 1 隻だけを (x, y) に止めて置く（他は撃破済み） */
function oneBarge(x: number, y: number) {
  const f = createFlotilla(P, 16);
  for (let i = 1; i < f.barges.length; i++) f.barges[i]!.phase = BARGE_SUNK;
  Object.assign(f.barges[0]!, { x, y, speedMps: 0, headingDeg: 270 });
  return f;
}

/** 静止した大発を舷側 d m で撃ち続け、撃破までの秒（60 秒で打ち切り） */
function killTime(d: number, band: SpeedStep, seed: number): number {
  const f = oneBarge(0, d);
  const g = createGunBattery(G, 24);
  const boat = { x: 0, y: 0, headingDeg: 90, speedMps: 0 };
  const rng = new SeededRng(seed);
  const ev: GunEvents = { onFire: () => {}, onHit: (i, gr) => void hitBarge(f, P, i, G.groups[gr]!.damage), onMiss: () => {} };
  let t = 0;
  while (f.barges[0]!.phase !== BARGE_SUNK && t < 60) {
    stepGunBattery(g, G, boat, band, true, true, f.barges, P.halfLengthM, P.halfBeamM, VIS2, rng, DT, DT * TS, ev);
    t += DT;
  }
  return t;
}
const median = (a: number[]): number => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)]!;

describe('艇の砲（core/gun-battery、v0.4.2）', () => {
  it('us_elco80 の gun_battery: 射程 600・遠い 300・死角 ±30°（cos² 0.75）・閃光 1,200・散布の倍率 1/1/1.6/2.5・2 組（150 発/分 8・480 発/分 2）', () => {
    expect([G.label, G.rangeM, G.effectiveM, G.deadConeDeg, G.flashRevealM]).toEqual(['40mm・37mm・20mm・12.7mm', 600, 300, 30, 1200]);
    expect(G.deadConeCos2).toBeCloseTo(0.75, 12);
    expect(G.spreadFactor).toEqual({ stop: 1, silent: 1, cruise: 1.6, full: 2.5 });
    expect(G.groups.map((g) => [g.id, g.roundsPerMin, g.damage, g.shellSpeedMps, g.dispersionM, g.splashRadiusM])).toEqual([['40mm_37mm', 150, 8, 400, 30, 2.5], ['20mm_12.7mm', 480, 2, 500, 36, 1]]);
    expect(getGunBatteryParams(gameData, getPrototypeMission(gameData, 'us_02'))).toBeNull();
  });
  it('壊れた data は例外: effective > range、死角 90°、倍率 < 1、damage 0', () => {
    expect(() => gunBatteryParamsFromData({ ...raw(), effective_m: 700 })).toThrow();
    expect(() => gunBatteryParamsFromData({ ...raw(), dead_cone_deg: 90 })).toThrow();
    expect(() => gunBatteryParamsFromData({ ...raw(), spread_factor: { stop: 0.9, silent: 1, cruise: 1.6, full: 2.5 } })).toThrow();
    const r = raw();
    r.groups[0]!.damage = 0;
    expect(() => gunBatteryParamsFromData(r)).toThrow();
  });
  it('標的: 東向きの艇に、南 200 m は射界（撃つ）、東 300 m は艇首の死角、南 700 m は射程外、南 1,000 m は見えない、煙幕越しは撃てない。艇首から 31° は射界・29° は死角', () => {
    const g = createGunBattery(G, 24);
    const boat = { x: 0, y: 0, headingDeg: 90, speedMps: 0 };
    const at = (x: number, y: number, blocked = false): number => {
      const f = oneBarge(x, y);
      f.barges[0]!.blocked = blocked;
      const i = selectTarget(g, G, boat, f.barges, VIS2);
      return i >= 0 ? GUN_FIRING : g.status;
    };
    expect(at(0, 200)).toBe(GUN_FIRING);
    expect(at(300, 0)).toBe(GUN_OUT_OF_ARC);
    expect(at(-300, 0)).toBe(GUN_OUT_OF_ARC);
    expect(at(0, 700)).toBe(GUN_OUT_OF_RANGE);
    expect(at(0, 1000)).toBe(GUN_NO_TARGET);
    expect(at(0, 200, true)).toBe(GUN_BLOCKED);
    const deg = (a: number): [number, number] => [400 * Math.cos((a * Math.PI) / 180), 400 * Math.sin((a * Math.PI) / 180)];
    expect(at(...deg(31))).toBe(GUN_FIRING);
    expect(at(...deg(29))).toBe(GUN_OUT_OF_ARC);
  });
  it('発射: 押して 1 秒で 40mm・37mm 3 発（0・0.4・0.8 秒）＋ 20mm・12.7mm 8 発。押していない・艇が沈んでいれば撃たず SAFE。最初の射撃の距離と速力帯を 1 回だけ記録', () => {
    const f = oneBarge(0, 250);
    const g = createGunBattery(G, 24);
    const boat = { x: 0, y: 0, headingDeg: 90, speedMps: 0 };
    let fires = 0;
    const ev: GunEvents = { onFire: () => fires++, onHit: () => {}, onMiss: () => {} };
    stepGunBattery(g, G, boat, 'stop', false, true, f.barges, P.halfLengthM, P.halfBeamM, VIS2, new SeededRng(1), DT, DT * TS, ev);
    expect([g.status, g.shots]).toEqual([GUN_SAFE, 0]);
    stepGunBattery(g, G, boat, 'stop', true, false, f.barges, P.halfLengthM, P.halfBeamM, VIS2, new SeededRng(1), DT, DT * TS, ev);
    expect([g.status, g.shots]).toEqual([GUN_SAFE, 0]);
    const rng = new SeededRng(1);
    for (let i = 0; i < 60; i++) stepGunBattery(g, G, boat, 'silent', true, true, f.barges, P.halfLengthM, P.halfBeamM, VIS2, rng, DT, DT * TS, ev);
    expect(g.shots).toBe(11);
    expect(g.firstShotM).toBeCloseTo(250, 9);
    expect(g.firstShotBand).toBe('silent');
    expect(g.targetM).toBeCloseTo(250, 9);
    expect(fires).toBeGreaterThanOrEqual(8);
  });
  it('撃破までの秒（静止した大発を舷側から、200 seed の中央値）: 200 m 約 1.3 秒、300 m 約 3.0 秒、400 m 約 5 秒、全速の 300 m 約 18 秒', () => {
    const at = (d: number, band: SpeedStep): number => median(Array.from({ length: 200 }, (_, i) => killTime(d, band, i + 1)));
    const m200 = at(200, 'stop');
    const m300 = at(300, 'stop');
    const m400 = at(400, 'silent');
    expect(m200).toBeGreaterThan(1.0);
    expect(m200).toBeLessThan(1.7);
    expect(m300).toBeGreaterThan(2.5);
    expect(m300).toBeLessThan(3.5);
    expect(m400).toBeGreaterThan(4.2);
    expect(m400).toBeLessThan(5.8);
    const full = median(Array.from({ length: 60 }, (_, i) => killTime(300, 'full', i + 1)));
    expect(full).toBeGreaterThan(13);
    expect(full).toBeLessThan(24);
  });
  it('着弾点にいる大発に当たる（狙った 1 隻に限らない）: 標的の真後ろに重ねた 2 隻目は、標的が沈んだ後も弾が届けば当たる', () => {
    const f = createFlotilla(P, 16);
    for (let i = 2; i < f.barges.length; i++) f.barges[i]!.phase = BARGE_SUNK;
    Object.assign(f.barges[0]!, { x: 0, y: 150, speedMps: 0 });
    Object.assign(f.barges[1]!, { x: 0, y: 150, speedMps: 0 });
    const g = createGunBattery(G, 24);
    const hit = [0, 0];
    const ev: GunEvents = { onFire: () => {}, onHit: (i) => hit[i]!++, onMiss: () => {} };
    const rng = new SeededRng(9);
    for (let i = 0; i < 30; i++) stepGunBattery(g, G, { x: 0, y: 0, headingDeg: 90, speedMps: 0 }, 'stop', true, true, f.barges, P.halfLengthM, P.halfBeamM, VIS2, rng, DT, DT * TS, ev);
    expect(hit[0]).toBeGreaterThan(0);
    expect(hit[1]).toBe(0); // 同じ場所なら index の若い方
    f.barges[0]!.phase = BARGE_SUNK;
    for (let i = 0; i < 30; i++) stepGunBattery(g, G, { x: 0, y: 0, headingDeg: 90, speedMps: 0 }, 'stop', true, true, f.barges, P.halfLengthM, P.halfBeamM, VIS2, rng, DT, DT * TS, quiet);
    expect(g.target).toBe(1);
  });
});

// ---------- 散布の最小半径（v0.6.4 実機 1 回目。jp_t38 の min_spread_m だけ） ----------

const J = getGunBatteryParams(gameData, getPrototypeMission(gameData, 'jp_01'))!;
const always = (): boolean => true;
const never = (): boolean => false;
/** 乱数の代わり: 1 回目 1（円の縁）・2 回目 0（東へ）を繰り返す。止まった標的の x が 0 なら、弾の着点の x ＝ 散布の円の半径 */
function edgeRng(): SeededRng {
  let n = 0;
  return { next: () => (n++ % 2 === 0 ? 1 : 0) } as unknown as SeededRng;
}
/** 東向きで止まった艇から南 d m の止まった標的へ、本物の stepGunBatteryOf で 1 ステップ撃った 1 組目の円の半径 m */
function spreadAt(p: GunBatteryParams, d: number, band: SpeedStep): number {
  const g = createGunBattery(p, 4);
  const t: BoatState = { x: 0, y: d, headingDeg: 270, speedMps: 0 };
  stepGunBatteryOf(g, p, { x: 0, y: 0, headingDeg: 90, speedMps: 0 }, band, true, true, [t], always, never, 12.2, 3.15, VIS2, edgeRng(), DT, DT * TS, quiet);
  expect(g.shots).toBe(p.groups.length); // 組ごとに 1 発。shells[0] は 1 組目の弾
  return g.shells[0]!.impactX;
}
/** 鍵を外した写し（今の式に戻る） */
function withoutFloor(p: GunBatteryParams): GunBatteryParams {
  const q: GunBatteryParams = { ...p };
  delete q.minSpreadM;
  return q;
}

describe('散布の最小半径（core/gun-battery の min_spread_m、v0.6.4 実機 1 回目）', () => {
  it('jp_t38 だけが鍵を持つ（22 m）。jp_t14・us_elco80 の params には鍵ごと無い', () => {
    expect(J.minSpreadM).toBe(22);
    const withKey = (gameData.boats.boats as unknown as Array<Record<string, unknown>>).filter((b) => typeof b['gun_battery'] === 'object' && b['gun_battery'] !== null && 'min_spread_m' in (b['gun_battery'] as object)).map((b) => b['id']);
    expect(withKey).toEqual(['jp_t38']);
    for (const id of ['jp_t14', 'us_elco80']) expect('minSpreadM' in gunBatteryParamsFromData(rawOf(id)), id).toBe(false);
    expect('minSpreadM' in G).toBe(false);
  });
  it('円の半径は速力帯の倍率の後に max(56·R/600·k, 22): 停止 100 m で 22・停止 400 m で 37.3・巡航 100 m で 22（倍率の前なら 35.2）・全速 100 m で 23.3（倍率の前なら 55）', () => {
    const prop = (d: number, band: SpeedStep): number => ((J.groups[0]!.dispersionM * d) / J.rangeM) * J.spreadFactor[band];
    expect(spreadAt(J, 100, 'stop')).toBe(22);
    expect(spreadAt(J, 400, 'stop')).toBe(prop(400, 'stop'));
    expect(prop(400, 'stop')).toBeCloseTo(37.333, 3);
    expect(spreadAt(J, 100, 'cruise')).toBe(22);
    expect(spreadAt(J, 100, 'full')).toBe(prop(100, 'full'));
    expect(prop(100, 'full')).toBeCloseTo(23.333, 3);
    // 下限が効く境目: 止まって 236 m・巡航 147 m・全速 94 m より近く
    expect(spreadAt(J, 230, 'silent')).toBe(22);
    expect(spreadAt(J, 240, 'silent')).toBe(prop(240, 'silent'));
    // 鍵が無いと今の式の double そのまま（近くでも広がらない）
    const n = withoutFloor(J);
    expect(spreadAt(n, 100, 'stop')).toBe(prop(100, 'stop'));
    expect(spreadAt(n, 100, 'full')).toBe(prop(100, 'full'));
    expect(spreadAt(G, 100, 'stop')).toBe(((G.groups[0]!.dispersionM * 100) / G.rangeM) * G.spreadFactor.stop);
  });
  it('鍵が無いと d09000b の写しと同じ着点・同じ乱数。鍵があっても比例の円が 22 m より大きい距離（止まって 300〜560 m）では鍵の無い砲と同じ着点・同じ乱数（1 発 2 回のまま）', () => {
    const n = withoutFloor(J);
    const bands: readonly SpeedStep[] = ['stop', 'silent', 'cruise', 'full'];
    let shots = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const band = bands[seed % 4]!;
      const d = 60 + ((seed * 37) % 500);
      const runs = [0, 1].map(() => ({ f: oneBarge(0, d), g: createGunBattery(n, 24), rng: new SeededRng(seed) }));
      for (const r of runs) Object.assign(r.f.barges[0]!, { speedMps: 3, headingDeg: 90 });
      for (let k = 0; k < 120; k++) {
        stepGunBatteryD09000b(runs[0]!.g, n, { x: 0, y: 0, headingDeg: 90, speedMps: 0 }, band, true, true, runs[0]!.f.barges, P.halfLengthM, P.halfBeamM, VIS2, runs[0]!.rng, DT, DT * TS, quiet);
        stepGunBattery(runs[1]!.g, n, { x: 0, y: 0, headingDeg: 90, speedMps: 0 }, band, true, true, runs[1]!.f.barges, P.halfLengthM, P.halfBeamM, VIS2, runs[1]!.rng, DT, DT * TS, quiet);
        for (let i = 0; i < 24; i++) expect([runs[1]!.g.shells[i]!.impactX, runs[1]!.g.shells[i]!.impactY]).toEqual([runs[0]!.g.shells[i]!.impactX, runs[0]!.g.shells[i]!.impactY]);
        expect(runs[1]!.rng.next() === runs[0]!.rng.next()).toBe(true);
      }
      shots += runs[1]!.g.shots;
    }
    expect(shots).toBeGreaterThan(30 * 6); // 1 seed 2 秒・220 発/分で約 7 発
    for (let seed = 1; seed <= 10; seed++) {
      const d = 300 + seed * 26;
      const a = { f: oneBarge(0, d), g: createGunBattery(J, 24), rng: new SeededRng(seed) };
      const b = { f: oneBarge(0, d), g: createGunBattery(n, 24), rng: new SeededRng(seed) };
      for (let k = 0; k < 60; k++) {
        stepGunBattery(a.g, J, { x: 0, y: 0, headingDeg: 90, speedMps: 0 }, 'stop', true, true, a.f.barges, P.halfLengthM, P.halfBeamM, VIS2, a.rng, DT, DT * TS, quiet);
        stepGunBattery(b.g, n, { x: 0, y: 0, headingDeg: 90, speedMps: 0 }, 'stop', true, true, b.f.barges, P.halfLengthM, P.halfBeamM, VIS2, b.rng, DT, DT * TS, quiet);
      }
      expect(a.g.shells.map((s) => [s.impactX, s.impactY])).toEqual(b.g.shells.map((s) => [s.impactX, s.impactY]));
      expect(a.rng.next()).toBe(b.rng.next());
    }
  });
  it('壊れた data は例外: min_spread_m −1 は「min_spread_m は 0 以上」、NaN・文字列は型の検査で落ちる。0 は通る（比例の円のまま）', () => {
    expect(() => gunBatteryParamsFromData({ ...rawOf('jp_t38'), min_spread_m: -1 })).toThrow('min_spread_m は 0 以上');
    expect(isGunBatteryDataRecord({ ...rawOf('jp_t38'), min_spread_m: Number.NaN })).toBe(false);
    expect(isGunBatteryDataRecord({ ...rawOf('jp_t38'), min_spread_m: '22' })).toBe(false);
    expect(isGunBatteryDataRecord(rawOf('jp_t38'))).toBe(true);
    expect(isGunBatteryDataRecord(rawOf('us_elco80'))).toBe(true);
    const zero = gunBatteryParamsFromData({ ...rawOf('jp_t38'), min_spread_m: 0 });
    expect(zero.minSpreadM).toBe(0);
    expect(spreadAt(zero, 100, 'stop')).toBe(((zero.groups[0]!.dispersionM * 100) / zero.rangeM) * zero.spreadFactor.stop);
  });
  it('Boot の文（config/game-data の getGunBatteryParams。レビュー R2）: 値の誤りは任務と艇の id を頭に付ける（「jp_01 の jp_t38: … min_spread_m は 0 以上」）。型の誤りは鍵の並びに min_spread_m を挙げる', () => {
    const withFloor = (v: unknown): typeof gameData => {
      const d = JSON.parse(JSON.stringify(gameData)) as typeof gameData;
      const boat = (d.boats.boats as unknown as Record<string, unknown>[]).find((b) => b['id'] === 'jp_t38')!;
      (boat['gun_battery'] as Record<string, unknown>)['min_spread_m'] = v;
      return d;
    };
    const jp01 = getPrototypeMission(gameData, 'jp_01');
    expect(() => getGunBatteryParams(withFloor(-1), jp01)).toThrow(/^jp_01 の jp_t38: boats\.json の gun_battery: min_spread_m は 0 以上/);
    expect(() => getGunBatteryParams(withFloor('22'), jp01)).toThrow(/^boats\.json の jp_t38\.gun_battery（.*min_spread_m は数）が無い/);
    expect(getGunBatteryParams(withFloor(22), jp01)!.minSpreadM).toBe(22);
  });
});
