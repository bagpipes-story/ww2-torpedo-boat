// v0.8.5 S0（spec-v0850 §4.2・§4.3）: 機雷原の任務の読み出しと data だけで決まる起動時の検査 V-X1・V-X3〜V-X5（config/minefield-mission-data）、
// 任務ごとの沿岸砲の値の形 V-U2（config/shore-guns-mission-data。us_07 の 210 mm・us_03 は risk_events の 75 mm のまま）と setup の鍵（minefield）。
// V-X2（置ける面積・ノーマルの数の 80% 以上が置ける）は置き方の組み立て（v0.8.5 S1 の core/minefield）を seed 1〜32 で回す S1 の tests。
import { describe, expect, it } from 'vitest';
import { gameData, getShoreBatteryParamsList, type GameData } from '../src/config/game-data';
import { getPrototypeMission } from '../src/config/mission-data';
import { MINEFIELD_KEYS, MINEFIELD_LANE_CORRY_M, MINEFIELD_MAX, MINE_PARAM_KEYS, getMinefieldParams, minefieldSetupPart, validateMinefieldMissions } from '../src/config/minefield-mission-data';
import { missionShoreBatteryRecord, validateShoreGunsMissions } from '../src/config/shore-guns-mission-data';
import { directSortie } from '../src/core/sortie';
import { buildWorldSetup } from '../src/systems/world-setup';

type Rec = Record<string, unknown>;
const clone = (): GameData => JSON.parse(JSON.stringify(gameData)) as GameData;
const missionOf = (d: GameData, id: string): Rec => (d.missionsSeed.missions as unknown as Rec[]).find((m) => m['id'] === id)!;
const protoOf = (d: GameData, id: string): Rec => missionOf(d, id)['v0_1_prototype'] as Rec;
const fieldOf = (d: GameData): Rec => protoOf(d, 'us_07')['minefield'] as Rec;
const mineOf = (d: GameData): Rec => (d.riskEvents.events as unknown as Rec[]).find((e) => e['id'] === 'mine')!['params'] as Rec;
const sbOf = (d: GameData): Rec => (protoOf(d, 'us_07')['shore_battery'] as Rec)['params'] as Rec;
const build = (f: (d: GameData) => void, hard = false): (() => unknown) => {
  const d = clone();
  f(d);
  return () => getMinefieldParams(d, getPrototypeMission(d, 'us_07', hard));
};
const guns = (f: (d: GameData) => void): (() => unknown) => {
  const d = clone();
  f(d);
  return () => missionShoreBatteryRecord(d, { id: 'us_07' });
};
const PROTO_IDS = (gameData.missionsSeed.missions as unknown as Rec[]).filter((m) => m['v0_1_prototype']).map((m) => m['id'] as string);

