// v0.7.2 S1（アートと音③：BGM と命中スローの音。spec-v0720 §1・§4・§10・§13・brief L6〜L14）: 曲の再生。エンジン（systems/sfx-engine）が 1 つ持つ。
// つなぎ: 音源の組（systems/sfx-music-slots。音量の節 9 本）→ 曲の束（一時停止で 0）→ 下げる音量（S2 の ducking＝systems/sfx-music-duck）→ ベッドの濾波器（S3。ループの束と同じ 1 つ＝
//   systems/sfx-slowmo）→ master（単発のリミッタは通さない＝D6）。
// 場面（D8・L13）: request(ctx, delayS)＝Title・Result は MENU（Result は鐘の後 delayS 秒）・MissionSfx は MISSION・曲の試聴の場は LAB・効果音の試聴の場は NONE。同じ場面の頼み直しは
//   何もしない（Title ⇄ Briefing・遅らせの途中の MENU は予定どおり）。release(ctx) は今の場面が ctx の時だけ外す（Phaser 3.90 は Hud の SHUTDOWN を次のシーンの create の後に回す）。
//   場面が替われば一時停止は解き、段は静かに戻し、試聴の場を出れば候補の標本を捨てる（ゲームの列の曲は残す）。
// 組: 場面の曲（MENU は既定のタイトルの曲・LAB は押した候補・MISSION は任務の家族の 3 層＝S2）を、標本がそろってから同じ when で始める（家族は 3 層とも）。
// 決め（L10・L11）: 音源を作り予約を積むのは context が running の時だけ（止まっている間は覚えるだけ）。動き出した時・標本ができた時・遅らせが過ぎた時は 10 Hz の決めで今の場面の曲を
//   始める（その場面がまだ頼んでいれば。最初の音・遅れて始める時は MUSIC_FADE.firstInS・任務は missionInS で上げる）。Phaser の blur の suspend・resume では何もしない（続きから鳴る）。
// 消音（L12）: 「音: オフ」は muteStopS で 0 にして止め、「音: オン」で頭から。「曲: オフ」は musicOffS で 0 にして止め、「曲: オン」で頭から（2 つは別。保存も別＝sfx-settings）。
// 作る（D4・L6〜L9）: systems/sfx-music-build（効果音の列の後に 1 フレームに決まった量。順は 今の場面の曲〔家族はまだ無い層の最初〕→ ゲームの列）。標本が無い曲は鳴らさないだけ。
// S2（brief L19・L24）: 任務の段（setMood。core/sfx-music-mood が決める）は、家族の組が鳴っている時に変わった時だけ 3 層の音量を書く。一時停止を context が止まっている間に頼まれた
//   （裏から戻る）時・止まっていた context が一時停止のまま動き出した時は、動き出した最初のフレームで束を今すぐ 0 にする（S1 は次の 10 Hz に時定数で絞った＝一時停止の画面で任務の曲が
//   0.1〜0.25 秒聞こえた）。
// §7: 毎フレームの口（update・step*）は確保しない。確保は起動時の constructor だけ。値は読み返さない（L6）。
import {
  MUSIC_CTX_LAB, MUSIC_CTX_MENU, MUSIC_CTX_MISSION, MUSIC_CTX_NONE, MUSIC_FADE, MUSIC_KEYS, MUSIC_LAYER_KEYS, MUSIC_MOOD_QUIET, MUSIC_PLAYER, type MusicKey,
} from '../config/sfx-music-config';
import { MUSIC_TITLE_DEFAULT_ID } from '../assets/sfx-music-themes';
import type { SfxCtx, SfxGainNode, SfxNode } from './sfx-audio-types';
import { SfxMusicBuild } from './sfx-music-build';
import { SfxMusicSlots } from './sfx-music-slots';

