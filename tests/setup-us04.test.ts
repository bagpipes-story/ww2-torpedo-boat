// v0.8.0 S0（spec-v0800 §4.8・§6 の S0）: us_04「ブラケット海峡の夜」の世界の数値（JSON 全体）と今夜の乱数の回数を snapshot に固める
// （ノーマル／ハード × 史実モードあり／なし × seed 1・12345）。snapshot は v0.8.0 S0 の木で作った。us_04 の setup は S1〜S5 で鍵が増えうるので、
// 書き換える時は CHANGELOG に段と理由を書く（ほかの 9 任務の setup の snapshot は -u しない）。Briefing の行は入れない（S4 で変わる）。
// 今夜の揺らぎ（+16）は 10 回（危険 2・護衛 3・列 3・大発の先頭 1・反転 1）。遊べるのは S5 から（v0.8.0 S5 で playable_from v0.8.0）。
// あわせて: 撃沈の達成の隻数をノーマルにも読む鍵（v0_1_prototype.objective_sink_count。config/mission-hard-data）と、us_04 の data に人名・有名な艇の名を出さない（§4.12）。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gameData, type GameData } from '../src/config/game-data';
import { getPrototypeMission } from '../src/config/mission-data';
import { SeededRng } from '../src/core/rng';
import { directSortie } from '../src/core/sortie';
import { buildWorldSetup } from '../src/systems/world-setup';
import { FAMOUS_BOAT_RE, PERSON_DENYLIST, RANK_RE } from './person-denylist';

const SEEDS = [1, 12345] as const;
const CASES = [false, true].flatMap((hard) => [false, true].flatMap((historical) => SEEDS.map((seed) => [hard, historical, seed] as const)));
type Rec = Record<string, unknown>;
const clone = (): GameData => JSON.parse(JSON.stringify(gameData)) as GameData;
const missionOf = (d: GameData, id: string): Rec => (d.missionsSeed.missions as unknown as Rec[]).find((m) => m['id'] === id)!;
const protoOf = (d: GameData, id: string): Rec => missionOf(d, id)['v0_1_prototype'] as Rec;

function build(hard: boolean, historical: boolean, seed: number): { s: ReturnType<typeof buildWorldSetup>; draws: number } {
  const spy = vi.spyOn(SeededRng.prototype, 'next');
  const s = buildWorldSetup(gameData, 'us_04', { sortie: directSortie('us_04', seed, 'none', hard, historical), hard });
  const draws = spy.mock.calls.length;
  spy.mockRestore();
  return { s, draws };
}

describe('us_04 の setup の snapshot（v0.8.0 S0 の木）', () => {
  afterEach(() => vi.restoreAllMocks());
  it.each(CASES)('ハード %s 史実 %s seed %i: 世界の数値・今夜の乱数の回数', (hard, historical, seed) => {
    const label = `us_04 ${hard ? 'hard' : 'normal'}${historical ? ' historical' : ''} seed ${seed}`;
    const { s, draws } = build(hard, historical, seed);
    expect(JSON.stringify(s, null, 1)).toMatchSnapshot(`${label} setup`);
    expect(draws).toBe(10);
    // 駆逐艦の任務（護衛 1 隻＝enemy_start。列は transit）・Mk 8・新月・夜明けは空襲（S0 は L1 の既定・S5 でユーザーの決め U1）で西へ退く・撃沈の達成は 1 隻
    expect([s.mission.torpedoId, s.mission.moon, s.mission.enemyStarts.length, s.mission.objectiveSinkCount, s.destroyer!.objectiveSinks]).toEqual(['us_mk8', 'dark', 1, 1, 1]);
    expect([s.barges, s.ptBoats, s.convoy, s.transport, s.escort, s.raid, s.storm, s.mainWeapon]).toEqual([null, null, null, null, null, null, null, 'torpedo']);
    expect([s.dawnAir.playAs, s.dawnAir.retireEdge, s.dawnAir.retireForceJa, s.dawnAir.fleetGoneClears, s.airStrike!.planes]).toEqual(['enemy', 'west', '東京急行', false, 4]);
    expect(s.transit!.ships).toBe(hard ? 4 : 3);
    expect([s.radar!.model, s.radar!.fit, s.shores!.south.gapLabelJa]).toEqual(['so_early', 'leader', 'ファーガソン水道']);
    expect(s.hazardsTonight.every((h) => ['enemy_ship_gunfire_or_ram', 'enemy_aircraft', 'grounding', 'friendly_fire', 'dawn_air_strike'].includes(h))).toBe(true);
    for (const k of ['engine', 'gunboat', 'patrolAir', 'landing', 'allyDestroyer', 'evac'] as const) expect(k in s, k).toBe(false);
    expect(JSON.stringify(build(hard, historical, seed).s)).toBe(JSON.stringify(s));
  });
  it('レーダー・両岸の値は難易度・史実モード・夜で変わらない。列は艦の数（ハード）・入りの秒と道の y（夜）・AI（史実モード）だけが違う', () => {
    const plain = build(false, false, 1).s;
    for (const [hard, historical, seed] of [[false, true, 1], [true, false, 1], [true, true, 12345], [false, false, 12345]] as const) {
      const s = build(hard, historical, seed).s;
      expect(s.radar).toEqual(plain.radar);
      expect(s.shores).toEqual(plain.shores);
      const { ships, enterS, inbound, outbound, shipAi, ...rest } = s.transit!;
      const { ships: s0, enterS: e0, inbound: i0, outbound: o0, shipAi: a0, ...rest0 } = plain.transit!;
      expect(rest).toEqual(rest0);
      expect(ships).toBe(hard ? 4 : 3);
      expect([inbound.edge, inbound.appearX, outbound.edge, outbound.appearX]).toEqual([i0.edge, i0.appearX, o0.edge, o0.appearX]);
      expect(outbound.laneY - inbound.laneY).toBeCloseTo(800, 9); // 2 本の道は同じずれ
      expect(shipAi.maxSpeedMps).toBe(a0.maxSpeedMps);
      if (seed === 1) expect([enterS, inbound.laneY]).toEqual([e0, i0.laneY]); // 同じ夜は同じずれ（難易度・史実モードに依らない）
      else expect(enterS).not.toBe(e0); // 違う夜は入りの秒がずれる
      expect(s0).toBe(3);
    }
  });
});

