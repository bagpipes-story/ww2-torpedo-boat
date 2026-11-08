// プレースホルダー図形を起動時に 1 回だけテクスチャ化する（CLAUDE.md §7: 毎フレーム Graphics を描き直さない）。
// 世界座標のテクスチャは RENDER_SCALE 倍の解像度で作り、表示側で 1/RENDER_SCALE に縮めて高 DPI でも滲まないようにする。
// v0.7.0 S1: 自艇・僚艇・隼艇の絵（generatePlayerBoatTexture）は assets/boat-art へ移した（鍵・寸法・原点は同じ）。S2a: 駆逐艦・輸送船は assets/destroyer-art・transport-art、魚雷は torpedo-art へ。
import Phaser from 'phaser';
import { RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import {
  DEBUG_RING_LINE_WIDTH,
  DEBUG_RING_RADIUS_UNITS,
  HP_BAR_HEIGHT,
  HP_BAR_WIDTH,
  ROUND_BUTTON_RADIUS,
  SMOKE_PUFF_COLOR,
  SMOKE_PUFF_TEX_RADIUS_UNITS,
  SEARCHLIGHT_COLOR,
  SEARCHLIGHT_TEX_LENGTH_UNITS,
  SHELL_COLOR,
  SHELL_DOT_UNITS,
  STARSHELL_COLOR,
  STARSHELL_TEX_RADIUS_UNITS,
  TRACER_COLOR,
  TRACER_LENGTH_UNITS,
  TRACER_WIDTH_UNITS,
  RUDDER_BAR_HALF_WIDTH,
  RUDDER_BAR_HEIGHT,
  RUDDER_MARKER_HEIGHT,
  RUDDER_MARKER_WIDTH,
  STICK_KNOB_RADIUS,
  STICK_RADIUS,
  TORPEDO_BUTTON_RADIUS,
  RETURN_RING_FILL_ALPHA,
  RETURN_RING_LINE_WIDTH,
  RETURN_RING_TEX_RADIUS_UNITS,
} from '../config/ui-config';
import { paintTorpedoTexture } from './torpedo-art';

/** 色の意味は固定（docs/02 §7）: 自艇=白、敵=薄い赤、味方=薄い青、魚雷=黄 */
const COLOR_PLAYER = 0xf2f5f8;
const COLOR_TORPEDO = 0xffe066;
const COLOR_WAKE = 0xdfe8f2;
const COLOR_UI = 0x9fb3c8;
/** 雷跡の点の半径（世界単位） */
const WAKE_DOT_RADIUS_UNITS = 2.5;
/** 爆発リングの半径（世界単位）。tween で拡大する */
const EXPLOSION_RING_RADIUS_UNITS = 40;

/**
 * スティックの台座（輪）とノブ（円）、舵バーとマーカー。HUD 座標（論理 px）× RENDER_SCALE で作る。
 * silentRingRatio: 静音帯の上限に当たる倒し量（0〜1。デッドゾーン込みで Boot が計算）。台座にその半径の輪を描き「ここまでが静音」を見せる
 */
export function generateUiTextures(scene: Phaser.Scene, silentRingRatio: number): void {
  const k = RENDER_SCALE;

  const baseD = Math.ceil(STICK_RADIUS * 2 * k) + 4;
  let g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.lineStyle(Math.max(2, 3 * k), COLOR_UI, 1);
  g.strokeCircle(baseD / 2, baseD / 2, STICK_RADIUS * k);
  g.lineStyle(Math.max(1, k), COLOR_UI, 0.7);
  g.strokeCircle(baseD / 2, baseD / 2, STICK_RADIUS * k * silentRingRatio);
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

/** 魚雷（v0.7.0 S2a から assets/torpedo-art。黄の胴・明るい先端・暗い尾。寸法は同じ）と雷跡の点（変えない＝R8）、爆発リング（変えない＝D2） */
export function generateTorpedoTextures(scene: Phaser.Scene, torpedoLengthUnits: number): void {
  const k = RENDER_SCALE;
  paintTorpedoTexture(scene, torpedoLengthUnits);

  const d = Math.ceil(WAKE_DOT_RADIUS_UNITS * 2 * k) + 2;
  let g = scene.make.graphics({ x: 0, y: 0 }, false);
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

/** 反撃（v0.2.1）: 砲弾の点、曳光弾、探照灯の扇（光源を下端に・光は上へ。原点は光源）、星弾の照明円、HP バー */
export function generateGunneryTextures(scene: Phaser.Scene, searchlightConeDeg: number): void {
  const k = RENDER_SCALE;
  let d = Math.ceil(SHELL_DOT_UNITS * k) + 2;
  let g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(SHELL_COLOR, 1);
  g.fillCircle(d / 2, d / 2, (SHELL_DOT_UNITS * k) / 2);
  g.generateTexture(TEXTURE_KEYS.shell, d, d);
  g.destroy();

  const tw = Math.ceil(TRACER_WIDTH_UNITS * k) + 1;
  const tl = Math.ceil(TRACER_LENGTH_UNITS * k);
  g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(TRACER_COLOR, 1);
  g.fillRect(0, 0, tw, tl);
  g.generateTexture(TEXTURE_KEYS.tracer, tw, tl);
  g.destroy();

  // 探照灯: 長さ L の二等辺三角形。先端（光源）は下端、光は上（北 = 方位 0）へ伸びる。幅は cone_deg から。表示時に射程/L 倍に拡大する
  const L = SEARCHLIGHT_TEX_LENGTH_UNITS * k;
  const halfW = Math.tan(((searchlightConeDeg / 2) * Math.PI) / 180) * L;
  const W = Math.ceil(halfW * 2) + 2;
  g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(SEARCHLIGHT_COLOR, 1);
  g.beginPath();
  g.moveTo(W / 2, L);
  g.lineTo(W, 0);
  g.lineTo(0, 0);
  g.closePath();
  g.fillPath();
  g.generateTexture(TEXTURE_KEYS.searchlight, W, Math.ceil(L));
  g.destroy();

  d = Math.ceil(STARSHELL_TEX_RADIUS_UNITS * 2 * k) + 2;
  g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(STARSHELL_COLOR, 1);
  g.fillCircle(d / 2, d / 2, STARSHELL_TEX_RADIUS_UNITS * k);
  g.generateTexture(TEXTURE_KEYS.starshell, d, d);
  g.destroy();

  const bw = Math.ceil(HP_BAR_WIDTH * k);
  const bh = Math.ceil(HP_BAR_HEIGHT * k);
  g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(COLOR_UI, 0.3);
  g.fillRect(0, 0, bw, bh);
  g.generateTexture(TEXTURE_KEYS.hpBarBg, bw, bh);
  g.destroy();
  g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 1); // 表示時に tint で色を付ける
  g.fillRect(0, 0, bw, bh);
  g.generateTexture(TEXTURE_KEYS.hpBarFill, bw, bh);
  g.destroy();
}

/** 技能の丸ボタン（煙幕・消火・見張り・識別。v0.6.8 実機 1 回目から右端の縦一列で R44 に縮めて使う。一時停止も同じ絵）と、煙幕の煙（世界単位 × RENDER_SCALE。表示時に半径へ拡縮） */
export function generateSmokeTextures(scene: Phaser.Scene): void {
  const k = RENDER_SCALE;
  let d = Math.ceil(ROUND_BUTTON_RADIUS * 2 * k) + 4;
  let g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(COLOR_UI, 0.25);
  g.fillCircle(d / 2, d / 2, ROUND_BUTTON_RADIUS * k);
  g.lineStyle(Math.max(2, 3 * k), COLOR_UI, 1);
  g.strokeCircle(d / 2, d / 2, ROUND_BUTTON_RADIUS * k);
  g.generateTexture(TEXTURE_KEYS.roundButton, d, d);
  g.destroy();

  d = Math.ceil(SMOKE_PUFF_TEX_RADIUS_UNITS * 2 * k) + 2;
  g = scene.make.graphics({ x: 0, y: 0 }, false);
  // 中心ほど濃い 3 重の円（柔らかい煙に見せる。表示時の alpha で全体の濃さを決める）
  g.fillStyle(SMOKE_PUFF_COLOR, 0.35);
  g.fillCircle(d / 2, d / 2, SMOKE_PUFF_TEX_RADIUS_UNITS * k);
  g.fillStyle(SMOKE_PUFF_COLOR, 0.35);
  g.fillCircle(d / 2, d / 2, SMOKE_PUFF_TEX_RADIUS_UNITS * k * 0.7);
  g.fillStyle(SMOKE_PUFF_COLOR, 0.3);
  g.fillCircle(d / 2, d / 2, SMOKE_PUFF_TEX_RADIUS_UNITS * k * 0.4);
  g.generateTexture(TEXTURE_KEYS.smokePuff, d, d);
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
export function generateTargetMarkerTexture(scene: Phaser.Scene, key: string, sizePx: number, color: number): void {
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
  g.generateTexture(key, w, w);
  g.destroy();
}

/** 帰投地点の輪（白。表示時に tint）。v0.3.0 */
export function generateReturnTextures(scene: Phaser.Scene): void {
  const k = RENDER_SCALE;
  const r = RETURN_RING_TEX_RADIUS_UNITS * k;
  const lw = RETURN_RING_LINE_WIDTH * k;
  const size = Math.ceil((r + lw) * 2);
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, RETURN_RING_FILL_ALPHA);
  g.fillCircle(size / 2, size / 2, r);
  g.lineStyle(lw, 0xffffff, 1);
  g.strokeCircle(size / 2, size / 2, r);
  g.generateTexture(TEXTURE_KEYS.returnRing, size, size);
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
