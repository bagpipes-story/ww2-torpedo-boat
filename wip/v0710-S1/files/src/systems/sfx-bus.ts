// v0.7.1 S1（アートと音②：合成の効果音。spec-v0710 §2・§3・D2・R14）: ゲームに 1 つの音のエンジン（systems/sfx-engine）への口。呼ぶのは絵の層の口（fx-bus・explosion-fx・
// sink-fx）・UI（ui/menu-ui）・シーン（Title・Pause・Result・Hud）だけ（tests/sfx-rules の import の許可表＝論理から音へ届く道が無い）。fx-bus の火花の口と同じ作り（R12）:
// エンジンは systems/sfx-boot が Boot で 1 回登録する（再生の context が無い端末・NOAUDIO は登録なし＝どの口も何もしない）。聞き手（自艇の位置。読むだけ）は world-art が
// 世界の作成時に登録し、破棄で null に（世界の作成前・破棄後の位置つきの音は鳴らさない。エンジンは世界の物を握らない）。
// §7: どの口も確保しない（引数は数と鍵だけ。結果は返さない）。DOM にも Phaser にも触らない。
// 段: S1 は sfxUi・sfxAt・sfxSetMuted と聞き手。sfxCue の遅らせ（S4）と sfxLoop（S3）はまだ何もしない。
import type { SfxKey } from '../config/sfx-config';
import type { SfxEngine } from './sfx-engine';

/** 聞き手の位置（世界の m。core の BoatState が満たす。読むだけ） */
export interface SfxListenerPos {
  readonly x: number;
  readonly y: number;
}

let engine: SfxEngine | null = null;
let listener: SfxListenerPos | null = null;

/** Boot で 1 回（systems/sfx-boot）。null で外す（tests） */
export function registerSfxEngine(e: SfxEngine | null): void {
  engine = e;
}

/** 聞き手（世界の作成時に自艇の状態・破棄で null。world-art） */
export function registerSfxListener(pos: SfxListenerPos | null): void {
  listener = pos;
}

/** UI の音（ボタン。位置なし・中央）。最初のタップは context が動き出してから鳴る（エンジンが 1 つだけ覚える） */
export function sfxUi(key: SfxKey): void {
  if (engine !== null) engine.playFlat(key, 1, 1);
}

/** 位置つきの衝撃音（x・y は世界の m。聞き手からの距離の帯で音量、左右でパン。gain は音量の倍率・rate は速さ。聞き手のいない間は鳴らさない） */
export function sfxAt(key: SfxKey, x: number, y: number, gain = 1, rate = 1): void {
  const l = listener;
  if (engine === null || l === null) return;
  engine.playAt(key, x - l.x, y - l.y, rate, gain);
}

/** 状態の合図（位置なし。gain は音量の倍率・rate は速さ）。遅らせて鳴らす（delayS > 0。Result の 2 打目）は S4 から＝今は鳴らさない */
export function sfxCue(key: SfxKey, gain = 1, delayS = 0, rate = 1): void {
  if (engine === null || delayS > 0) return;
  engine.playFlat(key, rate, gain);
}

/** ループの目標（音量・速さ）。S3 から（systems/sfx-mission）＝今は何もしない */
export function sfxLoop(_id: SfxKey, _gain: number, _rate: number): void {}

/** 消音（Title・一時停止の「音」ボタン、起動時の保存の値）。解く時は止まっている context を起こす */
export function sfxSetMuted(v: boolean): void {
  if (engine !== null) engine.setMuted(v);
}
