// 2 行目のキャッシュのキーのビットの表の共通の材料（v0.6.6。spec-v066 §D.7。tests/pt-line-bits・tests/pt-line-bits-gunboat が使う。テストではない＝vitest は *.test.ts だけ拾う）:
// 米PT の航過（モード 22）・接触（23）・平常（24）・射撃（25）・出来事（26）のキーと輸送隊のキーの、v0.6.5（main 55efa4d）の変種ごとのビットの欄と pin の値、検査の本体
// （(1) 同じ変種の欄は重ならない、(2) 1 つの値を動かすとその欄のビットだけが変わり、キーは欄の内で 0 < key < 2³¹、(3) 同じモードの違う変種は印のビットで区別される）。
// 印のビット: 種類（下 3 ビット）・K_BURST 6・K_SILENCED 5・K_TARGET 28（大発）・K_TARGET_GUNBOAT 30（隼艇。v0.6.6）・出来事の K_MERGED 6・K_GUNBOAT_EVENT 15（v0.6.6）。材料は jp_01 の世界（輸送隊あり）。
import { expect } from 'vitest';
import { gameData } from '../src/config/game-data';
import { PT_GUN_SHELL_POOL_SIZE, PT_SHELL_POOL_SIZE } from '../src/config/pt-config';
import type { BoatState, BoatTelemetry } from '../src/core/boat-motion';
import type { ConvoyTelemetry } from '../src/core/convoy';
import { createConvoy } from '../src/core/convoy';
import { GUN_FIRING, GUN_NO_TARGET, GUN_OUT_OF_ARC, GUN_OUT_OF_RANGE, GUN_SAFE } from '../src/core/gun-battery';
import { PT_ALERT, PT_BREAK, PT_CHASE, PT_PASS, PT_RUN_IN, createPtSection, type PtTelemetry } from '../src/core/pt-boats';
import { PT_GUN_EV_CREW, PT_GUN_EV_SUNK } from '../src/core/pt-damage';
import { PT_GUN_RELOAD, createPtGun } from '../src/core/pt-gun';
import { initConvoyTelemetry } from '../src/systems/convoy-telemetry';
import { initPtTelemetry } from '../src/systems/pt-telemetry';
import { buildWorldSetup } from '../src/systems/world-setup';
import { CONVOY_EV_ARRIVED, CONVOY_EV_SUNK, convoyKey } from '../src/ui/convoy-lines';
import { MISSION_PT, MISSION_PT_CONTACT, MISSION_PT_PASS, MODE_FLAG_PT_RESULT } from '../src/ui/mission-mode';
import { mergeBurstBits, ptGunEventKey, ptGunKey } from '../src/ui/pt-gun-lines';
import { ptKey } from '../src/ui/pt-lines';
import { tele } from './pt-ui-kit';

const S = buildWorldSetup(gameData, 'jp_01');

/** jp_01 の出撃時のテレメトリ（tests/jp01-mission の tele01 と同じ）に pt・over・convoy を重ねる */
export function t01(pt: Partial<PtTelemetry> = {}, over: Partial<BoatTelemetry> = {}, cv: Partial<ConvoyTelemetry> = {}): BoatTelemetry {
  const p = S.ptBoats!;
  const g = S.guns!;
  const boat: BoatState = { ...S.playerStart, speedMps: 0 };
  const pt0 = initPtTelemetry({ pts: { section: createPtSection(p, PT_SHELL_POOL_SIZE), p, firstDetectBand: '', enemyId: 'us_pt_enemy', gun: { state: createPtGun(g, PT_GUN_SHELL_POOL_SIZE), g } }, boat: { state: boat }, params: S.boatParams, visRange2: S.visRange2, damageParams: S.damageParams });
  const convoy = initConvoyTelemetry({ convoy: { state: createConvoy(S.convoy!.params), p: S.convoy!.params }, boat: { state: boat }, setup: { playerStart: S.playerStart, enemyFrom: S.enemyFrom } });
  return tele({ ...pt0, ...pt }, { homeEdgeM: 2715, ...over, convoy: { ...convoy, ...cv } });
}

/** lo〜hi のビット（両端を含む） */
export function bits(lo: number, hi: number): number {
  let m = 0;
  for (let b = lo; b <= hi; b++) m |= 1 << b;
  return m >>> 0;
}
export const bit = (b: number): number => bits(b, b);

