// v0.7.2 S1（アートと音③：BGM と命中スローの音。spec-v0720 §4・§8.1・brief L10〜L13）: 曲の再生 systems/sfx-music-player を偽の context（tests/sfx-engine-kit・sfx-music-kit）で確かめる。
// 作る列と試聴の場は tests/sfx-music-build。
// - つなぎ: 音量の節 → 曲の束 → 下げる音量 → master（単発のリミッタを通さない）。節は 0 から・音源は頼まれるまで無い。
// - 始めるのは running・消音でない・曲がオン・標本がそろった時だけ（L10・L11）。止まっている間は何も書かない。Phaser の blur の suspend・resume では始め直さない。
// - ランダムな 10 回の移りの後も start − stop が合い、どの時点も鳴っている音源 ≤ MUSIC_MAX_SOURCES。stop は 1 音源 1 回だけ。組の音源は同じ when。
// - 場面: release は今の場面の時だけ（Result・Title の create と Hud の SHUTDOWN のどちらの順でも）。遅らせの MENU。同じ場面の頼み直しは何もしない。一時停止。消音・曲オフ（L12）。
// - 10 Hz で変わった時だけ書く。
import { afterEach, describe, expect, it } from 'vitest';
import { MUSIC_CTX_LAB, MUSIC_CTX_MENU, MUSIC_CTX_MISSION, MUSIC_CTX_NONE, MUSIC_FADE, MUSIC_GAIN, MUSIC_MAX_SOURCES, MUSIC_PLAYER } from '../src/config/sfx-music-config';
import { MUSIC_TITLE_DEFAULT_ID } from '../src/assets/sfx-music-themes';
import { SeededRng } from '../src/core/rng';
import { registerSfxEngine, sfxMusic, sfxMusicEnabled, sfxMusicPaused, sfxMusicRelease } from '../src/systems/sfx-bus';
import { MissionSfx, SFX_SCENE_EV_PAUSE, SFX_SCENE_EV_RESUME, SFX_SCENE_EV_SHUTDOWN } from '../src/systems/sfx-mission';
import { type FakeSource, graph, setup } from './sfx-engine-kit';
import { FRAME_S, LEAD, TC, alive, musicSrcs, put, run, sceneEvents, unstopped } from './sfx-music-kit';

afterEach(() => registerSfxEngine(null));

describe('つなぎ（起動時に作る。リミッタを通さない）', () => {
  it('音量の節 9 本 → 曲の束 → 下げる音量 → ベッドの濾波器（v0.7.2 S3）→ master。節は 0 から・束と下げるは 1・音源はまだ無い', () => {
    const x = setup();
    const g = graph(x.ctx, x.e);
    expect(g.music.slots.length).toBe(MUSIC_PLAYER.slots);
    for (const s of g.music.slots) expect([s.outs, s.gain.value]).toEqual([[g.music.bus], 0]);
    expect(g.music.bus.outs).toEqual([g.music.duck]);
    expect(g.music.duck.outs).toEqual([g.bed]);
    expect(g.bed.outs).toEqual([g.master]);
    expect([g.music.bus.gain.value, g.music.duck.gain.value]).toEqual([1, 1]);
    expect(g.music.duck.outs).not.toContain(g.limiter);
    expect(g.voices.length).toBe(16);
    expect(musicSrcs(x.ctx).length).toBe(0);
    expect(MUSIC_PLAYER.slots).toBe(MUSIC_PLAYER.layersMax * 3);
    expect(MUSIC_PLAYER.layersMax * 2).toBe(MUSIC_MAX_SOURCES);
  });
});

