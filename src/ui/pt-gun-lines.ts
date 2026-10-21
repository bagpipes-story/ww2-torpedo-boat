// T-14 の 13mm 機銃（v0.6.3 実機 1 回目。spec r1 §E.1）の HUD の 2 行目: 射撃（状態・PT までの距離・命中・弾倉の交換）と出来事（撃退・撃沈・残りの隻数）の文とキャッシュのキー。
// ui/pt-lines の ptKey / ptLine がこの 2 つのモードのときに呼ぶ。Phaser も DOM を読む config も使わない（tests から型検査ごと読める）。
// v0.6.3 実機 2 回目: 出来事に制圧（追撃の PT が 13mm を 3 発受けて追撃をやめ離れる。core/pt-damage の PT_GUN_EV_SUPPRESS = 4）を足した。
// 距離は gun-battery が撃つときに求めた targetM を 50 m 刻みで切り上げる（平方根を足さない）。キーは行に出る値だけを詰める（50 m・命中 1 発・交換の 1 秒ごとにしか組み直さない）。
import { GUN_BUTTON_LABEL } from '../config/hunt-config';
import { HOME_COLOR_TEXT, HUD_COLOR_STRONG, HUD_COLOR_WARN } from '../config/hud-text-config';
import { PT_DISTANCE_STEP_M, PT_RESULT_SHOW_MS } from '../config/pt-config';
import type { BoatTelemetry } from '../core/boat-motion';
import { GUN_FIRING, GUN_NO_TARGET, GUN_OUT_OF_ARC, GUN_OUT_OF_RANGE, GUN_SAFE } from '../core/gun-battery';
import { PT_GUN_EV_CREW, PT_GUN_EV_SUNK, PT_GUN_EV_SUPPRESS } from '../core/pt-damage';
import { PT_GUN_RELOAD } from '../core/pt-gun';
import type { HudLine } from './hud-lines';

/** キーの詰め方（射撃）: 状態 3 ビット | 速くて散る | 遠い | 距離の刻み 6 ビット | 命中 6 ビット | 交換の残り秒 3 ビット */
const K_FAST = 1 << 3;
const K_FAR = 1 << 4;
const K_DIST = 5;
const K_HITS = 11;
const K_RELOAD = 17;

/**
 * 射撃の行のキー（モード MISSION_PT_GUN）。撃っている: 状態 | 速い | 遠い（表示の距離が有効射程の外。両方なら「遠くて速い」＝レビュー ux-6）| 距離の刻み | 命中（速い・遠いの文には出ないので 0）、
 * 弾倉交換: 状態 | 残り秒の切り上げ、ほか: 状態だけ（見えない・煙幕は同じ文なので同じキー）
 */
export function ptGunKey(t: BoatTelemetry): number {
  const p = t.pt;
  const st = p.gunStatus;
  if (st === PT_GUN_RELOAD) return st | (Math.min(7, Math.max(1, Math.ceil(p.reloadLeftS))) << K_RELOAD);
  if (st === GUN_SAFE || st === GUN_OUT_OF_ARC || st === GUN_OUT_OF_RANGE) return st;
  if (st !== GUN_FIRING) return GUN_NO_TARGET;
  const d = Math.min(63, Math.ceil(p.gunTargetM / PT_DISTANCE_STEP_M));
  const fast = p.gunFast;
  const far = d * PT_DISTANCE_STEP_M > p.gunEffectiveM;
  return st | (fast ? K_FAST : 0) | (far ? K_FAR : 0) | (d << K_DIST) | (fast || far ? 0 : Math.min(63, p.gunHits) << K_HITS);
}

