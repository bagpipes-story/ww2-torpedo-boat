// 止まった艦（v0.8.1。us_06「オルモック湾の決着」のパロンポン沖の卯月と空知丸。spec-v0810 §3.2・§4.1・§4.4・§4.5）の任務の読み出し: 任務の v0_1_prototype.anchored があれば、
// 隊の艦ごとの気づいてから動き出すまでの秒（駆逐艦 → 輸送船 → ハードの駆潜艇の並び。動かない輸送船は null）と警報の秒から世界の値（AnchorSetup）を組み、起動時の検査 V-A1〜V-A6 をする
// （例外は鍵を名指す日本語）。ハードの駆潜艇（hard.extra_pickets・picket_enemy_id）の出発点もここで読む（world-setup が隊の最後に今夜の揺らぎを 1 件ずつ当てる）。block は生の proto から読む
// （PrototypeMission に鍵は足さない＝transit-mission-data と同じ作法）。S0 では世界は何も読まない（setup の鍵が出るだけ。規則は S1 の core/anchored-ship、配線は S2 の systems/destroyer-anchor）。
import { getEnemyRecord, getVisibilityParams, type GameData, type PrototypeMission } from './game-data';
import { getPrototypeMission, hasHardVariant } from './mission-data';
import { readStart, type StartPoint } from './mission-hard-data';
import { getDawnAir } from './dawn-data';
import { enemyDetectRangeM, speedFactorForBand } from '../core/visibility';

/** V-A1: anchored の鍵（閉じた集合。picket_underway_s はハードの駆潜艇のある任務だけ要る） */
export const ANCHOR_KEYS = ['destroyer_underway_s', 'transport_underway', 'picket_underway_s', 'alarm_s', 'source'] as const;
export const ANCHOR_MAX_S = 30; // V-A1: 秒の上限（0 ＜ 秒 ≤ これ）
/** V-A2: 止まった艦と同居しない v0_1_prototype の鍵（列の通過・大発・米PT・揚陸・味方の駆逐艦・航空機だけの任務・僚艇・敵艦隊なしで終わる任務） */
export const ANCHOR_EXCLUSIVE_KEYS = ['transit', 'barges', 'pt_boats', 'landing', 'ally_destroyer', 'evac', 'patrol_air', 'escort', 'fleet_gone_clears'] as const;
export const ANCHOR_ONLY_HARD_KEYS = ['extra_pickets', 'picket_enemy_id'] as const; // V-A5: 止まった艦の任務だけが hard に持つ鍵（無い任務に置けば例外）
export const ANCHOR_PICKETS_MAX = 4; // V-A5: ハードの駆潜艇の数の上限
export const ANCHOR_CHECK_SHORE_CLEAR_M = 50; // V-A3: 艦の船体（記録の長さ × world.ship_hit_scale の半分）は岸の線からこの m 以上沖（今夜の揺らぎの端で）

/** 止まった艦の世界の値（WorldSetup.anchors。S2 の systems/destroyer-anchor が読む） */
export interface AnchorSetup {
  /** 隊の艦ごと（DestroyerGroup の並び＝駆逐艦 → 輸送船 → 駆潜艇）の、気づいてから動き出すまでの体感の秒（夜明けは遅れなし）。動かない艦（transport_underway false の輸送船）は null */
  underwayS: (number | null)[];
  alarmS: number; // 警報: 隊の別の艦が気づくか沈み始めてから、まだ気づいていない艦が気づくまでの秒
}

/** 任務の止まった艦の値（検査済み）。pickets はハードの組み立てで hard.extra_pickets があるときだけ（ほかは null） */
export interface AnchorParams {
  destroyerUnderwayS: number;
  transportUnderway: false; // 輸送船は動かない（V-A1 で false だけ。動く輸送船は候補）
  picketUnderwayS: number | null;
  alarmS: number;
  pickets: { enemyId: string; starts: StartPoint[] } | null; // ハードの駆潜艇（hard.extra_pickets。隊の最後に並ぶ）。出発点は今夜の揺らぎの前
}

