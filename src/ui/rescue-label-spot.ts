// コリーの名の札の置き場所（v0.8.5 S4。us_07。S2 の画面写しで、艦の真下 80 m の札が南の群の「N 名」の札に重なった）。組み立ての時に 1 回だけ（systems/rescue-view）。
// 候補（config/rescue-hud-config の CORRY_LABEL_SPOTS。艦の中心からの m の順）のうち、今夜の群（ずれ込み）の札と群の絵のどれとも重ならない最初の物。どれも重なれば、
// 群の札と絵からいちばん離れた候補（四角どうしのすき間の最小が大きい物）。札と群の大きさは字の px ≈ m の見積もり。Phaser・DOM を読まない（tests/rescue-label-spot）。
import {
  CORRY_LABEL_CLEAR_M, CORRY_LABEL_H, CORRY_LABEL_HALF_W, CORRY_LABEL_SPOTS, SURVIVOR_LABEL_H, SURVIVOR_LABEL_HALF_W,
} from '../config/rescue-hud-config';

/** 群の中心から札の上端までの m（rescue-art-config の SURVIVOR_LABEL_DY）と群の絵の半径 m を呼ぶ側から */
export interface LabelSpotGroups {
  readonly n: number;
  readonly gx: ArrayLike<number>;
  readonly gy: ArrayLike<number>;
}

/** 2 つの四角（中心 x・上端 y・半幅・高さ）のすき間 m（重なれば負） */
function gapM(ax: number, ay: number, ahw: number, ah: number, bx: number, by: number, bhw: number, bh: number): number {
  const gx = Math.abs(ax - bx) - ahw - bhw;
  const gy = Math.max(by - (ay + ah), ay - (by + bh));
  return Math.max(gx, gy);
}

/** 札の中心 x・上端 y を out に書いて返す（cx, cy は艦の中心。labelDy は群の札の中心からの下へのずれ、groupR は群の絵の半径） */
export function corryLabelSpot(cx: number, cy: number, g: LabelSpotGroups, labelDy: number, groupR: number, out: { x: number; y: number }): { x: number; y: number } {
  let best = -Infinity;
  for (const [ox, oy] of CORRY_LABEL_SPOTS) {
    const x = cx + ox;
    const y = cy + oy - CORRY_LABEL_H / 2;
    let minGap = Infinity;
    for (let i = 0; i < g.n; i++) {
      const gx = g.gx[i]!;
      const gy = g.gy[i]!;
      minGap = Math.min(minGap, gapM(x, y, CORRY_LABEL_HALF_W, CORRY_LABEL_H, gx, gy + labelDy, SURVIVOR_LABEL_HALF_W, SURVIVOR_LABEL_H), gapM(x, y, CORRY_LABEL_HALF_W, CORRY_LABEL_H, gx, gy - groupR, groupR, 2 * groupR));
    }
    if (minGap >= CORRY_LABEL_CLEAR_M) {
      out.x = x;
      out.y = y;
      return out;
    }
    if (minGap > best) {
      best = minGap;
      out.x = x;
      out.y = y;
    }
  }
  return out;
}
