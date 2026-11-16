// 止まった艦（v0.8.1 S1。us_06「オルモック湾の決着」のパロンポン沖の卯月と空知丸、ハードの駆潜艇。spec-v0810 §3.2 D-S3〜D-S7）の純粋な規則。隊の艦ごとの段:
// ASLEEP（止まって気づいていない）→ ALERT（気づいた・まだ止まっている）→ UNDERWAY（動き出した＝以後は us_02 の AI のまま）。気づく理由（同じステップなら番号の先が勝つ）:
//   ① SEEN 見た（ai.playerDetected）② WAKE 雷跡（ai.wakeSpotted）③ HIT 被雷（hitsTaken > 0＝不発は数えない・沈み始めた艦も）
//   ④ ALARM 警報（隊のどれかが ①〜③ で気づいてから alarmS）⑤ DAWN 夜明け（ラッチ）。
// 動き出す: 気づいてから underwayS。夜明けは遅れなし（止まっている艦のうち underwayS が null でない艦はみなそのステップに動き出す）。null の艦（動かない輸送船＝空知丸）は
// 一晩じゅう動かない。沈み始めた艦は警報を上げるが自分はもう動き出さない。時計は体感の時計（命中スロー込みの実秒 feelDt の和）＝AI の反応遅れ（core/ship-ai）と同じ。
// S2 の systems/destroyer-anchor との約束: 計画は config/anchor-mission-data の AnchorSetup（WorldSetup.anchors。隊の並び＝駆逐艦 → 輸送船 → 駆潜艇）が形で満たす AnchorPlan、
// 艦の読み口 AnchorShipView は entities/destroyer の Destroyer が形で満たす（ai＝core/ship-ai の ShipAiState の playerDetected・wakeSpotted、hitsTaken、sinking）。
// 状態は createAnchorState(n)（n＝plan.underwayS.length）で 1 回作り、夜ごとに resetAnchorState。固定ステップでは艦を動かした後に stepAnchors を 1 回（AI の見張りは止まっていても
// 毎ステップ走る＝D-S3。この規則は AI の出力を読むだけ）。戻り値はこのステップに動き出した艦のビット（bit i＝艦 i。0 は無し）、気づいた艦のビットは st.noticed。
// Phaser 非依存・乱数なし。作る（createAnchorState）だけが確保し、ほかは確保しない（固定長の型付き配列。tests/anchored-ship が走査）。

/** 段 */
export const ANCHOR_ASLEEP = 0;
export const ANCHOR_ALERT = 1;
export const ANCHOR_UNDERWAY = 2;
/** 気づいた理由（NONE はまだ。数の小さい方が同じステップの勝ち） */
export const ANCHOR_REASON_NONE = 0;
export const ANCHOR_REASON_SEEN = 1;
export const ANCHOR_REASON_WAKE = 2;
export const ANCHOR_REASON_HIT = 3;
export const ANCHOR_REASON_ALARM = 4;
export const ANCHOR_REASON_DAWN = 5;
/** 隊の艦の上限（ビットの印と固定長の配列の枠。us_06 はノーマル 2・ハード 4） */
export const ANCHOR_MAX_SHIPS = 8;
/** 時計の比べの許し（固定ステップの 1/60 秒の和の丸め。core/ship-transit と同じ） */
const ANCHOR_TIME_EPS_S = 1e-6;

/** 計画（config/anchor-mission-data の AnchorSetup が形で満たす）: 艦ごとの気づいてから動き出すまでの体感の秒（null は動かない）と警報の秒 */
export interface AnchorPlan {
  readonly underwayS: readonly (number | null)[];
  readonly alarmS: number;
}

/** 艦の読み口（entities/destroyer の Destroyer がそのまま満たす。読むだけ） */
export interface AnchorShipView {
  readonly ai: { readonly playerDetected: boolean; readonly wakeSpotted: boolean };
  readonly hitsTaken: number;
  readonly sinking: boolean;
}

export interface AnchorState {
  readonly n: number;
  /** 艦ごとの段（ANCHOR_ASLEEP など）と気づいた理由（ANCHOR_REASON_*）。長さ n */
  readonly stage: Uint8Array;
  readonly reason: Uint8Array;
  /** 艦ごとの気づいた・動き出した体感の時計の秒（NaN は未だ）。長さ n */
  readonly noticedAtS: Float64Array;
  readonly underwayAtS: Float64Array;
  /** 体感の時計（feelDt の和）・夜明けを過ぎたか（ラッチ）・警報が上がった体感の秒（隊の最初の ①〜③。NaN は未だ） */
  feelS: number;
  dawn: boolean;
  alarmAtS: number;
  /** このステップに気づいた・動き出した艦（bit i＝艦 i） */
  noticed: number;
  underway: number;
}

