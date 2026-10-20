// Mission の HUD 向けテレメトリと Result の組み立て（v0.4.0 で mission-scene から切り出し。切り出した中身は v0.3.5 のまま、v0.4.0 で Result に出撃と「出撃前」の行を足した）。
// テレメトリは 1 個だけ作って Registry に置き、毎フレーム中身だけ書き換える（§7: 確保しない）。Result は終了時に 1 回だけ作る。
import type { GameData } from '../config/game-data';
import { RUDDER_BAR_FULL_DEG } from '../config/ui-config';
import { turnCommand, type BoatTelemetry } from '../core/boat-motion';
import { crewAccelFactor, crewAlive, crewTurnFactor } from '../core/crew';
import { FF_CHALLENGE, FF_IDLE, FF_OUT_NONE } from '../core/friendly';
import { countHits, summarizeShots } from '../core/hit-rate';
import { bearingJa } from '../core/briefing';
import { GUN_FIRING, GUN_SAFE } from '../core/gun-battery';
import type { InputState } from '../core/input-state';
import { endCountsAsReturn, type MissionEndReason } from '../core/mission-flow';
import { SP_APPROACH, SP_IDLE, SP_OUT_NONE, bombInAir, seaplaneActive, seaplanePose } from '../core/seaplane';
import type { AircraftPose } from '../core/friendly';
import { raidResultLine } from '../core/sortie';
import { STORM_NONE } from '../core/storm';
import { mpsToKt } from '../core/units';
import type { MissionResult } from '../scenes/result-scene';
import { bargeResult, escortResult, seaplaneResultFields, stormResultFields } from './mission-result-extras';
import { dawnResult, initDawnTelemetry, refreshDawnTelemetry } from './dawn-telemetry';
import { initPtTelemetry, ptResult, refreshPtTelemetry } from './pt-telemetry';
import type { MissionWorld } from './mission-world';

const scratchPose: AircraftPose = { dx: 0, dy: 0, headingDeg: 0, alpha: 0 };

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
  };
}

/**
 * 敵の相対位置、見える・見つかった、反撃、被害、煙幕、燃料、帰投、ズームを telemetry へ（毎フレーム）。
 * 敵スプライトは視程内だけ表示する（docs/02 §6.5。ここで setSighted する）。帰投の距離と燃料の目盛りは Scene の refreshReturnState が書く
 */
