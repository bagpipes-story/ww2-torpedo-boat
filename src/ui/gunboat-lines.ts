// 隼艇（H-38）の僚艇（v0.6.6「日本ハードモード⑤：隼艇」。jp_01 のハードだけ。docs/02 §6.4、spec-v066 §D.6・§D.7）の HUD と Result の文とキーのビット:
// 米PT が隼艇を狙う赤い線（航過・掃射・追撃・連射）・突撃・追ってくる PT・攻撃の結果、隼艇の砲が起こした出来事の頭（撃退・撃沈・制圧）、輸送隊の出来事の欄の隼艇の沈没と
// 決着の末尾「隼艇は浜に残る」、Result の隼艇の 1 行。新しいモードは足さない（モード 22・23・26・27 の中でキーのビットで分ける。spec-v066 §N-17）。
// ui/pt-lines の ptKey / ptLine・ui/pt-gun-lines・ui/mission-line がこのときに呼ぶ。隼艇の方角の添字は pt-lines が自艇から隼艇へ求めて渡す（atan2 は標的が隼艇の行のモードのときだけフレームに 1 回。PT の方角の 1 回とは別）。
// 語の作法（ui/convoy-lines と同じ）: 「引き受けろ」「間に入れ」と言わず、いつも「近づいて撃ち返せ」。失った船体への航過は褒めない（「撃たず」）。名は data の label_ja（テレメトリ・Result の labelJa）。
// Phaser も DOM を読む config も使わない（文を組むだけ。tests から型検査ごと読める）。隼艇のいない任務ではここの文にならず、キーの隼艇のビットは 0。
import { HOME_COLOR_TEXT, HUD_COLOR_STRONG, HUD_COLOR_WARN } from '../config/hud-text-config';
import { PT_DISTANCE_STEP_M } from '../config/pt-config';
import type { BoatTelemetry } from '../core/boat-motion';
import { bearingJa } from '../core/briefing';
import type { PtTelemetry } from '../core/pt-boats';
import { PT_GUN_EV_SUNK, PT_GUN_EV_SUPPRESS } from '../core/pt-damage';
import { CONVOY_EV_GB_BEACH, CONVOY_EV_GB_SUNK, CONVOY_EV_KIND, FIGHT_BACK_JA, convoyEventLine } from './convoy-lines';
import type { HudLine } from './hud-lines';
import { K_BURST, K_BURST_FIRED, K_BURST_RESULT } from './pt-chase-lines';
import type { GunboatResult } from './result-types';

/**
 * キーのビット（spec-v066 §D.7）: 標的が隼艇（航過・連射・接触の結果・突撃・追ってくる PT。平常のキーの bit 30 は K_WAIT なので平常には使わない）、
 * 自艇から隼艇への 8 方位（bits 16〜18。航過・連射・突撃・追ってくる PT）、接触の結果の隼艇の HP（被弾の結果だけ。bits 6〜11＝結果では空きの距離の欄）、
 * 出来事を隼艇の砲が起こした（出来事のキーの bit 15）
 */
export const K_TARGET_GUNBOAT = 1 << 30;
export const K_GB_DIR = 16;
export const K_GB_HP = 6;
export const K_GUNBOAT_EVENT = 1 << 15;

/** 「南西の隼艇を狙う」（key の隼艇の方角） */
function aimJa(key: number, name: string): string {
  return `${bearingJa(((key >> K_GB_DIR) & 7) * 45)}の${name}を狙う`;
}

/** 航過のモードのキー（今の標的が隼艇で、撃つ PT が黙っていない）: 航過は 撃った | 標的 | 方角、連射は K_BURST | 撃った（bit 7）| 標的 | 方角。dir は自艇から隼艇への 8 方位の添字 */
export function gunboatPassKey(p: PtTelemetry, dir: number): number {
  const shot = p.burst ? K_BURST | (p.fired ? K_BURST_FIRED : 0) : p.fired ? 1 : 0;
  return shot | K_TARGET_GUNBOAT | (dir << K_GB_DIR);
}

/** 赤い線（標的が隼艇。key は gunboatPassKey）: 航過・掃射（撃ち始めた）・追撃（連射の撃つ前）・連射と隼艇の方角。かわす向きは出さない（線の先は隼艇。自艇は寄って撃ち返す） */
export function gunboatPassLine(key: number, name: string): HudLine {
  const what = (key & K_BURST) !== 0 ? ((key & K_BURST_FIRED) !== 0 ? '連射' : '追撃') : (key & 1) !== 0 ? '掃射' : '航過';
  return { text: `米PT ${what}！ ${aimJa(key, name)} ・ ${FIGHT_BACK_JA}`, color: HUD_COLOR_WARN };
}

/** 突撃（今の標的が隼艇。key は接触のキー、dirJa・distM は PT の方角と距離）: 見えていれば方角と距離、音だけなら方角だけ。後ろに隼艇の方角 */
export function gunboatRushLine(key: number, dirJa: string, distM: number, seen: boolean, name: string): HudLine {
  return { text: seen ? `米PT ${dirJa}から突撃 ${distM} m ・ ${aimJa(key, name)}` : `米PT のエンジン音 ・ ${dirJa}から突撃 ・ ${aimJa(key, name)}`, color: HUD_COLOR_WARN };
}

