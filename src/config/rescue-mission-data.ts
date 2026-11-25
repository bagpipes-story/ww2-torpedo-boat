// 生存者の救助（v0.8.5。us_07「D-Day・生存者救助」の type rescue。spec-v0850 §4.1・§4.4・§4.5）の任務の読み出し: 任務の v0_1_prototype.rescue があれば、
// 生存者の群・拾う／移す規則・フィッチ（渡す先の輪と S ボートを退かせる砲火の距離）・コリー（沈む駆逐艦）・昼の倍率から世界の値（RescueSetup）を組み、
// data だけで決まる起動時の検査 V-Q1〜V-Q8・V-D1〜V-D2・V-U1 をする（例外は鍵を名指す日本語）。block は生の proto から読む（PrototypeMission に鍵は足さない＝ほかの任務の setup の snapshot が変わらない）。
// S0 では世界は何も読まない（setup の鍵が出るだけ。拾う・移す規則は S1 の core/rescue、フィッチの砲火は core/sboat-cover、配線は S2）。V-U1 の「S ボートが出発で見つからない」は
// config/pt-mission-data の今の検査がこの昼の倍率（rescueMoonFactor）で回る（Boot がノーマル・ハードとも getPtParams を呼ぶ）。
import { getBoatRecord, getShoreBatteryParamsList, type GameData, type PrototypeMission } from './game-data';
import { getPrototypeMission, hasHardVariant } from './mission-data';
import { segDistM } from '../core/ally-geometry';
import { isPtDataRecord } from '../core/pt-data';
import type { SurvivorShellRules } from '../core/survivor-shelling';
import type { SboatWaveRules } from '../core/sboat-wave';
import { ktToMps } from '../core/units';
import { readRescueShelling, readSboatWave2 } from './rescue-wave-data';

/** V-Q1: rescue・ships・daylight の鍵（ちょうどこれ）と群の数の上限（固定長の状態の大きさ） */
export const RESCUE_KEYS = ['groups', 'group_jitter_m', 'capacity', 'pickup_m', 'pickup_max_kt', 'per_person_s', 'transfer_per_person_s', 'shell_kill_m', 'objective_delivered', 'ships', 'daylight', 'shelling', 'sboat_wave2', 'source'] as const;
export const RESCUE_FITCH_KEYS = ['x_m', 'y_m', 'ring_m', 'heading_deg', 'cover_m', 'cover_s', 'label_ja'] as const;
export const RESCUE_CORRY_KEYS = ['x_m', 'y_m', 'heading_deg', 'label_ja'] as const;
export const RESCUE_DAYLIGHT_KEYS = ['moon_factor', 'source'] as const;
export const RESCUE_GROUPS_MAX = 16;
/** V-Q8: rescue を置ける任務の type（scoring.json の objective_by_type の鍵）。V-U1: 昼の倍率の範囲 */
export const RESCUE_MISSION_TYPE = 'rescue';
export const RESCUE_DAYLIGHT_RANGE = [1, 3] as const;

/** 救助の世界の値（WorldSetup.rescue。S1 の core/rescue・S2 の systems/world-rescue が読む）。速さは kt と game m/s、距離の比べは 2 乗も持つ */
export interface RescueSetup {
  groups: { x: number; y: number; count: number }[];
  total: number;
  groupJitterM: number;
  capacity: number;
  pickupM: number;
  pickupMaxKt: number;
  pickupMaxMps: number;
  perPersonS: number;
  transferPerPersonS: number;
  shellKillM: number;
  shellKill2: number;
  objectiveDelivered: number;
  fitch: { x: number; y: number; ringM: number; ring2: number; headingDeg: number; coverM: number; cover2: number; coverS: number; labelJa: string };
  corry: { x: number; y: number; headingDeg: number; labelJa: string };
  /** 昼の倍率（月の係数の代わり。config/game-data の getVisibilityParams の 4 つ目の引数） */
  moonFactor: number;
  /** 砲台が生存者の海を撃つ（v0.8.5 IP2。V-H。間隔は難易度で選んだ値。砲台の無い任務は null）・S ボートの第二波（v0.8.5 IP2。V-W。線は第一波の隻数ぶん。S ボートの無い任務は null） */
  shelling: SurvivorShellRules | null;
  wave2: SboatWaveRules | null;
}

