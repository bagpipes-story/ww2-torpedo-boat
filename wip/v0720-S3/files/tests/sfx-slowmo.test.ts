// v0.7.2 S3（アートと音③：BGM と命中スローの音。spec-v0720 §6・§8.1・brief L28〜L31）: 命中スローの音 systems/sfx-slowmo を、偽の context（tests/sfx-engine-kit・sfx-music-kit）と
// ゲームと同じ道（世界の代わりの残り秒を registerSfxSlowMo に登録 → Hud の MissionSfx の update → systems/sfx-bus の sfxLoops が 1 回読む）で確かめる（道具は tests/sfx-slowmo-kit）。
// - 立ち上がり: 濾波器へ 1 つ（予約の前に消す）・曲の 3 層の rate へ同じ時刻・同じ時定数で 3 つ（層の音源ごとに 1 つずつ）・ループの rate は次の 10 Hz でループの再生が（変わった時だけ）。
//   続く間は 1 つも書かない。立ち下がりで戻す（endTcS）。案 B は濾波器だけ・案 C は何も書かない。単発はどの案も触らない。既定はゲームの案。
// - applySfxSlowRate は目標を書き換えない（観測器の目標・probe の記録は音の状態に依らない）。
// 止まっている context・一時停止・消音・曲オフ・戻す・3 層の同期は tests/sfx-slowmo-flow。
import { afterEach, describe, expect, it } from 'vitest';
import { SFX_LOOP_DRONE, SFX_LOOP_ENGINE, SFX_LOOP_RATE_MIN, SFX_LOOP_TIME_CONSTANT_S } from '../src/config/sfx-config';
import { SFX_SLOW, SFX_SLOW_DEFAULT_ID, SFX_SLOW_IDS } from '../src/config/sfx-music-config';
import { LOOP_ENGINE, SFX_LOOP_COUNT, createSfxLoopTargets } from '../src/core/sfx-loops';
import { registerSfxEngine, registerSfxListener, registerSfxSlowMo } from '../src/systems/sfx-bus';
import { applySfxSlowRate } from '../src/systems/sfx-slowmo';
import { fakeSamples, graph, setup } from './sfx-engine-kit';
import { FRAME_S, unstopped } from './sfx-music-kit';
import { SH, SLOW_S, frames, lastRate, loopSrcs, mission, untilBed } from './sfx-slowmo-kit';

afterEach(() => {
  registerSfxEngine(null);
  registerSfxListener(null);
  registerSfxSlowMo(null);
});

