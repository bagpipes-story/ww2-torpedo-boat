// 機関の不調（v0.6.5。jp_05。docs/02 §6.8、spec-v065 §F.3。R8 の作法）の模擬の帯: 回帰の帯（測った値の近く。外れたら回帰）と設計の帯（意味のある閾値。±4 点で広げない）。
// 回帰の帯は既定の表（予告を無視＝ignore。N 200・seed 1〜200）で tests/pt-sim-kit が 37 行の帯と一緒に検査する（engineKitMisses）。設計の帯は N 400・seed 1〜400 の
// {不調なし（ENG_OFF）, ignore, cool, cruise} の同じ seed で tests/pt-sim-engine-a〜g（1 台本 1 ファイルで代価・従う台本・不変。edge_flee の従う台本の不変は h）が検査し、
// scripts/pt-pass-sim.ts の TABLE=3 が ✓/✗ を出す（engineTableMisses）。
// 不変（T-E1）はどの台本・どの反応も。帯を外したら値を動かす前に模擬が spec §C.1・§F.1 どおりかを確かめる（data は risk_events.engine_failure.params。理由は source に）。Phaser 非依存。
import type { PtSimSetup } from '../core/pt-pass-sim';
import type { PtCell } from '../core/pt-sim-cell';
import type { PtPolicy } from '../core/pt-sim-policy';

type Band = readonly [number, number];

/** 1 台本の同じ seed の 4 つの表: 不調なし（ENG_OFF）・予告を無視・静音へ落とす・巡航へ落とす */
export interface EngineCells { off: PtCell; ignore: PtCell; cool: PtCell; cruise: PtCell }

export interface EngineCalibrationRow {
  policy: PtPolicy;
  /** 回帰の帯（ignore。N 200・seed 1〜200。N 200 × 4 組（seed 1・201・401・601）の最小〜最大 ± 4 点）: 沈没 %・不調の夜 % */
  sunkPct: Band; limpPct: Band;
  /** 設計の帯（N 400・seed 1〜400）T-E4: ignore の不調の夜 %・ignore の沈没 − 不調なしの沈没（点） */
  limpDesign: Band; sunkVsOff: Band;
  /** T-E5: cool の不調の夜 % の上限（cruise は同じ台本の ignore の不調の夜 % 以下） */
  coolLimpMax: number;
  /** 今の data の模擬の値（N 400・seed 1〜400。目安で、検査はしない）: [不調なしの沈没 %, ignore の沈没 %, ignore の不調の夜 %, cool の沈没 %, cruise の沈没 %] */
  proto: readonly [number, number, number, number, number];
}

const row = (policy: PtPolicy, sunkPct: Band, limpPct: Band, limpDesign: Band, sunkVsOff: Band, coolLimpMax: number, proto: EngineCalibrationRow['proto']): EngineCalibrationRow => ({
  policy, sunkPct, limpPct, limpDesign, sunkVsOff, coolLimpMax, proto,
});
const ALWAYS: Band = [90, 100];
const MOST: Band = [55, 80];

/**
 * 不調の起きる 7 台本（spec §F.2・§F.3）: 見つかったら全速で逃げるだけ（★）は 55〜80% の夜で不調になり 2 点以上沈みやすく、ずっと全速は毎夜不調で 4 点以上、最初から全速でまっすぐは
 * 5〜16 点、撃ちながら逃げる型は 4 点より楽にならない。予告に従って静音へ落とせば不調の夜は 5〜30% 以下、巡航へ落としても無視より多くならない。
 * 回帰の帯は不調ありの N 200 × 4 組（ignore の沈没 % 37〜42.5・28.5〜33・15〜22.5・15〜23.5・22〜29・9〜15・3.5〜5.5、不調の夜 % 98〜100・100・66.5〜69・97.5〜98.5・100・
 * 65.5〜68.5・97.5〜98.5）の最小〜最大 ± 4 点（0〜100 に収める）。proto は試作（spec §F.2）から ±1 点の内
 */
