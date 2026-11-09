// v0.7.0 S3a（アートと音①：コードで描く絵。spec-v0700 §5）: 世界の絵（演出）の持ち主。MissionWorld が世界を作る最後に 1 つ作り、world-visuals の最後の 1 行で更新・破棄する（R13）。
// S3a は海の面（systems/sea-fx: 海の模様・夜明けの光・月のきらめき）。S3b の航跡・爆発、S3c の炎と煙・岸の帯はここに足す。
// 世界の論理の状態は読むだけ（art-rules）。乱数はそれぞれの演出が絵だけの SeededRng を持つ（R30）。
import type Phaser from 'phaser';
import { SeaFx } from './sea-fx';
import type { WorldSetup } from './world-setup';

/** 世界から読む物（MissionWorld がそのまま満たす） */
export interface ArtWorldView {
  readonly setup: WorldSetup;
  readonly dawn: { readonly lightStep: number };
}

export class WorldArt {
  private readonly sea: SeaFx;

  constructor(scene: Phaser.Scene, w: ArtWorldView) {
    this.sea = new SeaFx(scene, w.setup.mission.moon, w.setup.evac ? w.setup.evac.dayStart : false);
  }

  /** 毎フレーム（world-visuals の最後。夜明けの段は w.dawn.updateVisuals の後なのでこのフレームの値） */
  update(realDt: number, w: ArtWorldView): void {
    this.sea.update(realDt, w.dawn.lightStep);
  }

  destroy(): void {
    this.sea.destroy();
  }
}
