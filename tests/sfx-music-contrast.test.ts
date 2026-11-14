// v0.7.2 IP1（実機 1 回目。ユーザー「緊張と戦闘の音楽はおなじでは？」）: 任務の曲の緊張と戦闘がはっきり違うことを数で固定する。
// 比べるのは出口の重ね（層の標本 × 鍵の音量 × 段の重さ × master 0.8。L2 は 8 小節に 4 回）。S2 の家族は 発音 1.18 倍・2〜5 kHz ＋2.3 dB・RMS ＋3.0 dB で、耳では同じに聞こえた。
// - 発音の密度（scripts/sfx-files の onsetRate）: 戦闘は緊張の 2 倍以上・緊張は毎秒 3 音まで（まばら）。
// - 2〜5 kHz の帯（小太鼓のはじける所・iPhone の本体でよく出る所）の出口の大きさ: 戦闘は緊張より 4 dB 以上。RMS は 2.5 dB 以上（目標の差 3 dB）。
// - 楽譜の形: 緊張（L1）は 1 小節に 6 音まで（心音・2 音の刻み。トレモロは長い 1 音）で小太鼓と 16 分の刻みなし、戦闘（L2）は 16 分の小太鼓（2 小節目は 32 分の連打）・
//   拍ごとの打ち・金管の刻み（1 小節に 5 回以上）・16 分の低い弓の刻み。どの楽器も基音 200 Hz 以上（iPhone の本体で鳴る）。
import { describe, expect, it } from 'vitest';
import {
  MUSIC_BUILD_BUDGET, MUSIC_GAIN, MUSIC_LAYER_KEYS, MUSIC_MASTER_GAIN, MUSIC_MOOD_BATTLE, MUSIC_MOOD_QUIET, MUSIC_MOOD_TENSE, MUSIC_MOOD_WEIGHTS, MUSIC_SAMPLE_RATE, MUSIC_WORK_SAMPLES,
  type MusicKey,
} from '../src/config/sfx-music-config';
import { sixteenthOf } from '../src/assets/sfx-music-compose';
import { composeMusicKey, renderMusic } from '../src/assets/sfx-music-render';
import { MUSIC_INSTRUMENTS, MusicTables, midiHz } from '../src/assets/sfx-music-synth';
import { MUSIC_THEMES } from '../src/assets/sfx-music-themes';
import { bandShare, onsetRate } from '../scripts/sfx-files';

const SR = MUSIC_SAMPLE_RATE;
const TB = new MusicTables();
const WORK = new Float32Array(MUSIC_WORK_SAMPLES);
const X = Object.fromEntries(MUSIC_LAYER_KEYS.map((k) => [k, renderMusic(k, MUSIC_BUILD_BUDGET, TB, WORK)])) as Record<MusicKey, Float32Array>;
const db = (v: number): number => 10 * Math.log10(v);
/** 段 mood の出口の重ね */
function mix(mood: number): Float32Array {
  const n = X.mission_l0.length, out = new Float32Array(n), w = MUSIC_MOOD_WEIGHTS[mood]!;
  MUSIC_LAYER_KEYS.forEach((k, li) => { const x = X[k], g = w[li]! * MUSIC_GAIN[k] * MUSIC_MASTER_GAIN; if (g > 0) for (let i = 0; i < n; i++) out[i] = out[i]! + x[i % x.length]! * g; });
  return out;
}
const power = (x: Float32Array): number => x.reduce((a, v) => a + v * v, 0) / x.length;
const M = [MUSIC_MOOD_QUIET, MUSIC_MOOD_TENSE, MUSIC_MOOD_BATTLE].map((m) => { const x = mix(m), p = power(x), s = bandShare(x, SR, 2000, 5000); return { rms: db(p), band: db(p * s), onsets: onsetRate(x, SR) }; });
const TENSE = M[MUSIC_MOOD_TENSE]!, BATTLE = M[MUSIC_MOOD_BATTLE]!;
/** 楽譜の 1 小節あたりの音の数（楽器ごと・声の重なりは 1 つに数える） */
function perBar(key: MusicKey, inst: string): number {
  const sc = composeMusicKey(key), th = sc.theme, starts = new Set(sc.notes.filter((x) => x.inst === inst).map((x) => x.start));
  return starts.size / th.bars;
}

