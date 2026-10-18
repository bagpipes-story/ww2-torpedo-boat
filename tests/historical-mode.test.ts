import { describe, expect, it } from 'vitest';
import { gameData, getEnemyRecord, getEvasionMultiplier, getHistoricalReliability, getTorpedoRecord, getVisibilityParams } from '../src/config/game-data';
import { enemyDetectRangeM } from '../src/core/visibility';
import { directSortie, rollRaid } from '../src/core/sortie';
import { torpedoReliabilityFromData } from '../src/core/torpedo';
import { shipAiParamsFromData } from '../src/core/ship-ai';
import { hitRateSimSetup } from '../src/systems/hit-rate-sim-setup';
import { buildWorldSetup } from '../src/systems/world-setup';

const hm = gameData.hitRateModel.historical_mode;

describe('史実モード（v0.5.2。hit_rate_model.historical_mode。Title の切り替え）', () => {
  it('data: 初期値はオフ、回避 ×1.5・見つかる距離 ×1.3・不発 10%・蛇行 8%・マーカーなし', () => {
    expect(hm.enabled_default).toBe(false);
    expect([hm.enemy_evasion_multiplier, hm.enemy_detection_multiplier, hm.reliability.dud, hm.reliability.erratic, hm.aim_assist]).toEqual([1.5, 1.3, 0.1, 0.08, 'none']);
    expect(getHistoricalReliability(gameData)).toEqual({ dud: 0.1, erratic: 0.08 });
    const broken = JSON.parse(JSON.stringify(gameData)) as typeof gameData;
    broken.hitRateModel.historical_mode.reliability.dud = 1.5;
    expect(() => getHistoricalReliability(broken)).toThrow();
  });
  it('倍率: 省けば data の enabled_default（オフ → 1）。オンなら回避 1.5・発見 1.3（半月の巡航で 2,000 → 2,600 m）', () => {
    expect([getEvasionMultiplier(gameData), getEvasionMultiplier(gameData, false), getEvasionMultiplier(gameData, true)]).toEqual([1, 1, 1.5]);
    expect(getVisibilityParams(gameData, 'half').detectionMultiplier).toBe(1);
    const v = getVisibilityParams(gameData, 'half', true);
    expect(v.detectionMultiplier).toBe(1.3);
    expect(enemyDetectRangeM(2000, 1, v, false)).toBeCloseTo(2600, 9);
  });
  it('出撃に持ち回る: rollRaid・directSortie の historical（省けば false）。世界の組み立てで、見張り ×1.5・反応 ÷1.5・転舵 ×1.5、不発 10%・蛇行 8%。sortie と引数が違えば例外', () => {
    expect(rollRaid('us_02', 1, null).historical).toBe(false);
    const s = directSortie('us_02', 5, 'none', false, true);
    expect(s.historical).toBe(true);
    const w = buildWorldSetup(gameData, 'us_02', { sortie: s, fixedNight: true });
    expect(w.historical).toBe(true);
    const base = shipAiParamsFromData(getEnemyRecord(gameData, 'ijn_destroyer'));
    const ai = w.destroyer!.shipAi;
    expect(ai.wakeSpotRatePerS).toBeCloseTo(base.wakeSpotRatePerS * 1.5, 9);
    expect(ai.reactionDelayS).toBeCloseTo(base.reactionDelayS / 1.5, 9);
    expect(ai.evadeTurnRateDegS).toBeCloseTo(base.evadeTurnRateDegS * 1.5, 9);
    expect(ai.speedBoostMps).toBe(base.speedBoostMps);
    expect(w.vis.detectionMultiplier).toBe(1.3);
    expect(w.torpedoReliability).toEqual({ dud: 0.1, erratic: 0.08 });
    // 輸送船の隊も同じ倍率
    expect(w.transport!.shipAi.evadeTurnRateDegS).toBeCloseTo(shipAiParamsFromData(getEnemyRecord(gameData, 'ijn_transport')).evadeTurnRateDegS * 1.5, 9);
    expect(() => buildWorldSetup(gameData, 'us_02', { sortie: s, historical: false })).toThrow();
    // ノーマル（省略）は v0.5.1 と同じ: torpedoes.json の信頼性、倍率 1
    const n = buildWorldSetup(gameData, 'us_02', { fixedNight: true });
    expect(n.historical).toBe(false);
    expect(n.torpedoReliability).toEqual(torpedoReliabilityFromData(getTorpedoRecord(gameData, n.mission.torpedoId)));
    expect(n.destroyer!.shipAi).toEqual(base);
    expect(n.vis.detectionMultiplier).toBe(1);
  });
  it('模擬の組み立て: historical で見張りの率が 1.5 倍（scripts/hit-rate-sim.ts HISTORICAL=1）', () => {
    const a = hitRateSimSetup(gameData);
    const h = hitRateSimSetup(gameData, { historical: true });
    expect(h.ai.wakeSpotRatePerS).toBeCloseTo(a.ai.wakeSpotRatePerS * 1.5, 9);
    expect(h.ai.reactionDelayS).toBeCloseTo(a.ai.reactionDelayS / 1.5, 9);
  });
});
