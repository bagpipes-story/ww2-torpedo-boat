// 味方の駆逐艦 卯月の data と起動時の検査（v0.6.10 S1。spec-v0610 §3・§9 の S1、リードの決定 LD6・LD7・LD16）: v0_1_prototype.ally_destroyer の形（core/ally-destroyer-data）・
// 値の検査 V-A6・艦の記録の読み出し（getEnemyRecord を通さない＝LD7）・置き場と位置の検査 V-A1〜V-A5・V-A8（config/ally-destroyer-mission-data。今夜の南北のずれ込み）・
// Boot の V-A7 と「1 任務だけ」、WorldSetup.allyDestroyer（jp_04 だけ・allyOff と ?debug&noally で鍵ごと出ない）。壊した data の写しで組み、例外の文を 1 つずつ確かめる。
// LD16 の (3620, 2380)・lookout_slow_m 350 は通り、前の案 D1 (3450, 2580) は斉射の外の魚雷を入れた V-A5 で、設計 C の (3400, 2700) は V-A4 で止まる。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALLY_CHECK_STEP_M, ALLY_FAN_CLEAR_DEG, ALLY_LANE_CLEAR_M, ALLY_SHELL_POOL_SIZE } from '../src/config/ally-config';
import { allyDestroyerSetupPart, getAllyDestroyerParams, validateAllyDestroyerMissions } from '../src/config/ally-destroyer-mission-data';
import { gameData, getEnemyRecord, getPrototypeMission, type GameData } from '../src/config/game-data';
import { getLandingSetup } from '../src/config/landing-mission-data';
import { getPtParams } from '../src/config/pt-mission-data';
import { ALLY_DESTROYER_KEYS, isAllyShipRecord, readAllyDestroyerBlock } from '../src/core/ally-destroyer-data';
import { allyArcMarginDeg, allyStationMargins, type AllyGeomInput } from '../src/core/ally-geometry';
import { directSortie } from '../src/core/sortie';
import { ktToMps } from '../src/core/units';
import { buildWorldSetup } from '../src/systems/world-setup';

type Rec = Record<string, unknown>;
const TS = gameData.hitRateModel.world.time_scale;
const clone = (): GameData => JSON.parse(JSON.stringify(gameData)) as GameData;
const missionOf = (d: GameData, id: string): Rec => (d.missionsSeed.missions as unknown as Rec[]).find((m) => m['id'] === id)!;
const protoOf = (d: GameData, id: string): Rec => missionOf(d, id)['v0_1_prototype'] as Rec;
const blockOf = (d: GameData): Rec => protoOf(d, 'jp_04')['ally_destroyer'] as Rec;
const shipOf = (d: GameData): Rec => (d.enemies.enemies as unknown as Rec[]).find((e) => e['id'] === 'ijn_destroyer_mutsuki')!;
/** 壊した data で jp_04 の卯月を組む（任務・米PT の隊・揚陸もその data から） */
const ally = (mut: (d: GameData) => void, hard = false): (() => unknown) => () => {
  const d = clone();
  mut(d);
  const m = getPrototypeMission(d, 'jp_04', hard);
  const p = getPtParams(d, m, TS);
  return getAllyDestroyerParams(d, m, p, getLandingSetup(d, m, p, p, d.hitRateModel.world.ship_hit_scale));
};
const at = (x: number, y: number) => (d: GameData): void => {
  blockOf(d)['station'] = { x_m: x, y_m: y, heading_deg: 90 };
};
const HEAD = /^jp_04\.v0_1_prototype\.ally_destroyer: /;
const TAIL = /（docs\/02 §6\.11）$/;

