// jp_04「多号作戦・オルモック湾へ」の data（v0.6.9 S1。spec-v069 §3・R1・R2・R7・R8）: 遊べる世界の値（v0_1_prototype。まだ playable_from は無い＝S7）、
// §3.7 の幾何の数（出発点は R1 で (2700, 2450) → (2000, 2800)）・出発で見つからない（ノーマル・ハード・史実モード）・夜明けの時計・燃料・月・夜明けの敵・危険＝世界の block・
// 夜明けの機（us_tacloban_aircraft）・文は data の数に合う（R8/F13c）・代用とゲーム上の想定・人物名なし。
import { describe, expect, it } from 'vitest';
import { gameData, getPrototypeMission } from '../src/config/game-data';
import { playableMissionIds } from '../src/config/campaign-data';
import { getBriefingRecord } from '../src/config/briefing-data';
import { getDawnAir } from '../src/config/dawn-data';
import { cruiseDetectM } from '../src/config/landing-mission-data';
import { hasHardVariant } from '../src/config/mission-data';
import { getPtParams, nearestStartM } from '../src/config/pt-mission-data';
import { farLegClearM, legEndBowErrDeg, legEndRangeM } from '../src/core/landing-geometry';
import { CALL_DAWN, CALL_FUEL, updateReturnCalls } from '../src/core/mission-flow';
import { ptStartAt, type PtParams } from '../src/core/pt-data';
import { directSortie } from '../src/core/sortie';
import { buildWorldSetup } from '../src/systems/world-setup';
import { PERSON_DENYLIST, RANK_RE } from './person-denylist';
import { LINE2_MAX_PX, textWidthPx } from './pt-ui-kit';

type Rec = Record<string, unknown>;
const EXCERPT = 'WebSearch の抜粋のみ・本文未読';
const TS = gameData.hitRateModel.world.time_scale;
const byId = (id: string): Rec => (gameData.missionsSeed.missions as unknown as Rec[]).find((m) => m['id'] === id)!;
const M = byId('jp_04');
const P = M['v0_1_prototype'] as Rec;
const enemies = gameData.enemies.enemies as unknown as Rec[];
const strings = (v: unknown): string[] => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(strings) : typeof v === 'object' && v !== null ? Object.values(v).flatMap(strings) : []);
const ptOf = (hard: boolean): PtParams => getPtParams(gameData, getPrototypeMission(gameData, 'jp_04', hard), TS)!;
const ONE = (p: PtParams, i: number): PtParams => ({ ...p, count: 1, legs: p.legs.slice(4 * i, 4 * i + 4) });

/** 出発点（線に沿ったずれ dx・南北 dy）から線を進み、泊地から r m に初めて入るまでの体感秒（8 kt）。入らなければ NaN */
function crossS(p: PtParams, i: number, dx: number, dy: number, ax: number, ay: number, r: number): number {
  const s = { x0: 0, y0: 0, x1: 0, y1: 0, x: 0, y: 0, headingDeg: 0 };
  ptStartAt(p, i, dx, dy, false, s);
  const vx = s.x1 - s.x;
  const vy = s.y1 - s.y;
  const fx = s.x - ax;
  const fy = s.y - ay;
  const a = vx * vx + vy * vy;
  const b = 2 * (vx * fx + vy * fy);
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return NaN;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? (t * Math.sqrt(a)) / (p.patrolMps * p.timeScale) : NaN;
}
/** 今夜の揺らぎの格子（線に沿って 21 × 南北 11）での [最短, 最長] 体感秒 */
function crossRange(p: PtParams, i: number, r: number): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (let fx = 0; fx <= 20; fx++) for (let fy = 0; fy <= 10; fy++) {
    const t = crossS(p, i, -250 + 25 * fx, -100 + 20 * fy, 3000, 2760, r);
    lo = Math.min(lo, t);
    hi = Math.max(hi, t);
  }
  return [lo, hi];
}

