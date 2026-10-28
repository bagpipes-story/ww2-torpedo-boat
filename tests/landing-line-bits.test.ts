// v0.6.9 S6a（spec-v069 §5.2 のキー）: 揚陸の 2 行目のキー（ui/landing-lines の landingKey・landingEventKey）の欄が重ならず、1 つの値を動かすとその欄だけが変わり、
// 欄の上限の値でもあふれない（landingKey < 2³⁰・landingEventKey < 2²⁶。どちらも 31 ビットの内）。同じモードの副・種類は副・種類の欄で区別できる。
import { describe, expect, it } from 'vitest';
import { LE_CALM, LE_DONE, LE_DUD, LE_ENGAGED, LE_HIT, LE_HURRIED, LE_MISS, LE_SUNK, LE_SUNK_DONE, type LandingTelemetry } from '../src/core/landing';
import type { PtTelemetry } from '../src/core/pt-boats';
import { LEK_COUNT, LEK_DIR, LEK_LEFT, LEK_PCT, LEK_STEP, LK_ARMED, LK_DIR, LK_LEFT, LK_PCT, LK_STEP, landingEventKey, landingKey } from '../src/ui/landing-lines';
import { MISSION_CALL, MISSION_LANDING_THREAT, MISSION_PT } from '../src/ui/mission-mode';
import { L0, tl } from './landing-ui-kit';

const bits = (lo: number, hi: number): number => {
  let m = 0;
  for (let b = lo; b <= hi; b++) m |= 1 << b;
  return m >>> 0;
};
const all = (f: Record<string, number>): number => Object.values(f).reduce((a, b) => (a | b) >>> 0, 0);

/** landingKey の欄（spec §5.2: 1 | 副 << 1 | 方角 << 4 | 刻み << 7 | % か雷跡の本数 << 13 | 残りの秒 << 20 | 撃てる隻数 << 28） */
const FK = { tag: bits(0, 0), sub: bits(1, 3), dir: bits(LK_DIR, LK_DIR + 2), step: bits(LK_STEP, LK_STEP + 5), pct: bits(LK_PCT, LK_PCT + 6), left: bits(LK_LEFT, LK_LEFT + 7), armed: bits(LK_ARMED, LK_ARMED + 1) };
/** landingEventKey の欄（種類 | 方角 << 4 | 斉射の 100 m << 7 | 本数 << 13 | % << 17 | 沈むまでの本数 << 24） */
const FE = { kind: bits(0, 3), dir: bits(LEK_DIR, LEK_DIR + 2), step: bits(LEK_STEP, LEK_STEP + 5), count: bits(LEK_COUNT, LEK_COUNT + 3), pct: bits(LEK_PCT, LEK_PCT + 6), left: bits(LEK_LEFT, LEK_LEFT + 1) };

const QUIET: Partial<PtTelemetry> = { alive: 2, detected: false, sighted: false };
const GONE: Partial<PtTelemetry> = { alive: 0, out: 2, detected: false, sighted: false };

interface Probe { field: string; o: Partial<LandingTelemetry> }
interface KVariant { name: string; mode: number; pt: Partial<PtTelemetry>; base: Partial<LandingTelemetry>; probes: Probe[] }
const KV: KVariant[] = [
  { name: '36 遠い', mode: MISSION_LANDING_THREAT, pt: QUIET, base: { reportSub: 1, reportDirIdx: 1, reportStep: 18 }, probes: [{ field: 'sub', o: { reportSub: 2 } }, { field: 'dir', o: { reportDirIdx: 6 } }, { field: 'step', o: { reportStep: 9 } }] },
  { name: '36 近い', mode: MISSION_LANDING_THREAT, pt: QUIET, base: { reportSub: 2, reportDirIdx: 0, reportStep: 13 }, probes: [{ field: 'dir', o: { reportDirIdx: 7 } }, { field: 'step', o: { reportStep: 63 } }] },
  { name: '36 雷跡', mode: MISSION_LANDING_THREAT, pt: QUIET, base: { wakes: 3, wakeCpaS: 11.2 }, probes: [{ field: 'step', o: { wakeCpaS: 2.5 } }, { field: 'step', o: { wakeCpaS: 80 } }, { field: 'pct', o: { wakes: 6 } }, { field: 'pct', o: { wakes: 200 } }] },
  { name: '平常', mode: MISSION_PT, pt: QUIET, base: { pct: 0.5, armed: 2 }, probes: [{ field: 'pct', o: { pct: 0.71 } }, { field: 'pct', o: { pct: 1 } }, { field: 'armed', o: { armed: 1 } }, { field: 'armed', o: { armed: 9 } }] },
  { name: 'みな去った後の待ち', mode: MISSION_PT, pt: GONE, base: { leftS: 61.2 }, probes: [{ field: 'left', o: { leftS: 30 } }, { field: 'left', o: { leftS: 999 } }] },
  { name: '呼びかけの待ち', mode: MISSION_CALL, pt: QUIET, base: { leftS: 61.2 }, probes: [{ field: 'left', o: { leftS: 139.1 } }, { field: 'left', o: { leftS: 0.1 } }] },
];

