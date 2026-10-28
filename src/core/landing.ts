// 停泊して揚陸する味方の輸送船（v0.6.9。jp_04「多号作戦・オルモック湾へ」。docs/02 §6.11、spec-v069 §4.4・R8/F14・F16）: 揚陸の時計・米PT の魚雷の命中と沈没・
// 見張りの報告（雷撃に来る PT）・走っている雷跡の数と最接近までの秒・HUD と Result の出来事（2 行目のモード 35 の材料）。
// 揚陸は出撃からの体感秒で進み（pct = min(1, nowS / unload_s)）、命中しても沈むまで続き、沈めば止まる。夜明けは入力に無い＝夜明けが先に来ても数え続ける（F14）。
// 決着 = 揚陸完了か沈没。完了の後も泊地に残り、沈みうる（目的には響かない＝sunkAfterDone）。
// LandingState は魚雷の目標（core/torpedo-targets の TorpedoTarget）と雷撃の船（core/pt-torpedo の PtTorpedoShip）をそのまま満たす（船体の円は 1 回だけ埋める。動かない）。
// Phaser 非依存・毎ステップ確保しない（状態・報告・雷跡の書き先は出撃の組み立てで 1 回）。距離は二乗、平方根は報告の距離の 1 回、atan2 は報告の候補（見張りの内の哨戒の PT）だけ。
import type { LandingParams } from './landing-data';
import { PT_PATROL, type PtSection } from './pt-boats';
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
 * 揚陸の前に沈んだ・揚陸完了・揚陸の後に沈んだ。不発の文は eventHits（そのときの被雷の数）で分ける（F16: 被雷の後なら「不発！ 被雷 1 のまま」）
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

/** 見張りの報告（landingReport の sub）: 無し・遠い（慌てる距離の外か慌てた斉射なし）・近い（慌てる距離の内） */
export const LANDING_REPORT_NONE = 0;
export const LANDING_REPORT_FAR = 1;
export const LANDING_REPORT_NEAR = 2;
/** 報告するのは輸送船へ向かう PT だけ（艇首と輸送船への方位の差がこれ deg 以下。spec §3.5。core は config を読まないのでここに置く） */
export const LANDING_REPORT_TOWARD_DEG = 90;
/** 報告の距離の刻み m（HUD の「1800 m」・鍵の 100 m 刻み。spec §3.5） */
export const LANDING_DIST_STEP_M = 100;

export interface LandingState {
  /** LD_* と揚陸の割合（0〜1）・揚陸の前に沈んだときの割合（NaN は沈んでいない）・被雷（不発は数えない）・不発の命中・揚陸の後に沈んだ・揚陸完了の時計（NaN は未完了） */
  phase: number; pct: number; pctAtSink: number; hits: number; duds: number; sunkAfterDone: boolean; doneAtS: number;
  /** 魚雷の目標（TorpedoTarget）: 船体の円・中心・もう狙えない（沈み始めた）・沈んでいる（core では沈み始め＝沈没。絵の沈む演出は世界の AllyShip）・沈み始めた時計 */
  readonly circles: Circle[]; readonly state: { readonly x: number; readonly y: number }; out: boolean; sinking: boolean; sunk: boolean; sinkStartS: number;
  /** 雷撃の船（PtTorpedoShip）: 中心（泊地。動かない）と浮いているか */
  readonly x: number; readonly y: number; afloat: boolean;
  /** 出来事: 通し番号・種類（LE_*）・撃った PT（−1 は無し）・斉射の距離 m（斉射だけ。他は NaN）と本数・そのときの被雷の数・揚陸の割合（沈んだなら沈んだときの割合） */
  eventSeq: number; eventKind: number; eventBoat: number; eventM: number; eventCount: number; eventHits: number; eventPct: number;
}

/** 見張りの報告の書き先（landingReport。1 個だけ持って中身を書く） */
export interface LandingReport {
  /** LANDING_REPORT_*・その PT（−1 は無し）・輸送船からの距離の 100 m 刻みの切り上げ・輸送船から PT への 8 方位の添字（北 0・時計回り） */
  sub: number; i: number; distStep: number; dirIdx: number;
}

/** 走っている雷跡（landingWakes。1 個だけ持って中身を書く）: まだ決着していない敵の魚雷の本数と、輸送船の中心への最接近までの最短の体感秒（無ければ NaN） */
export interface LandingWakes {
  count: number;
  cpaS: number;
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
    eventSeq: 0, eventKind: LE_NONE, eventBoat: -1, eventM: NaN, eventCount: 0, eventHits: 0, eventPct: 0,
  };
}

/** 出来事を記す（HUD は通し番号が増えたら出す）。m は斉射の距離（他は NaN）、count は本数（他は 0） */
export function landingEvent(st: LandingState, kind: number, boat: number, m: number, count: number): void {
  st.eventKind = kind;
  st.eventBoat = boat;
  st.eventM = m;
  st.eventCount = count;
  st.eventHits = st.hits;
  st.eventPct = st.phase === LD_SUNK ? st.pctAtSink : st.pct;
  st.eventSeq++;
}

/** 固定ステップの最後（spec §4.1）: 揚陸を進める。nowS は出撃からの体感秒（世界の stepTimeS）。このステップに揚陸完了になれば true */
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
 * 走っている雷跡（HUD の「雷跡 N 本が輸送船へ ・ あと N 秒」・輸送船の「雷跡！ N 秒」）: まだ決着していない敵の魚雷の本数と、輸送船の中心への最接近までの最短の体感秒
 * （今の針路のまま。遠ざかる魚雷は 0）。speedMps は魚雷の速さ（TorpedoParams。game 秒あたり）、timeScale で体感秒あたりにする。平方根なし
 */
export function landingWakes(states: readonly TorpedoState[], speedMps: number, timeScale: number, st: LandingState, out: LandingWakes): void {
  out.count = 0;
  out.cpaS = NaN;
  const v = speedMps * timeScale;
  const v2 = v * v;
  for (let k = 0; k < states.length; k++) {
    const s = states[k]!;
    if (!s.active || s.resolved) continue;
    out.count++;
    const h = degToRad(s.headingDeg);
    const t = v2 > 0 ? Math.max(0, ((st.x - s.x) * Math.sin(h) * v - (st.y - s.y) * Math.cos(h) * v) / v2) : 0;
    if (!(t >= out.cpaS)) out.cpaS = t;
  }
}
