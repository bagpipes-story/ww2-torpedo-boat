// v0.6.11 S0（spec-v0611-r2 §4・§5・§7）: 空襲下の退避（jp_03「運天港・空襲下の退避」）の data と起動時の検査（config/evac-mission-data の V-E1〜V-E12・
// core/evac-data の形の検査・core/evac-params の値）。既定の data が通り、壊した data は鍵を名指す日本語の文（V-En 付き）で止まる。ほかの任務は鍵ごと出ない。
import { describe, expect, it } from 'vitest';
import { gameData, type GameData } from '../src/config/game-data';
import { EVAC_CHECK_MOORED_CLEAR_M, EVAC_ONLY_KEYS, evacSetupPart, getEvacParams, validateEvacMissions } from '../src/config/evac-mission-data';
import { EVAC_AI_SEED_OFFSET, EVAC_DODGE_SEED_OFFSET, EVAC_EVENT_ID, EVAC_FLIGHT_SEED_OFFSET, EVAC_MAX_FLIGHTS, EVAC_MAX_WAVES, EVAC_SEED_OFFSET, SHELTER_CAVE, SHELTER_COVER, evacBlockFromData, evacEventFromData, evacFlightSeedOffset, evacRaidBlockFromData } from '../src/core/evac-data';
import { evacTrailLen } from '../src/core/evac-params';
import { ALLY_GUN_SEED_OFFSET, ALLY_LOOKOUT_SEED_OFFSET } from '../src/core/ally-destroyer';
import { PATROL_AIR_SEED_OFFSET } from '../src/core/patrol-air-state';
import { ktToMps } from '../src/core/units';

type Rec = Record<string, unknown>;
const clone = (): GameData => JSON.parse(JSON.stringify(gameData)) as GameData;
const missionOf = (d: GameData, id: string): Rec => (d.missionsSeed.missions as unknown as Rec[]).find((m) => m['id'] === id)!;
const protoOf = (d: GameData, id: string): Rec => missionOf(d, id)['v0_1_prototype'] as Rec;
const evacOf = (d: GameData): Rec => protoOf(d, 'jp_03')['evac'] as Rec;
const raidOf = (d: GameData): Rec => protoOf(d, 'jp_03')['evac_raid'] as Rec;
const eventOf = (d: GameData): Rec => (d.riskEvents.events as unknown as Rec[]).find((e) => e['id'] === EVAC_EVENT_ID)!;
const sortieOf = (d: GameData): Rec => (eventOf(d)['params'] as Rec)['sortie'] as Rec;
/** data の写しを f で壊して jp_03 を組む（ハードも） */
const build = (f: (d: GameData) => void, hard = false): (() => unknown) => {
  const d = clone();
  f(d);
  return () => getEvacParams(d, 'jp_03', hard);
};
const PROTO_IDS = (gameData.missionsSeed.missions as unknown as Rec[]).filter((m) => m['v0_1_prototype']).map((m) => m['id'] as string);

