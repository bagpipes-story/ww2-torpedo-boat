// v0.8.2 S1（spec-v0820 §4.4 D-G1〜D-G3・D-G5・§9 の 4、lead の L14・L15。ユーザーの決め U1）: core/magazine-detonation の戦艦の弾薬庫の規則を、enemies.json の扶桑型の記録の magazine
// （3 本目 3%・4 本目 6%）と us_05 の setup の列の kits で見る。3・4 本目の命中だけ引く・規則の無い艦は引かない・確率 0 と 1（?debug&boom）でも引く回数は同じ・seed+44 の 10 万回で 3%・6% ±0.2 点
// （3 つの夜の種）・4 本当たった艦の轟沈 1 − 0.97 × 0.94 ＝ 8.8% ±0.3 点（10 万隻）・艦ごとの記録（誘爆の秒・何本目か・引いた回数・引いた確率の和＝探りの期待値）・source（確保なし）・
// S2 から import するのは systems/ship-magazine だけ（S1 の「誰も import しない」は S2 の lead の L26 で直した）。core/magazine（v0.6.8 の機銃の弾倉）とは別のファイル（名が重なるので magazine-detonation）。
import { describe, expect, it, vi } from 'vitest';
import { gameData } from '../src/config/game-data';
import { magazineRuleOf } from '../src/config/magazine-data';
import { MAGAZINE_SEED_OFFSET, createMagazineLog, magazineChanceAt, resetMagazineLog, rollMagazine, type MagazineLog, type MagazinePlan } from '../src/core/magazine-detonation';
import { SeededRng } from '../src/core/rng';
import { buildWorldSetup } from '../src/systems/world-setup';
import { code, imports, scanAllocations } from './core-rules-kit';
import { SRC } from './sfx-rules-kit';

const FILE = 'src/core/magazine-detonation.ts';
const RULE: MagazinePlan = magazineRuleOf(gameData, 'ijn_battleship_fuso')!; // MagazineRule はそのまま MagazinePlan（形で満たす）
const BOOM: MagazinePlan = magazineRuleOf(gameData, 'ijn_battleship_fuso', { magazineBoom: true })!;
const ZERO: MagazinePlan = { onHits: [3, 4], chance: [0, 0] };
const BASE_SEEDS = [1, 2, 12345] as const;

/** 1 隻に 1〜upTo 本目の命中を順に当てる（世界の写し: 誘爆して沈み始めたら次の命中は呼ばない＝stopOnBoom）。戻りは誘爆した何本目か（0 は無し） */
function hitShip(log: MagazineLog, i: number, rule: MagazinePlan | null, rng: SeededRng, upTo = 4, stopOnBoom = true): number {
  let boom = 0;
  for (let h = 1; h <= upTo; h++) {
    if (rollMagazine(log, i, rule, h, 10 * h, rng) && boom === 0) boom = h;
    if (boom && stopOnBoom) break;
  }
  return boom;
}

describe('規則（扶桑型の記録・us_05 の kits）と確率の読み', () => {
  it('扶桑型は 3 本目 3%・4 本目 6%。us_05 の列で規則を持つのは山城・扶桑だけ（ノーマル・ハード）。系列は seed+44', () => {
    expect(RULE).toEqual({ onHits: [3, 4], chance: [0.03, 0.06] });
    for (const hard of [false, true]) {
      const kits = buildWorldSetup(gameData, 'us_05', { hard }).transit!.column!;
      expect(kits.map((k) => (k.magazine ? k.nameJa : null)).filter((x) => x !== null)).toEqual(['山城', '扶桑']);
      expect(kits[5]!.magazine).toEqual(RULE);
    }
    expect(MAGAZINE_SEED_OFFSET).toBe(44);
  });
  it('magazineChanceAt: 規則が無ければ 0・onHits に無い本数は 0・3 本目 0.03・4 本目 0.06（boom は 1）', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((h) => magazineChanceAt(RULE, h))).toEqual([0, 0, 0, 0.03, 0.06, 0, 0]);
    expect([1, 3, 4, 6].map((h) => magazineChanceAt(null, h))).toEqual([0, 0, 0, 0]);
    expect([3, 4].map((h) => magazineChanceAt(BOOM, h))).toEqual([1, 1]);
  });
  it('艦の数は 1 以上の整数。作った時と戻した時は誘爆なし（NaN・0）・回数 0・和 0', () => {
    for (const n of [0, -1, 2.5, NaN]) expect(() => createMagazineLog(n), String(n)).toThrow(/弾薬庫の記録の艦の数/);
    const log = createMagazineLog(3);
    expect([log.n, [...log.detonatedAtS], [...log.onHit], [...log.draws], [...log.chanceSum]]).toEqual([3, [NaN, NaN, NaN], [0, 0, 0], [0, 0, 0], [0, 0, 0]]);
  });
});

