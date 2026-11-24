// 今夜の救助と機雷原の組み立て（v0.8.5 S2。us_07。spec-v0850 §4.0・lead の決め 2）: setup（rescue・minefield・任務・自艇の半長）と出撃の seed から core/rescue-field の
// rollRescueField を 1 回だけ呼ぶ。世界（systems/world-rescue）と S3 の模擬が同じこの 1 つの関数を使う（buildWorldSetup の中では呼ばない＝setup の snapshot は変わらない）。
// Phaser 非依存（node の tests・模擬から組める）。
import { rescueFieldSite, type MinefieldSetup } from '../config/minefield-mission-data';
import type { PrototypeMission } from '../config/mission-data';
import type { RescueSetup } from '../config/rescue-mission-data';
import { rollRescueField, type RescueField } from '../core/rescue-field';

/** 読む setup の部分（WorldSetup がそのまま満たす） */
export interface RescueFieldSetupView {
  readonly mission: PrototypeMission;
  readonly rescue?: RescueSetup;
  readonly minefield?: MinefieldSetup;
  readonly boatHalfLengthM: number;
}

/** 救助の任務（setup.rescue のある任務）だけ今夜の群のずれと機雷の置き方（seed+47 の 88 回）。無い任務は null（系列も作らない） */
export function rescueFieldOf(s: RescueFieldSetupView, seed: number): RescueField | null {
  const r = s.rescue;
  if (!r) return null;
  return rollRescueField(seed, r, s.minefield ?? null, rescueFieldSite(s.mission, r), s.boatHalfLengthM);
}
