// レーダー（v0.8.0。米PT キャンペーン②。spec-v0800 §3）の任務の読み出し: 任務の v0_1_prototype.radar があれば、hit_rate_model.json の radar（型の値）・
// 自艇（boats.json の radar）・月の視程・海域から世界の値（RadarSetup＝core/radar-data の RadarParams）を組み、起動時の検査 V-R1〜V-R5 をする（例外は鍵を名指す日本語）。
// 型の値の形と V-R4 は core/radar-data。PrototypeMission に鍵は足さない（block は生の proto から読む。evac-mission-data と同じ作法）。
// world-setup が組み立てのたびに（radarSetupPart）、Boot が radar の data と全任務（ハードも）を 1 回（validateRadarMissions）呼ぶ。
// v0.9 のストアは任務の block の無い任務に { model, fit: own } を足す形（spec §2.3。V-R2 の日付の検査はその外から）。
import { getVisibilityParams, type GameData, type PrototypeMission } from './game-data';
import { getPrototypeMission, hasHardVariant } from './mission-data';
import { radarParamsFromData, readRadarBlock, readRadarData, type RadarDataRecord, type RadarParams } from '../core/radar-data';
import { playerVisRangeM } from '../core/visibility';

export type { RadarParams } from '../core/radar-data';
/** レーダーの世界の値（WorldSetup.radar） */
export type RadarSetup = RadarParams;

/** V-R5: レーダーを置けない任務の鍵（艦艇のいない航空機だけの任務＝jp_02 の夜の哨戒機・jp_03 の空襲下の退避） */
export const RADAR_EXCLUDED_KEYS = ['patrol_air', 'evac'] as const;
/** V-R2: 年月（boats.json の radar.available_from）と日付（missions_seed の date）の書式 */
const YEAR_MONTH_RE = /^\d{4}-\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 組み立ての上書き（systems/world-setup の SetupOptions の 1 鍵）: radarOff はその任務のレーダーを切る（?debug&noradar。D-R12。配線は S2 の config/debug-setup） */
export interface RadarSetupOptions {
  radarOff?: boolean;
}

type Rec = Record<string, unknown>;

/** hit_rate_model.json の radar（形と型ごとの V-R4）。壊れていれば「hit_rate_model.json の radar…: …」 */
export function getRadarData(data: GameData): RadarDataRecord {
  return readRadarData((data.hitRateModel as unknown as Rec)['radar'], 'hit_rate_model.json の radar');
}

/** 任務のレーダーの値。v0_1_prototype.radar の無い任務は null。壊れていれば「<任務>.v0_1_prototype.radar…: …（V-Rn）」 */
export function getRadarParams(data: GameData, mission: PrototypeMission): RadarSetup | null {
  const m = (data.missionsSeed.missions as readonly Rec[]).find((x) => x['id'] === mission.id);
  const proto = m?.['v0_1_prototype'] as Rec | undefined;
  const raw = proto?.['radar'];
  if (!m || !proto || raw === undefined) return null;
  const at = `${mission.id}.v0_1_prototype.radar`;
  const bad = (v: string, msg: string): never => {
    throw new Error(`${at}: ${msg}（${v}・spec-v0800 §3.3）`);
  };
  const models = getRadarData(data);
  const b = readRadarBlock(raw, at);
  // V-R5 置き場: 艦艇のいる任務だけ
  for (const k of RADAR_EXCLUDED_KEYS) if (proto[k] !== undefined) bad('V-R5', `v0_1_prototype.${k} と同居しない（艦艇のいない航空機だけの任務には置けない）`);
  // V-R1 型
  const model = Object.prototype.hasOwnProperty.call(models.models, b.model) ? models.models[b.model] : undefined;
  if (!model) return bad('V-R1', `model（${b.model}）が hit_rate_model.json の radar.models（${Object.keys(models.models).join('・')}）に無い`);
  // V-R2 艇: boats.json の自艇の radar（射程が正・型の名・史実の広がりの年月が任務の日付以前）
  const boat = (data.boats.boats as readonly Rec[]).find((x) => x['id'] === mission.playerBoatId);
  const r = boat?.['radar'] as Rec | undefined;
  const range = r?.['range_m'];
  if (!(typeof range === 'number' && range > 0)) bad('V-R2', `boats.json の ${mission.playerBoatId}.radar.range_m は正（${String(range)}。レーダーを積まない艇）`);
  if (!(typeof r?.['type'] === 'string' && r['type'] !== '')) bad('V-R2', `boats.json の ${mission.playerBoatId}.radar.type（型の名）が無い`);
  const from = r?.['available_from'];
  const date = m['date'];
  if (typeof from !== 'string' || !YEAR_MONTH_RE.test(from)) bad('V-R2', `boats.json の ${mission.playerBoatId}.radar.available_from は YYYY-MM（${String(from)}）`);
  if (typeof date !== 'string' || !DATE_RE.test(date)) bad('V-R2', `${mission.id}.date は YYYY-MM-DD（${String(date)}）`);
  if ((from as string) > (date as string).slice(0, 7)) bad('V-R2', `boats.json の ${mission.playerBoatId}.radar.available_from（${String(from)}）は任務の date（${String(date)}）以前（史実の広がり）`);
  // V-R3 射程: 月の自艇の視程より遠く（目とは別の感覚）・海域の対角以下
  const vis = playerVisRangeM(getVisibilityParams(data, mission.moon, false));
  const diag = Math.hypot(mission.bounds.width, mission.bounds.height);
  if (!(model.ship_range_m > vis)) bad('V-R3', `radar.models.${b.model}.ship_range_m（${model.ship_range_m}）は任務の月（${mission.moon}）の自艇の視程（${vis} m）より遠い`);
  if (!(model.ship_range_m <= diag)) bad('V-R3', `radar.models.${b.model}.ship_range_m（${model.ship_range_m}）は海域の対角（${diag.toFixed(1)} m）以下`);
  return radarParamsFromData(model, b, models.aircraft);
}

/** WorldSetup に展開する部分: レーダーの無い任務・radarOff の夜は {}（radar の鍵ごと出ない＝ほかの任務の setup の snapshot が変わらない） */
export function radarSetupPart(data: GameData, mission: PrototypeMission, o: RadarSetupOptions): { radar?: RadarSetup } {
  const p = o.radarOff ? null : getRadarParams(data, mission);
  return p ? { radar: p } : {};
}

/** Boot の検査: radar の data（型ごとの V-R4）と、v0_1_prototype を持つ全任務（ハードも）を 1 回組む。最初のレーダーの任務の値（ノーマル）を返す（無ければ null） */
export function validateRadarMissions(data: GameData): RadarSetup | null {
  getRadarData(data);
  let first: RadarSetup | null = null;
  for (const m of data.missionsSeed.missions as readonly Rec[]) {
    const id = m['id'];
    if (typeof id !== 'string' || !m['v0_1_prototype']) continue;
    for (const hard of hasHardVariant(data, id) ? [false, true] : [false]) {
      const p = getRadarParams(data, getPrototypeMission(data, id, hard));
      if (p && !first) first = p;
    }
  }
  return first;
}
