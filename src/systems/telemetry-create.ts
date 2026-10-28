// 出発時の HUD 向けテレメトリを 1 個だけ作る（v0.6.8 S0 で systems/mission-telemetry から移した。中身は v0.6.7 のまま。mission-telemetry が re-export する）。
// 毎フレームの書き換え（refreshTelemetry）と Result の組み立て（buildMissionResult）は mission-telemetry に残る（§7: ここは出撃時に 1 回だけ確保する）。
import { createArmsTelemetry } from '../core/arms-cue';
import type { BoatTelemetry } from '../core/boat-motion';
import { createEngineTelemetry } from '../core/engine-trouble';
import { createGunboatTelemetry } from '../core/gunboat';
import { FF_IDLE, FF_OUT_NONE } from '../core/friendly';
import { bearingJa } from '../core/briefing';
import { GUN_SAFE } from '../core/gun-battery';
import { SP_IDLE, SP_OUT_NONE } from '../core/seaplane';
import { STORM_NONE } from '../core/storm';
import { mpsToKt } from '../core/units';
import { initConvoyTelemetry } from './convoy-telemetry';
import { initDawnTelemetry } from './dawn-telemetry';
import { initPatrolTelemetry } from './patrol-telemetry';
import { initPtTelemetry } from './pt-telemetry';
import type { MissionWorld } from './mission-world';

/** 出発時のテレメトリ（帰投・燃料の値は直後の refreshReturnState と refreshTelemetry で埋まる） */
export function createTelemetry(w: MissionWorld, zoom: number, timeLeftS: number): BoatTelemetry {
  return {
    speedMps: w.boat.state.speedMps,
    rudder: 0,
    targetStep: 'stop',
    headingDeg: w.boat.state.headingDeg,
    torpedoesLeft: w.torpedoes.capacity,
    hits: 0,
    timeLeftS,
    enemyDx: NaN,
    enemyDy: NaN,
    enemySighted: false,
    playerDetected: false,
    detectRangeM: w.detectRangeM,
    illuminated: false,
    starLit: false,
    hp: w.damage.hp,
    hpMax: w.damageParams.maxHp,
    onFire: false,
    engineDamaged: false,
    smokeLeftS: 0,
    smokeCooldownS: 0,
    hiddenBySmoke: false,
    cameraZoom: zoom,
    fuel01: 1,
    fuelNeed01: 0,
    fuelEmpty: false,
    homeDx: w.returnPoint.x - w.boat.state.x,
    homeDy: w.returnPoint.y - w.boat.state.y,
    homeDistM: 0,
    homeEdgeM: 0,
    callFlags: 0,
    atHome: false,
    homeWaiting: false,
    destroyerSunk: false,
    shallowState: 0,
    shallowAheadM: 0,
    shallowSafeKt: Math.round(mpsToKt(w.setup.grounding.safeSpeedMps)),
    friendlyPhase: FF_IDLE,
    friendlyLeftS: NaN,
    friendlyPasses: 0,
    friendlyOutcome: FF_OUT_NONE,
    friendlyPending: false,
    planePhase: SP_IDLE,
    planeDistM: 0,
    planeLocked: false,
    planeWake: false,
    planeWakeKt: w.setup.seaplane ? w.setup.seaplane.wakeThresholdKt : 0,
    planeFlareOn: false,
    planeBombsDropped: 0,
    planeBombAir: false,
    planeBombsHit: 0,
    planeOutcome: SP_OUT_NONE,
    planeDx: NaN,
    planeDy: NaN,
    stormState: w.storm ? w.storm.status.state : STORM_NONE,
    stormGapM: w.storm ? w.storm.status.gapM : 0,
    stormNorth: w.storm ? w.storm.status.north : true,
    stormFast: w.storm ? w.storm.status.fast : false,
    stormLos: false,
    stormSafeKt: w.setup.storm ? w.setup.storm.safeSpeedKt : 0,
    crewAlive: w.setup.crew.total,
    crewTotal: w.setup.crew.total,
    crewTurnFactor: 1,
    extinguishHoldS: w.damageParams.extinguishHoldS,
    gunMission: w.hunt !== null,
    gunStatus: GUN_SAFE,
    gunFast: false,
    gunTargetM: 0,
    gunReloadLeftS: 0, // 大発への砲の弾倉交換（v0.6.8 実機 1 回目。下の refreshTelemetry が w.hunt.mag から写す）
    gunRangeM: w.setup.guns ? w.setup.guns.rangeM : 0,
    gunEffectiveM: w.setup.guns ? w.setup.guns.effectiveM : 0,
    gunSteadyKt: Math.round(mpsToKt(w.params.silentMaxMps)),
    bargesSunk: 0,
    bargesBeached: 0,
    bargesQuota: w.setup.barges ? w.setup.barges.quota : 0,
    bargesTotal: w.setup.barges ? w.setup.barges.count : 0,
    bargeEscapeS: NaN,
    // v0.4.2 の岸は南だけ（mission-data の検査）。「大発は東から」だけでは出発点から南へ 1,900 m 行くことが伝わらなかった（実機）
    bargeHint: w.setup.barges ? `大発は${bearingJa(180)}の岸沿いを${bearingJa(w.setup.barges.headingDeg + 180)}から` : '',
    coastDx: NaN,
    coastDy: NaN,
    batteryEnabled: w.hunt !== null && w.hunt.shores.length > 0,
    batteryInArc: false,
    batteryAlerted: false,
    escortEnabled: w.escort !== null,
    escortHp: w.escort ? w.escort.state.hp : 0,
    escortHpMax: w.escort ? w.escort.p.maxHp : 0,
    escortDistM: 0,
    escortSunk: false,
    escortLagWarnM: w.escort ? w.escort.p.lagWarnM : 0,
    shipsSunk: 0,
    shipsTotal: w.destroyers ? w.destroyers.destroyerCount : 0,
    friendlyEnabled: w.friendly !== null,
    seaplaneEnabled: w.seaplane !== null,
    transportEnabled: w.destroyers !== null && w.destroyers.hasTransport,
    transportSunk: false,
    dawn: initDawnTelemetry(w),
    pt: initPtTelemetry(w), // 敵の米PT（v0.6.3。systems/pt-telemetry。無い任務は enabled false）
    convoy: initConvoyTelemetry(w), // 味方の大発の輸送隊（v0.6.4。systems/convoy-telemetry。無い任務は enabled false）
    engine: createEngineTelemetry(), // 機関の不調（v0.6.5。jp_05。無い任務は on false のまま。下の refreshTelemetry が毎フレーム写す）
    gunboat: createGunboatTelemetry(), // 隼艇（v0.6.6。jp_01 のハード。無い任務は enabled false のまま。下の refreshTelemetry が毎フレーム写す）
    patrol: initPatrolTelemetry(w), // 夜の哨戒機（v0.6.7。jp_02。systems/patrol-telemetry。無い任務は enabled false）
    aaFiring: false, // 機銃で機を撃っている（v0.6.8）
    arms: createArmsTelemetry(), // 兵装（v0.6.8。systems/arms-telemetry が毎フレーム書く）
  };
}
