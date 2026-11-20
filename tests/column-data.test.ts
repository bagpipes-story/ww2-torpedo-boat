// v0.8.2 S0（spec-v0820 §4.2 D-C1〜D-C5・§5.3）: 片道の列の艦ごとの記録（config/column-mission-data の V-C1〜V-C6・kits・入りの秒と道のずれの表）と、
// 片道の列の形（core/transit-data）・置き場と夜明けに退く縁（config/transit-mission-data の V-T6・V-T2）。既定の data（us_05 の第三部隊）が通り、壊した data は鍵を名指す日本語の文で止まる。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gameData, type GameData } from '../src/config/game-data';
import { getPrototypeMission } from '../src/config/mission-data';
import {
  COLUMN_CHECK_DAWN_MARGIN_S,
  COLUMN_CHECK_LANE_MARGIN_M,
  COLUMN_CHECK_START_CLEAR_M,
  COLUMN_CHECK_START_WINDOW_S,
  COLUMN_GAP_MIN_S,
  COLUMN_KIT_KEYS,
  COLUMN_REJOIN_RANGE_S,
  SHIP_CLASSES,
  getColumnPlan,
  shipClassOf,
  validateColumnMissions,
} from '../src/config/column-mission-data';
import { getTransitParams } from '../src/config/transit-mission-data';
import { TRANSIT_MAX_SHIPS, readTransitBlock } from '../src/core/transit-data';
import { shipAiParamsFromData } from '../src/core/ship-ai';
import { ktToMps } from '../src/core/units';
import { destroyerSetup } from '../src/systems/destroyer-setup';
import { getEnemyRecord } from '../src/config/game-data';

type Rec = Record<string, unknown>;
const clone = (): GameData => JSON.parse(JSON.stringify(gameData)) as GameData;
const protoOf = (d: GameData, id: string): Rec => (d.missionsSeed.missions as unknown as Rec[]).find((m) => m['id'] === id)!['v0_1_prototype'] as Rec;
const transitOf = (d: GameData): Rec => protoOf(d, 'us_05')['transit'] as Rec;
const colOf = (d: GameData): Rec[] => transitOf(d)['column'] as Rec[];
const hardOf = (d: GameData): Rec => protoOf(d, 'us_05')['hard'] as Rec;
/** data の写しを f で壊して組む（揺らぎなし・ノーマル） */
const build = (f: (d: GameData) => void, hard = false): (() => unknown) => {
  const d = clone();
  f(d);
  return () => getColumnPlan(d, getPrototypeMission(d, 'us_05', hard), null, false);
};
const SCREEN_MPS = ktToMps(18) * gameData.hitRateModel.world.time_scale; // 46.3 m/秒
const NAMES = ['満潮', '朝雲', '山雲', '最上', '時雨', '山城', '扶桑'];