/** 1 つの試し: 動かす値（pt・over・convoy・出来事の種類・連射の結果を足すか）と、変わってよい欄 */
export interface Probe { fields: string[]; pt?: Partial<PtTelemetry>; over?: Partial<BoatTelemetry>; cv?: Partial<ConvoyTelemetry>; event?: number; merge?: boolean }
export interface Variant {
  name: string;
  /** 同じモードの変種を見分ける（key & mask が values のどれか） */
  group: string; tagMask: number; tagValues: number[];
  fields: Record<string, number>;
  key: (t: BoatTelemetry, pr: Probe) => number;
  base: Probe;
  probes: Probe[];
}

export const SUB = bits(0, 2);
/** 同じモードの変種を見分ける印（v0.6.6 で隼艇の bit 30・bit 15 を足した。v0.6.5 の変種の印の値は 0 のまま） */
export const PASS_TAG = bit(5) | bit(6) | bit(28) | bit(30);
export const CONTACT_TAG = SUB | bit(30);
export const EVENT_TAG = bit(6) | bit(15);
export const pass = (t: BoatTelemetry): number => ptKey(t, MISSION_PT_PASS, 0);
export const contact = (t: BoatTelemetry): number => ptKey(t, MISSION_PT_CONTACT, 0);
export const result = (t: BoatTelemetry): number => ptKey(t, MISSION_PT_CONTACT, MODE_FLAG_PT_RESULT);
export const normal = (t: BoatTelemetry): number => ptKey(t, MISSION_PT, 0);
export const PASSING: Partial<PtTelemetry> = { detected: true, passing: true, threatPhase: PT_PASS, sighted: true, dx: 0, dy: -100 };
export const FIRE_HINT = bit(26);

