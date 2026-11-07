// 空襲下の退避（v0.6.11 S3。jp_03。spec-v0611-r2 §3.4・§3.7・§11）の模擬の対空（core/evac-sim が固定ステップの段 4 で呼ぶ。世界は S4 の systems/arms-step・aa-slots が同じ式）:
// 機銃は僚艇も撃つ（U2）＝砲の発の速さと弾倉を、操作中の隊の浮いていて上げていない隻数 n（1〜3）倍にした値（起動時に n = 1・2・3 を作って選ぶ。r2 L18）。
// 機の枠（AA_MAX_TARGETS 8 のまま）: 240 秒の後の §2 の 4 機が先、次に港の空襲の動く編隊を中心の 2 乗の距離の近い順（固定長の配列に挿入で並べる）。番号は 編隊 × 4 ＋ 機（r2 M8）。
// 撃墜は core/air-down の downStrikePlane（港の空襲の機は core/evac-repass の evacDownPlane＝撃墜のビットも。順番の飛ばしは core/evac-air の段の頭と、ここで撃墜したステップ）。乱数は seed+24 を 1 発 1 回（core/aa-fire のまま）。
// Phaser 非依存・確保は createEvacSimAa だけ。
import { AA_MAX_TARGETS, AA_SRC_DAWN, AA_SRC_EVAC, addStrikePlanes, createAaState, createAaTargets, stepAaFire, type AaState, type AaTargets, type AntiAircraftParams } from './aa-fire';
import type { AirStrikeParams, AirStrikeState } from './air-strike';
import { downStrikePlane, skipDownedRuns } from './air-down';
import { evacDownPlane } from './evac-repass';
import type { BoatState, SpeedStep } from './boat-motion';
import { evacFlightLive, type EvacPlan } from './evac-plan';
import type { AircraftPose } from './friendly';
import type { GunBatteryParams } from './gun-battery';
import { createMagazine, magazineTick, type MagazineState } from './magazine';
import type { SeededRng } from './rng';

/** 港の空襲の編隊の機の出どころ（夜明け 0・夜の出撃 1・水上機 2 の次。S4 から core/aa-fire が持つ＝世界の systems/aa-slots と同じ番号） */
export { AA_SRC_EVAC };
/** 1 編隊の機の番号の幅（凍結の core の上限 4。世界の systems/aa-slots の撃墜の振り分けも） */
export const EVAC_AA_PLANE_STRIDE = 4;

/** 隊の砲（n = 1・2・3 隻ぶん）: 発の速さと弾倉の発数を n 倍（交換の秒・射程・死角・散布はそのまま） */
export function evacGunVariants(g: GunBatteryParams, maxN: number): GunBatteryParams[] {
  const out: GunBatteryParams[] = [];
  for (let n = 1; n <= maxN; n++) {
    out.push({
      ...g,
      groups: g.groups.map((x) => ({ ...x, roundsPerMin: x.roundsPerMin * n })),
      ...(g.magazine ? { magazine: { rounds: g.magazine.rounds * n, reloadS: g.magazine.reloadS } } : {}),
    });
  }
  return out;
}

export interface EvacSimAa {
  readonly guns: readonly GunBatteryParams[];
  readonly aa: AntiAircraftParams;
  readonly st: AaState;
  readonly mag: MagazineState | null;
  readonly slots: AaTargets;
  readonly rng: SeededRng;
  /** 編隊の番号を中心の 2 乗の距離の近い順に（固定長） */
  readonly order: Int32Array;
  readonly d2: Float64Array;
  readonly pose: AircraftPose;
  downs: number;
  downsEvac: number;
  rounds: number;
  /** 閃光の残りの終わり（時計の実秒） */
  flashUntilS: number;
}

export function createEvacSimAa(guns: readonly GunBatteryParams[], aa: AntiAircraftParams, flights: number, rng: SeededRng): EvacSimAa {
  const top = guns[guns.length - 1]!;
  return {
    guns, aa, st: createAaState(top), mag: top.magazine ? createMagazine(top.magazine) : null, slots: createAaTargets(), rng,
    order: new Int32Array(flights), d2: new Float64Array(flights), pose: { dx: 0, dy: 0, headingDeg: 0, alpha: 0 }, downs: 0, downsEvac: 0, rounds: 0, flashUntilS: -Infinity,
  };
}