type Rec = Record<string, unknown>;
const isObj = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isPosInt = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1;
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

function protoOf(data: GameData, id: string): Rec | null {
  const m = (data.missionsSeed.missions as readonly Rec[]).find((x) => x['id'] === id);
  return isObj(m?.['v0_1_prototype']) ? (m['v0_1_prototype'] as Rec) : null;
}

/** 昼の倍率（rescue.daylight.moon_factor）。rescue の無い任務は undefined＝今の月の係数。検査は getRescueParams（Boot の validateRescueMissions） */
export function rescueMoonFactor(data: GameData, mission: Pick<PrototypeMission, 'id'>): number | undefined {
  const r = protoOf(data, mission.id)?.['rescue'];
  const d = isObj(r) ? r['daylight'] : undefined;
  const f = isObj(d) ? d['moon_factor'] : undefined;
  return isNum(f) ? f : undefined;
}

/** 円 (x, y, r) が矩形 (rx, ry, rw, rh) に掛かるか */
function circleHitsRect(x: number, y: number, r: number, rx: number, ry: number, rw: number, rh: number): boolean {
  const dx = x - Math.max(rx, Math.min(x, rx + rw));
  const dy = y - Math.max(ry, Math.min(y, ry + rh));
  return dx * dx + dy * dy < r * r || (x >= rx && x <= rx + rw && y >= ry && y <= ry + rh);
}

