// v0.7.2 S3（アートと音③：BGM と命中スローの音。spec-v0720 §6.3・§6.4・brief L28〜L31）: 命中スローの音（systems/sfx-slowmo）の関わり。道具は tests/sfx-slowmo-kit（ゲームと同じフレームの順）。
// - 止まっている context には書かない（動き出した最初のフレームのエンジンの tick で追いつく）。一時停止の間は世界も Hud も止まる。消音・曲オフの途中に始まる組は遅い rate で。
// - 戻す: Hud の SHUTDOWN（sfxLoopsStop。Result・Title の create とどちらが先でも）・メニューと試聴の場の曲（sfxMusic）。試聴の場で案を替えるとスローの最中は書き直す。
// - スローの途中で始まった組は遅い rate で始まり、3 層はいつも同じ予約（ランダムな移りでも）。鳴っている曲の音源 ≤ 6。
import { afterEach, describe, expect, it } from 'vitest';
import { MUSIC_CTX_LAB, MUSIC_CTX_MENU, MUSIC_CTX_MISSION, MUSIC_CTX_NONE, MUSIC_FADE, MUSIC_MAX_SOURCES, MUSIC_PLAYER, SFX_SLOW, SFX_SLOW_IDS } from '../src/config/sfx-music-config';
import { MUSIC_TITLE_DEFAULT_ID } from '../src/assets/sfx-music-themes';
import { SeededRng } from '../src/core/rng';
import { registerSfxEngine, registerSfxListener, registerSfxSlowMo, sfxMusic, sfxMusicEnabled, sfxSlowVariant } from '../src/systems/sfx-bus';
import { SFX_SCENE_EV_PAUSE, SFX_SCENE_EV_RESUME, SFX_SCENE_EV_SHUTDOWN } from '../src/systems/sfx-mission';
import { graph } from './sfx-engine-kit';
import { FRAME_S, alive, put, putFamily, run, unstopped } from './sfx-music-kit';
import { SH, SLOW_S, frames, mission, untilBed } from './sfx-slowmo-kit';

afterEach(() => {
  registerSfxEngine(null);
  registerSfxListener(null);
  registerSfxSlowMo(null);
});

describe('止まっている context・一時停止・消音・曲オフ', () => {
  it('止まっている context の立ち上がりは数えるだけ（書かない）。動き出した最初のフレームで追いつき、止まっている間の立ち下がりは動き出してから戻す', () => {
    const m = mission('running', 'A');
    frames(m, 3.5);
    const bed = graph(m.x.ctx, m.x.e).bed.frequency;
    m.x.ctx.state = 'suspended';
    m.world.slowMoLeftS = SLOW_S;
    frames(m, 0.3);
    expect([bed.events.length, m.x.e.stats().slow.rises]).toEqual([0, 1]);
    m.x.ctx.state = 'running';
    m.x.ctx.currentTime += FRAME_S;
    m.x.e.tick(FRAME_S, 0); // 動き出した最初のフレーム（Hud の update の前の PRE_STEP）
    expect(bed.events.slice(-1)[0]!.slice(0, 2)).toEqual(['target', SFX_SLOW.A.filterHz]);
    m.x.ctx.state = 'suspended';
    frames(m, SLOW_S);
    expect(bed.events.length).toBe(2);
    m.x.ctx.state = 'running';
    frames(m, FRAME_S);
    expect(bed.events.slice(-1)[0]!.slice(0, 2)).toEqual(['target', SH.idleHz]);
  });
  it('一時停止の間は世界も Hud も止まる（書かない・残り秒も減らない）。再開で残りが進み、スローは計 1.2 秒で戻る', () => {
    const m = mission('running', 'A');
    frames(m, 3.5);
    const bed = graph(m.x.ctx, m.x.e).bed.frequency;
    m.world.slowMoLeftS = SLOW_S;
    frames(m, 0.5);
    m.ev.fire(SFX_SCENE_EV_PAUSE);
    const n = bed.events.length;
    const left = m.world.slowMoLeftS;
    frames(m, 3, false);
    expect([bed.events.length, m.world.slowMoLeftS]).toEqual([n, left]);
    m.ev.fire(SFX_SCENE_EV_RESUME);
    const tr = m.x.ctx.currentTime;
    const t = untilBed(m, 1);
    expect(t - tr).toBeCloseTo(SLOW_S - 0.5, 1); // 一時停止の前の 0.5 秒と合わせて 1.2 秒
    expect(bed.events.slice(-1)[0]!.slice(0, 2)).toEqual(['target', SH.idleHz]);
    expect(m.x.e.stats().slow.rises).toBe(1);
  });
  it('消音・曲オフの途中: 曲の組は止まり、スローのまま解けば新しい組は遅い rate で始まる（3 層とも）。スローの後に解けば rate 1（触らない）', () => {
    for (const how of ['mute', 'music'] as const) {
      const m = mission('running', 'A');
      frames(m, 3.5);
      const off = (v: boolean): void => { if (how === 'mute') m.x.e.setMuted(v); else sfxMusicEnabled(!v); };
      m.world.slowMoLeftS = SLOW_S;
      frames(m, 0.1);
      off(true);
      frames(m, 0.3);
      expect(unstopped(m.x).length, how).toBe(0);
      off(false);
      frames(m, 0.2);
      const fresh = unstopped(m.x);
      expect(fresh.length, how).toBe(3);
      for (const s of fresh) expect([s.playbackRate.value, s.playbackRate.events], how).toEqual([SFX_SLOW.A.musicRate, []]);
      frames(m, SLOW_S);
      for (const s of fresh) expect(s.playbackRate.events.slice(-1)[0]!.slice(0, 2), how).toEqual(['target', 1]);
      off(true);
      frames(m, 0.3);
      off(false);
      frames(m, 0.2);
      for (const s of unstopped(m.x)) expect([s.playbackRate.value, s.playbackRate.events], how).toEqual([1, []]);
    }
  });
});

