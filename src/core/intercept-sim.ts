// 迎撃の模擬（v0.8.0 S3。us_04「ブラケット海峡の夜」。spec-v0800 §4.11・§4.4〜§4.7、lead の L17〜L19）の 1 夜。世界（systems/mission-world の stepFn と
// MissionScene の 1 フレーム）と同じ順・同じ core: フレームの頭（終わりの窓なら撃たない → 台本 → 発射の要求 → 発射管制）→ 固定ステップ（時計 → 夜明けのラッチと退く →
// 乗員 → 自艇・座礁・燃料・輪 → 速力帯 → 発見距離 → 艦 → 列の通過 → 一斉発射の破棄・外れの確定 → 魚雷 → 体当たり → 探照灯・星弾・砲 → レーダー → 火災 → 夜明けに外）→
// 命中スローの残り → 待ちの秒 → 終わり（core/mission-flow の decideMissionEnd・stepEndSettle）。艦・列・レーダー・魚雷・発射管制は core/intercept-sim-world・-torpedoes の写し。
// 命中スロー（魚雷の命中・自艇の沈み始めで 1.2 秒 × 0.3）は世界と同じに入れる。省いたもの（spec §4.11・L18）: 水上機・味方機の誤射・夜明けの空襲（別の模擬がある。
// 夜明けの後は afterDawnS で打ち切り＝'cut'）・煙幕・消火・艇の機銃（台本は使わない）・暴風（us_04 に無い）。乱数: 発射管制 seed、砲 seed+1、見張り seed+17（世界と同じ系列）、
// 今夜の揺らぎは setup（buildWorldSetup の seed+16）に入ったまま、人の揺らぎは台本の模擬だけの系列。確保は 1 夜の始めだけ。
import { clampToBounds, nextSpeedBand, setPerformance, stepBoat, type BoatInput, type BoatParams, type BoatState, type SeaBounds, type SpeedStep } from './boat-motion';
import { crewAccelFactor, crewLost, crewTurnFactor, type CrewEffects, type CrewParams } from './crew';
import { dawnReached } from './dawn-air';
import { shotKpiTarget } from './dawn-withdraw';
import { createFuelState, stepFuel, type FuelCurve } from './fuel';
import { applyShellHit, createDamageState, createGunneryState, stepDamage, updateGuns, updateIllumination, type DamageParams, type GunneryParams, type GunneryState, type HitOutcome, type ShellEvents } from './gunnery';
import { RAM_COLUMN, RAM_COVER, RAM_NONE, createInterceptTrial, type InterceptTrial } from './intercept-sim-cell';
import { createInterceptDriver, stepInterceptDriver, type InterceptOut, type InterceptPlan, type InterceptPolicy, type InterceptView } from './intercept-sim-policy';
import { SimLauncher, SimTorpedoPool } from './intercept-sim-torpedoes';
import { SimShip, SimTransit, stepSimRadar, type SimShipSpec } from './intercept-sim-world';
import { createEndSettle, decideMissionEnd, insideRing, promoteAdriftToCleared, stepEndSettle, type EndCheck, type MissionEndReason, type ReturnPoint } from './mission-flow';
import { litByOwnLight } from './own-light';
import { createRadarState, createRadarTargets, type RadarGeometry, type RadarState } from './radar';
import type { RadarParams } from './radar-data';
import { SeededRng } from './rng';
import { shallowIndexAt, type GroundingParams, type ShallowRect } from './shallows';
import { LOOKOUT_SEED_OFFSET, startRetire, type ShipAiParams } from './ship-ai';
import type { TransitPlan } from './ship-transit';
import type { TorpedoParams, TorpedoReliability, TorpedoState } from './torpedo';
import { remainingTorpedoesSettled, type TorpedoEvents } from './torpedo-targets';
import { interceptHeadingDeg, velocityFromHeading } from './torpedo-solver';
import { enemyDetectRangeM, speedFactorForBand, type VisibilityParams } from './visibility';

type Start = { readonly x: number; readonly y: number; readonly headingDeg: number };

