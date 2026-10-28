// 揚陸の block の形と値（v0.6.9 S1。core/landing-data の V3 の形・LandingParams、core/landing-geometry の線の幾何）。任務を跨ぐ検査は tests/landing-mission-data。
import { describe, expect, it } from 'vitest';
import { gameData, getPrototypeMission } from '../src/config/game-data';
import { getPtParams } from '../src/config/pt-mission-data';
import { LANDING_ANCHOR_KEYS, LANDING_HITS_MAX, LANDING_KEYS, LANDING_UNLOAD_MAX_S, isLandingShipRecord, joinDirsJa, landingParamsFromData, readLandingBlock, type LandingBlock } from '../src/core/landing-data';
import { LANDING_JITTER_STEPS, farLegClearM, legEndBowErrDeg, legEndRangeM, outsideDiskDist2 } from '../src/core/landing-geometry';

type Rec = Record<string, unknown>;
const proto = (gameData.missionsSeed.missions as unknown as Rec[]).find((m) => m['id'] === 'jp_04')!['v0_1_prototype'] as Rec;
const RAW = proto['landing'] as Rec;
const LABEL = 'jp_04.v0_1_prototype.landing';
const read = (over: Rec): (() => LandingBlock) => () => readLandingBlock({ ...RAW, ...over }, LABEL);
const transport = (gameData.enemies.enemies as unknown as Rec[]).find((e) => e['id'] === 'ijn_transport')!;

describe('v0_1_prototype.landing の形（V3 の形。core/landing-data）', () => {
  it('jp_04 の値（spec §3.2）: 輸送船・泊地 (3000, 2760) 艇首 135°・揚陸 140 秒・2 本で沈む・見張り 1,800 m・揚陸地点', () => {
    expect(Object.keys(RAW)).toEqual([...LANDING_KEYS]);
    expect(Object.keys(RAW['anchor'] as Rec)).toEqual([...LANDING_ANCHOR_KEYS]);
    const b = readLandingBlock(RAW, LABEL);
    expect([b.ship_id, b.label_ja, b.anchor, b.unload_s, b.torpedo_hits_to_sink, b.lookout_m, b.mark_label_ja]).toEqual(['ijn_transport', '輸送船', { x_m: 3000, y_m: 2760, heading_deg: 135 }, 140, 2, 1800, '揚陸地点']);
    expect([LANDING_UNLOAD_MAX_S, LANDING_HITS_MAX]).toEqual([255, 3]);
  });
  it('鍵: 知らない鍵・欠けは名前を出して例外。anchor はちょうど 3 鍵の数・艇首は 0〜360 未満', () => {
    expect(read({ lookout: 1 })).toThrow(/^jp_04\.v0_1_prototype\.landing: 鍵はちょうど ship_id・label_ja・anchor・unload_s・torpedo_hits_to_sink・lookout_m・mark_label_ja・source（知らない鍵 lookout・欠け なし）（docs\/02 §6\.11）$/);
    const { mark_label_ja: _m, ...noMark } = RAW;
    expect(() => readLandingBlock(noMark, LABEL)).toThrow(/知らない鍵 なし・欠け mark_label_ja/);
    expect(() => readLandingBlock(null, LABEL)).toThrow(/landing: object でない/);
    expect(() => readLandingBlock([RAW], LABEL)).toThrow(/landing: object でない/);
    for (const a of [{ x_m: 1, y_m: 2 }, { x_m: 1, y_m: 2, heading_deg: 0, z: 1 }, { x_m: '1', y_m: 2, heading_deg: 0 }, null]) expect(read({ anchor: a }), JSON.stringify(a)).toThrow(/anchor はちょうど x_m・y_m・heading_deg の数/);
    for (const h of [-1, 360]) expect(read({ anchor: { x_m: 3000, y_m: 2760, heading_deg: h } }), String(h)).toThrow(/anchor\.heading_deg は 0 以上 360 未満/);
    expect(read({ anchor: { x_m: 3000, y_m: 2760, heading_deg: 0 } })).not.toThrow();
  });
  it('値: unload_s は 1〜255 の整数・torpedo_hits_to_sink は 1〜3 の整数・lookout_m は正・文字は空でない', () => {
    for (const v of [0, 256, 1.5, '140']) expect(read({ unload_s: v }), String(v)).toThrow(/unload_s は 1〜255 の整数/);
    for (const v of [1, 255]) expect(read({ unload_s: v })).not.toThrow();
    for (const v of [0, 4, 1.5]) expect(read({ torpedo_hits_to_sink: v }), String(v)).toThrow(/torpedo_hits_to_sink は 1〜3 の整数/);
    for (const v of [1, 3]) expect(read({ torpedo_hits_to_sink: v })).not.toThrow();
    for (const v of [0, -1, NaN]) expect(read({ lookout_m: v }), String(v)).toThrow(/lookout_m は正の数/);
    for (const k of ['ship_id', 'label_ja', 'mark_label_ja', 'source']) expect(read({ [k]: '' }), k).toThrow(new RegExp(`${k} は空でない文字列`));
  });
  it('輸送船の記録の形（length_m・beam_m 正、hull_circles 2 以上の整数）と LandingParams（当たりは記録 × 倍率、通り過ぎの半径は destroyer-setup の式、方角は線の順で重なりは 1 つ）', () => {
    expect(isLandingShipRecord(transport)).toBe(true);
    for (const over of [{ length_m: 0 }, { beam_m: -1 }, { hull_circles: 1 }, { hull_circles: 2.5 }]) expect(isLandingShipRecord({ ...transport, ...over }), JSON.stringify(over)).toBe(false);
    const b = readLandingBlock(RAW, LABEL);
    const p = landingParamsFromData(b, transport as never, { hitScale: 2, hurriedM: 1300, launchM: 900, runDirJa: ['北', '東'] });
    expect(p).toEqual({
      shipId: 'ijn_transport', x: 3000, y: 2760, headingDeg: 135, lengthM: 120, beamM: 16, hitLenM: 240, hitBeamM: 32, circles: 5, passRadius2: (120 + 32) ** 2,
      hitsToSink: 2, unloadS: 140, lookoutM: 1800, lookout2: 1800 ** 2, hurried2: 1300 ** 2, launchM: 900, labelJa: '輸送船', markLabelJa: '揚陸地点', fromDirsJa: '北と東', runDirJa: ['北', '東'],
    });
    expect(landingParamsFromData(b, transport as never, { hitScale: 1, hurriedM: 0, launchM: 900, runDirJa: ['北'] })).toMatchObject({ hitLenM: 120, hitBeamM: 16, hurried2: 0, fromDirsJa: '北' });
    expect([joinDirsJa(['北', '東', '北東']), joinDirsJa(['北', '北']), joinDirsJa(['東', '北', '東']), joinDirsJa([])]).toEqual(['北・東・北東', '北', '東と北', '']);
  });
});

