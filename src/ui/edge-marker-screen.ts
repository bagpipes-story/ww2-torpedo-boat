// 画面の端の矢印（ui/edge-marker）の「目標が画面の内なら隠す」の判定（v0.6.6 レビュー ux:ux-1 で edge-marker から出した。Phaser 非依存・確保なし）。
// 今の矢印は上を topMargin（HUD と左上のバーの分）・左右と下を TARGET_MARKER_MARGIN の内だけ「画面の内」とみる。隼艇の矢印の topMargin は輸送隊の矢印と同じ 293 px で、
// 画面の上 4 割に見えている隼艇まで「画面の外」になり、矢印が画面の中ほど（自艇の下）に出た。hideMargin を渡す矢印（隼艇の 0）はその余白を全辺に使う（クランプの縁は変えない）。

/**
 * 目標の論理画面の点（画面の中心 cx, cy からの sx, sy px）が画面の内か。hideMargin を省くと今の縁（上 topMargin・左右と下 sideMargin）、渡すと全辺その余白（0 なら本当の画面の矩形）
 */
export function markerOnScreen(sx: number, sy: number, cx: number, cy: number, topMargin: number, sideMargin: number, hideMargin?: number): boolean {
  const side = hideMargin ?? sideMargin;
  return Math.abs(sx) < cx - side && sy < cy - side && -sy < cy - (hideMargin ?? topMargin);
}
