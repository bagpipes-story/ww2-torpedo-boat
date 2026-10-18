import { describe, expect, it } from 'vitest';
import { gameData, getBoatFuelCurve, getPrototypeMission, getScoringParams } from '../src/config/game-data';
import { getBriefingRecord, getMenuEntries } from '../src/config/mission-data';
import { computeScore } from '../src/core/scoring';
import { ktToMps } from '../src/core/units';
import { buildWorldSetup } from '../src/systems/world-setup';

type Rec = Record<string, unknown>;
const clone = (): typeof gameData => JSON.parse(JSON.stringify(gameData)) as typeof gameData;
const proto = (d: typeof gameData): Rec => (d.missionsSeed.missions as unknown as Rec[]).find((m) => m['id'] === 'us_01')!['v0_1_prototype'] as Rec;

describe('要人脱出（us_01、v0.4.4）', () => {
  it('任務: Elco 77ft・魚雷・駆逐艦 1 隻（封鎖線 (600, 3000) 東向き）・僚艇・サンゴ礁・暴風・海域 6,000 × 6,000・出発 (3000, 5500)・帰投 (3000, 500)・夜明け 220 秒・燃料 40 gal', () => {
    const m = getPrototypeMission(gameData, 'us_01');
    expect(m.type).toBe('escort_vip');
    expect(m.playerBoatId).toBe('us_elco77');
    expect(m.mainWeapon).toBe('torpedo');
    expect(m.enemyId).toBe('ijn_destroyer');
    expect(m.enemyStart).toEqual({ x: 600, y: 3000, headingDeg: 90 });
    expect(m.escort).toMatchObject({ boat: 'us_elco77', station_astern_m: 120, lag_warn_m: 500 });
    expect(m.bounds).toEqual({ width: 6000, height: 6000 });
    expect(m.playerStart).toEqual({ x: 3000, y: 5500, headingDeg: 0 });
    expect([m.returnPoint.x, m.returnPoint.y, m.returnPoint.radiusM]).toEqual([3000, 500, 250]);
    expect(m.durationS).toBe(220);
    expect(m.fuelAllotmentGal).toBe(40);
    expect(m.shallows.map((r) => [r.x, r.y, r.w, r.h])).toEqual([[2200, 1300, 1600, 600]]);
    expect(m.storm).toMatchObject({ sea_state: 5, start_south_y_min_m: 3600, start_south_y_max_m: 4600 });
    expect(m.hazards).toEqual(['storm', 'enemy_ship_gunfire_or_ram', 'grounding', 'dawn_air_strike']);
    expect(m.dawnStrike).toMatchObject({ aircraft_id: 'ijn_f1m2_pete', count: 4, from_bearing_deg: 90, escort_target_planes: [1, 3] }); // 夜明けの空襲（v0.6.1）
    expect(m.moon).toBe('dark');
    expect(m.enemyAircraft).toBeNull();
    expect(m.friendlyAircraft).toBeNull();
    expect(m.barges).toBeNull();
    expect(m.shoreBattery).toBeNull();
  });
  it('世界の数値: 僚艇あり・駆逐艦あり・魚雷 4 本・Elco 77ft の HP 90・乗員 12。燃料: 直線 4,750 m を巡航で約 23 gal（40 gal の 6 割以下）、全速だと約 35 gal', () => {
    const s = buildWorldSetup(gameData, 'us_01');
    expect(s.escort).not.toBeNull();
    expect(s.destroyer).not.toBeNull();
    expect(s.barges).toBeNull();
    expect(s.torpedoCapacity).toBe(4);
    expect(s.damageParams.maxHp).toBe(90);
    expect(s.crew.total).toBe(12);
    expect(s.storm).not.toBeNull();
    expect(s.seaplane).toBeNull();
    const f = getBoatFuelCurve(gameData, 'us_elco77');
    const cruiseGal = 4750 * f.galPerMCruise;
    const fullGal = 4750 * f.galPerMFull;
    expect(cruiseGal).toBeGreaterThan(20);
    expect(cruiseGal).toBeLessThan(0.6 * 40);
    expect(fullGal).toBeGreaterThan(30);
    expect(fullGal).toBeLessThan(40);
    expect(f.cruiseMps).toBeCloseTo(ktToMps(23), 9);
  });
  it('Title: us_01 が出撃可で先頭。Briefing の文: 目的に「僚艇」、成功に「僚艇生存」、危険は暴風・敵艦艇の砲撃・衝突・座礁・夜明けの空襲、人物名なし', () => {
    const menu = getMenuEntries(gameData);
    expect(menu.entries[0]).toMatchObject({ id: 'us_01', playable: true, status: '出撃準備 →' });
    const b = getBriefingRecord(gameData, 'us_01');
    expect(b.objective).toContain('僚艇');
    expect(b.success).toContain('僚艇生存');
    expect(b.hazardIds).toEqual(['storm', 'enemy_ship_gunfire_or_ram', 'grounding', 'dawn_air_strike']);
    expect(b.noteJa).not.toMatch(/マッカーサー|MacArthur/);
  });
  it('検査: escort は駆逐艦の任務だけ（大発と同居は例外）、escort_vip に escort が無ければ例外、boat が boats.json に無ければ例外', () => {
    const noEscort = clone();
    delete proto(noEscort)['escort'];
    expect(() => getPrototypeMission(noEscort, 'us_01')).toThrow(/escort_vip/);
    const badBoat = clone();
    (proto(badBoat)['escort'] as Rec)['boat'] = 'no_such_boat';
    expect(() => getPrototypeMission(badBoat, 'us_01')).toThrow(/boats\.json/);
    const withBarges = clone();
    const p3 = (withBarges.missionsSeed.missions as unknown as Rec[]).find((m) => m['id'] === 'us_03')!['v0_1_prototype'] as Rec;
    p3['escort'] = proto(withBarges)['escort'];
    expect(() => getPrototypeMission(withBarges, 'us_03')).toThrow(/駆逐艦/);
  });
  it('スコア（escort_vip）: 達成 300、回避 400（帰投・達成・見つかった回数 0 のときだけ）。見つからずに帰投 = 700+300+400+燃料+乗員、1 回見つかると回避 0、僚艇を失えば達成も 0', () => {
    const P = getScoringParams(gameData);
    expect(P.objectiveByType['escort_vip']).toBe(300);
    expect(P.evadeByType['escort_vip']).toBe(400);
    expect(P.evadeByType['intercept_destroyer']).toBeUndefined();
    const base = { missionType: 'escort_vip', bands: [], kills: 0, killEnemyId: '', fuelLeftPct: 40, crewAlive: 12, crewTotal: 12 };
    const clean = computeScore({ ...base, returned: true, objectiveDone: true, detections: 0 }, P);
    expect([clean.survival, clean.objective, clean.evade, clean.fuel, clean.crew, clean.total]).toEqual([700, 300, 400, 40, 100, 1540]);
    const seen = computeScore({ ...base, returned: true, objectiveDone: true, detections: 1 }, P);
    expect([seen.evade, seen.total]).toEqual([0, 1140]);
    const lost = computeScore({ ...base, returned: true, objectiveDone: false, detections: 0 }, P);
    expect([lost.objective, lost.evade, lost.fuel, lost.total]).toEqual([0, 0, 0, 700]);
    // 魚雷で沈めに行く（2 本命中、800-1200yd）より避ける方が上
    const fought = computeScore({ ...base, returned: true, objectiveDone: true, detections: 1, bands: [{ band: '800-1200yd', hits: 2, duds: 0 }] }, P);
    expect(fought.total).toBeLessThan(clean.total);
    // 駆逐艦の任務には回避の点が無い
    expect(computeScore({ ...base, missionType: 'intercept_destroyer', returned: true, objectiveDone: true, detections: 0 }, P).evade).toBe(0);
  });
});
