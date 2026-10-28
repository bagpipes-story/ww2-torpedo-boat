// 停泊して揚陸する味方の輸送船（v0.6.9。jp_04「多号作戦・オルモック湾へ」。docs/02 §6.11、spec-v069 §4.4・R8/F14・F16）: 揚陸の時計・米PT の魚雷の命中と沈没・
// 見張りの報告（雷撃に来る PT）・走っている雷跡の数と最接近までの秒・HUD と Result の出来事（2 行目のモード 35 の材料）。
// 揚陸は出撃からの実秒（世界の stepTimeS。命中スローで遅れない。R14 A8）で進み（pct = min(1, nowS / unload_s)）、命中しても沈むまで続き、沈めば止まる。夜明けは入力に無い＝夜明けが先に来ても数え続ける（F14）。
// 決着 = 揚陸完了か沈没。完了の後も泊地に残り、沈みうる（目的には響かない＝sunkAfterDone）。
// LandingState は魚雷の目標（core/torpedo-targets の TorpedoTarget）と雷撃の船（core/pt-torpedo の PtTorpedoShip）をそのまま満たす（船体の円は 1 回だけ埋める。動かない）。
// R14（S6a-fix）: 同じステップの同じ種類の斉射は 1 つの出来事（eventBoats 隻・本数の和。A3）、輸送船が射線に入る（自艇と戦う PT が輸送船の近くで艇首を向けた＝landingFireLine。A1）、
// 遠ざかる雷跡は数えない（A7）。
// Phaser 非依存・毎ステップ確保しない（状態・報告・雷跡の書き先は出撃の組み立てで 1 回）。距離は二乗、平方根は報告の距離の 1 回、atan2 は報告の候補（見張りの内の哨戒の PT）と射線の候補だけ。
import type { LandingParams } from './landing-data';
import { PT_ALERT, PT_BREAK, PT_CHASE, PT_FATE_NONE, PT_PATROL, PT_RUN_IN, type PtSection } from './pt-boats';
import { bearingDeg } from './ship-ai';
import type { TorpedoState } from './torpedo';
import { createCircles, fillHullCircles, type Circle } from './torpedo-solver';
import { degToRad, wrapDeg180, wrapDeg360 } from './units';

/** 揚陸の段階: 揚陸中・揚陸完了（その後に沈んでも LD_DONE のまま。sunkAfterDone）・揚陸の前に沈んだ */
export const LD_UNLOADING = 0;
export const LD_DONE = 1;
export const LD_SUNK = 2;

/** hitLanding の戻り: 被雷（まだ浮いている）・沈み始めた */
export const LANDING_HIT = 1;
export const LANDING_SUNK = 2;

/**
 * 出来事（LandingState.eventKind。HUD の 2 行目のモード 35・ui/landing-lines が S6 で文にする）: 気づかれていない斉射・慌てた斉射・被雷・不発・斉射が外れた・
 * 揚陸の前に沈んだ・揚陸完了・揚陸の後に沈んだ・戦いながらの斉射（R12。「米PT 戦いながら発射！」）。不発の文は eventHits（そのときの被雷の数）で分ける（F16: 被雷の後なら「不発！ 被雷 1 のまま」）
 */
export const LE_NONE = 0;
export const LE_CALM = 1;
export const LE_HURRIED = 2;
export const LE_HIT = 3;
export const LE_DUD = 4;
export const LE_MISS = 5;
export const LE_SUNK = 6;
export const LE_DONE = 7;
export const LE_SUNK_DONE = 8;
export const LE_ENGAGED = 9;

