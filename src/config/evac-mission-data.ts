// 空襲下の退避（v0.6.11。日本ハードモード⑨・jp_03「運天港・空襲下の退避」。spec-v0611-r2 §4・§5）の任務の読み出し: 任務の v0_1_prototype.evac があれば、
// evac・evac_raid（形は core/evac-data）・risk_events.json の unten_air_raid・自艇（boats.json）・空襲の機体（enemies.json）から世界の値（EvacSetup）を組み、
// 起動時の検査 V-E1〜V-E14 をする（例外は鍵を名指す日本語）。1 編隊の値は機数ごとに凍結の airStrikeParamsFromData で組み、その例外は unten_air_raid.params.sortie を名指す文に包み直す（r2 L12）。
// PrototypeMission に鍵は足さない（block は生の proto から読む。patrol-air-mission-data と同じ作法）。world-setup が組み立てのたびに（evacSetupPart）、Boot が全任務（ハードも）を 1 回（validateEvacMissions）呼ぶ。
import { getBoatFuelCurve, getBoatRecord, getPrototypeMission, type GameData, type PrototypeMission } from './game-data';
import { hasHardVariant } from './mission-data';
import { FIXED_STEP_S } from './step-config';
import { AIR_STRIKE_FADE_S, type AirStrikeParams } from '../core/air-strike';
import { airStrikeParamsFromData, isStrikeAircraftRecord, type StrikeHull } from '../core/air-strike-data';
import { AIR_STRIKE_MAX_PLANES } from '../core/air-strike-state';
import { bearingJa } from '../core/briefing';
import { EVAC_EVENT_ID, EVAC_MAX_FLIGHTS, EVAC_MAX_WAVES, evacBlockFromData, evacEventFromData, evacRaidBlockFromData, type EvacBlock, type EvacRaidBlock } from '../core/evac-data';
import { evacParamsFromData, evacRaidParamsFromData, type EvacParams, type EvacRaidParams } from '../core/evac-params';

/** V-E2: 停泊地のどの艇も、どの隠れ場所の輪の縁からもこれ以上外（m。出撃した瞬間に輪の中で入り始めない＝H1） */
export const EVAC_CHECK_MOORED_CLEAR_M = 20;
/** V-E3: 隠れ場所どうしの中心は 2 × 輪 ＋ これ以上離れる（m。輪が重ならず、札と輪が読める） */
export const EVAC_CHECK_SHELTER_GAP_M = 100;
/** V-E6: 予告の間隔は 予告の先 ＋ 最大機数の編隊の長さ ＋ これ以上（実秒。前の波が去ってから次の予告） */
export const EVAC_CHECK_WAVE_MARGIN_S = 5;
/** V-E10: 止まって待つと漂流するまでの実秒の上限と、燃料 0 で止まってから漂流になるまでの実秒（tests/dawn-air の「1,500 秒未満で漂流」と同じ形） */
export const EVAC_CHECK_DRIFT_BY_S = 1500;
export const EVAC_CHECK_DRIFT_WAIT_S = 1.5;
/** V-E12: bearing_fix_deg が凍結の spawn_offsets_deg の先頭 n 個の平均を戻す許し（deg。r2 L1 の S2 の tests は ±1°） */
export const EVAC_CHECK_BEARING_FIX_TOL_DEG = 1;
/** V-E13: 1 編隊が飛ぶ爆撃の回数の上限（evac_raid.passes_max・hard.evac_passes_max の最大。v0.6.11 S3b。2 回目より先は波の間に収まらない） */
export const EVAC_CHECK_PASSES_MAX = 3;
/** V-E11: 空襲下の退避の任務と同居しない v0_1_prototype の鍵（艦艇・水上機・味方機（右端の段 3 を［切替］が使う）・暴風・ほかの航空機の任務） */
export const EVAC_EXCLUSIVE_KEYS = ['enemy_start', 'barges', 'pt_boats', 'convoy', 'escort', 'transport', 'shore_battery', 'enemy_aircraft', 'friendly_aircraft', 'storm', 'patrol_air', 'landing', 'ally_destroyer'] as const;
/** evac の任務だけが持つ v0_1_prototype の鍵（無い任務に置けば例外＝ほかの任務の setup に鍵が増えない） */
export const EVAC_ONLY_KEYS = ['evac_raid', 'fuel_free_until_s', 'day_start'] as const;