describe('既定の data（us_05 の第三部隊。spec §4.1 D-M2・D-M3・§4.2）', () => {
  it('ノーマル 7 隻（前衛 4・本隊 3）・ハード 8 隻（本隊の最後に見張りの駆逐艦）。時刻表は満潮 5・朝雲 20・山雲 35・最上 50・時雨 80・山城 85・扶桑 101 秒（ハードの 8 隻目は 109 秒）', () => {
    for (const hard of [false, true]) {
      const p = getColumnPlan(gameData, getPrototypeMission(gameData, 'us_05', hard), null, false)!;
      expect(p.kits.map((k) => k.nameJa)).toEqual(hard ? [...NAMES, '見張りの駆逐艦'] : NAMES);
      expect(p.enterAtS).toEqual(hard ? [5, 20, 35, 50, 80, 85, 101, 109] : [5, 20, 35, 50, 80, 85, 101]);
      expect(p.laneDyM).toEqual(hard ? [400, 400, 400, 400, -540, 0, 0, -575] : [400, 400, 400, 400, -540, 0, 0]); // v0.8.2 S3 の探りの帯（N1・H1）で時雨 −600 → −560・ハードの 8 隻目 −600 → −575、IP1（実機 1 回目のユーザー「時雨の進行位置を若干戦艦寄りに」）で時雨 −560 → −540
      expect(p.kits.map((k) => k.group).join('')).toBe(hard ? 'vanvanvanvanmainmainmainmain' : 'vanvanvanvanmainmainmain');
      expect(p.kits.map((k) => k.role)).toEqual(hard ? ['line', 'line', 'line', 'line', 'screen', 'line', 'line', 'screen'] : ['line', 'line', 'line', 'line', 'screen', 'line', 'line']);
      expect(p.rejoinS).toBe(40);
    }
    expect(validateColumnMissions(gameData)?.kits.length).toBe(7);
  });
  it('艦ごとの値（kits）: 寸法・沈む本数・AI・砲・当たりは記録の destroyerSetup のまま、列の AI は最大速力だけ 18 kt、見張りは記録の AI そのもの・艦種と KPI の旗・弾薬庫は戦艦だけ', () => {
    for (const historical of [false, true]) {
      const p = getColumnPlan(gameData, getPrototypeMission(gameData, 'us_05', true), null, historical)!;
      for (const k of p.kits) {
        const ds = destroyerSetup(gameData, [], k.enemyId, null, gameData.hitRateModel.world.ship_hit_scale, historical);
        expect([k.spec, k.gunnery, k.passRadius2]).toEqual([ds.spec, ds.gunnery, ds.passRadius2]);
        expect(k.lineAi).toEqual({ ...ds.shipAi, maxSpeedMps: ktToMps(18) });
        expect(k.screenAi).toEqual(k.role === 'screen' ? ds.shipAi : null);
        expect(k.kpi).toBe(k.shipClass === 'destroyer');
      }
      expect(p.kits.map((k) => [k.shipClass, k.spec.hitsToSink, k.magazine])).toEqual([
        ...[0, 1, 2].map(() => ['destroyer', 2, null]), ['heavy_cruiser', 3, null], ['destroyer', 2, null],
        ['battleship', 6, { onHits: [3, 4], chance: [0.035, 0.07] }], ['battleship', 6, { onHits: [3, 4], chance: [0.035, 0.07] }], ['destroyer', 2, null],
      ]);
    }
    // 絵の鍵（v0.8.2 S2b で直した: S0〜S2 は既定の駆逐艦の絵＝戦艦・重巡は S2b の D-A1・D-A2 で ship-art-config の表に足した＝記録の id から）・弾薬庫の上書き（?debug&boom）は確率だけ 1・
    // 当たりの倍率の上書き（?debug&shiphit）は寸法の当たりだけ
    const boom = getColumnPlan(gameData, getPrototypeMission(gameData, 'us_05'), null, false, { magazineBoom: true, shipHitScale: 1 })!;
    expect(boom.kits.map((k) => k.artKey)).toEqual(['tex-destroyer', 'tex-destroyer', 'tex-destroyer', 'tex-cruiser-mogami', 'tex-destroyer', 'tex-battleship-fuso', 'tex-battleship-fuso']);
    expect(boom.kits[6]!.magazine).toEqual({ onHits: [3, 4], chance: [1, 1] });
    expect(boom.kits[6]!.spec.hitScale).toBe(1);
    expect(boom.kits[4]!.screenAi).toEqual(shipAiParamsFromData(getEnemyRecord(gameData, 'ijn_destroyer'))); // 時雨の見張りの AI＝記録の値そのまま（史実モードなし）
  });
  it('今夜の揺らぎ（列の 1 件）: x のずれ ÷ 画面上の速さ 46.3 m/秒 → 全部の艦の入りの秒（東へずれれば早い）、道のずれは艦ごとのまま（y のずれは transit の道へ）', () => {
    const p = getColumnPlan(gameData, getPrototypeMission(gameData, 'us_05'), { dx: 92.6, dy: -80, dh: 0 }, false)!;
    expect(p.enterAtS.map((t) => Math.round(t * 1e9) / 1e9)).toEqual([5, 20, 35, 50, 80, 85, 101].map((t) => Math.round((t - 92.6 / SCREEN_MPS) * 1e9) / 1e9));
    expect(p.laneDyM).toEqual([400, 400, 400, 400, -540, 0, 0]);
    const t = getTransitParams(gameData, getPrototypeMission(gameData, 'us_05'), { dx: 92.6, dy: -80, dh: 0 }, false)!;
    expect([t.inbound.laneY, t.enterS, t.enterAtS![0]]).toEqual([2320, p.enterAtS[0], p.enterAtS[0]]);
  });
  it('艦種（ship_class）: 新しい 2 記録だけが持ち、ほかは destroyer（今の記録に足さない）', () => {
    const withClass = (gameData.enemies.enemies as unknown as Rec[]).filter((e) => e['ship_class'] !== undefined).map((e) => [e['id'], e['ship_class']]);
    expect(withClass).toEqual([['ijn_battleship_fuso', 'battleship'], ['ijn_cruiser_mogami', 'heavy_cruiser']]);
    expect([shipClassOf(gameData, 'ijn_destroyer'), shipClassOf(gameData, 'ijn_transport'), shipClassOf(gameData, 'ijn_battleship_fuso')]).toEqual(['destroyer', 'destroyer', 'battleship']);
    expect(SHIP_CLASSES).toEqual(['destroyer', 'heavy_cruiser', 'battleship']);
    const d = clone();
    ((d.enemies.enemies as unknown as Rec[]).find((e) => e['id'] === 'ijn_subchaser')!)['ship_class'] = 'carrier';
    expect(() => validateColumnMissions(d)).toThrow(/enemies\.json の ijn_subchaser\.ship_class は destroyer・heavy_cruiser・battleship のどれか（carrier。V-C2/);
  });
  it('検査の定数と Boot の順（海峡の両岸・止まった艦・水上機の検査の後に 1 回）', () => {
    expect([TRANSIT_MAX_SHIPS, COLUMN_GAP_MIN_S, COLUMN_CHECK_LANE_MARGIN_M, COLUMN_CHECK_DAWN_MARGIN_S, COLUMN_CHECK_START_CLEAR_M, COLUMN_CHECK_START_WINDOW_S, ...COLUMN_REJOIN_RANGE_S]).toEqual([8, 5, 200, 20, 1500, 10, 10, 120]);
    expect(COLUMN_KIT_KEYS).toEqual(['enemy_id', 'name_ja', 'group', 'gap_s', 'lane_dy_m', 'role']);
    const src = readFileSync(join(__dirname, '..', 'src', 'scenes', 'boot-scene.ts'), 'utf8');
    const at = ['validateSeaplaneMissions(gameData);', 'validateColumnMissions(gameData);', 'validateReconMissions(gameData);', 'validateMagazineRecords(gameData);', 'createSfx(this.game);'].map((c) => src.indexOf(c));
    expect(at.every((x, i) => x > 0 && (i === 0 || x > at[i - 1]!))).toBe(true);
  });
});

