// v0.7.1 S3（アートと音②：合成の効果音。spec-v0710 §5・§9.1・§11 の R2・R3・R10・§14 L6）: ループ 5 本の再生 systems/sfx-loop-player と、口（systems/sfx-bus の sfxLoops…）・
// 任務の音 systems/sfx-mission を偽の context（tests/sfx-engine-kit）で確かめる。
// - 始めるのは 10 Hz の更新で、context が動いていて・消音でなく・5 本の標本がそろっている時だけ（それまでは音源を 1 つも作らない）。音源は buffer 全体を繰り返す 5 個。
// - 開始と停止は対（任務を何度やり直しても鳴っている音源は 5 個）。止める時は絞ってから。任務の途中の消音は止める・解くと作り直す。
// - ノードへ書くのは 10 Hz まで・変わった時だけ（音量の差 > 0.01・rate の差 > 0.005・0 へは必ず）。止まっている context には書かない。
// - 一時停止はループの束を 0 へ・再開で戻す。MissionSfx は Hud の PAUSE・RESUME・SHUTDOWN を聞き、SHUTDOWN で口を外す。
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { SFX_KEYS, SFX_LOOP_BUS_GAIN, SFX_LOOP_ENGINE, SFX_LOOP_GAIN_EPS, SFX_LOOP_PAUSE_FADE_S, SFX_LOOP_RATE_EPS, SFX_LOOP_RATE_MAX, SFX_LOOP_RATE_MIN, SFX_LOOP_SEA, SFX_LOOP_STOP_FADE_S, SFX_LOOP_TIME_CONSTANT_S, SFX_LOOP_UPDATE_HZ } from '../src/config/sfx-config';
import { LOOP_DRONE, LOOP_ENGINE, LOOP_SEA, SFX_LOOP_COUNT, SFX_LOOP_IDS, createSfxLoopTargets, type SfxLoopTargets } from '../src/core/sfx-loops';
import { ktToMps } from '../src/core/units';
import { registerSfxEngine, registerSfxListener, sfxLoops, sfxLoopsPaused, sfxLoopsStop } from '../src/systems/sfx-bus';
import type { SfxEngine } from '../src/systems/sfx-engine';
import { MissionSfx, SFX_SCENE_EV_PAUSE, SFX_SCENE_EV_RESUME, SFX_SCENE_EV_SHUTDOWN, type SfxSceneEvents } from '../src/systems/sfx-mission';
import { FakeCtx, FakeSource, fakeSamples, graph, setup } from './sfx-engine-kit';
import { tel } from './sfx-loops-kit';

const FRAME_S = 1 / 60, TICK_S = 1 / SFX_LOOP_UPDATE_HZ;
/** ループ 5 本の標本つきのエンジン */
function loopSetup(state = 'running'): { ctx: FakeCtx; e: SfxEngine } {
  const x = setup(state);
  for (const k of SFX_LOOP_IDS) x.e.setBuffer(k, fakeSamples(k));
  return x;
}
/** 目標（engine 0.38・rate 1.2、sea 0.2、ほかは 0） */
function targets(): SfxLoopTargets {
  const t = createSfxLoopTargets();
  t.gain[LOOP_ENGINE] = 0.38;
  t.rate[LOOP_ENGINE] = 1.2;
  t.gain[LOOP_SEA] = 0.2;
  return t;
}
/** frames フレーム進める（再生の時計も進める） */
function run(x: { ctx: FakeCtx; e: SfxEngine }, t: SfxLoopTargets, frames: number, muted = false): void {
  for (let i = 0; i < frames; i++) { x.ctx.currentTime += FRAME_S; x.e.loops.update(t, FRAME_S, muted); }
}
const looped = (ctx: FakeCtx): FakeSource[] => ctx.sources.filter((s) => s.loop);
const alive = (ctx: FakeCtx): FakeSource[] => looped(ctx).filter((s) => !s.stopped);
const targetEvents = (ctx: FakeCtx, e: SfxEngine): number => graph(ctx, e).loops.reduce((n, g) => n + g.gain.events.filter((ev) => ev[0] === 'target').length, 0) + looped(ctx).reduce((n, s) => n + s.playbackRate.events.length, 0);

