// v0.8.5 IP2（実機 1 回目のユーザー「Sボートが一回退けると二度と来ないので第二波が来るようにしてください。」「沿岸砲の砲撃が生存者に至近弾となったら1名ずつ死亡発生するようにしてください。」）:
// - 砲台が生存者の海を撃つ（core/survivor-shelling・config/rescue-wave-data の V-H・systems/shore-guns）: 隊で 1 本の時計（最初の 1 発は interval_s の後・繰り越し）・自艇を撃てない砲台だけ・
//   射界の内の残りのある群へ・代わる代わる・乱数は seed+48 から 1 発 3 回（撃たなければ引かない）・弾は砲台の砲弾のプールへ印 SURVIVOR_SHELL_GUN で（着弾は onImpact の 4 つ目の引数）。
// - S ボートの第二波（core/sboat-wave・V-W・systems/world-enemies）: 隊の後ろに確保して海域の外（PT_OUT）に置き、第一波がみな去って delay_s の後・救助の時間の内に 1 回だけ哨戒に。
//   凍結の stepPtSection は出る前の第二波を動かさない。第一波の値と今夜の揺らぎ（seed+16）は変えない。揺らぎは seed+49 から 2 回。
// - 新しい系列 +48・+49 はほかの系列と重ならない。毎ステップの本体に確保なし（§7）。
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { gameData, type GameData } from '../src/config/game-data';
import { getPrototypeMission } from '../src/config/mission-data';
import { PT_SHELL_POOL_SIZE } from '../src/config/pt-config';
import { getRescueParams } from '../src/config/rescue-mission-data';
import { RESCUE_SHELLING_KEYS, RESCUE_WAVE_KEYS } from '../src/config/rescue-wave-data';
import { BATTERY_SHELL_POOL_SIZE } from '../src/config/hunt-config';
import type { BoatState } from '../src/core/boat-motion';
import { ptStartAt } from '../src/core/pt-data';
import { PT_LEAVE, PT_OUT, PT_PATROL, PT_SUNK, createPtSection, stepPtSection } from '../src/core/pt-boats';
import { createRescueState, type RescueState } from '../src/core/rescue';
import { SeededRng } from '../src/core/rng';
import { createSboatWave, SBOAT_WAVE_SEED_OFFSET, sboatWaveAppeared, sboatWaveParams, stepSboatWave } from '../src/core/sboat-wave';
import { createShoreBattery, stepShoreBattery, type ShoreBatteryParams } from '../src/core/shore-battery';
import { createSurvivorShelling, stepSurvivorShelling, SURVIVOR_SHELL_GUN, SURVIVOR_SHELL_SEED_OFFSET, survivorGroupsInArc, type SurvivorShellBattery } from '../src/core/survivor-shelling';
import { buildWorldSetup } from '../src/systems/world-setup';
import { setupOf } from './column-world-kit';
import { code, scanAllocations } from './core-rules-kit';
import { checkAt, events, FEEL_DT, TS } from './landing-kit';
import { chain } from './torpedo-free-kit';

type Rec = Record<string, unknown>;
const clone = (): GameData => JSON.parse(JSON.stringify(gameData)) as GameData;
const rescueOf = (d: GameData): Rec => ((d.missionsSeed.missions as unknown as Rec[]).find((m) => m['id'] === 'us_07')!['v0_1_prototype'] as Rec)['rescue'] as Rec;
const build = (f: (d: GameData) => void, hard = false): (() => unknown) => {
  const d = clone();
  f(d);
  return () => getRescueParams(d, getPrototypeMission(d, 'us_07', hard));
};
const N = buildWorldSetup(gameData, 'us_07');
const H = buildWorldSetup(gameData, 'us_07', { hard: true });
const R = N.rescue!;

