import { describe, expect, it } from 'vitest';
import { gameData, getBoatCrewEffects, getBoatCrewParams, getBoatDamageParams, getBoatFuelCurve, getBoatRecord, getBoatSmokeParams, getEnemyRecord, getScoringParams, getTorpedoRecord } from '../src/config/game-data';
import { getPrototypeMission } from '../src/config/mission-data';
import { getBriefingRecord } from '../src/config/briefing-data';
import { playableMissionIds } from '../src/config/campaign-data';
import { directSortie, isRaidDataRecord, raidParamsFromData } from '../src/core/sortie';
import { torpedoReliabilityFromData } from '../src/core/torpedo';
import { buildWorldSetup } from '../src/systems/world-setup';

describe('日本ハードモードの data（v0.6.0。T-38・米駆逐艦・jp_06 慶良間の夜）', () => {
  it('T-38: 燃料・被害・乗員の getter が通る。煙幕は無い（null）。消火の長押しは damage から 1.0 秒', () => {
    expect(getBoatFuelCurve(gameData, 'jp_t38').capacityGal).toBe(800);
    const d = getBoatDamageParams(gameData, 'jp_t38');
    expect([d.maxHp, d.engineSpeedFactor, d.fireDps, d.fireDurationS, d.extinguishHoldS]).toEqual([60, 0.7, 1.5, 16, 1.0]);
    expect(getBoatCrewParams(gameData, 'jp_t38').total).toBe(7);
    expect(getBoatCrewEffects(gameData, 'jp_t38').minFactor).toBe(0.5);
    expect(getBoatSmokeParams(gameData, 'jp_t38')).toBeNull();
    // 消火の長押しは煙幕から移した（米艇も 1.0 秒のまま）
    expect(getBoatDamageParams(gameData, 'us_elco80').extinguishHoldS).toBe(1.0);
    expect(getBoatDamageParams(gameData, 'us_elco77').extinguishHoldS).toBe(1.0);
  });
  it('T-38 の被害値で港内空襲の検査（HP − 至近弾 20 > 火災の総量）を通る（60 − 20 = 40 > 24）', () => {
    const rec: unknown = gameData.riskEvents.events.find((e) => e.id === 'harbor_fire_explosion');
    if (!isRaidDataRecord(rec)) throw new Error('raid');
    expect(() => raidParamsFromData(rec, getBoatDamageParams(gameData, 'jp_t38'))).not.toThrow();
  });
  it('遊べる任務の自艇の静音の比（静音の上限 / 最大速力）は us_02 の艇の ±0.02 以内（台座の内側の輪は Boot が us_02 の艇から 1 枚だけ作る）', () => {
    const ratio = (id: string): number => {
      const b = getBoatRecord(gameData, id);
      return b.speed_bands_kt.silent_max / b.speed_max_kt;
    };
    const base = ratio(getPrototypeMission(gameData, 'us_02').playerBoatId);
    for (const c of ['us_pt', 'jp_hard']) {
      for (const id of playableMissionIds(gameData, c)) expect(Math.abs(ratio(getPrototypeMission(gameData, id).playerBoatId) - base), id).toBeLessThanOrEqual(0.02);
    }
  });
  it('米駆逐艦: getEnemyRecord を通る（ijn_destroyer と同じ形）。寸法・最大速力は史実、127mm は 30、見張りは 0.3/秒', () => {
    const e = getEnemyRecord(gameData, 'us_destroyer');
    expect([e.length_m, e.beam_m]).toEqual([114.8, 12.0]);
    const raw = gameData.enemies.enemies.find((x) => x.id === 'us_destroyer') as unknown as { speed_max_kt: number; guns: { damage: number }[]; detection: { wake_spot_rate_per_s: number } };
    expect([raw.speed_max_kt, raw.guns[0]!.damage, raw.detection.wake_spot_rate_per_s]).toEqual([36.5, 30, 0.3]);
  });
  it('jp_06: 任務・Briefing・世界が組める。T-38・魚雷 2 本・煙幕なし・米駆逐艦 1 隻（ハード 2 隻）・新月・夜明け 160 秒・燃料 16 gal', () => {
    const m = getPrototypeMission(gameData, 'jp_06');
    expect([m.playerBoatId, m.torpedoId, m.enemyId, m.moon, m.durationS, m.fuelAllotmentGal]).toEqual(['jp_t38', 'jp_45cm', 'us_destroyer', 'dark', 160, 16]);
    // v0.6.1: 夜明けの後は米艦載機 4 機の空襲（東から。僚艇はいない）
    expect(m.hazards).toEqual(['enemy_ship_gunfire_or_ram', 'grounding', 'dawn_air_strike']);
    expect(m.dawnStrike).toMatchObject({ aircraft_id: 'us_carrier_aircraft', count: 4, from_bearing_deg: 90, escort_target_planes: [] });
    // 史実メモは史実だけ（出撃できなかったとは書かない）。「もしも」は目的の側に書く
    const b = getBriefingRecord(gameData, 'jp_06');
    expect(b.noteJa).toContain('戦闘能力を失った');
    expect(b.noteJa).not.toContain('もしも');
    expect(b.objective.startsWith('もしも')).toBe(true);
    const s = buildWorldSetup(gameData, 'jp_06', { fixedNight: true });
    expect(s.torpedoCapacity).toBe(2);
    expect(s.smokeParams).toBeNull();
    expect(s.damageParams.extinguishHoldS).toBe(1.0);
    expect(s.destroyer!.starts.length).toBe(1);
    expect(buildWorldSetup(gameData, 'jp_06', { hard: true, fixedNight: true }).destroyer!.starts.length).toBe(2);
  });
  it('jp_06 ハード: 駆逐艦 2 隻でも達成は 1 隻の撃沈（objective_sink_count 1。魚雷 2 本では 2 隻撃沈に全弾命中が要る）。us_02 ハードは 2 隻のまま、ノーマルは隻数', () => {
    expect(getPrototypeMission(gameData, 'jp_06', true).objectiveSinkCount).toBe(1);
    expect(getPrototypeMission(gameData, 'jp_06').objectiveSinkCount).toBeNull();
    const jh = buildWorldSetup(gameData, 'jp_06', { hard: true, fixedNight: true }).destroyer!;
    expect([jh.starts.length, jh.objectiveSinks]).toEqual([2, 1]);
    expect(buildWorldSetup(gameData, 'jp_06', { fixedNight: true }).destroyer!.objectiveSinks).toBe(1);
    expect(buildWorldSetup(gameData, 'us_02', { hard: true, fixedNight: true }).destroyer!.objectiveSinks).toBe(2);
    expect(buildWorldSetup(gameData, 'us_02', { fixedNight: true }).destroyer!.objectiveSinks).toBe(1);
  });
  it('objective_sink_count が壊れていれば例外（0・小数・ハードの隻数より多い）', () => {
    for (const bad of [0, 1.5, 3, '1']) {
      const d = JSON.parse(JSON.stringify(gameData)) as typeof gameData;
      const p = (d.missionsSeed.missions as unknown as Record<string, Record<string, Record<string, unknown>>>[]).find((m) => (m as unknown as { id: string }).id === 'jp_06')!['v0_1_prototype']!;
      (p['hard'] as Record<string, unknown>)['objective_sink_count'] = bad;
      expect(() => getPrototypeMission(d, 'jp_06', true), String(bad)).toThrow();
    }
  });
  it('史実モードの魚雷の信頼性（hit_rate_model.historical_mode.reliability_campaigns）は米PTだけ: jp_06 は torpedoes.json の 45cm のまま、us_02 は 0.1 / 0.08', () => {
    expect(gameData.hitRateModel.historical_mode.reliability_campaigns).toEqual(['us_pt']);
    const jp = buildWorldSetup(gameData, 'jp_06', { sortie: directSortie('jp_06', 5, 'none', false, true), fixedNight: true });
    expect(jp.historical).toBe(true);
    expect(jp.torpedoReliability).toEqual(torpedoReliabilityFromData(getTorpedoRecord(gameData, 'jp_45cm')));
    expect(jp.torpedoReliability).toEqual({ dud: 0.05, erratic: 0.05 });
    const us = buildWorldSetup(gameData, 'us_02', { sortie: directSortie('us_02', 5, 'none', false, true), fixedNight: true });
    expect(us.torpedoReliability).toEqual({ dud: 0.1, erratic: 0.08 });
  });
  it('T-14（v0.6.3。jp_05）: 燃料曲線（800 gal・アイドル 11.43 gal/h）・被害（HP 50・火災 1.25 × 16 秒）・乗員 7・乗員の効き（T-38 と同じ）・煙幕なし。静音の上限 14 kt', () => {
    const f = getBoatFuelCurve(gameData, 'jp_t14');
    expect(f.capacityGal).toBe(800);
    expect(f.idleGph).toBeCloseTo(11.43, 2);
    expect([f.cruiseGph, f.fullGph]).toEqual([800 / 7, 800 / 3.5]);
    const d = getBoatDamageParams(gameData, 'jp_t14');
    expect([d.maxHp, d.engineSpeedFactor, d.fireDps, d.fireDurationS, d.extinguishHoldS]).toEqual([50, 0.7, 1.25, 16, 1.0]);
    // 火災の総量は HP の 4 割（T-38・Elco と同じ比）
    expect((d.fireDps * d.fireDurationS) / d.maxHp).toBeCloseTo(0.4, 9);
    const c = getBoatCrewParams(gameData, 'jp_t14');
    expect([c.total, c.casualtiesPerHp]).toEqual([7, 0.1]);
    expect(getBoatCrewEffects(gameData, 'jp_t14')).toEqual(getBoatCrewEffects(gameData, 'jp_t38'));
    expect(getBoatSmokeParams(gameData, 'jp_t14')).toBeNull();
    expect(getBoatRecord(gameData, 'jp_t14').speed_bands_kt.silent_max).toBe(14);
    const src = (gameData.boats.boats.find((b) => b.id === 'jp_t14') as unknown as { source: Record<string, string> }).source;
    for (const [k, v] of Object.entries(src)) expect(/historical|design/.test(v), k).toBe(true);
  });
  it('遊べる任務の type はすべて scoring.json の objective_by_type にある（無いと黙って 0 点になる）', () => {
    const sp = getScoringParams(gameData);
    for (const c of ['us_pt', 'jp_hard']) {
      for (const id of playableMissionIds(gameData, c)) {
        const type = (gameData.missionsSeed.missions.find((x) => x.id === id) as unknown as { type: string }).type;
        expect(sp.objectiveByType[type], `${id} ${type}`).toBeGreaterThan(0);
      }
    }
  });
});
