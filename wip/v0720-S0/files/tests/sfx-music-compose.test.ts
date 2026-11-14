// v0.7.2 S0（アートと音③：BGM と命中スローの音。spec-v0720 §3.1・§3.2・§8.1）: 作曲器（assets/sfx-music-compose）を固定する。
// - 同じ種は同じ音符・種は「決まりを全部通る最初の種」（鍵の順に前の鍵の種の次から探す＝scripts/sfx-music.ts の SEARCH=1 と同じ）。
// - 旋律の決まり: 旋法の中・強拍の和音の音 ≥ 80%・順次 60〜85%（跳躍がある）・跳躍の戻り ≥ 90%・音域・句の終わり（half は 2 度か 5 度・end は主音／和音に無ければ根音）・
//   5〜6 小節目は 1〜2 小節目の変形（同じリズム・違う音）。決まり文句（§3.1）の見張りが効く（わざと破った旋律で確かめる）。
// - 旋律の音の並びは source に無い（MIDI らしい数の 4 つ以上の並び・音名の並びを置かない＝和音の進行とリズムの型だけ）。
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MUSIC_KEYS, MUSIC_LENGTHS, type MusicKey } from '../src/config/sfx-music-config';
import { MELODY_MIN_NOTES, barScale, chordPcs, composeMusic, melodyCheck, pcOf, sixteenthOf, type MusicScore, type MusicTheme } from '../src/assets/sfx-music-compose';
import { musicNoteSamples, type MusicNote } from '../src/assets/sfx-music-synth';
import { MUSIC_SEEDS, MUSIC_THEMES, musicRng } from '../src/assets/sfx-music-themes';
import { SeededRng } from '../src/core/rng';

const SCORES = Object.fromEntries(MUSIC_KEYS.map((k) => [k, composeMusic(MUSIC_THEMES[k], musicRng(k))])) as Record<MusicKey, MusicScore>;
const MELODIC: readonly MusicKey[] = ['title_a', 'title_b', 'title_c', 'mission_l0'];
/** 旋律の音を入れ替えた楽譜（決まり文句の見張りの確かめ用。リズムは元のまま） */
function withPitches(sc: MusicScore, pitches: readonly number[]): MusicScore {
  const melody = sc.melody.map((m, i) => ({ ...m, pitch: pitches[i % pitches.length]! }));
  return { ...sc, melody, notes: [...melody, ...sc.notes.slice(sc.melody.length)] };
}

