// v0.7.1 S1（アートと音②：合成の効果音。spec-v0710 §7・§11 の R1・R2・R11・§14 L2〜L5）: 再生の薄い層。Phaser が既に作っている再生の context（D3）の上に自前のつなぎを作る:
//   声 16 本（音量 → 左右のパン（ある端末だけ）→ 単発の束）→ リミッタ → 最初の音の立ち上がり → master（消音は 0）→ context の出口。
//   S3: ループ 5 本（systems/sfx-loop-player）→ ループの束 → master（リミッタと最初の音の立ち上がりは通さない＝config/sfx-config の SFX_LOOP_BUS_GAIN の注）。
// 構造の型（systems/sfx-audio-types の SfxCtx など）で書き、ブラウザの型の名前も DOM も使わない＝node の型検査で通り、偽の context でテストできる（tests/sfx-engine）。DOM に触るのは systems/sfx-boot だけ。
// §7（R1）: 確保は作る時だけ（声・束・リミッタ・標本）。1 発ごとに作るのは使い捨ての音源 1 個だけ（仕様で使い捨て。閉包・終わりの通知・物は作らない）。
// 落とす順（spec §7.3）: 標本がまだ無い鍵（作り方が後の段の鍵・起動の直後でまだ作り終えていない鍵＝S2 から標本は 1 フレームに 1 本ずつ作る）→ 消音か context が動いていない
// （数えるだけ＝止まっている context に積まない。R2）→ core/sfx-mix の最小間隔・距離の帯・声。
// 最初のタップだけの例外: context がまだ動き出していない間の UI の音は 1 つだけ覚え、SFX_UI_PENDING_S の内に動き出したら tick が鳴らす（音源はその時に作る）。
// S4: 覚えるのは頼まれた速さと音量も（一時停止を開いた低いボタンの音が、後から普通のボタンの音で鳴らない）。遅らせて頼んだ音（Result の 2 打目）は覚えない。
// S4: 遅らせる単発（playFlat の delayS。Result の鐘の 2 打目・座礁の擦れる音）は start(再生の時計 ＋ delayS) で予約する（タイマー・閉包は作らない）。間引きと声の空きは鳴り始める時刻で数える。
// 時計（D4）: 間引きはゲームの時計（tick が積む delta の和）、声の空きは再生の時計。rate の揺れは音だけの乱数（SFX_SEED_PLAY。頼まれた順に引く＝音の状態にも標本の有無にも依らない）。
// 確かめの口 tap（S2。scripts/headless/sfx-probe が ?debug の __sfx に付ける。ふだんは null）: 頼まれた単発を、rate の揺れの後・落とす前に知らせる＝記録は音の状態に依らない。
// 論理は読まない（位置の差だけを systems/sfx-bus から受け取る）。
import {
  SFX_FIRST_FADE, SFX_KEYS, SFX_LIMITER, SFX_MASTER_GAIN, SFX_MUTE_TIME_CONSTANT_S, SFX_SAMPLE_RATE, SFX_SEED_PLAY, SFX_TABLE, SFX_UI_PENDING_S, SFX_VOICES, SFX_WATCHDOG, type SfxKey,
} from '../config/sfx-config';
import { SeededRng } from '../core/rng';
import { SfxMixer, sfxKeyIndex } from '../core/sfx-mix';
import type { SfxBuffer, SfxCtx, SfxGainNode, SfxPanNode, SfxSource, SfxThenable } from './sfx-audio-types';
import { SfxLoopPlayer } from './sfx-loop-player';

const RUNNING = 'running';
function noop(): void {}
/** 約束の拒否を握る（iOS 26 の「Failed to start the audio device」。L2） */
function swallow(p: SfxThenable | undefined): void {
  if (p && typeof p.catch === 'function') p.catch(noop);
}

