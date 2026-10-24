// 機関の不調（v0.6.5。日本ハードモード④・jp_05。docs/02 §6.8、spec-v065 §C.1・§C.2）の本体: 乱数なしの「熱」・段・出来事・数えと、不調の間の入力の差し替え。
// 熱は全速の帯で溜まり（実効の T 秒で 0 → 1）、巡航（cruise_cool_s）・静音以下（silent_cool_s）で 1 → 0 の速さで冷える。熱 1.0 で不調＝速さの上限が艇の静音の上限
// （止まらない・舵と機銃は残る）。不調の間は帯に関わらず silent_cool_s で冷え、recover_heat まで冷えれば操作なしに戻る（ちょうど (1 − recover_heat) × silent_cool_s 秒）。回数の上限なし。
// 赤い線（米PT の攻撃の最中。そのステップに固めた線も）・沈み始め・帰投の輪の中・燃料切れの間は不調にならず、熱 1.0 で待つ（予告は嘘を言わない）。
// 回復の後は熱が warn_rearm_heat を割るまで段を過熱のまま保ち、過熱の出来事と数えを出し直さない（v0.6.5 のレビュー fair-1: 不調の 14 kt から加速し直す間に熱が 0.6 を少し割り、
// 右下の字が 1.5 秒ほど平常に戻ってから過熱の行が不調のたびに出直していた）。
// 呼ぶのは米PT の段の直後（世界は feelDt、模擬は realDt）。Phaser 非依存・乱数なし・確保なし・atan2 なし（数の比較と足し引きだけ）。data の値と検査は core/engine-trouble-data。
import type { BoatInput, BoatParams, SpeedStep } from './boat-motion';
import type { EngineParams } from './engine-trouble-data';

export type { EngineParams } from './engine-trouble-data';

/** 段（右下の熱の帯の字と 2 行目）: 0 平常・1 過熱（熱 ≥ warn_heat）・2 限界（≥ final_warn_heat）・3 不調 */
export const ENGINE_OK = 0;
export const ENGINE_WARN = 1;
export const ENGINE_FINAL = 2;
export const ENGINE_LIMP = 3;
export type EngineStage = typeof ENGINE_OK | typeof ENGINE_WARN | typeof ENGINE_FINAL | typeof ENGINE_LIMP;

/** 出来事（eventSeq が増えたときの種類。2 行目の時計が読む）: 0 まだ無い・1 過熱（warn_heat を下から越えた）・2 限界（final_warn_heat を下から越えた）・3 不調・4 回復 */
export const ENGINE_EV_NONE = 0;
export const ENGINE_EV_WARN = 1;
export const ENGINE_EV_FINAL = 2;
export const ENGINE_EV_LIMP = 3;
export const ENGINE_EV_RECOVER = 4;
export type EngineEvent = typeof ENGINE_EV_NONE | typeof ENGINE_EV_WARN | typeof ENGINE_EV_FINAL | typeof ENGINE_EV_LIMP | typeof ENGINE_EV_RECOVER;

/** 熱の境の比べの許し（1/60 秒を 1,800 回足した丸めで 1.0・0.6 を 1 ステップ割らない） */
export const ENGINE_EPS = 1e-9;

