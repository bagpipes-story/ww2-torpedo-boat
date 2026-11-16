// v0.8.1 S0（spec-v0810 §3.2・§4.1・§4.4・§4.5）: 止まった艦の data と起動時の検査（config/anchor-mission-data の V-A1〜V-A6）。
// 既定の data（us_06 の卯月・空知丸・ハードの駆潜艇 2 隻）が通り、壊した data は鍵を名指す日本語の文（V-An 付き）で止まる。止まった艦の無い任務は鍵ごと出ない。
// S0 では世界は何も読まない（setup の鍵が出るだけ）。
import { describe, expect, it } from 'vitest';
import { gameData, type GameData } from '../src/config/game-data';
import { getPrototypeMission } from '../src/config/mission-data';
import { ANCHOR_CHECK_SHORE_CLEAR_M, ANCHOR_EXCLUSIVE_KEYS, ANCHOR_KEYS, ANCHOR_MAX_S, ANCHOR_PICKETS_MAX, anchorSetupPart, getAnchorParams, validateAnchorMissions } from '../src/config/anchor-mission-data';
import { directSortie } from '../src/core/sortie';
import { buildWorldSetup } from '../src/systems/world-setup';

type Rec = Record<string, unknown>;
const clone = (): GameData => JSON.parse(JSON.stringify(gameData)) as GameData;
const missionOf = (d: GameData, id: string): Rec => (d.missionsSeed.missions as unknown as Rec[]).find((m) => m['id'] === id)!;
const protoOf = (d: GameData, id: string): Rec => missionOf(d, id)['v0_1_prototype'] as Rec;
const anchoredOf = (d: GameData): Rec => protoOf(d, 'us_06')['anchored'] as Rec;
const hardOf = (d: GameData): Rec => protoOf(d, 'us_06')['hard'] as Rec;
const build = (f: (d: GameData) => void, id = 'us_06', hard = false): (() => unknown) => {
  const d = clone();
  f(d);
  return () => getAnchorParams(d, getPrototypeMission(d, id, hard));
};
const PROTO_IDS = (gameData.missionsSeed.missions as unknown as Rec[]).filter((m) => m['v0_1_prototype']).map((m) => m['id'] as string);