export const ENGINE_CALIBRATION: readonly EngineCalibrationRow[] = [
  row('full', [33, 46.5], [94, 100], ALWAYS, [5, 16], 15, [26.0, 38.0, 99.0, 23.8, 26.5]),
  row('turn_full', [24.5, 37], [96, 100], ALWAYS, [4, Infinity], 30, [16.0, 31.3, 100, 27.8, 27.5]),
  row('flee_full', [11, 26.5], [62.5, 73], MOST, [2, Infinity], 5, [13.3, 17.3, 67.3, 14.0, 13.5]),
  row('flee_dodge', [11, 27.5], [93.5, 100], ALWAYS, [4, Infinity], 15, [12.0, 19.3, 98.3, 17.3, 19.0]),
  row('flee_hold', [18, 33], [96, 100], ALWAYS, [4, Infinity], 30, [10.8, 24.3, 100, 21.8, 25.8]),
  row('flee_shoot', [5, 19], [61.5, 72.5], MOST, [0.5, Infinity], 5, [9.8, 11.5, 66.8, 10.3, 10.0]),
  row('fleedodge_shoot', [0, 9.5], [93.5, 100], ALWAYS, [-4, Infinity], 15, [6.5, 4.5, 98.3, 4.5, 5.8]),
];

/** T-E2: HUD の教える遊び方（ignore）。予告の夜 ≤ ENGINE_HUD_WARN_MAX %・不調の夜 0（沈没は不調なしと同じ値＝T-E3） */
export const ENGINE_HUD_POLICIES: readonly PtPolicy[] = ['slow_shoot', 'turn_shoot', 'tc_shoot', 'fight', 'silent_shoot', 'hold_shoot', 'holdfull_shoot', 'react_shoot', 'hold_full'];
export const ENGINE_HUD_WARN_MAX = 5;
/** T-E6: 予告に従う台本（cool・cruise）の沈没 ≤ 同じ台本の ignore ＋ この点 */
export const ENGINE_FOLLOW_SUNK_ADD = 3;
/** T-E7: どの台本も沈没 ≤ この % */
export const ENGINE_SUNK_MAX = 76;
/** T-E1: 漂流 ≤ 不調なし ＋ この点 */
export const ENGINE_ADRIFT_ADD = 0.5;

/**
 * T-E1 の不変（どの台本・どの反応も。spec §C.2 の E1・E2・E5・E10）: 赤い線の最中に始まった不調 0・1 段目から不調まで ≥ (1 − warn_heat) × T − 1 ステップ・回復から次の不調まで
 * ≥ (1 − recover_heat) × T − 1 ステップ・不調の最長 ≤ (1 − recover_heat) × silent_cool_s ＋ 1 ステップ・打ち切り 0・T-E7、off（不調なしの同じ seed）があれば漂流 ≤ off ＋ 0.5 点。
 * s は不調のある setup（値の閾値を読む。不調の無い setup なら何も見ない）
 */
export function engineInvariantMisses(c: PtCell, s: PtSimSetup, off?: PtCell): string[] {
  const e = s.engine;
  const out: string[] = [];
  if (!e) return out;
  const step = s.stepS + 1e-9;
  const lead = (1 - e.warnHeat) * e.fullToLimpS;
  const recLead = (1 - e.recoverHeat) * e.fullToLimpS;
  const limpS = (1 - e.recoverHeat) * e.silentCoolS;
  if (c.engLimpsInLine > 0) out.push(`赤い線の最中に始まった不調 ${c.engLimpsInLine} 回`);
  if (!(c.engMinLeadS >= lead - step)) out.push(`予告の 1 段目から不調まで ${c.engMinLeadS.toFixed(2)} 秒（${lead} 秒 − 1 ステップ以上）`);
  if (!(c.engMinRecoverLeadS >= recLead - step)) out.push(`回復から次の不調まで ${c.engMinRecoverLeadS.toFixed(2)} 秒（${recLead} 秒 − 1 ステップ以上）`);
  if (!(c.engMaxLimpS <= limpS + step)) out.push(`不調の最長 ${c.engMaxLimpS.toFixed(2)} 秒（${limpS} 秒 ＋ 1 ステップ以下）`);
  if (c.timeoutPct > 0) out.push(`打ち切り ${c.timeoutPct.toFixed(1)}%`);
  if (!(c.sunkPct <= ENGINE_SUNK_MAX)) out.push(`沈没 ${c.sunkPct.toFixed(1)}%（${ENGINE_SUNK_MAX}% 以下）`);
  if (off && !(c.adriftPct <= off.adriftPct + ENGINE_ADRIFT_ADD)) out.push(`漂流 ${c.adriftPct.toFixed(1)}%（不調なし ${off.adriftPct.toFixed(1)} ＋ ${ENGINE_ADRIFT_ADD} 以下）`);
  return out;
}

