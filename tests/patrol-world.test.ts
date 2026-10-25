// v0.6.7 S5（spec-v067 §C.5・§D.4・§D.5・§G.1）: jp_02「孤島の哨戒」の世界の値・Briefing の 7 行と幅・危険・得点の順・Result の行と幅・終了の見出し・ハードの違いなし。
// 字は今の共有の関数（enemyNameJa・shortLabelJa・hazardsJa・enemyCountsJa・riskLabelJa）が実際に作る字（共有の関数は変えない＝他の任務の Briefing は N1 の snapshot）。
import { describe, expect, it } from 'vitest';
import { enemyNameJa, getBriefingRecord, riskLabelJa } from '../src/config/briefing-data';
import { getScoringParams, gameData } from '../src/config/game-data';
import { hasHardVariant } from '../src/config/mission-data';
import { briefingRows } from '../src/core/briefing';
import { CALL_DAWN, CALL_FUEL, updateReturnCalls } from '../src/core/mission-flow';
import { computeScore, type ScoreInput } from '../src/core/scoring';
import { briefingNumbers } from '../src/systems/world-setup';
import { patrolBombResultJa, patrolSearchResultJa } from '../src/ui/patrol-result-lines';
import { resultBodyLines, type ResultBodySource } from '../src/ui/result-body';
import { REASON_LABEL, resultHeadPrefixJa, resultHeadingJa } from '../src/ui/result-heading';
import type { PatrolResult } from '../src/ui/result-types';
import { PERSON_DENYLIST, RANK_RE } from './person-denylist';
import { S02 } from './patrol-world-kit';
import { textWidthPx } from './pt-ui-kit';

const WRAP = 1056; // Briefing の値の折り返し px（config/menu-config の BRIEF_VALUE_WRAP。DOM を読む config なので写す）
const RESULT_MAX = 1280 - 48; // Result の行が縮まない幅（論理幅 1280 − 左右の HUD_MARGIN）

describe('jp_02 の世界（buildWorldSetup）', () => {
  it('輪の縁まで 5,602 m・夜明け 220 秒・燃料 32 gal・艇 T-14・撃たない（魚雷 0）・敵艦なし・見つかる距離の基準は自艇の視程 900 m', () => {
    const rp = S02.mission.returnPoint;
    const edge = Math.hypot(S02.playerStart.x - rp.x, S02.playerStart.y - rp.y) - rp.radiusM;
    expect(Math.round(edge)).toBe(5602);
    expect([S02.durationS, S02.fuelAllotmentGal, S02.mission.playerBoatId, S02.mainWeapon, S02.torpedoCapacity]).toEqual([220, 32, 'jp_t14', 'none', 0]);
    expect([S02.baseDetectM, S02.mission.enemyStart, S02.ptBoats, S02.barges, S02.seaplane, S02.storm, S02.friendly]).toEqual([900, null, null, null, null, null, null]);
    expect(S02.patrolAir!.gate.nearM).toBe(900);
    expect(S02.airStrike!.planes).toBe(4); // 夜明けは 4 機（CLAUDE.md §2）
    expect(hasHardVariant(gameData, 'jp_02')).toBe(false);
  });
  it('出発時に「夜明け近し」も「燃料少」も立たない（巡航で輪の縁まで帰る秒 × call_margin < 夜の長さ − 50。tests/dawn-clock と同じ不変）', () => {
    const rp = S02.mission.returnPoint;
    const edge = Math.hypot(S02.playerStart.x - rp.x, S02.playerStart.y - rp.y) - rp.radiusM;
    const needS = edge / (S02.fuelCurve.cruiseMps * S02.timeScale);
    expect(updateReturnCalls(0, false, false, S02.fuelAllotmentGal, edge * S02.fuelCurve.galPerMCruise, S02.durationS, needS, rp.callMargin) & (CALL_DAWN | CALL_FUEL)).toBe(0);
    expect(needS * rp.callMargin).toBeLessThan(S02.durationS - 50);
  });
});

describe('jp_02 の Briefing（spec §D.4）', () => {
  const rec = { ...getBriefingRecord(gameData, 'jp_02', false), hazardIds: S02.hazardsTonight, absentHazardIds: S02.absentHazards };
  const rows = briefingRows(rec, briefingNumbers(S02, '見越し点マーカー（解放済み）'), (e) => enemyNameJa(gameData, e), (h) => riskLabelJa(gameData, h));
  const NB = ' ';
  it('目的・成功・月・敵・危険・条件の字（武器なし・空からの見え方・北東から。見越し点マーカーの句は出さない）', () => {
    expect(rows.map((r) => [r.label, r.text])).toEqual([
      ['目的', '哨戒の帰りに米の飛行艇2機のレーダーに捉えられた。最初の爆撃は全速で走り投下で転舵。その後も航跡と動く船体を捜しに何度も来る。来たら止まって隠れ、南西の礁湖へ帰る'],
      ['成功', '生還。レーダーの後に一度も見つからず夜明け前に帰れば回避の点（帰投地点は南西の青い輪）'],
      ['月', '月没後 ・ 見える 900 m ・ 空から 航跡 6000 m／動く船体 900 m／停止は見えない'],
      ['敵', '米飛行艇 ×2（北東から）'],
      ['危険', '夜の哨戒機、夜明けの空襲'],
      ['条件', `夜明けまで 220 秒（以後は空襲） ・ 燃料 32 gal ・${NB}武器なし（止まって隠れ、投下で転舵）`],
    ]);
    expect(S02.hazardsTonight).toEqual(['patrol_air', 'dawn_air_strike']);
    expect(S02.absentHazards).toEqual([]);
  });
  it('行の幅（24 px・折り返し 1,056 px）: 目的 2 行・成功 1 行・月 1 行・敵 1 行・危険 1 行・条件 2 行の内。史実メモ（20 px）は jp_05 以下・人物名なし・和文に半角スペースなし', () => {
    const lines = [2, 1, 1, 1, 1, 2];
    rows.forEach((r, i) => expect(textWidthPx(r.text, 24), r.label).toBeLessThanOrEqual(lines[i]! * WRAP));
    const note = rec.noteJa;
    expect(textWidthPx(note, 20)).toBeLessThanOrEqual(textWidthPx(getBriefingRecord(gameData, 'jp_05', false).noteJa, 20));
    expect(note).not.toMatch(/[^\x20-\x7e] |\s[^\x20-\x7e]/);
    for (const s of [note, ...rows.map((r) => r.text)]) {
      for (const name of PERSON_DENYLIST) expect(s).not.toContain(name);
      expect(s).not.toMatch(RANK_RE);
    }
  });
});