/** 揚陸と米PT の隊から測る値（データの値。ハードは北東の線も） */
function geom(hard: boolean): { pt: NonNullable<ReturnType<typeof getPtParams>>; g: AllyGeomInput } {
  const m = getPrototypeMission(gameData, 'jp_04', hard);
  const pt = getPtParams(gameData, m, TS)!;
  const ld = getLandingSetup(gameData, m, pt, pt, gameData.hitRateModel.world.ship_hit_scale)!;
  const a = getAllyDestroyerParams(gameData, m, pt, ld)!;
  const tp = ld.torpedo;
  return {
    pt,
    g: {
      x: a.x, y: a.y, arc0Deg: a.arc0Deg, arc1Deg: a.arc1Deg, guardLegs: a.guardLegs, ax: ld.params.x, ay: ld.params.y, launchM: tp.launchM, fastM: a.lookFastM,
      padM: (a.gunnery.searchlight.onDelayS + a.lightReactS) * pt.patrolMps * pt.timeScale, halfLenM: a.lengthM / 2, aimDeg: tp.aimDeg, spreadDeg: (tp.spacingDeg * (tp.n - 1)) / 2,
      jitterYM: m.night!.enemyJitterYM, stepM: ALLY_CHECK_STEP_M, clearDeg: ALLY_FAN_CLEAR_DEG,
    },
  };
}

describe('卯月の値（data のまま。LD16）', () => {
  it('ノーマル・ハードで組め、値は data の写し（速い PT の境は ktToMps(15)・砲は gunneryParamsFromData の形・12 cm の沈み 0.10・プール 16）。ハードでも同じ値', () => {
    const s = buildWorldSetup(gameData, 'jp_04');
    const a = s.allyDestroyer!;
    expect([a.shipId, a.labelJa, a.x, a.y, a.headingDeg, a.arc0Deg, a.arc1Deg, a.guardLegs]).toEqual(['ijn_destroyer_mutsuki', '卯月', 3620, 2380, 90, 50, 180, [1]]);
    expect([a.lookSlowM, a.lookSlow2, a.rateSlow, a.lookFastM, a.lookFast2, a.rateFast]).toEqual([350, 122500, 0.3, 800, 640000, 0.4]);
    expect(a.fastMps).toBeCloseTo(ktToMps(15), 12);
    expect([a.lightReactS, a.chaseFireS, a.ringCallBeforeDawn, a.sinkGunIndex, a.ptSinkChance, a.lengthM, a.beamM, a.shellPoolSize]).toEqual([1, 2.5, true, 0, 0.1, 102.7, 9.16, ALLY_SHELL_POOL_SIZE]);
    expect(a.gunnery.guns.map((g) => [g.id, g.count, g.roundsPerMinPerGun, g.damage, g.effectiveM, g.fireChance, g.engineDamageChance])).toEqual([['main_120mm', 2, 10, 40, 3000, 0, 0], ['aa_25mm', 1, 120, 4, 1200, 0, 0]]);
    expect(a.gunnery.searchlight).toEqual({ rangeM: 1500, coneDeg: 12, sweepDegS: 20, onDelayS: 1.5 });
    expect(a.gunnery.starshell.rangeM).toBe(0); // 星弾なし＝決して撃たない
    for (const hard of [false, true]) for (const historical of [false, true]) {
      const h = buildWorldSetup(gameData, 'jp_04', { hard, historical, sortie: directSortie('jp_04', 5, 'none', hard, historical) }).allyDestroyer!;
      expect(h, `${hard} ${historical}`).toEqual(a);
    }
  });
  it('LD16 の余裕（今夜の南北のずれ込み）: ノーマル lane 330.6・slack 27.61°、ハード（北東の線）lane 123.0 m・slack 2.78°・扇の外 13.6°、どちらも扇の内 10.8°・窓 405 m・V-A3 の上限 364.47 m（lookout_slow_m 350 の内）', () => {
    const n = geom(false);
    const h = geom(true);
    const mn = allyStationMargins(n.pt, n.g);
    const mh = allyStationMargins(h.pt, h.g);
    expect([mn.lane.value, mn.slack.value, mn.guardIn.value, mn.cap.value, mn.window.value].map((v) => Math.round(v * 100) / 100)).toEqual([330.63, 27.61, 10.78, 364.47, 405]);
    expect([mh.lane.value, mh.slack.value, mh.nonGuardOut.value].map((v) => Math.round(v * 100) / 100)).toEqual([123.05, 2.78, 13.59]);
    expect([mh.lane.leg, mh.lane.dy, mh.slack.leg, mh.slack.dy, mh.nonGuardOut.leg, mh.cap.leg, mh.cap.dy]).toEqual([2, 100, 2, 100, 2, 1, -100]);
    expect(mh.cap.value).toBe(mn.cap.value);
    expect(mh.cap.value).toBeGreaterThanOrEqual(350);
    expect(mh.lane.value).toBeGreaterThanOrEqual(ALLY_LANE_CLEAR_M);
  });
});

