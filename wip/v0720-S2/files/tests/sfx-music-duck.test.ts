// v0.7.2 S2（アートと音③：BGM と命中スローの音。spec-v0720 §4.6・D9・§8.1・brief L22）: 合図の時に曲を下げる（ducking。systems/sfx-music-duck）を偽の context のエンジンで確かめる
// （tests/sfx-engine-mood から分けた。家族・段・一時停止はそちら）。
// - 鳴らせた単発（fire の後）の鍵を引き、下げる音量のノードだけに書く（警報 −8 dB・0.8 秒＝U-M1、鐘・魚雷の命中・近い大きい爆発（帯 1 まで）・探照灯は設計の既定。UI の音では下げない）。
// - 下げている間の次の合図は深いか長い時だけ直す（0.5 秒に 2 回まで）。遅らせる単発は鳴り始める時刻で。止まっている context・消音では何もしない。
import { afterEach, describe, expect, it } from 'vitest';
import type { SfxKey } from '../src/config/sfx-config';
import { MUSIC_PLAYER, SFX_MUSIC_DUCK, SFX_MUSIC_DUCK_SHAPE } from '../src/config/sfx-music-config';
import { registerSfxEngine, registerSfxListener, sfxAt, sfxCue, sfxResultBell, sfxUi } from '../src/systems/sfx-bus';
import { fakeSamples, graph, setup } from './sfx-engine-kit';
import { run } from './sfx-music-kit';

afterEach(() => {
  registerSfxEngine(null);
  registerSfxListener(null);
});
type X = ReturnType<typeof setup>;

