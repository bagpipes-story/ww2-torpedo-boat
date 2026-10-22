// 米PT の core のテストの共通の材料（v0.6.3 実機 1 回目。tests/pt-damage・pt-gun・pt-persist）: jp_05 の値（data のまま）・PtCheck・PtEvents・数える乱数と、
// 艇と隊（と T-14 の 13mm）を固定ステップで回す小さな模擬。順は世界と同じ（spec §F の Step order）: 艇 → 輪 → 速力帯 → 発見距離 → 13mm（弾倉 → 標的 → 発射 → 着弾 → hitPt）→ 閃光 → 隊。
import { gameData, getBoatRecord, getGunBatteryParams, getPrototypeMission, getVisibilityParams } from '../src/config/game-data';
import { getPtParams } from '../src/config/pt-mission-data';
import { boatParamsFromData, clampToBounds, nextSpeedBand, stepBoat, type BoatInput, type BoatState, type SpeedStep } from '../src/core/boat-motion';
import type { GunEvents } from '../src/core/gun-battery';
import { rollNight } from '../src/core/night';
import { PT_GUN_SEED_OFFSET, PT_SEED_OFFSET, createPtSection, stepPtSection, type PtCheck, type PtEvents, type PtSection } from '../src/core/pt-boats';
import { hitPt } from '../src/core/pt-damage';
import { ptParamsAtNight, type PtParams } from '../src/core/pt-data';
import { createPtGun, stepPtGun, type PtGunState } from '../src/core/pt-gun';
import { SeededRng } from '../src/core/rng';
import { enemyDetectRangeM, playerVisRangeM } from '../src/core/visibility';

export const DT = 1 / 60;
export const TS = gameData.hitRateModel.world.time_scale;
export const MISSION = getPrototypeMission(gameData, 'jp_05');
export const P = getPtParams(gameData, MISSION, TS)!;
/** T-14 の 13mm（boats.json の jp_t14.gun_battery。弾倉あり） */
export const G = getGunBatteryParams(gameData, MISSION)!;
export const VIS = getVisibilityParams(gameData, MISSION.moon, false);
export const VIS2 = playerVisRangeM(VIS) ** 2;
export const T14 = boatParamsFromData(getBoatRecord(gameData, MISSION.playerBoatId));
export const HOME = MISSION.returnPoint;
export const CRUISE01 = 20 / 31;
export const SILENT01 = 14 / 31;
export const detectM = (band: SpeedStep): number => enemyDetectRangeM(P.baseDetectM, VIS.speedFactor[band], VIS, false);

export function check(boat: BoatState, over: Partial<PtCheck> = {}): PtCheck {
  return { boat, boatHalfLengthM: T14.lengthM / 2, boatHalfBeamM: T14.beamM / 2, detectOpenM: detectM('cruise'), smokeFactor: 1, smoke: null, smokeParams: null, targetValid: true, visRange2: VIS2, dawn: false, timeS: 10, ...over };
}

export function events(over: Partial<PtEvents> = {}): PtEvents {
  const none = (): void => {};
  return { onContact: none, onCommit: none, onFire: none, onImpact: none, onPassEnd: none, onLeave: none, onOut: none, ...over };
}

/** next() を数える乱数（乱数の消費の検査） */
export class CountingRng extends SeededRng {
  draws = 0;
  override next(): number {
    this.draws++;
    return super.next();
  }
}

export interface PtSim {
  q: PtSection;
  p: PtParams;
  c: PtCheck;
  boat: BoatState;
  input: BoatInput;
  band: SpeedStep;
  t: number;
  home: boolean;
  /** T-14 の 13mm（gun を渡したときだけ）と、その乱数（seed+20）。命中は hitPt に 1 回引いて渡す */
  gun: PtGunState | null;
  gunRng: SeededRng;
  /** 方針の覚え（自由に使う） */
  m: Record<string, number>;
}

export interface PtSimOpts {
  seed: number;
  steps: number;
  policy: (s: PtSim) => void;
  start?: { x: number; y: number; headingDeg: number };
  /** 今夜の揺らぎ（rollNight の敵の 1 件目のずれと左右反転） */
  night?: boolean;
  dawnAtS?: number;
  /** 13mm を押しているか（渡すと T-14 の 13mm を積む） */
  gunHeld?: (s: PtSim) => boolean;
  gunRng?: SeededRng;
  ev?: (s: PtSim) => Partial<PtEvents>;
  gunEv?: (s: PtSim) => Partial<GunEvents>;
  onStep?: (s: PtSim) => void;
  /** 帰投の輪に入ったら止める */
  stopAtHome?: boolean;
}

export function runPtSim(o: PtSimOpts): PtSim {
  let p = P;
  if (o.night) {
    const n = rollNight(MISSION.night!, () => 0, o.seed, 1, 0);
    p = ptParamsAtNight(P, n.enemyOffsets[0]!.dx, n.enemyOffsets[0]!.dy, n.mirrored);
  }
  const st = o.start ?? MISSION.playerStart;
  const boat: BoatState = { x: st.x, y: st.y, headingDeg: st.headingDeg, speedMps: 0 };
  const s: PtSim = {
    q: createPtSection(p, 24), p, c: check(boat, { timeS: 0 }), boat, input: { headingDeg: st.headingDeg, speed01: 0 }, band: 'stop', t: 0, home: false,
    gun: o.gunHeld ? createPtGun(G, 8) : null, gunRng: o.gunRng ?? new SeededRng((o.seed + PT_GUN_SEED_OFFSET) >>> 0), m: {},
  };
  const rng = new SeededRng((o.seed + PT_SEED_OFFSET) >>> 0);
  const ev = events(o.ev ? o.ev(s) : {});
  const extra = o.gunEv ? o.gunEv(s) : {};
  const gunEv: GunEvents = {
    onFire: (x, y) => extra.onFire?.(x, y),
    onHit: (i, g, x, y) => {
      hitPt(s.q, p, i, G.groups[g]!.damage, s.gunRng.next(), ev);
      extra.onHit?.(i, g, x, y);
    },
    onMiss: (x, y) => extra.onMiss?.(x, y),
  };
  for (let k = 0; k < o.steps; k++) {
    if (!s.home) o.policy(s);
    else s.input.speed01 = 0;
    stepBoat(boat, s.input, T14, DT * TS);
    clampToBounds(boat, p.bounds, 15);
    s.band = nextSpeedBand(s.band, boat.speedMps, T14);
    s.home = s.home || (boat.x - HOME.x) ** 2 + (boat.y - HOME.y) ** 2 <= HOME.radiusM ** 2;
    s.c.detectOpenM = detectM(s.band);
    s.c.targetValid = !s.home;
    s.c.timeS = s.t;
    s.c.dawn = o.dawnAtS !== undefined && s.t >= o.dawnAtS;
    s.c.flashM = 0;
    if (s.gun) {
      stepPtGun(s.gun, G, boat, s.band, o.gunHeld!(s), !s.home, s.q, p, VIS2, s.gunRng, DT, DT * TS, gunEv);
      s.c.flashM = s.gun.battery.fired ? G.flashRevealM : 0;
    }
    stepPtSection(s.q, p, s.c, rng, DT, DT * TS, ev);
    o.onStep?.(s);
    s.t += DT;
    if (o.stopAtHome && s.home) break;
  }
  return s;
}
