// 米PT の任務の setup の中立性（v0.6.6 準備。H13）: 隼艇（jp_01 のハード）を足す前の木で作った snapshot と、
// jp_01 ノーマル・jp_05 ノーマル／ハードの世界の数値（JSON 全体。米PT・輸送隊の鍵も消さない）・Briefing の行・今夜の乱数の回数が同じか。
// snapshot は v0.6.5（main 55efa4d）の木で作った。以後 -u で書き換えない（違ったらハードの読み出しの書き直しがノーマル・jp_05 に漏れたということ）。
// jp_01 のハードは v0.6.6 で意図して変わるので入れない。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gameData } from '../src/config/game-data';
import { enemyNameJa, getBriefingRecord, riskLabelJa } from '../src/config/briefing-data';
import { briefingRows } from '../src/core/briefing';
import { SeededRng } from '../src/core/rng';
import { directSortie } from '../src/core/sortie';
import { briefingNumbers, buildWorldSetup } from '../src/systems/world-setup';

const SEEDS = [1, 12345] as const;
const MODES = [
  ['jp_01', false],
  ['jp_05', false],
  ['jp_05', true],
] as const;
const CASES = MODES.flatMap(([id, hard]) => SEEDS.map((seed) => [id, hard, seed] as const));

/** 世界の数値を 1 回組み立て、組み立て中に引いた乱数の回数（今夜の揺らぎ。seed+16）も数える */
function build(id: string, hard: boolean, seed: number): { s: ReturnType<typeof buildWorldSetup>; draws: number } {
  const spy = vi.spyOn(SeededRng.prototype, 'next');
  const s = buildWorldSetup(gameData, id, { sortie: directSortie(id, seed, 'none', hard, false), hard });
  const draws = spy.mock.calls.length;
  spy.mockRestore();
  return { s, draws };
}

/** JSON 全体（setup-neutral の neutralJson と違い、何も消さない） */
function fullJson(s: ReturnType<typeof buildWorldSetup>): string {
  return JSON.stringify(s, null, 1);
}

describe('米PT の任務の setup の中立性（v0.6.6 の隼艇の前の snapshot）', () => {
  afterEach(() => vi.restoreAllMocks());
  it.each(CASES)('%s ハード %s seed %i: 世界の数値・Briefing の行・今夜の乱数の回数', (id, hard, seed) => {
    const label = `${id} ${hard ? 'hard' : 'normal'} seed ${seed}`;
    const { s, draws } = build(id, hard, seed);
    expect(fullJson(s)).toMatchSnapshot(`${label} setup`);
    const rec = { ...getBriefingRecord(gameData, id, hard), hazardIds: s.hazardsTonight, absentHazardIds: s.absentHazards };
    const rows = briefingRows(rec, briefingNumbers(s), (e) => enemyNameJa(gameData, e), (h) => riskLabelJa(gameData, h));
    expect(rows.map((r) => `${r.label}: ${r.text}`)).toMatchSnapshot(`${label} briefing`);
    expect(draws).toMatchSnapshot(`${label} night draws`);
    // 同じ出撃なら同じ世界（snapshot が安定している）
    expect(fullJson(build(id, hard, seed).s)).toBe(fullJson(s));
  });
});
