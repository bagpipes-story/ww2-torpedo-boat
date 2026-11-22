// v0.8.2 S0（spec-v0820 §4.5 D-N1〜D-N7・§5.3）: 報告・無線・中継の任務の読み出しと起動時の検査 V-N1〜V-N5（config/recon-mission-data）と setup の鍵（recon）。
// 既定の data（us_05）が通り、壊した data は鍵を名指す日本語の文で止まる。recon の無い任務は鍵ごと出ない。S0 では世界は recon を読まない（S2 の systems/world-recon）。
import { describe, expect, it } from 'vitest';
import { gameData, type GameData } from '../src/config/game-data';
import { getPrototypeMission } from '../src/config/mission-data';
import { RECON_CHECK_SHORE_CLEAR_M, RECON_KEYS, RECON_MISSION_TYPE, RECON_RELAY_KEYS, RECON_TRACK_RANGE_S, getReconParams, reconSetupPart, validateReconMissions } from '../src/config/recon-mission-data';
import { directSortie } from '../src/core/sortie';
import { buildWorldSetup } from '../src/systems/world-setup';

type Rec = Record<string, unknown>;
const clone = (): GameData => JSON.parse(JSON.stringify(gameData)) as GameData;
const missionOf = (d: GameData, id: string): Rec => (d.missionsSeed.missions as unknown as Rec[]).find((m) => m['id'] === id)!;
const protoOf = (d: GameData, id: string): Rec => missionOf(d, id)['v0_1_prototype'] as Rec;
const reconOf = (d: GameData): Rec => protoOf(d, 'us_05')['recon'] as Rec;
const relayOf = (d: GameData): Rec => reconOf(d)['relay'] as Rec;
const build = (f: (d: GameData) => void, id = 'us_05'): (() => unknown) => {
  const d = clone();
  f(d);
  return () => getReconParams(d, getPrototypeMission(d, id));
};
const PROTO_IDS = (gameData.missionsSeed.missions as unknown as Rec[]).filter((m) => m['v0_1_prototype']).map((m) => m['id'] as string);
const EXPECTED = { trackS: 20, identifyClass: 'battleship', radioFailChance: 0.35, radioMinDamage: 20, relay: { x: 1600, y: 500, radiusM: 250, radius2: 62500, labelJa: '隣の分隊' } };

describe('既定の data（us_05。spec §4.5・§4.1 D-M4）', () => {
  it('戦艦を目で確かめ、レーダーで 20 秒追うと報告。76 mm 以上（damage 20 以上）の 1 発ごとに 35% で無線が壊れ、ボホール島寄りの中継の輪（隣の分隊が止まっている所。v0.8.2 IP3 で (1600, 800) → (1600, 500)）で中継', () => {
    for (const hard of [false, true]) expect(getReconParams(gameData, getPrototypeMission(gameData, 'us_05', hard))).toEqual(EXPECTED);
    expect(validateReconMissions(gameData)).toEqual(EXPECTED);
    expect([RECON_KEYS, RECON_RELAY_KEYS, RECON_TRACK_RANGE_S, RECON_MISSION_TYPE, RECON_CHECK_SHORE_CLEAR_M]).toEqual([
      ['track_s', 'identify_class', 'radio_fail_chance', 'radio_min_damage', 'relay', 'source'], ['x_m', 'y_m', 'radius_m', 'label_ja'], [5, 60], 'recon_and_attack', 200,
    ]);
    // 76 mm（駆潜艇の aa_76mm・輸送船の甲板砲 25）は引き、25 mm と 13 mm（4）は引かない（damage 20 の境）。戦艦・重巡の副砲と高角砲（35〜40）も引く
    const dmg = (id: string): number[] => ((gameData.enemies.enemies as unknown as Rec[]).find((e) => e['id'] === id)!['guns'] as Rec[]).map((g) => g['damage'] as number);
    expect([dmg('ijn_destroyer'), dmg('ijn_battleship_fuso'), dmg('ijn_cruiser_mogami'), dmg('ijn_subchaser')]).toEqual([[40, 4], [40, 35, 4], [35, 4], [25, 4]]);
  });
  it('?debug&noradio は 35% → 0・radiofail は 1（ほかの値はそのまま）。両方は使えない（V-N5）', () => {
    const m = getPrototypeMission(gameData, 'us_05');
    expect(getReconParams(gameData, m, { radioOff: true })).toEqual({ ...EXPECTED, radioFailChance: 0 });
    expect(getReconParams(gameData, m, { radioFail: true })).toEqual({ ...EXPECTED, radioFailChance: 1 });
    expect(() => getReconParams(gameData, m, { radioOff: true, radioFail: true })).toThrow(/us_05\.v0_1_prototype\.\?debug&noradio と radiofail は一緒に使えない（V-N5/);
  });
  it('setup の鍵: us_05 だけ recon（世界の上書き radioOff・radioFail を通す）。ほかの任務は鍵ごと出ない', () => {
    for (const id of PROTO_IDS) {
      for (const hard of [false, true]) {
        const s = buildWorldSetup(gameData, id, { sortie: directSortie(id, 3, 'none', hard, false), hard });
        expect('recon' in s, id).toBe(id === 'us_05');
        if (id !== 'us_05') expect(reconSetupPart(gameData, getPrototypeMission(gameData, id, hard)), id).toEqual({});
      }
    }
    expect(buildWorldSetup(gameData, 'us_05', { radioFail: true }).recon!.radioFailChance).toBe(1);
  });
});

