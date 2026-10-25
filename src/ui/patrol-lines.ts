// 夜の哨戒機（v0.6.7。jp_02「孤島の哨戒」。spec-v067 §D.2・§D.3）の HUD の文とキー: 2 行目のモード 31〜34（発見と夜の出撃・捜索・去る・平常）と、3 行目の空からの見え方。
// 「14」は t.patrol.quietKt（自艇の静音の上限）、方角は compass8Ja（8 方位）、距離は 100 m 刻みの切り上げ。旋回・進路・落下の句は夜明けの空襲と同じ字（ui/dawn-lines）。
// キーの欄の上限は core/patrol-air-state の PA_KEY_*（起動時の検査 C9 が data と結ぶ）。秒は整数（1 回/秒）、距離は 100 m 刻み（機の接近中は約 3 回/秒。水上機・夜明けの空襲の接近の行と同じ）＝値が変わったときだけ組む（§7）。どのキーも 0 < key < 2¹⁸。
// Phaser も DOM を読む config も使わない（文を組むだけ。tests から型検査ごと読める）。
import { HOME_COLOR_TEXT, HUD_COLOR_STRONG, HUD_COLOR_WARN, PLANE_DISTANCE_STEP_M } from '../config/hud-text-config';
import { AS_T_FALLING, AS_T_INBOUND, AS_T_ORBIT, AS_T_REST, AS_T_RUN } from '../core/air-strike';
import type { BoatTelemetry, SpeedStep } from '../core/boat-motion';
import {
  PA_HUNT, PA_KEY_BOMBS_MAX, PA_KEY_DIST_HM_MAX, PA_KEY_HP5_MAX, PA_KEY_NEAR_HM_MAX, PA_KEY_SEC_MAX, PA_KEY_WAKE_S_MAX, PA_OFF, PA_ORBIT, PA_PASS, PA_SORTIE, patrolWakeLine, type PatrolTelemetry,
} from '../core/patrol-air';
import { wrapDeg360 } from '../core/units';
import { airRaidTagJa, compass8Ja, strikeFallJa, strikeOrbitJa, strikeRunJa } from './dawn-lines';
import type { HudLine } from './hud-lines';
import { MISSION_PATROL, MISSION_PATROL_ATTACK, MISSION_PATROL_PASS, MISSION_PATROL_RESULT } from './mission-mode';

/** 夜の哨戒機の 4 つのモード（31〜34） */
export const patrolModeOf = (mode: number): boolean => mode >= MISSION_PATROL_ATTACK && mode <= MISSION_PATROL;

/** 捜索の副（モード 32）: レーダー・航跡の秒読み・定時の秒読み・今すぐ（航跡）・今すぐ（静音）・止まって待つ・付近の捜索 */
export const PATROL_PASS_RADAR = 0;
export const PATROL_PASS_WAKE = 1;
export const PATROL_PASS_SWEEP = 2;
export const PATROL_PASS_NOW_WAKE = 3;
export const PATROL_PASS_NOW_HULL = 4;
export const PATROL_PASS_HOLD = 5;
export const PATROL_PASS_ORBIT = 6;
/** 平常の副（モード 34）: レーダーの前・捜索中・航跡を数えている・夜の哨戒の後（夜明け・沈没・輪。夜明けの後は夜明けの空襲の行が上に出るので、ここは ?debug&nostrike と終わり際だけ） */
export const PATROL_NORMAL_RADAR = 0;
export const PATROL_NORMAL_HUNT = 1;
export const PATROL_NORMAL_WAKE = 2;
export const PATROL_NORMAL_OFF = 3;
/** モード 34 のキーの印（副 0 と北で 0 にならない） */
const NORMAL_KEY_TAG = 1 << 17;

const wakeBand = (b: SpeedStep): boolean => b === 'cruise' || b === 'full';
const distHm = (m: number): number => (Number.isFinite(m) && m > 0 ? Math.ceil(m / PLANE_DISTANCE_STEP_M) : 0);
const secs = (s: number): number => (Number.isFinite(s) && s > 0 ? Math.ceil(s) : 0);
const cap = (x: number, max: number): number => (x < max ? x : max);
/** 方位の 8 方位の番号（北 0・時計回り。compass8Ja と同じ丸め） */
const dirIdx = (deg: number): number => (Number.isFinite(deg) ? Math.round(wrapDeg360(deg) / 45) % 8 : 0);

