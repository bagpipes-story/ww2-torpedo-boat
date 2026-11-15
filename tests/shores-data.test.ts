// v0.8.0 S0（spec-v0800 §4.3・§4.8）: 海峡の両岸の data と起動時の検査（config/shores-mission-data の V-S1〜V-S3）。
// 既定の data（us_04 のコロンバンガラ島・アランデル島・ギゾ島・ファーガソン水道）が通り、壊した data は鍵を名指す日本語の文（V-Sn 付き）で止まる。
// 両岸の無い任務は鍵ごと出ず、今の岸（coast）の任務の岸の値（coastEdgeY）は変わらない。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gameData, type GameData } from '../src/config/game-data';
import { getPrototypeMission } from '../src/config/mission-data';
import { SHORES_CHECK_RING_NEAR_M, SHORES_EXCLUSIVE_KEYS, getShoresParams, shoresSetupPart, validateShoresMissions } from '../src/config/shores-mission-data';
import { directSortie } from '../src/core/sortie';
import { buildWorldSetup } from '../src/systems/world-setup';

type Rec = Record<string, unknown>;
const clone = (): GameData => JSON.parse(JSON.stringify(gameData)) as GameData;
const missionOf = (d: GameData, id: string): Rec => (d.missionsSeed.missions as unknown as Rec[]).find((m) => m['id'] === id)!;
const protoOf = (d: GameData, id: string): Rec => missionOf(d, id)['v0_1_prototype'] as Rec;
const shoresOf = (d: GameData): Rec => protoOf(d, 'us_04')['shores'] as Rec;
const sideOf = (d: GameData, side: 'north' | 'south'): Rec => shoresOf(d)[side] as Rec;
const build = (f: (d: GameData) => void, id = 'us_04'): (() => unknown) => {
  const d = clone();
  f(d);
  return () => getShoresParams(d, getPrototypeMission(d, id));
};
const PROTO_IDS = (gameData.missionsSeed.missions as unknown as Rec[]).filter((m) => m['v0_1_prototype']).map((m) => m['id'] as string);

describe('既定の data（us_04）', () => {
  it('北の岸はコロンバンガラ島（陸 600 m）、南の岸はギゾ島・アランデル島（陸 600 m）で x 700〜1,900 が切れ目＝ファーガソン水道', () => {
    const s = getShoresParams(gameData, getPrototypeMission(gameData, 'us_04'))!;
    expect(s).toEqual({
      north: { landM: 600, labels: [{ labelJa: 'コロンバンガラ島', x: 3000 }], gaps: [], gapLabelJa: '' },
      south: { landM: 600, labels: [{ labelJa: 'ギゾ島', x: 300 }, { labelJa: 'アランデル島', x: 4200 }], gaps: [{ x0: 700, x1: 1900 }], gapLabelJa: 'ファーガソン水道' },
    });
    expect(getShoresParams(gameData, getPrototypeMission(gameData, 'us_04', true))).toEqual(s);
    expect(validateShoresMissions(gameData)).toEqual(s);
    // 帰投の輪（1300, 3700・半径 250）は南の岸から 400 m の内にかかり、切れ目の真上（x 1,050〜1,550 ⊂ 700〜1,900）。礁 2 つは輪にも出発点にもかからない
    const m = getPrototypeMission(gameData, 'us_04');
    expect([m.returnPoint.x, m.returnPoint.y, m.returnPoint.radiusM]).toEqual([1300, 3700, 250]);
    expect(m.returnPoint.y + m.returnPoint.radiusM).toBeGreaterThan(4000 - SHORES_CHECK_RING_NEAR_M);
    expect(m.shallows.map((r) => [r.x, r.y, r.w, r.h, r.label])).toEqual([[500, 3500, 400, 500, '礁'], [1700, 3500, 400, 500, '礁']]);
    // 今の岸の値は持たない（coastEdgeY は岸の無い任務の NaN）
    const w = buildWorldSetup(gameData, 'us_04');
    expect([w.mission.coast, w.coastEdgeY]).toEqual([null, NaN]);
    expect(w.shores).toEqual(s);
  });
  it('両岸の無い任務は null・shoresSetupPart は {}（setup に shores の鍵が出ない）。今の岸（coast）の任務の岸の値は今のまま', () => {
    for (const id of PROTO_IDS.filter((x) => x !== 'us_04')) {
      for (const hard of [false, true]) {
        expect(getShoresParams(gameData, getPrototypeMission(gameData, id, hard)), id).toBeNull();
        expect(shoresSetupPart(gameData, getPrototypeMission(gameData, id, hard)), id).toEqual({});
        const s = buildWorldSetup(gameData, id, { sortie: directSortie(id, 3, 'none', hard, false), hard });
        expect('shores' in s, id).toBe(false);
        expect(JSON.stringify(s).includes('"shores"'), id).toBe(false);
      }
    }
    expect(Number.isFinite(buildWorldSetup(gameData, 'us_03').coastEdgeY)).toBe(true); // 値そのものは tests/setup-neutral の snapshot が見張る
    expect(SHORES_EXCLUSIVE_KEYS).toEqual(['coast', 'evac']);
    const src = readFileSync(join(__dirname, '..', 'src', 'scenes', 'boot-scene.ts'), 'utf8');
    expect(src.indexOf('validateShoresMissions(gameData);')).toBeGreaterThan(src.indexOf('validateEvacMissions(gameData);'));
  });
});

