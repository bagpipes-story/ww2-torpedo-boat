import { describe, expect, it } from 'vitest';
import {
  DAWN_AIR_ENEMY,
  DAWN_AIR_NONE,
  DAWN_AIR_OWN,
  createDawnResult,
  createDawnTelemetry,
  dawnAirCode,
  dawnAirFromData,
  dawnConditionJa,
  dawnReached,
  daylightS,
  isDawnAirRecord,
  seaLightStep,
  type DawnAirRecord,
} from '../src/core/dawn-air';
import type { BoatState } from '../src/core/boat-motion';
import { WorldDawn, type DawnStrike, type DawnWorldView } from '../src/systems/world-dawn';
import { DAY_SEA_COLOR, SEA_LIGHT_PRE_S, SEA_LIGHT_STEPS } from '../src/config/dawn-config';
import { briefingNumbers, buildWorldSetup, type WorldSetup } from '../src/systems/world-setup';
import { gameData, getPrototypeMission } from '../src/config/game-data';
import { enemyNameJa, getBriefingRecord, riskLabelJa } from '../src/config/briefing-data';
import { playableMissionIds } from '../src/config/campaign-data';
import { checkPlayableDawn, getAirStrikeParams, getDawnAir, getDawnStrikeEventRecord, getStrikeAircraftRecord } from '../src/config/dawn-data';
import { DAWN_STRIKE_EVENT_ID, dawnStrikeFromData, isDawnStrikeBlock, isDawnStrikeEventRecord, isStrikeAircraftRecord } from '../src/core/air-strike-data';
import { briefingRows } from '../src/core/briefing';
import { PERSON_DENYLIST, RANK_RE } from './person-denylist';

/** spec §6.1 の us_01（検査の形の見本。data に入れるのは別の段） */
const US01: DawnAirRecord = {
  control: 'enemy',
  confidence: 'medium',
  play_as: 'enemy',
  enemy_ships_at_dawn: 'stay',
  label_ja: '昼の空は敵（日本の水上機）',
  refs: [{ url: 'https://pacificwrecks.com/ship/ptboat/PT-34.html', claim: '1942-04-09、讃岐丸の零式水上観測機 4 機が昼に PT-34 を爆撃・掃射した' }],
  source: 'historical (control・enemy_ships_at_dawn) / design (v0.6.1。play_as・label_ja)',
};
const rec = (over: Record<string, unknown>): DawnAirRecord => ({ ...US01, ...over }) as DawnAirRecord;

