// v0.8.2 S0（spec-v0820 §3・§5.1・§5.4）: us_05「スリガオ海峡・最初の接触」の世界の数値（JSON 全体）と今夜の乱数の回数を snapshot に固める
// （ノーマル／ハード × 史実モードあり／なし × seed 1・12345）。snapshot は v0.8.2 S0 の木で作った。us_05 の setup は S1〜S4 で鍵が増えうる（S2b の絵の鍵・S3 のつまみ）ので、
// 書き換える時は CHANGELOG に段と理由を書く（ほかの 11 任務の setup の snapshot は -u しない）。Briefing の行は入れない（S4 で変わる）。
// 今夜の揺らぎ（+16）は 5 回（列の 1 件 3・大発の先頭 1・反転 1。ノーマル・ハードとも）。遊べるのは S4 から（v0.8.2 S4 で playable_from "v0.8.2"）。
// あわせて: us_05 の種の直し（場所・月・敵・目的・成功・史実メモ）と、画面の文に人名・階級つきの呼び方・PT の番号が無い（CLAUDE.md §11・spec-v0820 §4.14）。
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
  const s = buildWorldSetup(gameData, 'us_05', { sortie: directSortie('us_05', seed, 'none', hard, historical), hard });
  const draws = spy.mock.calls.length;
  spy.mockRestore();
  return { s, draws };
}

describe('us_05 の setup の snapshot（v0.8.2 S0 の木）', () => {
  afterEach(() => vi.restoreAllMocks());
  it.each(CASES)('ハード %s 史実 %s seed %i: 世界の数値・今夜の乱数の回数', (hard, historical, seed) => {
    const label = `us_05 ${hard ? 'hard' : 'normal'}${historical ? ' historical' : ''} seed ${seed}`;
    const { s, draws } = build(hard, historical, seed);
    expect(JSON.stringify(s, null, 1)).toMatchSnapshot(`${label} setup`);
    expect(draws).toBe(5);
    expect(s.night.enemyOffsets.length).toBe(1);
    // 列だけの隊（enemy_start なし・D-C2）: 隊の出発点は無く、撃沈の達成は全隻（R3）。S0 の世界は 7 隻（ハード 8）とも ijn_destroyer の形
    expect([s.mission.enemyId, s.mission.enemyStart, s.mission.enemyStarts.length, s.mission.objectiveSinkCount, s.destroyer!.starts.length, s.destroyer!.objectiveSinks, s.destroyer!.spec.lengthM, s.destroyer!.baseDetectM]).toEqual(['ijn_destroyer', null, 0, null, 0, hard ? 8 : 7, 118, 2000]);
    // 燃料は S3 のつまみ ①（34 → 24 gal）を v0.8.2 IP3 で戻した（実機 3 回目のユーザー「燃料は24galから34galに増やしてください」）
    expect([s.mission.torpedoId, s.mission.moon, s.mission.type, s.mission.durationS, s.fuelAllotmentGal, s.mainWeapon]).toEqual(['us_mk13', 'half', 'recon_and_attack', 270, 34, 'torpedo']);
    expect([s.barges, s.ptBoats, s.convoy, s.escort, s.raid, s.storm, s.friendly, s.seaplane, s.transport, s.airStrike]).toEqual([null, null, null, null, null, null, null, null, null, null]);
    const t = s.transit!;
    expect([t.ships, t.outbound, t.unloadS, t.spacingS, t.coverLeavesWithOutbound, t.vilaLabelJa, t.rejoinS, t.column!.length]).toEqual([hard ? 8 : 7, null, 0, 0, false, 'スリガオ海峡', 40, hard ? 8 : 7]);
    const o = s.night.enemyOffsets[0]!;
    const table = hard ? [5, 20, 35, 50, 80, 85, 101, 109] : [5, 20, 35, 50, 80, 85, 101];
    expect(t.enterAtS!.length).toBe(table.length);
    t.enterAtS!.forEach((x, i) => expect(x).toBeCloseTo(table[i]! - o.dx / (t.speedMps * gameData.hitRateModel.world.time_scale), 9)); // 東へずれた列は早く入る
    expect(t.inbound.laneY).toBe(2400 + o.dy);
    expect(s.enemyFrom).toEqual({ x: 150, y: 2800 + o.dy });
    expect([s.dawnAir.playAs, s.dawnAir.retireEdge, s.dawnAir.retireForceJa, s.dawnAir.fleetGoneClears]).toEqual(['own', 'east', '日本の艦隊', false]);
    expect([s.radar!.model, s.radar!.fit, s.shores!.north.labels[0]!.labelJa, s.shores!.south.gapLabelJa]).toEqual(['so_late', 'own', 'ボホール島', 'ミンダナオ海']);
    expect(s.recon).toEqual({ trackS: 20, identifyClass: 'battleship', radioFailChance: 0.35, radioMinDamage: 20, relay: { x: 1600, y: 500, radiusM: 250, radius2: 62500, labelJa: '隣の分隊' } });
    expect(s.hazardsTonight).toEqual(['enemy_ship_gunfire_or_ram', 'radio_failure']);
    for (const k of ['engine', 'gunboat', 'patrolAir', 'landing', 'allyDestroyer', 'evac', 'anchors', 'backdrop', 'seaplaneNight', 'pickets'] as const) expect(k in s, k).toBe(false);
    expect(JSON.stringify(build(hard, historical, seed).s)).toBe(JSON.stringify(s));
  });
  it('今夜の揺らぎ: 列の 1 件で x ±300（入りの秒 ±6.48）・y ±150・針路なし・反転なし（seed 1〜40）', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = build(seed % 2 === 0, false, seed).s;
      const o = s.night.enemyOffsets[0]!;
      expect(s.night.mirrored).toBe(false);
      expect(Math.abs(o.dx) <= 300 && Math.abs(o.dy) <= 150 && o.dh === 0, String(seed)).toBe(true);
      expect(Math.abs(s.transit!.enterAtS![0]! - 5)).toBeLessThanOrEqual(300 / 46.296 + 1e-9);
    }
  });
});

