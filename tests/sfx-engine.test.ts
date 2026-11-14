// v0.7.1 S1（アートと音②：合成の効果音。spec-v0710 §7・§9.1・§11 の R1・R2・R11・§14 L4）: 再生の薄い層 systems/sfx-engine を偽の context（tests/sfx-engine-kit）で確かめる。
// S3 で 3 つに分けた: ここ＝つなぎ・単発・最初の音／tests/sfx-engine-wake＝context を起こす・見張り・口（systems/sfx-bus）／tests/sfx-engine-loops＝ループ。
// - つなぎ: 声 16 本（音量 → パン → 単発の束）→ リミッタ → 立ち上がり → master → 出口。ループ 5 本 → ループの束 → master（S3: リミッタを通さない）。パンの無い端末は中央（R7）。
// - 止まっている context・消音では音源を 1 つも作らない（数えるだけ＝R2）。
// - 声は 16 本を超えない。奪った声の前の音源は止める。1 発ごとに作るのは音源 1 個だけ（声・束は増えない＝R1）。
// - 最初の 1 発は束ねを立ち上げる（R11）。最初のタップ（context が動き出す前の UI の音）は 1 つだけ覚えて、0.5 秒の内に動き出せば鳴らす。
// - S2: 標本は後から 1 本ずつ入る＝まだ無い鍵は鳴らさないだけ（rate の揺れは標本の有無に依らず頼まれた順に引く）。確かめの口 tap は落とす前に全部の頼みを知らせる。
// - 消音は master の音量（context は止めない＝L4）。tick の実時間は 0 にする（見張りを動かさない）。
import { afterEach, describe, expect, it } from 'vitest';
import { SFX_FIRST_FADE, SFX_LIMITER, SFX_LOOP_BUS_GAIN, SFX_MASTER_GAIN, SFX_MUTE_TIME_CONSTANT_S, SFX_SAMPLE_RATE, SFX_TABLE, SFX_UI_PENDING_S, SFX_VOICES } from '../src/config/sfx-config';
import { MUSIC_PLAYER } from '../src/config/sfx-music-config';
import { SFX_LOOP_COUNT } from '../src/core/sfx-loops';
import { SFX_DROP_VOICES, sfxKeyIndex } from '../src/core/sfx-mix';
import { registerSfxEngine, registerSfxListener } from '../src/systems/sfx-bus';
import type { SfxCtx } from '../src/systems/sfx-audio-types';
import { SfxEngine } from '../src/systems/sfx-engine';
import { FakeCtx, KEYS, graph, setup } from './sfx-engine-kit';
afterEach(() => {
  registerSfxEngine(null);
  registerSfxListener(null);
});

