// 味方の大発の輸送隊（v0.6.4。jp_01「夜の輸送護衛」。docs/02 §6.4、spec §D.2・§D.3）の HUD と Result の文: 2 行目の平常（大発の数・上陸・浜まで・米PT の哨戒）、
// 米PT が大発を狙うときの航過・突撃・航過の結果、離脱の尾「大発のそばへ戻れ」、出来事（沈没・上陸）、呼びかけの語「大発 上陸 2/3 ・ 」、Result の 1 行目と状況の行の頭、2 行目のキャッシュのキー。
// ui/pt-lines の ptKey / ptLine（標的の種類のビットで分岐）と ui/mission-line がこのときに呼ぶ。Phaser も DOM を読む config も使わない（文を組むだけ。tests から型検査ごと読める）。
// 距離はキーの刻み（切り上げ）から、隻数はテレメトリから組み、キーが変わったときだけ組む（ui/mission-line がキャッシュする）。
// 語の作法（spec §I.6）: 付くだけ・間に入るだけは罠（自艇が先に狙われる）なので「引き受けろ」「間に入れ」とは言わず、いつも「近づいて撃ち返せ」。失った大発への航過は褒めない（「撃たせなかった！」は自艇だけ）。
// v0.6.4 レビュー: 決着の前は「帰投せよ」と言わず「大発の上陸を待て」（ux-1。従うと上陸の前に輪で終わり、達成と上陸の点を失った）、撃つ前に 25mm で黙らせた大発への航過は「大発を守った！」（ux-7）、
// Result の 1 行目に航行中の数（ux-9）。
import { CONVOY_LEFT_STEP_M, CONVOY_MARKER_STEP_M, CONVOY_NEAR_WARN_M } from '../config/convoy-config';
import { HOME_COLOR_TEXT, HUD_COLOR_STRONG, HUD_COLOR_WARN } from '../config/hud-text-config';
import type { BoatTelemetry } from '../core/boat-motion';
import type { ConvoyTelemetry } from '../core/convoy';
import type { HudLine } from './hud-lines';
import type { ConvoyResult } from './result-types';

/**
 * 出来事の種類（ui/pt-line-clock が上陸・沈没の数の立ち上がりで決める。0 は無し）。v0.6.6（隼艇。jp_01 のハード）: 隼艇の沈没（種類 3）と、決着の出来事の末尾「隼艇は浜に残る」の旗 4
 * （種類と旗は ui/gunboat-lines の convoyEventLineGb が読む。convoyKey の event << 11 で bits 11〜13）。CONVOY_EV_KIND は種類の取り出し
 */
export const CONVOY_EV_SUNK = 1;
export const CONVOY_EV_ARRIVED = 2;
export const CONVOY_EV_GB_SUNK = 3;
export const CONVOY_EV_GB_BEACH = 4;
export const CONVOY_EV_KIND = 3;

/** 大発（v0.6.6 から隼艇も）が狙われたときの勧め（航過・突撃・沈没の出来事で同じ語） */
export const FIGHT_BACK_JA = '近づいて撃ち返せ';

/** 輸送隊がまだ決着していない（みな上陸か沈没でない。輸送隊の無い任務は false＝jp_05 の文とキーは変わらない）: この間は「帰投せよ」と言わない */
export function convoyWaiting(c: ConvoyTelemetry): boolean {
  return c.enabled && !c.resolved;
}

/** 決着の前の「帰投せよ」の代わり（13mm／25mm の出来事で戦う PT が残っていないとき）。連射の結果を足した出来事の行は短い形（22 px で 840 px に収める。「大発の」で 885 px） */
export const CONVOY_WAIT_JA = '大発の上陸を待て';
export const CONVOY_WAIT_SHORT_JA = '上陸を待て';

/** 決着の前の「帰投せよ  N m」の代わり「大発の上陸を待て  浜まで N m」（leftStep は convoyLeftStep。みな去った平常の行と夜明け近しの呼びかけ） */
export function convoyWaitShoreJa(leftStep: number): string {
  return `${CONVOY_WAIT_JA}  浜まで ${leftStep * CONVOY_LEFT_STEP_M} m`;
}

/** 「浜まで N m」の刻み（最も遅れた航行中の大発から浜（上陸地点）まで。浜の無い隊は上陸線までの x の差。切り上げ。63 まで＝6,300 m） */
export function convoyLeftStep(c: ConvoyTelemetry): number {
  return Math.min(63, Math.ceil(c.leftM / CONVOY_LEFT_STEP_M));
}

