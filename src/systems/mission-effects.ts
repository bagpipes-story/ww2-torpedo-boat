// 任務中の演出とデバッグ表示: 爆発リング（発生時に 1 回だけ tween）、見越し点マーカー（?debug のときだけ）。
import Phaser from 'phaser';
import { DEPTH, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import {
  EXPLOSION_DURATION_MS,
  EXPLOSION_SCALE_DUD,
  EXPLOSION_SCALE_FROM,
  EXPLOSION_SCALE_HIT,
  EXPLOSION_TINT_DUD,
  EXPLOSION_TINT_HIT,
  LEAD_MARKER_ALPHA,
  LEAD_MARKER_SCALE,
  LEAD_MARKER_TINT,
} from '../config/ui-config';
import type { BoatState } from '../core/boat-motion';
import { interceptHeadingDeg, velocityFromHeading } from '../core/torpedo-solver';
import { degToRad } from '../core/units';

/** 爆発リング。不発は小さく灰色。tween 完了で破棄する */
export function playExplosion(scene: Phaser.Scene, x: number, y: number, dud: boolean): void {
  const ring = scene.add
    .image(x, y, TEXTURE_KEYS.explosionRing)
    .setScale(EXPLOSION_SCALE_FROM / RENDER_SCALE)
    .setTint(dud ? EXPLOSION_TINT_DUD : EXPLOSION_TINT_HIT)
    .setDepth(DEPTH.effects);
  const to = (dud ? EXPLOSION_SCALE_DUD : EXPLOSION_SCALE_HIT) / RENDER_SCALE;
  scene.tweens.add({
    targets: ring,
    scaleX: to,
    scaleY: to,
    alpha: 0,
    duration: EXPLOSION_DURATION_MS,
    ease: 'Cubic.easeOut',
    onComplete: () => ring.destroy(),
  });
}

/** 見越し点マーカー（docs/02 §6.3「v0.1 はデバッグ切替で常時表示可」）。sqrt は 1 回/フレーム、デバッグ時のみ */
export class LeadMarker {
  private readonly image: Phaser.GameObjects.Image;
  private readonly tmpVel = { x: 0, y: 0 };

  constructor(scene: Phaser.Scene) {
    this.image = scene.add
      .image(0, 0, TEXTURE_KEYS.explosionRing)
      .setScale(LEAD_MARKER_SCALE / RENDER_SCALE)
      .setTint(LEAD_MARKER_TINT)
      .setAlpha(LEAD_MARKER_ALPHA)
      .setDepth(DEPTH.effects)
      .setVisible(false);
  }

  /** 今この瞬間に撃った魚雷が当たる方位へ、目標までの距離だけ進んだ点に置く（会合点の近似） */
  refresh(boat: BoatState, target: BoatState | null, torpedoSpeedMps: number): void {
    if (!target) {
      if (this.image.visible) this.image.setVisible(false);
      return;
    }
    velocityFromHeading(target.headingDeg, target.speedMps, this.tmpVel);
    const h = interceptHeadingDeg(boat.x, boat.y, torpedoSpeedMps, target.x, target.y, this.tmpVel.x, this.tmpVel.y);
    if (h === null) {
      if (this.image.visible) this.image.setVisible(false);
      return;
    }
    const dist = Math.hypot(target.x - boat.x, target.y - boat.y);
    const hr = degToRad(h);
    this.image.setPosition(boat.x + Math.sin(hr) * dist, boat.y - Math.cos(hr) * dist).setVisible(true);
  }

  destroy(): void {
    this.image.destroy();
  }
}