describe('形（readAllyDestroyerBlock）と艦の記録（LD7: getEnemyRecord を通さない）', () => {
  it('鍵はちょうど 14 個（欠け・余分・object でない）', () => {
    expect(ALLY_DESTROYER_KEYS.length).toBe(14);
    expect(Object.keys(blockOf(gameData))).toEqual([...ALLY_DESTROYER_KEYS]);
    expect(ally((d) => (blockOf(d)['extra'] = 1))).toThrow(/ally_destroyer: 鍵はちょうど ship_id・.*（知らない鍵 extra・欠け なし）/);
    expect(ally((d) => delete blockOf(d)['chase_fire_s'])).toThrow(/（知らない鍵 なし・欠け chase_fire_s）/);
    expect(() => readAllyDestroyerBlock([1], 'x')).toThrow('x: object でない（docs/02 §6.11）');
  });
  it('station・文字・扇・見張る線・呼びかけ・数の形', () => {
    expect(ally((d) => (blockOf(d)['station'] = { x_m: 1, y_m: 2 }))).toThrow(/station はちょうど x_m・y_m・heading_deg の数/);
    expect(ally((d) => (blockOf(d)['label_ja'] = ''))).toThrow(/label_ja は空でない文字列/);
    expect(ally((d) => (blockOf(d)['watch_arc_deg'] = [50]))).toThrow(/watch_arc_deg は数 2 つ/);
    for (const g of [[], [1, 1], [-1], [0.5], ['1']]) expect(ally((d) => (blockOf(d)['guard_legs'] = g)), JSON.stringify(g)).toThrow(/guard_legs は 0 以上の整数の重なりの無い並び/);
    expect(ally((d) => (blockOf(d)['ring_call_before_dawn'] = 1))).toThrow(/ring_call_before_dawn は真偽/);
    expect(ally((d) => (blockOf(d)['fast_kt'] = '15'))).toThrow(/fast_kt は有限の数/);
  });
  it('記録: 砲・探照灯（null でない）・星弾の鍵・寸法・pt_sink_chance の砲がちょうど 1 つ。getEnemyRecord は AI・回避・体当たりの値が無いので例外（読まない）', () => {
    expect(isAllyShipRecord(shipOf(gameData))).toBe(true);
    expect(() => getEnemyRecord(gameData, 'ijn_destroyer_mutsuki')).toThrow(/ijn_destroyer_mutsuki/);
    const MSG = /ship_id（ijn_destroyer_mutsuki）が enemies\.json に guns（pt_sink_chance を持つ砲がちょうど 1 つ）・searchlight（null でない）・starshell・length_m・beam_m 付きで無い/;
    expect(ally((d) => (shipOf(d)['searchlight'] = null))).toThrow(MSG);
    expect(ally((d) => delete shipOf(d)['starshell'])).toThrow(MSG);
    expect(ally((d) => (shipOf(d)['beam_m'] = 0))).toThrow(MSG);
    expect(ally((d) => delete (shipOf(d)['guns'] as Rec[])[0]!['pt_sink_chance'])).toThrow(MSG);
    expect(ally((d) => ((shipOf(d)['guns'] as Rec[])[1]!['pt_sink_chance'] = 0.1))).toThrow(MSG);
    expect(ally((d) => delete (shipOf(d)['guns'] as Rec[])[0]!['dispersion_m'])).toThrow(MSG);
  });
});