/** scripts/headless の確かめ用の数 */
export interface SfxStats {
  state: string;
  muted: boolean;
  gameS: number;
  buffers: number;
  /** 作った音源の数・今鳴っている声・同時の声の最大 */
  sources: number;
  busy: number;
  maxBusy: number;
  /** 消音か context が動いていなくて捨てた数・標本の無い鍵・覚えて後から鳴らした最初のタップ・resume を頼んだ数・見張りが動いた数 */
  idleDrops: number;
  noBuffer: number;
  pendingPlayed: number;
  kicks: number;
  watchdogKicks: number;
  played: number[];
  dropped: number[];
  /** S3: ループの鳴っている音源（0 か 5）・作った数・止めた数・ノードへ書いた回数 */
  loops: number;
  loopStarts: number;
  loopStops: number;
  loopWrites: number;
}

/** 確かめの口（頼まれた単発 1 つ。rate は揺れの後。flat は位置なし。delayS は遅らせる秒＝S4） */
export type SfxTap = (key: SfxKey, dxM: number, dyM: number, rate: number, gainMul: number, minIntervalS: number, flat: boolean, delayS: number) => void;

export class SfxEngine {
  readonly mixer = new SfxMixer(SFX_VOICES);
  /** 確かめの口（scripts/headless/sfx-probe。ふだんは null＝何もしない） */
  tap: SfxTap | null = null;
  /** 束ねの出口（消音の音量）。scripts/headless/sfx-live が波形の頂を測るのにつなぐ */
  readonly master: SfxGainNode;
  /** ループの束（master へ直につなぐ）と、ループ 5 本の再生（S3。systems/sfx-mission が systems/sfx-bus を通して動かす） */
  readonly loopBus: SfxGainNode;
  readonly loops: SfxLoopPlayer;
  private readonly fade: SfxGainNode;
  private readonly voiceGain: SfxGainNode[] = [];
  private readonly voicePan: (SfxPanNode | null)[] = [];
  private readonly voiceSrc: (SfxSource | null)[] = [];
  private readonly buffers: (SfxBuffer | null)[] = SFX_KEYS.map(() => null);
  private readonly rng = new SeededRng(SFX_SEED_PLAY);
  private mutedNow = false;
  private gameS = 0;
  private firstDone = false;
  private pendingKey: SfxKey | null = null;
  private pendingAtS = 0;
  private pendingRate = 1;
  private pendingGain = 1;
  private watchLastMs = 0;
  private watchCtS = -1;
  private frozenMs = 0;
  private watchKickMs = -Infinity;
  private watchTries = 0;
  private sources = 0;
  private idleDrops = 0;
  private noBuffer = 0;
  private pendingPlayed = 0;
  private kicks = 0;
  private watchdogKicks = 0;

  constructor(private readonly ctx: SfxCtx) {
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = SFX_LIMITER.thresholdDb;
    limiter.knee.value = SFX_LIMITER.kneeDb;
    limiter.ratio.value = SFX_LIMITER.ratio;
    limiter.attack.value = SFX_LIMITER.attackS;
    limiter.release.value = SFX_LIMITER.releaseS;
    this.fade = ctx.createGain();
    this.fade.gain.value = SFX_FIRST_FADE.fromShare;
    this.master = ctx.createGain();
    this.master.gain.value = SFX_MASTER_GAIN;
    limiter.connect(this.fade);
    this.fade.connect(this.master);
    this.master.connect(ctx.destination);
    const shots = ctx.createGain();
    shots.connect(limiter);
    this.loopBus = ctx.createGain();
    this.loopBus.connect(this.master);
    for (let i = 0; i < SFX_VOICES; i++) {
      const g = ctx.createGain();
      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (p) {
        g.connect(p);
        p.connect(shots);
      } else g.connect(shots);
      this.voiceGain.push(g);
      this.voicePan.push(p);
      this.voiceSrc.push(null);
    }
    this.loops = new SfxLoopPlayer(ctx, this.loopBus, this.buffers);
  }

