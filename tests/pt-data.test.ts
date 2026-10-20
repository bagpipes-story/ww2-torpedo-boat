// 敵の米PT の data（v0.6.3。core/pt-data・config/pt-mission-data）: jp_05 の値、検査（spec §C.3 の 1〜10）、今夜の揺らぎ（applyPtNight）、任務の検査（mission-data）。
import { describe, expect, it } from 'vitest';
import { gameData, getPrototypeMission } from '../src/config/game-data';
import { getPtParams } from '../src/config/pt-mission-data';
import type { NightRoll } from '../src/core/night';
import { PT_ATTACK_KEYS, isPtDataRecord, isPtMissionBlock, type PtParams } from '../src/core/pt-data';
import { degToRad, ktToMps } from '../src/core/units';
import { applyPtNight } from '../src/systems/world-night';

type Rec = Record<string, unknown>;
const clone = (): typeof gameData => JSON.parse(JSON.stringify(gameData)) as typeof gameData;
const byId = (d: typeof gameData, id: string): Rec => (d.missionsSeed.missions as unknown as Rec[]).find((m) => m['id'] === id)!;
const protoOf = (d: typeof gameData, id: string): Rec => byId(d, id)['v0_1_prototype'] as Rec;
const ptRec = (d: typeof gameData): Rec => (d.enemies.enemies as unknown as Rec[]).find((e) => e['id'] === 'us_pt_enemy')!;
const attackOf = (d: typeof gameData): Rec => ptRec(d)['attack'] as Rec;
const gunOf = (d: typeof gameData): Rec => (ptRec(d)['guns'] as Rec[])[0]!;
const blockOf = (d: typeof gameData): Rec => protoOf(d, 'jp_05')['pt_boats'] as Rec;
const TS = gameData.hitRateModel.world.time_scale;
const params = (d: typeof gameData = gameData): PtParams | null => getPtParams(d, getPrototypeMission(d, 'jp_05'), TS);
const night = (dx: number, dy: number, mirrored: boolean): NightRoll => ({ absentHazards: [], enemyOffsets: [{ dx, dy, dh: 0 }], bargeLeadDx: 0, batteryDx: [], mirrored });

describe('米PT の値（jp_05。enemies.json の us_pt_enemy・boat_ref us_elco80）', () => {
  it('速さは ktToMps（game m/s）、最大は Elco の 39 kt、発見 2,000 m・見失い 8 秒、距離は二乗、揺らぎなしの出発点は線の始点から 800 m で東へ', () => {
    const p = params()!;
    expect(p.count).toBe(2);
    expect([p.runInMps, p.passMinMps, p.patrolMps, p.leaveMps, p.overtakeMps, p.dashMps]).toEqual([ktToMps(35), ktToMps(25), ktToMps(8), ktToMps(30), ktToMps(6), ktToMps(39)]);
    expect([p.baseDetectM, p.reactionDelayS, p.detectFromS, p.detectHoldS]).toEqual([2000, 1.5, 5, 8]);
    expect(p.cosDead2).toBeCloseTo(Math.cos(degToRad(30)) ** 2, 12);
    expect([p.commitMax2, p.minRange2, p.breakOff2, p.arrive2]).toEqual([900 ** 2, 60 ** 2, 800 ** 2, 100 ** 2]);
    expect([p.commitTcpaS, p.offsetM, p.openFireS, p.passMaxS, p.roundsPerPass, p.maxPasses, p.passGapS, p.wingmanDelayS]).toEqual([5, 120, 2.5, 8, 12, 2, 2.5, 3]);
    expect([p.turnRateDegS, p.accelMps2, p.spriteLengthUnits, p.spriteBeamUnits, p.boundsMarginM]).toEqual([24, 1.2, 48.8, 12.6, 24.4]);
    expect([p.gun.effectiveM, p.gun.damage, p.gun.roundsPerMinPerGun, p.hit.damage, p.hit.fireChance, p.hit.engineDamageChance]).toEqual([400, 4, 240, 4, 0.03, 0.02]);
    expect([...p.legs]).toEqual([1200, 2000, 4800, 2000, 1200, 2200, 4800, 2200]);
    expect([...p.startX, ...p.startY, ...p.startHeadingDeg]).toEqual([2000, 2000, 2000, 2200, 90, 90]);
    expect([p.leaveHeadingDeg, p.edgeMarginM, p.timeScale]).toEqual([90, 200, TS]);
    // 公平さの不変条件（spec §C.8）: 1 回の航過では砲だけで沈まない・予告から 2 秒以上撃たない
    expect(p.roundsPerPass * p.hit.damage).toBe(48);
    expect(p.openFireS).toBeGreaterThanOrEqual(2);
  });
  it('米PT の無い任務は null', () => {
    for (const id of ['us_01', 'us_02', 'us_03', 'jp_06']) expect(getPrototypeMission(gameData, id).ptBoats, id).toBeNull();
    for (const id of ['us_01', 'us_02', 'us_03', 'jp_06']) expect(getPtParams(gameData, getPrototypeMission(gameData, id), TS), id).toBeNull();
  });
  it('記録の形: attack はちょうど 20 個（知らないキー・欠けは false）、guns は 1 種、torpedo_immune と guns がある。source はすべて historical か design', () => {
    expect(PT_ATTACK_KEYS.length).toBe(20);
    const r = ptRec(gameData);
    expect(isPtDataRecord(r)).toBe(true);
    expect(r['torpedo_immune']).toBe(true);
    expect((r['guns'] as unknown[]).length).toBe(1);
    expect(Object.keys(r['attack'] as Rec).sort()).toEqual([...PT_ATTACK_KEYS].sort());
    expect(isPtDataRecord({ ...r, attack: { ...(r['attack'] as Rec), pass_speed: 25 } })).toBe(false);
    const missing = { ...(r['attack'] as Rec) };
    delete missing['max_passes'];
    expect(isPtDataRecord({ ...r, attack: missing })).toBe(false);
    expect(isPtDataRecord({ ...r, guns: [...(r['guns'] as unknown[]), ...(r['guns'] as unknown[])] })).toBe(false);
    for (const [k, v] of Object.entries(r['source'] as Rec)) expect(/historical|design/.test(String(v)), k).toBe(true);
    // 史料は検索の抜粋だけ（本文未読）
    expect(String((r['source'] as Rec)['torpedo_immune'])).toContain('抜粋のみ・本文未読');
    const b = blockOf(gameData);
    expect(isPtMissionBlock(b)).toBe(true);
    expect(isPtMissionBlock({ ...b, legs_m: [[1200, 2000, 4800]] })).toBe(false);
    expect(isPtMissionBlock({ ...b, source: undefined })).toBe(false);
  });
});