describe('既定の data（us_07。spec §3・§4.2・§4.3）', () => {
  it('4 区画に 24 個（ハード 32）・水路 4 本（幅 300 m。v0.8.5 S3 で出発 → フィッチを足し、S3b で帰投の輪を沖へ・フィッチ → コリーを北へ回した）・置かない余白 80 m。1 個は被害 60・火災 0.5・機関 0.5・見える 150 m・触れる 6 m', () => {
    const n = getMinefieldParams(gameData, getPrototypeMission(gameData, 'us_07'))!;
    const h = getMinefieldParams(gameData, getPrototypeMission(gameData, 'us_07', true))!;
    expect([n.fields.length, n.count, n.maxCount, h.count, h.maxCount, n.lanes.length, n.clearM]).toEqual([4, 24, 32, 32, 32, 4, 80]);
    expect(n.lanes).toEqual([{ x0: 5150, y0: 1850, x1: 3750, y1: 2000, widthM: 300 }, { x0: 3750, y0: 1300, x1: 3750, y1: 2000, widthM: 300 }, { x0: 3750, y0: 2000, x1: 3250, y1: 1850, widthM: 300 }, { x0: 3250, y0: 1850, x1: 2650, y1: 2350, widthM: 300 }]);
    expect(n.fields.map((f) => [f.x, f.y, f.w, f.h, f.normal, f.hardExtra])).toEqual([[1200, 1600, 1200, 900, 6, 2], [3140, 2240, 340, 340, 6, 2], [3480, 2270, 420, 190, 6, 2], [2900, 1400, 500, 220, 6, 2]]);
    expect(n.mine).toEqual({ damage: 60, fireChance: 0.5, engineDamageChance: 0.5, sightM: 150, sight2: 22500, contactM: 6 });
    expect(validateMinefieldMissions(gameData)?.count).toBe(24);
    expect([MINEFIELD_KEYS, MINE_PARAM_KEYS, MINEFIELD_MAX, MINEFIELD_LANE_CORRY_M]).toEqual([['fields', 'lanes', 'clear_m', 'source'], ['damage', 'fire_chance', 'engine_damage_chance', 'sight_m', 'contact_m', 'source'], 48, 400]);
  });
  it('setup の鍵: us_07 だけ minefield。ほかの任務は鍵ごと出ない', () => {
    for (const id of PROTO_IDS) {
      for (const hard of [false, true]) {
        const s = buildWorldSetup(gameData, id, { sortie: directSortie(id, 5, 'none', hard, false), hard });
        expect('minefield' in s, id).toBe(id === 'us_07');
        if (id !== 'us_07') expect(minefieldSetupPart(gameData, getPrototypeMission(gameData, id, hard)), id).toEqual({});
      }
    }
  });
  it('沿岸砲: us_07 は任務の 210 mm（3 門・10 秒に 1 発・射界 2,600 m・陸へ 600 m。ハードは x 1,300・2,400 の 2 つ目・3 つ目も同じ値＝v0.8.5 S3・S3b。散布 110 m は S3b）、us_03 は risk_events の 75 mm のまま（ハードの 2 門目も）', () => {
    const [b] = getShoreBatteryParamsList(gameData, getPrototypeMission(gameData, 'us_07'));
    expect([b!.x, b!.y, b!.gun.id, b!.gun.count, b!.gun.roundsPerMinPerGun, b!.gun.effectiveM, b!.gun.damage, b!.gun.dispersionM, b!.gun.splashRadiusM, b!.gun.shellSpeedMps, b!.baseDetectM, b!.arc2]).toEqual([1600, 4600, 'skoda_21cm', 3, 2, 2600, 34, 110, 10, 600, 6000, 6_760_000]);
    expect(getShoreBatteryParamsList(gameData, getPrototypeMission(gameData, 'us_07', true)).map((x) => [x.x, x.y, x.gun.id, x.gun.effectiveM])).toEqual([[1600, 4600, 'skoda_21cm', 2600], [1300, 4600, 'skoda_21cm', 2600], [2400, 4600, 'skoda_21cm', 2600]]);
    for (const hard of [false, true]) {
      const us03 = getShoreBatteryParamsList(gameData, getPrototypeMission(gameData, 'us_03', hard));
      expect(us03.map((x) => [x.x, x.y, x.gun.id, x.gun.effectiveM, x.baseDetectM])).toEqual([[4600, 2560, 'type41_75mm', 900, 1200], ...(hard ? [[2600, 2560, 'type41_75mm', 900, 1200]] : [])]);
    }
    expect(missionShoreBatteryRecord(gameData, { id: 'us_03' })).toBeNull();
    expect(validateShoreGunsMissions(gameData)?.gun.id).toBe('skoda_21cm');
  });
});