/** モード 32 の副（捜索の接近・付近の捜索）。止まっていれば秒読みの前でも「止まったまま待て」（2 行目と 3 行目が食い違わない） */
export function patrolPassSub(p: PatrolTelemetry, band: SpeedStep): number {
  if (p.phase === PA_ORBIT) return PATROL_PASS_ORBIT;
  if (p.radar) return PATROL_PASS_RADAR;
  if (band === 'stop') return PATROL_PASS_HOLD;
  if (p.countdownS > 0) return p.viaWake ? PATROL_PASS_WAKE : PATROL_PASS_SWEEP;
  return wakeBand(band) ? PATROL_PASS_NOW_WAKE : PATROL_PASS_NOW_HULL;
}

/** モード 34 の副。航跡の行は航跡の帯で数えていて定時より先に届く間だけ（core/patrol-air の patrolWakeLine。減っている間は「次の捜索まで」。レビュー ux:ux-1） */
export function patrolNormalSub(p: PatrolTelemetry, band: SpeedStep): number {
  if (p.phase === PA_OFF) return PATROL_NORMAL_OFF;
  if (p.phase === PA_HUNT && p.passes === 0) return PATROL_NORMAL_RADAR;
  return patrolWakeLine(p, band) ? PATROL_NORMAL_WAKE : PATROL_NORMAL_HUNT;
}

/**
 * 2 行目のキー（モードごとの欄。spec §D.2 の欄の並び。31 の機の番号は 2 ビット＝AIR_STRIKE_MAX_PLANES 4 機まで）:
 * 31 脅威 0〜2・機 3〜4・落下の弧 5・レーダー 6・方角 7〜9・距離/100 10〜14・残り爆弾 15〜17（文に出る値だけ入れる）／
 * 32 副 0〜2・方角 3〜5・距離/100 6〜11・秒（秒読みか付近の残り）12〜16／33 種類 0〜1・爆弾 2〜4・命中 5〜7・失った HP/5 8〜12／34 副 0〜1・次の捜索の秒 2〜6・航跡の残り秒 7〜9・方角 10〜12・印 17
 */
export function patrolKey(t: BoatTelemetry, mode: number): number {
  const p = t.patrol;
  if (mode === MISSION_PATROL_ATTACK) {
    const th = p.threat;
    const plane = th === AS_T_ORBIT || th === AS_T_RUN ? cap(p.plane < 0 ? 0 : p.plane, 3) : 0;
    const inbound = th === AS_T_INBOUND;
    return th | (plane << 3) | (th === AS_T_FALLING && p.fallingArc ? 1 << 5 : 0) | (inbound && p.radar ? 1 << 6 : 0) | ((inbound ? dirIdx(p.bearingDeg) : 0) << 7) | (cap(inbound ? distHm(p.distM) : 0, PA_KEY_NEAR_HM_MAX) << 10) | (cap(th === AS_T_ORBIT ? p.bombsLeft : 0, PA_KEY_BOMBS_MAX) << 15);
  }
  if (mode === MISSION_PATROL_PASS) {
    const sub = patrolPassSub(p, t.targetStep);
    const orbit = sub === PATROL_PASS_ORBIT;
    const sec = sub === PATROL_PASS_WAKE || sub === PATROL_PASS_SWEEP ? secs(p.countdownS) : orbit ? secs(p.orbitLeftS) : 0;
    return sub | ((orbit ? 0 : dirIdx(p.bearingDeg)) << 3) | (cap(orbit ? 0 : distHm(p.distM), PA_KEY_DIST_HM_MAX) << 6) | (cap(sec, PA_KEY_SEC_MAX) << 12);
  }
  if (mode === MISSION_PATROL_RESULT) {
    const sortie = p.resultKind === 2;
    return p.resultKind | (cap(sortie ? p.sortieBombs : 0, PA_KEY_BOMBS_MAX) << 2) | (cap(sortie ? p.sortieHits : 0, PA_KEY_BOMBS_MAX) << 5) | (cap(sortie ? Math.ceil(p.sortieDamage / 5) : 0, PA_KEY_HP5_MAX) << 8);
  }
  if (mode === MISSION_PATROL) {
    const sub = patrolNormalSub(p, t.targetStep);
    const next = sub === PATROL_NORMAL_HUNT ? secs(p.nextPassS) : 0;
    const wake = sub === PATROL_NORMAL_WAKE ? secs(p.wakeLeftS) : 0;
    return NORMAL_KEY_TAG | sub | (cap(next, PA_KEY_SEC_MAX) << 2) | (cap(wake, PA_KEY_WAKE_S_MAX) << 7) | ((sub === PATROL_NORMAL_RADAR ? dirIdx(p.bearingDeg) : 0) << 10);
  }
  return 0;
}