/** v0.6.5（main 55efa4d）の変種（標的の種類 0 自艇・1 大発） */
export const VARIANTS: Variant[] = [
  {
    name: 'pass-player', group: 'pass', tagMask: PASS_TAG, tagValues: [0], fields: { fired: bit(0), straight: bit(1), escape: bits(2, 4) }, key: pass,
    base: { fields: [], pt: { ...PASSING, dodge: 1, escapeDeg: 45 } },
    probes: [{ fields: ['fired'], pt: { fired: true } }, { fields: ['straight', 'escape'], pt: { dodge: 0 } }, { fields: ['escape'], pt: { escapeDeg: 315 } }],
  },
  { name: 'pass-silenced', group: 'pass', tagMask: PASS_TAG, tagValues: [bit(5)], fields: { silenced: bit(5) }, key: pass, base: { fields: [], pt: { ...PASSING, passSilenced: true } }, probes: [] },
  {
    name: 'pass-barge', group: 'pass', tagMask: PASS_TAG, tagValues: [bit(28)], fields: { fired: bit(0), target: bit(28) }, key: pass,
    base: { fields: [], pt: { ...PASSING, targetKind: 1 } }, probes: [{ fields: ['fired'], pt: { fired: true } }],
  },
  {
    name: 'pass-burst', group: 'pass', tagMask: PASS_TAG, tagValues: [bit(6)],
    fields: { burst: bit(6), fired: bit(7), dir: bits(8, 10), silenced: bit(11), retired: bit(12), arc: bit(13), bow: bit(14) }, key: pass,
    base: { fields: [], pt: { ...PASSING, burst: true, threatPhase: PT_CHASE } },
    probes: [
      { fields: ['fired'], pt: { fired: true } },
      { fields: ['dir'], pt: { dx: 100, dy: 100 } },
      { fields: ['silenced'], pt: { passSilenced: true } },
      { fields: ['silenced', 'retired'], pt: { passSilenced: true, passRetired: true } },
      { fields: ['arc'], pt: { gunStatus: GUN_OUT_OF_ARC }, over: { headingDeg: 180 } },
      { fields: ['arc', 'bow'], pt: { gunStatus: GUN_OUT_OF_ARC }, over: { headingDeg: 0 } },
    ],
  },
  {
    name: 'contact-result', group: 'contact', tagMask: CONTACT_TAG, tagValues: [1, 2, 6],
    fields: { sub: SUB, m: bits(12, 15), n: bits(16, 19), h: bits(20, 25), burstResult: bit(27), target: bit(28), silencedResult: bit(29) }, key: result,
    base: { fields: [], pt: { detected: true, threatPhase: PT_BREAK, passes: 1, maxPasses: 4, lastPassFired: true, lastPassHits: 0 } },
    probes: [
      { fields: ['sub', 'h'], pt: { lastPassHits: 3 } },
      { fields: ['h', 'sub'], pt: { lastPassHits: 99 } },
      { fields: ['n'], pt: { passes: 99 } },
      { fields: ['m'], pt: { maxPasses: 99 } },
      { fields: ['target'], pt: { lastPassTargetKind: 1 } },
      { fields: ['sub'], pt: { lastPassFired: false } },
      { fields: ['sub', 'target', 'silencedResult'], pt: { lastPassFired: false, lastPassTargetKind: 1, lastPassSilenced: true } },
      { fields: ['burstResult', 'n', 'm'], pt: { burstFired: true, bursts: 9 } },
    ],
  },
  {
    name: 'contact-rush', group: 'contact', tagMask: CONTACT_TAG, tagValues: [3, 4], fields: { sub: SUB, dir: bits(3, 5), dist: bits(6, 11), target: bit(28) }, key: contact,
    base: { fields: [], pt: { detected: true, threatPhase: PT_RUN_IN, sighted: true, dx: 0, dy: -100 } },
    probes: [
      { fields: ['sub', 'dist'], pt: { sighted: false } },
      { fields: ['dist'], pt: { dy: -5000 } },
      { fields: ['dir', 'dist'], pt: { dx: 100, dy: 100 } },
      { fields: ['target'], pt: { targetKind: 1 } },
      { fields: ['dist'], pt: { threatPhase: PT_ALERT, dy: -600 } },
    ],
  },
  {
    name: 'contact-break', group: 'contact', tagMask: CONTACT_TAG, tagValues: [5], fields: { sub: SUB, near: bits(6, 11), hint: FIRE_HINT }, key: contact,
    base: { fields: [], pt: { detected: true, threatPhase: PT_BREAK, sighted: true, dx: 0, dy: -100, gunEverFired: true }, cv: { nearestM: 100 } },
    probes: [{ fields: ['hint'], pt: { gunEverFired: false } }, { fields: ['near'], cv: { nearestM: 2000 } }, { fields: ['near'], cv: { nearestM: 99999 } }],
  },
  {
    name: 'contact-chase', group: 'contact', tagMask: CONTACT_TAG, tagValues: [7], fields: { sub: SUB, dir: bits(3, 5), dist: bits(6, 11), hint: FIRE_HINT }, key: contact,
    base: { fields: [], pt: { detected: true, threatPhase: PT_CHASE, sighted: true, dx: 0, dy: -100, gunEverFired: true } },
    probes: [{ fields: ['dist'], pt: { sighted: false } }, { fields: ['dir', 'dist'], pt: { dx: -100, dy: 100 } }, { fields: ['dist'], pt: { dy: -5000 } }, { fields: ['hint'], pt: { gunEverFired: false } }],
  },
  {
    name: 'normal-slow', group: 'normal', tagMask: SUB, tagValues: [1], fields: { sub: SUB, dir: bits(3, 5), dist: bits(6, 11) }, key: normal,
    base: { fields: [], pt: { sighted: true, dx: 0, dy: -300 } }, probes: [{ fields: ['dir', 'dist'], pt: { dx: 300, dy: 0 } }, { fields: ['dist'], pt: { dy: -5000 } }],
  },
  {
    name: 'normal-fast', group: 'normal', tagMask: SUB, tagValues: [2], fields: { sub: SUB, dist: bits(6, 11), det: bits(12, 17) }, key: normal,
    base: { fields: [], pt: { sighted: true, dx: 0, dy: -300 }, over: { targetStep: 'full', detectRangeM: 1920 } },
    probes: [{ fields: ['dist'], pt: { dy: -800 } }, { fields: ['det'], over: { targetStep: 'cruise', detectRangeM: 99999 } }],
  },
  {
    name: 'normal-unseen', group: 'normal', tagMask: SUB, tagValues: [3], fields: { sub: SUB, count: bits(18, 20) }, key: normal,
    base: { fields: [] }, probes: [{ fields: ['count'], pt: { alive: 1 } }, { fields: ['count'], pt: { alive: 99 } }],
  },
  {
    name: 'normal-gone', group: 'normal', tagMask: SUB, tagValues: [4], fields: { sub: SUB, gone: bits(21, 23), home: bits(24, 29), wait: bit(30) }, key: normal,
    base: { fields: [], pt: { alive: 0 }, cv: { resolved: true } },
    probes: [
      { fields: ['gone'], over: { dawn: { reached: true } } as unknown as Partial<BoatTelemetry> },
      { fields: ['gone'], pt: { out: 2 } },
      { fields: ['gone'], pt: { sunk: 2 } },
      { fields: ['home'], over: { homeEdgeM: 99999 } },
      { fields: ['home', 'wait'], cv: { resolved: false } },
    ],
  },
  {
    name: 'gun-firing', group: 'gun', tagMask: SUB, tagValues: [GUN_FIRING], fields: { status: SUB, fast: bit(3), far: bit(4), dist: bits(5, 10), hits: bits(11, 16) }, key: (t) => ptGunKey(t),
    base: { fields: [], pt: { gunStatus: GUN_FIRING, gunTargetM: 200, gunHits: 1 } },
    probes: [
      { fields: ['fast', 'hits'], pt: { gunFast: true } },
      { fields: ['far', 'dist', 'hits'], pt: { gunTargetM: 550 } },
      { fields: ['far', 'dist', 'hits'], pt: { gunTargetM: 99999 } },
      { fields: ['hits'], pt: { gunHits: 99 } },
    ],
  },
  { name: 'gun-reload', group: 'gun', tagMask: SUB, tagValues: [PT_GUN_RELOAD], fields: { status: SUB, reload: bits(17, 19) }, key: (t) => ptGunKey(t), base: { fields: [], pt: { gunStatus: PT_GUN_RELOAD, reloadLeftS: 0.2 } }, probes: [{ fields: ['reload'], pt: { reloadLeftS: 99 } }] },
  {
    name: 'gun-other', group: 'gun', tagMask: SUB, tagValues: [GUN_SAFE, GUN_NO_TARGET, GUN_OUT_OF_ARC, GUN_OUT_OF_RANGE], fields: { status: SUB }, key: (t) => ptGunKey(t),
    base: { fields: [], pt: { gunStatus: GUN_OUT_OF_ARC } }, probes: [{ fields: ['status'], pt: { gunStatus: GUN_OUT_OF_RANGE } }, { fields: ['status'], pt: { gunStatus: 5 } }],
  },
  {
    name: 'event', group: 'event', tagMask: EVENT_TAG, tagValues: [0], fields: { kind: SUB, fighting: bits(3, 5), wait: bit(14) }, key: (t) => ptGunEventKey(t),
    base: { fields: [], pt: { gunEvent: PT_GUN_EV_CREW, fighting: 1 }, cv: { resolved: true } },
    probes: [{ fields: ['kind'], pt: { gunEvent: PT_GUN_EV_SUNK } }, { fields: ['fighting'], pt: { fighting: 99 } }, { fields: ['fighting', 'wait'], pt: { fighting: 0 }, cv: { resolved: false } }],
  },
  {
    name: 'event-merged', group: 'event', tagMask: EVENT_TAG, tagValues: [bit(6)], fields: { kind: SUB, fighting: bits(3, 5), merged: bit(6), mergedFired: bit(7), mergedHits: bits(8, 13), wait: bit(14) },
    key: (t) => ptGunEventKey(t) | mergeBurstBits(t.pt),
    base: { fields: [], pt: { gunEvent: PT_GUN_EV_CREW, fighting: 1 }, cv: { resolved: true } },
    probes: [{ fields: ['mergedFired'], pt: { lastPassFired: true } }, { fields: ['mergedHits'], pt: { lastPassHits: 99 } }, { fields: ['fighting', 'wait'], pt: { fighting: 0 }, cv: { resolved: false } }],
  },
  {
    name: 'convoy', group: 'convoy', tagMask: bit(0), tagValues: [1], fields: { enabled: bit(0), afloat: bits(1, 2), arrived: bits(3, 4), left: bits(5, 10), event: bits(11, 12) },
    key: (t, pr) => convoyKey(t.convoy, true, pr.event ?? 0),
    base: { fields: [] },
    probes: [
      { fields: ['afloat', 'arrived'], cv: { afloat: 1, arrived: 2 } },
      { fields: ['afloat'], cv: { afloat: 0 } },
      { fields: ['left'], cv: { leftM: 99999 } },
      { fields: ['event'], event: CONVOY_EV_SUNK },
      { fields: ['event'], event: CONVOY_EV_ARRIVED },
    ],
  },
];