afterEach(() => {
  registerSfxEngine(null);
  registerSfxListener(null);
});

describe('始める（context が動いていて・消音でなく・標本がそろってから）', () => {
  it('止まっている context では 2 秒たっても音源を作らない。動き出した次の更新で 5 個（buffer 全体を繰り返す・start(0)・音量は 0 から）', () => {
    const x = loopSetup('suspended');
    const t = targets();
    run(x, t, 120);
    expect(x.ctx.sources.length).toBe(0);
    expect([x.e.loops.liveSources, x.e.loops.starts]).toEqual([0, 0]);
    expect(x.e.loops.ticks).toBeGreaterThan(15);
    x.ctx.state = 'running';
    run(x, t, 8);
    const g = graph(x.ctx, x.e);
    expect(x.ctx.sources.length).toBe(SFX_LOOP_COUNT);
    x.ctx.sources.forEach((s, i) => {
      expect([s.loop, s.started, s.stopped]).toEqual([true, 0, false]);
      expect(s.buffer).toBe(x.ctx.buffers[3 + i]); // 単発 3 本の後に作ったループの標本（SFX_LOOP_IDS の順）
      expect(s.buffer!.length).toBe(fakeSamples(SFX_LOOP_IDS[i]!).length);
      expect(s.outs).toEqual([g.loops[i]]);
    });
    // 始める時: 束は SFX_LOOP_BUS_GAIN、ループごとの音量は 0 に置いてから目標へ（時定数 0.08 秒＝立ち上がり）
    const at = g.loops[LOOP_ENGINE]!.gain.events[0]![1]!;
    expect(g.loopBus.gain.events).toEqual([['cancel', at], ['set', SFX_LOOP_BUS_GAIN, at]]);
    expect(g.loops[LOOP_ENGINE]!.gain.events).toEqual([['cancel', at], ['set', 0, at], ['target', 0.38, at, SFX_LOOP_TIME_CONSTANT_S]]);
    expect(g.loops[LOOP_SEA]!.gain.events[2]).toEqual(['target', 0.2, at, SFX_LOOP_TIME_CONSTANT_S]);
    expect(g.loops[LOOP_DRONE]!.gain.events).toEqual([['cancel', at], ['set', 0, at]]); // 目標 0 のままなら書かない
    expect(x.ctx.sources[LOOP_ENGINE]!.playbackRate.events).toEqual([['target', 1.2, at, SFX_LOOP_TIME_CONSTANT_S]]);
    expect(x.ctx.sources[LOOP_SEA]!.playbackRate.events).toEqual([]);
    expect(x.e.stats()).toMatchObject({ loops: 5, loopStarts: 5, loopStops: 0, loopWrites: 3 });
  });
  it('標本が 1 本でもまだ無ければ始めない（起動の直後）。そろった次の更新で始める', () => {
    const x = setup();
    for (const k of SFX_LOOP_IDS.slice(0, 4)) x.e.setBuffer(k, fakeSamples(k));
    run(x, targets(), 60);
    expect(x.ctx.sources.length).toBe(0);
    x.e.setBuffer('drone', fakeSamples('drone'));
    run(x, targets(), 8);
    expect(alive(x.ctx).length).toBe(SFX_LOOP_COUNT);
    expect(SFX_LOOP_IDS.map((k) => SFX_KEYS.indexOf(k))).toEqual([20, 21, 22, 23, 24]);
  });
  it('消音では始めない。任務の途中で消音にしたら絞って止め、解いたら作り直す（鳴っている音源は 5 個のまま）', () => {
    const x = loopSetup();
    const t = targets();
    run(x, t, 60, true);
    expect(x.ctx.sources.length).toBe(0);
    run(x, t, 8, false);
    expect(alive(x.ctx).length).toBe(5);
    run(x, t, 8, true);
    expect([alive(x.ctx).length, x.e.loops.liveSources, x.e.loops.stops]).toEqual([0, 0, 5]);
    for (const s of looped(x.ctx)) expect(s.stopAt - x.ctx.currentTime).toBeGreaterThan(SFX_LOOP_STOP_FADE_S - 0.11);
    run(x, t, 8, false);
    expect([looped(x.ctx).length, alive(x.ctx).length, x.e.loops.starts]).toEqual([10, 5, 10]);
  });
});