/** 見張りの報告（landingReport の sub）: 無し・遠い（慌てる距離の外か慌てた斉射なし）・近い（慌てる距離の内） */
export const LANDING_REPORT_NONE = 0;
export const LANDING_REPORT_FAR = 1;
export const LANDING_REPORT_NEAR = 2;
/** 報告するのは輸送船へ向かう PT だけ（艇首と輸送船への方位の差がこれ deg 以下。spec §3.5。core は config を読まないのでここに置く） */
export const LANDING_REPORT_TOWARD_DEG = 90;
/** 報告の距離の刻み m（HUD の「1800 m」・鍵の 100 m 刻み。spec §3.5） */
export const LANDING_DIST_STEP_M = 100;
/** 輸送船が射線に入る（landingFireLine。R14 A1）: 戦いながらの斉射の距離（launch_range_m）にこれ m を足した内で、艇首と輸送船への方位の差がこれ deg 以下 */
export const LANDING_FIRE_LINE_EXTRA_M = 300;
export const LANDING_FIRE_LINE_DEG = 45;

export interface LandingState {
  /** LD_* と揚陸の割合（0〜1）・揚陸の前に沈んだときの割合（NaN は沈んでいない）・被雷（不発は数えない）・不発の命中・揚陸の後に沈んだ・揚陸完了の時計（NaN は未完了） */
  phase: number; pct: number; pctAtSink: number; hits: number; duds: number; sunkAfterDone: boolean; doneAtS: number;
  /** 魚雷の目標（TorpedoTarget）: 船体の円・中心・もう狙えない（沈み始めた）・沈んでいる（core では沈み始め＝沈没。絵の沈む演出は世界の AllyShip）・沈み始めた時計 */
  readonly circles: Circle[]; readonly state: { readonly x: number; readonly y: number }; out: boolean; sinking: boolean; sunk: boolean; sinkStartS: number;
  /** 雷撃の船（PtTorpedoShip）: 中心（泊地。動かない）と浮いているか（段階は上の phase。戦いながらの斉射は揚陸中だけ） */
  readonly x: number; readonly y: number; afloat: boolean;
  /**
   * 出来事: 通し番号・種類（LE_*）・撃った PT（−1 は無し。足した斉射は最後の PT）・斉射の距離 m（斉射だけ。他は NaN）と本数（足した斉射は和）・斉射の隻数（同じステップの同じ種類の斉射を足した数。A3。
   * 斉射でない出来事は 0）・そのときの被雷の数・揚陸の割合（沈んだなら沈んだときの割合）
   */
  eventSeq: number; eventKind: number; eventBoat: number; eventM: number; eventCount: number; eventBoats: number; eventHits: number; eventPct: number;
}

/** 見張りの報告の書き先（landingReport。1 個だけ持って中身を書く） */
export interface LandingReport {
  /** LANDING_REPORT_*・その PT（−1 は無し）・輸送船からの距離の 100 m 刻みの切り上げ・輸送船から PT への 8 方位の添字（北 0・時計回り） */
  sub: number; i: number; distStep: number; dirIdx: number;
}

/** 走っている雷跡（landingWakes。1 個だけ持って中身を書く）: まだ決着していない・輸送船の中心へ近づく敵の魚雷の本数と、輸送船の中心への最接近までの最短の体感秒（無ければ NaN） */
export interface LandingWakes {
  count: number;
  cpaS: number;
}

/**
 * HUD に渡す揚陸の状態（v0.6.9 S5b。spec D15・L6。systems/landing-telemetry が毎フレーム中身だけ書く）。揚陸の無い任務も鍵はいつもあり enabled false のまま
 * （convoy・engine・gunboat・patrol の作法。tests/landing-neutral）。2 行目のモード 35・36 と揚陸の行・右上の揚陸の時計・端の「輸送」「雷撃」の印・▼（S6）が読む
 */