describe('引く時・引かない時', () => {
  it('3・4 本目の命中だけ引く（1・2・5 本目は引かない）。1 隻に 5 本当てても 2 回', () => {
    const spy = vi.spyOn(SeededRng.prototype, 'next');
    const log = createMagazineLog(2);
    hitShip(log, 1, ZERO, new SeededRng(1 + MAGAZINE_SEED_OFFSET), 5, false);
    expect([spy.mock.calls.length, [...log.draws], log.chanceSum[1]]).toEqual([2, [0, 2], 0]);
    spy.mockClear();
    for (const h of [1, 2, 5, 6]) rollMagazine(log, 0, RULE, h, 0, new SeededRng(9));
    expect([spy.mock.calls.length, log.draws[0]]).toEqual([0, 0]);
    spy.mockRestore();
  });
  it('規則の無い艦（駆逐艦・重巡）は何本当たっても引かない', () => {
    expect([magazineRuleOf(gameData, 'ijn_destroyer'), magazineRuleOf(gameData, 'ijn_cruiser_mogami')]).toEqual([null, null]);
    const spy = vi.spyOn(SeededRng.prototype, 'next');
    const log = createMagazineLog(1);
    expect(hitShip(log, 0, null, new SeededRng(4), 6, false)).toBe(0);
    expect([spy.mock.calls.length, log.draws[0], log.chanceSum[0], log.onHit[0]]).toEqual([0, 0, 0, 0]);
    spy.mockRestore();
  });
  it('確率 0・推しの値・1（?debug&boom）で引く回数と系列の位置は同じ（4 本を 1 本ずつ当てて 2 回）。boom は 3 本目に必ず、0 は決して誘爆しない', () => {
    const after: number[] = [];
    const booms: number[] = [];
    for (const rule of [ZERO, RULE, BOOM]) {
      const rng = new SeededRng(77 + MAGAZINE_SEED_OFFSET);
      const log = createMagazineLog(1);
      booms.push(hitShip(log, 0, rule, rng, 4, false));
      expect(log.draws[0]).toBe(2);
      after.push(rng.next());
    }
    expect(new Set(after).size).toBe(1);
    expect([booms[0], booms[2]]).toEqual([0, 3]);
  });
  it('記録: 誘爆した秒（呼ぶ側の時計）と何本目か・引いた回数・引いた確率の和。艦ごと・夜ごとに戻せる', () => {
    const log = createMagazineLog(2);
    const rng = new SeededRng(3);
    expect(rollMagazine(log, 1, BOOM, 3, 41.5, rng)).toBe(true);
    expect(rollMagazine(log, 0, ZERO, 3, 12, rng)).toBe(false);
    rollMagazine(log, 0, RULE, 4, 13, rng);
    expect([log.detonatedAtS[1], log.onHit[1], log.draws[1], log.chanceSum[1], log.draws[0]]).toEqual([41.5, 3, 1, 1, 2]);
    expect(log.chanceSum[0]).toBeCloseTo(0.06, 12);
    resetMagazineLog(log);
    expect([[...log.detonatedAtS], [...log.onHit], [...log.draws], [...log.chanceSum]]).toEqual([[NaN, NaN], [0, 0], [0, 0], [0, 0]]);
  });
});

describe('頻度（seed+44・ユーザーの決め U1 の「稀に」）', () => {
  it('3 本目 3%・4 本目 6% は seed+44 の 10 万回ずつで ±0.2 点（3 つの夜の種）。引いた確率の和は期待値そのもの', () => {
    for (const base of BASE_SEEDS) {
      const rng = new SeededRng(base + MAGAZINE_SEED_OFFSET);
      const log = createMagazineLog(2);
      for (const [i, h, p] of [[0, 3, 0.03], [1, 4, 0.06]] as const) {
        let booms = 0;
        for (let k = 0; k < 100_000; k++) if (rollMagazine(log, i, RULE, h, 0, rng)) booms++;
        expect(Math.abs(booms / 100_000 - p), `seed ${base} の ${h} 本目 ${booms}`).toBeLessThanOrEqual(0.002);
        expect([log.draws[i], log.chanceSum[i]! / 100_000]).toEqual([100_000, expect.closeTo(p, 9)]);
      }
    }
  });
  it('4 本当たった艦（10 万隻・3 本目で誘爆すれば 4 本目は引かない）の轟沈は 1 − 0.97 × 0.94 ＝ 8.8% ±0.3 点。1 隻の引いた確率の和の平均も 8.82%', () => {
    expect(1 - 0.97 * 0.94).toBeCloseTo(0.0882, 12);
    for (const base of BASE_SEEDS) {
      const rng = new SeededRng(base + MAGAZINE_SEED_OFFSET);
      const log = createMagazineLog(1);
      let sunk = 0;
      let expected = 0;
      for (let k = 0; k < 100_000; k++) {
        resetMagazineLog(log);
        if (hitShip(log, 0, RULE, rng) > 0) sunk++;
        expected += log.chanceSum[0]!;
      }
      expect(Math.abs(sunk / 100_000 - 0.0882), `seed ${base} ${sunk}`).toBeLessThanOrEqual(0.003);
      expect(Math.abs(expected / 100_000 - 0.0882), `seed ${base} ${expected}`).toBeLessThanOrEqual(0.0003);
    }
  });
});

describe('source', () => {
  it('作る関数（createMagazineLog）のほかは本体に確保の形が無い。import は core/rng の型だけ・SeededRng.chance（0 と 1 で引かない）・平方根・atan2・Math.random を使わない', () => {
    const { names, bad } = scanAllocations(FILE, ['createMagazineLog']);
    expect(names).toEqual(['createMagazineLog', 'magazineChanceAt', 'resetMagazineLog', 'rollMagazine', 'ruleIndex']);
    expect(bad).toEqual([]);
    const s = code(FILE);
    expect(imports(s)).toEqual(['./rng']);
    expect(s).toMatch(/import type \{ SeededRng \} from '\.\/rng'/);
    expect(s).not.toMatch(/Math\.(sqrt|hypot|atan2|random)\b|\.chance\(/);
  });
  it('S2 から import するのは systems/ship-magazine だけ（lead の L26。S1 は誰も import しなかった）。機銃の弾倉の core/magazine は別のまま', () => {
    expect(SRC.filter((f) => imports(code(f)).some((p) => p.endsWith('/magazine-detonation')))).toEqual(['src/systems/ship-magazine.ts']);
    expect(code('src/core/magazine.ts')).toContain('export function createMagazine(mag: MagazineParams): MagazineState');
  });
});
