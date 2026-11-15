// v0.8.0 S0（spec-v0800 §4.4・§4.5・§4.8）: 列の通過の data と起動時の検査（core/transit-data の形・config/transit-mission-data の V-T1〜V-T6）と今夜の揺らぎの当て方。
// 既定の data（us_04 の東京急行）が通り、壊した data は鍵を名指す日本語の文（V-Tn 付き）で止まる。列の無い任務は鍵ごと出ず、今夜の揺らぎの回数も同じ。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gameData, type GameData } from '../src/config/game-data';
import { getPrototypeMission } from '../src/config/mission-data';
import {
  TRANSIT_CHECK_DAWN_MARGIN_S,
  TRANSIT_CHECK_LANE_MARGIN_M,
  TRANSIT_CHECK_START_CLEAR_M,
  TRANSIT_CHECK_UNLOAD_MIN_S,
  TRANSIT_EXCLUSIVE_KEYS,
  getTransitParams,
  transitNightRolls,
  transitSetupPart,
  validateTransitMissions,
} from '../src/config/transit-mission-data';
import { TRANSIT_EDGE_HEADING, TRANSIT_MAX_SHIPS, readTransitBlock, transitAppearX, transitGoneX, transitLastGoneS } from '../src/core/transit-data';
import { directSortie } from '../src/core/sortie';
import { ktToMps } from '../src/core/units';
import { buildWorldSetup } from '../src/systems/world-setup';

type Rec = Record<string, unknown>;
const clone = (): GameData => JSON.parse(JSON.stringify(gameData)) as GameData;
const missionOf = (d: GameData, id: string): Rec => (d.missionsSeed.missions as unknown as Rec[]).find((m) => m['id'] === id)!;
const protoOf = (d: GameData, id: string): Rec => missionOf(d, id)['v0_1_prototype'] as Rec;
const transitOf = (d: GameData): Rec => protoOf(d, 'us_04')['transit'] as Rec;
/** data の写しを f で壊して組む（揺らぎなし） */
const build = (f: (d: GameData) => void, id = 'us_04', hard = false): (() => unknown) => {
  const d = clone();
  f(d);
  return () => getTransitParams(d, getPrototypeMission(d, id, hard), null, false);
};
const PROTO_IDS = (gameData.missionsSeed.missions as unknown as Rec[]).filter((m) => m['v0_1_prototype']).map((m) => m['id'] as string);
const SCREEN_MPS = ktToMps(30) * gameData.hitRateModel.world.time_scale; // 77.16 m/秒
const CROSS_S = 6000 / SCREEN_MPS; // 77.76 秒

