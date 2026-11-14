// v0.7.2 S3: 命中スローの音のテスト（tests/sfx-slowmo・sfx-slowmo-flow）が共有する道具。偽の context とエンジンは tests/sfx-engine-kit、曲の道具は tests/sfx-music-kit。
// 任務の形: 全部の鍵と家族の標本・エンジンと世界の代わり（残り秒）を登録・Hud の MissionSfx。フレームの順はゲームと同じ（エンジンの tick → 世界の残り秒を実時間で引く → Hud の update）。
import hitRateModel from '../data/hit_rate_model.json';
import { SFX_KEYS } from '../src/config/sfx-config';
import { SFX_SLOW_DEFAULT_ID, SFX_SLOW_SHAPE, type SfxSlowId } from '../src/config/sfx-music-config';
import { registerSfxEngine, registerSfxSlowMo, sfxSlowVariant } from '../src/systems/sfx-bus';
import { MissionSfx } from '../src/systems/sfx-mission';
import { type FakeCtx, type FakeSource, fakeSamples, graph, setup } from './sfx-engine-kit';
import { tel } from './sfx-loops-kit';
import { FRAME_S, putFamily, sceneEvents } from './sfx-music-kit';

export const SLOW_S = hitRateModel.feel.hit_slowmo_seconds;
export const SH = SFX_SLOW_SHAPE;
export type X = ReturnType<typeof setup>;
export interface M { x: X; world: { slowMoLeftS: number }; sfx: MissionSfx; ev: ReturnType<typeof sceneEvents> }
/** 効果音のループ（4 秒まで）の鳴っている音源 */
export const loopSrcs = (ctx: FakeCtx): FakeSource[] => ctx.sources.filter((s) => s.loop && s.buffer !== null && s.buffer.length <= 100_000 && !s.stopped);
export const FULL = tel({ targetStep: 'full', speedMps: 15 });

/** 任務: 全部の鍵と家族の標本・エンジンと世界の代わりを登録・MissionSfx（Hud の口）。案は id（既定はゲームの案） */
export function mission(state = 'running', id: SfxSlowId = SFX_SLOW_DEFAULT_ID, family = true): M {
  const x = setup(state);
  for (const k of SFX_KEYS) x.e.setBuffer(k, fakeSamples(k));
  if (family) putFamily(x);
  registerSfxEngine(x.e);
  sfxSlowVariant(id);
  const world = { slowMoLeftS: 0 };
  registerSfxSlowMo(world);
  const ev = sceneEvents();
  return { x, world, sfx: new MissionSfx(ev, 40), ev };
}
/** s 秒（ゲームと同じ順: tick → 世界の残り秒を引く → Hud の update）。hud が false なら Hud と Mission は止まっている（一時停止） */
export function frames(m: M, s: number, hud = true, t = FULL): void {
  for (let i = Math.round(s / FRAME_S); i > 0; i--) {
    m.x.ctx.currentTime += FRAME_S;
    m.x.e.tick(FRAME_S, 0);
    if (!hud) continue;
    if (m.world.slowMoLeftS > 0) m.world.slowMoLeftS -= FRAME_S;
    m.sfx.update(t, FRAME_S * 1000);
  }
}
/** 1 フレームずつ進め、濾波器へ何か書いたフレームの時刻を返す（max 秒まで） */
export function untilBed(m: M, max: number): number {
  const f = graph(m.x.ctx, m.x.e).bed.frequency;
  const n = f.events.length;
  for (let i = Math.round(max / FRAME_S); i > 0 && f.events.length === n; i--) frames(m, FRAME_S);
  return f.events.length === n ? NaN : m.x.ctx.currentTime;
}
export const lastRate = (s: FakeSource): number => s.playbackRate.events.length ? s.playbackRate.events[s.playbackRate.events.length - 1]![1]! : s.playbackRate.value;