const where = (p: PatrolTelemetry): string => `${compass8Ja(p.bearingDeg)} ${distHm(p.distM) * PLANE_DISTANCE_STEP_M} m`;

/** 2 行目の文と色（モード 31〜34 のときだけ呼ぶ。キャッシュは ui/mission-line の lastPatrolKey） */
export function patrolLine(t: BoatTelemetry, mode: number): HudLine {
  const p = t.patrol;
  if (mode === MISSION_PATROL_ATTACK) {
    if (p.threat === AS_T_FALLING) return { text: strikeFallJa(p.fallingArc), color: HUD_COLOR_WARN };
    if (p.threat === AS_T_RUN) return { text: strikeRunJa(p.plane), color: HUD_COLOR_WARN };
    if (p.threat === AS_T_ORBIT) return { text: strikeOrbitJa(p.plane, p.bombsLeft), color: HUD_COLOR_STRONG };
    return { text: `${p.radar ? 'レーダーで発見！' : '発見された！'} 敵機 ${p.planes} 機 ・ ${where(p)} ・ 全速で走り 投下で転舵`, color: HUD_COLOR_WARN };
  }
  if (mode === MISSION_PATROL_PASS) {
    const sub = patrolPassSub(p, t.targetStep);
    const cd = secs(p.countdownS);
    if (sub === PATROL_PASS_RADAR) return { text: `レーダーで捉えられた！ 敵機 ${p.planes} 機 ・ ${where(p)} ・ 止まっても見つかる`, color: HUD_COLOR_WARN };
    if (sub === PATROL_PASS_WAKE) return { text: `航跡を見られた！ 敵機 ${where(p)} ・ あと ${cd} 秒で止まれ`, color: HUD_COLOR_WARN };
    if (sub === PATROL_PASS_SWEEP) return { text: `敵機の捜索 ${where(p)} ・ あと ${cd} 秒で止まれ（止まれば見えない）`, color: HUD_COLOR_STRONG };
    if (sub === PATROL_PASS_NOW_WAKE) return { text: `今すぐ止まれ！ 敵機 ${where(p)} ・ 航跡は ${p.lockM} m で見つかる`, color: HUD_COLOR_WARN };
    if (sub === PATROL_PASS_NOW_HULL) return { text: `今すぐ止まれ！ 敵機 ${where(p)} ・ 動く船体は ${p.nearM} m で見つかる`, color: HUD_COLOR_WARN };
    if (sub === PATROL_PASS_HOLD) return { text: `止まったまま待て ・ 敵機 ${where(p)} ・ 止まっていれば見えない`, color: HUD_COLOR_STRONG };
    return { text: `敵機が付近を捜索 ・ 止まったまま あと ${secs(p.orbitLeftS)} 秒（動けば見つかる）`, color: HUD_COLOR_STRONG };
  }
  if (mode === MISSION_PATROL_RESULT) {
    if (p.resultKind !== 2) return { text: '敵機は見つけられずに去る ・ また捜しに来る', color: HOME_COLOR_TEXT };
    const hp = p.sortieHits > 0 ? `（HP −${Math.ceil(p.sortieDamage)}）` : '';
    return { text: `敵機 去る ・ 爆弾 ${p.sortieBombs} 発 命中 ${p.sortieHits}${hp} ・ また捜しに来る`, color: HUD_COLOR_STRONG };
  }
  const sub = patrolNormalSub(p, t.targetStep);
  if (sub === PATROL_NORMAL_RADAR) return { text: `レーダーに捉えられている ・ 敵機 ${p.planes} 機が${compass8Ja(p.bearingDeg)}から来る`, color: HUD_COLOR_WARN };
  if (sub === PATROL_NORMAL_WAKE) return { text: `航跡が出ている ・ あと ${secs(p.wakeLeftS)} 秒で敵機が寄ってくる（${p.quietKt} kt 以下で消える）`, color: HUD_COLOR_WARN };
  if (sub === PATROL_NORMAL_OFF) return { text: `${airRaidTagJa(t)}夜の哨戒機は去った ・ 帰投せよ`, color: HUD_COLOR_STRONG };
  return { text: `敵機は捜索中 ・ 次の捜索まで ${secs(p.nextPassS)} 秒 ・ ${p.quietKt} kt を超えると航跡で早く来る`, color: HUD_COLOR_STRONG };
}

