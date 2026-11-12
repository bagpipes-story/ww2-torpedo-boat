// v0.7.1 S3（アートと音②：合成の効果音。spec-v0710 §5・§11 の R2・R3・R10・§14 L6）: ループ 5 本（engine・sea・fire・rain・drone）の再生。エンジン（systems/sfx-engine）が 1 つ持つ。
// つなぎ: ループごとの音量 5 本（起動時に 1 回作って使い回す）→ ループの束 → master（リミッタは通さない＝config/sfx-config の SFX_LOOP_BUS_GAIN の注）。
// 音源は任務ごとに 5 個（繰り返す buffer の音源は使い捨て＝始める時に 5 個作り、終わりに止める。1 任務 1 回の確保）。buffer 全体を繰り返し、start の位置・長さは使わない（L6）。
// 始める条件（R2・R10）: 10 Hz の更新で、context が動いていて・消音でなく・5 本の標本がそろっている時だけ（そろうまで・動き出すまでは作らずに次の更新で見直す＝
// ?debug の直行で最初のタッチが任務の中でも鳴る）。任務の途中で消音にしたら音源を止め（電池）、解いたら作り直す。
// 目標を書くのは 10 Hz・変わった時だけ（R3: 音量の差 > 0.01・rate の差 > 0.005。0 へは必ず書く）: setTargetAtTime（時定数 0.08 秒）。値は読み返さない（L6）。
// 一時停止はループの束を 0 へ（0.15 秒で約 5%）、再開で戻す。止める時は 0.15 秒で絞ってから音源を止める（ぷつっと切らない）。
// §7: update・setPaused は確保しない（音源を作るのは begin＝任務の始め・消音を解いた時だけ）。構造の型だけで書く（偽の context でテストできる＝tests/sfx-engine-loops）。
import {
  SFX_KEYS, SFX_LOOP_BUS_GAIN, SFX_LOOP_GAIN_EPS, SFX_LOOP_PAUSE_FADE_S, SFX_LOOP_RATE_EPS, SFX_LOOP_RATE_MAX, SFX_LOOP_RATE_MIN, SFX_LOOP_STOP_FADE_S, SFX_LOOP_TIME_CONSTANT_S, SFX_LOOP_UPDATE_HZ,
} from '../config/sfx-config';
import { SFX_LOOP_COUNT, SFX_LOOP_IDS, type SfxLoopTargets } from '../core/sfx-loops';
import type { SfxBuffer, SfxCtx, SfxGainNode, SfxSource } from './sfx-audio-types';

const RUNNING = 'running';
const TICK_S = 1 / SFX_LOOP_UPDATE_HZ;
/** 「fade 秒でほぼ 0」の時定数（指数で fade 秒の後に約 5%） */
const FADE_TO_TC = 1 / 3;
/** ループの標本の添字（エンジンの buffers の並び＝SFX_KEYS） */
const KEY_INDEX: readonly number[] = SFX_LOOP_IDS.map((id) => SFX_KEYS.indexOf(id));

export class SfxLoopPlayer {
  private readonly gains: SfxGainNode[] = [];
  private readonly srcs: (SfxSource | null)[] = [];
  private readonly lastGain = new Float64Array(SFX_LOOP_COUNT);
  private readonly lastRate = new Float64Array(SFX_LOOP_COUNT);
  private accS = 0;
  private live = false;
  private paused = false;
  /** 確かめ用の数: 作った音源・止めた音源・10 Hz の更新・ノードへ書いた回数 */
  starts = 0;
  stops = 0;
  ticks = 0;
  writes = 0;

