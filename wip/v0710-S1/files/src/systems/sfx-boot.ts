// v0.7.1 S1（アートと音②：合成の効果音。spec-v0710 §7・§14 L1〜L5）: 音の起動。Boot の create から 1 回だけ呼ぶ。音の層で DOM に触るのはこのファイルだけ。
// - context: Phaser が既に作っている game.sound.context を使う（D3。自前の context は作らない）。無い端末（WebAudio なし・NOAUDIO）はエンジンを登録しない＝音の口は全部何もしない。
// - 標本: 作り方のある鍵を assets/sfx-bank で合成し（22,050 Hz・モノ）、再生の buffer に写す（L5: context の速さへは再生時に補われる）。写したら Float32Array は捨てる。
//   どこかで投げたら（古い端末で buffer が作れない＝R7）エンジンごとやめる（ゲームは音なしで動く）。
// - 時計（D4）: 毎フレームの PRE_STEP の delta を積んでゲームの時計にする（ヘッドレスの偽の時計でも進む）。同じ所で context の見張り（L3c。実時間は performance.now()）。
// - iOS（L1〜L3）: Audio Session は ambient（本体の消音スイッチに従う・ほかのアプリの音楽を止めない。無い端末は何もしない）。unlock は Phaser（body の touchend）に任せ、
//   保険に window の capture の touchend・pointerup と pageshow を付けたままにして、context が動いていなければ resume（拒否は握る。着信・Siri・長い裏の後）。
//   context の作り直しは入れない（L3。実機で「戻らない」が出たら次の段）。
// §7: 毎フレームの口（onPreStep）と保険の口（onGesture）は確保しない（起動時に作った関数をそのまま渡す）。
import Phaser from 'phaser';
import { renderSfx, sfxImplementedKeys } from '../assets/sfx-bank';
import { DEBUG_ENABLED } from '../config/game-config';
import { SFX_AUDIO_SESSION_TYPE } from '../config/sfx-config';
import { registerSfxEngine } from './sfx-bus';
import type { SfxCtx } from './sfx-audio-types';
import { SfxEngine } from './sfx-engine';
import { soundEnabled } from './sfx-settings';

const MS_PER_S = 1000;
let engine: SfxEngine | null = null;

function onPreStep(_time: number, deltaMs: number): void {
  if (engine !== null) engine.tick(deltaMs / MS_PER_S, performance.now());
}

function onGesture(): void {
  if (engine !== null) engine.kick();
}

/** 音のエンジンを作って登録する（Boot の create から 1 回。2 回目からは何もしない。作れなければ音なしで続ける） */
export function createSfx(game: Phaser.Game): void {
  if (engine !== null || !('context' in game.sound) || !game.sound.context) return;
  try {
    const e = new SfxEngine(game.sound.context as unknown as SfxCtx);
    for (const key of sfxImplementedKeys()) e.setBuffer(key, renderSfx(key));
    e.setMuted(!soundEnabled());
    engine = e;
  } catch (err) {
    console.warn(`音のエンジンを作れない（音なしで続ける）: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  registerSfxEngine(engine);
  try {
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) nav.audioSession.type = SFX_AUDIO_SESSION_TYPE;
  } catch {
    // 種類を選べない端末は標準のまま（Web Audio だけのページは ambient）
  }
  game.events.on(Phaser.Core.Events.PRE_STEP, onPreStep);
  const opts = { capture: true, passive: true } as const;
  window.addEventListener('touchend', onGesture, opts);
  window.addEventListener('pointerup', onGesture, opts);
  window.addEventListener('pageshow', onGesture);
  // ?debug の時だけ、ヘッドレスの確かめ（scripts/headless/sfx-live）のためにエンジンを公開する（main.ts の __game と同じ作法）
  if (DEBUG_ENABLED) (window as unknown as { __sfx?: SfxEngine }).__sfx = engine;
}
