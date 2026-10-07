// プレースホルダー図形を起動時に 1 回だけテクスチャ化する（CLAUDE.md §7: 毎フレーム Graphics を描き直さない）。
// 世界座標のテクスチャは RENDER_SCALE 倍の解像度で作り、表示側で 1/RENDER_SCALE に縮めて高 DPI でも滲まないようにする。
import Phaser from 'phaser';
import { RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import {
  DEBUG_RING_LINE_WIDTH,
  DEBUG_RING_RADIUS_UNITS,
  RUDDER_BAR_HALF_WIDTH,
  RUDDER_BAR_HEIGHT,
  RUDDER_MARKER_HEIGHT,
  RUDDER_MARKER_WIDTH,
  STICK_KNOB_RADIUS,
  STICK_RADIUS,
  TORPEDO_BUTTON_RADIUS,
} from '../config/ui-config';

/** 色の意味は固定（docs/02 §7）: 自艇=白、敵=薄い赤、味方=薄い青、魚雷=黄 */
const COLOR_PLAYER = 0xf2f5f8;
const COLOR_ENEMY = 0xe08a8a;
const COLOR_TORPEDO = 0xffe066;
const COLOR_WAKE = 0xdfe8f2;
const COLOR_UI = 0x9fb3c8;
/** 魚雷のプレースホルダーの幅（世界単位）。実寸 0.5 m では見えないので太らせる */
const TORPEDO_WIDTH_UNITS = 3;
/** 雷跡の点の半径（世界単位） */
const WAKE_DOT_RADIUS_UNITS = 2.5;
/** 爆発リングの半径（世界単位）。tween で拡大する */
const EXPLOSION_RING_RADIUS_UNITS = 40;

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

/** 敵艦: 船首を上にした細長い船形（薄い赤）＋中央の艦橋。原点はテクスチャ中央 */
export function generateDestroyerTexture(scene: Phaser.Scene, spec: BoatTextureSpec): void {
  const k = RENDER_SCALE;
  const L = spec.lengthUnits * k;
  const B = spec.beamUnits * k;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(COLOR_ENEMY, 1);
  g.beginPath();
  g.moveTo(B / 2, 0);
  g.lineTo(B, L * 0.18);
  g.lineTo(B, L * 0.9);
  g.lineTo(B * 0.75, L);
  g.lineTo(B * 0.25, L);
  g.lineTo(0, L * 0.9);
  g.lineTo(0, L * 0.18);
  g.closePath();
  g.fillPath();
  g.fillStyle(0x0b1020, 0.8);
  g.fillRect(B * 0.3, L * 0.35, B * 0.4, L * 0.25);
  g.generateTexture(TEXTURE_KEYS.destroyer, Math.ceil(B), Math.ceil(L));
  g.destroy();
}

/** 魚雷（黄の細長い矩形、先端を上）と雷跡の点、爆発リング */
export function generateTorpedoTextures(scene: Phaser.Scene, torpedoLengthUnits: number): void {
  const k = RENDER_SCALE;
  const w = Math.ceil(TORPEDO_WIDTH_UNITS * k);
  const l = Math.ceil(torpedoLengthUnits * k);
  let g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(COLOR_TORPEDO, 1);
  g.fillRect(0, 0, w, l);
  g.generateTexture(TEXTURE_KEYS.torpedo, w, l);
  g.destroy();

  const d = Math.ceil(WAKE_DOT_RADIUS_UNITS * 2 * k) + 2;
  g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(COLOR_WAKE, 1);
  g.fillCircle(d / 2, d / 2, WAKE_DOT_RADIUS_UNITS * k);
  g.generateTexture(TEXTURE_KEYS.wakeDot, d, d);
  g.destroy();

  // 爆発リングは白で作り、表示時に tint で色を付ける（命中=橙、不発=灰）
  const rd = Math.ceil(EXPLOSION_RING_RADIUS_UNITS * 2 * k) + 8;
  g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.lineStyle(Math.max(2, 4 * k), 0xffffff, 1);
  g.strokeCircle(rd / 2, rd / 2, EXPLOSION_RING_RADIUS_UNITS * k);
  g.fillStyle(0xffffff, 0.35);
  g.fillCircle(rd / 2, rd / 2, EXPLOSION_RING_RADIUS_UNITS * k * 0.6);
  g.generateTexture(TEXTURE_KEYS.explosionRing, rd, rd);
  g.destroy();
}

/** デバッグ用の距離の円（世界単位 × RENDER_SCALE）。?debug のときだけ作る。白で作って tint で色を付ける */
export function generateDebugRingTexture(scene: Phaser.Scene): void {
  const k = RENDER_SCALE;
  const d = Math.ceil(DEBUG_RING_RADIUS_UNITS * 2 * k) + 8;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.lineStyle(Math.max(1, DEBUG_RING_LINE_WIDTH * k), 0xffffff, 1);
  g.strokeCircle(d / 2, d / 2, DEBUG_RING_RADIUS_UNITS * k);
  g.generateTexture(TEXTURE_KEYS.debugRing, d, d);
  g.destroy();
}

/** 画面外の敵を指す三角（HUD 座標 × RENDER_SCALE、先端を上） */
export function generateTargetMarkerTexture(scene: Phaser.Scene, sizePx: number, color: number): void {
  const k = RENDER_SCALE;
  const w = Math.ceil(sizePx * k) + 2;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(color, 1);
  g.beginPath();
  g.moveTo(w / 2, 1);
  g.lineTo(w - 1, w - 1);
  g.lineTo(1, w - 1);
  g.closePath();
  g.fillPath();
  g.generateTexture(TEXTURE_KEYS.targetMarker, w, w);
  g.destroy();
}

/** 魚雷ボタン（HUD 座標 × RENDER_SCALE） */
export function generateTorpedoButtonTexture(scene: Phaser.Scene): void {
  const k = RENDER_SCALE;
  const d = Math.ceil(TORPEDO_BUTTON_RADIUS * 2 * k) + 4;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(COLOR_UI, 0.25);
  g.fillCircle(d / 2, d / 2, TORPEDO_BUTTON_RADIUS * k);
  g.lineStyle(Math.max(2, 3 * k), COLOR_TORPEDO, 1);
  g.strokeCircle(d / 2, d / 2, TORPEDO_BUTTON_RADIUS * k);
  g.generateTexture(TEXTURE_KEYS.torpedoButton, d, d);
  g.destroy();
}