export function refreshTelemetry(t: BoatTelemetry, w: MissionWorld, input: InputState, zoom: number, timeLeftS: number, callFlags: number): void {
  const s = w.boat.state;
  const g = w.destroyers;
  const down = w.enemy.shipDown;
  t.speedMps = s.speedMps;
  // 漂流中は舵が効かないので舵バーも 0
  t.rudder = w.fuel.empty ? 0 : turnCommand(input, s, RUDDER_BAR_FULL_DEG);
  t.headingDeg = s.headingDeg;
  t.targetStep = w.band;
  // 沈み始めたか退いた後（v0.6.2。狙う艦がいない）と帰投地点の輪の中では撃てないので残弾 0 を見せる（魚雷ボタンが暗くなる）
  t.torpedoesLeft = w.enemy.allOut || w.atHome ? 0 : w.torpedoes.remaining;
  t.hits = w.hits;
  t.timeLeftS = timeLeftS;
  // 敵の矢印と敵影: 駆逐艦（沈み始めたら無し）か、最も近い浮いている大発（v0.4.2。大発のスプライトの出し入れは barge-hunt）
  const e = w.enemy.focus(s.x, s.y);
  t.enemyDx = e ? e.x - s.x : NaN;
  t.enemyDy = e ? e.y - s.y : NaN;
  t.enemySighted = e !== null && t.enemyDx * t.enemyDx + t.enemyDy * t.enemyDy <= w.visRange2;
  // 駆逐艦のスプライトは艦ごとに視程で出し入れ（v0.4.5。1 隻なら最寄り＝その艦）
  if (g) {
    for (const d of g.ships) {
      if (d.out) continue;
      const dx = d.state.x - s.x;
      const dy = d.state.y - s.y;
      d.setSighted(dx * dx + dy * dy <= w.visRange2);
    }
    t.shipsSunk = g.sunkCount;
    t.transportSunk = g.transportSunk;
  }
  t.playerDetected = w.enemy.detected;
  // 大発の任務（v0.4.2）は煙幕を大発ごとに掛けるので、全員から隠れているときだけ表示の距離に smoke_factor を掛ける（us_02 は世界の値に込み）
  t.detectRangeM = w.hunt && w.hiddenBySmoke ? w.detectRangeM * w.vis.smokeFactor : w.detectRangeM;
  t.illuminated = w.enemy.illuminated;
  t.starLit = ((g ? g.anyStarLit : false) || w.flareLit) && !down; // 照明弾（艦の星弾か水上機の照明弾）
  t.hp = w.damage.hp;
  t.onFire = w.damage.fireLeftS > 0 && w.damage.hp > 0;
  t.engineDamaged = w.damage.engineDamaged;
  t.smokeLeftS = w.smoke ? Math.max(0, w.smoke.activeLeftS) : 0;
  t.smokeCooldownS = w.smoke ? Math.max(0, w.smoke.cooldownLeftS) : 0;
  t.hiddenBySmoke = w.hiddenBySmoke;
  t.cameraZoom = zoom;
  t.fuel01 = w.fuelAllotmentGal > 0 ? w.fuel.gal / w.fuelAllotmentGal : 0;
  t.fuelEmpty = w.fuel.empty;
  t.callFlags = callFlags;
  t.atHome = w.atHome;
  t.homeWaiting = w.atHome && w.torpedoesRunning;
  t.destroyerSunk = down;
  // 「岸 N m」: 浅瀬の縁の真北にいる間だけ（縁を越えたら・岸の無い任務は NaN で出さない）
  const ey = w.setup.coastEdgeY;
  t.coastDx = s.y < ey ? 0 : NaN;
  t.coastDy = s.y < ey ? ey - s.y : NaN;
  const h = w.hunt;
  if (h) {
    t.gunStatus = h.battery.status;
    t.gunFast = h.battery.fast && h.battery.status === GUN_FIRING;
    t.gunTargetM = h.battery.targetM;
    t.bargesSunk = h.flotilla.sunk;
    t.bargesBeached = h.flotilla.beached;
    t.bargeEscapeS = h.flotilla.escapeLeftS;
    t.batteryInArc = h.shoreInArc;
    t.batteryAlerted = h.shoreAlerted;
  }
  // 僚艇（v0.4.4）: HP・沈没・自艇からの距離（平方根はここの 1 回だけ）
  const es = w.escort ? w.escort.state : null;
  if (es) {
    t.escortHp = es.hp;
    t.escortSunk = es.sunk;
    t.escortDistM = Math.sqrt(es.dist2);
  }
  // 浅瀬の警告は世界が毎フレーム更新している（味方機の開始条件も同じ値を読む）
  t.shallowState = w.shallowStatus.state;
  t.shallowAheadM = w.shallowStatus.aheadM;
  // 味方機（docs/02 §6.8）: 識別の残り秒は要求中だけ
  const f = w.friendly ? w.friendly.state : null;
  t.friendlyPhase = f ? f.phase : FF_IDLE;
  t.friendlyLeftS = f && f.phase === FF_CHALLENGE ? f.timerS : NaN;
  t.friendlyPasses = f ? f.passes : 0;
  t.friendlyOutcome = f ? f.outcome : FF_OUT_NONE;
  t.friendlyPending = f ? f.pending : false;
  // 敵の水上機（docs/02 §6.8、v0.4.1）: 距離は接近中だけ（相対の半径。sqrt 無し）。マーカーの相対位置は来ている間だけ
  const sp = w.seaplane ? w.seaplane.state : null;
  t.planePhase = sp ? sp.phase : SP_IDLE;
  t.planeDistM = sp && sp.phase === SP_APPROACH ? sp.approachR : 0;
  t.planeLocked = sp ? sp.locked : false;
  t.planeWake = w.band === 'cruise' || w.band === 'full';
  t.planeFlareOn = sp ? sp.ordnance.flare.leftS > 0 : false;
  t.planeBombsDropped = sp ? sp.ordnance.bombsDropped : 0;
  t.planeBombAir = sp ? bombInAir(sp.ordnance) : false;
  t.planeBombsHit = sp ? sp.ordnance.bombsHit : 0;
  t.planeOutcome = sp ? sp.outcome : SP_OUT_NONE;
  if (sp && w.seaplane && seaplaneActive(sp)) {
    const q = seaplanePose(sp, w.seaplane.p, scratchPose);
    t.planeDx = q.dx;
    t.planeDy = q.dy;
  } else {
    t.planeDx = NaN;
    t.planeDy = NaN;
  }
  // 夜明け（v0.6.1）: ラッチ・夜明け後の秒・空襲の段。空襲の機が来ていれば「敵機」の矢印をその機で上書き（水上機の後）
  refreshDawnTelemetry(t, w, scratchPose);
  refreshPtTelemetry(t.pt, w); // 米PT（v0.6.3）: 隊の段階・航過・脅威の PT（矢印・敵影は上の enemy.focus がその PT）
  // 暴風（docs/02 §6.8）と乗員（§6.6）。乗員は HP から決まる
  const st = w.storm;
  if (st) {
    t.stormState = st.status.state;
    t.stormGapM = st.status.gapM;
    t.stormNorth = st.status.north;
    t.stormFast = st.status.fast;
    t.stormLos = st.state.los;
  }
  t.crewAlive = crewAlive(w.setup.crew, w.damageParams.maxHp, w.damage.hp);
  t.crewTurnFactor = crewTurnFactor(w.setup.crewEffects, w.crewLostNow);
  t.extinguishHoldS = w.damageParams.extinguishHoldS * w.extinguishHoldScale;
}

