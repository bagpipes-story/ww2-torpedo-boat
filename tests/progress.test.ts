import { describe, expect, it } from 'vitest';
import { gameData, getAimAssistLevels } from '../src/config/game-data';
import { AIM_ASSIST_LEAD_MARKER, AIM_ASSIST_LEAD_MARKER_TIME, AIM_ASSIST_NONE, aimAssistLevelFor, aimAssistStatusJa, isAimAssistLevels, nextAimAssistUnlock, parseSortieCount, serializeSortieCount } from '../src/core/progress';

const LEVELS = getAimAssistLevels(gameData);

describe('見越し点マーカーの解放（v0.5.2。core/progress、hit_rate_model.aim_assist.levels）', () => {
  it('data: なし 0 回 → 見越し点マーカー 3 回 → 見越し点＋到達秒数 6 回', () => {
    expect(LEVELS.map((l) => [l.id, l.unlockSorties])).toEqual([
      [AIM_ASSIST_NONE, 0],
      [AIM_ASSIST_LEAD_MARKER, 3],
      [AIM_ASSIST_LEAD_MARKER_TIME, 6],
    ]);
    expect(LEVELS[1]!.nameJa).toBe('見越し点マーカー');
  });
  it('終えた任務の回数で段階が上がる: 0〜2 回なし、3〜5 回マーカー、6 回以上は到達秒数も。史実モードでは回数に関わらず なし', () => {
    expect([0, 1, 2, 3, 5, 6, 100].map((n) => aimAssistLevelFor(LEVELS, n, false).id)).toEqual([AIM_ASSIST_NONE, AIM_ASSIST_NONE, AIM_ASSIST_NONE, AIM_ASSIST_LEAD_MARKER, AIM_ASSIST_LEAD_MARKER, AIM_ASSIST_LEAD_MARKER_TIME, AIM_ASSIST_LEAD_MARKER_TIME]);
    expect([0, 3, 6].map((n) => aimAssistLevelFor(LEVELS, n, true).id)).toEqual([AIM_ASSIST_NONE, AIM_ASSIST_NONE, AIM_ASSIST_NONE]);
    expect(nextAimAssistUnlock(LEVELS, 0)!.id).toBe(AIM_ASSIST_LEAD_MARKER);
    expect(nextAimAssistUnlock(LEVELS, 3)!.id).toBe(AIM_ASSIST_LEAD_MARKER_TIME);
    expect(nextAimAssistUnlock(LEVELS, 6)).toBeNull();
  });
  it('Briefing の条件に足す一言: 解放までの回数 → 使用可（次の段階まで） → 使用可。史実モードは「なし」', () => {
    expect(aimAssistStatusJa(LEVELS, 0, false)).toBe('見越し点マーカー: あと 3 回の任務で解放（終えた任務 0 回）');
    expect(aimAssistStatusJa(LEVELS, 2, false)).toBe('見越し点マーカー: あと 1 回の任務で解放（終えた任務 2 回）');
    expect(aimAssistStatusJa(LEVELS, 3, false)).toBe('見越し点マーカー 使用可（見越し点＋到達秒数は あと 3 回）');
    expect(aimAssistStatusJa(LEVELS, 6, false)).toBe('見越し点＋到達秒数 使用可');
    expect(aimAssistStatusJa(LEVELS, 9, true)).toBe('史実モード: 見越し点マーカーなし');
  });
  it('段階の検査: 空・最初が none 以外・0 以外・回数が増えない・id の重複は不可。壊れた data は getAimAssistLevels が例外', () => {
    const ok = [{ id: 'none', nameJa: 'なし', unlockSorties: 0 }, { id: 'a', nameJa: 'A', unlockSorties: 2 }];
    expect(isAimAssistLevels(ok)).toBe(true);
    expect(isAimAssistLevels([])).toBe(false);
    expect(isAimAssistLevels([{ id: 'a', nameJa: 'A', unlockSorties: 0 }])).toBe(false);
    expect(isAimAssistLevels([{ id: 'none', nameJa: 'なし', unlockSorties: 1 }])).toBe(false);
    expect(isAimAssistLevels([ok[0], { id: 'a', nameJa: 'A', unlockSorties: 0 }])).toBe(false);
    expect(isAimAssistLevels([ok[0], { id: 'none', nameJa: 'A', unlockSorties: 3 }])).toBe(false);
    expect(isAimAssistLevels([ok[0], { id: 'a', nameJa: 'A', unlockSorties: 1.5 }])).toBe(false);
    const broken = JSON.parse(JSON.stringify(gameData)) as typeof gameData;
    (broken.hitRateModel.aim_assist.levels[1] as { unlock_sorties: number }).unlock_sorties = 0;
    expect(() => getAimAssistLevels(broken)).toThrow();
  });
  it('保存した回数の読み書き: 0 以上の整数だけ。無い・壊れた・負・小数は 0', () => {
    expect(parseSortieCount(serializeSortieCount(7))).toBe(7);
    expect([null, undefined, '', 'x', '-1', '1.5', 'NaN'].map((t) => parseSortieCount(t))).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(parseSortieCount('0')).toBe(0);
  });
});
