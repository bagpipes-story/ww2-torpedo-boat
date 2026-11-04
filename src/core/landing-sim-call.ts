// 夜明け近しの帰投の輪の呼びかけを模擬の台本が聞く（v0.6.10 S3b。jp_04。spec-v0610 R-U9・D8、リードの決定 LD3、レビュー H1・L3）。Phaser 非依存・確保は 1 夜に 1 回だけ。
// 世界は「夜明け近し」（CALL_DAWN）を Scene の refreshReturnState で core/mission-flow の updateReturnCalls（夜明けまでの秒 ≤ 巡航で輪の縁まで帰る秒 dawnCallNeedS × call_margin。
// ラッチ）で立て、揚陸の決着の前は帰投の輪で揚陸を待てと出す（ring_call_before_dawn。文は S6）。模擬は同じ 2 つの関数を固定ステップの終わり（見張りの報告の後）に呼び、
// 次のステップの台本が読む（前のステップの終わりの値＝HUD。報告・射線の警告と同じ）。
// 世界がその行を出す間の近似（H1）: 決着の前で、隊が自艇を捉えていない（接触の行がその上）・見張りの報告が無く輸送船へ走る雷跡も無い（輸送船への脅威の行がその上）。
// 聞くのは卯月がいて ring_call_before_dawn が true の夜の lure の動きの遊び方だけ（on。卯月を切った夜・旗が false・ほかの動きは何もしない＝前のまま。G6・I9）。
// 人（human・human_face）は最初に見えてから delayS（LANDING_HUMAN.delayMinS）秒の後（D8。乱数を引かない）。聞くのは見えている間だけ（接触・報告・雷跡が出ればいつもの台本）。
// 聞く間の台本は core/landing-sim-policy（輪の中心へ巡航、着いたら止まる＝home_early と同じ。赤い線の転舵が先・射撃は前のまま）。
import { CALL_DAWN, dawnCallNeedS, ringEdgeDistM, updateReturnCalls, type ReturnPoint } from './mission-flow';

/** 時刻の比較の丸めの余裕（core/landing-sim と同じ） */
const TIME_EPS_S = 1e-6;

/** 巡航の速さと 1 m の燃料（FuelCurve の 2 つ。世界の Scene と同じ値） */
export interface LandingCallFuel {
  cruiseMps: number;
  galPerMCruise: number;
}

/** 1 夜の呼びかけ（createLandingRingCall で 1 回。stepLandingRingCall が中身を書く） */
export interface LandingRingCall {
  /** 聞く夜（卯月がいて ring_call_before_dawn・動きが lure）。false なら何もしない */
  readonly on: boolean;
  /** 最初に見えてから聞くまでの秒（人は LANDING_HUMAN.delayMinS・ほかは 0） */
  readonly delayS: number;
  /** 世界の呼びかけのビット（updateReturnCalls のラッチ。夜明け近しのほかに燃料少・決着も立つ） */
  flags: number;
  /** 決着の前に夜明け近しが立った秒・そのとき見えなかった（接触・報告・雷跡。H1 の「接触の間に出た」）・最初に見えた秒・最初に聞いた秒（NaN は無し） */
  raisedS: number;
  raisedHidden: boolean;
  shownS: number;
  obeyS: number;
  /** 次のステップの台本が聞く（見えていて、最初に見えてから delayS 経った） */
  obey: boolean;
}

export function createLandingRingCall(on: boolean, delayS: number): LandingRingCall {
  return { on, delayS, flags: 0, raisedS: NaN, raisedHidden: false, shownS: NaN, obeyS: NaN, obey: false };
}

/**
 * 固定ステップの終わり（報告の後）に 1 回: 世界と同じ呼びかけ（t は時計の実秒・x, y は自艇・fuelGal は残りの燃料・resolved は揚陸の決着）と、世界がその行を出すか
 * （決着の前・contact が偽＝隊が捉えていない・reportSub 0＝報告なし・wakes 0＝輸送船へ走る雷跡なし）。on でなければ何もしない
 */
export function stepLandingRingCall(
  c: LandingRingCall, t: number, durationS: number, ring: ReturnPoint, fuel: LandingCallFuel, timeScale: number, x: number, y: number, fuelGal: number,
  resolved: boolean, contact: boolean, reportSub: number, wakes: number,
): void {
  if (!c.on) return;
  const edge = ringEdgeDistM(ring, x, y);
  c.flags = updateReturnCalls(c.flags, resolved, false, fuelGal, edge * fuel.galPerMCruise, Math.max(0, durationS - t), dawnCallNeedS(edge, fuel.cruiseMps, timeScale), ring.callMargin);
  const raised = !resolved && (c.flags & CALL_DAWN) !== 0;
  const shown = raised && !contact && reportSub === 0 && wakes === 0;
  if (raised && Number.isNaN(c.raisedS)) {
    c.raisedS = t;
    c.raisedHidden = !shown;
  }
  if (shown && Number.isNaN(c.shownS)) c.shownS = t;
  c.obey = shown && t >= c.shownS + c.delayS - TIME_EPS_S;
  if (c.obey && Number.isNaN(c.obeyS)) c.obeyS = t;
}