/** 終了時に 1 回だけ Result の材料を作る（走っている魚雷は呼び出し側が先に外れとして確定しておく） */
/** 終了時に 1 回だけ。startFireS は出撃時の火災が消えた実秒（燃えたまま終われば -1、火災なしで出撃なら NaN。Result の「出撃前」の行） */
export function buildMissionResult(reason: MissionEndReason, w: MissionWorld, data: GameData, elapsedS: number, ringEdgeM: number, startFireS: number): MissionResult {
  const counts = countHits(w.shots);
  const pct = (gal: number): number => Math.max(0, Math.min(100, Math.ceil((gal / w.fuelAllotmentGal) * 100)));
  return {
    reason,
    missionType: w.setup.mission.type,
    shots: w.shots.slice(),
    bands: summarizeShots(w.shots, data.hitRateModel.kpi_by_range),
    kpi: null,
    hits: counts.hits - counts.duds,
    duds: counts.duds,
    misses: counts.misses,
    capacity: w.torpedoes.capacity,
    destroyerSunk: w.enemy.shipDown,
    shipsSunk: w.destroyers ? w.destroyers.sunkCount : 0,
    shipsTotal: w.destroyers ? w.destroyers.destroyerCount : 0,
    transportEnabled: w.destroyers !== null && w.destroyers.hasTransport,
    transportSunk: w.destroyers !== null && w.destroyers.transportSunk,
    // 僚艇の任務（v0.4.4）の達成は「帰投して僚艇が生きている」、米PT の任務（v0.6.3）は帰投。ほかは敵の側（駆逐艦の撃沈／大発のノルマ）
    objectiveDone: w.escort ? endCountsAsReturn(reason) && !w.escort.state.sunk : w.pts ? endCountsAsReturn(reason) : w.enemy.objectiveDone,
    hunt: w.hunt ? bargeResult(w) : null,
    escort: w.escort ? escortResult(w) : null,
    pt: ptResult(w), // 米PT（v0.6.3）の記録。無い任務は null
    detections: w.detect.count,
    returned: endCountsAsReturn(reason), // 敵艦隊なし（cleared。v0.6.2 実機 1 回目）も帰投と同じに数える
    elapsedS,
    seed: w.seed,
    hpLeft: w.damage.hp,
    hpMax: w.damageParams.maxHp,
    fuelLeftPct: pct(w.fuel.gal),
    fuelAtFirstLaunchPct: Number.isNaN(w.fuelAtFirstLaunchGal) ? NaN : pct(w.fuelAtFirstLaunchGal),
    ringDistM: endCountsAsReturn(reason) ? 0 : ringEdgeM,
    friendlyEnabled: w.friendly !== null,
    friendlyPhase: w.friendly ? w.friendly.state.phase : FF_IDLE,
    friendlyOutcome: w.friendly ? w.friendly.state.outcome : FF_OUT_NONE,
    friendlyPasses: w.friendly ? w.friendly.state.passes : 0,
    friendlyReactS: w.friendly ? w.friendly.state.reactS : NaN,
    friendlyPeriodS: w.friendly ? w.friendly.state.reactPeriodS : NaN,
    crewAlive: crewAlive(w.setup.crew, w.damageParams.maxHp, w.damage.hp),
    crewTotal: w.setup.crew.total,
    crewTurnFactor: crewTurnFactor(w.setup.crewEffects, w.crewLostNow),
    crewAccelFactor: crewAccelFactor(w.setup.crewEffects, w.crewLostNow),
    extinguishHoldS: w.damageParams.extinguishHoldS * w.extinguishHoldScale,
    ...stormResultFields(w),
    ...seaplaneResultFields(w),
    sortie: w.sortie,
    raidLine: raidResultLine(w.sortie, w.setup.raid, startFireS),
    dawn: dawnResult(w),
  };
}