export interface LandingTelemetry {
  enabled: boolean;
  /** 出撃のときに 1 回: 揚陸の秒・沈むまでの本数・1 斉射の本数・米PT の隻数・今夜の来る方角（「北と東」）・慌てる距離 m（0 は慌てた斉射なし） */
  unloadS: number; hitsToSink: number; salvoCount: number; total: number; fromDirsJa: string; hurriedM: number;
  /** 揚陸（LandingState の写し）: LD_*・決着・割合 0〜1（沈んだら沈んだときの割合）・揚陸の残りの実秒（stepTimeS の時計。揚陸中だけ。決着の後は 0）・被雷・不発の命中・揚陸の後に沈んだ・沈み始めた */
  phase: number; resolved: boolean; pct: number; leftS: number; hits: number; duds: number; sunkAfterDone: boolean; sinking: boolean;
  /** 米PT: まだ撃てる隻数（斉射が残り・結末なし・去っていない）、撃った斉射の数と本数 */
  armed: number; salvos: number; fired: number;
  /** 見張りの報告（landingReport）: LANDING_REPORT_*・その PT（−1 は無し）・輸送船からの 100 m 刻み・輸送船から PT への 8 方位、自艇からその PT へ（m。無ければ NaN）・見えている（視程の内） */
  reportSub: number; reportI: number; reportStep: number; reportDirIdx: number; reportDx: number; reportDy: number; reportSighted: boolean;
  /** 走っている敵の雷跡（landingWakes。輸送船へ近づくものだけ）: 本数・輸送船への最接近までの最短の体感秒（無ければ NaN） */
  wakes: number; wakeCpaS: number;
  /** 輸送船が射線に入る（landingFireLine。R14 A1）: その PT（−1 は無し）、自艇からその PT への 8 方位（北 0）と 100 m 刻みの切り上げ（63 まで。PT が無ければ 0） */
  fireLineI: number; fireLineDirIdx: number; fireLineStep: number;
  /** 自艇から輸送船へ（m）とその距離 m（平方根は 1 フレーム 1 回。「輸送 N m」） */
  shipDx: number; shipDy: number; shipDistM: number;
  /** 出来事（LandingState の写し: 通し番号・LE_*・PT・斉射の m・本数・隻数・そのときの被雷・割合）と、その PT の輸送船からの 8 方位（通し番号が変わったフレームに 1 回。PT の無い出来事は 0） */
  eventSeq: number; eventKind: number; eventBoat: number; eventM: number; eventCount: number; eventBoats: number; eventHits: number; eventPct: number; eventDirIdx: number;
}

export function createLandingTelemetry(): LandingTelemetry {
  return {
    enabled: false, unloadS: 0, hitsToSink: 0, salvoCount: 0, total: 0, fromDirsJa: '', hurriedM: 0,
    phase: LD_UNLOADING, resolved: false, pct: 0, leftS: 0, hits: 0, duds: 0, sunkAfterDone: false, sinking: false, armed: 0, salvos: 0, fired: 0,
    reportSub: LANDING_REPORT_NONE, reportI: -1, reportStep: 0, reportDirIdx: 0, reportDx: NaN, reportDy: NaN, reportSighted: false, wakes: 0, wakeCpaS: NaN,
    fireLineI: -1, fireLineDirIdx: 0, fireLineStep: 0,
    shipDx: NaN, shipDy: NaN, shipDistM: NaN, eventSeq: 0, eventKind: LE_NONE, eventBoat: -1, eventM: NaN, eventCount: 0, eventBoats: 0, eventHits: 0, eventPct: 0, eventDirIdx: 0,
  };
}

/** 輸送船から (x, y) への 8 方位の添字（北 0・時計回り。landingReport の dirIdx と同じ式: (x, y) から輸送船への方位の逆） */
export function landingDirIdx(st: { readonly x: number; readonly y: number }, x: number, y: number): number {
  return Math.round(wrapDeg360(bearingDeg(x, y, st.x, st.y) + 180) / 45) % 8;
}

export function createLandingReport(): LandingReport {
  return { sub: LANDING_REPORT_NONE, i: -1, distStep: 0, dirIdx: 0 };
}

export function createLandingWakes(): LandingWakes {
  return { count: 0, cpaS: NaN };
}

