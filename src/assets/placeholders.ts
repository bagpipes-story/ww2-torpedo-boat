// プレースホルダー図形を起動時に 1 回だけテクスチャ化する（CLAUDE.md §7: 毎フレーム Graphics を描き直さない）。
// 世界座標のテクスチャは RENDER_SCALE 倍の解像度で作り、表示側で 1/RENDER_SCALE に縮めて高 DPI でも滲まないようにする。
import Phaser from 'phaser';
import { RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import {
  RUDDER_BAR_HALF_WIDTH,
  RUDDER_BAR_HEIGHT,
  RUDDER_MARKER_HEIGHT,
  RUDDER_MARKER_WIDTH,
  STICK_KNOB_RADIUS,
  STICK_RADIUS,
} from '../config/ui-config';

/** 色の意味は固定（docs/02 §7）: 自艇=白、敵=薄い赤、味方=薄い青、魚雷=黄 */
const COLOR_PLAYER = 0xf2f5f8;
const COLOR_UI = 0x9fb3c8;

export interface BoatTextureSpec {
  /** 表示上の全長（m × sprite_scale） */
  lengthUnits: number;
  beamUnits: number;
}

/** 自艇: 船首を上にした船形ポリゴン。原点はテクスチャ中央 */
export function generatePlayerBoatTexture(scene: Phaser.Scene, spec: BoatTextureSpec): void {
  const k = RENDER_SCALE;
  const L = spec.lengthUnits * k;
  const B = spec.beamUnits * k;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(COLOR_PLAYER, 1);
  g.beginPath();
  g.moveTo(B / 2, 0);
  g.lineTo(B, L * 0.3);
  g.lineTo(B * 0.92, L);
  g.lineTo(B * 0.08, L);
  g.lineTo(0, L * 0.3);
  g.closePath();
  g.fillPath();
  // 船首側を示す暗い線（進行方向が一目で分かるように）
  g.lineStyle(Math.max(1, k), 0x0b1020, 0.9);
  g.beginPath();
  g.moveTo(B / 2, L * 0.08);
  g.lineTo(B / 2, L * 0.45);
  g.strokePath();
  g.generateTexture(TEXTURE_KEYS.playerBoat, Math.ceil(B), Math.ceil(L));
  g.destroy();
}

/** スティックの台座（輪）とノブ（円）、舵バーとマーカー。HUD 座標（論理 px）× RENDER_SCALE で作る */
export function generateUiTextures(scene: Phaser.Scene): void {
  const k = RENDER_SCALE;

  const baseD = Math.ceil(STICK_RADIUS * 2 * k) + 4;
  let g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.lineStyle(Math.max(2, 3 * k), COLOR_UI, 1);
  g.strokeCircle(baseD / 2, baseD / 2, STICK_RADIUS * k);
  g.lineStyle(Math.max(1, k), COLOR_UI, 0.6);
  g.strokeCircle(baseD / 2, baseD / 2, STICK_RADIUS * k * 0.5);
  g.generateTexture(TEXTURE_KEYS.stickBase, baseD, baseD);
  g.destroy();

  const knobD = Math.ceil(STICK_KNOB_RADIUS * 2 * k) + 2;
  g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(COLOR_UI, 1);
  g.fillCircle(knobD / 2, knobD / 2, STICK_KNOB_RADIUS * k);
  g.generateTexture(TEXTURE_KEYS.stickKnob, knobD, knobD);
  g.destroy();

  const barW = Math.ceil(RUDDER_BAR_HALF_WIDTH * 2 * k);
  const barH = Math.ceil(RUDDER_BAR_HEIGHT * k);
  g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(COLOR_UI, 0.35);
  g.fillRect(0, 0, barW, barH);
  g.fillStyle(COLOR_UI, 0.9);
  g.fillRect(barW / 2 - k, 0, 2 * k, barH);
  g.generateTexture(TEXTURE_KEYS.rudderBar, barW, barH);
  g.destroy();

  const mW = Math.ceil(RUDDER_MARKER_WIDTH * k);
  const mH = Math.ceil(RUDDER_MARKER_HEIGHT * k);
  g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(COLOR_PLAYER, 1);
  g.fillRect(0, 0, mW, mH);
  g.generateTexture(TEXTURE_KEYS.rudderMarker, mW, mH);
  g.destroy();
}
