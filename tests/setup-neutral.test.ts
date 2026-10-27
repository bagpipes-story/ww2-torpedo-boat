// 他任務の setup の中立性（v0.6.3 準備）: 米PT（jp_05）を足す前の木で作った snapshot と、us_01・us_02・us_03・jp_06 の世界の数値・Briefing の行・今夜の乱数の回数が同じか。
// snapshot は v0.6.2（8a9cd3c）の木で作った。以後 -u で書き換えない（違ったら他任務の挙動が変わったということ）。
// 例外は v0.6.8 S5 の 1 回だけ（spec-v068 §6.3）: Briefing の「条件:」の 16 行の後ろに「 ・ 機銃は艦に効かない」（us_01・us_02・jp_06）／「 ・ 魚雷は大発の下を抜ける」（us_03）を足した。
// ほかの行は 1 字も変えていない（変わった行がみな「条件:」で、元の文が新しい文の頭と同じことを scratchpad の差分の検査で確かめた。CHANGELOG v0.6.8）。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gameData } from '../src/config/game-data';
import { enemyNameJa, getBriefingRecord, riskLabelJa } from '../src/config/briefing-data';
import { briefingRows } from '../src/core/briefing';
import { SeededRng } from '../src/core/rng';
import { directSortie } from '../src/core/sortie';
import { briefingNumbers, buildWorldSetup } from '../src/systems/world-setup';

const IDS = ['us_01', 'us_02', 'us_03', 'jp_06'] as const;
const SEEDS = [1, 12345] as const;
const CASES = IDS.flatMap((id) => [false, true].flatMap((hard) => SEEDS.map((seed) => [id, hard, seed] as const)));

/** 世界の数値を 1 回組み立て、組み立て中に引いた乱数の回数（今夜の揺らぎ。seed+16）も数える */
function build(id: string, hard: boolean, seed: number): { s: ReturnType<typeof buildWorldSetup>; draws: number } {
  const spy = vi.spyOn(SeededRng.prototype, 'next');
  const s = buildWorldSetup(gameData, id, { sortie: directSortie(id, seed, 'none', hard, false), hard });
  const draws = spy.mock.calls.length;
  spy.mockRestore();
  return { s, draws };
}

/** 米PT の鍵（v0.6.3 で足す）と輸送隊の鍵（v0.6.4 で足す。規則は convoy の中なので他に消す鍵は無い）を消した JSON（無ければ何もしない） */
function neutralJson(s: ReturnType<typeof buildWorldSetup>): string {
  const o = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
  delete o['ptBoats'];
  delete o['convoy'];
  const m = o['mission'] as Record<string, unknown> | undefined;
  if (m) delete m['ptBoats'];
  if (m) delete m['convoy'];
  return JSON.stringify(o, null, 1);
}

describe('他任務の setup の中立性（v0.6.3 の米PT の前の snapshot）', () => {
  afterEach(() => vi.restoreAllMocks());
  it.each(CASES)('%s ハード %s seed %i: 世界の数値・Briefing の行・今夜の乱数の回数', (id, hard, seed) => {
    const label = `${id} ${hard ? 'hard' : 'normal'} seed ${seed}`;
    const { s, draws } = build(id, hard, seed);
    expect(neutralJson(s)).toMatchSnapshot(`${label} setup`);
    const rec = { ...getBriefingRecord(gameData, id, hard), hazardIds: s.hazardsTonight, absentHazardIds: s.absentHazards };
    const rows = briefingRows(rec, briefingNumbers(s), (e) => enemyNameJa(gameData, e), (h) => riskLabelJa(gameData, h));
    expect(rows.map((r) => `${r.label}: ${r.text}`)).toMatchSnapshot(`${label} briefing`);
    expect(draws).toMatchSnapshot(`${label} night draws`);
    // 同じ出撃なら同じ世界（snapshot が安定している）
    expect(neutralJson(build(id, hard, seed).s)).toBe(neutralJson(s));
  });
});