  /** bus はループの束（エンジンが master へつなぐ）。buffers はエンジンの標本の並び（SFX_KEYS の順。まだ無い鍵は null） */
  constructor(private readonly ctx: SfxCtx, private readonly bus: SfxGainNode, private readonly buffers: readonly (SfxBuffer | null)[]) {
    bus.gain.value = SFX_LOOP_BUS_GAIN;
    for (let i = 0; i < SFX_LOOP_COUNT; i++) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(bus);
      this.gains.push(g);
      this.srcs.push(null);
    }
  }

  /** 鳴っている音源の数（0 か 5） */
  get liveSources(): number {
    return this.live ? SFX_LOOP_COUNT : 0;
  }

  /** 毎フレーム（任務の間。systems/sfx-mission から）: dt を積み、10 Hz で 始める／消音で止める／変わった目標を書く */
  update(t: SfxLoopTargets, dtS: number, muted: boolean): void {
    this.accS += dtS;
    if (this.accS < TICK_S) return;
    this.accS = this.accS < 2 * TICK_S ? this.accS - TICK_S : 0; // 余りは次へ（長いフレームの後にまとめて更新しない）
    this.ticks++;
    const run = this.ctx.state === RUNNING;
    if (!this.live) {
      if (muted || !run || !this.ready()) return;
      this.begin();
    } else if (muted) {
      this.stop();
      return;
    }
    if (!run) return; // 止まっている context には積まない（R2）
    const now = this.ctx.currentTime;
    for (let i = 0; i < SFX_LOOP_COUNT; i++) {
      const g = t.gain[i]!;
      const dg = g - this.lastGain[i]!;
      if (dg > SFX_LOOP_GAIN_EPS || dg < -SFX_LOOP_GAIN_EPS || (g === 0 && dg !== 0)) {
        this.gains[i]!.gain.setTargetAtTime(g, now, SFX_LOOP_TIME_CONSTANT_S);
        this.lastGain[i] = g;
        this.writes++;
      }
      const want = t.rate[i]!;
      const r = want < SFX_LOOP_RATE_MIN ? SFX_LOOP_RATE_MIN : want > SFX_LOOP_RATE_MAX ? SFX_LOOP_RATE_MAX : want;
      const dr = r - this.lastRate[i]!;
      if (dr > SFX_LOOP_RATE_EPS || dr < -SFX_LOOP_RATE_EPS) {
        this.srcs[i]!.playbackRate.setTargetAtTime(r, now, SFX_LOOP_TIME_CONSTANT_S);
        this.lastRate[i] = r;
        this.writes++;
      }
    }
  }

  /** 一時停止（Hud の PAUSE・RESUME）: ループの束を 0 へ／戻す。変わった時だけ（鳴っていなければ覚えるだけ＝始める時に束へ書く） */
  setPaused(v: boolean): void {
    if (v === this.paused) return;
    this.paused = v;
    if (!this.live) return;
    const now = this.ctx.currentTime;
    const g = this.bus.gain;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(v ? 0 : SFX_LOOP_BUS_GAIN, now, SFX_LOOP_PAUSE_FADE_S * FADE_TO_TC);
  }

  /** 止める（Hud の SHUTDOWN＝任務の終わり・やり直し・任務をやめる、任務の途中の消音）: 絞ってから 5 個の音源を止める。一時停止も解く。鳴っていなければ何もしない */
  stop(): void {
    this.paused = false;
    this.accS = 0;
    if (!this.live) return;
    this.live = false;
    const now = this.ctx.currentTime;
    for (let i = 0; i < SFX_LOOP_COUNT; i++) {
      const g = this.gains[i]!.gain;
      g.cancelScheduledValues(now);
      g.setTargetAtTime(0, now, SFX_LOOP_STOP_FADE_S * FADE_TO_TC);
      this.srcs[i]!.stop(now + SFX_LOOP_STOP_FADE_S);
      this.srcs[i] = null;
      this.stops++;
    }
  }

  /** 5 本の標本がそろっている（起動の直後の数フレームはまだ無い） */
  private ready(): boolean {
    for (let i = 0; i < SFX_LOOP_COUNT; i++) if (this.buffers[KEY_INDEX[i]!] === null) return false;
    return true;
  }

  /** 始める: 音量 0 から（次の行で目標へ寄る＝立ち上がり）、rate 1 で 5 個の音源を作って回す。束は一時停止なら 0 */
  private begin(): void {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const bg = this.bus.gain;
    bg.cancelScheduledValues(now);
    bg.setValueAtTime(this.paused ? 0 : SFX_LOOP_BUS_GAIN, now);
    for (let i = 0; i < SFX_LOOP_COUNT; i++) {
      const g = this.gains[i]!.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(0, now);
      this.lastGain[i] = 0;
      this.lastRate[i] = 1;
      const src = ctx.createBufferSource();
      src.buffer = this.buffers[KEY_INDEX[i]!]!;
      src.loop = true;
      src.connect(this.gains[i]!);
      src.start(0);
      this.srcs[i] = src;
      this.starts++;
    }
    this.live = true;
  }
}