/** 起動時に 1 回（艦の数 n は 1〜ANCHOR_MAX_SHIPS の整数）。中身は resetAnchorState と同じ（みな ASLEEP） */
export function createAnchorState(n: number): AnchorState {
  if (!(Number.isInteger(n) && n >= 1 && n <= ANCHOR_MAX_SHIPS)) throw new Error(`止まった艦の数（${n}）は 1〜${ANCHOR_MAX_SHIPS}（core/anchored-ship）`);
  const st: AnchorState = { n, stage: new Uint8Array(n), reason: new Uint8Array(n), noticedAtS: new Float64Array(n), underwayAtS: new Float64Array(n), feelS: 0, dawn: false, alarmAtS: NaN, noticed: 0, underway: 0 };
  resetAnchorState(st);
  return st;
}

/** 夜の初めに戻す（みな ASLEEP・時計 0・夜明けと警報なし）。確保しない */
export function resetAnchorState(st: AnchorState): void {
  for (let i = 0; i < st.n; i++) {
    st.stage[i] = ANCHOR_ASLEEP;
    st.reason[i] = ANCHOR_REASON_NONE;
    st.noticedAtS[i] = NaN;
    st.underwayAtS[i] = NaN;
  }
  st.feelS = 0;
  st.dawn = false;
  st.alarmAtS = NaN;
  st.noticed = 0;
  st.underway = 0;
}

function notice(st: AnchorState, i: number, reason: number): void {
  st.stage[i] = ANCHOR_ALERT;
  st.reason[i] = reason;
  st.noticedAtS[i] = st.feelS;
  st.noticed |= 1 << i;
}

/**
 * 1 固定ステップ（世界は艦を動かした後に呼ぶ）。feelDtS は命中スロー込みの実秒、dawn は世界の夜明けのラッチ（一度立てば消えない）。ships は隊の艦（0〜n − 1）。
 * ①〜③ → ④ → ⑤ の順に止まっている艦を気づかせ、気づいて underwayS が経った（夜明けなら今すぐ）艦を動かす。戻り値はこのステップに動き出した艦のビット
 */
export function stepAnchors(st: AnchorState, plan: AnchorPlan, ships: readonly AnchorShipView[], feelDtS: number, dawn: boolean): number {
  st.noticed = 0;
  st.underway = 0;
  st.feelS += feelDtS;
  if (dawn) st.dawn = true;
  const now = st.feelS;
  // ①〜③ 自分で気づく（見た・雷跡・被雷か沈み始めた）。隊の最初の 1 隻が警報を上げる
  for (let i = 0; i < st.n; i++) {
    if (st.stage[i] !== ANCHOR_ASLEEP) continue;
    const v = ships[i]!;
    const r = v.ai.playerDetected ? ANCHOR_REASON_SEEN : v.ai.wakeSpotted ? ANCHOR_REASON_WAKE : v.hitsTaken > 0 || v.sinking ? ANCHOR_REASON_HIT : ANCHOR_REASON_NONE;
    if (r === ANCHOR_REASON_NONE) continue;
    notice(st, i, r);
    if (Number.isNaN(st.alarmAtS)) st.alarmAtS = now;
  }
  // ④ 警報（警報から alarmS 経った）→ ⑤ 夜明け
  const alarmed = !Number.isNaN(st.alarmAtS) && now >= st.alarmAtS + plan.alarmS - ANCHOR_TIME_EPS_S;
  if (alarmed || st.dawn) {
    for (let i = 0; i < st.n; i++) if (st.stage[i] === ANCHOR_ASLEEP) notice(st, i, alarmed ? ANCHOR_REASON_ALARM : ANCHOR_REASON_DAWN);
  }
  // 動き出す（沈み始めた艦と動かない艦は動かない）
  for (let i = 0; i < st.n; i++) {
    if (st.stage[i] !== ANCHOR_ALERT || ships[i]!.sinking) continue;
    const u = plan.underwayS[i];
    if (u === null || u === undefined) continue;
    if (!st.dawn && now < st.noticedAtS[i]! + u - ANCHOR_TIME_EPS_S) continue;
    st.stage[i] = ANCHOR_UNDERWAY;
    st.underwayAtS[i] = now;
    st.underway |= 1 << i;
  }
  return st.underway;
}

/** 艦 i の段（ANCHOR_ASLEEP・ALERT・UNDERWAY） */
export function anchorStage(st: AnchorState, i: number): number {
  return st.stage[i]!;
}

/** 艦 i の気づいた理由（ANCHOR_REASON_*。まだなら NONE） */
export function anchorReason(st: AnchorState, i: number): number {
  return st.reason[i]!;
}

/** 艦 i が気づいた体感の時計の秒（まだなら NaN） */
export function anchorNoticedAtS(st: AnchorState, i: number): number {
  return st.noticedAtS[i]!;
}

/** 艦 i が動き出した体感の時計の秒（まだか動かない艦なら NaN） */
export function anchorUnderwayAtS(st: AnchorState, i: number): number {
  return st.underwayAtS[i]!;
}

/** 艦 i が止まっている（ASLEEP か ALERT＝世界は舵と速さを使わない） */
export function anchorHeld(st: AnchorState, i: number): boolean {
  return st.stage[i] !== ANCHOR_UNDERWAY;
}
