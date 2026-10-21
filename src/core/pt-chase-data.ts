// 米PT の追撃の数値（v0.6.3 実機 2 回目。docs/02 §6.4、spec r2 §C.2）: enemies.json の us_pt_enemy.chase（ちょうど 19 鍵）の形と検査、PtParams の chase*・burst* を組む。
// 他の記録が要る検査（振り切れない＝自艇の最大 < speed_kt、1 回の連射で沈まない＝burst_rounds × damage < 自艇の HP）は config/pt-mission-data。
// 単位: *_kt は ktToMps で game m/s、*_s は体感秒、*_deg は角、距離の比較は二乗で持つ。Phaser 非依存・確保は出撃の組み立てのときだけ。
import { degToRad, ktToMps } from './units';

/** chase の鍵（ちょうどこの 19 個。打ち間違い・知らない鍵を止める） */
export const PT_CHASE_KEYS = [
  'speed_kt', 'min_target_kt', 'start_aft_deg', 'station_m', 'station_rel_deg', 'held_station_m', 'held_rel_deg', 'held_guard_m', 'commit_m',
  'burst_rounds', 'burst_max_s', 'max_bursts', 'gap_s', 'self_gap_s', 'exit_fwd_deg', 'slow_exit_s', 'bow_rof_factor', 'cone_quit_s', 'suppress_hits',
] as const;
export type PtChaseKey = (typeof PT_CHASE_KEYS)[number];
export type PtChaseRecord = Record<PtChaseKey, number>;

/** 追撃（PtParams に入る。名前は chase*・burst*） */
export interface PtChaseParams {
  /** 追撃の速さ・入る目標の速さの下限（game m/s）、入る艇尾からの角の cos²（艇の艇尾から start_aft_deg 以内） */
  chaseMps: number; chaseMinMps: number; chaseCosAft2: number;
  /** 撃つ側の位置取り: 艇からの距離 m・艇の針路からの角 deg。待つ側: 距離 m・角 deg・自分から寄らない距離の二乗。連射を固める距離の二乗 */
  chaseStationM: number; chaseRelDeg: number; chaseHeldM: number; chaseHeldRelDeg: number; chaseHeldGuard2: number; chaseCommit2: number;
  /** 連射: 1 回の弾数・最大秒（open_fire_s の後）・1 隻の回数、艇首の円錐へ撃つ速さの倍率、艇首の円錐に艇がいたらやめる秒 */
  burstRounds: number; burstMaxS: number; maxBursts: number; burstBowRofFactor: number; burstConeQuitS: number;
  /** 連射の後の間（体感秒）・同じ PT が続けて撃つまでに足す秒、追撃をやめる: 艇首からの角の cos²・遅い目標の秒、追撃の PT を制圧する 13mm の命中 */
  chaseGapS: number; chaseSelfGapS: number; chaseCosExit2: number; chaseSlowExitS: number; chaseSuppressHits: number;
}

/** chaseParamsFromData が読む他の値（boat_ref の最大速力 kt と attack・guns の距離 m・予告の秒） */
export interface PtChaseContext {
  boatMaxKt: number; minRangeM: number; holdOffM: number; effectiveM: number; openFireS: number;
}

/** chase の形: ちょうど PT_CHASE_KEYS の 19 鍵で、どれも有限の数（余分・欠け・文字は false） */
export function isChaseRecord(v: unknown): v is PtChaseRecord {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  return Object.keys(r).length === PT_CHASE_KEYS.length && PT_CHASE_KEYS.every((k) => typeof r[k] === 'number' && Number.isFinite(r[k] as number));
}

/** 設計値の検査込み（spec r2 §C.2）。bad は任務の id と記録の名前を付けて例外を投げる（core/pt-data の ptParamsFromData から） */
export function chaseParamsFromData(c: PtChaseRecord, x: PtChaseContext, bad: (msg: string) => never): PtChaseParams {
  const no = (msg: string): never => bad(`chase: ${msg}`);
  if (!(c.speed_kt > 0 && c.speed_kt <= x.boatMaxKt)) no(`0 < speed_kt ≤ boat_ref の最大速力（${x.boatMaxKt} kt）`);
  if (!(c.min_target_kt > 0)) no('min_target_kt は正');
  if (!(c.start_aft_deg > 0 && c.start_aft_deg < 90)) no('0 < start_aft_deg < 90');
  if (!(x.minRangeM < c.station_m && c.station_m < c.commit_m)) no(`attack.min_range_m < station_m < commit_m（${x.minRangeM} < ${c.station_m} < ${c.commit_m}）`);
  if (!(c.commit_m < x.effectiveM)) no(`commit_m < guns.effective_night_m（${c.commit_m} < ${x.effectiveM}。連射は有効射程の内で固める）`);
  if (!(c.station_rel_deg > 90 && c.station_rel_deg <= c.held_rel_deg && c.held_rel_deg < 180)) no('90 < station_rel_deg ≤ held_rel_deg < 180（後ろ寄りの舷。待つ PT はもっと後ろ）');
  if (!(c.held_guard_m > 0 && c.held_guard_m < c.held_station_m && c.held_station_m < x.holdOffM)) no(`0 < held_guard_m < held_station_m < attack.hold_off_m（${c.held_guard_m} < ${c.held_station_m} < ${x.holdOffM}。待つ PT は有効射程の外）`);
  for (const k of ['burst_rounds', 'max_bursts', 'suppress_hits'] as const) if (!Number.isInteger(c[k]) || c[k] < 1) no(`${k} は 1 以上の整数`);
  if (!(c.burst_max_s > 0 && c.slow_exit_s > 0)) no('burst_max_s・slow_exit_s は正');
  if (!(c.gap_s >= 0 && c.self_gap_s >= 0)) no('gap_s・self_gap_s は 0 以上');
  if (!(c.exit_fwd_deg > 0 && c.exit_fwd_deg < 90)) no('0 < exit_fwd_deg < 90');
  if (!(c.bow_rof_factor > 0 && c.bow_rof_factor <= 1)) no('0 < bow_rof_factor ≤ 1（艇首の円錐へは遅く撃つ）');
  if (!(c.cone_quit_s > 0 && c.cone_quit_s < c.burst_max_s + x.openFireS)) no(`0 < cone_quit_s < burst_max_s + attack.open_fire_s（${c.burst_max_s + x.openFireS}）`);
  const sq = (v: number): number => v * v;
  const cos2 = (deg: number): number => sq(Math.cos(degToRad(deg)));
  return {
    chaseMps: ktToMps(c.speed_kt), chaseMinMps: ktToMps(c.min_target_kt), chaseCosAft2: cos2(c.start_aft_deg),
    chaseStationM: c.station_m, chaseRelDeg: c.station_rel_deg, chaseHeldM: c.held_station_m, chaseHeldRelDeg: c.held_rel_deg, chaseHeldGuard2: sq(c.held_guard_m), chaseCommit2: sq(c.commit_m),
    burstRounds: c.burst_rounds, burstMaxS: c.burst_max_s, maxBursts: c.max_bursts, burstBowRofFactor: c.bow_rof_factor, burstConeQuitS: c.cone_quit_s,
    chaseGapS: c.gap_s, chaseSelfGapS: c.self_gap_s, chaseCosExit2: cos2(c.exit_fwd_deg), chaseSlowExitS: c.slow_exit_s, chaseSuppressHits: c.suppress_hits,
  };
}
