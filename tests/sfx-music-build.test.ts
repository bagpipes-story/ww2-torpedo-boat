// v0.7.2 S1（アートと音③：BGM と命中スローの音。spec-v0720 §2・D4・§7・brief L6〜L9・L14）: 曲を作る列 systems/sfx-music-build と曲の試聴の場の再生を偽の context で確かめる
// （本物の作曲と合成を回す。道具は tests/sfx-music-kit）。
// - 効果音の列が終わるまで（allowBuild の前）は作らない・表も作業用の配列も作らない（Boot では作らない）。その次のフレームから 1 フレームに決まった量。
// - ゲームの列は既定のタイトルの曲だけ（S1＝L6）→ S2 で任務の家族 L0〜L2 を後ろに足した（§13 L1: Title・Briefing の間に同じ予算で作り、任務をまたいで使い回す）。できた buffer は
//   ゲームの標本そのもの（tests/sfx-music-render の指紋）で、曲ごとに buffer は 1 本だけ。列が空になれば作業用の配列を捨て、表は残す。任務（MISSION）はまだ無い層の最初を先に作る。
// - 試聴の場（L14）: 押した候補を作ってから鳴らす・別の候補はできるまで今のが鳴り、できたら 0.5 秒で重ねる・出ると候補の標本を捨てる（ゲームの列の曲は残す）。作りかけの既定の曲は押した候補に譲る。
import { afterEach, describe, expect, it } from 'vitest';
import {
  MUSIC_CTX_LAB, MUSIC_CTX_MENU, MUSIC_CTX_MISSION, MUSIC_CTX_NONE, MUSIC_FADE, MUSIC_KEYS, MUSIC_LAB_MAX_SAMPLES, MUSIC_LAYER_KEYS, MUSIC_LENGTHS, MUSIC_MAX_RESIDENT_SAMPLES, MUSIC_SAMPLE_RATE,
} from '../src/config/sfx-music-config';
import { MUSIC_TITLE_DEFAULT_ID } from '../src/assets/sfx-music-themes';
import { registerSfxEngine, sfxMusic, sfxMusicAudition, sfxMusicLabBuilding, sfxMusicLabPlaying, sfxMusicLabProgress } from '../src/systems/sfx-bus';
import { MUSIC_GAME_BUILD } from '../src/systems/sfx-music-build';
import { graph, setup } from './sfx-engine-kit';
import { FINGERPRINTS, FRAME_S, TC, buildAll, buildList, fingerprint16, run, unstopped } from './sfx-music-kit';

afterEach(() => registerSfxEngine(null));