describe('data（us_07。v0.8.5 IP2）', () => {
  it('生存者の海: ノーマル 12 秒・ハード 10 秒に 1 発（砲台が自艇へ撃つ 10 秒以上）・散布 × 0.6。至近弾の半径 shell_kill_m 30 m（群の絵の波立ち 20 m ＋ 水柱の芯）', () => {
    expect([R.shelling, H.rescue!.shelling, R.shellKillM]).toEqual([{ intervalS: 12, dispersionFactor: 0.6 }, { intervalS: 10, dispersionFactor: 0.6 }, 30]);
    const g = N.shoreBattery!.gun;
    expect(60 / (g.roundsPerMinPerGun * g.count)).toBe(10);
  });
  it('第二波: 第一波がみな去って 60 秒（v0.8.5 IP3 で 60 → 90、IP4 でユーザーの決め「Sボートの第二波は60秒で来るように」で 90 → 60）・第一波と同じ隻数（ノーマル 2・ハード 3）の線・揺らぎ ±200・±100（波で 1 つ）。S ボートの無い任務は null', () => {
    expect([R.wave2!.delayS, H.rescue!.wave2!.delayS, R.wave2!.legs.length, H.rescue!.wave2!.legs.length, R.wave2!.jitterXM, R.wave2!.jitterYM]).toEqual([60, 60, 2, 3, 200, 100]);
    expect(R.wave2!.legs).toEqual([[200, 1200, 1550, 1950], [200, 1800, 1750, 2500]]); // v0.8.5 IP4 で線の終わりを西へ（フィッチの砲火 1,700 m の V-D2）
    expect(H.rescue!.wave2!.legs[2]).toEqual([200, 2400, 1850, 3000]);
    expect([RESCUE_SHELLING_KEYS, RESCUE_WAVE_KEYS]).toEqual([['interval_s', 'hard_interval_s', 'dispersion_factor', 'source'], ['delay_s', 'legs_m', 'jitter', 'source']]);
  });
  it('新しい系列 seed+48・+49 はほかのどの *_SEED_OFFSET とも重ならない（src の全部を走査）・core/night の注に書いた', () => {
    expect([SURVIVOR_SHELL_SEED_OFFSET, SBOAT_WAVE_SEED_OFFSET]).toEqual([48, 49]);
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : []));
    const vals: number[] = [];
    for (const f of walk(join(__dirname, '..', 'src'))) for (const m of readFileSync(f, 'utf8').matchAll(/SEED_OFFSET = (\d+);/g)) vals.push(Number(m[1]));
    expect(vals.filter((v) => v === 48 || v === 49).sort()).toEqual([48, 49]);
    expect(readFileSync(join(__dirname, '..', 'src', 'core', 'night.ts'), 'utf8')).toMatch(/\+48 は v0\.8\.5 IP2 の生存者の海への砲撃.*\+49 は.*S ボートの第二波/);
  });
});