describe('緊張と戦闘の違い（v0.7.2 IP1）', () => {
  it('発音の密度: 戦闘は緊張の 2 倍以上・緊張は毎秒 3 音まで（まばら）・静かは毎秒 1 音まで', () => {
    expect(BATTLE.onsets / TENSE.onsets, `緊張 ${TENSE.onsets.toFixed(2)}・戦闘 ${BATTLE.onsets.toFixed(2)}/秒`).toBeGreaterThanOrEqual(2);
    expect(TENSE.onsets).toBeLessThanOrEqual(3);
    expect(M[MUSIC_MOOD_QUIET]!.onsets).toBeLessThanOrEqual(1);
  });
  it('2〜5 kHz の帯の出口の大きさ: 戦闘は緊張より 4 dB 以上大きい・RMS は 2.5 dB 以上大きい（目標の差 3 dB）', () => {
    expect(BATTLE.band - TENSE.band, `緊張 ${TENSE.band.toFixed(1)}・戦闘 ${BATTLE.band.toFixed(1)} dBFS`).toBeGreaterThanOrEqual(4);
    expect(BATTLE.rms - TENSE.rms).toBeGreaterThanOrEqual(2.5);
  });
  it('段の重さ: 静か (1, 0, 0) のまま・戦闘は緊張の層を 0.5 以下に下げて走る層を 1（「緊張 ＋ 打楽器」にしない）', () => {
    expect(MUSIC_MOOD_WEIGHTS[MUSIC_MOOD_QUIET]).toEqual([1, 0, 0]);
    const [, l1t, l2t] = MUSIC_MOOD_WEIGHTS[MUSIC_MOOD_TENSE]!, [, l1b, l2b] = MUSIC_MOOD_WEIGHTS[MUSIC_MOOD_BATTLE]!;
    expect([l1t, l2t, l2b]).toEqual([1, 0, 1]);
    expect(l1b).toBeLessThanOrEqual(0.5);
  });
  it('楽譜の形: 緊張は 1 小節に 6 音まで（心音・2 音の刻み・長いトレモロ）で小太鼓なし、戦闘は 16 分の小太鼓と 32 分の連打・拍ごとの打ち・金管の刻み・16 分の低い弓', () => {
    const l1 = MUSIC_THEMES.mission_l1.parts, l2 = MUSIC_THEMES.mission_l2.parts;
    expect(l1.map((p) => p.inst).sort()).toEqual(['boom', 'bowed', 'trem']);
    expect(perBar('mission_l1', 'boom') + perBar('mission_l1', 'bowed')).toBeLessThanOrEqual(6);
    expect(perBar('mission_l1', 'trem')).toBeLessThanOrEqual(0.25); // 4 小節に 1 音
    expect(l2.map((p) => p.inst).sort()).toEqual(['boom', 'bowed', 'snare', 'stab']);
    const six = sixteenthOf(MUSIC_THEMES.mission_l2.bpm), snare = composeMusicKey('mission_l2').notes.filter((x) => x.inst === 'snare');
    expect(snare.filter((x) => x.start < 16 * six).length).toBe(16); // 1 小節目は 16 分の全部
    expect(snare.filter((x) => x.start >= 24 * six).length).toBe(16); // 2 小節目の後半は 32 分の連打
    expect(perBar('mission_l2', 'boom')).toBe(4);
    expect(perBar('mission_l2', 'stab')).toBeGreaterThanOrEqual(5);
    expect(perBar('mission_l2', 'bowed')).toBe(16);
  });
  it('任務の家族の音高のある音は基音 200 Hz 以上（iPhone の本体で鳴る）・打ちの胴は 220 Hz 以上', () => {
    for (const k of MUSIC_LAYER_KEYS) {
      for (const x of composeMusicKey(k).notes) if (MUSIC_INSTRUMENTS[x.inst].kind !== 'noise') expect(midiHz(x.pitch), `${k} ${x.inst}`).toBeGreaterThanOrEqual(200);
    }
    expect(Math.min(MUSIC_INSTRUMENTS.boom.bodyHz!, MUSIC_INSTRUMENTS.boom.bodyToHz!)).toBeGreaterThanOrEqual(220);
  });
});
