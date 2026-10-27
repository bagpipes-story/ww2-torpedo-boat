// 上中央の 2 行目の空の行（v0.6.7 S0 で ui/mission-line.ts から移した。式と文は v0.6.6 のまま。tests/air-lines-neutral が字・色・キーを pin）: 敵の水上機（モード 9〜11。文は ui/hud-lines の seaplaneLine）と
// 夜明けの空襲（20・21。文とキーは ui/dawn-lines）のモード・キー・文の呼び出し。Phaser も DOM を読む config も使わない。
import { PLANE_DISTANCE_STEP_M } from '../config/hud-text-config';
import type { BoatTelemetry } from '../core/boat-motion';
import { SP_APPROACH } from '../core/seaplane';
import { strikeKey, strikeLine } from './dawn-lines';
import { seaplaneLine, type HudLine } from './hud-lines';
import { MISSION_PLANE, MISSION_PLANE_ATTACK, MISSION_PLANE_RESULT, MISSION_STRIKE, MISSION_STRIKE_REST } from './mission-mode';

/** 水上機の 3 つのモード（攻撃・未確定の接近・結果）と、夜明けの空襲の 2 つ（落下中・爆撃進路・接近・旋回と、波の合間） */
export const planeModeOf = (mode: number): boolean => mode === MISSION_PLANE_ATTACK || mode === MISSION_PLANE || mode === MISSION_PLANE_RESULT;
export const strikeModeOf = (mode: number): boolean => mode === MISSION_STRIKE || mode === MISSION_STRIKE_REST;
/** 敵機までの距離は接近中だけ 100 m 刻み（切り上げ） */
const planeStepOf = (t: BoatTelemetry): number => (t.planePhase === SP_APPROACH ? Math.ceil(t.planeDistM / PLANE_DISTANCE_STEP_M) : 0);

/** 水上機の 2 行目のキー（段階・確定・航跡・照明弾・爆弾・結果・撃沈・距離の刻みを 1 つの数に詰める）。水上機のモードでなければ 0 */
export function planeKeyOf(t: BoatTelemetry, planeMode: boolean): number {
  if (!planeMode) return 0;
  return t.planePhase | (t.planeLocked ? 8 : 0) | (t.planeWake ? 16 : 0) | (t.planeFlareOn ? 32 : 0) | (t.planeBombAir ? 64 : 0) | (t.planeBombsDropped << 7) | (t.planeOutcome << 9) | (t.destroyerSunk ? 2048 : 0) | (t.planeBombsHit << 12) | (planeStepOf(t) << 14);
}
/** 空襲の行のキー（ui/dawn-lines の strikeKey）。空襲のモードでなければ 0 */
export const strikeKeyOf = (t: BoatTelemetry, strikeMode: boolean): number => (strikeMode ? strikeKey(t) : 0);

/** 空の行の文（どちらかのモードのときだけ）: 空襲は僚艇の HP と被弾も行の中で出す（v0.6.1 レビュー: 空襲の行が被弾の行より上なので。変わったときは mission-line の escortKey が組み直させる） */
export function airLine(t: BoatTelemetry, strikeMode: boolean, shallowStep: number, stormWarn: boolean, escortHit: boolean, landedShow: boolean): HudLine {
  return strikeMode ? strikeLine(t, shallowStep, stormWarn, escortHit, landedShow) : seaplaneLine(t, planeStepOf(t), shallowStep, stormWarn);
}
