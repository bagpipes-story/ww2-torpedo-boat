// v0.7.2 S0（アートと音③：BGM と命中スローの音。spec-v0720 §3.1・§3.2・§8.1）: 作曲器（assets/sfx-music-compose）を固定する。
// - 同じ種は同じ音符・D（前）と任務の家族の種は「決まりを全部通る最初の種」（IP1 の鎖のまま＝scripts/sfx-music.ts の SEED_CHAIN_FROM。IP2 の D の種は tests/sfx-music-score が
//   区間の中で点が一番高いことを確かめる）。v0.7.2 S4: D（前）はゲームから消した。計画の無いタイトルの道の試験は tests/sfx-music-kit の写し PREV_THEME で続ける。
// - 旋律の決まり: 旋法の中・強拍の和音の音 ≥ 80%・順次 60〜85%（跳躍がある）・跳躍の戻り ≥ 90%・音域・句の終わり（half は 2 度か 5 度・end は主音／和音に無ければ根音）・
//   5〜6 小節目は 1〜2 小節目の変形（同じリズム・違う音）。決まり文句（§3.1）の見張りが効く（わざと破った旋律で確かめる）。
// - 旋律の音の並びは source に無い（MIDI らしい数の 4 つ以上の並び・音名の並びを置かない＝和音の進行とリズムの型だけ）。
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MUSIC_KEYS, MUSIC_LENGTHS, type MusicKey } from '../src/config/sfx-music-config';
import { MELODY_MIN_NOTES, barScale, chordAt, chordBass, chordPcs, chordSymAt, composeMusic, melodyCheck, pcOf, sixteenthOf, type MusicScore, type MusicTheme } from '../src/assets/sfx-music-compose';
import { musicNoteSamples, type MusicNote } from '../src/assets/sfx-music-synth';
import { MUSIC_SEEDS, MUSIC_THEMES, musicRng } from '../src/assets/sfx-music-themes';
import { SeededRng } from '../src/core/rng';
import { PREV_CHAIN_FROM, PREV_SEED, PREV_THEME, prevScore } from './sfx-music-kit';