describe('既定の data（us_06）', () => {
  it('卯月は気づいて 3 秒で動き出し（v0.8.1 S3 の探りの帯で 6 → 3）、空知丸は動かない。警報 4 秒。ハードの駆潜艇 2 隻は 4 秒（ハードの組み立てだけ）', () => {
    const n = getAnchorParams(gameData, getPrototypeMission(gameData, 'us_06'))!;
    expect(n).toEqual({ destroyerUnderwayS: 3, transportUnderway: false, picketUnderwayS: 4, alarmS: 4, pickets: null });
    const h = getAnchorParams(gameData, getPrototypeMission(gameData, 'us_06', true))!;
    expect(h.pickets).toEqual({ enemyId: 'ijn_subchaser', starts: [{ x: 2300, y: 2050, headingDeg: 90 }, { x: 3200, y: 1500, headingDeg: 270 }] }); // 2 隻目は v0.8.1 S3 の探りの帯 H1・H2 で (4300, 2200) から
    expect(validateAnchorMissions(gameData)).toEqual(n);
    expect([ANCHOR_KEYS.length, ANCHOR_MAX_S, ANCHOR_PICKETS_MAX, ANCHOR_CHECK_SHORE_CLEAR_M]).toEqual([5, 30, 4, 50]);
    expect(String(anchoredOf(gameData)['source'])).toMatch(/historical .*\/ design \(v0\.8\.1 S0/);
  });
  it('setup の anchors（隊の並び＝駆逐艦 → 輸送船 → 駆潜艇の艦ごとの動き出す秒・動かない輸送船は null）と pickets（ハードだけ・今夜の揺らぎ込み）', () => {
    for (const historical of [false, true]) {
      const s = buildWorldSetup(gameData, 'us_06', { sortie: directSortie('us_06', 1, 'none', false, historical), hard: false });
      expect(s.anchors).toEqual({ underwayS: [3, null], alarmS: 4 });
      expect('pickets' in s).toBe(false);
      const h = buildWorldSetup(gameData, 'us_06', { sortie: directSortie('us_06', 1, 'none', true, historical), hard: true });
      expect(h.anchors).toEqual({ underwayS: [3, null, 4, 4], alarmS: 4 });
      expect([h.pickets!.enemyId, h.pickets!.starts.length, h.pickets!.spec.lengthM, h.pickets!.spec.hitsToSink, h.pickets!.shipAi.ramEnabled]).toEqual(['ijn_subchaser', 2, 51, 1, false]);
      // 駆潜艇は今夜の揺らぎの 3・4 件目（駆逐艦 → 輸送船の後ろ）。揺らぎは x ±150・y ±50・針路なし
      h.pickets!.starts.forEach((p, i) => {
        const base = [{ x: 2300, y: 2050, h: 90 }, { x: 3200, y: 1500, h: 270 }][i]!;
        const o = h.night.enemyOffsets[2 + i]!;
        expect([p.x, p.y, p.headingDeg], String(i)).toEqual([base.x + o.dx, base.y + o.dy, base.h]);
        expect(Math.abs(o.dx) <= 150 && Math.abs(o.dy) <= 50 && o.dh === 0).toBe(true);
      });
      // 輸送船の出発点は 2 件目のまま（駆潜艇が後ろに並んでも）
      expect([h.transport!.start.x, h.transport!.start.y]).toEqual([3000 + h.night.enemyOffsets[1]!.dx, 2760 + h.night.enemyOffsets[1]!.dy]);
      expect(h.transport!.start).toEqual(buildWorldSetup(gameData, 'us_06', { sortie: directSortie('us_06', 1, 'none', false, historical), hard: false }).transport!.start);
    }
    // ?debug&notransport の夜は輸送船の欄が無い（駆潜艇は駆逐艦の後ろ）
    const nt = buildWorldSetup(gameData, 'us_06', { hard: true, transportOff: true });
    expect([nt.transport, nt.anchors!.underwayS, nt.pickets!.starts.map((p) => p.x)]).toEqual([null, [3, 4, 4], [2300, 3200]]);
    expect(anchorSetupPart(null, 1, true)).toEqual({});
  });
  it('止まった艦の無い任務は null・anchors と pickets の鍵が出ない（ノーマル・ハード・史実モード・seed 3 夜）', () => {
    for (const id of PROTO_IDS.filter((x) => x !== 'us_06')) {
      for (const hard of [false, true]) {
        expect(getAnchorParams(gameData, getPrototypeMission(gameData, id, hard)), id).toBeNull();
        for (const historical of [false, true]) {
          const s = buildWorldSetup(gameData, id, { sortie: directSortie(id, 3, 'none', hard, historical), hard });
          for (const k of ['anchors', 'pickets'] as const) expect(k in s, `${id} ${k}`).toBe(false);
          expect(/"(anchors|pickets)"/.test(JSON.stringify(s)), id).toBe(false);
        }
      }
    }
  });
});

describe('起動時の検査（V-A1〜V-A6）', () => {
  it('V-A1 形: 鍵の閉じた集合・秒は 0 ＜ x ≤ 30・輸送船は動かない（false だけ）・出典', () => {
    const cases: [(d: GameData) => void, RegExp][] = [
      [(d) => (protoOf(d, 'us_06')['anchored'] = 6), /us_06\.v0_1_prototype\.anchored は object（V-A1・spec-v0810 §4\.4）/],
      [(d) => (anchoredOf(d)['wake_s'] = 1), /anchored の鍵は destroyer_underway_s・transport_underway・picket_underway_s・alarm_s・source だけ（知らない鍵 wake_s）（V-A1/],
      [(d) => delete anchoredOf(d)['destroyer_underway_s'], /anchored\.destroyer_underway_s は 0 ＜ 秒 ≤ 30（undefined）（V-A1/],
      [(d) => (anchoredOf(d)['destroyer_underway_s'] = 0), /anchored\.destroyer_underway_s は 0 ＜ 秒 ≤ 30（0）/],
      [(d) => (anchoredOf(d)['destroyer_underway_s'] = 30.5), /anchored\.destroyer_underway_s は 0 ＜ 秒 ≤ 30（30\.5）/],
      [(d) => (anchoredOf(d)['alarm_s'] = '4'), /anchored\.alarm_s は 0 ＜ 秒 ≤ 30（4）（V-A1/],
      [(d) => (anchoredOf(d)['picket_underway_s'] = -1), /anchored\.picket_underway_s は 0 ＜ 秒 ≤ 30（-1）（V-A1/],
      [(d) => (anchoredOf(d)['transport_underway'] = true), /anchored\.transport_underway は false だけ（輸送船は一晩じゅう止まって揚陸する。動く輸送船は候補。true）（V-A1/],
      [(d) => delete anchoredOf(d)['transport_underway'], /anchored\.transport_underway は false だけ.*undefined）（V-A1/],
      [(d) => (anchoredOf(d)['source'] = ' '), /anchored\.source は空でない文字列（V-A1/],
    ];
    for (const [f, re] of cases) expect(build(f), re.source).toThrow(re);
    expect(build((d) => (anchoredOf(d)['destroyer_underway_s'] = 30))).not.toThrow();
    // 駆潜艇の動き出す秒は hard.extra_pickets のある任務に要る（ノーマルの組み立てでも鍵は見る＝readHardBlock と同じ作法）
    for (const hard of [false, true]) expect(build((d) => delete anchoredOf(d)['picket_underway_s'], 'us_06', hard)).toThrow(/anchored\.picket_underway_s はハードの駆潜艇（hard\.extra_pickets）のある任務に要る（V-A5/);
    expect(build((d) => (delete anchoredOf(d)['picket_underway_s'], delete hardOf(d)['extra_pickets'], delete hardOf(d)['picket_enemy_id']))).not.toThrow();
  });
  it('V-A2 置き場: 駆逐艦の任務（enemy_start）だけ・列の通過などと同居しない', () => {
    expect(ANCHOR_EXCLUSIVE_KEYS).toEqual(['transit', 'barges', 'pt_boats', 'landing', 'ally_destroyer', 'evac', 'patrol_air', 'escort', 'fleet_gone_clears']);
    // 大発・米PT・退避・哨戒機・僚艇の鍵は getPrototypeMission の形の検査が先に止める。残りの 4 つは anchored の検査が止める
    for (const k of ['transit', 'landing', 'ally_destroyer', 'fleet_gone_clears'] as const) {
      expect(build((d) => (protoOf(d, 'us_06')[k] = {})), k).toThrow(new RegExp(`us_06\\.v0_1_prototype\\.${k} と anchored は同居しない（V-A2`));
    }
    for (const k of ['barges', 'pt_boats', 'evac', 'patrol_air', 'escort'] as const) {
      const d = clone();
      protoOf(d, 'us_06')[k] = {};
      expect(() => getPrototypeMission(d, 'us_06'), k).toThrow();
    }
    // us_02（制空権下で敵艦隊がいなくなれば終わる任務）に置けば止まる
    const d = clone();
    protoOf(d, 'us_02')['anchored'] = anchoredOf(d);
    expect(() => getAnchorParams(d, getPrototypeMission(d, 'us_02'))).toThrow(/us_02\.v0_1_prototype\.fleet_gone_clears と anchored は同居しない（V-A2/);
    const e = clone();
    protoOf(e, 'jp_05')['anchored'] = anchoredOf(e);
    expect(() => getAnchorParams(e, getPrototypeMission(e, 'jp_05'))).toThrow(/jp_05\.v0_1_prototype\.anchored は駆逐艦の任務（enemy_start）だけ（V-A2/);
  });
  it('V-A3 位置: どの艦も今夜の揺らぎの端で海域の縁の余白（表示上の船体半分）より内・船体は岸の線から 50 m 以上沖', () => {
    // 空知丸 (3000, 2760)・y ±50: 南の岸まで 190 m ≥ 120（船体半長 × ship_hit_scale 2 / 2）＋ 50。y を 21 m 南へずらすと 169 m で止まる
    expect(build((d) => ((protoOf(d, 'us_06')['transport'] as Rec)['start'] = { x_m: 3000, y_m: 2780, heading_deg: 135 }))).not.toThrow();
    expect(build((d) => ((protoOf(d, 'us_06')['transport'] as Rec)['start'] = { x_m: 3000, y_m: 2781, heading_deg: 135 }))).toThrow(/隊の 2 隻目（ijn_transport）の船体（中心 2850, 2831。今夜の揺らぎの端）は岸の線から 50 m 以上沖（中心から岸の線まで 170 m 以上）（V-A3/);
    expect(build((d) => ((protoOf(d, 'us_06')['enemy_start'] as Rec)['x_m'] = 200))).toThrow(/隊の 1 隻目（ijn_destroyer_mutsuki_enemy）の位置（50, 2330。今夜の揺らぎの端）は海域の縁から 102\.7 m（表示上の船体半分）以上内（V-A3/);
    expect(build((d) => ((hardOf(d)['extra_pickets'] as Rec[])[0]!['y_m'] = 80), 'us_06', true)).toThrow(/隊の 3 隻目（ijn_subchaser）の位置.*海域の縁から 51 m/);
  });
  it('V-A4 出発点: どの艦（ハードの駆潜艇も）からも今夜の揺らぎの端で全速で見つかる距離（月没後 1,920 m）より遠い・どの艦も帰投の輪の外', () => {
    // 駆潜艇 (3200, 1500)（v0.8.1 S3 で (4300, 2200) から）の揺らぎの端 (3350, 1450) から出発点 (5000, 250) まで 2,040 m。y を 1,290 m（北へ 210 m）にしても 1,924 m、1,280 m で 1,919 m＝1,920 m の内
    expect(build((d) => ((hardOf(d)['extra_pickets'] as Rec[])[1]!['y_m'] = 1290), 'us_06', true)).not.toThrow();
    expect(build((d) => ((hardOf(d)['extra_pickets'] as Rec[])[1]!['y_m'] = 1280), 'us_06', true)).toThrow(/player_start は隊の 4 隻目（ijn_subchaser。今夜の揺らぎの端）から全速で見つかる距離（1920 m。ノーマル・史実モードなし）より遠い（1919\.\d m）（V-A4/);
    expect(build((d) => ((hardOf(d)['extra_pickets'] as Rec[])[1]!['y_m'] = 1280), 'us_06', false)).not.toThrow(); // ノーマルの組み立ては駆潜艇を見ない
    expect(build((d) => ((protoOf(d, 'us_06')['return_point'] as Rec)['x_m'] = 3620, (protoOf(d, 'us_06')['return_point'] as Rec)['y_m'] = 2200))).toThrow(/隊の 1 隻目（ijn_destroyer_mutsuki_enemy。今夜の揺らぎの端）は帰投の輪の外（V-A4/);
    // 反転のある夜は東西の鏡も見る: (1000, 1000) の卯月は出発点から 4,070 m だが、鏡の (5000, 1000) は 700 m
    const at1000 = (d: GameData): void => void Object.assign(protoOf(d, 'us_06')['enemy_start'] as Rec, { x_m: 1000, y_m: 1000 });
    expect(build(at1000)).not.toThrow();
    expect(build((d) => (at1000(d), ((protoOf(d, 'us_06')['night'] as Rec)['mirror_chance'] = 0.5)))).toThrow(/player_start は隊の 1 隻目（ijn_destroyer_mutsuki_enemy。今夜の揺らぎの端）から全速で見つかる距離（1920 m.*（700\.0 m）（V-A4/);
  });
  it('V-A5 ハードの駆潜艇: 1〜4 隻・輸送船のある任務だけ・AI と砲の記録・止まった艦の任務だけ', () => {
    const cases: [(d: GameData) => void, RegExp][] = [
      [(d) => (hardOf(d)['extra_pickets'] = []), /hard\.extra_pickets は 1〜4 隻の配列（V-A5/],
      [(d) => (hardOf(d)['extra_pickets'] = Array.from({ length: 5 }, () => ({ x_m: 2300, y_m: 2050, heading_deg: 90 }))), /hard\.extra_pickets は 1〜4 隻の配列/],
      [(d) => delete hardOf(d)['picket_enemy_id'], /hard\.extra_pickets と hard\.picket_enemy_id は両方あるか両方ないか（V-A5/],
      [(d) => (hardOf(d)['picket_enemy_id'] = 'ijn_destroyer_mutsuki'), /hard\.picket_enemy_id（ijn_destroyer_mutsuki）は AI と砲を持つ記録: enemies\.json の ijn_destroyer_mutsuki/],
      [(d) => (hardOf(d)['picket_enemy_id'] = 'nope'), /hard\.picket_enemy_id（nope）は AI と砲を持つ記録: enemies\.json に nope が無い/],
      [(d) => delete protoOf(d, 'us_06')['transport'], /hard\.extra_pickets は輸送船（transport）のある任務だけ（隊の並びは駆逐艦 → 輸送船 → 駆潜艇）（V-A5/],
      [(d) => ((hardOf(d)['extra_pickets'] as Rec[])[0] = { x_m: 1 }), /us_06\.v0_1_prototype\.hard\.extra_pickets\[0\] に x_m \/ y_m \/ heading_deg が無い/],
    ];
    for (const [f, re] of cases) for (const hard of [false, true]) expect(build(f, 'us_06', hard), `${re.source} ${hard}`).toThrow(re);
    const d = clone();
    (protoOf(d, 'us_02')['hard'] as Rec)['extra_pickets'] = hardOf(d)['extra_pickets'];
    expect(() => getAnchorParams(d, getPrototypeMission(d, 'us_02'))).toThrow(/us_02\.v0_1_prototype\.hard\.extra_pickets は止まった艦（anchored）の任務だけ（V-A5/);
  });
  it('V-A6 夜明け: dawn_air.enemy_ships_at_dawn は retire で dawn_withdraw がある（config/dawn-data の検査も通す）', () => {
    expect(build((d) => (((missionOf(d, 'us_06')['dawn_air'] as Rec)['enemy_ships_at_dawn'] = 'stay'), delete protoOf(d, 'us_06')['dawn_withdraw']))).toThrow(/anchored の任務の dawn_air\.enemy_ships_at_dawn は retire で dawn_withdraw がある（夜明けに止まった艦は動き出して退く。stay）（V-A6/);
    expect(build((d) => delete protoOf(d, 'us_06')['dawn_withdraw'])).toThrow(/dawn_air\.enemy_ships_at_dawn が retire なのに v0_1_prototype\.dawn_withdraw（retire_edge）が無い/);
  });
  it('Boot の検査は壊れた us_06 で止まる（ハードも組む）', () => {
    const d = clone();
    (hardOf(d)['extra_pickets'] as Rec[])[1]!['y_m'] = 1280;
    expect(() => validateAnchorMissions(d)).toThrow(/V-A4/);
  });
});
