// HUD の文と表（v0.4.1 で boat-hud.ts から切り出し）: 速力段・3 行目の状態・「帰投せよ」の理由、味方機・敵の水上機・射撃と大発（v0.4.2）の 2 行目、Result の「敵機:」と大発の行。
// Phaser は使わない（文を組むだけ）。2 行目の文は値が変わったときだけ組む（呼ぶ側がキャッシュする）。
import { HOME_COLOR_TEXT, HUD_COLOR_STRONG, HUD_COLOR_WARN, PLANE_DISTANCE_STEP_M, SHALLOW_WARN_STEP_M } from '../config/ui-config';
import type { BoatTelemetry, SpeedStep } from '../core/boat-motion';
import { FF_OUT_IDENTIFIED, FF_STRAFE } from '../core/friendly';
import { CALL_DAWN, CALL_EXPENDED, CALL_FUEL, CALL_SUNK } from '../core/mission-flow';
import { SP_APPROACH, SP_FLARE_PASS, SP_LEAVING, SP_ORBIT, SP_OUT_BOMBED, SP_OUT_LOST, SP_RUN } from '../core/seaplane';
import { GUN_BLOCKED, GUN_FIRING, GUN_OUT_OF_ARC, GUN_OUT_OF_RANGE } from '../core/gun-battery';
import { SHALLOW_APPROACHING, SHALLOW_INSIDE } from '../core/shallows';

export const STEP_LABEL: Record<SpeedStep, string> = {
  stop: '停止',
  silent: '静音',
  cruise: '巡航',
  full: '全速',
};

/** 敵影×発見×照射×照明弾の 16 状態。index = (敵影あり ? 1 : 0) | (発見された ? 2 : 0) | (照らされている ? 4 : 0) | (照明弾 ? 8 : 0) */
const STATUS_BASE = ['敵影なし ・ 未発見', '敵影あり ・ 未発見', '敵影なし ・ 発見された！', '敵影あり ・ 発見された！'] as const;
const STATUS_LIT: readonly string[] = [
  ...STATUS_BASE,
  ...STATUS_BASE.map((s) => `${s} ・ 探照灯に照射中！`),
  ...STATUS_BASE.map((s) => `${s} ・ 照明弾！`),
  ...STATUS_BASE.map((s) => `${s} ・ 照明弾！`),
];
/** bit0 敵影, bit1 発見, bit2 探照灯, bit3 照明弾（艦の星弾か水上機の照明弾）, bit4 煙幕に隠れている（隠れている間は照らされないので照射の文は出ない） */
export const STATUS_LABEL: readonly string[] = [...STATUS_LIT, ...STATUS_LIT.map((_, i) => `${STATUS_BASE[i & 3]!} ・ 煙幕に隠れている`)];
/** 撃沈後の 3 行目（見つかる距離は付けない） */
export const STATUS_SUNK = 32;
/** 発見距離の表示刻み m（速力段ごとの段階値なので、変わるのは段が変わったときだけ） */
export const DETECT_RANGE_STEP_M = 50;
/** 2 行目「帰投せよ」の理由（core/mission-flow のビット → 文言） */
export const CALL_LABEL: Record<number, string> = {
  [CALL_FUEL]: '燃料少 ',
  [CALL_DAWN]: '夜明け近し ',
  [CALL_SUNK]: '撃沈！',
  [CALL_EXPENDED]: '魚雷なし ',
};

/** 「帰投せよ」の理由の文。大発の任務（v0.4.2）は撃沈ではなく「撃破！」（ノルマ達成）、撃ち尽くしではなく「大発なし」（すべて撃破か上陸） */
export function callLabel(call: number, gunMission: boolean): string {
  if (gunMission && call === CALL_SUNK) return '撃破！';
  if (gunMission && call === CALL_EXPENDED) return '大発なし ';
  return CALL_LABEL[call] ?? '';
}

/** 射撃中の大発までの距離の刻み m（2 行目の文が変わる細かさ。v0.4.2） */
export const GUN_DISTANCE_STEP_M = 10;

export interface HudLine {
  text: string;
  color: string;
}