/** 離脱の行の「大発のそばへ戻れ（N m）」の距離の刻み（最寄りの航行中の大発が CONVOY_NEAR_WARN_M より遠いときだけ。近い・無い（NaN）・輸送隊の無い任務は 0＝jp_05 のキーは変わらない） */
export function convoyNearStep(c: ConvoyTelemetry): number {
  return c.enabled && c.nearestM > CONVOY_NEAR_WARN_M ? Math.min(63, Math.ceil(c.nearestM / CONVOY_MARKER_STEP_M)) : 0;
}

/**
 * 輸送隊のキー（ui/mission-line が ptKey と並べて持つ）: 1 | 航行中 << 1 | 上陸 << 3 | 浜までの刻み << 5（平常の行のときだけ。0〜63）| 出来事 << 11（0 なし・1 沈没・2 上陸・3 隼艇の沈没、| 4 浜の旗＝bit 13）。
 * 「米PT N 隻」は ptKey（N_UNSEEN の隻数）が、離脱の尾の距離は ptKey（接触の距離の刻み）が持つ。輸送隊の無い任務は 0
 */
export function convoyKey(c: ConvoyTelemetry, normal: boolean, event: number): number {
  if (!c.enabled) return 0;
  return 1 | (Math.min(3, c.afloat) << 1) | (Math.min(3, c.arrived) << 3) | ((normal ? convoyLeftStep(c) : 0) << 5) | (event << 11);
}

/** 平常の行（米PT が見えていない間。jp_05 の「米PT 2 隻が哨戒中 ・ 静音で抜けて帰投」の代わり）: 航行中の大発・上陸・浜まで・去っていない米PT と来る方角 */
export function convoyNormalLine(t: BoatTelemetry): HudLine {
  const c = t.convoy;
  return { text: `大発 ${c.afloat} 隻 ・ 上陸 ${c.arrived}/${c.total} ・ 浜まで ${convoyLeftStep(c) * CONVOY_LEFT_STEP_M} m ・ 米PT ${t.pt.alive} 隻 ${c.fromDirJa}で哨戒中`, color: HUD_COLOR_STRONG };
}

/** 見えている PT に気づかれていない間（停止・静音）: jp_05 の「静音でやり過ごせ」の代わり（抜けるのではなく大発のそばで待つ） */
export function convoySlowLine(distM: number, dirJa: string): HudLine {
  return { text: `米PT ${distM} m（${dirJa}） ・ まだ気づいていない ・ 大発のそばで備えよ`, color: HUD_COLOR_STRONG };
}

/** 赤い線（標的が大発）: 撃つ前は「航過！」、撃ち始めたら「掃射！」。かわす向きは出さない（線の先は大発。自艇は寄って撃ち返す） */
export function convoyPassLine(fired: boolean): HudLine {
  return { text: `米PT ${fired ? '掃射' : '航過'}！ 大発を狙う ・ ${FIGHT_BACK_JA}`, color: HUD_COLOR_WARN };
}

/** 突撃（標的が大発）: PT が見えていれば方角と距離、音だけなら方角だけ */
export function convoyRushLine(dirJa: string, distM: number, seen: boolean): HudLine {
  return { text: seen ? `米PT ${dirJa}から突撃 ${distM} m ・ 大発を狙う ・ ${FIGHT_BACK_JA}` : `米PT のエンジン音 ・ ${dirJa}から突撃 ・ 大発を狙う`, color: HUD_COLOR_WARN };
}

/**
 * 航過の結果（最後の攻撃の標的が大発）: 命中（標的の船体だけ。systems/pt-target の lastAttackTargetHits）か「被弾なし」。撃たずに終わった航過（上陸・沈没で標的を失った）は
 * 「大発への航過 撃たず」（強調色。「撃たせなかった！」とは言わない＝失った大発を褒めない。spec §C.5・§I.3）。hits < 0 が撃たず。
 * 撃つ前にその PT を 25mm で黙らせた（撃退・撃沈。silenced。v0.6.4 レビュー ux-7）なら「大発を守った！ 撃たせなかった」（味方の青）
 */
export function convoyPassResultLine(hits: number, damagePerHit: number, tally: string, silenced = false): HudLine {
  if (hits < 0 && silenced) return { text: `大発を守った！ 撃たせなかった ・ ${tally}`, color: HOME_COLOR_TEXT };
  if (hits < 0) return { text: `大発への航過 撃たず ・ ${tally}`, color: HUD_COLOR_STRONG };
  if (hits === 0) return { text: `大発 被弾なし ・ ${tally}`, color: HOME_COLOR_TEXT };
  return { text: `大発 被弾 ${hits} 発（HP −${hits * damagePerHit}） ・ ${tally}`, color: HUD_COLOR_STRONG };
}