/** 空襲下の退避の世界の値（WorldSetup.evac） */
export interface EvacSetup {
  params: EvacParams;
  raid: EvacRaidParams;
  /** 1 編隊の値（波に出る機数ごとに 1 つ・機数の昇順。同じ機数の編隊で共有して読むだけ） */
  sorties: AirStrikeParams[];
  /** stepTimeS がこの秒に届くまで燃料を減らさない（空襲の間。spec §3.9） */
  fuelFreeUntilS: number;
  /** 海の色と時計・帯・Result の言葉を最初から昼に（spec §10.3） */
  dayStart: boolean;
}

type Rec = Record<string, unknown>;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: number, min: number, max: number = Infinity): boolean => Number.isInteger(v) && v >= min && v <= max;
const isProb = (v: number): boolean => v >= 0 && v <= 1;

/** 艇 k（0＝隊長艇）の縦列の点: 艇首 headingDeg の艇尾の方向へ k × gap（x 東・y 南・北 0 時計回り） */
function columnPoint(x: number, y: number, headingDeg: number, k: number, gap: number): { x: number; y: number } {
  const h = (headingDeg * Math.PI) / 180;
  return { x: x - Math.sin(h) * k * gap, y: y + Math.cos(h) * k * gap };
}

/** 任務の空襲下の退避の値。v0_1_prototype.evac の無い任務は null（evac だけの鍵があれば例外）。data が壊れていれば「<任務>.v0_1_prototype.evac…: …（V-En）」の例外 */
export function getEvacParams(data: GameData, missionId: string, hard: boolean = false): EvacSetup | null {
  const m = (data.missionsSeed.missions as readonly Rec[]).find((x) => x['id'] === missionId);
  const proto = m?.['v0_1_prototype'] as Rec | undefined;
  if (!m || !proto) return null;
  const at = `${missionId}.v0_1_prototype`;
  if (proto['evac'] === undefined) {
    for (const k of EVAC_ONLY_KEYS) if (proto[k] !== undefined) throw new Error(`${at}.${k} は空襲下の退避（evac）の任務だけ`);
    return null;
  }
  const bad = (v: string, msg: string): never => {
    throw new Error(`${at}.${msg}（${v}）`);
  };
  const mission = getPrototypeMission(data, missionId, hard);
  const b = evacBlockFromData(proto['evac'], `${at}.evac`);
  if (proto['evac_raid'] === undefined) bad('V-E5', 'evac_raid（波と編隊）が無い');
  const r = evacRaidBlockFromData(proto['evac_raid'], `${at}.evac_raid`);
  const ev = evacEventFromData((data.riskEvents.events as readonly unknown[]).find((e) => (e as Rec)['id'] === EVAC_EVENT_ID), `${missionId} の港の空襲`);
  // V-E11 置き場: 艦艇のいない航空機だけの任務。危険に unten_air_raid・敵の制空下（夜明けの 4 機）・main_weapon none・艇は座席と同じで煙幕なし
  for (const k of EVAC_EXCLUSIVE_KEYS) if (proto[k] !== undefined) bad('V-E11', `${k} と evac は同居しない（航空機だけの任務。右端の段 3 は［切替］）`);
  if (mission.mainWeapon !== 'none') bad('V-E11', `main_weapon は none（狙う艦がいない。${mission.mainWeapon}）`);
  if (!mission.hazards.includes(EVAC_EVENT_ID)) bad('V-E11', `hazards に ${EVAC_EVENT_ID} が要る（Briefing の「危険」）`);
  if ((m['dawn_air'] as Rec | undefined)?.['play_as'] !== 'enemy' || !mission.dawnStrike) bad('V-E11', 'dawn_strike: evac は dawn_air.play_as が enemy で dawn_strike（決着の後の敵機 4 機）のある任務だけ');
  if (b.boat !== mission.playerBoatId) bad('V-E11', `evac.boat（${b.boat}）は player_boat（${mission.playerBoatId}）と同じ（座席＝操作中の隊長艇）`);
  const boat = getBoatRecord(data, b.boat) as unknown as Rec;
  if (boat['smoke_generator'] !== false) bad('V-E11', `evac.boat（${b.boat}）は smoke_generator false（右端の段 3 は［切替］）`);
  const plane = (data.enemies.enemies as readonly unknown[]).find((e) => (e as Rec)['id'] === mission.enemyId);
  if (!isStrikeAircraftRecord(plane)) return bad('V-E11', `enemies（${mission.enemyId}）が enemies.json に strike（run_speed_kt / release_altitude_m / bomb）付きで無い`);
  const ids = proto['enemies'] as unknown[];
  if (ids.length !== 1 || mission.dawnStrike!.aircraft_id !== plane.id) bad('V-E11', `enemies は空襲の機体 1 つ（${ids.join('・')}）で dawn_strike.aircraft_id（${mission.dawnStrike!.aircraft_id}）と同じ`);
  const dayStart = proto['day_start'] ?? false;
  if (typeof dayStart !== 'boolean') bad('V-E11', 'day_start は true か false');
  const w = data.hitRateModel.world;
  const halfLen = ((boat['length_m'] as number) * w.hit_scale) / 2;
  const hull: StrikeHull = { halfLengthM: halfLen, halfBeamM: ((boat['beam_m'] as number) * w.hit_scale) / 2, boundsMarginM: ((boat['length_m'] as number) * w.sprite_scale) / 2 };
  const flights = readHardNum(proto, 'evac_flights', hard, r.flights, at);
  const coverChance = readHardNum(proto, 'evac_cover_reveal_chance', hard, r.cover_reveal_chance, at);
  const passesMax = readHardNum(proto, 'evac_passes_max', hard, r.passes_max, at);
  // V-E13 もう一度来る回数（v0.6.11 S3b。core/evac-repass。1＝今の挙動）
  for (const [k, v] of [['evac_raid.passes_max', r.passes_max], ['hard.evac_passes_max', passesMax]] as const) {
    if (!isInt(v, 1, EVAC_CHECK_PASSES_MAX)) bad('V-E13', `${k} は 1〜${EVAC_CHECK_PASSES_MAX} の整数（1 編隊が飛ぶ爆撃の回数。1 は済みの後に来ない。${v}）`);
  }
  const home = checkPlaces(b, mission, hull.boundsMarginM, bad);
  checkRaid(b, r, flights, coverChance, ev.params.sortie.run_radius_m, ev.params.sortie.spawn_m, plane.strike.bomb.blast_radius_m, halfLen, bad);
  // 1 編隊の値（機数ごと）。凍結の検査（投下の間隔・最初の進路・機数 × 間隔・休み）を通す
  const counts = [...new Set(r.waves.map((x) => x.planes))].sort((p, q) => p - q);
  const sorties = counts.map((n) => {
    try {
      const block = { aircraft_id: plane.id, count: n, count_source: 'evac_raid.waves', from_bearing_deg: r.from_bearing_deg, escort_target_planes: [], source: 'evac_raid' };
      return airStrikeParamsFromData(plane, { id: EVAC_EVENT_ID, params: ev.params.sortie }, block, w.time_scale, hull, null, mission.bounds, bearingJa(r.from_bearing_deg));
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).replace(/^夜明けの空襲（[^）]*）: /, '').replace(/^夜明けの空襲: /, '');
      throw new Error(`${missionId} の港の空襲（risk_events.json の ${EVAC_EVENT_ID}.params.sortie の ${n} 機の編隊）: ${msg}`);
    }
  });
  checkTiming(r, sorties, mission.durationS, bad);
  // V-E10 燃料: 空襲の間は数えない（duration_s と同じ秒）。止まって待つと EVAC_CHECK_DRIFT_BY_S 実秒の前に漂流する（決着の後の時間切れの代わり）
  const fuelFree = proto['fuel_free_until_s'];
  if (!isNum(fuelFree) || fuelFree !== mission.durationS) bad('V-E10', `fuel_free_until_s（${String(fuelFree)}）は duration_s（${mission.durationS}）と同じ`);
  const idleS = ((mission.fuelAllotmentGal / getBoatFuelCurve(data, b.boat).idleGph) * 3600) / w.time_scale;
  if (!((fuelFree as number) + idleS + EVAC_CHECK_DRIFT_WAIT_S < EVAC_CHECK_DRIFT_BY_S)) bad('V-E10', `fuel_allotment_gal（${mission.fuelAllotmentGal}）: fuel_free_until_s ＋ アイドルで尽きる ${idleS.toFixed(1)} 秒 ＋ ${EVAC_CHECK_DRIFT_WAIT_S} は ${EVAC_CHECK_DRIFT_BY_S} 未満（止まって待つと漂流する）`);
  return { params: evacParamsFromData(b, home), raid: evacRaidParamsFromData(r, flights, coverChance, passesMax, mission.bounds), sorties, fuelFreeUntilS: fuelFree as number, dayStart: dayStart as boolean };
}