describe('起動時の検査 V-H・V-W（config/rescue-wave-data）', () => {
  const sh = (d: GameData): Rec => rescueOf(d)['shelling'] as Rec;
  const wv = (d: GameData): Rec => rescueOf(d)['sboat_wave2'] as Rec;
  it('V-H1: 鍵・間隔は正・散布の倍率は 0.1〜1・source。V-H2: 自艇へ撃つ 10 秒より速くしない・砲台のある任務は null にしない', () => {
    expect(build((d) => (sh(d)['extra'] = 1))).toThrow(/rescue\.shelling の鍵はちょうど interval_s・hard_interval_s・dispersion_factor・source（.*extra）（V-H1・spec-v0850 §4）/);
    expect(build((d) => (sh(d)['interval_s'] = 0))).toThrow(/interval_s・hard_interval_s は正（V-H1/);
    expect(build((d) => (sh(d)['dispersion_factor'] = 1.2))).toThrow(/dispersion_factor は 0\.1〜1（1\.2）（V-H1/);
    expect(build((d) => (sh(d)['source'] = ''))).toThrow(/rescue\.shelling\.source は空でない文字列（V-H1/);
    expect(build((d) => (sh(d)['interval_s'] = 9.9))).toThrow(/は砲台（1600, 4600）が自艇へ撃つ間隔 10 秒以上（自艇へより遅い）（V-H2/);
    expect(build((d) => (sh(d)['hard_interval_s'] = 9.9), true)).toThrow(/V-H2/);
    expect(build((d) => (sh(d)['interval_s'] = 10))).not.toThrow();
    expect(build((d) => (rescueOf(d)['shelling'] = null))).toThrow(/rescue\.shelling は砲台（shore_battery）のある任務では object（null は砲台の無い任務だけ）（V-H2/);
  });
  it('V-H3: どの群も射界の外なら止まる', () => {
    expect(build((d) => (rescueOf(d)['groups'] = [[5500, 600, 40]]))).toThrow(/V-H3/);
  });
  it('V-W1〜V-W4: 鍵・秒・線の形・揺らぎ・本数 ≥ 第一波・縁の内・長さ・フィッチの砲火の外（揺らぎ込み）', () => {
    expect(build((d) => (wv(d)['count'] = 2))).toThrow(/rescue\.sboat_wave2 の鍵はちょうど delay_s・legs_m・jitter・source（.*count）（V-W1/);
    expect(build((d) => (wv(d)['delay_s'] = 0))).toThrow(/rescue\.sboat_wave2\.delay_s は正（V-W1/);
    expect(build((d) => (wv(d)['jitter'] = { x_m: -1, y_m: 0 }))).toThrow(/jitter の x_m・y_m は 0 以上（V-W1/);
    expect(build((d) => (wv(d)['legs_m'] = [[200, 1200, 1800]]))).toThrow(/legs_m は \[x0, y0, x1, y1\] の配列（V-W1/);
    expect(build((d) => (wv(d)['legs_m'] = [[200, 1200, 1800, 1950], [200, 1800, 2000, 2500]]), true)).toThrow(/legs_m は第一波の隻数（3）以上の本数（2）（V-W2/);
    expect(build((d) => (wv(d)['legs_m'] = [[100, 1200, 1800, 1950], [200, 1800, 2000, 2500]]))).toThrow(/legs_m\[0\] の点は海域の縁から edge_margin_m（200 m）の内（V-W3/);
    expect(build((d) => (wv(d)['legs_m'] = [[200, 1200, 350, 1200], [200, 1800, 2000, 2500]]))).toThrow(/legs_m\[0\] の長さは arrive_m の 2 倍より長い（V-W3/);
    expect(build((d) => (wv(d)['legs_m'] = [[200, 1200, 2600, 1500], [200, 1800, 2000, 2500]]))).toThrow(/legs_m\[0\]（揺らぎ ±224 m 込み）まで .* m は cover_m（1700 m）より遠い（出て直ぐに退かない）（V-W4/);
    expect(build((d) => (rescueOf(d)['sboat_wave2'] = null))).toThrow(/sboat_wave2 は S ボート（pt_boats）の任務では object（null は S ボートの無い任務だけ）（V-W2/);
  });
});

/** 群 2 つ（射界の内）と砲台 2 つ（射界 2,600 m）の台 */
function shellRig(): { st: RescueState; bs: SurvivorShellBattery[]; free: Uint8Array } {
  const rules = { ...R, groups: [{ x: 2600, y: 2600, count: 3 }, { x: 9000, y: 2600, count: 5 }] };
  const st = createRescueState(rules, 8);
  const p = (x: number): ShoreBatteryParams => ({ ...N.shoreBattery!, x, y: 4600 });
  const bs = [p(1600), p(2400)].map((q) => ({ p: q, state: createShoreBattery(BATTERY_SHELL_POOL_SIZE) }));
  return { st, bs, free: new Uint8Array([1, 1]) };
}