const RUNNING = 'running';
const NONE = -1;
const TICK_S = 1 / MUSIC_PLAYER.updateHz;
const TC = MUSIC_PLAYER.fadeTc;
const DEFAULT_KEY = MUSIC_KEYS.indexOf(MUSIC_TITLE_DEFAULT_ID);
/** 任務の家族の頭の鍵（L0。3 層は MUSIC_KEYS で L0・L1・L2 の順に並ぶ＝tests/sfx-music-inventory）と層の数 */
const FAMILY_KEY = MUSIC_KEYS.indexOf(MUSIC_LAYER_KEYS[0]!);
const FAMILY_N = MUSIC_LAYER_KEYS.length;

/** scripts/headless・tests の確かめ用の数 */
export interface SfxMusicStats {
  want: number; ctx: number; key: MusicKey | null; sources: number; live: number; starts: number; stops: number; writes: number; mood: number; shownMood: number;
  paused: boolean; enabled: boolean; muted: boolean; buffers: number; resident: number; building: MusicKey | null; progress: number; builds: number; abandoned: number;
  buildCalls: number; buildMsMedian: number; buildMsP95: number; buildMsMax: number; work: boolean; tables: boolean; failed: boolean;
}

export class SfxMusicPlayer {
  /** 曲の束（一時停止で 0）と下げる音量（S2 の ducking）。tests の偽の context が辿る */
  readonly bus: SfxGainNode;
  readonly duck: SfxGainNode;
  /** 曲を作る列（標本 buffers はここ）と音源の組 */
  readonly build: SfxMusicBuild;
  readonly slots: SfxMusicSlots;
  private want = MUSIC_CTX_NONE;
  /** 今の場面の曲を始めてよい再生の時計（Result の遅らせ。鐘の 2 打目と同じ時計＝ゲームの時計ではない） */
  private wantAtS = 0;
  private labKey = NONE;
  private enabled = true;
  private muted = false;
  private paused = false;
  private busDown = false;
  private started = false;
  private accS = 0;
  /** 任務の段（MUSIC_MOOD_*）・束を今すぐ 0 にする（L24）・前のフレームに context が動いていたか */
  private mood = MUSIC_MOOD_QUIET;
  private hardPause = false;
  private wasRun = false;
  /** 確かめ用: 曲の束へ書いた回数（組の分は slots） */
  private busWrites = 0;

  /** out は曲の行き先（S3 からベッドの濾波器 → master。リミッタは通さない）。wall は実時間の ms（作る時間の記録だけ。tests は 0 を返す物） */
  constructor(private readonly ctx: SfxCtx, out: SfxNode, wall: () => number) {
    this.build = new SfxMusicBuild(ctx, wall);
    this.duck = ctx.createGain();
    this.duck.connect(out);
    this.bus = ctx.createGain();
    this.bus.connect(this.duck);
    this.slots = new SfxMusicSlots(ctx, this.bus);
  }

  /** 確かめ用の数: 作った音源・止めた音源・ノードへ書いた回数（束と組の和） */
  get starts(): number {
    return this.slots.starts;
  }
  get stops(): number {
    return this.slots.stops;
  }
  get writes(): number {
    return this.busWrites + this.slots.writes;
  }

  /** 場面を頼む（delayS は Result の鐘の後の遅らせ）。同じ場面なら何もしない */
  request(ctx: number, delayS = 0): void {
    if (ctx === this.want) return;
    if (this.want === MUSIC_CTX_LAB) {
      this.labKey = NONE;
      this.build.dropLab();
    }
    this.want = ctx;
    this.wantAtS = this.ctx.currentTime + (delayS > 0 ? delayS : 0);
    this.paused = false;
    this.mood = MUSIC_MOOD_QUIET;
    this.build.wake();
    this.stepGroups();
  }

  /** 場面を外す（今の場面が ctx の時だけ。MissionSfx の SHUTDOWN） */
  release(ctx: number): void {
    if (ctx === this.want) this.request(MUSIC_CTX_NONE);
  }

  /** 一時停止（MissionSfx の PAUSE・RESUME）: 曲の束を pauseS で 0 へ／戻す（音源は止めない） */
  setPaused(v: boolean): void {
    if (v === this.paused) return;
    this.paused = v;
    if (v && this.ctx.state !== RUNNING) this.hardPause = true; // 裏へ回った: 動き出した最初のフレームで束を今すぐ 0（L24）
    this.stepGroups();
  }