describe('検査（spec §C.3 の 1〜10）: 崩れたら jp_05 を付けて例外', () => {
  const cases: [string, (d: typeof gameData) => void][] = [
    ['1 哨戒 ≥ 航過', (d) => (ptRec(d)['patrol'] as Rec)['speed_kt'] = 25],
    ['1 突撃 > boat_ref の最大', (d) => (attackOf(d)['run_in_speed_kt'] = 40)],
    ['1 去る速さ 0', (d) => (attackOf(d)['leave_speed_kt'] = 0)],
    ['2 min_range ≥ offset', (d) => (attackOf(d)['min_range_m'] = 130)],
    ['2 effective ≥ break_off', (d) => (gunOf(d)['effective_night_m'] = 850)],
    ['3 予告から 2 秒未満', (d) => (attackOf(d)['open_fire_s'] = 1.5)],
    ['3 open_fire ≥ commit_tcpa', (d) => (attackOf(d)['commit_tcpa_s'] = 2.5)],
    ['4 dead_cone 90', (d) => (attackOf(d)['dead_cone_deg'] = 90)],
    ['4 rounds 小数', (d) => (attackOf(d)['rounds_per_pass'] = 2.5)],
    ['4 max_passes 0', (d) => (attackOf(d)['max_passes'] = 0)],
    ['4 break_max 0', (d) => (attackOf(d)['break_max_s'] = 0)],
    ['4 pass_gap 負', (d) => (attackOf(d)['pass_gap_s'] = -1)],
    ['4 spread_min 0', (d) => (attackOf(d)['spread_min_m'] = 0)],
    ['5 線が 1 本（PT 2 隻）', (d) => (blockOf(d)['legs_m'] = [[1200, 2000, 4800, 2000]])],
    ['5 線が縁の余白の外', (d) => (blockOf(d)['legs_m'] = [[100, 2000, 4800, 2000], [1200, 2200, 4800, 2200]])],
    ['5 線が短い', (d) => (blockOf(d)['legs_m'] = [[1200, 2000, 1350, 2000], [1200, 2200, 4800, 2200]])],
    ['5 出発位置が線の外', (d) => (blockOf(d)['start_along_m'] = 4000)],
    ['5 去る方位 360', (d) => (blockOf(d)['leave_heading_deg'] = 360)],
    ['形 attack に知らないキー', (d) => (attackOf(d)['passes_max'] = 2)],
    ['6 振り切れる（突撃 30 kt < T-14 31 kt）', (d) => (attackOf(d)['run_in_speed_kt'] = 30)],
    ['7 1 回の航過で沈む（12 × 5 ≥ 50）', (d) => (gunOf(d)['damage'] = 5)],
    [
      '8 見えない PT から撃てる（950 m > 視程 900 m）',
      (d) => {
        gunOf(d)['effective_night_m'] = 950;
        attackOf(d)['break_off_m'] = 1000;
        attackOf(d)['commit_max_m'] = 1000;
      },
    ],
    ['9 出発で見つかる（自艇が線の 350 m 北）', (d) => ((protoOf(d, 'jp_05')['player_start'] as Rec)['y_m'] = 1500)],
    ['9 揺らぎの南北で近づく', (d) => (((protoOf(d, 'jp_05')['night'] as Rec)['enemy_jitter'] as Rec)['y_m'] = 1000)],
    ['10 夜明けに去らない（stay）', (d) => ((byId(d, 'jp_05')['dawn_air'] as Rec)['enemy_ships_at_dawn'] = 'stay')],
  ];
  it.each(cases)('%s', (_name, breakIt) => {
    const d = clone();
    breakIt(d);
    expect(() => params(d)).toThrow(/jp_05/);
  });
  it('9 の境目: 一番近い出発点は (4300, 1850) の 1,250 m（巡航で見つかる 1,200 m より遠い）。自艇を 51 m 南へ寄せると例外', () => {
    const d = clone();
    (protoOf(d, 'jp_05')['player_start'] as Rec)['y_m'] = 649;
    expect(() => params(d)).not.toThrow();
    (protoOf(d, 'jp_05')['player_start'] as Rec)['y_m'] = 651;
    expect(() => params(d)).toThrow(/jp_05.*1199 m/);
  });
});

