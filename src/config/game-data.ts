// data/*.json を Vite でバンドルして1回だけ読む（CLAUDE.md §7「JSONを毎シーンfetchしない」、§8 データ駆動）。
// 実行時 fetch にしない理由: Pages のサブパス（/ww2-torpedo-boat/）で 404 を踏まず、オフライン PWA でも壊れない。
import boats from '../../data/boats.json';
import torpedoes from '../../data/torpedoes.json';
import enemies from '../../data/enemies.json';
import hitRateModel from '../../data/hit_rate_model.json';
import riskEvents from '../../data/risk_events.json';
import missionsSeed from '../../data/missions_seed.json';
import { isBoatDataRecord, type BoatDataRecord } from '../core/boat-motion';

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
  bounds: { width: number; height: number };
  playerStart: { x: number; y: number; headingDeg: number };
  durationS: number;
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function getPrototypeMission(data: GameData, missionId: string): PrototypeMission {
  const m = data.missionsSeed.missions.find((x) => x.id === missionId) as Record<string, unknown> | undefined;
  if (!m) throw new Error(`missions_seed.json に ${missionId} が無い`);
  const proto = m['v0_1_prototype'] as Record<string, unknown> | undefined;
  const bounds = proto?.['bounds_m'] as Record<string, unknown> | undefined;
  const start = proto?.['player_start'] as Record<string, unknown> | undefined;
  if (!proto || !bounds || !start || !isNum(bounds['width']) || !isNum(bounds['height']) || !isNum(start['x_m']) || !isNum(start['y_m']) || !isNum(start['heading_deg'])) {
    throw new Error(`${missionId}.v0_1_prototype に bounds_m / player_start が無い（docs/02 §6.1）`);
  }
  const playerBoatId = m['player_boat'];
  if (typeof playerBoatId !== 'string') throw new Error(`${missionId}.player_boat が無い`);
  return {
    id: missionId,
    playerBoatId,
    bounds: { width: bounds['width'], height: bounds['height'] },
    playerStart: { x: start['x_m'], y: start['y_m'], headingDeg: start['heading_deg'] },
    durationS: isNum(proto['duration_s']) ? proto['duration_s'] : 60,
  };
}

/** boats.json から id で艇レコードを引く。運動に必要なフィールドが無ければ例外 */
export function getBoatRecord(data: GameData, boatId: string): BoatDataRecord {
  const b = data.boats.boats.find((x) => x.id === boatId);
  if (!b || !isBoatDataRecord(b)) throw new Error(`boats.json の ${boatId} が無いか、運動フィールドが欠けている`);
  return b;
}
