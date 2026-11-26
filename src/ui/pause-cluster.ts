// 一時停止の塊（一時停止と、その周りの静音・倍速の衛星＝config/control-toggle-config の controlToggleRing）を画面端の印が避ける（v0.8.5 S5。救助の任務 us_07 の印だけ）。
// S4 の画面写しで、左の縁の「Sボート 2700 m」と上の縁の「生存者 N m」のラベルが一時停止と衛星の丸の上に出た（jp_04 の帰投の印の avoidPauseButton は衛星の前の一時停止だけを見る）。
// 決まり: 矢印かラベルの箱が塊の当たりの円の外接矩形（pad 込み）に掛かれば、印を右へ、塊の右端＋pad まで動かす（dx だけ。y は変えない＝上の縁では縁に沿って、左の縁では内へ）。
// 左の縁を上下にずらす形（avoidPauseButton）は、塊が y 178〜362 を占め、上は端の印の上端・下はスティックの台座で、ラベル 1 つ分の空きが無い（どちらの向きにも入らない）。
// Phaser 非依存・確保なし（塊の矩形は作る時に 1 回）。ほかの任務の印は使わない＝hud-ab の門は同じ。
import { CONTROL_TOGGLES, CONTROL_TOGGLE_HIT_R, CONTROL_TOGGLE_PAUSE_X, CONTROL_TOGGLE_PAUSE_Y, PAUSE_HIT_R, controlToggleRing } from '../config/control-toggle-config';
import { boxHitsRects, type ScreenRect } from './landing-markers';
import type { MarkerShift } from './marker-separation';

/** 塊から離す px（hud-layout の当たりの間と同じ 12） */
export const PAUSE_CLUSTER_PAD_PX = 12;

/** 変えられる矩形（作業用） */
export interface MutableRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** 塊の矩形（一時停止の当たりの円・衛星の当たりの円の外接矩形）と、その右端 */
export interface PauseCluster {
  readonly rects: readonly ScreenRect[];
  readonly right: number;
}

/** 一時停止と n 個の衛星（既定は今の並び CONTROL_TOGGLES の数）の塊。作る時に 1 回 */
export function pauseCluster(n: number = CONTROL_TOGGLES.length): PauseCluster {
  const rects: ScreenRect[] = [{ x0: CONTROL_TOGGLE_PAUSE_X - PAUSE_HIT_R, y0: CONTROL_TOGGLE_PAUSE_Y - PAUSE_HIT_R, x1: CONTROL_TOGGLE_PAUSE_X + PAUSE_HIT_R, y1: CONTROL_TOGGLE_PAUSE_Y + PAUSE_HIT_R }];
  for (const s of controlToggleRing(n)) rects.push({ x0: s.x - CONTROL_TOGGLE_HIT_R, y0: s.y - CONTROL_TOGGLE_HIT_R, x1: s.x + CONTROL_TOGGLE_HIT_R, y1: s.y + CONTROL_TOGGLE_HIT_R });
  let right = -Infinity;
  for (const r of rects) right = Math.max(right, r.x1);
  return { rects, right };
}

/**
 * 端の印のラベルの箱（ui/edge-marker の置き方: ラベルの中心 x は cx（左右の枠に寄せた後）、labelAbove なら下端が cy、でなければ上端が cy。幅 w・高さ h）。out に書いて返す
 */
export function edgeLabelBox(cx: number, cy: number, labelAbove: boolean, w: number, h: number, out: MutableRect): MutableRect {
  out.x0 = cx - w / 2;
  out.x1 = cx + w / 2;
  out.y0 = labelAbove ? cy - h : cy;
  out.y1 = labelAbove ? cy : cy + h;
  return out;
}

/**
 * 矢印の箱 arrow とラベルの箱 label のどちらかが塊の矩形（pad 込み）に掛かれば、両方の左端が塊の右端＋pad になる右へのずれを out に書いて返す（掛からなければ 0）
 */
export function avoidPauseCluster(arrow: ScreenRect, label: ScreenRect, c: PauseCluster, out: MarkerShift, pad: number = PAUSE_CLUSTER_PAD_PX): MarkerShift {
  out.dx = 0;
  out.dy = 0;
  if (!boxHitsRects(arrow.x0, arrow.y0, arrow.x1, arrow.y1, c.rects, pad) && !boxHitsRects(label.x0, label.y0, label.x1, label.y1, c.rects, pad)) return out;
  out.dx = Math.max(0, c.right + pad - Math.min(arrow.x0, label.x0));
  return out;
}

/** 塊を避ける印（ui/edge-marker の EdgeMarker）: 今の矢印とラベルの箱を書き、ずらせる */
export interface PauseAvoidingMarker {
  readonly isShown: boolean;
  writeBoxes(arrow: MutableRect, label: MutableRect): void;
  nudge(dx: number, dy: number): void;
}

const arrowBox: MutableRect = { x0: 0, y0: 0, x1: 0, y1: 0 };
const labelBox: MutableRect = { x0: 0, y0: 0, x1: 0, y1: 0 };
const pauseShift: MarkerShift = { dx: 0, dy: 0 };

/** 出ている印を塊から右へずらす（refresh と縁のずらしの後に毎フレーム。確保なし） */
export function clearOfPauseCluster(m: PauseAvoidingMarker, c: PauseCluster): void {
  if (!m.isShown) return;
  m.writeBoxes(arrowBox, labelBox);
  m.nudge(avoidPauseCluster(arrowBox, labelBox, c, pauseShift).dx, 0);
}