interface EVariant { name: string; base: Partial<LandingTelemetry>; probes: Probe[] }
const ev = (o: Partial<LandingTelemetry>): Partial<LandingTelemetry> => ({ eventSeq: 1, eventDirIdx: 1, eventCount: 3, eventM: 1250, eventHits: 0, eventPct: 0.5, ...o });
const EV: EVariant[] = [
  { name: '雷撃', base: ev({ eventKind: LE_CALM }), probes: [{ field: 'dir', o: { eventDirIdx: 7 } }, { field: 'count', o: { eventCount: 2 } }, { field: 'count', o: { eventCount: 40 } }] },
  { name: '慌てた', base: ev({ eventKind: LE_HURRIED }), probes: [{ field: 'dir', o: { eventDirIdx: 4 } }, { field: 'step', o: { eventM: 1150 } }, { field: 'step', o: { eventM: 99999 } }, { field: 'count', o: { eventCount: 4 } }] },
  { name: '戦いながら', base: ev({ eventKind: LE_ENGAGED, eventM: 812 }), probes: [{ field: 'step', o: { eventM: 450 } }, { field: 'dir', o: { eventDirIdx: 2 } }] },
  { name: '被雷', base: ev({ eventKind: LE_HIT, eventHits: 1 }), probes: [{ field: 'left', o: { eventHits: 0 } }] },
  { name: '不発', base: ev({ eventKind: LE_DUD, eventHits: 0 }), probes: [{ field: 'left', o: { eventHits: 1 } }] },
  { name: '外れ', base: ev({ eventKind: LE_MISS }), probes: [{ field: 'pct', o: { eventPct: 1 } }] },
  { name: '沈没', base: ev({ eventKind: LE_SUNK, eventPct: 0.64 }), probes: [{ field: 'pct', o: { eventPct: 0.99 } }] },
  { name: '揚陸完了', base: ev({ eventKind: LE_DONE, eventPct: 1 }), probes: [] },
  { name: '揚陸の後の沈没', base: ev({ eventKind: LE_SUNK_DONE, eventPct: 1 }), probes: [] },
];

const kKey = (v: KVariant, o: Partial<LandingTelemetry>): number => landingKey(tl({ ...v.base, ...o }, v.pt), v.mode);
const eKey = (o: Partial<LandingTelemetry>): number => landingEventKey({ ...L0, ...o });

describe('揚陸の 2 行目のキーの欄（ui/landing-lines。spec §5.2）', () => {
  it('欄は重ならない', () => {
    for (const f of [FK, FE]) {
      const names = Object.keys(f) as (keyof typeof f)[];
      for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) expect((f[names[i]!] & f[names[j]!]) >>> 0, `${String(names[i])}×${String(names[j])}`).toBe(0);
    }
    expect(all(FK)).toBe(bits(0, 29));
    expect(all(FE)).toBe(bits(0, 25));
  });
  it.each(KV.map((v) => [v.name, v] as const))('landingKey %s: 欄の内で 0 < key < 2³⁰、値を動かすとその欄だけが変わる', (_n, v) => {
    const base = kKey(v, {});
    expect(base & 1).toBe(1);
    expect(base).toBeLessThan(2 ** 30);
    expect((base & ~all(FK)) >>> 0).toBe(0);
    for (const pr of v.probes) {
      const k = kKey(v, pr.o);
      expect(k, `${v.name} ${pr.field}`).not.toBe(base);
      expect(((k ^ base) & ~FK[pr.field as keyof typeof FK]) >>> 0, `${v.name} ${pr.field} の欄の外が変わった`).toBe(0);
      expect(k).toBeLessThan(2 ** 30);
    }
  });
  it.each(EV.map((v) => [v.name, v] as const))('landingEventKey %s: 欄の内で 0 < key < 2²⁶、値を動かすとその欄だけが変わる', (_n, v) => {
    const base = eKey(v.base);
    expect(base).toBeGreaterThan(0);
    expect(base).toBeLessThan(2 ** 26);
    for (const pr of v.probes) {
      const k = eKey({ ...v.base, ...pr.o });
      expect(k, `${v.name} ${pr.field}`).not.toBe(base);
      expect(((k ^ base) & ~FE[pr.field as keyof typeof FE]) >>> 0, `${v.name} ${pr.field} の欄の外が変わった`).toBe(0);
      expect(k).toBeLessThan(2 ** 26);
    }
  });
  it('同じモードの副（遠い・近い・雷跡・待ち・平常）と出来事の種類は副・種類の欄で区別できる。文に出ない値はキーに入らない', () => {
    const subs = KV.map((v) => (kKey(v, {}) & FK.sub) >>> 1);
    expect(subs).toEqual([1, 2, 3, 0, 4, 4]);
    expect(new Set(EV.map((v) => eKey(v.base) & FE.kind)).size).toBe(EV.length);
    // 気づかれていない斉射の距離・被雷の % は文に出ない（キーは同じ）
    expect(eKey(ev({ eventKind: LE_CALM, eventM: 899 }))).toBe(eKey(ev({ eventKind: LE_CALM, eventM: 650 })));
    expect(eKey(ev({ eventKind: LE_HIT, eventHits: 1, eventPct: 0.3 }))).toBe(eKey(ev({ eventKind: LE_HIT, eventHits: 1, eventPct: 0.6 })));
    // 見えている PT の行（距離と方角は ptKey）と決着の後の呼びかけは印だけ
    expect(landingKey(tl({ pct: 0.3 }, { ...QUIET, sighted: true }), MISSION_PT)).toBe(1);
    expect(landingKey(tl({ resolved: true, leftS: 0 }, QUIET), MISSION_CALL)).toBe(1);
    expect(landingKey(tl({ leftS: 61.2 }, QUIET), MISSION_CALL)).toBe(landingKey(tl({ leftS: 61.2 }, GONE), MISSION_PT));
  });
});