/** 任務の救助の値。v0_1_prototype.rescue の無い任務は null（type が rescue の任務に無ければ例外）。壊れていれば「<任務>.v0_1_prototype.rescue…（V-Qn ほか・spec-v0850 §4）」 */
export function getRescueParams(data: GameData, mission: PrototypeMission): RescueSetup | null {
  const proto = protoOf(data, mission.id);
  if (!proto) return null;
  const at = `${mission.id}.v0_1_prototype`;
  const bad = (v: string, msg: string): never => {
    throw new Error(`${at}.${msg}（${v}・spec-v0850 §4）`);
  };
  const raw = proto['rescue'];
  if (raw === undefined) {
    if (mission.type === RESCUE_MISSION_TYPE) bad('V-Q8', `rescue は type ${RESCUE_MISSION_TYPE} の任務に要る（生存者の群と渡す先）`);
    return null;
  }
  if (!isObj(raw)) return bad('V-Q1', 'rescue は object');
  const closed = (r: Rec, keys: readonly string[], name: string): void => {
    const ks = Object.keys(r);
    if (ks.length !== keys.length || !keys.every((k) => k in r)) bad('V-Q1', `${name} の鍵はちょうど ${keys.join('・')}（${ks.join('・') || 'なし'}）`);
  };
  closed(raw, RESCUE_KEYS, 'rescue');
  if (!isText(raw['source'])) bad('V-Q1', 'rescue.source は空でない文字列');
  // V-Q8 置き場: type rescue の任務だけ（1 任務だけは validateRescueMissions）
  if (mission.type !== RESCUE_MISSION_TYPE) bad('V-Q8', `rescue は type ${RESCUE_MISSION_TYPE} の任務だけ（${mission.type}）`);
  // V-Q1 形: 群は 1〜16・[x, y, 人数]（人数は 1 以上の整数）・合計 ≥ objective_delivered。ほかの数
  const objective = raw['objective_delivered'];
  if (!isPosInt(objective)) return bad('V-Q1', `rescue.objective_delivered は 1 以上の整数（${String(objective)}）`);
  const gs = raw['groups'];
  if (!Array.isArray(gs) || gs.length < 1 || gs.length > RESCUE_GROUPS_MAX) return bad('V-Q1', `rescue.groups は 1〜${RESCUE_GROUPS_MAX} 群の配列`);
  const groups: RescueSetup['groups'] = [];
  for (let i = 0; i < gs.length; i++) {
    const g = gs[i] as unknown;
    if (!Array.isArray(g) || g.length !== 3 || !isNum(g[0]) || !isNum(g[1]) || !isPosInt(g[2])) return bad('V-Q1', `rescue.groups[${i}] は [x, y, 人数]（人数は 1 以上の整数）`);
    groups.push({ x: g[0], y: g[1], count: g[2] });
  }
  const total = groups.reduce((s, g) => s + g.count, 0);
  if (!(total >= objective)) bad('V-Q1', `rescue.groups の人数の合計（${total}）は objective_delivered（${objective}）以上`);
  const jitter = raw['group_jitter_m'];
  if (!(isNum(jitter) && jitter >= 0)) bad('V-Q1', 'rescue.group_jitter_m は 0 以上');
  for (const k of ['pickup_m', 'pickup_max_kt', 'per_person_s', 'transfer_per_person_s'] as const) if (!(isNum(raw[k]) && (raw[k] as number) > 0)) bad('V-Q1', `rescue.${k} は正`);
  if (!(isNum(raw['shell_kill_m']) && raw['shell_kill_m'] >= 0)) bad('V-Q1', 'rescue.shell_kill_m は 0 以上');
  // V-Q3: 1 往復では達成しない
  const capacity = raw['capacity'];
  if (!(isPosInt(capacity) && capacity < objective)) bad('V-Q3', `rescue.capacity は 1 以上の整数で objective_delivered（${objective}）未満（1 往復では達成しない。${String(capacity)}）`);
  // 船: フィッチ（渡す先の輪と砲火）・コリー（沈む駆逐艦）
  const ships = raw['ships'];
  if (!isObj(ships)) return bad('V-Q1', 'rescue.ships は object');
  closed(ships, ['fitch', 'corry'], 'rescue.ships');
  const f = ships['fitch'];
  const c = ships['corry'];
  if (!isObj(f) || !isObj(c)) return bad('V-Q1', 'rescue.ships.fitch・corry は object');
  closed(f, RESCUE_FITCH_KEYS, 'rescue.ships.fitch');
  closed(c, RESCUE_CORRY_KEYS, 'rescue.ships.corry');
  for (const k of RESCUE_FITCH_KEYS) if (k !== 'label_ja' && !isNum(f[k])) bad('V-Q1', `rescue.ships.fitch.${k} は数`);
  for (const k of RESCUE_CORRY_KEYS) if (k !== 'label_ja' && !isNum(c[k])) bad('V-Q1', `rescue.ships.corry.${k} は数`);
  if (!isText(f['label_ja']) || !isText(c['label_ja'])) bad('V-Q1', 'rescue.ships の label_ja は空でない文字列');
  const fx = f['x_m'] as number, fy = f['y_m'] as number, ring = f['ring_m'] as number, coverM = f['cover_m'] as number, coverS = f['cover_s'] as number;
  const cx = c['x_m'] as number, cy = c['y_m'] as number;
  if (!(ring > 0 && coverS > 0)) bad('V-Q1', 'rescue.ships.fitch の ring_m・cover_s は正');
  // V-Q2: 群（ずれ込み）・フィッチの輪・コリーは海域の中で浅瀬の外
  const { width, height } = mission.bounds;
  const inside = (x: number, y: number, r: number): boolean => x - r >= 0 && x + r <= width && y - r >= 0 && y + r <= height && !mission.shallows.some((s) => circleHitsRect(x, y, r, s.x, s.y, s.w, s.h));
  groups.forEach((g, i) => { if (!inside(g.x, g.y, jitter as number)) bad('V-Q2', `rescue.groups[${i}]（${g.x}, ${g.y}・ずれ ±${String(jitter)}）は海域の中で浅瀬の外`); });
  if (!inside(fx, fy, ring)) bad('V-Q2', `rescue.ships.fitch の輪（${fx}, ${fy}・半径 ${ring}）は海域の中で浅瀬の外`);
  if (!inside(cx, cy, 0)) bad('V-Q2', `rescue.ships.corry（${cx}, ${cy}）は海域の中で浅瀬の外`);
  // V-Q4: フィッチの輪と帰投の輪が重ならない（移している間に輪に入って任務が終わらない）
  const rp = mission.returnPoint;
  if (!(Math.hypot(fx - rp.x, fy - rp.y) > ring + rp.radiusM)) bad('V-Q4', 'rescue.ships.fitch の輪は帰投の輪に重ならない');
  // V-Q5（V-U2 の射界の点）: フィッチの輪は全砲台の射界の外・コリーはどれかの砲台の射界の内（砲台の今夜の揺らぎ込み。砲台の無い任務は見ない）
  const batteries = getShoreBatteryParamsList(data, mission);
  const bj = mission.night ? mission.night.shoreBatteryJitterM : 0;
  for (const b of batteries) if (!(Math.hypot(fx - b.x, fy - b.y) - ring - bj > b.gun.effectiveM)) bad('V-Q5', `rescue.ships.fitch の輪は砲台（${b.x}, ${b.y}）の射界 ${b.gun.effectiveM} m の外`);
  if (batteries.length > 0 && !batteries.some((b) => Math.hypot(cx - b.x, cy - b.y) + bj <= b.gun.effectiveM)) bad('V-U2', 'rescue.ships.corry はどれかの砲台の射界（shore_battery.params.gun.effective_night_m）の内（砲撃の下の救助）');
  // V-Q6: 拾える速さは静音の上限以下（静音のボタンで拾える）
  const silentMax = getBoatRecord(data, mission.playerBoatId).speed_bands_kt.silent_max;
  if (!((raw['pickup_max_kt'] as number) <= silentMax)) bad('V-Q6', `rescue.pickup_max_kt（${String(raw['pickup_max_kt'])} kt）は自艇（${mission.playerBoatId}）の静音の上限 ${silentMax} kt 以下`);
  // V-Q7: 点
  if (typeof (data.scoring.objective_by_type as Rec)[RESCUE_MISSION_TYPE] !== 'number') bad('V-Q7', `scoring.json の objective_by_type に ${RESCUE_MISSION_TYPE} が無い`);
  const pts = (data.scoring as unknown as Rec)['rescue'];
  if (!(isObj(pts) && isNum(pts['points_per_survivor']) && pts['points_per_survivor'] >= 0)) bad('V-Q7', 'scoring.json の rescue.points_per_survivor（0 以上の数）が無い');
  // V-U1: 昼の倍率
  const d = raw['daylight'];
  if (!isObj(d)) return bad('V-U1', 'rescue.daylight は object');
  closed(d, RESCUE_DAYLIGHT_KEYS, 'rescue.daylight');
  const mf = d['moon_factor'];
  const [lo, hi] = RESCUE_DAYLIGHT_RANGE;
  if (!(isNum(mf) && mf >= lo && mf <= hi)) bad('V-U1', `rescue.daylight.moon_factor は ${lo}〜${hi}（${String(mf)}）`);
  if (!isText(d['source'])) bad('V-U1', 'rescue.daylight.source は空でない文字列');
  // V-D1・V-D2: S ボート（米PT の記録の形）の隊がいれば、フィッチの砲火の距離は S ボートの砲の有効射程より遠く、どの哨戒の線（今夜の揺らぎ込み）からも輪の縁から遠い
  if (mission.ptBoats) {
    const rec = (data.enemies.enemies as readonly unknown[]).find((e) => (e as Rec)['id'] === mission.enemyId);
    const eff = isPtDataRecord(rec) ? rec.guns[0]!.effective_night_m : NaN;
    if (!(coverM > eff)) bad('V-D1', `rescue.ships.fitch.cover_m（${coverM} m）は S ボート（${mission.enemyId}）の砲の有効射程 ${eff} m より遠い（フィッチの内で航過を固めない）`);
    const sj = mission.night ? Math.hypot(mission.night.enemyJitterXM, mission.night.enemyJitterYM) : 0;
    mission.ptBoats.legs_m.forEach((l, i) => {
      const dM = segDistM(fx, fy, l[0]!, l[1]!, l[2]!, l[3]!) - ring - sj;
      if (!(dM > coverM)) bad('V-D2', `rescue.ships.fitch の輪の縁から pt_boats の線 ${i}（今夜の揺らぎ ±${Math.round(sj)} m 込み）まで ${Math.round(dM)} m は cover_m（${coverM} m）より遠い（出発で退かない）`);
    });
  } else if (!(coverM > 0)) bad('V-Q1', 'rescue.ships.fitch.cover_m は正');
  // V-H・V-W（v0.8.5 IP2。config/rescue-wave-data）: 砲台が生存者の海を撃つ・S ボートの第二波（S ボートの無い任務は sboat_wave2 を null に）
  const shelling = readRescueShelling(mission, raw['shelling'], groups, batteries, bad);
  const wave2 = readSboatWave2(data, mission, raw['sboat_wave2'], { x: fx, y: fy, ringM: ring, coverM }, bad);
  const pk = raw['pickup_max_kt'] as number;
  const sk = raw['shell_kill_m'] as number;
  return {
    groups,
    total,
    groupJitterM: jitter as number,
    capacity: capacity as number,
    pickupM: raw['pickup_m'] as number,
    pickupMaxKt: pk,
    pickupMaxMps: ktToMps(pk),
    perPersonS: raw['per_person_s'] as number,
    transferPerPersonS: raw['transfer_per_person_s'] as number,
    shellKillM: sk,
    shellKill2: sk * sk,
    objectiveDelivered: objective,
    fitch: { x: fx, y: fy, ringM: ring, ring2: ring * ring, headingDeg: f['heading_deg'] as number, coverM, cover2: coverM * coverM, coverS, labelJa: f['label_ja'] as string },
    corry: { x: cx, y: cy, headingDeg: c['heading_deg'] as number, labelJa: c['label_ja'] as string },
    moonFactor: mf as number,
    shelling,
    wave2,
  };
}