type Rec = Record<string, unknown>;
const isObj = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isSec = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= ANCHOR_MAX_S;

/** 任務の岸の線の y（shores＝北と南の縁、coast＝南の縁。どちらも無ければ []）。切れ目は見ない（線の上はどこも岸として控えめに見る）。V-A3 の船体と岸の間に使う */
function shoreYsOf(proto: Rec, mission: PrototypeMission): number[] {
  return proto['shores'] !== undefined ? [0, mission.bounds.height] : mission.coast ? [mission.bounds.height] : [];
}

/** 点 (px, py) から矩形 [x ± jx]×[y ± jy]（今夜の揺らぎの端のどこか）の一番近い点までの距離の 2 乗 */
function rectDist2(px: number, py: number, x: number, y: number, jx: number, jy: number): number {
  const dx = px < x - jx ? x - jx - px : px > x + jx ? px - x - jx : 0;
  const dy = py < y - jy ? y - jy - py : py > y + jy ? py - y - jy : 0;
  return dx * dx + dy * dy;
}

/**
 * 任務の止まった艦の値。v0_1_prototype.anchored の無い任務は null（ハードの駆潜艇の鍵だけがあれば例外）。壊れていれば「<任務>.v0_1_prototype.…（V-An・spec-v0810 §4.4）」。
 * 位置の検査（V-A3・V-A4）は今夜の揺らぎの端（x ± enemy_jitter.x_m・y ± y_m。反転のある夜は東西の鏡も）で見る
 */