/** 攻撃中・識別中に浅瀬・暴風の警告が重なれば後ろに付ける */
function withWarnings(text: string, t: BoatTelemetry, shallowStep: number, stormWarn: boolean): string {
  if (t.shallowState === SHALLOW_APPROACHING) return `${text} ・ 浅瀬 ${shallowStep * SHALLOW_WARN_STEP_M} m 減速`;
  if (t.shallowState === SHALLOW_INSIDE) return `${text} ・ 浅瀬 ${t.shallowSafeKt} kt 以下`;
  if (stormWarn) return `${text} ・ 暴風 ${t.stormSafeKt} kt 以下`;
  return text;
}

/** 味方機の 2 行目（識別を求めている / 航過中。真上を過ぎてから押した後は「識別完了」） */
export function friendlyLine(t: BoatTelemetry, ffLeft: number, shallowStep: number, stormWarn: boolean): HudLine {
  if (t.friendlyPhase === FF_STRAFE && t.friendlyPending) return { text: withWarnings('識別完了 ・ 味方機が離れる', t, shallowStep, stormWarn), color: HOME_COLOR_TEXT };
  const text = t.friendlyPhase === FF_STRAFE ? '味方機の誤射！ ・ 識別せよ' : t.friendlyPasses > 0 ? `味方機 再接近 ・ 識別せよ ${ffLeft}` : `味方機接近 ・ 識別せよ ${ffLeft}`;
  return { text: withWarnings(text, t, shallowStep, stormWarn), color: HUD_COLOR_WARN };
}

/** 味方機の結果（去る間） */
export function friendlyResultLine(t: BoatTelemetry): HudLine {
  if (t.friendlyOutcome === FF_OUT_IDENTIFIED) return { text: '識別完了 ・ 味方機が離れる', color: HOME_COLOR_TEXT };
  return { text: `味方機が離れた ・ 誤射 ${t.friendlyPasses} 回`, color: HUD_COLOR_STRONG };
}

/** 水上機の攻撃（発見確定〜爆撃）か（2 行目の優先順で味方機より上） */
export function planeAttacking(t: BoatTelemetry): boolean {
  return (t.planePhase === SP_APPROACH && t.planeLocked) || t.planePhase === SP_FLARE_PASS || t.planePhase === SP_ORBIT || t.planePhase === SP_RUN;
}

/** 水上機の未確定の接近（答えは減速。浅瀬・暴風の警告の下） */
export function planeApproaching(t: BoatTelemetry): boolean {
  return t.planePhase === SP_APPROACH && !t.planeLocked;
}

/** 水上機の結果（去る間。中断は出さない） */
export function planeLeaving(t: BoatTelemetry): boolean {
  return t.planePhase === SP_LEAVING && (t.planeOutcome === SP_OUT_LOST || t.planeOutcome === SP_OUT_BOMBED);
}

/** 水上機の 2 行目（docs/02 §6.8、v0.4.1）。distStep は PLANE_DISTANCE_STEP_M 刻みの切り上げ */
export function seaplaneLine(t: BoatTelemetry, distStep: number, shallowStep: number, stormWarn: boolean): HudLine {
  const d = distStep * PLANE_DISTANCE_STEP_M;
  if (t.planePhase === SP_APPROACH && !t.planeLocked) {
    if (t.planeWake) return { text: `敵機 ${d} m ・ 航跡を見られた ・ ${t.planeWakeKt} kt 以下に減速！`, color: HUD_COLOR_WARN };
    return { text: `敵機 ${d} m ・ 航跡なし ・ 静音を保て`, color: HUD_COLOR_STRONG };
  }
  if (t.planePhase === SP_LEAVING) {
    if (t.planeOutcome === SP_OUT_LOST) return { text: '敵機は見失った ・ 去る', color: HOME_COLOR_TEXT };
    return { text: `敵機 去る ・ 爆弾 ${t.planeBombsDropped} 発 命中 ${t.planeBombsHit}`, color: HUD_COLOR_STRONG };
  }
  let text: string;
  if (t.planeBombAir) text = '爆弾投下！ 転舵！';
  else if (t.planePhase === SP_RUN) text = '爆撃進路！ 転舵か減速でかわせ';
  else if (t.planePhase === SP_ORBIT && t.planeBombsDropped > 0) text = '敵機 旋回 ・ 次の爆撃進路で転舵';
  else if (t.planeFlareOn) text = t.destroyerSunk ? '照明弾！ ・ 爆撃が来る ・ 転舵の用意' : '照明弾！ 駆逐艦に見えている ・ 光の外へ／煙幕';
  else text = t.planePhase === SP_APPROACH ? `敵機に発見された！ ${d} m ・ 照明弾と爆弾に備えよ` : '敵機に発見された！ ・ 照明弾と爆弾に備えよ';
  return { text: withWarnings(text, t, shallowStep, stormWarn), color: HUD_COLOR_WARN };
}