/** 離脱の行に挟む「大発のそばへ戻れ（N m） ・ 」（nearStep は convoyNearStep。0 なら ''） */
export function convoyBreakTailJa(nearStep: number): string {
  return nearStep > 0 ? `大発のそばへ戻れ（${nearStep * CONVOY_MARKER_STEP_M} m） ・ ` : '';
}

/**
 * 出来事の行（CONVOY_EVENT_SHOW_MS の間。13mm の出来事の下・航過の結果の上）: 沈没は警告色で「近づいて撃ち返せ」、残りが無ければ全滅（上陸が 0）か上陸の数と帰投。
 * 上陸は味方の青。最後の 1 隻の上陸（残り 0）は「大発 上陸 k/n ・ 帰投せよ」（v0.6.4 実機 1 回目のレビュー ux-2。呼びかけと同じ語で、赤い線・13mm の出来事の下で 1 度出るまで待つ）
 */
export function convoyEventLine(c: ConvoyTelemetry, event: number): HudLine {
  if (event === CONVOY_EV_ARRIVED) return { text: c.afloat > 0 ? `大発 上陸 ${c.arrived}/${c.total} ・ 残り ${c.afloat} 隻` : `大発 上陸 ${c.arrived}/${c.total} ・ 帰投せよ`, color: HOME_COLOR_TEXT };
  if (c.afloat > 0) return { text: `大発 1 隻 沈没 ・ 残り ${c.afloat} 隻 ・ ${FIGHT_BACK_JA}`, color: HUD_COLOR_WARN };
  return { text: c.arrived === 0 ? '大発 全滅 ・ 帰投せよ' : `大発 1 隻 沈没 ・ 上陸 ${c.arrived}/${c.total} ・ 帰投せよ`, color: HUD_COLOR_WARN };
}

/** 呼びかけの語（決着＝CALL_SUNK のとき hud-lines の callLabel が「撃沈！」の代わりに返す）: 「大発 上陸 2/3 ・ 」、1 隻も届かなければ「大発 全滅 ・ 」。後ろに mission-line の「帰投せよ  N m」 */
export function convoyCallJa(c: ConvoyTelemetry): string {
  return c.arrived === 0 ? '大発 全滅 ・ ' : `大発 上陸 ${c.arrived}/${c.total} ・ `;
}

/**
 * Result の本文 1 行目（24 px・強調）: 上陸・沈没・ノルマ・隊の被弾（data の barge_hp を合わせる根拠。CLAUDE.md §9）。まだ航行中の大発があれば「航行中 N」（ux-9: 上陸の前に終わった夜の達成 0 の訳）。
 * verdict（ハードの違いのある任務のハードだけ。result-scene が objectiveDone を渡す）があれば、ノルマを上陸の後ろに「（ノルマ 3 ・ 達成／未達）」（v0.6.6 レビュー ux:ux-7: ノルマ 3 では 1 隻の沈没で未達になり、
 * 「沈没 1（ノルマ 3）」が沈んでよい数に読めた）。省けば今の行（ノーマルの pin）。
 * 達成でなくノルマの数は上陸した夜（達成＝帰投してノルマ以上＝core/mission-flow の convoyObjectiveDone なので、帰投しなかった）は「帰投なし」（v0.6.6 最終確認: 3 隻とも上陸して沈んだ夜が
 * 「上陸 3/3（ノルマ 3 ・ 未達）」と食い違って読めた。ヘッドレスの 16 夜で 2 夜）
 */
export function convoyResultLine(c: ConvoyResult, verdict?: boolean): string {
  const sailing = c.total - c.arrived - c.sunk;
  const head = verdict === undefined ? `大発 上陸 ${c.arrived}/${c.total} ・ 沈没 ${c.sunk}（ノルマ ${c.quota}）` : `大発 上陸 ${c.arrived}/${c.total}（ノルマ ${c.quota} ・ ${verdict ? '達成' : c.arrived >= c.quota ? '帰投なし' : '未達'}） ・ 沈没 ${c.sunk}`;
  return `${head} ・ 大発の被弾 ${c.hitsTaken} 発${sailing > 0 ? ` ・ 航行中 ${sailing}` : ''}`;
}

/** Result の状況の行の頭: 「大発 2/3 ・ 米PT: 撃退 1 ・ 健在 1 隻」（ptHead は ui/pt-lines の ptHeadJa。届けた／届かずは 1 行目の「（ノルマ 2）」が言う） */
export function convoyHeadJa(c: ConvoyResult, ptHead: string): string {
  return `大発 ${c.arrived}/${c.total} ・ ${ptHead}`;
}
