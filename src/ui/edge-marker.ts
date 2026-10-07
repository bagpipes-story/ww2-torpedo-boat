// 画面外の目標（敵の駆逐艦・帰投地点）の方向と距離を画面端に出すマーカー（docs/02 §6.5・§6.7）。
// v0.3.0 で target-marker を一般化: テクスチャ・ラベルの接頭辞・距離の刻み・ラベルの上下・上端の余白を指定する。
// §7: 位置は transform だけ動かし、距離テキストは刻みが変わったときだけ setText。
import Phaser from 'phaser';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH, RENDER_SCALE } from '../config/game-config';
import { CAMERA_LOOK_AHEAD_M, HUD_FONT_MARKER_PX, TARGET_MARKER_MARGIN, TARGET_MARKER_RIGHT_MARGIN, hudTextStyle } from '../config/ui-config';
import type { BoatTelemetry } from '../core/boat-motion';
import { degToRad, radToDeg } from '../core/units';

export interface EdgeMarkerOptions {
  textureKey: string;
  /** 「敵」「帰投」など。ラベルは `${prefix} ${距離} m` */
  labelPrefix: string;
  /** 距離表示の刻み m */
  stepM: number;
  /** ラベルを矢印の上に置く（下に置く敵マーカーと重ならないように） */
  labelAbove: boolean;
  /** 上端の余白（中心からの距離ではなく、画面上端から） */
  topMargin: number;
  color?: string;
}

export class EdgeMarker {
  private readonly arrow: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private lastDistanceStep = -1;
  private visible = false;

  constructor(
    scene: Phaser.Scene,
    private readonly opts: EdgeMarkerOptions,
  ) {
    this.arrow = scene.add.image(0, 0, opts.textureKey).setScale(1 / RENDER_SCALE).setDepth(DEPTH.hud).setVisible(false);
    this.label = scene.add
      .text(0, 0, '', hudTextStyle(HUD_FONT_MARKER_PX, opts.color))
      .setOrigin(0.5, opts.labelAbove ? 1 : 0)
      .setDepth(DEPTH.hud)
      .setVisible(false);
  }

  /**
   * 毎フレーム。目標の相対位置（m）を論理画面座標に写し、画面内なら隠し、画面外なら端にクランプして表示する。
   * show=false（視程外・沈没後）なら隠す。カメラの向き・ズームは telemetry から
   */
  refresh(dx: number, dy: number, show: boolean, t: BoatTelemetry): void {
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
    // 「画面内なら隠す」は画面全体で判定する（ボタンの列の下に見えている目標にマーカーを出さない）
    if (Math.abs(sx) < halfW && sy < downH && -sy < upH) {
      this.setShown(false);
      return;
    }
    // 画面の矩形の縁へクランプ（中心からの方向を保つ）。右へ出るときは「煙幕」「見張り」ボタンの左に置く
    const sideW = sx > 0 ? cx - TARGET_MARKER_RIGHT_MARGIN : halfW;
    const k = Math.min(sideW / Math.max(Math.abs(sx), 1e-6), (sy >= 0 ? downH : upH) / Math.max(Math.abs(sy), 1e-6));
    const mx = cx + sx * k;
    const my = cy + sy * k;
    this.arrow.setPosition(mx, my).setAngle(radToDeg(Math.atan2(sx, -sy)));
    const gap = TARGET_MARKER_MARGIN * 0.35;
    this.label.setPosition(mx, this.opts.labelAbove ? my - gap : my + gap);
    const dist = Math.hypot(dx, dy);
    const step = Math.round(dist / this.opts.stepM);
    if (step !== this.lastDistanceStep) {
      this.lastDistanceStep = step;
      this.label.setText(`${this.opts.labelPrefix} ${step * this.opts.stepM} m`);
    }
    this.setShown(true);
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
