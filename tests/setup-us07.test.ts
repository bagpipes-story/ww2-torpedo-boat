// v0.8.5 S0（spec-v0850 §2.2・§4・§7 の S0）: us_07「D-Day・生存者救助」の世界の数値（JSON 全体）と今夜の乱数の回数を snapshot に固める
// （ノーマル／ハード × 史実モードあり／なし × seed 1・12345）。snapshot は v0.8.5 S0 の木で作った（新しいファイル。ほかの 8 任務の setup の snapshot は -u しない）。
// us_07 の setup は S1〜S4 で鍵が増えうるので、書き換える時は CHANGELOG に段と理由を書く。Briefing の行は入れない（S4 で変わる）。
// 今夜の揺らぎ（+16）はノーマル 6 回（S ボートの隊 1 件の x・y・針路 3・大発の先頭 1・砲台 1・反転 1）・ハード 8 回（砲台が 3 つ＝v0.8.5 S3 で 2 つ目・S3b で 3 つ目を足した）。遊べるのは S5 から（playable_from はまだ無い）。
// あわせて: us_07 の画面の文（題・場所・目的・成功・史実メモ・月・夜明け・岸・浅瀬・ハードの文・敵の名・船の名）に人名・階級つきの呼び方・PT の番号が無い（CLAUDE.md §11）。
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
  const s = buildWorldSetup(gameData, 'us_07', { sortie: directSortie('us_07', seed, 'none', hard, historical), hard });
  const draws = spy.mock.calls.length;
  spy.mockRestore();
  return { s, draws };
}

describe('us_07 の setup の snapshot（v0.8.5 S0 の木）', () => {
  afterEach(() => vi.restoreAllMocks());
  it.each(CASES)('ハード %s 史実 %s seed %i: 世界の数値・今夜の乱数の回数', (hard, historical, seed) => {
    const label = `us_07 ${hard ? 'hard' : 'normal'}${historical ? ' historical' : ''} seed ${seed}`;
    const { s, draws } = build(hard, historical, seed);
    expect(JSON.stringify(s, null, 1)).toMatchSnapshot(`${label} setup`);
    expect(draws).toBe(hard ? 8 : 6);
    expect(s.night.enemyOffsets.length).toBe(1);
    // S ボートの隊（米PT の記録の形。ノーマル 2・ハード 3）・Higgins・Mk 13（狙う艦なし）・昼・空は味方
    expect([s.mission.type, s.mission.enemyId, s.mission.playerBoatId, s.mission.torpedoId, s.mission.moon, s.mission.mainWeapon, s.ptBoats!.count, s.vis.moonFactor]).toEqual(['rescue', 'de_sboat_enemy', 'us_higgins78', 'us_mk13', 'day', 'guns', hard ? 3 : 2, 1.8]);
    expect([s.ptBoats!.baseDetectM, s.ptBoats!.detectFromS, s.ptBoats!.hullHp, s.ptBoats!.retreatHp, s.ptBoats!.leaveHeadingDeg, s.ptBoats!.gun.effectiveM, s.guns !== null, s.guns!.magazine !== null]).toEqual([2000, 60, 150, 90, 270, 600, true, true]);
    expect([s.destroyer, s.barges, s.convoy, s.escort, s.raid, s.storm, s.friendly, s.seaplane, s.airStrike, s.transport]).toEqual([null, null, null, null, null, null, null, null, null, null]);
    expect([s.dawnAir.playAs, s.dawnAir.shipsAtDawn, s.dawnAir.retireEdge, s.durationS]).toEqual(['own', 'none', null, 300]);
    // 砲台（任務の 210 mm）・岸・浅瀬・救助・機雷原
    expect([s.shoreBatteries.length, s.shoreBattery!.x, s.shoreBattery!.y, s.shoreBattery!.gun.id, s.mission.coast!.label, s.coastEdgeY]).toEqual([hard ? 3 : 1, 1600, 4600, 'skoda_21cm', 'コタンタン半島（サン＝マルクフ〜ユタ・ビーチ）', 3750]);
    expect([s.rescue!.total, s.rescue!.capacity, s.rescue!.fitch.labelJa, s.minefield!.count]).toEqual([60, 20, 'フィッチ', hard ? 32 : 24]);
    expect(s.hazardsTonight).toEqual(['shore_battery', 'mine', 'enemy_ship_gunfire_or_ram', 'grounding']);
    for (const k of ['engine', 'gunboat', 'patrolAir', 'landing', 'allyDestroyer', 'evac', 'radar', 'transit', 'shores', 'anchors', 'backdrop', 'seaplaneNight', 'pickets', 'recon'] as const) expect(k in s, k).toBe(false);
    expect(JSON.stringify(build(hard, historical, seed).s)).toBe(JSON.stringify(s));
  });
  it('今夜の揺らぎ: S ボートの隊は線に沿って ±200・南北 ±100・針路なし・反転なし・砲台は動かない（seed 1〜40）', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = build(seed % 2 === 0, false, seed).s;
      expect(s.night.mirrored).toBe(false);
      const o = s.night.enemyOffsets[0]!;
      expect(Math.abs(o.dx) <= 200 && Math.abs(o.dy) <= 100 && o.dh === 0, String(seed)).toBe(true);
      expect(s.shoreBattery!.x).toBe(1600);
    }
  });
});

