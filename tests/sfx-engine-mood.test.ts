// v0.7.2 S2（アートと音③：BGM と命中スローの音。spec-v0720 §4.2・§4.6・§5・§8.1・brief L19・L22・L24）: 任務の曲（3 層の家族）・段・下げる（ducking）・一時停止の一瞬（L24）を、
// 偽の context（tests/sfx-engine-kit・sfx-music-kit）で確かめる（S1 の場面・消音・試聴は tests/sfx-engine-music）。
// - 家族の 3 層は標本がそろってから同じ when で始め、今の段の音量へ missionInS で上げる。段は変わった時だけ 3 層に書く（時定数は core/sfx-music-mood）。止まっている間は覚えるだけ。
// - 下げる（ducking）は tests/sfx-music-duck。
// - 一時停止を context が止まっている間に頼まれた・一時停止のまま動き出した: 動き出した最初のフレームで束を今すぐ 0（時定数で絞らない）。
// - ランダムな移り（任務・メニュー・試聴・段・消音・曲・一時停止・止まる）でも、どの時点も鳴っている曲の音源 ≤ 6・stop は 1 音源 1 回・最後に start − stop が合う。
import { afterEach, describe, expect, it } from 'vitest';
import {
  MUSIC_CTX_LAB, MUSIC_CTX_MENU, MUSIC_CTX_MISSION, MUSIC_CTX_NONE, MUSIC_FADE, MUSIC_LAYER_KEYS, MUSIC_LENGTHS, MUSIC_MAX_SOURCES, MUSIC_MOOD_BATTLE, MUSIC_MOOD_QUIET, MUSIC_MOOD_SINK, MUSIC_MOOD_TENSE, MUSIC_PLAYER,
} from '../src/config/sfx-music-config';
import { MUSIC_TITLE_DEFAULT_ID } from '../src/assets/sfx-music-themes';
import { SeededRng } from '../src/core/rng';
import { musicMoodGain, musicMoodTc } from '../src/core/sfx-music-mood';
import { registerSfxEngine, registerSfxListener, sfxMusicMood } from '../src/systems/sfx-bus';
import { MissionSfx, SFX_SCENE_EV_SHUTDOWN } from '../src/systems/sfx-mission';
import { type FakeGain, type FakeSource, graph, setup } from './sfx-engine-kit';
import { tel } from './sfx-loops-kit';
import { FRAME_S, LEAD, TC, alive, musicSrcs, put, putFamily, run, sceneEvents, unstopped } from './sfx-music-kit';

afterEach(() => {
  registerSfxEngine(null);
  registerSfxListener(null);
});
const Q = MUSIC_MOOD_QUIET, T = MUSIC_MOOD_TENSE, B = MUSIC_MOOD_BATTLE;
type X = ReturnType<typeof setup>;
/** 鳴っている家族の 3 層の音量の節（層の順＝音源の buffer の長さで並べ替えない。始めた順） */
function familySlots(x: X): FakeGain[] {
  const slots = graph(x.ctx, x.e).music.slots;
  return unstopped(x).map((s) => slots.find((n) => s.outs.includes(n))!);
}
/** 家族を鳴らし始めて 3 秒（最初の上げの後） */
function playing(state = 'running'): X {
  const x = setup(state);
  putFamily(x);
  x.e.music.request(MUSIC_CTX_MISSION);
  run(x, 3);
  return x;
}
const lastTwo = (g: FakeGain): unknown[] => g.gain.events.slice(-2);

