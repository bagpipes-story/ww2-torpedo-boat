// 米PT の追撃（v0.6.3 実機 2 回目。docs/02 §6.4、spec r2 §F.1・§F.4）の HUD と Result の文: 2 行目の連射（予告・撃ち始め・制圧や撃退で黙った）、
// 追ってくる PT（撃つ権利なし）の接触の行、連射の結果（「追撃 n/m」）、Result の 1 行目の「連射 N 回」と 4 行目の「制圧 N」。
// ui/pt-lines の ptKey / ptLine がこのときに呼ぶ（方角の添字と距離の刻みは pt-lines が求めて渡す。atan2 は連射の PT・追ってくる PT の 1 回だけ）。
// Phaser も DOM を読む config も使わない（文を組むだけ。tests から型検査ごと読める）。
// 「針路そのまま」: 連射から巡航で離れて戻ると 62〜78% 沈む（速い追っ手が転舵の内側を切る）。撃ち返す行は針路そのままがいちばん良い（模擬 N 400。spec r2 §F.1）
// 実機 2 回目のレビュー: 射撃を押していて連射の PT が射界の外なら「艇尾（艇首）は撃てない」（ux-2）、撃退で黙った連射は航過と同じ「被弾で沈黙」・制圧は「連射をやめた」（ux-4）、
// 追ってくる PT が 13mm の射程の外なら「600 m まで引きつけよ」（ux-8）、連射の結果は「計 n 回」（上限は撃退・制圧で減って逆戻りに見えた。ux-7）
import { HOME_COLOR_TEXT, HUD_COLOR_STRONG, HUD_COLOR_WARN } from '../config/hud-text-config';
import { PT_DISTANCE_STEP_M } from '../config/pt-config';
import { bearingJa } from '../core/briefing';
import type { BoatTelemetry } from '../core/boat-motion';
import { GUN_OUT_OF_ARC } from '../core/gun-battery';
import type { PtTelemetry } from '../core/pt-boats';
import { degToRad } from '../core/units';
import type { HudLine } from './hud-lines';
import { MISSION_PT_PASS } from './mission-mode';
import type { PtResult } from './result-types';

/**
 * 航過のモードのキーの連射のビット（spec r2 §F.1）: 連射 | 撃った << 7 | 艇から連射の PT への 8 方位 << 8 | 黙った（制圧・撃退）<< 11 | 撃退で黙った << 12 |
 * 射撃を押していて射界の外（ux-2）<< 13 | その PT が艇首の側 << 14
 */
export const K_BURST = 1 << 6;
const K_BURST_FIRED = 1 << 7;
const K_BURST_DIR = 8;
const K_BURST_SILENCED = 1 << 11;
const K_BURST_RETIRED = 1 << 12;
const K_BURST_ARC = 1 << 13;
const K_BURST_BOW = 1 << 14;

/** 接触の行の種類（ui/pt-lines の C_* 1〜6 の続き。キーの下 3 ビット）: 追ってくる PT（撃つ権利なし） */
export const C_CHASE = 7;
/** 接触のキーの「最後に終えた攻撃が連射」（結果の種類 C_CLEAN・C_HIT・C_NOFIRE に足す） */
export const K_BURST_RESULT = 1 << 27;

/**
 * 連射の行のキー（航過のモードで t.pt.burst のとき）。dir は艇から連射の PT（脅威の PT）への 8 方位の添字。黙った連射は方角を出さない（同じ文は同じキー）。
 * 射撃を押していて 13mm が射界の外（GUN_OUT_OF_ARC。押していなければ SAFE）なら、連射の PT が艇首の側か艇尾の側か（艇の針路との内積。三角関数はこのときだけ）
 */
export function burstKey(t: BoatTelemetry, dir: number): number {
  const p = t.pt;
  if (p.passSilenced) return K_BURST | K_BURST_SILENCED | (p.passRetired ? K_BURST_RETIRED : 0);
  let arc = 0;
  if (p.gunEnabled && p.gunStatus === GUN_OUT_OF_ARC) {
    const h = degToRad(t.headingDeg);
    arc = K_BURST_ARC | (p.dx * Math.sin(h) - p.dy * Math.cos(h) > 0 ? K_BURST_BOW : 0);
  }
  return K_BURST | (p.fired ? K_BURST_FIRED : 0) | (dir << K_BURST_DIR) | arc;
}

/**
 * 連射の行（key は burstKey）: 撃つ前は「追撃！」、撃ち始めたら「連射！」で末尾は「針路そのまま撃ち返せ」（射界の外なら「針路そのまま 艇尾は撃てない」。PT は艇尾の円錐の外の
 * 135° へ自分で出る）。黙ったら味方の青: 撃退は航過と同じ「被弾で沈黙！ もう撃ってこない」、制圧は「連射をやめた」（撃つ前に黙った連射にも本当。また追ってくるので「もう」とは言わない）
 */