describe('夜明けの時計（v0.6.1。core/dawn-air）', () => {
  it('dawnReached は durationS − stepTimeS ≤ 0（等号で達した）。scene の max(0, d − t) ≤ 0 と同じステップ', () => {
    expect(dawnReached(220, 219.99)).toBe(false);
    expect(dawnReached(220, 220)).toBe(true);
    expect(dawnReached(220, 220.01)).toBe(true);
    // 固定ステップ（1/60 秒）を積んだ時計でも scene の式と一致する
    let t = 0;
    for (let i = 0; i < 60 * 30; i++) {
      t += 1 / 60;
      expect(dawnReached(8, t)).toBe(Math.max(0, 8 - t) <= 0);
    }
  });
  it('daylightS は夜明け前 0、夜明け後は経過の実秒', () => {
    expect(daylightS(220, 0)).toBe(0);
    expect(daylightS(220, 220)).toBe(0);
    expect(daylightS(220, 250.5)).toBeCloseTo(30.5, 9);
  });
  it('seaLightStep: 窓の前は 0、単調に増え、夜明けちょうどで half、夜明け後 postS を過ぎると steps', () => {
    const d = 150;
    const pre = 20;
    const post = 6;
    const steps = 16;
    expect(seaLightStep(0, d, pre, post, steps)).toBe(0);
    expect(seaLightStep(d - pre - 0.01, d, pre, post, steps)).toBe(0);
    expect(seaLightStep(d - pre, d, pre, post, steps)).toBe(0);
    expect(seaLightStep(d - 0.001, d, pre, post, steps)).toBe(7);
    expect(seaLightStep(d, d, pre, post, steps)).toBe(8);
    expect(seaLightStep(d + 0.001, d, pre, post, steps)).toBe(9);
    expect(seaLightStep(d + post, d, pre, post, steps)).toBe(16);
    expect(seaLightStep(d + 1000, d, pre, post, steps)).toBe(16);
    let prev = 0;
    const seen = new Set<number>();
    for (let t = 0; t <= d + 30; t += 1 / 60) {
      const k = seaLightStep(t, d, pre, post, steps);
      expect(Number.isInteger(k)).toBe(true);
      expect(k).toBeGreaterThanOrEqual(prev);
      expect(k).toBeLessThanOrEqual(steps);
      if (t < d) expect(k).toBeLessThan(steps / 2);
      prev = k;
      seen.add(k);
    }
    // 0〜16 を通る（half の 8 は夜明けちょうどの時刻だけ。固定ステップの時計はちょうどに載らないので、ここでは 7 → 9 と進む）
    for (let k = 0; k <= steps; k++) if (k !== steps / 2) expect(seen.has(k), `step ${k}`).toBe(true);
    // 窓 0 秒（すぐ明るくなる）でも 0 除算にならない
    expect(seaLightStep(d - 1, d, 0, 0, steps)).toBe(0);
    expect(seaLightStep(d, d, 0, 0, steps)).toBe(16);
  });
  it('dawnConditionJa・dawnAirCode・テレメトリと Result の初期値', () => {
    const cond = (playAs: 'enemy' | 'own' | 'contested', shipsAtDawn: 'stay' | 'retire' | 'hide' | 'none' = 'stay', retireEdge: 'north' | 'south' | 'east' | 'west' | null = null, mirrored = false, control: 'enemy' | 'own' | 'contested' = playAs): string =>
      dawnConditionJa({ control, playAs, shipsAtDawn, retireEdge }, mirrored);
    expect(cond('enemy')).toBe('（以後は空襲）');
    expect(cond('own')).toBe('（昼の空は味方）');
    expect(cond('enemy', 'none')).toBe('（以後は空襲）');
    // 夜明けの敵艦（v0.6.2）: retire は退く方角（左右反転の夜は東西を入れ替える）、hide は大発。縁の無い retire（遊べない任務の形）は付けない
    expect(cond('own', 'retire', 'north')).toBe('（昼の空は味方・敵は北へ退く）');
    expect(cond('own', 'retire', 'north', true)).toBe('（昼の空は味方・敵は北へ退く）');
    expect(cond('own', 'retire', 'east')).toBe('（昼の空は味方・敵は東へ退く）');
    expect(cond('own', 'retire', 'east', true)).toBe('（昼の空は味方・敵は西へ退く）');
    expect(cond('enemy', 'retire', 'south')).toBe('（以後は空襲・敵は南へ退く）');
    expect(cond('own', 'retire', null)).toBe('（昼の空は味方）');
    expect(cond('enemy', 'hide')).toBe('（以後は空襲・大発は岸へ隠れる）');
    expect(cond('contested', 'hide')).toBe('（大発は岸へ隠れる）');
    expect(cond('contested')).toBe('');
    // 史実の空が争奪で味方の空として遊ぶ（jp_05。v0.6.3 レビュー）は「おおむね」。争奪で敵の空として遊ぶ（us_03）は今までどおり
    expect(cond('own', 'none', null, false, 'contested')).toBe('（昼の空はおおむね味方）');
    expect(cond('enemy', 'stay', null, false, 'contested')).toBe('（以後は空襲）');
    expect(dawnAirCode('enemy')).toBe(DAWN_AIR_ENEMY);
    expect(dawnAirCode('own')).toBe(DAWN_AIR_OWN);
    expect(dawnAirCode('contested')).toBe(DAWN_AIR_NONE);
    expect(new Set([DAWN_AIR_NONE, DAWN_AIR_OWN, DAWN_AIR_ENEMY]).size).toBe(3);
    const t = createDawnTelemetry();
    expect(t.reached).toBe(false);
    expect(t.air).toBe(DAWN_AIR_NONE);
    expect(t.plane).toBe(-1);
    expect(t.restS).toBeNaN();
    expect(t.inboundDistM).toBeNaN();
    expect(createDawnTelemetry()).not.toBe(t);
    expect(t.ships).toBe('none');
    expect([t.retireJa, t.forceJa]).toEqual(['', '']);
    expect(createDawnResult()).toEqual({ reached: false, caughtOutside: false, daylightS: 0, timeLeftAtEndS: 0, air: DAWN_AIR_NONE, labelJa: '', strike: null, shipsWithdrawn: 0, transportWithdrawn: false, retireJa: '', bargesHidden: 0 });
  });
});