/** 1 夜の値（systems/intercept-sim-setup が buildWorldSetup の今夜の値から組む） */
export interface InterceptSimSetup {
  readonly hard: boolean; readonly bounds: SeaBounds; readonly boundsMarginM: number; readonly start: Start;
  readonly boat: BoatParams; readonly damage: DamageParams; readonly crew: CrewParams; readonly crewEffects: CrewEffects;
  readonly fuelCurve: FuelCurve; readonly fuelStartGal: number; readonly fuelAllotmentGal: number;
  readonly vis: VisibilityParams; readonly baseDetectM: number; readonly visRange2: number; readonly halfLengthM: number; readonly halfBeamM: number;
  readonly shallows: readonly ShallowRect[]; readonly grounding: GroundingParams; readonly ring: ReturnPoint; readonly fleetGoneClears: boolean;
  readonly durationS: number; readonly timeScale: number; readonly stepS: number; readonly slowMoFactor: number; readonly slowMoSeconds: number; readonly retireHeadingDeg: number;
  readonly torpedo: TorpedoParams; readonly reliability: TorpedoReliability; readonly jitterDeg: number; readonly launchOffsetM: number; readonly salvoIntervalS: number; readonly torpedoCount: number;
  /** 正しく狙った 1 本の見越しのずれの上限（kpi_measurement.aimed_lead_error_deg_max）と B6 の距離（m） */
  readonly aimedErrMaxDeg: number; readonly aimedMinM: number; readonly aimedMaxM: number;
  readonly ship: SimShipSpec; readonly coverAi: ShipAiParams; readonly gunnery: GunneryParams; readonly passRadius2: number; readonly coverStarts: readonly Start[]; readonly objectiveSinks: number;
  readonly transit: TransitPlan & { readonly speedMps: number; readonly shipAi: ShipAiParams };
  readonly radar: RadarParams | null; readonly radarGeo: RadarGeometry;
  /** 世界の見た目の定数（config/ui-config。tests が一致を確かめる）: 砲弾の枠・沈没の演出の秒・漂流で終えるまでの秒。夜明けの後の打ち切りの秒 */
  readonly shellPoolSize: number; readonly sinkS: number; readonly adriftDelayS: number; readonly afterDawnS: number;
  readonly plan: InterceptPlan;
}

/** 試し（tests の突き合わせ・PERF）が毎ステップの終わりに読む世界（読むだけ） */
export interface InterceptWorldView { readonly t: number; readonly boat: BoatState; readonly ships: readonly SimShip[]; readonly transit: SimTransit; readonly radar: RadarState | null; readonly sinking: boolean; readonly torpedoes: readonly TorpedoState[] }

const DRIFT: BoatInput = { headingDeg: NaN, speed01: 0 };

/** 一番近い浮いている艦の添字（無ければ −1。systems/destroyer-group の nearestAfloatIndex と同じ） */
function nearestAfloat(ships: readonly { readonly state: BoatState; readonly out: boolean }[], x: number, y: number): number {
  let best = -1;
  let bestD2 = Infinity;
  for (let i = 0; i < ships.length; i++) {
    const s = ships[i]!;
    if (s.out) continue;
    const d2 = (s.state.x - x) ** 2 + (s.state.y - y) ** 2;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = i;
    }
  }
  return best;
}

/**
 * 台本の目（mission-scene の見越し点マーカーと同じ規則）: 一番近い浮いている艦が視程の 2 乗の内なら、その位置とマーカーの方位（torpedoSpeedMps は game の m/s）。
 * 見えなければ NaN。世界のヘッドレスの台本（scripts/headless/strait-probe）も同じ関数で目を作る。vel は使い回しの書き先
 */
export function fillInterceptEye(v: InterceptView, boat: BoatState, ships: readonly { readonly state: BoatState; readonly out: boolean }[], visRange2: number, torpedoSpeedMps: number, vel: { x: number; y: number }): void {
  const i = nearestAfloat(ships, boat.x, boat.y);
  const f = i >= 0 ? ships[i]!.state : null;
  if (!f || (f.x - boat.x) ** 2 + (f.y - boat.y) ** 2 > visRange2) {
    v.eyeX = v.eyeY = v.markerDeg = NaN;
    return;
  }
  v.eyeX = f.x;
  v.eyeY = f.y;
  velocityFromHeading(f.headingDeg, f.speedMps, vel);
  v.markerDeg = interceptHeadingDeg(boat.x, boat.y, torpedoSpeedMps, f.x, f.y, vel.x, vel.y) ?? NaN;
}