describe('作る列（D4・L6〜L9）', () => {
  it('効果音の列が終わるまで（allowBuild の前）は作らない・表も作業用の配列も作らない。次のフレームから 1 フレームに決まった量で既定のタイトルの曲 → 任務の家族を作り、作業用の配列を捨てる（表は残す）', () => {
    const x = setup();
    expect(MUSIC_GAME_BUILD).toEqual([MUSIC_TITLE_DEFAULT_ID, ...MUSIC_LAYER_KEYS]);
    x.e.music.request(MUSIC_CTX_MENU);
    run(x, 2);
    let st = x.e.music.stats();
    expect([st.tables, st.work, st.buildCalls, st.buffers]).toEqual([false, false, 0, 0]);
    x.e.music.allowBuild();
    run(x, FRAME_S);
    expect(x.e.music.stats().buildCalls).toBe(0); // 次のフレームから
    run(x, FRAME_S);
    st = x.e.music.stats();
    expect([st.tables, st.work, st.buildCalls, st.building]).toEqual([true, true, 1, MUSIC_TITLE_DEFAULT_ID]);
    const frames = buildAll(x);
    st = x.e.music.stats();
    expect(frames).toBeGreaterThan(50);
    expect([st.buffers, st.builds, st.resident, st.tables, st.failed]).toEqual([1, 1, MUSIC_LENGTHS[MUSIC_TITLE_DEFAULT_ID], true, false]);
    run(x, 0.12);
    expect(unstopped(x).length).toBe(1); // 遅れてできた: そのまま始める（家族はその後ろで作り続ける）
    expect(buildList(x)).toBeGreaterThan(10);
    st = x.e.music.stats();
    const family = MUSIC_LAYER_KEYS.reduce((a, k) => a + MUSIC_LENGTHS[k], 0);
    expect([st.buffers, st.builds, st.resident, st.work, st.tables, st.failed, st.abandoned]).toEqual([4, 4, MUSIC_LENGTHS[MUSIC_TITLE_DEFAULT_ID] + family, false, true, false, 0]);
    expect(st.resident).toBeLessThanOrEqual(MUSIC_MAX_RESIDENT_SAMPLES);
    // できた buffer はゲームの標本そのもの（指紋＝tests/sfx-music-render。分け方に依らずビット同一）。曲ごとに buffer は 1 本だけ作る
    const music = x.ctx.buffers.filter((b) => b.length > 100_000);
    expect(music.map((b) => b.length)).toEqual(MUSIC_GAME_BUILD.map((k) => MUSIC_LENGTHS[k]));
    for (const b of music) expect([b.channels, b.sampleRate]).toEqual([1, MUSIC_SAMPLE_RATE]);
    expect(music.map((b) => fingerprint16(b.data))).toEqual(MUSIC_GAME_BUILD.map((k) => FINGERPRINTS[k]));
    expect(unstopped(x).length).toBe(1); // メニューの曲は続く（作り直さない・始め直さない）
  });
  it('任務（MISSION。?debug の直行）はまだ無い層の最初を先に作る（作りかけのタイトルの曲は譲る）。3 層がそろってから同じ when で始め、タイトルの曲は後で頭から作る（同じ標本）', () => {
    const x = setup();
    x.e.music.allowBuild();
    x.e.music.request(MUSIC_CTX_MENU);
    run(x, 20 * FRAME_S);
    expect(x.e.music.stats().building).toBe(MUSIC_TITLE_DEFAULT_ID);
    x.e.music.request(MUSIC_CTX_MISSION);
    const order: string[] = [];
    for (let f = 0; f < 6000 && x.e.music.stats().buffers < 4; f++) {
      run(x, FRAME_S);
      const b = x.e.music.stats().building;
      if (b !== null && order[order.length - 1] !== b) order.push(b);
      if (x.e.music.stats().buffers < 3) expect(unstopped(x).length).toBe(0); // 3 層がそろうまで鳴らさない
    }
    expect(order).toEqual([...MUSIC_LAYER_KEYS, MUSIC_TITLE_DEFAULT_ID]);
    expect(x.e.music.stats().abandoned).toBe(1);
    run(x, 0.12);
    const srcs = unstopped(x);
    expect(srcs.map((s) => s.buffer!.length)).toEqual(MUSIC_LAYER_KEYS.map((k) => MUSIC_LENGTHS[k]));
    expect(new Set(srcs.map((s) => s.started)).size).toBe(1);
    const a = x.ctx.buffers.filter((b) => b.length === MUSIC_LENGTHS[MUSIC_TITLE_DEFAULT_ID]);
    expect(a.length).toBe(1);
    expect(fingerprint16(a[0]!.data)).toBe(FINGERPRINTS[MUSIC_TITLE_DEFAULT_ID]);
  });
  it('作れない端末（buffer を作れない）: 投げずに曲なしで続ける', () => {
    const x = setup();
    x.ctx.createBuffer = () => { throw new Error('NotSupportedError'); };
    x.e.music.allowBuild();
    x.e.music.request(MUSIC_CTX_MENU);
    expect(() => buildAll(x)).not.toThrow();
    expect(x.e.music.stats().failed).toBe(true);
  });
});

