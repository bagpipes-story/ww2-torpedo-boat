// ?debug の上書きを世界の組み立て（systems/world-setup の SetupOptions）にまとめる（v0.4.6）。Briefing と Mission が同じ値で組むために 1 か所に置く。
// world-setup 自体は window を読まない（テストの tsconfig に DOM が無い）ので、URL を読む game-config の値はここで渡す。
import {
  DEBUG_ALLY_OFF,
  DEBUG_BACKDROP_OFF,
  DEBUG_BARGES_NEAR,
  DEBUG_BATTERY_OFF,
  DEBUG_DAWN_S,
  DEBUG_ENGINE_HOT,
  DEBUG_ENGINE_OFF,
  DEBUG_FIXED_NIGHT,
  DEBUG_FRIENDLY_FORCE,
  DEBUG_FUEL_ALLOTMENT_GAL,
  DEBUG_GUNBOAT_OFF,
  DEBUG_MAGAZINE_BOOM,
  DEBUG_PATROL_OFF,
  DEBUG_RADAR_OFF,
  DEBUG_RADIO_FAIL,
  DEBUG_RADIO_OFF,
  DEBUG_SEAPLANE,
  DEBUG_SEAPLANE_OFF,
  DEBUG_SHIP_HIT_SCALE,
  DEBUG_STORM_OFF,
  DEBUG_STORM_START_Y,
  DEBUG_STRIKE_OFF,
  DEBUG_TRANSPORT_OFF,
} from './game-config';
import type { Sortie } from '../core/sortie';
import type { SetupOptions } from '../systems/world-setup';

export function debugSetupOptions(sortie: Sortie, hard: boolean): SetupOptions {
  return {
    fuelGal: DEBUG_FUEL_ALLOTMENT_GAL,
    dawnS: DEBUG_DAWN_S,
    sortie,
    hard,
    historical: sortie.historical,
    stormOff: DEBUG_STORM_OFF,
    planeOff: DEBUG_SEAPLANE_OFF,
    bargesNear: DEBUG_BARGES_NEAR,
    batteryOff: DEBUG_BATTERY_OFF,
    fixedNight: DEBUG_FIXED_NIGHT,
    transportOff: DEBUG_TRANSPORT_OFF,
    forceStorm: Number.isFinite(DEBUG_STORM_START_Y),
    forcePlane: DEBUG_SEAPLANE !== 'none',
    forceFriendly: DEBUG_FRIENDLY_FORCE,
    shipHitScale: DEBUG_SHIP_HIT_SCALE,
    strikeOff: DEBUG_STRIKE_OFF,
    engineOff: DEBUG_ENGINE_OFF, // ?debug&engoff（v0.6.5）
    engineHot: DEBUG_ENGINE_HOT, // ?debug&enghot（v0.6.5）
    gunboatOff: DEBUG_GUNBOAT_OFF, // ?debug&nogunboat（v0.6.6）
    patrolOff: DEBUG_PATROL_OFF, // ?debug&nopatrol（v0.6.7）
    allyOff: DEBUG_ALLY_OFF, // ?debug&noally（v0.6.10）
    radarOff: DEBUG_RADAR_OFF, // ?debug&noradar（v0.8.0 S2。config/radar-mission-data の radarSetupPart）
    backdropOff: DEBUG_BACKDROP_OFF, // ?debug&nobackdrop（v0.8.1 S2。config/backdrop-mission-data の backdropSetupPart）
    radioOff: DEBUG_RADIO_OFF, // ?debug&noradio（v0.8.2 S2。config/recon-mission-data の reconSetupPart。報告の無い任務は何も変わらない）
    radioFail: DEBUG_RADIO_FAIL, // ?debug&radiofail（v0.8.2 S2。同上）
    magazineBoom: DEBUG_MAGAZINE_BOOM, // ?debug&boom（v0.8.2 S2。config/magazine-data の規則の確率を 1 に。規則の無い記録は変わらない）
  };
}
