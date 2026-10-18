// 夜明け（v0.6.1。docs/02 §6.7・§6.8、spec §8）の HUD と Result の文: 2 行目の時計と「帰投せよ」の理由、夜明けの空襲の行とそのキー、夜明けの帯、Result の夜明けの行。
// Phaser も DOM を読む config も使わない（文を組むだけ。tests から型検査ごと読める）。2 行目の文は値が変わったときだけ組む（ui/mission-line がキーでキャッシュする）。
import { HUD_COLOR_STRONG, HUD_COLOR_WARN, PLANE_DISTANCE_STEP_M, SHALLOW_WARN_STEP_M } from '../config/hud-text-config';
import { AS_T_FALLING, AS_T_INBOUND, AS_T_ORBIT, AS_T_RUN } from '../core/air-strike';
import type { BoatTelemetry } from '../core/boat-motion';
import { bearingJa } from '../core/briefing';
import { DAWN_AIR_ENEMY, DAWN_AIR_OWN, type DawnResult } from '../core/dawn-air';
import { CALL_DAWN } from '../core/mission-flow';
import { callLabel, withWarnings, type HudLine } from './hud-lines';
import { stormWarning } from './mission-mode';

/** Result の「転舵 … 秒」に出す自艇を狙った爆弾の数（最初の N 発） */
const RESULT_DODGE_SHOWN = 8;

/** 2 行目の時計: 夜明け前は「夜明けまで N 秒」（切り上げ）、夜明けの後は「夜明け後 N 秒」（切り捨て。1 秒ごとに進む） */
export function clockJa(t: BoatTelemetry): string {
  return t.dawn.reached ? `夜明け後 ${Math.floor(t.dawn.daylightS)} 秒` : `夜明けまで ${Math.max(0, Math.ceil(t.timeLeftS))} 秒`;
}

/** 時計のキャッシュのキー（夜明け前は 1 以上、夜明けの後は -1 以下。表示の秒が変わったときだけ変わる） */
export function clockKey(t: BoatTelemetry): number {
  return t.dawn.reached ? -1 - Math.floor(t.dawn.daylightS) : Math.max(0, Math.ceil(t.timeLeftS));
}

/** 平常の行で時計の後ろに付ける「空襲下」（夜明けの後、敵の制空下の任務だけ） */
export function airRaidTagJa(t: BoatTelemetry): string {
  return t.dawn.reached && t.dawn.air === DAWN_AIR_ENEMY ? ' ・ 空襲下' : '';
}

/**
 * 「帰投せよ」の理由の文（夜明けの後の CALL_DAWN だけ変える。ほかは hud-lines の callLabel）。
 * air は t.dawn.reached ? t.dawn.air : DAWN_AIR_NONE（夜明け前は「夜明け近し」のまま）
 */
export function dawnCallLabel(call: number, gunMission: boolean, air: number): string {
  if (call === CALL_DAWN && air === DAWN_AIR_ENEMY) return '空襲下 ';
  if (call === CALL_DAWN && air === DAWN_AIR_OWN) return '夜明け ';
  return callLabel(call, gunMission);
}

/** 夜明けの空襲の 2 行目（落下中・爆撃進路・接近・旋回・波の合間）。浅瀬・暴風の警告は hud-lines の withWarnings で後ろに付ける */
export function strikeLine(t: BoatTelemetry, shallowStep: number, stormWarn: boolean): HudLine {
  const d = t.dawn;
  let text: string;
  let warn = true;
  if (d.threat === AS_T_FALLING) text = d.toEscort ? '爆弾投下（僚艇へ）！ 転舵して連れて逃げよ' : '爆弾投下！ 転舵！';
  else if (d.threat === AS_T_RUN) text = d.toEscort ? `爆撃進路（僚艇へ） ・ ${d.plane + 1} 番機 ・ 投下を見たら転舵` : `爆撃進路 ・ ${d.plane + 1} 番機 ・ 投下を見たら舵を切り替えろ`;
  else if (d.threat === AS_T_INBOUND) text = `空襲！ 敵機 ${d.count} 機 ・ ${d.fromJa}から ${Math.ceil(d.inboundDistM / PLANE_DISTANCE_STEP_M) * PLANE_DISTANCE_STEP_M} m ・ 帰投を急げ`;
  else if (d.threat === AS_T_ORBIT) {
    text = `敵機 旋回 ・ 次は ${d.plane + 1} 番機 ・ 残り爆弾 ${d.bombsLeft}`;
    warn = false;
  } else {
    text = `敵機 去る ・ 次の空襲まで ${Math.ceil(Number.isNaN(d.restS) ? 0 : d.restS)} 秒 ・ 帰投を急げ`;
    warn = false;
  }
  return { text: withWarnings(text, t, shallowStep, stormWarn), color: warn ? HUD_COLOR_WARN : HUD_COLOR_STRONG };
}