export function getAnchorParams(data: GameData, mission: PrototypeMission): AnchorParams | null {
  const m = (data.missionsSeed.missions as readonly Rec[]).find((x) => x['id'] === mission.id);
  const proto = isObj(m?.['v0_1_prototype']) ? (m['v0_1_prototype'] as Rec) : null;
  if (!proto) return null;
  const at = `${mission.id}.v0_1_prototype`;
  const bad = (v: string, msg: string): never => { throw new Error(`${at}.${msg}（${v}・spec-v0810 §4.4）`); };
  const hardRaw = isObj(proto['hard']) ? proto['hard'] : null;
  const raw = proto['anchored'];
  if (raw === undefined) {
    for (const k of ANCHOR_ONLY_HARD_KEYS) if (hardRaw?.[k] !== undefined) bad('V-A5', `hard.${k} は止まった艦（anchored）の任務だけ`);
    return null;
  }
  // V-A1 形: 鍵の閉じた集合・秒・動かない輸送船・出典
  if (!isObj(raw)) return bad('V-A1', 'anchored は object');
  const unknown = Object.keys(raw).filter((k) => !(ANCHOR_KEYS as readonly string[]).includes(k));
  if (unknown.length > 0) bad('V-A1', `anchored の鍵は ${ANCHOR_KEYS.join('・')} だけ（知らない鍵 ${unknown.join('・')}）`);
  for (const k of ['destroyer_underway_s', 'alarm_s'] as const) if (!isSec(raw[k])) bad('V-A1', `anchored.${k} は 0 ＜ 秒 ≤ ${ANCHOR_MAX_S}（${String(raw[k])}）`);
  const pus = raw['picket_underway_s'];
  if (pus !== undefined && !isSec(pus)) bad('V-A1', `anchored.picket_underway_s は 0 ＜ 秒 ≤ ${ANCHOR_MAX_S}（${String(pus)}）`);
  if (raw['transport_underway'] !== false) bad('V-A1', `anchored.transport_underway は false だけ（輸送船は一晩じゅう止まって揚陸する。動く輸送船は候補。${String(raw['transport_underway'])}）`);
  if (!(typeof raw['source'] === 'string' && raw['source'].trim() !== '')) bad('V-A1', 'anchored.source は空でない文字列');
  // V-A2 置き場: 駆逐艦の任務（enemy_start）だけ・同居しない鍵
  if (!mission.enemyStart) bad('V-A2', 'anchored は駆逐艦の任務（enemy_start）だけ');
  for (const k of ANCHOR_EXCLUSIVE_KEYS) if (proto[k] !== undefined) bad('V-A2', `${k} と anchored は同居しない`);
  // V-A5 ハードの駆潜艇: 1〜4 隻・輸送船のある任務だけ（隊の並び: 駆逐艦 → 輸送船 → 駆潜艇）・AI と砲の記録・動き出す秒
  const es = hardRaw?.['extra_pickets'];
  const pid = hardRaw?.['picket_enemy_id'];
  if ((es === undefined) !== (pid === undefined)) bad('V-A5', 'hard.extra_pickets と hard.picket_enemy_id は両方あるか両方ないか');
  let pickets: AnchorParams['pickets'] = null;
  if (es !== undefined) {
    if (!Array.isArray(es) || es.length < 1 || es.length > ANCHOR_PICKETS_MAX) return bad('V-A5', `hard.extra_pickets は 1〜${ANCHOR_PICKETS_MAX} 隻の配列`);
    if (proto['transport'] === undefined) bad('V-A5', 'hard.extra_pickets は輸送船（transport）のある任務だけ（隊の並びは駆逐艦 → 輸送船 → 駆潜艇）');
    if (typeof pid !== 'string' || pid === '') return bad('V-A5', 'hard.picket_enemy_id は enemies.json の id');
    try { getEnemyRecord(data, pid); } catch (e) { bad('V-A5', `hard.picket_enemy_id（${pid}）は AI と砲を持つ記録: ${(e as Error).message}`); }
    if (pus === undefined) bad('V-A5', 'anchored.picket_underway_s はハードの駆潜艇（hard.extra_pickets）のある任務に要る');
    const starts = es.map((s, i) => readStart(s, `${at}.hard.extra_pickets[${i}]`));
    if (mission.hard) pickets = { enemyId: pid, starts };
  }
  // 位置の検査（隊の艦の記録の id と出発点。ハードの組み立てなら駆潜艇も）
  const ships: { id: string; s: StartPoint }[] = mission.enemyStarts.map((s) => ({ id: mission.enemyId, s }));
  if (mission.transport) ships.push({ id: mission.transport.enemyId, s: mission.transport.start });
  if (pickets) for (const s of pickets.starts) ships.push({ id: pickets.enemyId, s });
  const { width, height } = mission.bounds;
  const n = mission.night;
  const [jx, jy, mirror] = n ? [n.enemyJitterXM, n.enemyJitterYM, n.mirrorChance > 0] : [0, 0, false];
  const world = data.hitRateModel.world;
  const shoreYs = shoreYsOf(proto, mission);
  // V-A4 の出発点の余白: 全速で見つかる距離（ノーマル・史実モードなし。隊は駆逐艦の記録の 1 つの基準距離を使う＝world-setup の baseDetectM）
  const vis = getVisibilityParams(data, mission.moon, false);
  const clearM = enemyDetectRangeM(getEnemyRecord(data, mission.enemyId).detection.base_detect_m, speedFactorForBand('full', vis.speedFactor), vis, false);
  const { playerStart: p, returnPoint: rp } = mission;
  for (let i = 0; i < ships.length; i++) {
    const { id, s } = ships[i]!;
    const r = getEnemyRecord(data, id);
    const margin = (r.length_m * world.sprite_scale) / 2;
    const hull = (r.length_m * world.ship_hit_scale) / 2 + ANCHOR_CHECK_SHORE_CLEAR_M;
    for (const x0 of mirror ? [s.x, width - s.x] : [s.x]) {
      // V-A3 海域の内（縁の余白＝表示上の船体半分より内）・船体は岸の線から 50 m 以上沖（揺らぎの四隅）
      for (const [x, y] of [[x0 - jx, s.y - jy], [x0 + jx, s.y - jy], [x0 - jx, s.y + jy], [x0 + jx, s.y + jy]] as const) {
        if (!(x >= margin && x <= width - margin && y >= margin && y <= height - margin)) bad('V-A3', `隊の ${i + 1} 隻目（${id}）の位置（${x}, ${y}。今夜の揺らぎの端）は海域の縁から ${margin} m（表示上の船体半分）以上内`);
        if (!shoreYs.every((ly) => Math.abs(ly - y) >= hull)) bad('V-A3', `隊の ${i + 1} 隻目（${id}）の船体（中心 ${x}, ${y}。今夜の揺らぎの端）は岸の線から ${ANCHOR_CHECK_SHORE_CLEAR_M} m 以上沖（中心から岸の線まで ${hull} m 以上）`);
      }
      // V-A4 出発点は全速で見つかる距離の外・どの艦も帰投の輪の外
      const d2 = rectDist2(p.x, p.y, x0, s.y, jx, jy);
      if (!(d2 > clearM * clearM)) bad('V-A4', `player_start は隊の ${i + 1} 隻目（${id}。今夜の揺らぎの端）から全速で見つかる距離（${clearM} m。ノーマル・史実モードなし）より遠い（${Math.sqrt(d2).toFixed(1)} m）`);
      if (!(rectDist2(rp.x, rp.y, x0, s.y, jx, jy) > rp.radiusM * rp.radiusM)) bad('V-A4', `隊の ${i + 1} 隻目（${id}。今夜の揺らぎの端）は帰投の輪の外`);
    }
  }
  // V-A6 夜明け: 止まった艦は夜明けに遅れなしで動き出して退く（config/dawn-data の検査をそのまま通し、退く先の縁がある）
  const air = getDawnAir(data, mission.id);
  if (air.shipsAtDawn !== 'retire' || air.retireEdge === null) bad('V-A6', `anchored の任務の dawn_air.enemy_ships_at_dawn は retire で dawn_withdraw がある（夜明けに止まった艦は動き出して退く。${air.shipsAtDawn}）`);
  return { destroyerUnderwayS: raw['destroyer_underway_s'] as number, transportUnderway: false, picketUnderwayS: pus === undefined ? null : (pus as number), alarmS: raw['alarm_s'] as number, pickets };
}