describe('目標を書くのは 10 Hz まで・変わった時だけ（R3）', () => {
  it('目標が同じなら 10 秒たっても書くのは始めの 1 回だけ。更新は 10 Hz を超えない', () => {
    const x = loopSetup();
    const t = targets();
    run(x, t, 600);
    expect(targetEvents(x.ctx, x.e)).toBe(3);
    expect(x.e.loops.writes).toBe(3);
    expect(x.e.loops.ticks).toBeLessThanOrEqual(10 * SFX_LOOP_UPDATE_HZ);
    expect(x.e.loops.ticks).toBeGreaterThanOrEqual(10 * SFX_LOOP_UPDATE_HZ - 2);
  });
  it('毎フレーム変わる目標（3 秒で 0 → 0.6・rate 0.75 → 1.5）でも、書くのは 0.1 秒に 1 回まで・時定数 0.08 秒', () => {
    const x = loopSetup();
    const t = createSfxLoopTargets();
    for (let i = 0; i < 180; i++) {
      t.gain[LOOP_ENGINE] = (0.6 * i) / 180;
      t.rate[LOOP_ENGINE] = 0.75 + (0.75 * i) / 180;
      run(x, t, 1);
    }
    const g = graph(x.ctx, x.e).loops[LOOP_ENGINE]!.gain.events.filter((ev) => ev[0] === 'target');
    const r = looped(x.ctx)[LOOP_ENGINE]!.playbackRate.events;
    for (const evs of [g, r]) {
      expect(evs.length).toBeGreaterThan(20);
      expect(evs.length).toBeLessThanOrEqual(3 * SFX_LOOP_UPDATE_HZ);
      for (let i = 1; i < evs.length; i++) expect(evs[i]![2]! - evs[i - 1]![2]!).toBeGreaterThan(TICK_S - 1e-6);
      for (const ev of evs) expect(ev[3]).toBe(SFX_LOOP_TIME_CONSTANT_S);
    }
    expect(x.e.loops.writes).toBe(g.length + r.length);
  });
  it('小さい差（音量 ≤ 0.01・rate ≤ 0.005）は書かない。0 へは小さい差でも必ず書く（鳴りっぱなしにしない）。rate は 0.5〜2 に収める', () => {
    const x = loopSetup();
    const t = targets();
    run(x, t, 12);
    const w0 = x.e.loops.writes;
    t.gain[LOOP_ENGINE] = 0.38 + SFX_LOOP_GAIN_EPS * 0.9;
    t.rate[LOOP_ENGINE] = 1.2 + SFX_LOOP_RATE_EPS * 0.9;
    run(x, t, 12);
    expect(x.e.loops.writes).toBe(w0);
    t.gain[LOOP_ENGINE] = 0.38 + SFX_LOOP_GAIN_EPS * 1.5;
    t.rate[LOOP_ENGINE] = 1.2 - SFX_LOOP_RATE_EPS * 1.5;
    run(x, t, 12);
    expect(x.e.loops.writes).toBe(w0 + 2);
    t.gain[LOOP_SEA] = 0.005;
    run(x, t, 12);
    t.gain[LOOP_SEA] = 0;
    run(x, t, 12);
    const sea = graph(x.ctx, x.e).loops[LOOP_SEA]!.gain.events.filter((ev) => ev[0] === 'target').map((ev) => ev[1]);
    expect(sea).toEqual([0.2, 0.005, 0]);
    t.rate[LOOP_ENGINE] = 9;
    run(x, t, 12);
    t.rate[LOOP_ENGINE] = 0.1;
    run(x, t, 12);
    expect(looped(x.ctx)[LOOP_ENGINE]!.playbackRate.events.slice(-2).map((ev) => ev[1])).toEqual([SFX_LOOP_RATE_MAX, SFX_LOOP_RATE_MIN]);
  });
  it('鳴らした後に context が止まったら（裏へ回った）書かない。戻ったら変わった分だけ書く', () => {
    const x = loopSetup();
    const t = targets();
    run(x, t, 12);
    const w0 = x.e.loops.writes;
    x.ctx.state = 'suspended';
    t.gain[LOOP_ENGINE] = 0.6;
    run(x, t, 60);
    expect([x.e.loops.writes, alive(x.ctx).length]).toEqual([w0, 5]);
    x.ctx.state = 'running';
    run(x, t, 12);
    expect(x.e.loops.writes).toBe(w0 + 1);
  });
});