/** hard.<key>（無ければノーマルの値）。鍵はハードでなくても検査する（数でなければ例外） */
function readHardNum(proto: Rec, key: string, hard: boolean, normal: number, at: string): number {
  const h = proto['hard'] as Rec | undefined;
  const v = h?.[key];
  if (v === undefined) return normal;
  if (!isNum(v)) throw new Error(`${at}.hard.${key} は有限の数（V-E12）`);
  return hard ? v : normal;
}

/** V-E1〜V-E4・V-E8・V-E9: 置き場（海域の内・輪の外・隠れ場所の間・枠・帰投の壕・隊の数）。帰投の輪と同じ点の壕の番号を返す */
function checkPlaces(b: EvacBlock, mission: PrototypeMission, marginM: number, bad: (v: string, msg: string) => never): number {
  const W = mission.bounds.width;
  const H = mission.bounds.height;
  const inside = (x: number, y: number): boolean => x >= marginM && x <= W - marginM && y >= marginM && y <= H - marginM;
  const ring = b.shelter_ring_m;
  if (!(ring > 0)) bad('V-E12', `evac.shelter_ring_m は正（${ring}）`);
  if (!isInt(b.group_size, 1)) bad('V-E9', `evac.group_size は 1 以上の整数（${b.group_size}）`);
  const ids = new Set<string>();
  b.shelters.forEach((s, i) => {
    const at = `evac.shelters[${i}]（${s.label_ja}）`;
    if (ids.has(s.id)) bad('V-E8', `${at}.id が重複（${s.id}）`);
    ids.add(s.id);
    if (!inside(s.x_m, s.y_m)) bad('V-E1', `${at} は海域の縁から ${marginM} m 以上内`);
    if (!isInt(s.slots, b.group_size)) bad('V-E4', `${at}.slots は group_size（${b.group_size}）以上の整数（満員の隊が 1 つ入る。${s.slots}）`);
    if (s.kind === 'cave') for (let k = 1; k < b.group_size; k++) {
      const p = columnPoint(s.x_m, s.y_m, s.exit_heading_deg, k, b.moored_gap_m);
      if (!inside(p.x, p.y)) bad('V-E1', `${at} から出た縦列（exit_heading_deg ${s.exit_heading_deg}・moored_gap_m）の ${k + 1} 隻目が海域の縁から ${marginM} m 以上内に無い`);
    }
    for (let j = 0; j < i; j++) {
      const o = b.shelters[j]!;
      const dx = s.x_m - o.x_m;
      const dy = s.y_m - o.y_m;
      const gap = 2 * ring + EVAC_CHECK_SHELTER_GAP_M;
      if (dx * dx + dy * dy < gap * gap) bad('V-E3', `${at} と ${o.label_ja} の中心は 2 × shelter_ring_m ＋ ${EVAC_CHECK_SHELTER_GAP_M}（${gap} m）以上離れる`);
    }
  });
  const total = b.group_size * b.groups.length;
  const slots = b.shelters.reduce((a, s) => a + s.slots, 0);
  if (!(slots < total)) bad('V-E4', `evac.shelters の枠の合計（${slots}）は全隻（${total}）より少ない（最低 1 隊は隠せない）`);
  const gids = new Set<string>();
  b.groups.forEach((g, i) => {
    const at = `evac.groups[${i}]（${g.label_ja}）`;
    if (gids.has(g.id)) bad('V-E9', `${at}.id が重複（${g.id}）`);
    gids.add(g.id);
    for (let k = 0; k < b.group_size; k++) {
      const p = columnPoint(g.x_m, g.y_m, g.heading_deg, k, b.moored_gap_m);
      if (!inside(p.x, p.y)) bad('V-E1', `${at} の停泊の縦列の ${k + 1} 隻目が海域の縁から ${marginM} m 以上内に無い`);
      for (const s of b.shelters) {
        const dx = p.x - s.x_m;
        const dy = p.y - s.y_m;
        const clear = ring + EVAC_CHECK_MOORED_CLEAR_M;
        if (dx * dx + dy * dy < clear * clear) bad('V-E2', `${at} の ${k + 1} 隻目は ${s.label_ja} の輪の縁から ${EVAC_CHECK_MOORED_CLEAR_M} m 以上外（中心から ${clear} m 以上）`);
      }
    }
  });
  if (!isInt(b.start_group, 1, b.groups.length)) bad('V-E9', `evac.start_group は 1〜${b.groups.length} の整数（${b.start_group}）`);
  const g0 = b.groups[b.start_group - 1]!;
  const ps = mission.playerStart;
  if (ps.x !== g0.x_m || ps.y !== g0.y_m || ps.headingDeg !== g0.heading_deg) bad('V-E9', `player_start は最初に操作する隊（${g0.label_ja}）の隊長艇の停泊地・艇首と同じ`);
  const rp = mission.returnPoint;
  const home = b.shelters.findIndex((s) => s.x_m === rp.x && s.y_m === rp.y);
  if (home < 0 || b.shelters[home]!.kind !== 'cave') bad('V-E8', `return_point（${rp.x}, ${rp.y}）は evac.shelters の壕（kind cave）の 1 つと同じ点`);
  if (rp.radiusM !== ring) bad('V-E8', `return_point.radius_m（${rp.radiusM}）は evac.shelter_ring_m（${ring}）と同じ`);
  return home;
}