describe('任務の家族（3 層・同じ when）', () => {
  it('3 層がそろうまで始めない。そろった次の 10 Hz で同じ when・L0・L1・L2 の順に繰り返す音源 3 個、音量は 0 から今の段（静か）の音量へ missionInS で', () => {
    const x = setup();
    put(x, MUSIC_LAYER_KEYS[0]!);
    put(x, MUSIC_LAYER_KEYS[1]!);
    x.e.music.request(MUSIC_CTX_MISSION);
    run(x, 1);
    expect(musicSrcs(x.ctx).length).toBe(0);
    put(x, MUSIC_LAYER_KEYS[2]!);
    run(x, 0.12);
    const s = unstopped(x);
    expect(s.length).toBe(3);
    expect(s.map((v) => v.buffer!.length)).toEqual(MUSIC_LAYER_KEYS.map((k) => MUSIC_LENGTHS[k]));
    expect(new Set(s.map((v) => v.started)).size).toBe(1);
    expect(s.every((v) => v.loop)).toBe(true);
    const slots = familySlots(x);
    slots.forEach((g, i) => {
      const ev = g.gain.events;
      expect(ev.slice(-3)).toEqual([['cancel', ev[ev.length - 3]![1]], ['set', 0, ev[ev.length - 3]![1]], ['target', musicMoodGain(i, Q), s[0]!.started, MUSIC_FADE.missionInS * TC]]);
      expect(s[0]!.started).toBeCloseTo(ev[ev.length - 3]![1]! + LEAD, 9);
    });
    expect(x.e.music.stats().sources).toBe(3);
  });
  it('段は変わった時だけ 3 層に書く（予約の前に消す・時定数は core/sfx-music-mood）。同じ段の頼み直し・10 秒回しても書かない', () => {
    const x = playing();
    const slots = familySlots(x);
    const w0 = x.e.music.writes;
    const steps: [number, number][] = [[T, Q], [B, T], [T, B], [Q, T], [B, Q], [MUSIC_MOOD_SINK, B]];
    for (const [to, from] of steps) {
      const now = x.ctx.currentTime;
      sfxMusicMood(to); // エンジンの登録が無い口は何もしない
      registerSfxEngine(x.e);
      sfxMusicMood(to);
      slots.forEach((g, i) => expect(lastTwo(g)).toEqual([['cancel', now], ['target', musicMoodGain(i, to), now, musicMoodTc(from, to)]]));
      const w = x.e.music.writes;
      sfxMusicMood(to);
      run(x, 10);
      expect(x.e.music.writes).toBe(w);
      registerSfxEngine(null);
    }
    expect(x.e.music.writes - w0).toBe(3 * steps.length);
    expect(musicMoodTc(B, MUSIC_MOOD_SINK)).toBe(2.5 * MUSIC_PLAYER.fadeTc);
    expect(slots.map((_, i) => musicMoodGain(i, MUSIC_MOOD_SINK))).toEqual([0, 0, 0]);
  });
  it('止まっている間の段は覚えるだけ（1 つも書かない）。動き出した次の 10 Hz で今の段へ。家族がまだ鳴っていなければ、始める時にその段の音量へ', () => {
    const x = playing();
    const slots = familySlots(x);
    const n = slots.map((g) => g.gain.events.length);
    x.ctx.state = 'suspended';
    x.e.music.setMood(B);
    run(x, 1);
    expect(slots.map((g) => g.gain.events.length)).toEqual(n);
    x.ctx.state = 'running';
    run(x, 0.12);
    slots.forEach((g, i) => expect(g.gain.events.slice(-1)[0]!.slice(0, 2)).toEqual(['target', musicMoodGain(i, B)]));
    const y = setup();
    y.e.music.request(MUSIC_CTX_MISSION);
    y.e.music.setMood(T);
    putFamily(y);
    run(y, 0.12);
    familySlots(y).forEach((g, i) => expect(g.gain.events.slice(-1)[0]!.slice(0, 2)).toEqual(['target', musicMoodGain(i, T)]));
  });
  it('場面が替わると段は静かに戻る（前の任務の戦闘・沈み始めのまま次の任務を始めない）', () => {
    const x = playing();
    x.e.music.setMood(MUSIC_MOOD_SINK);
    x.e.music.request(MUSIC_CTX_MENU);
    expect(x.e.music.stats().mood).toBe(Q);
    x.e.music.request(MUSIC_CTX_MISSION);
    run(x, 2);
    familySlots(x).forEach((g, i) => expect(g.gain.events.slice(-1)[0]!.slice(0, 2)).toEqual(['target', musicMoodGain(i, Q)]));
  });
  it('MissionSfx: update が段を渡す（発見で緊張・照らされて戦闘・沈み始めで 0 へ）。SHUTDOWN で外す', () => {
    const x = setup();
    registerSfxEngine(x.e);
    putFamily(x);
    const ev = sceneEvents();
    const sfx = new MissionSfx(ev, 40);
    const frames = (t: ReturnType<typeof tel>, s: number): void => { for (let i = Math.round(s / FRAME_S); i > 0; i--) { x.ctx.currentTime += FRAME_S; x.e.tick(FRAME_S, 0); sfx.update(t, FRAME_S * 1000); } };
    frames(tel(), 1);
    expect(unstopped(x).length).toBe(3);
    frames(tel({ playerDetected: true }), 0.3);
    expect([x.e.music.stats().mood, x.e.music.stats().shownMood]).toEqual([T, T]);
    frames(tel({ playerDetected: true, illuminated: true }), 0.3);
    expect(x.e.music.stats().shownMood).toBe(B);
    frames(tel({ hp: 0 }), 0.1);
    expect(x.e.music.stats().shownMood).toBe(MUSIC_MOOD_SINK);
    familySlots(x).forEach((g) => expect(g.gain.events.slice(-1)[0]).toEqual(['target', 0, g.gain.events.slice(-1)[0]![2], musicMoodTc(B, MUSIC_MOOD_SINK)]));
    ev.fire(SFX_SCENE_EV_SHUTDOWN);
    expect(x.e.music.stats().want).toBe(MUSIC_CTX_NONE);
  });
});