/** 3 行目の状態の番号（40 番台。今の 0〜33 と重ならない）: 出撃中・レーダーで見えている・航跡・動く船体・止まって見えない・夜明けの空襲。哨戒の無い任務と、空襲の無い OFF（沈没・?debug&nostrike）は -1（今の 3 行目） */
export const PATROL_STATUS_SORTIE = 40;
export const PATROL_STATUS_RADAR = 41;
export const PATROL_STATUS_WAKE = 42;
export const PATROL_STATUS_HULL = 43;
export const PATROL_STATUS_HIDDEN = 44;
export const PATROL_STATUS_DAWN = 45;

/**
 * 3 行目の状態（優先: 出撃中 > レーダーの前とレーダーの捜索（帯より上。出撃は止まって始まる＝無いと最初の 17 秒に「止まっていて見えない」と嘘を言う。R4）> 帯）。
 * 出撃中は機が爆弾を落とし切って去るまで（脅威が波の合間 REST の間は帯の状態。2 行目「敵機 去る」の下で古い「全速で走り」を出さない。レビュー ux:ux-4）。
 * dawnRaid（夜明けに達していて空襲がある）なら OFF の後は「夜明けの空襲（止まっても見える）」（2 行目の空襲と食い違わない。艦影の行の「未発見」を出さない。レビュー ai・ux:ux-3）
 */
export function patrolStatusOf(p: PatrolTelemetry, band: SpeedStep, dawnRaid = false): number {
  if (!p.enabled) return -1;
  if (p.phase === PA_OFF) return dawnRaid ? PATROL_STATUS_DAWN : -1;
  if (p.phase === PA_SORTIE && p.threat !== AS_T_REST) return PATROL_STATUS_SORTIE;
  if ((p.phase === PA_HUNT && p.passes === 0) || ((p.phase === PA_PASS || p.phase === PA_ORBIT) && p.radar)) return PATROL_STATUS_RADAR;
  if (wakeBand(band)) return PATROL_STATUS_WAKE;
  return band === 'silent' ? PATROL_STATUS_HULL : PATROL_STATUS_HIDDEN;
}

/** 3 行目の文と警告色か（状態が変わったときだけ ui/boat-hud が書く。警告でなければ HUD の地の色） */
export function patrolStatusLine(p: PatrolTelemetry, status: number): { text: string; warn: boolean } {
  if (status === PATROL_STATUS_SORTIE) return { text: '発見された ・ 全速で走り 投下で転舵', warn: true };
  if (status === PATROL_STATUS_RADAR) return { text: '空から ・ レーダーで見えている（止まっても）', warn: true };
  if (status === PATROL_STATUS_WAKE) return { text: `空から ・ 航跡は ${p.wakeDetectM} m で見える`, warn: true };
  if (status === PATROL_STATUS_HULL) return { text: `空から ・ 動く船体は ${p.nearM} m で見える`, warn: false };
  if (status === PATROL_STATUS_DAWN) return { text: '空から ・ 夜明けの空襲（止まっても見える）', warn: true };
  return { text: '空から ・ 止まっていて見えない', warn: false };
}