describe('生存者の海への砲撃（core/survivor-shelling）', () => {
  it('最初の 1 発は interval_s の後、以後 interval_s ごと（負の残りを繰り越す）: 300 秒で 25 発。射界の内の残りのある群の中心へ・弾は印 SURVIVOR_SHELL_GUN・代わる代わる', () => {
    const { st, bs, free } = shellRig();
    const s = createSurvivorShelling(R.shelling!);
    const rng = new SeededRng(48);
    const fired: [number, number, number, number][] = [];
    for (let k = 0; k < 300 * 60; k++) {
      stepSurvivorShelling(s, R.shelling!, bs, free, st, true, rng, FEEL_DT, (b, x, y) => fired.push([k, b, x, y]));
      for (const b of bs) for (const sh of b.state.shells) sh.active = false; // 着弾は砲台の段（ここでは弾を空けるだけ）
    }
    expect(fired.length).toBe(25);
    expect(fired[0]![0]).toBe(12 * 60 - 1);
    expect(fired.map((f) => f[1]).slice(0, 4)).toEqual([0, 1, 0, 1]);
    expect(fired.every((f) => f[2] === 2600 && f[3] === 2600)).toBe(true); // (9000, 2600) は射界の外
    expect([s.shots, s.lastBattery, survivorGroupsInArc(st, bs[0]!.p)]).toEqual([25, 0, 1]);
  });
  it('撃つ砲台が無い（自艇を撃てる・群が空いた・救助の時間の外）間は撃たず乱数も引かない。弾は砲台の位置から・1 発 3 回', () => {
    const { st, bs, free } = shellRig();
    const s = createSurvivorShelling(R.shelling!);
    const rng = new SeededRng(48);
    const spy = vi.spyOn(rng, 'next');
    free.fill(0);
    for (let k = 0; k < 20 * 60; k++) stepSurvivorShelling(s, R.shelling!, bs, free, st, true, rng, FEEL_DT, () => {});
    free.fill(1);
    for (let k = 0; k < 20 * 60; k++) stepSurvivorShelling(s, R.shelling!, bs, free, st, false, rng, FEEL_DT, () => {});
    expect([s.shots, spy.mock.calls.length, s.cooldownS]).toEqual([0, 0, 0]);
    stepSurvivorShelling(s, R.shelling!, bs, free, st, true, rng, FEEL_DT, () => {});
    expect([s.shots, spy.mock.calls.length]).toEqual([1, 3]);
    const sh = bs[0]!.state.shells.find((x) => x.active)!;
    expect([sh.x, sh.y, sh.gunIndex]).toEqual([1600, 4600, SURVIVOR_SHELL_GUN]);
    st.left[0] = 0;
    for (let k = 0; k < 30 * 60; k++) stepSurvivorShelling(s, R.shelling!, bs, free, st, true, rng, FEEL_DT, () => {});
    expect([s.shots, spy.mock.calls.length]).toEqual([1, 3]);
  });
  it('砲台の弾の段は印を onImpact の 4 つ目の引数で渡す（自艇へ撃った弾は 0）', () => {
    const { st, bs, free } = shellRig();
    const s = createSurvivorShelling({ intervalS: 0.01, dispersionFactor: 0.6 });
    stepSurvivorShelling(s, { intervalS: 0.01, dispersionFactor: 0.6 }, bs, free, st, true, new SeededRng(1), 1, () => {});
    const got: number[] = [];
    const c = { boat: { x: 0, y: 0, headingDeg: 0, speedMps: 0 } as BoatState, boatHalfLengthM: 8, boatHalfBeamM: 2, boatAfloat: true, detectOpenM: 0, smokeFactor: 1, smoke: null, smokeParams: null, bargesAlerted: false, flashM: 0 };
    for (let k = 0; k < 600 && got.length === 0; k++) stepShoreBattery(bs[0]!.state, bs[0]!.p, c, new SeededRng(2), FEEL_DT, FEEL_DT * TS, { onFire: () => {}, onImpact: (_x, _y, _h, g) => got.push(g) });
    expect(got).toEqual([SURVIVOR_SHELL_GUN]);
  });
});

