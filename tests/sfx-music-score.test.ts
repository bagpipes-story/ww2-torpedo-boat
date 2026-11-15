// v0.7.2 IP2（実機 2 回目）: 旋律の点（assets/sfx-music-score の musicality）を固定する。決まりごとに、わざと破った旋律で点が効くこと・選んだ種が区間の中で点が一番高いこと
// （scripts/sfx-music.ts の SEARCH=1 と同じ並べ方＝点の高い順・同じ点なら小さい種）・IP1 の D（前）より新しい D の方が点が高いことを確かめる。
// v0.7.2 S4: D（前）はゲームから消した（比べは tests/sfx-music-kit の写し PREV_THEME で続ける）。
// 決まり: 動機の戻り 3 回以上・山（一番高い音）は 1 回で輪の 75〜90%・音域 9 度〜13 度（13〜21 半音）・跳躍はオクターブまで・同じ音は 2 回まで・melodyCheck の決まり（跳躍の戻りなど）。
import { describe, expect, it } from 'vitest';
import { MUSIC_SEED_SEARCH_D, SFX_SEED_MUSIC_D } from '../src/config/sfx-music-config';
import { composeMusic, type MusicScore } from '../src/assets/sfx-music-compose';
import { MUSICALITY_RULES, MUSICALITY_WEIGHTS, musicality, type MusicalityPart } from '../src/assets/sfx-music-score';
import { MUSIC_THEMES, musicRng } from '../src/assets/sfx-music-themes';
import { SeededRng } from '../src/core/rng';
import { prevScore } from './sfx-music-kit';

const D = composeMusic(MUSIC_THEMES.title_d, musicRng('title_d')), PREV = prevScore();
const R = musicality(D);
/** 旋律の音を f で直した楽譜（点は旋律だけを読む） */
function edit(sc: MusicScore, f: (p: number[]) => void): MusicScore {
  const p = sc.melody.map((x) => Math.round(x.pitch));
  f(p);
  return { ...sc, melody: sc.melody.map((x, i) => ({ ...x, pitch: p[i]! })) };
}
const top = Math.max(...D.melody.map((x) => Math.round(x.pitch))), topI = D.melody.findIndex((x) => Math.round(x.pitch) === top);

