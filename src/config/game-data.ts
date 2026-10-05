// data/*.json を Vite でバンドルして1回だけ読む（CLAUDE.md §7「JSONを毎シーンfetchしない」、§8 データ駆動）。
// 実行時 fetch にしない理由: Pages のサブパス（/ww2-torpedo-boat/）で 404 を踏まず、オフライン PWA でも壊れない。
import boats from '../../data/boats.json';
import torpedoes from '../../data/torpedoes.json';
import enemies from '../../data/enemies.json';
import hitRateModel from '../../data/hit_rate_model.json';
import riskEvents from '../../data/risk_events.json';
import missionsSeed from '../../data/missions_seed.json';
import { isBoatDataRecord, type BoatDataRecord } from '../core/boat-motion';
import { damageParamsFromData, isBoatDamageDataRecord, isEnemyGunneryDataRecord, type DamageParams, type EnemyGunneryDataRecord } from '../core/gunnery';
import { isEnemyAiDataRecord, type EnemyAiDataRecord } from '../core/ship-ai';
import { isTorpedoDataRecord, type TorpedoDataRecord } from '../core/torpedo';
import { isMoonPhase, type MoonPhase, type VisibilityParams } from '../core/visibility';

export const gameData = {
  boats,
  torpedoes,
  enemies,
  hitRateModel,
  riskEvents,
  missionsSeed,
} as const;

export type GameData = typeof gameData;

/** Boot が Registry に置いた後、各シーンはこれで取り出す */
export function getGameData(registry: { get(key: string): unknown }, key: string): GameData {
  const data = registry.get(key);
  if (!data) {
    throw new Error(`gameData が Registry にありません（key=${key}）。Boot シーンを先に通してください`);
  }
  return data as GameData;
}

