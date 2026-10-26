// v0.6.7 S5（spec-v067 §D.2 のキー・C.7 の C9・レビュー R5・R8）: 夜の哨戒機の 2 行目のキー（ui/patrol-lines の patrolKey）の欄が重ならず、1 つの値を動かすとその欄だけが変わり、
// どのキーも 0 < key < 2¹⁸。§I.2 のつまみの値（sweep_gap 16・orbit 12・lock 2000・1 機 3 発＝出撃 6 発）でも欄からあふれない。同じモードの副は副の欄で区別できる。
// 2 回の出撃の 2 回目のモード 33 の文とキーは 2 回目の分（SortieBase からの差。R5。本物の門番と夜の出撃で回す）。
import { describe, expect, it } from 'vitest';
import { AS_T_FALLING, AS_T_INBOUND, AS_T_ORBIT, AS_T_REST, AS_T_RUN } from '../src/core/air-strike';
import type { BoatTelemetry, SpeedStep } from '../src/core/boat-motion';
import { PA_HUNT, PA_KEY_BOMBS_MAX, PA_KEY_DIST_HM_MAX, PA_KEY_HP5_MAX, PA_KEY_NEAR_HM_MAX, PA_KEY_SEC_MAX, PA_KEY_WAKE_S_MAX, PA_LEAVE, PA_OFF, PA_ORBIT, PA_PASS, PA_SORTIE, createPatrolTelemetry, type PatrolTelemetry } from '../src/core/patrol-air-state';
import { MISSION_PATROL, MISSION_PATROL_ATTACK, MISSION_PATROL_PASS, MISSION_PATROL_RESULT, missionMode } from '../src/ui/mission-mode';
import { patrolKey, patrolLine } from '../src/ui/patrol-lines';
import { driveUntil, makeKit } from './patrol-world-kit';
import { tele } from './pt-ui-kit';

const P0: PatrolTelemetry = { ...createPatrolTelemetry(), enabled: true, planes: 2, quietKt: 14, wakeDetectM: 4200, lockM: 1500, nearM: 900, passes: 1, phase: PA_HUNT };
const key = (mode: number, o: Partial<PatrolTelemetry>, band: SpeedStep = 'full'): number => patrolKey(tele({ enabled: false }, { targetStep: band, patrol: { ...P0, ...o } }), mode);
const bits = (lo: number, hi: number): number => {
  let m = 0;
  for (let b = lo; b <= hi; b++) m |= 1 << b;
  return m >>> 0;
};

interface Probe { field: string; o: Partial<PatrolTelemetry> }
interface Variant { name: string; mode: number; band: SpeedStep; base: Partial<PatrolTelemetry>; fields: Record<string, number>; probes: Probe[] }

/** spec §D.2 の欄（31 の機は 2 ビット＝AIR_STRIKE_MAX_PLANES 4 機まで。34 は印のビット 17） */
const F31 = { threat: bits(0, 2), plane: bits(3, 4), arc: bits(5, 5), radar: bits(6, 6), dir: bits(7, 9), dist: bits(10, 14), left: bits(15, 17) };
const F32 = { sub: bits(0, 2), dir: bits(3, 5), dist: bits(6, 11), sec: bits(12, 16) };
const F33 = { kind: bits(0, 1), bombs: bits(2, 4), hits: bits(5, 7), hp5: bits(8, 12) };
const F34 = { sub: bits(0, 1), next: bits(2, 6), wake: bits(7, 9), dir: bits(10, 12), tag: bits(17, 17) };