describe('dawn_air の検査（v0.6.1。spec §6.6）', () => {
  it('正しい記録は読める（refs は写す）', () => {
    expect(isDawnAirRecord(US01)).toBe(true);
    const a = dawnAirFromData(US01, 'us_01', true);
    // retireEdge・retireForceJa は v0.6.2（dawn_air だけからは決まらない。retire の遊べる任務で config/dawn-data の getDawnAir が dawn_withdraw から入れる）
    expect(a).toEqual({ control: 'enemy', confidence: 'medium', playAs: 'enemy', shipsAtDawn: 'stay', labelJa: '昼の空は敵（日本の水上機）', refs: US01.refs, retireEdge: null, retireForceJa: '', fleetGoneClears: false });
    expect(a.refs[0]).not.toBe(US01.refs[0]);
    // 争奪は遊べない任務なら何として遊ぶ予定でもよい
    for (const playAs of ['enemy', 'own', 'contested']) expect(dawnAirFromData(rec({ control: 'contested', play_as: playAs }), 'us_06', false).playAs).toBe(playAs);
    expect(dawnAirFromData(rec({ control: 'own', play_as: 'own' }), 'us_02', true).playAs).toBe('own');
  });
  it('形の崩れは isDawnAirRecord が false', () => {
    expect(isDawnAirRecord(null)).toBe(false);
    expect(isDawnAirRecord([])).toBe(false);
    expect(isDawnAirRecord(rec({ control: 1 }))).toBe(false);
    expect(isDawnAirRecord(rec({ refs: 'x' }))).toBe(false);
    expect(isDawnAirRecord(rec({ refs: [{ url: 'https://a.b' }] }))).toBe(false);
    const missing = { ...US01 } as Record<string, unknown>;
    delete missing['source'];
    expect(isDawnAirRecord(missing)).toBe(false);
  });
  it('悪い値は任務の id を付けて例外: 列挙の外・空の refs・http・食い違い・遊べる任務の争奪・知らないキー・空の文・historical の無い source', () => {
    const bad: [Record<string, unknown>, boolean][] = [
      [{ control: 'allied' }, true],
      [{ confidence: 'certain' }, true],
      [{ play_as: 'neutral' }, false],
      [{ enemy_ships_at_dawn: 'flee' }, true],
      [{ refs: [] }, true],
      [{ refs: [{ url: 'http://pacificwrecks.com/ship/ptboat/PT-34.html', claim: 'x' }] }, true],
      [{ refs: [{ url: 'https://', claim: 'x' }] }, true],
      [{ refs: [{ url: 'https://a.example/x', claim: ' ' }] }, true],
      [{ refs: [{ url: 'https://a.example/x', claim: 'x', note: 'y' }] }, true],
      [{ play_as: 'own' }, false], // enemy の空を own で遊ぶ
      [{ control: 'own', play_as: 'enemy' }, false],
      [{ control: 'contested', play_as: 'contested' }, true], // 争奪の遊び方はまだ無い
      [{ cap: { arrival_s: 60 } }, false], // 知らないキー（cap はまだ無い）
      [{ label_ja: '' }, true],
      [{ source: 'design (v0.6.1)' }, true],
    ];
    for (const [over, playable] of bad) {
      const r = rec(over);
      expect(isDawnAirRecord(r)).toBe(true);
      expect(() => dawnAirFromData(r, 'us_01', playable), JSON.stringify(over)).toThrow(/us_01/);
    }
  });
});

