// v0.8.2 S2（spec-v0820 §4.4 D-G1・D-G2・D-G5・§8 の S2「magazine-world」、lead の L21・L26）: 戦艦の弾薬庫の世界の配線（systems/ship-magazine・torpedo-hits の 1 行・world-enemies が付ける）を、
// 本物の DestroyerGroup（tests/column-world-kit）と本物の torpedo-hits の命中の手で確かめる:
// - 引くのは戦艦（山城・扶桑）の 3 本目・4 本目の命中だけ（沈む本数 6 に届く前）。1・2・5 本目・沈む 6 本目・不発・終わり際の当たりは引かない。駆逐艦・重巡は規則が無く引かない。
// - 乱数は seed+44 の系列だけ（同じ seed の SeededRng の写しと同じ結果）。誘爆はその場で今の沈む道（playSinking＝sinking・沈み始めた秒）。記録は艦ごとの秒・何本目・引いた回数・確率の和。
// - ?debug&boom（magazineBoom）は確率 1＝3 本目で必ず誘爆。
// - ほかの任務は隊の magazine が null（作らない＝系列も作らない）・torpedo-hits の式は takeHit だけ。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { hasHardVariant } from '../src/config/mission-data';
import type { BoatState } from '../src/core/boat-motion';
import type { ShotRecord } from '../src/core/hit-rate';
import { MAGAZINE_SEED_OFFSET } from '../src/core/magazine-detonation';
import { SeededRng } from '../src/core/rng';
import { createTorpedoState, type TorpedoState } from '../src/core/torpedo';
import { ShipMagazine } from '../src/systems/ship-magazine';
import { torpedoEventsFor, type TorpedoHitWorld } from '../src/systems/torpedo-hits';
import type { WorldEvents } from '../src/systems/world-events';
import { groupOf, sceneOf, setupOf, type ColGroup } from './column-world-kit';
import { code } from './core-rules-kit';
import { chain } from './torpedo-free-kit';

const YAMASHIRO = 5;
const FUSO = 6;
const MOGAMI = 3;
type BuildEnemies = (...a: unknown[]) => { destroyers: ColGroup | null; recon: unknown };
const { buildEnemies } = (await import(/* @vite-ignore */ ['..', 'src', 'systems', 'world-enemies'].join('/'))) as { buildEnemies: BuildEnemies };
const PROTO_IDS = (gameData.missionsSeed.missions as unknown as Record<string, unknown>[]).filter((m) => m['v0_1_prototype']).map((m) => m['id'] as string);

interface Hits {
  g: ColGroup;
  w: TorpedoHitWorld & { stepTimeS: number; hits: number };
  hit: (i: number, dud?: boolean) => void;
  late: (i: number) => void;
  sunkEvents: number;
}
/** us_05 の隊（揺らぎなし）に seed の弾薬庫を付け、本物の命中の手を作る。o は setup の上書き（boom） */
function hitsOf(seed = 1, o: { magazineBoom?: boolean; hard?: boolean } = {}): Hits {
  const s = setupOf('us_05', o.hard ?? false, undefined, o.magazineBoom ? { magazineBoom: true } : {});
  const g = groupOf(s);
  g.magazine = ShipMagazine.of(s.transit!.column, 0, g.total, seed);
  for (const d of g.ships) d.offMap = false; // 海域の中（狙える）
  const shots: ShotRecord[] = [];
  const h: Hits = { g, w: undefined as never, hit: () => undefined, late: () => undefined, sunkEvents: 0 };
  const w = { shots, hits: 0, slowMoLeftS: 0, setup: { slowMoSeconds: 1 }, destroyers: g, launcher: { clearQueue: () => undefined }, dawn: { reached: false, retireHeadingDeg: NaN }, stepTimeS: 12.5 };
  const events = { onTorpedoHit: () => undefined, onDestroyerSunk: () => void h.sunkEvents++ } as unknown as WorldEvents;
  const ev = torpedoEventsFor(w as TorpedoHitWorld, events);
  const torp = (dud: boolean): TorpedoState => ({ ...createTorpedoState(), dud, rangeAtLaunchM: 900, kpiTarget: false });
  h.w = w as Hits['w'];
  h.hit = (i, dud = false) => ev.onHit(i, 0, 0, torp(dud));
  h.late = (i) => ev.onLateHit(i, 0, 0, torp(false));
  return h;
}

