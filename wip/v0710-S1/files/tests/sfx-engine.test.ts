// v0.7.1 S1（アートと音②：合成の効果音。spec-v0710 §7・§9.1・§11 の R1・R2・R11・§14 L2〜L4）: 再生の薄い層 systems/sfx-engine と口 systems/sfx-bus を偽の context で確かめる。
// - つなぎ: 声 16 本（音量 → パン → 単発の束）・ループの束 → リミッタ → 立ち上がり → master → 出口。パンの無い端末は中央（R7）。
// - 止まっている context・消音では音源を 1 つも作らない（数えるだけ＝R2）。エンジンの登録が無ければどの口も何もしない。
// - 声は 16 本を超えない。奪った声の前の音源は止める。1 発ごとに作るのは音源 1 個だけ（声・束は増えない＝R1）。
// - 最初の 1 発は束ねを立ち上げる（R11）。最初のタップ（context が動き出す前の UI の音）は 1 つだけ覚えて、0.5 秒の内に動き出せば鳴らす。
// - 消音は master の音量（context は止めない＝L4）。見張りの試験の外は tick の実時間を 0 にする（見張りを動かさない）。resume の拒否は握る（L2）。見張り（L3c）は running なのに時計が 0.5 秒進まない時だけ、止めて再開を 1 回。
import { afterEach, describe, expect, it } from 'vitest';
import { SFX_FIRST_FADE, SFX_LIMITER, SFX_MASTER_GAIN, SFX_MUTE_TIME_CONSTANT_S, SFX_SAMPLE_RATE, SFX_TABLE, SFX_UI_PENDING_S, SFX_VOICES, SFX_WATCHDOG } from '../src/config/sfx-config';
import { SFX_DROP_VOICES, sfxKeyIndex } from '../src/core/sfx-mix';
import { registerSfxEngine, registerSfxListener, sfxAt, sfxCue, sfxLoop, sfxSetMuted, sfxUi } from '../src/systems/sfx-bus';
import type { SfxCtx } from '../src/systems/sfx-audio-types';
import { SfxEngine } from '../src/systems/sfx-engine';

