// 米PT の雷撃の数値（v0.6.9。jp_04「多号作戦・オルモック湾へ」。docs/02 §6.11、spec-v069 §3.3・§4.2・§4.9 V11・R12）: enemies.json の us_pt_enemy.torpedo_attack
// （ちょうど 11 鍵。R12 で戦いながらの斉射の engaged_error_factor を足した。core/pt-chase-data の PT_CHASE_KEYS と同じ作法）の形と検査、魚雷の記録（torpedoes.json の torpedo_id）と hit_rate_model.torpedo_launch から PtTorpedoParams を組む。
// core/pt-data の isPtDataRecord はこの block を読まない（PtParams は変わらない）。他の記録（boat_ref の torpedoes・魚雷の記録）は呼ぶ側（config/landing-mission-data）が渡す。
// jp_04 だけが読む。Phaser 非依存・確保は出撃の組み立てのときだけ。距離の比較は二乗で持つ。
import { isTorpedoDataRecord, torpedoParamsFromData, torpedoReliabilityFromData, type TorpedoParams, type TorpedoReliability } from './torpedo';

/** torpedo_attack の鍵（ちょうどこの 11 個。打ち間違い・知らない鍵を止める。R12 で engaged_error_factor を足した） */
export const PT_TORPEDO_KEYS = [
  'torpedo_id', 'launch_range_m', 'launch_heading_tol_deg', 'salvo_count', 'salvo_spacing_deg', 'aim_error_deg',
  'hurried_max_m', 'hurried_error_factor', 'engaged_error_factor', 'reacquire_s', 'retreat_after_salvo',
] as const;
export type PtTorpedoKey = (typeof PT_TORPEDO_KEYS)[number];

export interface PtTorpedoRecord {
  torpedo_id: string;
  launch_range_m: number;
  launch_heading_tol_deg: number;
  salvo_count: number;
  salvo_spacing_deg: number;
  aim_error_deg: number;
  hurried_max_m: number;
  hurried_error_factor: number;
  engaged_error_factor: number;
  reacquire_s: number;
  retreat_after_salvo: boolean;
}

/** 雷撃の値（core/pt-torpedo・core/landing・systems/world-landing が読む。S2 以降） */
export interface PtTorpedoParams {
  torpedoId: string;
  /** 気づかれていない斉射: 輸送船までの距離 m とその二乗、艇首と輸送船への方位の差の上限 deg */
  launchM: number; launch2: number; tolDeg: number;
  /** 斉射: 本数・隣との角 deg・狙いの誤差 ±deg（1 斉射に 1 回引く） */
  n: number; spacingDeg: number; aimDeg: number;
  /** 慌てた斉射: 輸送船までの距離 m とその二乗（0 なら慌てた斉射なし）・狙いの誤差の倍率 */
  hurriedM: number; hurried2: number; hurriedFactor: number;
  /** 戦いながらの斉射（R12）: 狙いの誤差の倍率（0 なら戦いながらの斉射なし） */
  engagedFactor: number;
  /** 見失って哨戒に戻った PT が撃たない体感秒 */
  reacquireS: number;
  /** 魚雷（Mk 13）の運動と信頼性（不発・蛇行）・蛇行の一定偏差の幅 deg。史実モードでも変えない（jp の任務は reliability_campaigns に無い） */
  torpedo: TorpedoParams; reliability: TorpedoReliability; jitterDeg: number;
}

/** 呼ぶ側が渡す他の記録: boat_ref（boats.json）の名と torpedoes（本数・後期の型）、torpedo_id の魚雷の記録、hit_rate_model.torpedo_launch の 2 値 */
export interface PtTorpedoContext {
  boatRef: string;
  boatTorpedoes: { count: unknown; type_late: unknown } | undefined;
  torpedoRecord: unknown;
  armingM: number;
  erraticPeriodS: number;
}

/** torpedo_attack の形: ちょうど PT_TORPEDO_KEYS の 11 鍵、torpedo_id は文字列・retreat_after_salvo は真偽・ほかは有限の数 */
export function isPtTorpedoRecord(v: unknown): v is PtTorpedoRecord {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  if (Object.keys(r).length !== PT_TORPEDO_KEYS.length) return false;
  for (const k of PT_TORPEDO_KEYS) {
    const x = r[k];
    if (k === 'torpedo_id' ? typeof x !== 'string' : k === 'retreat_after_salvo' ? typeof x !== 'boolean' : typeof x !== 'number' || !Number.isFinite(x)) return false;
  }
  return true;
}

