// v0.7.2 S0（アートと音③：BGM と命中スローの音。spec-v0720 §2・§3.3・§8.1）: 曲の楽器（assets/sfx-music-synth）を固定する。
// - 楽器ごとに 1 音を書く: NaN なし・鳴る・立ち上がりは 0 から・書き終わりは −40 dB より下（尾で切っても聞こえない）・分けて書いても一度に書いても同じ標本・輪の末尾をまたぐ音は頭へ続く。
// - 波形表: 表ごとに 10 kHz より上の倍音が無い（22,050 Hz で折り返さない）・大きさは RMS でそろう・表を埋める口は予算を守る・雑音の表は種で決まる。
// - IP1〜IP2 の教え: 曲の音符で 200 Hz より下の基音は 0.4 秒より長く鳴らない（鳴らすなら 2〜6 倍音が 70% 以上）。雑音の打楽器の胴は 180 Hz 以上（任務の緊張のトムは 200 Hz 以上）。
// - 費用の単位は config の MUSIC_COST のとおり。
import { describe, expect, it } from 'vitest';
import { MUSIC_COST, MUSIC_KEYS, MUSIC_SAMPLE_RATE } from '../src/config/sfx-music-config';
import { MUSIC_INSTRUMENTS, MUSIC_TAB, MusicTables, midiHz, musicHarmonic26Share, musicNoteSamples, musicSoundingS, musicUnitsPerSample, stepFm, stepNoise, stepTone, type MusicInst, type MusicNote, type MusicWave } from '../src/assets/sfx-music-synth';
import { composeMusicKey } from '../src/assets/sfx-music-render';
import { spectrum } from '../scripts/sfx-files';

const SR = MUSIC_SAMPLE_RATE;
const TB = new MusicTables();
while (!TB.ready) TB.stepTables(1e9);
const INSTS = Object.keys(MUSIC_INSTRUMENTS) as MusicInst[];
const note = (inst: MusicInst, start: number, len: number, pitch = 69, decayS = 0): MusicNote => ({ inst, start, len, pitch, vel: 1, decayS, noise: 1234 });
/** 1 音を書く（i0〜i1 を区切りの並び cuts で分けて） */
function render(nt: MusicNote, n: number, cuts: readonly number[] = []): Float32Array {
  const x = new Float32Array(n), st = new Float64Array(8), T = musicNoteSamples(nt), kind = MUSIC_INSTRUMENTS[nt.inst].kind;
  const pts = [...new Set([0, ...cuts.filter((c) => c > 0 && c < T), T])].sort((a, b) => a - b);
  for (let k = 0; k + 1 < pts.length; k++) {
    if (kind === 'tone') stepTone(x, n, nt, pts[k]!, pts[k + 1]!, st, TB, 0, 0);
    else if (kind === 'fm') stepFm(x, n, nt, pts[k]!, pts[k + 1]!, st, TB);
    else stepNoise(x, n, nt, pts[k]!, pts[k + 1]!, st, TB);
  }
  return x;
}
const peakOf = (x: Float32Array, a = 0, b = x.length): number => { let p = 0; for (let i = a; i < b; i++) p = Math.max(p, Math.abs(x[i]!)); return p; };
/** hz より上のエネルギーの割合（2 の冪の FFT 1 つ） */
function shareAbove(x: Float32Array, from: number, len: number, hz: number): number {
  const mag = spectrum(x, from, len, len);
  let hi = 0, all = 0;
  for (let i = 1; i < mag.length; i++) { const p = mag[i]! * mag[i]!; all += p; if ((i * SR) / len >= hz) hi += p; }
  return hi / all;
}
/** 楽器ごとの代表の音高（低音のはじく音・金管・鈴・パッド） */
const PITCH: Partial<Record<MusicInst, number>> = { pluck: 48, brass: 70, mute: 72, bell: 79, pad: 64, padDark: 66 };

