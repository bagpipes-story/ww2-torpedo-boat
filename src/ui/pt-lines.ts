// 敵の米PT（v0.6.3。docs/02 §6.4、spec §D.1・§D.4）の HUD と Result の文: 2 行目の航過（予告・掃射とかわす向き）・接触（航過の結果・突撃・離脱）・
// 平常（見えている PT・哨戒・去る／去った）とそのキャッシュのキー、Result の本文の 3 行と状況の行の頭。
// Phaser も DOM を読む config も使わない（文を組むだけ。tests から型検査ごと読める）。距離（平方根 1 回）と方角（atan2 1 回）は ptKey が、それを出すモードのときだけ
// 1 フレーム 1 回求めてキーに詰める。文（ptLine）はキーから距離と方角を読み、キーが変わったときだけ組む（ui/mission-line がキーでキャッシュする）。
import { HOME_COLOR_TEXT, HUD_COLOR_STRONG, HUD_COLOR_WARN } from '../config/hud-text-config';
import type { BoatTelemetry } from '../core/boat-motion';
import { bearingJa } from '../core/briefing';
import { PT_ALERT, PT_RUN_IN } from '../core/pt-boats';
import { radToDeg, wrapDeg360 } from '../core/units';
import { DETECT_RANGE_STEP_M, STEP_LABEL, type HudLine } from './hud-lines';
import { MISSION_PT_CONTACT, MISSION_PT_PASS, ptResultShown } from './mission-mode';
import type { PtResult } from './result-types';

/** 2 行目の米PT までの距離の刻み m（切り上げ。表示が実際より遠くならない。画面外の矢印も米PT の任務は切り上げ） */
export const PT_DISTANCE_STEP_M = 50;

/** かわす向き（core の dodge −1 左 / 0 そのまま / +1 右 → 添字 0 / 1 / 2。航過を固めた瞬間に 1 回決まり点滅しない） */
const DODGE_JA = ['左へ転舵・全速', 'そのまま全速で離れろ', '右へ転舵・全速'] as const;

/** 接触の行の種類（キーの下 3 ビット）: 航過の結果（被弾なし・被弾）、突撃（PT が見えている・音だけ）、離脱 */
const C_CLEAN = 1;
const C_HIT = 2;
const C_RUSH_SEEN = 3;
const C_RUSH_HEARD = 4;
const C_BREAK = 5;
/** 平常の行の種類: 見えている PT（停止・静音／巡航・全速）、見えていない、みな去る（海域の外へ出たかはキーの別のビット） */
const N_SLOW = 1;
const N_FAST = 2;
const N_UNSEEN = 3;
const N_GONE = 4;

/** 艇から (dx, dy) の 8 方位の添字（bearingJa と同じ丸め。北 0・時計回り） */
function dirIndex(dx: number, dy: number): number {
  return Math.round(wrapDeg360(radToDeg(Math.atan2(dx, -dy))) / 45) % 8;
}

/** 距離の刻み（切り上げ、63 まで＝3,150 m。見えている PT は視程の内なので届かない） */
function distStep(dx: number, dy: number): number {
  return Math.min(63, Math.ceil(Math.sqrt(dx * dx + dy * dy) / PT_DISTANCE_STEP_M));
}

/** 接触の行の種類: 撃った航過の結果の表示中（ui/mission-mode の ptResultShown）→ 結果、脅威の PT が警戒・突撃 → 突撃、ほか（離脱・航過の合間）→ 離脱 */
function contactSub(t: BoatTelemetry, flags: number): number {
  const p = t.pt;
  if (ptResultShown(t, flags)) return p.lastPassHits > 0 ? C_HIT : C_CLEAN;
  if (p.threatPhase === PT_ALERT || p.threatPhase === PT_RUN_IN) return p.sighted ? C_RUSH_SEEN : C_RUSH_HEARD;
  return C_BREAK;
}