  /** 鍵ごとに 1 回ずつ（Boot と、その後の数フレーム）: 合成した標本（22,050 Hz・モノ）を再生の buffer に写す（context が止まっていても作れる。投げたら呼ぶ側がやめる＝R7） */
  setBuffer(key: SfxKey, samples: Float32Array): void {
    const b = this.ctx.createBuffer(1, samples.length, SFX_SAMPLE_RATE);
    b.getChannelData(0).set(samples);
    this.buffers[sfxKeyIndex(key)] = b;
  }

  get muted(): boolean {
    return this.mutedNow;
  }

  /** ゲームの時計（tick が積んだ delta の和。秒） */
  get clockS(): number {
    return this.gameS;
  }

  /** 消音（L4: context は止めず master の音量を 0 に。変わった時だけ）。解く時は context が止まっていれば起こす（消音のボタンのタップの中） */
  setMuted(v: boolean): void {
    if (v === this.mutedNow) return;
    this.mutedNow = v;
    const g = this.master.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    if (v) {
      g.setTargetAtTime(0, now, SFX_MUTE_TIME_CONSTANT_S);
      this.pendingKey = null;
    } else {
      g.setValueAtTime(SFX_MASTER_GAIN, now);
      this.kick();
    }
  }

  /** context が動いていなければ起こす（タッチの終わり・pageshow・消音を解いた時。拒否は握る＝L2・L3） */
  kick(): void {
    if (this.ctx.state === RUNNING) return;
    this.kicks++;
    swallow(this.ctx.resume());
  }

  /** 毎フレーム（Boot が付けた PRE_STEP から）: ゲームの時計を進め、覚えた最初のタップを鳴らし、10 Hz で context の見張り（L3c）。wallMs は実時間 */
  tick(dtS: number, wallMs: number): void {
    this.gameS += dtS;
    const key = this.pendingKey;
    if (key !== null) {
      if (this.gameS - this.pendingAtS > SFX_UI_PENDING_S) this.pendingKey = null;
      else if (this.ctx.state === RUNNING) {
        this.pendingKey = null;
        this.pendingPlayed++;
        this.playFlat(key, this.pendingRate, this.pendingGain);
      }
    }
    const el = wallMs - this.watchLastMs;
    if (el < SFX_WATCHDOG.checkMs) return;
    this.watchLastMs = wallMs;
    const ct = this.ctx.currentTime;
    if (this.ctx.state !== RUNNING) {
      this.watchCtS = -1;
      this.frozenMs = 0;
      return;
    }
    if (ct !== this.watchCtS) {
      if (this.watchCtS >= 0) this.watchTries = 0; // 時計が進むのを見た
      this.watchCtS = ct;
      this.frozenMs = 0;
      return;
    }
    this.frozenMs += el < SFX_WATCHDOG.capMs ? el : SFX_WATCHDOG.capMs;
    if (this.frozenMs < SFX_WATCHDOG.frozenMs || wallMs - this.watchKickMs < SFX_WATCHDOG.throttleMs || this.watchTries >= SFX_WATCHDOG.maxTries) return;
    // running なのに時計が進まない（iOS の復帰の不具合の 1 つ）: 止めてすぐ再開を 1 回。次は throttleMs の後・進まないまま maxTries 回まで（作り直しは v0.7.1 では入れない＝L3）
    this.watchKickMs = wallMs;
    this.frozenMs = 0;
    this.watchTries++;
    this.watchdogKicks++;
    swallow(this.ctx.suspend());
    swallow(this.ctx.resume());
  }

  /** 位置つきの単発（dx・dy は聞き手からの差 m。systems/sfx-bus が聞き手の位置を引いて渡す。minIntervalS はこの 1 発だけの最小間隔＝core/sfx-mix） */
  playAt(key: SfxKey, dxM: number, dyM: number, rate: number, gainMul: number, minIntervalS = 0): void {
    const ki = sfxKeyIndex(key);
    const r = this.jittered(key, rate);
    if (this.tap !== null) this.tap(key, dxM, dyM, r, gainMul, minIntervalS, false, 0);
    if (this.buffers[ki] === null) {
      this.noBuffer++;
      return;
    }
    if (this.mutedNow || this.ctx.state !== RUNNING) {
      this.idleDrops++;
      return;
    }
    const v = this.mixer.playAt(key, dxM, dyM, this.gameS, this.ctx.currentTime, r, gainMul, minIntervalS);
    if (v >= 0) this.fire(ki, v, r);
  }

