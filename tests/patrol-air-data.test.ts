// 夜の哨戒機（v0.6.7。jp_02「孤島の哨戒」。spec-v067 §B.1・§B.3〜§B.7・§C.7・§G.1）の data と起動時の検査:
// 3 つの記録（enemies.json の us_patrol_bomber・risk_events.json の patrol_air・missions_seed.json の jp_02）の値と source、C1〜C9 の境の両側（壊れた data）、
// wake_trigger_s の一致、WorldSetup.patrolAir は jp_02 だけ（他の任務 × ノーマル／ハードでは鍵ごと出ない）、Briefing の moonLabelJa も jp_02 だけ。
import { describe, expect, it, vi } from 'vitest';
import { gameData, getVisibilityParams } from '../src/config/game-data';
import { getBriefingRecord, riskLabelJa } from '../src/config/briefing-data';
import { PATROL_AIR_EXCLUSIVE_KEYS, getPatrolAirParams, patrolAirSetupPart } from '../src/config/patrol-air-mission-data';
import { SeededRng } from '../src/core/rng';
import { isSeaplaneDataRecord } from '../src/core/seaplane-data';
import { directSortie } from '../src/core/sortie';
import { PATROL_AIR_BLOCK_KEYS, isPatrolAircraftRecord, patrolAirBlockFromData, patrolAirEventFromData, patrolAirParamsFromData, type PatrolAircraftRecord } from '../src/core/patrol-air-data';
import { buildWorldSetup } from '../src/systems/world-setup';
import { PERSON_DENYLIST, RANK_RE } from './person-denylist';

type Rec = Record<string, unknown>;
type Data = typeof gameData;
const clone = (): Data => JSON.parse(JSON.stringify(gameData)) as Data;
const enemyOf = (d: Data, id: string): Rec => (d.enemies.enemies as unknown as Rec[]).find((e) => e['id'] === id)!;
const eventOf = (d: Data, id: string): Rec => (d.riskEvents.events as unknown as Rec[]).find((e) => e['id'] === id)!;
const paramsOf = (d: Data): Rec => eventOf(d, 'patrol_air')['params'] as Rec;
const sortieOf = (d: Data): Rec => paramsOf(d)['sortie'] as Rec;
const missionOf = (d: Data, id: string): Rec => (d.missionsSeed.missions as unknown as Rec[]).find((m) => m['id'] === id)!;
const protoOf = (d: Data, id: string): Rec => missionOf(d, id)['v0_1_prototype'] as Rec;
const blockOf = (d: Data): Rec => protoOf(d, 'jp_02')['patrol_air'] as Rec;
const PROTO_IDS = (gameData.missionsSeed.missions as unknown as Rec[]).filter((m) => m['v0_1_prototype']).map((m) => m['id'] as string);
const EXCERPT = 'WebSearch の抜粋のみ・本文未読';
const AT = /jp_02\.v0_1_prototype\.patrol_air: /;
/** 1 つ変えた data で jp_02 の夜の哨戒機を組む */
const build = (edit: (d: Data) => void): (() => unknown) => {
  const d = clone();
  edit(d);
  return () => getPatrolAirParams(d, 'jp_02');
};

