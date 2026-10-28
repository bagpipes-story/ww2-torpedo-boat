// 夜明け（v0.6.1。docs/02 §6.7・§6.8、spec §8）の HUD と Result の文: 時計（v0.6.2 実機 2 回目から左上だけ）と「帰投せよ」の理由、夜明けの空襲の行とそのキー、夜明けの帯、Result の夜明けの行。
// v0.6.2: 夜明けに敵が退く任務（retire・hide）は帯の 2 行目と Result の行の後ろに付ける。
// v0.6.2 実機 1 回目: 左上の時計の色、2 行目が時計を避ける倍率、空襲の行の後ろの「大発 岸へ N 隻」。
// v0.6.2 実機 2 回目: 夜明けの秒数は左上の時計だけ（2 行目には出さない。ユーザー「メインメッセージの方に夜明けまでの秒数は不用」）。
// Phaser も DOM を読む config も使わない（文を組むだけ。tests から型検査ごと読める）。2 行目の文は値が変わったときだけ組む（ui/mission-line がキーでキャッシュする）。
import { HOME_MARKER_DISTANCE_STEP_M, HUD_COLOR_STRONG, HUD_COLOR_WARN, PLANE_DISTANCE_STEP_M, SHALLOW_WARN_STEP_M } from '../config/hud-text-config';
import { AS_T_FALLING, AS_T_INBOUND, AS_T_ORBIT, AS_T_REST, AS_T_RUN } from '../core/air-strike';
import type { BoatTelemetry } from '../core/boat-motion';
import { bearingJa } from '../core/briefing';
import { DAWN_AIR_ENEMY, DAWN_AIR_NONE, DAWN_AIR_OWN, type DawnResult, type DawnTelemetry } from '../core/dawn-air';
import { CALL_DAWN } from '../core/mission-flow';
import { convoyCallJa, convoyLeftStep, convoyWaitShoreJa, convoyWaiting } from './convoy-lines';
import { callLabel, withWarnings, type HudLine } from './hud-lines';
import { landingCallJa, landingCallWaits, landingLeftS, landingWaitCallJa } from './landing-lines';
import { stormWarning } from './mission-mode';

/** Result の「転舵 … 秒」に出す自艇を狙った爆弾の数（最初の N 発） */
const RESULT_DODGE_SHOWN = 8;

/**
 * 自艇を狙う爆撃の避け方（爆撃進路の行と夜明けの帯で同じ文）: 狙いは投下の瞬間の動きの先（直進なら直線、旋回中なら弧）。
 * 直進中はどちらへ切ってもよく、旋回中は同じ向きに切り続けると当たる（逆へ切る）。僚艇の狙いは常に直線なので僚艇へは「投下で転舵」だけ
 */
export const STRIKE_DODGE_RULE_JA = '投下で転舵（旋回中は逆へ）';
/** 空襲の行の 3 つの句（v0.6.7 S0 で strikeLine から切り出し。夜の哨戒機の行も同じ字）: 旋回（plane は次に進路に入る機の 0 始まり、left は残りの爆弾）・自艇への爆撃進路・自艇への落下（arc は狙いが旋回の弧の先） */
export const strikeOrbitJa = (plane: number, left: number): string => `敵機 旋回 ・ 次は ${plane + 1} 番機 ・ 残り爆弾 ${left}`;
export const strikeRunJa = (plane: number): string => `爆撃進路 ・ ${plane + 1} 番機 ・ ${STRIKE_DODGE_RULE_JA}`;
export const strikeFallJa = (arc: boolean): string => (arc ? '爆弾投下！ 旋回と逆へ転舵！' : '爆弾投下！ 転舵！');

/** 左上の時計（ui/dawn-clock）の文: 夜明け前は「夜明けまで N 秒」（切り上げ）、夜明けの後は「夜明け後 N 秒」（切り捨て。1 秒ごとに進む）。v0.6.2 実機 1 回目までは 2 行目にも出していた */
export function clockJa(t: BoatTelemetry): string {
  return t.dawn.reached ? `夜明け後 ${Math.floor(t.dawn.daylightS)} 秒` : `夜明けまで ${Math.max(0, Math.ceil(t.timeLeftS))} 秒`;
}

