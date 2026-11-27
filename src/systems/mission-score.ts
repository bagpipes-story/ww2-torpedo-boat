// 任務の得点の材料（v0.9.0 で scenes/result-scene の create から抜き出し。spec-v0900 §4.5）: Result の「スコア」の行と、ストアの点（Mission の endMission で 1 回）が同じ式を読む。
// Result は作り直されることがある（brief-result は材料を書き換えて作り直す）ので、Result は材料からその場で計算して出すだけ（点を足すのは endMission だけ＝二重に数えない）。
// 撃破: 大発（砲）・13mm で沈めた米PT（v0.6.3 実機 1 回目。撃退は点なし）か輸送船（魚雷。v0.4.7）。米PT は隊の数（隼艇 v0.6.6・卯月 v0.6.10 S5b が沈めた PT も入る）。
// 上陸（v0.6.4。味方の大発の輸送隊。scoring.json の convoy.points_per_arrival）は帰投の有無に関わらず上陸した隻数ぶん。
// 揚陸（v0.6.9。jp_04。scoring.json の landing.points_complete）は帰投の有無・その後の沈没に関わらず揚陸完了なら。揚陸の無い任務は鍵ごと無い。
import { getScoringParams, type GameData } from '../config/game-data';
import { hasHardVariant } from '../config/mission-data';
import { getStoreCatalogue } from '../config/store-data';
import { evacScoredBoats, type EvacResult } from '../core/evac-result';
import { LD_DONE } from '../core/landing';
import { computeScore, type ScoreBreakdown, type ScoreInput } from '../core/scoring';
import { sortieAccrual } from '../core/store';
import type { Sortie } from '../core/sortie';

/** 輸送船の enemies.json の id（scoring.json の kill.points_by_enemy のキー。v0.4.7） */
const TRANSPORT_ENEMY_ID = 'ijn_transport';

/**
 * 得点が読む Result の材料（scenes/result-scene の MissionResult がそのまま満たす。result-scene は Phaser を import するので構造の型で読む＝ui/result-body と同じ作法。
 * tests が node の型検査で読める）
 */
export interface ScoreMaterial {
  readonly returned: boolean;
  readonly objectiveDone: boolean;
  readonly missionType: string;
  readonly bands: readonly { band: string; hits: number; duds: number }[];
  readonly hunt: { readonly sunk: number; readonly enemyId: string } | null;
  readonly pt: { readonly sunk: number; readonly enemyId: string } | null;
  readonly transportSunk: boolean;
  readonly transportEnabled: boolean;
  readonly fuelLeftPct: number;
  readonly crewAlive: number;
  readonly crewTotal: number;
  readonly detections: number;
  readonly dawn: { readonly caughtOutside: boolean };
  readonly convoy: { readonly arrived: number } | null;
  readonly landing?: { readonly phase: number };
  readonly evac?: EvacResult;
  readonly rescue?: { readonly delivered: number };
  readonly recon?: { readonly shipKills: readonly { enemyId: string; count: number }[] };
  readonly sortie: Sortie;
}

/** Result の材料 → 得点の材料（v0.8.5 までの Result の create のリテラルと同じ鍵・同じ値） */
export function missionScoreInput(r: ScoreMaterial): ScoreInput {
  const h = r.hunt;
  return {
    returned: r.returned,
    objectiveDone: r.objectiveDone,
    missionType: r.missionType,
    bands: r.bands,
    kills: h ? h.sunk : r.pt ? r.pt.sunk : r.transportSunk ? 1 : 0,
    killEnemyId: h ? h.enemyId : r.pt ? r.pt.enemyId : r.transportEnabled ? TRANSPORT_ENEMY_ID : '',
    fuelLeftPct: r.fuelLeftPct,
    crewAlive: r.crewAlive,
    crewTotal: r.crewTotal,
    detections: r.detections,
    afterDawn: r.returned && r.dawn.caughtOutside,
    arrivals: r.convoy ? r.convoy.arrived : 0,
    ...(r.landing ? { landed: r.landing.phase === LD_DONE } : {}),
    ...(r.evac ? { evacBoats: evacScoredBoats(r.evac) } : {}),
    ...(r.rescue ? { rescued: r.rescue.delivered } : {}),
    ...(r.recon ? { shipKills: r.recon.shipKills } : {}),
  };
}

/** 任務の得点（配点は base の data＝カスタムの出撃でも同じ配点） */
export function missionScore(r: ScoreMaterial, data: GameData): ScoreBreakdown {
  return computeScore(missionScoreInput(r), getScoringParams(data));
}

/** この出撃でストアに足す点（得点の合計 × 倍率。ハードはハードの違いのある任務だけ・史実モード・カスタム。data/store.json の accrual） */
export function missionStorePoints(r: ScoreMaterial, data: GameData): number {
  const s = r.sortie;
  return sortieAccrual(missionScore(r, data).total, getStoreCatalogue(data).accrual, { hardVariant: s.hard && hasHardVariant(data, s.missionId), historical: s.historical, custom: s.custom !== undefined });
}
