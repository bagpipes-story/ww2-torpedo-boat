// 画面外の目標（敵の駆逐艦・帰投地点）の方向と距離を画面端に出すマーカー（docs/02 §6.5・§6.7）。
// v0.3.0 で target-marker を一般化: テクスチャ・ラベルの接頭辞・距離の刻み・ラベルの上下・上端の余白を指定する。
// §7: 位置は transform だけ動かし、距離テキストは刻みが変わったときだけ setText。
// v0.6.6（隼艇の矢印）: 任意の矢印の色 tint、出ている間の点（読むだけ）と nudge（縁に沿ってずらす。ui/marker-separation。次の refresh が方位どおりに戻す）。
// v0.6.6 レビュー ux:ux-1: 任意の hideMargin（「画面の内なら隠す」の余白。ui/edge-marker-screen）と refresh の drawn（目標の絵が出ていなければ画面の内でも縁へ）。省けば今のまま。
// v0.6.11 S5: setPrefix（ラベルの名を替える。空襲下の退避の「第4隊 N m」「西の壕 N m」＝ui/evac-markers。替えたときだけ次の refresh で組み直す）。呼ばなければ今のまま。
// v0.6.11 S8b: 任意の labelInset（ラベルを画面の枠の左右の内側この px に収める。左の縁の矢印の下の「西の壕 1200 m」が W 1280 で画面の外へ 4 px 出た）。省けば今のまま。
import Phaser from 'phaser';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH, RENDER_SCALE } from '../config/game-config';
import { CAMERA_LOOK_AHEAD_M, HUD_FONT_MARKER_PX, TARGET_MARKER_MARGIN, TARGET_MARKER_RIGHT_MARGIN, hudTextStyle } from '../config/ui-config';
import type { BoatTelemetry } from '../core/boat-motion';
import { degToRad, radToDeg } from '../core/units';
import { markerOnScreen } from './edge-marker-screen';

export interface EdgeMarkerOptions {
  textureKey: string;
  /** 「敵」「帰投」など。ラベルは `${prefix} ${距離} m` */
  labelPrefix: string;
  /** 距離表示の刻み m */
  stepM: number;
  /** ラベルを矢印の上に置く（下に置く敵マーカーと重ならないように） */
  labelAbove: boolean;
  /** 距離の刻みを切り上げる（帰投地点: 輪の縁までの距離なので、輪の外で 0 m と出さない）。既定は四捨五入 */
  roundUp?: boolean;
  /** 上端の余白（中心からの距離ではなく、画面上端から） */
  topMargin: number;
  color?: string;
  /** 矢印の絵に掛ける色（v0.6.6。隼艇の矢印。省略は絵の色のまま） */
  tint?: number;
  /** 「画面の内なら隠す」の判定の余白 px（全辺。v0.6.6 レビュー ux:ux-1。隼艇は 0＝本当の画面の矩形）。省略は今の縁（上 topMargin・左右と下 TARGET_MARKER_MARGIN）。クランプの縁は変えない */
  hideMargin?: number;
  /** ラベルを画面の枠（0〜GAME_WIDTH）の左右の内側この px に収める（v0.6.11 S8b。空襲下の退避の矢印）。省略は今のまま（矢印の真上・真下） */
  labelInset?: number;
}

