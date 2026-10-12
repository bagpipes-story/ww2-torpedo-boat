// HUD の文と表（v0.4.1 で boat-hud.ts から切り出し）: 速力段・3 行目の状態・「帰投せよ」の理由、味方機と敵の水上機の 2 行目、Result の「敵機:」の行。
// Phaser は使わない（文を組むだけ）。2 行目の文は値が変わったときだけ組む（呼ぶ側がキャッシュする）。
import { HOME_COLOR_TEXT, HUD_COLOR_STRONG, HUD_COLOR_WARN, SHALLOW_WARN_STEP_M } from '../config/ui-config';
import type { BoatTelemetry, SpeedStep } from '../core/boat-motion';
import { FF_OUT_IDENTIFIED, FF_STRAFE } from '../core/friendly';
import { CALL_DAWN, CALL_EXPENDED, CALL_FUEL, CALL_SUNK } from '../core/mission-flow';
import { SP_APPROACH, SP_DONE, SP_FLARE_PASS, SP_LEAVING, SP_ORBIT, SP_OUT_BOMBED, SP_OUT_LOST, SP_RUN } from '../core/seaplane';
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

/** 水上機の 2 行目（docs/02 §6.8、v0.4.1）。distStep は 100 m 刻みの切り上げ */
export function seaplaneLine(t: BoatTelemetry, distStep: number, shallowStep: number, stormWarn: boolean): HudLine {
  const d = distStep * 100;
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
  else if (t.planePhase === SP_RUN) text = '爆撃進路！ 転舵でかわせ';
  else if (t.planePhase === SP_ORBIT && t.planeBombsDropped > 0) text = '敵機 旋回 ・ 次の爆撃進路で転舵';
  else if (t.planeFlareOn) text = t.destroyerSunk ? '照明弾！ ・ 爆撃が来る ・ 転舵の用意' : '照明弾！ 駆逐艦に見えている ・ 光の外へ／煙幕';
  else text = t.planePhase === SP_APPROACH ? `敵機に発見された！ ${d} m ・ 照明弾と爆弾に備えよ` : '敵機に発見された！ ・ 照明弾と爆弾に備えよ';
  return { text: withWarnings(text, t, shallowStep, stormWarn), color: HUD_COLOR_WARN };
}

/** Result の「敵機:」の行（任務に水上機がいるときだけ） */
export function seaplaneResultLine(r: { seaplanePhase: number; seaplaneOutcome: number; seaplaneSorties: number; seaplaneLost: number; seaplaneSlowReactS: number; seaplaneFlareLitS: number; seaplaneShellsUnderFlare: number; seaplaneBombs: number; seaplaneBombHits: number; seaplaneDodgeS: number[] }): string {
  if (r.seaplaneSorties === 0) return '敵機: 来ず';
  const lostPart = r.seaplaneLost > 0 ? `見失わせた ${r.seaplaneLost} 回（減速まで ${Number.isNaN(r.seaplaneSlowReactS) ? '帯に隠れた' : `${r.seaplaneSlowReactS.toFixed(1)} 秒`}）` : '';
  if (r.seaplaneBombs > 0 && r.seaplanePhase === SP_DONE && r.seaplaneOutcome === SP_OUT_BOMBED) {
    const dodge = r.seaplaneDodgeS.slice(0, r.seaplaneBombs).map((s) => (Number.isNaN(s) ? '—' : s.toFixed(1))).join('/');
    return `敵機: ${lostPart ? `${lostPart} → ` : ''}照明弾の下 ${r.seaplaneFlareLitS.toFixed(1)} 秒 ・ 砲撃 ${r.seaplaneShellsUnderFlare} 発 ・ 爆弾 ${r.seaplaneBombs} 発 命中 ${r.seaplaneBombHits} ・ 転舵 ${dodge} 秒`;
  }
  if (r.seaplaneBombs > 0 || r.seaplaneFlareLitS > 0 || planeAttacking({ planePhase: r.seaplanePhase, planeLocked: true } as BoatTelemetry)) {
    return `敵機: 攻撃の途中で終了（爆弾 ${r.seaplaneBombs} 発 命中 ${r.seaplaneBombHits}）`;
  }
  return `敵機: 接近 ${r.seaplaneSorties} 回 ・ ${lostPart || '見失わせた 0 回'}`;
}
