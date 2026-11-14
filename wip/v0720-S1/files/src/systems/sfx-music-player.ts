// v0.7.2 S1（アートと音③：BGM と命中スローの音。spec-v0720 §1・§4・§10・§13・brief L6〜L14）: 曲の再生。エンジン（systems/sfx-engine）が 1 つ持つ。
// つなぎ: 音量の節 MUSIC_PLAYER.slots 本（起動時に作って使い回す）→ 曲の束（一時停止で 0）→ 下げる音量（S2 の ducking。今は 1）→ master（単発のリミッタは通さない＝D6）。
// 場面（D8・L13）: request(ctx, delayS)＝Title・Result は MENU（Result は鐘の後 delayS 秒）・MissionSfx は MISSION・曲の試聴の場は LAB・効果音の試聴の場は NONE。同じ場面の頼み直しは
//   何もしない（Title ⇄ Briefing・遅らせの途中の MENU は予定どおり）。release(ctx) は今の場面が ctx の時だけ外す（Phaser 3.90 は Hud の SHUTDOWN を次のシーンの create の後に回す）。
//   場面が替われば一時停止は解き、試聴の場を出れば候補の標本を捨てる（ゲームの列の曲は残す）。
// 組: 場面の曲（MENU は既定のタイトルの曲・LAB は押した候補・MISSION は S1 では無し＝S2 で 3 層）の音源を同じ when で始め、buffer 全体を繰り返す。古い組は音量を時定数で 0 へ・
//   予約の stop(when)。止めかけの組がある時にまた移れば、その組の音量を 30 ms で 0 へ（stop は 1 音源 1 回だけ＝古い WebKit は 2 回目で投げる）。
// 決め（L10・L11）: 音源を作り予約を積むのは context が running の時だけ（止まっている間は覚えるだけ）。動き出した時・標本ができた時・遅らせが過ぎた時は 10 Hz の決めで今の場面の曲を
//   始める（その場面がまだ頼んでいれば。最初の音・遅れて始める時は MUSIC_FADE.firstInS で上げる）。Phaser の blur の suspend・resume では何もしない（繰り返す音源が続きから鳴る）。
// 消音（L12）: 「音: オフ」は muteStopS で 0 にして止め、「音: オン」で頭から。「曲: オフ」は musicOffS で 0 にして止め、「曲: オン」で頭から（2 つは別。保存も別＝sfx-settings）。
// 作る（D4・L6〜L9）: systems/sfx-music-build（効果音の列の後に 1 フレームに決まった量。順は 今の場面の曲 → ゲームの列）。標本が無い曲は鳴らさないだけ。
// §7: 毎フレームの口（update・step*）は確保しない。確保は起動時の constructor だけ（音源は組を始める時に作る使い捨て）。値は読み返さない（L6）。
import { MUSIC_CTX_LAB, MUSIC_CTX_MENU, MUSIC_CTX_NONE, MUSIC_FADE, MUSIC_GAIN, MUSIC_KEYS, MUSIC_PLAYER, type MusicKey } from '../config/sfx-music-config';
import { MUSIC_TITLE_DEFAULT_ID } from '../assets/sfx-music-themes';
import type { SfxCtx, SfxGainNode, SfxSource } from './sfx-audio-types';
import { SfxMusicBuild } from './sfx-music-build';

const RUNNING = 'running';
const NONE = -1;
const SLOTS = MUSIC_PLAYER.slots;
const TICK_S = 1 / MUSIC_PLAYER.updateHz;
const TC = MUSIC_PLAYER.fadeTc;
const DEFAULT_KEY = MUSIC_KEYS.indexOf(MUSIC_TITLE_DEFAULT_ID);

/** scripts/headless・tests の確かめ用の数 */
export interface SfxMusicStats {
  want: number; ctx: number; key: MusicKey | null; sources: number; live: number; starts: number; stops: number; writes: number;
  paused: boolean; enabled: boolean; muted: boolean; buffers: number; resident: number; building: MusicKey | null; progress: number; builds: number; abandoned: number;
  buildCalls: number; buildMsMedian: number; buildMsP95: number; buildMsMax: number; work: boolean; tables: boolean; failed: boolean;
}

