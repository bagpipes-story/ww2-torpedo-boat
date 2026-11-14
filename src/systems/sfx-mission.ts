// v0.7.1 S3（アートと音②：合成の効果音。spec-v0710 §2・§5・§13 の 6）: 任務の間の音（HudScene が任務ごとに 1 つ作る）。S3 はループ 5 本＝エンジン・海・火・雨・機の爆音。
// 毎フレーム HudScene.update から: テレメトリ（Mission が同じフレームに書き終えている。読むだけ）→ core/sfx-loops が目標を決める → systems/sfx-bus へ渡す
// （ノードへ書くのは 10 Hz・変わった時だけ＝systems/sfx-loop-player。エンジンが無い端末は口が何もしない）。
// Hud の出来事: PAUSE（一時停止）でループの束を 0 へ・RESUME で戻す・SHUTDOWN（任務の終わり・やり直し・任務をやめる）で 5 本を止め、付けた口を外す
// （Hud のシーンは任務ごとに使い回される＝口を残すと前の任務の物が動く）。口は起動時に作った関数と自分を渡す（閉包を作らない）。
// 画面の枠組みの型は使わない（出来事の口は構造の型・名前は下の 3 つ＝Phaser.Scenes.Events の PAUSE・RESUME・SHUTDOWN と同じ文字。tests/sfx-mission が node_modules の定義と突き合わせる）。
// S4: 状態の合図（core/sfx-cues の stepSfxCues。発見の警報・魚雷の発射・被弾・鐘など）を同じ update で決め、自分の cue（合図の口）から systems/sfx-bus の sfxCue へ。
// v0.7.2 S1（spec-v0720 §4.2・brief L13）: 作る時に曲の場面 MISSION を頼み（S1 は任務の曲がまだ無い＝メニューの曲が 1.2 秒で消えるだけ。S2 で 3 層）、PAUSE・RESUME で曲の束も 0 へ／戻し、
// SHUTDOWN で「今も任務なら」外す（Phaser 3.90 は Hud の SHUTDOWN を Result・Title の create の後に回す＝先に頼まれたメニューの曲を消さない）。
// v0.7.2 S2（spec-v0720 §5・brief L19）: 同じ update で任務の曲の段（core/sfx-music-mood の stepSfxMood。HUD が出している状態だけ）を決めて sfxMusicMood へ（3 層の音量を書くのは
// 曲の再生＝変わった時だけ）。
import type { BoatTelemetry } from '../core/boat-telemetry';
import type { SfxKey } from '../config/sfx-config';
import { MUSIC_CTX_MISSION } from '../config/sfx-music-config';
import { createSfxCueState, stepSfxCues, type SfxCueSink } from '../core/sfx-cues';
import { createSfxLoopState, createSfxLoopTargets, stepSfxLoops, type SfxLoopState } from '../core/sfx-loops';
import { createSfxMoodState, stepSfxMood } from '../core/sfx-music-mood';
import { ktToMps } from '../core/units';
import { sfxCue, sfxLoops, sfxLoopsPaused, sfxLoopsStop, sfxMusic, sfxMusicMood, sfxMusicPaused, sfxMusicRelease } from './sfx-bus';

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

export class MissionSfx implements SfxCueSink {
  private readonly loopState: SfxLoopState;
  private readonly loopTargets = createSfxLoopTargets();
  private readonly cueState = createSfxCueState();
  /** 任務の曲の段の覚え（scripts/headless/sfx-probe が level を読む） */
  private readonly moodState = createSfxMoodState();

  /** events は Hud の scene.events、speedMaxKt は任務の艇の最大速力（data/boats.json の speed_max_kt。エンジンの音の高さの割合に使う） */
  constructor(private readonly events: SfxSceneEvents, speedMaxKt: number) {
    this.loopState = createSfxLoopState(ktToMps(speedMaxKt));
    events.on(SFX_SCENE_EV_PAUSE, this.onPause, this);
    events.on(SFX_SCENE_EV_RESUME, this.onResume, this);
    events.once(SFX_SCENE_EV_SHUTDOWN, this.onShutdown, this);
    sfxMusic(MUSIC_CTX_MISSION);
  }

  /** 毎フレーム（HudScene.update。deltaMs はそのフレームの ms）: 状態の合図を鳴らし、ループの目標を決めて渡し、任務の曲の段を渡す */
  update(t: BoatTelemetry, deltaMs: number): void {
    const dtS = deltaMs / MS_PER_S;
    stepSfxCues(this.cueState, t, dtS, this);
    stepSfxLoops(this.loopState, t, dtS, this.loopTargets);
    sfxLoops(this.loopTargets, dtS);
    sfxMusicMood(stepSfxMood(this.moodState, t, dtS));
  }

  /** 合図の口（core/sfx-cues が呼ぶ） */
  cue(key: SfxKey, gain: number, rate: number, delayS: number): void {
    sfxCue(key, gain, delayS, rate);
  }

  private onPause(): void {
    sfxLoopsPaused(true);
    sfxMusicPaused(true);
  }

  private onResume(): void {
    sfxLoopsPaused(false);
    sfxMusicPaused(false);
  }

  private onShutdown(): void {
    this.events.off(SFX_SCENE_EV_PAUSE, this.onPause, this);
    this.events.off(SFX_SCENE_EV_RESUME, this.onResume, this);
    sfxLoopsStop();
    sfxMusicRelease(MUSIC_CTX_MISSION);
  }
}