const VARIANTS: Variant[] = [
  { name: '31 接近', mode: MISSION_PATROL_ATTACK, band: 'full', base: { phase: PA_SORTIE, threat: AS_T_INBOUND, bearingDeg: 56, distM: 1500 }, fields: F31, probes: [{ field: 'radar', o: { radar: true } }, { field: 'dir', o: { bearingDeg: 326 } }, { field: 'dist', o: { distM: 900 } }] },
  { name: '31 旋回', mode: MISSION_PATROL_ATTACK, band: 'full', base: { phase: PA_SORTIE, threat: AS_T_ORBIT, plane: 0, bombsLeft: 4 }, fields: F31, probes: [{ field: 'plane', o: { plane: 1 } }, { field: 'left', o: { bombsLeft: 3 } }, { field: 'plane', o: { plane: 3 } }] },
  { name: '31 進路', mode: MISSION_PATROL_ATTACK, band: 'full', base: { phase: PA_SORTIE, threat: AS_T_RUN, plane: 0 }, fields: F31, probes: [{ field: 'plane', o: { plane: 1 } }] },
  { name: '31 落下', mode: MISSION_PATROL_ATTACK, band: 'full', base: { phase: PA_SORTIE, threat: AS_T_FALLING, plane: 0 }, fields: F31, probes: [{ field: 'arc', o: { fallingArc: true } }] },
  { name: '32 レーダー', mode: MISSION_PATROL_PASS, band: 'stop', base: { phase: PA_PASS, radar: true, bearingDeg: 56, distM: 4200, countdownS: 6 }, fields: F32, probes: [{ field: 'dist', o: { distM: 4100 } }] },
  { name: '32 航跡', mode: MISSION_PATROL_PASS, band: 'full', base: { phase: PA_PASS, viaWake: true, bearingDeg: 146, distM: 4200, countdownS: 6 }, fields: F32, probes: [{ field: 'sec', o: { countdownS: 7 } }, { field: 'dist', o: { distM: 5000 } }, { field: 'dir', o: { bearingDeg: 236 } }] },
  { name: '32 定時', mode: MISSION_PATROL_PASS, band: 'silent', base: { phase: PA_PASS, bearingDeg: 146, distM: 4200, countdownS: 6 }, fields: F32, probes: [{ field: 'sec', o: { countdownS: 3 } }] },
  { name: '32 今すぐ（航跡）', mode: MISSION_PATROL_PASS, band: 'full', base: { phase: PA_PASS, viaWake: true, bearingDeg: 146, distM: 2400, countdownS: 0 }, fields: F32, probes: [{ field: 'dist', o: { distM: 1900 } }] },
  { name: '32 今すぐ（静音）', mode: MISSION_PATROL_PASS, band: 'silent', base: { phase: PA_PASS, bearingDeg: 146, distM: 1200, countdownS: 0 }, fields: F32, probes: [{ field: 'dist', o: { distM: 1000 } }] },
  { name: '32 止まって待つ', mode: MISSION_PATROL_PASS, band: 'stop', base: { phase: PA_PASS, bearingDeg: 146, distM: 1800, countdownS: 0 }, fields: F32, probes: [{ field: 'dist', o: { distM: 1000 } }, { field: 'dir', o: { bearingDeg: 0 } }] },
  { name: '32 付近', mode: MISSION_PATROL_PASS, band: 'stop', base: { phase: PA_ORBIT, bearingDeg: 146, distM: 900, orbitLeftS: 8 }, fields: F32, probes: [{ field: 'sec', o: { orbitLeftS: 3.5 } }] },
  { name: '33 去る', mode: MISSION_PATROL_RESULT, band: 'stop', base: { phase: PA_LEAVE, resultKind: 1 }, fields: F33, probes: [] },
  { name: '33 出撃', mode: MISSION_PATROL_RESULT, band: 'full', base: { phase: PA_SORTIE, threat: AS_T_REST, resultKind: 2, sortieBombs: 4 }, fields: F33, probes: [{ field: 'hits', o: { sortieHits: 1, sortieDamage: 0 } }, { field: 'hp5', o: { sortieDamage: 35 } }, { field: 'bombs', o: { sortieBombs: 2 } }] },
  { name: '34 レーダーの前', mode: MISSION_PATROL, band: 'stop', base: { phase: PA_HUNT, passes: 0, bearingDeg: 0 }, fields: F34, probes: [{ field: 'dir', o: { bearingDeg: 56 } }] },
  { name: '34 捜索中', mode: MISSION_PATROL, band: 'silent', base: { phase: PA_HUNT, nextPassS: 12 }, fields: F34, probes: [{ field: 'next', o: { nextPassS: 5 } }] },
  { name: '34 航跡', mode: MISSION_PATROL, band: 'full', base: { phase: PA_HUNT, nextPassS: 12, wakeLeftS: 3 }, fields: F34, probes: [{ field: 'wake', o: { wakeLeftS: 1 } }] },
  { name: '34 哨戒の後', mode: MISSION_PATROL, band: 'full', base: { phase: PA_OFF }, fields: F34, probes: [] },
];

const all = (f: Record<string, number>): number => Object.values(f).reduce((a, b) => (a | b) >>> 0, 0);