/** 試し（base に probe を重ねる）のキー */
export function keyOf(v: Variant, pr: Probe | null): number {
  const t = t01({ ...v.base.pt, ...pr?.pt }, { ...v.base.over, ...pr?.over }, { ...v.base.cv, ...pr?.cv });
  return v.key(t, { ...v.base, ...pr, fields: [] });
}
export function keysOf(v: Variant): number[] {
  return [keyOf(v, null), ...v.probes.map((pr) => keyOf(v, pr))];
}
export function maskOf(v: Variant, names: string[]): number {
  let m = 0;
  for (const n of names) {
    expect(v.fields[n], `${v.name} の欄 ${n}`).toBeDefined();
    m |= v.fields[n]!;
  }
  return m >>> 0;
}

/** v0.6.5（main 55efa4d）のキー（変種ごとに base と probes の順）。隼艇の欄を足した後も同じ値（spec-v066 §D.7 (4)） */
export const PINNED: Record<string, number[]> = {
  'pass-player': [4, 5, 2, 28],
  'pass-silenced': [32],
  'pass-barge': [268435456, 268435457],
  'pass-burst': [64, 192, 832, 2112, 6208, 8256, 24640],
  'contact-result': [81921, 3227650, 66142210, 999425, 126977, 268517377, 81926, 805388294, 134807553],
  'contact-rush': [131, 4, 4035, 219, 268435587, 771],
  'contact-break': [5, 67108869, 1285, 4037],
  'contact-chase': [135, 7, 239, 4039, 67108999],
  'normal-slow': [385, 401, 4033],
  'normal-fast': [156034, 156674, 258434],
  'normal-unseen': [524291, 262147, 1835011],
  'normal-gone': [469762052, 471859204, 473956356, 482344964, 1056964612, 1543503876],
  'gun-firing': [2177, 137, 369, 2033, 129153],
  'gun-reload': [131078, 917510],
  'gun-other': [3, 4, 2],
  'event': [9, 11, 57, 16385],
  'event-merged': [73, 201, 16201, 16449],
  'convoy': [903, 915, 897, 2023, 2951, 4999],
};

