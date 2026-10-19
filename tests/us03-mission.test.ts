import { describe, expect, it } from 'vitest';
import { gameData, getPrototypeMission, getScoringParams } from '../src/config/game-data';
import { enemyNameJa, getBriefingRecord, riskLabelJa } from '../src/config/mission-data';
import { briefingRows } from '../src/core/briefing';
import { computeScore, type ScoreInput } from '../src/core/scoring';
import { briefingNumbers, buildWorldSetup } from '../src/systems/world-setup';

type Rec = Record<string, unknown>;
const clone = (): typeof gameData => JSON.parse(JSON.stringify(gameData)) as typeof gameData;
const proto = (d: typeof gameData): Rec => (d.missionsSeed.missions as unknown as Rec[]).find((m) => m['id'] === 'us_03')!['v0_1_prototype'] as Rec;
const nameOf = (id: string): string => enemyNameJa(gameData, id);
const labelOf = (id: string): string => riskLabelJa(gameData, id);

describe('us_03 の世界と Briefing（v0.4.2）', () => {
  it('buildWorldSetup: 駆逐艦なし・主兵装 guns・魚雷 0・大発 4・砲あり・夜明け 200 秒・燃料 36 gal（v0.6.1 実機 1 回目）・夜明けの空襲あり・危険は無し（味方機・暴風・水上機 null）・視程 900・停止で見つかる 288。&barges=near は先頭の 450 m 西・130 m 北（浅瀬の縁の 30 m 外）', () => {
    const s = buildWorldSetup(gameData, 'us_03');
    expect(s.destroyer).toBeNull();
    expect(s.mainWeapon).toBe('guns');
    expect(s.torpedoCapacity).toBe(0);
    expect(s.barges!.count).toBe(4);
    expect(s.guns!.rangeM).toBe(600);
    expect(s.playerStart).toEqual({ x: 3000, y: 700, headingDeg: 180 });
    expect([s.durationS, s.fuelAllotmentGal]).toEqual([200, 36]);
    expect(s.dawnAir.playAs).toBe('enemy');
    expect(s.airStrike).not.toBeNull();
    expect([s.friendly, s.storm, s.seaplane]).toEqual([null, null, null]);
    expect(s.visRange2).toBeCloseTo(900 * 900, 6);
    expect(s.detectRangeAtStartM).toBeCloseTo(288, 6);
    expect(s.coastEdgeY).toBe(2200); // 「岸 N m」の行き先＝岸に接する浅瀬の縁（出発点から 1,500 m 南）
    expect([s.shoreBattery!.x, s.shoreBattery!.y, s.shoreBattery!.gun.effectiveM]).toEqual([4600, 2560, 900]); // 沿岸砲（v0.4.3）: 岸の線 2,500 の 60 m 陸側
    expect(buildWorldSetup(gameData, 'us_03', { batteryOff: true }).shoreBattery).toBeNull(); // ?debug&nobattery
    expect(buildWorldSetup(gameData, 'us_02').shoreBattery).toBeNull();
    expect(buildWorldSetup(gameData, 'us_02').coastEdgeY).toBeNaN(); // 岸の無い任務は矢印なし
    expect(buildWorldSetup(gameData, 'us_03', { bargesNear: true }).playerStart).toEqual({ x: 3800, y: 2170, headingDeg: 90 });
    expect(buildWorldSetup(gameData, 'us_02', { bargesNear: true }).playerStart).toEqual(getPrototypeMission(gameData, 'us_02').playerStart);
  });
  it('Briefing の数値と行', () => {
    const n = briefingNumbers(buildWorldSetup(gameData, 'us_03'));
    expect(n).toEqual({ visM: 900, detectCruiseM: 720, detectSilentM: 360, durationS: 200, dawnJa: '（以後は空襲）', fuelGal: 36, torpedoes: 0, gunsLabel: '40mm・37mm・20mm・12.7mm', enemyFromJa: '南東', homeX: 3000, homeY: 300, boundsW: 6000, boundsH: 2500 });
    const rows = briefingRows(getBriefingRecord(gameData, 'us_03'), n, nameOf, labelOf);
    expect(rows.map((r) => r.label)).toEqual(['目的', '成功', '月', '敵', '危険', '条件']);
    expect(rows[0]!.text).toBe('南の岸沿いを東から西へ這う大発を砲で撃破する。魚雷は当たらない（深度不足）。沿岸砲の射界に注意');
    expect(rows[1]!.text).toBe('大発3隻以上撃破して帰投（帰投地点は北の青い輪）');
    expect(rows[2]!.text).toBe('新月 ・ 見える 900 m ・ 見つかる 巡航 720 m／静音 360 m');
    expect(rows[3]!.text).toBe('大発動艇 ×4（南東から）');
    expect(rows[4]!.text).toBe('敵艦艇の砲撃・衝突、敵沿岸砲、座礁、夜明けの空襲');
    expect(rows[5]!.text).toBe('夜明けまで 200 秒（以後は空襲） ・ 燃料 36 gal ・ 砲 40mm・37mm・20mm・12.7mm');
  });
  it('任務の検査: guns でない（torpedo_immune）・enemy_start と barges の両方・coast が無い・coast が north は例外', () => {
    const a = clone();
    proto(a)['main_weapon'] = 'torpedo';
    expect(() => getPrototypeMission(a, 'us_03')).toThrow(/torpedo_immune/);
    const b = clone();
    proto(b)['enemy_start'] = { x_m: 100, y_m: 100, heading_deg: 0 };
    expect(() => getPrototypeMission(b, 'us_03')).toThrow(/どちらか一方/);
    const c = clone();
    delete proto(c)['coast'];
    expect(() => getPrototypeMission(c, 'us_03')).toThrow(/coast/);
    const e = clone();
    (proto(e)['coast'] as Rec)['side'] = 'north';
    expect(() => getPrototypeMission(e, 'us_03')).toThrow(/south/);
  });
  it('スコア: 4 隻撃破して帰投（燃料 23%・乗員 13/14）1,416、3 隻（25%・13/14）1,343、4 隻撃破して沈没 600 < 撃たずに帰投 700 < 2 隻で帰投 850', () => {
    const P = getScoringParams(gameData);
    const base: ScoreInput = { returned: true, objectiveDone: true, missionType: 'barge_hunt', bands: [], kills: 4, killEnemyId: 'daihatsu_barge', fuelLeftPct: 23, crewAlive: 13, crewTotal: 14 };
    expect(computeScore(base, P)).toEqual({ survival: 700, objective: 300, hits: 0, kills: 300, evade: 0, fuel: 23, crew: 93, crewHalf: false, total: 1416 });
    expect(computeScore({ ...base, kills: 3, fuelLeftPct: 25 }, P).total).toBe(1343);
    expect(computeScore({ ...base, returned: false, kills: 4, crewAlive: 0 }, P).total).toBe(600);
    expect(computeScore({ ...base, objectiveDone: false, kills: 0 }, P).total).toBe(700);
    expect(computeScore({ ...base, objectiveDone: false, kills: 2 }, P).total).toBe(850);
    expect(() => computeScore({ ...base, killEnemyId: 'ijn_destroyer' }, P)).toThrow(/points_by_enemy/);
  });
});