describe('jp_02 の得点の順（spec §C.5。scoring.json は変えない）', () => {
  const p = getScoringParams(gameData);
  const base: ScoreInput = { returned: true, objectiveDone: true, missionType: 'patrol_and_evade', bands: [], kills: 0, killEnemyId: '', fuelLeftPct: 35, crewAlive: 7, crewTotal: 7, detections: 0, afterDawn: false };
  const score = (o: Partial<ScoreInput>): number => computeScore({ ...base, ...o }, p).total;
  it('レーダーの後に見つからず夜明け前に帰投 > 見つかって帰投 > 夜明けの後に帰投 > 沈没 0', () => {
    const evade = score({});
    const found = score({ detections: 1 });
    const afterDawn = score({ afterDawn: true });
    const sunk = score({ returned: false, objectiveDone: false, crewAlive: 0 });
    expect(evade).toBe(700 + 300 + 300 + 35 + 100);
    expect(found).toBe(evade - 300);
    expect(afterDawn).toBeLessThan(found);
    expect(sunk).toBe(0);
  });
});

describe('jp_02 の Result（spec §D.5）', () => {
  const R: PatrolResult = { passes: 5, passesWake: 3, hides: 3, finds: 2, findsVisual: 1, bombs: 8, hits: 2, damage: 70, dodgeS: [0.4, 0.6, NaN, 0.3, 0.5, NaN, 0.4, 0.3, 0.9], restartDelayed: 0 };
  it('夜の哨戒機の行と夜の爆撃の行（最初の 8 発の転舵。— は転舵なし）、見つからなければ「レーダーの後は見つからなかった」、爆撃なしは「なし」', () => {
    expect(patrolSearchResultJa(R)).toBe('夜の哨戒機: 捜索 5 回（航跡で 3 回） ・ 隠れた 3 回 ・ 見つかった 1 回（レーダーの後）');
    expect(patrolSearchResultJa({ ...R, findsVisual: 0 })).toBe('夜の哨戒機: 捜索 5 回（航跡で 3 回） ・ 隠れた 3 回 ・ レーダーの後は見つからなかった');
    expect(patrolBombResultJa(R)).toBe('夜の爆撃: 8 発 命中 2（HP −70） ・ 投下から転舵 0.4／0.6／—／0.3／0.5／—／0.4／0.3 秒');
    expect(patrolBombResultJa({ ...R, hits: 0, damage: 0, dodgeS: [0.5] })).toBe('夜の爆撃: 8 発 命中 0 ・ 投下から転舵 0.5 秒');
    expect(patrolBombResultJa({ ...R, bombs: 0, hits: 0, damage: 0, dodgeS: [] })).toBe('夜の爆撃: なし');
    for (const s of [patrolSearchResultJa(R), patrolBombResultJa(R)]) expect(textWidthPx(s, 20)).toBeLessThanOrEqual(RESULT_MAX);
  });
  it('本文の枝は夜の哨戒機の 2 行だけ（魚雷の「命中 0 / 発射 0」・通算の命中率の行は出さない）。頭の行の前置きは無し', () => {
    const src: ResultBodySource = {
      hunt: null, pt: null, convoy: null, engine: null, gunboat: null, patrol: R, detections: 1, returned: true, objectiveDone: true,
      shots: [], capacity: 0, hits: 0, duds: 0, misses: 0, bands: [], kpi: null, sortie: { historical: false },
    };
    const body = resultBodyLines(src, false);
    expect(body.map((l) => [l.text, l.px, l.sectionAfter])).toEqual([
      [patrolSearchResultJa(R), 20, false],
      [patrolBombResultJa(R), 20, false],
    ]);
    expect(body.map((l) => l.text).join()).not.toContain('発射');
    expect(resultHeadPrefixJa('')).toBe('');
    expect(resultHeadPrefixJa('駆逐艦: 健在')).toBe('駆逐艦: 健在   ');
  });
  it('終了の見出し: 夜の爆撃は「敵機の爆撃で沈没」（bombed）、夜明けの 4 機は「夜明けの空襲で沈没」（air_strike）', () => {
    expect(REASON_LABEL.bombed).toBe('敵機の爆撃で沈没');
    expect(resultHeadingJa('bombed', NaN, false, false)).toBe('任務終了 — 敵機の爆撃で沈没');
    expect(resultHeadingJa('air_strike', 12, false, false)).toBe('任務終了 — 夜明けの空襲で沈没（夜明け後 12 秒）');
  });
});