describe('S ボートの第二波（core/sboat-wave）', () => {
  const P = N.ptBoats!;
  it('組み立て: 第一波の線・出発点（今夜の揺らぎ込み）はそのまま、後ろに第二波（seed+49 から x・y の 2 回、波で 1 つ）', () => {
    const rng = new SeededRng(7);
    const spy = vi.spyOn(rng, 'next');
    const q = sboatWaveParams(P, R.wave2!, rng);
    expect([q.count, spy.mock.calls.length]).toEqual([4, 2]);
    expect([...q.startX.subarray(0, 2), ...q.startY.subarray(0, 2), ...q.legs.subarray(0, 8)]).toEqual([...P.startX, ...P.startY, ...P.legs]);
    const r2 = new SeededRng(7);
    const dx = (r2.next() * 2 - 1) * 200;
    const dy = (r2.next() * 2 - 1) * 100;
    const out = { x0: 0, y0: 0, x1: 0, y1: 0, x: 0, y: 0, headingDeg: 0 };
    ptStartAt({ ...P, count: 2, legs: Float64Array.from(R.wave2!.legs.flat()) }, 1, dx, dy, false, out);
    expect([q.startX[3], q.startY[3], q.startHeadingDeg[3], q.legs[12]]).toEqual([out.x, out.y, out.headingDeg, out.x0]);
    const hq = sboatWaveParams(H.ptBoats!, H.rescue!.wave2!, new SeededRng(7));
    expect(hq.count).toBe(6);
  });
  it('出るまでは海域の外（凍結の stepPtSection は動かさない）・第一波がみな去って 60 秒（3,600 ステップ目。v0.8.5 IP4）で哨戒に 1 回・救助の時間が先に終われば出ない', () => {
    const p = sboatWaveParams(P, R.wave2!, new SeededRng(1));
    const q = createPtSection(p, PT_SHELL_POOL_SIZE);
    const w = createSboatWave(q, 2);
    expect([w.first, w.n, q.boats.map((b) => b.phase)]).toEqual([2, 2, [PT_PATROL, PT_PATROL, PT_OUT, PT_OUT]]);
    const at = [q.boats[2]!.x, q.boats[2]!.y];
    const c = checkAt(5000, 600, { targetValid: true, detectOpenM: 3600, visRange2: 2700 * 2700 });
    const rng = new SeededRng(5);
    const step = (k: number): boolean => {
      c.timeS = k * FEEL_DT;
      stepPtSection(q, p, c, rng, FEEL_DT, FEEL_DT * TS, events());
      return stepSboatWave(w, R.wave2!, q, false, FEEL_DT);
    };
    for (let k = 0; k < 600; k++) expect(step(k)).toBe(false);
    expect([q.boats[2]!.x, q.boats[2]!.y, q.out, w.armed]).toEqual([...at, 0, false]);
    q.boats[0]!.phase = PT_LEAVE;
    q.boats[1]!.phase = PT_SUNK;
    let spawnedAt = -1;
    for (let k = 600; k < 600 + 5500 && spawnedAt < 0; k++) if (step(k)) spawnedAt = k - 600;
    expect([spawnedAt, w.spawned, w.seq, sboatWaveAppeared(w)]).toEqual([3599, true, 1, 4]);
    for (let k = 0; k < 600; k++) expect(step(7000 + k)).toBe(false);
    expect(q.boats[2]!.x === at[0] && q.boats[2]!.y === at[1]).toBe(false); // 出た後は凍結の AI が動かす
    const q2 = createPtSection(p, PT_SHELL_POOL_SIZE);
    const w2 = createSboatWave(q2, 2);
    q2.boats[0]!.phase = PT_LEAVE;
    q2.boats[1]!.phase = PT_LEAVE;
    for (let k = 0; k < 60; k++) stepSboatWave(w2, R.wave2!, q2, false, FEEL_DT);
    stepSboatWave(w2, R.wave2!, q2, true, FEEL_DT);
    for (let k = 0; k < 6000; k++) stepSboatWave(w2, R.wave2!, q2, false, FEEL_DT);
    expect([w2.spawned, w2.skipped, q2.boats[2]!.phase, sboatWaveAppeared(w2)]).toEqual([false, true, PT_OUT, 2]);
  });
});