/** V-E5・V-E7・V-E9・V-E12: 波と編隊の数・追従の間隔・残存・確率と秒 */
function checkRaid(b: EvacBlock, r: EvacRaidBlock, flights: number, coverChance: number, runRadiusM: number, sortieSpawnM: number, blastM: number, halfLenM: number, bad: (v: string, msg: string) => never): void {
  if (!isInt(r.waves.length, 1, EVAC_MAX_WAVES)) bad('V-E5', `evac_raid.waves は 1〜${EVAC_MAX_WAVES} 波（乱数の系列 +32〜+43。${r.waves.length}）`);
  r.waves.forEach((x, i) => {
    if (!isInt(x.planes, 1, AIR_STRIKE_MAX_PLANES)) bad('V-E5', `evac_raid.waves[${i}].planes は 1〜${AIR_STRIKE_MAX_PLANES} の整数（凍結の空襲の core の上限。${x.planes}）`);
  });
  for (const [k, v] of [['evac_raid.flights', r.flights], ['hard.evac_flights', flights]] as const) {
    if (!isInt(v, 1, EVAC_MAX_FLIGHTS) || v > r.flight_offsets_deg.length) bad('V-E5', `${k} は 1〜${EVAC_MAX_FLIGHTS} の整数で flight_offsets_deg の長さ（${r.flight_offsets_deg.length}）以下（${v}）`);
  }
  if (!isInt(r.flights_per_group_max, 1)) bad('V-E5', `evac_raid.flights_per_group_max は 1 以上の整数（${r.flights_per_group_max}）`);
  if (!(r.spawn_m > runRadiusM && r.spawn_m <= sortieSpawnM)) bad('V-E5', `evac_raid.spawn_m（${r.spawn_m}）は unten_air_raid.params.sortie の run_radius_m（${runRadiusM}）より大きく spawn_m（${sortieSpawnM}）以下（restartAirSortie が収める範囲）`);
  const f = b.follow;
  if (!(f.gap_m > blastM + halfLenM)) bad('V-E7', `evac.follow.gap_m（${f.gap_m}）は爆風（${blastM}）＋ 半長（${halfLenM}）より広い（隊長艇に真上から当たった 1 発は僚艇を巻き込まない）`);
  if (!(b.moored_gap_m > 0 && b.moored_gap_m < blastM)) bad('V-E7', `evac.moored_gap_m（${b.moored_gap_m}）は 0 より大きく爆風（${blastM}）より狭い`);
  if (!(f.trail_step_m > 0 && f.trail_step_m <= f.gap_m / 4)) bad('V-E7', `evac.follow.trail_step_m（${f.trail_step_m}）は 0 より大きく gap_m / 4（${f.gap_m / 4}）以下`);
  const total = b.group_size * b.groups.length;
  if (r.survivors_total !== total) bad('V-E9', `evac_raid.survivors_total（${r.survivors_total}）は group_size × groups の数（${total}）`);
  if (!isInt(r.survivor_quota, 1, total)) bad('V-E9', `evac_raid.survivor_quota は 1〜${total} の整数（${r.survivor_quota}）`);
  if (!isInt(r.historical_survivors, 0, total)) bad('V-E9', `evac_raid.historical_survivors は 0〜${total} の整数（${r.historical_survivors}）`);
  const a = b.ai;
  for (const [k, v] of [['evac.ai.full_p', a.full_p], ['evac.ai.dodge.success', a.dodge.success], ['evac_raid.cover_reveal_chance', r.cover_reveal_chance], ['hard.evac_cover_reveal_chance', coverChance]] as const) {
    if (!isProb(v)) bad('V-E12', `${k} は 0〜1（${v}）`);
  }
  if (!(a.pick_s > 0) || !(b.haul_s > 0)) bad('V-E12', `evac.ai.pick_s（${a.pick_s}）と evac.haul_s（${b.haul_s}）は正の秒`);
  if (!(a.cast_off_s[0] >= 0 && a.cast_off_s[0] <= a.cast_off_s[1])) bad('V-E12', `evac.ai.cast_off_s は 0 ≤ 小 ≤ 大（${a.cast_off_s.join(', ')}）`);
  if (!(a.found_react_s >= 0 && a.dodge.hold_s >= 0 && a.wall_m > 0 && a.look_m > 0)) bad('V-E12', 'evac.ai.found_react_s・dodge.hold_s は 0 以上、wall_m・look_m は正');
  if (!(b.hide_max_kt > 0) || !(b.launch_stick > 0 && b.launch_stick <= 1)) bad('V-E12', `evac.hide_max_kt は正、launch_stick は 0 より大きく 1 以下（${b.hide_max_kt}・${b.launch_stick}）`);
  if (!(b.slot_arrive_m > 0 && b.slot_arrive_m < b.slot_abeam_m)) bad('V-E12', `evac.slot_arrive_m（${b.slot_arrive_m}）は 0 より大きく slot_abeam_m（${b.slot_abeam_m}）より小さい`);
}

