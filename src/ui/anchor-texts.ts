// 止まった艦の任務（v0.8.1 S4。us_06）の 2 行目の出来事の文と、夜明けの帯の退く行（ui/anchor-lines から IP1 で分けた。時計 AnchorLineClock は anchor-lines のまま。anchor-lines が再 export する）。
// IP1（実機 1 回目のユーザー「暗い岸を背にした…というのがわかりにくい」）: 「暗い岸を背にした」→「岸の陰に入った」（地図の暗い陸と岸の陰の海＝systems/backdrop-fx と同じ言葉）と、
// 寄り方の手がかり「停泊艦の南の暗い海（岸の陰）から寄れ ・ 見つかりにくい」（1 夜に 1 回。レーダーの最初の接触の後。止まった艦ごとの陰なので艦の名を言わない）。
// 読むのは時計の種類と刻み・夜明けの 2 語・輸送船と撃沈の数・残弾だけ。Phaser・DOM を読まない。確保しない（文を組むのは出来事の時だけ）。
import { HUD_COLOR_STRONG, HUD_COLOR_WARN } from '../config/hud-text-config';
import type { BoatTelemetry } from '../core/boat-telemetry';
import { DETECT_RANGE_STEP_M, type HudLine } from './hud-lines';

/** 出来事の種類（0 なし・1 岸の陰に入った・2 停泊していた艦が動き出した・3 寄り方の手がかり） */
export const ANCHOR_EV_NONE = 0, ANCHOR_EV_BACKDROP = 1, ANCHOR_EV_UNDERWAY = 2, ANCHOR_EV_HINT = 3;
export const ANCHOR_UNDERWAY_JA = '停泊していた艦が動き出した！';
export const ANCHOR_HINT_JA = '停泊艦の南の暗い海（岸の陰）から寄れ ・ 見つかりにくい';
/** Briefing の危険の行の尾（systems/briefing-numbers。HUD の手がかりと同じ言葉） */
export const ANCHOR_BRIEF_HINT_JA = '停泊艦の南の暗い海（岸の陰）なら見つかりにくい';
export const anchorBackdropLineJa = (step: number): string => `岸の陰に入った ・ 見つかる距離 ${step * DETECT_RANGE_STEP_M} m`;

/** 2 行目の文が読む時計の部分（AnchorLineClock がそのまま満たす） */
export interface AnchorLineView { readonly kind: number; readonly step: number }
/** モード 41 の行（kind が無ければ null）。動き出しは警告の色、ほかは 2 行目の平常の色（レーダーの出来事と同じ） */
export function anchorLine(c: AnchorLineView): HudLine | null {
  if (c.kind === ANCHOR_EV_UNDERWAY) return { text: ANCHOR_UNDERWAY_JA, color: HUD_COLOR_WARN };
  if (c.kind === ANCHOR_EV_HINT) return { text: ANCHOR_HINT_JA, color: HUD_COLOR_STRONG };
  return c.kind === ANCHOR_EV_BACKDROP ? { text: anchorBackdropLineJa(c.step), color: HUD_COLOR_STRONG } : null;
}

/** 夜明けの帯の退く行（ui/dawn-lines の withdrawBannerJa の後）: 輸送船は泊地に止まって退かないので、浮いていれば「輸送船は泊地に残る」、駆逐艦が沈んでいれば「退く」と言わない。ほかの任務は base */
export function anchorWithdrawJa(t: BoatTelemetry, base: string): string {
  if (!t.anchor || base === '' || !t.transportEnabled || t.transportSunk) return base;
  if (t.shipsSunk < t.shipsTotal) return `${t.dawn.forceJa}は${t.dawn.retireJa}へ退く ・ 輸送船は泊地に残る ・ ${t.torpedoesLeft > 0 ? '追うか帰投か' : '帰投せよ'}`;
  return `輸送船は泊地に残る ・ ${t.torpedoesLeft > 0 ? '撃つか帰投か' : '帰投せよ'}`;
}