  /** 任務の段（MissionSfx から毎フレーム・曲の試聴の場）: 変わった時だけ決める（家族の組が鳴っていれば 3 層の音量を書く） */
  setMood(level: number): void {
    if (level === this.mood) return;
    this.mood = level;
    this.stepGroups();
  }

  /** 「曲: オン／オフ」（保存は systems/sfx-settings） */
  setEnabled(v: boolean): void {
    if (v === this.enabled) return;
    this.enabled = v;
    this.stepGroups();
  }

  /** 「音: オン／オフ」（エンジンの setMuted から。master は 0 になる） */
  setMuted(v: boolean): void {
    if (v === this.muted) return;
    this.muted = v;
    this.stepGroups();
  }

  /** 曲の試聴の場（LAB の間だけ効く）: 鳴らす候補（null で止める。任務の家族は L0 の鍵）。作っていなければ作り始め、できたらそのまま鳴らす（L14） */
  audition(key: MusicKey | null): void {
    const k = key === null ? NONE : MUSIC_KEYS.indexOf(key);
    if (k === this.labKey) return;
    this.labKey = k;
    this.build.wake();
    this.stepGroups();
  }

  /** 効果音の列が終わった（systems/sfx-boot が 1 回）: 次のフレームから曲を作る */
  allowBuild(): void {
    this.build.allow();
  }

  /** 鳴らしている（始めた）曲（試聴の場の文。家族は L0 の鍵。作っている曲と進みは build） */
  get playingKey(): MusicKey | null {
    return this.slots.key === NONE ? null : MUSIC_KEYS[this.slots.key]!;
  }

  /** 毎フレーム（エンジンの tick から）: 作る仕事（1 フレームに決まった量）と、10 Hz の決め（一時停止のまま動き出したフレームは待たずに） */
  update(dtS: number): void {
    this.build.step(this.buildKey());
    const run = this.ctx.state === RUNNING;
    if (run && !this.wasRun && this.paused) this.hardPause = true; // 一時停止のまま動き出した（L24）
    this.wasRun = run;
    if (run && (this.hardPause || this.paused !== this.busDown)) this.stepGroups();
    this.accS += dtS;
    if (this.accS < TICK_S) return;
    this.accS = this.accS < 2 * TICK_S ? this.accS - TICK_S : 0; // 余りは次へ（長いフレームの後にまとめて決めない）
    this.stepGroups();
  }

  /** 確かめ用の数（scripts/headless・tests。毎フレームは呼ばない） */
  stats(): SfxMusicStats {
    const b = this.build;
    const sl = this.slots;
    const t = b.timing();
    return {
      want: this.want, ctx: sl.scene, key: this.playingKey, sources: sl.n, live: sl.live(this.ctx.currentTime), starts: sl.starts, stops: sl.stops, writes: this.writes, mood: this.mood,
      shownMood: sl.mood, paused: this.paused, enabled: this.enabled, muted: this.muted, buffers: b.buffers.filter((x) => x !== null).length, resident: b.resident,
      building: b.key, progress: b.progress, builds: b.builds, abandoned: b.abandoned, buildCalls: b.calls,
      buildMsMedian: t.median, buildMsP95: t.p95, buildMsMax: b.msMax, work: b.hasWork, tables: b.hasTables, failed: b.failed,
    };
  }

  /** 今の場面の曲の鍵（MENU は既定のタイトルの曲・LAB は押した候補・MISSION は任務の家族の頭 L0） */
  private wantKey(): number {
    return this.want === MUSIC_CTX_MENU ? DEFAULT_KEY : this.want === MUSIC_CTX_LAB ? this.labKey : this.want === MUSIC_CTX_MISSION ? FAMILY_KEY : NONE;
  }

  /** 先に作る鍵（今の場面の曲。家族はまだ無い層の最初） */
  private buildKey(): number {
    const k = this.wantKey();
    if (k === FAMILY_KEY) for (let i = 0; i < FAMILY_N; i++) if (this.build.buffers[k + i] === null) return k + i;
    return k;
  }

