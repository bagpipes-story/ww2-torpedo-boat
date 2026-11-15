// v0.7.2 S1: 曲の再生のテスト（tests/sfx-engine-music・sfx-music-build）が共有する道具。偽の context とエンジンは tests/sfx-engine-kit。
// S2: 指紋に任務の家族の 3 層（tests/sfx-music-render と同じ数）・ゲームの列を最後まで作る buildList・家族の標本の代わり putFamily。
// 曲の音源は「繰り返す・長い buffer」（効果音のループは 4 秒＝88,200 標本まで）で見分ける。時計は 1/60 秒ずつ（再生の時計も進める。実時間は 0＝見張りを動かさない）。
// v0.7.2 S4: 消した D（前）（IP1 の D）の楽譜の表の写し PREV_THEME（作曲器・合成の試験の材料。下の注）。
import { MUSIC_KEYS, MUSIC_LAYER_KEYS, MUSIC_LENGTHS, MUSIC_PLAYER, MUSIC_SAMPLE_RATE, type MusicKey } from '../src/config/sfx-music-config';
import { composeMusic, type MusicRhythm, type MusicScore, type MusicTheme } from '../src/assets/sfx-music-compose';
import { SeededRng } from '../src/core/rng';
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
  title_d: 2970034224, mission_l0: 900593930, mission_l1: 3400001408, mission_l2: 542741560,
};

/** 32 分の連打（from の 16 分から to まで・強さ v0 → v1。assets/sfx-music-themes の roll と同じ） */
function roll(from: number, to: number, v0: number, v1: number): number[] {
  const out: number[] = [], k = (to - from) * 2;
  for (let i = 0; i < k; i++) out.push(from + i / 2, 0.5, Math.round(v0 + ((v1 - v0) * i) / Math.max(1, k - 1)));
  return out;
}
const PREV_CHORDS = ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'Gm', 'A'] as const;
const PREV_MARCH: readonly MusicRhythm[] = [[0, 1, 100, 2, 1, 45, 3, 1, 50, 4, 1, 80, 6, 1, 50, 8, 1, 95, 10, 1, 45, 11, 1, 50, 12, 1, 80, 14, 1, 50], [0, 1, 100, 3, 1, 55, 4, 1, 80, 6, 1, 50, 7, 1, 55, 8, 1, 95, 11, 1, 55, 12, 1, 80, 14, 1, 50, 15, 1, 55]];
/**
 * v0.7.2 S4: 消した D（前）＝IP1 の D（鍵 title_d_prev・種 7609・音量 0.481。v0.7.2 IP2 の assets/sfx-music-themes の表の写し）。作曲器の「計画の無い 1 小節 1 和音のタイトルの道」
 * （動機の変形 motifs・句の終わりの型 ends・小太鼓の連打 fill・根音の刻み root・部屋の響き）はゲームの曲では任務の家族と D が別々に使うだけになったので、試験の材料として持つ。
 * 指紋 603232752 は IP1 の D とビット同一（作曲器と合成が変わっていない証。tests/sfx-music-render）。鍵は長さの同じ title_d を借りる（作曲器が鍵で読むのは長さだけ）
 */
export const PREV_THEME: MusicTheme = {
  key: 'title_d', bpm: 126, beats: 4, bars: 16, tonic: 2, mode: 'aeolian', chords: [...PREV_CHORDS, ...PREV_CHORDS], room: [0.16, 1.0],
  melody: {
    inst: 'horn', low: 65, high: 79, vel: 1, span: 1, legato: 0.85, voices: 2, cents: 6,
    rhythms: [[0, 4, 100, 4, 4, 80, 8, 6, 90, 14, 2, 70], [0, 6, 100, 6, 2, 75, 8, 4, 90, 12, 4, 80], [0, 3, 100, 3, 1, 70, 4, 4, 85, 8, 8, 95], [0, 4, 100, 4, 2, 75, 6, 2, 75, 8, 4, 90, 12, 4, 80], [0, 8, 100, 8, 3, 85, 11, 1, 70, 12, 4, 90]],
    ends: [[0, 4, 90, 4, 4, 80, 8, 8, 100], [0, 6, 95, 6, 2, 75, 8, 8, 100], [0, 16, 100]],
    cadences: [[4, 'half'], [8, 'end'], [12, 'half'], [16, 'end']], motifs: [[5, 1], [9, 1], [13, 5]],
  },
  parts: [
    { inst: 'pad', pitch: 'chord', low: 57, high: 71, vel: 0.4, voices: 2, cents: 4, rhythms: [[0, 16, 100]] },
    { inst: 'bowed', pitch: 'root', low: 57, high: 69, vel: 0.55, voices: 2, cents: 7, human: 0.06, rhythms: [[0, 1, 100, 2, 1, 55, 4, 1, 80, 6, 1, 55, 8, 1, 95, 10, 1, 55, 12, 1, 80, 14, 1, 60]] },
    { inst: 'snare', pitch: 'none', low: 0, high: 0, vel: 0.4, human: 0.08, fillEvery: 4, rhythms: PREV_MARCH, fill: [0, 1, 100, 2, 1, 45, 4, 1, 80, 6, 1, 50, ...roll(8, 16, 40, 100)] },
    { inst: 'boom', pitch: 'none', low: 0, high: 0, vel: 0.7, human: 0.05, rhythms: [[0, 4, 100, 8, 4, 80]] },
  ],
};
/** D（前）の種・種の鎖の始まり（IP1 の「決まりを全部通る最初の種」＝消した A 7603 の次から）・指紋（16 bit の FNV） */
export const PREV_SEED = 7609;
export const PREV_CHAIN_FROM = 7604;
export const PREV_FINGERPRINT = 603232752;
/** D（前）の楽譜（同じ種は同じ音符） */
export const prevScore = (): MusicScore => composeMusic(PREV_THEME, new SeededRng(PREV_SEED));
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