describe('旋律の点（v0.7.2 IP2）', () => {
  it('重みの合計は 1・決まりの数（動機の戻り 3・山 75〜90%・音域 13〜21 半音・跳躍 12 半音まで・同じ音 2 回まで）', () => {
    expect(Object.values(MUSICALITY_WEIGHTS).reduce((a, x) => a + x, 0)).toBeCloseTo(1, 9);
    expect(MUSICALITY_RULES).toMatchObject({ minReturns: 3, climaxFrom: 0.75, climaxTo: 0.9, minSpan: 13, maxSpan: 21, maxLeap: 12, maxRun: 2 });
  });
  it('選んだ D: 決まりを全部通り（破れ 0）、点の内訳はどれも 0〜1・動機は 3 回以上戻る・山は 1 回で 75〜90%・音域 9〜13 度・順次 60〜85%', () => {
    expect(R.violations).toEqual([]);
    expect(R.total).toBeGreaterThan(0.85);
    for (const k of Object.keys(MUSICALITY_WEIGHTS) as MusicalityPart[]) expect(R.parts[k] >= 0 && R.parts[k] <= 1, k).toBe(true);
    expect(R.returns).toBeGreaterThanOrEqual(3);
    expect(R.climaxCount).toBe(1);
    expect(R.climaxAt >= 0.75 && R.climaxAt <= 0.9).toBe(true);
    expect(R.span >= 13 && R.span <= 21).toBe(true);
    expect(R.stepShare >= 0.6 && R.stepShare <= 0.85).toBe(true);
    expect(R.maxRun).toBeLessThanOrEqual(2);
  });
  it('選んだ種は区間（MUSIC_SEED_SEARCH_D の 400 個）の中で点が一番高い（同じ点なら小さい種）＝scripts/sfx-music.ts の SEARCH=1 と同じ答え', () => {
    const box = MUSIC_SEED_SEARCH_D;
    expect(box.count).toBeGreaterThanOrEqual(200);
    expect(SFX_SEED_MUSIC_D >= box.from && SFX_SEED_MUSIC_D < box.from + box.count).toBe(true);
    let passing = 0;
    for (let s: number = box.from; s < box.from + box.count; s++) {
      const t = musicality(composeMusic(MUSIC_THEMES.title_d, new SeededRng(s))).total;
      if (t > 0) passing++;
      if (s !== SFX_SEED_MUSIC_D) expect(t < R.total || (t === R.total && s > SFX_SEED_MUSIC_D), `種 ${s} ${t}`).toBe(true);
    }
    expect(passing).toBeGreaterThanOrEqual(10); // 点で選べる数がある（空の探しにしない）
  });
  it('決まりの見張りが効く（わざと破った旋律）: 動機が戻らない・山が 2 回・山が前すぎる・オクターブより大きい跳躍・同じ音 3 回・音域が狭い／広い。どれも点は 0', () => {
    const cases: [string, MusicScore][] = [
      ['returns', edit(D, (p) => { for (let i = 0; i < p.length; i++) if (D.melody[i]!.start >= 2 * 16 * 2625) p[i] = 70 + ((i * 5) % 9); })],
      ['climaxOnce', edit(D, (p) => { p[topI + (topI > 2 ? -2 : 2)] = top; })],
      ['climaxAt', edit(D, (p) => { p[3] = top + 1; })],
      ['bigLeap', edit(D, (p) => { p[10] = p[9]! + 13; })],
      ['repeatRun', edit(D, (p) => { p[21] = p[20]!; p[22] = p[20]!; })],
      ['span13', edit(D, (p) => { for (let i = 0; i < p.length; i++) p[i] = 72 + (p[i]! % 5); })],
      ['span13', edit(D, (p) => { p[30] = top - 23; })],
    ];
    for (const [rule, sc] of cases) {
      const r = musicality(sc);
      expect(r.violations, rule).toContain(rule);
      expect(r.total, rule).toBe(0);
    }
  });
  it('点の内訳が効く: 句の終わりを主音から外す・避ける音を長く・輪の最後を頭から遠く・順次だけ（表情の跳躍なし）は、その内訳が下がる', () => {
    const fin = D.melody.reduce((b, x, i) => (Math.floor(x.start / (16 * 2625)) === 15 && x.len > D.melody[b]!.len ? i : b), D.melody.length - 2);
    expect(musicality(edit(D, (p) => { p[fin] = p[fin]! + 2; })).parts.cadence).toBeLessThan(R.parts.cadence);
    const last = D.melody.length - 1;
    expect(musicality(edit(D, (p) => { p[last] = p[0]! - 7; })).parts.seam).toBeLessThan(R.parts.seam);
    const run = edit(D, (p) => { for (let i = 1; i < p.length; i++) p[i] = 64 + (i % 16); });
    expect(musicality(run).parts.steps).toBeLessThan(R.parts.steps);
    // 12 小節目（A の和音）の一番長い音を B♭（A の半音上＝避ける音）に
    const hc = D.melody.reduce((b, x, i) => (Math.floor(x.start / (16 * 2625)) === 11 && (b < 0 || x.len > D.melody[b]!.len) ? i : b), -1);
    expect(musicality(edit(D, (p) => { p[hc] = 70; })).parts.harmony).toBeLessThan(R.parts.harmony);
  });
  it('IP1 の D（前）より新しい D の方が良い: D（前）は動機が 3 回戻らず山も 75〜90% に無い（計画が無い＝決まりを破る）。動機・リズム・句の終わり・同じ音・継ぎ目の内訳も新しい D が上', () => {
    const p = musicality(PREV);
    expect(p.violations).toEqual(expect.arrayContaining(['returns']));
    expect(p.total).toBe(0);
    for (const k of ['motif', 'rhythm', 'cadence', 'repeat', 'seam'] as const) expect(R.parts[k], k).toBeGreaterThan(p.parts[k]);
  });
});
