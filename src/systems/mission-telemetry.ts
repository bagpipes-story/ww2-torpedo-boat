// Mission の HUD 向けテレメトリと Result の組み立て（v0.4.0 で mission-scene から切り出し。切り出した中身は v0.3.5 のまま、v0.4.0 で Result に出撃と「出撃前」の行を足した）。
// テレメトリは 1 個だけ作って Registry に置き、毎フレーム中身だけ書き換える（§7: 確保しない）。Result は終了時に 1 回だけ作る。
import type { GameData } from '../config/game-data';
import { RUDDER_BAR_FULL_DEG } from '../config/ui-config';
import { turnCommand, type BoatTelemetry } from '../core/boat-motion';
import { crewAccelFactor, crewAlive, crewTurnFactor } from '../core/crew';
import { FF_CHALLENGE, FF_IDLE, FF_OUT_NONE } from '../core/friendly';
import { countHits, summarizeShots } from '../core/hit-rate';
import type { InputState } from '../core/input-state';
import type { MissionEndReason } from '../core/mission-flow';
import { raidResultLine } from '../core/sortie';
import { STORM_NONE, meanInsideKt } from '../core/storm';
import { mpsToKt } from '../core/units';
import type { MissionResult } from '../scenes/result-scene';
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
    enemyDx: w.destroyer.state.x - w.boat.state.x,
    enemyDy: w.destroyer.state.y - w.boat.state.y,
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
    shallowSafeKt: Math.round(mpsToKt(w.grounding.safeSpeedMps)),
    friendlyPhase: FF_IDLE,
    friendlyLeftS: NaN,
    friendlyPasses: 0,
    friendlyOutcome: FF_OUT_NONE,
    friendlyPending: false,
    stormState: w.storm ? w.storm.status.state : STORM_NONE,
    stormGapM: w.storm ? w.storm.status.gapM : 0,
    stormNorth: w.storm ? w.storm.status.north : true,
    stormFast: w.storm ? w.storm.status.fast : false,
    stormLos: false,
    stormSafeKt: w.setup.storm ? w.setup.storm.safeSpeedKt : 0,
    crewAlive: w.setup.crew.total,
    crewTotal: w.setup.crew.total,
    crewTurnFactor: 1,
    extinguishHoldS: w.smokeParams ? w.smokeParams.extinguishHoldS : 0,
  };
}

/**
 * 敵の相対位置、見える・見つかった、反撃、被害、煙幕、燃料、帰投、ズームを telemetry へ（毎フレーム）。
 * 敵スプライトは視程内だけ表示する（docs/02 §6.5。ここで setSighted する）。帰投の距離と燃料の目盛りは Scene の refreshReturnState が書く
 */
export function refreshTelemetry(t: BoatTelemetry, w: MissionWorld, input: InputState, zoom: number, timeLeftS: number, callFlags: number): void {
  const s = w.boat.state;
  const d = w.destroyer;
  t.speedMps = s.speedMps;
  // 漂流中は舵が効かないので舵バーも 0
  t.rudder = w.fuel.empty ? 0 : turnCommand(input, s, RUDDER_BAR_FULL_DEG);
  t.headingDeg = s.headingDeg;
  t.targetStep = w.band;
  // 沈み始めた後と帰投地点の輪の中では撃てないので残弾 0 を見せる（魚雷ボタンが暗くなる）
  t.torpedoesLeft = d.sinking || w.atHome ? 0 : w.torpedoes.remaining;
  t.hits = w.hits;
  t.timeLeftS = timeLeftS;
  if (d.sinking) {
    t.enemyDx = NaN;
    t.enemyDy = NaN;
    t.enemySighted = false;
  } else {
    t.enemyDx = d.state.x - s.x;
    t.enemyDy = d.state.y - s.y;
    t.enemySighted = t.enemyDx * t.enemyDx + t.enemyDy * t.enemyDy <= w.visRange2;
    d.setSighted(t.enemySighted);
  }
  t.playerDetected = d.ai.playerDetected && !d.sinking;
  t.detectRangeM = w.detectRangeM;
  t.illuminated = w.enemyFire.illuminated && !d.sinking;
  t.starLit = w.enemyFire.state.star.illuminating && !d.sinking;
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
  t.destroyerSunk = d.sinking;
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
  t.extinguishHoldS = w.smokeParams ? w.smokeParams.extinguishHoldS * w.extinguishHoldScale : 0;
}

/** 終了時に 1 回だけ Result の材料を作る（走っている魚雷は呼び出し側が先に外れとして確定しておく） */
/** 終了時に 1 回だけ。startFireS は出撃時の火災が消えた実秒（燃えたまま終われば -1、火災なしで出撃なら NaN。Result の「出撃前」の行） */
export function buildMissionResult(reason: MissionEndReason, w: MissionWorld, data: GameData, elapsedS: number, ringEdgeM: number, startFireS: number): MissionResult {
  const counts = countHits(w.shots);
  const pct = (gal: number): number => Math.max(0, Math.min(100, Math.ceil((gal / w.fuelAllotmentGal) * 100)));
  return {
    reason,
    missionType: w.missionType,
    shots: w.shots.slice(),
    bands: summarizeShots(w.shots, data.hitRateModel.kpi_by_range),
    hits: counts.hits - counts.duds,
    duds: counts.duds,
    misses: counts.misses,
    capacity: w.torpedoes.capacity,
    destroyerSunk: w.destroyer.sinking,
    returned: reason === 'returned',
    elapsedS,
    seed: w.seed,
    hpLeft: w.damage.hp,
    hpMax: w.damageParams.maxHp,
    fuelLeftPct: pct(w.fuel.gal),
    fuelAtFirstLaunchPct: Number.isNaN(w.fuelAtFirstLaunchGal) ? NaN : pct(w.fuelAtFirstLaunchGal),
    ringDistM: reason === 'returned' ? 0 : ringEdgeM,
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
    extinguishHoldS: w.smokeParams ? w.smokeParams.extinguishHoldS * w.extinguishHoldScale : 0,
    stormEnabled: w.storm !== null,
    stormSafeKt: w.setup.storm ? w.setup.storm.safeSpeedKt : 0,
    stormInsideS: w.storm ? w.storm.state.insideS : 0,
    stormOverS: w.storm ? w.storm.state.overS : 0,
    stormMeanKt: w.storm ? meanInsideKt(w.storm.state) : NaN,
    stormSlams: w.storm ? w.storm.state.slams : 0,
    stormSlamDamage: w.storm ? w.storm.state.slamDamage : 0,
    sortie: w.sortie,
    raidLine: raidResultLine(w.sortie, w.setup.raid, startFireS),
  };
}