describe('既定の data（jp_03）', () => {
  it('ノーマル・ハードとも組める。6 隊 × 3 隻・隠れ場所 5（壕 3・陰 2・枠 15）・4 波 2/3/3/4 機・同時 2／3 編隊・陰の発見 0.25／0.35', () => {
    for (const hard of [false, true]) {
      const s = getEvacParams(gameData, 'jp_03', hard)!;
      expect(s).not.toBeNull();
      const p = s.params;
      expect([p.boatId, p.groupSize, p.groups.length, p.startGroup, p.homeShelter]).toEqual(['jp_t38', 3, 6, 0, 0]);
      expect(p.groups.map((g) => [g.labelJa, g.x, g.y, g.headingDeg])).toEqual([['第1隊', 1450, 1000, 90], ['第2隊', 900, 1000, 90], ['第3隊', 2100, 1000, 90], ['第4隊', 2850, 900, 0], ['第5隊', 500, 550, 90], ['第6隊', 2000, 500, 90]]);
      expect(p.shelters.map((x) => [x.id, x.kind, x.slots])).toEqual([['home_cave', SHELTER_CAVE, 3], ['west_cave', SHELTER_CAVE, 3], ['east_cave', SHELTER_CAVE, 3], ['west_cover', SHELTER_COVER, 3], ['east_cover', SHELTER_COVER, 3]]);
      expect(p.trailLen).toBe(18); // ceil(2 × 40 / 5) + 2
      expect(p.hideMaxMps).toBeCloseTo(ktToMps(2), 12);
      expect(p.flashReveal).toBe(false);
      expect(s.raid.waves).toEqual([{ announceS: 15, planes: 2 }, { announceS: 70, planes: 3 }, { announceS: 125, planes: 3 }, { announceS: 180, planes: 4 }]);
      expect([s.raid.flights, s.raid.coverRevealChance, s.raid.survivorQuota, s.raid.survivorsTotal, s.raid.historicalSurvivors]).toEqual(hard ? [3, 0.35, 6, 18, 5] : [2, 0.25, 6, 18, 5]);
      expect([s.raid.centerX, s.raid.centerY]).toEqual([1600, 625]);
      expect(s.sorties.map((x) => [x.planes, x.bombsPerPlane, x.spawnM, x.runRadiusM, x.fromBearingDeg, x.waveRotateDeg])).toEqual([[2, 2, 2500, 500, 70, 0], [3, 2, 2500, 500, 70, 0], [4, 2, 2500, 500, 70, 0]]);
      expect([s.fuelFreeUntilS, s.dayStart]).toEqual([240, true]);
    }
  });
  it('1 編隊の長さ: 予告から最初の投下まで約 20.6 秒、4 機の編隊は予告から 39.8 秒で去り終わる（第 4 波は 219.8 秒 < 240）', () => {
    const p4 = getEvacParams(gameData, 'jp_03')!.sorties[2]!;
    expect(10 + p4.firstRunS + p4.runS).toBeCloseTo(20.62, 2);
    const len = 10 + p4.firstRunS + p4.runS + 7 * p4.runGapS + p4.fallFeelS + p4.leaveS;
    expect(len).toBeCloseTo(39.8, 1);
    expect(180 + len).toBeLessThan(240);
  });
  it('ほかの任務は null・evacSetupPart は {}（setup に鍵が増えない）。Boot の検査は jp_03 の値を返す', () => {
    for (const id of PROTO_IDS.filter((x) => x !== 'jp_03')) {
      expect(getEvacParams(gameData, id), id).toBeNull();
      expect(evacSetupPart(gameData, id, false), id).toEqual({});
      expect(evacSetupPart(gameData, id, true), id).toEqual({});
    }
    expect(Object.keys(evacSetupPart(gameData, 'jp_03', false))).toEqual(['evac']);
    expect(validateEvacMissions(gameData)).toEqual(getEvacParams(gameData, 'jp_03'));
  });
  it('乱数の系列は +29〜+43（+21 は予約のまま・+23・+27・+28 と重ならない）', () => {
    expect([EVAC_SEED_OFFSET, EVAC_AI_SEED_OFFSET, EVAC_DODGE_SEED_OFFSET, EVAC_FLIGHT_SEED_OFFSET]).toEqual([29, 30, 31, 32]);
    expect([evacFlightSeedOffset(0, 0), evacFlightSeedOffset(1, 0), evacFlightSeedOffset(EVAC_MAX_WAVES - 1, EVAC_MAX_FLIGHTS - 1)]).toEqual([32, 35, 43]);
    for (const o of [PATROL_AIR_SEED_OFFSET, ALLY_LOOKOUT_SEED_OFFSET, ALLY_GUN_SEED_OFFSET, 21]) expect(o).toBeLessThan(EVAC_SEED_OFFSET);
  });
});

