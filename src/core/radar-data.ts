// レーダー（v0.8.0。米PT キャンペーン②の us_04「ブラケット海峡の夜」から。spec-v0800 §3）の data の型と形の検査:
// hit_rate_model.json の radar（型ごとの射程・掃引・陸の反射・丸めと aircraft）と、missions_seed の v0_1_prototype.radar（型 model と付き方 fit）。
// 形の検査（鍵の閉じた集合・型・V-R4）はここ、他の記録・任務を跨ぐ検査（V-R1〜V-R3・V-R5）は config/radar-mission-data。Phaser 非依存・乱数なし。
// レーダーは目とは別の感覚（D-R1）: 発見・視程・見越し点マーカー・AI・命中率は何も変えない。輝点を作るのは S1 の core/radar（ここは値だけ）。

/** 付き方: leader＝分隊の先頭の艇だけ（1943。プレイヤーが先頭）・own＝自艇の標準装備（1944） */
export const RADAR_FITS = ['leader', 'own'] as const;
export type RadarFit = (typeof RADAR_FITS)[number];
/** hit_rate_model.json の radar の鍵（ちょうど 4 個）・型の鍵（ちょうど 6 個）・任務の block の鍵（ちょうど 3 個） */
export const RADAR_DATA_KEYS = ['note', 'aircraft', 'models', 'source'] as const;
export const RADAR_MODEL_KEYS = ['ship_range_m', 'small_range_m', 'sweep_s', 'land_clutter_m', 'position_step_m', 'source'] as const;
export const RADAR_BLOCK_KEYS = ['model', 'fit', 'source'] as const;
/** V-R4: 掃引の秒の幅（実秒）と丸めの最小 m */
export const RADAR_SWEEP_MIN_S = 1;
export const RADAR_SWEEP_MAX_S = 5;
export const RADAR_STEP_MIN_M = 1;

export interface RadarModelRecord {
  ship_range_m: number;
  small_range_m: number;
  sweep_s: number;
  land_clutter_m: number;
  position_step_m: number;
  source: string;
}

export interface RadarDataRecord {
  note: string;
  aircraft: false;
  models: Record<string, RadarModelRecord>;
  source: string;
}

export interface RadarBlock {
  model: string;
  fit: RadarFit;
  source: string;
}

/** レーダーの世界の値（WorldSetup.radar。S1 の core/radar・S2 の systems/world-radar が読む）。距離の比べは 2 乗で持つ */
export interface RadarParams {
  model: string;
  fit: RadarFit;
  /** 艦（駆逐艦・輸送船）が映る射程 m とその 2 乗、小さい艇（大発・PT など）が映る射程 m とその 2 乗（D-R5） */
  shipRangeM: number;
  shipRange2: number;
  smallRangeM: number;
  smallRange2: number;
  /** 掃引の間（固定ステップの時計の実秒。D-R7） */
  sweepS: number;
  /** 陸（岸の線）からこの m の内の艦艇は映らない（D-R4） */
  landClutterM: number;
  /** 輝点の位置の格子 m（D-R2・D-R7） */
  positionStepM: number;
  /** 機を映すか（D-R3。v0.8.0 は false だけ） */
  aircraft: boolean;
}

type Rec = Record<string, unknown>;
const isObj = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/** 鍵はちょうど keys（知らない鍵・欠けを名指す） */
function closedKeys(raw: Rec, keys: readonly string[], bad: (msg: string) => never): void {
  const unknown = Object.keys(raw).filter((k) => !keys.includes(k));
  const missing = keys.filter((k) => !(k in raw));
  if (unknown.length > 0 || missing.length > 0) bad(`鍵はちょうど ${keys.join('・')}（知らない鍵 ${unknown.join('・') || 'なし'}・欠け ${missing.join('・') || 'なし'}）`);
}