describe('WorldDawn（v0.6.1。夜明けのラッチ）', () => {
  const boat = (): BoatState => ({ x: 0, y: 0, headingDeg: 0, speedMps: 0 }) as BoatState;
  function view(): DawnWorldView & { stepTimeS: number; atHome: boolean } {
    return { stepTimeS: 0, atHome: false, grounded: false, boat: { state: boat(), sinking: false }, escort: null, enemy: { withdraw: () => undefined } };
  }
  function fakeStrike(log: string[]): DawnStrike {
    return {
      state: null as never,
      p: null as never,
      active: false,
      start: () => log.push('start'),
      step: () => log.push('step'),
      updateVisuals: (_p, e) => log.push(e === null ? 'vis' : 'vis+escort'),
      destroy: () => log.push('destroy'),
    };
  }
  const setup = { durationS: 10, dawnAir: { playAs: 'enemy' } } as WorldSetup;
  // 海の明るさ（ui/sea-light）はカメラの背景色を段が変わったときだけ変える。その呼び出しを数える
  const bg: unknown[] = [];
  const scene = { cameras: { main: { setBackgroundColor: (c?: unknown) => bg.push(c) } } } as never;

  it('夜明け前は何もしない。夜明けの最初のステップで 1 回だけ立ち、輪の外なら caughtOutside、空襲を始める。step は夜明け後だけ', () => {
    const log: string[] = [];
    const d = new WorldDawn(scene, setup, fakeStrike(log));
    const w = view();
    for (let i = 0; i < 599; i++) {
      w.stepTimeS += 1 / 60;
      d.latch(w);
      d.step(1 / 60, w);
    }
    expect(d.reached).toBe(false);
    expect(log).toEqual([]);
    w.stepTimeS = 10;
    d.latch(w);
    d.step(1 / 60, w);
    expect(d.reached).toBe(true);
    expect(d.caughtOutside).toBe(true);
    expect(d.air).toBe(DAWN_AIR_ENEMY); // 任務の dawn_air.play_as（v0.6.1 stage ③ から）
    w.atHome = true; // 後から輪に入っても夜明けの瞬間の値のまま
    w.stepTimeS = 11;
    d.latch(w);
    d.step(1 / 60, w);
    expect(d.caughtOutside).toBe(true);
    d.updateVisuals(w);
    d.destroy();
    expect(log).toEqual(['start', 'step', 'step', 'vis', 'destroy']);
  });
  it('夜明けに輪の中なら caughtOutside は false。空襲の無い任務（null）でもラッチは立つ', () => {
    const d = new WorldDawn(scene, setup, null);
    const w = view();
    w.atHome = true;
    w.stepTimeS = 10.01;
    d.latch(w);
    d.step(1 / 60, w);
    d.updateVisuals(w);
    expect(d.reached).toBe(true);
    expect(d.caughtOutside).toBe(false);
    expect(d.strikeActive).toBe(false);
    d.destroy();
  });
  it('海の明るさ（ui/sea-light）: 夜明けの 20 秒前までは背景色に触らない。そこから段が変わったときだけ（最大 16 回）、だんだん明るく、最後は昼の色。destroy で透明に戻す', () => {
    bg.length = 0;
    const d = new WorldDawn(scene, { durationS: 30, dawnAir: { playAs: 'own' } } as WorldSetup, null);
    const w = view();
    const firstAt: number[] = [];
    for (let k = 0; k <= 40 * 60; k++) {
      w.stepTimeS = k / 60;
      const n = bg.length;
      d.updateVisuals(w);
      if (bg.length > n && firstAt.length === 0) firstAt.push(w.stepTimeS);
    }
    expect(firstAt[0]).toBeGreaterThanOrEqual(30 - SEA_LIGHT_PRE_S);
    expect(bg.length).toBeGreaterThanOrEqual(SEA_LIGHT_STEPS - 1);
    expect(bg.length).toBeLessThanOrEqual(SEA_LIGHT_STEPS);
    const blue = (c: unknown): number => (c as number) & 0xff;
    for (let i = 1; i < bg.length; i++) expect(blue(bg[i])).toBeGreaterThan(blue(bg[i - 1]));
    expect(bg[bg.length - 1]).toBe(parseInt(DAY_SEA_COLOR.slice(1), 16));
    d.destroy();
    expect(bg[bg.length - 1]).toBeUndefined(); // 引数なし＝Phaser の既定（透明）
    const night = new WorldDawn(scene, { durationS: 300, dawnAir: { playAs: 'own' } } as WorldSetup, null);
    bg.length = 0;
    for (let k = 0; k < 600; k++) {
      w.stepTimeS = k / 60;
      night.updateVisuals(w);
    }
    night.destroy();
    expect(bg).toEqual([]); // 夜（夜明けの 20 秒より前）は一度も触らない
  });
});

// ---------- data（v0.6.1 stage ③。missions_seed の dawn_air × 13・dawn_strike × 2、enemies の空襲の機体 × 2、risk_events の dawn_air_strike） ----------

type Rec = Record<string, unknown>;
const clone = (): typeof gameData => JSON.parse(JSON.stringify(gameData)) as typeof gameData;
const missionsOf = (d: typeof gameData): Rec[] => d.missionsSeed.missions as unknown as Rec[];
const byId = (d: typeof gameData, id: string): Rec => missionsOf(d).find((m) => m['id'] === id)!;
const protoOf = (d: typeof gameData, id: string): Rec => byId(d, id)['v0_1_prototype'] as Rec;
const ALL_IDS = missionsOf(gameData).map((m) => m['id'] as string);
const PLAYABLE_IDS = [...playableMissionIds(gameData, 'us_pt'), ...playableMissionIds(gameData, 'jp_hard')];

