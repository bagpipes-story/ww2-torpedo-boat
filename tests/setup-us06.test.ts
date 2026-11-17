// v0.8.1 S0（spec-v0810 §4.1・§4.5・§6 の S0）: us_06「オルモック湾の決着」の世界の数値（JSON 全体）と今夜の乱数の回数を snapshot に固める
// （ノーマル／ハード × 史実モードあり／なし × seed 1・12345）。snapshot は v0.8.1 S0 の木で作った（S3 で動き出す秒と駆潜艇・IP2 で夜の水上機＝seaplane と seaplaneNight の鍵を -u）。us_06 の setup は S1〜S4 で鍵が増えうるので、
// 書き換える時は CHANGELOG に段と理由を書く（ほかの 10 任務の setup の snapshot は -u しない）。Briefing の行は入れない（S4 で変わる）。
// 今夜の揺らぎ（+16）はノーマル 8 回（卯月 3・空知丸 3・大発の先頭 1・反転 1）・ハード 14 回（駆潜艇 2 隻 ＋6）。遊べるのは S4 から（playable_from はまだ無い）。
// あわせて: us_06 の画面の文（題・場所・目的・成功・史実メモ・月・夜明け・岸・退く呼び名・敵の名）に人名・階級つきの呼び方・PT の番号が無い（CLAUDE.md §11・spec-v0810 §3.8）。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gameData } from '../src/config/game-data';
import { SeededRng } from '../src/core/rng';
import { directSortie } from '../src/core/sortie';
import { buildWorldSetup } from '../src/systems/world-setup';
import { FAMOUS_BOAT_RE, PERSON_DENYLIST, PT_NUMBER_RE, RANK_RE } from './person-denylist';

const SEEDS = [1, 12345] as const;
const CASES = [false, true].flatMap((hard) => [false, true].flatMap((historical) => SEEDS.map((seed) => [hard, historical, seed] as const)));
type Rec = Record<string, unknown>;
const missionOf = (id: string): Rec => (gameData.missionsSeed.missions as unknown as Rec[]).find((m) => m['id'] === id)!;

function build(hard: boolean, historical: boolean, seed: number): { s: ReturnType<typeof buildWorldSetup>; draws: number } {
  const spy = vi.spyOn(SeededRng.prototype, 'next');
  const s = buildWorldSetup(gameData, 'us_06', { sortie: directSortie('us_06', seed, 'none', hard, historical), hard });
  const draws = spy.mock.calls.length;
  spy.mockRestore();
  return { s, draws };
}

