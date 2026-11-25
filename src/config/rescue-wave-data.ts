// 救助の任務（v0.8.5 IP2。us_07）の 2 つの block の検査と読み出し: 砲台が生存者の海を撃つ（rescue.shelling＝V-H）と S ボートの第二波（rescue.sboat_wave2＝V-W）。
// config/rescue-mission-data の getRescueParams が呼ぶ（rescue の鍵の 1 つずつ。例外は鍵を名指す日本語・spec-v0850 §4 の作法）。難易度で値を選ぶ（shelling の hard_interval_s・
// 第二波の線は第一波の隻数ぶん＝ノーマル 2・ハード 3）。規則は core/survivor-shelling・core/sboat-wave。Phaser 非依存。
import type { GameData, PrototypeMission } from './game-data';
import { segDistM } from '../core/ally-geometry';
import { isPtDataRecord } from '../core/pt-data';
import type { SurvivorShellRules } from '../core/survivor-shelling';
import type { SboatWaveRules } from '../core/sboat-wave';

/** V-H1・V-W1: 鍵（ちょうどこれ）。V-H1 の dispersion_factor の範囲 */
export const RESCUE_SHELLING_KEYS = ['interval_s', 'hard_interval_s', 'dispersion_factor', 'source'] as const;
export const RESCUE_WAVE_KEYS = ['delay_s', 'legs_m', 'jitter', 'source'] as const;
export const RESCUE_WAVE_JITTER_KEYS = ['x_m', 'y_m'] as const;
export const SHELLING_DISPERSION_RANGE = [0.1, 1] as const;

type Rec = Record<string, unknown>;
const isObj = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
type Bad = (v: string, msg: string) => never;

function closed(r: Rec, keys: readonly string[], name: string, v: string, bad: Bad): void {
  const ks = Object.keys(r);
  if (ks.length !== keys.length || !keys.every((k) => k in r)) bad(v, `${name} の鍵はちょうど ${keys.join('・')}（${ks.join('・') || 'なし'}）`);
}

/**
 * V-H: rescue.shelling（砲台の隊で 1 本の時計。間隔は難易度で選ぶ）。
 * V-H1 形（間隔は正・散布の倍率は 0.1〜1・source）。V-H2 砲台のある任務は object・無い任務は null（撃たない）・間隔は砲台の隊が自艇へ撃つ間隔（60 / (rof_per_min × 門数)）以上（自艇へより遅い）。
 * V-H3 どれかの群がどれかの砲台の射界の内（撃つ的がある）
 */
export function readRescueShelling(mission: PrototypeMission, raw: unknown, groups: readonly { x: number; y: number }[], batteries: readonly { x: number; y: number; gun: { effectiveM: number; roundsPerMinPerGun: number; count: number } }[], bad: Bad): SurvivorShellRules | null {
  if (raw === null && batteries.length === 0) return null;
  if (raw === null) return bad('V-H2', 'rescue.shelling は砲台（shore_battery）のある任務では object（null は砲台の無い任務だけ）');
  if (!isObj(raw)) return bad('V-H1', 'rescue.shelling は object か null');
  closed(raw, RESCUE_SHELLING_KEYS, 'rescue.shelling', 'V-H1', bad);
  const iv = raw['interval_s'];
  const hiv = raw['hard_interval_s'];
  const df = raw['dispersion_factor'];
  if (!(isNum(iv) && iv > 0 && isNum(hiv) && hiv > 0)) bad('V-H1', 'rescue.shelling の interval_s・hard_interval_s は正');
  const [lo, hi] = SHELLING_DISPERSION_RANGE;
  if (!(isNum(df) && df >= lo && df <= hi)) bad('V-H1', `rescue.shelling.dispersion_factor は ${lo}〜${hi}（${String(df)}）`);
  if (!isText(raw['source'])) bad('V-H1', 'rescue.shelling.source は空でない文字列');
  if (batteries.length === 0) bad('V-H2', 'rescue.shelling は砲台（shore_battery）のある任務だけ（無い任務は null）');
  const iS = mission.hard ? (hiv as number) : (iv as number);
  for (const b of batteries) {
    const own = 60 / (b.gun.roundsPerMinPerGun * b.gun.count);
    if (!((iv as number) >= own && (hiv as number) >= own)) bad('V-H2', `rescue.shelling の interval_s・hard_interval_s（${String(iv)}・${String(hiv)} 秒）は砲台（${b.x}, ${b.y}）が自艇へ撃つ間隔 ${own} 秒以上（自艇へより遅い）`);
  }
  if (!groups.some((g) => batteries.some((b) => Math.hypot(g.x - b.x, g.y - b.y) <= b.gun.effectiveM))) bad('V-H3', 'rescue.groups のどれかはどれかの砲台の射界の内（生存者の海へ撃つ的がある）');
  return { intervalS: iS, dispersionFactor: df as number };
}

