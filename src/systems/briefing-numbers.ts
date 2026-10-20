// Briefing の数値（v0.4.0。v0.6.3 で world-setup から切り出し。中身はそのまま）。world-setup.ts が再 export する（今までの import のため）。
import { NO_WEAPON_BRIEFING_JA, bearingJa, compassJa, type BriefingNumbers } from '../core/briefing';
import { dawnConditionJa } from '../core/dawn-air';
import { bearingDeg } from '../core/ship-ai';
import { enemyDetectRangeM, playerVisRangeM } from '../core/visibility';
import type { WorldSetup } from './world-setup';

/** Briefing の数値（?debug の上書き込みで Mission と同じ値）: 視程、巡航・静音で見つかる距離（雨なし）、夜明け、割当、魚雷、帰投地点と海域 */
export function briefingNumbers(s: WorldSetup, aimAssistJa: string = ''): BriefingNumbers {
  const f = s.vis.speedFactor;
  return {
    // 見越し点マーカーの解放の状態（v0.5.2）。無ければ鍵ごと省く（Briefing を作るときの 1 回だけ）。魚雷を撃たない任務（v0.6.3。main_weapon none）はマーカーが無いので出さない
    ...(aimAssistJa && s.mainWeapon !== 'none' ? { aimAssistJa } : {}),
    // 撃たない任務（v0.6.3。main_weapon none＝米PT）は条件の武器の句。他の任務は鍵ごと省く
    ...(s.mainWeapon === 'none' ? { weaponJa: NO_WEAPON_BRIEFING_JA } : {}),
    visM: playerVisRangeM(s.vis),
    detectCruiseM: enemyDetectRangeM(s.baseDetectM, f.cruise, s.vis, false),
    detectSilentM: enemyDetectRangeM(s.baseDetectM, f.silent, s.vis, false),
    durationS: s.durationS,
    dawnJa: dawnConditionJa(s.dawnAir, s.night.mirrored),
    fuelGal: s.fuelAllotmentGal,
    torpedoes: s.torpedoCapacity,
    gunsLabel: s.guns ? s.guns.label : '',
    enemyFromJa: enemyFromJa(s),
    homeX: s.mission.returnPoint.x,
    homeY: s.mission.returnPoint.y,
    boundsW: s.mission.bounds.width,
    boundsH: s.mission.bounds.height,
  };
}

/**
 * 敵の来る方角（8 方位）: 海域の中心から見た敵の出発点（v0.4.6）。米PT（v0.6.3 レビュー）は自艇の出発点から見た 1 隻目の PT の出発点
 * （帰り道を東西に横切る線を哨戒するので、中心から見た「東から」は線のどちら寄りかでしかなく、出発点からは南にいた）
 */
function enemyFromJa(s: WorldSetup): string {
  const e = s.enemyFrom;
  if (!e) return '';
  if (s.ptBoats) return bearingJa(bearingDeg(s.playerStart.x, s.playerStart.y, e.x, e.y));
  return compassJa(e.x, e.y, s.mission.bounds.width, s.mission.bounds.height);
}
