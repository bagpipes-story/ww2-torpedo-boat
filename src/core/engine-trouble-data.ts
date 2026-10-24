// 機関の不調（v0.6.5。日本ハードモード④・jp_05。docs/02 §6.8、spec-v065 §B.1・§C.2）の数値: risk_events.json の engine_failure.params（ちょうど 8 鍵＋source）の形と検査、EngineParams を組む。
// 乱数なしの「熱」: 全速の帯で溜まり、巡航・静音以下で冷える。熱 1.0 で不調（速さの上限が艇の静音の上限）、recover_heat まで冷えれば操作なしに戻る（本体は core/engine-trouble。v0.6.5 の S2）。
// 熱の溜まる速さは自艇の engine_reliability で変わる: 実効の秒 T = full_to_limp_s × (1 − reliability_ref) / (1 − engine_reliability)。
// 任務の同居の検査（米PT の任務だけ・輸送隊と同居しない）と自艇の値の引き出しは config/engine-mission-data。Phaser 非依存・確保は組み立てのときだけ。

/** risk_events.json の機関の不調の id（任務の v0_1_prototype.hazards にあれば不調が入る。night.optional_hazards には入れない） */
export const ENGINE_FAILURE_EVENT_ID = 'engine_failure';

/** params の数の鍵（ちょうどこの 8 個＋source。打ち間違い・知らない鍵を止める。pt-chase-data の 19 鍵と同じ作法。warn_rearm_heat は v0.6.5 のレビュー） */
export const ENGINE_PARAM_KEYS = ['full_to_limp_s', 'reliability_ref', 'cruise_cool_s', 'silent_cool_s', 'warn_heat', 'final_warn_heat', 'recover_heat', 'warn_rearm_heat'] as const;
export type EngineParamKey = (typeof ENGINE_PARAM_KEYS)[number];

/** 不調の前の予告の最短（体感秒。spec E2）: 冷えた機関から全速でも 1 段目（過熱）から不調まで・回復から次の不調まで ≥ 8 秒、2 段目（限界）から不調まで ≥ 3 秒 */
export const ENGINE_MIN_WARN_LEAD_S = 8;
export const ENGINE_MIN_FINAL_LEAD_S = 3;
/** 実効の T（全速を連続で続けて不調になるまでの秒）の下限 */
export const ENGINE_MIN_FULL_TO_LIMP_S = 20;
/** 秒の比較の許し（(1 − 0.6) × 20 などの丸めで境の値を割らない） */
const LEAD_EPS_S = 1e-9;

/** 機関の不調の値（WorldSetup.engine。core/engine-trouble が読む） */
export interface EngineParams {
  /** 全速を連続で続けて熱 0 → 1（不調）になるまでの体感秒（自艇の engine_reliability で直した実効の T） */
  fullToLimpS: number;
  /** 巡航の帯で熱 1 → 0 の秒・静音以下と不調の間で熱 1 → 0 の秒 */
  cruiseCoolS: number;
  silentCoolS: number;
  /** 予告の 1 段目（過熱）・2 段目（限界）の熱、不調から戻る熱（ここまで冷えたら戻り、熱はちょうどこの値に置く） */
  warnHeat: number;
  finalWarnHeat: number;
  recoverHeat: number;
  /** 回復の後の過熱の段の保ち（v0.6.5 のレビュー）: 回復から熱がこの値を割るまでは段を過熱のまま・過熱の出来事と数えを出し直さない（0 < warnRearmHeat < recoverHeat） */
  warnRearmHeat: number;
  /** 出撃時の熱（既定 0。?debug&enghot だけ config/engine-config の DEBUG_ENGINE_HOT_HEAT） */
  startHeat: number;
}

const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * risk_events.json の engine_failure.params と自艇の engine_reliability から EngineParams を組む（spec-v065 §C.2 の data の検査込み）。
 * 壊れていれば「risk_events.engine_failure.params: …」の例外（Boot で止まる）。label は任務と自艇（例「jp_05 の自艇 jp_t14」）
 */