describe('us_06 の setup の snapshot（v0.8.1 S0 の木）', () => {
  afterEach(() => vi.restoreAllMocks());
  it.each(CASES)('ハード %s 史実 %s seed %i: 世界の数値・今夜の乱数の回数', (hard, historical, seed) => {
    const label = `us_06 ${hard ? 'hard' : 'normal'}${historical ? ' historical' : ''} seed ${seed}`;
    const { s, draws } = build(hard, historical, seed);
    expect(JSON.stringify(s, null, 1)).toMatchSnapshot(`${label} setup`);
    expect(draws).toBe(hard ? 14 : 8);
    expect(s.night.enemyOffsets.length).toBe(hard ? 4 : 2);
    // 駆逐艦の任務（卯月 1 隻＝enemy_start。空知丸は transport）・Mk 13・月没後・夜明けは空襲（L1）で東へ退く・撃沈の達成は 1 隻
    expect([s.mission.enemyId, s.mission.torpedoId, s.mission.moon, s.mission.enemyStarts.length, s.mission.objectiveSinkCount, s.destroyer!.objectiveSinks, s.transport!.enemyId]).toEqual(['ijn_destroyer_mutsuki_enemy', 'us_mk13', 'dark', 1, 1, 1, 'ijn_transport']);
    expect([s.destroyer!.spec.lengthM, s.destroyer!.spec.hitsToSink, s.transport!.spec.hitsToSink, s.destroyer!.baseDetectM]).toEqual([102.7, 2, 1, 2000]);
    expect([s.barges, s.ptBoats, s.convoy, s.escort, s.raid, s.storm, s.friendly, s.mainWeapon]).toEqual([null, null, null, null, null, null, null, 'torpedo']);
    // v0.8.1 IP2（ユーザーの U3）: 夜の水上機（us_02 の ijn_seaplane_jake の仕組み・数は us_02 と同じ）がノーマル・ハードとも毎夜（optional_hazards なし）。1 夜の攻撃の回数は data から
    const ea = (missionOf('us_06')['v0_1_prototype'] as Rec)['enemy_aircraft'] as Rec;
    expect([s.seaplane !== null, s.seaplaneNight]).toEqual([true, { attacksPerNight: ea['attacks_per_night'] }]);
    expect(s.seaplane).toEqual(buildWorldSetup(gameData, 'us_02').seaplane);
    expect([s.dawnAir.playAs, s.dawnAir.retireEdge, s.dawnAir.retireForceJa, s.dawnAir.fleetGoneClears, s.airStrike!.planes]).toEqual(['enemy', 'east', '日本の艦', false, 4]);
    expect([s.radar!.model, s.radar!.fit, s.mission.coast!.label, s.coastEdgeY]).toEqual(['so_late', 'own', 'レイテ島（パロンポン）', 3000]);
    expect([s.anchors, s.backdrop]).toEqual([{ underwayS: hard ? [3, null, 4, 4] : [3, null], alarmS: 4 }, { detectFactor: 0.6, behindM: 2000, behindM2: 4_000_000 }]);
    expect('pickets' in s).toBe(hard);
    if (hard) expect([s.pickets!.enemyId, s.pickets!.starts.length]).toEqual(['ijn_subchaser', 2]);
    expect(s.hazardsTonight).toEqual(['enemy_ship_gunfire_or_ram', 'enemy_aircraft', 'dawn_air_strike']); // v0.8.1 IP2: 夜の水上機を出会う順に
    for (const k of ['engine', 'gunboat', 'patrolAir', 'landing', 'allyDestroyer', 'evac', 'transit', 'shores'] as const) expect(k in s, k).toBe(false);
    expect(JSON.stringify(build(hard, historical, seed).s)).toBe(JSON.stringify(s));
  });
  it('今夜の揺らぎ: 艦ごとに x ±150・y ±50・針路なし・反転なし。空知丸は岸の線から 190〜290 m・卯月は 570〜670 m（seed 1〜40）', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = build(true, false, seed).s;
      expect(s.night.mirrored).toBe(false);
      for (const o of s.night.enemyOffsets) expect(Math.abs(o.dx) <= 150 && Math.abs(o.dy) <= 50 && o.dh === 0, String(seed)).toBe(true);
      expect(3000 - s.transport!.start.y).toBeGreaterThanOrEqual(190);
      expect(3000 - s.transport!.start.y).toBeLessThanOrEqual(290);
      expect(3000 - s.destroyer!.starts[0]!.y).toBeGreaterThanOrEqual(570);
      expect(3000 - s.destroyer!.starts[0]!.y).toBeLessThanOrEqual(670);
      expect([s.destroyer!.starts[0]!.headingDeg, s.transport!.start.headingDeg]).toEqual([270, 135]);
    }
  });
});