describe('起動時の検査（V-N1〜V-N4）', () => {
  it('V-N1: 鍵の閉じた集合・追う秒 5〜60・確率 0〜1・ダメージは正・艦種・中継の輪の形・出典', () => {
    expect(build((d) => (reconOf(d)['report_s'] = 20))).toThrow(/us_05\.v0_1_prototype\.recon の鍵はちょうど track_s・identify_class・radio_fail_chance・radio_min_damage・relay・source（.*report_s）（V-N1・spec-v0820 §5\.3）/);
    expect(build((d) => (reconOf(d)['track_s'] = 4))).toThrow(/recon\.track_s は 5〜60 秒（4）（V-N1/);
    expect(build((d) => (reconOf(d)['track_s'] = 60))).not.toThrow();
    expect(build((d) => (reconOf(d)['radio_fail_chance'] = 1.01))).toThrow(/recon\.radio_fail_chance は 0〜1（1\.01）/);
    expect(build((d) => (reconOf(d)['radio_min_damage'] = 0))).toThrow(/recon\.radio_min_damage は正（0）/);
    expect(build((d) => (reconOf(d)['identify_class'] = 'carrier'))).toThrow(/recon\.identify_class は destroyer・heavy_cruiser・battleship のどれか（carrier）/);
    expect(build((d) => (reconOf(d)['source'] = ''))).toThrow(/recon\.source は空でない文字列/);
    expect(build((d) => delete relayOf(d)['label_ja'])).toThrow(/recon\.relay の鍵はちょうど x_m・y_m・radius_m・label_ja（x_m・y_m・radius_m）（V-N1/);
    expect(build((d) => (relayOf(d)['radius_m'] = 0))).toThrow(/recon\.relay の x_m・y_m は数・radius_m は正（V-N1/);
    expect(build((d) => (protoOf(d, 'us_05')['recon'] = []))).toThrow(/recon は object（V-N1/);
  });
  it('V-N2: type recon_and_attack の任務だけ（その任務には要る）・レーダーがある・確かめる艦種の艦が列にいる', () => {
    expect(build((d) => (protoOf(d, 'us_02')['recon'] = JSON.parse(JSON.stringify(reconOf(gameData)))), 'us_02')).toThrow(/us_02\.v0_1_prototype\.recon は type recon_and_attack の任務だけ（intercept_destroyer）（V-N2/);
    expect(build((d) => delete protoOf(d, 'us_05')['recon'])).toThrow(/us_05\.v0_1_prototype\.recon は type recon_and_attack の任務に要る（報告の条件と中継の輪）（V-N2/);
    expect(build((d) => delete protoOf(d, 'us_05')['radar'])).toThrow(/recon はレーダー（v0_1_prototype\.radar）のある任務だけ（レーダーで追って報告する）（V-N2/);
    expect(build((d) => (reconOf(d)['identify_class'] = 'heavy_cruiser'))).not.toThrow(); // 最上は前衛にいる
    expect(build((d) => {
      for (const r of (protoOf(d, 'us_05')['transit'] as Rec)['column'] as Rec[]) if (r['enemy_id'] === 'ijn_battleship_fuso') r['enemy_id'] = 'ijn_cruiser_mogami';
      protoOf(d, 'us_05')['enemies'] = ['ijn_destroyer', 'ijn_destroyer', 'ijn_destroyer', 'ijn_destroyer', 'ijn_cruiser_mogami', 'ijn_cruiser_mogami', 'ijn_cruiser_mogami'];
    })).toThrow(/recon\.identify_class（battleship）の艦が片道の列（transit\.column）にいない（V-N2/);
  });
  it('V-N3: 中継の輪は海域の内・帰投の輪と出発点に重ならない・岸の線から 200 m より沖（v0.8.2 IP3 で 400 → 200）', () => {
    expect(build((d) => (relayOf(d)['x_m'] = 200))).toThrow(/recon\.relay（200, 500・半径 250）は海域の内（V-N3/);
    expect(build((d) => Object.assign(relayOf(d), { x_m: 4800, y_m: 1100 }))).toThrow(/recon\.relay は帰投の輪に重ならない（V-N3/);
    expect(build((d) => Object.assign(relayOf(d), { x_m: 4100, y_m: 800 }))).toThrow(/recon\.relay は出発点にかからない（V-N3/);
    expect(build((d) => (relayOf(d)['y_m'] = 449))).toThrow(/recon\.relay の縁は岸の線から 200 m 以上沖（V-N3/);
    expect(build((d) => (relayOf(d)['y_m'] = 450))).not.toThrow(); // 450 − 250 ＝ 200
  });
  it('V-N4: scoring.json に type の達成の点がある', () => {
    expect(build((d) => delete (d.scoring.objective_by_type as Record<string, unknown>)['recon_and_attack'])).toThrow(/scoring\.json の objective_by_type に recon_and_attack が無い（V-N4/);
  });
});
