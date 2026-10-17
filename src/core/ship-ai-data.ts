// enemies.json の AI の部分の読み出し（v0.5.0 で ship-ai.ts から分けた。中身は v0.4.8 のまま＋雷跡に気づく割合）。Phaser 非依存。起動時に 1 回だけ。
import type { ShipAiParams } from './ship-ai';
import { ktToMps } from './units';

/** enemies.json の 1 レコードのうち AI が使う部分（docs/02 §6.4・§6.5） */
export interface EnemyAiDataRecord {
  speed_typical_kt: number;
  speed_max_kt: number;
  turn_rate_deg_s: number;
  accel_mps2: number;
  /** wake_spot_rate_per_s（v0.5.0）は無ければ見える距離に入った瞬間に気づく（v0.4.8 までと同じ） */
  detection: { base_detect_m: number; reaction_delay_s: number; torpedo_wake_detect_m: number; wake_spot_rate_per_s?: number };
  evasion: { turn_toward_wakes: boolean; evade_turn_rate_deg_s: number; speed_boost_kt: number };
  ram: { enabled: boolean; trigger_m: number; give_up_m: number; stall_s: number; cooldown_s: number; turn_rate_bonus_deg_s: number };
  patrol: { edge_turn_margin_m: number };
}

function hasNums(o: unknown, keys: readonly string[]): o is Record<string, number> {
  if (!o || typeof o !== 'object') return false;
  const r = o as Record<string, unknown>;
  return keys.every((k) => typeof r[k] === 'number' && Number.isFinite(r[k]));
}

export function isEnemyAiDataRecord(v: unknown): v is EnemyAiDataRecord {
  if (!hasNums(v, ['speed_typical_kt', 'speed_max_kt', 'turn_rate_deg_s', 'accel_mps2'])) return false;
  const r = v as Record<string, unknown>;
  const eva = r['evasion'] as Record<string, unknown> | undefined;
  const ram = r['ram'] as Record<string, unknown> | undefined;
  const det = r['detection'] as Record<string, unknown> | undefined;
  const spot = det?.['wake_spot_rate_per_s'];
  return (
    hasNums(det, ['base_detect_m', 'reaction_delay_s', 'torpedo_wake_detect_m']) &&
    (spot === undefined || (typeof spot === 'number' && spot > 0 && Number.isFinite(spot))) &&
    hasNums(eva, ['evade_turn_rate_deg_s', 'speed_boost_kt']) &&
    typeof eva?.['turn_toward_wakes'] === 'boolean' &&
    hasNums(ram, ['trigger_m', 'give_up_m', 'stall_s', 'cooldown_s', 'turn_rate_bonus_deg_s']) &&
    typeof ram?.['enabled'] === 'boolean' &&
    hasNums(r['patrol'], ['edge_turn_margin_m'])
  );
}

/** data → AI パラメータ（kt→m/s）。evasionMultiplier は史実モードの倍率（通常 1。反応遅れを割り、転舵率と雷跡に気づく割合に掛ける） */
export function shipAiParamsFromData(r: EnemyAiDataRecord, evasionMultiplier: number = 1): ShipAiParams {
  return {
    torpedoWakeDetectM: r.detection.torpedo_wake_detect_m,
    wakeSpotRatePerS: (r.detection.wake_spot_rate_per_s ?? Infinity) * evasionMultiplier,
    reactionDelayS: r.detection.reaction_delay_s / evasionMultiplier,
    evadeTurnRateDegS: r.evasion.evade_turn_rate_deg_s * evasionMultiplier,
    speedBoostMps: ktToMps(r.evasion.speed_boost_kt),
    turnTowardWakes: r.evasion.turn_toward_wakes,
    ramTriggerM: r.ram.trigger_m,
    ramEnabled: r.ram.enabled,
    ramGiveUpM: Math.max(r.ram.give_up_m, r.ram.trigger_m),
    ramStallS: r.ram.stall_s,
    ramCooldownS: r.ram.cooldown_s,
    ramTurnRateBonusDegS: r.ram.turn_rate_bonus_deg_s,
    edgeTurnMarginM: r.patrol.edge_turn_margin_m,
    turnRateDegS: r.turn_rate_deg_s,
    accelMps2: r.accel_mps2,
    cruiseSpeedMps: ktToMps(r.speed_typical_kt),
    maxSpeedMps: ktToMps(r.speed_max_kt),
  };
}