describe('V-A6（値の範囲）', () => {
  const set = (k: string, v: unknown) => (d: GameData): void => {
    blockOf(d)[k] = v;
  };
  it('艇首・扇・見張りの距離の順・気づき方・秒・沈み・fast_kt の帯。境の内は通る', () => {
    expect(ally((d) => (blockOf(d)['station'] = { x_m: 3620, y_m: 2380, heading_deg: 360 }))).toThrow(/station\.heading_deg は 0 以上 360 未満（360）/);
    for (const arc of [[180, 50], [50, 50], [-1, 180], [50, 361]]) expect(ally(set('watch_arc_deg', arc)), JSON.stringify(arc)).toThrow(/watch_arc_deg は 0 ≤ 始め < 終わり ≤ 360/);
    expect(ally(set('lookout_slow_m', 0))).toThrow(/0 < lookout_slow_m ≤ lookout_fast_m ≤ 探照灯の range_m（0・800・1500 m）/);
    expect(ally(set('lookout_slow_m', 801))).toThrow(/（801・800・1500 m）/);
    expect(ally(set('lookout_fast_m', 1501))).toThrow(/（350・1501・1500 m）/);
    expect(ally(set('spot_rate_slow_per_s', 0))).toThrow(/spot_rate_slow_per_s は 0 より大きく 5 以下（0）/);
    expect(ally(set('spot_rate_fast_per_s', 5.01))).toThrow(/spot_rate_fast_per_s は 0 より大きく 5 以下（5\.01）/);
    expect(ally(set('light_react_s', -0.1))).toThrow(/light_react_s は 0〜5 秒（-0\.1）/);
    expect(ally(set('chase_fire_s', 5.1))).toThrow(/chase_fire_s は 0〜5 秒（5\.1）/);
    expect(ally(set('fast_kt', 8))).toThrow(/米PT の哨戒の速さ < fast_kt ≤ 航過の速さ（8・8・25 kt/);
    expect(ally(set('fast_kt', 25.5))).toThrow(/（8・25\.5・25 kt/);
    expect(ally((d) => ((shipOf(d)['guns'] as Rec[])[0]!['pt_sink_chance'] = 1.2))).toThrow(/ijn_destroyer_mutsuki の main_120mm\.pt_sink_chance は 0〜1（1\.2）/);
    // 境の内（lookout_slow_m は V-A3 の上限 364 まで・chase_fire_s 0・light_react_s 0・fast_kt 25。light_react_s の 5 は V-A3 が止める）
    for (const [k, v] of [['lookout_slow_m', 364], ['chase_fire_s', 0], ['light_react_s', 0], ['fast_kt', 25], ['spot_rate_fast_per_s', 5]] as const) expect(ally(set(k, v)), k).not.toThrow();
  });
  it('例外の文はみな「jp_04.v0_1_prototype.ally_destroyer: …（docs/02 §6.11）」', () => {
    try {
      ally(set('fast_kt', 8))();
      throw new Error('通った');
    } catch (e) {
      expect(String((e as Error).message)).toMatch(HEAD);
      expect(String((e as Error).message)).toMatch(TAIL);
    }
  });
});