/** WorldSetup に展開する部分: 救助の無い任務は {}（rescue の鍵ごと出ない＝ほかの任務の setup の snapshot が変わらない） */
export function rescueSetupPart(data: GameData, mission: PrototypeMission): { rescue?: RescueSetup } {
  const p = getRescueParams(data, mission);
  return p ? { rescue: p } : {};
}

/** Boot の検査: v0_1_prototype を持つ全任務（ハードも）を 1 回組む（壊れていれば Boot で止まる）。rescue は 1 任務だけ（V-Q8）。最初の救助の任務の値（ノーマル）を返す（無ければ null） */
export function validateRescueMissions(data: GameData): RescueSetup | null {
  let first: RescueSetup | null = null;
  const ids: string[] = [];
  for (const m of data.missionsSeed.missions as readonly Rec[]) {
    const id = m['id'];
    if (typeof id !== 'string' || !m['v0_1_prototype']) continue;
    for (const hard of hasHardVariant(data, id) ? [false, true] : [false]) {
      const p = getRescueParams(data, getPrototypeMission(data, id, hard));
      if (p && !hard) ids.push(id);
      if (p && !first) first = p;
    }
  }
  if (ids.length > 1) throw new Error(`missions_seed.json の v0_1_prototype.rescue は 1 任務だけ（${ids.join('・')}。V-Q8・spec-v0850 §4）`);
  return first;
}