describe('dawn_air の data（v0.6.1。13 任務すべて。spec §2・§6.1）', () => {
  it('13 任務すべてに読める dawn_air があり、§2 の表の値（control / confidence / play_as / enemy_ships_at_dawn / label_ja）', () => {
    expect(ALL_IDS.length).toBe(13);
    const table: Record<string, [string, string, string, string, string]> = {
      us_01: ['enemy', 'medium', 'enemy', 'stay', '昼の空は敵（日本の水上機）'],
      us_02: ['own', 'high', 'own', 'retire', '昼の空は味方（ヘンダーソン基地）'],
      us_03: ['contested', 'medium', 'enemy', 'hide', '昼の空は争奪（日本機の昼の空襲）'], // v0.6.1 実機 1 回目: ユーザーの判断で空襲あり
      us_04: ['contested', 'medium', 'own', 'retire', '昼の空はおおむね味方（エアソルス）'],
      us_05: ['own', 'medium', 'own', 'retire', '昼の空は味方（護衛空母）'],
      us_06: ['contested', 'medium', 'contested', 'retire', '昼の空は争奪（特攻とコルセア）'],
      us_07: ['own', 'high', 'own', 'none', '昼の空は味方（連合軍）'],
      jp_01: ['enemy', 'medium', 'enemy', 'none', '昼の空は敵（ヘンダーソン基地）'], // v0.6.4: 米PT は夜明けに core/pt-boats のラッチで去る（retire は駆逐艦の規則で、無い任務には置けない）
      jp_02: ['enemy', 'low', 'enemy', 'none', '昼の空は敵（米の飛行艇）'],
      jp_03: ['enemy', 'high', 'enemy', 'none', '昼の空は敵（第38任務部隊）'],
      jp_04: ['contested', 'medium', 'enemy', 'retire', '昼の空は敵（タクロバンのコルセア）'],
      jp_05: ['contested', 'medium', 'own', 'none', '昼の空はおおむね味方（ラバウルの零戦）'], // v0.6.3: 1944-02-18 ラバウル沖（空は争奪・零戦はまだいる）
      jp_06: ['enemy', 'high', 'enemy', 'stay', '昼の空は敵（米艦載機）'],
    };
    expect(new Set(ALL_IDS)).toEqual(new Set(Object.keys(table)));
    for (const id of ALL_IDS) {
      const a = getDawnAir(gameData, id);
      expect([a.control, a.confidence, a.playAs, a.shipsAtDawn, a.labelJa], id).toEqual(table[id]);
      expect(a.refs.length, id).toBeGreaterThanOrEqual(1);
      // 出典は検索の抜粋だけ（本文未読）と source に書く
      expect(String((byId(gameData, id)['dawn_air'] as Rec)['source']), id).toContain('抜粋のみ・本文未読');
    }
  });
  it('遊べる任務（us_01・us_02・us_03・jp_01・jp_02・jp_05・jp_06）: play_as は enemy か own（争奪の遊び方はまだ無い）。世界の組み立てに dawnAir が入り、夜明けの符号が決まる', () => {
    expect(PLAYABLE_IDS).toEqual(['us_01', 'us_02', 'us_03', 'jp_01', 'jp_02', 'jp_05', 'jp_06']); // v0.6.4: jp_01（ヘンダーソン基地の制空下。空襲あり）。v0.6.7: jp_02（米の飛行艇。夜明けは 4 機）
    const want: Record<string, string> = { us_01: 'enemy', us_02: 'own', us_03: 'enemy', jp_01: 'enemy', jp_02: 'enemy', jp_05: 'own', jp_06: 'enemy' };
    for (const id of PLAYABLE_IDS) {
      expect(() => checkPlayableDawn(gameData, id)).not.toThrow();
      const s = buildWorldSetup(gameData, id);
      expect(s.dawnAir.playAs, id).toBe(want[id]);
      expect(new WorldDawn({ cameras: { main: {} } } as never, s, null).air, id).toBe(want[id] === 'enemy' ? DAWN_AIR_ENEMY : DAWN_AIR_OWN);
    }
    expect(() => checkPlayableDawn(gameData, 'us_06')).toThrow(/遊べる任務でない/);
    expect(() => getDawnAir(gameData, 'nope')).toThrow(/nope/);
  });
  it('遊べる任務: play_as が enemy ⇔ v0_1_prototype.dawn_strike ⇔ hazards の dawn_air_strike。機体の faction はキャンペーンの enemy_faction（米PT IJN・日本 USN）', () => {
    const factions = Object.fromEntries((gameData.missionsSeed.campaigns as unknown as Rec[]).map((c) => [c['id'], c['enemy_faction']]));
    expect(factions).toEqual({ us_pt: 'IJN', jp_hard: 'USN' });
    for (const id of PLAYABLE_IDS) {
      const m = getPrototypeMission(gameData, id);
      const enemy = getDawnAir(gameData, id).playAs === 'enemy';
      expect(m.dawnStrike !== null, id).toBe(enemy);
      expect(m.hazards.includes(DAWN_STRIKE_EVENT_ID), id).toBe(enemy);
      if (!m.dawnStrike) continue;
      const plane = getStrikeAircraftRecord(gameData, m.dawnStrike.aircraft_id, id);
      expect(plane.faction, id).toBe(factions[byId(gameData, id)['campaign'] as string]);
      expect(m.dawnStrike.count, id).toBe(4);
    }
    expect(getPrototypeMission(gameData, 'us_01').dawnStrike).toEqual({
      aircraft_id: 'ijn_f1m2_pete',
      count: 4,
      count_source: expect.stringContaining('PT-34') as unknown as string,
      from_bearing_deg: 90,
      escort_target_planes: [1, 3],
      source: expect.stringContaining('design (v0.6.1') as unknown as string,
    });
    expect(getPrototypeMission(gameData, 'jp_06').dawnStrike).toMatchObject({ aircraft_id: 'us_carrier_aircraft', count: 4, from_bearing_deg: 90, escort_target_planes: [] });
    // 夜の揺らぎ（rollNight は 1 件ごとに 1 回引く）に入れない＝夜の配置は v0.6.0 と同じ
    for (const id of ALL_IDS) {
      const night = (byId(gameData, id)['v0_1_prototype'] as Rec | undefined)?.['night'] as Rec | undefined;
      expect((night?.['optional_hazards'] as string[] | undefined) ?? [], id).not.toContain(DAWN_STRIKE_EVENT_ID);
    }
  });
  it('遊べる任務の規則が崩れた data は任務の id を付けて例外（世界の組み立ても止まる）', () => {
    const cases: [string, (d: typeof gameData) => void, RegExp][] = [
      ['us_01', (d) => delete protoOf(d, 'us_01')['dawn_strike'], /dawn_strike/],
      ['us_02', (d) => (protoOf(d, 'us_02')['dawn_strike'] = protoOf(gameData, 'us_01')['dawn_strike']), /dawn_strike/],
      ['jp_06', (d) => (protoOf(d, 'jp_06')['hazards'] = ['enemy_ship_gunfire_or_ram', 'grounding']), /hazards/],
      ['us_02', (d) => (protoOf(d, 'us_02')['hazards'] as string[]).push(DAWN_STRIKE_EVENT_ID), /hazards/],
      ['us_03', (d) => (protoOf(d, 'us_03')['hazards'] = (protoOf(d, 'us_03')['hazards'] as string[]).filter((h) => h !== DAWN_STRIKE_EVENT_ID)), /hazards/],
      ['us_01', (d) => ((protoOf(d, 'us_01')['dawn_strike'] as Rec)['aircraft_id'] = 'us_carrier_aircraft'), /faction/],
      ['jp_06', (d) => ((protoOf(d, 'jp_06')['dawn_strike'] as Rec)['aircraft_id'] = 'ijn_seaplane_jake'), /strike/],
      ['jp_06', (d) => ((protoOf(d, 'jp_06')['dawn_strike'] as Rec)['aircraft_id'] = 'no_such_plane'), /no_such_plane/],
      ['us_01', (d) => ((protoOf(d, 'us_01')['dawn_strike'] as Rec)['wave_count'] = 3), /知らないキー/],
      ['us_01', (d) => ((protoOf(d, 'us_01')['dawn_strike'] as Rec)['count'] = 0), /count/],
      ['us_01', (d) => ((protoOf(d, 'us_01')['dawn_strike'] as Rec)['escort_target_planes'] = [1.5]), /escort_target_planes/],
      ['us_01', (d) => ((protoOf(d, 'us_01')['night'] as Rec)['optional_hazards'] as string[]).push(DAWN_STRIKE_EVENT_ID), /optional_hazards/],
      ['us_03', (d) => ((byId(d, 'us_03')['dawn_air'] as Rec)['play_as'] = 'contested'), /contested/],
      ['us_01', (d) => delete byId(d, 'us_01')['dawn_air'], /dawn_air/],
      ['us_01', (d) => delete (d.missionsSeed.campaigns[0] as Rec)['enemy_faction'], /enemy_faction/],
      ['jp_06', (d) => delete (d.riskEvents.events.find((e) => e.id === DAWN_STRIKE_EVENT_ID) as unknown as Rec)['params'], /dawn_air_strike/],
    ];
    for (const [id, breakIt, re] of cases) {
      const d = clone();
      breakIt(d);
      expect(() => getDawnAir(d, id), `${id} ${re}`).toThrow(re);
      expect(() => buildWorldSetup(d, id), `${id} ${re}`).toThrow();
    }
    // 遊べない任務の dawn_air も 13 任務すべてで要る（争奪はまだ遊べない任務なら何として遊ぶ予定でもよい）
    const noAir = clone();
    delete byId(noAir, 'us_04')['dawn_air'];
    expect(() => getDawnAir(noAir, 'us_04')).toThrow(/us_04/);
  });
  it('enemies.json の空襲の機体 3 つ（零観・二式水戦・米艦載機）と risk_events.json の dawn_air_strike（spec §6.3・§6.4 の値。夜の水上機と同じ被害・速さ）', () => {
    const want = { run_speed_kt: 120, release_altitude_m: 200, bomb: { count: 2, damage: 35, blast_radius_m: 25, accuracy_cep_m: 32, fire_chance: 0.3, engine_damage_chance: 0.2 } };
    const pete = getStrikeAircraftRecord(gameData, 'ijn_f1m2_pete', 'us_01');
    const carrier = getStrikeAircraftRecord(gameData, 'us_carrier_aircraft', 'jp_06');
    const rufe = getStrikeAircraftRecord(gameData, 'ijn_a6m2n_rufe', 'us_03'); // v0.6.1 実機 2 回目: 舟艇狩りは二式水戦（値は零観と同じ）
    expect([pete.faction, pete.name_ja, carrier.faction, carrier.name_ja, rufe.faction, rufe.name_ja]).toEqual(['IJN', '零式水上観測機', 'USN', '米艦載機（F6F 相当）', 'IJN', '二式水上戦闘機']);
    expect(pete.strike).toEqual(want);
    expect(rufe.strike).toEqual(want);
    expect(carrier.strike).toEqual(want);
    const jake = gameData.enemies.enemies.find((e) => e.id === 'ijn_seaplane_jake') as unknown as { speed_kt: number; bomb: Rec };
    expect(pete.strike.run_speed_kt).toBe(jake.speed_kt);
    for (const k of ['damage', 'blast_radius_m', 'fire_chance', 'engine_damage_chance']) expect(pete.strike.bomb[k as keyof typeof pete.strike.bomb], k).toBe(jake.bomb[k]);
    expect(isStrikeAircraftRecord(jake)).toBe(false); // 夜の水上機は strike を持たない
    const ev = getDawnStrikeEventRecord(gameData);
    // v0.6.1 実機 1 回目でテンポを上げた（spawn_m 3600・first_run_s 12・run_gap_s 3・wave_rest_s 28 → 3000・9・2・16）。実機 2 回目で間隔 2 → 2.2
    expect(ev.params).toMatchObject({ spawn_m: 3000, run_radius_m: 600, first_run_s: 9, run_gap_s: 2.2, wave_rest_s: 16, leave_s: 2.5, spawn_offsets_deg: [-30, -10, 10, 30], wave_rotate_deg: 90, aim_turn_min_deg_s: 0.5 });
    const raw = ev as unknown as Rec;
    expect([raw['count'], raw['share'], raw['enemy_direct'], raw['version']]).toEqual([0, 0, true, 'v0.6.1']);
    expect(riskLabelJa(gameData, DAWN_STRIKE_EVENT_ID)).toBe('夜明けの空襲');
    // 形の検査
    expect(isDawnStrikeEventRecord({ ...ev, id: 'enemy_aircraft' })).toBe(false);
    expect(isDawnStrikeEventRecord({ ...ev, params: { ...ev.params, spawn_offsets_deg: 'x' } })).toBe(false);
    expect(isStrikeAircraftRecord({ ...pete, strike: { ...pete.strike, bomb: { count: 2 } } })).toBe(false);
    expect(isDawnStrikeBlock(null)).toBe(false);
    expect(() => dawnStrikeFromData({ aircraft_id: 'ijn_f1m2_pete' }, 'us_01')).toThrow(/us_01/);
    // 空襲の無い任務は null（空襲のある任務の値は tests/air-strike.test.ts）
    expect(getAirStrikeParams(gameData, getPrototypeMission(gameData, 'us_02'), 5, { halfLengthM: 12, halfBeamM: 3 }, null)).toBeNull();
  });
  it('夜明けの後に時間切れは無いが、止まって待つと燃料のアイドル消費で必ず漂流する: 満載から停止で 1,500 秒未満（遊べる任務すべて）', () => {
    const idleS: Record<string, number> = {};
    for (const id of PLAYABLE_IDS) {
      const s = buildWorldSetup(gameData, id);
      expect(s.fuelCurve.idleGph, id).toBeGreaterThan(0);
      // 燃料は game 秒（体感秒 × time_scale）で減る。漂流は燃料 0 で止まって 1.5 秒（core/mission-flow）
      idleS[id] = (s.fuelAllotmentGal / s.fuelCurve.idleGph) * 3600 / s.timeScale;
      expect(idleS[id] + 1.5, id).toBeLessThan(1500);
      expect(idleS[id], id).toBeGreaterThan(s.durationS); // 夜明けの前に漂流はしない
    }
    // 燃料が尽きるまでの実秒（spec §3.1 の概算 1,340・1,370・1,070・1,220。us_03 は 30 gal で 1,080、v0.6.1 実機 1 回目の 36 gal で 1,296。v0.6.3 の jp_05 は 23 gal で 1,449、実機 1 回目の 32 gal・アイドル 0.14 で 1,440。
    // v0.6.4 の jp_01 は 19 gal で 1,453（T-38 のアイドル 800/8.5 × 0.1 = 9.4118 gal/h: 19 / 9.4118 × 720 = 1453.4999… → 1453。上限いっぱい）。v0.6.7 の jp_02 は jp_05 と同じ T-14・32 gal で 1,440
    expect(Object.values(idleS).map((x) => Math.round(x))).toEqual([1344, 1368, 1296, 1453, 1440, 1440, 1224]);
  });
  it('人物名を出さない（CLAUDE.md §11）: dawn_air の label_ja・refs の claim・source、dawn_strike・空襲の機体・dawn_air_strike の文', () => {
    const texts: string[] = [];
    for (const id of ALL_IDS) {
      const a = byId(gameData, id)['dawn_air'] as Rec;
      texts.push(String(a['label_ja']), String(a['source']));
      for (const r of a['refs'] as Rec[]) texts.push(String(r['claim']));
      const ds = (byId(gameData, id)['v0_1_prototype'] as Rec | undefined)?.['dawn_strike'] as Rec | undefined;
      if (ds) texts.push(String(ds['count_source']), String(ds['source']));
    }
    for (const id of ['ijn_f1m2_pete', 'ijn_a6m2n_rufe', 'us_carrier_aircraft']) texts.push(JSON.stringify(gameData.enemies.enemies.find((e) => e.id === id)));
    texts.push(JSON.stringify(gameData.riskEvents.events.find((e) => e.id === DAWN_STRIKE_EVENT_ID)));
    expect(texts.length).toBeGreaterThan(13 * 3);
    for (const t of texts) {
      for (const name of PERSON_DENYLIST) expect(t).not.toContain(name);
      expect(RANK_RE.test(t), t.slice(0, 40)).toBe(false);
    }
  });
});

