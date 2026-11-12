// v0.7.1 S1（アートと音②：合成の効果音。spec-v0710 §7.2・§14 L2・L3）: context を起こす口と見張り、ゲームの口 systems/sfx-bus（S3 で tests/sfx-engine から分けた。偽の context は tests/sfx-engine-kit）。
// - resume の拒否は握る（L2）。見張り（L3c）は running なのに時計が 0.5 秒進まない時だけ、止めて再開を 1 回。
// - 口: エンジンの登録が無ければどれも何もしない。位置つきの音は聞き手（自艇）からの差で鳴らし、聞き手には書かない。大砲の口は距離で鍵を選ぶ（S2）。ループの口は tests/sfx-engine-loops。
import { afterEach, describe, expect, it } from 'vitest';
import { SFX_SAMPLE_RATE, SFX_TABLE, SFX_WATCHDOG } from '../src/config/sfx-config';
import { createSfxLoopTargets } from '../src/core/sfx-loops';
import { registerSfxEngine, registerSfxListener, sfxAt, sfxCue, sfxGunAt, sfxLoops, sfxLoopsPaused, sfxLoopsStop, sfxSetMuted, sfxUi } from '../src/systems/sfx-bus';
import type { SfxCtx } from '../src/systems/sfx-audio-types';
import { SfxEngine } from '../src/systems/sfx-engine';
import { FakeCtx, graph, setup } from './sfx-engine-kit';
afterEach(() => {
  registerSfxEngine(null);
  registerSfxListener(null);
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
    expect(() => { sfxUi('ui_tap'); sfxAt('mg', 1, 2); sfxCue('bell'); sfxLoops(createSfxLoopTargets(), 0.2); sfxLoopsPaused(true); sfxLoopsPaused(false); sfxLoopsStop(); sfxSetMuted(true); sfxSetMuted(false); }).not.toThrow();
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
  it('大砲の口 sfxGunAt（S2）: 聞き手から 1,500 m までは gun_near、それより遠ければ gun_far（帯の音量つき）。聞き手のいない間は鳴らさない', () => {
    const ctx = new FakeCtx();
    ctx.state = 'running';
    const e = new SfxEngine(ctx satisfies SfxCtx);
    for (const k of ['gun_near', 'gun_far'] as const) e.setBuffer(k, new Float32Array(Math.round(SFX_TABLE[k].seconds * SFX_SAMPLE_RATE)).fill(0.5));
    registerSfxEngine(e);
    sfxGunAt(0, 0);
    expect(ctx.sources.length).toBe(0);
    registerSfxListener({ x: 100, y: 100 });
    const g = graph(ctx, e);
    sfxGunAt(100, 100 - 1200); // 帯 1 ＝近い音
    expect(ctx.sources[0]!.buffer).toBe(ctx.buffers[0]);
    expect(g.voices[0]!.gain.value).toBeCloseTo(SFX_TABLE.gun_near.gain * 0.55, 6);
    sfxGunAt(100 - 3000, 100); // 帯 2 ＝遠雷・左
    expect(ctx.sources[1]!.buffer).toBe(ctx.buffers[1]);
    expect(g.voices[1]!.gain.value).toBeCloseTo(SFX_TABLE.gun_far.gain * 0.3, 6);
    expect(ctx.pans[1]!.pan.value).toBeCloseTo(-0.7, 6);
    sfxGunAt(100, 100 + 20000); // 16 km より遠い
    expect(ctx.sources.length).toBe(2);
    // sfxAt の 1 発だけの最小間隔（沈没の 2 次の爆発）はエンジンを通って core/sfx-mix に届く
    e.tick(1, 0);
    sfxAt('gun_near', 100, 100);
    e.tick(0.25, 0);
    sfxAt('gun_near', 100, 100, 0.7, 1, 0.3);
    expect(ctx.sources.length).toBe(3);
    e.tick(0.1, 0);
    sfxAt('gun_near', 100, 100, 0.7, 1, 0.3);
    expect(ctx.sources.length).toBe(4);
  });
  it('sfxUi・sfxCue は位置なし（中央）。sfxCue の遅らせは S4 まで何もしない。sfxSetMuted はエンジンの消音', () => {
    const { ctx, e } = setup();
    registerSfxEngine(e);
    sfxUi('ui_tap');
    sfxCue('blast_l', 0.5);
    expect(ctx.sources.length).toBe(2);
    expect(graph(ctx, e).voices[1]!.gain.value).toBeCloseTo(SFX_TABLE.blast_l.gain * 0.5, 6);
    sfxCue('blast_l', 1, 0.5);
    expect(ctx.sources.length).toBe(2);
    sfxSetMuted(true);
    expect(e.muted).toBe(true);
    sfxUi('ui_tap');
    expect(ctx.sources.length).toBe(2);
  });
});
