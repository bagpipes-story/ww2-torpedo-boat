// Mission の HUD 向けテレメトリと Result の組み立て（v0.4.0 で mission-scene から切り出し。切り出した中身は v0.3.5 のまま、v0.4.0 で Result に出撃と「出撃前」の行を足した）。
// テレメトリは 1 個だけ作って Registry に置き、毎フレーム中身だけ書き換える（§7: 確保しない）。Result は終了時に 1 回だけ作る。
import type { GameData } from '../config/game-data';
import { RUDDER_BAR_FULL_DEG } from '../config/ui-config';
import { turnCommand, type BoatTelemetry } from '../core/boat-motion';
import { crewAccelFactor, crewAlive, crewTurnFactor } from '../core/crew';
import { FF_CHALLENGE, FF_IDLE, FF_OUT_NONE } from '../core/friendly';
import { countHits, summarizeShots } from '../core/hit-rate';
import { GUN_FIRING } from '../core/gun-battery';
import type { InputState } from '../core/input-state';
import { endCountsAsReturn, type MissionEndReason } from '../core/mission-flow';
import type { AircraftPose } from '../core/friendly';
import { raidResultLine } from '../core/sortie';
import type { MissionResult } from '../scenes/result-scene';
import { bargeResult, engineResult, escortResult, gunboatResult, seaplaneResultFields, stormResultFields } from './mission-result-extras';
import { armsResultPart, refreshArmsTelemetry } from './arms-telemetry';
import { convoyResult, refreshConvoyTelemetry } from './convoy-telemetry';
import { dawnResult, refreshDawnTelemetry } from './dawn-telemetry';
import { detectionsOf, objectiveDoneOf } from './mission-objective';
import { patrolResult, refreshPatrolTelemetry } from './patrol-telemetry';
import { ptResult, refreshPtTelemetry } from './pt-telemetry';
import { refreshSeaplaneTelemetry } from './seaplane-telemetry';
import type { MissionWorld } from './mission-world';

/** 出発時のテレメトリ（v0.6.8 S0 で systems/telemetry-create へ移した。呼び出し側の import はここのまま） */
export { createTelemetry } from './telemetry-create';

const scratchPose: AircraftPose = { dx: 0, dy: 0, headingDeg: 0, alpha: 0 };

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
  t.playerDetected = w.pts?.targets ? w.pts.targets.playerSeen() : w.enemy.detected; // 輸送隊の任務（v0.6.4 レビュー ux-2）は大発だけが見つかっている間は偽
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
  refreshSeaplaneTelemetry(t, w, scratchPose); // 敵の水上機（v0.4.1。systems/seaplane-telemetry。v0.6.4 で切り出し）
  refreshPatrolTelemetry(t, w, scratchPose); // 夜の哨戒機（v0.6.7）: 機が画面にいるときだけ「敵機」の矢印を書く（水上機の後・夜明けの前。NaN は書かない）
  // 夜明け（v0.6.1）: ラッチ・夜明け後の秒・空襲の段。空襲の機が来ていれば「敵機」の矢印をその機で上書き（水上機の後）
  refreshDawnTelemetry(t, w, scratchPose);
  refreshArmsTelemetry(t, w); // 兵装（v0.6.8）: 積んでいる魚雷・撃てるか・出来事の文（夜明けの後）
  refreshPtTelemetry(t.pt, w); // 米PT（v0.6.3）: 隊の段階・航過・脅威の PT（矢印・敵影は上の enemy.focus がその PT）
  refreshConvoyTelemetry(t.convoy, w); // 味方の大発の輸送隊（v0.6.4）: 上陸・沈没・浜まで・最寄りの大発
  w.engine?.writeTelemetry(t.engine); // 機関の不調（v0.6.5）: 熱・段・不調の残りの秒・出来事
  w.gunboat?.writeTelemetry(t.gunboat, s); // 隼艇（v0.6.6）: 自艇からの位置と距離（平方根 1 回）・HP・沈没・決着・浜
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

/** 終了時に 1 回だけ Result の材料を作る（走っている魚雷は呼び出し側が先に外れとして確定しておく）。startFireS は出撃時の火災が消えた実秒（燃えたまま終われば -1、火災なしで出撃なら NaN。Result の「出撃前」の行） */
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
    objectiveDone: objectiveDoneOf(reason, w), // 任務ごとの達成（systems/mission-objective。v0.6.7 S0 で移した）
    hunt: w.hunt ? bargeResult(w) : null,
    escort: w.escort ? escortResult(w) : null,
    pt: ptResult(w), // 米PT（v0.6.3）の記録。無い任務は null
    convoy: convoyResult(w), // 味方の大発の輸送隊（v0.6.4）の記録。無い任務は null
    engine: engineResult(w), // 機関の不調（v0.6.5）の記録。無い任務は null
    gunboat: gunboatResult(w), // 隼艇の僚艇（v0.6.6。jp_01 のハード）の記録。無い任務は null
    detections: detectionsOf(w),
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
    ...(w.arms?.seaplaneDowned ? { seaplaneDowned: true } : {}), // 水上機を撃墜した（v0.6.8）。落とさなかった夜は鍵ごと無い
    sortie: w.sortie,
    raidLine: raidResultLine(w.sortie, w.setup.raid, startFireS),
    dawn: dawnResult(w),
    patrol: patrolResult(w), // 夜の哨戒機（v0.6.7。jp_02）の記録。無い任務は null
    ...armsResultPart(w), // 兵装の新しい道（v0.6.8）: 使った夜だけ arms の鍵（本文の後ろに 1 行）
  };
}