  /**
   * 位置なしの単発（合図・UI。中央）。context がまだ動き出していない間の UI の音は 1 つだけ覚える（最初のタップ。速さと音量も＝S4）。
   * delayS > 0 は再生の時計で delayS 秒後に鳴らす予約（S4。間引き・声の空きはその時刻で数える。覚えない）
   */
  playFlat(key: SfxKey, rate: number, gainMul: number, delayS = 0): void {
    const ki = sfxKeyIndex(key);
    const r = this.jittered(key, rate);
    if (this.tap !== null) this.tap(key, 0, 0, r, gainMul, 0, true, delayS);
    if (this.buffers[ki] === null) {
      this.noBuffer++;
      return;
    }
    if (this.mutedNow || this.ctx.state !== RUNNING) {
      this.idleDrops++;
      if (!this.mutedNow && delayS <= 0 && SFX_TABLE[key].family === 'ui') {
        this.pendingKey = key;
        this.pendingAtS = this.gameS;
        this.pendingRate = rate;
        this.pendingGain = gainMul;
      }
      return;
    }
    const d = delayS > 0 ? delayS : 0;
    const v = this.mixer.playFlat(key, this.gameS, this.ctx.currentTime, r, gainMul, d);
    if (v >= 0) this.fire(ki, v, r, d);
  }

  /** 確かめ用の数（scripts/headless。毎フレームは呼ばない） */
  stats(): SfxStats {
    return {
      state: this.ctx.state, muted: this.mutedNow, gameS: this.gameS, buffers: this.buffers.reduce((n, b) => n + (b ? 1 : 0), 0),
      sources: this.sources, busy: this.mixer.busyVoices(this.ctx.currentTime), maxBusy: this.mixer.maxBusy,
      idleDrops: this.idleDrops, noBuffer: this.noBuffer, pendingPlayed: this.pendingPlayed, kicks: this.kicks, watchdogKicks: this.watchdogKicks,
      played: Array.from(this.mixer.played), dropped: Array.from(this.mixer.dropped),
      loops: this.loops.liveSources, loopStarts: this.loops.starts, loopStops: this.loops.stops, loopWrites: this.loops.writes,
    };
  }

  /** 再生のたびの rate の揺れ（表の rateJitter が 0 の鍵は乱数を引かない） */
  private jittered(key: SfxKey, rate: number): number {
    const j = SFX_TABLE[key].rateJitter;
    return j > 0 ? rate * (1 + (this.rng.next() * 2 - 1) * j) : rate;
  }

  /** 声 v で鳴らす: 奪った声なら前の音源を止め、使い捨ての音源を 1 個作ってつなぐ（delayS 秒後に鳴り始める予約＝S4）。最初の 1 発は束ねを立ち上げる（R11） */
  private fire(keyIndex: number, v: number, rate: number, delayS = 0): void {
    const ctx = this.ctx;
    const m = this.mixer;
    if (m.stole) this.voiceSrc[v]?.stop();
    if (!this.firstDone) {
      this.firstDone = true;
      const now = ctx.currentTime;
      this.fade.gain.setValueAtTime(SFX_FIRST_FADE.fromShare, now);
      this.fade.gain.linearRampToValueAtTime(1, now + SFX_FIRST_FADE.seconds);
    }
    this.voiceGain[v]!.gain.value = m.gain;
    const p = this.voicePan[v];
    if (p) p.pan.value = m.pan;
    const src = ctx.createBufferSource();
    src.buffer = this.buffers[keyIndex]!;
    if (rate !== 1) src.playbackRate.value = rate;
    src.connect(this.voiceGain[v]!);
    src.start(delayS > 0 ? ctx.currentTime + delayS : 0);
    this.voiceSrc[v] = src;
    this.sources++;
  }
}