/**
 * 2 行目のキー（mode は MISSION_PT_PASS / MISSION_PT_CONTACT / MISSION_PT、flags は MODE_FLAG_*）。整数だけで、モードごとに 1 つの詰め方（どれも 32 ビットに収まる）。
 * 航過: 撃った | かわす向き + 1 << 1。接触: 種類 | 方位 << 3 | 距離の刻み << 6 | 残り << 12 | 航過の数 << 16 | 被弾 << 20。
 * 平常: 種類 | 方位 << 3 | 距離の刻み << 6 | 見つかる距離の刻み << 12 | 隻数 << 18 | 夜明け << 21 | みな海域の外 << 22。行に出ない値は 0（無駄に組み直さない）
 */
export function ptKey(t: BoatTelemetry, mode: number, flags: number): number {
  const p = t.pt;
  if (mode === MISSION_PT_PASS) return (p.fired ? 1 : 0) | ((p.dodge + 1) << 1);
  if (mode === MISSION_PT_CONTACT) {
    const sub = contactSub(t, flags);
    const rush = sub === C_RUSH_SEEN || sub === C_RUSH_HEARD;
    const left = sub === C_BREAK ? Math.min(15, Math.max(0, p.maxPasses - p.passes)) : 0;
    const n = sub === C_CLEAN || sub === C_HIT ? Math.min(15, p.passes) : 0;
    const h = sub === C_HIT ? Math.min(63, p.lastPassHits) : 0;
    return sub | ((rush ? dirIndex(p.dx, p.dy) : 0) << 3) | ((sub === C_RUSH_SEEN ? distStep(p.dx, p.dy) : 0) << 6) | (left << 12) | (n << 16) | (h << 20);
  }
  const slow = t.targetStep === 'stop' || t.targetStep === 'silent';
  const sub = p.alive === 0 ? N_GONE : p.sighted ? (slow ? N_SLOW : N_FAST) : N_UNSEEN;
  const det = sub === N_FAST ? Math.min(63, Math.round(t.detectRangeM / DETECT_RANGE_STEP_M)) : 0;
  const d = sub === N_SLOW || sub === N_FAST ? distStep(p.dx, p.dy) : 0;
  const gone = sub === N_GONE ? (t.dawn.reached ? 1 : 0) | (p.out >= p.total ? 2 : 0) : 0;
  return sub | ((sub === N_SLOW ? dirIndex(p.dx, p.dy) : 0) << 3) | (d << 6) | (det << 12) | ((sub === N_UNSEEN ? Math.min(7, p.alive) : 0) << 18) | (gone << 21);
}