/**
 * 空襲の行のキー（planeKey とは別。planeKey の落とした数は 2 ビットで 4 発以上が重なる）:
 * threat | toEscort<<3 | (plane+1)<<4 | bombsLeft<<7 | min(63, 波の合間の秒)<<11 | min(63, 接近の距離の刻み)<<17 | shallowState<<23 | min(31, 浅瀬の刻み)<<25 | 暴風の警告<<30
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
    (rest << 11) |
    (dist << 17) |
    (t.shallowState << 23) |
    (shallowStep << 25) |
    (stormWarning(t) ? 1 << 30 : 0)
  );
}

/**
 * 夜明けの帯（HUD 中央。夜明けのラッチで 1 回だけ組む）: [見出し, 1 行目, 2 行目（あれば）]。
 * 敵の制空下（空襲あり）は「夜明け — 空襲」、僚艇を狙う機があり僚艇が浮いていれば 2 行目。それ以外（味方の制空下・?debug&nostrike）は「夜明け」
 */
export function dawnBannerLines(t: BoatTelemetry): readonly string[] {
  const d = t.dawn;
  if (d.air === DAWN_AIR_ENEMY && d.strikeEnabled) {
    const sub = `${d.nameJa} ${d.count} 機が${d.fromJa}から来る ・ 投下を見たら舵を切り替えろ`;
    return d.vip && t.escortEnabled && !t.escortSunk ? ['夜明け — 空襲', sub, '僚艇も狙われる ・ 自艇の転舵に僚艇が付いてくる'] : ['夜明け — 空襲', sub];
  }
  return ['夜明け', `${d.labelJa} ・ 敵機は来ない ・ 帰投せよ`];
}

/**
 * Result の夜明けの行（無ければ null）: 夜明けに輪の外だった（空襲の集計か「敵機は来ない」）、夜明け前に帰投した（残り秒）。
 * 夜明け前に帰投せずに終わった・夜明けに輪の中にいて帰投しなかった任務は出さない。転舵は自艇を狙った最初の 8 発（— は転舵なし。無ければ付けない）
 */
export function dawnResultLine(d: DawnResult, returned: boolean): string | null {
  if (!d.reached || !d.caughtOutside) return returned ? `夜明け: 前に帰投（残り ${Math.ceil(d.timeLeftAtEndS)} 秒）` : null;
  const s = Math.round(d.daylightS);
  const k = d.strike;
  if (d.air !== DAWN_AIR_ENEMY || !k) return `夜明け後 ${s} 秒 ・ ${d.labelJa}（敵機は来ない）`;
  const shown = k.dodgeS.slice(0, RESULT_DODGE_SHOWN);
  const dodge = shown.length > 0 ? ` ・ 転舵 ${shown.map((x) => (Number.isNaN(x) ? '—' : x.toFixed(1))).join('/')} 秒` : '';
  if (k.vip) return `夜明け後 ${s} 秒 ・ 空襲 ${k.waves} 波 ・ 爆弾 ${k.bombs} 発（自艇 ${k.bombs - k.bombsAtEscort}・僚艇 ${k.bombsAtEscort}） ・ 命中 自艇 ${k.hitsPlayer}・僚艇 ${k.hitsEscort}${dodge}`;
  return `夜明け後 ${s} 秒 ・ 空襲 ${k.waves} 波 ・ 爆弾 ${k.bombs} 発 ・ 命中 ${k.hitsPlayer}${dodge}`;
}

/** 方位 deg（北 0・時計回り）の 8 方位（core/briefing の bearingJa。空襲の「東から」） */
export function compass8Ja(deg: number): string {
  return bearingJa(deg);
}
