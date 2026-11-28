// Result の杯（v0.9.0 IP5。ユーザーの言葉 2026-11-28「「ハード・史実・装備デフォルトで達成」と表示されるようにしてください。（任務終了時の画面も同じ）」）:
// - core/achieved-record の sortieTrophy: 8 つの形 × ハードの違いの有無 × 達成／未達。杯はハードの違いのある任務はハード・史実・デフォルトだけ、無い任務（jp_02・jp_05）は史実・デフォルト（ハードでも）
// - ui/result-trophy の文は Briefing と同じ・置き方（杯と字の組が行の中央）・幅（1280 の Result の行の幅の内）・配線（ソース）
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RESULT_TROPHY_GAP_X, RESULT_TROPHY_LABEL_PX, RESULT_TROPHY_PX, briefTrophyJa, resultTrophyLayout } from '../src/config/trophy-config';
import { gameData } from '../src/config/game-data';
import { hasHardVariant } from '../src/config/mission-data';
import { getStoreCatalogue } from '../src/config/store-data';
import { sortieTrophy } from '../src/core/achieved-record';
import { textWidthPx } from './pt-ui-kit';

const src = (f: string): string => readFileSync(join(__dirname, '..', 'src', f), 'utf8');

describe('sortieTrophy（この出撃の形が頑張った証か）', () => {
  it('8 つの形 × ハードの違いの有無: 達成した出撃だけ。ハードの違いのある任務はハード・史実・デフォルトだけ、無い任務は史実・デフォルト（ハードも）', () => {
    for (const hardVariant of [true, false])
      for (const hard of [false, true])
        for (const historical of [false, true])
          for (const custom of [false, true]) {
            const want = historical && !custom && (hard || !hardVariant);
            const tag = `hv=${hardVariant} hard=${hard} hist=${historical} custom=${custom}`;
            expect(sortieTrophy(true, { hard, historical, custom }, hardVariant), tag).toEqual(want ? { hard: hardVariant } : null);
            expect(sortieTrophy(false, { hard, historical, custom }, hardVariant), tag).toBeNull();
          }
  });
  it('13 任務: jp_02・jp_05 だけハードの違いが無い（語は「史実・装備デフォルトで達成」）', () => {
    const ids = getStoreCatalogue(gameData).openMissionIds;
    expect(ids.length).toBe(13);
    expect(ids.filter((id) => !hasHardVariant(gameData, id))).toEqual(['jp_02', 'jp_05']);
    for (const id of ids) {
      const t = sortieTrophy(true, { hard: true, historical: true, custom: false }, hasHardVariant(gameData, id))!;
      expect(briefTrophyJa(t.hard), id).toBe(id === 'jp_02' || id === 'jp_05' ? '史実・装備デフォルトで達成' : 'ハード・史実・装備デフォルトで達成');
    }
  });
});

describe('Result の杯の置き方（config/trophy-config）', () => {
  it('杯と字の組が行の中央・杯の右端と字の左端の間は RESULT_TROPHY_GAP_X・1280 の行の幅（左右 24）の内', () => {
    for (const hard of [false, true]) {
      const w = textWidthPx(briefTrophyJa(hard), RESULT_TROPHY_LABEL_PX);
      const cx = 640;
      const l = resultTrophyLayout(cx, w);
      const left = l.iconX, right = l.textCx + w / 2;
      expect((left + right) / 2).toBeCloseTo(cx, 6);
      expect(l.textCx - w / 2 - (l.iconX + RESULT_TROPHY_PX)).toBeCloseTo(RESULT_TROPHY_GAP_X, 6);
      expect(left).toBeGreaterThan(24);
      expect(right).toBeLessThan(1280 - 24);
    }
    expect(RESULT_TROPHY_PX).toBeLessThanOrEqual(RESULT_TROPHY_LABEL_PX + 12); // 行の高さ（字 + RESULT_LINE_GAP 12）の内
  });
});

describe('配線（ソース）', () => {
  it('Result: 見出し（と未達の条件）の後に 1 行・持ち上げの後に杯・create で 1 回。300 行以内', () => {
    const s = src('scenes/result-scene.ts');
    expect(s).toContain("const trophyText = trophyJa ? line(trophyJa, RESULT_TROPHY_LABEL_PX, TROPHY_TEXT_COLOR) : null;");
    expect(s.indexOf('const trophyJa = resultTrophyJa(achieved, r.sortie, hasHardVariant(base, r.sortie.missionId));')).toBeGreaterThan(s.indexOf('if (cond) line(cond, HUD_FONT_HEADING_PX);'));
    expect(s.indexOf('if (trophyText) addResultTrophyCup(this, trophyText);')).toBeGreaterThan(s.indexOf('resultFitLiftPx(i, texts.length, lastBottom, RESULT_BODY_MAX_Y)'));
    expect(src('ui/result-trophy.ts')).toContain('return t ? briefTrophyJa(t.hard) : \'\';');
    expect(s.split('\n').length).toBeLessThanOrEqual(301);
  });
});
