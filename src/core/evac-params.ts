// 空襲下の退避（v0.6.11。jp_03）の世界の値（WorldSetup.evac の params・raid）: core/evac-data で形を検査した data から、m・m/s（game）・実秒の値を組む。
// 値の範囲の検査（V-E1〜V-E12）は config/evac-mission-data。Phaser 非依存・乱数なし・起動時に 1 回だけ（確保はここだけ）。JSON に写せる形＝setup の snapshot。
import { SHELTER_CAVE, SHELTER_COVER, type EvacBlock, type EvacRaidBlock } from './evac-data';
import { ktToMps } from './units';

export interface EvacGroupParams {
  id: string;
  labelJa: string;
  placeJa: string;
  x: number;
  y: number;
  headingDeg: number;
}

export interface EvacShelterParams {
  id: string;
  labelJa: string;
  /** SHELTER_CAVE か SHELTER_COVER */
  kind: number;
  x: number;
  y: number;
  slots: number;
  exitHeadingDeg: number;
}

/** 隊・隠れ場所・追従・操作していない隊の値（ノーマルとハードで同じ） */
export interface EvacParams {
  boatId: string;
  labelJa: string;
  groupSize: number;
  /** 最初に操作する隊の番号（0 始まり。data の start_group は 1 始まり） */
  startGroup: number;
  groups: EvacGroupParams[];
  mooredGapM: number;
  followGapM: number;
  trailStepM: number;
  catchUpGainPerS: number;
  headingDeadbandM: number;
  /** 隊ごとの航跡の輪の長さ（ceil((group_size − 1) × gap_m / trail_step_m) + 2。spec §3.2） */
  trailLen: number;
  shelterRingM: number;
  /** 入り始める速さ m/s（game。BoatState.speedMps と同じ単位） */
  hideMaxMps: number;
  haulS: number;
  launchStick: number;
  slotAbeamM: number;
  slotArriveM: number;
  shelters: EvacShelterParams[];
  /** 帰投の輪（return_point）と同じ点の壕の番号（V-E8） */
  homeShelter: number;
  castOffMinS: number;
  castOffMaxS: number;
  pickS: number;
  turnMaxDeg: number;
  fullP: number;
  wallM: number;
  wallTurnDeg: number;
  lookM: number;
  foundReactS: number;
  dodgeSuccess: number;
  dodgeTurnDeg: number;
  dodgeHoldS: number;
  flashReveal: boolean;
}

/** 波・編隊・狙い・残存の値（flights と coverRevealChance はハードで替わる） */
export interface EvacRaidParams {
  waves: { announceS: number; planes: number }[];
  flights: number;
  announceLeadS: number;
  fromBearingDeg: number;
  flightOffsetsDeg: number[];
  spawnM: number;
  flightsPerGroupMax: number;
  bearingFixDeg: number[];
  coverRevealChance: number;
  survivorQuota: number;
  survivorsTotal: number;
  historicalSurvivors: number;
  northShoreLabelJa: string;
  /** 港の中心（海域の中心。編隊の現れる点の基準） */
  centerX: number;
  centerY: number;
}

/** 航跡の輪の長さ（spec §3.2・r2 M4） */
export function evacTrailLen(groupSize: number, gapM: number, trailStepM: number): number {
  return Math.ceil(((groupSize - 1) * gapM) / trailStepM) + 2;
}

/** 世界の値を組む（値の範囲の検査は config/evac-mission-data の V-E1〜V-E12。homeShelter はそこで決めて渡す） */
export function evacParamsFromData(b: EvacBlock, homeShelter: number): EvacParams {
  return {
    boatId: b.boat,
    labelJa: b.label_ja,
    groupSize: b.group_size,
    startGroup: b.start_group - 1,
    groups: b.groups.map((g) => ({ id: g.id, labelJa: g.label_ja, placeJa: g.place_ja, x: g.x_m, y: g.y_m, headingDeg: g.heading_deg })),
    mooredGapM: b.moored_gap_m,
    followGapM: b.follow.gap_m,
    trailStepM: b.follow.trail_step_m,
    catchUpGainPerS: b.follow.catch_up_gain_per_s,
    headingDeadbandM: b.follow.heading_deadband_m,
    trailLen: evacTrailLen(b.group_size, b.follow.gap_m, b.follow.trail_step_m),
    shelterRingM: b.shelter_ring_m,
    hideMaxMps: ktToMps(b.hide_max_kt),
    haulS: b.haul_s,
    launchStick: b.launch_stick,
    slotAbeamM: b.slot_abeam_m,
    slotArriveM: b.slot_arrive_m,
    shelters: b.shelters.map((s) => ({ id: s.id, labelJa: s.label_ja, kind: s.kind === 'cave' ? SHELTER_CAVE : SHELTER_COVER, x: s.x_m, y: s.y_m, slots: s.slots, exitHeadingDeg: s.exit_heading_deg })),
    homeShelter,
    castOffMinS: b.ai.cast_off_s[0],
    castOffMaxS: b.ai.cast_off_s[1],
    pickS: b.ai.pick_s,
    turnMaxDeg: b.ai.turn_max_deg,
    fullP: b.ai.full_p,
    wallM: b.ai.wall_m,
    wallTurnDeg: b.ai.wall_turn_deg,
    lookM: b.ai.look_m,
    foundReactS: b.ai.found_react_s,
    dodgeSuccess: b.ai.dodge.success,
    dodgeTurnDeg: b.ai.dodge.turn_deg,
    dodgeHoldS: b.ai.dodge.hold_s,
    flashReveal: b.flash_reveal,
  };
}

/** 波・編隊の値を組む。flights・coverRevealChance はハードの値（無ければノーマル）を呼び手が渡す */
export function evacRaidParamsFromData(r: EvacRaidBlock, flights: number, coverRevealChance: number, bounds: { width: number; height: number }): EvacRaidParams {
  return {
    waves: r.waves.map((w) => ({ announceS: w.announce_s, planes: w.planes })),
    flights,
    announceLeadS: r.announce_lead_s,
    fromBearingDeg: r.from_bearing_deg,
    flightOffsetsDeg: r.flight_offsets_deg.slice(),
    spawnM: r.spawn_m,
    flightsPerGroupMax: r.flights_per_group_max,
    bearingFixDeg: r.bearing_fix_deg.slice(),
    coverRevealChance,
    survivorQuota: r.survivor_quota,
    survivorsTotal: r.survivors_total,
    historicalSurvivors: r.historical_survivors,
    northShoreLabelJa: r.north_shore_label_ja,
    centerX: bounds.width / 2,
    centerY: bounds.height / 2,
  };
}
