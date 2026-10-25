// jp_01「夜の輸送護衛」（v0.6.4。日本ハードモード③：味方の大発を守る。spec §A〜§D・§G.2）: 任務の data（値・source の作法・人物名なし）、世界の組み立て（輸送隊・25mm・米PT・夜明け・燃料）、
// 今夜の揺らぎ（乱数 5 回・出発で見つからない・反転なし）、呼びかけと達成、Briefing の 6 行（原文・幅）、HUD の 2 行目（jp_01 の世界の値で。文の網羅と幅は tests/convoy-lines）、Result（幅・得点の順）、ptKey の標的のビット。
// ui-config・game-config は DOM を読むので使わない（色は hud-text-config、文の幅は tests/pt-ui-kit の見積もり）。
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import scoring from '../data/scoring.json';
import { gameData, getPrototypeMission, getScoringParams } from '../src/config/game-data';
import { enemyNameJa, getBriefingRecord, riskLabelJa } from '../src/config/briefing-data';
import { playableMissionIds } from '../src/config/campaign-data';
import { getDawnAir } from '../src/config/dawn-data';
import { hasHardVariant } from '../src/config/mission-data';
import { PT_GUN_SHELL_POOL_SIZE, PT_SHELL_POOL_SIZE } from '../src/config/pt-config';
import { convoyStartClearM } from '../src/config/pt-mission-data';
import { TITLE_HINT_BY_CAMPAIGN_JA, TITLE_HINT_PX } from '../src/config/title-hint-config';
import type { BoatState } from '../src/core/boat-motion';
import { PT_GUN_BRIEFING_JA, briefingRows, compassJa, ptGunBriefingJa } from '../src/core/briefing';
import { CV_ARRIVED, CV_SUNK, convoyResolved, createConvoy } from '../src/core/convoy';
import { DAWN_AIR_NONE } from '../src/core/dawn-air';
import { CALL_FUEL, CALL_SUNK, convoyObjectiveDone, topCall, updateReturnCalls } from '../src/core/mission-flow';
import { PT_BREAK, PT_PASS, PT_RUN_IN, createPtSection } from '../src/core/pt-boats';
import { createPtGun } from '../src/core/pt-gun';
import { SeededRng } from '../src/core/rng';
import { computeScore, isScoringDataRecord, scoringParamsFromData, type ScoreInput, type ScoringDataRecord } from '../src/core/scoring';
import { directSortie } from '../src/core/sortie';
import { initConvoyTelemetry } from '../src/systems/convoy-telemetry';
import { initPtTelemetry } from '../src/systems/pt-telemetry';
import { briefingNumbers, buildWorldSetup } from '../src/systems/world-setup';
import { convoyCallJa } from '../src/ui/convoy-lines';
import { dawnCallLabel } from '../src/ui/dawn-lines';
import { MISSION_CALL, MISSION_PT, MISSION_PT_CONTACT, MISSION_PT_PASS, MODE_FLAG_PT_RESULT, missionMode } from '../src/ui/mission-mode';
import { PERSON_DENYLIST, RANK_RE } from './person-denylist';
import { LINE2_MAX_PX, keyOf, row, tele, textWidthPx } from './pt-ui-kit';

type Rec = Record<string, unknown>;
const byId = (id: string): Rec => (gameData.missionsSeed.missions as unknown as Rec[]).find((m) => m['id'] === id)!;
const proto = byId('jp_01')['v0_1_prototype'] as Rec;
const nameOf = (e: string): string => enemyNameJa(gameData, e);
const labelOf = (h: string): string => riskLabelJa(gameData, h);
const sortie = (seed: number): ReturnType<typeof directSortie> => directSortie('jp_01', seed, 'none', false, false);
const S = buildWorldSetup(gameData, 'jp_01');
const EXCERPT = 'WebSearch の抜粋のみ・本文未読';

/** 記録の中の文字列をすべて集める（source・notes・配列の中も） */
function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) for (const x of v) strings(x, out);
  else if (typeof v === 'object' && v !== null) for (const x of Object.values(v as Rec)) strings(x, out);
  return out;
}

/** jp_01 の米PT の隊・T-38 の 25mm だけの世界から出撃時のテレメトリ（tests/pt-ui-kit の ptWorld の jp_01 版） */
function tele01(): ReturnType<typeof tele> {
  const p = S.ptBoats!;
  const g = S.guns!;
  const boat: BoatState = { ...S.playerStart, speedMps: 0 };
  const pt = initPtTelemetry({ pts: { section: createPtSection(p, PT_SHELL_POOL_SIZE), p, firstDetectBand: '', enemyId: 'us_pt_enemy', gun: { state: createPtGun(g, PT_GUN_SHELL_POOL_SIZE), g } }, boat: { state: boat }, params: S.boatParams, visRange2: S.visRange2, damageParams: S.damageParams });
  const convoy = initConvoyTelemetry({ convoy: { state: createConvoy(S.convoy!.params), p: S.convoy!.params }, boat: { state: boat }, setup: { playerStart: S.playerStart, enemyFrom: S.enemyFrom } });
  return tele(pt, { convoy, homeEdgeM: 2715 });
}

