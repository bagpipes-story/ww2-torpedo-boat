// v0.6.11 S0（spec-v0611-r2 §13 の S0）: jp_03「運天港・空襲下の退避」の世界の数値（JSON 全体）と今夜の乱数の回数を snapshot に固める
// （ノーマル／ハード × 史実モードあり／なし × seed 1・12345）。snapshot は v0.6.11 S0 の木で作った。jp_03 の setup は S1〜S7 で鍵が増えうるので、
// 書き換える時は CHANGELOG に段と理由を書く（ほかの任務の setup の snapshot は -u しない）。Briefing の行は入れない（S6 で変わる）。
// 今夜の揺らぎ（+16）は 0 回（night block なし）。空襲下の退避の値（setup.evac）は史実モードで変わらず、ハードは同時の編隊 3 だけが違う（陰の発見は S3b からノーマルと同じ 0.5）。
// snapshot の書き換え: S3b（passes_max の鍵・U7 の点 G1 の data（陰（西）を外す・上げ 12 秒・回避 0.2・陰の発見 0.5・first_run_s 6.5・run_gap_s 1.7））。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gameData } from '../src/config/game-data';
import { SeededRng } from '../src/core/rng';
import { directSortie } from '../src/core/sortie';
import { buildWorldSetup } from '../src/systems/world-setup';

const SEEDS = [1, 12345] as const;
const CASES = [false, true].flatMap((hard) => [false, true].flatMap((historical) => SEEDS.map((seed) => [hard, historical, seed] as const)));

function build(hard: boolean, historical: boolean, seed: number): { s: ReturnType<typeof buildWorldSetup>; draws: number } {
  const spy = vi.spyOn(SeededRng.prototype, 'next');
  const s = buildWorldSetup(gameData, 'jp_03', { sortie: directSortie('jp_03', seed, 'none', hard, historical), hard });
  const draws = spy.mock.calls.length;
  spy.mockRestore();
  return { s, draws };
}

describe('jp_03 の setup の snapshot（v0.6.11 S0 の木）', () => {
  afterEach(() => vi.restoreAllMocks());
  it.each(CASES)('ハード %s 史実 %s seed %i: 世界の数値・今夜の乱数の回数', (hard, historical, seed) => {
    const label = `jp_03 ${hard ? 'hard' : 'normal'}${historical ? ' historical' : ''} seed ${seed}`;
    const { s, draws } = build(hard, historical, seed);
    expect(JSON.stringify(s, null, 1)).toMatchSnapshot(`${label} setup`);
    expect(draws).toBe(0);
    expect(s.evac).toBeDefined();
    expect(s.evac!.raid.flights).toBe(hard ? 3 : 2);
    // 艦艇のいない航空機だけの任務・主兵装なし・出撃前の港内空襲なし・座礁なし・夜明けの 4 機あり
    expect([s.destroyer, s.barges, s.ptBoats, s.convoy, s.raid, s.storm, s.seaplane, s.friendly, s.mainWeapon]).toEqual([null, null, null, null, null, null, null, null, 'none']);
    expect(s.mission.moon).toBe('day');
    expect(s.hazardsTonight).toEqual(['unten_air_raid', 'dawn_air_strike']);
    expect(s.airStrike!.planes).toBe(4);
    expect(s.patrolAir).toBeUndefined();
    expect(JSON.stringify(build(hard, historical, seed).s)).toBe(JSON.stringify(s));
  });
  it('空襲下の退避の値は史実モードで変わらない。ハードは同時の編隊だけが違う（陰の発見の確率は S3b からノーマルと同じ）', () => {
    const plain = build(false, false, 1).s;
    for (const [hard, historical] of [[false, true], [true, false], [true, true]] as const) {
      const s = build(hard, historical, 1).s;
      expect(JSON.stringify(s.evac!.params)).toBe(JSON.stringify(plain.evac!.params));
      expect(JSON.stringify(s.evac!.sorties)).toBe(JSON.stringify(plain.evac!.sorties));
      const { flights: f, coverRevealChance: c, ...rest } = s.evac!.raid;
      const { flights: f0, coverRevealChance: c0, ...rest0 } = plain.evac!.raid;
      expect(rest).toEqual(rest0);
      expect([f, c]).toEqual(hard ? [3, 0.5] : [f0, c0]);
      expect(c).toBe(c0);
      expect(s.hard).toBe(hard);
      expect(s.historical).toBe(historical);
    }
  });
});