export function burstLine(key: number): HudLine {
  if ((key & K_BURST_SILENCED) !== 0) return { text: (key & K_BURST_RETIRED) !== 0 ? '米PT 被弾で沈黙！ もう撃ってこない' : '米PT 制圧！ 連射をやめた', color: HOME_COLOR_TEXT };
  const what = (key & K_BURST_FIRED) !== 0 ? '連射' : '追撃';
  const tail = (key & K_BURST_ARC) === 0 ? '針路そのまま撃ち返せ' : `針路そのまま ${(key & K_BURST_BOW) !== 0 ? '艇首' : '艇尾'}は撃てない`;
  return { text: `米PT ${what}！ ${bearingJa(((key >> K_BURST_DIR) & 7) * 45)}から ・ ${tail}`, color: HUD_COLOR_WARN };
}

/** 追ってくる PT の接触のキー: 種類 | 方位 << 3 | 距離の刻み << 6（見えているときだけ。見えなければ 0）| hint（13mm を撃つ前の勧めのビット。pt-lines の K_FIRE_HINT） */
export function chaseKey(dir: number, distStep: number, hint: number): number {
  return C_CHASE | (dir << 3) | (distStep << 6) | hint;
}

/**
 * 追ってくる PT の接触の行（key は chaseKey、hint はその勧めのビットが立っている、rangeM は 13mm の射程。砲の無い任務は NaN）: 方角と距離（見えなければ距離なし）・
 * 13mm を撃つ前は「右下の射撃で撃ち返せ」、撃った後は「撃ち返せ」。見えている距離が射程の外なら「600 m まで引きつけよ」（ux-8: 射程外を言わずに「撃ち返せ」と言っていた）
 */
export function chaseLine(key: number, hint: boolean, rangeM: number): HudLine {
  const d = ((key >> 6) & 63) * PT_DISTANCE_STEP_M;
  const tail = d > rangeM ? `${rangeM} m まで引きつけよ` : hint ? '右下の射撃で撃ち返せ' : '撃ち返せ';
  return { text: `米PT ${bearingJa(((key >> 3) & 7) * 45)}から追ってくる${d > 0 ? ` ${d} m` : ''} ・ ${tail}`, color: HUD_COLOR_WARN };
}

/**
 * 連射の結果の行（最後に終えた攻撃が連射。撃たなかった連射は「撃たせなかった！」）と、その夜に撃たれた連射の数「計 n 回」（上限は出さない: 撃退・制圧で減る上限は数が逆戻りしたように
 * 読め、航過の上限で去った PT の残りも数えていた。レビュー ux-7。spec r2 §F.1 の「追撃 n/m」から変えた）
 */
export function burstResultLine(p: PtTelemetry): HudLine {
  const tally = `計 ${p.bursts} 回`;
  if (!p.lastPassFired) return { text: `連射を撃たせなかった！ ・ ${tally}`, color: HOME_COLOR_TEXT };
  if (p.lastPassHits === 0) return { text: `連射 被弾なし ・ ${tally}`, color: HOME_COLOR_TEXT };
  return { text: `連射 被弾 ${p.lastPassHits} 発（HP −${p.lastPassHits * p.damagePerHit}） ・ ${tally}`, color: HUD_COLOR_STRONG };
}

/** Result の 1 行目の連射の句（連射 0 回なら出さない） */
export function burstsResultJa(r: PtResult): string {
  return r.bursts > 0 ? ` ・ 連射 ${r.bursts} 回` : '';
}

/** Result の 4 行目の制圧の句（制圧 0 なら出さない） */
export function suppressResultJa(r: PtResult): string {
  return r.suppressions > 0 ? ` ・ 制圧 ${r.suppressions}` : '';
}

/**
 * 赤い線の行を保つ（ui/mission-line が MODE_FLAG_PT_HOLD を立て、前のキーのまま）: 攻撃（航過・連射）が終わって撃った弾がまだ飛んでいる間（≤ 0.2 秒。結果の通し番号の前）で、
 * 前のフレームが赤い線の行（lastMode）。v0.6.3 実機 2 回目のヘッドレス確認: 線が撃ち切りで消えるようになり、攻撃の 76% で終わりから結果までの数フレームに
 * 追ってくる PT・射撃中・弾倉交換の行が一瞬出てから結果へ変わっていた（実機 1 回目は 7%）
 */
export function ptHoldPass(t: BoatTelemetry, lastMode: number): boolean {
  return t.pt.enabled && !t.pt.passing && t.pt.resultPending && lastMode === MISSION_PT_PASS;
}