describe('つなぎ（spec §7.1・§7.3。作るのは起動時だけ）', () => {
  it('声 16 本（音量 → パン → 単発の束）→ リミッタ → 立ち上がり → master → 出口。ループ 5 本 → ループの束 → master（リミッタを通さない）。リミッタと master は config の値', () => {
    const { ctx, e } = setup();
    const g = graph(ctx, e);
    // v0.7.2 S1: ＋曲の束・下げる音量・音量の節 MUSIC_PLAYER.slots 本（曲のつなぎは tests/sfx-engine-music）
    expect([ctx.gains.length, ctx.pans.length, ctx.limiters.length]).toEqual([SFX_VOICES + 4 + SFX_LOOP_COUNT + 2 + MUSIC_PLAYER.slots, SFX_VOICES, 1]);
    expect(g.voices.length).toBe(SFX_VOICES);
    g.voices.forEach((v, i) => {
      expect(v.outs).toEqual([ctx.pans[i]]);
      expect(ctx.pans[i]!.outs).toEqual([g.shots]);
    });
    expect(g.shots.outs).toEqual([g.limiter]);
    expect(g.limiter.outs).toEqual([g.fade]);
    expect(g.fade.outs).toEqual([g.master]);
    expect(g.master.outs).toEqual([ctx.destination]);
    // S3: ループの束は master へ直に（リミッタ・最初の音の立ち上がりを通さない）。ループごとの音量は 0 から・音源は任務が始めるまで無い
    expect(g.loopBus.outs).toEqual([g.master]);
    expect(g.loopBus.gain.value).toBe(SFX_LOOP_BUS_GAIN);
    expect(g.loops.length).toBe(SFX_LOOP_COUNT);
    for (const l of g.loops) expect([l.outs, l.gain.value]).toEqual([[g.loopBus], 0]);
    expect(ctx.sources.length).toBe(0);
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
  it('標本は後から入る（S2。Boot の後 1 フレームに 1 本）: まだ無い鍵は投げずに落とし、入った後は鳴る。rate の揺れは標本の有無に依らず頼まれた順', () => {
    const a = setup();
    const ctx = new FakeCtx();
    ctx.state = 'running';
    const late = new SfxEngine(ctx satisfies SfxCtx);
    const buf = (k: 'mg' | 'ui_tap'): Float32Array => new Float32Array(Math.round(SFX_TABLE[k].seconds * SFX_SAMPLE_RATE)).fill(0.5);
    late.setBuffer('ui_tap', buf('ui_tap')); // Boot で作るのは ui_tap だけ
    expect(late.stats().buffers).toBe(1);
    for (let i = 0; i < 5; i++) { for (const e of [a.e, late]) { e.tick(0.1, 0); expect(() => e.playAt('mg', 0, 0, 1, 1)).not.toThrow(); } }
    expect(ctx.sources.length).toBe(0);
    expect([late.stats().noBuffer, late.stats().busy, late.stats().idleDrops]).toEqual([5, 0, 0]);
    late.playFlat('ui_tap', 1, 1); // 最初からある鍵は鳴る
    expect(ctx.sources.length).toBe(1);
    late.setBuffer('mg', buf('mg')); // 数フレーム後に入った
    for (const e of [a.e, late]) { e.tick(0.1, 0); e.playAt('mg', 0, 0, 1, 1); }
    expect(ctx.sources.length).toBe(2);
    expect(ctx.sources[1]!.playbackRate.value).toBe(a.ctx.sources[5]!.playbackRate.value); // 6 発目の揺れ
    expect(late.stats().buffers).toBe(2);
  });
  it('確かめの口 tap（S2 の probe）: 頼まれた単発を、揺れの後・落とす前に全部知らせる（止まっている context・消音・標本なしでも同じ列）。ふだんは null', () => {
    type Row = [string, number, number, number, number, number, boolean];
    const run = (state: string, muted: boolean): Row[] => {
      const { e } = setup(state);
      expect(e.tap).toBeNull();
      const rows: Row[] = [];
      e.tap = (key, dx, dy, rate, mul, minS, flat) => { rows.push([key, dx, dy, rate, mul, minS, flat]); };
      e.setMuted(muted);
      e.tick(0.5, 0);
      e.playAt('mg', 30, -40, 1, 1);
      e.playAt('mg', 30, -40, 1, 1); // 最小間隔で落ちる音も知らせる
      e.playAt('gun_far', 0, 9000, 1, 1); // 標本の無い鍵も
      e.playAt('blast_l', 5, 6, 1.3, 0.7, 0.3);
      e.playFlat('ui_tap', 1, 0.5);
      expect(e.clockS).toBeCloseTo(0.5, 9);
      return rows;
    };
    const rows = run('running', false);
    expect(rows.map((r) => r[0])).toEqual(['mg', 'mg', 'gun_far', 'blast_l', 'ui_tap']);
    expect(rows[3]).toEqual(['blast_l', 5, 6, 1.3, 0.7, 0.3, false]);
    expect(rows[4]).toEqual(['ui_tap', 0, 0, 1, 0.5, 0, true]);
    expect(Math.abs(rows[0]![3] - 1)).toBeLessThanOrEqual(SFX_TABLE.mg.rateJitter);
    expect(rows[0]![3]).not.toBe(rows[1]![3]);
    expect(run('suspended', false)).toEqual(rows);
    expect(run('running', true)).toEqual(rows);
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