type Ev = readonly [kind: string, ...args: number[]];
class FakeParam {
  value = 1;
  readonly events: Ev[] = [];
  setValueAtTime(v: number, t: number): void { this.events.push(['set', v, t]); this.value = v; }
  linearRampToValueAtTime(v: number, t: number): void { this.events.push(['ramp', v, t]); }
  setTargetAtTime(v: number, t: number, tc: number): void { this.events.push(['target', v, t, tc]); }
  cancelScheduledValues(t: number): void { this.events.push(['cancel', t]); }
}
class FakeNode {
  readonly outs: unknown[] = [];
  connect(to: unknown): unknown { this.outs.push(to); return to; }
}
class FakeGain extends FakeNode { readonly gain = new FakeParam(); }
class FakePan extends FakeNode { readonly pan = new FakeParam(); }
class FakeLimiter extends FakeNode {
  readonly threshold = new FakeParam(); readonly knee = new FakeParam(); readonly ratio = new FakeParam(); readonly attack = new FakeParam(); readonly release = new FakeParam();
}
class FakeBuffer {
  readonly data: Float32Array;
  constructor(readonly channels: number, readonly length: number, readonly sampleRate: number) { this.data = new Float32Array(length); }
  getChannelData(): Float32Array { return this.data; }
}
class FakeSource extends FakeNode {
  buffer: FakeBuffer | null = null;
  readonly playbackRate = new FakeParam();
  started = -1;
  stopped = false;
  start(when = 0): void { this.started = when; }
  stop(): void { this.stopped = true; }
}
/** resume・suspend の戻り（拒否する約束の代わり。catch を付けたかを見る） */
class FakeThenable {
  caught = 0;
  catch(f: (e: unknown) => void): void { this.caught++; f(new Error('Failed to start the audio device')); }
}
class FakeCtx {
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

const KEYS = ['mg', 'blast_l', 'ui_tap'] as const;
/** 偽の context とエンジン（3 本の標本つき。長さは表の秒どおり・中身は 0.5） */
function setup(state = 'running', withPan = true): { ctx: FakeCtx; e: SfxEngine } {
  const ctx = new FakeCtx();
  ctx.state = state;
  if (!withPan) ctx.createStereoPanner = undefined;
  const e = new SfxEngine(ctx satisfies SfxCtx);
  for (const k of KEYS) e.setBuffer(k, new Float32Array(Math.round(SFX_TABLE[k].seconds * SFX_SAMPLE_RATE)).fill(0.5));
  return { ctx, e };
}
/** つなぎの中の役（作った順に依らず、つながりで探す） */
function graph(ctx: FakeCtx, e: SfxEngine): { master: FakeGain; fade: FakeGain; limiter: FakeLimiter; shots: FakeGain; loopBus: FakeGain; voices: FakeGain[] } {
  const master = e.master as unknown as FakeGain;
  const loopBus = e.loopBus as unknown as FakeGain;
  const limiter = ctx.limiters[0]!;
  const fade = ctx.gains.find((g) => g.outs.includes(master))!;
  const shots = ctx.gains.find((g) => g !== loopBus && g.outs.includes(limiter))!;
  const voices = ctx.gains.filter((g) => g !== fade && g !== master && g !== shots && g !== loopBus);
  return { master, fade, limiter, shots, loopBus, voices };
}

afterEach(() => {
  registerSfxEngine(null);
  registerSfxListener(null);
});

describe('つなぎ（spec §7.1・§7.3。作るのは起動時だけ）', () => {
  it('声 16 本（音量 → パン → 単発の束）・ループの束 → リミッタ → 立ち上がり → master → 出口。リミッタと master は config の値', () => {
    const { ctx, e } = setup();
    const g = graph(ctx, e);
    expect([ctx.gains.length, ctx.pans.length, ctx.limiters.length]).toEqual([SFX_VOICES + 4, SFX_VOICES, 1]);
    expect(g.voices.length).toBe(SFX_VOICES);
    g.voices.forEach((v, i) => {
      expect(v.outs).toEqual([ctx.pans[i]]);
      expect(ctx.pans[i]!.outs).toEqual([g.shots]);
    });
    expect(g.shots.outs).toEqual([g.limiter]);
    expect(g.loopBus.outs).toEqual([g.limiter]);
    expect(g.limiter.outs).toEqual([g.fade]);
    expect(g.fade.outs).toEqual([g.master]);
    expect(g.master.outs).toEqual([ctx.destination]);
    expect([g.limiter.threshold.value, g.limiter.knee.value, g.limiter.ratio.value, g.limiter.attack.value, g.limiter.release.value]).toEqual([SFX_LIMITER.thresholdDb, SFX_LIMITER.kneeDb, SFX_LIMITER.ratio, SFX_LIMITER.attackS, SFX_LIMITER.releaseS]);
    expect(g.master.gain.value).toBe(SFX_MASTER_GAIN);
    expect(g.fade.gain.value).toBe(SFX_FIRST_FADE.fromShare);
  });
  it('標本は 22,050 Hz・モノの buffer に写す（3 本）。context が止まっていても作れる', () => {
    const { ctx, e } = setup('suspended');
    expect(ctx.buffers.map((b) => [b.channels, b.length, b.sampleRate])).toEqual(KEYS.map((k) => [1, Math.round(SFX_TABLE[k].seconds * SFX_SAMPLE_RATE), SFX_SAMPLE_RATE]));
    expect(ctx.buffers[0]!.data[10]).toBe(0.5);
    expect(e.stats().buffers).toBe(3);
  });
  it('パンの無い端末（古い iOS）: 声は単発の束へ直につなぎ、中央で鳴る', () => {
    const { ctx, e } = setup('running', false);
    const g = graph(ctx, e);
    expect(ctx.pans.length).toBe(0);
    for (const v of g.voices) expect(v.outs).toEqual([g.shots]);
    e.playAt('mg', 600, 0, 1, 1);
    expect(ctx.sources.length).toBe(1);
    expect(ctx.sources[0]!.started).toBe(0);
  });
});

describe('単発（1 発ごとに作るのは音源 1 個だけ）', () => {
  it('鳴らす: 声の音量＝鍵 × 帯 × 倍率、パンは dx から、音源は標本をつないで start(0)。声・束・リミッタは増えない', () => {
    const { ctx, e } = setup();
    const g = graph(ctx, e);
    const before = [ctx.gains.length, ctx.pans.length, ctx.limiters.length, ctx.buffers.length];
    e.playAt('blast_l', 450, 600, 1, 0.5);
    expect(ctx.sources.length).toBe(1);
    const s = ctx.sources[0]!;
    expect(s.buffer).toBe(ctx.buffers[1]);
    expect(s.outs).toEqual([g.voices[0]]);
    expect(s.started).toBe(0);
    expect(g.voices[0]!.gain.value).toBeCloseTo(SFX_TABLE.blast_l.gain * 0.55 * 0.5, 6);
    expect(ctx.pans[0]!.pan.value).toBeCloseTo(0.35, 6);
    expect(s.playbackRate.value).toBe(1); // rate の揺れの無い鍵は触らない
    e.playFlat('ui_tap', 1, 1);
    expect(ctx.sources.length).toBe(2);
    expect(ctx.pans[1]!.pan.value).toBe(0);
    expect([ctx.gains.length, ctx.pans.length, ctx.limiters.length, ctx.buffers.length]).toEqual(before);
    const st = e.stats();
    expect([st.sources, st.busy, st.maxBusy, st.idleDrops]).toEqual([2, 2, 2, 0]);
    expect([st.played[sfxKeyIndex('blast_l')], st.played[sfxKeyIndex('ui_tap')]]).toEqual([1, 1]);
  });
  it('機銃は再生のたびに rate を ±8% 揺らす（音だけの乱数＝2 つのエンジンで同じ列。止まっていても頼まれた順に引く）', () => {
    const a = setup();
    const b = setup();
    const c = setup('suspended');
    const rates = (x: { ctx: FakeCtx; e: SfxEngine }): number[] => {
      for (let i = 0; i < 12; i++) { x.e.tick(0.1, 0); x.e.playAt('mg', 0, 0, 1, 1); }
      return x.ctx.sources.map((s) => s.playbackRate.value);
    };
    const ra = rates(a);
    expect(ra.length).toBe(12);
    expect(new Set(ra).size).toBeGreaterThan(8);
    for (const r of ra) expect(Math.abs(r - 1)).toBeLessThanOrEqual(SFX_TABLE.mg.rateJitter);
    expect(rates(b)).toEqual(ra);
    // 止まっている間に 12 発頼まれたエンジンは、動き出した後の 1 発目が a の 13 発目と同じ rate
    expect(rates(c)).toEqual([]);
    c.ctx.state = 'running';
    for (const x of [a, c]) { x.e.tick(0.1, 0); x.e.playAt('mg', 0, 0, 1, 1); }
    expect(c.ctx.sources[0]!.playbackRate.value).toBe(a.ctx.sources[12]!.playbackRate.value);
  });
  it('止まっている context（suspended・interrupted）では音源を 1 つも作らず、数えるだけ（R2: 積まない）', () => {
    for (const state of ['suspended', 'interrupted', 'closed']) {
      const { ctx, e } = setup(state);
      for (let i = 0; i < 50; i++) { e.tick(0.1, 0); e.playAt('mg', 0, 0, 1, 1); e.playAt('blast_l', 100, 0, 1, 1); e.playFlat('blast_l', 1, 1); }
      expect(ctx.sources.length, state).toBe(0);
      const st = e.stats();
      expect([st.sources, st.idleDrops, st.busy], state).toEqual([0, 150, 0]);
      expect(st.played.reduce((a, b) => a + b, 0), state).toBe(0);
      // 動き出しても、止まっていた間の音は鳴らない
      ctx.state = 'running';
      e.tick(1, 0);
      expect(ctx.sources.length, state).toBe(0);
    }
  });
  it('消音では音源を作らない。消音は master の音量を 0 へ絞るだけで context は止めない（L4）。解くとすぐ戻す', () => {
    const { ctx, e } = setup();
    const g = graph(ctx, e);
    ctx.currentTime = 3;
    e.setMuted(true);
    expect(e.muted).toBe(true);
    expect(g.master.gain.events).toEqual([['cancel', 3], ['target', 0, 3, SFX_MUTE_TIME_CONSTANT_S]]);
    e.setMuted(true); // 変わった時だけ
    expect(g.master.gain.events.length).toBe(2);
    for (let i = 0; i < 10; i++) { e.tick(0.3, 0); e.playAt('mg', 0, 0, 1, 1); e.playFlat('ui_tap', 1, 1); }
    expect(ctx.sources.length).toBe(0);
    expect(e.stats().idleDrops).toBe(20);
    expect([ctx.suspends.length, ctx.resumes.length]).toEqual([0, 0]);
    ctx.currentTime = 4;
    e.setMuted(false);
    expect(g.master.gain.events.slice(2)).toEqual([['cancel', 4], ['set', SFX_MASTER_GAIN, 4]]);
    e.tick(0.3, 0); // 消音の間の UI の音は覚えていない
    expect(ctx.sources.length).toBe(0);
    e.playFlat('ui_tap', 1, 1);
    expect(ctx.sources.length).toBe(1);
  });
  it('標本のまだ無い鍵（S2 から足す音）は鳴らさず、声も使わない', () => {
    const { ctx, e } = setup();
    e.playAt('gun_near', 0, 0, 1, 1);
    e.playFlat('bell', 1, 1);
    expect(ctx.sources.length).toBe(0);
    expect([e.stats().noBuffer, e.stats().busy]).toEqual([2, 0]);
  });
  it('声は 16 本を超えない: 同じ優先の音は 17 本目から捨てる（音源も作らない）', () => {
    const { ctx, e } = setup();
    for (let i = 0; i < 40; i++) { e.tick(0.1, 0); e.playAt('mg', 0, 0, 1, 1); } // 再生の時計は進めない＝どの声も鳴ったまま
    expect(ctx.sources.length).toBe(SFX_VOICES);
    const st = e.stats();
    expect([st.busy, st.maxBusy, st.dropped[SFX_DROP_VOICES]]).toEqual([SFX_VOICES, SFX_VOICES, 40 - SFX_VOICES]);
    expect(ctx.sources.every((s) => !s.stopped)).toBe(true);
    // 再生の時計が進めば声が空く
    ctx.currentTime = 1;
    e.tick(0.1, 0);
    e.playAt('mg', 0, 0, 1, 1);
    expect(ctx.sources.length).toBe(SFX_VOICES + 1);
    expect(e.stats().maxBusy).toBe(SFX_VOICES);
  });
  it('満ちた声を優先の高い音が奪う時は、その声の前の音源を止めてから鳴らす（止めるのはその 1 つだけ）', () => {
    const { ctx, e } = setup();
    const g = graph(ctx, e);
    for (let i = 0; i < SFX_VOICES; i++) { ctx.currentTime = i * 0.001; e.tick(0.1, 0); e.playAt('mg', 0, 0, 1, 1); }
    ctx.currentTime = 0.02;
    e.playAt('blast_l', 0, 0, 1, 1);
    expect(ctx.sources.length).toBe(SFX_VOICES + 1);
    expect(ctx.sources.map((s) => s.stopped)).toEqual([true, ...Array.from({ length: SFX_VOICES }, () => false)]); // 一番古い機銃
    const stolen = ctx.sources[SFX_VOICES]!;
    expect(stolen.outs).toEqual([g.voices[0]]);
    expect(g.voices[0]!.gain.value).toBeCloseTo(SFX_TABLE.blast_l.gain, 6);
    expect(e.stats().busy).toBe(SFX_VOICES);
  });
});

describe('最初の音（R11 の立ち上がり・最初のタップ）', () => {
  it('最初の 1 発だけ、束ねを fromShare から seconds 秒で 1 へ立ち上げる（2 発目からは触らない）', () => {
    const { ctx, e } = setup();
    const g = graph(ctx, e);
    ctx.currentTime = 2;
    e.playFlat('ui_tap', 1, 1);
    expect(g.fade.gain.events).toEqual([['set', SFX_FIRST_FADE.fromShare, 2], ['ramp', 1, 2 + SFX_FIRST_FADE.seconds]]);
    ctx.currentTime = 5;
    e.playFlat('ui_tap', 1, 1);
    e.playAt('blast_l', 0, 0, 1, 1);
    expect(g.fade.gain.events.length).toBe(2);
    expect([SFX_FIRST_FADE.fromShare > 0, SFX_FIRST_FADE.fromShare < 1, SFX_FIRST_FADE.seconds]).toEqual([true, true, 0.3]);
  });
  it('最初のタップ: context が動き出す前の UI の音は 1 つだけ覚え、0.5 秒の内に動き出せば tick が鳴らす（その時に音源を作る）', () => {
    const { ctx, e } = setup('suspended');
    e.playFlat('ui_tap', 1, 1);
    e.playFlat('ui_tap', 1, 1); // 2 つ目は上書き（積まない）
    e.playFlat('blast_l', 1, 1); // UI でない音は覚えない
    e.tick(0.1, 0);
    expect(ctx.sources.length).toBe(0);
    ctx.state = 'running';
    e.tick(0.1, 0);
    expect(ctx.sources.length).toBe(1);
    expect(ctx.sources[0]!.buffer).toBe(ctx.buffers[2]);
    expect(e.stats().pendingPlayed).toBe(1);
    e.tick(0.1, 0); // 1 回だけ
    expect(ctx.sources.length).toBe(1);
  });
  it('最初のタップ: 0.5 秒を過ぎて動き出した時は鳴らさない（遅れた音を出さない）', () => {
    const { ctx, e } = setup('suspended');
    e.playFlat('ui_tap', 1, 1);
    e.tick(SFX_UI_PENDING_S + 0.1, 0);
    ctx.state = 'running';
    e.tick(0.016, 0);
    expect(ctx.sources.length).toBe(0);
    expect(e.stats().pendingPlayed).toBe(0);
  });
});

describe('context を起こす（L2・L3。拒否は握る）', () => {
  it('kick: 動いていなければ resume を頼み、拒否を握る。動いていれば何もしない', () => {
    const { ctx, e } = setup('suspended');
    expect(() => e.kick()).not.toThrow();
    expect(ctx.resumes.length).toBe(1);
    expect(ctx.resumes[0]!.caught).toBe(1);
    ctx.state = 'interrupted';
    e.kick();
    expect(ctx.resumes.length).toBe(2);
    ctx.state = 'running';
    e.kick();
    expect(ctx.resumes.length).toBe(2);
    expect(e.stats().kicks).toBe(2);
  });
  it('resume が何も返さない端末でも落ちない。消音を解く時は止まっている context を起こす', () => {
    const { ctx, e } = setup('suspended');
    (ctx as unknown as { resume: () => undefined }).resume = () => undefined;
    expect(() => e.kick()).not.toThrow();
    const b = setup('suspended');
    b.e.setMuted(true);
    expect(b.ctx.resumes.length).toBe(0);
    b.e.setMuted(false);
    expect(b.ctx.resumes.length).toBe(1);
  });
  it('見張り: running なのに再生の時計が実時間 0.5 秒進まなければ、止めて再開を 1 回。次は 5 秒の後', () => {
    const { ctx, e } = setup();
    ctx.currentTime = 7;
    let wall = 1000;
    const run = (ms: number): void => { for (let t = 0; t < ms; t += 16) { wall += 16; e.tick(0.016, wall); } };
    run(SFX_WATCHDOG.frozenMs - 100);
    expect([ctx.suspends.length, ctx.resumes.length]).toEqual([0, 0]);
    run(400);
    expect([ctx.suspends.length, ctx.resumes.length]).toEqual([1, 1]);
    expect([ctx.suspends[0]!.caught, ctx.resumes[0]!.caught]).toEqual([1, 1]);
    run(SFX_WATCHDOG.throttleMs - 1000); // まだ進まなくても、5 秒の内はもう動かさない
    expect(ctx.suspends.length).toBe(1);
    run(2000);
    expect(ctx.suspends.length).toBe(2);
    expect(e.stats().watchdogKicks).toBe(2);
    // 進まないまま 3 回動かしたらやめる（効かない再開を繰り返さない）。時計が進むのを見たら、次に止まった時はまた動かす
    run(SFX_WATCHDOG.throttleMs * 4);
    expect([ctx.suspends.length, ctx.resumes.length, SFX_WATCHDOG.maxTries]).toEqual([3, 3, 3]);
    ctx.currentTime = 8;
    run(2000);
    expect(ctx.suspends.length).toBe(4);
  });
  it('見張り: 時計が進んでいる・止まっている（suspended）・裏から戻った最初の 1 回（長い間が 1 つ）では動かさない', () => {
    const a = setup();
    let wall = 0;
    for (let i = 0; i < 600; i++) { wall += 16; a.ctx.currentTime += 0.016; a.e.tick(0.016, wall); }
    expect(a.ctx.suspends.length).toBe(0);
    const b = setup('suspended');
    for (let i = 0; i < 600; i++) b.e.tick(0.016, i * 16);
    expect([b.ctx.suspends.length, b.ctx.resumes.length]).toEqual([0, 0]);
    const c = setup();
    c.e.tick(0.016, 1000);
    c.e.tick(0.016, 61000); // 1 分の裏（時計は同じ）: 1 回の間は capMs までしか数えない
    expect(c.ctx.suspends.length).toBe(0);
    expect(SFX_WATCHDOG.capMs).toBeLessThan(SFX_WATCHDOG.frozenMs);
  });
});

describe('口（systems/sfx-bus）: エンジンの登録が無ければ何もしない・聞き手は読むだけ', () => {
  it('エンジンなし（再生の context が無い端末・NOAUDIO）: どの口も投げず、何もしない', () => {
    registerSfxListener({ x: 0, y: 0 });
    expect(() => { sfxUi('ui_tap'); sfxAt('mg', 1, 2); sfxCue('bell'); sfxLoop('engine', 0.5, 1); sfxSetMuted(true); sfxSetMuted(false); }).not.toThrow();
  });
  it('位置つきの音は聞き手（自艇）からの差で鳴らす。聞き手のいない間（世界の作成前・破棄後）は鳴らさない。聞き手には書かない', () => {
    const { ctx, e } = setup();
    registerSfxEngine(e);
    sfxAt('blast_l', 100, 100);
    expect(ctx.sources.length).toBe(0);
    const boat = Object.freeze({ x: 1000, y: 2000 });
    registerSfxListener(boat);
    sfxAt('blast_l', 1450, 2000); // 右へ 450 m ＝帯 1・パン 0.35
    expect(ctx.sources.length).toBe(1);
    expect(graph(ctx, e).voices[0]!.gain.value).toBeCloseTo(SFX_TABLE.blast_l.gain * 0.55, 6);
    expect(ctx.pans[0]!.pan.value).toBeCloseTo(0.35, 6);
    sfxAt('mg', 1000, 2000 + 5000); // 機銃は 4,000 m まで
    expect(ctx.sources.length).toBe(1);
    // 音量の倍率と速さ（S1 の小さい爆発の代わりの音・S2 の沈没の小艇など）: 声の長さも速さで縮む
    ctx.currentTime = 10;
    e.tick(1, 0);
    sfxAt('blast_l', 1000, 2000, 0.45, 1.8);
    expect(ctx.sources.length).toBe(2);
    expect(ctx.sources[1]!.playbackRate.value).toBe(1.8);
    expect(graph(ctx, e).voices[0]!.gain.value).toBeCloseTo(SFX_TABLE.blast_l.gain * 0.45, 6);
    ctx.currentTime = 10 + SFX_TABLE.blast_l.seconds / 1.8 + 0.01;
    expect(e.stats().busy).toBe(0);
    registerSfxListener(null);
    sfxAt('mg', 1000, 2000);
    expect(ctx.sources.length).toBe(2);
  });
  it('sfxUi・sfxCue は位置なし（中央）。sfxCue の遅らせと sfxLoop は S1 では何もしない。sfxSetMuted はエンジンの消音', () => {
    const { ctx, e } = setup();
    registerSfxEngine(e);
    sfxUi('ui_tap');
    sfxCue('blast_l', 0.5);
    expect(ctx.sources.length).toBe(2);
    expect(graph(ctx, e).voices[1]!.gain.value).toBeCloseTo(SFX_TABLE.blast_l.gain * 0.5, 6);
    sfxCue('blast_l', 1, 0.5);
    sfxLoop('engine', 0.5, 1);
    expect(ctx.sources.length).toBe(2);
    sfxSetMuted(true);
    expect(e.muted).toBe(true);
    sfxUi('ui_tap');
    expect(ctx.sources.length).toBe(2);
  });
});