/** Result の「敵機:」の行（任務に水上機がいるときだけ）: 来ず / 見失わせただけ / 攻撃を受けた（弾切れで去った）/ 発見確定の後に途中で終了 */
export function seaplaneResultLine(r: { seaplaneOutcome: number; seaplaneAttacked: boolean; seaplaneSorties: number; seaplaneLost: number; seaplaneSlowReactS: number; seaplaneFlareLitS: number; seaplaneShellsUnderFlare: number; seaplaneBombs: number; seaplaneBombHits: number; seaplaneDodgeS: number[] }): string {
  if (r.seaplaneSorties === 0) return '敵機: 来ず';
  const lostPart = r.seaplaneLost > 0 ? `見失わせた ${r.seaplaneLost} 回（減速まで ${Number.isNaN(r.seaplaneSlowReactS) ? '帯に隠れた' : `${r.seaplaneSlowReactS.toFixed(1)} 秒`}）` : '';
  if (r.seaplaneOutcome === SP_OUT_BOMBED) {
    const dodge = r.seaplaneDodgeS.slice(0, r.seaplaneBombs).map((s) => (Number.isNaN(s) ? '—' : s.toFixed(1))).join('/');
    return `敵機: ${lostPart ? `${lostPart} → ` : ''}照明弾の下 ${r.seaplaneFlareLitS.toFixed(1)} 秒 ・ 砲撃 ${r.seaplaneShellsUnderFlare} 発 ・ 爆弾 ${r.seaplaneBombs} 発 命中 ${r.seaplaneBombHits} ・ 転舵 ${dodge} 秒`;
  }
  if (r.seaplaneAttacked) return `敵機: ${lostPart ? `${lostPart} → ` : ''}攻撃の途中で終了（爆弾 ${r.seaplaneBombs} 発 命中 ${r.seaplaneBombHits}）`;
  return `敵機: 接近 ${r.seaplaneSorties} 回 ・ ${lostPart || '見失わせた 0 回'}`;
}

// ---------- 大発掃討（v0.4.2） ----------

function kills(t: BoatTelemetry): string {
  return `撃破 ${t.bargesSunk}/${t.bargesQuota}`;
}

/** 射撃ボタンを押している間の 2 行目: 撃っている（距離・速すぎ・遠い。大発が逃げていれば「上陸まで N 秒」を足す）か、撃てない理由（死角・射程外・煙幕・見えない）。浅瀬の警告は後ろに付ける。
 * distStep は GUN_DISTANCE_STEP_M 刻みの切り上げ。「遠い」は表示の距離で決める（「300 m ・ 遠い（300 m 以内で）」と矛盾させない） */
export function gunLine(t: BoatTelemetry, distStep: number, escapeS: number, shallowStep: number): HudLine {
  let text: string;
  let warn = true;
  const d = distStep * GUN_DISTANCE_STEP_M;
  if (t.gunStatus === GUN_FIRING) {
    if (t.gunFast) text = `射撃中 ・ 速すぎて当たらない ・ ${t.gunSteadyKt} kt 以下で`;
    else if (d > t.gunEffectiveM) text = `射撃中 ・ 大発 ${d} m ・ 遠い（${t.gunEffectiveM} m 以内で）`;
    else {
      text = `射撃中 ・ 大発 ${d} m ・ ${kills(t)}`;
      warn = false;
    }
    if (escapeS > 0) text += ` ・ 上陸まで ${escapeS} 秒`; // 撃ったら気づかれて逃げる、を押したまま読めるように（v0.4.2 の試作で、押し続けると「岸へ逃げる」の行が出なかった）
  } else if (t.gunStatus === GUN_OUT_OF_ARC) text = '射界外 ・ 舷側に向けよ（艇首・艇尾は撃てない）';
  else if (t.gunStatus === GUN_OUT_OF_RANGE) text = `射程外 ・ ${t.gunRangeM} m 以内へ寄れ`;
  else if (t.gunStatus === GUN_BLOCKED) text = '煙幕で見えない ・ 撃てない';
  else text = '大発が見えない ・ 撃てない';
  return { text: withWarnings(text, t, shallowStep, false), color: warn ? HUD_COLOR_WARN : HUD_COLOR_STRONG };
}