describe('既定の data（us_04 の東京急行）', () => {
  it('ノーマル 3 隻・ハード 4 隻。30 kt（画面上 77.16 m/秒）で幅 6,000 m を 77.76 秒。往路は西の縁の内 150 m・y 1,500 から 090°、復路は東の縁の内 150 m・y 2,300 から 270°', () => {
    for (const hard of [false, true]) {
      const t = getTransitParams(gameData, getPrototypeMission(gameData, 'us_04', hard), null, false)!;
      expect([t.enemyId, t.ships, t.spacingS, t.speedKt, t.unloadS, t.coverLeavesWithOutbound, t.vilaLabelJa]).toEqual(['ijn_destroyer', hard ? 4 : 3, 8, 30, 40, true, 'ビラ']);
      expect(t.speedMps).toBeCloseTo(ktToMps(30), 12);
      expect(t.crossS).toBeCloseTo(CROSS_S, 9);
      expect(t.crossS).toBeCloseTo(77.76, 2);
      expect(t.enterS).toBe(18);
      expect(t.inbound).toEqual({ edge: 'west', laneY: 1500, headingDeg: 90, appearX: 150, goneX: 6150 });
      expect(t.outbound).toEqual({ edge: 'east', laneY: 2300, headingDeg: 270, appearX: 5850, goneX: -150 });
    }
    expect(validateTransitMissions(gameData)?.ships).toBe(3);
  });
  it('列の艦の AI は enemies.json の駆逐艦の値のまま、最大速力だけ 30 kt（史実モードの見張りの倍率は護衛と同じ）', () => {
    for (const historical of [false, true]) {
      const s = buildWorldSetup(gameData, 'us_04', { historical });
      const { maxSpeedMps, ...rest } = s.transit!.shipAi;
      const { maxSpeedMps: coverMax, ...coverRest } = s.destroyer!.shipAi;
      expect(rest).toEqual(coverRest);
      expect(maxSpeedMps).toBeCloseTo(ktToMps(30), 12);
      expect(coverMax).toBeCloseTo(ktToMps(35), 12);
    }
  });
  it('時刻（§4.5）: 先頭は 18 秒に現れ 95.8 秒にビラへ、3 隻目は 34 秒・111.8 秒。最後の艦が去るのはノーマル 229.5 秒・ハード 237.5 秒（夜明け 260 の 20 秒前まで＝V-T3）', () => {
    expect(18 + CROSS_S).toBeCloseTo(95.76, 2);
    expect(34 + CROSS_S).toBeCloseTo(111.76, 2);
    expect(transitLastGoneS(18, 3, 8, CROSS_S, 40)).toBeCloseTo(229.52, 2);
    expect(transitLastGoneS(18, 4, 8, CROSS_S, 40)).toBeCloseTo(237.52, 2);
    expect(transitLastGoneS(18, 4, 8, CROSS_S, 40)).toBeLessThanOrEqual(260 - TRANSIT_CHECK_DAWN_MARGIN_S);
    expect([transitAppearX('west', 6000, 150), transitGoneX('west', 6000, 150), transitAppearX('east', 6000, 150), transitGoneX('east', 6000, 150)]).toEqual([150, 6150, 5850, -150]);
    expect(TRANSIT_EDGE_HEADING).toEqual({ west: 90, east: 270 });
  });
  it('今夜の揺らぎ（列の 1 件）: x のずれ ÷ 画面上の速さ → 入りの秒（東へ進む列が東へずれれば早い）、y のずれ → 往路と復路の道、針路のずれは使わない', () => {
    const t = getTransitParams(gameData, getPrototypeMission(gameData, 'us_04'), { dx: 154.32, dy: -50, dh: 17 }, false)!;
    expect(t.enterS).toBeCloseTo(18 - 154.32 / SCREEN_MPS, 9);
    expect(t.enterS).toBeCloseTo(16, 9);
    expect([t.inbound.laneY, t.outbound.laneY, t.inbound.headingDeg, t.outbound.headingDeg]).toEqual([1450, 2250, 90, 270]);
    expect([t.inbound.appearX, t.outbound.appearX]).toEqual([150, 5850]);
    // 世界の組み立て: 列は駆逐艦（護衛）の後の 1 件（seed のある夜は護衛とは別のずれ）
    const s = buildWorldSetup(gameData, 'us_04', { sortie: directSortie('us_04', 7, 'none', false, false) });
    const o = s.night.enemyOffsets;
    expect(o.length).toBe(2);
    expect(s.transit!.enterS).toBeCloseTo(18 - o[1]!.dx / SCREEN_MPS, 9);
    expect(s.transit!.inbound.laneY).toBeCloseTo(1500 + o[1]!.dy, 9);
    expect(s.transit!.outbound.laneY).toBeCloseTo(2300 + o[1]!.dy, 9);
    expect(Math.abs(s.transit!.enterS - 18)).toBeLessThanOrEqual(400 / SCREEN_MPS);
  });
  it('列の無い任務: 今夜の揺らぎの回数に足さない（0）・transitSetupPart は {}（setup に transit の鍵が出ない）', () => {
    for (const id of PROTO_IDS) expect(transitNightRolls(gameData, getPrototypeMission(gameData, id)), id).toBe(id === 'us_04' ? 1 : 0);
    for (const id of PROTO_IDS.filter((x) => x !== 'us_04')) {
      for (const hard of [false, true]) {
        expect(getTransitParams(gameData, getPrototypeMission(gameData, id, hard), null, false), id).toBeNull();
        expect(transitSetupPart(gameData, getPrototypeMission(gameData, id, hard), null, false), id).toEqual({});
        const s = buildWorldSetup(gameData, id, { sortie: directSortie(id, 3, 'none', hard, false), hard });
        expect('transit' in s, id).toBe(false);
        expect(JSON.stringify(s).includes('"transit"'), id).toBe(false);
      }
    }
  });
  it('検査の定数と同居しない鍵（V-T6）', () => {
    expect([TRANSIT_MAX_SHIPS, TRANSIT_CHECK_LANE_MARGIN_M, TRANSIT_CHECK_DAWN_MARGIN_S, TRANSIT_CHECK_UNLOAD_MIN_S, TRANSIT_CHECK_START_CLEAR_M]).toEqual([6, 200, 20, 20, 1500]);
    expect(TRANSIT_EXCLUSIVE_KEYS).toEqual(['barges', 'pt_boats', 'convoy', 'transport', 'escort', 'patrol_air', 'evac', 'landing', 'ally_destroyer']);
    const src = readFileSync(join(__dirname, '..', 'src', 'scenes', 'boot-scene.ts'), 'utf8');
    expect(src.indexOf('validateTransitMissions(gameData);')).toBeGreaterThan(src.indexOf('validateEvacMissions(gameData);'));
  });
});

