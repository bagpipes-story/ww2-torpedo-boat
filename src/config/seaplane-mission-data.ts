// 夜の水上機の任務ごとの値（v0.8.1 IP2。us_06「オルモック湾の決着」。ユーザーの U3）: 任務の v0_1_prototype.enemy_aircraft の block（v0.4.1 からの enemy_id と source）に、
// 1 夜に照明弾と爆弾で攻撃する回数 attacks_per_night（無ければ 1＝v0.4.1 の「1 任務 1 回」のまま＝us_02 の夜は 1 ビットも変わらない）と、その任務だけの段階の秒の上書き params
// （risk_events.json の enemy_aircraft.params の鍵の一部。無ければ上書きなし＝us_02 の数は変えない）を足す。起動時の検査 V-P1〜V-P3（例外は鍵を名指す日本語）。
// block は生の proto から読む（PrototypeMission に鍵は足さない）。world-setup が組み立てのたびに（seaplaneParamsFor・seaplaneNightSetupPart）、Boot が全任務（ハードも）を 1 回（validateSeaplaneMissions）呼ぶ。
// 世界の側は core/seaplane-night（凍結の core/seaplane の外の包み）と systems/enemy-seaplane。
import { isEnemyAircraftEventRecord, isSeaplaneDataRecord, seaplaneParamsFromData, type EnemyAircraftEventRecord, type SeaplaneParams } from '../core/seaplane-data';
import { getSeaplaneParams, type GameData, type PrototypeMission } from './game-data';
import { getPrototypeMission, hasHardVariant } from './mission-data';

/** V-P1: enemy_aircraft の block の鍵（閉じた集合。enemy_id と source は v0.4.1 から） */
export const SEAPLANE_BLOCK_KEYS = ['enemy_id', 'source', 'attacks_per_night', 'params'] as const;
/** V-P2: 1 夜の攻撃の回数の上限（検査の境。夜の長さ 200 秒に 1 回の攻撃は約 40 秒＋冷却＝4 回で一晩じゅう攻撃のまま） */
export const SEAPLANE_ATTACKS_MAX = 4;
/** V-P3: 任務だけで上書きできる段階の秒（risk_events の enemy_aircraft.params の鍵のうち時間だけ。距離 run_radius_m は機の幾何なので上書きしない） */
export const SEAPLANE_PARAM_KEYS = ['patrol_from_s', 'wake_trigger_s', 'lose_s', 'orbit_s', 'leave_s', 'patrol_cooldown_s'] as const;

/** 1 夜の攻撃の包みの値（WorldSetup.seaplaneNight。attacks_per_night のある任務だけ） */
export interface SeaplaneNightSetup {
  attacksPerNight: number;
}

type Rec = Record<string, unknown>;
const isObj = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

interface SeaplaneBlock {
  attacksPerNight: number | null;
  params: Partial<Record<(typeof SEAPLANE_PARAM_KEYS)[number], number>> | null;
}

/** 任務の enemy_aircraft の block の足した鍵（V-P1〜V-P3 の検査込み）。block の無い任務は null */
function readBlock(data: GameData, mission: PrototypeMission): SeaplaneBlock | null {
  const m = (data.missionsSeed.missions as readonly Rec[]).find((x) => x['id'] === mission.id);
  const proto = isObj(m?.['v0_1_prototype']) ? (m['v0_1_prototype'] as Rec) : null;
  const raw = proto?.['enemy_aircraft'];
  if (!proto || raw === undefined) return null;
  const at = `${mission.id}.v0_1_prototype.enemy_aircraft`;
  const bad = (v: string, msg: string): never => {
    throw new Error(`${at}${msg}（${v}・docs/02 §6.8）`);
  };
  if (!isObj(raw)) return bad('V-P1', ' は object');
  const extra = Object.keys(raw).filter((k) => !(SEAPLANE_BLOCK_KEYS as readonly string[]).includes(k));
  if (extra.length > 0) bad('V-P1', `: 知らない鍵 ${extra.join('・')}（鍵は ${SEAPLANE_BLOCK_KEYS.join('・')}）`);
  const n = raw['attacks_per_night'];
  if (n !== undefined && !(typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= SEAPLANE_ATTACKS_MAX)) bad('V-P2', `.attacks_per_night は 1〜${SEAPLANE_ATTACKS_MAX} の整数（${String(n)}）`);
  const q = raw['params'];
  let params: SeaplaneBlock['params'] = null;
  if (q !== undefined) {
    if (!isObj(q) || Object.keys(q).length === 0) return bad('V-P3', '.params は空でない object');
    params = {};
    for (const [k, v] of Object.entries(q)) {
      if (!(SEAPLANE_PARAM_KEYS as readonly string[]).includes(k)) bad('V-P3', `.params に上書きできない鍵 ${k}（鍵は ${SEAPLANE_PARAM_KEYS.join('・')}）`);
      if (!(typeof v === 'number' && Number.isFinite(v) && v >= 0)) bad('V-P3', `.params.${k} は 0 以上の数（${String(v)}）`);
      params[k as (typeof SEAPLANE_PARAM_KEYS)[number]] = v as number;
    }
  }
  return { attacksPerNight: n === undefined ? null : (n as number), params };
}

/** 任務の水上機の値: getSeaplaneParams（機体と risk_events の params）に、任務の params の上書きがあればそれを重ねて組み直す（同じ検査）。水上機の無い任務は null */
export function seaplaneParamsFor(data: GameData, mission: PrototypeMission, timeScale: number, boat: { silentMaxKt: number; halfLengthM: number; halfBeamM: number }): SeaplaneParams | null {
  const base = getSeaplaneParams(data, mission, timeScale, boat);
  const b = base ? readBlock(data, mission) : null;
  if (!base || !b || !b.params) return base;
  const plane = data.enemies.enemies.find((e) => e.id === mission.enemyAircraft!.enemyId);
  const ev = data.riskEvents.events.find((e) => e.id === 'enemy_aircraft');
  if (!isSeaplaneDataRecord(plane) || !isEnemyAircraftEventRecord(ev)) return base; // getSeaplaneParams が既に例外を投げている
  const merged: EnemyAircraftEventRecord = { params: { ...ev.params, ...b.params } };
  return seaplaneParamsFromData(plane, merged, timeScale, boat);
}

/** WorldSetup に展開する部分: attacks_per_night の無い任務・水上機の無い夜（?debug&noplane）は {}（鍵ごと出ない＝ほかの任務の setup の snapshot が変わらない） */
export function seaplaneNightSetupPart(data: GameData, mission: PrototypeMission, seaplane: SeaplaneParams | null): { seaplaneNight?: SeaplaneNightSetup } {
  const b = seaplane ? readBlock(data, mission) : null;
  return b && b.attacksPerNight !== null ? { seaplaneNight: { attacksPerNight: b.attacksPerNight } } : {};
}

/** Boot の検査: v0_1_prototype を持つ全任務（ハードも）の enemy_aircraft の block を 1 回読む（壊れていれば Boot で止まる）。attacks_per_night のある任務の id を返す */
export function validateSeaplaneMissions(data: GameData): string[] {
  const ids: string[] = [];
  for (const m of data.missionsSeed.missions as readonly Rec[]) {
    const id = m['id'];
    if (typeof id !== 'string' || !m['v0_1_prototype']) continue;
    for (const hard of hasHardVariant(data, id) ? [false, true] : [false]) {
      const b = readBlock(data, getPrototypeMission(data, id, hard));
      if (b && b.attacksPerNight !== null && !ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}