export class SfxMusicPlayer {
  /** 曲の束（一時停止で 0）と下げる音量（S2。今は 1）。tests の偽の context が辿る */
  readonly bus: SfxGainNode;
  readonly duck: SfxGainNode;
  /** 曲を作る列（標本 buffers はここ） */
  readonly build: SfxMusicBuild;
  private readonly gains: SfxGainNode[] = [];
  private readonly srcs: (SfxSource | null)[] = [];
  /** 節ごとの音源が鳴り終わる再生の時計（鳴っている組の節は Infinity。過ぎていれば空き）と、急いで 0 にしたか */
  private readonly endAt = new Float64Array(SLOTS);
  private readonly hurried = new Uint8Array(SLOTS);
  /** 鳴っている組: 節の番号・層の数・最初の鍵の番号・場面 */
  private readonly cur = new Int8Array(MUSIC_PLAYER.layersMax);
  private curN = 0;
  private curKey = NONE;
  private curCtx = MUSIC_CTX_NONE;
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
  /** 確かめ用の数: 作った音源・止めた音源・ノードへ書いた回数 */
  starts = 0;
  stops = 0;
  writes = 0;

  /** master はエンジンの出口の音量（曲の束はここへ直に）。wall は実時間の ms（作る時間の記録だけ。tests は 0 を返す物） */
  constructor(private readonly ctx: SfxCtx, master: SfxGainNode, wall: () => number) {
    this.build = new SfxMusicBuild(ctx, wall);
    this.duck = ctx.createGain();
    this.duck.connect(master);
    this.bus = ctx.createGain();
    this.bus.connect(this.duck);
    for (let s = 0; s < SLOTS; s++) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.bus);
      this.gains.push(g);
      this.srcs.push(null);
    }
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

  /** 曲の試聴の場（LAB の間だけ効く）: 鳴らす候補（null で止める）。作っていなければ作り始め、できたらそのまま鳴らす（L14） */
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

  /** 鳴らしている（始めた）曲（試聴の場の文。作っている曲と進みは build） */
  get playingKey(): MusicKey | null {
    return this.curKey === NONE ? null : MUSIC_KEYS[this.curKey]!;
  }

  /** 毎フレーム（エンジンの tick から）: 作る仕事（1 フレームに決まった量）と、10 Hz の決め */
  update(dtS: number): void {
    this.build.step(this.wantKey());
    this.accS += dtS;
    if (this.accS < TICK_S) return;
    this.accS = this.accS < 2 * TICK_S ? this.accS - TICK_S : 0; // 余りは次へ（長いフレームの後にまとめて決めない）
    this.stepGroups();
  }

  /** 確かめ用の数（scripts/headless・tests。毎フレームは呼ばない） */
  stats(): SfxMusicStats {
    const now = this.ctx.currentTime;
    const b = this.build;
    let live = 0;
    for (let s = 0; s < SLOTS; s++) if (this.srcs[s] !== null || this.endAt[s]! > now) live++;
    const t = b.timing();
    return {
      want: this.want, ctx: this.curCtx, key: this.playingKey, sources: this.curN, live, starts: this.starts, stops: this.stops, writes: this.writes,
      paused: this.paused, enabled: this.enabled, muted: this.muted, buffers: b.buffers.filter((x) => x !== null).length, resident: b.resident,
      building: b.key, progress: b.progress, builds: b.builds, abandoned: b.abandoned, buildCalls: b.calls,
      buildMsMedian: t.median, buildMsP95: t.p95, buildMsMax: b.msMax, work: b.hasWork, tables: b.hasTables, failed: b.failed,
    };
  }

  /** 今の場面の曲の鍵（MENU は既定のタイトルの曲・LAB は押した候補。MISSION は S2 で任務の家族） */
  private wantKey(): number {
    return this.want === MUSIC_CTX_MENU ? DEFAULT_KEY : this.want === MUSIC_CTX_LAB ? this.labKey : NONE;
  }

  /** 決め（10 Hz と、頼み・消音・一時停止・曲のオン／オフの時）: 止まっている context には書かない（L11）。今の組と欲しい組が違う時だけ書く */
  private stepGroups(): void {
    if (this.ctx.state !== RUNNING) return;
    const now = this.ctx.currentTime;
    if (this.paused !== this.busDown) this.stepBus(now);
    const k = this.muted || !this.enabled || now < this.wantAtS ? NONE : this.wantKey();
    // 試聴の場で別の候補を押した: その候補ができるまで今の候補を鳴らしておき、できたら 0.5 秒で重ねる（ほかの場面は待たずに下げる）
    const keep = k !== NONE && this.build.buffers[k] === null && this.want === MUSIC_CTX_LAB && this.curCtx === MUSIC_CTX_LAB;
    if (this.curN > 0 && !keep && (this.curKey !== k || this.curCtx !== this.want)) this.stepStop(now, this.fadeOutS());
    if (this.curN === 0 && k !== NONE && this.build.buffers[k] !== null) this.stepStart(now, k);
  }

  /** 止める時の秒: 消音・曲オフ・場面ごと（メニュー 1.2 秒・任務 0.5 秒・試聴の場 0.5 秒の重ね） */
  private fadeOutS(): number {
    if (this.muted) return MUSIC_FADE.muteStopS;
    if (!this.enabled) return MUSIC_FADE.musicOffS;
    return this.curCtx === MUSIC_CTX_MENU ? MUSIC_FADE.menuOutS : this.curCtx === MUSIC_CTX_LAB ? MUSIC_FADE.labCrossS : MUSIC_FADE.missionOutS;
  }

  /** 曲の束（一時停止）を 0 へ／戻す。場面が替わって解けた時は、古い組を先に音量 0 で止める（束が 0 の間なので聞こえない＝戻した束に古い曲の尾を出さない） */
  private stepBus(now: number): void {
    if (!this.paused && this.curN > 0 && this.curCtx !== this.want) this.stepStop(now, 0);
    const g = this.bus.gain;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(this.paused ? 0 : 1, now, MUSIC_FADE.pauseS * TC);
    this.busDown = this.paused;
    this.writes++;
  }

  /** 今の組を止める（fadeS 0 は今すぐ 0）: 音量を 0 へ・予約の stop（1 音源 1 回）。止めかけの組は音量だけを 30 ms で 0 へ（3 組を同時に聞かせない） */
  private stepStop(now: number, fadeS: number): void {
    for (let s = 0; s < SLOTS; s++) {
      if (this.srcs[s] !== null || this.endAt[s]! <= now || this.hurried[s] === 1) continue;
      const g = this.gains[s]!.gain;
      g.cancelScheduledValues(now);
      g.setTargetAtTime(0, now, MUSIC_FADE.hastyStopS * TC);
      this.hurried[s] = 1;
      this.writes++;
    }
    const end = now + (fadeS > 0 ? fadeS : MUSIC_FADE.hastyStopS);
    for (let i = 0; i < this.curN; i++) {
      const s = this.cur[i]!;
      const g = this.gains[s]!.gain;
      g.cancelScheduledValues(now);
      if (fadeS > 0) g.setTargetAtTime(0, now, fadeS * TC);
      else g.setValueAtTime(0, now);
      this.srcs[s]!.stop(end);
      this.srcs[s] = null;
      this.endAt[s] = end;
      this.stops++;
      this.writes++;
    }
    this.curN = 0;
    this.curKey = NONE;
    this.curCtx = MUSIC_CTX_NONE;
  }

  /** 組を始める（曲の音源を作るのはここの 1 か所）: 同じ when で、音量は 0 から上げる。空きの節が足りなければ次の決めで（止めかけの組が鳴り終わるまで） */
  private stepStart(now: number, k: number): void {
    const n = 1; // S2: 任務は 3 層（鍵の番号 k から n 本）
    let got = 0;
    for (let s = 0; s < SLOTS && got < n; s++) if (this.srcs[s] === null && this.endAt[s]! <= now) this.cur[got++] = s;
    if (got < n) return;
    const when = now + MUSIC_PLAYER.startLeadS;
    const late = !this.started || now - this.wantAtS > 2 * TICK_S; // 最初の音・遅れて始める（標本がまだだった・動き出した・音／曲をオンにした）
    const inS = this.want === MUSIC_CTX_LAB ? MUSIC_FADE.labCrossS : late ? MUSIC_FADE.firstInS : MUSIC_FADE.menuInS;
    for (let i = 0; i < n; i++) {
      const s = this.cur[i]!;
      const g = this.gains[s]!.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(0, now);
      g.setTargetAtTime(MUSIC_GAIN[MUSIC_KEYS[k + i]!], when, inS * TC);
      const src = this.ctx.createBufferSource();
      src.buffer = this.build.buffers[k + i]!;
      src.loop = true;
      src.connect(this.gains[s]!);
      src.start(when);
      this.srcs[s] = src;
      this.endAt[s] = Infinity;
      this.hurried[s] = 0;
      this.starts++;
      this.writes++;
    }
    this.curN = n;
    this.curKey = k;
    this.curCtx = this.want;
    this.started = true;
  }
}
