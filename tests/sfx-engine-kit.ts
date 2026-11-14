// v0.7.1 S3: 音のエンジンのテスト（tests/sfx-engine・sfx-engine-wake・sfx-engine-loops）が共有する偽の再生の context（S1 の tests/sfx-engine から分けた。中身は同じ＋ループの欄）。
// 偽の param は予約（set・ramp・target・cancel）を順に覚える。偽の音源は start・stop と loop を覚える。構造の型 SfxCtx を満たす（satisfies で確かめる）。
// v0.7.2 S1: エンジンが曲の再生（曲の束・下げる音量・音量の節 MUSIC_PLAYER.slots 本）も作るので、graph はそれを声から外して music に返す（tests/sfx-engine-music も使う）。
import { SFX_SAMPLE_RATE, SFX_TABLE, type SfxKey } from '../src/config/sfx-config';
import type { SfxCtx } from '../src/systems/sfx-audio-types';
import { SfxEngine } from '../src/systems/sfx-engine';

export type Ev = readonly [kind: string, ...args: number[]];
export class FakeParam {
  value = 1;
  readonly events: Ev[] = [];
  setValueAtTime(v: number, t: number): void { this.events.push(['set', v, t]); this.value = v; }
  linearRampToValueAtTime(v: number, t: number): void { this.events.push(['ramp', v, t]); }
  setTargetAtTime(v: number, t: number, tc: number): void { this.events.push(['target', v, t, tc]); }
  cancelScheduledValues(t: number): void { this.events.push(['cancel', t]); }
}
export class FakeNode {
  readonly outs: unknown[] = [];
  connect(to: unknown): unknown { this.outs.push(to); return to; }
}
export class FakeGain extends FakeNode { readonly gain = new FakeParam(); }
export class FakePan extends FakeNode { readonly pan = new FakeParam(); }
export class FakeLimiter extends FakeNode {
  readonly threshold = new FakeParam(); readonly knee = new FakeParam(); readonly ratio = new FakeParam(); readonly attack = new FakeParam(); readonly release = new FakeParam();
}
export class FakeBuffer {
  readonly data: Float32Array;
  constructor(readonly channels: number, readonly length: number, readonly sampleRate: number) { this.data = new Float32Array(length); }
  getChannelData(): Float32Array { return this.data; }
}
export class FakeSource extends FakeNode {
  buffer: FakeBuffer | null = null;
  readonly playbackRate = new FakeParam();
  loop = false;
  started = -1;
  stopped = false;
  /** stop に渡した時刻（渡さなければ −1） */
  stopAt = -1;
  start(when = 0): void { this.started = when; }
  stop(when = -1): void { this.stopped = true; this.stopAt = when; }
}
/** resume・suspend の戻り（拒否する約束の代わり。catch を付けたかを見る） */
export class FakeThenable {
  caught = 0;
  catch(f: (e: unknown) => void): void { this.caught++; f(new Error('Failed to start the audio device')); }
}
export class FakeCtx {
  state = 'suspended';
  currentTime = 0;
  readonly destination = { name: 'destination' };
  readonly gains: FakeGain[] = [];
  readonly pans: FakePan[] = [];
  readonly limiters: FakeLimiter[] = [];
  readonly sources: FakeSource[] = [];
  readonly buffers: FakeBuffer[] = [];
  readonly resumes: FakeThenable[] = [];
  readonly suspends: FakeThenable[] = [];
  createStereoPanner?: () => FakePan = () => { const p = new FakePan(); this.pans.push(p); return p; };
  createGain(): FakeGain { const g = new FakeGain(); this.gains.push(g); return g; }
  createDynamicsCompressor(): FakeLimiter { const l = new FakeLimiter(); this.limiters.push(l); return l; }
  createBufferSource(): FakeSource { const s = new FakeSource(); this.sources.push(s); return s; }
  createBuffer(ch: number, n: number, rate: number): FakeBuffer { const b = new FakeBuffer(ch, n, rate); this.buffers.push(b); return b; }
  resume(): FakeThenable { const t = new FakeThenable(); this.resumes.push(t); return t; }
  suspend(): FakeThenable { const t = new FakeThenable(); this.suspends.push(t); return t; }
}

export const KEYS = ['mg', 'blast_l', 'ui_tap'] as const;
/** 標本の代わり（長さは表の秒どおり・中身は 0.5） */
export function fakeSamples(k: SfxKey): Float32Array {
  return new Float32Array(Math.round(SFX_TABLE[k].seconds * SFX_SAMPLE_RATE)).fill(0.5);
}
/** 偽の context とエンジン（3 本の標本つき。長さは表の秒どおり・中身は 0.5） */
export function setup(state = 'running', withPan = true): { ctx: FakeCtx; e: SfxEngine } {
  const ctx = new FakeCtx();
  ctx.state = state;
  if (!withPan) ctx.createStereoPanner = undefined;
  const e = new SfxEngine(ctx satisfies SfxCtx);
  for (const k of KEYS) e.setBuffer(k, fakeSamples(k));
  return { ctx, e };
}
/** 曲の再生のノード（v0.7.2 S1）: 曲の束・下げる音量・音量の節（曲の束へつなぐ） */
export interface MusicNodes { bus: FakeGain; duck: FakeGain; slots: FakeGain[] }
/** つなぎの中の役（作った順に依らず、つながりで探す）。loops はループごとの音量 5 本（ループの束へつなぐ）。music は曲の再生のノード（声に入れない） */
export function graph(ctx: FakeCtx, e: SfxEngine): { master: FakeGain; fade: FakeGain; limiter: FakeLimiter; shots: FakeGain; loopBus: FakeGain; voices: FakeGain[]; loops: FakeGain[]; music: MusicNodes } {
  const master = e.master as unknown as FakeGain;
  const loopBus = e.loopBus as unknown as FakeGain;
  const music: MusicNodes = { bus: e.music.bus as unknown as FakeGain, duck: e.music.duck as unknown as FakeGain, slots: [] };
  music.slots = ctx.gains.filter((g) => g.outs.includes(music.bus));
  const limiter = ctx.limiters[0]!;
  const fade = ctx.gains.find((g) => g !== loopBus && g !== music.duck && g.outs.includes(master))!;
  const shots = ctx.gains.find((g) => g.outs.includes(limiter))!;
  const loops = ctx.gains.filter((g) => g.outs.includes(loopBus));
  const notVoice = new Set<FakeGain>([fade, master, shots, loopBus, ...loops, music.bus, music.duck, ...music.slots]);
  const voices = ctx.gains.filter((g) => !notVoice.has(g));
  return { master, fade, limiter, shots, loopBus, voices, loops, music };
}