describe('Briefing の条件と危険（v0.6.1。spec §8.4）', () => {
  const rowsOf = (id: string): string[] => {
    const s = buildWorldSetup(gameData, id);
    return briefingRows(getBriefingRecord(gameData, id), briefingNumbers(s), (e) => enemyNameJa(gameData, e), (h) => riskLabelJa(gameData, h)).map((r) => r.text);
  };
  it('条件: 「夜明けまで N 秒」の後ろに（以後は空襲）／（昼の空は味方）と夜明けの敵艦（v0.6.2: us_02 は敵が北へ退く、us_03 は大発が岸へ隠れる）。危険の最後に「夜明けの空襲」（敵の制空下の任務だけ）', () => {
    expect(rowsOf('us_01')[5]).toBe('夜明けまで 180 秒（以後は空襲） ・ 燃料 40 gal ・ 魚雷 4 本');
    expect(rowsOf('jp_06')[5]).toBe('夜明けまで 160 秒（以後は空襲） ・ 燃料 16 gal ・ 魚雷 2 本');
    expect(rowsOf('us_02')[5]).toBe('夜明けまで 150 秒（昼の空は味方・敵は北へ退く） ・ 燃料 38 gal ・ 魚雷 4 本');
    expect(rowsOf('us_03')[5]).toBe('夜明けまで 160 秒（以後は空襲・大発は岸へ隠れる） ・ 燃料 36 gal ・ 砲\u00a040mm・37mm・20mm・12.7mm');
    expect(rowsOf('us_01')[4]).toBe('暴風、敵艦艇の砲撃・衝突、座礁、夜明けの空襲');
    expect(rowsOf('jp_06')[4]).toBe('敵艦艇の砲撃・衝突、座礁、夜明けの空襲');
    expect(rowsOf('us_02')[4]).not.toContain('夜明けの空襲');
    expect(rowsOf('us_03')[4]).toBe('敵艦艇の砲撃・衝突、敵沿岸砲、座礁、夜明けの空襲');
    expect(briefingNumbers(buildWorldSetup(gameData, 'us_01')).dawnJa).toBe(dawnConditionJa({ control: 'enemy', playAs: 'enemy', shipsAtDawn: 'stay', retireEdge: null }));
    // 出撃の seed の夜（左右反転の夜を含む）でも us_02 は北のまま（反転は東西だけ）
    let mirroredNights = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = buildWorldSetup(gameData, 'us_02', { sortie: { missionId: 'us_02', seed, raid: false, choice: 0, stayHit: false, hard: false, historical: false } });
      if (s.night.mirrored) mirroredNights++;
      expect(briefingNumbers(s).dawnJa, `seed ${seed}`).toBe('（昼の空は味方・敵は北へ退く）');
    }
    expect(mirroredNights).toBeGreaterThan(0);
  });
});
