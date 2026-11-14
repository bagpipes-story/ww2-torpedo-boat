// v0.7.2 S1（アートと音③：BGM と命中スローの音。spec-v0720 §7・brief L14）: 曲の試聴の場（?sfxlab。scenes/music-lab-scene）の置き方と語・道を固定する（ui/music-lab-layout は Phaser なし）。
// - 論理幅 1280〜1584 の全部で: 行 0 の 4 つ（候補 A・D・E＝v0.7.2 IP1 で B・C から替えた と「止める」）・「戻る」・「効果音の試聴へ」が画面の内・重ならない・高さ 84 px 以上・幅 160 px 以上、行の名前はボタンの左、
//   説明（2 行まで）より下、右下の状態の一文（一番長い文）とボタンが重ならない。
// - 語: 説明に「知っている曲に似ていたら一言」。ゲームの曲（既定 MUSIC_TITLE_DEFAULT_ID）は「記号（今）」だけの題（v0.7.1 IP4 と同じ）と名前の 2 行目。題と 2 行目は 1280 のボタンに収まる。
// - シーン: 候補と「止める」はボタンの音を鳴らさない（silent）・create で場面 LAB と「音」「曲」を鳴らす側へ・SHUTDOWN で NONE（候補の標本を捨てる）と保存の値へ・update は確保しない。
// - 道: 試聴の口（sfxMusicAudition・sfxMusicLab*）を呼ぶのは曲の試聴の場だけ。効果音の試聴の場は曲を止め、「曲の試聴へ」で戻る。
// - v0.7.2 S2（brief L25）: 行 1「任務の曲」（静か・緊張・戦闘・自動・止める＝5 列）と行 2「効果音と一緒に」（台本 3 つ・止める＝4 列。S3 で「命中＋スロー」）も同じ論理幅の全部で置き方と語を見る。
//   自動は静か → 緊張 → 戦闘 → 緊張（ゲームで起きる移りだけ）を 8 秒ずつ。台本の表は段・速力帯・出来事の種類が範囲の内（tests/sfx-lab-demo が鳴らし方を見る）。
// - v0.7.2 S3（brief L31）: 行 2 の 4 つ目「命中＋スロー」（5 列）と行 3「命中スロー」（案 A・B・C の 3 列・「止める」なし・記号は SFX_SLOW_IDS・ゲームの案 SFX_SLOW_DEFAULT_ID が「記号（今）」）。
//   押すたびに案を替えて命中とスロー（台本でない時は「静か＋海」から）・出る時にゲームの案へ戻す。
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MUSIC_LAB_AUTO_JA, MUSIC_LAB_AUTO_MOODS, MUSIC_LAB_AUTO_STEP_S, MUSIC_LAB_AUTO_SUB_JA, MUSIC_LAB_BUILDING_SUB_JA, MUSIC_LAB_DEFAULT_MARK_JA, MUSIC_LAB_DEMO_SUBS_JA, MUSIC_LAB_DEMO_TITLES_JA, MUSIC_LAB_DEMOS,
  MUSIC_LAB_FAMILY_JA, MUSIC_LAB_FROM_SFX_JA, MUSIC_LAB_HEAD_JA, MUSIC_LAB_LETTERS, MUSIC_LAB_MOOD_SUBS_JA, MUSIC_LAB_MOOD_TITLES_JA, MUSIC_LAB_NAMES_JA, MUSIC_LAB_NOTES_JA, MUSIC_LAB_ROW_LABELS_JA,
  MUSIC_LAB_ROW_SUBS_JA, MUSIC_LAB_SLOW_HIT_XY, MUSIC_LAB_SLOW_LETTERS, MUSIC_LAB_SLOW_NAMES_JA, MUSIC_LAB_SLOW_NOTES_JA, MUSIC_LAB_STATUS_BUILDING_JA, MUSIC_LAB_STATUS_IDLE_JA, MUSIC_LAB_STATUS_NONE_JA,
  MUSIC_LAB_STATUS_PLAYING_JA, MUSIC_LAB_STATUS_STOPPED_JA, MUSIC_LAB_STATUS_WAIT_JA, MUSIC_LAB_STOP_JA, MUSIC_LAB_STOP_SUB_JA, MUSIC_LAB_TO_SFX_JA,
} from '../src/config/music-lab-config';
import { MUSIC_LAYER_KEYS, MUSIC_MOOD_BATTLE, MUSIC_MOOD_QUIET, MUSIC_MOOD_TENSE, MUSIC_TITLE_KEYS, SFX_SLOW_DEFAULT_ID, SFX_SLOW_IDS } from '../src/config/sfx-music-config';
import { SOUND_LAB_BACK_PX, SOUND_LAB_BUTTON_PX, SOUND_LAB_HEAD_PX, SOUND_LAB_HEAD_Y, SOUND_LAB_NOTE_PX, SOUND_LAB_ROW_TOP, SOUND_LAB_STATUS_PX } from '../src/config/sound-lab-config';
import { MUSIC_TITLE_DEFAULT_ID } from '../src/assets/sfx-music-themes';
import {
  MUSIC_LAB_ROW0_COLS, MUSIC_LAB_ROW1_COLS, MUSIC_LAB_ROW2_COLS, MUSIC_LAB_ROW3_COLS, MUSIC_LAB_ROW_COLS, MUSIC_LAB_ROW_SLOW, musicLabButtonSub, musicLabButtonTitle, musicLabHasStop, musicLabLabel, musicLabSideRect,
} from '../src/ui/music-lab-layout';
import { soundLabBackRect, soundLabButtonRect, soundLabLabelRect, type SoundLabRect } from '../src/ui/sound-lab-layout';
import { textWidthPx } from './pt-ui-kit';