describe('始めるのは running・消音でない・曲がオン・標本がある時だけ（L10・L11）', () => {
  it('標本がまだなら鳴らさず、できた次の 10 Hz で 1 個（繰り返す・同じ when＝今＋0.05・音量は 0 から鍵の音量へ・最初の音は 2 秒）', () => {
    const x = setup();
    x.e.music.request(MUSIC_CTX_MENU);
    run(x, 1);
    expect(musicSrcs(x.ctx).length).toBe(0);
    const buf = put(x, MUSIC_TITLE_DEFAULT_ID);
    const t0 = x.ctx.currentTime;
    run(x, 0.12);
    const [s] = musicSrcs(x.ctx);
    expect(s).toBeDefined();
    expect([s!.buffer, s!.loop, s!.stopped]).toEqual([buf, true, false]);
    expect(s!.started).toBeGreaterThan(t0);
    const g = graph(x.ctx, x.e).music.slots.find((n) => s!.outs.includes(n))!;
    const ev = g.gain.events;
    expect(ev.slice(0, 2)).toEqual([['cancel', ev[0]![1]], ['set', 0, ev[0]![1]]]);
    expect(ev[2]).toEqual(['target', MUSIC_GAIN[MUSIC_TITLE_DEFAULT_ID], s!.started, MUSIC_FADE.firstInS * TC]);
    expect(s!.started).toBeCloseTo(ev[0]![1]! + LEAD, 9);
  });
  it('止まっている context（suspended・interrupted）では 3 秒たっても音源を作らず何も書かない。動き出した次の 10 Hz で始める', () => {
    for (const state of ['suspended', 'interrupted']) {
      const x = setup(state);
      put(x, MUSIC_TITLE_DEFAULT_ID);
      x.e.music.request(MUSIC_CTX_MENU);
      x.e.music.setPaused(true);
      x.e.music.setPaused(false);
      run(x, 3);
      const g = graph(x.ctx, x.e).music;
      expect(musicSrcs(x.ctx).length, state).toBe(0);
      expect([g.bus, ...g.slots].reduce((n, s) => n + s.gain.events.length, 0), state).toBe(0);
      x.ctx.state = 'running';
      run(x, 0.12);
      expect(musicSrcs(x.ctx).length, state).toBe(1);
    }
  });
  it('「音: オフ」（エンジンの消音）・「曲: オフ」の間は作らない。解くと頭から（新しい音源）', () => {
    const x = setup();
    put(x, MUSIC_TITLE_DEFAULT_ID);
    x.e.setMuted(true);
    x.e.music.setEnabled(false);
    x.e.music.request(MUSIC_CTX_MENU);
    run(x, 1);
    expect(musicSrcs(x.ctx).length).toBe(0);
    x.e.setMuted(false);
    run(x, 1);
    expect(musicSrcs(x.ctx).length).toBe(0); // 曲はまだオフ
    x.e.music.setEnabled(true);
    expect(musicSrcs(x.ctx).length).toBe(1); // 押したその時に（running なら次の 10 Hz を待たない）
  });
  it('Phaser の blur（suspend → resume）では始め直さない: 音源はそのまま続く', () => {
    const x = setup();
    put(x, MUSIC_TITLE_DEFAULT_ID);
    x.e.music.request(MUSIC_CTX_MENU);
    run(x, 3);
    const before = [...x.ctx.sources];
    x.ctx.state = 'suspended';
    run(x, 5);
    x.ctx.state = 'running';
    run(x, 2);
    expect(x.ctx.sources).toEqual(before);
    expect(unstopped(x).length).toBe(1);
  });
});

describe('消音と「曲」（L12）', () => {
  it('「音: オフ」は 0.15 秒で 0 にして止め（stop は 1 回）、「音: オン」で頭から。「曲: オフ」は 0.3 秒、「曲: オン」で頭から', () => {
    const x = setup();
    put(x, MUSIC_TITLE_DEFAULT_ID);
    x.e.music.request(MUSIC_CTX_MENU);
    run(x, 3);
    const a = unstopped(x)[0]!;
    const ga = graph(x.ctx, x.e).music.slots.find((n) => a.outs.includes(n))!;
    const now = x.ctx.currentTime;
    x.e.setMuted(true);
    expect([a.stopped, a.stopAt]).toEqual([true, now + MUSIC_FADE.muteStopS]);
    expect(ga.gain.events.slice(-2)).toEqual([['cancel', now], ['target', 0, now, MUSIC_FADE.muteStopS * TC]]);
    x.e.setMuted(false);
    const b = unstopped(x)[0]!;
    expect(b).not.toBe(a);
    run(x, 3);
    const t1 = x.ctx.currentTime;
    sfxMusicEnabled(false); // エンジンの登録が無い口は何もしない
    registerSfxEngine(x.e);
    sfxMusicEnabled(false);
    expect([b.stopped, b.stopAt]).toEqual([true, t1 + MUSIC_FADE.musicOffS]);
    sfxMusicEnabled(true);
    expect(unstopped(x).length).toBe(1);
    expect(musicSrcs(x.ctx).length).toBe(3); // 止めて、頭から作り直した 3 個
  });
});