/** 追ってくる PT（今の標的が隼艇。key は chaseKey に隼艇の印と方角を足したもの。13mm／25mm の勧めのビットは立てない）: PT の方角と、見えていれば距離 */
export function gunboatChaseLine(key: number, name: string): HudLine {
  const d = ((key >> 6) & 63) * PT_DISTANCE_STEP_M;
  return { text: `米PT ${bearingJa(((key >> 3) & 7) * 45)}から追撃${d > 0 ? ` ${d} m` : ''} ・ ${aimJa(key, name)}`, color: HUD_COLOR_WARN };
}

/**
 * 攻撃の結果（最後の攻撃の標的が隼艇。key は接触のキー）: hits は標的の船体への命中（< 0 は撃たずに終わった）、HP はキーの隼艇の HP（被弾の結果だけ）／最大、
 * 航過は「航過 n/m」・連射（K_BURST_RESULT）は「計 n 回」。撃つ前にその PT を 25mm で黙らせた航過（silenced）は「隼艇を守った！」（味方の青）、ほかの撃たずは強調色（大発と同じ作法）
 */
export function gunboatResultLine(t: BoatTelemetry, key: number, hits: number, silenced: boolean): HudLine {
  const p = t.pt;
  const name = t.gunboat.labelJa;
  const burst = (key & K_BURST_RESULT) !== 0;
  const tally = burst ? `計 ${p.bursts} 回` : `航過 ${p.passes}/${p.maxPasses}`;
  if (hits < 0 && silenced && !burst) return { text: `${name}を守った！ 撃たせなかった ・ ${tally}`, color: HOME_COLOR_TEXT };
  if (hits < 0) return { text: `${name}への${burst ? '連射' : '航過'} 撃たず ・ ${tally}`, color: HUD_COLOR_STRONG };
  const who = burst ? `${name} 連射` : name;
  if (hits === 0) return { text: `${who} 被弾なし ・ ${tally}`, color: HOME_COLOR_TEXT };
  return { text: `${who} 被弾 ${hits} 発（HP ${(key >> K_GB_HP) & 63}/${t.gunboat.maxHp}） ・ ${tally}`, color: HUD_COLOR_STRONG };
}

/** 接触の結果のキーの隼艇の HP（被弾の結果だけ。0〜63） */
export function gunboatHpBits(t: BoatTelemetry): number {
  return Math.min(63, Math.max(0, Math.ceil(t.gunboat.hp))) << K_GB_HP;
}

/** 隼艇の砲が起こした出来事の行の頭（kind は PT_GUN_EV_*。ui/pt-gun-lines の ptGunEventLine がキーの K_GUNBOAT_EVENT のとき）: 撃退（死傷・穴だらけ）・撃沈・制圧 */
export function gunboatEventHeadJa(kind: number, name: string): string {
  return kind === PT_GUN_EV_SUPPRESS ? `${name} 制圧！ 米PT 追撃をやめた` : kind === PT_GUN_EV_SUNK ? `${name} 撃沈！ 米PT 1 隻` : `${name} 撃退！ 米PT 1 隻が離脱`;
}

/**
 * 輸送隊の出来事の行（ui/mission-line。event は ui/pt-line-clock の convoyEvent＝種類 | 浜の旗）: 隼艇の沈没（警告色）、ほかは ui/convoy-lines の convoyEventLine に
 * 決着の末尾「 ・ 隼艇は浜に残る」（上陸した大発があり隼艇が浮いている決着だけ。全滅には付けない）。隼艇のいない任務は convoyEventLine と同じ
 */
export function convoyEventLineGb(t: BoatTelemetry, event: number): HudLine {
  const name = t.gunboat.labelJa;
  if ((event & CONVOY_EV_KIND) === CONVOY_EV_GB_SUNK) return { text: `${name} 沈没 ・ 大発は自艇で守れ`, color: HUD_COLOR_WARN };
  const l = convoyEventLine(t.convoy, event & CONVOY_EV_KIND);
  return (event & CONVOY_EV_GB_BEACH) !== 0 ? { text: `${l.text} ・ ${name}は浜に残る`, color: l.color } : l;
}

/**
 * Result の隼艇の 1 行（20 px・本文の行。輸送隊の 1 行目の下）: 生還（残り HP）か沈没（体感秒）・隼艇の 25mm の命中／射撃・撃退・撃沈（あれば）・制圧（撃たなかった夜は「撃たなかった」）・
 * 米PT に狙われた攻撃の数。自艇の 25mm の行（ui/pt-lines の 4 行目）はこの分を引いた自艇の分
 */
export function gunboatResultLineJa(g: GunboatResult): string {
  const head = g.sunk ? `${g.labelJa} 沈没（${Math.round(g.sunkS)} 秒）` : `${g.labelJa} 生還 HP ${Math.ceil(g.hp)}/${g.maxHp}`;
  const gun = g.shots === 0 ? '撃たなかった' : `命中 ${g.hits}/${g.shots} 発 ・ 撃退 ${g.retired}${g.ptSunk > 0 ? ` ・ 撃沈 ${g.ptSunk}` : ''} ・ 制圧 ${g.suppressions}`;
  return `${head} ・ ${gun} ・ 狙われ ${g.attacked} 回`;
}