/** 時計のキャッシュのキー（夜明け前は 1 以上、夜明けの後は -1 以下。表示の秒が変わったときだけ変わる） */
export function clockKey(t: BoatTelemetry): number {
  return t.dawn.reached ? -1 - Math.floor(t.dawn.daylightS) : Math.max(0, Math.ceil(t.timeLeftS));
}

/** 左上の時計（v0.6.2 実機 1 回目。ui/dawn-clock）の色: 夜明けの後で敵の空襲がある任務（敵の制空下・strikeEnabled）は警告色、ほかは強調色。夜明けで clockKey の符号が変わるので色もキーの変化で組み直せる */
export function clockColor(t: BoatTelemetry): string {
  return t.dawn.reached && t.dawn.air === DAWN_AIR_ENEMY && t.dawn.strikeEnabled ? HUD_COLOR_WARN : HUD_COLOR_STRONG;
}

/**
 * 上中央の 2 行目（中央寄せ）の倍率（v0.6.2 実機 1 回目）: 左上の時計（左端から reservePx）と左右対称に避ける幅 gameW − 2×reservePx に収める。収まれば 1。
 * 論理幅 1280 で僚艇・浅瀬の付いた空襲の行（約 1,020 px）などが時計にかかるときだけ縮む（空襲の行は幅 1,560（Safari の iPhone 15）では縮まない。
 * us_03 の砲の行は「遠い・上陸まで・沿岸砲の射界・浅瀬」が揃うと約 1,140 px で、1,560 でも約 0.98 倍・1,280 では約 16 px 相当）。文が変わったときだけ呼ぶ
 */
export function lineFitScale(textW: number, gameW: number, reservePx: number): number {
  const maxW = gameW - 2 * reservePx;
  return textW > maxW && textW > 0 ? Math.max(0, maxW) / textW : 1;
}

/**
 * 夜明けに岸へ隠れる大発（v0.6.2 実機 1 回目「逃げたように見えない」）の、空襲の行の後ろ: 逃げている間は「 ・ 大発 岸へ N 隻」、
 * 逃げている大発がいなくなった直後（landedShow: 上陸の表示 BARGE_EVENT_SHOW_MS の間）は「 ・ 大発 上陸 N 隻」（N は夜明けの後に上陸した数）、ほかは ''
 */
export function bargeHideTagJa(d: DawnTelemetry, landedShow: boolean): string {
  if (d.bargesRunning > 0) return ` ・ 大発 岸へ ${d.bargesRunning} 隻`;
  return landedShow && d.bargesHidden > 0 ? ` ・ 大発 上陸 ${d.bargesHidden} 隻` : '';
}

/** bargeHideTagJa のキー（strikeKey は 31 ビット使い切りなので別の数。逃げている間は隻数、上陸の直後は −隻数、無ければ 0） */
export function bargeHideTagKey(d: DawnTelemetry, landedShow: boolean): number {
  if (d.bargesRunning > 0) return d.bargesRunning;
  return landedShow && d.bargesHidden > 0 ? -d.bargesHidden : 0;
}

/** 平常の行の頭に付ける「空襲下 ・ 」（夜明けの後、敵の制空下の任務だけ） */
export function airRaidTagJa(t: BoatTelemetry): string {
  // v0.6.2 実機 2 回目: 2 行目から夜明けの時計を外した（左上の時計と重なる）ので、空襲下は行の頭に付ける
  return t.dawn.reached && t.dawn.air === DAWN_AIR_ENEMY ? '空襲下 ・ ' : '';
}

/**
 * 「帰投せよ」の理由の文（夜明けの後の CALL_DAWN だけ変える。ほかは hud-lines の callLabel）。
 * air は t.dawn.reached ? t.dawn.air : DAWN_AIR_NONE（夜明け前は「夜明け近し」のまま）。convoyJa は輸送隊の決着の語（v0.6.4。ui/convoy-lines の convoyCallJa。無い任務は ''）
 */
export function dawnCallLabel(call: number, gunMission: boolean, air: number, convoyJa = ''): string {
  if (call === CALL_DAWN && air === DAWN_AIR_ENEMY) return '空襲下 ';
  if (call === CALL_DAWN && air === DAWN_AIR_OWN) return '夜明け ';
  return callLabel(call, gunMission, convoyJa);
}