/**
 * V-W: rescue.sboat_wave2（第一波と同じ隻数。線は第一波の隻数ぶんを先頭から使う＝ノーマル 2・ハード 3）。
 * V-W1 形（delay_s は正・legs_m は [x0, y0, x1, y1] の配列・jitter の x_m・y_m は 0 以上・source）。V-W2 S ボート（pt_boats）の任務は object・無い任務は null・線の本数 ≥ 第一波の隻数。
 * V-W3 線は海域の縁から edge_margin_m の内・長さは arrive_m の 2 倍より長い・start_along_m は線の長さの内（core/pt-data の第一波の検査と同じ規則）。
 * V-W4 フィッチの輪の縁から線（揺らぎ込み）まで cover_m より遠い（出て直ぐに退かない＝V-D2 と同じ形）
 */
export function readSboatWave2(data: GameData, mission: PrototypeMission, raw: unknown, fitch: { x: number; y: number; ringM: number; coverM: number }, bad: Bad): SboatWaveRules | null {
  if (raw === null && !mission.ptBoats) return null;
  if (raw === null) return bad('V-W2', 'rescue.sboat_wave2 は S ボート（pt_boats）の任務では object（null は S ボートの無い任務だけ）');
  if (!isObj(raw)) return bad('V-W1', 'rescue.sboat_wave2 は object か null');
  closed(raw, RESCUE_WAVE_KEYS, 'rescue.sboat_wave2', 'V-W1', bad);
  const delay = raw['delay_s'];
  if (!(isNum(delay) && delay > 0)) bad('V-W1', 'rescue.sboat_wave2.delay_s は正');
  const j = raw['jitter'];
  if (!isObj(j)) return bad('V-W1', 'rescue.sboat_wave2.jitter は object');
  closed(j, RESCUE_WAVE_JITTER_KEYS, 'rescue.sboat_wave2.jitter', 'V-W1', bad);
  const jx = j['x_m'];
  const jy = j['y_m'];
  if (!(isNum(jx) && jx >= 0 && isNum(jy) && jy >= 0)) bad('V-W1', 'rescue.sboat_wave2.jitter の x_m・y_m は 0 以上');
  if (!isText(raw['source'])) bad('V-W1', 'rescue.sboat_wave2.source は空でない文字列');
  const ls = raw['legs_m'];
  if (!Array.isArray(ls) || !ls.every((l) => Array.isArray(l) && l.length === 4 && l.every(isNum))) return bad('V-W1', 'rescue.sboat_wave2.legs_m は [x0, y0, x1, y1] の配列');
  const pt = mission.ptBoats;
  if (!pt) return bad('V-W2', 'rescue.sboat_wave2 は S ボート（pt_boats）の任務だけ');
  const n = pt.legs_m.length;
  if (ls.length < n) bad('V-W2', `rescue.sboat_wave2.legs_m は第一波の隻数（${n}）以上の本数（${ls.length}）`);
  const rec = (data.enemies.enemies as readonly unknown[]).find((e) => (e as Rec)['id'] === mission.enemyId);
  if (!isPtDataRecord(rec)) return bad('V-W2', `enemies.json の ${mission.enemyId} に米PT の値が無い`);
  const m = rec.attack.edge_margin_m;
  const arrive = rec.patrol.arrive_m;
  const legs = (ls as number[][]).slice(0, n);
  const sj = Math.hypot(jx as number, jy as number);
  legs.forEach((l, i) => {
    for (let k = 0; k < 4; k++) {
      const size = k % 2 === 0 ? mission.bounds.width : mission.bounds.height;
      if (!(l[k]! >= m && l[k]! <= size - m)) bad('V-W3', `rescue.sboat_wave2.legs_m[${i}] の点は海域の縁から edge_margin_m（${m} m）の内`);
    }
    const len = Math.hypot(l[2]! - l[0]!, l[3]! - l[1]!);
    if (!(len > 2 * arrive)) bad('V-W3', `rescue.sboat_wave2.legs_m[${i}] の長さは arrive_m の 2 倍より長い`);
    if (!(pt.start_along_m <= len)) bad('V-W3', `pt_boats.start_along_m は rescue.sboat_wave2.legs_m[${i}] の長さの内`);
    const dM = segDistM(fitch.x, fitch.y, l[0]!, l[1]!, l[2]!, l[3]!) - fitch.ringM - sj;
    if (!(dM > fitch.coverM)) bad('V-W4', `rescue.ships.fitch の輪の縁から rescue.sboat_wave2.legs_m[${i}]（揺らぎ ±${Math.round(sj)} m 込み）まで ${Math.round(dM)} m は cover_m（${fitch.coverM} m）より遠い（出て直ぐに退かない）`);
  });
  return { delayS: delay as number, legs: legs.map((l) => [...l]), jitterXM: jx as number, jitterYM: jy as number };
}