describe('3 つの記録の値と source（spec §B.1・§B.3・§B.5）', () => {
  it('enemies.json の us_patrol_bomber: us_henderson_aircraft の直後・空襲の値は us_carrier_aircraft の写し・patrol 6000／1500・水上機の形ではない', () => {
    const ids = gameData.enemies.enemies.map((e) => e.id);
    expect(ids.indexOf('us_patrol_bomber')).toBe(ids.indexOf('us_henderson_aircraft') + 1);
    const b = enemyOf(gameData, 'us_patrol_bomber');
    expect([b['faction'], b['name_ja'], b['patrol']]).toEqual(['USN', '米飛行艇（PB2Y 相当）', { wake_detect_m: 6000, lock_m: 1500 }]);
    expect(b['strike']).toEqual(enemyOf(gameData, 'us_carrier_aircraft')['strike']);
    expect(isPatrolAircraftRecord(b)).toBe(true);
    expect(isSeaplaneDataRecord(b)).toBe(false);
    for (const k of ['guns', 'flare', 'detection']) expect(b[k], k).toBeUndefined();
    const src = b['source'] as Record<string, string>;
    expect(Object.keys(src)).toEqual(['type', 'run_speed_kt', 'release_altitude_m', 'bomb.count', 'patrol', 'others']);
    expect(src['type']).toMatch(/^historical \(/);
    for (const c of [EXCERPT, '（high）', '（medium）', '損失なし']) expect(src['type']).toContain(c);
    for (const k of ['run_speed_kt', 'release_altitude_m', 'bomb.count', 'patrol', 'others']) expect(src[k], k).toMatch(/^design \(/);
    for (const k of ['release_altitude_m', 'patrol']) expect(src[k], k).toContain(EXCERPT);
    expect(src['others']).toContain('ゲーム上の想定');
  });
  it('risk_events.json の patrol_air: dawn_air_strike の直後・段と秒・夜の出撃 1 波 2 機・短い名は「夜の哨戒機」・wake_trigger_s は水上機と同じ', () => {
    const ids = gameData.riskEvents.events.map((e) => e.id);
    expect(ids.indexOf('patrol_air')).toBe(ids.indexOf('dawn_air_strike') + 1);
    const e = eventOf(gameData, 'patrol_air');
    expect([e['count'], e['share'], e['enemy_direct'], e['game_event'], e['version']]).toEqual([0, 0, true, 'patrol_air', 'v0.6.7']);
    const { source, sortie, ...secs } = paramsOf(gameData);
    expect(secs).toEqual({ first_pass_s: 3, wake_trigger_s: 3, sweep_gap_s: 12, orbit_s: 8, leave_s: 2.5, hud_stop_margin_s: 3 });
    expect(sortie).toEqual({ spawn_m: 1500, run_radius_m: 600, first_run_s: 5, run_gap_s: 2.2, wave_rest_s: 16, leave_s: 2.5, spawn_offsets_deg: [-10, 10], wave_rotate_deg: 0, aim_turn_min_deg_s: 0.5 });
    expect(source).toMatch(/^design \(v0\.6\.7。/);
    expect(paramsOf(gameData)['wake_trigger_s']).toBe((eventOf(gameData, 'enemy_aircraft')['params'] as Rec)['wake_trigger_s']);
    expect(riskLabelJa(gameData, 'patrol_air')).toBe('夜の哨戒機');
  });
  it('missions_seed の jp_02: 月没後（dark）・文の差し替え・v0_1_prototype（2 機・撃たない・220 秒・32 gal・北東から南西へ）・playable_from はまだ無い', () => {
    const m = missionOf(gameData, 'jp_02');
    expect([m['playable_from'], m['moon'], m['moon_label_ja'], m['hazards']]).toEqual([undefined, 'dark', '月没後', ['enemy_aircraft', 'storm']]);
    expect(String(m['historical_note'])).toContain(EXCERPT);
    expect(String(m['historical_note'])).not.toContain('撃沈された');
    const da = m['dawn_air'] as Rec;
    expect([da['control'], da['confidence'], da['play_as'], da['enemy_ships_at_dawn'], da['label_ja']]).toEqual(['enemy', 'low', 'enemy', 'none', '昼の空は敵（米の飛行艇）']);
    expect(String(da['source'])).toContain('v0.6.7 から遊べる');
    expect(String(da['source'])).not.toContain('遊べる世界はまだ無い');
    expect(String(da['source'])).not.toContain('昼の大空襲');
    const p = protoOf(gameData, 'jp_02');
    expect([p['enemies'], p['main_weapon'], p['duration_s'], p['fuel_allotment_gal'], p['shallows'], p['hazards']]).toEqual([['us_patrol_bomber', 'us_patrol_bomber'], 'none', 220, 32, [], ['patrol_air', 'dawn_air_strike']]);
    expect(Object.keys(blockOf(gameData))).toEqual([...PATROL_AIR_BLOCK_KEYS]);
    expect([blockOf(gameData)['count'], blockOf(gameData)['from_bearing_deg'], blockOf(gameData)['pass_rotate_deg'], blockOf(gameData)['radar_passes']]).toEqual([2, 56, 90, 1]);
    const ds = p['dawn_strike'] as Rec;
    expect([ds['aircraft_id'], ds['count'], ds['from_bearing_deg'], ds['escort_target_planes']]).toEqual(['us_patrol_bomber', 4, 56, []]);
    for (const k of ['night', 'hard', 'storm', 'enemy_aircraft', 'friendly_aircraft']) expect(p[k], k).toBeUndefined();
    for (const [k, v] of Object.entries(p)) if (k.endsWith('_source')) expect(String(v), k).toMatch(/^design \(v0\.6\.7。/);
    const note = String(m['briefing_note_ja']);
    for (const t of [note, String(m['objective']), String(m['success'])]) {
      for (const name of PERSON_DENYLIST) expect(t).not.toContain(name);
      expect(RANK_RE.test(t)).toBe(false);
      expect(t).not.toContain(' ');
    }
    expect(note).toContain('ゲーム上の想定');
    const t14 = (gameData.boats.boats.find((b) => b.id === 'jp_t14') as unknown as { source: Record<string, string> }).source['fuel_idle_ratio']!;
    expect(t14).toContain('v0.6.7 の jp_02');
    expect(t14).not.toContain('世界はまだ無い');
  });
});

describe('組み立て（config/patrol-air-mission-data。spec §C.1・§C.7）', () => {
  it('jp_02 の門番と夜の出撃の値（月没後の視程 900 m・308.64 m/体感秒・付近の捜索 8 秒で 157.2°・2 機 × 2 発・北東から）', () => {
    const p = getPatrolAirParams(gameData, 'jp_02')!;
    expect({ ...p.gate, orbitDegPerS: Number(p.gate.orbitDegPerS.toFixed(4)) }).toEqual({
      planes: 2, flightMps: 308.64, wakeDetectM: 6000, lockM: 1500, nearM: 900, runRadiusM: 600, firstPassS: 3, wakeTriggerS: 3, sweepGapS: 12, orbitS: 8, leaveS: 2.5, hudStopMarginS: 3,
      fromBearingDeg: 56, passRotateDeg: 90, radarPasses: 1, orbitDegPerS: 19.6486, quietKt: 14,
    });
    expect(p.gate.orbitDegPerS * p.gate.orbitS).toBeCloseTo(157.19, 2);
    const s = p.sortie;
    expect([s.planes, s.bombsPerPlane, s.spawnM, s.runRadiusM, s.firstRunS, s.runGapS, s.spawnOffsetsDeg, s.fromJa, s.nameJa]).toEqual([2, 2, 1500, 600, 5, 2.2, [-10, 10], '北東', '米飛行艇（PB2Y 相当）']);
    expect(s.firstRunS + s.runS).toBeCloseTo(6.944, 3);
  });
  it('WorldSetup.patrolAir は jp_02 だけ（他の任務はノーマル・ハードとも鍵ごと出ない）。patrolOff で消え、史実モードでも同じ。Briefing の moonLabelJa も jp_02 だけ', () => {
    for (const id of PROTO_IDS) {
      for (const hard of [false, true]) expect(Object.keys(buildWorldSetup(gameData, id, { hard })).includes('patrolAir'), `${id} ${hard}`).toBe(id === 'jp_02');
      expect(Object.keys(getBriefingRecord(gameData, id)).includes('moonLabelJa'), id).toBe(id === 'jp_02');
    }
    const s = buildWorldSetup(gameData, 'jp_02');
    expect(s.patrolAir).toEqual(getPatrolAirParams(gameData, 'jp_02'));
    expect([s.baseDetectM, s.torpedoCapacity, s.mainWeapon, s.airStrike!.planes, s.mission.enemyStart]).toEqual([900, 0, 'none', 4, null]);
    expect(buildWorldSetup(gameData, 'jp_02', { historical: true }).patrolAir).toEqual(s.patrolAir);
    expect('patrolAir' in buildWorldSetup(gameData, 'jp_02', { patrolOff: true })).toBe(false);
    expect(patrolAirSetupPart(gameData, 'us_02', {})).toEqual({});
    expect(getBriefingRecord(gameData, 'jp_02').moonLabelJa).toBe('月没後');
    expect(() => getBriefingRecord(((d) => ((missionOf(d, 'jp_02')['moon_label_ja'] = ''), d))(clone()), 'jp_02')).toThrow(/jp_02\.moon_label_ja/);
  });
  it('今夜の乱数（spec §H の N5）: jp_02 の出撃は夜の揺らぎ（seed+16）を 1 回も引かない（night block が無い。ノーマル・ハード × seed 1・12345）', () => {
    for (const hard of [false, true]) {
      for (const seed of [1, 12345]) {
        const spy = vi.spyOn(SeededRng.prototype, 'next');
        const s = buildWorldSetup(gameData, 'jp_02', { sortie: directSortie('jp_02', seed, 'none', hard, false), hard });
        expect([spy.mock.calls.length, s.hazardsTonight, s.absentHazards], `${hard} ${seed}`).toEqual([0, ['patrol_air', 'dawn_air_strike'], []]);
        spy.mockRestore();
      }
    }
  });
});

describe('起動時の検査の境の両側（壊れた data。spec §C.7）', () => {
  it('C1 block の鍵ちょうど 7 個・radar_passes は 0 以上の整数', () => {
    expect(build((d) => (blockOf(d)['radar_pass'] = 1))).toThrow(/patrol_air: 知らない鍵 radar_pass/);
    expect(build((d) => delete blockOf(d)['pass_rotate_deg'])).toThrow(/patrol_air: pass_rotate_deg が無い/);
    expect(build((d) => (blockOf(d)['radar_passes'] = -1))).toThrow(/radar_passes は 0 以上の整数/);
    expect(build((d) => (blockOf(d)['radar_passes'] = 1.5))).toThrow(/radar_passes は 0 以上の整数/);
    expect(build((d) => (blockOf(d)['radar_passes'] = 0))).not.toThrow();
  });
  it('C2 機体（strike と patrol 付き・faction・夜明けの機と同じ）', () => {
    expect(build((d) => (blockOf(d)['aircraft_id'] = 'us_carrier_aircraft'))).toThrow(/aircraft_id（us_carrier_aircraft）が enemies\.json に strike.*patrol/);
    expect(build((d) => (enemyOf(d, 'us_patrol_bomber')['faction'] = 'IJN'))).toThrow(/faction（IJN）.*enemy_faction（USN）/);
    expect(build((d) => ((protoOf(d, 'jp_02')['dawn_strike'] as Rec)['aircraft_id'] = 'us_carrier_aircraft'))).toThrow(/dawn_strike\.aircraft_id（us_carrier_aircraft）と同じ/);
  });
  it('C3 count は 1〜4 で enemies と spawn_offsets_deg と同じ数', () => {
    expect(build((d) => (protoOf(d, 'jp_02')['enemies'] = ['us_patrol_bomber']))).toThrow(/enemies（us_patrol_bomber）は aircraft_id.*count（2）個/);
    expect(build((d) => (protoOf(d, 'jp_02')['enemies'] = ['us_patrol_bomber', 'us_carrier_aircraft']))).toThrow(/count（2）個/);
    expect(build((d) => (sortieOf(d)['spawn_offsets_deg'] = [-10, 10, 30]))).toThrow(/spawn_offsets_deg（3 個）は count（2）と同じ数/);
    expect(build((d) => ((blockOf(d)['count'] = 5), (protoOf(d, 'jp_02')['enemies'] = Array(5).fill('us_patrol_bomber'))))).toThrow(/count は 1〜4 の整数（5）/);
  });
  it('C4 0 < run_radius_m < 視程 < lock_m ≤ spawn_m < wake_detect_m（半月・満月は止まる）', () => {
    for (const moon of ['half', 'full']) expect(build((d) => (missionOf(d, 'jp_02')['moon'] = moon)), moon).toThrow(/自艇の視程（(1500|1950) m/);
    expect(build((d) => (sortieOf(d)['spawn_m'] = 1499))).toThrow(AT);
    expect(build((d) => ((sortieOf(d)['spawn_m'] = 6000), ((enemyOf(d, 'us_patrol_bomber')['patrol'] as Rec)['lock_m'] = 6000)))).toThrow(/≤ sortie\.spawn_m（6000）< patrol\.wake_detect_m（6000）/);
  });
  it('C5 秒は正（first_pass_s は 0 以上）', () => {
    expect(build((d) => (paramsOf(d)['orbit_s'] = 0))).toThrow(/params\.orbit_s は正の秒/);
    expect(build((d) => (paramsOf(d)['first_pass_s'] = -1))).toThrow(/first_pass_s は 0 以上/);
    expect(build((d) => (paramsOf(d)['first_pass_s'] = 0))).not.toThrow();
    expect(build((d) => (paramsOf(d)['sweep_gap'] = 12))).toThrow(/params に知らない鍵 sweep_gap/);
    expect(build((d) => (sortieOf(d)['spawn'] = 1))).toThrow(/params\.sortie に知らない鍵 spawn/);
    expect(build((d) => (d.riskEvents.events = d.riskEvents.events.filter((e) => e.id !== 'patrol_air')))).toThrow(/risk_events\.json の patrol_air）: 記録か params が無い/);
  });
  it('C6 置き場: 艦艇・水上機・味方機・暴風と同居しない・撃たない・危険に patrol_air・夜ごとにしない・敵の制空下の夜明けの空襲', () => {
    const donor: Record<string, string> = { enemy_start: 'us_02', barges: 'us_03', pt_boats: 'jp_05', convoy: 'jp_01', escort: 'us_01', transport: 'us_02', shore_battery: 'us_03', enemy_aircraft: 'us_02', friendly_aircraft: 'us_02', storm: 'us_02' };
    for (const k of PATROL_AIR_EXCLUSIVE_KEYS) {
      const f = build((d) => (protoOf(d, 'jp_02')[k] = JSON.parse(JSON.stringify(protoOf(gameData, donor[k]!)[k]))));
      expect(f, k).toThrow(/jp_02/);
      if (['escort', 'shore_battery', 'enemy_aircraft', 'friendly_aircraft', 'storm'].includes(k)) expect(f, k).toThrow(new RegExp(`patrol_air: v0_1_prototype\\.${k} と同居しない`));
    }
    expect(build((d) => (protoOf(d, 'jp_02')['main_weapon'] = 'torpedo'))).toThrow(/main_weapon は none/);
    expect(build((d) => (protoOf(d, 'jp_02')['hazards'] = ['dawn_air_strike']))).toThrow(/hazards に patrol_air が要る/);
    expect(build((d) => (protoOf(d, 'jp_02')['night'] = { ...(protoOf(gameData, 'jp_05')['night'] as Rec), optional_hazards: ['patrol_air'] }))).toThrow(/night\.optional_hazards に入れない/);
    expect(build((d) => ((missionOf(d, 'jp_02')['dawn_air'] as Rec)['play_as'] = 'own'))).toThrow(/dawn_air\.play_as が enemy/);
    expect(build((d) => delete protoOf(d, 'jp_02')['dawn_strike'])).toThrow(/dawn_strike（夜明けの空襲）のある任務だけ/);
  });
  it('C7 F1（予告 ≥ 秒読みの余白 + 10 秒・発見から投下 ≥ 6.9 秒）・F2 の 2 つの限り・F9（1 発では沈まない）', () => {
    expect(build((d) => (paramsOf(d)['hud_stop_margin_s'] = 4.58))).not.toThrow();
    expect(build((d) => (paramsOf(d)['hud_stop_margin_s'] = 4.59))).toThrow(/予告から 1,500 m の線までの秒（14\.58）は hud_stop_margin_s \+ 10/);
    expect(build((d) => (sortieOf(d)['first_run_s'] = 4.96))).not.toThrow();
    expect(build((d) => (sortieOf(d)['first_run_s'] = 4.95))).toThrow(/発見から最初の投下までの秒.*6\.89）は 6\.9 以上/);
    expect(build((d) => (paramsOf(d)['hud_stop_margin_s'] = 2.67))).not.toThrow();
    expect(build((d) => (paramsOf(d)['hud_stop_margin_s'] = 2.66))).toThrow(/航跡が消える（静音の上限）の秒（1\.17）\+ 1\.5 以上/);
    const lock = (v: number) => build((d) => ((enemyOf(d, 'us_patrol_bomber')['patrol'] as Rec)['lock_m'] = v));
    expect(lock(1083)).not.toThrow();
    expect(lock(1082)).toThrow(/最高速 → 停止の秒（2\.09）\+ 1\.5 以上/);
    const dmg = (v: number) => build((d) => (((enemyOf(d, 'us_patrol_bomber')['strike'] as Rec)['bomb'] as Rec)['damage'] = v));
    expect(dmg(49)).not.toThrow();
    expect(dmg(50)).toThrow(/bomb\.damage（50）は自艇の hull_hp（50）未満/);
  });
  it('C8 夜の出撃は夜明けの空襲の今の検査を通す（例外は任務と sortie の名を付けて投げ直す）', () => {
    expect(build((d) => (sortieOf(d)['run_gap_s'] = 1.2))).toThrow(/^jp_02 の夜の哨戒（risk_events\.json の patrol_air\.params\.sortie）: .*run_gap_s（1\.2）は落下の体感秒/);
    expect(build((d) => (sortieOf(d)['wave_rest_s'] = 4.45))).not.toThrow();
    expect(build((d) => (sortieOf(d)['wave_rest_s'] = 4.4))).toThrow(/^jp_02 の夜の哨戒.*wave_rest_s（4\.4）は爆撃進路 \+ leave_s/);
  });
  it('C9 2 行目のキーの欄に収まる（sweep_gap_s 31／32・1 回の出撃の爆弾 7／8）', () => {
    expect(build((d) => (paramsOf(d)['sweep_gap_s'] = 31))).not.toThrow();
    expect(build((d) => (paramsOf(d)['sweep_gap_s'] = 32))).toThrow(/sweep_gap_s の切り上げ（32）が 2 行目のキーの欄の上限 31 を超える/);
    expect(build((d) => (((enemyOf(d, 'us_patrol_bomber')['strike'] as Rec)['bomb'] as Rec)['count'] = 3))).not.toThrow(); // §I.2 の「まだ簡単」のつまみ（出撃 6 発）
    // 7／8 は 1 機の組で（2 機では偶数しか作れない）。夜明けの空襲の検査（C8）は機数 × 間隔で 1 機を止めるので core の関数で見る
    const plane = (n: number): PatrolAircraftRecord => ({ ...(enemyOf(gameData, 'us_patrol_bomber') as unknown as PatrolAircraftRecord), strike: { ...(enemyOf(gameData, 'us_patrol_bomber') as unknown as PatrolAircraftRecord).strike, bomb: { ...(enemyOf(gameData, 'us_patrol_bomber') as unknown as PatrolAircraftRecord).strike.bomb, count: n } } });
    const ev = patrolAirEventFromData({ ...eventOf(gameData, 'patrol_air'), params: { ...paramsOf(gameData), sortie: { ...sortieOf(gameData), spawn_offsets_deg: [0] } } }, 'テスト');
    const block = patrolAirBlockFromData({ ...blockOf(gameData), count: 1 }, 'テスト');
    const boat = { speedMaxKt: 31, silentMaxKt: 14, stopMaxKt: 0.5, decelMps2: 1.5, hullHp: 50 };
    const vis = getVisibilityParams(gameData, 'dark', false);
    expect(() => patrolAirParamsFromData(plane(7), ev, block, boat, vis, 5, 'テスト')).not.toThrow();
    expect(() => patrolAirParamsFromData(plane(8), ev, block, boat, vis, 5, 'テスト')).toThrow(/^テスト: 1 回の出撃の爆弾（count × strike\.bomb\.count）（8）が 2 行目のキーの欄の上限 7/);
  });
});