describe('us_07 の種の直し（spec-v0850 §2.2）と人名・PT の番号（CLAUDE.md §11）', () => {
  it('題・日付・場所・type はそのまま、順は年代順の 5・Higgins・昼・S ボート 2 隻（ハード 3）・危険・救助の時間 300 秒・夜明けの空は own のまま・遊べるのは S5 から（playable_from はまだ無い）', () => {
    const m = missionOf('us_07');
    expect([m['title_ja'], m['date'], m['place'], m['type'], m['order'], m['player_boat'], m['torpedo_type'], m['moon'], m['moon_label_ja'], m['duration_min'], m['success']]).toEqual(['D-Day・生存者救助', '1944-06-06', 'ノルマンディー沖（ユタ・ビーチ）', 'rescue', 5, 'us_higgins78', 'us_mk13', 'day', '昼（日の出の後）', 5, '生存者40名以上をフィッチへ渡して帰投']);
    expect([m['enemies'], m['hazards'], m['playable_from']]).toEqual([['de_sboat_enemy', 'de_sboat_enemy'], ['shore_battery', 'mine', 'enemy_ship_gunfire_or_ram', 'grounding', 'friendly_fire'], undefined]);
    expect([missionOf('us_05')['order'], missionOf('us_06')['order']]).toEqual([6, 7]);
    const da = m['dawn_air'] as Rec;
    expect([da['control'], da['play_as'], da['enemy_ships_at_dawn'], da['label_ja']]).toEqual(['own', 'own', 'none', '昼の空は味方（連合軍）']);
    // S ボートは史実に無い想定（ユーザーの決め 2026-11-24「両方で出す」）と画面と記録に書く
    expect(String(m['objective'])).toContain('西からSボートが来る（ゲームの想定）');
    expect(String(m['briefing_note_ja'])).toContain('この朝、Sボートはユタ沖に来ていない。このゲームの襲撃は想定。');
    expect(String(((m['v0_1_prototype'] as Rec)['hard'] as Rec)['objective_ja'])).toContain('Sボート3隻が来る（ゲームの想定）');
    expect(String(m['historical_note'])).toMatch(/両方で出す.*史実に無い想定/);
    // 記録は食い違いを残す（死因・61／約 60 名）
    expect(String(m['historical_note'])).toMatch(/触雷.*21 cm 弾.*食い違う.*約 60 名.*61 名/);
  });
  it('画面の文に人名・階級つきの呼び方・PT の番号が無い。記録の全部と組んだ世界に人名・階級・有名な艇の番号が無い', () => {
    const m = missionOf('us_07');
    const p = m['v0_1_prototype'] as Rec;
    const hard = p['hard'] as Rec;
    const r = p['rescue'] as Rec;
    const ships = r['ships'] as Rec;
    const enemy = (gameData.enemies.enemies as unknown as Rec[]).find((e) => e['id'] === 'de_sboat_enemy')!;
    const screen = [m['title_ja'], m['place'], m['objective'], m['success'], m['briefing_note_ja'], m['moon_label_ja'], (m['dawn_air'] as Rec)['label_ja'], (p['coast'] as Rec)['label_ja'], (p['shallows'] as Rec[])[0]!['label_ja'],
      hard['objective_ja'], hard['success_ja'], hard['note_ja'], enemy['name_ja'], enemy['name_short_ja'], (ships['fitch'] as Rec)['label_ja'], (ships['corry'] as Rec)['label_ja']].map(String);
    expect(screen.length).toBe(16);
    for (const t of screen) {
      expect(PT_NUMBER_RE.test(t), t).toBe(false);
      for (const name of PERSON_DENYLIST) expect(t, name).not.toContain(name);
      expect(RANK_RE.test(t), t).toBe(false);
    }
    expect(String(m['briefing_note_ja'])).toContain('PT 1隻'); // 隻数は番号でない
    expect(String(m['historical_note'])).toContain('PT-199'); // 記録（画面に出ない）は艇の番号を残す
    const texts = [JSON.stringify(m), JSON.stringify(enemy), ...[false, true].map((h) => JSON.stringify(buildWorldSetup(gameData, 'us_07', { hard: h })))];
    for (const t of texts) {
      for (const name of PERSON_DENYLIST) expect(t, name).not.toContain(name);
      expect(RANK_RE.test(t), t.match(RANK_RE)?.[0]).toBe(false);
      expect(FAMOUS_BOAT_RE.test(t), t.match(FAMOUS_BOAT_RE)?.[0]).toBe(false);
    }
  });
});
