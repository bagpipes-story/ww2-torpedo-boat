// v0.8.0 S0（spec-v0800 §3.3）: レーダーの data と起動時の検査（core/radar-data の形と V-R4・config/radar-mission-data の V-R1〜V-R5）。
// 既定の data が通り、壊した data は鍵を名指す日本語の文（V-Rn 付き）で止まる。レーダーの無い任務は鍵ごと出ない（setup の snapshot を変えない）。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gameData, type GameData } from '../src/config/game-data';
import { RADAR_EXCLUDED_KEYS, getRadarData, getRadarParams, radarSetupPart, validateRadarMissions } from '../src/config/radar-mission-data';
import { getPrototypeMission } from '../src/config/mission-data';
import { RADAR_FITS, RADAR_SWEEP_MAX_S, RADAR_SWEEP_MIN_S, readRadarBlock, readRadarData, readRadarModel } from '../src/core/radar-data';
import { directSortie } from '../src/core/sortie';
import { buildWorldSetup } from '../src/systems/world-setup';

type Rec = Record<string, unknown>;
const clone = (): GameData => JSON.parse(JSON.stringify(gameData)) as GameData;
const missionOf = (d: GameData, id: string): Rec => (d.missionsSeed.missions as unknown as Rec[]).find((m) => m['id'] === id)!;
const protoOf = (d: GameData, id: string): Rec => missionOf(d, id)['v0_1_prototype'] as Rec;
const radarOf = (d: GameData): Rec => (d.hitRateModel as unknown as Rec)['radar'] as Rec;
const modelOf = (d: GameData, id: string): Rec => (radarOf(d)['models'] as Rec)[id] as Rec;
const boatOf = (d: GameData, id: string): Rec => (d.boats.boats as unknown as Rec[]).find((b) => b['id'] === id)!;
/** data の写しを f で壊して us_04 を組む */
const build = (f: (d: GameData) => void, id = 'us_04'): (() => unknown) => {
  const d = clone();
  f(d);
  return () => getRadarParams(d, getPrototypeMission(d, id));
};
const PROTO_IDS = (gameData.missionsSeed.missions as unknown as Rec[]).filter((m) => m['v0_1_prototype']).map((m) => m['id'] as string);