describe('us_05 の種の直し（spec-v0820 §3）と人名・PT の番号（CLAUDE.md §11・spec-v0820 §4.14）', () => {
  it('場所はボホール島沖・半月・史実の大艦隊（ユーザーの U1）・目的と成功の文・夜明けは own のまま（L1）・題と日付と順と type はそのまま・S4 から遊べる（v0.8.2 S4 で playable_from "v0.8.2"）', () => {
    const m = missionOf('us_05');
    expect([m['title_ja'], m['date'], m['order'], m['type'], m['place'], m['moon'], m['moon_label_ja'], m['torpedo_type'], m['player_boat']]).toEqual(['スリガオ海峡・最初の接触', '1944-10-24', 5, 'recon_and_attack', 'ミンダナオ海（ボホール島沖）', 'half', '半月（西に低い）', 'us_mk13', 'us_elco80']);
    expect(m['enemies']).toEqual(['ijn_destroyer', 'ijn_destroyer', 'ijn_destroyer', 'ijn_destroyer', 'ijn_cruiser_mogami', 'ijn_battleship_fuso', 'ijn_battleship_fuso']);
    expect((m['v0_1_prototype'] as Rec)['enemies']).toEqual(m['enemies']);
    expect([m['objective'], m['success']]).toEqual(['戦艦2・重巡1を含む日本艦隊がスリガオ海峡へ向かう。レーダーで捉え、戦艦を目で確かめて報告し、撃たれながら生きて帰れ', '報告して帰投（戦艦を見て、レーダーで20秒追う）']);
    expect(m['playable_from']).toBe('v0.8.2'); // v0.8.2 S4（spec §4.13 D-H6・lead の L44）: 米PT のタブの 6 枚目。目的は S4 で駆逐艦の隻数を外した（ハードの「駆逐艦 ×5」と食い違わない）
    const da = m['dawn_air'] as Rec;
    expect([da['control'], da['play_as'], da['enemy_ships_at_dawn'], da['label_ja']]).toEqual(['own', 'own', 'retire', '昼の空は味方（護衛空母）']);
    expect(String(da['source'])).toContain('lead の既定 L1');
    // 史実メモ（出典の説明。画面に出ない鍵）は艇の番号を残し、最初の接触の相手は戦艦の組・第三部隊への命中は 0
    expect(String(m['historical_note'])).toMatch(/PT-131 のレーダーで戦艦の組（山城・扶桑・時雨）.*隣の分隊の PT-127 が報告を中継.*第三部隊への命中は 0（阿武隈への 1 本は別の部隊・PT-137）/);
    expect(String(m['historical_note'])).not.toContain('軽巡');
  });
  it('画面の文（題・場所・目的・成功・Briefing の史実メモ・月・夜明けの空・岸・切れ目・列の去る先・退く呼び名・中継の輪の名・艦名・敵の名・危険の名）に人名・階級つきの呼び方・PT の番号が無い', () => {
    const m = missionOf('us_05');
    const p = m['v0_1_prototype'] as Rec;
    const tr = p['transit'] as Rec;
    const sh = p['shores'] as Rec;
    const enemies = (gameData.enemies.enemies as unknown as Rec[]).filter((e) => ['ijn_destroyer', 'ijn_cruiser_mogami', 'ijn_battleship_fuso'].includes(String(e['id'])));
    const risk = (gameData.riskEvents.events as unknown as Rec[]).filter((e) => (p['hazards'] as string[]).includes(String(e['id'])));
    const screen = [
      m['title_ja'], m['place'], m['objective'], m['success'], m['briefing_note_ja'], m['moon_label_ja'], (m['dawn_air'] as Rec)['label_ja'],
      ...['north', 'south'].flatMap((k) => ((sh[k] as Rec)['labels'] as Rec[]).map((l) => l['label_ja'])), (sh['south'] as Rec)['gap_label_ja'], tr['vila_label_ja'],
      (p['dawn_withdraw'] as Rec)['force_ja'], ((p['recon'] as Rec)['relay'] as Rec)['label_ja'],
      ...[...(tr['column'] as Rec[]), ...(((p['hard'] as Rec)['extra_column']) as Rec[])].map((c) => c['name_ja']), ...enemies.map((e) => e['name_ja']), ...risk.map((e) => e['label_ja']),
    ].map(String);
    expect(screen.length).toBe(26);
    for (const t of screen) {
      expect(PT_NUMBER_RE.test(t), t).toBe(false);
      for (const name of PERSON_DENYLIST) expect(t, name).not.toContain(name);
      expect(RANK_RE.test(t), t).toBe(false);
    }
    expect(String(m['briefing_note_ja'])).toContain('PT 39隻'); // 隻数は番号でない
    // 任務の記録の全部・新しい 2 記録と radio_failure・組んだ世界に人名・階級つきの呼び方・有名な艇の番号が無い（艇の番号は出典の説明＝historical_note・source にだけある）
    const texts = [JSON.stringify(m), ...enemies.map((e) => JSON.stringify(e)), ...risk.map((e) => JSON.stringify(e)), ...[false, true].map((hard) => JSON.stringify(buildWorldSetup(gameData, 'us_05', { hard })))];
    for (const t of texts) {
      for (const name of PERSON_DENYLIST) expect(t, name).not.toContain(name);
      expect(RANK_RE.test(t), t.match(RANK_RE)?.[0]).toBe(false);
      expect(FAMOUS_BOAT_RE.test(t), t.match(FAMOUS_BOAT_RE)?.[0]).toBe(false);
    }
    // 組んだ世界（画面と Result が読む値）には PT の番号が無い（番号は data の説明の鍵にだけ）
    for (const hard of [false, true]) {
      const s = buildWorldSetup(gameData, 'us_05', { hard });
      const shown = [s.transit!.vilaLabelJa, ...s.transit!.column!.map((k) => k.nameJa), s.recon!.relay.labelJa, s.dawnAir.retireForceJa, s.dawnAir.labelJa];
      for (const t of shown) expect(PT_NUMBER_RE.test(t), t).toBe(false);
    }
  });
});