describe('曲の楽器（v0.7.2 S0）', () => {
  it.each(INSTS)('%s: 1 音を書くと NaN なしで鳴り、立ち上がりは 0 から・書き終わりは −40 dB より下（立ち上がりより短い音も離した所から消える）', (inst) => {
    const len = inst === 'swell' ? 4 * SR : Math.round(0.5 * SR), nt = note(inst, 0, len, PITCH[inst] ?? 69), T = musicNoteSamples(nt);
    const x = render(nt, T + 100);
    expect(x.every((v) => Number.isFinite(v))).toBe(true);
    const p = peakOf(x);
    expect(p).toBeGreaterThan(0.01);
    expect(p).toBeLessThan(4);
    expect(Math.abs(x[0]!)).toBeLessThan(1e-6);
    const tail = Math.max(1, Math.min(Math.round(0.01 * SR), Math.floor(T / 10)));
    expect(peakOf(x, T - tail, T) / p).toBeLessThan(0.01);
    expect(peakOf(x, T, T + 100)).toBe(0);
  });
  it.each(INSTS)('%s: 分けて書いても（区切り 7 か所・状態を残して続きから）一度に書いた標本とビット同一', (inst) => {
    const nt = note(inst, 300, inst === 'swell' ? 2 * SR : Math.round(0.4 * SR), PITCH[inst] ?? 69), T = musicNoteSamples(nt), n = T + 1000;
    const one = render(nt, n), cut = render(nt, n, [1, 31, 32, 33, 1000, Math.floor(T / 2), T - 1]);
    expect(Buffer.from(cut.buffer).equals(Buffer.from(one.buffer))).toBe(true);
  });
  it.each(['pad', 'bell', 'snare', 'brass'] as const)('%s: 輪の末尾をまたぐ音は頭へ続く（輪で書いた標本＝長い配列に書いて末尾を頭へ畳んだ標本）', (inst) => {
    const nt0 = note(inst, 0, Math.round(0.6 * SR), PITCH[inst] ?? 69), T = musicNoteSamples(nt0), n = 3 * T, start = n - Math.floor(T / 3);
    const wrapped = render({ ...nt0, start }, n), long = render({ ...nt0, start }, n + T);
    for (let i = 0; i < n; i++) expect(wrapped[i], `${inst} ${i}`).toBe(i < T ? long[i]! + long[n + i]! : long[i]!);
    expect(peakOf(wrapped, 0, Math.floor(T / 2))).toBeGreaterThan(0);
  });
  it('波形表: どの波形・どのオクターブも、上の端の高さで 10 kHz より上のエネルギーが 0.1% 未満（22,050 Hz で折り返さない）', () => {
    for (const inst of ['pad', 'padDark', 'pluck', 'brass', 'mute'] as const) {
      for (let o = 0; o < 6; o++) {
        const hz = 110 * 2 ** (o + 1) * 0.985, pitch = 69 + 12 * Math.log2(hz / 440), nt = note(inst, 0, 8192, pitch);
        const x = render(nt, 16384);
        expect(shareAbove(x, 4096, 4096, 10200), `${inst} ${hz.toFixed(0)} Hz`).toBeLessThan(0.001);
      }
    }
  });
  it('波形表は RMS でそろう（どの表も 1/√2 ± 1%）・表を埋める口は予算を守り、2,048 単位から進む・雑音の表は種で決まる（2 回作って同じ）', () => {
    for (let r = 0; r < TB.waves.length; r += MUSIC_TAB + 2) {
      let s = 0;
      for (let i = 0; i < MUSIC_TAB; i++) s += TB.waves[r + i]! ** 2;
      expect(Math.sqrt(s / MUSIC_TAB)).toBeCloseTo(Math.SQRT1_2, 2);
      expect(TB.waves[r + MUSIC_TAB]).toBe(TB.waves[r]);
    }
    const t2 = new MusicTables();
    let calls = 0;
    while (!t2.ready) { const u = t2.stepTables(5000); expect(u).toBeLessThanOrEqual(5000); expect(u).toBeGreaterThan(0); calls++; }
    expect(calls).toBeGreaterThan(100);
    expect(Buffer.from(t2.waves.buffer).equals(Buffer.from(TB.waves.buffer))).toBe(true);
    expect(Buffer.from(t2.noise.buffer).equals(Buffer.from(TB.noise.buffer))).toBe(true);
    expect(new MusicTables().stepTables(2047)).toBe(0);
  });
  it('IP1〜IP2 の教え: 曲の音符で 200 Hz より下の基音は 0.4 秒より長く鳴らない（鳴らすなら 2〜6 倍音が 70% 以上）', () => {
    let low = 0;
    for (const k of MUSIC_KEYS) {
      for (const nt of composeMusicKey(k).notes) {
        const d = MUSIC_INSTRUMENTS[nt.inst];
        if (d.kind === 'noise' || midiHz(nt.pitch) >= 200) continue;
        low++;
        const ok = musicSoundingS(nt) <= 0.4 || musicHarmonic26Share(d.wave as MusicWave, midiHz(nt.pitch)) >= 0.7;
        expect(ok, `${k} ${nt.inst} ${midiHz(nt.pitch).toFixed(0)} Hz ${musicSoundingS(nt).toFixed(2)} 秒`).toBe(true);
      }
    }
    expect(low).toBeGreaterThan(0); // B・C のはじく低音（空の検査にしない）
  });
  it('雑音の打楽器の胴は 180 Hz 以上（任務の緊張のトムは 200 Hz 以上＝spec §3.6）・うねりの帯は 400〜1,600 Hz・震えは 2〜4 kHz', () => {
    for (const inst of INSTS) {
      const d = MUSIC_INSTRUMENTS[inst];
      if (d.kind === 'noise' && (d.bodyGain ?? 0) > 0) expect(Math.min(d.bodyHz!, d.bodyToHz!), inst).toBeGreaterThanOrEqual(180);
    }
    expect(Math.min(MUSIC_INSTRUMENTS.tom.bodyHz!, MUSIC_INSTRUMENTS.tom.bodyToHz!)).toBeGreaterThanOrEqual(200);
    expect([MUSIC_INSTRUMENTS.swell.hpHz, MUSIC_INSTRUMENTS.swell.lpHz]).toEqual([400, 1600]);
    expect([MUSIC_INSTRUMENTS.shaker.hpHz, MUSIC_INSTRUMENTS.shaker.lpHz]).toEqual([2000, 4000]);
  });
  it('楽器の数（spec §3.3）: パッドの立ち上がり 1.5 秒・鈴は FM 3.5:1・はじく音の減衰 0.2〜0.4 秒・金管は 0.15 秒からビブラート・弱音器は 5.5 Hz', () => {
    expect(MUSIC_INSTRUMENTS.pad.attackS).toBe(1.5);
    expect(MUSIC_INSTRUMENTS.bell).toMatchObject({ kind: 'fm', ratio: 3.5 });
    expect(MUSIC_INSTRUMENTS.pluck.decayS >= 0.2 && MUSIC_INSTRUMENTS.pluck.decayS <= 0.4).toBe(true);
    expect(MUSIC_INSTRUMENTS.brass).toMatchObject({ vibDelayS: 0.15, wave2: 'brassHi' });
    expect(MUSIC_INSTRUMENTS.mute).toMatchObject({ vibHz: 5.5, vibDelayS: 0.15 });
  });
  it('費用の単位（config の MUSIC_COST）: 波形表 1・金管（2 つの表）2・FM 3・雑音 2', () => {
    expect(INSTS.map((i) => musicUnitsPerSample(i))).toEqual(INSTS.map((i) => {
      const d = MUSIC_INSTRUMENTS[i];
      return d.kind === 'fm' ? MUSIC_COST.fm : d.kind === 'noise' ? MUSIC_COST.noise : d.wave2 ? MUSIC_COST.toneMix : MUSIC_COST.tone;
    }));
    expect(musicUnitsPerSample('pad')).toBe(1);
    expect(musicUnitsPerSample('brass')).toBe(2);
    expect(musicUnitsPerSample('bell')).toBe(3);
    expect(musicUnitsPerSample('snare')).toBe(2);
  });
});
