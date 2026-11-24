// v0.7.0 S3a（アートと音①：コードで描く絵。spec-v0700 §5）: 世界の絵（演出）の持ち主。MissionWorld が世界を作る最後に 1 つ作り、world-visuals の最後の 1 行で更新・破棄する（R13）。
// S3a は海の面（systems/sea-fx: 海の面・夜明けの光・月のきらめき）。S3b は航跡（systems/wake-fx。IP1a で道のりに沿う泡の尾）と爆発のプール（systems/explosion-fx。mission-effects の playExplosion に登録＝R12）。
// S3c は炎と煙（systems/fire-fx）と岸の帯（systems/coast-fx。動かない絵＝毎フレームは何もしない）。世界の論理の状態は読むだけ（art-rules）。乱数はそれぞれの演出が絵だけの SeededRng を持つ（R30）。
// IP1b（U3）: 火花・水滴・硝煙のプール（systems/spark-fx。fx-bus に登録＝SplashPool の水柱の飛沫と砲口の火花・火災の火の粉）、爆発の 2 段目（explosion-fx の中の blast-fx）、沈没の段（systems/sink-fx）。
// IP2（U6）: 昼の割合（夜明けの段 lightStep / SEA_LIGHT_STEPS）を毎フレーム爆発に渡す（明るい海の ADD の光を下げる）。
// v0.7.2 S3（音。brief L28）: 命中スローの残り秒を読むだけの口として世界を音に登録し（registerSfxSlowMo）、破棄で外す（聞き手と同じ形。音は slowMoLeftS を読むだけ）。
// v0.8.0 S2（spec-v0800 §4.10）: 海峡の両岸の陸と字（systems/strait-terrain。us_04 の setup.shores だけ。動かない絵）を岸の帯の後に作る。
// v0.8.1 IP1: 岸の陰の絵（systems/backdrop-fx＝暗い陸と岸の陰の海。背に岸のある任務＝us_06 だけ。無い任務は null＝物も絵の鍵も増えない）を海峡の陸の後に作る。
// v0.8.2 S2b（D-A4・L31）: 弾薬庫の誘爆の見た目（systems/magazine-fx。隊に弾薬庫のある世界＝us_05 だけ。無い任務は null＝毎フレームの仕事も物も増えない）。爆発のプールの後・沈没の段の前に進める。
import type Phaser from 'phaser';
import { SEA_LIGHT_STEPS } from '../config/dawn-config';
import { setupDayStart } from '../core/dawn-air';
import { BackdropFx, type BackdropFxWorldView } from './backdrop-fx';
import { CoastFx } from './coast-fx';
import { ExplosionFx } from './explosion-fx';
import { FireFx, type FireWorldView } from './fire-fx';
import { registerSparkFx } from './fx-bus';
import { MagazineFx, type MagazineFxWorldView } from './magazine-fx';
import { registerExplosionFx } from './mission-effects';
import { SeaFx } from './sea-fx';
import { registerSfxListener, registerSfxSlowMo } from './sfx-bus';
import { SinkFx } from './sink-fx';
import { SparkFx } from './spark-fx';
import { StraitTerrain } from './strait-terrain';
import { WakeFx, type WakeWorldView } from './wake-fx';
import type { WorldSetup } from './world-setup';

/** 世界から読む物（MissionWorld がそのまま満たす） */
export type ArtWorldView = WakeWorldView &
  FireWorldView &
  BackdropFxWorldView &
  MagazineFxWorldView & {
    readonly setup: WorldSetup;
    readonly dawn: { readonly lightStep: number };
    /** 命中スローの残り秒（v0.7.2 S3。音が読むだけ） */
    readonly slowMoLeftS: number;
  };

export class WorldArt {
  private readonly sea: SeaFx;
  private readonly wake: WakeFx;
  private readonly explosions: ExplosionFx;
  private readonly fire: FireFx;
  private readonly sparks: SparkFx;
  private readonly sink: SinkFx;
  private readonly coast: CoastFx;
  private readonly strait: StraitTerrain | null;
  private readonly backdrop: BackdropFx | null;
  private readonly magazine: MagazineFx | null;

  constructor(scene: Phaser.Scene, w: ArtWorldView) {
    this.sea = new SeaFx(scene, w.setup.mission.moon, setupDayStart(w.setup), w.setup.mission.bounds); // v0.8.5 S0: 救助（rescue。us_07）も昼から
    this.wake = new WakeFx(scene, w);
    this.sparks = new SparkFx(scene);
    registerSparkFx(this.sparks); // 世界の作成前・破棄後の水柱・砲口・火の粉の火花は何もしない（R12 と同じ）
    this.explosions = new ExplosionFx(scene, this.sparks);
    registerExplosionFx(this.explosions); // 世界の作成前・破棄後の playExplosion は何もしない（R12）
    this.sink = new SinkFx(scene, this.explosions, this.sparks);
    this.fire = new FireFx(scene, w, this.sink);
    this.coast = new CoastFx(scene, w.setup);
    this.strait = w.setup.shores ? new StraitTerrain(scene, w.setup) : null;
    this.backdrop = w.setup.backdrop && w.destroyers?.backdrop ? new BackdropFx(scene, w) : null;
    this.magazine = MagazineFx.of(this.explosions, w); // 弾薬庫の誘爆の見た目（v0.8.2 S2b。隊に弾薬庫のある世界だけ）
    registerSfxListener(w.boat.state); // 音の聞き手は自艇（v0.7.1 S1。位置を読むだけ。世界の作成前・破棄後の位置つきの音は鳴らさない＝R12 と同じ）
    registerSfxSlowMo(w); // 命中スローの音（v0.7.2 S3。slowMoLeftS を読むだけ。世界の作成前・破棄後はスローなし）
  }

  /** 毎フレーム（world-visuals の最後。夜明けの段は w.dawn.updateVisuals の後なのでこのフレームの値。船体の絵も同期の後） */
  update(realDt: number, w: ArtWorldView): void {
    this.sea.update(realDt, w.dawn.lightStep);
    this.wake.update(realDt, w);
    this.explosions.setDaylight(w.dawn.lightStep / SEA_LIGHT_STEPS);
    this.explosions.update(realDt);
    this.magazine?.update(realDt);
    this.fire.update(realDt);
    this.sink.update(realDt);
    this.sparks.update(realDt);
    this.backdrop?.update(realDt, w);
  }

  destroy(): void {
    registerExplosionFx(null);
    registerSparkFx(null);
    registerSfxListener(null);
    registerSfxSlowMo(null);
    this.sea.destroy();
    this.wake.destroy();
    this.explosions.destroy();
    this.fire.destroy();
    this.sink.destroy();
    this.sparks.destroy();
    this.coast.destroy();
    this.strait?.destroy();
    this.backdrop?.destroy();
  }
}
