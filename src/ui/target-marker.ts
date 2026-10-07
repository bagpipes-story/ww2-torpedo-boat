// 画面外の敵（駆逐艦）の方向と距離を画面端に出すマーカー。自艇の視程内（telemetry.enemySighted）にいるときだけ出す（docs/02 §6.5）。
// §7: 位置は transform だけ動かし、距離テキストは刻みが変わったときだけ setText。
import Phaser from 'phaser';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import {
  CAMERA_LOOK_AHEAD_M,
  HUD_FONT_MARKER_PX,
  TARGET_MARKER_DISTANCE_STEP_M,
  TARGET_MARKER_MARGIN,
  TARGET_MARKER_TOP_MARGIN,
  hudTextStyle,
} from '../config/ui-config';
import type { BoatTelemetry } from '../core/boat-motion';
import { degToRad, radToDeg } from '../core/units';

export class TargetMarker {
  private readonly arrow: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private lastDistanceStep = -1;
  private visible = false;

  constructor(scene: Phaser.Scene) {
    this.arrow = scene.add.image(0, 0, TEXTURE_KEYS.targetMarker).setScale(1 / RENDER_SCALE).setDepth(DEPTH.hud).setVisible(false);
    this.label = scene.add.text(0, 0, '', hudTextStyle(HUD_FONT_MARKER_PX)).setOrigin(0.5, 0).setDepth(DEPTH.hud).setVisible(false);
  }

  /** 毎フレーム。敵の相対位置（m）を論理画面座標に写し、画面内なら隠し、画面外なら端にクランプして表示する。視程外・沈没後は隠す */
  refresh(t: BoatTelemetry): void {
    if (!t.enemySighted || Number.isNaN(t.enemyDx)) {
      this.setShown(false);
      return;
    }
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    // ワールド→論理画面: カメラ中心は自艇から進行方向に CAMERA_LOOK_AHEAD_M 先
    const h = degToRad(t.headingDeg);
    // ワールドカメラの論理ズーム（見張りで下がる）は telemetry で受け取る
    const sx = (t.enemyDx - Math.sin(h) * CAMERA_LOOK_AHEAD_M) * t.cameraZoom;
    const sy = (t.enemyDy + Math.cos(h) * CAMERA_LOOK_AHEAD_M) * t.cameraZoom;
    // 表示できる矩形: 左右・下は MARGIN、上は HUD 3 行分広く（中心からの距離で持つ）
    const halfW = cx - TARGET_MARKER_MARGIN;
    const downH = cy - TARGET_MARKER_MARGIN;
    const upH = cy - TARGET_MARKER_TOP_MARGIN;
    if (Math.abs(sx) < halfW && sy < downH && -sy < upH) {
      this.setShown(false);
      return;
    }
    // 画面の矩形の縁へクランプ（中心からの方向を保つ）
    const k = Math.min(halfW / Math.max(Math.abs(sx), 1e-6), (sy >= 0 ? downH : upH) / Math.max(Math.abs(sy), 1e-6));
    const mx = cx + sx * k;
    const my = cy + sy * k;
    this.arrow.setPosition(mx, my).setAngle(radToDeg(Math.atan2(sx, -sy)));
    this.label.setPosition(mx, my + TARGET_MARKER_MARGIN * 0.35);
    const dist = Math.hypot(t.enemyDx, t.enemyDy);
    const step = Math.round(dist / TARGET_MARKER_DISTANCE_STEP_M);
    if (step !== this.lastDistanceStep) {
      this.lastDistanceStep = step;
      this.label.setText(`敵 ${step * TARGET_MARKER_DISTANCE_STEP_M} m`);
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
