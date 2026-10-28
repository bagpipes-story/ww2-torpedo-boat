// v0.6.7 S5（spec-v067 §G.1・§H の N8・レビュー R19）: jp_02「孤島の哨戒」の世界の数値（JSON 全体）・Briefing の行・今夜の乱数の回数を snapshot に固める（ノーマル／ハード × 史実モードあり／なし × seed 1・12345）。
// snapshot は v0.6.7 S5 の木で作った。以後 -u で書き換えない（次の版の中立の関門）。例外は v0.6.8 S5 の 1 回だけ（spec-v068 §6.3）: 「条件:」の 8 行の
// 「武器なし（止まって隠れ、投下で転舵）」を「機銃は機にまず当たらない（止まって隠れ、投下で転舵）」に（13mm で機を撃てるようになった。ほかの行は 1 字も変えていない）。史実モードの組は historical と視程（getVisibilityParams(…, historical)）の分だけが違い、
// 夜の哨戒（patrolAir）は史実モードなしと同じ（夜の哨戒は enemy_detection_multiplier を読まない＝§I.1）。ハードの違いは無い（Briefing「（この任務は同じ）」）。今夜の揺らぎ（+16）は 0 回。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gameData } from '../src/config/game-data';
import { enemyNameJa, getBriefingRecord, riskLabelJa } from '../src/config/briefing-data';
import { briefingRows } from '../src/core/briefing';
import { SeededRng } from '../src/core/rng';
import { directSortie } from '../src/core/sortie';
import { briefingNumbers, buildWorldSetup } from '../src/systems/world-setup';

const SEEDS = [1, 12345] as const;
const CASES = [false, true].flatMap((hard) => [false, true].flatMap((historical) => SEEDS.map((seed) => [hard, historical, seed] as const)));

function build(hard: boolean, historical: boolean, seed: number): { s: ReturnType<typeof buildWorldSetup>; draws: number } {
  const spy = vi.spyOn(SeededRng.prototype, 'next');
  const s = buildWorldSetup(gameData, 'jp_02', { sortie: directSortie('jp_02', seed, 'none', hard, historical), hard });
  const draws = spy.mock.calls.length;
  spy.mockRestore();
  return { s, draws };
}

describe('jp_02 の setup の snapshot（v0.6.7 S5 の木）', () => {
  afterEach(() => vi.restoreAllMocks());
  it.each(CASES)('ハード %s 史実 %s seed %i: 世界の数値・Briefing の行・今夜の乱数の回数', (hard, historical, seed) => {
    const label = `jp_02 ${hard ? 'hard' : 'normal'}${historical ? ' historical' : ''} seed ${seed}`;
    const { s, draws } = build(hard, historical, seed);
    expect(JSON.stringify(s, null, 1)).toMatchSnapshot(`${label} setup`);
    const rec = { ...getBriefingRecord(gameData, 'jp_02', hard), hazardIds: s.hazardsTonight, absentHazardIds: s.absentHazards };
    const rows = briefingRows(rec, briefingNumbers(s), (e) => enemyNameJa(gameData, e), (h) => riskLabelJa(gameData, h));
    expect(rows.map((r) => `${r.label}: ${r.text}`)).toMatchSnapshot(`${label} briefing`);
    expect(draws).toBe(0);
    expect(JSON.stringify(build(hard, historical, seed).s)).toBe(JSON.stringify(s));
  });
  it('史実モードでも夜の哨戒（門番・夜の出撃）は同じ。ハードでも同じ世界（違うのは historical と sortie の旗だけ）', () => {
    const plain = build(false, false, 1).s;
    for (const [hard, historical] of [[false, true], [true, false], [true, true]] as const) {
      const s = build(hard, historical, 1).s;
      expect(JSON.stringify(s.patrolAir)).toBe(JSON.stringify(plain.patrolAir));
      expect(JSON.stringify(s.airStrike)).toBe(JSON.stringify(plain.airStrike));
      expect(s.hard).toBe(hard);
      expect(s.historical).toBe(historical);
    }
    expect(plain.patrolAir).toBeDefined();
  });
});