describe('jp_01 の data（spec §B。すべて data/*.json。source は historical／design と「WebSearch の抜粋のみ・本文未読」）', () => {
  it('任務: 1942-12-09 カミンボ沖・escort_convoy・T-38・大発 3 隻を護衛・米PT 2 隻・新月・目的と成功の原文・史実の文（出典は米海軍公刊史の付録 C。人物名なし）・dawn_air は敵の制空下で米PT は夜明けに去る（none）', () => {
    const m = byId('jp_01');
    expect([m['date'], m['place'], m['type'], m['player_boat'], m['moon'], m['playable_from'], m['campaign'], m['order'], m['title_ja']]).toEqual(['1942-12-09', 'ガダルカナル島北岸（カミンボ沖）', 'escort_convoy', 'jp_t38', 'dark', 'v0.6.4', 'jp_hard', 1, '夜の輸送護衛']);
    expect(m['allies']).toEqual(['daihatsu_barge', 'daihatsu_barge', 'daihatsu_barge']);
    expect(m['enemies']).toEqual(['us_pt_enemy', 'us_pt_enemy']);
    expect(m['hazards']).toEqual(['grounding', 'enemy_aircraft']);
    expect(m['objective']).toBe('大発3隻を浜まで護衛する。米PTは見つけやすくて近い方を狙う。速く走るか撃てば自艇が大発より先に狙われる。大発が狙われたら寄って撃ち返し、赤い線は全速で転舵');
    expect(m['success']).toBe('大発2隻以上を浜に届けて帰投。3隻なら上陸の点が増える');
    expect(m['source_url']).toBe('https://www.ibiblio.org/hyperwar/USN/CloseQuarters/PT-C.html');
    const note = String(m['historical_note']);
    expect(note).toContain('At Close Quarters');
    expect(note).toContain('T-38型は1943〜45年');
    expect(note).toContain('ゲーム上の想定');
    expect(note).toContain(EXCERPT);
    const brief = getBriefingRecord(gameData, 'jp_01');
    expect(brief.noteJa).toBe('1942年12月、ガダルカナル島北岸では月明かりの夜の大発の輸送が米PTと夜間機に阻まれ、計画の半分も運べなかった。12月9日夜にはPT-44とPT-59がカミンボ沖で大発を襲った。魚雷艇が大発を護衛してPTと戦った記録は無く、この夜はゲーム上の想定（艇は1944年のT-38で代用）。');
    // 和文に半角スペースなし・数字の後に mm を続けない（Phaser の折り返し。tests/jp05-mission と同じ作法）
    for (const t of [brief.objective, brief.success, brief.noteJa]) {
      expect(t, t).not.toContain(' ');
      expect(t, t).not.toMatch(/\dmm/);
    }
    // 人物名なし（CLAUDE.md §11。米海軍公刊史の著者名を書かない）
    for (const t of strings(m)) {
      for (const name of PERSON_DENYLIST) expect(t, name).not.toContain(name);
      expect(t).not.toMatch(RANK_RE);
    }
    const a = getDawnAir(gameData, 'jp_01');
    expect([a.control, a.playAs, a.shipsAtDawn, a.labelJa]).toEqual(['enemy', 'enemy', 'none', '昼の空は敵（ヘンダーソン基地）']);
    expect(String((m['dawn_air'] as Rec)['source'])).toContain('v0.6.4: enemy_ships_at_dawn retire → none');
  });
  it('遊べる世界（v0_1_prototype）: 米PT 2 隻・guns・夜明け 180 秒（実機 2 回目に 200 → 180）・燃料 19 gal・6000×3000・出発 (1200, 2400) 東向き・輪 (4150, 2700) r 250 margin 1.6・哨戒線・convoy の鍵（浜 60 m おき・12 m・38°）・岸・今夜の揺らぎ・危険・空襲 4 機東から。source は design (v0.6.4', () => {
    expect([proto['enemies'], proto['main_weapon'], proto['duration_s'], proto['fuel_allotment_gal'], proto['shallows']]).toEqual([['us_pt_enemy', 'us_pt_enemy'], 'guns', 180, 19, []]);
    expect(proto['bounds_m']).toMatchObject({ width: 6000, height: 3000 });
    expect(proto['player_start']).toMatchObject({ x_m: 1200, y_m: 2400, heading_deg: 90 });
    expect(proto['return_point']).toMatchObject({ x_m: 4150, y_m: 2700, radius_m: 250, call_margin: 1.6, torpedo_settle_max_s: 10, torpedo_end_settle_s: 5 });
    expect(proto['pt_boats']).toMatchObject({ legs_m: [[4100, 2000, 2900, 2000], [4100, 2200, 2900, 2200]], start_along_m: 600, leave_heading_deg: 45 });
    expect(proto['convoy']).toMatchObject({ lead_start: { x_m: 1200, y_m: 2550, heading_deg: 90 }, offsets_m: [0, 120, 240], landing_x_m: 3600, arrive_quota: 2, barge_hp: 12, detect_band: 'silent', target_keep_ratio: 0.8, target_switch_hold_s: 1.0, flash_hold_s: 1.0, beach: { spacing_m: 60, margin_m: 12, run_in_deg: 38 } });
    expect(proto['coast']).toMatchObject({ side: 'south', land_m: 600, label_ja: 'ガダルカナル島（カミンボ）' });
    expect(proto['night']).toMatchObject({ hazard_scale: 1, optional_hazards: [], enemy_jitter: { x_m: 800, y_m: 150, heading_deg: 0 }, barge_lead_jitter_m: 250, mirror_chance: 0 });
    expect(proto['hazards']).toEqual(['enemy_ship_gunfire_or_ram', 'dawn_air_strike']);
    expect(proto['dawn_strike']).toMatchObject({ aircraft_id: 'us_henderson_aircraft', count: 4, from_bearing_deg: 90, escort_target_planes: [] });
    for (const k of ['main_weapon_source', 'duration_s_source', 'fuel_allotment_gal_source', 'hazards_source']) expect(String(proto[k]), k).toContain('design (v0.6.4');
    for (const k of ['bounds_m', 'player_start', 'return_point', 'pt_boats', 'convoy', 'night', 'dawn_strike']) expect(String((proto[k] as Rec)['source']), k).toContain('design (v0.6.4');
    expect(String((proto['convoy'] as Rec)['source'])).toContain(EXCERPT);
    // 浜（v0.6.4 実機 1 回目のユーザーの原文と、大発の歩板の史実は抜粋の注と確度）
    const beachSrc = String(((proto['convoy'] as Rec)['beach'] as Rec)['source']);
    expect(beachSrc).toContain('design (v0.6.4 実機 1 回目「大発が浜に上陸っていうけど何もない海の真ん中で消えていくので意味不明です」');
    expect(beachSrc).toContain(`${EXCERPT}。medium`); // 要約 1 つだけ（レビュー D7: high は docs/01 の作法より上）
    for (const k of ['convoy', 'return_point']) expect(String((proto[k] as Rec)['source']), k).toContain('v0.6.4 実機 1 回目');
    expect(String(proto['enemy_behavior'])).toContain('core/pt-target');
    expect(String((proto['return_point'] as Rec)['torpedo_end_settle_s_source'])).toContain('（jp_01 は魚雷を撃たないので効かない）');
  });
  it('T-38 の 25mm（boats.json の jp_t38.gun_battery）: 25mm機銃・射程 600／有効 300・死角 30°・閃光 1200・1 群 220 発/分・damage 4・散布 56・水柱 3・弾倉 15 発／交換 3.2 秒・最小散布 22 m（v0.6.4 実機 1 回目）。source は historical / design (v0.6.4 と抜粋の注。jp_06（魚雷の任務）では読まない', () => {
    const boat = (gameData.boats.boats as unknown as Rec[]).find((b) => b['id'] === 'jp_t38')!;
    expect(boat['gun_battery']).toEqual({
      label_ja: '25mm機銃', range_m: 600, effective_m: 300, dead_cone_deg: 30, muzzle_flash_reveal_m: 1200,
      spread_factor: { stop: 1.0, silent: 1.0, cruise: 1.6, full: 2.5 },
      groups: [{ id: '25mm_type96', rounds_per_min: 220, damage: 4, shell_speed_mps: 500, dispersion_m: 56, splash_radius_m: 3.0 }],
      magazine: { rounds: 15, reload_s: 3.2 },
      min_spread_m: 22,
    });
    expect(S.guns!.minSpreadM).toBe(22);
    const src = String((boat['source'] as Rec)['gun_battery']);
    expect(src).toMatch(/historical .*\/ design \(v0\.6\.4/);
    expect(src).toContain(EXCERPT);
    // 最小散布の文（v0.6.4 実機 1 回目のユーザーの原文・九六式の照準の評価は抜粋の注と確度・下限の値は design）
    const floor = src.slice(src.indexOf('min_spread_m 22（v0.6.4 実機 1 回目'));
    expect(floor).toContain('「こちらの命中率が高くて割と撃退できますね」');
    expect(floor).toContain(`${EXCERPT}。medium`);
    expect(floor).toContain('下限の値に史料は無い（design）');
    expect(boat['guns']).toEqual(['25mm_x1']);
    expect(buildWorldSetup(gameData, 'jp_06').guns).toBeNull();
    expect(getPrototypeMission(gameData, 'jp_06').playerBoatId).toBe('jp_t38');
  });
  it('ヘンダーソン基地の機（enemies.json の us_henderson_aircraft）: USN・「米陸上機（F4F／SBD 相当）」・爆弾 2 発 35・値は us_carrier_aircraft の写し。source は historical（抜粋）と design (v0.6.4', () => {
    const list = gameData.enemies.enemies as unknown as Rec[];
    const h = list.find((e) => e['id'] === 'us_henderson_aircraft')!;
    const c = list.find((e) => e['id'] === 'us_carrier_aircraft')!;
    expect([h['faction'], h['name_ja']]).toEqual(['USN', '米陸上機（F4F／SBD 相当）']);
    expect(h['strike']).toEqual(c['strike']);
    expect(h['strike']).toMatchObject({ run_speed_kt: 120, bomb: { count: 2, damage: 35 } });
    const src = h['source'] as Rec;
    expect(String(src['type'])).toMatch(/^historical /);
    expect(String(src['type'])).toContain(EXCERPT);
    expect(String(src['others'])).toContain('design (v0.6.4');
    expect(textWidthPx(`${String(h['name_ja'])} 4 機が東から来る ・ 投下で転舵（旋回中は逆へ）`, 22)).toBeLessThanOrEqual(LINE2_MAX_PX);
    for (const t of strings(h)) for (const name of PERSON_DENYLIST) expect(t, name).not.toContain(name);
  });
  it('得点（scoring.json）: escort_convoy の達成 300（帰投が要る）・上陸 1 隻 100・回避の点なし。convoy の鍵が無い data でも読める', () => {
    const p = getScoringParams(gameData);
    expect(p.objectiveByType['escort_convoy']).toBe(300);
    expect(String((scoring as unknown as Rec)['objective_by_type'] && ((scoring as unknown as Rec)['objective_by_type'] as Rec)['source'])).toContain('escort_convoy（v0.6.4');
    expect(p.convoyArrivalPoints).toBe(100);
    expect(p.evadeByType['escort_convoy']).toBeUndefined();
    expect(String(((scoring as unknown as Rec)['convoy'] as Rec)['source'])).toContain('design (v0.6.4');
    const { convoy: _c, ...noConvoy } = scoring as unknown as ScoringDataRecord;
    expect(isScoringDataRecord(noConvoy)).toBe(true);
  });
});

describe('jp_01 の世界（spec §B.2・§E.5）', () => {
  afterEach(() => vi.restoreAllMocks());
  it('組み立て: guns・魚雷 0・夜明け 180・燃料 19・停止で 480 m・輸送隊 3 隻（HP 12・上陸地点 3,660／3,600／3,540・浜の線 y 2,988・転舵 3,099／3,039／2,979・浜への道 711 m・ノルマ 2・静音の帯 600 m・規則 0.64／1 秒／1 秒）・25mm（最小散布 22 m）・米PT 2 隻（西向きに出発）・空襲あり（夜明けの空は敵）・岸あり・敵の大発なし・輪 (4150, 2700)', () => {
    expect([S.mainWeapon, S.torpedoCapacity, S.durationS, S.fuelAllotmentGal, S.baseDetectM]).toEqual(['guns', 0, 180, 19, 2000]);
    expect(S.detectRangeAtStartM).toBeCloseTo(480, 9);
    expect(S.convoy!.params).toMatchObject({ count: 3, hp: 12, leadX: 1200, leadY: 2550, headingDeg: 90, offsetsM: [0, 120, 240], landingX: 3600, quota: 2 });
    const beach = S.convoy!.params.beach!;
    expect([beach.y, beach.shoreY, beach.x]).toEqual([2988, 3000, [3660, 3600, 3540]]);
    [3099.39, 3039.39, 2979.39].forEach((x, i) => expect(beach.turnX[i]).toBeCloseTo(x, 2));
    expect(beach.runInM).toBeCloseTo(711.43, 2);
    expect(S.convoy!.detectBand).toBe('silent');
    expect(S.convoy!.rule.keepRatio2).toBeCloseTo(0.64, 12);
    expect([S.convoy!.rule.lockS, S.convoy!.rule.flashHoldS]).toEqual([1, 1]);
    const g = S.guns!;
    expect([g.label, g.rangeM, g.effectiveM, g.deadConeDeg, g.flashRevealM, g.magazine, g.minSpreadM]).toEqual(['25mm機銃', 600, 300, 30, 1200, { rounds: 15, reloadS: 3.2 }, 22]);
    expect(g.groups.map((x) => [x.id, x.roundsPerMin, x.damage, x.shellSpeedMps, x.dispersionM, x.splashRadiusM])).toEqual([['25mm_type96', 220, 4, 500, 56, 3]]);
    expect(S.ptBoats!.count).toBe(2);
    expect(Array.from(S.ptBoats!.startHeadingDeg)).toEqual([270, 270]);
    expect(S.enemyFrom).toEqual({ x: 3500, y: 2000 });
    expect([S.dawnAir.playAs, S.dawnAir.shipsAtDawn]).toEqual(['enemy', 'none']);
    expect(S.airStrike).not.toBeNull();
    expect(S.airStrike!.planes).toBe(4);
    expect(S.airStrike!.fromJa).toBe('東');
    expect([S.mission.barges, S.mission.enemyStart, S.mission.escort, S.mission.transport, S.storm, S.seaplane, S.smokeParams]).toEqual([null, null, null, null, null, null, null]);
    expect(S.mission.coast).toEqual({ side: 'south', landM: 600, label: 'ガダルカナル島（カミンボ）' });
    expect(S.mission.shallows).toEqual([]);
    expect(S.playerStart).toEqual({ x: 1200, y: 2400, headingDeg: 90 });
    expect([S.mission.returnPoint.x, S.mission.returnPoint.y, S.mission.returnPoint.radiusM, S.mission.returnPoint.callMargin]).toEqual([4150, 2700, 250, 1.6]);
    expect(S.mission.bounds).toEqual({ width: 6000, height: 3000 });
    expect(hasHardVariant(gameData, 'jp_01')).toBe(true); // v0.6.6 から jp_01 にハードの違い（隼艇・米PT 3 隻・ノルマ 3）
    expect(playableMissionIds(gameData, 'jp_hard')).toEqual(['jp_01', 'jp_05', 'jp_06']);
  });
  it('今夜（seed+16）: 引くのは 5 回（隊 3・大発の先頭 1・反転 1＝jp_05 と同じ）。反転しない。PT の出発点は自艇から ≥ 1,560 m・船団（先頭〜最後尾・揺らぎ込み）から ≥ 780 m（静音の帯 600 × 1.3。隅は約 1,464 m）。先頭は 1200 ± 250', () => {
    const spy = vi.spyOn(SeededRng.prototype, 'next');
    buildWorldSetup(gameData, 'jp_01', { sortie: sortie(1) });
    expect(spy.mock.calls.length).toBe(5);
    spy.mockRestore();
    expect(Math.abs(convoyStartClearM(S.ptBoats!, S.mission) - 1464)).toBeLessThanOrEqual(1);
    let minPlayerM = Infinity;
    let minBargeM = Infinity;
    for (let seed = 1; seed <= 300; seed++) {
      const s = buildWorldSetup(gameData, 'jp_01', { sortie: sortie(seed) });
      expect(s.night.mirrored, `${seed}`).toBe(false);
      const c = s.convoy!.params;
      expect(Math.abs(c.leadX - 1200), `${seed}`).toBeLessThanOrEqual(250);
      expect([c.leadY, c.headingDeg, c.landingX], `${seed}`).toEqual([2550, 90, 3600]);
      expect(c.beach, `${seed}`).toEqual(S.convoy!.params.beach); // 浜は地形（揺らぎで動かない）
      const p = s.ptBoats!;
      for (let i = 0; i < p.count; i++) {
        expect(p.startHeadingDeg[i], `${seed}`).toBe(270);
        minPlayerM = Math.min(minPlayerM, Math.hypot(p.startX[i]! - s.playerStart.x, p.startY[i]! - s.playerStart.y));
        for (const off of c.offsetsM) minBargeM = Math.min(minBargeM, Math.hypot(p.startX[i]! - (c.leadX - off), p.startY[i]! - c.leadY));
      }
    }
    expect(minPlayerM).toBeGreaterThanOrEqual(1560);
    expect(minBargeM).toBeGreaterThanOrEqual(780);
  });
  it('呼びかけ（core/mission-flow と ui/convoy-lines）: 決着（みな上陸か沈没）で CALL_SUNK＝「大発 上陸 2/3 ・ 帰投せよ」（0/3 なら全滅）、2 隻上陸＋1 隻航行中は呼びかけ無し、燃料少が上なら「燃料少 帰投せよ」。輸送隊では撃ち尽くし（CALL_EXPENDED）は立てない', () => {
    const f = createConvoy(S.convoy!.params);
    f.barges[0]!.phase = CV_ARRIVED;
    f.barges[1]!.phase = CV_ARRIVED;
    f.arrived = 2;
    expect(convoyResolved(f)).toBe(false);
    expect(updateReturnCalls(0, convoyResolved(f), false, 19, 1, 150, 10, 1.6)).toBe(0);
    f.barges[2]!.phase = CV_SUNK;
    f.sunk = 1;
    expect(convoyResolved(f)).toBe(true);
    const call = topCall(updateReturnCalls(0, convoyResolved(f), false, 19, 1, 150, 10, 1.6));
    expect(call).toBe(CALL_SUNK);
    const t = tele01();
    Object.assign(t.convoy, { afloat: 0, arrived: 2, sunk: 1, resolved: true });
    expect(missionMode(t, call, 0)).toBe(MISSION_CALL);
    expect(`${dawnCallLabel(call, t.gunMission, DAWN_AIR_NONE, convoyCallJa(t.convoy))}帰投せよ  3100 m`).toBe('大発 上陸 2/3 ・ 帰投せよ  3100 m');
    Object.assign(t.convoy, { arrived: 0, sunk: 3 });
    expect(`${dawnCallLabel(call, t.gunMission, DAWN_AIR_NONE, convoyCallJa(t.convoy))}帰投せよ  3100 m`).toBe('大発 全滅 ・ 帰投せよ  3100 m');
    const fuel = topCall(updateReturnCalls(0, true, false, 1, 1, 150, 10, 1.6));
    expect(fuel).toBe(CALL_FUEL);
    expect(`${dawnCallLabel(fuel, false, DAWN_AIR_NONE, convoyCallJa(t.convoy))}帰投せよ  3100 m`).toBe('燃料少 帰投せよ  3100 m');
    // 世界の配線（systems/mission-world の getter）: 呼びかけは決着の生の真偽、撃ち尽くしは輸送隊では偽
    const world = readFileSync('src/systems/mission-world.ts', 'utf8');
    // 書き方の揺れ（空白・改行）では落ちない形で、配線（輸送隊なら決着／偽）だけを見る
    expect(world).toMatch(/returnCallDone\(\)[^{]*\{\s*return this\.convoy \? this\.convoy\.resolved : this\.enemy\.objectiveDone;/);
    expect(world).toMatch(/noTargetsLeft\(\)[^{]*\{\s*return this\.convoy \? false : this\.enemy\.noTargetsLeft;/);
  });
  it('達成（Result の objectiveDone。systems/mission-telemetry）は終了理由から: 帰投して上陸がノルマ以上。2/3 で沈めば達成でない（帰投 700 > 沈没 580）、3/3 決着でも帰投前は呼びかけだけ', () => {
    // 配線: 輸送隊の任務は core の convoyObjectiveDone（上陸数とノルマ）。中身は下で core の関数を直接見る。v0.6.7 S0 から式は systems/mission-objective（mission-telemetry はそれを呼ぶ）
    expect(readFileSync('src/systems/mission-telemetry.ts', 'utf8')).toContain('objectiveDone: objectiveDoneOf(reason, w),');
    const src = readFileSync('src/systems/mission-objective.ts', 'utf8');
    expect(src).toMatch(/return w\.convoy\s*\?\s*convoyObjectiveDone\(reason,\s*w\.convoy\.state\.arrived,\s*w\.convoy\.p\.quota\)\s*:/);
    const q = S.convoy!.params.quota;
    expect(q).toBe(2);
    const done = (reason: Parameters<typeof convoyObjectiveDone>[0], arrived: number): boolean => convoyObjectiveDone(reason, arrived, q);
    expect([done('returned', 2), done('returned', 3), done('returned', 1), done('pt_fire', 2), done('adrift', 3), done('cleared', 2), done('air_strike', 3), done('grounded', 2)]).toEqual([true, true, false, false, false, true, false, false]);
    expect([convoyObjectiveDone('returned', 0, 0), convoyObjectiveDone('returned', 2, 3), convoyObjectiveDone('returned', 3, 3)]).toEqual([true, false, true]);
  });
});

describe('jp_01 の Briefing・Title（spec §D.1）', () => {
  it('Briefing の 6 行（原文）。敵は自艇の出発点から見た 1 隻目の PT「東から」、危険は「、」でつなぐ、条件の武器の句は 25mm機銃（ptGunBriefingJa）。幅: 目的は 2 行（≤ 1.9 × 1,056）、ほかは 1 行、条件は「gal」の後で折り返す', () => {
    const rec = { ...getBriefingRecord(gameData, 'jp_01'), hazardIds: S.hazardsTonight, absentHazardIds: S.absentHazards };
    const n = briefingNumbers(S);
    const rows = briefingRows(rec, n, nameOf, labelOf);
    expect(rows.map((r) => [r.label, r.text])).toEqual([
      ['目的', '大発3隻を浜まで護衛する。米PTは見つけやすくて近い方を狙う。速く走るか撃てば自艇が大発より先に狙われる。大発が狙われたら寄って撃ち返し、赤い線は全速で転舵'],
      ['成功', '大発2隻以上を浜に届けて帰投。3隻なら上陸の点が増える（帰投地点は東の青い輪）'], // 自艇の出発点から（レビュー ux-6。中心からは南東）
      ['月', '新月 ・ 見える 900 m ・ 見つかる 巡航 1200 m／静音 600 m'],
      ['敵', '米PTボート ×2（東から）'],
      ['危険', '敵艦艇の砲撃・衝突、夜明けの空襲'],
      ['条件', `夜明けまで 180 秒（以後は空襲） ・ 燃料 19 gal ・ 25mm機銃1挺（撃つと閃光で見つかる。魚雷はPTの下を抜ける）`],
    ]);
    expect(n.weaponJa).toBe(ptGunBriefingJa('25mm機銃'));
    expect(ptGunBriefingJa('13mm機銃')).toBe(PT_GUN_BRIEFING_JA);
    expect(compassJa(4500, 2250, 6000, 3000)).toBe('南東'); // (4500, 2121) までが「東」の境
    expect(compassJa(4500, 2121, 6000, 3000)).toBe('東');
    const WRAP = 1056;
    expect(textWidthPx(rows[0]!.text, 24)).toBeGreaterThan(WRAP);
    expect(textWidthPx(rows[0]!.text, 24)).toBeLessThanOrEqual(1.9 * WRAP);
    for (const r of rows.slice(1, 5)) expect(textWidthPx(r.text, 24), r.label).toBeLessThanOrEqual(WRAP);
    const cond = rows[5]!.text;
    const brk = cond.lastIndexOf(' ', cond.indexOf(' '));
    expect(cond.slice(brk + 1).startsWith('・\u000025mm機銃'.replace('\u0000', ' '))).toBe(true);
    expect(textWidthPx(cond, 24)).toBeGreaterThan(WRAP);
    expect(textWidthPx(cond.slice(0, brk), 24)).toBeLessThanOrEqual(WRAP);
    expect(textWidthPx(cond.slice(brk + 1), 24)).toBeLessThanOrEqual(WRAP);
  });
  it('Title: 任務一覧の行は「夜の輸送護衛 ・ 1942年12月9日 ・ ガダルカナル島北岸（カミンボ沖）」、日本の操作の一言は 2 つの機銃の任務を名で言い 18 px で 960 px 以内', () => {
    const rec = getBriefingRecord(gameData, 'jp_01');
    expect(`${rec.titleJa} ・ 1942年12月9日 ・ ${rec.place}`).toBe('夜の輸送護衛 ・ 1942年12月9日 ・ ガダルカナル島北岸（カミンボ沖）');
    const hint = TITLE_HINT_BY_CAMPAIGN_JA['jp_hard']!;
    expect(hint).toContain('輸送護衛は機銃');
    expect(hint).not.toContain('13mm');
    expect(textWidthPx(hint, TITLE_HINT_PX)).toBeLessThanOrEqual(960);
  });
});

describe('jp_01 の HUD と Result（spec §D.2・§D.3・§D.5）', () => {
  it('出撃時の 2 行目（jp_01 の世界の値）: 「大発 3 隻 ・ 上陸 0/3 ・ 浜まで 2800 m ・ 米PT 2 隻 東で哨戒中」（最後尾 x 960 → 転舵 2,979 → 浜 711 m＝2,731 m）。全速なら「13 kt 以下に」（T-38 の静音の上限）', () => {
    const t = tele01();
    expect(t.convoy).toMatchObject({ enabled: true, total: 3, afloat: 3, arrived: 0, sunk: 0, resolved: false, fromDirJa: '東' });
    expect(t.convoy.leftM).toBeCloseTo(2730.8, 1);
    expect([t.pt.total, t.pt.alive, t.pt.silentMaxKt, t.pt.leaveDirJa, t.pt.damagePerHit, t.pt.gunEnabled, t.pt.gunRangeM]).toEqual([2, 2, 13, '北東', 4, true, 600]);
    expect(row(t)).toEqual([MISSION_PT, '大発 3 隻 ・ 上陸 0/3 ・ 浜まで 2800 m ・ 米PT 2 隻 東で哨戒中', '#e6eef7']);
    expect(textWidthPx(row(t)[1], 22)).toBeLessThanOrEqual(LINE2_MAX_PX);
    const fast = tele01();
    Object.assign(fast.pt, { sighted: true, dx: 0, dy: -600 });
    Object.assign(fast, { targetStep: 'full', detectRangeM: 1920 });
    expect(row(fast)[1]).toBe('米PT 600 m ・ 速い！ 1900 m で見つかる ・ 13 kt 以下に');
  });
  it('ptKey は標的の種類（bit 28）で変わる（航過・突撃・結果）。31 ビットの内で正', () => {
    const t = tele01();
    const pass = (kind: number): number => {
      const x = tele01();
      Object.assign(x.pt, { detected: true, passing: true, threatPhase: PT_PASS, sighted: true, dx: 200, dy: 200, dodge: 1, escapeDeg: 315, targetKind: kind });
      return keyOf(x);
    };
    const rush = (kind: number): number => {
      const x = tele01();
      Object.assign(x.pt, { detected: true, threatPhase: PT_RUN_IN, sighted: true, dx: 200, dy: 200, targetKind: kind });
      return keyOf(x);
    };
    const result = (kind: number): number => {
      const x = tele01();
      Object.assign(x.pt, { detected: true, threatPhase: PT_BREAK, passes: 1, lastPassFired: true, lastPassHits: 3, lastPassTargetKind: kind });
      return keyOf(x, 0, MODE_FLAG_PT_RESULT);
    };
    for (const k of [pass, rush, result]) {
      expect(k(1)).not.toBe(k(0));
      expect((k(1) >> 28) & 1).toBe(1);
      expect((k(0) >> 28) & 1).toBe(0);
      for (const v of [k(0), k(1)]) {
        expect(v).toBeGreaterThan(0);
        expect(v).toBeLessThan(2 ** 31);
      }
    }
    expect([missionMode(t, 0, 0), missionMode({ ...t, pt: { ...t.pt, detected: true, passing: true } }, 0, 0), missionMode({ ...t, pt: { ...t.pt, detected: true, threatPhase: PT_BREAK } }, 0, 0)]).toEqual([MISSION_PT, MISSION_PT_PASS, MISSION_PT_CONTACT]);
  });
  it('得点の順（§D.5。新月・無傷・燃料 58%）: 3/3 帰投 1458 > 2/3 帰投 1358 > 1/3 帰投 800 > 0/3 帰投 700 > 3/3 届けて沈没（PT 2 隻撃沈）580。points_per_arrival を外した data でも順は崩れない（3/3 と 2/3 は同点）', () => {
    const base: ScoreInput = { returned: true, objectiveDone: true, missionType: 'escort_convoy', bands: [], kills: 0, killEnemyId: 'us_pt_enemy', fuelLeftPct: 58, crewAlive: 7, crewTotal: 7, detections: 1, afterDawn: false };
    const kpi = gameData.hitRateModel.kpi_by_range.map((b) => b.band);
    const { convoy: _c, ...noConvoy } = scoring as unknown as ScoringDataRecord;
    for (const [p, delivery] of [[getScoringParams(gameData), 100], [scoringParamsFromData(noConvoy as ScoringDataRecord, kpi), 0]] as const) {
      const s = (over: Partial<ScoreInput>): number => computeScore({ ...base, ...over }, p).total;
      const all = s({ arrivals: 3 });
      const two = s({ arrivals: 2 });
      const one = s({ arrivals: 1, objectiveDone: false });
      const none = s({ arrivals: 0, objectiveDone: false });
      const sunk = s({ arrivals: 3, returned: false, objectiveDone: false, kills: 2, crewAlive: 0 });
      expect([all, two, one, none, sunk]).toEqual([1158 + 3 * delivery, 1158 + 2 * delivery, 700 + delivery, 700, 280 + 3 * delivery]);
      expect(all).toBeGreaterThanOrEqual(two);
      expect(two).toBeGreaterThan(one);
      expect(one).toBeGreaterThanOrEqual(none);
      expect(none).toBeGreaterThan(sunk);
      if (delivery > 0) expect(all).toBeGreaterThan(two);
    }
    expect(computeScore({ ...base, arrivals: 2 }, getScoringParams(gameData)).deliveries).toBe(200);
    expect(computeScore({ ...base, arrivals: 2 }, getScoringParams(gameData)).evade).toBe(0); // escort_convoy に回避の点は無い
  });
});