describe('jp_04 の遊べる世界の data（v0_1_prototype。spec §3.2・R1）', () => {
  it('米PT 2 隻・guns・夜明け 200 秒・燃料 19 gal・6000 × 3000・出発 (2000, 2800) 東向き（R1）・輪 (1400, 2700)・2 本の線・揚陸・岸・揺らぎ・危険・空襲 4 機東から・ハードの線', () => {
    expect([P['enemies'], P['main_weapon'], P['duration_s'], P['fuel_allotment_gal'], P['shallows']]).toEqual([['us_pt_enemy', 'us_pt_enemy'], 'guns', 200, 19, []]);
    expect(P['bounds_m']).toMatchObject({ width: 6000, height: 3000 });
    expect(P['player_start']).toMatchObject({ x_m: 2000, y_m: 2800, heading_deg: 90 });
    expect(P['return_point']).toMatchObject({ x_m: 1400, y_m: 2700, radius_m: 250, call_margin: 1.6, torpedo_settle_max_s: 10, torpedo_end_settle_s: 5 });
    expect(P['pt_boats']).toMatchObject({ legs_m: [[3300, 250, 3060, 2150], [5600, 2790, 3700, 2790]], start_along_m: 250, leave_heading_deg: 0 });
    expect(P['coast']).toMatchObject({ side: 'south', land_m: 600, label_ja: 'レイテ島（パロンポン）' });
    expect(P['night']).toMatchObject({ hazard_scale: 1, optional_hazards: [], enemy_jitter: { x_m: 250, y_m: 100, heading_deg: 0 }, mirror_chance: 0 });
    expect(P['hazards']).toEqual(['enemy_ship_gunfire_or_ram', 'dawn_air_strike']);
    expect(P['dawn_strike']).toMatchObject({ aircraft_id: 'us_tacloban_aircraft', count: 4, from_bearing_deg: 90, escort_target_planes: [] });
    expect((P['hard'] as Rec)['extra_pt_legs_m']).toEqual([[5150, 550, 3450, 2300]]);
    expect(Object.keys(P)).toEqual(['enemies', 'enemy_behavior', 'main_weapon', 'main_weapon_source', 'duration_s', 'duration_s_source', 'fuel_allotment_gal', 'fuel_allotment_gal_source', 'shallows', 'bounds_m', 'player_start', 'return_point', 'pt_boats', 'landing', 'coast', 'night', 'hazards', 'hazards_source', 'dawn_strike', 'hard']);
    expect(hasHardVariant(gameData, 'jp_04')).toBe(true);
    // まだ遊べない（playable_from は S7）: Title・Briefing・snapshot は変わらない
    expect(M['playable_from']).toBeUndefined();
    expect(playableMissionIds(gameData, 'jp_hard')).not.toContain('jp_04');
  });
  it('source: どの block も design (v0.6.9 か historical（抜粋）を持つ。出発点の source は R1 の理由と V13 の数・前の出発点の F1。慌てた斉射は R2 の規則（見つけた PT だけでなく）', () => {
    for (const k of ['main_weapon_source', 'duration_s_source', 'fuel_allotment_gal_source', 'hazards_source', 'enemy_behavior']) expect(String(P[k]), k).toMatch(/v0\.6\.9/);
    for (const k of ['bounds_m', 'player_start', 'return_point', 'pt_boats', 'landing', 'coast', 'night', 'dawn_strike', 'hard']) expect(String((P[k] as Rec)['source']), k).toMatch(/design \(v0\.6\.9|design \(見た目だけ/);
    const start = String((P['player_start'] as Rec)['source']);
    expect(start).toContain('spec R1');
    expect(start).toContain('最短 1,754 m ＞ 史実モードの巡航で見つかる 1,560 m');
    expect(start).toContain('hurried_max_m を 1,100 m まで下げても 1,590 m で通る');
    expect(start).toContain('前の (2700, 2450)');
    expect(start).toContain('最短 2,313 m');
    expect(String(P['enemy_behavior'])).toContain('PT がみな（見つけた PT だけでなく）慌てて撃って去る');
    expect(String(P['enemy_behavior'])).toContain('狙いの誤差を engaged_error_factor 倍にして撃ち、去らずに戦い続ける（戦いながらの斉射。spec R12: 輸送船から離れて戦え'); // S4a
    expect(String(P['duration_s_source'])).toContain('出発から輪の縁 358 m＝巡航 7.0 秒 × call_margin 1.6 = 11 < 150');
    expect(String((P['pt_boats'] as Rec)['source'])).toContain(EXCERPT);
    expect(String((P['hard'] as Rec)['source'])).toContain('自艇の出発点まで 3,325 m・泊地まで 2,513 m');
  });
});

describe('§3.7 の幾何（R1 の出発点で計り直し。config/landing-mission-data の V7〜V10・V13 と同じ関数）', () => {
  it('線ごと: 出発点 → 自艇の出発点 2,313・3,100・3,325 m／→ 泊地 1,929・2,100・2,513 m／線の終わり → 泊地 514〜663・701〜703・576〜718 m／方位の差（終わり）2.0・5.7・7.2°', () => {
    const p = ptOf(true);
    const want = [
      [2313, 1929, [514, 663], 2],
      [3100, 2100, [701, 703], 5.7],
      [3325, 2513, [576, 718], 7.2],
    ];
    for (let i = 0; i < 3; i++) {
      const got = [Math.round(nearestStartM(ONE(p, i), getPrototypeMission(gameData, 'jp_04', true).night, 2000, 2800)), Math.round(nearestStartM(ONE(p, i), getPrototypeMission(gameData, 'jp_04', true).night, 3000, 2760)), legEndRangeM(p, i, 100, 3000, 2760).map(Math.round), Math.round(legEndBowErrDeg(p, i, 100, 3000, 2760) * 10) / 10];
      expect(got, String(i)).toEqual(want[i]);
    }
  });
  it('8 kt で（線の上の正確な交点。spec の geom.py は 400 点の標本で ±0.1 秒）: 報告（1,800 m）6.25〜37.79・14.58〜38.95・34.65〜65.92 秒／慌てる距離（1,300 m）30.55〜62.09・38.88〜63.27・58.98〜90.24 秒／900 m 49.99〜81.54・58.32〜82.75・78.46〜109.72 秒。報告から慌てる距離まで ≥ 24.3 秒・900 m まで ≥ 43.7 秒', () => {
    const p = ptOf(true);
    const want: Record<number, number[][]> = {
      1800: [[6.25, 37.79], [14.58, 38.95], [34.65, 65.92]],
      1300: [[30.55, 62.09], [38.88, 63.27], [58.98, 90.24]],
      900: [[49.99, 81.54], [58.32, 82.75], [78.46, 109.72]],
    };
    for (const r of [1800, 1300, 900]) for (let i = 0; i < 3; i++) {
      const [lo, hi] = crossRange(p, i, r);
      expect(lo, `${r} ${i}`).toBeCloseTo(want[r]![i]![0]!, 1);
      expect(hi, `${r} ${i}`).toBeCloseTo(want[r]![i]![1]!, 1);
    }
    for (let i = 0; i < 3; i++) for (let fx = 0; fx <= 20; fx++) for (let fy = 0; fy <= 10; fy++) {
      const [dx, dy] = [-250 + 25 * fx, -100 + 20 * fy];
      const look = crossS(p, i, dx, dy, 3000, 2760, 1800);
      expect(crossS(p, i, dx, dy, 3000, 2760, 1300) - look, `${i} ${dx} ${dy}`).toBeGreaterThanOrEqual(24.3);
      expect(crossS(p, i, dx, dy, 3000, 2760, 900) - look, `${i} ${dx} ${dy}`).toBeGreaterThanOrEqual(43.7);
    }
  });
  it('V13（R1）: 泊地から 1,300 m より遠い線の部分 → 自艇の出発点 1,754・2,299・2,117 m ＞ 巡航で見つかる 1,560 m（史実モード。ノーマル 1,200 m）。慌てた斉射なし（hurried_max_m 0＝900 m から）だと 1,436 m で V13 が止める（既知の制約: このスイッチを使うなら出発点も動かす）', () => {
    const p = ptOf(true);
    const m = getPrototypeMission(gameData, 'jp_04', true);
    expect(cruiseDetectM(gameData, m, p)).toBeCloseTo(1560, 6);
    expect([0, 1, 2].map((i) => Math.round(farLegClearM(p, i, 100, 3000, 2760, 1300, 2000, 2800)))).toEqual([1754, 2299, 2117]);
    expect(Math.round(farLegClearM(p, 0, 100, 3000, 2760, 900, 2000, 2800))).toBe(1436);
    // 前の出発点 (2700, 2450) は北の線まで 1,076 m（ノーマルの巡航 1,200 m の内＝出発点のそばで速く走るだけで引きつけた。spec の審査 F1）
    expect(Math.round(farLegClearM(p, 0, 100, 3000, 2760, 1300, 2700, 2450))).toBe(1076);
  });
  it('出発で見つからない: ノーマル・ハード・史実モードで getPtParams の検査を通り、出発点（揺らぎ込み）まで最短 2,313 m ≥ 1,560 m。出発点は輪の外', () => {
    for (const hard of [false, true]) {
      for (const historical of [false, true]) expect(() => buildWorldSetup(gameData, 'jp_04', { hard, historical, sortie: directSortie('jp_04', 7, 'none', hard, historical) }), `${hard} ${historical}`).not.toThrow();
      expect(Math.round(nearestStartM(ptOf(hard), getPrototypeMission(gameData, 'jp_04', hard).night, 2000, 2800))).toBe(2313);
    }
  });
  it('夜明けの時計（tests/dawn-clock と同じ式）: 出発から輪の縁 358 m＝巡航 7.0 秒 × 1.6 = 11.1 < 150・出発時に夜明け近し・燃料少が立たない。泊地 → 輪 1,601 m（V5）。unload 140 + 30 ≤ 200（V6）', () => {
    const s = buildWorldSetup(gameData, 'jp_04');
    const rp = s.mission.returnPoint;
    const edge = Math.hypot(s.playerStart.x - rp.x, s.playerStart.y - rp.y) - rp.radiusM;
    const needS = edge / (s.fuelCurve.cruiseMps * s.timeScale);
    expect([Math.round(edge), Math.round(needS * 10) / 10, Math.round(needS * rp.callMargin * 10) / 10]).toEqual([358, 7, 11.1]);
    expect(needS * rp.callMargin).toBeLessThan(s.durationS - 50);
    expect(updateReturnCalls(0, false, false, s.fuelAllotmentGal, edge * s.fuelCurve.galPerMCruise, s.durationS, needS, rp.callMargin) & (CALL_DAWN | CALL_FUEL)).toBe(0);
    const L = s.landing!.params;
    expect(Math.round(Math.hypot(L.x - rp.x, L.y - rp.y))).toBe(1601);
    expect(L.unloadS + 30).toBeLessThanOrEqual(s.durationS);
    expect(Math.round(Math.hypot(s.playerStart.x - L.x, s.playerStart.y - L.y))).toBe(1001);
  });
  it('燃料: 19 gal ≤ 上限 19.58（止まって 1,453 秒 < 1,500 秒で漂流・夜明け 200 秒より後）', () => {
    const s = buildWorldSetup(gameData, 'jp_04');
    const idleS = ((s.fuelAllotmentGal / s.fuelCurve.idleGph) * 3600) / s.timeScale;
    expect(Math.round(idleS)).toBe(1453);
    expect(idleS + 1.5).toBeLessThan(1500);
    expect(idleS).toBeGreaterThan(s.durationS);
    expect(s.fuelAllotmentGal).toBeLessThanOrEqual(19.58);
  });
});

describe('jp_04 の規則・文・夜明けの機', () => {
  it('月は dark・「月没後」・夜明けの敵 none（米PT は夜明けに去る）・play_as enemy ⇔ dawn_strike ⇔ hazards の dawn_air_strike・機の faction はキャンペーンの enemy_faction', () => {
    expect([M['moon'], M['moon_label_ja'], getBriefingRecord(gameData, 'jp_04').moonLabelJa]).toEqual(['dark', '月没後', '月没後']);
    const a = getDawnAir(gameData, 'jp_04');
    expect([a.playAs, a.shipsAtDawn]).toEqual(['enemy', 'none']);
    // R8/F13a（S0 で直した）: 卯月の場所は「パロンポン沖（オルモック湾の北西）」で、湾の中ではない
    expect(a.refs[0]!.claim).toContain('パロンポン沖（オルモック湾の北西）');
    for (const r of a.refs) expect(r.claim).not.toContain('オルモック湾で');
    const m = getPrototypeMission(gameData, 'jp_04');
    expect(m.dawnStrike !== null).toBe(true);
    expect(m.hazards.includes('dawn_air_strike')).toBe(true);
    const camp = (gameData.missionsSeed.campaigns as unknown as Rec[]).find((c) => c['id'] === M['campaign'])!;
    expect(enemies.find((e) => e['id'] === m.dawnStrike!.aircraft_id)!['faction']).toBe(camp['enemy_faction']);
    expect(buildWorldSetup(gameData, 'jp_04').airStrike!.planes).toBe(4);
  });
  it('危険＝世界の block（tests/briefing の作法）: 米PT（砲あり）→ enemy_ship_gunfire_or_ram、空襲 → dawn_air_strike。暴風・浅瀬・味方機・水上機は無い（本体の enemy_aircraft・friendly_fire は設計の記録として残す）', () => {
    const m = getPrototypeMission(gameData, 'jp_04');
    expect([m.storm, m.shallows.length, m.friendlyAircraft, m.enemyAircraft, m.shoreBattery]).toEqual([null, 0, null, null, null]);
    expect(new Set(m.hazards)).toEqual(new Set(['enemy_ship_gunfire_or_ram', 'dawn_air_strike']));
    expect(M['hazards']).toEqual(['enemy_aircraft', 'friendly_fire']);
    for (const h of m.hazards) expect(gameData.riskEvents.events.some((e) => e.id === h), h).toBe(true);
    const s = buildWorldSetup(gameData, 'jp_04');
    expect([s.friendly, s.seaplane, s.storm, s.raid]).toEqual([null, null, null, null]);
  });
  it('文は data の数に合う（R8/F13c）: 目的（ノーマル・ハード）の「900 m」（数と単位の間はノーブレークスペース。S4a）は launch_range_m、「近いPTは慌てて撃つ」は hurried_max_m > 0。PT の来る方角は今夜の揺らぎでも「北と東」「北・東・北東」', () => {
    const t = (enemies.find((e) => e['id'] === 'us_pt_enemy')!['torpedo_attack'] as Rec);
    const hard = P['hard'] as Rec;
    for (const obj of [String(M['objective']), String(hard['objective_ja'])]) {
      expect(obj).toContain(`${t['launch_range_m'] as number}\u00a0m`);
      expect(obj.includes('近いPTは慌てて撃つ')).toBe((t['hurried_max_m'] as number) > 0);
    }
    expect([M['success'], hard['success_ja']]).toEqual(['輸送船の揚陸完了を見届けて帰投', '輸送船の揚陸完了を見届けて帰投']);
    for (let seed = 1; seed <= 60; seed++) {
      for (const h of [false, true]) {
        const L = buildWorldSetup(gameData, 'jp_04', { hard: h, sortie: directSortie('jp_04', seed, 'none', h, false) }).landing!.params;
        expect(L.fromDirsJa, `${seed} ${h}`).toBe(h ? '北・東・北東' : '北と東');
      }
    }
  });
  it('代用とゲーム上の想定（史実の文・Briefing の文・ハードの文・source）、人物名と階級なし（CLAUDE.md §11）', () => {
    const hard = P['hard'] as Rec;
    for (const t of [String(M['briefing_note_ja']), String(hard['note_ja'])]) {
      expect(t).toContain('代用');
      expect(t).toContain('ゲーム上の想定');
    }
    expect(String((P['landing'] as Rec)['source'])).toContain('ijn_transport（5,000t級・120 × 16 m）で代用');
    expect(String(hard['source'])).toContain('ゲーム上の想定（史実の PT は 2 隻）');
    const texts = [...strings(M), ...strings(enemies.find((e) => e['id'] === 'us_tacloban_aircraft')), ...strings((enemies.find((e) => e['id'] === 'us_pt_enemy')!['source'] as Rec)['torpedo_attack'])];
    expect(texts.length).toBeGreaterThan(40);
    for (const s of texts) {
      for (const name of PERSON_DENYLIST) expect(s, name).not.toContain(name);
      expect(RANK_RE.test(s), s.slice(0, 40)).toBe(false);
    }
  });
  it('夜明けの機 us_tacloban_aircraft（R8/F8: us_patrol_bomber の後）: USN・「米陸上機（F4U 相当）」・strike は us_henderson_aircraft と同じ（ヘンダーソンは変えない）・夜明けの帯の 2 行目の幅・source は historical（抜粋）と design (v0.6.9', () => {
    const ids = enemies.map((e) => e['id']);
    expect(ids.indexOf('us_patrol_bomber')).toBe(ids.indexOf('us_henderson_aircraft') + 1);
    expect(ids.indexOf('us_tacloban_aircraft')).toBe(ids.indexOf('us_patrol_bomber') + 1);
    const t = enemies.find((e) => e['id'] === 'us_tacloban_aircraft')!;
    const h = enemies.find((e) => e['id'] === 'us_henderson_aircraft')!;
    expect(Object.keys(t)).toEqual(['id', 'faction', 'name_ja', 'strike', 'source', 'notes']);
    expect([t['faction'], t['name_ja'], h['name_ja']]).toEqual(['USN', '米陸上機（F4U 相当）', '米陸上機（F4F／SBD 相当）']);
    expect(t['strike']).toEqual(h['strike']);
    expect(t['strike']).toEqual({ run_speed_kt: 120, release_altitude_m: 200, bomb: { count: 2, damage: 35, blast_radius_m: 25, accuracy_cep_m: 32, fire_chance: 0.3, engine_damage_chance: 0.2 } });
    const src = t['source'] as Rec;
    expect(String(src['type'])).toMatch(/^historical /);
    expect(String(src['type'])).toContain(EXCERPT);
    expect(String(src['others'])).toContain('design (v0.6.9。値は us_henderson_aircraft の写し');
    expect(textWidthPx(`${String(t['name_ja'])} 4 機が東から来る ・ 投下で転舵（旋回中は逆へ）`, 22)).toBeLessThanOrEqual(LINE2_MAX_PX);
    expect(buildWorldSetup(gameData, 'jp_04').airStrike!.nameJa).toBe('米陸上機（F4U 相当）');
  });
});
