// v0.7.2 S1（アートと音③：BGM と命中スローの音。spec-v0720 §7・brief L14）: 曲の試聴の場（?sfxlab。scenes/music-lab-scene）の置き方と語・道を固定する（ui/music-lab-layout は Phaser なし）。
// - 論理幅 1280〜1584 の全部で: 行 0 の 4 つ（候補 A・B・C と「止める」）・「戻る」・「効果音の試聴へ」が画面の内・重ならない・高さ 84 px 以上・幅 160 px 以上、行の名前はボタンの左、
//   説明（2 行まで）より下、右下の状態の一文（一番長い文）とボタンが重ならない。
// - 語: 説明に「知っている曲に似ていたら一言」。ゲームの曲（既定 MUSIC_TITLE_DEFAULT_ID）は「記号（今）」だけの題（v0.7.1 IP4 と同じ）と名前の 2 行目。題と 2 行目は 1280 のボタンに収まる。
// - シーン: 候補と「止める」はボタンの音を鳴らさない（silent）・create で場面 LAB と「音」「曲」を鳴らす側へ・SHUTDOWN で NONE（候補の標本を捨てる）と保存の値へ・update は確保しない。
// - 道: 試聴の口（sfxMusicAudition・sfxMusicLab*）を呼ぶのは曲の試聴の場だけ。効果音の試聴の場は曲を止め、「曲の試聴へ」で戻る。
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MUSIC_LAB_BUILDING_SUB_JA, MUSIC_LAB_DEFAULT_MARK_JA, MUSIC_LAB_FROM_SFX_JA, MUSIC_LAB_HEAD_JA, MUSIC_LAB_LETTERS, MUSIC_LAB_NAMES_JA, MUSIC_LAB_NOTES_JA, MUSIC_LAB_ROW_LABELS_JA, MUSIC_LAB_ROW_SUBS_JA,
  MUSIC_LAB_STATUS_BUILDING_JA, MUSIC_LAB_STATUS_IDLE_JA, MUSIC_LAB_STATUS_NONE_JA, MUSIC_LAB_STATUS_PLAYING_JA, MUSIC_LAB_STATUS_STOPPED_JA, MUSIC_LAB_STATUS_WAIT_JA, MUSIC_LAB_STOP_JA,
  MUSIC_LAB_STOP_SUB_JA, MUSIC_LAB_TO_SFX_JA,
} from '../src/config/music-lab-config';
import { MUSIC_TITLE_KEYS } from '../src/config/sfx-music-config';
import { SOUND_LAB_BACK_PX, SOUND_LAB_BUTTON_PX, SOUND_LAB_HEAD_PX, SOUND_LAB_HEAD_Y, SOUND_LAB_NOTE_PX, SOUND_LAB_ROW_TOP, SOUND_LAB_STATUS_PX } from '../src/config/sound-lab-config';
import { MUSIC_TITLE_DEFAULT_ID } from '../src/assets/sfx-music-themes';
import { MUSIC_LAB_ROW0_COLS, musicLabButtonSub, musicLabButtonTitle, musicLabSideRect } from '../src/ui/music-lab-layout';
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
];
const scene = (): string => readFileSync('src/scenes/music-lab-scene.ts', 'utf8');