describe('場面（D8・L13・L17）', () => {
  it('同じ場面の頼み直しは何もしない（Title の作り直し・Briefing から戻る）。MISSION（S1 は曲なし）はメニューを 1.2 秒で下げて止める', () => {
    const x = setup();
    put(x, MUSIC_TITLE_DEFAULT_ID);
    registerSfxEngine(x.e);
    sfxMusic(MUSIC_CTX_MENU);
    run(x, 3);
    const n = x.e.music.writes;
    sfxMusic(MUSIC_CTX_MENU);
    sfxMusic(MUSIC_CTX_MENU);
    run(x, 2);
    expect([x.e.music.writes, musicSrcs(x.ctx).length]).toEqual([n, 1]);
    const s = unstopped(x)[0]!;
    const now = x.ctx.currentTime;
    sfxMusic(MUSIC_CTX_MISSION);
    expect(s.stopAt).toBeCloseTo(now + MUSIC_FADE.menuOutS, 9);
    run(x, 5);
    expect([unstopped(x).length, alive(x).length]).toEqual([0, 0]);
  });
  it('Result の遅らせ: 鐘の後 2.2 秒（帰投）で頭から。遅らせの途中の MENU（Title・もう一度）は予定どおり、MISSION（?debug の直行）は上書き', () => {
    const x = setup();
    put(x, MUSIC_TITLE_DEFAULT_ID);
    x.e.music.request(MUSIC_CTX_MISSION);
    run(x, 1);
    const t0 = x.ctx.currentTime;
    x.e.music.request(MUSIC_CTX_MENU, MUSIC_FADE.resultReturnedDelayS);
    run(x, 1);
    x.e.music.request(MUSIC_CTX_MENU); // Result → Title
    run(x, MUSIC_FADE.resultReturnedDelayS - 1 - 0.05);
    expect(musicSrcs(x.ctx).length).toBe(0);
    run(x, 0.2);
    const [s] = musicSrcs(x.ctx);
    expect(s!.started - t0).toBeGreaterThanOrEqual(MUSIC_FADE.resultReturnedDelayS);
    expect(s!.started - t0).toBeLessThan(MUSIC_FADE.resultReturnedDelayS + 0.1 + FRAME_S + LEAD + 1e-9);
    const y = setup();
    put(y, MUSIC_TITLE_DEFAULT_ID);
    y.e.music.request(MUSIC_CTX_MENU, MUSIC_FADE.resultLostDelayS);
    run(y, 1);
    y.e.music.request(MUSIC_CTX_MISSION);
    run(y, 5);
    expect(musicSrcs(y.ctx).length).toBe(0);
  });
  it.each(['Result の create が先（Phaser 3.90 の順）', 'Hud の SHUTDOWN が先'])('任務の終わり: %s でも、MissionSfx の release はメニューの曲を消さない', (order) => {
    const x = setup();
    put(x, MUSIC_TITLE_DEFAULT_ID);
    registerSfxEngine(x.e);
    const ev = sceneEvents();
    sfxMusic(MUSIC_CTX_MENU);
    run(x, 3);
    new MissionSfx(ev, 40); // Hud の create: 任務の場面（S1 は曲なし＝メニューが消える）
    expect(x.e.music.stats().want).toBe(MUSIC_CTX_MISSION);
    run(x, 2);
    expect(alive(x).length).toBe(0);
    const result = (): void => sfxMusic(MUSIC_CTX_MENU, MUSIC_FADE.resultLostDelayS);
    const shutdown = (): void => ev.fire(SFX_SCENE_EV_SHUTDOWN);
    if (order.startsWith('Result')) { result(); shutdown(); } else { shutdown(); result(); }
    expect(x.e.music.stats().want).toBe(MUSIC_CTX_MENU);
    run(x, MUSIC_FADE.resultLostDelayS + 0.2);
    expect(unstopped(x).length).toBe(1);
    sfxMusicRelease(MUSIC_CTX_MISSION); // 遅れて来た任務の release も効かない
    expect(unstopped(x).length).toBe(1);
  });
  it('一時停止: 曲の束を 0.15 秒で 0 へ・再開で戻す（音源は止めない）。止めたまま場面が替われば（任務をやめる → Title）古い組は束が 0 の間に 0 で止め、束を戻す', () => {
    const x = setup();
    put(x, MUSIC_TITLE_DEFAULT_ID);
    registerSfxEngine(x.e);
    x.e.music.request(MUSIC_CTX_MENU);
    run(x, 3);
    const bus = graph(x.ctx, x.e).music.bus.gain;
    const s = unstopped(x)[0]!;
    let now = x.ctx.currentTime;
    sfxMusicPaused(true);
    expect(bus.events.slice(-2)).toEqual([['cancel', now], ['target', 0, now, MUSIC_FADE.pauseS * TC]]);
    sfxMusicPaused(true);
    expect(bus.events.length).toBe(2);
    run(x, 1);
    expect(s.stopped).toBe(false);
    now = x.ctx.currentTime;
    sfxMusicPaused(false);
    expect(bus.events.slice(-2)).toEqual([['cancel', now], ['target', 1, now, MUSIC_FADE.pauseS * TC]]);
    sfxMusicPaused(true);
    run(x, 1);
    now = x.ctx.currentTime;
    const slot = graph(x.ctx, x.e).music.slots.find((n) => s.outs.includes(n))!;
    x.e.music.request(MUSIC_CTX_LAB); // 止めたまま別の場面へ
    expect(slot.gain.events.slice(-2)).toEqual([['cancel', now], ['set', 0, now]]);
    expect([s.stopped, s.stopAt]).toEqual([true, now + MUSIC_FADE.hastyStopS]);
    expect(bus.events.slice(-1)[0]!.slice(0, 2)).toEqual(['target', 1]);
    expect(x.e.music.stats().paused).toBe(false);
  });
  it('MissionSfx: 作る時に MISSION・Hud の PAUSE・RESUME で曲の束も・SHUTDOWN で外す（今も任務の時だけ）', () => {
    const x = setup();
    registerSfxEngine(x.e);
    const ev = sceneEvents();
    new MissionSfx(ev, 40);
    expect(x.e.music.stats().want).toBe(MUSIC_CTX_MISSION);
    ev.fire(SFX_SCENE_EV_PAUSE);
    expect(x.e.music.stats().paused).toBe(true);
    ev.fire(SFX_SCENE_EV_RESUME);
    expect(x.e.music.stats().paused).toBe(false);
    ev.fire(SFX_SCENE_EV_SHUTDOWN);
    expect(x.e.music.stats().want).toBe(MUSIC_CTX_NONE);
  });
});