describe('起動時の検査 V-E1〜V-E12（壊した data は鍵を名指して止まる）', () => {
  it('V-E1: 隠れ場所・停泊の縦列・壕から出た縦列が海域の縁から艇の半分の長さ以上内', () => {
    expect(build((d) => { ((evacOf(d)['shelters'] as Rec[])[3]!)['y_m'] = 10; })).toThrow(/evac\.shelters\[3\]（屋我地の陰（西）） は海域の縁から 18 m 以上内.*V-E1/);
    expect(build((d) => { ((evacOf(d)['groups'] as Rec[])[4]!)['x_m'] = 30; })).toThrow(/evac\.groups\[4\]（第5隊） の停泊の縦列の 3 隻目.*V-E1/); // 2 隻目は x 18＝縁からちょうど 18 m で通る
    expect(build((d) => { const c = (evacOf(d)['shelters'] as Rec[])[1]!; c['x_m'] = 30; c['exit_heading_deg'] = 90; })).toThrow(/evac\.shelters\[1\]（西の壕） から出た縦列（exit_heading_deg 90・moored_gap_m）の 3 隻目.*V-E1/); // 艇尾は西: x 30・18・6
  });
  it('V-E2: 停泊地のどの艇も輪の縁から 20 m 以上外（ちょうど 20 m は通る）', () => {
    // 第1隊の隊長艇を隊長艇の壕の真北へ: 中心から 70 + 20 = 90 m は通り、89 m は止まる
    const at = (dy: number) => build((d) => { const g = (evacOf(d)['groups'] as Rec[])[0]!; g['x_m'] = 1600; g['y_m'] = 1150 - dy; g['heading_deg'] = 0; const ps = protoOf(d, 'jp_03')['player_start'] as Rec; ps['x_m'] = 1600; ps['y_m'] = 1150 - dy; ps['heading_deg'] = 0; });
    expect(EVAC_CHECK_MOORED_CLEAR_M).toBe(20);
    expect(at(90 + 2 * 12)).not.toThrow(); // 3 隻目（艇尾の方向＝南へ 24 m）がちょうど 90 m
    expect(at(89 + 2 * 12)).toThrow(/evac\.groups\[0\]（第1隊） の 3 隻目は 隊長艇の壕 の輪の縁から 20 m 以上外.*V-E2/);
  });
  it('V-E3: 隠れ場所どうしの中心は 2 × 輪 ＋ 100 m 以上', () => {
    expect(build((d) => { ((evacOf(d)['shelters'] as Rec[])[4]!)['x_m'] = 1289; })).toThrow(/evac\.shelters\[4\]（屋我地の陰（東）） と 屋我地の陰（西） の中心は.*240 m.*V-E3/);
    expect(build((d) => { ((evacOf(d)['shelters'] as Rec[])[4]!)['x_m'] = 1290; })).not.toThrow(); // 1050 + 240 ちょうど
  });
  it('V-E4: 枠の合計は全隻より少なく、どの枠も group_size 以上', () => {
    expect(build((d) => { ((evacOf(d)['shelters'] as Rec[])[0]!)['slots'] = 6; })).toThrow(/枠の合計（18）は全隻（18）より少ない.*V-E4/);
    expect(build((d) => { ((evacOf(d)['shelters'] as Rec[])[3]!)['slots'] = 2; })).toThrow(/evac\.shelters\[3\]（屋我地の陰（西））\.slots は group_size（3）以上.*V-E4/);
  });
  it('V-E5: 1 編隊 1〜4 機・同時の編隊 ≤ 3 ≤ flight_offsets_deg の長さ・flights_per_group_max ≥ 1・波 ≤ 4・spawn_m は sortie の範囲', () => {
    expect(build((d) => { ((raidOf(d)['waves'] as Rec[])[3]!)['planes'] = 5; })).toThrow(/evac_raid\.waves\[3\]\.planes は 1〜4.*V-E5/);
    expect(build((d) => { ((protoOf(d, 'jp_03')['hard'] as Rec))['evac_flights'] = 4; }, true)).toThrow(/hard\.evac_flights は 1〜3.*V-E5/);
    expect(build((d) => { raidOf(d)['flight_offsets_deg'] = [-30, 30]; }, true)).toThrow(/flight_offsets_deg の長さ（2）以下.*V-E5/);
    expect(build((d) => { raidOf(d)['flights_per_group_max'] = 0; })).toThrow(/flights_per_group_max は 1 以上.*V-E5/);
    expect(build((d) => { (raidOf(d)['waves'] as Rec[]).push({ announce_s: 235, planes: 2 }); })).toThrow(/evac_raid\.waves は 1〜4 波.*V-E5/);
    expect(build((d) => { raidOf(d)['spawn_m'] = 2600; })).toThrow(/evac_raid\.spawn_m（2600）.*V-E5/);
    expect(build((d) => { delete protoOf(d, 'jp_03')['evac_raid']; })).toThrow(/evac_raid（波と編隊）が無い.*V-E5/);
  });
  it('V-E6: 予告の間隔・最後の波の終わり < duration_s・休みは爆撃進路 ＋ leave_s ＋ 2 ステップ以上', () => {
    expect(build((d) => { ((raidOf(d)['waves'] as Rec[])[1]!)['announce_s'] = 59; })).toThrow(/evac_raid\.waves\[1\] の予告の間隔（44 秒）は announce_lead_s ＋ 4 機の編隊の長さ ＋ 5（44\.80 秒）以上.*V-E6/);
    expect(build((d) => { ((raidOf(d)['waves'] as Rec[])[1]!)['announce_s'] = 60; })).not.toThrow(); // 45 ≥ 44.80
    expect(build((d) => { protoOf(d, 'jp_03')['duration_s'] = 219; protoOf(d, 'jp_03')['fuel_free_until_s'] = 219; })).toThrow(/最後の波の終わり（219\.80 秒）は duration_s（219）より前.*V-E6/);
    expect(build((d) => { sortieOf(d)['wave_rest_s'] = 4.13; })).toThrow(/wave_rest_s（4\.13）は爆撃進路 ＋ leave_s ＋ 2 ステップ.*V-E6/);
  });
  it('V-E7: 追従の間隔 > 爆風 ＋ 半長（34 m）・停泊の間隔 < 爆風・航跡の点の間隔 ≤ gap_m / 4', () => {
    expect(build((d) => { (evacOf(d)['follow'] as Rec)['gap_m'] = 34; })).toThrow(/evac\.follow\.gap_m（34）は爆風（25）＋ 半長（9）より広い.*V-E7/);
    expect(build((d) => { evacOf(d)['moored_gap_m'] = 25; })).toThrow(/evac\.moored_gap_m（25）は 0 より大きく爆風（25）より狭い.*V-E7/);
    expect(build((d) => { (evacOf(d)['follow'] as Rec)['trail_step_m'] = 10.5; })).toThrow(/trail_step_m（10\.5）は 0 より大きく gap_m \/ 4（10）以下.*V-E7/);
  });
  it('V-E8: 帰投の輪は壕の 1 つと同じ点・半径は shelter_ring_m', () => {
    expect(build((d) => { (protoOf(d, 'jp_03')['return_point'] as Rec)['x_m'] = 1610; })).toThrow(/return_point（1610, 1150）は evac\.shelters の壕.*V-E8/);
    expect(build((d) => { (protoOf(d, 'jp_03')['return_point'] as Rec)['radius_m'] = 80; })).toThrow(/return_point\.radius_m（80）は evac\.shelter_ring_m（70）と同じ.*V-E8/);
    expect(build((d) => { ((evacOf(d)['shelters'] as Rec[])[0]!)['kind'] = 'cover'; })).toThrow(/V-E8/);
  });
  it('V-E9: 隻数 = survivors_total 18・ノルマ ≤ 18・最初の隊と player_start が同じ', () => {
    expect(build((d) => { raidOf(d)['survivors_total'] = 17; })).toThrow(/survivors_total（17）は group_size × groups の数（18）.*V-E9/);
    expect(build((d) => { raidOf(d)['survivor_quota'] = 19; })).toThrow(/survivor_quota は 1〜18.*V-E9/);
    expect(build((d) => { evacOf(d)['start_group'] = 2; })).toThrow(/player_start は最初に操作する隊（第2隊）.*V-E9/);
    expect(build((d) => { evacOf(d)['start_group'] = 7; })).toThrow(/start_group は 1〜6.*V-E9/);
  });
  it('V-E10: fuel_free_until_s = duration_s・止まって待つと 1,500 秒の前に漂流する（16 gal で 240 ＋ 1,224 ＋ 1.5）', () => {
    expect(build((d) => { protoOf(d, 'jp_03')['fuel_free_until_s'] = 200; })).toThrow(/fuel_free_until_s（200）は duration_s（240）と同じ.*V-E10/);
    expect(build((d) => { protoOf(d, 'jp_03')['fuel_allotment_gal'] = 19; })).toThrow(/fuel_allotment_gal（19）.*アイドルで尽きる 1453\.5 秒.*V-E10/);
    expect(build((d) => { protoOf(d, 'jp_03')['fuel_allotment_gal'] = 16.4; })).not.toThrow(); // 240 + 1,254.6 + 1.5 = 1,496.1 < 1,500
    expect(build((d) => { protoOf(d, 'jp_03')['fuel_allotment_gal'] = 16.5; })).toThrow(/V-E10/); // 240 + 1,262.3 + 1.5 > 1,500
  });
  it('V-E11: 同居しない鍵・main_weapon none・危険・敵の制空下・座席と同じ艇で煙幕なし・day_start は真偽', () => {
    expect(build((d) => { protoOf(d, 'jp_03')['friendly_aircraft'] = { trigger_edge_m: 10 }; })).toThrow(/friendly_aircraft と evac は同居しない.*V-E11/);
    expect(build((d) => { protoOf(d, 'jp_03')['main_weapon'] = 'guns'; })).toThrow(/main_weapon は none.*V-E11/);
    expect(build((d) => { protoOf(d, 'jp_03')['hazards'] = ['dawn_air_strike']; })).toThrow(/hazards に unten_air_raid が要る.*V-E11/);
    expect(build((d) => { evacOf(d)['boat'] = 'jp_t14'; })).toThrow(/evac\.boat（jp_t14）は player_boat（jp_t38）と同じ.*V-E11/);
    expect(build((d) => { ((d.boats.boats as unknown as Rec[]).find((b) => b['id'] === 'jp_t38')!)['smoke_generator'] = true; })).toThrow(/smoke_generator false.*V-E11/);
    expect(build((d) => { protoOf(d, 'jp_03')['day_start'] = 'yes'; })).toThrow(/day_start は true か false.*V-E11/);
  });
  it('V-E12: 確率は [0, 1]・pick_s と haul_s は正・cast_off_s は [小, 大]・bearing_fix_deg は先頭 n 個の平均を戻す・slot_arrive_m < slot_abeam_m', () => {
    expect(build((d) => { (evacOf(d)['ai'] as Rec)['full_p'] = 1.2; })).toThrow(/evac\.ai\.full_p は 0〜1.*V-E12/);
    expect(build((d) => { ((protoOf(d, 'jp_03')['hard'] as Rec))['evac_cover_reveal_chance'] = -0.1; }, true)).toThrow(/hard\.evac_cover_reveal_chance は 0〜1.*V-E12/);
    expect(build((d) => { evacOf(d)['haul_s'] = 0; })).toThrow(/haul_s（0）は正の秒.*V-E12/);
    expect(build((d) => { (evacOf(d)['ai'] as Rec)['cast_off_s'] = [20, 5]; })).toThrow(/cast_off_s は 0 ≤ 小 ≤ 大.*V-E12/);
    expect(build((d) => { raidOf(d)['bearing_fix_deg'] = [30, 20, 10]; })).toThrow(/bearing_fix_deg の長さ（3）は最大機数（4）以上.*V-E12/);
    expect(build((d) => { raidOf(d)['bearing_fix_deg'] = [30, 18, 10, 0]; })).toThrow(/bearing_fix_deg\[1\]（18）は sortie\.spawn_offsets_deg の先頭 2 個の平均（-20）を戻す値.*V-E12/);
    expect(build((d) => { evacOf(d)['slot_arrive_m'] = 25; })).toThrow(/slot_arrive_m（25）は 0 より大きく slot_abeam_m（25）より小さい.*V-E12/);
  });
});

