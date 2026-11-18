// v0.8.2 S0（spec-v0820 §4.2 D-C2〜D-C5・§10 R3）: 列だけの隊（enemy_start の無い駆逐艦の隊＝us_05）の組み立てと、その世界が組めて夜明けまで走ること。
// 世界は tests/transit-world-kit の小さな世界（entities/destroyer の式の素の艦 ＋ 本物の systems/destroyer-transit ＋ レーダー）。S0 の世界は艦ごとの記録・役・報告・弾薬庫を読まず、
// 7 隻（ハード 8）とも ijn_destroyer の形で片道の列を走る（Title に出ないので遊ぶ人には見えない）。撃沈の達成は全隻（R3: 0 にしない）・敵の来る位置は先頭の艦の入りの点。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { getPrototypeMission } from '../src/config/mission-data';
import { TRANSIT_GONE, TRANSIT_WAIT, transitCount, transitPending } from '../src/core/ship-transit';
import { directSortie } from '../src/core/sortie';
import { buildWorldSetup } from '../src/systems/world-setup';
import { kitStep, kitWorld, phases } from './transit-world-kit';

const STEP = 1 / 60;

describe('列だけの隊の組み立て（config/mission-data・systems/world-setup）', () => {
  it('us_05 は enemy_start も大発も無い駆逐艦の任務: 隊の出発点 0 隻・撃沈の達成は全隻（ノーマル 7・ハード 8）・敵の来る位置は満潮の入りの点', () => {
    for (const hard of [false, true]) {
      const m = getPrototypeMission(gameData, 'us_05', hard);
      expect([m.enemyStart, m.enemyStarts, m.barges, m.ptBoats, m.enemyCount, m.objectiveSinkCount]).toEqual([null, [], null, null, 7, null]);
      for (const seed of [1, 2, 3]) {
        const s = buildWorldSetup(gameData, 'us_05', { sortie: directSortie('us_05', seed, 'none', hard, false), hard });
        const t = s.transit!;
        expect([s.destroyer!.starts, s.destroyer!.objectiveSinks, t.ships]).toEqual([[], hard ? 8 : 7, hard ? 8 : 7]);
        expect(s.enemyFrom).toEqual({ x: t.inbound.appearX, y: t.inbound.laneY + 400 });
        expect(s.baseDetectM).toBe(2000); // 隊の見つける距離は先頭の駆逐艦の記録（D-C8）
      }
    }
  });
  it('ほかの任務の撃沈の達成・敵の来る位置は今の式のまま（列のある us_04 は objective_sink_count 1・護衛の出発点）', () => {
    const s = buildWorldSetup(gameData, 'us_04');
    expect([s.destroyer!.objectiveSinks, s.enemyFrom]).toEqual([1, { x: s.destroyer!.starts[0]!.x, y: s.destroyer!.starts[0]!.y }]);
    const src = readFileSync(join(__dirname, '..', 'src', 'systems', 'world-setup.ts'), 'utf8');
    expect(src).toContain('objectiveSinks: mission.objectiveSinkCount ?? (column ? transitPart.transit!.ships : mission.enemyStarts.length)');
    expect(src).toContain('const destroyer = mission.enemyStart || column ?');
  });
  it('列だけの隊は片道の列（transit.column）がある任務だけ: column の無い任務で enemy_start を消すと今の検査で止まる', () => {
    const d = JSON.parse(JSON.stringify(gameData)) as typeof gameData;
    const p = (d.missionsSeed.missions as unknown as Record<string, unknown>[]).find((m) => m['id'] === 'us_04')!['v0_1_prototype'] as Record<string, unknown>;
    delete p['enemy_start'];
    expect(() => getPrototypeMission(d, 'us_04')).toThrow(/us_04\.v0_1_prototype は enemy_start（駆逐艦）か barges（大発の隊）のどちらか一方を持つ/);
  });
});

describe('us_05 の世界（小さな世界）が夜明けまで走る', () => {
  for (const hard of [false, true]) {
    it(`${hard ? 'ハード' : 'ノーマル'}: 7 隻（ハード 8）が表の秒に西の縁の内 150 m の艦ごとの道に 090° で現れ、東の縁の外で去る（GONE。揚陸の地・復路なし）。夜明けの前にみな去り、隊は「すべて出た」`, () => {
      const w = kitWorld({ mission: 'us_05', hard, radar: true });
      const n = hard ? 8 : 7;
      expect([w.ships.length, w.transit.column.length, phases(w)]).toEqual([n, n, '0'.repeat(n)]);
      expect(w.ships.every((s) => s.offMap)).toBe(true); // まだ来ない＝海域の外
      const seen: { i: number; t: number; x: number; y: number; h: number }[] = [];
      let goneAt = NaN;
      let blips = 0;
      for (let k = 0; k < 280 * 60; k++) {
        const before = w.ships.map((s) => s.out);
        kitStep(w);
        w.ships.forEach((s, i) => {
          if (before[i] && !s.out) seen.push({ i, t: w.stepTimeS, x: s.state.x, y: s.state.y, h: s.state.headingDeg });
        });
        if (Number.isNaN(goneAt) && transitCount(w.transit.state, TRANSIT_GONE) === n) goneAt = w.stepTimeS;
        if (w.radar && w.radar.state.n > blips) blips = w.radar.state.n;
      }
      expect(seen.map((e) => e.i)).toEqual([...Array(n).keys()]);
      const want = hard ? [5, 20, 35, 50, 80, 85, 101, 109] : [5, 20, 35, 50, 80, 85, 101];
      seen.forEach((e, k) => expect(Math.abs(e.t - want[k]!), String(k)).toBeLessThanOrEqual(STEP + 1e-9));
      expect(seen.map((e) => [e.x, e.y, e.h])).toEqual(want.map((_t, k) => [150, [2800, 2800, 2800, 2800, 1800, 2400, 2400, 1800][k], 90]));
      expect(goneAt).toBeGreaterThan(hard ? 249 : 241);
      expect(goneAt).toBeLessThan(270 - 20);
      const st = w.transit.state;
      expect([st.arrivedCount, st.outCount, st.goneCount, transitPending(st), transitCount(st, TRANSIT_WAIT)]).toEqual([0, 0, n, 0, 0]);
      expect([w.transit.allOut, w.transit.allSettled, w.ships.every((s) => s.withdrawn && !s.sinking)]).toEqual([true, true, true]);
      expect(w.dawn.reached).toBe(true);
      expect(blips).toBeGreaterThanOrEqual(4); // 前衛 4 隻はレーダーに並ぶ（艦 6,000 m・陸のそばでない道）
    });
  }
  it('夜明けが早い夜（60 秒）: まだ来ない艦は入らず、海域の艦は東（スリガオ海峡）へ退いて去る', () => {
    const w = kitWorld({ mission: 'us_05', dawnS: 60, radar: false });
    for (let k = 0; k < 280 * 60; k++) kitStep(w);
    const st = w.transit.state;
    expect([st.inCount, st.goneCount, transitCount(st, TRANSIT_WAIT), transitPending(st), w.transit.allOut]).toEqual([4, 4, 3, 0, true]);
    expect(w.setup.dawnAir.retireEdge).toBe('east');
  });
});
