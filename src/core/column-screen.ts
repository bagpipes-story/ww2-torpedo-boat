// 列の見張り（v0.8.2 S1。us_05「スリガオ海峡・最初の接触」の時雨、ハードは見張りの駆逐艦も。spec-v0820 §4.2 D-C7・§9 の 2）の純粋な規則。役 screen の艦ごとに列にいる ⇄ 離れている:
// 海域の中で自艇を見つけた（ai.playerDetected）ステップに離れ、離れている間に見失って（playerDetected が偽）から体感の時計（命中スロー込みの実秒 feelDt の和）で rejoinS 経ったステップに戻る。
// 離れている間にまた見つければ見失った時計は戻る。戻った艦はまた見つければまた離れる（回数を数える）。沈み始めた艦（sinking）は離れも戻りもしない。海域の外（onMapMask のビットが 0＝
// まだ来ない・去った）の艦は読まない。夜明け（世界のラッチ）の後は誰も離れず、離れていた艦はそのステップに戻った扱い（S2 は隊の withdraw に全艦を渡す）。S2 の systems/column-roles との約束:
// 計画は screenPlanOf（S0 の ColumnPlan の kits と rejoinS か setup の transit.column と rejoinS）・艦の読み口は Destroyer が形で満たす。状態は createScreenState(n) で 1 回・夜ごとに resetScreenState。
// 列の段階（destroyer-transit）の直後に stepScreens を 1 回。離れた・戻った艦は st.left・st.rejoined のビット（core/ship-transit の作法。bit i＝列の i 隻目＝隊の i 隻目）。AI を替えるのは S2
// （setAiParams・startRetire）。秒は体感の時計（世界の秒は S2 がビットの立ったステップの stepTimeS を刻む）。乱数なし・作る 2 つのほかは確保しない。
// v0.8.2 S3b（lead の L37。見張りの鎖）: 計画に chaseS があれば、離れてから体感の chaseS 秒たった艦はまだ自艇を見ていても戻る（史実の時雨は短く離れて列は針路を守った）。
// cooldownS があれば、戻った艦は戻ってから体感の cooldownS 秒は離れない。どちらも無い計画（transit の screen_chase_s・screen_cooldown_s の無い列）は S1 の規則のまま。夜明けは今のまま先に効く。
import { TRANSIT_MAX_SHIPS } from './transit-data';
const SCREEN_TIME_EPS_S = 1e-6; // 時計の比べの許し（固定ステップの 1/60 秒の和の丸め。core/ship-transit と同じ）

/** 計画（見張りの艦のビット＝bit i は列の i 隻目の role が screen・見失ってから戻る体感の秒＝transit.rejoin_s・任意の鎖＝離れていられる体感の秒 screen_chase_s と
 *  戻ってから離れない体感の秒 screen_cooldown_s。S3b）と艦の読み口（entities/destroyer の Destroyer がそのまま満たす。読むだけ） */
export interface ScreenPlan { readonly mask: number; readonly rejoinS: number; readonly chaseS?: number; readonly cooldownS?: number }
export interface ScreenShipView { readonly ai: { readonly playerDetected: boolean }; readonly sinking: boolean }

export interface ScreenState {
  readonly n: number;
  /** 艦ごと（長さ n）: 離れている（1）・離れた回数・最後に離れた／戻った体感の秒（NaN は未だ）・離れている間に見失った体感の秒（NaN は見ているか列にいる） */
  readonly away: Uint8Array; readonly leaves: Uint16Array; readonly leftAtS: Float64Array; readonly rejoinedAtS: Float64Array; readonly lostAtS: Float64Array;
  /** 体感の時計・夜明けを過ぎたか（ラッチ）・このステップに離れた・戻った艦（bit i＝艦 i） */
  feelS: number; dawn: boolean; left: number; rejoined: number;
}

/** 起動時に 1 回: 役の配列（kits か transit.column）と rejoinS（と任意の鎖 chaseS・cooldownS＝無ければ鍵ごと出ない）から。見張りのいない列は null。見張りがいて rejoinS が無ければ例外（V-C4 が先に止める） */
export function screenPlanOf(kits: readonly { readonly role: string }[], rejoinS: number | null | undefined, chaseS?: number | null, cooldownS?: number | null): ScreenPlan | null {
  let mask = 0;
  kits.forEach((k, i) => { if (k.role === 'screen') mask |= 1 << i; });
  if (mask === 0) return null;
  if (typeof rejoinS !== 'number') throw new Error('見張り（role screen）のいる列は rejoinS が要る（core/column-screen・V-C4）');
  return { mask, rejoinS, ...(typeof chaseS === 'number' ? { chaseS } : {}), ...(typeof cooldownS === 'number' ? { cooldownS } : {}) };
}

