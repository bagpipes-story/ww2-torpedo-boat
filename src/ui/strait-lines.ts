// 海峡の夜（v0.8.0 S4。us_04）の 2 行目の 2 つのモードの文（spec-v0800 §4.9、brief L26・L28）: レーダーの出来事（MISSION_RADAR_EVENT。文は ui/radar-lines が出来事の時に 1 回組み、
// ui/strait-line-clock が持つ）と衝突の危険（MISSION_BOW_ON。「衝突の危険！ 駆逐艦 400 m ・ 艇首がこちらへ」。距離は目で見えている一番近い危険な艦まで・100 m 刻みの切り上げ）。
// 列が去った後の 3 行目は今の夜明けの文の形「東京急行は西へ去った ・ 狙う艦なし」のまま（brief L30。ui/boat-hud・ui/dawn-lines の shipsGoneStatusJa。ここでは組まない）。
// 「衝突の危険！」は音の警報の合図にしない・曲を下げない（D-R11・§4.10。音の層はこのファイルを import しない＝tests/sfx-rules）。Phaser・DOM を読まない。
import { BOW_ON_STEP_M } from '../config/strait-hud-config';
import { HUD_COLOR_STRONG, HUD_COLOR_WARN } from '../config/hud-text-config';
import type { HudLine } from './hud-lines';
import { MISSION_BOW_ON, MISSION_RADAR_EVENT } from './mission-mode';
import { RADAR_EV_RETURN } from './radar-lines';

/** 衝突の危険の文（step は BOW_ON_STEP_M の刻みの数。1 以上） */
export function bowOnLineJa(step: number): string {
  return `衝突の危険！ 駆逐艦 ${step * BOW_ON_STEP_M} m ・ 艇首がこちらへ`;
}

/** 2 行目の文が読む ui/strait-line-clock の部分（そのクラスがそのまま満たす） */
export interface StraitLineView {
  readonly radarKind: number;
  readonly radarText: string;
  readonly bowStep: number;
}

/** 海峡の 2 つのモードの行（ほかのモードは null）。帰りの列（進路から離れよ）と衝突の危険は警告の色、ほかのレーダーの出来事は強い色 */
export function straitLine(mode: number, c: StraitLineView): HudLine | null {
  if (mode === MISSION_BOW_ON) return { text: bowOnLineJa(c.bowStep), color: HUD_COLOR_WARN };
  if (mode === MISSION_RADAR_EVENT) return { text: c.radarText, color: c.radarKind === RADAR_EV_RETURN ? HUD_COLOR_WARN : HUD_COLOR_STRONG };
  return null;
}