describe('一時停止・止める（開始と停止は対）', () => {
  it('一時停止でループの束を 0 へ（0.15 秒で約 5%）・再開で戻す。変わった時だけ', () => {
    const x = loopSetup();
    run(x, targets(), 12);
    const bus = graph(x.ctx, x.e).loopBus.gain;
    const n0 = bus.events.length;
    x.ctx.currentTime = 5;
    x.e.loops.setPaused(true);
    x.e.loops.setPaused(true);
    expect(bus.events.slice(n0)).toEqual([['cancel', 5], ['target', 0, 5, SFX_LOOP_PAUSE_FADE_S / 3]]);
    expect(Math.exp(-3)).toBeLessThan(0.06);
    x.ctx.currentTime = 9;
    x.e.loops.setPaused(false);
    expect(bus.events.slice(n0 + 2)).toEqual([['cancel', 9], ['target', SFX_LOOP_BUS_GAIN, 9, SFX_LOOP_PAUSE_FADE_S / 3]]);
    expect(alive(x.ctx).length).toBe(5); // 一時停止では音源を止めない
  });
  it('止める: 5 個の音源を、音量を絞ってから（0.15 秒後に）止める。鳴っていなければ何もしない。一時停止のまま止めても次の任務は束が戻る', () => {
    const x = loopSetup();
    x.e.loops.stop();
    expect(x.e.loops.stops).toBe(0);
    run(x, targets(), 12);
    x.e.loops.setPaused(true);
    x.ctx.currentTime = 20;
    x.e.loops.stop();
    for (const s of looped(x.ctx)) expect([s.stopped, s.stopAt]).toEqual([true, 20 + SFX_LOOP_STOP_FADE_S]);
    for (const g of graph(x.ctx, x.e).loops) expect(g.gain.events.slice(-2)).toEqual([['cancel', 20], ['target', 0, 20, SFX_LOOP_STOP_FADE_S / 3]]);
    expect([x.e.loops.liveSources, x.e.loops.starts, x.e.loops.stops]).toEqual([0, 5, 5]);
    run(x, targets(), 12); // 次の任務
    const bus = graph(x.ctx, x.e).loopBus.gain.events;
    expect(bus[bus.length - 1]![0]).toBe('set');
    expect(bus[bus.length - 1]![1]).toBe(SFX_LOOP_BUS_GAIN);
  });
  it('やり直し 3 回の後も鳴っている音源は 5 個（作った数 − 止めた数＝5。迷子の音源なし）。声・束は増えない', () => {
    const x = loopSetup();
    const nodes = [x.ctx.gains.length, x.ctx.pans.length, x.ctx.limiters.length, x.ctx.buffers.length];
    for (let m = 0; m < 4; m++) {
      if (m > 0) x.e.loops.stop();
      run(x, targets(), 30);
    }
    expect([looped(x.ctx).length, alive(x.ctx).length]).toEqual([20, 5]);
    expect(x.e.stats()).toMatchObject({ loops: 5, loopStarts: 20, loopStops: 15, sources: 0 }); // 単発の音源の数には入れない
    expect([x.ctx.gains.length, x.ctx.pans.length, x.ctx.limiters.length, x.ctx.buffers.length]).toEqual(nodes);
  });
  it('始まる前の一時停止は覚えるだけ: その間に始まれば束は 0 から', () => {
    const x = loopSetup('suspended');
    x.e.loops.setPaused(true);
    const bus = graph(x.ctx, x.e).loopBus.gain;
    expect(bus.events).toEqual([]);
    x.ctx.state = 'running';
    run(x, targets(), 12);
    expect(bus.events[1]!.slice(0, 2)).toEqual(['set', 0]);
    x.e.loops.setPaused(false);
    expect(bus.events[bus.events.length - 1]!.slice(0, 2)).toEqual(['target', SFX_LOOP_BUS_GAIN]);
  });
});

