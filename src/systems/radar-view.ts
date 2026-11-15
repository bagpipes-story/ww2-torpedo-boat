// レーダーの輝点の絵（v0.8.0 S2。spec-v0800 §3.2 の D-R2・§5.2・§7 の 1〜3、brief L15）: 起動時に緑の輪の Image を 16 個（core/radar の RADAR_BLIP_CAPACITY）作っておき、
// 掃引の回数が変わった時だけ位置と見せる・隠すを書く（掃引の間は動かない）。薄れ方は輝点を置いた掃引の秒からの経過（固定ステップの時計）を 10 段に丸め、
// 段が変わった時だけ setAlpha（tween なし）。輪の絵は assets/radar-art が初めて使う時に 1 回作る。論理の状態は読むだけ。§7: 確保は constructor だけ。
// buildRadar（mission-world が 1 回呼ぶ）: setup.radar の任務（us_04）だけ WorldRadar とこの絵を作る。無い任務・?debug&noradar は null（絵も絵の鍵も作らない）。
import type Phaser from 'phaser';
import { ensureRadarBlipTexture } from '../assets/radar-art';
import { RENDER_SCALE } from '../config/game-config';
import { RADAR_BLIP_DEPTH, RADAR_BLIP_FADE_STEPS, RADAR_BLIP_TEX_KEY, radarBlipAlpha } from '../config/radar-art-config';
import { RADAR_BLIP_CAPACITY, radarAge01, type RadarState } from '../core/radar';
import { WorldRadar, type RadarBlipView } from './world-radar';
import type { WorldSetup } from './world-setup';

export type { WorldRadar } from './world-radar';

export class RadarView implements RadarBlipView {
  private readonly imgs: Phaser.GameObjects.Image[] = [];
  /** 位置を書いた掃引の回数（−1 は未だ）と、輝点ごとの今の薄れの段（−1 は未だ） */
  private placedSweeps = -1;
  private readonly fade = new Int8Array(RADAR_BLIP_CAPACITY).fill(-1);

  constructor(scene: Phaser.Scene) {
    ensureRadarBlipTexture(scene);
    for (let k = 0; k < RADAR_BLIP_CAPACITY; k++) this.imgs.push(scene.add.image(0, 0, RADAR_BLIP_TEX_KEY).setScale(1 / RENDER_SCALE).setDepth(RADAR_BLIP_DEPTH).setVisible(false));
  }

  /** 毎フレーム: 掃引が変わった時だけ置き直し、薄れの段が変わった輝点だけ α を書く */
  update(s: RadarState, nowS: number, sweepS: number): void {
    if (s.sweeps !== this.placedSweeps) {
      this.placedSweeps = s.sweeps;
      for (let k = 0; k < RADAR_BLIP_CAPACITY; k++) {
        const img = this.imgs[k]!;
        this.fade[k] = -1;
        if (k < s.n) {
          const b = s.blips[k]!;
          img.setPosition(b.x, b.y);
          if (!img.visible) img.setVisible(true);
        } else if (img.visible) {
          img.setVisible(false);
        }
      }
    }
    for (let k = 0; k < s.n; k++) {
      const q = Math.round(radarAge01(s.blips[k]!.atS, nowS, sweepS) * RADAR_BLIP_FADE_STEPS);
      if (q === this.fade[k]) continue;
      this.fade[k] = q;
      this.imgs[k]!.setAlpha(radarBlipAlpha(q));
    }
  }

  destroy(): void {
    for (const img of this.imgs) img.destroy();
    this.imgs.length = 0;
  }
}

/** レーダーの世界と絵（setup.radar の任務だけ。無ければ null）。世界の論理の全部の後・世界の絵の前に 1 回 */
export function buildRadar(scene: Phaser.Scene, w: { readonly setup: WorldSetup; readonly destroyers: { readonly total: number } | null }): WorldRadar | null {
  const p = w.setup.radar;
  return p ? new WorldRadar(p, w.setup.mission.bounds, w.setup.shores, w.destroyers ? w.destroyers.total : 0, new RadarView(scene)) : null;
}