describe('形（core/transit-data）', () => {
  const base = (): Rec => JSON.parse(JSON.stringify(transitOf(gameData))) as Rec;
  it('鍵の閉じた集合・数・縁と針路・反対の縁・真偽・文字', () => {
    const cases: [(t: Rec) => void, RegExp][] = [
      [(t) => (t['speed_mps'] = 1), /鍵はちょうど .*知らない鍵 speed_mps/],
      [(t) => delete t['unload_s'], /欠け unload_s/],
      [(t) => (t['ships'] = 0), /ships は 1〜6 の整数（0。V-T1）/],
      [(t) => (t['ships'] = 7), /ships は 1〜6 の整数（7。V-T1）/],
      [(t) => (t['ships'] = 2.5), /ships は 1〜6 の整数/],
      [(t) => (t['spacing_s'] = 0), /spacing_s は正の数（0。V-T1）/],
      [(t) => (t['speed_kt'] = -30), /speed_kt は正の数/],
      [(t) => (t['edge_inset_m'] = 0), /edge_inset_m は正の数/],
      [(t) => (t['unload_s'] = -1), /unload_s は 0 以上の数（-1。V-T4）/],
      [(t) => ((t['inbound'] as Rec)['edge'] = 'north'), /inbound\.edge は west・east のどれか（north）/],
      [(t) => ((t['inbound'] as Rec)['heading_deg'] = 80), /inbound\.heading_deg は inbound\.edge（west）から海域の内へ向く 90（80。V-T2）/],
      [(t) => ((t['inbound'] as Rec)['enter_s'] = -2), /inbound\.enter_s は 0 以上/],
      [(t) => ((t['inbound'] as Rec)['lane_y_m'] = '1500'), /inbound\.lane_y_m は数/],
      [(t) => delete (t['outbound'] as Rec)['heading_deg'], /outbound の鍵はちょうど edge・lane_y_m・heading_deg/],
      [(t) => Object.assign(t['outbound'] as Rec, { edge: 'west', heading_deg: 90 }), /outbound\.edge は inbound\.edge（west）の反対（揚陸の地から来た海峡を戻る。V-T2）/],
      [(t) => (t['cover_leaves_with_outbound'] = 'yes'), /cover_leaves_with_outbound は true か false/],
      [(t) => (t['vila_label_ja'] = ''), /vila_label_ja は空でない文字列/],
    ];
    for (const [f, re] of cases) {
      const t = base();
      f(t);
      expect(() => readTransitBlock(t, 'us_04.v0_1_prototype.transit'), String(re)).toThrow(re);
    }
    expect(() => readTransitBlock([], 'x')).toThrow(/object でない/);
  });
});

