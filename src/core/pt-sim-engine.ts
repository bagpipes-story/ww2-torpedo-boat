// 機関の不調（v0.6.5。jp_05。docs/02 §6.8、spec-v065 §F.1）の模擬のつなぎ: core/pt-pass-sim の 1 夜に core/engine-trouble の熱と不調を世界と同じ順（米PT の段の直後・
// 火災の前。時計は realDt＝米PT の AI と同じ）で回し、不調の間の入力は世界と同じ engineInput（速さの上限が艇の静音の上限。舵は残る）。
// 予告への反応の台本（模擬の設定。ゲームの値ではない）: ignore は何もしない（不調の無い夜は ENG_OFF と全欄同一＝T-E3）、cool／cruise は予告の 1 段目に入って
// PT_PLAY.coolDelayS 秒後から熱が PT_PLAY.coolToHeat を下回るまで、赤い線の外では静音の上限／巡航まで落とす。
// 計測（PtTrial の eng の列）: 赤い線の最中に始まった不調（不変 0）・不調の間に固めた赤い線・不調から 1 秒以内に固めた線・1 段目から不調の最短・回復から次の不調の最短・
// 最長の不調・不調の間か回復から 10 秒以内の沈没。乱数を引かない。setup.engine が null（不調の無い任務・ENG_OFF）なら pt-pass-sim は何も呼ばない。Phaser 非依存・確保は 1 夜の始めだけ。
import type { BoatInput, BoatParams, SpeedStep } from './boat-motion';
import { ENGINE_OK, ENGINE_WARN, createEngineState, engineCap01, engineInput, stepEngine, type EngineParams, type EngineState } from './engine-trouble';
import { PT_PLAY } from './pt-sim-policy';
import type { PtTrial } from './pt-trial';

/** 予告への反応の台本（scripts の ENG_REACT。表の順） */
export const PT_ENGINE_REACTS = ['ignore', 'cool', 'cruise'] as const;
export type PtEngineReact = (typeof PT_ENGINE_REACTS)[number];

/** 不調から何秒以内に固めた線を数えるか・回復から何秒以内の沈没を「不調の近く」と数えるか（計測の窓。帯ではない） */
export const ENGINE_LINE_NEAR_S = 1;
export const ENGINE_SUNK_NEAR_S = 10;
const TIME_EPS_S = 1e-6;

/** 1 夜の模擬の機関（runPtTrial の始めに 1 個） */
export interface SimEngine {
  p: EngineParams;
  react: PtEngineReact;
  st: EngineState;
  /** 不調の間の入力（engineInput が書く。出撃時に 1 個） */
  capInput: BoatInput;
  /** cool／cruise が落としている間 */
  cooling: boolean;
  /** 予告の 1 段目に（平常から）入った時刻（平常に戻ると NaN。回復で 3 → 1 になっても入り直さない）・最後に回復した時刻（NaN は無し） */
  warnSinceS: number;
  lastRecoverS: number;
}

export function createSimEngine(p: EngineParams, react: PtEngineReact): SimEngine {
  return { p, react, st: createEngineState(p), capInput: { headingDeg: NaN, speed01: 0 }, cooling: false, warnSinceS: NaN, lastRecoverS: NaN };
}

/**
 * 入力の段（台本の want を決めた後。状態は前のステップの終わり）: cool／cruise は 1 段目に入って coolDelayS 秒後から熱が coolToHeat を下回るまで、
 * 赤い線（lineOn＝q.owner ≥ 0）の外では want を静音の上限／巡航までにする。ignore は want そのもの。不調の上限は simEngineInput（世界と同じ engineInput）
 */
export function simEngineWant(e: SimEngine, want: number, t0: number, lineOn: boolean, silentMps: number, cruiseMps: number): number {
  if (e.react === 'ignore') return want;
  if (e.st.stage >= ENGINE_WARN && t0 - e.warnSinceS >= PT_PLAY.coolDelayS - TIME_EPS_S) e.cooling = true;
  if (e.st.heat < PT_PLAY.coolToHeat) e.cooling = false;
  if (!e.cooling || lineOn) return want;
  const cap = e.react === 'cool' ? silentMps : cruiseMps;
  return want < cap ? want : cap;
}

/** 艇の運動に渡す入力（世界の world-boat と同じ: 不調でなければ input、不調なら速さの上限が静音の上限 / 今の全速の capInput） */
export function simEngineInput(e: SimEngine, input: BoatInput, bp: BoatParams): BoatInput {
  return engineInput(e.st, input, e.capInput, engineCap01(bp));
}

/** 米PT の段の直後（spec §F.1 の 2）: 熱と不調を進め、不調の始まりと回復を数える。canLimp は沈み始めていない・輪の中でない・燃料切れでない */
export function simEngineStep(e: SimEngine, out: PtTrial, band: SpeedStep, lineOn: boolean, canLimp: boolean, t: number, dt: number): void {
  const s = e.st;
  const limps = s.limps;
  const wasLimp = s.limp;
  stepEngine(s, e.p, band, lineOn, canLimp, dt, t);
  if (s.stage === ENGINE_OK) e.warnSinceS = NaN;
  else if (Number.isNaN(e.warnSinceS)) e.warnSinceS = t;
  if (s.stage >= ENGINE_WARN) out.engWarned = true;
  if (s.limps > limps) {
    if (lineOn) out.engLimpsInLine++;
    if (t - e.warnSinceS < out.engMinLeadS) out.engMinLeadS = t - e.warnSinceS;
    if (t - e.lastRecoverS < out.engMinRecoverLeadS) out.engMinRecoverLeadS = t - e.lastRecoverS;
  } else if (wasLimp && !s.limp) {
    if (t - s.limpStartS > out.engMaxLimpS) out.engMaxLimpS = t - s.limpStartS;
    e.lastRecoverS = t;
  }
}

/** 赤い線を固めた（pt-pass-sim の onCommit。米PT の段の中＝そのステップの機関の段の前）: 不調の間の線と、不調から ENGINE_LINE_NEAR_S 秒以内の線 */
export function simEngineCommit(e: SimEngine, out: PtTrial, t: number): void {
  if (!e.st.limp) return;
  out.engLinesInLimp++;
  if (t - e.st.limpStartS < ENGINE_LINE_NEAR_S + TIME_EPS_S) out.engLinesNearLimp++;
}

/** 夜の終わり: 不調の回数と秒の和、夜の終わりで切れた不調の長さ、不調の間か回復から ENGINE_SUNK_NEAR_S 秒以内に沈んだ */
export function simEngineOut(e: SimEngine, out: PtTrial, t: number, sunk: boolean): void {
  const s = e.st;
  out.engLimps = s.limps;
  out.engLimpS = s.limpS;
  if (s.limp && t - s.limpStartS > out.engMaxLimpS) out.engMaxLimpS = t - s.limpStartS;
  out.engSunkNearLimp = sunk && (s.limp || t - e.lastRecoverS < ENGINE_SUNK_NEAR_S);
}
