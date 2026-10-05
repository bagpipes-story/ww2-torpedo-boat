import { describe, expect, it } from 'vitest';
import { gameData, getEnemyRecord, getEvasionMultiplier, getPrototypeMission, getVisibilityParams } from '../src/config/game-data';
import { enemyDetectRangeM, playerVisRangeM } from '../src/core/visibility';

describe('game-data（data/*.json の読み出し）', () => {
  it('us_02 のプロトタイプは半月・90 秒・駆逐艦 1 隻', () => {
    const m = getPrototypeMission(gameData, 'us_02');
    expect(m.moon).toBe('half');
    expect(m.durationS).toBe(90);
    expect(m.enemyId).toBe('ijn_destroyer');
    expect(m.enemyHitsToSink).toBe(1);
  });
  it('駆逐艦レコードに船体と AI の両方がある', () => {
    const e = getEnemyRecord(gameData, 'ijn_destroyer');
    expect(e.length_m).toBe(118);
    expect(e.detection.base_detect_m).toBe(2500);
    expect(e.detection.torpedo_wake_detect_m).toBe(700);
    expect(e.evasion.turn_toward_wakes).toBe(true);
    expect(e.ram.trigger_m).toBe(400);
    expect(e.patrol.edge_turn_margin_m).toBe(500);
    expect(() => getEnemyRecord(gameData, 'nope')).toThrow();
  });
  it('視界: 半月なら敵の発見距離は巡航で 2,500 m、自艇の視程は 1,500 m。史実モードは既定で無効なので倍率 1', () => {
    const v = getVisibilityParams(gameData, 'half');
    expect(v.moonFactor).toBe(1);
    expect(v.detectionMultiplier).toBe(1);
    expect(playerVisRangeM(v)).toBe(1500);
    expect(enemyDetectRangeM(2500, 1, v, false)).toBe(2500);
    expect(enemyDetectRangeM(2500, 0.5, v, false)).toBe(1250);
    expect(enemyDetectRangeM(2500, 1, v, true)).toBeCloseTo(750, 9);
    expect(getEvasionMultiplier(gameData)).toBe(1);
    const dark = getVisibilityParams(gameData, 'dark');
    expect(playerVisRangeM(dark)).toBe(900);
  });
});
