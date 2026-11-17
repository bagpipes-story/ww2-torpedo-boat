// v0.8.1 S0（spec-v0810 §3.3・§4.1・§4.4・§4.5）: 暗い岸を背にの data と起動時の検査（config/backdrop-mission-data の V-B1〜V-B3）。
// 既定の data（us_06 の係数 0.6・2,000 m）が通り、壊した data は鍵を名指す日本語の文（V-Bn 付き）で止まる。背に岸の無い任務と ?debug&nobackdrop（backdropOff）は鍵ごと出ない。
import { describe, expect, it } from 'vitest';
import { gameData, type GameData } from '../src/config/game-data';
import { getPrototypeMission } from '../src/config/mission-data';
import { BACKDROP_KEYS, backdropSetupPart, getBackdropParams, validateBackdropMissions } from '../src/config/backdrop-mission-data';
import { directSortie } from '../src/core/sortie';
import { buildWorldSetup } from '../src/systems/world-setup';

type Rec = Record<string, unknown>;
const clone = (): GameData => JSON.parse(JSON.stringify(gameData)) as GameData;
const missionOf = (d: GameData, id: string): Rec => (d.missionsSeed.missions as unknown as Rec[]).find((m) => m['id'] === id)!;
const protoOf = (d: GameData, id: string): Rec => missionOf(d, id)['v0_1_prototype'] as Rec;
const blockOf = (d: GameData): Rec => protoOf(d, 'us_06')['shore_backdrop'] as Rec;
const build = (f: (d: GameData) => void, id = 'us_06'): (() => unknown) => {
  const d = clone();
  f(d);
  return () => getBackdropParams(d, getPrototypeMission(d, id));
};
const PROTO_IDS = (gameData.missionsSeed.missions as unknown as Rec[]).filter((m) => m['v0_1_prototype']).map((m) => m['id'] as string);

