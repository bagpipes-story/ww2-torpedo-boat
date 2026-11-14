// v0.7.1 S1（アートと音②：合成の効果音。spec-v0710 §2・§3・D2・R14）: ゲームに 1 つの音のエンジン（systems/sfx-engine）への口。呼ぶのは絵の層の口（fx-bus・explosion-fx・
// sink-fx）・UI（ui/menu-ui）・シーン（Title・Pause・Result・Hud）だけ（tests/sfx-rules の import の許可表＝論理から音へ届く道が無い）。fx-bus の火花の口と同じ作り（R12）:
// エンジンは systems/sfx-boot が Boot で 1 回登録する（再生の context が無い端末・NOAUDIO は登録なし＝どの口も何もしない）。聞き手（自艇の位置。読むだけ）は world-art が
// 世界の作成時に登録し、破棄で null に（世界の作成前・破棄後の位置つきの音は鳴らさない。エンジンは世界の物を握らない）。
// §7: どの口も確保しない（引数は数と鍵だけ。結果は返さない）。DOM にも Phaser にも触らない。
// 段: S1 は sfxUi・sfxAt・sfxSetMuted と聞き手。S2 で大砲の口 sfxGunAt（距離の帯で近い音／遠雷）と sfxAt の最小間隔。S3 でループの口 sfxLoops・sfxLoopsPaused・sfxLoopsStop
// （systems/sfx-mission だけが呼ぶ。計画の sfxLoop(id, gain, rate) は 5 本の目標をまとめて渡す形にした）。S4 で sfxCue の遅らせ（再生の時計で予約）。
// IP2: 試聴の場（?sfxlab）の口 sfxSetBuffer・sfxCanPlay（scenes/sound-lab-scene だけが呼ぶ。ゲームの中では呼ばない）。
// v0.7.2 S1: 曲の口 sfxMusic・sfxMusicRelease・sfxMusicPaused・sfxMusicEnabled（場面・任務の終わり・一時停止・「曲」ボタン）と、曲の試聴の場の口 sfxMusicAudition・sfxMusicLab*
// （scenes/music-lab-scene だけ）。決めと音源は systems/sfx-music-player（止まっている context・消音・曲オフ・標本なしでは音源を作らない）。
// v0.7.2 S2: 任務の段の口 sfxMusicMood（MissionSfx が core/sfx-music-mood の段を毎フレーム。曲の試聴の場も）。
// v0.7.2 S3（brief L28・L31）: 命中スローの読み口 registerSfxSlowMo（world-art が世界の作成で世界・破棄で null＝聞き手と同じ形。読むのは slowMoLeftS だけ）。sfxLoops がフレームに 1 回読んで
// エンジンの命中スローの音へ渡し（書くのは変わった時だけ）、ループの目標の rate に案の倍率を掛ける。sfxLoopsStop とメニュー・試聴の場の sfxMusic で戻す。試聴の場の案の口 sfxSlowVariant。
import { SFX_RESULT_BELL, type SfxKey } from '../config/sfx-config';
import { MUSIC_CTX_LAB, MUSIC_CTX_MENU, type MusicKey, type SfxSlowId } from '../config/sfx-music-config';
import type { SfxLoopTargets } from '../core/sfx-loops';
import { sfxBand, sfxGunKey } from '../core/sfx-mix';
import type { SfxEngine } from './sfx-engine';
import { applySfxSlowRate } from './sfx-slowmo';

/** 聞き手の位置（世界の m。core の BoatState が満たす。読むだけ） */
export interface SfxListenerPos {
  readonly x: number;
  readonly y: number;
}

/** 命中スローの残り秒（v0.7.2 S3。MissionWorld がそのまま満たす。読むだけ） */
export interface SfxSlowMoSource {
  readonly slowMoLeftS: number;
}

let engine: SfxEngine | null = null;
let listener: SfxListenerPos | null = null;
let slowMo: SfxSlowMoSource | null = null;

/** Boot で 1 回（systems/sfx-boot）。null で外す（tests） */
export function registerSfxEngine(e: SfxEngine | null): void {
  engine = e;
}

/** 聞き手（世界の作成時に自艇の状態・破棄で null。world-art） */
export function registerSfxListener(pos: SfxListenerPos | null): void {
  listener = pos;
}