describe('任務の検査（mission-data。v0.6.3）', () => {
  it('main_weapon torpedo の米PT は torpedo_immune で例外、none でない米PT・米PT の無い none も例外。pt_boats は enemy_start・barges と置けない', () => {
    const a = clone();
    protoOf(a, 'jp_05')['main_weapon'] = 'torpedo';
    expect(() => getPrototypeMission(a, 'jp_05')).toThrow(/torpedo_immune/);
    const b = clone();
    protoOf(b, 'jp_05')['main_weapon'] = 'guns';
    expect(() => getPrototypeMission(b, 'jp_05')).toThrow(/jp_05.*none/);
    const c = clone();
    protoOf(c, 'us_02')['main_weapon'] = 'none';
    expect(() => getPrototypeMission(c, 'us_02')).toThrow(/us_02.*none/);
    const e = clone();
    protoOf(e, 'jp_05')['enemy_start'] = { x_m: 100, y_m: 100, heading_deg: 0 };
    expect(() => getPrototypeMission(e, 'jp_05')).toThrow(/pt_boats.*enemy_start/);
    const f = clone();
    protoOf(f, 'jp_05')['enemies'] = ['us_pt_enemy', 'us_destroyer'];
    expect(() => getPrototypeMission(f, 'jp_05')).toThrow(/同じ id/);
    const g = clone();
    delete blockOf(g)['start_along_m'];
    expect(() => getPrototypeMission(g, 'jp_05')).toThrow(/pt_boats/);
    const h = clone();
    protoOf(h, 'jp_05')['main_weapon'] = 'rockets';
    expect(() => getPrototypeMission(h, 'jp_05')).toThrow(/torpedo・guns・none/);
  });
});

describe('今夜の揺らぎ（systems/world-night の applyPtNight）', () => {
  const p = params()!;
  it('線に沿って ±x、線ごと南北 ±y、反転は東西を入れ替えて西へ。元の値は変えない（複製）', () => {
    const q = applyPtNight(night(800, 150, true), p);
    expect([...q.startX]).toEqual([3200, 3200]);
    expect([...q.startY]).toEqual([2150, 2350]);
    expect([...q.startHeadingDeg]).toEqual([270, 270]);
    expect([...q.legs]).toEqual([4800, 2150, 1200, 2150, 4800, 2350, 1200, 2350]);
    expect([...p.startX, ...p.startY]).toEqual([2000, 2000, 2000, 2200]);
    const r = applyPtNight(night(-800, -150, false), p);
    expect([...r.startX, ...r.startY, ...r.startHeadingDeg]).toEqual([1200, 1200, 1850, 2050, 90, 90]);
  });
  it('出発位置は線の中に収める（端を越えるずれは端で止まる）', () => {
    expect([...applyPtNight(night(5000, 0, false), p).startX]).toEqual([4800, 4800]);
    expect([...applyPtNight(night(-5000, 0, false), p).startX]).toEqual([1200, 1200]);
    expect([...applyPtNight(night(-5000, 0, true), p).startX]).toEqual([4800, 4800]);
  });
  it('南北のずれで縁の余白（200 m）を越える線は、線ごと余白の中へ戻す（片端だけを動かさない）', () => {
    const d = clone();
    blockOf(d)['legs_m'] = [[1200, 300, 4800, 400], [1200, 3700, 4800, 3800]];
    (protoOf(d, 'jp_05')['player_start'] as Rec)['y_m'] = 2000; // 出発で見つからない位置へ
    const base = params(d)!;
    const up = applyPtNight(night(0, -150, false), base);
    expect([up.legs[1], up.legs[3]]).toEqual([200, 300]);
    const down = applyPtNight(night(0, 150, false), base);
    expect([down.legs[5], down.legs[7]]).toEqual([3700, 3800]);
  });
});