describe('片道の列の形（core/transit-data）と置き場（config/transit-mission-data）', () => {
  const base = (): Rec => JSON.parse(JSON.stringify(transitOf(gameData))) as Rec;
  it('片道の列は往復の 4 つの鍵を置かない（V-C4）・rejoin_s だけ任意・column は配列', () => {
    for (const k of ['spacing_s', 'unload_s', 'outbound', 'cover_leaves_with_outbound']) {
      const t = base();
      t[k] = k === 'outbound' ? { edge: 'east', lane_y_m: 2400, heading_deg: 270 } : k === 'cover_leaves_with_outbound' ? false : 8;
      expect(() => readTransitBlock(t, 'us_05.v0_1_prototype.transit'), k).toThrow(new RegExp(`片道の列（column）には spacing_s・unload_s・outbound・cover_leaves_with_outbound を置かない（${k}。.*V-C4`));
    }
    const t = base();
    delete t['rejoin_s'];
    expect(() => readTransitBlock(t, 'x')).not.toThrow();
    const u = base();
    u['speed_mps'] = 1;
    expect(() => readTransitBlock(u, 'x')).toThrow(/片道の列の鍵はちょうど ships・speed_kt・edge_inset_m・inbound・column・vila_label_ja・source（知らない鍵 speed_mps/);
    expect(() => readTransitBlock({ ...base(), column: {} }, 'x')).toThrow(/column は配列/);
    expect(() => readTransitBlock({ ...base(), ships: 9 }, 'x')).toThrow(/ships は 1〜8 の整数（9。V-T1）/);
  });
  it('V-T6: 列だけの隊（enemy_start なし）は片道の列だけ・同居しない鍵は今のまま。V-T2: 夜明けに退く縁は列の向かう縁', () => {
    const tb = (d: GameData, f: (d: GameData) => void, id = 'us_05'): (() => unknown) => {
      f(d);
      return () => getTransitParams(d, getPrototypeMission(d, id), null, false);
    };
    expect(tb(clone(), (d) => ((protoOf(d, 'us_05')['dawn_withdraw'] as Rec)['retire_edge'] = 'west'))).toThrow(/us_05\.v0_1_prototype\.dawn_withdraw\.retire_edge（west）は片道の列の向かう縁（east。夜明けに先へ退く）（V-T2/);
    expect(tb(clone(), (d) => (protoOf(d, 'us_05')['barges'] = {}))).toThrow(); // 大発の隊とは置けない（mission-data か V-T6 で止まる）
    const d = clone();
    protoOf(d, 'us_03')['transit'] = JSON.parse(JSON.stringify(transitOf(gameData)));
    expect(() => getTransitParams(d, getPrototypeMission(d, 'us_03'), null, false)).toThrow(/us_03\.v0_1_prototype\.barges と transit は同居しない（V-T6/);
  });
});