/** 命中スローの読み口（v0.7.2 S3。世界の作成時に世界・破棄で null＝world-art。曲の試聴の場の台本も） */
export function registerSfxSlowMo(src: SfxSlowMoSource | null): void {
  slowMo = src;
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

/**
 * ループ 5 本の目標（core/sfx-loops が書いた音量・速さ）を渡す（任務の間、毎フレーム。dtS はそのフレームの秒）。ノードへ書くのは 10 Hz・変わった時だけ（systems/sfx-loop-player）。
 * v0.7.2 S3: 命中スローをここで 1 回読み（変わった時だけ書く）、目標の rate に案の倍率を掛けてから（目標そのものは書き換えない）
 */
export function sfxLoops(targets: SfxLoopTargets, dtS: number): void {
  if (engine === null) return;
  const s = slowMo;
  engine.slow.update(s !== null && s.slowMoLeftS > 0);
  engine.loops.update(applySfxSlowRate(targets, engine.slow.loopFactor, engine.slow.targets), dtS, engine.muted);
}

/** 一時停止でループの束を 0 へ・再開で戻す（Hud の PAUSE・RESUME） */
export function sfxLoopsPaused(v: boolean): void {
  if (engine !== null) engine.loops.setPaused(v);
}

/** ループを止める（Hud の SHUTDOWN＝任務の終わり・やり直し・任務をやめる）。v0.7.2 S3: 命中スローの濾波器と rate も戻す（スローの途中で終わっても） */
export function sfxLoopsStop(): void {
  if (engine === null) return;
  engine.loops.stop();
  engine.slow.reset();
}

/** 消音（Title・一時停止の「音」ボタン、起動時の保存の値）。解く時は止まっている context を起こす */
export function sfxSetMuted(v: boolean): void {
  if (engine !== null) engine.setMuted(v);
}

/** 試聴の場（IP2。?sfxlab の scenes/sound-lab-scene）: 鍵の標本を差し替える（案を鳴らす前と、場を出る時に既定へ戻す）。エンジンが無ければ何もしない */
export function sfxSetBuffer(key: SfxKey, samples: Float32Array): void {
  if (engine !== null) engine.setBuffer(key, samples);
}

/** 試聴の場: 今鳴らせるか（エンジンがあり、context が動いていて、消音でない）。最初のタップで context が動き出すのを待つ。エンジンが無ければ null */
export function sfxCanPlay(): boolean | null {
  return engine === null ? null : engine.running && !engine.muted;
}

/**
 * 曲の場面を頼む（v0.7.2 S1。D8）: Title・Result は MUSIC_CTX_MENU（Result は鐘の後 delayS 秒）・MissionSfx は MUSIC_CTX_MISSION・曲の試聴の場は MUSIC_CTX_LAB・効果音の試聴の場は
 * MUSIC_CTX_NONE。同じ場面の頼み直しは何もしない（Briefing は頼まない＝Title の曲が続く）。場面が替われば一時停止は解く
 */
export function sfxMusic(ctx: number, delayS = 0): void {
  if (engine === null) return;
  if (ctx === MUSIC_CTX_MENU || ctx === MUSIC_CTX_LAB) engine.slow.reset(); // v0.7.2 S3: メニュー・試聴の場の曲はこもらせない（濾波器と rate を戻してから頼む）
  engine.music.request(ctx, delayS);
}

/** 任務の終わり（MissionSfx の SHUTDOWN）: 今の場面が ctx の時だけ外す（Phaser 3.90 は Hud の SHUTDOWN を Result・Title の create の後に回す＝先に頼んだメニューの曲を消さない） */
export function sfxMusicRelease(ctx: number): void {
  if (engine !== null) engine.music.release(ctx);
}

/** 任務の段（v0.7.2 S2。MUSIC_MOOD_*。MissionSfx が毎フレーム・曲の試聴の場）: 変わった時だけ、鳴っている家族の 3 層の音量を書く */
export function sfxMusicMood(level: number): void {
  if (engine !== null) engine.music.setMood(level);
}

/** 一時停止で曲の束を 0 へ・再開で戻す（Hud の PAUSE・RESUME。音源は止めない） */
export function sfxMusicPaused(v: boolean): void {
  if (engine !== null) engine.music.setPaused(v);
}

/** 「曲: オン／オフ」（systems/sfx-settings・起動時の保存の値・試聴の場）。オフは 0.3 秒で 0 にして止め、オンで頭から */
export function sfxMusicEnabled(v: boolean): void {
  if (engine !== null) engine.music.setEnabled(v);
}

/** 曲の試聴の場: 鳴らす候補（null で止める）。まだ作っていなければ作り始め、できたらそのまま鳴らす */
export function sfxMusicAudition(key: MusicKey | null): void {
  if (engine !== null) engine.music.audition(key);
}

/** 曲の試聴の場（v0.7.2 S3・L31）: 命中スローの案（スローの最中なら新しい案で書き直す）。場を出る時に既定の SFX_SLOW_DEFAULT_ID へ戻す */
export function sfxSlowVariant(id: SfxSlowId): void {
  if (engine !== null) engine.slow.setVariant(id);
}

/** 曲の試聴の場の文: 鳴らしている曲・作っている曲（無ければ null）と進み（0〜1） */
export function sfxMusicLabPlaying(): MusicKey | null {
  return engine === null ? null : engine.music.playingKey;
}
export function sfxMusicLabBuilding(): MusicKey | null {
  return engine === null ? null : engine.music.build.key;
}
export function sfxMusicLabProgress(): number {
  return engine === null ? 0 : engine.music.build.progress;
}