describe('共有の読みの例外の包み直し（r2 L12）・形の検査・evac だけの鍵', () => {
  it('凍結の airStrikeParamsFromData の例外は unten_air_raid.params.sortie を名指す（夜明けの空襲の名を出さない）', () => {
    const f = build((d) => { sortieOf(d)['run_gap_s'] = 1.0; }); // 落下 1.28 秒より短い
    expect(f).toThrow(/^jp_03 の港の空襲（risk_events\.json の unten_air_raid\.params\.sortie の 2 機の編隊）: run_gap_s（1）は落下の体感秒/);
    expect(f).not.toThrow(/dawn_air_strike/);
    expect(build((d) => { sortieOf(d)['first_run_s'] = 6; })).toThrow(/unten_air_raid\.params\.sortie の 2 機の編隊）: first_run_s（6）は旋回に着くまでの秒/);
  });
  it('形: 知らない鍵・kind・cast_off_s・params の鍵・sortie の鍵（*_source の文は許す）', () => {
    expect(build((d) => { evacOf(d)['groups_note'] = 'x'; })).toThrow(/jp_03\.v0_1_prototype\.evac: 知らない鍵 groups_note/);
    expect(build((d) => { evacOf(d)['extra_source'] = 'design'; })).not.toThrow();
    expect(build((d) => { ((evacOf(d)['shelters'] as Rec[])[2]!)['kind'] = 'tunnel'; })).toThrow(/evac\.shelters\[2\]: kind は cave か cover（tunnel）/);
    expect(build((d) => { (evacOf(d)['ai'] as Rec)['cast_off_s'] = [5]; })).toThrow(/evac\.ai: cast_off_s は 2 つの数/);
    expect(build((d) => { (eventOf(d)['params'] as Rec)['chance'] = 0.5; })).toThrow(/risk_events\.json の unten_air_raid）: params に知らない鍵 chance/);
    expect(build((d) => { sortieOf(d)['spawn_mm'] = 1; })).toThrow(/params\.sortie に知らない鍵 spawn_mm/);
    expect(() => evacBlockFromData(null, 'x')).toThrow(/x: object でない/);
    expect(() => evacRaidBlockFromData({ ...raidOf(gameData), waves: [] }, 'y')).toThrow(/y: waves は空でない配列/);
    expect(() => evacEventFromData({ id: 'dawn_air_strike', params: {} }, 'z')).toThrow(/z（risk_events\.json の unten_air_raid）: 記録か params が無い/);
  });
  it('evac だけの鍵（evac_raid・fuel_free_until_s・day_start）はほかの任務に置けない', () => {
    expect(EVAC_ONLY_KEYS).toEqual(['evac_raid', 'fuel_free_until_s', 'day_start']);
    for (const k of EVAC_ONLY_KEYS) {
      const d = clone();
      protoOf(d, 'jp_02')[k] = protoOf(d, 'jp_03')[k];
      expect(() => getEvacParams(d, 'jp_02'), k).toThrow(new RegExp(`jp_02\\.v0_1_prototype\\.${k} は空襲下の退避（evac）の任務だけ`));
    }
  });
  it('航跡の輪の長さは ceil((group_size − 1) × gap_m / trail_step_m) + 2', () => {
    expect([evacTrailLen(3, 40, 5), evacTrailLen(3, 40, 7), evacTrailLen(2, 40, 10), evacTrailLen(1, 40, 5)]).toEqual([18, 14, 6, 2]);
  });
});
