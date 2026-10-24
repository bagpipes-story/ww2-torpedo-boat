// 機関の不調（v0.6.5。jp_05。docs/02 §6.8、spec-v065 §C.2）の任務の読み出し: 任務の v0_1_prototype.hazards に engine_failure があれば、
// risk_events.json の engine_failure.params と自艇の engine_reliability から EngineParams を組む（data の検査は core/engine-trouble-data）。
// 同居の検査: 米PT の隊（pt_boats）の任務だけ・輸送隊（convoy）と同居しない（標的が自艇だけの任務に限る＝不調にしない「赤い線の最中」は隊が攻撃中かだけで決まる）・
// 夜明けの空襲（dawn_strike）と敵の水上機（enemy_aircraft）と同居しない（その攻撃の最中は赤い線に入れていない。米PT は夜明けに去るので空襲だけの間に不調が始まりうる。レビュー fair-3）・夜ごとの危険にしない。
// world-setup が組み立てのたびに（engineSetupPart）、Boot が遊べる任務ごとに 1 回（検査）呼ぶ。game-data.ts が 300 行に近いので別ファイル。
import { getPrototypeMission, type GameData } from './game-data';
import { DEBUG_ENGINE_HOT_HEAT } from './engine-config';
import { ENGINE_FAILURE_EVENT_ID, engineParamsFromData, type EngineParams } from '../core/engine-trouble-data';

export type { EngineParams } from '../core/engine-trouble-data';

/** 任務の不調の値。hazards に engine_failure が無い任務は null。data が壊れている・同居できない任務なら任務の id 付きの例外 */
export function getEngineParams(data: GameData, missionId: string): EngineParams | null {
  const mission = getPrototypeMission(data, missionId);
  if (!mission.hazards.includes(ENGINE_FAILURE_EVENT_ID)) return null;
  const bad = (msg: string): never => {
    throw new Error(`${missionId}: 機関の不調（v0_1_prototype.hazards の ${ENGINE_FAILURE_EVENT_ID}）: ${msg}（docs/02 §6.8）`);
  };
  if (!mission.ptBoats) bad('米PT の隊（pt_boats）の任務だけ（赤い線＝米PT の攻撃の最中には不調にしない）');
  if (mission.convoy) bad('輸送隊（convoy）と同居しない（標的が自艇だけの任務に限る）');
  if (mission.dawnStrike) bad('夜明けの空襲（dawn_strike）と同居しない（空襲の攻撃の最中は赤い線に入らない）');
  if (mission.enemyAircraft) bad('敵の水上機（enemy_aircraft）と同居しない（水上機の攻撃の最中は赤い線に入らない）');
  if (mission.night?.optionalHazards.includes(ENGINE_FAILURE_EVENT_ID)) bad('night.optional_hazards に入れない（不調は夜ごとに決めない。今夜の揺らぎの乱数の回数が変わる）');
  const ev = (data.riskEvents.events as readonly Record<string, unknown>[]).find((e) => e['id'] === ENGINE_FAILURE_EVENT_ID) ?? bad(`risk_events.json に ${ENGINE_FAILURE_EVENT_ID} が無い`);
  const boat = (data.boats.boats as readonly Record<string, unknown>[]).find((b) => b['id'] === mission.playerBoatId);
  return engineParamsFromData(ev['params'], boat?.['engine_reliability'], `${missionId} の自艇 ${mission.playerBoatId}`);
}

/** 組み立ての上書き（systems/world-setup の SetupOptions の 2 鍵）: engineOff は不調を切る（?debug&engoff・模擬の ENG_OFF）、engineHot は出撃時の熱を DEBUG_ENGINE_HOT_HEAT に（?debug&enghot） */
export interface EngineSetupOptions {
  engineOff?: boolean;
  engineHot?: boolean;
}

/** WorldSetup に展開する部分: 不調の無い任務・engineOff の夜は {}（engine の鍵ごと出ない＝他の任務の setup の snapshot が変わらない） */
export function engineSetupPart(data: GameData, missionId: string, o: EngineSetupOptions): { engine?: EngineParams } {
  const p = o.engineOff ? null : getEngineParams(data, missionId);
  if (!p) return {};
  return { engine: o.engineHot ? { ...p, startHeat: DEBUG_ENGINE_HOT_HEAT } : p };
}
