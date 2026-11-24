// 救助と機雷原の組み立て（v0.8.5 S1。us_07。spec-v0850 §4.0）: seed+47 の 1 本だけの系列で、群の位置のずれ（2 × 群の数）→ 機雷の置き方（2 × ハードの数）の順に 1 回だけ引く。
// 引く回数は難易度・今夜の置ける・置けないに依らず 2 × (群の数 ＋ maxCount)＝us_07 は 2 × (12 ＋ 32) ＝ 88 回。ステップの中では引かない。
// 置かない所（core/minefield の MineKeepOut）は今夜の群の中心（ずれ込み）・コリー・フィッチの輪・帰投の輪・出発・浅瀬（それぞれに clear_m の余白は layMines が足す）。
// 呼ぶのは世界の組み立て（v0.8.5 S2）と tests。Phaser 非依存（確保は組み立ての時だけ）。
import { createMinefield, layMines, type MineKeepOut, type MinefieldRules, type MinefieldState } from './minefield';
import { createRescueState, rollRescueGroups, RESCUE_FIELD_SEED_OFFSET, type RescueRules, type RescueState } from './rescue';
import { SeededRng } from './rng';

/** 置かない所を作る材料（任務の値。config の PrototypeMission と RescueSetup から呼ぶ側が渡す） */
export interface RescueFieldSite {
  readonly start: { readonly x: number; readonly y: number };
  readonly returnRing: { readonly x: number; readonly y: number; readonly radiusM: number };
  readonly fitch: { readonly x: number; readonly y: number; readonly ringM: number };
  readonly corry: { readonly x: number; readonly y: number };
  readonly shallows: readonly { readonly x: number; readonly y: number; readonly w: number; readonly h: number }[];
}

export interface RescueField {
  rescue: RescueState;
  mines: MinefieldState | null;
  keep: MineKeepOut;
}

/** 置かない所: 今夜の群の中心（extraGroupR は群の円に足す半径。検査で ±jitter を足すとき）・コリー・フィッチの輪・帰投の輪・出発と浅瀬 */
export function mineKeepOut(site: RescueFieldSite, rescue: RescueState, extraGroupR: number): MineKeepOut {
  const circles: { x: number; y: number; r: number }[] = [
    { x: site.start.x, y: site.start.y, r: 0 },
    { x: site.returnRing.x, y: site.returnRing.y, r: site.returnRing.radiusM },
    { x: site.fitch.x, y: site.fitch.y, r: site.fitch.ringM },
    { x: site.corry.x, y: site.corry.y, r: 0 },
  ];
  for (let i = 0; i < rescue.n; i++) circles.push({ x: rescue.gx[i]!, y: rescue.gy[i]!, r: extraGroupR });
  return { circles, rects: site.shallows.map((s) => ({ x: s.x, y: s.y, w: s.w, h: s.h })) };
}

/** 出撃の seed から今夜の救助（群のずれ）と機雷原（無ければ null）を組む。boatHalfLengthM は自艇の半長 m */
export function rollRescueField(seed: number, r: RescueRules, m: MinefieldRules | null, site: RescueFieldSite, boatHalfLengthM: number): RescueField {
  const rng = new SeededRng((seed + RESCUE_FIELD_SEED_OFFSET) >>> 0);
  const rescue = createRescueState(r, boatHalfLengthM);
  rollRescueGroups(rescue, r, rng);
  const keep = mineKeepOut(site, rescue, 0);
  let mines: MinefieldState | null = null;
  if (m) {
    mines = createMinefield(m);
    layMines(mines, m, keep, rng);
  }
  return { rescue, mines, keep };
}