describe('V-A8（置き場）と Boot の V-A7・1 任務だけ', () => {
  it('ship_id は allies にある・guard_legs は線の添字（ノーマル 0〜1・ハードは足した 2 も）', () => {
    expect(ally((d) => (missionOf(d, 'jp_04')['allies'] = ['ijn_transport']))).toThrow(/ship_id（ijn_destroyer_mutsuki）が jp_04\.allies に無い/);
    expect(ally((d) => (blockOf(d)['guard_legs'] = [2]))).toThrow(/guard_legs の 2 は米PT の線の添字（0〜1。ハードは足した線も）/);
    // ハードの北東の線（添字 2）は在るが、扇の外に置いた線を見張らせると V-A2 が止める
    expect(ally((d) => (blockOf(d)['guard_legs'] = [1, 2]), true)).toThrow(/見張る線（guard_legs）の lookout_fast_m（800 m）の内の点は扇の内に 10° 以上（線 2・/);
  });
  it('揚陸の無い任務には置けない（jp_05 に block を写す）', () => {
    const d = clone();
    protoOf(d, 'jp_05')['ally_destroyer'] = blockOf(d);
    const m = getPrototypeMission(d, 'jp_05');
    const p = getPtParams(d, m, TS);
    expect(() => getAllyDestroyerParams(d, m, p, null)).toThrow(/^jp_05\.v0_1_prototype\.ally_destroyer: 停泊して揚陸する輸送船（v0_1_prototype\.landing）と米PT の隊（pt_boats）の任務だけ/);
    expect(() => validateAllyDestroyerMissions(d, TS, 12)).toThrow(/^jp_05\.v0_1_prototype\.ally_destroyer: (停泊して揚陸する|卯月の block は 1 任務だけ)/);
  });
  it('Boot: data のままなら通り最初の任務のノーマルの値を返す。探照灯の角が絵の角と違えば V-A7、block が 2 任務にあれば止まる', () => {
    const v = validateAllyDestroyerMissions(gameData, TS, 12)!;
    expect(v).toEqual(buildWorldSetup(gameData, 'jp_04').allyDestroyer);
    expect(() => validateAllyDestroyerMissions(gameData, TS, 10)).toThrow(/^jp_04\.v0_1_prototype\.ally_destroyer: ijn_destroyer_mutsuki の searchlight\.cone_deg（12°）は探照灯の絵の角（10°。Boot が us_02 の敵の駆逐艦から 1 枚作る）と同じ（V-A7）/);
    const d = clone();
    const copy = JSON.parse(JSON.stringify(missionOf(d, 'jp_04'))) as Rec;
    copy['id'] = 'jp_04b';
    (d.missionsSeed.missions as unknown as Rec[]).push(copy);
    expect(() => validateAllyDestroyerMissions(d, TS, 12)).toThrow(/^jp_04b\.v0_1_prototype\.ally_destroyer: 卯月の block は 1 任務だけ（jp_04 にもある。海の上の扇の絵は 1 枚。V-A8）/);
  });
});

describe('V-A1（置く場所）', () => {
  it('海域の縁・泊地・浜の線・帰投の輪の縁・自艇の出発点', () => {
    expect(ally(at(150, 1000))).toThrow(/station（150, 1000）は海域の縁から 200 m（米PT の edge_margin_m）以上内/);
    expect(ally(at(3100, 2600))).toThrow(/station は泊地から 300 m 以上（189 m）/);
    expect(ally(at(4500, 2795))).toThrow(/station は浜の線（y 2988）から 200 m 以上沖（193 m）/);
    expect(ally(at(1500, 2400))).toThrow(/station は帰投の輪の縁から 300 m 以上外（66 m）/);
    expect(ally(at(2100, 2550))).toThrow(/station は自艇の出発点から 300 m 以上（269 m）/);
  });
});