describe('引くのは戦艦の 3・4 本目だけ（D-G1）', () => {
  it('山城に 6 本: 3 本目・4 本目にちょうど 1 回ずつ（確率の和 0.09）。誘爆しなければ 6 本目で沈む（沈む本数は記録の 6）', () => {
    const replica = (seed: number): [boolean, boolean] => { const r = new SeededRng((seed + MAGAZINE_SEED_OFFSET) >>> 0); return [r.next() < 0.03, r.next() < 0.06]; };
    let quiet = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const h = hitsOf(seed);
      const d = h.g.ships[YAMASHIRO]!;
      const log = h.g.magazine!.log;
      const draws: number[] = [];
      for (let k = 1; k <= 6 && !d.sinking; k++) {
        h.hit(YAMASHIRO);
        draws.push(log.draws[YAMASHIRO]!);
      }
      const [b3, b4] = replica(seed);
      const want = b3 ? 3 : b4 ? 4 : 6;
      expect(d.hitsTaken, `seed ${seed}`).toBe(want);
      expect(d.sinking, `seed ${seed}`).toBe(true);
      expect(draws, `seed ${seed}`).toEqual([0, 0, 1, 2, 2, 2].slice(0, want));
      expect([log.onHit[YAMASHIRO], h.g.magazine!.detonations], `seed ${seed}`).toEqual(want < 6 ? [want, 1] : [0, 0]);
      if (want === 6) {
        quiet++;
        expect(log.chanceSum[YAMASHIRO]).toBeCloseTo(0.09, 12);
        expect(log.detonatedAtS[YAMASHIRO]).toBeNaN();
      } else expect(log.detonatedAtS[YAMASHIRO]).toBe(12.5);
    }
    expect(quiet).toBeGreaterThan(45); // 1 − 0.97 × 0.94 ＝ 8.8% しか誘爆しない
  });
  it('駆逐艦（満潮）は 2 本・重巡（最上）は 3 本で今の沈む道。どちらも引かない。扶桑は山城と別の艦（記録も別の添字）', () => {
    const h = hitsOf(3);
    h.hit(0);
    h.hit(0);
    for (let k = 0; k < 3; k++) h.hit(MOGAMI);
    h.hit(FUSO);
    h.hit(FUSO);
    expect([h.g.ships[0]!.sinking, h.g.ships[MOGAMI]!.sinking, h.g.ships[FUSO]!.sinking]).toEqual([true, true, false]);
    expect(Array.from(h.g.magazine!.log.draws)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(h.g.magazine!.rules.map((r) => r !== null)).toEqual([false, false, false, false, false, true, true]);
  });
  it('不発と終わり際の当たりは引かない（hitsTaken も変えない）', () => {
    const h = hitsOf(1);
    h.hit(YAMASHIRO);
    h.hit(YAMASHIRO);
    for (let k = 0; k < 5; k++) h.hit(YAMASHIRO, true);
    h.late(YAMASHIRO);
    expect([h.g.ships[YAMASHIRO]!.hitsTaken, h.g.magazine!.draws]).toEqual([2, 0]);
  });
});

