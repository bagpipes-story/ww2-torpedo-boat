import { describe, expect, it } from 'vitest';
import { gameData, getPrototypeMission, getShoreBatteryParams, getShoreBatteryParamsList } from '../src/config/game-data';
import { getMenuEntries } from '../src/config/mission-data';
import { getBriefingRecord } from '../src/config/briefing-data';
import { briefingRows, enemyCountsJa } from '../src/core/briefing';
import { directSortie, isSortie, rollRaid } from '../src/core/sortie';
import { briefingNumbers, buildWorldSetup } from '../src/systems/world-setup';

type Rec = Record<string, unknown>;
const clone = (): typeof gameData => JSON.parse(JSON.stringify(gameData)) as typeof gameData;
const proto = (d: typeof gameData, id: string): Rec => (d.missionsSeed.missions as unknown as Rec[]).find((m) => m['id'] === id)!['v0_1_prototype'] as Rec;

describe('難易度ハード（v0.4.5。敵の数が増える）', () => {
  it('出撃できる 3 任務はすべて hard block を持つ。ノーマルで読むと v0.4.4 と同じ（駆逐艦 1 隻・沿岸砲 1 門）', () => {
    for (const e of getMenuEntries(gameData).entries) {
      expect(proto(gameData, e.id)['hard'], e.id).toBeDefined();
      const m = getPrototypeMission(gameData, e.id);
      expect(m.hard).toBe(false);
      if (m.enemyStart) expect(m.enemyStarts).toEqual([m.enemyStart]);
      if (m.shoreBattery) expect(m.shoreBatteryXs).toEqual([m.shoreBattery.xM]);
    }
  });
  it('us_02 ハード: 駆逐艦 2 隻（北西 (1500, 300) と北東 (4500, 300)）。enemyCount 2、Briefing の敵は「駆逐艦 ×2」、世界の starts も 2', () => {
    const m = getPrototypeMission(gameData, 'us_02', true);
    expect(m.hard).toBe(true);
    expect(m.enemyStarts).toEqual([
      { x: 1500, y: 300, headingDeg: 135 },
      { x: 4500, y: 300, headingDeg: 225 },
    ]);
    expect(m.enemyCount).toBe(2);
    expect(m.enemyStart).toEqual({ x: 1500, y: 300, headingDeg: 135 });
    const b = getBriefingRecord(gameData, 'us_02', true);
    expect(b.enemyIds).toEqual(['ijn_destroyer', 'ijn_destroyer', 'ijn_transport']); // 輸送船（v0.4.7）は隊の後ろ
    expect(enemyCountsJa(b.enemyIds.slice(0, 2), () => '駆逐艦')).toBe('駆逐艦 ×2');
    expect(getBriefingRecord(gameData, 'us_02').enemyIds).toEqual(['ijn_destroyer', 'ijn_transport']);
    const s = buildWorldSetup(gameData, 'us_02', { hard: true });
    expect(s.hard).toBe(true);
    expect(s.destroyer!.starts.length).toBe(2);
    expect(briefingRows(b, briefingNumbers(s), (id) => (id === 'ijn_transport' ? '輸送船' : '駆逐艦'), (h) => h)[3]).toEqual({ label: '敵', text: '駆逐艦 ×2、輸送船 ×1（北西から）' });
  });
  it('us_01 ハード: 封鎖線が 2 列（y 3,000 を東へ、y 2,000 を西へ）。僚艇はそのまま', () => {
    const m = getPrototypeMission(gameData, 'us_01', true);
    expect(m.enemyStarts.map((s) => [s.x, s.y, s.headingDeg])).toEqual([
      [600, 3000, 90],
      [5400, 2000, 270],
    ]);
    expect(m.escort).not.toBeNull();
    const s = buildWorldSetup(gameData, 'us_01', { hard: true });
    expect(s.destroyer!.starts.length).toBe(2);
    expect(s.escort).not.toBeNull();
  });
  it('us_03 ハード: 沿岸砲 2 門（x 4,600 と 2,600）。大発は 4 隻のまま。?debug&nobattery なら 0 門', () => {
    const m = getPrototypeMission(gameData, 'us_03', true);
    expect(m.shoreBatteryXs).toEqual([4600, 2600]);
    expect(m.enemyCount).toBe(4);
    const list = getShoreBatteryParamsList(gameData, m);
    expect(list.map((p) => [p.x, p.y])).toEqual([
      [4600, 2560],
      [2600, 2560],
    ]);
    expect(getShoreBatteryParams(gameData, m)!.x).toBe(4600);
    const s = buildWorldSetup(gameData, 'us_03', { hard: true });
    expect(s.shoreBatteries.length).toBe(2);
    expect(s.shoreBattery!.x).toBe(4600);
    expect(buildWorldSetup(gameData, 'us_03', { batteryOff: true, hard: true }).shoreBatteries).toEqual([]);
    // 2 門の射界（浅瀬の縁 y 2,200）: 1,752〜3,448 と 3,752〜5,448 → 縁の x 3,000〜3,850 の待ち伏せも射界の中
    const r = Math.sqrt(900 * 900 - 360 * 360);
    expect(Math.round(2600 - r)).toBe(1775);
    expect(Math.round(4600 + r)).toBe(5425);
  });
  it('検査: hard block が object でない、extra_enemy_starts が空、大発の任務に extra_enemy_starts、駆逐艦の任務に extra_shore_battery_x_m、幅の外の x は例外。壊れた start も例外（ハードのときだけ読む）', () => {
    const notObj = clone();
    proto(notObj, 'us_02')['hard'] = 1;
    expect(() => getPrototypeMission(notObj, 'us_02')).toThrow(/hard が object/);
    const empty = clone();
    (proto(empty, 'us_02')['hard'] as Rec)['extra_enemy_starts'] = [];
    expect(() => getPrototypeMission(empty, 'us_02')).toThrow(/extra_enemy_starts/);
    const bargesWithShips = clone();
    (proto(bargesWithShips, 'us_03')['hard'] as Rec)['extra_enemy_starts'] = [{ x_m: 1, y_m: 1, heading_deg: 0 }];
    expect(() => getPrototypeMission(bargesWithShips, 'us_03')).toThrow(/駆逐艦/);
    const shipsWithBattery = clone();
    (proto(shipsWithBattery, 'us_02')['hard'] as Rec)['extra_shore_battery_x_m'] = [100];
    expect(() => getPrototypeMission(shipsWithBattery, 'us_02')).toThrow(/沿岸砲/);
    const outside = clone();
    (proto(outside, 'us_03')['hard'] as Rec)['extra_shore_battery_x_m'] = [7000];
    expect(() => getPrototypeMission(outside, 'us_03')).toThrow(/幅の中/);
    const badStart = clone();
    (proto(badStart, 'us_02')['hard'] as Rec)['extra_enemy_starts'] = [{ x_m: 1 }];
    expect(() => getPrototypeMission(badStart, 'us_02')).not.toThrow();
    expect(() => getPrototypeMission(badStart, 'us_02', true)).toThrow(/extra_enemy_starts\[0\]/);
  });
  it('出撃に hard が乗る: rollRaid / directSortie の既定はノーマル、isSortie は hard の無い形を通さない。world-setup は出撃と引数の難易度が違えば例外', () => {
    expect(rollRaid('us_02', 1, null).hard).toBe(false);
    expect(rollRaid('us_02', 1, null, 'none', true).hard).toBe(true);
    expect(directSortie('us_02', 1, 'none').hard).toBe(false);
    expect(directSortie('us_02', 1, 'none', true).hard).toBe(true);
    expect(isSortie({ missionId: 'us_02', seed: 1, raid: false, choice: 0, stayHit: false })).toBe(false);
    expect(isSortie(directSortie('us_02', 1, 'none', true))).toBe(true);
    expect(() => buildWorldSetup(gameData, 'us_02', { sortie: directSortie('us_02', 1, 'none', true) })).toThrow(/難易度/);
    expect(buildWorldSetup(gameData, 'us_02', { sortie: directSortie('us_02', 1, 'none', true), hard: true }).destroyer!.starts.length).toBe(2);
  });
});