describe('V-A2〜V-A5（今夜の南北のずれ込み。LD6: 斉射の外の魚雷と狙いの誤差を入れる）', () => {
  it('V-A2: 見張る線が扇の端に寄る・走る PT が扇に入らない・見張らない線が扇に入る', () => {
    expect(ally((d) => (blockOf(d)['watch_arc_deg'] = [50, 175]))).toThrow(/watch_arc_deg（50〜175°）: 見張る線（guard_legs）の lookout_fast_m（800 m）の内の点は扇の内に 10° 以上（線 1・南北 \+\d+ m で \d\.\d°。V-A2）/);
    expect(ally((d) => (blockOf(d)['lookout_fast_m'] = 400))).toThrow(/見張る線の気づかれていない斉射の点より前に lookout_fast_m（400 m）の内で扇の内に 10° 以上の部分が要る（線 1・南北 .* 0 m＝走る PT が扇に入らない。V-A2）/);
    expect(ally((d) => (blockOf(d)['watch_arc_deg'] = [0, 180]), true)).toThrow(/見張らない線の lookout_fast_m（800 m）の内の点は扇の外に 10° 以上（線 2・.*＝自艇の仕事の PT を卯月が見つける。V-A2）/);
    expect(ally((d) => (blockOf(d)['watch_arc_deg'] = [0, 180]), false)).not.toThrow(); // ノーマルの北の線は西北西で扇の外に 88°
  });
  it('V-A3: lookout_slow_m は東の PT の斉射の点まで − 点灯と反応の 51 m（364 m）以下', () => {
    expect(ally((d) => (blockOf(d)['lookout_slow_m'] = 365))).toThrow(/lookout_slow_m（365 m）は、見張る線の気づかれていない斉射の点（とその前）から station まで − 点灯と反応の 51 m（on_delay_s \+ light_react_s の間に哨戒の速さで進む m）の 364 m 以下（線 1・南北 −100 m で＝忍び寄る PT はその斉射の前に照らされない。V-A3）/);
    // 反応を延ばすと進む m が増えて上限が下がる（1.5 秒で 62 m・上限 354 m は通る、2.5 秒で 82 m・上限 334 m は止まる）
    expect(ally((d) => (blockOf(d)['light_react_s'] = 1.5))).not.toThrow();
    expect(ally((d) => (blockOf(d)['light_react_s'] = 2.5))).toThrow(/点灯と反応の 82 m（on_delay_s \+ light_react_s の間に哨戒の速さで進む m）の 334 m 以下/);
  });
  it('V-A4: 設計 C の (3400, 2700) は斉射の道から 29 m（V-A5 も −20.59° で通らない）', () => {
    expect(ally(at(3400, 2700))).toThrow(/station は気づかれていない斉射の道（斉射の点 → 泊地）から 120 m 以上（線 1・南北 −100 m で 29 m。V-A4）/);
    const { pt, g } = geom(false);
    expect(allyStationMargins(pt, { ...g, x: 3400, y: 2700 }).slack.value).toBeCloseTo(-20.59, 2);
  });
  it('V-A5: 前の案 D1 (3450, 2580) は斉射の外の魚雷 8° を入れると −6.08°（入れなければ +1.92° で通る）。ハードも同じ所で止まる', () => {
    for (const hard of [false, true]) expect(ally(at(3450, 2580), hard)).toThrow(/狙いの誤差 aim_error_deg（10°）・斉射の外の魚雷（salvo_spacing_deg × \(salvo_count − 1\) \/ 2 = 8°）の和以上（線 1・南北 −100 m で 余裕 −6\.08°。V-A5）/);
    const { pt, g } = geom(false);
    expect(allyStationMargins(pt, { ...g, x: 3450, y: 2580 }).slack.value).toBeCloseTo(-6.08, 2);
    expect(allyStationMargins(pt, { ...g, x: 3450, y: 2580, spreadDeg: 0 }).slack.value).toBeCloseTo(1.92, 2);
  });
  it('今夜の揺らぎ: spec の S4 の候補 (3500, 2540) は揺らぎ 0 なら V-A5 が +2.81° で通り、±100 m では −1.66°（北東の線）で止まる', () => {
    const { pt, g } = geom(true);
    expect(allyStationMargins(pt, { ...g, x: 3500, y: 2540, jitterYM: 0 }).slack.value).toBeCloseTo(2.81, 2);
    const w = allyStationMargins(pt, { ...g, x: 3500, y: 2540 }).slack;
    expect([Math.round(w.value * 100) / 100, w.leg, w.dy]).toEqual([-1.66, 2, 100]);
    expect(ally((d) => at(3500, 2540)(d), true)).toThrow(/（線 2・南北 \+100 m で 余裕 −1\.66°。V-A5）/);
    expect(ally((d) => { at(3500, 2540)(d); ((protoOf(d, 'jp_04')['night'] as Rec)['enemy_jitter'] as Rec)['y_m'] = 0; }, true)).not.toThrow();
  });
  it('今夜の揺らぎ: 東の線（y 2790）は南へ +10 m より先は縁の余白（y 2800）へ押し戻される＝+10〜+100 m の扇の余裕は同じ。両端の ±100 m を測る（刻み 5 m 以下）', () => {
    const { pt, g } = geom(false);
    const full = allyStationMargins(pt, g).guardIn;
    const ten = allyStationMargins(pt, { ...g, jitterYM: 10, stepM: 1 }).guardIn;
    expect([full.leg, full.dy]).toEqual([1, 10]);
    expect(ten.value).toBe(full.value);
    expect(allyStationMargins(pt, { ...g, jitterYM: 0 }).guardIn.value).toBeGreaterThan(full.value);
    expect(allyStationMargins(pt, g).cap.dy).toBe(-100);
    expect(ALLY_CHECK_STEP_M).toBeLessThanOrEqual(5);
  });
  it('扇の余裕（allyArcMarginDeg）: 内は端までの近い方、外は近い端までの角を負に（360 を跨いで測る）', () => {
    expect([allyArcMarginDeg(60, 50, 180), allyArcMarginDeg(175, 50, 180), allyArcMarginDeg(40, 50, 180), allyArcMarginDeg(350, 50, 180), allyArcMarginDeg(200, 50, 180)]).toEqual([10, 5, -10, -60, -20]);
  });
});