describe('線の幾何（core/landing-geometry。V7・V9・V13）', () => {
  const p = getPtParams(gameData, getPrototypeMission(gameData, 'jp_04', true), gameData.hitRateModel.world.time_scale)!;
  it('outsideDiskDist2: 円を横切る線分・円に入らない線分・円の中の線分・円から出る線分・長さ 0', () => {
    // 円 (0,0) r 10、線分 (−20,0)–(20,0): 外の部分は [−20,−10] と [10,20]。点 (0,5) から最短は (±10,0) まで √125
    expect(outsideDiskDist2(-20, 0, 20, 0, 0, 0, 10, 0, 5)).toBeCloseTo(125, 9);
    // 円に入らない線分 (−20,20)–(20,20): 普通の線分の距離（点 (0,5) から 15）
    expect(outsideDiskDist2(-20, 20, 20, 20, 0, 0, 10, 0, 5)).toBeCloseTo(225, 9);
    // 線分がすべて円の中: Infinity
    expect(outsideDiskDist2(-5, 0, 5, 0, 0, 0, 10, 0, 50)).toBe(Infinity);
    // 円の中から外へ出る線分 (0,0)–(30,0): 外の部分は [10,30]。点 (−5,0) から 15
    expect(outsideDiskDist2(0, 0, 30, 0, 0, 0, 10, -5, 0)).toBeCloseTo(225, 9);
    // 長さ 0: 外なら点との距離、中なら Infinity
    expect(outsideDiskDist2(20, 0, 20, 0, 0, 0, 10, 20, 3)).toBe(9);
    expect(outsideDiskDist2(5, 0, 5, 0, 0, 0, 10, 0, 0)).toBe(Infinity);
  });
  it('jp_04（ハードの 3 本）: 線の終わり 514〜718 m・方位の差 2.0°・5.7°・7.2°（終わりで最大）・V13 の最短 1,754・2,299・2,117 m（刻み 20 の標本と細かい標本で同じ）', () => {
    expect(LANDING_JITTER_STEPS).toBe(20);
    const r = [0, 1, 2].map((i) => legEndRangeM(p, i, 100, 3000, 2760).map(Math.round));
    expect(r).toEqual([[514, 663], [701, 703], [576, 718]]);
    expect([0, 1, 2].map((i) => Math.round(legEndBowErrDeg(p, i, 100, 3000, 2760) * 10) / 10)).toEqual([2, 5.7, 7.2]);
    const clear = [0, 1, 2].map((i) => farLegClearM(p, i, 100, 3000, 2760, 1300, 2000, 2800));
    expect(clear.map(Math.round)).toEqual([1754, 2299, 2117]);
    // 刻みを細かくしても最短は 1 m と変わらない（両端と押し戻しの角が標本に入っている）
    for (let i = 0; i < 3; i++) expect(Math.abs(farLegClearM(p, i, 100, 3000, 2760, 1300, 2000, 2800, 400) - clear[i]!), String(i)).toBeLessThan(1);
    // 押し戻し: 北の線（y 250）を北へ 100 m ずらすと縁の余白 200 m で 50 m だけ戻る＝終わりは y 2,100（泊地から遠い側の端 663 m）
    expect(Math.hypot(3060 - 3000, 2100 - 2760)).toBeCloseTo(663, 0);
  });
});