/** 2 行目の文と色（key は同じフレームの ptKey。距離・方角・見つかる距離はキーから、航過の数・被弾・隻数はテレメトリから） */
export function ptLine(t: BoatTelemetry, mode: number, key: number): HudLine {
  const p = t.pt;
  if (mode === MISSION_PT_PASS) return { text: `PT ${(key & 1) !== 0 ? '掃射' : '航過'}！ ${DODGE_JA[(key >> 1) & 3]!}`, color: HUD_COLOR_WARN };
  const sub = key & 7;
  const dir = bearingJa(((key >> 3) & 7) * 45);
  const d = ((key >> 6) & 63) * PT_DISTANCE_STEP_M;
  if (mode === MISSION_PT_CONTACT) {
    const tally = `航過 ${p.passes}/${p.maxPasses}`;
    if (sub === C_CLEAN) return { text: `かわした！ 被弾なし ・ ${tally}`, color: HOME_COLOR_TEXT };
    if (sub === C_HIT) return { text: `被弾 ${p.lastPassHits} 発（HP −${p.lastPassHits * p.damagePerHit}） ・ ${tally}`, color: HUD_COLOR_STRONG };
    if (sub === C_RUSH_SEEN) return { text: `米PT ${dir}から突撃 ${d} m ・ 赤い線で転舵`, color: HUD_COLOR_WARN };
    if (sub === C_RUSH_HEARD) return { text: `米PT のエンジン音 ・ ${dir}から突撃`, color: HUD_COLOR_WARN };
    return { text: `米PT 離脱 ・ 残り ${Math.max(0, p.maxPasses - p.passes)} 回 ・ 静音で見失わせろ`, color: HUD_COLOR_STRONG };
  }
  if (sub === N_SLOW) return { text: `米PT ${d} m（${dir}） ・ 気づかれていない ・ 静音でやり過ごせ`, color: HUD_COLOR_STRONG };
  if (sub === N_FAST) return { text: `米PT ${d} m ・ 速い！ ${((key >> 12) & 63) * DETECT_RANGE_STEP_M} m で見つかる ・ ${p.silentMaxKt} kt 以下に`, color: HUD_COLOR_WARN };
  if (sub === N_UNSEEN) return { text: `米PT ${p.alive} 隻が哨戒中 ・ 静音で抜けて帰投`, color: HUD_COLOR_STRONG };
  // みな去る: 去る途中（海域の外へ出ていない PT がいる）は「去る」、みな出たら「去った」
  return { text: `${((key >> 21) & 1) !== 0 ? '夜明け ・ ' : ''}米PT は${p.leaveDirJa}へ${((key >> 22) & 1) !== 0 ? '去った' : '去る'} ・ 帰投せよ`, color: HUD_COLOR_STRONG };
}

/** Result の被弾の句: 0 発は「被弾なし」、ほかは「被弾 N 発（HP −x）」 */
function hitsJa(r: PtResult): string {
  return r.hits === 0 ? '被弾なし' : `被弾 ${r.hits} 発（HP −${r.hits * r.damagePerHit}）`;
}

/**
 * Result の本文（spec §D.4。魚雷の行の代わり）: 1 行目 航過・かわした（撃たれた航過のうち無傷。撃たれた航過が無ければ出さない）・被弾、2 行目 見つかった回数と最初の距離・速力帯・見失わせた回数
 * （一度も見つからなければ PT の最接近）、3 行目 予告から初弾までの最短秒と撃たれた弾（data/enemies.json の調整の根拠。CLAUDE.md §9）。detections は MissionResult.detections、
 * returned は帰投した（見つからずに漂流で終わった夜を「抜けた」と言わない）
 */
export function ptResultLines(r: PtResult, detections: number, returned: boolean): [string, string, string] {
  const seen = detections > 0;
  const band = r.firstDetectBand === '' ? '—' : STEP_LABEL[r.firstDetectBand];
  const dodged = r.firedPasses > 0 ? ` ・ かわした ${r.cleanPasses}/${r.firedPasses}` : '';
  return [
    seen ? `米PT 航過 ${r.passes} 回${dodged} ・ ${hitsJa(r)}` : returned ? '米PT に一度も見つからずに抜けた' : '米PT に一度も見つからなかった',
    seen ? `見つかった ${detections} 回（最初 ${Math.round(r.firstDetectM)} m ・ ${band}） ・ 見失わせた ${r.lostContacts} 回` : `見つからず ・ PT の最接近 ${Number.isFinite(r.closestM) ? Math.round(r.closestM) : '—'} m`,
    `予告から初弾まで 最短 ${Number.isFinite(r.minWarnS) ? r.minWarnS.toFixed(1) : '—'} 秒 ・ 撃たれた弾 ${r.shots} 発`,
  ];
}

/** Result の状況の行の頭（駆逐艦の「駆逐艦: 撃沈」の代わり）: 夜明けに去った／みな去った（去る途中も）／健在 N 隻（去っていない PT） */
export function ptHeadJa(r: PtResult): string {
  if (r.leftAtDawn) return '米PT: 夜明けに去った';
  return r.alive === 0 ? '米PT: 去った' : `米PT: 健在 ${r.alive} 隻`;
}