/** 出撃の組み立てで 1 回: 泊地に停泊して揚陸を始める（船体の当たりの円は記録 × ship_hit_scale で 1 回だけ埋める） */
export function createLanding(p: LandingParams): LandingState {
  const circles = createCircles(p.circles);
  fillHullCircles(circles, p.x, p.y, p.headingDeg, p.hitLenM, p.hitBeamM);
  return {
    phase: LD_UNLOADING, pct: 0, pctAtSink: NaN, hits: 0, duds: 0, sunkAfterDone: false, doneAtS: NaN,
    circles, state: { x: p.x, y: p.y }, out: false, sinking: false, sunk: false, sinkStartS: NaN,
    x: p.x, y: p.y, afloat: true,
    eventSeq: 0, eventKind: LE_NONE, eventBoat: -1, eventM: NaN, eventCount: 0, eventBoats: 0, eventHits: 0, eventPct: 0,
  };
}

/** 出来事を記す（HUD は通し番号が増えたら出す）。m は斉射の距離（他は NaN）、count は本数（他は 0）、boats は斉射の隻数（足した斉射は 2 以上。斉射でない出来事は 0） */
export function landingEvent(st: LandingState, kind: number, boat: number, m: number, count: number, boats = 0): void {
  st.eventKind = kind;
  st.eventBoat = boat;
  st.eventM = m;
  st.eventCount = count;
  st.eventBoats = boats;
  st.eventHits = st.hits;
  st.eventPct = st.phase === LD_SUNK ? st.pctAtSink : st.pct;
  st.eventSeq++;
}

/** 固定ステップの最後（spec §4.1）: 揚陸を進める。nowS は出撃からの実秒（世界の stepTimeS。命中スローで遅れない）。このステップに揚陸完了になれば true */
export function tickLanding(st: LandingState, p: LandingParams, nowS: number): boolean {
  if (st.phase !== LD_UNLOADING || st.sinking) return false;
  st.pct = Math.min(1, nowS / p.unloadS);
  if (st.pct < 1) return false;
  st.phase = LD_DONE;
  st.doneAtS = nowS;
  landingEvent(st, LE_DONE, -1, NaN, 0);
  return true;
}

/** 不発でない魚雷 1 本の命中（core/landing-torpedoes の LandingTorpedoLink が呼ぶ）。hitsToSink に達したら沈み始める（LANDING_SUNK）、それまでは LANDING_HIT。沈み始めた後は何も変えない */
export function hitLanding(st: LandingState, p: LandingParams, nowS: number): number {
  if (st.sinking) return LANDING_SUNK;
  st.hits++;
  if (st.hits < p.hitsToSink) return LANDING_HIT;
  st.sinking = true;
  st.out = true;
  st.sunk = true;
  st.afloat = false;
  st.sinkStartS = nowS;
  if (st.phase === LD_DONE) st.sunkAfterDone = true;
  else {
    st.phase = LD_SUNK;
    st.pctAtSink = st.pct;
  }
  return LANDING_SUNK;
}

/** 決着した（揚陸完了か、揚陸の前に沈んだ） */
export function landingResolved(st: LandingState): boolean {
  return st.phase !== LD_UNLOADING;
}

/**
 * 見張りの報告（HUD の「米PT 雷撃に来る！」・模擬の方針）: 決着していなければ、哨戒中で斉射が残り（left[i] 1）、輸送船から lookout_m の内で輸送船へ向かう
 * （艇首と輸送船への方位の差 ≤ LANDING_REPORT_TOWARD_DEG）PT のうち最も近い 1 隻。遠い・近いは慌てる距離（hurried2。0 なら慌てた斉射なしでいつも遠い）。報告が無ければ sub 0・i −1
 */