describe('起動時の検査（V-S1〜V-S3）', () => {
  it('V-S1 形: 鍵・陸の幅・字（空でない・陸の上）・切れ目（0〜幅の中・昇順で重ならない・陸を残す・名は切れ目があるときだけ）', () => {
    const cases: [(d: GameData) => void, RegExp][] = [
      [(d) => (shoresOf(d)['east'] = {}), /us_04\.v0_1_prototype\.shores: 鍵はちょうど north・south・source（V-S1/],
      [(d) => delete shoresOf(d)['south'], /鍵はちょうど north・south・source/],
      [(d) => (shoresOf(d)['source'] = ''), /source は空でない文字列（V-S1/],
      [(d) => (shoresOf(d)['north'] = 600), /north は object（V-S1/],
      [(d) => (sideOf(d, 'north')['label_ja'] = 'x'), /north の鍵は land_m・labels と任意の gaps_m・gap_label_ja（知らない鍵 label_ja）/],
      [(d) => delete sideOf(d, 'south')['labels'], /south の鍵は land_m・labels/],
      [(d) => (sideOf(d, 'south')['land_m'] = 0), /south\.land_m は正（0）（V-S1/],
      [(d) => (sideOf(d, 'south')['gaps_m'] = [[1900, 700]]), /south\.gaps_m\[0\]（1900, 700）は 0 ≤ x0 < x1 ≤ 海域の幅（6000）/],
      [(d) => (sideOf(d, 'south')['gaps_m'] = [[700, 6100]]), /south\.gaps_m\[0\]（700, 6100）は 0 ≤ x0 < x1 ≤ 海域の幅/],
      [(d) => (sideOf(d, 'south')['gaps_m'] = [[2500, 3000], [700, 1900]]), /south\.gaps_m\[1\] は前の切れ目より東で重ならない（昇順）/],
      [(d) => (sideOf(d, 'south')['gaps_m'] = [[700, 1900], [1900, 2500]]), /south\.gaps_m\[1\] は前の切れ目より東で重ならない/],
      [(d) => (sideOf(d, 'south')['gaps_m'] = [[0, 6000]]), /south\.gaps_m は陸を残す（切れ目の合計 6000 m < 幅 6000 m）/],
      [(d) => (sideOf(d, 'south')['gaps_m'] = [700, 1900]), /south\.gaps_m は \[x0, x1\] の数の組の配列/],
      [(d) => delete sideOf(d, 'south')['gap_label_ja'], /south\.gap_label_ja は切れ目（gaps_m）があるときだけ・空でない文字列/],
      [(d) => (sideOf(d, 'north')['gap_label_ja'] = '水道'), /north\.gap_label_ja は切れ目（gaps_m）があるときだけ/],
      [(d) => ((sideOf(d, 'south')['labels'] as Rec[])[0]!['x_m'] = 1200), /south\.labels\[0\]\.x_m（1200）は 0〜海域の幅の陸の上（切れ目の外）/],
      [(d) => ((sideOf(d, 'north')['labels'] as Rec[])[0]!['x_m'] = -10), /north\.labels\[0\]\.x_m（-10）は 0〜海域の幅/],
      [(d) => ((sideOf(d, 'north')['labels'] as Rec[])[0]!['label_ja'] = ''), /north\.labels\[0\] はちょうど label_ja（空でない）・x_m（数）/],
      [(d) => ((sideOf(d, 'north')['labels'] as Rec[])[0]!['y_m'] = 1), /north\.labels\[0\] はちょうど label_ja/],
    ];
    for (const [f, re] of cases) expect(build(f), String(re)).toThrow(re);
    expect(build((d) => ((sideOf(d, 'south')['labels'] as Rec[])[0]!['x_m'] = 700))).not.toThrow(); // 切れ目の縁は陸
    expect(build((d) => (sideOf(d, 'north')['labels'] = []))).not.toThrow(); // 字の無い岸も描ける
  });
  it('V-S2: 岸から 400 m の内にかかる輪はその岸の切れ目の真上・礁は輪にも出発点にもかからない', () => {
    const rp = (d: GameData): Rec => protoOf(d, 'us_04')['return_point'] as Rec;
    expect(build((d) => (rp(d)['x_m'] = 2000))).toThrow(/帰投の輪（2000, 3700・半径 250）は南の岸から 400 m の内にかかるので、南の切れ目（gaps_m）の真上に置く（V-S2/);
    expect(build((d) => (rp(d)['x_m'] = 1700))).toThrow(/南の切れ目/); // x 1,450〜1,950 は 1,900 を越える
    expect(build((d) => Object.assign(rp(d), { x_m: 300, y_m: 3200 }))).not.toThrow(); // 輪の下端 3,450 < 3,600＝岸の近くにかからない（礁 1 からも 360 m）
    expect(build((d) => Object.assign(rp(d), { x_m: 3000, y_m: 500 }))).toThrow(/北の岸から 400 m の内にかかるので、北の切れ目（gaps_m）の真上に置く（V-S2/);
    expect(build((d) => ((protoOf(d, 'us_04')['shallows'] as Rec[])[0]!['x_m'] = 950))).toThrow(/shallows\[0\]（礁）が帰投の輪にかかる（V-S2/);
    expect(build((d) => (protoOf(d, 'us_04')['shallows'] as Rec[]).push({ x_m: 3500, y_m: 2500, width_m: 200, height_m: 200 }))).toThrow(/shallows\[2\]（礁）が出発点（3600, 2600）にかかる（V-S2/);
  });
  it('V-S3: 今の岸（coast）・屋我地の陰の地形（evac）と一緒に置けない', () => {
    const block = (d: GameData): Rec => JSON.parse(JSON.stringify(shoresOf(d))) as Rec;
    expect(build((d) => (protoOf(d, 'us_03')['shores'] = block(d)), 'us_03')).toThrow(/us_03\.v0_1_prototype\.shores: v0_1_prototype\.coast と同居しない（今の岸・地形の絵を変えない）（V-S3/);
    expect(build((d) => Object.assign(protoOf(d, 'jp_03'), { coast: undefined, shores: block(d) }), 'jp_03')).toThrow(/jp_03\.v0_1_prototype\.shores: v0_1_prototype\.evac と同居しない（今の岸・地形の絵を変えない）（V-S3/);
  });
});