const H = 720;
const MARGIN = 24;
const LINE_H = 1.25;
const overlap = (a: SoundLabRect, b: SoundLabRect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const isDefault = (i: number): boolean => MUSIC_TITLE_KEYS[i] === MUSIC_TITLE_DEFAULT_ID;
const titleOf = (i: number): string => musicLabButtonTitle(MUSIC_LAB_LETTERS[i]!, MUSIC_LAB_NAMES_JA[i]!, isDefault(i));
const subOf = (i: number): string => musicLabButtonSub(MUSIC_LAB_NAMES_JA[i]!, MUSIC_LAB_NOTES_JA[i]!, isDefault(i));
/** 右下の状態の一文の候補（一番長い物で重なりを見る） */
const STATUSES = [
  MUSIC_LAB_STATUS_IDLE_JA, MUSIC_LAB_STATUS_NONE_JA, MUSIC_LAB_STATUS_WAIT_JA, MUSIC_LAB_STATUS_STOPPED_JA,
  ...MUSIC_LAB_LETTERS.map((l) => `${MUSIC_LAB_STATUS_BUILDING_JA}${l} 100%`), ...MUSIC_LAB_LETTERS.map((l) => `${MUSIC_LAB_STATUS_PLAYING_JA}${l}`),
  // S2: 任務の曲（作っている層・段・自動・台本）
  `${MUSIC_LAB_STATUS_BUILDING_JA}${MUSIC_LAB_FAMILY_JA} 3/3 100%`, ...MUSIC_LAB_MOOD_TITLES_JA.map((m) => `${MUSIC_LAB_STATUS_PLAYING_JA}${MUSIC_LAB_FAMILY_JA} ${MUSIC_LAB_AUTO_JA}・${m}`),
  ...MUSIC_LAB_DEMO_TITLES_JA.map((d) => `${MUSIC_LAB_STATUS_PLAYING_JA}${d}`),
];
/** 行ごとの列の数（行 0 タイトルの曲・行 1 任務の曲・行 2 効果音と一緒に・行 3 命中スロー） */
const COLS = [MUSIC_LAB_ROW0_COLS, MUSIC_LAB_ROW1_COLS, MUSIC_LAB_ROW2_COLS, MUSIC_LAB_ROW3_COLS];
const SLOW_DEFAULT = SFX_SLOW_IDS.indexOf(SFX_SLOW_DEFAULT_ID);
const scene = (): string => readFileSync('src/scenes/music-lab-scene.ts', 'utf8');

describe('曲の試聴の場の置き方と語（v0.7.2 S1）', () => {
  it('行 0: 候補 A・D・E（MUSIC_TITLE_KEYS の順。v0.7.2 IP1 で B・C を消して D・E）と「止める」の 4 つ。記号・名前・一言は候補の数だけ。行の名前は「タイトルの曲」', () => {
    expect(MUSIC_TITLE_KEYS).toEqual(['title_a', 'title_d', 'title_e']);
    expect([...MUSIC_LAB_LETTERS]).toEqual(['A', 'D', 'E']);
    expect([...MUSIC_LAB_NAMES_JA]).toEqual(['静かな夜の海', 'A を行進で', '勇ましい行進']);
    expect(MUSIC_LAB_NOTES_JA.length).toBe(3);
    expect(MUSIC_LAB_ROW0_COLS).toBe(MUSIC_TITLE_KEYS.length + 1);
    expect([MUSIC_LAB_ROW_LABELS_JA, MUSIC_LAB_ROW_SUBS_JA].map((a) => a.length)).toEqual([4, 4]);
    expect([...MUSIC_LAB_ROW_LABELS_JA]).toEqual(['タイトルの曲', '任務の曲', '効果音と一緒に', '命中スロー']);
    expect(MUSIC_LAB_ROW_COLS).toEqual(COLS);
  });
  it('S2: 行 1 は段 3 つ（静か・緊張・戦闘＝MUSIC_MOOD_* の順）・「自動」・「止める」、行 2 は台本 3 つ・「止める」。自動は静か → 緊張 → 戦闘 → 緊張を 8 秒ずつ。台本の表は範囲の内', () => {
    expect([MUSIC_MOOD_QUIET, MUSIC_MOOD_TENSE, MUSIC_MOOD_BATTLE]).toEqual([0, 1, 2]);
    expect([...MUSIC_LAB_MOOD_TITLES_JA]).toEqual(['静か', '緊張', '戦闘']);
    expect([MUSIC_LAB_MOOD_SUBS_JA.length, MUSIC_LAB_ROW1_COLS]).toEqual([3, 5]);
    expect([MUSIC_LAB_AUTO_JA, MUSIC_LAB_AUTO_SUB_JA]).toEqual(['自動', '8 秒ずつ回す']);
    expect([[...MUSIC_LAB_AUTO_MOODS], MUSIC_LAB_AUTO_STEP_S]).toEqual([[0, 1, 2, 1], 8]);
    for (let i = 0; i < MUSIC_LAB_AUTO_MOODS.length; i++) expect(Math.abs(MUSIC_LAB_AUTO_MOODS[i]! - MUSIC_LAB_AUTO_MOODS[(i + 1) % MUSIC_LAB_AUTO_MOODS.length]!)).toBe(1); // 1 段ずつ（ゲームで起きる移り）
    expect([MUSIC_LAB_DEMO_TITLES_JA.length, MUSIC_LAB_DEMO_SUBS_JA.length, MUSIC_LAB_DEMOS.length, MUSIC_LAB_ROW2_COLS]).toEqual([4, 4, 4, 5]);
    expect(MUSIC_LAB_DEMOS.map((d) => d.mood)).toEqual([MUSIC_MOOD_QUIET, MUSIC_MOOD_TENSE, MUSIC_MOOD_BATTLE, MUSIC_MOOD_BATTLE]);
    for (const d of MUSIC_LAB_DEMOS) {
      expect(['silent', 'cruise', 'full']).toContain(d.step);
      expect(d.speed > 0 && d.speed <= 1 && d.periodS > 0).toBe(true);
      let last = -1;
      for (const e of d.events) {
        expect(e.length).toBe(4);
        expect(e[0]! >= last && e[0]! < d.periodS).toBe(true); // 時刻の順・くり返しの秒の内
        expect(Number.isInteger(e[1]) && e[1]! >= 0 && e[1]! <= 8).toBe(true); // S3: 8＝魚雷の命中＋命中スロー
        last = e[0]!;
      }
    }
    expect(MUSIC_LAYER_KEYS[0]).toBe('mission_l0');
    // S3: 「命中＋スロー」は魚雷の命中とスローだけ（行 3 の命中と同じ位置）
    expect(MUSIC_LAB_DEMO_TITLES_JA[3]).toBe('命中＋スロー');
    expect(MUSIC_LAB_DEMOS[3]!.events).toEqual([[1.0, 8, ...MUSIC_LAB_SLOW_HIT_XY]]);
  });
  it('S3: 行 3 は案 A・B・C（記号は SFX_SLOW_IDS の順）の 3 つで「止める」なし。ゲームの案（SFX_SLOW_DEFAULT_ID）だけ「記号（今）」の題と名前の 2 行目。ほかの行の最後は「止める」', () => {
    expect([...MUSIC_LAB_SLOW_LETTERS]).toEqual([...SFX_SLOW_IDS]);
    expect([MUSIC_LAB_SLOW_NAMES_JA.length, MUSIC_LAB_SLOW_NOTES_JA.length, MUSIC_LAB_ROW3_COLS]).toEqual([SFX_SLOW_IDS.length, SFX_SLOW_IDS.length, SFX_SLOW_IDS.length]);
    expect([...MUSIC_LAB_SLOW_NAMES_JA]).toEqual(['低く遅く', '低くだけ', 'なし']);
    expect(COLS.map((_, r) => musicLabHasStop(r))).toEqual([true, true, true, false]);
    expect(MUSIC_LAB_ROW_SLOW).toBe(3);
    for (let col = 0; col < MUSIC_LAB_ROW3_COLS; col++) {
      const d = col === SLOW_DEFAULT;
      expect(musicLabLabel(3, col, 0, SLOW_DEFAULT)).toEqual([d ? `${SFX_SLOW_IDS[col]}${MUSIC_LAB_DEFAULT_MARK_JA}` : `${SFX_SLOW_IDS[col]} ${MUSIC_LAB_SLOW_NAMES_JA[col]}`, d ? MUSIC_LAB_SLOW_NAMES_JA[col] : MUSIC_LAB_SLOW_NOTES_JA[col]]);
    }
    expect(musicLabLabel(3, 0, 0, SLOW_DEFAULT)[0]).toBe('A（今）'); // 既定は A（§11 O2。ユーザーが選んだら SFX_SLOW_DEFAULT_ID を直す＝この行も）
    for (let r = 0; r < 3; r++) expect(musicLabLabel(r, COLS[r]! - 1, 0, SLOW_DEFAULT)).toEqual([MUSIC_LAB_STOP_JA, MUSIC_LAB_STOP_SUB_JA]);
    expect(musicLabLabel(2, 3, 0, SLOW_DEFAULT)).toEqual(['命中＋スロー', MUSIC_LAB_DEMO_SUBS_JA[3]]);
  });
  it.each([1280, 1360, 1440, 1520, 1584])('論理幅 %i: ボタン 19 個（4 行と下の段）が画面の内・重ならない・高さ 84 以上・幅 160 以上。行の名前は左・説明（2 行まで）より下。右下の状態の一文と重ならない', (w) => {
    const f = { gameWidth: w, gameHeight: H, margin: MARGIN };
    const rects: SoundLabRect[] = [];
    for (let row = 0; row < COLS.length; row++) for (let col = 0; col < COLS[row]!; col++) rects.push(soundLabButtonRect(row, col, COLS[row]!, f));
    const back = soundLabBackRect(f), side = musicLabSideRect(f);
    rects.push(back, side);
    const headBottom = SOUND_LAB_HEAD_Y + 2 * SOUND_LAB_HEAD_PX * LINE_H;
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(MARGIN);
      expect(r.x + r.w).toBeLessThanOrEqual(w - MARGIN + 1e-9);
      expect(r.y).toBeGreaterThan(headBottom);
      expect(r.y + r.h).toBeLessThanOrEqual(H - MARGIN);
      expect(r.h).toBeGreaterThanOrEqual(84);
      expect(r.w).toBeGreaterThanOrEqual(160);
    }
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlap(rects[i]!, rects[j]!), `${i}-${j}`).toBe(false);
    for (let row = 0; row < COLS.length; row++) {
      const l = soundLabLabelRect(row, f);
      const first = soundLabButtonRect(row, 0, COLS[row]!, f);
      expect(l.x + l.w).toBeLessThan(first.x);
      expect(l.y).toBe(first.y);
    }
    expect(SOUND_LAB_ROW_TOP).toBeGreaterThan(headBottom);
    // 説明は 2 行まで（v0.7.2 S3: 改行で 2 行に分け、どの行も折り返しの幅に収める＝下の 8 px 刻みの試験）
    expect(MUSIC_LAB_HEAD_JA.split('\n').every((l) => textWidthPx(l, SOUND_LAB_HEAD_PX) <= w - 2 * MARGIN)).toBe(true);
    // 右下の状態の一文（右寄せ・中心は「戻る」の中心の高さ）は「効果音の試聴へ」の右
    const longest = Math.max(...STATUSES.map((t) => textWidthPx(t, SOUND_LAB_STATUS_PX)));
    expect(w - MARGIN - longest - (side.x + side.w), `${w}`).toBeGreaterThanOrEqual(24);
    expect([side.y, side.h, side.w]).toEqual([back.y, back.h, back.w]);
  });
  it('説明（v0.7.2 S3 で S2 の直し）: 改行で 2 行・論理幅 1280〜1584 の 8 px 刻みのどれでもどの行も折り返しの幅（論理幅 − 2 × 余白）に収まり（折り返さない＝3 行にならない）、2 行の下は行 0 の上より上', () => {
    const lines = MUSIC_LAB_HEAD_JA.split('\n');
    expect(lines.length).toBe(2);
    expect(MUSIC_LAB_HEAD_JA).not.toContain('段ごとと効果音と一緒に'); // S2 のぎこちない言い回しは直した
    expect(lines[0]).toContain('タイトルの曲は A・D・E、命中スローは A・B・C'); // v0.7.2 IP1: 記号を候補ごとに
    for (let w = 1280; w <= 1584; w += 8) {
      for (const l of lines) expect(textWidthPx(l, SOUND_LAB_HEAD_PX), `${w}: ${l}`).toBeLessThanOrEqual(w - 2 * MARGIN);
      const bottom = SOUND_LAB_HEAD_Y + lines.length * SOUND_LAB_HEAD_PX * LINE_H;
      expect(bottom, `${w}`).toBeLessThan(soundLabButtonRect(0, 0, MUSIC_LAB_ROW0_COLS, { gameWidth: w, gameHeight: H, margin: MARGIN }).y);
      expect(bottom, `${w}`).toBeLessThan(soundLabLabelRect(0, { gameWidth: w, gameHeight: H, margin: MARGIN }).y);
    }
  });
  it('語: 説明に「知っている曲に似ていたら一言」・既定の曲だけ「記号（今）」の題で名前は 2 行目（ほかは「記号 名前」と一言）。論理幅 1280 のボタンに題・2 行目・「作成中…」が収まる', () => {
    expect(MUSIC_LAB_HEAD_JA).toContain('知っている曲に似ていたら一言ください');
    expect(MUSIC_LAB_DEFAULT_MARK_JA).toBe('（今）');
    expect(musicLabButtonTitle('A', '静かな夜の海', true)).toBe('A（今）');
    expect(musicLabButtonTitle('D', 'A を行進で', false)).toBe('D A を行進で');
    expect(musicLabButtonSub('静かな夜の海', 'パッドと鈴・63 BPM', true)).toBe('静かな夜の海');
    expect(musicLabButtonSub('A を行進で', '金管・小太鼓・126 BPM', false)).toBe('金管・小太鼓・126 BPM');
    expect(MUSIC_TITLE_KEYS.map((_, i) => titleOf(i))).toEqual(['A（今）', 'D A を行進で', 'E 勇ましい行進']); // 既定は A（§11 O1。ユーザーが選んだら直す）
    const f = { gameWidth: 1280, gameHeight: H, margin: MARGIN };
    const bw = soundLabButtonRect(0, 0, MUSIC_LAB_ROW0_COLS, f).w;
    for (let i = 0; i < MUSIC_TITLE_KEYS.length; i++) {
      // 既定でない時の題・既定の時の題のどちらも収まる（ユーザーが選び直しても溢れない）
      for (const d of [true, false]) {
        expect(textWidthPx(musicLabButtonTitle(MUSIC_LAB_LETTERS[i]!, MUSIC_LAB_NAMES_JA[i]!, d), SOUND_LAB_BUTTON_PX), `${i} ${d}`).toBeLessThanOrEqual(bw);
        expect(textWidthPx(musicLabButtonSub(MUSIC_LAB_NAMES_JA[i]!, MUSIC_LAB_NOTES_JA[i]!, d), SOUND_LAB_NOTE_PX), `${i} ${d}`).toBeLessThanOrEqual(bw);
      }
      expect(subOf(i).length).toBeGreaterThan(0);
    }
    for (const t of [MUSIC_LAB_STOP_JA]) expect(textWidthPx(t, SOUND_LAB_BUTTON_PX)).toBeLessThanOrEqual(bw);
    for (const t of [MUSIC_LAB_STOP_SUB_JA, MUSIC_LAB_BUILDING_SUB_JA]) expect(textWidthPx(t, SOUND_LAB_NOTE_PX)).toBeLessThanOrEqual(bw);
    // S2: 行 1（5 列＝論理幅 1280 で 183 px）・行 2（4 列）の題と 2 行目（「作成中…」「止める」も）
    const b1 = soundLabButtonRect(1, 0, MUSIC_LAB_ROW1_COLS, f).w, b2 = soundLabButtonRect(2, 0, MUSIC_LAB_ROW2_COLS, f).w;
    expect(b1).toBeGreaterThan(183);
    for (const t of [...MUSIC_LAB_MOOD_TITLES_JA, MUSIC_LAB_AUTO_JA, MUSIC_LAB_STOP_JA]) expect(textWidthPx(t, SOUND_LAB_BUTTON_PX), t).toBeLessThanOrEqual(b1);
    for (const t of [...MUSIC_LAB_MOOD_SUBS_JA, MUSIC_LAB_AUTO_SUB_JA, MUSIC_LAB_STOP_SUB_JA, MUSIC_LAB_BUILDING_SUB_JA]) expect(textWidthPx(t, SOUND_LAB_NOTE_PX), t).toBeLessThanOrEqual(b1);
    for (const t of [...MUSIC_LAB_DEMO_TITLES_JA, MUSIC_LAB_STOP_JA]) expect(textWidthPx(t, SOUND_LAB_BUTTON_PX), t).toBeLessThanOrEqual(b2);
    for (const t of [...MUSIC_LAB_DEMO_SUBS_JA, MUSIC_LAB_STOP_SUB_JA, MUSIC_LAB_BUILDING_SUB_JA]) expect(textWidthPx(t, SOUND_LAB_NOTE_PX), t).toBeLessThanOrEqual(b2);
    const side = musicLabSideRect(f);
    for (const t of [MUSIC_LAB_TO_SFX_JA, MUSIC_LAB_FROM_SFX_JA]) expect(textWidthPx(t, SOUND_LAB_BACK_PX)).toBeLessThanOrEqual(side.w - 64);
    // S3: 行 3（3 列）の題と 2 行目（既定でもそうでなくても＝ユーザーが選び直しても溢れない）
    const b3 = soundLabButtonRect(3, 0, MUSIC_LAB_ROW3_COLS, f).w;
    for (let i = 0; i < SFX_SLOW_IDS.length; i++) {
      for (const d of [true, false]) {
        expect(textWidthPx(musicLabButtonTitle(MUSIC_LAB_SLOW_LETTERS[i]!, MUSIC_LAB_SLOW_NAMES_JA[i]!, d), SOUND_LAB_BUTTON_PX), `${i} ${d}`).toBeLessThanOrEqual(b3);
        expect(textWidthPx(musicLabButtonSub(MUSIC_LAB_SLOW_NAMES_JA[i]!, MUSIC_LAB_SLOW_NOTES_JA[i]!, d), SOUND_LAB_NOTE_PX), `${i} ${d}`).toBeLessThanOrEqual(b3);
      }
    }
  });
});