/** WorldSetup に展開する部分: 止まった艦の無い任務は {}（anchors の鍵ごと出ない＝ほかの任務の setup の snapshot が変わらない）。destroyers は駆逐艦の隻数（ハード込み）、transport は輸送船が隊にいるか（?debug&notransport で無い） */
export function anchorSetupPart(p: AnchorParams | null, destroyers: number, transport: boolean): { anchors?: AnchorSetup } {
  if (!p) return {};
  const underwayS: (number | null)[] = [];
  for (let i = 0; i < destroyers; i++) underwayS.push(p.destroyerUnderwayS);
  if (transport) underwayS.push(null); // 輸送船は一晩じゅう動かない（transport_underway false）
  if (p.pickets) for (let i = 0; i < p.pickets.starts.length; i++) underwayS.push(p.picketUnderwayS);
  return { anchors: { underwayS, alarmS: p.alarmS } };
}

/** Boot の検査: v0_1_prototype を持つ全任務（ハードも）を 1 回組む（壊れていれば Boot で止まる）。最初の止まった艦の任務の値（ノーマル）を返す（無ければ null） */
export function validateAnchorMissions(data: GameData): AnchorParams | null {
  let first: AnchorParams | null = null;
  for (const m of data.missionsSeed.missions as readonly Rec[]) {
    const id = m['id'];
    if (typeof id !== 'string' || !m['v0_1_prototype']) continue;
    for (const hard of hasHardVariant(data, id) ? [false, true] : [false]) {
      const p = getAnchorParams(data, getPrototypeMission(data, id, hard));
      if (p && !first) first = p;
    }
  }
  return first;
}
