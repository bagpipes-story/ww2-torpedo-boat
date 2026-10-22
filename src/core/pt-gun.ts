// T-14 の 13mm 機銃（v0.6.3 実機 1 回目。docs/02 §6.4、boats.json の jp_t14.gun_battery）: 艇の砲の本体（gun-battery の stepGunBatteryOf）を米PT に使い、弾倉を足す。
// 射撃ボタンを押している間、見えていて射程内・艇首尾の円錐の外の生きた PT の最寄りへ撃つ。magazine.rounds 発ごとに reload_s（体感秒）の弾倉交換（押していなくても進む）。
// 交換中は本体に「押していない」と渡す（間隔の負の残りを溜めない＝押し直しの一斉発射なし）。早めの交換・撃たない間の補充は無い。
// 乱数は呼ぶ側の seed+20 の系列だけ（1 発 2 回。PT への命中の 1 回は呼ぶ側が onHit で引いて core/pt-damage の hitPt へ）。Phaser 非依存・毎ステップ確保しない。
import type { BoatState, SpeedStep } from './boat-motion';
import { GUN_SAFE, createGunBattery, stepGunBatteryOf, type GunBatteryParams, type GunBatteryState, type GunEvents } from './gun-battery';
import type { PtParams } from './pt-data';
import { ptLive, ptNeverBlocked } from './pt-damage';
import type { PtSection } from './pt-state';
import type { SeededRng } from './rng';

/** 状態「弾倉交換」（HUD の 2 行目。gun-battery の GUN_* の続き）: 押していて撃てるが交換中 */
export const PT_GUN_RELOAD = 6;

export interface PtGunState {
  battery: GunBatteryState;
  /** 弾倉の残り発数、交換の残り体感秒（0 は交換していない） */
  magLeft: number;
  reloadLeftS: number;
}

/** 弾倉のある砲（gunBatteryParamsFromData の magazine）だけ。shellPoolSize は弾の数（config/pt-config の PT_GUN_SHELL_POOL_SIZE） */
export function createPtGun(g: GunBatteryParams, shellPoolSize: number): PtGunState {
  if (!g.magazine) throw new Error(`${g.label}: 米PT を撃つ艇の砲には弾倉（gun_battery.magazine）が要る（docs/02 §6.4）`);
  return { battery: createGunBattery(g, shellPoolSize), magLeft: g.magazine.rounds, reloadLeftS: 0 };
}

/**
 * 固定ステップ: 交換（終われば弾倉を満たす）→ 撃つ（交換中は押していない扱い）→ 撃った数だけ弾倉を減らし、空なら交換を始める。
 * 押していて撃てるが交換中なら状態は PT_GUN_RELOAD。canFire は艇が浮いていて帰投の輪の外（呼ぶ側）
 */
export function stepPtGun(
  s: PtGunState,
  g: GunBatteryParams,
  boat: BoatState,
  band: SpeedStep,
  held: boolean,
  canFire: boolean,
  q: PtSection,
  p: PtParams,
  visRange2: number,
  rng: SeededRng,
  feelDt: number,
  dt: number,
  ev: GunEvents,
): void {
  const mag = g.magazine!;
  if (s.reloadLeftS > 0) {
    s.reloadLeftS -= feelDt;
    if (s.reloadLeftS <= 0) {
      s.reloadLeftS = 0;
      s.magLeft = mag.rounds;
    }
  }
  const reloading = s.reloadLeftS > 0;
  const before = s.battery.shots;
  stepGunBatteryOf(s.battery, g, boat, band, held && !reloading, canFire, q.boats, ptLive, ptNeverBlocked, p.hitHalfLengthM, p.hitHalfBeamM, visRange2, rng, feelDt, dt, ev);
  if (reloading && held && canFire && s.battery.status === GUN_SAFE) s.battery.status = PT_GUN_RELOAD;
  s.magLeft -= s.battery.shots - before;
  if (s.magLeft <= 0 && s.reloadLeftS <= 0) s.reloadLeftS = mag.reloadS;
}