  /** 鍵 k の組の層の数（家族は 3・ほかは 1） */
  private layersOf(k: number): number {
    return k === FAMILY_KEY ? FAMILY_N : 1;
  }

  /** 鍵 k の組の標本がそろっている */
  private ready(k: number): boolean {
    for (let i = this.layersOf(k) - 1; i >= 0; i--) if (this.build.buffers[k + i] === null) return false;
    return true;
  }

  /** 決め（10 Hz と、頼み・消音・一時停止・曲のオン／オフ・段の時）: 止まっている context には書かない（L11）。今の組と欲しい組が違う時・段が変わった時だけ書く */
  private stepGroups(): void {
    if (this.ctx.state !== RUNNING) return;
    const now = this.ctx.currentTime;
    const sl = this.slots;
    if (this.paused !== this.busDown || this.hardPause) this.stepBus(now);
    const k = this.muted || !this.enabled || now < this.wantAtS ? NONE : this.wantKey();
    // 試聴の場で別の候補を押した: その候補ができるまで今の候補を鳴らしておき、できたら 0.5 秒で重ねる（ほかの場面は待たずに下げる）
    const keep = k !== NONE && !this.ready(k) && this.want === MUSIC_CTX_LAB && sl.scene === MUSIC_CTX_LAB;
    if (sl.n > 0 && !keep && (sl.key !== k || sl.scene !== this.want)) sl.stepStop(now, this.fadeOutS());
    if (sl.n === 0 && k !== NONE && this.ready(k)) this.stepStart(now, k);
    else if (sl.n === FAMILY_N && sl.key === FAMILY_KEY && sl.mood !== this.mood) sl.stepMood(now, this.mood);
  }

  /** 止める時の秒: 消音・曲オフ・場面ごと（メニュー 1.2 秒・任務 0.5 秒・試聴の場 0.5 秒の重ね） */
  private fadeOutS(): number {
    if (this.muted) return MUSIC_FADE.muteStopS;
    if (!this.enabled) return MUSIC_FADE.musicOffS;
    const sc = this.slots.scene;
    return sc === MUSIC_CTX_MENU ? MUSIC_FADE.menuOutS : sc === MUSIC_CTX_LAB ? MUSIC_FADE.labCrossS : MUSIC_FADE.missionOutS;
  }

  /** 曲の束（一時停止）を 0 へ／戻す。場面が替わって解けた時は、古い組を先に音量 0 で止める（束が 0 の間なので聞こえない＝戻した束に古い曲の尾を出さない） */
  private stepBus(now: number): void {
    const sl = this.slots;
    if (!this.paused && sl.n > 0 && sl.scene !== this.want) sl.stepStop(now, 0);
    const g = this.bus.gain;
    g.cancelScheduledValues(now);
    if (this.paused && this.hardPause) g.setValueAtTime(0, now);
    else g.setTargetAtTime(this.paused ? 0 : 1, now, MUSIC_FADE.pauseS * TC);
    this.busDown = this.paused;
    this.hardPause = false;
    this.busWrites++;
  }

  /** 組を始める: 上げる秒（試聴の場 0.5 秒の重ね・任務 3 秒・最初の音と遅れて始める時 2 秒・メニュー 2 秒）を決めて音源の組へ */
  private stepStart(now: number, k: number): void {
    const late = !this.started || now - this.wantAtS > 2 * TICK_S; // 最初の音・遅れて始める（標本がまだだった・動き出した・音／曲をオンにした）
    const w = this.want;
    const inS = w === MUSIC_CTX_LAB ? MUSIC_FADE.labCrossS : w === MUSIC_CTX_MISSION ? MUSIC_FADE.missionInS : late ? MUSIC_FADE.firstInS : MUSIC_FADE.menuInS;
    if (this.slots.stepStart(now, k, this.layersOf(k), w, this.mood, inS, this.build.buffers)) this.started = true;
  }
}