/**
 * 呼びかけの行の文（ui/mission-line の MISSION_CALL。v0.6.4 レビュー ux-1 で切り出し。色は mission-line）: 理由の頭（dawnCallLabel）＋「帰投せよ  N m」（homeStep は輪の縁までの 100 m 刻み）。
 * 輸送隊（jp_01）が決着する前の夜明け近しは「夜明け近し 大発の上陸を待て  浜まで N m」（従うと上陸の前に輪で終わり、達成と上陸の点を失った）。
 * 燃料少は決着の前でも「帰投せよ」のまま（漂流すれば達成も帰投の点も失う）。輸送隊の無い任務の文は前と同じ。
 * 揚陸の任務（v0.6.9。jp_04）: 決着は「揚陸完了 ・ 」「輸送船 沈没 ・ 」、決着の前の夜明け近しは「夜明け近し ・ 揚陸を待て あと N 秒」、燃料少は「燃料少 ・ 揚陸まで あと N 秒 ・ 輪に入ると揚陸を見届けられない」（R4。
 * 輪に入れば揚陸の前に帰投で終わる）。揚陸の無い任務の文は前と同じ
 */
export function callLineText(t: BoatTelemetry, call: number, homeStep: number): string {
  const head = dawnCallLabel(call, t.gunMission, t.dawn.reached ? t.dawn.air : DAWN_AIR_NONE, t.convoy.enabled ? convoyCallJa(t.convoy) : t.landing.enabled ? landingCallJa(t.landing) : '');
  if (call === CALL_DAWN && convoyWaiting(t.convoy)) return `${head}${convoyWaitShoreJa(convoyLeftStep(t.convoy))}`;
  if (landingCallWaits(t.landing, call)) return `${head}${landingWaitCallJa(call, landingLeftS(t.landing))}`;
  return `${head}帰投せよ  ${homeStep * HOME_MARKER_DISTANCE_STEP_M} m`;
}

/**
 * 夜明けの空襲の 2 行目（落下中・爆撃進路・接近・旋回・波の合間）。僚艇が浮いていれば僚艇の HP（被弾の直後 escortHit は「被弾！」。キャッシュは mission-line の escortKey）、
 * 夜明けに岸へ逃げる大発（v0.6.2 実機 1 回目。bargeHideTagJa。landedShow は上陸の直後。キャッシュは mission-line の bargeTagKey）、
 * 沿岸砲（大発の後ろ書きがある間は出さない）・浅瀬・暴風の警告は hud-lines の withWarnings で後ろに付ける。落下中の自艇への爆弾は、狙いが旋回の弧の先（fallingArc）なら「旋回と逆へ」
 */
export function strikeLine(t: BoatTelemetry, shallowStep: number, stormWarn: boolean, escortHit: boolean, landedShow: boolean = false): HudLine {
  const d = t.dawn;
  let text: string;
  let warn = true;
  if (d.threat === AS_T_FALLING) text = d.toEscort ? '爆弾投下（僚艇へ）！ 転舵して連れて逃げよ' : strikeFallJa(d.fallingArc);
  else if (d.threat === AS_T_RUN) text = d.toEscort ? `爆撃進路（僚艇へ） ・ ${d.plane + 1} 番機 ・ 投下で転舵` : strikeRunJa(d.plane);
  else if (d.threat === AS_T_INBOUND) text = `空襲！ 敵機 ${d.count} 機 ・ ${d.fromJa}から ${Math.ceil(d.inboundDistM / PLANE_DISTANCE_STEP_M) * PLANE_DISTANCE_STEP_M} m ・ 帰投を急げ`;
  else if (d.threat === AS_T_ORBIT) {
    text = strikeOrbitJa(d.plane, d.bombsLeft);
    warn = false;
  } else {
    text = `敵機 去る ・ 次の空襲まで ${Math.ceil(Number.isNaN(d.restS) ? 0 : d.restS)} 秒 ・ 帰投を急げ`;
    warn = false;
  }
  if (t.escortEnabled && !t.escortSunk) text += escortHit ? ` ・ 僚艇 被弾！ HP ${Math.ceil(t.escortHp)}` : ` ・ 僚艇 HP ${Math.ceil(t.escortHp)}`;
  // 大発の後ろ書きがある間（夜明けの後の約 12 秒）は沿岸砲の警告を出さない（us_03 の空襲＋大発＋沿岸砲＋浅瀬は約 1,170 px で上限 1,040 px を超えた。レビュー）
  const tag = bargeHideTagJa(d, landedShow);
  text += tag;
  return { text: withWarnings(text, t, shallowStep, stormWarn, tag === ''), color: warn || escortHit ? HUD_COLOR_WARN : HUD_COLOR_STRONG };
}