/** (1)(2)(4): 欄は重ならず、値を動かすとその欄だけ変わり、キーは欄の内で 0 < key < 2³¹ */
export function expectFields(v: Variant): void {
  const names = Object.keys(v.fields);
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) expect(v.fields[names[i]!]! & v.fields[names[j]!]!, `${names[i]} と ${names[j]}`).toBe(0);
  const all = maskOf(v, names);
  const base = keyOf(v, null);
  for (const k of keysOf(v)) {
    expect(k, `${v.name} ${k}`).toBeGreaterThan(0);
    expect(k).toBeLessThan(2 ** 31);
    expect((k & ~all) >>> 0, `${v.name} の欄の外のビット（key ${k}）`).toBe(0);
  }
  for (const pr of v.probes) {
    const k = keyOf(v, pr);
    expect(k, `${v.name} ${pr.fields.join('+')} で変わる`).not.toBe(base);
    expect(((k ^ base) & ~maskOf(v, pr.fields)) >>> 0, `${v.name} ${pr.fields.join('+')} の欄の外が変わった`).toBe(0);
  }
}

/** (3): 同じモード（group）の違う変種は印のビットで区別される（ほかの変種の印を持たない） */
export function expectDistinct(variants: Variant[]): void {
  for (const v of variants) {
    for (const k of keysOf(v)) {
      for (const w of variants) {
        if (w.group !== v.group) continue;
        expect(w.tagValues.includes(k & w.tagMask), `${v.name} の key ${k} が ${w.name} の印${w === v ? 'を持たない' : 'を持つ'}`).toBe(w === v);
      }
    }
  }
}
