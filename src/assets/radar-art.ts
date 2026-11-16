// レーダーの輝点の絵（v0.8.0 S2。spec-v0800 §4.10・§5.2・§7 の 1）: 緑の輪 1 枚を、レーダーのある任務（setup.radar）で初めて使う時に 1 回だけ Graphics に描いて
// generateTexture する（テクスチャはページの間残る＝やり直しは描かない。毎フレームは systems/radar-view の Image の位置と α だけ）。
// 輪は外の淡い光（太い線）と内の線の 2 本（同じ中心）。大きさと色は config/radar-art-config。座標は世界の m を RENDER_SCALE 倍した px（Image は 1 / RENDER_SCALE で置く）。乱数なし。
import type Phaser from 'phaser';
import { RENDER_SCALE } from '../config/game-config';
import { RADAR_BLIP_COLOR, RADAR_BLIP_GLOW_ALPHA, RADAR_BLIP_GLOW_M, RADAR_BLIP_LINE_M, RADAR_BLIP_RADIUS_M, RADAR_BLIP_TEX_KEY } from '../config/radar-art-config';

/** 輪の絵の 1 辺の px（k は 1 m の px。外の光の外側まで＋余白 4 px） */
export function radarBlipTexPx(k: number): number {
  return Math.ceil((RADAR_BLIP_RADIUS_M + RADAR_BLIP_GLOW_M / 2) * 2 * k) + 4;
}

/** 輪の絵が無ければ 1 回だけ作る（2 回目からは何もしない） */
export function ensureRadarBlipTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(RADAR_BLIP_TEX_KEY)) return;
  const k = RENDER_SCALE;
  const d = radarBlipTexPx(k);
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.lineStyle(RADAR_BLIP_GLOW_M * k, RADAR_BLIP_COLOR, RADAR_BLIP_GLOW_ALPHA);
  g.strokeCircle(d / 2, d / 2, RADAR_BLIP_RADIUS_M * k);
  g.lineStyle(RADAR_BLIP_LINE_M * k, RADAR_BLIP_COLOR, 1);
  g.strokeCircle(d / 2, d / 2, RADAR_BLIP_RADIUS_M * k);
  g.generateTexture(RADAR_BLIP_TEX_KEY, d, d);
  g.destroy();
}
