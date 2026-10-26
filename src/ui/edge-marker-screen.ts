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

/**
 * 矢印のラベルの距離 m（v0.6.7 レビュー ux:ux-2。夜の哨戒機の矢印だけが使う）: hypot を µm に丸める。半径ちょうどの機（付近の捜索の 900 m・接近の始まりの wake_detect_m（v0.6.7 実機 1 回目から 4200 m）・出撃の旋回の 600 m）で
 * hypot が 1 ulp 上に出て、100 m 刻みの切り上げのラベルが「敵機 900 m」と「1000 m」を行き来し（約 21 回/秒の setText）、2 行目の距離とも食い違った
 */
export function snappedDistM(dx: number, dy: number): number {
  return Math.round(Math.hypot(dx, dy) * 1e6) / 1e6;
}