/** ミッションの種から v0.1 プロトタイプ用の設定を取り出す（型は実行時に検査する: data 駆動なので壊れていれば起動時に分かる） */
export interface PrototypeMission {
  id: string;
  playerBoatId: string;
  torpedoId: string;
  enemyId: string;
  bounds: { width: number; height: number };
  playerStart: { x: number; y: number; headingDeg: number };
  enemyStart: { x: number; y: number; headingDeg: number };
  durationS: number;
  /** プロトタイプ用の沈没本数の上書き。無ければ enemies.json の torpedo_hits_to_sink */
  enemyHitsToSink: number | null;
  /** 月齢（ミッション本体の moon。視界係数に使う。docs/02 §6.5） */
  moon: MoonPhase;
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function readStart(v: unknown, label: string): { x: number; y: number; headingDeg: number } {
  const r = v as Record<string, unknown> | undefined;
  if (!r || !isNum(r['x_m']) || !isNum(r['y_m']) || !isNum(r['heading_deg'])) {
    throw new Error(`${label} に x_m / y_m / heading_deg が無い`);
  }
  return { x: r['x_m'], y: r['y_m'], headingDeg: r['heading_deg'] };
}

export function getPrototypeMission(data: GameData, missionId: string): PrototypeMission {
  const m = data.missionsSeed.missions.find((x) => x.id === missionId) as Record<string, unknown> | undefined;
  if (!m) throw new Error(`missions_seed.json に ${missionId} が無い`);
  const proto = m['v0_1_prototype'] as Record<string, unknown> | undefined;
  if (!proto) throw new Error(`${missionId}.v0_1_prototype が無い`);
  const bounds = proto['bounds_m'] as Record<string, unknown> | undefined;
  if (!bounds || !isNum(bounds['width']) || !isNum(bounds['height'])) {
    throw new Error(`${missionId}.v0_1_prototype.bounds_m が無い（docs/02 §6.1）`);
  }
  if (!isNum(proto['duration_s'])) throw new Error(`${missionId}.v0_1_prototype.duration_s が無い`);
  const enemies = proto['enemies'];
  const enemyId = Array.isArray(enemies) ? enemies[0] : undefined;
  if (typeof enemyId !== 'string') throw new Error(`${missionId}.v0_1_prototype.enemies が空`);
  const playerBoatId = m['player_boat'];
  if (typeof playerBoatId !== 'string') throw new Error(`${missionId}.player_boat が無い`);
  const torpedoId = m['torpedo_type'];
  if (typeof torpedoId !== 'string') throw new Error(`${missionId}.torpedo_type が無い`);
  const moon = m['moon'];
  if (!isMoonPhase(moon)) throw new Error(`${missionId}.moon が dark/half/full のどれでもない（${String(moon)}。昼は v0.6 で扱う）`);
  return {
    id: missionId,
    playerBoatId,
    torpedoId,
    enemyId,
    bounds: { width: bounds['width'], height: bounds['height'] },
    playerStart: readStart(proto['player_start'], `${missionId}.v0_1_prototype.player_start`),
    enemyStart: readStart(proto['enemy_start'], `${missionId}.v0_1_prototype.enemy_start`),
    durationS: proto['duration_s'],
    enemyHitsToSink: isNum(proto['enemy_hits_to_sink']) ? proto['enemy_hits_to_sink'] : null,
    moon,
  };
}

/** boats.json から id で艇レコードを引く。運動に必要なフィールドが無ければ例外 */
export function getBoatRecord(data: GameData, boatId: string): BoatDataRecord {
  const b = data.boats.boats.find((x) => x.id === boatId);
  if (!b || !isBoatDataRecord(b)) throw new Error(`boats.json の ${boatId} が無いか、運動フィールドが欠けている`);
  return b;
}

/** boats.json の魚雷搭載数 */
export function getBoatTorpedoCount(data: GameData, boatId: string): number {
  const b = data.boats.boats.find((x) => x.id === boatId) as Record<string, unknown> | undefined;
  const t = b?.['torpedoes'] as Record<string, unknown> | undefined;
  if (!t || !isNum(t['count'])) throw new Error(`boats.json の ${boatId}.torpedoes.count が無い`);
  return t['count'];
}

/** torpedoes.json から id で魚雷レコードを引く */
export function getTorpedoRecord(data: GameData, torpedoId: string): TorpedoDataRecord {
  const t = data.torpedoes.torpedoes.find((x) => x.id === torpedoId);
  if (!t || !isTorpedoDataRecord(t)) throw new Error(`torpedoes.json の ${torpedoId} が無いか、settings/reliability が欠けている`);
  return t;
}

/** enemies.json の 1 レコードのうち v0.2 で使う部分（船体＋AI＋反撃） */
export interface EnemyDataRecord extends EnemyAiDataRecord, EnemyGunneryDataRecord {
  length_m: number;
  beam_m: number;
  hull_circles: number;
  torpedo_hits_to_sink: number;
}

export function getEnemyRecord(data: GameData, enemyId: string): EnemyDataRecord {
  const e = data.enemies.enemies.find((x) => x.id === enemyId) as Record<string, unknown> | undefined;
  if (!e) throw new Error(`enemies.json に ${enemyId} が無い`);
  const keys = ['length_m', 'beam_m', 'hull_circles', 'torpedo_hits_to_sink'] as const;
  for (const k of keys) if (!isNum(e[k])) throw new Error(`enemies.json の ${enemyId}.${k} が無い`);
  if (!isEnemyAiDataRecord(e)) {
    throw new Error(`enemies.json の ${enemyId} に speed/turn_rate/accel/detection/evasion/ram/patrol のどれかが欠けている（docs/02 §6.4）`);
  }
  if (!isEnemyGunneryDataRecord(e)) {
    throw new Error(`enemies.json の ${enemyId} に guns/searchlight/starshell のフィールドが欠けている（docs/02 §6.5）`);
  }
  return {
    length_m: e['length_m'] as number,
    beam_m: e['beam_m'] as number,
    hull_circles: e['hull_circles'] as number,
    torpedo_hits_to_sink: e['torpedo_hits_to_sink'] as number,
    speed_typical_kt: e.speed_typical_kt,
    speed_max_kt: e.speed_max_kt,
    turn_rate_deg_s: e.turn_rate_deg_s,
    accel_mps2: e.accel_mps2,
    detection: e.detection,
    evasion: e.evasion,
    ram: e.ram,
    patrol: e.patrol,
    guns: e.guns,
    searchlight: e.searchlight,
    starshell: e.starshell,
  };
}

/** boats.json の被害パラメータ（hull_hp と damage.*） */
export function getBoatDamageParams(data: GameData, boatId: string): DamageParams {
  const b = data.boats.boats.find((x) => x.id === boatId);
  if (!b || !isBoatDamageDataRecord(b)) throw new Error(`boats.json の ${boatId} に hull_hp / damage.* が無い（docs/02 §6.6）`);
  return damageParamsFromData(b);
}

/**
 * 視界パラメータ（docs/02 §6.5）: hit_rate_model.visibility に月齢を当て、史実モードが既定で有効なら発見距離の倍率を掛ける。
 * 起動時に 1 回作り、以後は数値だけ読む（§7）。
 */
export function getVisibilityParams(data: GameData, moon: MoonPhase): VisibilityParams {
  const v = data.hitRateModel.visibility;
  const hm = data.hitRateModel.historical_mode;
  return {
    visPlayerBaseM: v.vis_player_base_m,
    moonFactor: v.moon_factor[moon],
    speedFactor: v.speed_factor,
    smokeFactor: v.smoke_factor,
    detectHoldS: v.detect_hold_s,
    detectionMultiplier: hm.enabled_default ? hm.enemy_detection_multiplier : 1,
  };
}

/** 史実モードが既定で有効なら回避の倍率、そうでなければ 1 */
export function getEvasionMultiplier(data: GameData): number {
  const hm = data.hitRateModel.historical_mode;
  return hm.enabled_default ? hm.enemy_evasion_multiplier : 1;
}
