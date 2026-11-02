// v0.6.9 S5a（spec-v069 §7 の Setup snapshots・§9 の setup-jp04）: jp_04「多号作戦・オルモック湾へ」の世界の数値（JSON 全体）と今夜の乱数の回数を snapshot に固める
// （ノーマル／ハード × 史実モードあり／なし × seed 1・12345）。snapshot は v0.6.9 S5a の木で作った。以後 -u で書き換えない（揚陸の任務の data・組み立ての変化を見張る）。
// Briefing の行は入れない（jp_04 の Briefing の「敵」の方角と「条件」の揚陸の句は S7 で変わる＝ここに固めると S7 で -u が要る。Briefing の行は S7 の tests/briefing が見る）。
// 今夜の揺らぎ（+16）は 5 回（米PT の隊 3・大発の先頭 1・反転 1。jp_05・jp_01 と同じ回数。D18）。setup.landing は jp_04 にだけあり（tests/landing-neutral）、雷撃と揚陸の値は史実モードで変わらない。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gameData } from '../src/config/game-data';
import { SeededRng } from '../src/core/rng';
import { directSortie } from '../src/core/sortie';
import { buildWorldSetup } from '../src/systems/world-setup';

const SEEDS = [1, 12345] as const;
const CASES = [false, true].flatMap((hard) => [false, true].flatMap((historical) => SEEDS.map((seed) => [hard, historical, seed] as const)));

function build(hard: boolean, historical: boolean, seed: number): { s: ReturnType<typeof buildWorldSetup>; draws: number } {
  const spy = vi.spyOn(SeededRng.prototype, 'next');
  const s = buildWorldSetup(gameData, 'jp_04', { sortie: directSortie('jp_04', seed, 'none', hard, historical), hard });
  const draws = spy.mock.calls.length;
  spy.mockRestore();
  return { s, draws };
}

describe('jp_04 の setup の snapshot（v0.6.9 S5a の木）', () => {
  afterEach(() => vi.restoreAllMocks());
  it.each(CASES)('ハード %s 史実 %s seed %i: 世界の数値・今夜の乱数の回数', (hard, historical, seed) => {
    const label = `jp_04 ${hard ? 'hard' : 'normal'}${historical ? ' historical' : ''} seed ${seed}`;
    const { s, draws } = build(hard, historical, seed);
    expect(JSON.stringify(s, null, 1)).toMatchSnapshot(`${label} setup`);
    expect(draws).toBe(5);
    expect(s.landing).toBeDefined();
    expect(s.ptBoats!.count).toBe(hard ? 3 : 2);
    expect(s.landing!.params.fromDirsJa).toBe(hard ? '北・東・北東' : '北と東');
    expect(JSON.stringify(build(hard, historical, seed).s)).toBe(JSON.stringify(s));
  });
  it('揚陸と雷撃の値は史実モードで変わらない（違うのは視程・発見・historical の旗）。ハードは隊の線が 1 本増えるだけ（揚陸・雷撃は同じ）', () => {
    const plain = build(false, false, 1).s;
    for (const [hard, historical] of [[false, true], [true, false], [true, true]] as const) {
      const s = build(hard, historical, 1).s;
      expect(JSON.stringify(s.landing!.torpedo)).toBe(JSON.stringify(plain.landing!.torpedo));
      const { fromDirsJa: _a, runDirJa: _b, ...lp } = s.landing!.params;
      const { fromDirsJa: _c, runDirJa: _d, ...lp0 } = plain.landing!.params;
      expect(lp).toEqual(lp0);
      expect(s.hard).toBe(hard);
      expect(s.historical).toBe(historical);
    }
  });
});
