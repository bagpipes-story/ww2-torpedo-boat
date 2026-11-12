// v0.7.1 S3（アートと音②：合成の効果音。spec-v0710 §2・§5・§13 の 6）: 任務の間の音（HudScene が任務ごとに 1 つ作る）。S3 はループ 5 本＝エンジン・海・火・雨・機の爆音。
// 毎フレーム HudScene.update から: テレメトリ（Mission が同じフレームに書き終えている。読むだけ）→ core/sfx-loops が目標を決める → systems/sfx-bus へ渡す
// （ノードへ書くのは 10 Hz・変わった時だけ＝systems/sfx-loop-player。エンジンが無い端末は口が何もしない）。
// Hud の出来事: PAUSE（一時停止）でループの束を 0 へ・RESUME で戻す・SHUTDOWN（任務の終わり・やり直し・任務をやめる）で 5 本を止め、付けた口を外す
// （Hud のシーンは任務ごとに使い回される＝口を残すと前の任務の物が動く）。口は起動時に作った関数と自分を渡す（閉包を作らない）。
// 画面の枠組みの型は使わない（出来事の口は構造の型・名前は下の 3 つ＝Phaser.Scenes.Events の PAUSE・RESUME・SHUTDOWN と同じ文字。tests/sfx-mission が node_modules の定義と突き合わせる）。
// S4: 状態の合図（core/sfx-cues の stepSfxCues）をここの update に足す。
import type { BoatTelemetry } from '../core/boat-telemetry';
import { createSfxLoopState, createSfxLoopTargets, stepSfxLoops, type SfxLoopState } from '../core/sfx-loops';
import { ktToMps } from '../core/units';
import { sfxLoops, sfxLoopsPaused, sfxLoopsStop } from './sfx-bus';

/** シーンの出来事の名前（Phaser.Scenes.Events と同じ文字） */
export const SFX_SCENE_EV_PAUSE = 'pause';
export const SFX_SCENE_EV_RESUME = 'resume';
export const SFX_SCENE_EV_SHUTDOWN = 'shutdown';
const MS_PER_S = 1000;

/** シーンの出来事の口（Phaser の scene.events が満たす） */
export interface SfxSceneEvents {
  on(event: string, fn: () => void, context: unknown): unknown;
  once(event: string, fn: () => void, context: unknown): unknown;
  off(event: string, fn: () => void, context: unknown): unknown;
}

export class MissionSfx {
  private readonly loopState: SfxLoopState;
  private readonly loopTargets = createSfxLoopTargets();

  /** events は Hud の scene.events、speedMaxKt は任務の艇の最大速力（data/boats.json の speed_max_kt。エンジンの音の高さの割合に使う） */
  constructor(private readonly events: SfxSceneEvents, speedMaxKt: number) {
    this.loopState = createSfxLoopState(ktToMps(speedMaxKt));
    events.on(SFX_SCENE_EV_PAUSE, this.onPause, this);
    events.on(SFX_SCENE_EV_RESUME, this.onResume, this);
    events.once(SFX_SCENE_EV_SHUTDOWN, this.onShutdown, this);
  }

  /** 毎フレーム（HudScene.update。deltaMs はそのフレームの ms）: ループの目標を決めて渡す */
  update(t: BoatTelemetry, deltaMs: number): void {
    const dtS = deltaMs / MS_PER_S;
    stepSfxLoops(this.loopState, t, dtS, this.loopTargets);
    sfxLoops(this.loopTargets, dtS);
  }

  private onPause(): void {
    sfxLoopsPaused(true);
  }

  private onResume(): void {
    sfxLoopsPaused(false);
  }

  private onShutdown(): void {
    this.events.off(SFX_SCENE_EV_PAUSE, this.onPause, this);
    this.events.off(SFX_SCENE_EV_RESUME, this.onResume, this);
    sfxLoopsStop();
  }
}
