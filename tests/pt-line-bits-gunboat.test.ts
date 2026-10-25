// 2 行目のキーのビットの表の隼艇の変種（v0.6.6「日本ハードモード⑤：隼艇」の S5。spec-v066 §D.7。表と検査の本体は tests/pt-line-bits-kit）: 標的が隼艇（bit 30）の航過・連射・結果・突撃・
// 追ってくる PT と隼艇の方角（16〜18）・接触の結果の隼艇の HP（6〜11）、隼艇の砲の出来事（bit 15）、輸送隊の出来事の隼艇の沈没（3）と決着の末尾の浜の旗（bit 13）。
// v0.6.5 の変種と同じ (1)(2)(4) と、v0.6.5 の変種を合わせた (3)（同じモードの違う変種は印で区別される）。隼艇の方角・HP は文に出る変種だけに入る。
import { describe, expect, it } from 'vitest';
import type { BoatTelemetry } from '../src/core/boat-motion';
import { createGunboatTelemetry, type GunboatTelemetry } from '../src/core/gunboat';
import { PT_BREAK, PT_CHASE, PT_RUN_IN } from '../src/core/pt-boats';
import { PT_GUN_EV_CREW, PT_GUN_EV_SUNK } from '../src/core/pt-damage';
import { CONVOY_EV_ARRIVED, CONVOY_EV_GB_BEACH, CONVOY_EV_GB_SUNK, CONVOY_EV_SUNK, convoyKey } from '../src/ui/convoy-lines';
import { mergeBurstBits, ptGunEventKey } from '../src/ui/pt-gun-lines';
import { CONTACT_TAG, EVENT_TAG, PASSING, PASS_TAG, SUB, VARIANTS, bit, bits, contact, expectDistinct, expectFields, keyOf, pass, result, type Probe, type Variant } from './pt-line-bits-kit';

/** 自艇の南西 424 m の隼艇（HP 満タン 60）。隼艇の変種の over.gunboat */
const gbt = (o: Partial<GunboatTelemetry> = {}): GunboatTelemetry => ({ ...createGunboatTelemetry(), enabled: true, dx: -300, dy: 300, distM: 424, hp: 60, maxHp: 60, labelJa: '隼艇', ...o });
const GB = { gunboat: gbt() } as Partial<BoatTelemetry>;
const GB_NORTH = { gunboat: gbt({ dx: 0, dy: -400 }) } as Partial<BoatTelemetry>;
const GB_HP8 = { gunboat: gbt({ hp: 8 }) } as Partial<BoatTelemetry>;
const T30 = (v: number): number => (v | bit(30)) >>> 0;

