import { describe, expect, it } from 'vitest';
import { gameData, getPrototypeMission } from '../src/config/game-data';
import { getBriefingRecord, riskLabelJa } from '../src/config/mission-data';
import { absentJa, briefingRows } from '../src/core/briefing';
import { fixedNight, hazardChance, isNightDataRecord, nightFromData, rollNight, NIGHT_SEED_OFFSET } from '../src/core/night';
import { directSortie } from '../src/core/sortie';
import { briefingNumbers, buildWorldSetup } from '../src/systems/world-setup';

type Rec = Record<string, unknown>;
const clone = (): typeof gameData => JSON.parse(JSON.stringify(gameData)) as typeof gameData;
const proto = (d: typeof gameData, id: string): Rec => (d.missionsSeed.missions as unknown as Rec[]).find((m) => m['id'] === id)!['v0_1_prototype'] as Rec;
const share = (id: string): number => (gameData.riskEvents.events.find((e) => e.id === id) as unknown as { share: number }).share;
const N = 2000;

describe('夜の揺らぎ（core/night、v0.4.6）', () => {
  it('data: us_02 は暴風・敵航空機・友軍誤射が share × 8（32%・80%・80%）、us_01 は暴風 60%、us_03 は危険の揺らぎなし（大発の先頭 ±250 m・沿岸砲 ±200 m）。seed は +16', () => {
    expect(NIGHT_SEED_OFFSET).toBe(16);
    const n2 = getPrototypeMission(gameData, 'us_02').night!;
    expect(n2.optionalHazards).toEqual(['storm', 'enemy_aircraft', 'friendly_fire']);
    expect([hazardChance(n2, share, 'storm'), hazardChance(n2, share, 'enemy_aircraft'), hazardChance(n2, share, 'friendly_fire'), hazardChance(n2, share, 'grounding')].map((p) => Math.round(p * 100))).toEqual([32, 80, 80, 100]);
    expect([n2.enemyJitterXM, n2.enemyJitterYM, n2.enemyJitterHeadingDeg]).toEqual([500, 200, 15]);
    const n1 = getPrototypeMission(gameData, 'us_01').night!;
    expect(Math.round(hazardChance(n1, share, 'storm') * 100)).toBe(60);
    expect([n1.enemyJitterXM, n1.enemyJitterYM, n1.enemyJitterHeadingDeg]).toEqual([800, 100, 0]);
    const n3 = getPrototypeMission(gameData, 'us_03').night!;
    expect(n3.optionalHazards).toEqual([]);
    expect([n3.bargeLeadJitterM, n3.shoreBatteryJitterM]).toEqual([250, 200]);
  });
  it('rollNight: 同じ seed なら同じ夜、2,000 夜の出現率は確率の ±4% 以内、ずれは ±最大の内。乱数の回数は固定（危険が出ない夜でも敵のずれは同じ式）', () => {
    const b = getPrototypeMission(gameData, 'us_02').night!;
    expect(rollNight(b, share, 42, 2, 0)).toEqual(rollNight(b, share, 42, 2, 0));
    const count: Record<string, number> = { storm: 0, enemy_aircraft: 0, friendly_fire: 0 };
    for (let s = 1; s <= N; s++) {
      const r = rollNight(b, share, s, 1, 0);
      for (const id of Object.keys(count)) if (!r.absentHazards.includes(id)) count[id]!++;
      const o = r.enemyOffsets[0]!;
      expect(Math.abs(o.dx)).toBeLessThanOrEqual(500);
      expect(Math.abs(o.dy)).toBeLessThanOrEqual(200);
      expect(Math.abs(o.dh)).toBeLessThanOrEqual(15);
    }
    expect(Math.abs(count['storm']! / N - 0.32)).toBeLessThan(0.04);
    expect(Math.abs(count['enemy_aircraft']! / N - 0.8)).toBeLessThan(0.04);
    expect(Math.abs(count['friendly_fire']! / N - 0.8)).toBeLessThan(0.04);
    // 危険を全部確率 1 にしても敵のずれは変わらない（引く回数が同じ）
    const sure = { ...b, hazardScale: 1000 };
    expect(rollNight(sure, share, 9, 2, 0).enemyOffsets).toEqual(rollNight(b, share, 9, 2, 0).enemyOffsets);
    expect(rollNight(sure, share, 9, 1, 0).absentHazards).toEqual([]);
    // 2 隻目を足しても 1 隻目のずれは同じ（ハードの追加は後ろに並ぶ）
    expect(rollNight(b, share, 9, 2, 0).enemyOffsets[0]).toEqual(rollNight(b, share, 9, 1, 0).enemyOffsets[0]);
    expect(fixedNight(2, 1)).toEqual({ absentHazards: [], enemyOffsets: [{ dx: 0, dy: 0, dh: 0 }, { dx: 0, dy: 0, dh: 0 }], bargeLeadDx: 0, batteryDx: [0], mirrored: false });
    // 左右反転（実機 1 回目「敵の来る位置の違いが分からない」）: 2,000 夜で 50% ±4%
    let m = 0;
    for (let s = 1; s <= N; s++) if (rollNight(b, share, s, 1, 0).mirrored) m++;
    expect(Math.abs(m / N - 0.5)).toBeLessThan(0.04);
  });
  it('検査: optional が任務の hazards に無い・risk_events に無い・重複、hazard_scale 0、ずれが負は例外。isNightDataRecord は optional_hazards が無ければ false', () => {
    const ok = { hazard_scale: 8, optional_hazards: ['storm'] };
    const has = (id: string): boolean => id !== 'nope';
    expect(() => nightFromData(ok, ['grounding'], has, 'x')).toThrow(/hazards に無い/);
    expect(() => nightFromData({ ...ok, optional_hazards: ['nope'] }, ['nope'], has, 'x')).toThrow(/risk_events/);
    expect(() => nightFromData({ ...ok, optional_hazards: ['storm', 'storm'] }, ['storm'], has, 'x')).toThrow(/重複/);
    expect(() => nightFromData({ ...ok, hazard_scale: 0 }, ['storm'], has, 'x')).toThrow(/hazard_scale/);
    expect(() => nightFromData({ ...ok, enemy_jitter: { x_m: -1, y_m: 0, heading_deg: 0 } }, ['storm'], has, 'x')).toThrow(/enemy_jitter/);
    expect(() => nightFromData({ ...ok, barge_lead_jitter_m: -5 }, ['storm'], has, 'x')).toThrow(/barge_lead/);
    expect(isNightDataRecord({ hazard_scale: 1 })).toBe(false);
    const broken = clone();
    (proto(broken, 'us_02')['night'] as Rec)['optional_hazards'] = ['shore_battery'];
    expect(() => getPrototypeMission(broken, 'us_02')).toThrow(/shore_battery/);
  });
  it('world-setup: 出撃の seed があれば揺らぐ（暴風・敵機・味方機が今夜いなければ null、駆逐艦の出発点がずれて海域の内）。seed が無い・fixedNight なら v0.4.5 と同じ。force は今夜いなくても出す', () => {
    const fixed = buildWorldSetup(gameData, 'us_02');
    expect(fixed.night).toEqual(fixedNight(2, 0)); // 駆逐艦 1 隻＋輸送船 1 隻（v0.4.7）
    expect(fixed.hazardsTonight).toEqual(fixed.mission.hazards);
    let noStorm = -1;
    for (let seed = 1; seed < 200 && noStorm < 0; seed++) if (buildWorldSetup(gameData, 'us_02', { sortie: directSortie('us_02', seed, 'none') }).storm === null) noStorm = seed;
    expect(noStorm).toBeGreaterThan(0);
    const s = buildWorldSetup(gameData, 'us_02', { sortie: directSortie('us_02', noStorm, 'none') });
    expect(s.absentHazards).toContain('storm');
    expect(s.hazardsTonight).not.toContain('storm');
    expect(s.hazardsTonight).toContain('enemy_ship_gunfire_or_ram');
    const st = s.destroyer!.starts[0]!;
    const o = s.night.enemyOffsets[0]!;
    // ずれを足してから左右反転（反転した夜は x → 6000 − x、針路 → 360 − 針路）
    expect(st.x).toBeCloseTo(s.night.mirrored ? 6000 - (1500 + o.dx) : 1500 + o.dx, 6);
    expect(st.headingDeg).toBeCloseTo(s.night.mirrored ? 360 - (135 + o.dh) : 135 + o.dh, 6);
    expect(st.y).toBeGreaterThanOrEqual(s.destroyer!.spec.boundsMarginM);
    expect(buildWorldSetup(gameData, 'us_02', { sortie: directSortie('us_02', noStorm, 'none'), forceStorm: true }).storm).not.toBeNull();
    const fx = buildWorldSetup(gameData, 'us_02', { sortie: directSortie('us_02', noStorm, 'none'), fixedNight: true });
    expect(fx.storm).not.toBeNull();
    expect(fx.destroyer!.starts).toEqual(fixed.destroyer!.starts);
    // us_03: 大発の先頭と沿岸砲がずれる（ハードの 2 門目も）
    let seed3 = 1;
    while (buildWorldSetup(gameData, 'us_03', { sortie: directSortie('us_03', seed3, 'none', true), hard: true }).night.mirrored) seed3++;
    const b = buildWorldSetup(gameData, 'us_03', { sortie: directSortie('us_03', seed3, 'none', true), hard: true });
    expect(b.barges!.leadX).toBeCloseTo(4250 + b.night.bargeLeadDx, 6);
    expect(b.shoreBatteries.map((p, i) => p.x - [4600, 2600][i]!)).toEqual(b.night.batteryDx.map((d) => expect.closeTo(d, 6)));
    expect(Math.abs(b.night.bargeLeadDx)).toBeLessThanOrEqual(250);
    // 反転した夜: 大発は西から東へ（針路 90°）、先頭 x 1,750 付近・最後尾が西の縁より内、沿岸砲 x 1,400・3,400 付近。HUD の手がかりは「西から」
    let seedM = 1;
    while (!buildWorldSetup(gameData, 'us_03', { sortie: directSortie('us_03', seedM, 'none', true), hard: true }).night.mirrored) seedM++;
    const bm = buildWorldSetup(gameData, 'us_03', { sortie: directSortie('us_03', seedM, 'none', true), hard: true });
    expect(bm.barges!.headingDeg).toBe(90);
    expect(Math.abs(bm.barges!.leadX - 1750)).toBeLessThanOrEqual(250);
    expect(bm.barges!.leadX - 1600).toBeGreaterThanOrEqual(bm.barges!.boundsMarginM);
    expect(bm.shoreBatteries.map((p) => Math.round(p.x / 200) * 200)).toEqual([1400, 3400].map((x) => expect.closeTo(x, -3)));
    expect(briefingNumbers(bm).enemyFromJa).toBe('南西');
    // us_01 ハード: 2 列目の y は 1,900〜2,100（サンゴ礁 y 1,300〜1,900 に入らない）
    for (let seed = 1; seed < 100; seed++) {
      const u = buildWorldSetup(gameData, 'us_01', { sortie: directSortie('us_01', seed, 'none', true), hard: true });
      expect(u.destroyer!.starts[1]!.y).toBeGreaterThanOrEqual(1900);
      expect(u.destroyer!.starts.every((p) => p.headingDeg === 90 || p.headingDeg === 270)).toBe(true);
      // 2 列は逆向き（反転しても）
      expect(u.destroyer!.starts[0]!.headingDeg).not.toBe(u.destroyer!.starts[1]!.headingDeg);
    }
  });
  it('Briefing: 危険の行は今夜いるものだけ、いないものは「（今夜は 暴風・友軍誤射 なし）」', () => {
    const labelOf = (id: string): string => riskLabelJa(gameData, id);
    expect(absentJa(['storm', 'friendly_fire'], labelOf)).toBe('（今夜は 暴風・友軍誤射 なし）');
    expect(absentJa([], labelOf)).toBe('');
    let seed = 1;
    for (; seed < 500; seed++) {
      const s = buildWorldSetup(gameData, 'us_02', { sortie: directSortie('us_02', seed, 'none') });
      if (s.absentHazards.includes('storm') && s.absentHazards.includes('friendly_fire') && !s.absentHazards.includes('enemy_aircraft')) break;
    }
    const s = buildWorldSetup(gameData, 'us_02', { sortie: directSortie('us_02', seed, 'none') });
    const rec = { ...getBriefingRecord(gameData, 'us_02'), hazardIds: s.hazardsTonight, absentHazardIds: s.absentHazards };
    expect(briefingRows(rec, briefingNumbers(s), () => '駆逐艦', labelOf)[4]).toEqual({ label: '危険', text: '敵艦艇の砲撃・衝突、敵航空機、座礁（今夜は 暴風・友軍誤射 なし）' });
  });
});