describe('既定の data（us_06）', () => {
  it('係数 0.6・背の陸まで 2,000 m（2 乗 4,000,000）。ノーマル・ハード・史実モード・夜で同じ。backdropOff（?debug&nobackdrop）は鍵ごと出ない', () => {
    const want = { detectFactor: 0.6, behindM: 2000, behindM2: 4_000_000 };
    expect(getBackdropParams(gameData, getPrototypeMission(gameData, 'us_06'))).toEqual(want);
    expect(getBackdropParams(gameData, getPrototypeMission(gameData, 'us_06', true))).toEqual(want);
    expect(validateBackdropMissions(gameData)).toEqual(want);
    for (const [hard, historical, seed] of [[false, false, 1], [true, true, 12345]] as const) {
      const s = buildWorldSetup(gameData, 'us_06', { sortie: directSortie('us_06', seed, 'none', hard, historical), hard });
      expect(s.backdrop).toEqual(want);
      const off = buildWorldSetup(gameData, 'us_06', { sortie: directSortie('us_06', seed, 'none', hard, historical), hard, backdropOff: true });
      expect('backdrop' in off).toBe(false);
      // 切っても他の値は同じ（背に岸の鍵だけが無い）
      const { backdrop: _b, ...rest } = s;
      expect(JSON.stringify(off)).toBe(JSON.stringify(rest));
    }
    expect(backdropSetupPart(gameData, getPrototypeMission(gameData, 'us_06'), { backdropOff: true })).toEqual({});
    expect(BACKDROP_KEYS).toEqual(['detect_factor', 'behind_m', 'source']);
    expect(String(blockOf(gameData)['source'])).toMatch(/historical .*\/ design \(v0\.8\.1 S0/);
  });
  it('背に岸の無い任務は null・backdrop の鍵が出ない（ノーマル・ハード・史実モード・seed 3 夜）', () => {
    for (const id of PROTO_IDS.filter((x) => x !== 'us_06')) {
      for (const hard of [false, true]) {
        expect(getBackdropParams(gameData, getPrototypeMission(gameData, id, hard)), id).toBeNull();
        for (const historical of [false, true]) {
          const s = buildWorldSetup(gameData, id, { sortie: directSortie(id, 3, 'none', hard, historical), hard });
          expect('backdrop' in s, id).toBe(false);
          expect(JSON.stringify(s).includes('"backdrop"'), id).toBe(false);
        }
      }
    }
  });
});

describe('起動時の検査（V-B1〜V-B3）', () => {
  it('V-B1 形: 鍵の閉じた集合・0 ＜ 係数 ＜ 1・0 ＜ 距離 ≤ 海域の対角・出典', () => {
    const cases: [(d: GameData) => void, RegExp][] = [
      [(d) => (protoOf(d, 'us_06')['shore_backdrop'] = 0.6), /us_06\.v0_1_prototype\.shore_backdrop は object（V-B1・spec-v0810 §4\.4）/],
      [(d) => (blockOf(d)['lit'] = false), /shore_backdrop: 鍵はちょうど detect_factor・behind_m・source（detect_factor・behind_m・source・lit）（V-B1/],
      [(d) => delete blockOf(d)['behind_m'], /鍵はちょうど detect_factor・behind_m・source（detect_factor・source）/],
      [(d) => (blockOf(d)['detect_factor'] = 1), /shore_backdrop\.detect_factor は 0 ＜ 係数 ＜ 1（1）（V-B1/],
      [(d) => (blockOf(d)['detect_factor'] = 0), /detect_factor は 0 ＜ 係数 ＜ 1（0）/],
      [(d) => (blockOf(d)['detect_factor'] = '0.6'), /detect_factor は 0 ＜ 係数 ＜ 1（0\.6）/],
      [(d) => (blockOf(d)['behind_m'] = 0), /shore_backdrop\.behind_m は 0 ＜ 距離 ≤ 海域の対角（6708\.2 m。0）（V-B1/],
      [(d) => (blockOf(d)['behind_m'] = 6709), /behind_m は 0 ＜ 距離 ≤ 海域の対角（6708\.2 m。6709）/],
      [(d) => (blockOf(d)['source'] = ''), /shore_backdrop\.source は空でない文字列（V-B1/],
    ];
    for (const [f, re] of cases) expect(build(f), re.source).toThrow(re);
    expect(build((d) => (blockOf(d)['behind_m'] = 6708))).not.toThrow();
    expect(build((d) => (blockOf(d)['detect_factor'] = 0.999))).not.toThrow();
  });
  it('V-B2 置き場: 岸の線のある任務（coast の south か shores）・駆逐艦の任務だけ', () => {
    expect(build((d) => delete protoOf(d, 'us_06')['coast'])).toThrow(/us_06\.v0_1_prototype\.shore_backdrop は岸の線のある任務（coast の south か shores）だけ（V-B2/);
    // us_04（両岸 shores・駆逐艦の任務）には置ける
    const d = clone();
    protoOf(d, 'us_04')['shore_backdrop'] = blockOf(d);
    expect(getBackdropParams(d, getPrototypeMission(d, 'us_04'))).toEqual({ detectFactor: 0.6, behindM: 2000, behindM2: 4_000_000 });
    // us_02（岸なし）・jp_05（米PT の任務。岸なし）・jp_01（米PT の任務。岸あり）・us_03（大発の任務。岸あり）には置けない
    for (const [id, re] of [['us_02', /岸の線のある任務/], ['jp_05', /岸の線のある任務/], ['jp_01', /駆逐艦の任務（enemy_start）だけ（大発・米PT の任務は発見の仕組みが別）（V-B2/], ['us_03', /駆逐艦の任務（enemy_start）だけ/]] as const) {
      const e = clone();
      protoOf(e, id)['shore_backdrop'] = blockOf(e);
      expect(() => getBackdropParams(e, getPrototypeMission(e, id)), id).toThrow(re);
      expect(() => validateBackdropMissions(e), id).toThrow(/V-B2/);
    }
  });
});