describe('?debug&boom（確率 1）と誘爆の沈み方', () => {
  it('3 本目で必ず誘爆: その場で今の沈む道（sinking・沈み始めた秒は世界の秒）・記録は 12.5 秒・3 本目・引いた 1 回・確率の和 1。撃沈に数える（sunkCount）', () => {
    for (const seed of [1, 2, 99]) {
      const h = hitsOf(seed, { magazineBoom: true });
      const d = h.g.ships[FUSO]!;
      h.hit(FUSO);
      h.hit(FUSO);
      expect(d.sinking).toBe(false);
      h.hit(FUSO);
      const log = h.g.magazine!.log;
      expect([d.sinking, d.sinkStartS, d.hitsTaken, log.detonatedAtS[FUSO], log.onHit[FUSO], log.draws[FUSO], log.chanceSum[FUSO], h.g.sunkCount, h.w.hits]).toEqual([true, 12.5, 3, 12.5, 3, 1, 1, 1, 3]);
      expect(h.g.magazine!.rules[FUSO]).toEqual({ onHits: [3, 4], chance: [1, 1] });
    }
  });
  it('boom でも駆逐艦と重巡の記録には規則が無い（null のまま）。data の確率は 3%・6%', () => {
    const k = setupOf('us_05', false, undefined, { magazineBoom: true }).transit!.column!;
    expect(k.map((x) => (x.magazine ? x.magazine.chance : null))).toEqual([null, null, null, null, null, [1, 1], [1, 1]]);
    expect(setupOf('us_05').transit!.column![YAMASHIRO]!.magazine).toEqual({ onHits: [3, 4], chance: [0.03, 0.06] });
  });
});

describe('作る世界（L17・L21）', () => {
  const boat: BoatState = { x: 0, y: 0, headingDeg: 0, speedMps: 0 };
  const enemiesOf = (id: string, hard: boolean): ReturnType<BuildEnemies> | null => {
    const s = setupOf(id, hard, 4);
    if (!s.destroyer || s.barges || s.ptBoats) return null; // 駆逐艦の隊の任務だけ（大発・米PT の絵は偽の場面で作れない）
    return buildEnemies(sceneOf(), s, 4, boat, chain, {}, () => undefined, () => undefined, { stepTimeS: 0 }, null);
  };
  it('us_05（ノーマル・ハード）だけ隊に弾薬庫が付く。ほかの駆逐艦の隊の任務（ハードも）の隊は null', () => {
    const withMag: string[] = [];
    let groups = 0;
    for (const id of PROTO_IDS) {
      for (const hard of hasHardVariant(gameData, id) ? [false, true] : [false]) {
        const e = enemiesOf(id, hard);
        if (!e) continue;
        groups++;
        if (e.destroyers?.magazine) withMag.push(`${id}${hard ? 'h' : ''}`);
        else if (e.destroyers) expect(e.destroyers.magazine, id).toBeNull();
      }
    }
    expect(withMag).toEqual(['us_05', 'us_05h']);
    expect(groups).toBeGreaterThanOrEqual(10);
  });
  it('torpedo-hits の 1 行（takeHit が先・誘爆の右は弾薬庫のある隊だけ）・終わり際の当たりは弾薬庫を読まない・world-enemies は ShipMagazine.of だけで作る', () => {
    const s = code('src/systems/torpedo-hits.ts');
    expect(s).toContain('if (d.takeHit() || (g.magazine?.roll(target, d.hitsTaken ?? 0, w.stepTimeS) ?? false)) {');
    expect(s.split('magazine').length - 1).toBe(2); // 型の 1 つと命中の 1 行
    const late = s.slice(s.indexOf('onLateHit:'), s.indexOf('onMiss:'));
    expect(late).not.toContain('magazine');
    const we = code('src/systems/world-enemies.ts');
    expect(we).toContain('const magazine = ds && destroyers ? ShipMagazine.of(s.transit?.column, ds.starts.length, destroyers.total, seed) : null;');
    expect(code('src/systems/ship-magazine.ts')).toContain('this.rng = new SeededRng((seed + MAGAZINE_SEED_OFFSET) >>> 0);');
    expect(MAGAZINE_SEED_OFFSET).toBe(44);
  });
});