describe('戻す: 任務の終わり（Hud の SHUTDOWN）・メニュー・試聴の場', () => {
  it.each(['Result の create が先（Phaser 3.90 の順）', 'Hud の SHUTDOWN が先'])('スローの途中で任務が終わる: %s でも濾波器は素通しへ・曲の rate は 1 へ。Result の曲は遅らせの後に rate 1 で始まる', (order) => {
    const m = mission('running', 'A');
    put(m.x, MUSIC_TITLE_DEFAULT_ID);
    frames(m, 3.5);
    m.world.slowMoLeftS = SLOW_S;
    frames(m, 0.3);
    const g = graph(m.x.ctx, m.x.e);
    registerSfxSlowMo(null); // Mission の SHUTDOWN（世界の破棄＝world-art）
    const now = m.x.ctx.currentTime;
    const restored = (): void => {
      expect(g.bed.frequency.events.slice(-2)).toEqual([['cancel', now], ['target', SH.idleHz, now, SH.endTcS]]);
      expect(m.x.e.stats().slow).toMatchObject({ on: false, shown: null, musicRate: 1, loopFactor: 1 });
    };
    // どちらが先でも、先に来た方で戻る（Hud の SHUTDOWN だけ＝やり直しでも戻る）
    if (order.startsWith('Result')) { sfxMusic(MUSIC_CTX_MENU, MUSIC_FADE.resultReturnedDelayS); restored(); m.ev.fire(SFX_SCENE_EV_SHUTDOWN); }
    else { m.ev.fire(SFX_SCENE_EV_SHUTDOWN); restored(); sfxMusic(MUSIC_CTX_MENU, MUSIC_FADE.resultReturnedDelayS); }
    restored();
    run(m.x, MUSIC_FADE.resultReturnedDelayS + 0.3);
    const menu = unstopped(m.x);
    expect(menu.length).toBe(1);
    expect([menu[0]!.playbackRate.value, menu[0]!.playbackRate.events]).toEqual([1, []]);
    expect(g.bed.frequency.events.length).toBe(4); // 立ち上がり 2・戻し 2（2 つ目の頼みは同じ形＝書かない）
  });
  it('メニュー・試聴の場の曲を頼むと戻す（Hud の SHUTDOWN が来なくても）。任務・なしでは戻さない', () => {
    for (const ctx of [MUSIC_CTX_MENU, MUSIC_CTX_LAB, MUSIC_CTX_MISSION, MUSIC_CTX_NONE]) {
      const m = mission('running', 'A');
      frames(m, 3.5);
      m.world.slowMoLeftS = SLOW_S;
      frames(m, 0.2);
      sfxMusic(ctx);
      expect(m.x.e.stats().slow.on, `${ctx}`).toBe(ctx !== MUSIC_CTX_MENU && ctx !== MUSIC_CTX_LAB);
    }
  });
  it('試聴の場: 案を替えるとスローの最中は新しい案で書き直す（A → B は曲を 1 へ・A → C は濾波器も素通しへ）。ふだんは覚えるだけ', () => {
    const m = mission('running', 'A');
    frames(m, 3.5);
    const g = graph(m.x.ctx, m.x.e);
    const mus = unstopped(m.x);
    sfxSlowVariant('B');
    expect(g.bed.frequency.events.length).toBe(0);
    sfxSlowVariant('A');
    m.world.slowMoLeftS = SLOW_S;
    frames(m, 0.2);
    sfxSlowVariant('B');
    const t = m.x.ctx.currentTime;
    for (const s of mus) expect(s.playbackRate.events.slice(-2)).toEqual([['cancel', t], ['target', 1, t, SH.rateTcS]]);
    expect(g.bed.frequency.events.length).toBe(2); // A と B は同じ Hz
    sfxSlowVariant('C');
    expect(g.bed.frequency.events.slice(-1)[0]).toEqual(['target', SFX_SLOW.C.filterHz, t, SH.filterTcS]);
    expect(m.x.e.stats().slow.loopFactor).toBe(1);
  });
});