/** 巡航・全速（航跡が見える速さ）で大発に寄っているか（撃つ前の手引きで減速を促す） */
export function sightedFast(t: BoatTelemetry): boolean {
  return t.targetStep === 'cruise' || t.targetStep === 'full';
}

/**
 * 撃つ前の手引き（押していない・大発が見えている・逃げている大発がいない）。distM は最寄りの浮いている大発まで（50 m 刻みの切り上げ＝「300 m」は 300 m 以内）。
 * 気づかれたら（逃げ出すまでの 5 秒）警告色。巡航・全速で寄っていれば見つかる距離（3 行目と同じ 50 m 刻み）を出して減速を促す（v0.4.2 の実機 2 回目: 巡航で寄って 719 m で気づかれ、逃げられた）
 */
export function bargeSightedLine(t: BoatTelemetry, distM: number, shallowStep: number): HudLine {
  if (t.playerDetected) return { text: withWarnings(`大発 ${distM} m ・ 気づかれた！ ・ 舷側を向けて撃て`, t, shallowStep, false), color: HUD_COLOR_WARN };
  if (sightedFast(t)) {
    const det = Math.round(t.detectRangeM / DETECT_RANGE_STEP_M) * DETECT_RANGE_STEP_M;
    return { text: withWarnings(`大発 ${distM} m ・ 速い！ ${det} m で気づかれる ・ ${t.gunSteadyKt} kt 以下に`, t, shallowStep, false), color: HUD_COLOR_WARN };
  }
  return { text: withWarnings(`大発 ${distM} m ・ 気づかれていない ・ 舷側を向け ${t.gunEffectiveM} m で撃て`, t, shallowStep, false), color: HUD_COLOR_STRONG };
}

/** 大発が岸へ逃げている間（上陸まで N 秒） */
export function bargeRunLine(t: BoatTelemetry, escapeS: number, shallowStep: number): HudLine {
  return { text: withWarnings(`大発が岸へ逃げる ・ 上陸まで ${escapeS} 秒 ・ ${kills(t)}`, t, shallowStep, false), color: HUD_COLOR_WARN };
}

/** 撃破・上陸の直後（kind 1 撃破 / 2 上陸） */
export function bargeEventLine(t: BoatTelemetry, kind: number): HudLine {
  if (kind === 1) return { text: `大発 撃破！ ${t.bargesSunk}/${t.bargesQuota}`, color: HOME_COLOR_TEXT };
  return { text: `大発 上陸 ・ 逃げられた（${t.bargesBeached} 隻）`, color: HUD_COLOR_STRONG };
}

/** Result の大発の 2 行（射撃の記録と、撃破の距離・気づかれた距離・13mm の被弾）。r は result-scene の BargeResult */
export function bargeResultLines(r: { shots: number; hits: number; firstShotM: number; firstShotBand: string; firstDetectM: number; flashFirst: boolean; killMinM: number; killMaxM: number; mgHits: number; mgDamage: number }): string[] {
  const band = (STEP_LABEL as Record<string, string>)[r.firstShotBand] ?? '';
  const shot = r.shots === 0 ? '射撃なし' : `射撃 ${r.shots} 発 ・ 命中 ${r.hits}（${Math.round((100 * r.hits) / r.shots)}%）・ 最初の射撃 ${Math.round(r.firstShotM)} m（${band}）`;
  const kill = Number.isNaN(r.killMinM) ? '撃破なし' : r.killMinM === r.killMaxM ? `撃破の距離 ${Math.round(r.killMinM)} m` : `撃破の距離 ${Math.round(r.killMinM)}〜${Math.round(r.killMaxM)} m`;
  const seen = !Number.isNaN(r.firstDetectM) ? `大発に気づかれた距離 ${Math.round(r.firstDetectM)} m` : r.flashFirst ? '撃つまで気づかれず' : '気づかれず';
  return [shot, `${kill} ・ ${seen} ・ 13mm の被弾 ${r.mgHits} 発（HP −${r.mgDamage}）`];
}
