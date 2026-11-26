// 任務ごとの沿岸砲の値（v0.8.5 S0。us_07「D-Day・生存者救助」の 210 mm の砲台。spec-v0850 §4.3・V-U2）の読み出し: 任務の v0_1_prototype.shore_battery.params があれば、
// その形（鍵の集合）が risk_events.json の shore_battery.params と同じかを検査して返す（config/game-data の getShoreBatteryParamsList が risk_events の 75 mm の代わりに使う）。
// 無い任務（us_03）は null＝今までどおり risk_events の値。規則（射界・気づき・煙幕・seed+8）は core/shore-battery のまま。射界がコリーを含みフィッチの輪を含まない検査は
// config/rescue-mission-data（V-Q5。救助の船の位置はそちら）。block は生の proto から読む（PrototypeMission に鍵は足さない＝ほかの任務の setup の snapshot が変わらない）。
import type { GameData, PrototypeMission } from './game-data';
import { getPrototypeMission, hasHardVariant } from './mission-data';
import { isShoreBatteryDataRecord, type ShoreBatteryDataRecord } from '../core/shore-battery';

type Rec = Record<string, unknown>;
const isObj = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

function sameKeys(a: Rec, b: Rec): boolean {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i]);
}

/** 任務の沿岸砲の値（shore_battery.params）。無い任務は null。壊れていれば「<任務>.v0_1_prototype.shore_battery.params…（V-U2・spec-v0850 §4.3）」 */
export function missionShoreBatteryRecord(data: GameData, mission: Pick<PrototypeMission, 'id'>): ShoreBatteryDataRecord | null {
  const m = (data.missionsSeed.missions as readonly Rec[]).find((x) => x['id'] === mission.id);
  const proto = isObj(m?.['v0_1_prototype']) ? (m['v0_1_prototype'] as Rec) : null;
  const sb = proto?.['shore_battery'];
  const raw = isObj(sb) ? sb['params'] : undefined;
  if (raw === undefined) return null;
  const at = `${mission.id}.v0_1_prototype.shore_battery.params`;
  const bad = (msg: string): never => {
    throw new Error(`${at}${msg}（V-U2・spec-v0850 §4.3）`);
  };
  const ref = (data.riskEvents.events as readonly Rec[]).find((e) => e['id'] === 'shore_battery')?.['params'];
  if (!isObj(ref) || !isObj(ref['gun'])) return bad(': risk_events.json の shore_battery.params（比べる形）が無い');
  if (!isObj(raw)) return bad(' は object');
  if (!sameKeys(raw, ref)) bad(`: 鍵は risk_events.json の shore_battery.params と同じ ${Object.keys(ref).join('・')}（${Object.keys(raw).join('・') || 'なし'}）`);
  const gun = raw['gun'];
  if (!isObj(gun) || !sameKeys(gun, ref['gun'] as Rec)) bad(`.gun: 鍵は risk_events.json の shore_battery.params.gun と同じ ${Object.keys(ref['gun'] as Rec).join('・')}`);
  if (!isShoreBatteryDataRecord(raw)) return bad(': gun の数（count / effective_night_m / rof_per_min / damage / shell_speed_mps / dispersion_m / splash_radius_m / fire_chance / engine_damage_chance）・base_detect_m・inland_m は数、gun.id は文字列');
  if (!(typeof raw['source'] === 'string' && raw['source'].trim() !== '')) bad('.source は空でない文字列');
  if (!(raw.base_detect_m > 0 && raw.inland_m >= 0)) bad(': base_detect_m は正、inland_m は 0 以上');
  const g = raw.gun;
  if (!(Number.isInteger(g.count) && g.count >= 1 && g.effective_night_m > 0 && g.rof_per_min > 0 && g.damage > 0 && g.shell_speed_mps > 0 && g.dispersion_m >= 0 && g.splash_radius_m >= 0)) bad('.gun: count は 1 以上の整数、effective_night_m・rof_per_min・damage・shell_speed_mps は正、dispersion_m・splash_radius_m は 0 以上');
  for (const k of ['fire_chance', 'engine_damage_chance'] as const) if (!(g[k] >= 0 && g[k] <= 1)) bad(`.gun.${k} は 0〜1`);
  return raw;
}

/** Boot の検査: v0_1_prototype を持つ全任務（ハードも）の任務ごとの沿岸砲の値を 1 回読む（壊れていれば Boot で止まる）。最初の任務の値を返す（無ければ null） */
export function validateShoreGunsMissions(data: GameData): ShoreBatteryDataRecord | null {
  let first: ShoreBatteryDataRecord | null = null;
  for (const m of data.missionsSeed.missions as readonly Rec[]) {
    const id = m['id'];
    if (typeof id !== 'string' || !m['v0_1_prototype']) continue;
    for (const hard of hasHardVariant(data, id) ? [false, true] : [false]) {
      const r = missionShoreBatteryRecord(data, getPrototypeMission(data, id, hard));
      if (r && !first) first = r;
    }
  }
  return first;
}