/** T-E2（HUD の教える遊び方。ignore）: 予告の夜 ≤ 5%・不調の夜 0 */
export function engineHudMisses(c: PtCell): string[] {
  const out: string[] = [];
  if (!(c.engWarnedPct <= ENGINE_HUD_WARN_MAX)) out.push(`予告の夜 ${c.engWarnedPct.toFixed(1)}%（HUD どおりは ${ENGINE_HUD_WARN_MAX}% 以下）`);
  if (c.engLimpPct > 0) out.push(`不調の夜 ${c.engLimpPct.toFixed(1)}%（HUD どおりは 0）`);
  return out;
}

const bandMiss = (name: string, v: number, b: Band): string[] => (v >= b[0] && v <= b[1] ? [] : [`${name} ${v.toFixed(1)}（帯 ${b[0]}〜${b[1]}）`]);

/** 回帰の帯（ignore の表。N 200）: 沈没 %・不調の夜 % */
export function engineRegressionMisses(r: EngineCalibrationRow, c: PtCell): string[] {
  return [...bandMiss('機関: 沈没 %', c.sunkPct, r.sunkPct), ...bandMiss('機関: 不調の夜 %', c.engLimpPct, r.limpPct)];
}

/** 設計の帯 T-E4（無視の代価。N 400・seed 1〜400 の同じ seed の不調なしと ignore）: ignore の不調の夜 %・ignore の沈没 − 不調なし */
export function engineCostMisses(r: EngineCalibrationRow, x: Pick<EngineCells, 'off' | 'ignore'>): string[] {
  return [...bandMiss('ignore の不調の夜 %', x.ignore.engLimpPct, r.limpDesign), ...bandMiss('ignore の沈没 − 不調なし（点）', x.ignore.sunkPct - x.off.sunkPct, r.sunkVsOff)];
}

/** 設計の帯 T-E5（従えば不調が減る）・T-E6（従って損しない）（N 400・seed 1〜400 の同じ seed の ignore・cool・cruise） */
export function engineFollowMisses(r: EngineCalibrationRow, x: Pick<EngineCells, 'ignore' | 'cool' | 'cruise'>): string[] {
  const out: string[] = [];
  if (!(x.cool.engLimpPct <= r.coolLimpMax)) out.push(`cool の不調の夜 ${x.cool.engLimpPct.toFixed(1)}%（${r.coolLimpMax}% 以下）`);
  if (!(x.cruise.engLimpPct <= x.ignore.engLimpPct)) out.push(`cruise の不調の夜 ${x.cruise.engLimpPct.toFixed(1)}%（ignore ${x.ignore.engLimpPct.toFixed(1)}% 以下）`);
  for (const k of ['cool', 'cruise'] as const) {
    if (!(x[k].sunkPct <= x.ignore.sunkPct + ENGINE_FOLLOW_SUNK_ADD)) out.push(`${k} の沈没 ${x[k].sunkPct.toFixed(1)}%（ignore ${x.ignore.sunkPct.toFixed(1)} ＋ ${ENGINE_FOLLOW_SUNK_ADD} 以下）`);
  }
  return out;
}

/** 設計の帯（T-E4〜T-E6。同じ seed の 4 つの表） */
export function engineDesignMisses(r: EngineCalibrationRow, x: EngineCells): string[] {
  return [...engineCostMisses(r, x), ...engineFollowMisses(r, x)];
}

/** TABLE=3 の ✓/✗（N 400・seed 1 で読む）: 不変（ignore・cool・cruise。漂流は不調なしと比べる）、7 台本の設計の帯、HUD の 9 台本の T-E2 */
export function engineTableMisses(policy: PtPolicy, x: EngineCells, s: PtSimSetup): string[] {
  const out: string[] = [];
  for (const k of ['ignore', 'cool', 'cruise'] as const) out.push(...engineInvariantMisses(x[k], s, x.off).map((m) => `${k}: ${m}`));
  const r = ENGINE_CALIBRATION.find((x0) => x0.policy === policy);
  if (r) out.push(...engineDesignMisses(r, x));
  if (ENGINE_HUD_POLICIES.includes(policy)) out.push(...engineHudMisses(x.ignore));
  return out;
}

/** 既定の表（ignore・N 200・seed 1〜200）の行ごと（tests/pt-sim-kit の simMisses が足す）: 不変（漂流は 37 行の帯）・HUD の 9 台本の T-E2・7 台本の回帰の帯 */
export function engineKitMisses(policy: PtPolicy, c: PtCell, s: PtSimSetup): string[] {
  const r = ENGINE_CALIBRATION.find((x) => x.policy === policy);
  return [...engineInvariantMisses(c, s), ...(ENGINE_HUD_POLICIES.includes(policy) ? engineHudMisses(c) : []), ...(r ? engineRegressionMisses(r, c) : [])];
}
