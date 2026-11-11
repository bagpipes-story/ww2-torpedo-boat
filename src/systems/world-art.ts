// v0.7.0 S3a（アートと音①：コードで描く絵。spec-v0700 §5）: 世界の絵（演出）の持ち主。MissionWorld が世界を作る最後に 1 つ作り、world-visuals の最後の 1 行で更新・破棄する（R13）。
// S3a は海の面（systems/sea-fx: 海の面・夜明けの光・月のきらめき）。S3b は航跡（systems/wake-fx。IP1a で道のりに沿う泡の尾）と爆発のプール（systems/explosion-fx。mission-effects の playExplosion に登録＝R12）。
// S3c は炎と煙（systems/fire-fx）と岸の帯（systems/coast-fx。動かない絵＝毎フレームは何もしない）。世界の論理の状態は読むだけ（art-rules）。乱数はそれぞれの演出が絵だけの SeededRng を持つ（R30）。
// IP1b（U3）: 火花・水滴・硝煙のプール（systems/spark-fx。fx-bus に登録＝SplashPool の水柱の飛沫と砲口の火花・火災の火の粉）、爆発の 2 段目（explosion-fx の中の blast-fx）、沈没の段（systems/sink-fx）。
import type Phaser from 'phaser';
import { CoastFx } from './coast-fx';
import { ExplosionFx } from './explosion-fx';
import { FireFx, type FireWorldView } from './fire-fx';
import { registerSparkFx } from './fx-bus';
import { registerExplosionFx } from './mission-effects';
import { SeaFx } from './sea-fx';
import { SinkFx } from './sink-fx';
import { SparkFx } from './spark-fx';
import { WakeFx, type WakeWorldView } from './wake-fx';
import type { WorldSetup } from './world-setup';

/** 世界から読む物（MissionWorld がそのまま満たす） */
export type ArtWorldView = WakeWorldView &
  FireWorldView & {
    readonly setup: WorldSetup;
    readonly dawn: { readonly lightStep: number };
  };

export class WorldArt {
  private readonly sea: SeaFx;
  private readonly wake: WakeFx;
  private readonly explosions: ExplosionFx;
  private readonly fire: FireFx;
  private readonly sparks: SparkFx;
  private readonly sink: SinkFx;
  private readonly coast: CoastFx;

  constructor(scene: Phaser.Scene, w: ArtWorldView) {
    this.sea = new SeaFx(scene, w.setup.mission.moon, w.setup.evac ? w.setup.evac.dayStart : false, w.setup.mission.bounds);
    this.wake = new WakeFx(scene, w);
    this.sparks = new SparkFx(scene);
    registerSparkFx(this.sparks); // 世界の作成前・破棄後の水柱・砲口・火の粉の火花は何もしない（R12 と同じ）
    this.explosions = new ExplosionFx(scene, this.sparks);
    registerExplosionFx(this.explosions); // 世界の作成前・破棄後の playExplosion は何もしない（R12）
    this.sink = new SinkFx(scene, this.explosions, this.sparks);
    this.fire = new FireFx(scene, w, this.sink);
    this.coast = new CoastFx(scene, w.setup);
  }

  /** 毎フレーム（world-visuals の最後。夜明けの段は w.dawn.updateVisuals の後なのでこのフレームの値。船体の絵も同期の後） */
  update(realDt: number, w: ArtWorldView): void {
    this.sea.update(realDt, w.dawn.lightStep);
    this.wake.update(realDt, w);
    this.explosions.update(realDt);
    this.fire.update(realDt);
    this.sink.update(realDt);
    this.sparks.update(realDt);
  }

  destroy(): void {
    registerExplosionFx(null);
    registerSparkFx(null);
    this.sea.destroy();
    this.wake.destroy();
    this.explosions.destroy();
    this.fire.destroy();
    this.sink.destroy();
    this.sparks.destroy();
    this.coast.destroy();
  }
}