describe('作曲器（v0.7.2 S0）', () => {
  it.each([...MUSIC_KEYS])('%s: 同じ種は同じ音符（2 回作って同じ）・違う種は違う旋律', (k) => {
    const again = composeMusic(MUSIC_THEMES[k], new SeededRng(MUSIC_SEEDS[k]));
    expect(again.notes).toEqual(SCORES[k].notes);
    if (SCORES[k].melody.length > 0) expect(composeMusic(MUSIC_THEMES[k], new SeededRng(MUSIC_SEEDS[k] + 1000)).melody.map((m) => m.pitch)).not.toEqual(SCORES[k].melody.map((m) => m.pitch));
  });
  it('種は鍵の順に「決まりを全部通る最初の種」（7601 から・前の鍵の種の次から）', () => {
    let from = 7601;
    for (const k of MUSIC_KEYS) {
      for (let s = from; s < MUSIC_SEEDS[k]; s++) expect(melodyCheck(composeMusic(MUSIC_THEMES[k], new SeededRng(s))).violations.length, `${k} ${s}`).toBeGreaterThan(0);
      expect(melodyCheck(SCORES[k]).violations, k).toEqual([]);
      from = MUSIC_SEEDS[k] + 1;
    }
  });
  it.each([...MUSIC_KEYS])('%s: 長さは表のとおり・どの音符も輪の中で始まり、輪より短く書き終わる・16 分音符は整数の標本', (k) => {
    const sc = SCORES[k];
    expect(sc.n).toBe(MUSIC_LENGTHS[k]);
    expect(Number.isInteger(sixteenthOf(MUSIC_THEMES[k].bpm))).toBe(true);
    for (const x of sc.notes) {
      expect(x.start >= 0 && x.start < sc.n && Number.isInteger(x.start), `${k} ${x.inst} ${x.start}`).toBe(true);
      expect(x.len).toBeGreaterThan(0);
      expect(musicNoteSamples(x)).toBeLessThanOrEqual(sc.n);
      expect(Number.isFinite(x.pitch) && x.vel > 0 && x.vel <= 1.2).toBe(true);
    }
  });
  it.each([...MELODIC])('%s: 旋律の決まり（旋法・強拍の和音の音 ≥ 80%・音域・句の終わり）。8 音以上の旋律は順次 60〜85%・跳躍の戻り ≥ 90%・音域の幅 5 度以上', (k) => {
    const th = MUSIC_THEMES[k], m = th.melody!, c = melodyCheck(SCORES[k]), six = sixteenthOf(th.bpm), barN = th.beats * 4;
    expect(c.violations).toEqual([]);
    expect(c.strongChord).toBeGreaterThanOrEqual(0.8);
    expect(c.low).toBeGreaterThanOrEqual(m.low);
    expect(c.high).toBeLessThanOrEqual(m.high);
    for (const x of SCORES[k].melody) {
      const bar = Math.floor(x.start / six / barN);
      expect(barScale(th, chordPcs(th.chords[bar]!)), `${k} ${x.pitch}`).toContain(pcOf(x.pitch));
    }
    if (c.count >= MELODY_MIN_NOTES) {
      expect(c.stepShare).toBeGreaterThanOrEqual(0.6);
      expect(c.stepShare).toBeLessThanOrEqual(0.85);
      expect(c.recovered).toBeGreaterThanOrEqual(0.9);
      expect(c.high - c.low).toBeGreaterThanOrEqual(7);
    }
    m.cadences.forEach(([, kind], i) => { if (kind === 'half') expect([2, 7], `${k} half`).toContain((pcOf(c.cadences[i]!) - th.tonic + 12) % 12); });
  });
  it('句の終わりの音: A は 4 小節目 E（2 度）・8 小節目は A の和音の根音 A（主音 D は A の和音に無い）、B は 8 小節目 2 度か 5 度・16 小節目 B♭、C は 4 小節目 E（5 度）・8 小節目 A', () => {
    expect(melodyCheck(SCORES.title_a).cadences.map(pcOf)).toEqual([4, 9]);
    const b = melodyCheck(SCORES.title_b).cadences.map(pcOf);
    expect([0, 5]).toContain(b[1]);
    expect(b[3]).toBe(10);
    expect(melodyCheck(SCORES.title_c).cadences.map(pcOf)).toEqual([4, 9]);
  });
  it('5〜6 小節目は 1〜2 小節目の変形（A・C は同じリズムで違う音。B は 5・9・13 小節目にも）', () => {
    for (const k of ['title_a', 'title_c', 'title_b'] as const) {
      const th = MUSIC_THEMES[k], six = sixteenthOf(th.bpm), barN = th.beats * 4, ns = SCORES[k].melody;
      for (const [to, from] of th.melody!.motifs) {
        const span = th.melody!.span, sel = (b0: number): MusicNote[] => ns.filter((x) => Math.floor(x.start / six / barN) >= b0 - 1 && Math.floor(x.start / six / barN) < b0 - 1 + span);
        const a = sel(from), b = sel(to);
        expect(b.map((x) => x.start - (to - from) * barN * six), `${k} ${to}`).toEqual(a.map((x) => x.start));
        expect(b.map((x) => x.pitch), `${k} ${to}`).not.toEqual(a.map((x) => x.pitch));
      }
    }
  });
  it('決まり文句の見張りが効く（わざと破った旋律）: 主和音の分散 4 音・5–1–3–5 の始まり・同じ音 3 回と 4 度以上の跳躍・行ったり来たり・同じ 4 小節 3 回', () => {
    const c = SCORES.title_c; // A 和声的短音階（主和音 A C E）
    expect(melodyCheck(withPitches(c, [69, 72, 76, 81, 74, 72, 71, 69])).violations).toContain('arpeggio');
    expect(melodyCheck(withPitches(c, [64, 69, 72, 76, 74, 72, 71, 72])).violations.some((v) => v.startsWith('fanfare'))).toBe(true);
    expect(melodyCheck(withPitches(c, [72, 72, 72, 77, 76, 74, 72, 71])).violations.some((v) => v.startsWith('repeatLeap'))).toBe(true);
    expect(melodyCheck(withPitches(c, [72, 71, 72, 71, 72, 74, 76, 74])).violations).toContain('trill');
    const th: MusicTheme = MUSIC_THEMES.title_b, bar = 8 * sixteenthOf(th.bpm); // 2/4 の 16 小節に、4 小節ごとに同じ音の並び（4 回）
    const melody = Array.from({ length: 16 }, (_, b): MusicNote => ({ inst: 'brass', start: b * bar, len: Math.round(bar * 0.9), pitch: [70, 72, 74, 72][b % 4]!, vel: 1, decayS: 0, noise: 0 }));
    expect(melodyCheck({ theme: th, notes: melody, melody, n: MUSIC_LENGTHS.title_b }).violations).toContain('repeat4');
  });
  it('和音と音階: 和音の音名・D エオリアの A の和音は C の代わりに C#・E エオリアの B7 は D の代わりに D#・A 和声的短音階はそのまま', () => {
    expect(chordPcs('Bb')).toEqual([10, 2, 5]);
    expect(chordPcs('E7')).toEqual([4, 8, 11, 2]);
    expect(chordPcs('Gm')).toEqual([7, 10, 2]);
    expect(() => chordPcs('Hm')).toThrow();
    expect(barScale(MUSIC_THEMES.title_a, chordPcs('A')).sort((a, b) => a - b)).toEqual([1, 2, 4, 5, 7, 9, 10]);
    expect(barScale(MUSIC_THEMES.mission_l0, chordPcs('B7')).sort((a, b) => a - b)).toEqual([0, 3, 4, 6, 7, 9, 11]);
    expect(barScale(MUSIC_THEMES.title_c, chordPcs('E7')).sort((a, b) => a - b)).toEqual([0, 2, 4, 5, 8, 9, 11]);
  });
  it('旋律の音の並びは source に無い（sfx-music の source に MIDI らしい数 40〜96 だけの 4 つ以上の並び・音名の並びが無い）', () => {
    const files = ['src/config/sfx-music-config.ts', ...readdirSync('src/assets').filter((f) => f.startsWith('sfx-music-')).map((f) => `src/assets/${f}`)];
    for (const f of files) {
      const s = readFileSync(f, 'utf8').replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
      for (const m of s.matchAll(/\[([^[\]]*)\]/g)) {
        const nums = m[1]!.split(',').map((x) => x.trim()).filter((x) => x !== '');
        const midi = nums.length >= 4 && nums.every((x) => /^\d+$/.test(x) && Number(x) >= 40 && Number(x) <= 96);
        expect(midi, `${f}: [${m[1]}]`).toBe(false);
      }
      expect(s, f).not.toMatch(/['"](?:[A-G][#b]?\d[\s,]+){3,}[A-G][#b]?\d['"]/);
    }
  });
  it('任務の 3 層は同じ和音の進行と速さ（L2 は 2 小節）・L1・L2 は旋律なし', () => {
    const l0 = MUSIC_THEMES.mission_l0;
    expect(l0.chords).toEqual(['Em', 'C', 'D', 'Em', 'Em', 'C', 'Am', 'B7']);
    expect(MUSIC_THEMES.mission_l1.chords).toEqual(l0.chords);
    expect([MUSIC_THEMES.mission_l1.bpm, MUSIC_THEMES.mission_l2.bpm]).toEqual([l0.bpm, l0.bpm]);
    expect([SCORES.mission_l1.melody.length, SCORES.mission_l2.melody.length]).toEqual([0, 0]);
    expect(SCORES.mission_l0.melody.length).toBe(4); // 2 小節に 1 回の鈴
  });
});