/** 偽のシーンの出来事（on・once・off・emit） */
class FakeEvents implements SfxSceneEvents {
  readonly list: { event: string; fn: () => void; ctx: unknown; once: boolean }[] = [];
  on(event: string, fn: () => void, ctx: unknown): void { this.list.push({ event, fn, ctx, once: false }); }
  once(event: string, fn: () => void, ctx: unknown): void { this.list.push({ event, fn, ctx, once: true }); }
  off(event: string, fn: () => void, ctx: unknown): void {
    for (let i = this.list.length - 1; i >= 0; i--) if (this.list[i]!.event === event && this.list[i]!.fn === fn && this.list[i]!.ctx === ctx) this.list.splice(i, 1);
  }
  emit(event: string): void {
    for (const l of [...this.list]) {
      if (l.event !== event) continue;
      if (l.once) this.list.splice(this.list.indexOf(l), 1);
      l.fn.call(l.ctx);
    }
  }
}

describe('口（sfx-bus）と任務の音（MissionSfx。HudScene が任務ごとに作る）', () => {
  it('エンジンなし（NOAUDIO）でも MissionSfx は投げない。口はエンジンの消音を渡す', () => {
    const ev = new FakeEvents();
    const m = new MissionSfx(ev, 41);
    expect(() => { for (let i = 0; i < 30; i++) m.update(tel({ targetStep: 'full', speedMps: 10 }), 16.7); ev.emit(SFX_SCENE_EV_PAUSE); ev.emit(SFX_SCENE_EV_RESUME); ev.emit(SFX_SCENE_EV_SHUTDOWN); }).not.toThrow();
    const x = loopSetup();
    registerSfxEngine(x.e);
    x.e.setMuted(true);
    for (let i = 0; i < 30; i++) sfxLoops(targets(), FRAME_S);
    expect(x.ctx.sources.length).toBe(0);
    x.e.setMuted(false);
    for (let i = 0; i < 8; i++) sfxLoops(targets(), FRAME_S);
    expect(alive(x.ctx).length).toBe(5);
    sfxLoopsPaused(true);
    expect(graph(x.ctx, x.e).loopBus.gain.events.slice(-1)[0]!.slice(0, 2)).toEqual(['target', 0]);
    sfxLoopsStop();
    expect(alive(x.ctx).length).toBe(0);
  });
  it('毎フレーム: テレメトリ → 目標 → 10 Hz で音源へ（delta は ms）。艇の最大速力（kt）は rate の割合に使う', () => {
    const x = loopSetup();
    registerSfxEngine(x.e);
    const ev = new FakeEvents();
    const m = new MissionSfx(ev, 40);
    const t = tel({ targetStep: 'cruise', speedMps: ktToMps(20) });
    for (let i = 0; i < 12; i++) { x.ctx.currentTime += FRAME_S; m.update(t, 1000 / 60); }
    expect(alive(x.ctx).length).toBe(5);
    const g = graph(x.ctx, x.e);
    expect(g.loops[LOOP_ENGINE]!.gain.events.slice(-1)[0]!.slice(0, 2)).toEqual(['target', SFX_LOOP_ENGINE.gainCruise]);
    expect(g.loops[LOOP_SEA]!.gain.events.slice(-1)[0]![1]).toBeCloseTo(SFX_LOOP_SEA.gainBase + SFX_LOOP_SEA.gainSpeed / 2, 9);
    expect(looped(x.ctx)[LOOP_ENGINE]!.playbackRate.events.slice(-1)[0]![1]).toBeCloseTo(SFX_LOOP_ENGINE.rateBase + SFX_LOOP_ENGINE.rateSpan / 2, 9);
    expect(x.e.loops.ticks).toBe(1); // 12 フレーム＝0.2 秒足らずで更新は 1 回（7 フレーム目）
  });
  it('Hud の PAUSE で束を 0 へ・RESUME で戻す・SHUTDOWN で 5 本を止めて口を外す（Hud のシーンは使い回される＝前の任務の口が残らない）', () => {
    const x = loopSetup();
    registerSfxEngine(x.e);
    const ev = new FakeEvents();
    const m = new MissionSfx(ev, 40);
    expect(ev.list.map((l) => [l.event, l.once, l.ctx === m])).toEqual([[SFX_SCENE_EV_PAUSE, false, true], [SFX_SCENE_EV_RESUME, false, true], [SFX_SCENE_EV_SHUTDOWN, true, true]]);
    for (let i = 0; i < 12; i++) { x.ctx.currentTime += FRAME_S; m.update(tel(), 1000 / 60); }
    const bus = graph(x.ctx, x.e).loopBus.gain;
    ev.emit(SFX_SCENE_EV_PAUSE);
    expect(bus.events.slice(-1)[0]!.slice(0, 2)).toEqual(['target', 0]);
    ev.emit(SFX_SCENE_EV_RESUME);
    expect(bus.events.slice(-1)[0]!.slice(0, 2)).toEqual(['target', SFX_LOOP_BUS_GAIN]);
    ev.emit(SFX_SCENE_EV_PAUSE); // 一時停止の画面から「任務をやめる」
    ev.emit(SFX_SCENE_EV_SHUTDOWN);
    expect([alive(x.ctx).length, x.e.loops.stops, ev.list.length]).toEqual([0, 5, 0]);
    // 次の任務（新しい MissionSfx）: また 5 個・束は戻っている
    const m2 = new MissionSfx(ev, 40);
    for (let i = 0; i < 12; i++) { x.ctx.currentTime += FRAME_S; m2.update(tel(), 1000 / 60); }
    expect([alive(x.ctx).length, bus.events.slice(-1)[0]!.slice(0, 2)]).toEqual([5, ['set', SFX_LOOP_BUS_GAIN]]);
  });
  it('出来事の名前は Phaser のシーンの PAUSE・RESUME・SHUTDOWN と同じ文字（sfx-mission は Phaser を import しない）', () => {
    const ev = (f: string): string => /module\.exports = '(\w+)';/.exec(readFileSync(`node_modules/phaser/src/scene/events/${f}_EVENT.js`, 'utf8'))![1]!;
    expect([SFX_SCENE_EV_PAUSE, SFX_SCENE_EV_RESUME, SFX_SCENE_EV_SHUTDOWN]).toEqual([ev('PAUSE'), ev('RESUME'), ev('SHUTDOWN')]);
    const hud = readFileSync('src/scenes/hud-scene.ts', 'utf8');
    expect(hud).toContain('    this.sfx = new MissionSfx(this.events, getBoatRecord(data, mission.playerBoatId).speed_max_kt);\n');
    expect(hud).toContain('  override update(_time: number, delta: number): void {\n');
    expect(hud).toContain('    this.panel?.update(this.telemetry, this.time.now);\n    this.sfx?.update(this.telemetry, delta); //');
  });
});