describe('一時停止の一瞬（brief L24）', () => {
  it('context が止まっている間に一時停止（裏へ回った）: 書かずに覚え、動き出した最初のフレームで束を今すぐ 0（時定数で絞らない）。再開で戻す', () => {
    const x = playing();
    const bus = graph(x.ctx, x.e).music.bus.gain;
    const n = bus.events.length;
    x.ctx.state = 'suspended';
    x.e.music.setPaused(true);
    run(x, 2);
    expect(bus.events.length).toBe(n);
    x.ctx.state = 'running';
    x.ctx.currentTime += FRAME_S;
    x.e.tick(FRAME_S, 0); // 動き出した最初のフレーム（10 Hz を待たない）
    const now = x.ctx.currentTime;
    expect(bus.events.slice(n)).toEqual([['cancel', now], ['set', 0, now]]);
    run(x, 1);
    expect(bus.events.length).toBe(n + 2);
    const t = x.ctx.currentTime;
    x.e.music.setPaused(false);
    expect(bus.events.slice(-2)).toEqual([['cancel', t], ['target', 1, t, MUSIC_FADE.pauseS * TC]]);
    expect(unstopped(x).length).toBe(3);
  });
  it('一時停止の後に context が止まり、一時停止のまま動き出した: 最初のフレームで束を今すぐ 0（止まる前の絞りの残りを聞かせない）。一時停止でない blur は書かない', () => {
    const x = playing();
    const bus = graph(x.ctx, x.e).music.bus.gain;
    x.e.music.setPaused(true);
    expect(bus.events.slice(-1)[0]![0]).toBe('target');
    const n = bus.events.length;
    x.ctx.state = 'suspended';
    run(x, 1);
    x.ctx.state = 'running';
    run(x, FRAME_S);
    expect(bus.events.slice(n)).toEqual([['cancel', x.ctx.currentTime], ['set', 0, x.ctx.currentTime]]);
    const y = playing();
    const yb = graph(y.ctx, y.e).music.bus.gain;
    const m = yb.events.length;
    y.ctx.state = 'suspended';
    run(y, 1);
    y.ctx.state = 'running';
    run(y, 1);
    expect(yb.events.length).toBe(m);
  });
});

