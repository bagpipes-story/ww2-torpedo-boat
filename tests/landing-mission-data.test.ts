// 揚陸の任務の検査（v0.6.9 S1。config/landing-mission-data の V1〜V10・V13 と V3・V11 の他の記録を跨ぐ部分。spec-v069 §4.9・R1・R7・R8/F8）。
// 壊した data の写しで組み、例外の文を確かめる。S4 で動かせる範囲（R7）の境目もここで pin する（境目の内は通り、外は止まる）。
import { describe, expect, it } from 'vitest';
import { gameData, getPrototypeMission, type GameData } from '../src/config/game-data';
import { LANDING_BEACH_CLEAR_M, LANDING_BEACH_MARGIN_M, LANDING_DAWN_MARGIN_S, LANDING_LAUNCH_INSIDE_M, LANDING_RING_CLEAR_M, LANDING_WARN_MIN_S } from '../src/config/landing-config';
import { LANDING_EXCLUSIVE_KEYS, cruiseDetectM, getLandingSetup, landingSetupPart } from '../src/config/landing-mission-data';
import { PATROL_AIR_EXCLUSIVE_KEYS } from '../src/config/patrol-air-mission-data';
import { getPtParams } from '../src/config/pt-mission-data';
import { buildWorldSetup } from '../src/systems/world-setup';

type Rec = Record<string, unknown>;
const TS = gameData.hitRateModel.world.time_scale;
const clone = (): GameData => JSON.parse(JSON.stringify(gameData)) as GameData;
const missionOf = (d: GameData, id: string): Rec => (d.missionsSeed.missions as unknown as Rec[]).find((m) => m['id'] === id)!;
const protoOf = (d: GameData, id: string): Rec => missionOf(d, id)['v0_1_prototype'] as Rec;
const landOf = (d: GameData): Rec => protoOf(d, 'jp_04')['landing'] as Rec;
const ptOf = (d: GameData): Rec => (d.enemies.enemies as unknown as Rec[]).find((e) => e['id'] === 'us_pt_enemy')!;
/** 壊した data で jp_04 を組む（任務・米PT の隊もその data から） */
const land = (mut: (d: GameData) => void, hard = false): (() => unknown) => {
  const d = clone();
  mut(d);
  return () => {
    const m = getPrototypeMission(d, 'jp_04', hard);
    const p = getPtParams(d, m, TS);
    return getLandingSetup(d, m, p, p, 2);
  };
};
/** 任務と米PT の隊はもとの data から、landing の block と記録だけ壊した data から（任務の読み出しが先に止める置き場の検査を見る） */
const landRaw = (mut: (d: GameData) => void): (() => unknown) => {
  const d = clone();
  mut(d);
  const m = getPrototypeMission(gameData, 'jp_04');
  const p = getPtParams(gameData, m, TS);
  return () => getLandingSetup(d, m, p, p, 2);
};
const HEAD = /^jp_04\.v0_1_prototype\.landing: /;

describe('jp_04 の揚陸の組み立て（通る data）', () => {
  it('ノーマル・ハード・史実モードで組め、他の任務は null・landingSetupPart は {}（鍵ごと出ない）', () => {
    for (const hard of [false, true]) {
      expect(land(() => undefined, hard)).not.toThrow();
      for (const historical of [false, true]) expect(buildWorldSetup(gameData, 'jp_04', { hard, historical }).landing, `${hard} ${historical}`).toBeDefined();
    }
    for (const id of ['us_01', 'us_02', 'us_03', 'jp_01', 'jp_02', 'jp_05', 'jp_06']) {
      const m = getPrototypeMission(gameData, id);
      const p = getPtParams(gameData, m, TS);
      expect(getLandingSetup(gameData, m, p, p, 2), id).toBeNull();
      expect(landingSetupPart(gameData, m, p, p, {}), id).toEqual({});
    }
    expect([LANDING_LAUNCH_INSIDE_M, LANDING_RING_CLEAR_M, LANDING_DAWN_MARGIN_S, LANDING_WARN_MIN_S, LANDING_BEACH_MARGIN_M, LANDING_BEACH_CLEAR_M]).toEqual([50, 800, 30, 20, 12, 50]);
  });
  it('当たりの倍率: ?debug&shiphit の上書きは params の当たりだけを変え（V4 は data の 2 倍で見る）、正でない上書きは data の値', () => {
    const m = getPrototypeMission(gameData, 'jp_04');
    const p = getPtParams(gameData, m, TS);
    expect(landingSetupPart(gameData, m, p, p, { shipHitScale: 1 }).landing!.params).toMatchObject({ hitLenM: 120, hitBeamM: 16, passRadius2: 76 * 76 });
    expect(landingSetupPart(gameData, m, p, p, { shipHitScale: 0 }).landing!.params).toMatchObject({ hitLenM: 240, hitBeamM: 32 });
    expect(buildWorldSetup(gameData, 'jp_04', { shipHitScale: 1 }).landing!.params.hitLenM).toBe(120);
  });
});

