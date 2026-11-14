// v0.7.2 S2（アートと音③：BGM と命中スローの音。spec-v0720 §7・brief L25）: 曲の試聴の場の行 2「効果音と一緒に」の台本 systems/sfx-lab-demo を偽の context のエンジンで確かめる。
// - ゲームと同じ口で鳴る: 聞き手 (0, 0)・距離の帯（大砲は近い音／遠雷）・位置なしの合図・ループの目標（エンジンと海はゲームの式）。曲を下げる表はエンジンの中で同じに効く（探照灯・近い大きい爆発・魚雷の命中・警報）。
// - くり返しの秒で頭へ。止めるとループを止めて聞き手を外す（その後の位置つきの音は鳴らない）。
// - v0.7.2 S3: 「命中＋スロー」の台本と行 3 の命中（queueHit）は、torp_hit と命中スローの残り秒（世界と同じ読み口・data の秒）で、ゲームと同じ道の命中スローの音になる。
import { afterEach, describe, expect, it } from 'vitest';
import hitRateModel from '../data/hit_rate_model.json';
import { MUSIC_LAB_DEMOS } from '../src/config/music-lab-config';
import { SFX_KEYS, SFX_LOOP_ENGINE, SFX_LOOP_SEA, type SfxKey } from '../src/config/sfx-config';
import { SFX_SLOW, SFX_SLOW_DEFAULT_ID, SFX_SLOW_SHAPE } from '../src/config/sfx-music-config';
import { registerSfxEngine, registerSfxListener, registerSfxSlowMo, sfxAt, sfxLoops } from '../src/systems/sfx-bus';
import { createSfxLoopTargets } from '../src/core/sfx-loops';
import { SfxLabDemo } from '../src/systems/sfx-lab-demo';
import { fakeSamples, graph, setup } from './sfx-engine-kit';
import { FRAME_S } from './sfx-music-kit';

afterEach(() => {
  registerSfxEngine(null);
  registerSfxListener(null);
  registerSfxSlowMo(null);
});
const SLOW_S = hitRateModel.feel.hit_slowmo_seconds;
/** 全部の鍵の標本の代わりを持つエンジン（登録する） */
function engine(): ReturnType<typeof setup> {
  const x = setup();
  for (const k of SFX_KEYS) x.e.setBuffer(k, fakeSamples(k));
  registerSfxEngine(x.e);
  return x;
}
/** s 秒、エンジンと台本を一緒に進める（ゲームの時計と再生の時計） */
function step(x: ReturnType<typeof setup>, d: SfxLabDemo, s: number): void {
  for (let i = Math.round(s / FRAME_S); i > 0; i--) {
    x.ctx.currentTime += FRAME_S;
    x.e.tick(FRAME_S, 0);
    d.update(FRAME_S);
  }
}
const played = (x: ReturnType<typeof setup>, k: SfxKey): number => x.e.stats().played[SFX_KEYS.indexOf(k)]!;

