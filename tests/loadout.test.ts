// 兵装の data（v0.6.8。config/loadout-data。spec-v068 §1.1 D2・§2.1・§6.1）: 魚雷と機銃は全任務で両方。魚雷は艇の torpedoes.count（us 4・jp 2）、砲は艇の gun_battery
// （us_01 の Elco 77ft に足した 12.7mm 連装 ×2・400 発/分）。主兵装は mission.mainWeapon のまま。WorldSetup は変えない（guns・torpedoCapacity・mainWeapon は主兵装だけ＝
// 模擬と setup の snapshot が読むのはこれだけ）。us_03・jp_01・jp_05 の砲は WorldSetup の guns と同じ値。Boot の検査（validateLoadouts）は全任務で投げず、壊れた data は投げる。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gameData, getGunBatteryParams, getPrototypeMission } from '../src/config/game-data';
import { getBoatGunParams, getLoadout, validateLoadouts } from '../src/config/loadout-data';
import { buildWorldSetup } from '../src/systems/world-setup';

type Rec = Record<string, unknown>;
const IDS = ['us_01', 'us_02', 'us_03', 'jp_01', 'jp_02', 'jp_05', 'jp_06'] as const;
const TORPEDOES: Record<(typeof IDS)[number], number> = { us_01: 4, us_02: 4, us_03: 4, jp_01: 2, jp_02: 2, jp_05: 2, jp_06: 2 };
const clone = (): typeof gameData => JSON.parse(JSON.stringify(gameData)) as typeof gameData;
const boatOf = (d: typeof gameData, id: string): Rec => (d.boats.boats as unknown as Rec[]).find((b) => b['id'] === id)!;
/** WorldSetup の鍵（v0.6.7 の a9a8229 と同じ。jp_02 は patrolAir・jp_05 は engine が後ろに付く） */
const SETUP_KEYS = [
  'mission', 'playerStart', 'coastEdgeY', 'mainWeapon', 'boatParams', 'boundsMarginM', 'boatHalfLengthM', 'boatHalfBeamM', 'damageParams', 'timeScale', 'slowMoFactor', 'slowMoSeconds',
  'vis', 'baseDetectM', 'visRange2', 'detectRangeAtStartM', 'durationS', 'fuelCurve', 'fuelAllotmentGal', 'fuelStartGal', 'raid', 'start', 'grounding', 'friendly', 'storm', 'seaplane',
  'crew', 'crewEffects', 'destroyer', 'barges', 'guns', 'ptBoats', 'convoy', 'shoreBattery', 'shoreBatteries', 'hard', 'historical', 'transport', 'escort', 'torpedoCapacity',
  'torpedoParams', 'torpedoReliability', 'torpedoJitterDeg', 'launchOffsetM', 'salvoIntervalS', 'smokeParams', 'night', 'hazardsTonight', 'absentHazards', 'enemyFrom', 'dawnAir', 'airStrike',
];