describe('曲の試聴の場の置き方と語（v0.7.2 S1）', () => {
  it('行 0: 候補 A・B・C（MUSIC_TITLE_KEYS の順）と「止める」の 4 つ。記号・名前・一言は候補の数だけ。行の名前は「タイトルの曲」', () => {
    expect(MUSIC_TITLE_KEYS).toEqual(['title_a', 'title_b', 'title_c']);
    expect([...MUSIC_LAB_LETTERS]).toEqual(['A', 'B', 'C']);
    expect([...MUSIC_LAB_NAMES_JA]).toEqual(['静かな夜の海', '小太鼓と金管', 'ラジオの哀愁']);
    expect(MUSIC_LAB_NOTES_JA.length).toBe(3);
    expect(MUSIC_LAB_ROW0_COLS).toBe(MUSIC_TITLE_KEYS.length + 1);
    expect([MUSIC_LAB_ROW_LABELS_JA, MUSIC_LAB_ROW_SUBS_JA].map((a) => a.length)).toEqual([1, 1]);
    expect(MUSIC_LAB_ROW_LABELS_JA[0]).toBe('タイトルの曲');
  });
  it.each([1280, 1360, 1440, 1520, 1584])('論理幅 %i: ボタン 6 つが画面の内・重ならない・高さ 84 以上・幅 160 以上。行の名前は左・説明（2 行まで）より下。右下の状態の一文と重ならない', (w) => {
    const f = { gameWidth: w, gameHeight: H, margin: MARGIN };
    const rects: SoundLabRect[] = [];
    for (let col = 0; col < MUSIC_LAB_ROW0_COLS; col++) rects.push(soundLabButtonRect(0, col, MUSIC_LAB_ROW0_COLS, f));
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
    const l = soundLabLabelRect(0, f);
    expect(l.x + l.w).toBeLessThan(rects[0]!.x);
    expect(l.y).toBe(rects[0]!.y);
    expect(SOUND_LAB_ROW_TOP).toBeGreaterThan(headBottom);
    // 説明は 2 行まで（論理幅 − 余白で折り返す。見積もりの 0.9 倍の詰まりで）
    expect(textWidthPx(MUSIC_LAB_HEAD_JA, SOUND_LAB_HEAD_PX)).toBeLessThanOrEqual(2 * 0.9 * (w - 2 * MARGIN));
    // 右下の状態の一文（右寄せ・中心は「戻る」の中心の高さ）は「効果音の試聴へ」の右
    const longest = Math.max(...STATUSES.map((t) => textWidthPx(t, SOUND_LAB_STATUS_PX)));
    expect(w - MARGIN - longest - (side.x + side.w), `${w}`).toBeGreaterThanOrEqual(24);
    expect([side.y, side.h, side.w]).toEqual([back.y, back.h, back.w]);
  });
  it('語: 説明に「知っている曲に似ていたら一言」・既定の曲だけ「記号（今）」の題で名前は 2 行目（ほかは「記号 名前」と一言）。論理幅 1280 のボタンに題・2 行目・「作成中…」が収まる', () => {
    expect(MUSIC_LAB_HEAD_JA).toContain('知っている曲に似ていたら一言ください');
    expect(MUSIC_LAB_DEFAULT_MARK_JA).toBe('（今）');
    expect(musicLabButtonTitle('A', '静かな夜の海', true)).toBe('A（今）');
    expect(musicLabButtonTitle('B', '小太鼓と金管', false)).toBe('B 小太鼓と金管');
    expect(musicLabButtonSub('静かな夜の海', 'パッドと鈴・63 BPM', true)).toBe('静かな夜の海');
    expect(musicLabButtonSub('小太鼓と金管', '行進・105 BPM', false)).toBe('行進・105 BPM');
    expect(MUSIC_TITLE_KEYS.map((_, i) => titleOf(i))).toEqual(['A（今）', 'B 小太鼓と金管', 'C ラジオの哀愁']); // 既定は A（§11 O1。ユーザーが選んだら直す）
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
    const side = musicLabSideRect(f);
    for (const t of [MUSIC_LAB_TO_SFX_JA, MUSIC_LAB_FROM_SFX_JA]) expect(textWidthPx(t, SOUND_LAB_BACK_PX)).toBeLessThanOrEqual(side.w - 64);
  });
});

describe('曲の試聴の場のシーン（v0.7.2 S1）', () => {
  it('候補と「止める」は silent・「戻る」は Title へ・「効果音の試聴へ」は効果音の場へ。create で LAB と「音」「曲」を鳴らす側へ、SHUTDOWN で NONE と保存の値へ', () => {
    const s = scene();
    expect(s.match(/new MenuButton\(/g)!.length).toBe(4);
    expect(s.match(/align: 'center' as const, silent: true \};/g)!.length).toBe(2);
    expect(s).toContain('() => this.leave(SCENE_KEYS.title)');
    expect(s).toContain('() => this.leave(SCENE_KEYS.soundLab)');
    expect(s).toContain('    sfxSetMuted(false);\n    sfxMusicEnabled(true);\n    sfxMusic(MUSIC_CTX_LAB);\n');
    expect(s).toContain('      sfxMusic(MUSIC_CTX_NONE); //');
    expect(s).toContain('      sfxSetMuted(!soundEnabled());\n      sfxMusicEnabled(musicEnabled());\n');
    expect(s).toContain('    sfxMusicAudition(this.chosen === NONE ? null : MUSIC_TITLE_KEYS[this.chosen]!);\n');
    expect(s.split('\n').length).toBeLessThanOrEqual(251);
  });
  it('update は確保せず文を書かない（状態が変わった時だけ refresh が書く。refresh は前と同じ文なら setText しない）', () => {
    const s = scene();
    const upd = s.slice(s.indexOf('  override update(): void {'), s.indexOf('  /** 候補 i を押した'));
    expect(upd.length).toBeGreaterThan(100);
    expect(upd).not.toMatch(/\bnew\s|\.(map|filter|slice)\(|=>|setText|`/);
    expect(upd).toContain('    this.refresh(p, b, pct, can);\n');
    expect(s).toContain('    if (st.text !== text) st.setText(text);\n');
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
