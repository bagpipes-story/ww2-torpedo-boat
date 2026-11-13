// v0.7.1 S1（アートと音②：合成の効果音。spec-v0710 §2・§3・D2・R14）: ゲームに 1 つの音のエンジン（systems/sfx-engine）への口。呼ぶのは絵の層の口（fx-bus・explosion-fx・
// sink-fx）・UI（ui/menu-ui）・シーン（Title・Pause・Result・Hud）だけ（tests/sfx-rules の import の許可表＝論理から音へ届く道が無い）。fx-bus の火花の口と同じ作り（R12）:
// エンジンは systems/sfx-boot が Boot で 1 回登録する（再生の context が無い端末・NOAUDIO は登録なし＝どの口も何もしない）。聞き手（自艇の位置。読むだけ）は world-art が
// 世界の作成時に登録し、破棄で null に（世界の作成前・破棄後の位置つきの音は鳴らさない。エンジンは世界の物を握らない）。
// §7: どの口も確保しない（引数は数と鍵だけ。結果は返さない）。DOM にも Phaser にも触らない。
// 段: S1 は sfxUi・sfxAt・sfxSetMuted と聞き手。S2 で大砲の口 sfxGunAt（距離の帯で近い音／遠雷）と sfxAt の最小間隔。S3 でループの口 sfxLoops・sfxLoopsPaused・sfxLoopsStop
// （systems/sfx-mission だけが呼ぶ。計画の sfxLoop(id, gain, rate) は 5 本の目標をまとめて渡す形にした）。S4 で sfxCue の遅らせ（再生の時計で予約）。
import { SFX_RESULT_BELL, type SfxKey } from '../config/sfx-config';
import type { SfxLoopTargets } from '../core/sfx-loops';
import { sfxBand, sfxGunKey } from '../core/sfx-mix';
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

/**
 * 位置つきの衝撃音（x・y は世界の m。聞き手からの距離の帯で音量、左右でパン。gain は音量の倍率・rate は速さ。聞き手のいない間は鳴らさない）。
 * minIntervalS はこの 1 発だけの最小間隔（同じ鍵が鳴ってからこの秒の内は鳴らさない＝沈没の 2 次の爆発）
 */
export function sfxAt(key: SfxKey, x: number, y: number, gain = 1, rate = 1, minIntervalS = 0): void {
  const l = listener;
  if (engine === null || l === null) return;
  engine.playAt(key, x - l.x, y - l.y, rate, gain, minIntervalS);
}

/** 大砲の発砲音（駆逐艦・沿岸砲・卯月）: 聞き手からの距離の帯で、近ければ gun_near・遠ければこもった遠雷 gun_far（距離が音色で分かる。spec §6.2） */
export function sfxGunAt(x: number, y: number): void {
  const l = listener;
  if (engine === null || l === null) return;
  const dx = x - l.x;
  const dy = y - l.y;
  engine.playAt(sfxGunKey(sfxBand(dx * dx + dy * dy)), dx, dy, 1, 1);
}

/** 状態の合図（位置なし。gain は音量の倍率・rate は速さ）。delayS > 0 は再生の時計でその秒の後に鳴らす予約（S4。Result の 2 打目・座礁の擦れる音） */
export function sfxCue(key: SfxKey, gain = 1, delayS = 0, rate = 1): void {
  if (engine !== null) engine.playFlat(key, rate, gain, delayS);
}

/** Result の鐘（S4。spec §3.3・U-C。Result の create から 1 回）: 帰投なら 2 打（0.5 秒ずらす予約）、それ以外は低い 1 打（曲ではなく合図） */
export function sfxResultBell(returned: boolean): void {
  if (engine === null) return;
  const b = SFX_RESULT_BELL;
  if (!returned) engine.playFlat('bell', b.lostRate, 1);
  else for (let i = 0; i < b.strikes; i++) engine.playFlat('bell', 1, 1, i * b.gapS);
}

/** ループ 5 本の目標（core/sfx-loops が書いた音量・速さ）を渡す（任務の間、毎フレーム。dtS はそのフレームの秒）。ノードへ書くのは 10 Hz・変わった時だけ（systems/sfx-loop-player） */
export function sfxLoops(targets: SfxLoopTargets, dtS: number): void {
  if (engine !== null) engine.loops.update(targets, dtS, engine.muted);
}

/** 一時停止でループの束を 0 へ・再開で戻す（Hud の PAUSE・RESUME） */
export function sfxLoopsPaused(v: boolean): void {
  if (engine !== null) engine.loops.setPaused(v);
}

/** ループを止める（Hud の SHUTDOWN＝任務の終わり・やり直し・任務をやめる） */
export function sfxLoopsStop(): void {
  if (engine !== null) engine.loops.stop();
}

/** 消音（Title・一時停止の「音」ボタン、起動時の保存の値）。解く時は止まっている context を起こす */
export function sfxSetMuted(v: boolean): void {
  if (engine !== null) engine.setMuted(v);
}