export function landingReport(st: LandingState, p: LandingParams, q: PtSection, tst: { readonly left: Uint8Array }, out: LandingReport): void {
  out.sub = LANDING_REPORT_NONE;
  out.i = -1;
  out.distStep = 0;
  out.dirIdx = 0;
  if (landingResolved(st)) return;
  let best2 = Infinity;
  let bestBrg = 0;
  for (let i = 0; i < q.boats.length; i++) {
    const b = q.boats[i]!;
    if (b.phase !== PT_PATROL || tst.left[i] !== 1) continue;
    const dx = st.x - b.x;
    const dy = st.y - b.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > p.lookout2 || d2 >= best2) continue;
    const brg = bearingDeg(b.x, b.y, st.x, st.y);
    if (Math.abs(wrapDeg180(b.headingDeg - brg)) > LANDING_REPORT_TOWARD_DEG) continue;
    best2 = d2;
    bestBrg = brg;
    out.i = i;
  }
  if (out.i < 0) return;
  out.sub = p.hurried2 > 0 && best2 <= p.hurried2 ? LANDING_REPORT_NEAR : LANDING_REPORT_FAR;
  out.distStep = Math.ceil(Math.sqrt(best2) / LANDING_DIST_STEP_M);
  out.dirIdx = Math.round(wrapDeg360(bestBrg + 180) / 45) % 8; // 輸送船から PT（PT から輸送船の逆）
}

/**
 * 走っている雷跡（HUD の「雷跡 N 本が輸送船へ ・ あと N 秒」・輸送船の「雷跡！ N 秒」）: まだ決着していない敵の魚雷のうち輸送船の中心へ近づくもの（今の針路と中心への向きの内積が正。
 * 最接近を過ぎて外れと決まる前の魚雷・真横へ走る魚雷は数えない＝R14 A7）の本数と、輸送船の中心への最接近までの最短の体感秒（今の針路のまま。正）。speedMps は魚雷の速さ
 * （TorpedoParams。game 秒あたり）、timeScale で体感秒あたりにする。平方根なし（近づく速さの符号は内積だけで見る）
 */
export function landingWakes(states: readonly TorpedoState[], speedMps: number, timeScale: number, st: LandingState, out: LandingWakes): void {
  out.count = 0;
  out.cpaS = NaN;
  const v = speedMps * timeScale;
  for (let k = 0; k < states.length; k++) {
    const s = states[k]!;
    if (!s.active || s.resolved) continue;
    const h = degToRad(s.headingDeg);
    const close = (st.x - s.x) * Math.sin(h) - (st.y - s.y) * Math.cos(h); // 中心への向き・今の針路の内積（m。正なら近づいている）
    if (!(close > 0)) continue;
    out.count++;
    const t = v > 0 ? close / v : 0;
    if (!(t >= out.cpaS)) out.cpaS = t;
  }
}

/**
 * 輸送船が射線に入る（R14 A1。HUD の「輸送船が射線に入る！ 離れて戦え」・模擬の lure_cue）: 揚陸中（決着の前）に、自艇と戦っている PT（警戒・突撃・追撃・離脱＝core/pt-torpedo の
 * 戦いながらの斉射の段階）で斉射が残り（left[i] 1）結末の無いものが、輸送船から range2（戦いながらの斉射の距離 + LANDING_FIRE_LINE_EXTRA_M の二乗。0 以下なら無し）の内で、
 * 艇首と輸送船への方位の差が LANDING_FIRE_LINE_DEG 以下。そのうち輸送船に最も近い PT の添字（無ければ −1）。atan2 は距離の内の PT だけ
 */
export function landingFireLine(st: LandingState, q: PtSection, left: Uint8Array, range2: number): number {
  if (st.phase !== LD_UNLOADING || !(range2 > 0)) return -1;
  let best = -1;
  let best2 = Infinity;
  for (let i = 0; i < q.boats.length; i++) {
    const b = q.boats[i]!;
    const ph = b.phase;
    if (left[i] !== 1 || b.fate !== PT_FATE_NONE || !(ph === PT_ALERT || ph === PT_RUN_IN || ph === PT_CHASE || ph === PT_BREAK)) continue;
    const dx = st.x - b.x;
    const dy = st.y - b.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > range2 || d2 >= best2) continue;
    if (Math.abs(wrapDeg180(b.headingDeg - bearingDeg(b.x, b.y, st.x, st.y))) > LANDING_FIRE_LINE_DEG) continue;
    best2 = d2;
    best = i;
  }
  return best;
}
