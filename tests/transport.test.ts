import { describe, expect, it } from 'vitest';
import { gameData, getEnemyRecord, getPrototypeMission, getScoringParams } from '../src/config/game-data';
import { getBriefingRecord } from '../src/config/mission-data';
import { gunneryParamsFromData, isEnemyGunneryDataRecord } from '../src/core/gunnery';
import { computeScore } from '../src/core/scoring';
import { createCircles, fillHullCircles, pointHitsHull } from '../src/core/torpedo-solver';
import { directSortie } from '../src/core/sortie';
import { ktToMps } from '../src/core/units';
import { buildWorldSetup } from '../src/systems/world-setup';

type Rec = Record<string, unknown>;
const clone = (): typeof gameData => JSON.parse(JSON.stringify(gameData)) as typeof gameData;
const proto = (d: typeof gameData, id: string): Rec => (d.missionsSeed.missions as unknown as Rec[]).find((m) => m['id'] === id)!['v0_1_prototype'] as Rec;

describe('輸送船（v0.4.7。東京急行に 1 隻混じる）', () => {
  it('enemies.json の ijn_transport が読める: 120 × 16 m、9 kt・12 kt、沈没 1 本、76mm 1 門、探照灯・星弾なし（射程 0）、体当たりなし、端 700 m', () => {
    const r = getEnemyRecord(gameData, 'ijn_transport');
    expect([r.length_m, r.beam_m, r.torpedo_hits_to_sink, r.hull_circles]).toEqual([120, 16, 1, 5]);
    expect([r.speed_typical_kt, r.speed_max_kt]).toEqual([9, 12]);
    expect(r.ram.enabled).toBe(false);
    expect(r.patrol.edge_turn_margin_m).toBe(700);
    expect(isEnemyGunneryDataRecord(r)).toBe(true);
    const g = gunneryParamsFromData(r);
    expect(g.guns.map((x) => [x.id, x.effectiveM, x.damage])).toEqual([['deck_gun_76mm', 2500, 25]]);
    expect([g.searchlight.rangeM, g.starshell.rangeM, g.searchlight.onDelayS]).toEqual([0, 0, Infinity]);
    // 駆逐艦は従来どおり
    expect(gunneryParamsFromData(getEnemyRecord(gameData, 'ijn_destroyer')).searchlight.rangeM).toBe(3000);
  });
  it('us_02: transport は (2100, 900) 135°。Briefing の敵は「駆逐艦 ×1、輸送船 ×1」。us_01・us_03 には無い', () => {
    const m = getPrototypeMission(gameData, 'us_02');
    expect(m.transport).toEqual({ enemyId: 'ijn_transport', start: { x: 2100, y: 900, headingDeg: 135 } });
    expect(getBriefingRecord(gameData, 'us_02').enemyIds).toEqual(['ijn_destroyer', 'ijn_transport']);
    expect(getPrototypeMission(gameData, 'us_01').transport).toBeNull();
    expect(getPrototypeMission(gameData, 'us_03').transport).toBeNull();
  });
  it('world-setup: 輸送船の数値（9 kt、備砲、通過半径）。揺らぎは隊の最後として同じ幅・同じ反転。?debug&notransport で null。検査: enemies に無い id・大発の任務は例外', () => {
    const s = buildWorldSetup(gameData, 'us_02');
    const t = s.transport!;
    expect(t.enemyId).toBe('ijn_transport');
    expect(t.start).toEqual({ x: 2100, y: 900, headingDeg: 135 });
    expect(t.shipAi.cruiseSpeedMps).toBeCloseTo(ktToMps(9), 9);
    expect(t.shipAi.ramEnabled).toBe(false);
    expect(t.gunnery.guns[0]!.id).toBe('deck_gun_76mm');
    expect(t.spec.hitsToSink).toBe(1);
    expect(t.passRadius2).toBeGreaterThan(s.destroyer!.passRadius2);
    expect(s.destroyer!.starts.length).toBe(1);
    expect(s.night.enemyOffsets.length).toBe(2);
    expect(buildWorldSetup(gameData, 'us_02', { transportOff: true }).transport).toBeNull();
    expect(buildWorldSetup(gameData, 'us_02', { transportOff: true }).night.enemyOffsets.length).toBe(1);
    // 揺らぎ: 輸送船は隊の最後（添字 1）のずれ。反転した夜は x → 6000 − x
    let seed = 1;
    while (!buildWorldSetup(gameData, 'us_02', { sortie: directSortie('us_02', seed, 'none') }).night.mirrored) seed++;
    const w = buildWorldSetup(gameData, 'us_02', { sortie: directSortie('us_02', seed, 'none') });
    const o = w.night.enemyOffsets[1]!;
    expect(w.transport!.start.x).toBeCloseTo(6000 - (2100 + o.dx), 6);
    expect(w.transport!.start.headingDeg).toBeCloseTo(360 - (135 + o.dh), 6);
    expect(w.destroyer!.starts.length).toBe(1);
    // ハード: 駆逐艦 2 隻＋輸送船 1 隻
    const h = buildWorldSetup(gameData, 'us_02', { hard: true });
    expect(h.destroyer!.starts.length).toBe(2);
    expect(h.transport).not.toBeNull();
    const bad = clone();
    (proto(bad, 'us_02')['transport'] as Rec)['enemy_id'] = 'no_such';
    expect(() => getPrototypeMission(bad, 'us_02')).toThrow(/enemies\.json/);
    const barges = clone();
    proto(barges, 'us_03')['transport'] = proto(barges, 'us_02')['transport'];
    expect(() => getPrototypeMission(barges, 'us_03')).toThrow(/駆逐艦/);
  });
  it('当たり判定（v0.4.8。実機「輸送船・駆逐艦の後部に当たったはずが当たらない」）: 船体は絵と同じ 2 倍。絵の艦尾から 5% の点（中心から 45%）に当たり、絵の外（中心から 52%）には当たらない', () => {
    const w = gameData.hitRateModel.world;
    expect(w.ship_hit_scale).toBe(w.sprite_scale);
    for (const [id, setup] of [['ijn_transport', buildWorldSetup(gameData, 'us_02').transport!], ['ijn_destroyer', buildWorldSetup(gameData, 'us_02').destroyer!]] as const) {
      const r = getEnemyRecord(gameData, id);
      const spriteLen = r.length_m * w.sprite_scale;
      const hull = createCircles(setup.spec.hullCircles);
      // 北向き・原点。艦尾は +y
      fillHullCircles(hull, 0, 0, 0, setup.spec.lengthM * setup.spec.hitScale, setup.spec.beamM * setup.spec.hitScale);
      expect(pointHitsHull(0, spriteLen * 0.45, hull), id).toBe(true);
      expect(pointHitsHull(0, -spriteLen * 0.45, hull), id).toBe(true);
      expect(pointHitsHull(0, spriteLen * 0.52, hull), id).toBe(false);
      // 実寸（v0.4.7 まで）だと絵の艦尾の 1/4 は当たらなかった
      fillHullCircles(hull, 0, 0, 0, r.length_m, r.beam_m);
      expect(pointHitsHull(0, spriteLen * 0.45, hull), id).toBe(false);
    }
  });
  it('スコア: 輸送船の撃破 400（kill.points_by_enemy.ijn_transport）。駆逐艦と輸送船を 1 本ずつ（800-1200yd）沈めて帰投 = 700+300+300+400+燃料+乗員', () => {
    const P = getScoringParams(gameData);
    expect(P.killPoints['ijn_transport']).toBe(400);
    const both = computeScore({ returned: true, objectiveDone: true, missionType: 'intercept_destroyer', bands: [{ band: '800-1200yd', hits: 2, duds: 0 }], kills: 1, killEnemyId: 'ijn_transport', fuelLeftPct: 30, crewAlive: 14, crewTotal: 14 }, P);
    expect([both.objective, both.hits, both.kills, both.total]).toEqual([300, 300, 400, 700 + 300 + 300 + 400 + 30 + 100]);
    // 輸送船だけ沈めて帰投（達成なし）: 700 + 命中 150 + 400
    const only = computeScore({ returned: true, objectiveDone: false, missionType: 'intercept_destroyer', bands: [{ band: '800-1200yd', hits: 1, duds: 0 }], kills: 1, killEnemyId: 'ijn_transport', fuelLeftPct: 30, crewAlive: 14, crewTotal: 14 }, P);
    expect(only.total).toBe(700 + 150 + 400);
  });
});