describe('起動時の検査（V-X1・V-X3〜V-X5・V-U2）', () => {
  it('V-X1: 鍵の閉じた集合・区画は海域の中の [x, y, 幅, 高さ, 数, 足す数]・ハードの合計 ≤ 48・水路は海域の中で幅は正', () => {
    expect(build((d) => (fieldOf(d)['mines'] = 1))).toThrow(/us_07\.v0_1_prototype\.minefield の鍵はちょうど fields・lanes・clear_m・source（.*mines）（V-X1・spec-v0850 §4\.2）/);
    expect(build((d) => (fieldOf(d)['fields'] = []))).toThrow(/minefield\.fields は空でない配列（V-X1/);
    expect(build((d) => ((fieldOf(d)['fields'] as unknown[])[1] = [3100, 2400, 1300, 900, 6]))).toThrow(/minefield\.fields\[1\] は \[x, y, 幅, 高さ, ノーマルの数, ハードで足す数\]/);
    expect(build((d) => ((fieldOf(d)['fields'] as unknown[])[1] = [3100, 2400, 1300, 900, -1, 2]))).toThrow(/minefield\.fields\[1\] は/);
    expect(build((d) => ((fieldOf(d)['fields'] as unknown[])[3] = [4700, 1700, 1400, 1200, 6, 2]))).toThrow(/minefield\.fields\[3\]（4700, 1700・1400 × 1200）は海域の中の正の大きさの矩形（V-X1/);
    expect(build((d) => ((fieldOf(d)['fields'] as unknown[])[0] = [1200, 1600, 1200, 900, 6, 19]))).toThrow(/minefield の数はノーマル 1 以上・ハードの合計 48 以下（24・49）（V-X1/);
    expect(build((d) => ((fieldOf(d)['fields'] as unknown[])[0] = [1200, 1600, 1200, 900, 6, 18]))).not.toThrow();
    expect(build((d) => ((fieldOf(d)['lanes'] as unknown[])[0] = [5400, 500, 4300, 1500, 0]))).toThrow(/minefield\.lanes\[0\] の端は海域の中・幅は正（V-X1/);
    expect(build((d) => ((fieldOf(d)['lanes'] as unknown[])[0] = [6400, 500, 4300, 1500, 300]))).toThrow(/minefield\.lanes\[0\] の端は海域の中/);
    expect(build((d) => (fieldOf(d)['clear_m'] = -1))).toThrow(/minefield\.clear_m は 0 以上/);
  });
  it('V-X3: mine.params は鍵の閉じた集合・sight_m ＞ contact_m ＞ 0・被害は自艇の HP（100）未満・確率は 0〜1', () => {
    expect(build((d) => (mineOf(d)['radius_m'] = 1))).toThrow(/risk_events\.json の mine\.params の鍵はちょうど damage・fire_chance・engine_damage_chance・sight_m・contact_m・source（V-X3/);
    expect(build((d) => (mineOf(d)['sight_m'] = 6))).toThrow(/mine\.params は sight_m（6）＞ contact_m（6）＞ 0（V-X3/);
    expect(build((d) => (mineOf(d)['contact_m'] = 0))).toThrow(/sight_m（150）＞ contact_m（0）＞ 0/);
    expect(build((d) => (mineOf(d)['damage'] = 100))).toThrow(/mine\.params\.damage（100）は 0 より大きく自艇（us_higgins78）の HP 100 未満（1 個では沈まない）（V-X3/);
    expect(build((d) => (mineOf(d)['damage'] = 99))).not.toThrow();
    expect(build((d) => (mineOf(d)['fire_chance'] = 1.5))).toThrow(/fire_chance・engine_damage_chance は 0〜1/);
  });
  it('V-X4: 水路が帰投の輪・フィッチの輪・コリーの 400 m の内をつなぐ', () => {
    expect(build((d) => ((fieldOf(d)['lanes'] as unknown[]).splice(3, 1)))).toThrow(/minefield\.lanes は帰投の輪からコリーの 400 m の内へつながらない（道が無い）（V-X4/);
    expect(build((d) => ((fieldOf(d)['lanes'] as unknown[]).splice(2, 1)))).toThrow(/minefield\.lanes は帰投の輪からコリーの 400 m の内へつながらない（道が無い）（V-X4/); // フィッチ → 曲がり角（v0.8.5 S3b）を外すと 4 本目が離れる
    expect(build((d) => ((fieldOf(d)['lanes'] as unknown[]).splice(1, 1)))).toThrow(/minefield\.lanes は帰投の輪からフィッチの輪へつながらない（道が無い）（V-X4/);
    expect(build((d) => ((fieldOf(d)['lanes'] as unknown[]).splice(0, 1)))).not.toThrow(); // 出発 → フィッチの水路（v0.8.5 S3）は道の検査に要らない（出発は帰投の輪の外）
    // 4 本目（v0.8.5 S3 までは 3 本目）の端をコリーから 400 + 150 m より離すとつながらない・縁ちょうどはつながる
    expect(build((d) => ((fieldOf(d)['lanes'] as unknown[])[3] = [3250, 1850, 2600, 2149, 300]))).toThrow(/コリーの 400 m の内へつながらない/);
    expect(build((d) => ((fieldOf(d)['lanes'] as unknown[])[3] = [3250, 1850, 2600, 2150, 300]))).not.toThrow();
    // 帯どうしが離れればつながらない
    expect(build((d) => ((fieldOf(d)['lanes'] as unknown[])[3] = [3300, 2300, 2600, 2300, 300]))).toThrow(/V-X4/);
  });
  it('V-X5: minefield は hazards に mine のある任務だけ・mine のある任務には要る', () => {
    expect(build((d) => (protoOf(d, 'us_07')['hazards'] = ['shore_battery', 'enemy_ship_gunfire_or_ram', 'grounding']))).toThrow(/us_07\.v0_1_prototype\.minefield は hazards に mine のある任務だけ（V-X5/);
    expect(build((d) => delete protoOf(d, 'us_07')['minefield'])).toThrow(/us_07\.v0_1_prototype\.hazards に mine があるのに minefield が無い（V-X5/);
    const d = clone();
    protoOf(d, 'us_06')['minefield'] = fieldOf(d);
    expect(() => getMinefieldParams(d, getPrototypeMission(d, 'us_06'))).toThrow(/us_06\.v0_1_prototype\.minefield は hazards に mine のある任務だけ/);
  });
  it('V-U2: 任務の shore_battery.params は risk_events の shore_battery.params と同じ形（鍵・gun の鍵）・数の範囲', () => {
    expect(guns((d) => (sbOf(d)['rof_per_min'] = 2))).toThrow(/us_07\.v0_1_prototype\.shore_battery\.params: 鍵は risk_events\.json の shore_battery\.params と同じ gun・base_detect_m・inland_m・source（.*rof_per_min）（V-U2・spec-v0850 §4\.3）/);
    expect(guns((d) => delete sbOf(d)['source'])).toThrow(/鍵は risk_events\.json の shore_battery\.params と同じ/);
    expect(guns((d) => delete (sbOf(d)['gun'] as Rec)['range_m'])).toThrow(/shore_battery\.params\.gun: 鍵は risk_events\.json の shore_battery\.params\.gun と同じ/);
    expect(guns((d) => ((sbOf(d)['gun'] as Rec)['damage'] = '34'))).toThrow(/gun の数（count.*は数、gun\.id は文字列（V-U2/);
    expect(guns((d) => ((sbOf(d)['gun'] as Rec)['count'] = 0))).toThrow(/\.gun: count は 1 以上の整数/);
    expect(guns((d) => ((sbOf(d)['gun'] as Rec)['fire_chance'] = 2))).toThrow(/\.gun\.fire_chance は 0〜1/);
    expect(guns((d) => (sbOf(d)['base_detect_m'] = 0))).toThrow(/base_detect_m は正、inland_m は 0 以上/);
    expect(guns((d) => (sbOf(d)['source'] = ' '))).toThrow(/\.source は空でない文字列/);
  });
});
