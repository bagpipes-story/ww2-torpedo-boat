// Briefing の数値（v0.4.0。v0.6.3 で world-setup から切り出し。中身はそのまま）。world-setup.ts が再 export する（今までの import のため）。
import { NO_WEAPON_BRIEFING_JA, bearingJa, compassJa, patrolAirDetectJa, patrolWeaponBriefingJa, ptGunBriefingJa, type BriefingNumbers } from '../core/briefing';
import { dawnConditionJa } from '../core/dawn-air';
import { bearingDeg } from '../core/ship-ai';
import { enemyDetectRangeM, playerVisRangeM } from '../core/visibility';
import { armsBriefingJa } from '../ui/arms-lines';
import type { WorldSetup } from './world-setup';

/** Briefing の数値（?debug の上書き込みで Mission と同じ値）: 視程、巡航・静音で見つかる距離（雨なし）、夜明け、割当、魚雷、帰投地点と海域 */
export function briefingNumbers(s: WorldSetup, aimAssistJa: string = ''): BriefingNumbers {
  const f = s.vis.speedFactor;
  return {
    // 見越し点マーカーの解放の状態（v0.5.2）。無ければ鍵ごと省く（Briefing を作るときの 1 回だけ）。米PT の任務（v0.6.3。魚雷を撃たない）はマーカーが無いので出さない
    ...(aimAssistJa && !s.ptBoats && !s.patrolAir ? { aimAssistJa } : {}),
    // 米PT の任務（v0.6.3）は条件の武器の句: 砲の名から（実機 1 回目から jp_05 は T-14 の 13mm、v0.6.4 の jp_01 は T-38 の 25mm）か撃たない（none）。他の任務は鍵ごと省く
    ...(s.ptBoats ? { weaponJa: s.guns ? ptGunBriefingJa(s.guns.label) : NO_WEAPON_BRIEFING_JA } : {}),
    // 夜の哨戒機の任務（v0.6.7。jp_02）: 機銃の句（v0.6.8。v0.6.7 は武器なし）と航跡の出る速さ（静音の上限）、月の行の空からの見え方（航跡・動く船体・停止）。見越し点マーカーは出さない（狙う艦が無い）。他の任務は鍵ごと省く
    ...(s.patrolAir ? { weaponJa: patrolWeaponBriefingJa(s.patrolAir.gate.quietKt), airDetectJa: patrolAirDetectJa(s.patrolAir.gate.wakeDetectM, s.patrolAir.gate.nearM) } : {}),
    // もう一つの兵装の一言（v0.6.8。魚雷と機銃は全任務で両方使える）: 艦の任務は「機銃は艦に効かない」、大発の任務は「魚雷は大発の下を抜ける」。WorldSetup だけから（ui/arms-lines）。無い任務は鍵ごと省く
    ...secondaryPart(s),
    // 輸送隊の任務（v0.6.4 レビュー ux-6。jp_01）は帰投地点の方角を自艇の出発点から（中心からの「南東」は出発点からは東・上陸の先頭からは北東だった）。他の任務は鍵ごと省く
    ...(s.convoy ? { homeFromJa: bearingJa(bearingDeg(s.playerStart.x, s.playerStart.y, s.mission.returnPoint.x, s.mission.returnPoint.y)) } : {}),
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

/** Briefing を作るときの 1 回だけ（確保はここだけ） */
function secondaryPart(s: WorldSetup): { secondaryJa?: string } {
  const j = armsBriefingJa(s);
  return j ? { secondaryJa: j } : {};
}

/**
 * 敵の来る方角（8 方位）: 海域の中心から見た敵の出発点（v0.4.6）。米PT（v0.6.3 レビュー）は自艇の出発点から見た 1 隻目の PT の出発点
 * （帰り道を東西に横切る線を哨戒するので、中心から見た「東から」は線のどちら寄りかでしかなく、出発点からは南にいた）
 */
function enemyFromJa(s: WorldSetup): string {
  if (s.patrolAir) return bearingJa(s.patrolAir.gate.fromBearingDeg); // 夜の哨戒機（v0.6.7）: 最初の捜索（レーダー）の来る方角
  const e = s.enemyFrom;
  if (!e) return '';
  if (s.ptBoats) return bearingJa(bearingDeg(s.playerStart.x, s.playerStart.y, e.x, e.y));
  return compassJa(e.x, e.y, s.mission.bounds.width, s.mission.bounds.height);
}