/** 起動時に 1 回（艦の数 n は 1〜TRANSIT_MAX_SHIPS の整数）。中身は resetScreenState の後と同じ（みな列にいる） */
export function createScreenState(n: number): ScreenState {
  if (!(Number.isInteger(n) && n >= 1 && n <= TRANSIT_MAX_SHIPS)) throw new Error(`列の艦の数（${n}）は 1〜${TRANSIT_MAX_SHIPS}（core/column-screen）`);
  const nan = (): Float64Array => new Float64Array(n).fill(NaN);
  return { n, away: new Uint8Array(n), leaves: new Uint16Array(n), leftAtS: nan(), rejoinedAtS: nan(), lostAtS: nan(), feelS: 0, dawn: false, left: 0, rejoined: 0 };
}

/** 夜の初めに戻す（みな列にいる・回数 0・時計 0・夜明けなし）。確保しない */
export function resetScreenState(st: ScreenState): void {
  for (let i = 0; i < st.n; i++) {
    st.away[i] = st.leaves[i] = 0;
    st.leftAtS[i] = st.rejoinedAtS[i] = st.lostAtS[i] = NaN;
  }
  st.feelS = st.left = st.rejoined = 0;
  st.dawn = false;
}

/** 1 固定ステップ。ships は列の艦（0〜n − 1）、onMapMask は海域の中の艦のビット（core/ship-transit の transitOnMap）、feelDtS は命中スロー込みの実秒、dawn は世界の夜明けのラッチ */
export function stepScreens(st: ScreenState, plan: ScreenPlan, ships: readonly ScreenShipView[], onMapMask: number, feelDtS: number, dawn: boolean): void {
  st.left = st.rejoined = 0;
  st.feelS += feelDtS;
  if (dawn) st.dawn = true;
  for (let i = 0; i < st.n; i++) {
    const bit = 1 << i;
    if ((plan.mask & onMapMask & bit) === 0 || ships[i]!.sinking) continue;
    const seen = ships[i]!.ai.playerDetected;
    if (st.away[i] === 0) {
      if (st.dawn || !seen) continue;
      if (plan.cooldownS !== undefined && st.feelS < st.rejoinedAtS[i]! + plan.cooldownS - SCREEN_TIME_EPS_S) continue; // 戻ってから cooldownS の間は離れない（未だ戻っていなければ NaN＝離れる）
      st.away[i] = 1;
      st.leaves[i]!++;
      st.leftAtS[i] = st.feelS;
      st.lostAtS[i] = NaN;
      st.left |= bit;
    } else {
      const leash = plan.chaseS !== undefined && st.feelS >= st.leftAtS[i]! + plan.chaseS - SCREEN_TIME_EPS_S; // 鎖: 離れて chaseS たてば見ていても戻る
      if (seen && !st.dawn && !leash) { st.lostAtS[i] = NaN; continue; } // また見つけた: 見失った時計を戻す
      if (Number.isNaN(st.lostAtS[i]!)) st.lostAtS[i] = st.feelS;
      if (!st.dawn && !leash && st.feelS < st.lostAtS[i]! + plan.rejoinS - SCREEN_TIME_EPS_S) continue;
      st.away[i] = 0;
      st.rejoinedAtS[i] = st.feelS;
      st.rejoined |= bit;
    }
  }
}

/** 艦 i の読み口（S2 のテレメトリ）: 離れているか・離れた回数・最後に離れた／戻った体感の秒（未だは NaN） */
export function screenAway(st: ScreenState, i: number): boolean { return st.away[i] === 1; }
export function screenLeaves(st: ScreenState, i: number): number { return st.leaves[i]!; }
export function screenLeftAtS(st: ScreenState, i: number): number { return st.leftAtS[i]!; }
export function screenRejoinedAtS(st: ScreenState, i: number): number { return st.rejoinedAtS[i]!; }