describe('夜の哨戒機の 2 行目のキーの欄（ui/patrol-lines の patrolKey。spec §D.2）', () => {
  it.each(VARIANTS.map((v) => [v.name, v] as const))('%s: 欄は重ならず、キーは欄の内で 0 < key < 2¹⁸、値を動かすとその欄だけが変わる', (_n, v) => {
    const names = Object.keys(v.fields);
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) expect(v.fields[names[i]!]! & v.fields[names[j]!]!).toBe(0);
    const base = key(v.mode, v.base, v.band);
    expect(base).toBeGreaterThan(0);
    expect(base).toBeLessThan(2 ** 18);
    expect((base & ~all(v.fields)) >>> 0).toBe(0);
    for (const pr of v.probes) {
      const k = key(v.mode, { ...v.base, ...pr.o }, v.band);
      expect(k, pr.field).not.toBe(base);
      expect(((k ^ base) & ~v.fields[pr.field]!) >>> 0, `${v.name} ${pr.field} の欄の外が変わった`).toBe(0);
      expect(k).toBeLessThan(2 ** 18);
    }
  });
  it('同じモードの副・脅威・種類は副の欄で区別できる', () => {
    const byMode = new Map<number, Set<number>>();
    for (const v of VARIANTS) {
      const f = v.mode === MISSION_PATROL_ATTACK ? F31.threat : v.mode === MISSION_PATROL_PASS ? F32.sub : v.mode === MISSION_PATROL_RESULT ? F33.kind : F34.sub;
      const tag = key(v.mode, v.base, v.band) & f;
      const s = byMode.get(v.mode) ?? new Set<number>();
      expect(s.has(tag), v.name).toBe(false);
      s.add(tag);
      byMode.set(v.mode, s);
    }
  });
  it('§I.2 のつまみの値（sweep_gap 16・orbit 12・lock 2000・1 機 3 発）と欄の上限でも欄からあふれない（C9）', () => {
    expect([PA_KEY_SEC_MAX, PA_KEY_DIST_HM_MAX, PA_KEY_NEAR_HM_MAX, PA_KEY_BOMBS_MAX, PA_KEY_WAKE_S_MAX, PA_KEY_HP5_MAX]).toEqual([31, 63, 31, 7, 7, 31]);
    const cases: [number, Partial<PatrolTelemetry>, SpeedStep, Record<string, number>, string, number][] = [
      [MISSION_PATROL, { phase: PA_HUNT, nextPassS: 16 }, 'silent', F34, 'next', 16],
      [MISSION_PATROL, { phase: PA_HUNT, nextPassS: PA_KEY_SEC_MAX }, 'silent', F34, 'next', PA_KEY_SEC_MAX],
      [MISSION_PATROL, { phase: PA_HUNT, wakeLeftS: PA_KEY_WAKE_S_MAX }, 'full', F34, 'wake', PA_KEY_WAKE_S_MAX],
      [MISSION_PATROL_PASS, { phase: PA_ORBIT, orbitLeftS: 12 }, 'stop', F32, 'sec', 12],
      [MISSION_PATROL_PASS, { phase: PA_PASS, viaWake: true, distM: 6300, countdownS: PA_KEY_SEC_MAX }, 'full', F32, 'dist', 63],
      [MISSION_PATROL_ATTACK, { phase: PA_SORTIE, threat: AS_T_INBOUND, distM: 2000 }, 'full', F31, 'dist', 20],
      [MISSION_PATROL_ATTACK, { phase: PA_SORTIE, threat: AS_T_ORBIT, plane: 1, bombsLeft: 6 }, 'full', F31, 'left', 6],
      [MISSION_PATROL_RESULT, { phase: PA_SORTIE, threat: AS_T_REST, resultKind: 2, sortieBombs: 6, sortieHits: 2, sortieDamage: 70 }, 'full', F33, 'hp5', 14],
    ];
    for (const [mode, o, band, f, field, want] of cases) {
      const k = key(mode, o, band);
      expect(k).toBeLessThan(2 ** 18);
      expect((k & ~all(f)) >>> 0).toBe(0);
      const m = f[field]!;
      let lo = 0;
      while (((m >>> lo) & 1) === 0) lo++;
      expect((k & m) >>> lo, `${field}`).toBe(want);
    }
  });
});

describe('2 回の出撃の 2 回目のモード 33（この出撃の分＝SortieBase からの差。R5）', () => {
  it('止まらずに逃げる夜（run）: 2 回目の出撃が去るとき「爆弾 6 発」（夜の累計 12 発ではない）、キーも 2 回目の分', () => {
    const k = makeKit(11);
    const result2 = (): boolean => k.flight.state.waves >= 2 && k.t.patrol.phase === PA_SORTIE && k.t.patrol.threat === AS_T_REST;
    expect(driveUntil(k, result2, 'run', 200)).toBe(true);
    const t: BoatTelemetry = k.t;
    expect(missionMode(t, 0, 0)).toBe(MISSION_PATROL_RESULT);
    expect(k.flight.state.bombsDropped).toBe(12);
    expect(t.patrol.sortieBombs).toBe(6);
    expect(t.patrol.sortieHits).toBe(k.flight.state.hitsPlayer - k.pa.base.hits0);
    expect(patrolLine(t, MISSION_PATROL_RESULT).text).toMatch(/^敵機 去る ・ 爆弾 6 発 命中 \d/);
    expect((patrolKey(t, MISSION_PATROL_RESULT) & F33.bombs) >>> 2).toBe(6);
  });
});