/** 枠を埋める（押していなくても埋める＝乱数を引かないので結果は同じ。模擬の方針が「射程に機がいる」を読む）: §2 の 4 機 → 動く編隊を近い順 */
export function fillEvacAaSlots(a: EvacSimAa, plan: EvacPlan, dawn: AirStrikeState | null, dawnP: AirStrikeParams, boat: BoatState): void {
  const t = a.slots;
  t.n = 0;
  if (dawn) addStrikePlanes(t, dawn, dawnP, boat, AA_SRC_DAWN, a.pose);
  addEvacPlanes(t, plan, boat, a.order, a.d2, a.pose);
}

/**
 * 港の空襲の動く編隊の機を枠に足す（模擬の fillEvacAaSlots と世界の systems/aa-slots が同じ式。S4 で切り出した）: 編隊の中心と艇の 2 乗の距離の近い順に
 * order・d2（編隊の数の固定長）へ挿入で並べ、枠が尽きるまで機を足す。番号は 編隊 × 4 ＋ 機
 */
export function addEvacPlanes(t: AaTargets, plan: EvacPlan, boat: BoatState, order: Int32Array, d2s: Float64Array, pose: AircraftPose): void {
  let n = 0;
  for (let i = 0; i < plan.flights.length; i++) {
    const fl = plan.flights[i]!;
    if (!evacFlightLive(fl)) continue;
    const c = fl.view.boat.state;
    const dx = c.x - boat.x;
    const dy = c.y - boat.y;
    const d2 = dx * dx + dy * dy;
    let k = n++;
    while (k > 0 && d2s[k - 1]! > d2) {
      d2s[k] = d2s[k - 1]!;
      order[k] = order[k - 1]!;
      k--;
    }
    d2s[k] = d2;
    order[k] = i;
  }
  for (let k = 0; k < n && t.n < AA_MAX_TARGETS; k++) {
    const fl = plan.flights[order[k]!]!;
    const before = t.n;
    addStrikePlanes(t, fl.port.state, fl.p, fl.view.boat.state, AA_SRC_EVAC, pose);
    for (let j = before; j < t.n; j++) t.idx[j] = fl.index * EVAC_AA_PLANE_STRIDE + t.idx[j]!;
  }
}

/** 射程の内に機がいる（模擬の seq_shoot の押す条件。枠は fillEvacAaSlots の後） */
export function evacAaInRange(a: EvacSimAa, boat: BoatState): boolean {
  const t = a.slots;
  const r2 = a.aa.rangeM * a.aa.rangeM;
  for (let i = 0; i < t.n; i++) {
    const dx = t.x[i]! - boat.x;
    const dy = t.y[i]! - boat.y;
    if (t.live[i] && dx * dx + dy * dy <= r2) return true;
  }
  return false;
}

/**
 * 段 4 の対空（敵の側の頭の弾倉の交換 → 終わりの対空。乗員・帯は座席）。n は撃てる隻数（1〜3）、canFire は浮いている・帰投していない。
 * 撃墜したら順番を飛ばす。撃った（閃光）なら true
 */
export function stepEvacSimAa(a: EvacSimAa, plan: EvacPlan, dawn: AirStrikeState | null, dawnP: AirStrikeParams, boat: BoatState, band: SpeedStep, n: number, held: boolean, canFire: boolean, nowS: number, feelDt: number): boolean {
  const g = a.guns[Math.max(1, Math.min(a.guns.length, n)) - 1]!;
  const magP = g.magazine ?? null;
  if (a.mag && magP) magazineTick(a.mag, magP, feelDt);
  if (a.downs > 0 && dawn) skipDownedRuns(dawn, dawnP);
  const before = a.st.rounds;
  const k = stepAaFire(a.st, g, a.aa, a.mag, magP, held, canFire, band, boat, a.slots, a.rng, feelDt);
  a.rounds += a.st.rounds - before;
  if (k >= 0) {
    const src = a.slots.src[k]!;
    const idx = a.slots.idx[k]!;
    if (src === AA_SRC_DAWN && dawn) {
      if (downStrikePlane(dawn, idx)) {
        a.downs++;
        skipDownedRuns(dawn, dawnP);
      }
    } else if (src === AA_SRC_EVAC) {
      const fl = plan.flights[Math.floor(idx / EVAC_AA_PLANE_STRIDE)]!;
      if (evacDownPlane(fl, idx % EVAC_AA_PLANE_STRIDE)) {
        a.downs++;
        a.downsEvac++;
        skipDownedRuns(fl.port.state, fl.p);
      }
    }
  }
  if (a.st.rounds > before) a.flashUntilS = nowS + a.aa.flashHoldS;
  return a.st.rounds > before;
}