describe('曲の試聴の場（L14）', () => {
  it('押した候補を作ってから鳴らす（作っている間は進み）・別の候補はできるまで今のが鳴り、できたら 0.5 秒で重ねる・同じ口で止める・出ると候補の標本を捨てる', () => {
    const x = setup();
    registerSfxEngine(x.e);
    x.e.music.allowBuild();
    sfxMusic(MUSIC_CTX_LAB);
    sfxMusicAudition('title_d');
    run(x, 3 * FRAME_S);
    expect(sfxMusicLabBuilding()).toBe('title_d');
    run(x, 10 * FRAME_S);
    expect(sfxMusicLabProgress()).toBeGreaterThan(0);
    expect(sfxMusicLabPlaying()).toBeNull();
    buildAll(x);
    run(x, 0.12);
    expect(sfxMusicLabPlaying()).toBe('title_d');
    const b = unstopped(x)[0]!;
    expect(fingerprint16(b.buffer!.data)).toBe(FINGERPRINTS.title_d);
    sfxMusicAudition('title_e'); // できるまで D が鳴る
    run(x, 0.5);
    expect([sfxMusicLabBuilding(), sfxMusicLabPlaying(), b.stopped]).toEqual(['title_e', 'title_d', false]);
    for (let f = 0; f < 3000 && sfxMusicLabBuilding() === 'title_e'; f++) run(x, FRAME_S);
    run(x, 0.12);
    const c = unstopped(x)[0]!;
    expect([sfxMusicLabPlaying(), b.stopped, c.buffer === b.buffer]).toEqual(['title_e', true, false]);
    expect(b.stopAt - x.ctx.currentTime).toBeLessThanOrEqual(MUSIC_FADE.labCrossS);
    const slot = graph(x.ctx, x.e).music.slots.find((n) => c.outs.includes(n))!;
    expect(slot.gain.events[2]![3]).toBeCloseTo(MUSIC_FADE.labCrossS * TC, 9);
    expect(fingerprint16(c.buffer!.data)).toBe(FINGERPRINTS.title_e);
    let st = x.e.music.stats();
    expect(st.resident).toBeLessThanOrEqual(MUSIC_LAB_MAX_SAMPLES);
    sfxMusicAudition(null);
    expect([sfxMusicLabPlaying(), c.stopped]).toEqual([null, true]);
    buildAll(x); // 押していない間はゲームの列（既定の曲）を作る
    st = x.e.music.stats();
    expect(st.buffers).toBe(3);
    sfxMusic(MUSIC_CTX_NONE); // 出る
    st = x.e.music.stats();
    expect([st.buffers, st.resident]).toEqual([1, MUSIC_LENGTHS[MUSIC_TITLE_DEFAULT_ID]]);
    expect(x.e.music.build.buffers[MUSIC_KEYS.indexOf(MUSIC_TITLE_DEFAULT_ID)]).not.toBeNull();
  });
  it('既定の曲を作っている途中に別の候補を押すと、作りかけをやめて押した候補を先に作る（やめた曲は後で頭から＝同じ標本）', () => {
    const x = setup();
    x.e.music.allowBuild();
    x.e.music.request(MUSIC_CTX_LAB);
    run(x, 20 * FRAME_S);
    expect(x.e.music.stats().building).toBe(MUSIC_TITLE_DEFAULT_ID);
    x.e.music.audition('title_e'); // A と同じ長さの D では buffer を長さで見分けられないので E
    run(x, FRAME_S);
    expect([x.e.music.stats().building, x.e.music.stats().abandoned]).toEqual(['title_e', 1]);
    buildAll(x);
    buildAll(x);
    const a = x.ctx.buffers.filter((b) => b.length === MUSIC_LENGTHS[MUSIC_TITLE_DEFAULT_ID]);
    expect(a.length).toBe(1);
    expect(fingerprint16(a[0]!.data)).toBe(FINGERPRINTS[MUSIC_TITLE_DEFAULT_ID]);
  });
});