/** 1 出撃の機関の状態（出撃時に 1 個だけ作り、stepEngine が書き換える） */
export interface EngineState {
  /** 熱 0〜1（1 で不調。不調の間は recover_heat まで冷える） */
  heat: number;
  /** 前のステップの終わりの熱（「下から越えた」の比べ。作ったときは 0＝startHeat ≥ warn_heat のデバッグの出撃は最初のステップで過熱の出来事と数えが出る） */
  prevHeat: number;
  limp: boolean;
  /** 回復した後で、熱がまだ warn_rearm_heat を割っていない（段は少なくとも過熱・過熱の出来事と数えは出さない） */
  afterLimp: boolean;
  stage: EngineStage;
  /** 熱が warn_heat を下から越えた回数（過熱）・final_warn_heat を下から越えた回数（限界）。回復の後は afterLimp の間は過熱を数えない */
  warns: number;
  finals: number;
  /** 不調の回数と秒の和（stepEngine の dt の和＝世界は体感秒）・最後の不調が始まった時刻（nowS） */
  limps: number;
  limpS: number;
  limpStartS: number;
  /** 出来事の通し番号と最後の種類（同じステップに 2 つ起きたら後のほう。不調は越えの後に見るので、重なれば不調が残る） */
  eventSeq: number;
  lastEvent: EngineEvent;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 段（熱・不調・回復の後の保ちから決まる。ほかの状態を見ない）。afterLimp の間は熱が warn_rearm_heat 以上なら少なくとも過熱 */
export function engineStageOf(heat: number, limp: boolean, p: EngineParams, afterLimp = false): EngineStage {
  if (limp) return ENGINE_LIMP;
  if (heat >= p.finalWarnHeat - ENGINE_EPS) return ENGINE_FINAL;
  if (heat >= p.warnHeat - ENGINE_EPS || (afterLimp && heat >= p.warnRearmHeat - ENGINE_EPS)) return ENGINE_WARN;
  return ENGINE_OK;
}

/** 出撃時の状態（熱は startHeat。既定 0、?debug&enghot だけ 0.75）。前の熱は 0 として持つ */
export function createEngineState(p: EngineParams): EngineState {
  const heat = clamp01(p.startHeat);
  return { heat, prevHeat: 0, limp: false, afterLimp: false, stage: engineStageOf(heat, false, p), warns: 0, finals: 0, limps: 0, limpS: 0, limpStartS: NaN, eventSeq: 0, lastEvent: ENGINE_EV_NONE };
}

function emit(s: EngineState, ev: EngineEvent): void {
  s.eventSeq++;
  s.lastEvent = ev;
}

/**
 * 1 固定ステップ（spec §C.1。米PT の段の直後・火災の前）。band は今の速力帯、lineOnPlayer は隊が攻撃中（q.owner ≥ 0。このステップに固めた線も）、
 * canLimp は沈み始めていない・帰投の輪の中でない・燃料切れでない。dt は世界の feelDt／模擬の realDt、nowS は同じ時計の今の秒（limpStartS に写すだけ）。
 * 順: 熱 → 回復の後の保ちを解く → 下から越えた数えと出来事 → 回復 → 不調 → 段。越えの数えは熱だけで決まり、回復（熱を recover_heat ≤ warn_heat に置く。冷えた後なので上へは越えない）と
 * 不調（熱 1 − ε を 1.0 に置くだけ。境はみな 1 より下）はそれを変えないので、spec の順（熱 → 回復 → 不調 → 段と数え）と同じ数えになる。
 * 回復の後（afterLimp）は熱が warn_rearm_heat を割るまで過熱を数えない・出来事を出さない（段は engineStageOf が過熱に保つ）。限界と不調はいつもどおり。
 */
export function stepEngine(s: EngineState, p: EngineParams, band: SpeedStep, lineOnPlayer: boolean, canLimp: boolean, dt: number, nowS: number): void {
  const before = s.prevHeat;
  let h = s.heat;
  if (s.limp) {
    h -= dt / p.silentCoolS; // 不調の間は帯に関わらず（減速中に帯がまだ全速・巡航でも）静音の冷え＝不調はちょうど (1 − recover_heat) × silent_cool_s 秒
    s.limpS += dt;
  } else if (band === 'full') h += dt / p.fullToLimpS;
  else if (band === 'cruise') h -= dt / p.cruiseCoolS;
  else h -= dt / p.silentCoolS;
  s.heat = clamp01(h);
  if (s.afterLimp && s.heat < p.warnRearmHeat - ENGINE_EPS) s.afterLimp = false;
  if (!s.afterLimp && before < p.warnHeat - ENGINE_EPS && s.heat >= p.warnHeat - ENGINE_EPS) {
    s.warns++;
    emit(s, ENGINE_EV_WARN);
  }
  if (before < p.finalWarnHeat - ENGINE_EPS && s.heat >= p.finalWarnHeat - ENGINE_EPS) {
    s.finals++;
    emit(s, ENGINE_EV_FINAL);
  }
  if (s.limp && s.heat <= p.recoverHeat + ENGINE_EPS) {
    s.limp = false;
    s.heat = p.recoverHeat; // ちょうど戻す（段は 3 → 1）
    s.afterLimp = true; // 14 kt から加速し直す間に熱が少し割っても過熱のまま（出し直さない）
    emit(s, ENGINE_EV_RECOVER);
  } else if (!s.limp && s.heat >= 1 - ENGINE_EPS && !lineOnPlayer && canLimp) {
    s.limp = true;
    s.heat = 1; // 丸めの 1 − ε を 1.0 に（不調はちょうど (1 − recover_heat) × silent_cool_s 秒・残りの秒の表示もちょうど）
    s.limps++;
    s.limpStartS = nowS;
    emit(s, ENGINE_EV_LIMP);
  }
  s.stage = engineStageOf(s.heat, s.limp, p, s.afterLimp);
  s.prevHeat = s.heat;
}

/** 不調の間の速度の指令の上限（全速に対する比）: 艇の静音の上限 / 今の全速（機関損傷で全速が落ちれば比は上がる。1 を超えない）。毎ステップ今の値から求める（確保なし） */
export function engineCap01(p: Pick<BoatParams, 'silentMaxMps' | 'speedMaxMps'>): number {
  const r = p.silentMaxMps / p.speedMaxMps;
  return r < 1 ? r : 1;
}

/**
 * 不調の間の入力（spec E6）: 不調でなければ input そのもの。不調なら capInput（出撃時に 1 個作る）に針路を写し、speed01 = min(input.speed01, cap01)。
 * 舵は残り、速度の指令を 0 にしない（止まらない）。input は書き換えない。燃料切れの DRIFT_INPUT は呼ぶ側が先に選ぶ。
 */
export function engineInput(s: EngineState, input: BoatInput, capInput: BoatInput, cap01: number): BoatInput {
  if (!s.limp) return input;
  capInput.headingDeg = input.headingDeg;
  capInput.speed01 = input.speed01 < cap01 ? input.speed01 : cap01;
  return capInput;
}

/** 不調の残りの秒（不調の間は帯に関わらず silent_cool_s で冷えるので熱から決まる。不調でなければ 0） */
export function engineLimpLeftS(s: EngineState, p: EngineParams): number {
  if (!s.limp) return 0;
  const left = (s.heat - p.recoverHeat) * p.silentCoolS;
  return left > 0 ? left : 0;
}

/** HUD に渡す機関の状態（BoatTelemetry の engine。1 個だけ作る）。on が false の任務（不調の無い任務）は HUD が帯も行も出さない */
export interface EngineTelemetry {
  on: boolean;
  heat: number;
  stage: EngineStage;
  /** 不調の残りの秒（HUD は切り上げの整数で出す。不調でなければ 0） */
  limpLeftS: number;
  eventSeq: number;
  lastEvent: EngineEvent;
}

export function createEngineTelemetry(): EngineTelemetry {
  return { on: false, heat: 0, stage: ENGINE_OK, limpLeftS: 0, eventSeq: 0, lastEvent: ENGINE_EV_NONE };
}

/** 状態をテレメトリへ写す（毎フレーム。確保なし） */
export function writeEngineTelemetry(t: EngineTelemetry, s: EngineState, p: EngineParams): void {
  t.on = true;
  t.heat = s.heat;
  t.stage = s.stage;
  t.limpLeftS = engineLimpLeftS(s, p);
  t.eventSeq = s.eventSeq;
  t.lastEvent = s.lastEvent;
}