/**
 * 空襲の行のキー（planeKey とは別。planeKey の落とした数は 2 ビットで 4 発以上が重なる。僚艇の HP と被弾は mission-line の escortKey）:
 * threat | toEscort<<3 | (plane+1)<<4 | bombsLeft<<7 | 秒か距離<<11（波の合間は min(63, 秒)、接近は min(63, 距離の刻み)。段で分かれるので 1 つの欄）|
 * shallowState<<17 | min(31, 浅瀬の刻み)<<19 | 暴風の警告<<24 | 落下中の弧<<25
 */
export function strikeKey(t: BoatTelemetry): number {
  const d = t.dawn;
  const rest = Number.isNaN(d.restS) ? 0 : Math.min(63, Math.ceil(d.restS));
  const dist = Number.isNaN(d.inboundDistM) ? 0 : Math.min(63, Math.ceil(d.inboundDistM / PLANE_DISTANCE_STEP_M));
  const shallowStep = Math.min(31, Math.ceil(t.shallowAheadM / SHALLOW_WARN_STEP_M));
  return (
    d.threat |
    (d.toEscort ? 1 << 3 : 0) |
    ((d.plane + 1) << 4) |
    (Math.min(15, d.bombsLeft) << 7) |
    ((d.threat === AS_T_REST ? rest : d.threat === AS_T_INBOUND ? dist : 0) << 11) |
    (t.shallowState << 17) |
    (shallowStep << 19) |
    (stormWarning(t) ? 1 << 24 : 0) |
    (d.threat === AS_T_FALLING && d.fallingArc ? 1 << 25 : 0)
  );
}

/**
 * 夜明けに敵が退く任務の帯の行（v0.6.2）: retire は「東京急行は北へ退く ・ 追うか帰投か」（残弾 0＝撃ち尽くし・輪の中なら「・ 帰投せよ」）、
 * hide は「大発は岸へ隠れる ・ 帰投せよ」。退く相手が残っていなければ ''（v0.6.2 レビュー: 夜明けまでに全艦（輸送船込み。destroyerSunk）を沈めた・
 * 大発がすべて撃破か上陸した夜に「追うか」と出ていた。夜明けの瞬間はまだ退いた艦は無いので、全艦が沈み始めた＝狙う艦なし）。stay・none は ''
 */
function withdrawBannerJa(t: BoatTelemetry): string {
  const d = t.dawn;
  if (d.ships === 'retire' && d.forceJa && d.retireJa && !t.destroyerSunk) return `${d.forceJa}は${d.retireJa}へ退く ・ ${t.torpedoesLeft > 0 ? '追うか帰投か' : '帰投せよ'}`;
  return d.ships === 'hide' && t.bargesSunk + t.bargesBeached < t.bargesTotal ? '大発は岸へ隠れる ・ 帰投せよ' : '';
}

/**
 * 夜明けの帯（HUD 中央。夜明けのラッチで 1 回だけ組む）: [見出し, 1 行目, 2 行目（あれば）]。
 * 敵の制空下（空襲あり）は「夜明け — 空襲」、2 行目は僚艇を狙う機があり僚艇が浮いていればその行、無ければ敵が退く行（v0.6.2）。
 * それ以外（味方の制空下・?debug&nostrike）は「夜明け」。敵が退く任務は 1 行目を「… ・ 敵機は来ない」にして 2 行目に退く行（「帰投せよ」は 2 行目が持つ）。
 * 退く相手が残っていなければ v0.6.1 の帯（「… ・ 敵機は来ない ・ 帰投せよ」／空襲の 2 行）
 */
export function dawnBannerLines(t: BoatTelemetry): readonly string[] {
  const d = t.dawn;
  const withdraw = withdrawBannerJa(t);
  if (d.air === DAWN_AIR_ENEMY && d.strikeEnabled) {
    const sub = `${d.nameJa} ${d.count} 機が${d.fromJa}から来る ・ ${STRIKE_DODGE_RULE_JA}`;
    if (d.vip && t.escortEnabled && !t.escortSunk) return ['夜明け — 空襲', sub, '僚艇も狙われる ・ 自艇の転舵に僚艇が付いてくる'];
    return withdraw ? ['夜明け — 空襲', sub, withdraw] : ['夜明け — 空襲', sub];
  }
  return withdraw ? ['夜明け', `${d.labelJa} ・ 敵機は来ない`, withdraw] : ['夜明け', `${d.labelJa} ・ 敵機は来ない ・ 帰投せよ`];
}

