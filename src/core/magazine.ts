// 弾倉（v0.6.8。spec-v068 §3.2・§5.1）: 凍結の core/pt-gun.ts:47-60 の弾倉の勘定の写し（pt-gun は 1 字も変えない）。
// 艦への機銃（jp_06 の T-38）と対空（jp_06・jp_02 の T-14）が自分の弾倉を持つときに使う。jp_01 は PtGun の弾倉（PtGunState は MagazineState を満たす）を借り、交換は凍結の stepPtGun が進める。
// 順は pt-gun と同じ: 交換（終われば満たす）→ 撃つ（交換中は撃たない）→ 撃った数だけ減らし、空なら交換を始める。Phaser 非依存・確保しない（createMagazine だけ）。
import type { GunBatteryParams } from './gun-battery';

/** 弾倉の残り発数と交換の残り体感秒（0 は交換していない）。core/pt-gun の PtGunState と同じ 2 つの名前 */
export interface MagazineState {
  magLeft: number;
  reloadLeftS: number;
}

/** boats.json の gun_battery.magazine（gunBatteryParamsFromData の magazine。1 弾倉の発数と交換の体感秒） */
export type MagazineParams = NonNullable<GunBatteryParams['magazine']>;

export function createMagazine(mag: MagazineParams): MagazineState {
  return { magLeft: mag.rounds, reloadLeftS: 0 };
}

/** 固定ステップの初めに 1 回（押していなくても進む）: 交換が終われば弾倉を満たす。戻り値は交換中か（core/pt-gun.ts:48-55） */
export function magazineTick(m: MagazineState, mag: MagazineParams, feelDt: number): boolean {
  if (m.reloadLeftS > 0) {
    m.reloadLeftS -= feelDt;
    if (m.reloadLeftS <= 0) {
      m.reloadLeftS = 0;
      m.magLeft = mag.rounds;
    }
  }
  return m.reloadLeftS > 0;
}

/** 撃った数だけ減らし、空なら交換をすぐ始める（core/pt-gun.ts:59-60。次のステップに撃ちすぎない） */
export function magazineSpend(m: MagazineState, mag: MagazineParams, shots: number): void {
  m.magLeft -= shots;
  if (m.magLeft <= 0 && m.reloadLeftS <= 0) m.reloadLeftS = mag.reloadS;
}

/** 撃てる（交換中でなく、残りがある） */
export function magazineReady(m: MagazineState): boolean {
  return m.reloadLeftS <= 0 && m.magLeft > 0;
}