describe('組と 3 層の同期', () => {
  it('スローの途中で始まった家族（標本ができた・任務の始め）は 3 層とも遅い rate で始まり、立ち下がりで 3 層に同じ予約', () => {
    const m = mission('running', 'A', false);
    frames(m, 0.5);
    m.world.slowMoLeftS = SLOW_S;
    frames(m, 0.1);
    putFamily(m.x);
    frames(m, 0.2);
    const mus = unstopped(m.x);
    expect(mus.length).toBe(3);
    for (const s of mus) expect([s.playbackRate.value, s.playbackRate.events]).toEqual([SFX_SLOW.A.musicRate, []]);
    frames(m, SLOW_S);
    expect(new Set(mus.map((s) => JSON.stringify(s.playbackRate.events))).size).toBe(1);
    expect(mus[0]!.playbackRate.events.slice(-1)[0]!.slice(0, 2)).toEqual(['target', 1]);
  });
  it('ランダムな移り 15 回 × 20 種（命中・任務の終わり・メニュー・任務・試聴の場・案・消音・曲・一時停止・止まる）: 鳴っている ≤ 6・鳴っている組の層は同じ rate の予約・最後に戻せば素通し', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const m = mission('running', SFX_SLOW_IDS[seed % SFX_SLOW_IDS.length]!);
      put(m.x, MUSIC_TITLE_DEFAULT_ID);
      const rng = new SeededRng(seed + 300);
      let hud = true;
      const acts: ((r: number) => void)[] = [
        () => { m.world.slowMoLeftS = SLOW_S; }, () => { m.world.slowMoLeftS = SLOW_S; }, () => m.ev.fire(SFX_SCENE_EV_SHUTDOWN), (r) => sfxMusic(r < 0.5 ? MUSIC_CTX_MENU : MUSIC_CTX_MISSION, r < 0.25 ? 2.2 : 0),
        () => sfxMusic(MUSIC_CTX_LAB), (r) => sfxSlowVariant(SFX_SLOW_IDS[Math.floor(r * 3)]!), (r) => m.x.e.setMuted(r < 0.4), (r) => sfxMusicEnabled(r < 0.7),
        (r) => { hud = r < 0.6; m.ev.fire(hud ? SFX_SCENE_EV_RESUME : SFX_SCENE_EV_PAUSE); }, (r) => { m.x.ctx.state = r < 0.8 ? 'running' : 'suspended'; },
      ];
      for (let i = 0; i < 15; i++) {
        acts[Math.floor(rng.next() * acts.length)]!(rng.next());
        for (let f = Math.floor(rng.next() * 90); f >= 0; f--) {
          frames(m, FRAME_S, hud);
          expect(alive(m.x).length, `seed ${seed}`).toBeLessThanOrEqual(MUSIC_MAX_SOURCES);
          const u = unstopped(m.x);
          expect(u.length, `seed ${seed}`).toBeLessThanOrEqual(MUSIC_PLAYER.layersMax);
          if (u.length > 1) expect(new Set(u.map((s) => `${s.started} ${s.playbackRate.value} ${JSON.stringify(s.playbackRate.events)}`)).size, `seed ${seed}`).toBe(1);
        }
      }
      m.x.ctx.state = 'running';
      sfxMusic(MUSIC_CTX_MENU);
      frames(m, FRAME_S, false);
      expect(m.x.e.stats().slow, `seed ${seed}`).toMatchObject({ on: false, shown: null, filterHz: SH.idleHz, musicRate: 1, loopFactor: 1 });
    }
  });
});