describe('下げる（ducking。spec §4.6・D9・U-M1・brief L22）', () => {
  /** 下げの鍵の標本を足したエンジン（聞き手は原点） */
  function ducking(state = 'running'): X {
    const x = setup(state);
    for (const k of ['alarm', 'bell', 'torp_hit', 'light_on', 'hull_hit', 'gun_near', 'splash_l'] as SfxKey[]) x.e.setBuffer(k, fakeSamples(k));
    registerSfxEngine(x.e);
    registerSfxListener({ x: 0, y: 0 });
    return x;
  }
  const duckEv = (x: X): unknown[] => graph(x.ctx, x.e).music.duck.gain.events;
  const UP = SFX_MUSIC_DUCK_SHAPE.upS * MUSIC_PLAYER.fadeTc;
  it.each<[SfxKey, number, number]>([
    ['alarm', -8, 0.8], ['bell', -6, 1.2], ['light_on', -4, 0.5],
  ])('%s（位置なしの合図）: 鳴り始める時刻に %i dB へ時定数 0.03 秒・hold の後に戻す（予約の前に消す）', (k, db, hold) => {
    const x = ducking();
    x.ctx.currentTime = 5;
    sfxCue(k);
    expect(duckEv(x)).toEqual([['cancel', 5], ['target', 10 ** (db / 20), 5, SFX_MUSIC_DUCK_SHAPE.downTcS], ['target', 1, 5 + hold, UP]]);
    expect(SFX_MUSIC_DUCK[k]).toEqual({ db, holdS: hold });
    expect(x.e.stats().ducks).toBe(1);
  });
  it('魚雷の命中は届けばどこでも −5 dB・大きい爆発は帯 1（1,500 m）までだけ −4 dB（遠い爆発・機銃・砲・水柱・被弾・ボタンの音では下げない）', () => {
    const x = ducking();
    sfxAt('torp_hit', 3000, 0);
    expect(duckEv(x).slice(1, 2)).toEqual([['target', 10 ** (-5 / 20), 0, SFX_MUSIC_DUCK_SHAPE.downTcS]]);
    const y = ducking();
    run(y, 1); // 間引きはゲームの時計（再生の時計と一緒に進める）
    sfxAt('blast_l', 300, 0); // 帯 0
    run(y, 2);
    sfxAt('blast_l', 1200, 0); // 帯 1
    run(y, 2);
    sfxAt('blast_l', 3000, 0); // 帯 2: 下げない
    for (const k of ['mg', 'gun_near', 'splash_l'] as SfxKey[]) sfxAt(k, 100, 0);
    sfxCue('hull_hit');
    sfxUi('ui_tap');
    expect(y.e.stats().ducks).toBe(2);
    expect(duckEv(y).filter((e) => (e as unknown[])[0] === 'target' && (e as number[])[1] !== 1).map((e) => Math.round((e as number[])[2]! * 1e6) / 1e6)).toEqual([1, 3]);
    expect(SFX_MUSIC_DUCK.blast_l!.maxBand).toBe(1);
  });
  it('遅らせる単発（Result の鐘の 2 打目）は鳴り始める時刻で下げる（2 打目は長い＝予約を直す）', () => {
    const x = ducking();
    x.ctx.currentTime = 2;
    sfxResultBell(true);
    const lv = 10 ** (-6 / 20);
    expect(duckEv(x)).toEqual([
      ['cancel', 2], ['target', lv, 2, SFX_MUSIC_DUCK_SHAPE.downTcS], ['target', 1, 3.2, UP],
      ['cancel', 2.5], ['target', lv, 2.5, SFX_MUSIC_DUCK_SHAPE.downTcS], ['target', 1, 3.7, UP],
    ]);
  });
  it('下げている間の次の合図: 浅くて短いなら書かない。深いか長い時だけ直す（深い方の倍率・遅い方の戻り）。0.5 秒に 2 回まで', () => {
    const x = ducking();
    x.ctx.currentTime = 10;
    sfxCue('alarm'); // −8 dB・10.8 まで
    const n = duckEv(x).length;
    x.ctx.currentTime = 10.1;
    sfxCue('light_on'); // −4 dB・10.6 まで＝浅くて短い
    expect(duckEv(x).length).toBe(n);
    x.ctx.currentTime = 10.2;
    sfxCue('bell'); // −6 dB・11.4 まで＝長い → 直す（−8 dB のまま 11.4 まで）
    const re = duckEv(x).slice(-3) as (string | number)[][];
    expect(re.map((e) => e[0])).toEqual(['cancel', 'target', 'target']);
    expect([re[0]![1], re[1]![1], re[1]![2], re[1]![3], re[2]![1], re[2]![3]]).toEqual([10.2, 10 ** (-8 / 20), 10.2, SFX_MUSIC_DUCK_SHAPE.downTcS, 1, UP]);
    expect(re[2]![2]).toBeCloseTo(11.4, 9);
    x.ctx.currentTime = 10.3;
    sfxAt('torp_hit', 100, 0); // −5 dB・11.1 まで＝浅くて短い
    expect(x.e.stats().duckReworks).toBe(1);
    x.ctx.currentTime = 10.4;
    sfxCue('alarm'); // 警報の冷却は無い（合図の口）: −8 dB・11.2＝浅くも深くもない・短い → 書かない
    x.ctx.currentTime = 10.45;
    sfxAt('blast_l', 200, 0); // −4・10.95＝書かない
    x.ctx.currentTime = 10.5;
    sfxCue('bell'); // −6・11.7＝長い → 直す（窓の 2 回目）
    x.ctx.currentTime = 10.6;
    sfxCue('bell'); // 鐘の最小間隔の内なら鳴らない（落とす）。鳴れば窓の 3 回目＝直さない
    expect(x.e.stats().duckReworks).toBeLessThanOrEqual(SFX_MUSIC_DUCK_SHAPE.reworkMax);
    x.ctx.currentTime = 10.8;
    sfxAt('torp_hit', 100, 0); // 窓の外（0.5 秒の後）: −5・11.6 → 短い＝書かない
    x.ctx.currentTime = 11.0;
    sfxCue('alarm'); // −8・11.8＝長い・新しい窓 → 直す
    const last = duckEv(x).slice(-1)[0] as number[];
    expect([last[1], last[3]]).toEqual([1, UP]);
    expect(last[2]).toBeCloseTo(11.8, 9);
    expect(SFX_MUSIC_DUCK_SHAPE).toEqual({ downTcS: 0.03, upS: 0.25, reworkWindowS: 0.5, reworkMax: 2 });
  });
  it('止まっている context・消音・曲の無い試聴の場（効果音の場）でも、鳴らない単発では下げない。下げるのは下げる音量のノードだけ', () => {
    const x = ducking('suspended');
    sfxCue('alarm');
    sfxAt('torp_hit', 100, 0);
    expect(duckEv(x).length).toBe(0);
    const y = ducking();
    y.e.setMuted(true);
    sfxCue('alarm');
    expect(duckEv(y).length).toBe(0);
    y.e.setMuted(false);
    sfxCue('alarm');
    const g = graph(y.ctx, y.e);
    expect(duckEv(y).length).toBe(3);
    for (const n of [g.music.bus, ...g.music.slots, g.master, g.loopBus]) expect(n.gain.events.filter((e) => e[0] === 'target' && e[1]! < 1 && e[1]! > 0.3 && e[1]! < 0.41).length).toBe(0);
  });
});