/** V-R4 の 1 型: 数・射程は正・小さい艇の射程は 0〜艦の射程・掃引は 1〜5 秒・陸の反射は 0 以上・丸めは 1 m 以上。label は「hit_rate_model.json の radar.models.<id>」 */
export function readRadarModel(raw: unknown, label: string): RadarModelRecord {
  const bad = (msg: string): never => {
    throw new Error(`${label}: ${msg}（V-R4・spec-v0800 §3.3）`);
  };
  if (!isObj(raw)) return bad('object でない');
  closedKeys(raw, RADAR_MODEL_KEYS, bad);
  for (const k of RADAR_MODEL_KEYS) if (k !== 'source' && !isNum(raw[k])) bad(`${k} は数（${String(raw[k])}）`);
  if (!nonEmpty(raw['source'])) bad('source は空でない文字列');
  const m = raw as unknown as RadarModelRecord;
  if (!(m.ship_range_m > 0)) bad(`ship_range_m は正（${m.ship_range_m}）`);
  if (!(m.small_range_m >= 0 && m.small_range_m <= m.ship_range_m)) bad(`small_range_m は 0 以上で ship_range_m（${m.ship_range_m}）以下（${m.small_range_m}）`);
  if (!(m.sweep_s >= RADAR_SWEEP_MIN_S && m.sweep_s <= RADAR_SWEEP_MAX_S)) bad(`sweep_s は ${RADAR_SWEEP_MIN_S}〜${RADAR_SWEEP_MAX_S} 秒（${m.sweep_s}）`);
  if (!(m.land_clutter_m >= 0)) bad(`land_clutter_m は 0 以上（${m.land_clutter_m}）`);
  if (!(m.position_step_m >= RADAR_STEP_MIN_M)) bad(`position_step_m は ${RADAR_STEP_MIN_M} m 以上（${m.position_step_m}）`);
  return m;
}

/** hit_rate_model.json の radar: 鍵はちょうど 4 個・aircraft は false（機は映さない＝D-R3）・models は空でなく、型ごとに V-R4。label は「hit_rate_model.json の radar」 */
export function readRadarData(raw: unknown, label: string): RadarDataRecord {
  const bad = (msg: string): never => {
    throw new Error(`${label}: ${msg}（spec-v0800 §3.3）`);
  };
  if (!isObj(raw)) return bad('object でない');
  closedKeys(raw, RADAR_DATA_KEYS, bad);
  if (raw['aircraft'] !== false) bad(`aircraft は false（機は映さない＝D-R3。映す仕組みはまだ無い。${String(raw['aircraft'])}）`);
  for (const k of ['note', 'source'] as const) if (!nonEmpty(raw[k])) bad(`${k} は空でない文字列`);
  const models = raw['models'];
  if (!isObj(models) || Object.keys(models).length === 0) return bad('models は空でない object（型の id → 値）');
  for (const id of Object.keys(models)) readRadarModel(models[id], `${label}.models.${id}`);
  return raw as unknown as RadarDataRecord;
}

/** v0_1_prototype.radar の形: 鍵はちょうど 3 個・model と source は空でない文字列・fit は leader か own（V-R1 の形。model が models にあるかは config） */
export function readRadarBlock(raw: unknown, label: string): RadarBlock {
  const bad = (msg: string): never => {
    throw new Error(`${label}: ${msg}（V-R1・spec-v0800 §3.3）`);
  };
  if (!isObj(raw)) return bad('object でない');
  closedKeys(raw, RADAR_BLOCK_KEYS, bad);
  if (!nonEmpty(raw['model'])) bad('model は空でない文字列（hit_rate_model.json の radar.models の鍵）');
  if (!(RADAR_FITS as readonly unknown[]).includes(raw['fit'])) bad(`fit は ${RADAR_FITS.join('・')} のどれか（${String(raw['fit'])}）`);
  if (!nonEmpty(raw['source'])) bad('source は空でない文字列');
  return raw as unknown as RadarBlock;
}

export function radarParamsFromData(m: RadarModelRecord, b: RadarBlock, aircraft: boolean): RadarParams {
  return {
    model: b.model,
    fit: b.fit,
    shipRangeM: m.ship_range_m,
    shipRange2: m.ship_range_m * m.ship_range_m,
    smallRangeM: m.small_range_m,
    smallRange2: m.small_range_m * m.small_range_m,
    sweepS: m.sweep_s,
    landClutterM: m.land_clutter_m,
    positionStepM: m.position_step_m,
    aircraft,
  };
}