describe('移りの数（spec §4.2）・10 Hz で変わった時だけ', () => {
  it('ランダムな移り 10 回 × 20 種: どの時点も鳴っている曲の音源 ≤ 6・stop は 1 音源 1 回・組の音源は同じ when。最後に外すと start − stop が合う', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const x = setup();
      for (const k of ['title_a', 'title_d', 'title_e'] as const) put(x, k);
      const rng = new SeededRng(seed);
      let stopCalls = 0;
      const wrap = (s: FakeSource): void => { const st = s.stop.bind(s); s.stop = (w?: number) => { if (s.stopped) throw new Error('stop を 2 回'); stopCalls++; st(w); }; };
      const create = x.ctx.createBufferSource.bind(x.ctx);
      x.ctx.createBufferSource = () => { const s = create(); wrap(s); return s; };
      const acts: ((r: number) => void)[] = [
        () => x.e.music.request(MUSIC_CTX_MENU), () => x.e.music.request(MUSIC_CTX_MISSION), () => x.e.music.request(MUSIC_CTX_MENU, MUSIC_FADE.resultReturnedDelayS),
        () => x.e.music.release(MUSIC_CTX_MISSION), () => x.e.music.request(MUSIC_CTX_LAB), (r) => x.e.music.audition((['title_a', 'title_d', 'title_e', null] as const)[Math.floor(r * 4)]!),
        (r) => x.e.setMuted(r < 0.5), (r) => x.e.music.setEnabled(r < 0.7), (r) => x.e.music.setPaused(r < 0.5), (r) => { x.ctx.state = r < 0.8 ? 'running' : 'suspended'; },
      ];
      for (let i = 0; i < 10; i++) {
        acts[Math.floor(rng.next() * acts.length)]!(rng.next());
        for (let f = Math.floor(rng.next() * 120); f >= 0; f--) {
          run(x, FRAME_S);
          expect(alive(x).length, `seed ${seed}`).toBeLessThanOrEqual(MUSIC_MAX_SOURCES);
          expect(unstopped(x).length, `seed ${seed}`).toBeLessThanOrEqual(MUSIC_PLAYER.layersMax);
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
  it('鳴り始めた後は 10 秒回しても書かない（決めは 10 Hz・変わった時だけ）。stats は確保してよい口', () => {
    const x = setup();
    put(x, MUSIC_TITLE_DEFAULT_ID);
    x.e.music.request(MUSIC_CTX_MENU);
    run(x, 1);
    const w = x.e.music.writes;
    const events = graph(x.ctx, x.e).music.slots.reduce((n, s) => n + s.gain.events.length, 0);
    run(x, 10);
    expect(x.e.music.writes).toBe(w);
    expect(graph(x.ctx, x.e).music.slots.reduce((n, s) => n + s.gain.events.length, 0)).toBe(events);
    expect(x.e.stats().music.sources).toBe(1);
  });
});