describe('V1〜V3・V11（任務の形・置き場・輸送船・雷撃の記録）', () => {
  it('V2: 大発の輸送隊・敵の大発・駆逐艦・夜の哨戒機・敵の輸送船・僚艇と同居しない。PATROL_AIR_EXCLUSIVE_KEYS に landing は足さない（R8/F8: pt_boats が既に排他）', () => {
    expect(LANDING_EXCLUSIVE_KEYS).toEqual(['convoy', 'barges', 'enemy_start', 'patrol_air', 'transport', 'escort']);
    for (const k of LANDING_EXCLUSIVE_KEYS) expect(landRaw((d) => (protoOf(d, 'jp_04')[k] = { x: 1 })), k).toThrow(new RegExp(`${HEAD.source}v0_1_prototype\\.${k} と同居しない（停泊する味方の輸送船と米PT の隊の任務）`));
    expect((PATROL_AIR_EXCLUSIVE_KEYS as readonly string[]).includes('landing')).toBe(false);
    expect((PATROL_AIR_EXCLUSIVE_KEYS as readonly string[]).includes('pt_boats')).toBe(true);
  });
  it('V1: 米PT の隊の任務だけ・岸は south・主兵装 guns・東西反転なし', () => {
    const m = getPrototypeMission(gameData, 'jp_04');
    expect(() => getLandingSetup(gameData, { ...m, ptBoats: null }, null, null, 2)).toThrow(/landing: 米PT の隊（pt_boats）の任務だけ/);
    expect(land((d) => delete protoOf(d, 'jp_04')['coast'])).toThrow(/landing: 岸（coast\.side south）が要る/);
    expect(land((d) => (protoOf(d, 'jp_04')['main_weapon'] = 'none'))).toThrow(/landing: main_weapon は guns（none。25mm で PT を追い払う）/);
    // 反転すると米PT の出発点が自艇の出発点のそばになり config/pt-mission-data が先に止めるので、米PT の隊はもとの data から
    const d = clone();
    (protoOf(d, 'jp_04')['night'] as Rec)['mirror_chance'] = 0.5;
    const p = getPtParams(gameData, m, TS);
    expect(() => getLandingSetup(d, getPrototypeMission(d, 'jp_04'), p, p, 2)).toThrow(/landing: night\.mirror_chance は 0（0\.5。泊地と帰投の輪は反転しない）/);
  });
  it('V3: ship_id は allies にあり、記録に寸法と円の数（形の検査は tests/landing-data）', () => {
    expect(land((d) => (missionOf(d, 'jp_04')['allies'] = ['daihatsu_barge']))).toThrow(/landing: ship_id（ijn_transport）が jp_04\.allies に無い/);
    expect(land((d) => { missionOf(d, 'jp_04')['allies'] = ['no_ship']; landOf(d)['ship_id'] = 'no_ship'; })).toThrow(/landing: ship_id（no_ship）が enemies\.json に length_m・beam_m・hull_circles（2 以上の整数）付きで無い/);
    expect(land((d) => (landOf(d)['unload_s'] = 0))).toThrow(/landing: unload_s は 1〜255 の整数/);
  });
  it('V11 は任務と記録の名を頭に（core/pt-torpedo-data。文はすべて tests/pt-torpedo-data）', () => {
    expect(land((d) => ((ptOf(d)['torpedo_attack'] as Rec)['torpedo_id'] = 'us_mk8'))).toThrow(/^jp_04: enemies\.json の us_pt_enemy\.torpedo_attack: torpedo_id（us_mk8）は boats\.json の us_elco80\.torpedoes\.type_late（us_mk13）と同じ/);
    expect(land((d) => delete ptOf(d)['torpedo_attack'])).toThrow(/^jp_04: enemies\.json の us_pt_enemy\.torpedo_attack: ちょうど 10 鍵/);
  });
});