describe('世界の組み立て（systems/world-enemies・shore-guns）', () => {
  type BuildEnemies = (...a: unknown[]) => { pts: { section: { boats: { phase: number }[] }; wave: { first: number; n: number } | null; p: { count: number } } | null; shoreGuns: { shelling: unknown; seaShots: number } | null };
  const fakeScene = (): unknown => ({ add: { image: () => chain, text: () => chain, graphics: () => chain }, tweens: { add: () => chain }, textures: { exists: () => true, get: () => ({ customData: {} }) } });
  it('us_07: 隊は第一波 ＋ 第二波（ノーマル 4・ハード 6）・第二波は海域の外。生存者の海がある時だけ砲撃の持ち物（seed+48）。ほかの任務は第二波なし', async () => {
    const { buildEnemies } = (await import(/* @vite-ignore */ ['..', 'src', 'systems', 'world-enemies'].join('/'))) as { buildEnemies: BuildEnemies };
    for (const hard of [false, true]) {
      const s = setupOf('us_07', hard, 3);
      const boat = { x: 0, y: 0, headingDeg: 0, speedMps: 0 } as BoatState;
      const sv = { state: createRescueState(s.rescue!, 8), rules: s.rescue!, onShell: () => {} };
      const e = buildEnemies(fakeScene(), s, 3, boat, chain, {}, () => undefined, () => undefined, { stepTimeS: 0 }, null, gameData, sv);
      const n = hard ? 3 : 2;
      expect([e.pts!.p.count, e.pts!.wave!.first, e.pts!.wave!.n, e.pts!.section.boats.map((b) => b.phase)]).toEqual([2 * n, n, n, [...Array<number>(n).fill(PT_PATROL), ...Array<number>(n).fill(PT_OUT)]]);
      expect([e.shoreGuns!.shelling !== null, e.shoreGuns!.seaShots]).toEqual([true, 0]);
      const e0 = buildEnemies(fakeScene(), s, 3, boat, chain, {}, () => undefined, () => undefined, { stepTimeS: 0 }, null, gameData, null);
      expect(e0.shoreGuns!.shelling).toBeNull();
    }
    for (const id of ['jp_01', 'jp_04', 'jp_05']) {
      const s = setupOf(id, false, 3);
      const e = buildEnemies(fakeScene(), s, 3, { x: 0, y: 0, headingDeg: 0, speedMps: 0 } as BoatState, chain, {}, () => undefined, () => undefined, { stepTimeS: 0 }, null, gameData, null);
      if (e.pts) expect([e.pts.wave, e.pts.p.count], id).toEqual([null, s.ptBoats!.count]);
    }
  });
});

describe('確保（§7）', () => {
  it('core/survivor-shelling・core/sboat-wave の毎ステップの関数の本体に確保の形が無い（作る関数は除く）', () => {
    const a = scanAllocations('src/core/survivor-shelling.ts', ['createSurvivorShelling']);
    expect(a.names).toEqual(['createSurvivorShelling', 'groupInArcAt', 'stepSurvivorShelling', 'survivorGroupsInArc']);
    expect(a.bad).toEqual([]);
    const b = scanAllocations('src/core/sboat-wave.ts', ['sboatWaveParams', 'createSboatWave']);
    expect(b.names).toEqual(['createSboatWave', 'sboatWaveAppeared', 'sboatWaveParams', 'stepSboatWave']);
    expect(b.bad).toEqual([]);
    expect(code('src/core/survivor-shelling.ts')).not.toMatch(/Math\.random|from 'phaser'/);
    expect(code('src/core/sboat-wave.ts')).not.toMatch(/Math\.random|from 'phaser'/);
  });
});