describe('起動時の検査（config/column-mission-data の V-C1〜V-C6）', () => {
  it('V-C1: 1 隻の鍵・数・入りの間隔・役と組・ハードの鍵', () => {
    expect(build((d) => (colOf(d)[2]!['speed'] = 1))).toThrow(/us_05\.v0_1_prototype\.transit\.column\[2\] の鍵はちょうど enemy_id・name_ja・group・gap_s・lane_dy_m・role（V-C1/);
    expect(build((d) => colOf(d).pop())).toThrow(/transit\.column の数（6）は transit\.ships（7）と同じ（V-C1/);
    expect(build((d) => (colOf(d)[1]!['gap_s'] = 4.9))).toThrow(/transit\.column\[1\]\.gap_s（4\.9）は 5 秒以上/);
    expect(build((d) => (colOf(d)[1]!['gap_s'] = 5))).not.toThrow();
    expect(build((d) => (colOf(d)[0]!['gap_s'] = -1))).toThrow(/transit\.column\[0\]\.gap_s（-1）は 0 秒以上/);
    expect(build((d) => (colOf(d)[4]!['role'] = 'chase'))).toThrow(/transit\.column\[4\]\.role は line・screen のどれか（chase）（V-C1/);
    expect(build((d) => (colOf(d)[4]!['group'] = 'rear'))).toThrow(/transit\.column\[4\]\.group は van・main のどれか（rear）/);
    expect(build((d) => (colOf(d)[4]!['name_ja'] = ' '))).toThrow(/enemy_id・name_ja は空でない文字列/);
    expect(build((d) => (hardOf(d)['extra_column'] = []))).toThrow(/hard\.extra_column は空でない配列（V-C1/);
    expect(build((d) => (hardOf(d)['extra_transit_ships'] = 1))).toThrow(/hard\.extra_transit_ships は往復の列の鍵（片道の列のハードは hard\.extra_column）（V-C1/);
    expect(build((d) => (hardOf(d)['extra_column'] as Rec[]).push({ ...(hardOf(d)['extra_column'] as Rec[])[0]! }))).toThrow(/transit\.column ＋ hard\.extra_column（9）は 8 隻まで（V-C1/);
    expect(build((d) => (hardOf(d)['extra_column'] as Rec[])[0]!['gap_s'] = 4)).toThrow(/hard\.extra_column\[0\]\.gap_s（4）は 5 秒以上/);
    const d = clone();
    (protoOf(d, 'us_02')['hard'] as Rec)['extra_column'] = [];
    expect(() => getColumnPlan(d, getPrototypeMission(d, 'us_02'), null, false)).toThrow(/us_02\.v0_1_prototype\.hard\.extra_column は片道の列（transit\.column）の任務だけ（V-C1/);
    expect(() => getTransitParams(d, getPrototypeMission(d, 'us_02'), null, false)).toThrow(/us_02\.v0_1_prototype\.hard\.extra_column は列の通過（transit）の任務だけ（V-T1/);
  });
  it('V-C2: AI と砲の記録・列の速さは最大以下・enemies は列の顔ぶれで先頭は駆逐艦・沈む本数は記録の値', () => {
    expect(build((d) => (colOf(d)[3]!['enemy_id'] = 'ijn_seaplane_jake'))).toThrow(/transit\.column\[3\]\.enemy_id（ijn_seaplane_jake）は AI と砲を持つ記録: .*（V-C2/);
    expect(build((d) => (transitOf(d)['speed_kt'] = 25))).toThrow(/transit\.speed_kt（25）は transit\.column\[5\]（ijn_battleship_fuso）の speed_max_kt（24\.7）以下（V-C2/);
    expect(build((d) => (protoOf(d, 'us_05')['enemies'] as string[]).pop())).toThrow(/enemies（.*）は transit\.column の顔ぶれ（.*。順は問わない）（V-C2/);
    expect(build((d) => (protoOf(d, 'us_05')['enemies'] as string[]).reverse())).toThrow(/enemies の先頭（ijn_battleship_fuso）は駆逐艦（隊の見つける距離の基準）（V-C2/);
    expect(build((d) => (protoOf(d, 'us_05')['enemy_hits_to_sink'] = 1))).toThrow(/enemy_hits_to_sink は片道の列の任務に置かない（沈む本数は艦ごとの記録の値）（V-C2/);
  });
  it('V-C3: 道（＋ずれ＋今夜の ±150 m）は縁から艦の余白 ＋ 200 m 以上内・岸の線から陸の反射 300 m より沖', () => {
    // 戦艦の余白は 212.75 ＋ 200 ＝ 412.75 m。本隊の道 y 2,400 を北へ寄せる（時雨の道 −540＝v0.8.2 IP1。道 990 で時雨は y 450）
    expect(build((d) => ((transitOf(d)['inbound'] as Rec)['lane_y_m'] = 990))).toThrow(/transit\.column\[4\] の道（y 450 ± 今夜の 150）は北と南の縁から 318\.0 m（艦の余白 ＋ 200）以上内（V-C3/);
    expect(build((d) => (colOf(d)[5]!['lane_dy_m'] = -1840))).toThrow(/transit\.column\[5\] の道（y 560 ± 今夜の 150）は北と南の縁から 412\.8 m（艦の余白 ＋ 200）以上内（V-C3/);
    expect(build((d) => (colOf(d)[5]!['lane_dy_m'] = -1837.25))).not.toThrow(); // 562.75 − 150 ＝ 412.75
    expect(build((d) => (colOf(d)[0]!['lane_dy_m'] = 1250))).toThrow(/transit\.column\[0\] の道（y 3650 ± 今夜の 150）は北と南の縁から 318\.0 m/);
    // 陸の反射（so_late の 300 m）: 前衛の道の南の端 2,950 は南の岸の線（4,000）から 1,050 m。反射を 1,050 m にすると止まり、1,049 m なら通る（岸の切れ目は見ない＝控えめ）
    const clutter = (m: number) => (d: GameData): void => {
      (d.hitRateModel as unknown as { radar: { models: { so_late: { land_clutter_m: number } } } }).radar.models.so_late.land_clutter_m = m;
    };
    expect(build(clutter(1050))).toThrow(/transit\.column\[0\] の道（y 2800 ± 今夜の 150）は岸の線から陸の反射（1050 m）より沖（V-C3/);
    expect(build(clutter(1049))).not.toThrow();
  });
  it('V-C4: 列だけの隊（enemy_start を置かない）・見張りがいる時だけ rejoin_s 10〜120 秒', () => {
    expect(build((d) => (protoOf(d, 'us_05')['enemy_start'] = { x_m: 1000, y_m: 1000, heading_deg: 90 }))).toThrow(/enemy_start は片道の列（transit\.column）の任務に置かない（護衛のいない列だけの隊.*（V-C4/);
    expect(build((d) => (transitOf(d)['rejoin_s'] = 9))).toThrow(/transit\.rejoin_s は見張り（role screen）がいる時だけ 10〜120 秒（9）（V-C4/);
    expect(build((d) => (transitOf(d)['rejoin_s'] = 120))).not.toThrow();
    expect(build((d) => delete transitOf(d)['rejoin_s'])).toThrow(/transit\.rejoin_s は見張り（role screen）がいる時だけ 10〜120 秒（undefined）/);
    expect(build((d) => {
      colOf(d)[4]!['role'] = 'line';
      (hardOf(d)['extra_column'] as Rec[])[0]!['role'] = 'line';
    })).toThrow(/transit\.rejoin_s は見張り（role screen）がいる時だけ 10〜120 秒（40）（V-C4/);
    // 見張りの鎖（v0.8.2 S3b・lead の L37）: screen_chase_s 10〜180・screen_cooldown_s 0〜300 秒。任意（無い列は S1 の規則）・見張りのいない列には置けない
    expect(build((d) => (transitOf(d)['screen_chase_s'] = 9))).toThrow(/transit\.screen_chase_s は見張り（role screen）がいる時だけ置ける 10〜180 秒（9）（V-C4/);
    expect(build((d) => (transitOf(d)['screen_cooldown_s'] = 301))).toThrow(/transit\.screen_cooldown_s は見張り（role screen）がいる時だけ置ける 0〜300 秒（301）（V-C4/);
    expect(build((d) => (transitOf(d)['screen_cooldown_s'] = 'x'))).toThrow(/transit\.screen_cooldown_s は.*（x）（V-C4/);
    expect(build((d) => { delete transitOf(d)['screen_chase_s']; delete transitOf(d)['screen_cooldown_s']; })).not.toThrow();
    expect(build((d) => {
      colOf(d)[4]!['role'] = 'line';
      (hardOf(d)['extra_column'] as Rec[])[0]!['role'] = 'line';
      delete transitOf(d)['rejoin_s'];
    })).toThrow(/transit\.screen_chase_s は見張り（role screen）がいる時だけ置ける 10〜180 秒（\d+）（V-C4/);
  });
  it('V-C5: 揺らぎのない夜のハード込みの最後の艦は夜明けの 20 秒前までに去り、今夜の揺らぎ（±6.48 秒）の端でも夜明けの前に去る', () => {
    const cross = 6500 / SCREEN_MPS; // 140.40 秒
    expect(109 + cross).toBeCloseTo(249.4, 1);
    expect(build((d) => ((hardOf(d)['extra_column'] as Rec[])[0]!['gap_s'] = 10))).toThrow(/transit: 最後の艦（8 隻目）が去る 251\.40 秒は duration_s（270）の 20 秒前まで（入り ＋ 渡り 140\.40）（V-C5/);
    expect(build((d) => ((hardOf(d)['extra_column'] as Rec[])[0]!['gap_s'] = 8.5))).not.toThrow(); // 249.90 秒
    expect(build((d) => ((hardOf(d)['extra_column'] as Rec[])[0]!['gap_s'] = 8.6))).toThrow(/250\.00 秒は duration_s（270）の 20 秒前まで/); // 250.0009 秒
    expect(build((d) => (((protoOf(d, 'us_05')['night'] as Rec)['enemy_jitter'] as Rec)['x_m'] = 1000))).toThrow(/transit: 今夜の揺らぎ（入り ＋21\.60 秒）でも最後の艦は duration_s（270）の前に去る（271\.00 秒）（V-C5/);
  });
  it('V-C6: 出発点はどの艦の入りの点からも 1,500 m 以上・出撃から 10 秒の内に全速で見つかる距離（半月 3,200 m）に入らない（今夜の揺らぎの端）', () => {
    const move = (x: number, y: number) => (d: GameData): void => {
      Object.assign(protoOf(d, 'us_05')['player_start'] as Rec, { x_m: x, y_m: y });
    };
    expect(build(move(1100, 2800))).toThrow(/player_start は transit\.column\[0\] の入りの点（150, 2800 ± 150）から 1500 m 以上（950\.0 m）（V-C6/);
    // 満潮は最も早くて 5 − 6.48 ＝ −1.48 秒に入り（出撃の最初のステップに現れる）、10 秒で 462.96 m 進む（x 612.96）。そこから 3,200 m の内と外
    expect(build(move(3812, 2650))).toThrow(/player_start は出撃から 10 秒の内に transit\.column\[0\] の全速で見つかる距離（3200 m）に入らない（3199\.0 m）（V-C6/);
    expect(build(move(3813, 2650))).not.toThrow();
  });
});
