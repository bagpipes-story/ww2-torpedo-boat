// v0.7.2 S1: 曲の再生のテスト（tests/sfx-engine-music・sfx-music-build）が共有する道具。偽の context とエンジンは tests/sfx-engine-kit。
// S2: 指紋に任務の家族の 3 層（tests/sfx-music-render と同じ数）・ゲームの列を最後まで作る buildList・家族の標本の代わり putFamily。
// 曲の音源は「繰り返す・長い buffer」（効果音のループは 4 秒＝88,200 標本まで）で見分ける。時計は 1/60 秒ずつ（再生の時計も進める。実時間は 0＝見張りを動かさない）。
import { MUSIC_KEYS, MUSIC_LAYER_KEYS, MUSIC_LENGTHS, MUSIC_PLAYER, MUSIC_SAMPLE_RATE, type MusicKey } from '../src/config/sfx-music-config';
import type { SfxBuffer } from '../src/systems/sfx-audio-types';
import type { SfxEngine } from '../src/systems/sfx-engine';
import type { SfxSceneEvents } from '../src/systems/sfx-mission';
import type { FakeBuffer, FakeCtx, FakeSource } from './sfx-engine-kit';

export type X = { ctx: FakeCtx; e: SfxEngine };
export const FRAME_S = 1 / 60;
export const TC = MUSIC_PLAYER.fadeTc;
export const LEAD = MUSIC_PLAYER.startLeadS;
/** 曲の音源（繰り返す・長い buffer。効果音のループは 4 秒＝88,200 標本まで） */
export const musicSrcs = (ctx: FakeCtx): FakeSource[] => ctx.sources.filter((s) => s.loop && s.buffer !== null && s.buffer.length > 100_000);
/** 鳴っている（stop を呼んでいないか、予約の stop がまだ先） */
export const alive = (x: X): FakeSource[] => musicSrcs(x.ctx).filter((s) => !s.stopped || s.stopAt > x.ctx.currentTime);
export const unstopped = (x: X): FakeSource[] => musicSrcs(x.ctx).filter((s) => !s.stopped);
/** 標本の代わり（長さは表どおり・中身は 0） */
export function put(x: X, key: MusicKey): FakeBuffer {
  const b = x.ctx.createBuffer(1, MUSIC_LENGTHS[key], MUSIC_SAMPLE_RATE);
  x.e.music.build.buffers[MUSIC_KEYS.indexOf(key)] = b as unknown as SfxBuffer;
  return b;
}
/** s 秒進める（再生の時計も。実時間は 0＝見張りを動かさない） */
export function run(x: X, s: number): void {
  for (let i = Math.round(s / FRAME_S); i > 0; i--) {
    x.ctx.currentTime += FRAME_S;
    x.e.tick(FRAME_S, 0);
  }
}
/** 16 bit に丸めた標本の FNV-1a と、既定のタイトルの曲・候補の指紋（tests/sfx-music-render の FINGERPRINTS と同じ数） */
export function fingerprint16(x: Float32Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < x.length; i++) {
    const v = Math.round(x[i]! * 32767) & 0xffff;
    h = Math.imul(h ^ (v & 0xff), 0x01000193) >>> 0;
    h = Math.imul(h ^ (v >>> 8), 0x01000193) >>> 0;
  }
  return h;
}
export const FINGERPRINTS: Readonly<Record<MusicKey, number>> = {
  title_a: 4284675595, title_d: 603232752, title_e: 1072575395, mission_l0: 900593930, mission_l1: 3400001408, mission_l2: 542741560,
};
/** 今作っている曲（無ければ次に作る曲）を作り終えるまで回し、もう 2 フレーム進める（列が空なら作業用の配列を捨てるフレーム）。作り終えたフレーム数を返す */
export function buildAll(x: X, maxFrames = 3000): number {
  for (let f = 0; f < maxFrames; f++) {
    run(x, FRAME_S);
    if (x.e.music.build.key === null && f > 2) {
      run(x, 2 * FRAME_S);
      return f;
    }
  }
  return -1;
}
/** v0.7.2 S2: ゲームの列が空になる（作業用の配列を捨てる）まで回す。回したフレーム数を返す（作り終えなければ −1） */
export function buildList(x: X, maxFrames = 6000): number {
  for (let f = 0; f < maxFrames; f++) {
    run(x, FRAME_S);
    const st = x.e.music.stats();
    if (st.tables && !st.work && st.building === null && st.buildCalls > 0) return f;
  }
  return -1;
}
/** v0.7.2 S2: 任務の家族の 3 層の標本の代わりを置く（長さは表どおり・中身は 0） */
export function putFamily(x: X): FakeBuffer[] {
  return MUSIC_LAYER_KEYS.map((k) => put(x, k));
}
/** Hud の scene.events の代わり（on・once で覚えた口を fire で呼ぶ。off は消す） */
export function sceneEvents(): SfxSceneEvents & { fire(e: string): void } {
  const calls: Record<string, (() => void)[]> = {};
  const add = (e: string, f: () => void, c: unknown): void => { (calls[e] ??= []).push(f.bind(c)); };
  return { on: add, once: add, off: (e: string) => { delete calls[e]; }, fire: (e: string) => { for (const f of calls[e] ?? []) f(); } };
}