/** 1 夜。艇は出発点で止まっていて、台本どおり動く。probe は毎ステップの終わりの世界（試しだけ） */
export function runInterceptTrial(s: InterceptSimSetup, policy: InterceptPolicy, seed: number, probe?: (w: InterceptWorldView) => void): InterceptTrial {
  const bp: BoatParams = { ...s.boat };
  const boat: BoatState = { x: s.start.x, y: s.start.y, headingDeg: s.start.headingDeg, speedMps: 0 };
  const dmg = createDamageState(s.damage);
  const fuel = createFuelState(s.fuelStartGal);
  const lookout = new SeededRng((seed + LOOKOUT_SEED_OFFSET) >>> 0);
  const gunRng = new SeededRng((seed + 1) >>> 0);
  const ships: SimShip[] = [];
  const fires: GunneryState[] = [];
  for (const st of s.coverStarts) ships.push(new SimShip(st, s.ship, s.coverAi));
  const leg = s.transit.inbound;
  for (let i = 0; i < s.transit.ships; i++) ships.push(new SimShip({ x: leg.appearX, y: leg.laneY, headingDeg: leg.headingDeg }, s.ship, s.transit.shipAi));
  for (const d of ships) fires.push(createGunneryState(s.gunnery, s.shellPoolSize, d.state.headingDeg));
  const coverN = s.coverStarts.length;
  const transit = new SimTransit(ships, coverN, s.transit);
  const radar = s.radar ? createRadarState() : null;
  const tg = createRadarTargets(ships.length);
  const pool = new SimTorpedoPool(s.torpedo, s.torpedoCount, s.bounds);
  const launcher = new SimLauncher(pool, new SeededRng(seed >>> 0), s.reliability, s.jitterDeg, s.launchOffsetM, s.salvoIntervalS, s.torpedo.speedMps);
  const tr = createInterceptTrial(policy, seed, s.hard);
  const driver = createInterceptDriver(policy, seed, s.plan);
  const view: InterceptView = { t: 0, boat, torpedoes: pool.remaining, atHome: false, radar, eyeX: NaN, eyeY: NaN, markerDeg: NaN };
  const out: InterceptOut = { headingDeg: NaN, speed01: 0, fireN: 0, fireSpreadDeg: 0 };
  const input: BoatInput = { headingDeg: NaN, speed01: 0 };
  const vel = { x: 0, y: 0 };
  const hit: HitOutcome = { destroyed: false, startedFire: false, engineHit: false };
  const check: EndCheck = { boatSinking: false, atHome: false, torpedoesRunning: false, waitS: 0, timeLeftS: 0, destroyerSinkPlaying: false, fuelEmpty: false, stopped: true, grounded: false, fleetGone: false };
  const endP = { torpedoSettleMaxS: s.ring.torpedoSettleMaxS, adriftDelayS: s.adriftDelayS, endSettleS: s.ring.torpedoEndSettleS };
  const settle = createEndSettle();
  const wv = { t: 0, boat, ships, transit, radar, sinking: false, torpedoes: pool.states };
  let t = 0;
  let slowLeft = 0;
  let sinking = false;
  let sinkAt = NaN;
  let sunkReason: MissionEndReason | null = null;
  let fireReason: MissionEndReason = 'destroyed';
  let grounded = false;
  let atHome = false;
  let dawn = false;
  let band: SpeedStep = 'stop';
  let waitS = 0;
  const sinkBoat = (reason: MissionEndReason): void => {
    if (sinking) return;
    sinking = true;
    sinkAt = t;
    tr.ownSunk = reason;
    dmg.hp = 0;
    dmg.fireLeftS = 0;
    boat.speedMps = 0;
    slowLeft = s.slowMoSeconds;
  };
  const shellEv: ShellEvents = {
    onFire: () => {},
    // 命中（systems/boat-damage の applyHit と mission-world の hitBoat）: 火災・機関の抽選は砲の系列 seed+1、機関は最大速力を下げる
    onImpact: (gi, _x, _y, h) => {
      if (!h || sinking) return;
      tr.shellHits++;
      applyShellHit(dmg, s.gunnery.guns[gi]!, s.damage, gunRng, hit);
      if (hit.engineHit) {
        bp.speedMaxMps = s.boat.speedMaxMps * s.damage.engineSpeedFactor;
        if (bp.speedCruiseMps > bp.speedMaxMps) bp.speedCruiseMps = bp.speedMaxMps;
      }
      if (hit.startedFire) fireReason = 'destroyed';
      if (hit.destroyed) sinkBoat('destroyed');
    },
  };
  // 魚雷の決着（systems/torpedo-hits と同じ）: 不発でない命中で命中スロー・1 本で沈み始め・すべて出たら残りの一斉発射を捨てる。記録は正しく狙った 1 本（B6 の距離の内）だけ数える
  const note = (ts: TorpedoState, h: boolean): void => {
    const kpi = shotKpiTarget(ts.kpiTarget, dawn, s.retireHeadingDeg);
    if (!kpi || ts.erratic || !(Math.abs(ts.leadErrDeg) <= s.aimedErrMaxDeg) || !(ts.rangeAtLaunchM >= s.aimedMinM && ts.rangeAtLaunchM <= s.aimedMaxM)) return;
    tr.aimed++;
    if (h && !ts.dud) tr.aimedHits++;
  };
  const ev: TorpedoEvents = {
    onHit: (target, _x, _y, ts) => {
      note(ts, true);
      if (ts.dud) return;
      tr.hits++;
      slowLeft = s.slowMoSeconds;
      const d = ships[target]!;
      if (!d.takeHit()) return;
      d.startSinking(t);
      if (target < coverN) tr.sunkCover++;
      else tr.sunkColumn++;
      if (transit.allOut) launcher.clearQueue();
    },
    onLateHit: (_target, _x, _y, ts) => {
      note(ts, true);
      if (!ts.dud) tr.hits++;
    },
    onMiss: (ts) => note(ts, false),
  };
  for (;;) {
    // --- フレームの頭（MissionScene.update: 終わりの窓なら撃たない → updateFrame の入力の消費＝発射の要求と発射管制） ---
    view.t = t;
    view.torpedoes = pool.remaining;
    view.atHome = atHome;
    fillInterceptEye(view, boat, ships, s.visRange2, s.torpedo.speedMps, vel);
    if (Number.isNaN(tr.firstSightS) && Number.isFinite(view.eyeX)) tr.firstSightS = t;
    stepInterceptDriver(driver, view, out);
    input.headingDeg = out.headingDeg;
    input.speed01 = out.speed01;
    const hold = settle.reason !== null;
    if (hold) launcher.clearQueue();
    if (!sinking) {
      if (atHome) {
        if (transit.allOut) launcher.clearQueue();
      } else if (!hold && out.fireN > 0) launcher.queueFan(boat, out.fireN, out.fireSpreadDeg);
      const live = !transit.allOut;
      const ti = live ? nearestAfloat(ships, boat.x, boat.y) : -1;
      const ts = launcher.update(s.stepS, boat, live ? ships[ti < 0 ? 0 : ti]!.state : null, ti >= 0 && !dawn);
      if (ts && !live) ts.resolved = true;
      else if (ts) tr.fired++;
    }
    // --- 固定ステップ（mission-world の stepFn） ---
    const feelDt = s.stepS * (slowLeft > 0 ? s.slowMoFactor : 1);
    const dt = feelDt * s.timeScale;
    t += s.stepS;
    for (const d of ships) if (d.sinking && !d.sunk && t - d.sinkStartS >= s.sinkS) d.sunk = true;
    if (!dawn && !sinking && !grounded && dawnReached(s.durationS, t)) {
      dawn = true;
      tr.dawnOut = !atHome;
      for (const d of ships) if (!d.out) startRetire(d.ai, s.retireHeadingDeg);
    }
    const lost = crewLost(s.crew, s.damage.maxHp, dmg.hp);
    setPerformance(bp, s.boat.turnRateDegS, s.boat.accelMps2, crewTurnFactor(s.crewEffects, lost), crewAccelFactor(s.crewEffects, lost));
    if (!sinking) {
      if (grounded) boat.speedMps = 0;
      else {
        stepBoat(boat, fuel.empty ? DRIFT : input, bp, dt);
        clampToBounds(boat, s.bounds, s.boundsMarginM);
        if (boat.speedMps > s.grounding.safeSpeedMps && shallowIndexAt(s.shallows, boat.x, boat.y) >= 0) {
          grounded = true;
          boat.speedMps = 0;
        }
      }
      stepFuel(fuel, s.fuelCurve, boat.speedMps, dt);
      atHome = insideRing(s.ring, boat.x, boat.y);
    }
    band = nextSpeedBand(band, boat.speedMps, bp);
    const detectM = enemyDetectRangeM(s.baseDetectM, speedFactorForBand(band, s.vis.speedFactor), s.vis, false);
    // 敵の側（systems/destroyer-step）: 艦 → 列の通過 → 一斉発射の破棄 → 外れの確定 → 魚雷 → 体当たり → 探照灯・星弾・砲（僚艇なし・照明弾なし）→ レーダー（world-enemy-step の最後）
    let left = false;
    for (const d of ships) if (d.step(dt, feelDt, boat, detectM, s.vis.detectHoldS, pool.states, s.bounds, lookout)) left = true;
    if (transit.step(t, dawn, feelDt)) left = true;
    if (left && transit.allOut) launcher.clearQueue();
    if (transit.pending === 0 && remainingTorpedoesSettled(ships, t, s.ring.torpedoEndSettleS)) pool.resolveRemainingAsMisses(ev);
    for (let i = 0; i < ships.length; i++) {
      const d = ships[i]!;
      if (d.out) continue;
      if (d.ai.playerDetected && tr.firstDetector === RAM_NONE) tr.firstDetector = i < coverN ? RAM_COVER : RAM_COLUMN; // 最初に見つけた艦（同じステップなら護衛）
      if (i < coverN && Number.isNaN(tr.coverSightS) && (d.state.x - boat.x) ** 2 + (d.state.y - boat.y) ** 2 <= s.visRange2) tr.coverSightS = t;
    }
    tr.detected = tr.firstDetector !== RAM_NONE;
    pool.step(dt, feelDt, ships, s.passRadius2, ev, t, s.ring.torpedoEndSettleS);
    if (!sinking) {
      for (let i = 0; i < ships.length; i++) {
        if (!ships[i]!.touchesBoat(boat, s.halfLengthM)) continue;
        tr.rammedBy = i < coverN ? RAM_COVER : RAM_COLUMN;
        sinkBoat('rammed');
        break;
      }
    }
    for (let i = 0; i < ships.length; i++) {
      const d = ships[i]!;
      let lit = false;
      for (let k = 0; k < ships.length; k++) if (k !== i && !ships[k]!.out && litByOwnLight(fires[k]!)) lit = true;
      updateIllumination(fires[i]!, d.state, boat, d.ai.playerDetected && !d.out, s.gunnery, feelDt, false, lit);
      updateGuns(fires[i]!, d.state, boat, !d.out && !sinking, s.halfLengthM, s.halfBeamM, s.gunnery, gunRng, feelDt, dt, shellEv);
    }
    if (radar && s.radar) stepSimRadar(radar, s.radar, s.radarGeo, tg, t, boat, ships);
    if (!sinking && stepDamage(dmg, s.damage, feelDt)) sinkBoat(fireReason);
    if (dawn && !atHome && !sinking) tr.dawnOut = true;
    // --- フレームの終わり（命中スローの残り → MissionScene の待ちの秒と終わり。沈没の演出 sinkS の後に沈没の理由が入る） ---
    if (slowLeft > 0) slowLeft -= s.stepS;
    if (probe) {
      wv.t = t;
      wv.sinking = sinking;
      probe(wv);
    }
    if (atHome || grounded || (fuel.empty && band === 'stop')) waitS += s.stepS;
    else waitS = 0;
    if (sinking && sunkReason === null && t - sinkAt >= s.sinkS) sunkReason = tr.ownSunk;
    check.boatSinking = sinking;
    check.atHome = atHome;
    check.torpedoesRunning = pool.unresolvedCount > 0 || launcher.queued > 0;
    check.waitS = waitS;
    check.timeLeftS = Math.max(0, s.durationS - t);
    let playing = false;
    for (const d of ships) if (d.sinking && !d.sunk) playing = true;
    check.destroyerSinkPlaying = playing;
    check.fuelEmpty = fuel.empty;
    check.stopped = band === 'stop';
    check.grounded = grounded;
    check.fleetGone = s.fleetGoneClears && transit.allOut;
    const running = sinking ? pool.unresolvedCount > 0 : check.torpedoesRunning;
    let reason: MissionEndReason | 'cut' | null = null;
    if (!promoteAdriftToCleared(settle, t, sinking, check.fleetGone, playing)) reason = stepEndSettle(settle, t, sinking, sunkReason, decideMissionEnd(check, endP), running, endP.endSettleS);
    if (reason === null && dawn && t >= s.durationS + s.afterDawnS) reason = 'cut';
    if (reason === null) continue;
    tr.reason = reason;
    tr.endS = t;
    tr.fuelPct = (100 * fuel.gal) / s.fuelAllotmentGal;
    tr.hpLeft = dmg.hp;
    tr.firstContactS = radar ? radar.firstS : NaN;
    return tr;
  }
}