const GUNBOAT_VARIANTS: Variant[] = [
  {
    name: 'pass-gunboat', group: 'pass', tagMask: PASS_TAG, tagValues: [bit(30)], fields: { fired: bit(0), target: bit(30), gbDir: bits(16, 18) }, key: pass,
    base: { fields: [], pt: { ...PASSING, targetKind: 2 }, over: GB }, probes: [{ fields: ['fired'], pt: { fired: true } }, { fields: ['gbDir'], over: GB_NORTH }],
  },
  {
    name: 'pass-burst-gunboat', group: 'pass', tagMask: PASS_TAG, tagValues: [T30(bit(6))], fields: { burst: bit(6), fired: bit(7), target: bit(30), gbDir: bits(16, 18) }, key: pass,
    base: { fields: [], pt: { ...PASSING, burst: true, threatPhase: PT_CHASE, targetKind: 2 }, over: GB }, probes: [{ fields: ['fired'], pt: { fired: true } }, { fields: ['gbDir'], over: GB_NORTH }],
  },
  {
    name: 'contact-result-gunboat', group: 'contact', tagMask: CONTACT_TAG, tagValues: [1, 2, 6].map(T30),
    fields: { sub: SUB, hp: bits(6, 11), m: bits(12, 15), n: bits(16, 19), h: bits(20, 25), burstResult: bit(27), target: bit(30), silencedResult: bit(29) }, key: result,
    base: { fields: [], pt: { detected: true, threatPhase: PT_BREAK, passes: 1, maxPasses: 4, lastPassFired: true, lastPassHits: 0, lastPassTargetKind: 2 }, over: GB },
    probes: [
      { fields: ['sub', 'h', 'hp'], pt: { lastPassHits: 3 } },
      { fields: ['sub', 'h', 'hp'], pt: { lastPassHits: 3 }, over: GB_HP8 },
      { fields: ['n'], pt: { passes: 99 } },
      { fields: ['m'], pt: { maxPasses: 99 } },
      { fields: ['sub'], pt: { lastPassFired: false } },
      { fields: ['sub', 'silencedResult'], pt: { lastPassFired: false, lastPassSilenced: true } },
      { fields: ['burstResult', 'n', 'm'], pt: { burstFired: true, bursts: 9 } },
      { fields: ['burstResult', 'n', 'm', 'sub', 'h', 'hp'], pt: { burstFired: true, bursts: 9, lastPassHits: 5 } },
    ],
  },
  {
    name: 'contact-rush-gunboat', group: 'contact', tagMask: CONTACT_TAG, tagValues: [3, 4].map(T30), fields: { sub: SUB, dir: bits(3, 5), dist: bits(6, 11), target: bit(30), gbDir: bits(16, 18) }, key: contact,
    base: { fields: [], pt: { detected: true, threatPhase: PT_RUN_IN, sighted: true, dx: 0, dy: -100, targetKind: 2 }, over: GB },
    probes: [{ fields: ['sub', 'dist'], pt: { sighted: false } }, { fields: ['dist'], pt: { dy: -5000 } }, { fields: ['dir', 'dist'], pt: { dx: 100, dy: 100 } }, { fields: ['gbDir'], over: GB_NORTH }],
  },
  {
    name: 'contact-chase-gunboat', group: 'contact', tagMask: CONTACT_TAG, tagValues: [T30(7)], fields: { sub: SUB, dir: bits(3, 5), dist: bits(6, 11), target: bit(30), gbDir: bits(16, 18) }, key: contact,
    base: { fields: [], pt: { detected: true, threatPhase: PT_CHASE, sighted: true, dx: 0, dy: -100, gunEverFired: true, targetKind: 2 }, over: GB },
    probes: [{ fields: ['dist'], pt: { sighted: false } }, { fields: ['dir', 'dist'], pt: { dx: -100, dy: 100 } }, { fields: ['gbDir'], over: GB_NORTH }],
  },
  {
    name: 'event-gunboat', group: 'event', tagMask: EVENT_TAG, tagValues: [bit(15)], fields: { kind: SUB, fighting: bits(3, 5), wait: bit(14), gunboat: bit(15) }, key: (t) => ptGunEventKey(t),
    base: { fields: [], pt: { gunEvent: PT_GUN_EV_CREW, fighting: 1, gunEventByGunboat: true }, cv: { resolved: true } },
    probes: [{ fields: ['kind'], pt: { gunEvent: PT_GUN_EV_SUNK } }, { fields: ['fighting'], pt: { fighting: 99 } }, { fields: ['fighting', 'wait'], pt: { fighting: 0 }, cv: { resolved: false } }],
  },
  {
    name: 'event-gunboat-merged', group: 'event', tagMask: EVENT_TAG, tagValues: [bit(6) | bit(15)],
    fields: { kind: SUB, fighting: bits(3, 5), merged: bit(6), mergedFired: bit(7), mergedHits: bits(8, 13), wait: bit(14), gunboat: bit(15) }, key: (t) => ptGunEventKey(t) | mergeBurstBits(t.pt),
    base: { fields: [], pt: { gunEvent: PT_GUN_EV_CREW, fighting: 1, gunEventByGunboat: true }, cv: { resolved: true } },
    probes: [{ fields: ['mergedFired'], pt: { lastPassFired: true } }, { fields: ['mergedHits'], pt: { lastPassHits: 99 } }],
  },
  {
    name: 'convoy-gunboat', group: 'convoy', tagMask: bit(0), tagValues: [1], fields: { enabled: bit(0), afloat: bits(1, 2), arrived: bits(3, 4), left: bits(5, 10), event: bits(11, 12), beach: bit(13) },
    key: (t, pr) => convoyKey(t.convoy, true, pr.event ?? 0),
    base: { fields: [], event: CONVOY_EV_GB_SUNK },
    probes: [
      { fields: ['event'], event: CONVOY_EV_SUNK },
      { fields: ['event', 'beach'], event: CONVOY_EV_ARRIVED | CONVOY_EV_GB_BEACH },
      { fields: ['beach'], event: CONVOY_EV_GB_SUNK | CONVOY_EV_GB_BEACH },
      { fields: ['afloat', 'arrived'], cv: { afloat: 0, arrived: 3 } },
    ],
  },
];
const byName = (name: string): Variant => GUNBOAT_VARIANTS.find((x) => x.name === name)!;

describe('2 行目のキーのビットの表: 隼艇の変種（v0.6.6。spec-v066 §D.7）', () => {
  it.each(GUNBOAT_VARIANTS.map((v) => [v.name, v] as const))('%s: 欄は重ならず、値を動かすとその欄だけ変わり、キーは欄の内で 0 < key < 2³¹', (_n, v) => {
    expectFields(v);
  });

  it('v0.6.5 の変種と合わせても、同じモードの違う変種は種類のビットか K_BURST・K_SILENCED・K_TARGET・隼艇の印で区別される（輸送隊のキーは 1 つの変種の値の違い）', () => {
    expectDistinct([...VARIANTS.filter((v) => v.group !== 'convoy'), ...GUNBOAT_VARIANTS.filter((v) => v.group !== 'convoy')]);
  });

  it('隼艇の方角・HP は文に出る変種だけに入る: 連射の線は PT の方角を持たない、追ってくる PT に射撃の勧めは立たない、被弾なしの結果は HP が減っても同じキー、被弾の結果は HP で変わる', () => {
    const same = (v: Variant, pr: Probe): void => expect(keyOf(v, pr), `${v.name} ${JSON.stringify(pr)}`).toBe(keyOf(v, null));
    same(byName('pass-burst-gunboat'), { fields: [], pt: { dx: 100, dy: 100 } });
    same(byName('contact-chase-gunboat'), { fields: [], pt: { gunEverFired: false } });
    same(byName('contact-result-gunboat'), { fields: [], over: GB_HP8 });
    const r = byName('contact-result-gunboat');
    expect(keyOf(r, r.probes[1]!)).not.toBe(keyOf(r, r.probes[0]!));
    // 撃つ PT が黙った線（撃退・制圧）は標的が隼艇でも v0.6.5 の黙った線のキー（pass-silenced 32・pass-burst の黙った 2112）
    const g = byName('pass-gunboat');
    expect(keyOf(g, { fields: [], pt: { passSilenced: true } })).toBe(32);
    expect(keyOf(byName('pass-burst-gunboat'), { fields: [], pt: { passSilenced: true } })).toBe(2112);
  });
});