describe('us_06 の種の直し（spec-v0810 §2）と人名・PT の番号（CLAUDE.md §11・spec-v0810 §3.8）', () => {
  it('場所はパロンポン沖・月は沈んでいた・目的に特攻艇なし・成功は卯月の撃沈・夜明けは L1・題と日付と順はそのまま・S4 から遊べる（playable_from v0.8.1）', () => {
    const m = missionOf('us_06');
    expect([m['title_ja'], m['date'], m['order'], m['place'], m['moon'], m['moon_label_ja'], m['success'], m['torpedo_type'], m['player_boat']]).toEqual(['オルモック湾の決着', '1944-12-11', 6, 'パロンポン沖（レイテ島西岸）', 'dark', '月没後', '帰投。卯月を撃沈すれば達成', 'us_mk13', 'us_elco80']);
    expect(String(m['objective'])).not.toContain('特攻');
    expect(m['enemies']).toEqual(['ijn_destroyer_mutsuki_enemy', 'ijn_transport']);
    expect(m['playable_from']).toBe('v0.8.1'); // v0.8.1 S4（lead の L65）: Title の米PT のタブの 5 枚目。S0〜S3 は無かった
    const da = m['dawn_air'] as Rec;
    expect([da['control'], da['confidence'], da['play_as'], da['enemy_ships_at_dawn'], da['label_ja']]).toEqual(['contested', 'medium', 'enemy', 'retire', '昼の空は争奪（日本機の空襲）']);
    expect((da['refs'] as Rec[]).map((r) => r['url'])).toContain('https://en.wikipedia.org/wiki/VMF-541');
    expect(String(da['source'])).toContain('lead の既定 L1');
    // 史実メモ（出典の説明。画面に出ない鍵）は艇の番号を残し、間違いの「特攻で 323・300」を直した
    expect(String(m['historical_note'])).toMatch(/PT-490・PT-492.*PT-323 は 12-10 に特攻機で失われた（別の夜）/);
    expect(String(m['historical_note'])).not.toContain('300');
  });
  it('画面の文（題・場所・目的・成功・Briefing の史実メモ・月・夜明けの空・岸・退く呼び名・敵の名）に人名・階級つきの呼び方・PT の番号が無い', () => {
    const m = missionOf('us_06');
    const p = m['v0_1_prototype'] as Rec;
    const enemies = (gameData.enemies.enemies as unknown as Rec[]).filter((e) => ['ijn_destroyer_mutsuki_enemy', 'ijn_subchaser', 'ijn_transport'].includes(String(e['id'])));
    const screen = [m['title_ja'], m['place'], m['objective'], m['success'], m['briefing_note_ja'], m['moon_label_ja'], (m['dawn_air'] as Rec)['label_ja'], (p['coast'] as Rec)['label_ja'], (p['dawn_withdraw'] as Rec)['force_ja'], ...enemies.map((e) => e['name_ja'])].map(String);
    expect(screen.length).toBe(12);
    for (const t of screen) {
      expect(PT_NUMBER_RE.test(t), t).toBe(false);
      for (const name of PERSON_DENYLIST) expect(t, name).not.toContain(name);
      expect(RANK_RE.test(t), t).toBe(false);
    }
    expect(String(m['briefing_note_ja'])).toContain('米PT 2隻'); // 隻数は番号でない
    expect([PT_NUMBER_RE.test('PT-490'), PT_NUMBER_RE.test('PT 492'), PT_NUMBER_RE.test('PT323'), PT_NUMBER_RE.test('米PT 2隻'), PT_NUMBER_RE.test('PT 15隻')]).toEqual([true, true, true, false, false]);
    // 任務の記録の全部・新しい 2 記録・組んだ世界に人名・階級つきの呼び方・有名な艇の番号が無い
    const texts = [JSON.stringify(m), ...enemies.map((e) => JSON.stringify(e)), ...[false, true].map((hard) => JSON.stringify(buildWorldSetup(gameData, 'us_06', { hard })))];
    for (const t of texts) {
      for (const name of PERSON_DENYLIST) expect(t, name).not.toContain(name);
      expect(RANK_RE.test(t), t.match(RANK_RE)?.[0]).toBe(false);
      expect(FAMOUS_BOAT_RE.test(t), t.match(FAMOUS_BOAT_RE)?.[0]).toBe(false);
    }
  });
});
