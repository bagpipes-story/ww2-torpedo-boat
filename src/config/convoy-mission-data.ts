// 味方の大発の輸送隊（v0.6.4。jp_01「夜の輸送護衛」。docs/02 §6.4）の数値の読み出し: enemies.json の大発（CONVOY_BARGE_ID）と任務の v0_1_prototype.convoy から
// core/convoy-data の ConvoySetup（隊・大発が見つかる速力帯・米PT の標的の規則）を組む。隻数は任務の allies に並ぶ大発の数。検査は core/convoy-data（任務の id 付きで例外＝Boot で止まる）。
// 輸送隊の無い任務は null（pt-mission-data と同じ形）。world-setup が組み立てのたびに呼ぶ（今夜の先頭のずれは systems/world-night の applyConvoyNight）。game-data が 300 行に近いので別ファイル。
import type { GameData } from './game-data';
import type { PrototypeMission } from './mission-data';
import { isBargeDataRecord } from '../core/barge-data';
import { CONVOY_BARGE_ID, convoyParamsFromData, ptTargetRuleFromData, type ConvoySetup } from '../core/convoy-data';

export function getConvoyParams(data: GameData, mission: PrototypeMission): ConvoySetup | null {
  const b = mission.convoy;
  if (!b) return null;
  const rec = data.enemies.enemies.find((e) => e.id === CONVOY_BARGE_ID);
  if (!rec || !isBargeDataRecord(rec)) throw new Error(`${mission.id}: enemies.json の ${CONVOY_BARGE_ID} に大発の値（length_m / beam_m / speed_* / turn_rate_deg_s / accel_mps2）が無い（docs/02 §6.4）`);
  const allies = (data.missionsSeed.missions.find((x) => x.id === mission.id) as Record<string, unknown> | undefined)?.['allies'];
  const count = Array.isArray(allies) ? allies.filter((a) => a === CONVOY_BARGE_ID).length : 0;
  const w = data.hitRateModel.world;
  const ctx = { missionId: mission.id, leadJitterM: mission.night ? mission.night.bargeLeadJitterM : 0, ring: mission.returnPoint };
  return { params: convoyParamsFromData(rec, b, count, { hitScale: w.hit_scale, spriteScale: w.sprite_scale }, mission.bounds, ctx), detectBand: b.detect_band, rule: ptTargetRuleFromData(b) };
}