describe('hit_rate_model.json の radar（core/radar-data の形と V-R4）', () => {
  it('既定: 型は so_early（艦 4,000・小さい艇 1,200・掃引 3 秒・陸の反射 400・丸め 50）と so_late（6,000・1,800・2・300・25）。機は映さない', () => {
    const r = getRadarData(gameData);
    expect(r.aircraft).toBe(false);
    expect(Object.keys(r.models)).toEqual(['so_early', 'so_late']);
    const pick = (m: Rec): unknown[] => ['ship_range_m', 'small_range_m', 'sweep_s', 'land_clutter_m', 'position_step_m'].map((k) => m[k]);
    expect(pick(modelOf(gameData, 'so_early'))).toEqual([4000, 1200, 3, 400, 50]);
    expect(pick(modelOf(gameData, 'so_late'))).toEqual([6000, 1800, 2, 300, 25]);
    for (const id of ['so_early', 'so_late']) expect(String(modelOf(gameData, id)['source'])).toMatch(/^historical \(.*\) \/ design \(v0\.8\.0 S0。/);
    expect(String(radarOf(gameData)['source'])).toContain('design (v0.8.0 S0。');
    expect([RADAR_FITS, RADAR_SWEEP_MIN_S, RADAR_SWEEP_MAX_S]).toEqual([['leader', 'own'], 1, 5]);
  });
  it('型（V-R4）: 知らない鍵・数でない・射程が 0・小さい艇が艦より遠い・掃引が 1〜5 秒の外・陸の反射が負・丸めが 1 m 未満・source が空は鍵を名指す例外', () => {
    const base = (): Rec => ({ ...modelOf(gameData, 'so_early') });
    const cases: [(m: Rec) => void, RegExp][] = [
      [(m) => (m['extra'] = 1), /鍵はちょうど .*知らない鍵 extra/],
      [(m) => delete m['sweep_s'], /欠け sweep_s/],
      [(m) => (m['ship_range_m'] = '4000'), /ship_range_m は数/],
      [(m) => (m['ship_range_m'] = 0), /ship_range_m は正/],
      [(m) => (m['small_range_m'] = 4001), /small_range_m は 0 以上で ship_range_m（4000）以下/],
      [(m) => (m['small_range_m'] = -1), /small_range_m は 0 以上/],
      [(m) => (m['sweep_s'] = 0.5), /sweep_s は 1〜5 秒（0.5）/],
      [(m) => (m['sweep_s'] = 6), /sweep_s は 1〜5 秒（6）/],
      [(m) => (m['land_clutter_m'] = -1), /land_clutter_m は 0 以上/],
      [(m) => (m['position_step_m'] = 0.5), /position_step_m は 1 m 以上/],
      [(m) => (m['source'] = ' '), /source は空でない/],
    ];
    for (const [f, re] of cases) {
      const m = base();
      f(m);
      expect(() => readRadarModel(m, 'テスト'), String(re)).toThrow(re);
      expect(() => readRadarModel(m, 'テスト'), String(re)).toThrow(/V-R4/);
    }
    expect(readRadarModel({ ...base(), small_range_m: 0, land_clutter_m: 0, sweep_s: 5, position_step_m: 1 }, 'テスト').small_range_m).toBe(0); // 境の値は通る
  });
  it('radar の data: 鍵はちょうど note・aircraft・models・source・aircraft は false だけ・models は空でない・型ごとに V-R4（label は型の鍵まで）', () => {
    const base = (): Rec => JSON.parse(JSON.stringify(radarOf(gameData))) as Rec;
    expect(() => readRadarData({ ...base(), aircraft: true }, 'x')).toThrow(/aircraft は false（機は映さない＝D-R3/);
    expect(() => readRadarData({ ...base(), models: {} }, 'x')).toThrow(/models は空でない object/);
    const noNote = base();
    delete noNote['note'];
    expect(() => readRadarData(noNote, 'x')).toThrow(/欠け note/);
    const badModel = base();
    ((badModel['models'] as Rec)['so_late'] as Rec)['sweep_s'] = 9;
    expect(() => readRadarData(badModel, 'hit_rate_model.json の radar')).toThrow(/hit_rate_model\.json の radar\.models\.so_late: sweep_s は 1〜5 秒（9）（V-R4/);
    expect(() => validateRadarMissions(clone())).not.toThrow();
    const d = clone();
    (radarOf(d)['models'] as Rec)['so_early'] = 'x';
    expect(() => validateRadarMissions(d)).toThrow(/radar\.models\.so_early: object でない/);
  });
  it('任務の block の形（V-R1 の形）: 鍵はちょうど model・fit・source、fit は leader か own、model・source は空でない', () => {
    const ok = { model: 'so_early', fit: 'leader', source: 'design (テスト)' };
    expect(readRadarBlock(ok, 'x')).toEqual(ok);
    expect(() => readRadarBlock({ ...ok, fit: 'all' }, 'x')).toThrow(/fit は leader・own のどれか（all）（V-R1/);
    expect(() => readRadarBlock({ ...ok, model: '' }, 'x')).toThrow(/model は空でない/);
    expect(() => readRadarBlock({ ...ok, range_m: 1 }, 'x')).toThrow(/知らない鍵 range_m/);
    expect(() => readRadarBlock('so_early', 'x')).toThrow(/object でない/);
  });
});

describe('任務の radar（config/radar-mission-data の V-R1〜V-R5）', () => {
  it('us_04（ノーマル・ハード）: 初期の SO を分隊の先頭の艇として（fit leader）。値の鍵は射程・掃引・陸の反射・丸め・機だけ（種類・針路・速さ・発見の欄は無い）', () => {
    for (const hard of [false, true]) {
      const p = getRadarParams(gameData, getPrototypeMission(gameData, 'us_04', hard))!;
      expect(p).toEqual({ model: 'so_early', fit: 'leader', shipRangeM: 4000, shipRange2: 16e6, smallRangeM: 1200, smallRange2: 1.44e6, sweepS: 3, landClutterM: 400, positionStepM: 50, aircraft: false });
    }
    expect(protoOf(gameData, 'us_04')['radar']).toEqual({ model: 'so_early', fit: 'leader', source: expect.stringContaining('分隊の先頭の艇だけ') as unknown as string });
    expect(validateRadarMissions(gameData)?.model).toBe('so_early');
  });
  it('ほかの 9 任務は null・radarSetupPart は {}（setup に radar の鍵が出ない）。radarOff なら us_04 も {}', () => {
    for (const id of PROTO_IDS.filter((x) => x !== 'us_04')) {
      for (const hard of [false, true]) {
        expect(getRadarParams(gameData, getPrototypeMission(gameData, id, hard)), id).toBeNull();
        const s = buildWorldSetup(gameData, id, { sortie: directSortie(id, 3, 'none', hard, false), hard });
        expect('radar' in s, id).toBe(false);
        expect(JSON.stringify(s).includes('"radar"'), id).toBe(false);
      }
    }
    expect(radarSetupPart(gameData, getPrototypeMission(gameData, 'us_04'), { radarOff: true })).toEqual({});
    expect('radar' in buildWorldSetup(gameData, 'us_04', { radarOff: true })).toBe(false);
    expect(buildWorldSetup(gameData, 'us_04').radar?.shipRangeM).toBe(4000);
  });
  it('V-R1: model が hit_rate_model.json の radar.models に無い・fit が違う', () => {
    expect(build((d) => ((protoOf(d, 'us_04')['radar'] as Rec)['model'] = 'so_mid'))).toThrow(/us_04\.v0_1_prototype\.radar: model（so_mid）が hit_rate_model\.json の radar\.models（so_early・so_late）に無い（V-R1/);
    expect(build((d) => ((protoOf(d, 'us_04')['radar'] as Rec)['fit'] = 'squadron'))).toThrow(/us_04\.v0_1_prototype\.radar: fit は leader・own/);
    expect(build((d) => ((protoOf(d, 'us_04')['radar'] as Rec)['model'] = 'toString'))).toThrow(/model（toString）が hit_rate_model\.json の radar\.models（so_early・so_late）に無い（V-R1/); // object の継いだ鍵は型でない
  });
  it('V-R2: 自艇の radar（射程が正・型の名・年月が任務の日付以前・書式）', () => {
    const r = (d: GameData): Rec => boatOf(d, 'us_elco80')['radar'] as Rec;
    expect(build((d) => (r(d)['range_m'] = 0))).toThrow(/boats\.json の us_elco80\.radar\.range_m は正（0。レーダーを積まない艇）（V-R2/);
    expect(build((d) => delete r(d)['type'])).toThrow(/us_elco80\.radar\.type（型の名）が無い（V-R2/);
    expect(build((d) => (r(d)['available_from'] = '1943-09'))).toThrow(/available_from（1943-09）は任務の date（1943-08-01）以前（史実の広がり）（V-R2/);
    expect(build((d) => (r(d)['available_from'] = '1943/07'))).toThrow(/available_from は YYYY-MM（1943\/07）（V-R2/);
    expect(build((d) => (missionOf(d, 'us_04')['date'] = '1943-8-1'))).toThrow(/us_04\.date は YYYY-MM-DD（1943-8-1）（V-R2/);
    expect(build((d) => (r(d)['available_from'] = '1943-08'))).not.toThrow(); // 同じ月は通る
    expect(String(r(gameData)['source'])).toContain('1943-01 → 1943-07');
    expect([r(gameData)['available_from'], r(gameData)['range_m'], r(gameData)['type']]).toEqual(['1943-07', 31000, 'SO']);
    expect(['available_from', 'range_m', 'type'].map((k) => (boatOf(gameData, 'us_higgins78')['radar'] as Rec)[k])).toEqual(['1943-07', 31000, 'SO']);
  });
  it('V-R3: 艦の射程は任務の月の自艇の視程（新月 900 m）より遠く、海域の対角（7,211 m）以下', () => {
    expect(build((d) => Object.assign(modelOf(d, 'so_early'), { ship_range_m: 900, small_range_m: 500 }))).toThrow(/radar\.models\.so_early\.ship_range_m（900）は任務の月（dark）の自艇の視程（900 m）より遠い（V-R3/);
    expect(build((d) => Object.assign(modelOf(d, 'so_early'), { ship_range_m: 7300 }))).toThrow(/radar\.models\.so_early\.ship_range_m（7300）は海域の対角（7211\.1 m）以下（V-R3/);
    expect(build((d) => Object.assign(modelOf(d, 'so_early'), { ship_range_m: 901, small_range_m: 500 }))).not.toThrow();
  });
  it('V-R5: 艦艇のいない航空機だけの任務（夜の哨戒機 jp_02・空襲下の退避 jp_03）には置けない', () => {
    expect(RADAR_EXCLUDED_KEYS).toEqual(['patrol_air', 'evac']);
    const block = { model: 'so_late', fit: 'own', source: 'design (テスト)' };
    expect(build((d) => (protoOf(d, 'jp_02')['radar'] = block), 'jp_02')).toThrow(/jp_02\.v0_1_prototype\.radar: v0_1_prototype\.patrol_air と同居しない（艦艇のいない航空機だけの任務には置けない）（V-R5/);
    expect(build((d) => (protoOf(d, 'jp_03')['radar'] = block), 'jp_03')).toThrow(/jp_03\.v0_1_prototype\.radar: v0_1_prototype\.evac と同居しない（艦艇のいない航空機だけの任務には置けない）（V-R5/);
  });
  it('Boot は validateRadarMissions を空襲下の退避の検査の後に 1 回呼ぶ（ソースの pin）', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'scenes', 'boot-scene.ts'), 'utf8');
    expect(src.indexOf('validateRadarMissions(gameData);')).toBeGreaterThan(src.indexOf('validateEvacMissions(gameData);'));
  });
});
