// 夜の哨戒機の模擬の組み立て（v0.6.7。jp_02「孤島の哨戒」。spec-v067 §F.1）: data から core/patrol-air-sim の設定を作る（buildWorldSetup(data, 'jp_02') の値をそのまま）。
// data の上書き（scripts の BOMBS・CEP・GAP・ORBIT・MARGIN・RADAR）は記録を写して buildWorldSetup に通す＝起動時の検査（spec C.7 の C1〜C9・夜の出撃と夜明けの空襲の今の検査）も通る。
// 1 機の爆弾の数と CEP は機体の記録なので夜の出撃と夜明けの空襲の両方に効く（夜明けの波の爆弾も変わる）。模擬の揺らぎ（HOLD・RJIT・STOPJIT・CREW）は data ではない。
// Phaser 非依存・window を読まない（ゲームは使わない）。
import type { GameData } from '../config/game-data';
import { getBoatRecord, getPrototypeMission } from '../config/game-data';
import { FIXED_STEP_S } from '../config/step-config';
import { PATROL_AIR_EVENT_ID } from '../core/patrol-air-data';
import type { PatrolSimSetup } from '../core/patrol-air-sim';
import { QUIET_BELOW_KT } from '../core/patrol-air-sim-policy';
import { buildWorldSetup } from './world-setup';

/** 夜の哨戒機の任務（v0.6.7 は jp_02 だけ） */
export const PATROL_SIM_MISSION = 'jp_02';
/** 揺らぎの既定（spec §F.1・D20）: 転舵の反応 0.35〜0.9 秒（~ の台本）・帰投の向きへ戻す 0.6〜1.4 秒 */
export const PATROL_REACT_JITTER_S: readonly [number, number] = [0.35, 0.9];
export const PATROL_HOLD_S: readonly [number, number] = [0.6, 1.4];

export interface PatrolSimOverrides {
  /** us_patrol_bomber.strike.bomb の count（1 機の爆弾）・accuracy_cep_m（夜の出撃と夜明けの空襲の両方） */
  bombs?: number;
  cepM?: number;
  /** risk_events.json の patrol_air.params の sweep_gap_s・orbit_s・hud_stop_margin_s */
  sweepGapS?: number;
  orbitS?: number;
  marginS?: number;
  /** missions_seed の v0_1_prototype.patrol_air.radar_passes */
  radarPasses?: number;
  /** 模擬の揺らぎ: 帰投の向きへ戻す秒（[0.9, 0.9] で v1 の決め打ち）・転舵の反応（~）・止める遅れ（捜索ごと。無ければ台本の決まった秒）・乗員の減りの効き（false で切る） */
  holdS?: readonly [number, number];
  reactJitterS?: readonly [number, number];
  stopJitterS?: readonly [number, number];
  crewOn?: boolean;
}

type Rec = Record<string, unknown>;

/** 上書きを当てた data の写し（上書きが無ければそのまま） */
function withPatrolOverrides(data: GameData, missionId: string, o: PatrolSimOverrides): GameData {
  if ([o.bombs, o.cepM, o.sweepGapS, o.orbitS, o.marginS, o.radarPasses].every((v) => v === undefined)) return data;
  const m = (data.missionsSeed.missions as readonly Rec[]).find((x) => x['id'] === missionId);
  const block = (m?.['v0_1_prototype'] as Rec | undefined)?.['patrol_air'] as Rec | undefined;
  if (!m || !block) throw new Error(`${missionId} に夜の哨戒機（v0_1_prototype.patrol_air）が無い`);
  const planeId = block['aircraft_id'];
  const enemies = (data.enemies.enemies as readonly Rec[]).map((e) => {
    if (e['id'] !== planeId || (o.bombs === undefined && o.cepM === undefined)) return e;
    const st = e['strike'] as Rec;
    const b = st['bomb'] as Rec;
    return { ...e, strike: { ...st, bomb: { ...b, count: o.bombs ?? b['count'], accuracy_cep_m: o.cepM ?? b['accuracy_cep_m'] } } };
  });
  const events = (data.riskEvents.events as readonly Rec[]).map((e) => {
    if (e['id'] !== PATROL_AIR_EVENT_ID) return e;
    const p = e['params'] as Rec;
    return { ...e, params: { ...p, sweep_gap_s: o.sweepGapS ?? p['sweep_gap_s'], orbit_s: o.orbitS ?? p['orbit_s'], hud_stop_margin_s: o.marginS ?? p['hud_stop_margin_s'] } };
  });
  const missions = (data.missionsSeed.missions as readonly Rec[]).map((x) => {
    if (x !== m || o.radarPasses === undefined) return x;
    const proto = x['v0_1_prototype'] as Rec;
    return { ...x, v0_1_prototype: { ...proto, patrol_air: { ...block, radar_passes: o.radarPasses } } };
  });
  return { ...data, enemies: { ...data.enemies, enemies }, riskEvents: { ...data.riskEvents, events }, missionsSeed: { ...data.missionsSeed, missions } } as unknown as GameData;
}

export function patrolSimSetup(data: GameData, o: PatrolSimOverrides = {}, missionId: string = PATROL_SIM_MISSION): PatrolSimSetup {
  const w = buildWorldSetup(withPatrolOverrides(data, missionId, o), missionId);
  if (!w.patrolAir || !w.airStrike) throw new Error(`${missionId} に夜の哨戒機（v0_1_prototype.patrol_air）と夜明けの空襲（dawn_strike）が無い`);
  const rec = getBoatRecord(data, getPrototypeMission(data, missionId).playerBoatId);
  const pair = (v: readonly [number, number] | undefined, d: readonly [number, number], what: string): readonly [number, number] => {
    const x = v ?? d;
    if (!(x[0] >= 0 && x[1] >= x[0])) throw new Error(`${what}（${x.join(',')}）は 0 ≤ lo ≤ hi`);
    return x;
  };
  const ring = w.mission.returnPoint;
  return {
    gate: w.patrolAir.gate,
    sortie: w.patrolAir.sortie,
    dawn: w.airStrike,
    boat: w.boatParams,
    damage: w.damageParams,
    crew: w.crew,
    crewEffects: w.crewEffects,
    crewOn: o.crewOn ?? true,
    fuelCurve: w.fuelCurve,
    fuelStartGal: w.fuelStartGal,
    start: w.playerStart,
    ring: { x: ring.x, y: ring.y, radiusM: ring.radiusM },
    bounds: w.mission.bounds,
    boundsMarginM: w.boundsMarginM,
    durationS: w.durationS,
    timeScale: w.timeScale,
    stepS: FIXED_STEP_S,
    // 速さの指令は kt の比（全速 1）: 巡航は自艇の speed_cruise_kt、静音は自艇の静音の上限の 0.4 kt 下（T-14: 20/31・13.6/31）
    cruise01: rec.speed_cruise_kt / rec.speed_max_kt,
    quiet01: (rec.speed_bands_kt.silent_max - QUIET_BELOW_KT) / rec.speed_max_kt,
    reactJitterS: pair(o.reactJitterS, PATROL_REACT_JITTER_S, '転舵の反応の揺らぎ RJIT'),
    holdS: pair(o.holdS, PATROL_HOLD_S, '帰投の向きへ戻す秒 HOLD'),
    stopJitterS: o.stopJitterS ? pair(o.stopJitterS, o.stopJitterS, '止める遅れの揺らぎ STOPJIT') : null,
  };
}