describe('WorldSetup.allyDestroyer と ?debug&noally（allyOff）', () => {
  it('jp_04 だけ（ノーマル・ハード）。allyOff で鍵ごと出ない（揚陸は残る）・他の任務の setup part は {}', () => {
    for (const hard of [false, true]) {
      expect('allyDestroyer' in buildWorldSetup(gameData, 'jp_04', { hard })).toBe(true);
      expect('allyDestroyer' in buildWorldSetup(gameData, 'jp_04', { hard, allyOff: true })).toBe(false);
      expect('landing' in buildWorldSetup(gameData, 'jp_04', { hard, allyOff: true })).toBe(true);
    }
    for (const id of ['us_01', 'us_02', 'us_03', 'jp_01', 'jp_02', 'jp_05', 'jp_06']) {
      const m = getPrototypeMission(gameData, id);
      expect(allyDestroyerSetupPart(gameData, m, getPtParams(gameData, m, TS), null, {}), id).toEqual({});
    }
  });
  it('allyOff の jp_04 の setup は卯月の鍵を除けば卯月ありの setup と同じ（卯月の組み立ては乱数を引かない）', () => {
    for (const hard of [false, true]) {
      const on = buildWorldSetup(gameData, 'jp_04', { hard, sortie: directSortie('jp_04', 3, 'none', hard, false) });
      const off = buildWorldSetup(gameData, 'jp_04', { hard, allyOff: true, sortie: directSortie('jp_04', 3, 'none', hard, false) });
      const { allyDestroyer: _a, ...rest } = on;
      expect(JSON.stringify(off)).toBe(JSON.stringify(rest));
    }
  });
  it('?debug&noally: game-config の DEBUG_ALLY_OFF（noally）を debug-setup が SetupOptions.allyOff に渡す', () => {
    const src = (p: string): string => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
    expect(src('config/game-config.ts')).toContain("export const DEBUG_ALLY_OFF = DEBUG_ENABLED && new URLSearchParams(window.location.search).has('noally');");
    expect(src('config/debug-setup.ts')).toContain('allyOff: DEBUG_ALLY_OFF,');
    expect(src('scenes/boot-scene.ts')).toContain('validateAllyDestroyerMissions(gameData, gameData.hitRateModel.world.time_scale, enemy.searchlight ? enemy.searchlight.cone_deg : 0);');
  });
});