describe('移りの数（spec §4.2）: 任務の家族を含むランダムな移り', () => {
  it('ランダムな移り 12 回 × 20 種（メニュー・任務・Result の遅らせ・試聴の場の候補と家族・段・消音・曲・一時停止・止まる）: どの時点も鳴っている ≤ 6・組は 3 層まで・stop は 1 音源 1 回・最後に start − stop が合う', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const x = setup();
      for (const k of ['title_a', 'title_d', 'title_e'] as const) put(x, k);
      putFamily(x);
      const rng = new SeededRng(seed + 100);
      let stopCalls = 0;
      const wrap = (s: FakeSource): void => { const st = s.stop.bind(s); s.stop = (w?: number) => { if (s.stopped) throw new Error('stop を 2 回'); stopCalls++; st(w); }; };
      const create = x.ctx.createBufferSource.bind(x.ctx);
      x.ctx.createBufferSource = () => { const s = create(); wrap(s); return s; };
      const acts: ((r: number) => void)[] = [
        () => x.e.music.request(MUSIC_CTX_MENU), () => x.e.music.request(MUSIC_CTX_MISSION), () => x.e.music.request(MUSIC_CTX_MISSION), () => x.e.music.request(MUSIC_CTX_MENU, MUSIC_FADE.resultLostDelayS),
        () => x.e.music.release(MUSIC_CTX_MISSION), () => x.e.music.request(MUSIC_CTX_LAB), (r) => x.e.music.audition((['title_a', 'title_d', 'mission_l0', null] as const)[Math.floor(r * 4)]!),
        (r) => x.e.music.setMood(Math.floor(r * 4)), (r) => x.e.music.setMood(Math.floor(r * 3)), (r) => x.e.setMuted(r < 0.4), (r) => x.e.music.setEnabled(r < 0.75), (r) => x.e.music.setPaused(r < 0.5),
        (r) => { x.ctx.state = r < 0.8 ? 'running' : 'suspended'; },
      ];
      let maxAlive = 0;
      for (let i = 0; i < 12; i++) {
        acts[Math.floor(rng.next() * acts.length)]!(rng.next());
        for (let f = Math.floor(rng.next() * 100); f >= 0; f--) {
          run(x, FRAME_S);
          const a = alive(x).length;
          if (a > maxAlive) maxAlive = a;
          expect(a, `seed ${seed}`).toBeLessThanOrEqual(MUSIC_MAX_SOURCES);
          expect(unstopped(x).length, `seed ${seed}`).toBeLessThanOrEqual(MUSIC_PLAYER.layersMax);
          const u = unstopped(x);
          if (u.length > 1) expect(new Set(u.map((s) => s.started)).size, `seed ${seed}`).toBe(1); // 組の音源は同じ when
        }
      }
      x.ctx.state = 'running';
      x.e.music.request(MUSIC_CTX_NONE);
      run(x, 2);
      const st = x.e.music.stats();
      expect([st.starts, alive(x).length, unstopped(x).length], `seed ${seed}`).toEqual([st.stops, 0, 0]);
      expect(stopCalls).toBe(st.stops);
      expect(musicSrcs(x.ctx).length).toBe(st.starts);
    }
  });
  it('すばやいメニュー ⇄ 任務の往復（3 組が重なる）でも鳴っている ≤ 6: 新しい組は止めかけの組が鳴り終わる次の 10 Hz まで待つ', () => {
    const x = setup();
    put(x, MUSIC_TITLE_DEFAULT_ID);
    putFamily(x);
    x.e.music.request(MUSIC_CTX_MISSION);
    run(x, 2);
    x.e.music.request(MUSIC_CTX_MENU); // 任務の 3 層は 0.5 秒で止めかけ・メニューの 1 本
    run(x, 0.2);
    x.e.music.request(MUSIC_CTX_MISSION); // メニューは 1.2 秒で止めかけ・止めかけの任務の組（3）もまだ鳴っている → 3 ＋ 1 ＋ 3 = 7 にしない
    let max = 0;
    let startedAt = NaN;
    for (let i = 0; i < 120; i++) {
      run(x, FRAME_S);
      max = Math.max(max, alive(x).length);
      if (Number.isNaN(startedAt) && unstopped(x).length === 3) startedAt = x.ctx.currentTime;
    }
    expect(max).toBeLessThanOrEqual(MUSIC_MAX_SOURCES);
    expect(unstopped(x).length).toBe(3);
    expect(startedAt).toBeLessThan(1.2 + 2.5);
  });
});