describe('起動時の検査（config/transit-mission-data の V-T1〜V-T6）', () => {
  it('V-T1: ハードの足す艦・6 隻まで・enemies は護衛 1 ＋ 列の同じ id・速さは艦の最大以下・列の無い任務の hard に置けない', () => {
    const hardOf = (d: GameData): Rec => protoOf(d, 'us_04')['hard'] as Rec;
    expect(build((d) => (hardOf(d)['extra_transit_ships'] = 0))).toThrow(/us_04\.v0_1_prototype\.hard\.extra_transit_ships は 1 以上の整数（0）（V-T1/);
    expect(build((d) => (hardOf(d)['extra_transit_ships'] = 4))).toThrow(/transit\.ships ＋ hard\.extra_transit_ships（7）は 6 隻まで（V-T1/);
    expect(build((d) => (protoOf(d, 'us_04')['enemies'] as string[]).pop())).toThrow(/us_04\.v0_1_prototype\.enemies（ijn_destroyer・ijn_destroyer・ijn_destroyer）は護衛 1 ＋ 列 3 の同じ id（ijn_destroyer）（V-T1/);
    expect(build((d) => (transitOf(d)['speed_kt'] = 36))).toThrow(/transit\.speed_kt（36）は ijn_destroyer の speed_max_kt（35）以下（V-T1/);
    expect(build((d) => ((protoOf(d, 'us_02')['hard'] as Rec)['extra_transit_ships'] = 1), 'us_02', true)).toThrow(/us_02\.v0_1_prototype\.hard\.extra_transit_ships は列の通過（transit）の任務だけ（V-T1/);
  });
  it('V-T2: 道の y は縁から艦の余白 118 ＋ 200 m 以上内（今夜の ±150 m 込み）・夜明けに退く縁は列の来た縁', () => {
    expect(build((d) => (((transitOf(d)['inbound'] as Rec)['lane_y_m'] = 450)))).toThrow(/transit\.inbound\.lane_y_m（450 ± 今夜の 150）は北と南の縁から 318\.0 m（艦の余白 ＋ 200）以上内（V-T2/);
    expect(build((d) => (((transitOf(d)['outbound'] as Rec)['lane_y_m'] = 3600)))).toThrow(/transit\.outbound\.lane_y_m（3600 ± 今夜の 150）/);
    expect(build((d) => (((transitOf(d)['inbound'] as Rec)['lane_y_m'] = 468)))).not.toThrow(); // 468 − 150 = 318 ≥ 318
    expect(build((d) => ((protoOf(d, 'us_04')['dawn_withdraw'] as Rec)['retire_edge'] = 'north'))).toThrow(/dawn_withdraw\.retire_edge（north）は列の来た縁 transit\.inbound\.edge（west。夜明けに来た道を退く）（V-T2/);
  });
  it('V-T3: 揺らぎのない夜のハード込みの最後の艦は夜明けの 20 秒前まで・どの夜でも夜明けの前・入りは 0 秒以上', () => {
    expect(build((d) => (transitOf(d)['unload_s'] = 60))).toThrow(/transit: 最後の艦（4 隻目）が復路で去る 257\.52 秒は duration_s（260）の 20 秒前まで（入り ＋ 間隔 ＋ 渡り 77\.76 ＋ 揚陸 ＋ 渡り）（V-T3/);
    expect(build((d) => (transitOf(d)['unload_s'] = 42))).not.toThrow(); // 239.52 ≤ 240
    expect(build((d) => (transitOf(d)['unload_s'] = 43))).toThrow(/V-T3/);
    const jitter = (x: number) => (d: GameData): void => {
      ((protoOf(d, 'us_04')['night'] as Rec)['enemy_jitter'] as Rec)['x_m'] = x;
    };
    expect(build(jitter(1800))).toThrow(/transit: 今夜の揺らぎ（入り ＋23\.33 秒）でも最後の艦は duration_s（260）の前に去る（260\.85 秒）（V-T3/);
    expect(build(jitter(1400))).toThrow(/transit\.inbound\.enter_s（18）は今夜の揺らぎ（−18\.14 秒）でも 0 秒以上（V-T3/);
    expect(build(jitter(1388))).not.toThrow(); // 1388 / 77.16 = 17.99 秒
  });
  it('V-T4: 揚陸は 20 秒以上', () => {
    expect(build((d) => (transitOf(d)['unload_s'] = 19))).toThrow(/transit\.unload_s（19）は 20 秒以上（V-T4/);
    expect(build((d) => (transitOf(d)['unload_s'] = 20))).not.toThrow();
  });
  it('V-T5: 出発点は往路の入りの点から 1,500 m 以上（今夜の y のずれのうち一番近い道で）', () => {
    expect(build((d) => Object.assign(protoOf(d, 'us_04')['player_start'] as Rec, { x_m: 900, y_m: 1500 }))).toThrow(/player_start は往路の入りの点（150, 1500 ± 150）から 1500 m 以上（750\.0 m）（V-T5/);
    expect(build((d) => Object.assign(protoOf(d, 'us_04')['player_start'] as Rec, { x_m: 1650, y_m: 1500 }))).not.toThrow(); // 1,500 m ちょうど
  });
  it('V-T6: 護衛の駆逐艦（enemy_start）の任務だけ・同居しない鍵・左右反転なし', () => {
    const block = (d: GameData): Rec => JSON.parse(JSON.stringify(transitOf(d))) as Rec;
    expect(build((d) => (protoOf(d, 'us_03')['transit'] = block(d)), 'us_03')).toThrow(/us_03\.v0_1_prototype\.transit は駆逐艦の任務（enemy_start＝護衛がある）だけ（V-T6/);
    expect(build((d) => (protoOf(d, 'us_02')['transit'] = block(d)), 'us_02')).toThrow(/us_02\.v0_1_prototype\.transport と transit は同居しない（V-T6/);
    expect(build((d) => ((protoOf(d, 'us_04')['night'] as Rec)['mirror_chance'] = 0.5))).toThrow(/us_04\.v0_1_prototype\.night\.mirror_chance は 0（列は東西に反転しない。0\.5）（V-T6/);
  });
});