/** V11（spec-v069 §4.9）の検査込みで組む。label は「<任務>: enemies.json の <id>.torpedo_attack」（例外の頭） */
export function ptTorpedoParamsFromData(raw: unknown, ctx: PtTorpedoContext, label: string): PtTorpedoParams {
  const bad = (msg: string): never => {
    throw new Error(`${label}: ${msg}（docs/02 §6.11）`);
  };
  if (!isPtTorpedoRecord(raw)) return bad(`ちょうど ${PT_TORPEDO_KEYS.length} 鍵（${PT_TORPEDO_KEYS.join('・')}）で、torpedo_id は文字列・retreat_after_salvo は真偽・ほかは有限の数`);
  const a = raw;
  const rec = ctx.torpedoRecord;
  if (!isTorpedoDataRecord(rec)) return bad(`torpedo_id（${a.torpedo_id}）が torpedoes.json に魚雷の値（settings / default_setting / length_m / reliability）付きで無い`);
  const bt = ctx.boatTorpedoes;
  const count = bt?.count;
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) return bad(`boats.json の ${ctx.boatRef}.torpedoes.count（1 以上の整数）が無い`);
  if (a.torpedo_id !== bt!.type_late) bad(`torpedo_id（${a.torpedo_id}）は boats.json の ${ctx.boatRef}.torpedoes.type_late（${String(bt!.type_late)}）と同じ（1944 の艇の魚雷）`);
  if (!(Number.isInteger(a.salvo_count) && a.salvo_count >= 1 && a.salvo_count <= count)) bad(`salvo_count（${a.salvo_count}）は 1〜${count}（${ctx.boatRef} の魚雷の本数）の整数`);
  if (!(a.launch_range_m > 0)) bad('launch_range_m は正');
  if (!(a.launch_heading_tol_deg > 0 && a.launch_heading_tol_deg < 90)) bad('0 < launch_heading_tol_deg < 90（輸送船へ向かっているときだけ撃つ）');
  if (!(a.salvo_spacing_deg > 0)) bad('salvo_spacing_deg は正');
  if (!(a.aim_error_deg >= 0)) bad('aim_error_deg は 0 以上');
  if (!(a.hurried_max_m === 0 || a.hurried_max_m > a.launch_range_m)) bad(`hurried_max_m（${a.hurried_max_m}）は 0（慌てた斉射なし）か launch_range_m（${a.launch_range_m} m）より遠い`);
  if (!(a.hurried_error_factor >= 1)) bad('hurried_error_factor は 1 以上（慌てた斉射の狙いは粗い）');
  if (!(a.engaged_error_factor === 0 || a.engaged_error_factor >= 1)) bad(`engaged_error_factor（${a.engaged_error_factor}）は 0（戦いながらの斉射なし）か 1 以上（戦いながらの斉射の狙いは粗い）`);
  if (!(a.reacquire_s >= 0)) bad('reacquire_s は 0 以上');
  if (a.retreat_after_salvo !== true) bad('retreat_after_salvo は true（v0.6.9 は気づかれていない・慌てた斉射の後に去る。戦いながらの斉射は去らない）');
  const torpedo = torpedoParamsFromData(rec, ctx.armingM, ctx.erraticPeriodS);
  const far = Math.max(a.launch_range_m, a.hurried_max_m);
  if (!(far < torpedo.rangeM)) bad(`撃つ距離（launch_range_m・hurried_max_m の遠い方 ${far} m）は魚雷の射程（${torpedo.rangeM} m）より近い`);
  const sq = (x: number): number => x * x;
  return {
    torpedoId: a.torpedo_id,
    launchM: a.launch_range_m, launch2: sq(a.launch_range_m), tolDeg: a.launch_heading_tol_deg,
    n: a.salvo_count, spacingDeg: a.salvo_spacing_deg, aimDeg: a.aim_error_deg,
    hurriedM: a.hurried_max_m, hurried2: sq(a.hurried_max_m), hurriedFactor: a.hurried_error_factor, engagedFactor: a.engaged_error_factor,
    reacquireS: a.reacquire_s,
    torpedo, reliability: torpedoReliabilityFromData(rec), jitterDeg: rec.reliability.jitter_deg,
  };
}