/** 射撃の行の文と色（key は同じフレームの ptGunKey。距離・命中・交換の秒はキーから、射程・有効射程・静音の上限はテレメトリの出撃時の値から） */
export function ptGunLine(t: BoatTelemetry, key: number): HudLine {
  const p = t.pt;
  const st = key & 7;
  if (st === PT_GUN_RELOAD) return { text: `弾倉交換 ・ あと ${(key >> K_RELOAD) & 7} 秒`, color: HUD_COLOR_STRONG };
  if (st === GUN_OUT_OF_ARC) return { text: '射界外 ・ 舷側に向けよ（艇首・艇尾は撃てない）', color: HUD_COLOR_WARN };
  if (st === GUN_OUT_OF_RANGE) return { text: `射程外 ・ ${p.gunRangeM} m まで引きつけよ`, color: HUD_COLOR_WARN };
  if (st !== GUN_FIRING) return { text: '撃てる PT が見えない', color: HUD_COLOR_STRONG };
  const head = `射撃中 ・ PT ${((key >> K_DIST) & 63) * PT_DISTANCE_STEP_M} m`;
  // 速くて遠いは 1 つの文で両方を言う（レビュー ux-6: 速いだけを言うと、14 kt に落としても 550 m ではまだ当たらず、2 度目の直しが要った）
  if ((key & K_FAST) !== 0 && (key & K_FAR) !== 0) return { text: `${head} ・ 遠くて速い（${p.gunEffectiveM} m 以内・${p.silentMaxKt} kt 以下で）`, color: HUD_COLOR_WARN };
  if ((key & K_FAST) !== 0) return { text: `${head} ・ 速くて散る（${p.silentMaxKt} kt 以下で）`, color: HUD_COLOR_WARN };
  if ((key & K_FAR) !== 0) return { text: `${head} ・ 遠い（${p.gunEffectiveM} m 以内で）`, color: HUD_COLOR_WARN };
  // 命中はその夜の計（どの PT への命中も。レビュー ux-5: 輪の中の PT への命中に読めた）
  return { text: `${head} ・ 命中 計 ${(key >> K_HITS) & 63}`, color: HUD_COLOR_STRONG };
}

/**
 * 時刻で出す行（13mm の出来事・航過の結果）の表示の終わり ms（mission-line が毎フレーム。untilMs は通し番号が増えたときに now + PT_RESULT_SHOW_MS）。
 * 上の行に隠れている間（hidden）は終わりを先へ送り、隠れなくなってから PT_RESULT_SHOW_MS 出す。時間切れの後は変えない。R5 ヘッドレス: 航過中の PT が撃退されて
 * 黙ったまま抜ける間に 2.5 秒が赤い線の下で過ぎ、「撃退！ … 残り 1 隻」が出ない夜が 14 回のうち 6 回あった（出来事は赤い線の後、航過の結果は出来事の後に出す）
 */
export function holdShowUntil(untilMs: number, hidden: boolean, nowMs: number): number {
  return hidden && nowMs < untilMs ? nowMs + PT_RESULT_SHOW_MS : untilMs;
}

/** 出来事の行のキー（モード MISSION_PT_GUN_EVENT）: 種類（PT_GUN_EV_*）| まだ戦う PT の数 << 3 */
export function ptGunEventKey(t: BoatTelemetry): number {
  return t.pt.gunEvent | (Math.min(7, t.pt.fighting) << 3);
}

/** 出来事の行（味方の青）: 撃退（死傷・穴だらけ）・撃沈・制圧（追撃をやめて離れる。制圧された PT はまだ戦う数に入る）と、まだ戦う PT の数（0 なら「帰投せよ」） */
export function ptGunEventLine(key: number): HudLine {
  const kind = key & 7;
  const n = (key >> 3) & 7;
  const head =
    kind === PT_GUN_EV_SUPPRESS ? '米PT 制圧！ 追撃をやめて離れる' : kind === PT_GUN_EV_SUNK ? '米PT 撃沈！ ガソリンに引火' : kind === PT_GUN_EV_CREW ? '米PT 撃退！ 死傷者が出て離脱' : '米PT 撃退！ 穴だらけで離脱';
  return { text: `${head} ・ ${n === 0 ? '帰投せよ' : `残り ${n} 隻`}`, color: HOME_COLOR_TEXT };
}

/** 射撃ボタンの弾倉交換の残り秒の整数（交換中でない・13mm の無い任務は 0）。HudScene はこれが変わったときだけボタンの文字と濃さを替える（レビュー ux-2: 赤い線の下で弾が止まる訳が見えなかった） */
export function gunButtonReloadN(t: BoatTelemetry): number {
  return t.pt.gunEnabled && t.pt.reloadLeftS > 0 ? Math.ceil(t.pt.reloadLeftS) : 0;
}

/** 射撃ボタンの文字: 弾倉の交換中は「弾倉交換 N」（2 行目と同じ切り上げ）、ほかはいつもの「射撃 押し続け」 */
export function gunButtonLabel(reloadN: number): string {
  return reloadN > 0 ? `弾倉交換\n${reloadN}` : GUN_BUTTON_LABEL;
}
