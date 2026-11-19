// ほかの 9 任務の Briefing の文の全部（v0.8.0 S4。brief L25「tests/briefing pins the other missions' texts byte-for-byte」）: 日付・場所・題・6 行・史実を
// ノーマル・ハード × 史実モードあり・なし × 今夜の seed 4 つで並べた JSON。tests/briefing が sha256 を S3 の commit（e8be5eb）の木で同じ kit を回した値と比べる
// （基準の値の作り方は tests/briefing の注）。テストではない（vitest は *.test.ts だけ拾う）。
import { gameData } from '/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0820/wt-0176202/src/config/game-data';
import { enemyNameJa, getBriefingRecord, riskLabelJa } from '/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0820/wt-0176202/src/config/briefing-data';
import { briefingRows, formatDateJa } from '/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0820/wt-0176202/src/core/briefing';
import { directSortie } from '/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0820/wt-0176202/src/core/sortie';
import { briefingNumbers, buildWorldSetup } from '/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0820/wt-0176202/src/systems/world-setup';

/** us_06 のほかの遊べる任務（v0.8.1 S4 で us_04 を足した 10。v0.8.0 の時点は us_04 のほかの 9 つ） */
export const OTHER_BRIEFING_IDS = ['us_01', 'us_02', 'us_03', 'us_04', 'us_06', 'jp_01', 'jp_02', 'jp_03', 'jp_04', 'jp_05', 'jp_06'] as const;
/** 条件の行の見越し点マーカーの句（progress の文の代わりの固定の文。どの任務にも同じ） */
const AIM = '見越し点マーカー 使用可';

/** ほかの任務の Briefing の文の全部（JSON の文字列） */
export function otherBriefingsJson(): string {
  const out: unknown[] = [];
  const nameOf = (e: string): string => enemyNameJa(gameData, e);
  const labelOf = (h: string): string => riskLabelJa(gameData, h);
  for (const id of OTHER_BRIEFING_IDS)
    for (const hard of [false, true])
      for (const historical of [false, true])
        for (const seed of [1, 2, 3, 12345]) {
          const setup = buildWorldSetup(gameData, id, { sortie: directSortie(id, seed, 'none', hard, historical), hard });
          const r = getBriefingRecord(gameData, id, hard);
          const rec = { ...r, hazardIds: setup.hazardsTonight, absentHazardIds: setup.absentHazards };
          out.push([id, hard, historical, seed, r.titleJa, formatDateJa(r.date), r.place, r.noteJa, briefingRows(rec, briefingNumbers(setup, AIM), nameOf, labelOf)]);
        }
  return JSON.stringify(out);
}