/** V-E6・V-E12・V-E14: 予告の間隔・最後の波の終わり・休みの余裕・方位の戻し（凍結の spawn_offsets_deg の先頭 n 個の平均を戻す）・もう一度来る回の見積もり */
function checkTiming(r: EvacRaidBlock, sorties: readonly AirStrikeParams[], durationS: number, bad: (v: string, msg: string) => never): void {
  const lenS = (p: AirStrikeParams): number => p.firstRunS + p.runS + (p.planes * p.bombsPerPlane - 1) * p.runGapS + p.fallFeelS + p.leaveS;
  const longest = sorties[sorties.length - 1]!;
  const need = r.announce_lead_s + lenS(longest) + EVAC_CHECK_WAVE_MARGIN_S;
  if (!(r.announce_lead_s > 0)) bad('V-E6', `evac_raid.announce_lead_s は正（${r.announce_lead_s}）`);
  r.waves.forEach((x, i) => {
    if (i === 0 && !(x.announce_s >= 0)) bad('V-E6', `evac_raid.waves[0].announce_s は 0 以上（${x.announce_s}）`);
    if (i > 0 && !(x.announce_s - r.waves[i - 1]!.announce_s >= need)) bad('V-E6', `evac_raid.waves[${i}] の予告の間隔（${x.announce_s - r.waves[i - 1]!.announce_s} 秒）は announce_lead_s ＋ ${longest.planes} 機の編隊の長さ ＋ ${EVAC_CHECK_WAVE_MARGIN_S}（${need.toFixed(2)} 秒）以上`);
  });
  const last = r.waves[r.waves.length - 1]!;
  const end = last.announce_s + r.announce_lead_s + lenS(sorties.find((p) => p.planes === last.planes)!);
  if (!(end < durationS)) bad('V-E6', `evac_raid.waves[${r.waves.length - 1}]: 最後の波の終わり（${end.toFixed(2)} 秒）は duration_s（${durationS}）より前（決着の時に港の空襲の爆弾が空中に無い）`);
  for (const p of sorties) {
    // V-E14（v0.6.11 S3b。core/evac-repass の evacPassS）: 凍結の core では最後の投下 A（始まりから firstRunS ＋ (機数 × 発 − 1) × runGapS ＋ runS）の後、爆弾は落下 fallFeelS で着き、
    // 機は離脱 runS ＋ 去る leaveS で済む＝実際の済み A ＋ max(fallFeelS, runS ＋ leaveS)。見積もり A ＋ fallFeelS ＋ leaveS ＋ 濃さ AIR_STRIKE_FADE_S がそれより短くないのは
    // fallFeelS ＋ AIR_STRIKE_FADE_S ≥ runS の時（短ければ 2 回目が次の波の始まりを越えて飛ぶ）
    if (!(p.fallFeelS + AIR_STRIKE_FADE_S >= p.runS)) bad('V-E14', `evac_raid.passes_max の 1 回の見積もり: enemies.json の空襲の機体の strike.release_altitude_m の落下（${p.fallFeelS.toFixed(3)} 秒）＋ 濃さ ${AIR_STRIKE_FADE_S} 秒は risk_events.json の ${EVAC_EVENT_ID}.params.sortie.run_radius_m ÷ strike.run_speed_kt の爆撃進路（${p.runS.toFixed(3)} 秒）以上（見積もりが実際の 1 回より短くならない）`);
    if (!(p.waveRestS >= p.runS + p.leaveS + 2 * FIXED_STEP_S)) bad('V-E6', `evac_raid: risk_events.json の unten_air_raid.params.sortie.wave_rest_s（${p.waveRestS}）は爆撃進路 ＋ leave_s ＋ 2 ステップ（${(p.runS + p.leaveS + 2 * FIXED_STEP_S).toFixed(3)}）以上（済みを見てから 2 波目が出ない）`);
    const fix = r.bearing_fix_deg[p.planes - 1];
    if (fix === undefined) return bad('V-E12', `evac_raid.bearing_fix_deg の長さ（${r.bearing_fix_deg.length}）は最大機数（${longest.planes}）以上`);
    let mean = 0;
    for (let i = 0; i < p.planes; i++) mean += p.spawnOffsetsDeg[i]! / p.planes;
    if (Math.abs(mean + fix) > EVAC_CHECK_BEARING_FIX_TOL_DEG) bad('V-E12', `evac_raid.bearing_fix_deg[${p.planes - 1}]（${fix}）は sortie.spawn_offsets_deg の先頭 ${p.planes} 個の平均（${mean}）を戻す値（±${EVAC_CHECK_BEARING_FIX_TOL_DEG}°）`);
  }
}

/** WorldSetup に展開する部分: 空襲下の退避の無い任務は {}（evac の鍵ごと出ない＝ほかの任務の setup の snapshot が変わらない） */
export function evacSetupPart(data: GameData, missionId: string, hard: boolean): { evac?: EvacSetup } {
  const p = getEvacParams(data, missionId, hard);
  return p ? { evac: p } : {};
}

/** Boot の検査: v0_1_prototype を持つ全任務（ハードも）を 1 回組む（壊れていれば Boot で止まる）。最初の evac の任務の値（ノーマル）を返す（無ければ null） */
export function validateEvacMissions(data: GameData): EvacSetup | null {
  let first: EvacSetup | null = null;
  for (const m of data.missionsSeed.missions as readonly Rec[]) {
    const id = m['id'];
    if (typeof id !== 'string' || !m['v0_1_prototype']) continue;
    const p = getEvacParams(data, id);
    if (p && hasHardVariant(data, id)) getEvacParams(data, id, true);
    if (p && !first) first = p;
  }
  return first;
}
