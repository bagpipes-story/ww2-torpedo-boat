// 画面の端の 2 本の矢印が重なるときのずらし（v0.6.6。spec-v066 §D.6・レビュー R6）: 自艇が全速で先へ走ると 13 kt の隼艇は自艇と大発の間のほぼ同じ方位に遅れ、
// ui/edge-marker は方位どおり縁に止めるだけなので「大発 N m」と「隼艇 N m」が同じ点に重なる（色はほぼ同じ青で分けられない）。2 点が sepPx より近ければ b（隼艇）を縁に沿って a から sepPx 離す:
// 左右の縁なら下へ（下の端を越えるなら上へ）、上下の縁なら画面の中央から遠ざかる向きへ（端を越えるなら逆へ）。ずらした点は表示の矩形の内。Phaser 非依存・確保なし（out に書く）。

/** 矢印を止める矩形（論理画面 px。ui/edge-marker の縁: 左 TARGET_MARKER_MARGIN・右 GAME_WIDTH − TARGET_MARKER_RIGHT_MARGIN・上 topMargin・下 GAME_HEIGHT − TARGET_MARKER_MARGIN） */
export interface MarkerRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** b に足すずれ px */
export interface MarkerShift {
  dx: number;
  dy: number;
}

/** 縁にいるとみなす px（edge-marker は縁の座標へちょうど止める） */
const EDGE_EPS_PX = 0.5;

/** a（先に出ている矢印）と b（ずらす矢印）の点から b のずれを out に書いて返す（遠ければ 0）。b が左右の縁なら y を、上下の縁なら x を動かす */
export function separateMarker(ax: number, ay: number, bx: number, by: number, r: MarkerRect, sepPx: number, out: MarkerShift): MarkerShift {
  out.dx = 0;
  out.dy = 0;
  if ((bx - ax) * (bx - ax) + (by - ay) * (by - ay) >= sepPx * sepPx) return out;
  if (Math.abs(bx - r.left) < EDGE_EPS_PX || Math.abs(bx - r.right) < EDGE_EPS_PX) {
    const y = ay + sepPx <= r.bottom ? ay + sepPx : ay - sepPx;
    out.dy = Math.min(r.bottom, Math.max(r.top, y)) - by;
    return out;
  }
  const away = bx >= (r.left + r.right) / 2 ? 1 : -1;
  let x = ax + away * sepPx;
  if (x < r.left || x > r.right) x = ax - away * sepPx;
  out.dx = Math.min(r.right, Math.max(r.left, x)) - bx;
  return out;
}

/**
 * 縁に止まった矢印の点 (x, y) が角の HUD の矩形（keepLeft より右・keepTop より下。矢印とラベルの余白込み）に入っていれば、縁に沿って外へ出すずれを out に書いて返す（v0.6.7 レビュー ux:ux-5。
 * 夜の哨戒機の矢印と右下の速力の HUD）: 下の縁なら左へ、右の縁なら上へ。矩形の外・縁でない点は 0（次の refresh が方位どおりに戻す）
 */
export function avoidCorner(x: number, y: number, r: MarkerRect, keepLeft: number, keepTop: number, out: MarkerShift): MarkerShift {
  out.dx = 0;
  out.dy = 0;
  if (!(x > keepLeft && y > keepTop)) return out;
  if (Math.abs(y - r.bottom) < EDGE_EPS_PX) out.dx = keepLeft - x;
  else if (Math.abs(x - r.right) < EDGE_EPS_PX) out.dy = keepTop - y;
  return out;
}