const SCORES = Object.fromEntries(MUSIC_KEYS.map((k) => [k, composeMusic(MUSIC_THEMES[k], musicRng(k))])) as Record<MusicKey, MusicScore>;
/** v0.7.2 S4: 消した D（前）の写し（tests/sfx-music-kit）の楽譜 */
const PREV = prevScore();
/** 旋律のある曲（名前・表・楽譜。D（前）は写し） */
const MELODIC: readonly (readonly [string, MusicTheme, MusicScore])[] = [
  ['title_d', MUSIC_THEMES.title_d, SCORES.title_d], ['D（前）', PREV_THEME, PREV], ['mission_l0', MUSIC_THEMES.mission_l0, SCORES.mission_l0],
];
/** IP1 の鎖の始まり（scripts/sfx-music.ts の SEED_CHAIN_FROM と同じ。消した A 7603・E 7627 の次） */
const CHAIN_FROM: Readonly<Partial<Record<MusicKey, number>>> = { mission_l0: 7628, mission_l1: 7629, mission_l2: 7630 };
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
  it('D（前）と任務の家族の種は IP1 の鎖のまま「決まりを全部通る最初の種」（IP2 で A・E・S4 で D（前）を消しても種と標本は動かさない）・どの曲も決まりを通る', () => {
    for (const [k, from] of Object.entries(CHAIN_FROM) as [MusicKey, number][]) {
      for (let s = from; s < MUSIC_SEEDS[k]; s++) expect(melodyCheck(composeMusic(MUSIC_THEMES[k], new SeededRng(s))).violations.length, `${k} ${s}`).toBeGreaterThan(0);
      expect(MUSIC_SEEDS[k], k).toBeGreaterThanOrEqual(from);
    }
    for (let s = PREV_CHAIN_FROM; s < PREV_SEED; s++) expect(melodyCheck(composeMusic(PREV_THEME, new SeededRng(s))).violations.length, `D（前） ${s}`).toBeGreaterThan(0);
    for (const k of MUSIC_KEYS) expect(melodyCheck(SCORES[k]).violations, k).toEqual([]);
    expect(melodyCheck(PREV).violations).toEqual([]);
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
  it.each([...MELODIC])('%s: 旋律の決まり（旋法・強拍の和音の音 ≥ 80%・音域・句の終わり）。8 音以上の旋律は順次 60〜85%・跳躍の戻り ≥ 90%・音域の幅 5 度以上', (k, th, sc) => {
    const m = th.melody!, c = melodyCheck(sc), six = sixteenthOf(th.bpm);
    expect(c.violations).toEqual([]);
    expect(c.strongChord).toBeGreaterThanOrEqual(0.8);
    expect(c.low).toBeGreaterThanOrEqual(m.low);
    expect(c.high).toBeLessThanOrEqual(m.high);
    for (const x of sc.melody) expect(barScale(th, chordAt(th, x.start / six)), `${k} ${x.pitch}`).toContain(pcOf(x.pitch)); // IP2: 半小節の和音も（音の位置の和音）
    if (c.count >= MELODY_MIN_NOTES) {
      expect(c.stepShare).toBeGreaterThanOrEqual(0.6);
      expect(c.stepShare).toBeLessThanOrEqual(0.85);
      expect(c.recovered).toBeGreaterThanOrEqual(0.9);
      expect(c.high - c.low).toBeGreaterThanOrEqual(7);
    }
    m.cadences.forEach(([, kind], i) => { if (kind === 'half') expect([2, 7], `${k} half`).toContain((pcOf(c.cadences[i]!) - th.tonic + 12) % 12); });
  });
  it('句の終わりの音: D（前）は 4・12 小節目 E・8・16 小節目 A（IP1 のまま）。IP2 の D は 4・12 小節目が 5 度か 2 度（半終止）・8 小節目が主音か 3 度（閉じる）・16 小節目が主音', () => {
    expect(melodyCheck(PREV).cadences.map(pcOf)).toEqual([4, 9, 4, 9]);
    const d = melodyCheck(SCORES.title_d).cadences.map(pcOf);
    expect([4, 9]).toContain(d[0]);
    expect([2, 5]).toContain(d[1]);
    expect([4, 9]).toContain(d[2]);
    expect(d[3]).toBe(2);
  });
  it('5〜6 小節目は 1〜2 小節目の変形（D（前）は 1 小節ずつ 5・9・13 小節目に同じリズムで違う音。IP2 の D の写しは tests/sfx-music-plan）', () => {
    {
      const k = 'D（前）', th = PREV_THEME, six = sixteenthOf(th.bpm), barN = th.beats * 4, ns = PREV.melody;
      for (const [to, from] of th.melody!.motifs) {
        const span = th.melody!.span, sel = (b0: number): MusicNote[] => ns.filter((x) => Math.floor(x.start / six / barN) >= b0 - 1 && Math.floor(x.start / six / barN) < b0 - 1 + span);
        const a = sel(from), b = sel(to);
        expect(b.map((x) => x.start - (to - from) * barN * six), `${k} ${to}`).toEqual(a.map((x) => x.start));
        expect(b.map((x) => x.pitch), `${k} ${to}`).not.toEqual(a.map((x) => x.pitch));
      }
    }
  });
  it('決まり文句の見張りが効く（わざと破った旋律）: 主和音の分散 4 音・5–1–3–5 の始まり・同じ音 3 回と 4 度以上の跳躍・行ったり来たり・同じ 4 小節 3 回', () => {
    for (const [k, e] of [['title_d', SCORES.title_d], ['D（前）', PREV]] as const) { // D エオリア（主和音 D F A）。IP2 で E（G 和声的短音階）を消したので D で
      expect(melodyCheck(withPitches(e, [62, 65, 69, 74, 72, 70, 69, 67])).violations, k).toContain('arpeggio');
      expect(melodyCheck(withPitches(e, [69, 74, 77, 81, 79, 77, 76, 74])).violations.some((v) => v.startsWith('fanfare')), k).toBe(true);
      expect(melodyCheck(withPitches(e, [74, 74, 74, 79, 77, 76, 74, 72])).violations.some((v) => v.startsWith('repeatLeap')), k).toBe(true);
      expect(melodyCheck(withPitches(e, [74, 72, 74, 72, 74, 76, 77, 76])).violations, k).toContain('trill');
    }
    const th: MusicTheme = PREV_THEME, bar = 16 * sixteenthOf(th.bpm); // 4/4 の 16 小節に、4 小節ごとに同じ音の並び（4 回）
    const melody = Array.from({ length: 16 }, (_, b): MusicNote => ({ inst: 'horn', start: b * bar, len: Math.round(bar * 0.9), pitch: [74, 76, 77, 76][b % 4]!, vel: 1, decayS: 0, noise: 0 }));
    expect(melodyCheck({ theme: th, notes: melody, melody, n: MUSIC_LENGTHS.title_d }).violations).toContain('repeat4');
  });
  it('和音と音階: 和音の音名・D エオリアの A の和音は C の代わりに C#・E7 は G の代わりに G#・B♭ の代わりに B・E エオリアの B7 は D の代わりに D#', () => {
    expect(chordPcs('Bb')).toEqual([10, 2, 5]);
    expect(chordPcs('E7')).toEqual([4, 8, 11, 2]);
    expect(chordPcs('Gm')).toEqual([7, 10, 2]);
    expect(() => chordPcs('Hm')).toThrow();
    expect(barScale(MUSIC_THEMES.title_d, chordPcs('A')).sort((a, b) => a - b)).toEqual([1, 2, 4, 5, 7, 9, 10]);
    expect(barScale(MUSIC_THEMES.title_d, chordPcs('E7')).sort((a, b) => a - b)).toEqual([0, 2, 4, 5, 8, 9, 11]); // B♭ → B・G → G#
    expect(barScale(MUSIC_THEMES.mission_l0, chordPcs('B7')).sort((a, b) => a - b)).toEqual([0, 3, 4, 6, 7, 9, 11]);
  });
  it('IP2: 和音の記号の書き方（1 小節を空白で等分＝半小節・1 拍ずつ・分数の和音の低音・sus4）。1 小節 1 和音の曲は前と同じ答え', () => {
    expect(chordPcs('Asus4')).toEqual([9, 2, 4]);
    expect(chordPcs('E7/G#')).toEqual([4, 8, 11, 2]);
    expect([chordBass('E7/G#'), chordBass('C/E'), chordBass('Dm'), chordBass('Bb')]).toEqual([8, 4, 2, 10]);
    const d = MUSIC_THEMES.title_d; // 7 小節目 'Gm A7'・16 小節目 'Dm Dm Asus4 A'
    expect([0, 7, 8, 15].map((x) => chordSymAt(d, 6 * 16 + x))).toEqual(['Gm', 'Gm', 'A7', 'A7']);
    expect([0, 4, 8, 12].map((x) => chordSymAt(d, 15 * 16 + x))).toEqual(['Dm', 'Dm', 'Asus4', 'A']);
    const p = PREV_THEME;
    for (let b = 0; b < p.bars; b++) for (let x = 0; x < 16; x++) expect(chordSymAt(p, b * 16 + x)).toBe(p.chords[b]);
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
  it('IP1: タイトルの曲の旋律は合奏（2 声 ±3 cent）＝楽譜の旋律の音は確かめ用の中央の 1 声・音符は声ごとに同じ始めと長さ・任務の鈴は 1 声のまま', () => {
    for (const [k, sc] of [['title_d', SCORES.title_d], ['D（前）', PREV]] as const) {
      const m = sc.theme.melody!, v = m.voices ?? 1, horn = sc.notes.filter((x) => x.inst === m.inst && x.start < sc.n);
      expect(v).toBe(2);
      expect(horn.slice(0, sc.melody.length * v).map((x) => x.start)).toEqual(sc.melody.flatMap((x) => Array<number>(v).fill(x.start)));
      expect(horn.slice(0, 2).map((x) => Math.round((x.pitch - sc.melody[0]!.pitch) * 100))).toEqual([-(m.cents ?? 0) / 2, (m.cents ?? 0) / 2]);
    }
    expect(SCORES.mission_l0.notes.slice(0, SCORES.mission_l0.melody.length)).toEqual(SCORES.mission_l0.melody);
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