export class EdgeMarker {
  private readonly arrow: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private lastDistanceStep = -1;
  private visible = false;
  /** 最後の refresh で矢印を置いた論理画面の点（nudge 込み） */
  private mx = 0;
  private my = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly opts: EdgeMarkerOptions,
  ) {
    this.arrow = scene.add.image(0, 0, opts.textureKey).setScale(1 / RENDER_SCALE).setDepth(DEPTH.hud).setVisible(false);
    if (opts.tint !== undefined) this.arrow.setTint(opts.tint);
    this.label = scene.add
      .text(0, 0, '', hudTextStyle(HUD_FONT_MARKER_PX, opts.color))
      .setOrigin(0.5, opts.labelAbove ? 1 : 0)
      .setDepth(DEPTH.hud)
      .setVisible(false);
  }

  /**
   * 毎フレーム。目標の相対位置（m）を論理画面座標に写し、画面内なら隠し、画面外なら端にクランプして表示する。
   * show=false（視程外・沈没後）なら隠す。カメラの向き・ズームは telemetry から。distM を渡せばラベルの距離にそれを使う（帰投地点は輪の縁まで）。
   * drawn=false（目標の絵が出ていない。隼艇は自艇の視程の外）なら画面の内でも隠さず、方位どおり縁に置く（v0.6.6 レビュー ux:ux-1。既定 true＝今のまま）。
   * distOx/distOy は distM を渡さない時の距離の原点のずれ（距離 = |(dx + distOx, dy + distOy)|。v0.6.11 S8: 空襲下の退避の矢印はカメラの中心へ置き直した dx を渡し、
   * 距離は座席から＝平方根は画面の外に出す矢印だけ。既定 0＝今のまま）
   */
  refresh(dx: number, dy: number, show: boolean, t: BoatTelemetry, distM?: number, drawn = true, distOx = 0, distOy = 0): void {
    if (!show || Number.isNaN(dx)) {
      this.setShown(false);
      return;
    }
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    // ワールド→論理画面: カメラ中心は自艇から進行方向に CAMERA_LOOK_AHEAD_M 先。ズームは telemetry（見張りで下がる）
    const h = degToRad(t.headingDeg);
    const sx = (dx - Math.sin(h) * CAMERA_LOOK_AHEAD_M) * t.cameraZoom;
    const sy = (dy + Math.cos(h) * CAMERA_LOOK_AHEAD_M) * t.cameraZoom;
    // 表示できる矩形: 左・下は MARGIN、上は HUD と左上のバーの分広く、右は丸ボタンの列を避けて広く（中心からの距離で持つ）
    const halfW = cx - TARGET_MARKER_MARGIN;
    const downH = cy - TARGET_MARKER_MARGIN;
    const upH = cy - this.opts.topMargin;
    // 「画面内なら隠す」は画面全体で判定する（ボタンの列の下に見えている目標にマーカーを出さない）。hideMargin のある矢印はその余白で（ui/edge-marker-screen）
    if (drawn && markerOnScreen(sx, sy, cx, cy, this.opts.topMargin, TARGET_MARKER_MARGIN, this.opts.hideMargin)) {
      this.setShown(false);
      return;
    }
    // 画面の矩形の縁へクランプ（中心からの方向を保つ）。右へ出るときは「煙幕」「見張り」ボタンの左に置く
    const sideW = sx > 0 ? cx - TARGET_MARKER_RIGHT_MARGIN : halfW;
    const k = Math.min(sideW / Math.max(Math.abs(sx), 1e-6), (sy >= 0 ? downH : upH) / Math.max(Math.abs(sy), 1e-6));
    const mx = (this.mx = cx + sx * k);
    const my = (this.my = cy + sy * k);
    this.arrow.setPosition(mx, my).setAngle(radToDeg(Math.atan2(sx, -sy)));
    const gap = TARGET_MARKER_MARGIN * 0.35;
    this.label.setPosition(mx, this.opts.labelAbove ? my - gap : my + gap);
    const dist = distM ?? Math.hypot(dx + distOx, dy + distOy);
    const step = this.opts.roundUp ? Math.ceil(dist / this.opts.stepM) : Math.round(dist / this.opts.stepM);
    if (step !== this.lastDistanceStep) {
      this.lastDistanceStep = step;
      this.label.setText(`${this.opts.labelPrefix} ${step * this.opts.stepM} m`);
    }
    this.clampLabel();
    this.setShown(true);
  }

  /** ラベルの接頭辞を替える（v0.6.11 S5。同じなら何もしない。替えたら次の refresh で距離の字を組み直す） */
  setPrefix(prefix: string): void {
    if (prefix === this.opts.labelPrefix) return;
    this.opts.labelPrefix = prefix;
    this.lastDistanceStep = -1;
  }

  /** 出ているか・矢印の点（v0.6.6。ui/marker-separation が読む） */
  get isShown(): boolean { return this.visible; }
  get shownX(): number { return this.mx; }
  get shownY(): number { return this.my; }
  /** ラベルの幅 px（v0.6.11 S8b。ui/evac-markers が上下の縁で隣のラベルと重ならない間隔を決める。読むだけ） */
  get labelWidth(): number { return this.label.width; }

  /** refresh の後に矢印とラベルを (dx, dy) px だけ動かす（v0.6.6。隼艇の矢印を輸送隊の矢印から縁に沿ってずらす） */
  nudge(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    this.mx += dx;
    this.my += dy;
    this.arrow.setPosition(this.arrow.x + dx, this.arrow.y + dy);
    this.label.setPosition(this.label.x + dx, this.label.y + dy);
    this.clampLabel();
  }

  /** labelInset のある矢印だけ: ラベルの左右の端を画面の枠の内側へ（矢印は動かさない） */
  private clampLabel(): void {
    const inset = this.opts.labelInset;
    if (inset === undefined) return;
    const half = this.label.width / 2;
    const x = Math.min(Math.max(this.label.x, inset + half), GAME_WIDTH - inset - half);
    if (x !== this.label.x) this.label.x = x;
  }

  private setShown(v: boolean): void {
    if (v === this.visible) return;
    this.visible = v;
    this.arrow.setVisible(v);
    this.label.setVisible(v);
  }

  destroy(): void {
    this.arrow.destroy();
    this.label.destroy();
  }
}