describe('撃沈の達成の隻数（v0.8.0。ノーマルの v0_1_prototype.objective_sink_count。config/mission-hard-data）', () => {
  it('us_04: ノーマル 1・ハード 1。鍵の無い任務は今までどおり（us_02 は全隻＝null、jp_06 はノーマル null・ハード 1）', () => {
    expect([getPrototypeMission(gameData, 'us_04').objectiveSinkCount, getPrototypeMission(gameData, 'us_04', true).objectiveSinkCount]).toEqual([1, 1]);
    expect([getPrototypeMission(gameData, 'us_02').objectiveSinkCount, getPrototypeMission(gameData, 'us_02', true).objectiveSinkCount]).toEqual([null, null]);
    expect([getPrototypeMission(gameData, 'jp_06').objectiveSinkCount, getPrototypeMission(gameData, 'jp_06', true).objectiveSinkCount]).toEqual([null, 1]);
  });
  it('ハードに鍵が無ければノーマルの値。壊れていれば例外（0・小数・文字・ノーマルの隻数（護衛 1 ＋ 列 3）より多い・ハードの隻数（＋1）より多い）', () => {
    const d = clone();
    delete (protoOf(d, 'us_04')['hard'] as Rec)['objective_sink_count'];
    protoOf(d, 'us_04')['objective_sink_count'] = 2;
    expect(getPrototypeMission(d, 'us_04', true).objectiveSinkCount).toBe(2);
    for (const bad of [0, 1.5, '1', 5]) {
      const e = clone();
      protoOf(e, 'us_04')['objective_sink_count'] = bad;
      expect(() => getPrototypeMission(e, 'us_04'), String(bad)).toThrow(/us_04\.v0_1_prototype\.objective_sink_count は 1〜ノーマルの隻数（4）の整数/);
    }
    const ok = clone();
    protoOf(ok, 'us_04')['objective_sink_count'] = 4;
    expect(getPrototypeMission(ok, 'us_04').objectiveSinkCount).toBe(4);
    const hardBad = clone();
    (protoOf(hardBad, 'us_04')['hard'] as Rec)['objective_sink_count'] = 6;
    expect(() => getPrototypeMission(hardBad, 'us_04', true)).toThrow(/hard\.objective_sink_count は 1〜ハードの隻数の整数/);
    const hardOk = clone();
    (protoOf(hardOk, 'us_04')['hard'] as Rec)['objective_sink_count'] = 5;
    expect(getPrototypeMission(hardOk, 'us_04', true).objectiveSinkCount).toBe(5);
  });
});

describe('us_04 に人名・有名な艇の名を出さない（CLAUDE.md §11・spec-v0800 §4.12）', () => {
  it('任務の記録（史実メモ・出典・夜明けの refs・v0_1_prototype の全部）と組んだ世界に人名・階級つきの呼び方・その夜の有名な艇の番号・逸話の駆逐艦の名が無い', () => {
    const texts = [JSON.stringify(missionOf(gameData, 'us_04')), ...[false, true].map((hard) => JSON.stringify(buildWorldSetup(gameData, 'us_04', { hard })))];
    for (const t of texts) {
      for (const name of PERSON_DENYLIST) expect(t, name).not.toContain(name);
      expect(RANK_RE.test(t), t.match(RANK_RE)?.[0]).toBe(false);
      expect(FAMOUS_BOAT_RE.test(t), t.match(FAMOUS_BOAT_RE)?.[0]).toBe(false);
      expect(t).not.toContain('天霧');
    }
    // data のどこにも有名な艇の番号は無い（v0.8.0 S0 で us_04 と enemies.json の us_pt_enemy の出典の文から外した。docs/01 は S5 で直す）
    for (const [k, v] of Object.entries(gameData)) expect(FAMOUS_BOAT_RE.test(JSON.stringify(v)), k).toBe(false);
    expect(FAMOUS_BOAT_RE.test('PT-109') && FAMOUS_BOAT_RE.test('pt-109.html') && FAMOUS_BOAT_RE.test('PT 109') && !FAMOUS_BOAT_RE.test('PT-190')).toBe(true);
  });
});