describe('曲の試聴の場のシーン（v0.7.2 S1）', () => {
  it('3 行のボタンは silent・「戻る」は Title へ・「効果音の試聴へ」は効果音の場へ。create で LAB と「音」「曲」を鳴らす側へ、SHUTDOWN で台本を止めて NONE と保存の値へ', () => {
    const s = scene();
    expect(s.match(/new MenuButton\(/g)!.length).toBe(3); // 3 行の輪の 1 つ・戻る・効果音の試聴へ
    expect(s.match(/align: 'center' as const, silent: true \};/g)!.length).toBe(1);
    expect(s).toContain('      this.demo.stop(); //');
    expect(s).toContain('() => this.leave(SCENE_KEYS.title)');
    expect(s).toContain('() => this.leave(SCENE_KEYS.soundLab)');
    expect(s).toContain('    sfxSetMuted(false);\n    sfxMusicEnabled(true);\n    sfxMusic(MUSIC_CTX_LAB);\n');
    expect(s).toContain('      sfxMusic(MUSIC_CTX_NONE); //');
    expect(s).toContain('      sfxSetMuted(!soundEnabled());\n      sfxMusicEnabled(musicEnabled());\n');
    expect(s).toContain('      sfxMusicAudition(null);\n');
    expect(s).toContain('      sfxMusicAudition(MUSIC_TITLE_KEYS[col]!);\n');
    expect(s).toContain('      sfxMusicAudition(FAMILY_KEY);\n');
    expect(s.split('\n').length).toBeLessThanOrEqual(251);
    // S3: 行 3 は案を替えて命中を待たせ（台本が鳴っていれば今）、出る時にゲームの案へ。命中スローの秒は data（世界と同じ）
    expect(s).toContain('      sfxSlowVariant(SFX_SLOW_IDS[col]!);\n      this.demo.queueHit(); //');
    expect(s).toContain('      this.demo.stop(); //');
    expect(s).toContain('      sfxSlowVariant(SFX_SLOW_DEFAULT_ID); //');
    expect(s).toContain('    this.demo.slowS = getGameData(this.registry, REGISTRY_KEY_DATA).hitRateModel.feel.hit_slowmo_seconds; //');
    expect(s).toContain('const SLOW_DEFAULT = SFX_SLOW_IDS.indexOf(SFX_SLOW_DEFAULT_ID);\n');
  });
  it('update は確保せず文を書かない（状態が変わった時だけ refresh が書く。refresh は前と同じ文なら setText しない・2 行目は create で作った物を引く）。台本は任務の曲が鳴ってから', () => {
    const s = scene();
    const upd = s.slice(s.indexOf('  override update(_time: number, deltaMs: number): void {'), s.indexOf('  /** ボタンを押した'));
    expect(upd.length).toBeGreaterThan(100);
    expect(upd).not.toMatch(/\bnew\s|\.(map|filter|slice)\(|=>|setText|`|=\s*\[|\(\s*\[/); // 配列のリテラルも作らない
    expect(upd).toContain('    this.refresh(p, b, pct, can);\n');
    expect(upd).toContain('    if (row === ROW_DEMO && p === FAMILY && this.demo.active !== col) this.demo.start(col);\n    this.demo.update(dtS);\n');
    expect(s).toContain('    if (st.text !== text) st.setText(text);\n');
    const ref = s.slice(s.indexOf('  private refresh('), s.indexOf('  /** ボタンの題と 2 行目'));
    expect(ref).not.toMatch(/labelOf\(/);
  });
  it('道: 試聴の口（sfxMusicAudition・sfxMusicLab*）を呼ぶのは曲の試聴の場だけ（と口の定義）。効果音の試聴の場は create で曲を止め、「曲の試聴へ」で戻る', () => {
    const files = readdirSync('src', { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.ts')).map((f) => join('src', f).split('\\').join('/'));
    const users = files.filter((f) => /\bsfxMusic(?:Audition|Lab\w*)\(/.test(readFileSync(f, 'utf8').replace(/\/\/[^\n]*/g, ''))).sort();
    expect(users).toEqual(['src/scenes/music-lab-scene.ts', 'src/systems/sfx-bus.ts']);
    const sl = readFileSync('src/scenes/sound-lab-scene.ts', 'utf8');
    expect(sl).toContain('    sfxMusic(MUSIC_CTX_NONE); //');
    expect(sl).toContain('() => this.leave(SCENE_KEYS.musicLab)');
  });
});