describe('V4〜V10・V13（泊地・輪・夜明け・線の幾何・出発点）', () => {
  it('V4: 輸送船の船体（ship_hit_scale 2 倍・240 × 32 m）は海域の中で、浜の線（y 2,988）から 50 m 以上沖', () => {
    // 泊地を 140 m 南へ（y 2,900）: 艇首 135° で南の円の縁が y 2,952.8＝浜の線から 35 m
    expect(land((d) => ((landOf(d)['anchor'] as Rec)['y_m'] = 2900))).toThrow(/landing: 輸送船の船体（ship_hit_scale 2 倍）は浜の線（y 2988）から 50 m 以上沖（35 m）/);
    expect(land((d) => ((landOf(d)['anchor'] as Rec)['x_m'] = 60))).toThrow(/landing: 輸送船の船体（ship_hit_scale 2 倍）は海域の中/);
    // 今の泊地: 南の円の縁 y 2,849.5（浜の線から 138.5 m）。y 2,848 は V4 を通って（線の終わり 750 m で V7 が止める）、y 2,849 は V4 が止める
    expect(land((d) => ((landOf(d)['anchor'] as Rec)['y_m'] = 2848))).toThrow(/landing: pt_boats の線 0 の終わり/);
    expect(land((d) => ((landOf(d)['anchor'] as Rec)['y_m'] = 2849))).toThrow(/50 m 以上沖（49 m）/);
    // 艇首 90°（浜と平行）なら円の南の縁は y 2,776
    expect(land((d) => ((landOf(d)['anchor'] as Rec)['heading_deg'] = 90))).not.toThrow();
  });
  it('V5: 泊地と帰投の輪の中心 ≥ 800 m（今 1,601 m）・V6: unload_s + 30 ≤ duration_s（今 170 ≤ 200）', () => {
    expect(land((d) => { const rp = protoOf(d, 'jp_04')['return_point'] as Rec; rp['x_m'] = 2400; rp['y_m'] = 2500; })).toThrow(/landing: 泊地と帰投の輪の中心は 800 m 以上（654 m）/);
    expect(land((d) => (landOf(d)['unload_s'] = 171))).toThrow(/landing: unload_s \+ 30（201 秒）≤ duration_s（200 秒。揚陸は夜明けの前に決着する）/);
    expect(land((d) => (landOf(d)['unload_s'] = 170))).not.toThrow();
  });
  it('V7: 線の終わりは泊地から 750 m（900 − 100 − 50）の内（揺らぎ込み）・V9: 線の向きと終わりから泊地への方位の差 ≤ 15°', () => {
    expect(land((d) => ((protoOf(d, 'jp_04')['pt_boats'] as Rec)['legs_m'] as number[][])[0]!.splice(0, 4, 3300, 250, 3060, 1900))).toThrow(/landing: pt_boats の線 0 の終わりは泊地から 750 m（launch_range_m − arrive_m − 50）の内（今夜の揺らぎで 912 m）/);
    expect(land((d) => ((protoOf(d, 'jp_04')['pt_boats'] as Rec)['legs_m'] as number[][])[1]!.splice(0, 4, 5600, 2000, 3700, 2790))).toThrow(/landing: pt_boats の線 1 の向きと、線の終わりから泊地への方位の差は launch_heading_tol_deg \/ 2（15°）以下（今夜の揺らぎで 2[0-9]\.\d°）/);
    // ハードの線も見る（足した線 2 の終わりを遠くへ）
    expect(land((d) => (((protoOf(d, 'jp_04')['hard'] as Rec)['extra_pt_legs_m'] as number[][])[0] = [5150, 550, 3700, 2100]), true)).toThrow(/pt_boats の線 2 の終わりは泊地から 750 m/);
    expect(land((d) => (((protoOf(d, 'jp_04')['hard'] as Rec)['extra_pt_legs_m'] as number[][])[0] = [5150, 550, 3700, 2100]), false)).not.toThrow();
  });
  it('V8: 揺らぎ込みの PT の出発点は泊地から lookout_m より遠い（今 1,929 m）・V10: 報告から 1,300 m まで 8 kt で 20 秒以上（今 24.3 秒）', () => {
    expect(land((d) => ((protoOf(d, 'jp_04')['pt_boats'] as Rec)['start_along_m'] = 1000))).toThrow(/landing: 今夜の揺らぎの PT の出発点は泊地から lookout_m（1800 m）より遠い（1\d{3} m。出発で見張りが報告しない）/);
    expect(land((d) => (landOf(d)['lookout_m'] = 1700))).toThrow(/landing: 見張りの報告から 1300 m（max\(hurried_max_m, launch_range_m\)）まで哨戒の速さで 19\.44 秒（20 秒以上）/);
    // 慌てた斉射なし（hurried_max_m 0）なら launch_range_m から数える: lookout 1,311 で 19.97 秒（1,312 で 20.02 秒）
    expect(land((d) => { (ptOf(d)['torpedo_attack'] as Rec)['hurried_max_m'] = 0; landOf(d)['lookout_m'] = 1311; })).toThrow(/報告から 900 m（max\(hurried_max_m, launch_range_m\)）まで哨戒の速さで 19\.97 秒/);
  });
  it('V13（spec R1）: 前の出発点 (2700, 2450) は止まる（北の線の遠い部分まで 1,076 m）。今の (2000, 2800) は 1,754 m（巡航で見つかる 1,560 m は史実モード）', () => {
    expect(cruiseDetectM(gameData, getPrototypeMission(gameData, 'jp_04'), getPtParams(gameData, getPrototypeMission(gameData, 'jp_04'), TS)!)).toBeCloseTo(1560, 6);
    const old = (d: GameData): void => { const s = protoOf(d, 'jp_04')['player_start'] as Rec; s['x_m'] = 2700; s['y_m'] = 2450; s['heading_deg'] = 45; };
    // 前の出発点は config/pt-mission-data の出発の検査（1,692 ≥ 1,560）を通るので、V13 だけが止める
    const d = clone();
    old(d);
    expect(() => getPtParams(d, getPrototypeMission(d, 'jp_04', true), TS)).not.toThrow();
    for (const hard of [false, true]) expect(land(old, hard), String(hard)).toThrow(/landing: pt_boats の線 0 の泊地から 1300 m より遠い部分（今夜の揺らぎ込み）は、自艇の出発点から巡航で見つかる 1560 m（史実モード込み）より遠い（1076 m。出発点のそばで引きつけられない）/);
  });
  it('S4 で動かせる範囲（spec R7。landing.source に書いた境目）: lookout_m 1,712〜1,928（hurried 1,300）・hurried_max_m 1,062〜1,388（lookout 1,800）', () => {
    const look = (v: number): (() => unknown) => land((d) => (landOf(d)['lookout_m'] = v));
    const hur = (v: number): (() => unknown) => land((d) => ((ptOf(d)['torpedo_attack'] as Rec)['hurried_max_m'] = v));
    expect(look(1711)).toThrow(/哨戒の速さで 19\.97 秒/); // V10
    expect(look(1712)).not.toThrow();
    expect(look(1928)).not.toThrow();
    expect(look(1929)).toThrow(/PT の出発点は泊地から lookout_m（1929 m）より遠い（1929 m。/); // V8（最短 1,928.6 m）
    expect(hur(1388)).not.toThrow();
    expect(hur(1389)).toThrow(/哨戒の速さで 19\.97 秒/); // V10
    expect(hur(1062)).not.toThrow();
    expect(hur(1061)).toThrow(/泊地から 1061 m より遠い部分.*巡航で見つかる 1560 m（史実モード込み）より遠い（1559 m。/); // V13
    const src = String(landOf(gameData)['source']);
    expect(src).toContain('lookout_m ≥ max(hurried_max_m, launch_range_m) + 412');
    expect(src).toContain('1,929 m（V8）');
    expect(src).toContain('hurried_max_m 1,300 なら lookout_m 1,712〜1,928、lookout_m 1,800 なら hurried_max_m ≤ 1,388');
    expect(src).toContain('hurried_max_m ≥ 1,062 m（V13');
  });
});
