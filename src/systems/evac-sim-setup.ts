// 空襲下の退避の模擬の組み立て（v0.6.11 S3。jp_03。spec-v0611-r2 §12.1・§12.5）: data から core/evac-sim の設定を作る（buildWorldSetup(data, 'jp_03') の値をそのまま）。
// つまみ（spec §12.5 の順の data の鍵）の上書きは記録を写して buildWorldSetup に通す＝起動時の検査（V-E1〜V-E12・空襲の段の検査）も通る（通らない値は例外）。
// 隊の砲（n = 1・2・3）は艇の gun_battery から core/evac-sim-aa の evacGunVariants、対空は hit_rate_model.json（config/loadout-data）。Phaser 非依存・window を読まない。
import type { GameData } from '../config/game-data';
import { getAntiAircraftParams, getBoatGunParams } from '../config/loadout-data';
import { FIXED_STEP_S } from '../config/step-config';
import { EVAC_EVENT_ID } from '../core/evac-data';
import type { EvacSimSetup } from '../core/evac-sim';
import { evacGunVariants } from '../core/evac-sim-aa';
import { directSortie } from '../core/sortie';
import { buildWorldSetup } from './world-setup';

/** 空襲下の退避の任務（v0.6.11 は jp_03 だけ） */
export const EVAC_SIM_MISSION = 'jp_03';
/** 決着の後の打ち切り（実秒。§2 の 4 機の中で輪に着けないまま走り続ける回を止める） */
export const EVAC_SIM_AFTER_S = 180;
/** 燃料 0 で止まってから漂流で終わる実秒（config/ui-config の MISSION_END_DELAY_MS 1500 と同じ。ui-config は画面の game-config を読むので node の模擬から読まない。tests/evac-sim-a で一致を確かめる） */
export const EVAC_SIM_ADRIFT_DELAY_S = 1.5;

/** spec §12.5 のつまみ（data の鍵。undefined は data のまま） */
export interface EvacSimOverrides {
  /** 1: evac.ai.dodge.success・evac.ai.pick_s */
  dodgeSuccess?: number;
  pickS?: number;
  /** 2: evac.haul_s */
  haulS?: number;
  /** 3: 隠れ場所を外す（evac.shelters の id。return_point の home_cave は外せない＝V-E8） */
  dropShelters?: readonly string[];
  /** 4: evac_raid.cover_reveal_chance（ノーマル）・hard.evac_cover_reveal_chance */
  coverReveal?: number;
  coverRevealHard?: number;
  /** 5: evac_raid.announce_lead_s */
  announceLeadS?: number;
  /** 6: risk_events unten_air_raid.params.sortie の first_run_s・run_gap_s */
  firstRunS?: number;
  runGapS?: number;
  /** 7: evac_raid.flights_per_group_max */
  flightsPerGroupMax?: number;
  /** 8: evac.follow.gap_m */
  followGapM?: number;
  /** 9: evac.ai.full_p */
  fullP?: number;
}

type Rec = Record<string, unknown>;

/** 上書きを当てた data の写し（上書きが無ければそのまま） */
export function withEvacOverrides(data: GameData, o: EvacSimOverrides, missionId: string = EVAC_SIM_MISSION): GameData {
  if (Object.values(o).every((v) => v === undefined)) return data;
  const missions = (data.missionsSeed.missions as readonly Rec[]).map((m) => {
    if (m['id'] !== missionId) return m;
    const proto = m['v0_1_prototype'] as Rec;
    const evac = proto['evac'] as Rec;
    const ai = evac['ai'] as Rec;
    const dodge = ai['dodge'] as Rec;
    const follow = evac['follow'] as Rec;
    const raid = proto['evac_raid'] as Rec;
    const hard = proto['hard'] as Rec | undefined;
    const shelters = (evac['shelters'] as readonly Rec[]).filter((s) => !(o.dropShelters ?? []).includes(s['id'] as string));
    return {
      ...m,
      v0_1_prototype: {
        ...proto,
        evac: {
          ...evac,
          haul_s: o.haulS ?? evac['haul_s'],
          shelters,
          follow: { ...follow, gap_m: o.followGapM ?? follow['gap_m'] },
          ai: { ...ai, pick_s: o.pickS ?? ai['pick_s'], full_p: o.fullP ?? ai['full_p'], dodge: { ...dodge, success: o.dodgeSuccess ?? dodge['success'] } },
        },
        evac_raid: {
          ...raid,
          cover_reveal_chance: o.coverReveal ?? raid['cover_reveal_chance'],
          announce_lead_s: o.announceLeadS ?? raid['announce_lead_s'],
          flights_per_group_max: o.flightsPerGroupMax ?? raid['flights_per_group_max'],
        },
        ...(hard ? { hard: { ...hard, evac_cover_reveal_chance: o.coverRevealHard ?? hard['evac_cover_reveal_chance'] } } : {}),
      },
    };
  });
  const events = (data.riskEvents.events as readonly Rec[]).map((e) => {
    if (e['id'] !== EVAC_EVENT_ID || (o.firstRunS === undefined && o.runGapS === undefined)) return e;
    const p = e['params'] as Rec;
    const s = p['sortie'] as Rec;
    return { ...e, params: { ...p, sortie: { ...s, first_run_s: o.firstRunS ?? s['first_run_s'], run_gap_s: o.runGapS ?? s['run_gap_s'] } } };
  });
  return { ...data, riskEvents: { ...data.riskEvents, events }, missionsSeed: { ...data.missionsSeed, missions } } as unknown as GameData;
}

/** 模擬の設定（hard でハード。seed は値に効かない＝evac の値は seed・史実モードで変わらない＝tests/setup-jp03） */
export function evacSimSetup(data: GameData, hard: boolean, o: EvacSimOverrides = {}, missionId: string = EVAC_SIM_MISSION): EvacSimSetup {
  const d = withEvacOverrides(data, o, missionId);
  const w = buildWorldSetup(d, missionId, { sortie: directSortie(missionId, 1, 'none', hard, false), hard });
  const ev = w.evac;
  if (!ev || !w.airStrike) throw new Error(`${missionId} に空襲下の退避（v0_1_prototype.evac）と 240 秒の後の空襲（dawn_strike）が無い`);
  const gun = getBoatGunParams(d, ev.params.boatId);
  return {
    params: ev.params,
    raid: ev.raid,
    sorties: ev.sorties,
    fuelFreeUntilS: ev.fuelFreeUntilS,
    dawn: w.airStrike,
    boat: w.boatParams,
    damage: w.damageParams,
    crew: w.crew,
    crewEffects: w.crewEffects,
    fuelCurve: w.fuelCurve,
    fuelStartGal: w.fuelStartGal,
    bounds: w.mission.bounds,
    boundsMarginM: w.boundsMarginM,
    durationS: w.durationS,
    timeScale: w.timeScale,
    stepS: FIXED_STEP_S,
    guns: gun ? evacGunVariants(gun, ev.params.groupSize) : null,
    aa: getAntiAircraftParams(d),
    adriftDelayS: EVAC_SIM_ADRIFT_DELAY_S,
    afterS: EVAC_SIM_AFTER_S,
  };
}