export function engineParamsFromData(raw: unknown, reliability: unknown, label: string): EngineParams {
  const bad = (msg: string): never => {
    throw new Error(`risk_events.engine_failure.params: ${msg}（${label}。docs/02 §6.8）`);
  };
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return bad('params（full_to_limp_s ほか 8 個と source）が無い');
  const r = raw as Record<string, unknown>;
  for (const k of Object.keys(r)) if (k !== 'source' && !(ENGINE_PARAM_KEYS as readonly string[]).includes(k)) bad(`知らない鍵 ${k}（鍵は ${ENGINE_PARAM_KEYS.join(' / ')} と source）`);
  for (const k of ENGINE_PARAM_KEYS) if (!isFiniteNum(r[k])) bad(`${k} が無いか有限の数でない`);
  if (typeof r['source'] !== 'string' || r['source'].length === 0) bad('source（design／historical の根拠の文）が無い');
  const q = r as Record<EngineParamKey, number>;
  for (const k of ['full_to_limp_s', 'cruise_cool_s', 'silent_cool_s'] as const) if (!(q[k] > 0)) bad(`${k} は正の秒`);
  if (!(q.reliability_ref > 0 && q.reliability_ref < 1)) bad(`0 < reliability_ref < 1（${q.reliability_ref}）`);
  const rel = isFiniteNum(reliability) ? reliability : bad('boats.json の艇に engine_reliability が無い（熱の溜まる速さに読む）');
  if (!(rel > 0 && rel < 1)) bad(`艇の engine_reliability は 0 < r < 1（${rel}）`);
  const t = (q.full_to_limp_s * (1 - q.reliability_ref)) / (1 - rel);
  if (!(t >= ENGINE_MIN_FULL_TO_LIMP_S - LEAD_EPS_S)) bad(`full_to_limp_s の実効の秒（${t} 秒 = full_to_limp_s × (1 − reliability_ref) / (1 − 自艇の engine_reliability)）は ${ENGINE_MIN_FULL_TO_LIMP_S} 秒以上`);
  if (!(q.warn_heat > 0 && q.warn_heat < q.final_warn_heat && q.final_warn_heat < 1)) bad(`0 < warn_heat < final_warn_heat < 1（${q.warn_heat}・${q.final_warn_heat}）`);
  if (!(q.recover_heat > 0)) bad(`recover_heat は正（${q.recover_heat}）`);
  if (!(q.warn_rearm_heat > 0 && q.warn_rearm_heat < q.recover_heat)) bad(`0 < warn_rearm_heat < recover_heat（${q.warn_rearm_heat}・${q.recover_heat}。回復の後の過熱の段は熱がここを割るまで保つ）`);
  // E2: 不調の前に必ず予告（冷えた機関から全速でも）。回復の後の秒は recover_heat ≤ warn_heat の前に見る（どちらが壊れたかを文で分ける）
  if (!((1 - q.warn_heat) * t >= ENGINE_MIN_WARN_LEAD_S - LEAD_EPS_S)) bad(`warn_heat の予告（(1 − warn_heat) × 実効の秒 = ${(1 - q.warn_heat) * t} 秒）は ${ENGINE_MIN_WARN_LEAD_S} 秒以上（過熱から不調まで）`);
  if (!((1 - q.final_warn_heat) * t >= ENGINE_MIN_FINAL_LEAD_S - LEAD_EPS_S)) bad(`final_warn_heat の予告（(1 − final_warn_heat) × 実効の秒 = ${(1 - q.final_warn_heat) * t} 秒）は ${ENGINE_MIN_FINAL_LEAD_S} 秒以上（限界から不調まで）`);
  if (!((1 - q.recover_heat) * t >= ENGINE_MIN_WARN_LEAD_S - LEAD_EPS_S)) bad(`recover_heat の後（(1 − recover_heat) × 実効の秒 = ${(1 - q.recover_heat) * t} 秒）は ${ENGINE_MIN_WARN_LEAD_S} 秒以上（回復から次の不調まで）`);
  if (!(q.recover_heat <= q.warn_heat)) bad(`recover_heat ≤ warn_heat（${q.recover_heat}・${q.warn_heat}。戻った熱は過熱の段のまま＝回復で予告が消えない）`);
  if (!(q.silent_cool_s <= q.cruise_cool_s)) bad(`silent_cool_s ≤ cruise_cool_s（${q.silent_cool_s}・${q.cruise_cool_s}。静音以下のほうが速く冷える）`);
  return {
    fullToLimpS: t,
    cruiseCoolS: q.cruise_cool_s,
    silentCoolS: q.silent_cool_s,
    warnHeat: q.warn_heat,
    finalWarnHeat: q.final_warn_heat,
    recoverHeat: q.recover_heat,
    warnRearmHeat: q.warn_rearm_heat,
    startHeat: 0,
  };
}