describe('立ち上がりと立ち下がり（書くのは変わった時だけ）', () => {
  it('案 A: 立ち上がりで濾波器 1・曲の 3 層に同じ時刻と時定数で 3（層の音源ごと）・ループの rate は次の 10 Hz で（倍率 × 目標）。続く間は 0。立ち下がりで素通しと 1 へ（endTcS）', () => {
    const m = mission('running', 'A');
    frames(m, 3.5);
    const g = graph(m.x.ctx, m.x.e);
    const mus = unstopped(m.x);
    const loops = loopSrcs(m.x.ctx);
    expect([mus.length, loops.length, g.bed.frequency.events.length]).toEqual([3, 5, 0]);
    const loopRate0 = loops.map(lastRate);
    const gainEv0 = g.loops.map((n) => n.gain.events.length);
    m.world.slowMoLeftS = SLOW_S; // 命中（世界がこのフレームに入れる）
    frames(m, FRAME_S);
    const t0 = m.x.ctx.currentTime;
    expect(g.bed.frequency.events).toEqual([['cancel', t0], ['target', SFX_SLOW.A.filterHz, t0, SH.filterTcS]]);
    for (const s of mus) expect(s.playbackRate.events).toEqual([['cancel', t0], ['target', SFX_SLOW.A.musicRate, t0, SH.rateTcS]]);
    frames(m, 0.1); // ループの再生の次の 10 Hz
    loops.forEach((s, i) => {
      expect(s.playbackRate.events.slice(-1)[0]![0]).toBe('target');
      expect(lastRate(s)).toBeCloseTo(loopRate0[i]! * SFX_SLOW.A.loopRate, 9);
      expect(s.playbackRate.events.slice(-1)[0]![3]).toBe(SFX_LOOP_TIME_CONSTANT_S);
    });
    expect(g.loops.map((n) => n.gain.events.length)).toEqual(gainEv0); // 音量は書かない
    const snap = (): number[] => [g.bed.frequency.events.length, ...mus.map((s) => s.playbackRate.events.length), ...loops.map((s) => s.playbackRate.events.length), m.x.e.stats().slow.writes];
    const during = snap();
    frames(m, 0.8);
    expect(snap()).toEqual(during);
    const t1 = untilBed(m, 1);
    expect(t1 - t0).toBeCloseTo(SLOW_S, 1);
    expect(g.bed.frequency.events.slice(-2)).toEqual([['cancel', t1], ['target', SH.idleHz, t1, SH.endTcS]]);
    for (const s of mus) expect(s.playbackRate.events.slice(-2)).toEqual([['cancel', t1], ['target', 1, t1, SH.endTcS]]);
    frames(m, 0.12);
    loops.forEach((s, i) => expect(lastRate(s)).toBeCloseTo(loopRate0[i]!, 9));
    const st = m.x.e.stats().slow;
    expect([st.on, st.shown, st.rises, st.writes, st.filterHz, st.musicRate, st.loopFactor]).toEqual([false, null, 1, 2 * (1 + 3), SH.idleHz, 1, 1]);
  });
  it('案 B は濾波器だけ（曲とループの rate はそのまま）・案 C は何も書かない（v0.7.1 と同じ）。単発（魚雷の命中）はどの案も声へ・濾波器を通らない', () => {
    for (const id of ['B', 'C'] as const) {
      const m = mission('running', id);
      frames(m, 3.5);
      const g = graph(m.x.ctx, m.x.e);
      const mus = unstopped(m.x);
      const loopEv = (): number => loopSrcs(m.x.ctx).reduce((n, s) => n + s.playbackRate.events.length, 0);
      const l0 = loopEv();
      m.world.slowMoLeftS = SLOW_S;
      const n0 = m.x.ctx.sources.length;
      m.x.e.playAt('torp_hit', 600, 0, 1, 1);
      const shot = m.x.ctx.sources[n0]!;
      frames(m, SLOW_S + 0.5);
      expect(g.bed.frequency.events.filter((e) => e[0] === 'target').map((e) => e[1]), id).toEqual(id === 'B' ? [SFX_SLOW.B.filterHz, SH.idleHz] : []);
      for (const s of mus) expect(s.playbackRate.events, id).toEqual([]);
      expect(loopEv(), id).toBe(l0);
      expect([shot.loop, shot.buffer!.length, g.voices.some((v) => shot.outs.includes(v))], id).toEqual([false, fakeSamples('torp_hit').length, true]);
      expect(m.x.e.stats().slow.rises, id).toBe(1);
    }
    expect([SFX_SLOW.C.filterHz, SFX_SLOW.C.loopRate, SFX_SLOW.C.musicRate, SFX_SLOW.B.loopRate, SFX_SLOW.B.musicRate]).toEqual([SH.idleHz, 1, 1, 1, 1]);
  });
  it('既定はゲームの案（SFX_SLOW_DEFAULT_ID）。ループの最小の rate（止まったエンジンの揺れの底）× どの案の倍率も SFX_LOOP_RATE_MIN 以上（ループの再生で切られない）', () => {
    const x = setup();
    expect(x.e.stats().slow).toMatchObject({ variant: SFX_SLOW_DEFAULT_ID, on: false, shown: null, rises: 0, writes: 0, filterHz: SH.idleHz, musicRate: 1, loopFactor: 1 });
    const minLoop = Math.min(...SFX_SLOW_IDS.map((id) => SFX_SLOW[id].loopRate));
    const wob = Math.max(SFX_LOOP_ENGINE.damagedWobble, ...SFX_LOOP_ENGINE.stageWobble);
    expect(SFX_LOOP_ENGINE.rateBase * (1 - wob) * minLoop).toBeGreaterThanOrEqual(SFX_LOOP_RATE_MIN);
    expect(SFX_LOOP_DRONE.rateMin * minLoop).toBeGreaterThanOrEqual(SFX_LOOP_RATE_MIN);
  });
});

describe('applySfxSlowRate（純粋・確保しない）', () => {
  it('倍率 1 は目標をそのまま返す（写さない）。ほかは out に音量をそのまま・rate × 倍率で書いて out を返す。目標そのものは書き換えない（観測器の目標・probe の記録は音の状態に依らない）', () => {
    const src = createSfxLoopTargets();
    const out = createSfxLoopTargets();
    for (let i = 0; i < SFX_LOOP_COUNT; i++) { src.gain[i] = 0.1 * (i + 1); src.rate[i] = 1 + 0.1 * i; }
    const copy = [Array.from(src.gain), Array.from(src.rate)];
    expect(applySfxSlowRate(src, 1, out)).toBe(src);
    expect(Array.from(out.rate)).toEqual([1, 1, 1, 1, 1]);
    expect(applySfxSlowRate(src, 0.8, out)).toBe(out);
    expect(Array.from(out.gain)).toEqual(copy[0]);
    for (let i = 0; i < SFX_LOOP_COUNT; i++) expect(out.rate[i]).toBeCloseTo(copy[1]![i]! * 0.8, 12);
    expect([Array.from(src.gain), Array.from(src.rate)]).toEqual(copy);
    // MissionSfx の目標（probe が読む）はスローの間も観測器の値のまま
    const m = mission('running', 'A');
    frames(m, 1);
    const own = (m.sfx as unknown as { loopTargets: { rate: Float64Array } }).loopTargets.rate;
    const before = own[LOOP_ENGINE];
    m.world.slowMoLeftS = SLOW_S;
    frames(m, 0.5);
    expect(own[LOOP_ENGINE]).toBe(before);
  });
});