describe('兵装の data（config/loadout-data）', () => {
  it.each(IDS)('%s: 魚雷は艇の数・砲は艇の gun_battery（どの任務も）・主兵装は mainWeapon のまま', (id) => {
    const m = getPrototypeMission(gameData, id);
    const lo = getLoadout(gameData, m);
    expect(lo.torpedoes).toBe(TORPEDOES[id]);
    expect(lo.gun).not.toBeNull();
    expect(lo.primary).toBe(m.mainWeapon);
    expect(lo.aa.hitChancePerRound).toBe(gameData.hitRateModel.anti_aircraft.hit_chance_per_round);
  });

  it('主兵装は us_01・us_02・jp_06 魚雷、us_03・jp_01・jp_05 機銃、jp_02 なし（v0.6.7 のまま）', () => {
    expect(IDS.map((id) => getPrototypeMission(gameData, id).mainWeapon)).toEqual(['torpedo', 'torpedo', 'guns', 'guns', 'none', 'guns', 'torpedo']);
  });

  it('us_elco77（us_01）の砲: 12.7mm連装×2・1 組 400 発/分。残りの値は us_elco80 の 20mm・12.7mm の組と同じ・射界の値も同じ', () => {
    const g = getBoatGunParams(gameData, 'us_elco77')!;
    const e80 = getBoatGunParams(gameData, 'us_elco80')!;
    expect(g.label).toBe('12.7mm連装×2');
    expect(g.groups.length).toBe(1);
    expect(g.groups[0]!.roundsPerMin).toBe(400);
    const { id: _a, roundsPerMin: _b, ...rest } = g.groups[0]!;
    const { id: _c, roundsPerMin: _d, ...rest80 } = e80.groups[1]!;
    expect(rest).toEqual(rest80);
    expect([g.rangeM, g.effectiveM, g.deadConeDeg, g.flashRevealM, g.spreadFactor]).toEqual([e80.rangeM, e80.effectiveM, e80.deadConeDeg, e80.flashRevealM, e80.spreadFactor]);
    expect('magazine' in g || 'minSpreadM' in g).toBe(false);
    expect(String((boatOf(gameData, 'us_elco77')['source'] as Rec)['gun_battery']).startsWith('design (v0.6.8')).toBe(true);
  });

  it.each(['us_03', 'jp_01', 'jp_05'] as const)('%s（主兵装が機銃）: 艇の砲は WorldSetup の guns と同じ値', (id) => {
    expect(getLoadout(gameData, getPrototypeMission(gameData, id)).gun).toEqual(buildWorldSetup(gameData, id).guns);
  });

  it('WorldSetup は変わらない: getGunBatteryParams は主兵装が guns の任務だけ（us_01 は null）・guns と torpedoCapacity は主兵装だけ・鍵の並びは a9a8229 のまま', () => {
    expect(getGunBatteryParams(gameData, getPrototypeMission(gameData, 'us_01'))).toBeNull();
    for (const id of IDS) {
      const w = buildWorldSetup(gameData, id);
      const extra = id === 'jp_02' ? ['patrolAir'] : id === 'jp_05' ? ['engine'] : [];
      expect(Object.keys(w), id).toEqual([...SETUP_KEYS, ...extra]);
      expect(w.guns === null, id).toBe(w.mainWeapon !== 'guns');
      expect(w.torpedoCapacity, id).toBe(w.mainWeapon === 'torpedo' ? TORPEDOES[id] : 0);
    }
  });

  it('getBoatGunParams: gun_battery の無い艇は null・無い艇は例外・壊れた値は getGunBatteryParams と同じ文（値の誤りには艇の id）', () => {
    expect(getBoatGunParams(gameData, 'us_higgins78')).toBeNull();
    expect(() => getBoatGunParams(gameData, 'no_such_boat')).toThrow(/boats\.json に no_such_boat が無い/);
    const d = clone();
    (boatOf(d, 'us_elco77')['gun_battery'] as Rec)['range_m'] = '600';
    expect(() => getBoatGunParams(d, 'us_elco77')).toThrow(/^boats\.json の us_elco77\.gun_battery（label_ja .*が無い（docs\/02 §6\.4）$/);
    const e = clone();
    (boatOf(e, 'us_elco77')['gun_battery'] as Rec)['effective_m'] = 0;
    expect(() => getBoatGunParams(e, 'us_elco77')).toThrow(/^us_elco77: boats\.json の gun_battery: range_m は正、effective_m は 0〜range_m/);
  });

  it('Boot の検査（validateLoadouts）: 全任務（ハードも）で投げない。壊れた艇の砲・対空の data は投げる。boot-scene は輪の後に 1 回呼ぶ', () => {
    expect(() => validateLoadouts(gameData)).not.toThrow();
    const d = clone();
    (boatOf(d, 'jp_t14')['gun_battery'] as Rec)['dead_cone_deg'] = 95;
    expect(() => validateLoadouts(d)).toThrow(/jp_t14: .*dead_cone_deg/);
    const a = clone();
    (a.hitRateModel as unknown as Rec)['anti_aircraft'] = { range_m: 650 };
    expect(() => validateLoadouts(a)).toThrow(/anti_aircraft\.hit_chance_per_round/);
    const src = readFileSync(join(__dirname, '..', 'src', 'scenes', 'boot-scene.ts'), 'utf8');
    const loopEnd = src.indexOf('for (const id of boatIds)');
    const call = src.indexOf('validateLoadouts(gameData)');
    expect(loopEnd).toBeGreaterThan(0);
    expect(call).toBeGreaterThan(loopEnd);
  });
});