describe('曲の試聴の場の台本（効果音と一緒に）', () => {
  it('戦闘＋砲声: 8 秒の台本がゲームと同じ口で鳴る（大砲は帯 1 で近い音・3,000 m で遠雷）。下げは探照灯・近い大きい爆発（帯 0・帯 1）・魚雷の命中の 4 回。くり返す', () => {
    const x = engine();
    const d = new SfxLabDemo();
    d.start(2);
    expect(d.active).toBe(2);
    step(x, d, 8.05);
    expect(['gun_near', 'gun_far', 'mg', 'splash_l', 'blast_l', 'torp_hit', 'light_on', 'hull_hit'].map((k) => played(x, k as SfxKey))).toEqual([2, 1, 3, 2, 2, 1, 1, 1]);
    expect(x.e.stats().ducks).toBe(4);
    step(x, d, 8);
    expect(played(x, 'gun_near')).toBe(4);
    expect(MUSIC_LAB_DEMOS[2]!.periodS).toBe(8);
  });
  it('ループはゲームの式の目標（エンジンは速力帯の音量・rate は速さの割合・海は速さで）を 10 Hz で渡す。止めるとループを止め、聞き手を外す', () => {
    const x = engine();
    const d = new SfxLabDemo();
    d.start(0);
    step(x, d, 0.5);
    expect(x.e.stats().loops).toBe(5);
    const g = graph(x.ctx, x.e).loops;
    const q = MUSIC_LAB_DEMOS[0]!;
    expect(g[0]!.gain.events.slice(-1)[0]!.slice(0, 2)).toEqual(['target', SFX_LOOP_ENGINE.gainCruise]);
    expect(g[1]!.gain.events.slice(-1)[0]![1]).toBeCloseTo(SFX_LOOP_SEA.gainBase + SFX_LOOP_SEA.gainSpeed * q.speed, 12);
    d.stop();
    expect(d.active).toBe(-1);
    step(x, d, 0.5);
    expect(x.e.stats().loops).toBe(0);
    const n = played(x, 'mg');
    sfxAt('mg', 10, 0); // 聞き手が無い＝鳴らない
    expect(played(x, 'mg')).toBe(n);
    d.stop(); // 2 回目は何もしない
  });
  it('発見＋警報: 警報で曲を −8 dB 下げる（U-M1）。別の台本へは頭から替える（ループは続ける）', () => {
    const x = engine();
    const d = new SfxLabDemo();
    d.start(1);
    step(x, d, 1);
    expect(played(x, 'alarm')).toBe(1);
    expect(graph(x.ctx, x.e).music.duck.gain.events[1]!.slice(0, 2)).toEqual(['target', 10 ** (-8 / 20)]);
    const loops = x.e.stats().loopStarts;
    d.start(2);
    step(x, d, 1);
    expect([x.e.stats().loopStarts, x.e.stats().loops]).toEqual([loops, 5]);
    expect(played(x, 'light_on')).toBe(1);
  });
  it('命中＋スロー（S3）: 台本の命中で torp_hit と命中スロー（data の秒・ゲームの案）。スローの間に濾波器はゲームの案の Hz・終われば素通しへ。くり返す', () => {
    const x = engine();
    const d = new SfxLabDemo();
    d.slowS = SLOW_S;
    d.start(3);
    step(x, d, 1.05);
    expect(played(x, 'torp_hit')).toBe(1);
    expect(x.e.stats().slow).toMatchObject({ on: true, rises: 1, shown: SFX_SLOW_DEFAULT_ID, loopFactor: SFX_SLOW[SFX_SLOW_DEFAULT_ID].loopRate });
    expect(x.e.stats().slow.filterHz).toBe(SFX_SLOW[SFX_SLOW_DEFAULT_ID].filterHz);
    step(x, d, SLOW_S);
    expect(x.e.stats().slow).toMatchObject({ on: false, shown: null, filterHz: SFX_SLOW_SHAPE.idleHz });
    step(x, d, 8 - 1.05 - SLOW_S + 1.05);
    expect([played(x, 'torp_hit'), x.e.stats().slow.rises]).toEqual([2, 2]);
  });
  it('行 3 の命中（queueHit）: 台本がまだなら始まった時に 1 回・鳴っていれば今。止めると待っている命中は消え、スローを解いて読み口を外す（その後の sfxLoops は読まない）', () => {
    const x = engine();
    const d = new SfxLabDemo();
    d.slowS = SLOW_S;
    d.queueHit();
    d.stop(); // 待っている命中を消す
    d.start(0);
    step(x, d, 0.5);
    expect([played(x, 'torp_hit'), x.e.stats().slow.rises]).toEqual([0, 0]);
    d.stop();
    d.queueHit();
    expect(played(x, 'torp_hit')).toBe(0);
    d.start(0);
    step(x, d, FRAME_S);
    expect([played(x, 'torp_hit'), x.e.stats().slow.on]).toEqual([1, true]);
    step(x, d, 0.3);
    d.queueHit();
    step(x, d, FRAME_S);
    expect([played(x, 'torp_hit'), x.e.stats().slow.rises]).toEqual([2, 1]); // 最中の命中は残り秒を入れ直すだけ
    d.stop();
    expect(x.e.stats().slow.on).toBe(false);
    sfxLoops(createSfxLoopTargets(), FRAME_S); // 読み口は外れている
    expect(x.e.stats().slow.on).toBe(false);
  });
});