/**
 * Result の夜明けの行の後ろ（v0.6.2。退いた艦・隠れた大発が無ければ ''）: 「 ・ 駆逐艦は北へ退いた（N 隻）」（輸送船も出たら「（N 隻＋輸送船）」、
 * 駆逐艦が残らず輸送船だけなら「 ・ 輸送船は北へ退いた」）、「 ・ 大発は岸に隠れた（N 隻）」
 */
function withdrawResultJa(d: DawnResult): string {
  let s = '';
  if (d.shipsWithdrawn > 0) s += ` ・ 駆逐艦は${d.retireJa}へ退いた（${d.shipsWithdrawn} 隻${d.transportWithdrawn ? '＋輸送船' : ''}）`;
  else if (d.transportWithdrawn) s += ` ・ 輸送船は${d.retireJa}へ退いた`;
  if (d.bargesHidden > 0) s += ` ・ 大発は岸に隠れた（${d.bargesHidden} 隻）`;
  return s;
}

/**
 * Result の夜明けの行（無ければ null）: 夜明けに輪の外だった（空襲の集計か「敵機は来ない」）、夜明け前に帰投した（残り秒）。後ろに夜明けに退いた敵（v0.6.2）。
 * 夜明け前に帰投せずに終わった・夜明けに輪の中にいて帰投しなかった任務は出さない。転舵は自艇を狙った最初の 8 発（— は転舵なし。無ければ付けない）。
 * cleared（v0.6.2 実機 1 回目。敵艦隊なしで終えた）は returned と同じ扱いで、夜明け前なら「夜明け: 前に敵艦隊なし（残り N 秒）」
 */
export function dawnResultLine(d: DawnResult, returned: boolean, cleared = false): string | null {
  const w = withdrawResultJa(d);
  if (!d.reached || !d.caughtOutside) return returned ? `夜明け: 前に${cleared ? '敵艦隊なし' : '帰投'}（残り ${Math.ceil(d.timeLeftAtEndS)} 秒）${w}` : null;
  const s = Math.round(d.daylightS);
  const k = d.strike;
  if (d.air !== DAWN_AIR_ENEMY || !k) return `夜明け後 ${s} 秒 ・ ${d.labelJa}（敵機は来ない）${w}`;
  const shown = k.dodgeS.slice(0, RESULT_DODGE_SHOWN);
  const dodge = shown.length > 0 ? ` ・ 転舵 ${shown.map((x) => (Number.isNaN(x) ? '—' : x.toFixed(1))).join('/')} 秒` : '';
  if (k.vip) return `夜明け後 ${s} 秒 ・ 空襲 ${k.waves} 波 ・ 爆弾 ${k.bombs} 発（自艇 ${k.bombs - k.bombsAtEscort}・僚艇 ${k.bombsAtEscort}） ・ 命中 自艇 ${k.hitsPlayer}・僚艇 ${k.hitsEscort}${dodge}${w}`;
  return `夜明け後 ${s} 秒 ・ 空襲 ${k.waves} 波 ・ 爆弾 ${k.bombs} 発 ・ 命中 ${k.hitsPlayer}${dodge}${w}`;
}

/**
 * 夜明けに退いて狙う艦がいなくなった後の HUD の 3 行目（v0.6.2 レビュー。d.shipsGone のときだけ。退いた艦があるのは retire の任務だけなので呼び名と方角は入っている）。
 * 魚雷ボタンが 0 になった理由（撃沈のときの「駆逐艦を撃沈」と同じ役目）。値が変わったときだけ ui/boat-hud が setText する
 */
export function shipsGoneStatusJa(d: DawnTelemetry): string {
  return `${d.forceJa}は${d.retireJa}へ去った ・ 狙う艦なし`;
}

/** 方位 deg（北 0・時計回り）の 8 方位（core/briefing の bearingJa。空襲の「東から」） */
export function compass8Ja(deg: number): string {
  return bearingJa(deg);
}
