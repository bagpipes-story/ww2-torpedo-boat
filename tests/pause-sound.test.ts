// v0.7.1 S3（アートと音②：合成の効果音。spec-v0710 §8）: 一時停止の画面の「音」ボタン（音: オン ⇄ 音: オフ）の置き方。下の段の中央＝左「任務をやめる」と右「再開」の間。
// 論理幅 1,280〜1,584 の 8 刻みの全部で: 3 つのボタンは重ならず（1,280 で間 136 px）、題はボタンに収まる。選んだ値は Title のボタンと同じ（systems/sfx-settings）。
// menu-config・game-config は DOM を読むので import しない（値はソースを読んで結ぶ＝tests/title-sound と同じ）。
// v0.7.2 S1（spec-v0720 §4.4・brief L16）: 「音」のすぐ上に「曲」ボタン（同じ x・320 × 96・間 16＝y 488〜584。黒を敷く）。下の段の 3 つはそのまま。値は Title の「曲」と同じ。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SFX_PAUSE_OPEN } from '../src/config/sfx-config';
import { TITLE_MUSIC_OFF_JA, TITLE_MUSIC_ON_JA, TITLE_SOUND_OFF_JA, TITLE_SOUND_ON_JA } from '../src/config/title-layout-config';
import { textWidthPx } from './pt-ui-kit';

const src = (f: string): string => readFileSync(join(__dirname, '..', 'src', f), 'utf8');
const numConst = (file: string, name: string): number => Number(new RegExp(`export const ${name} = (\\d+);`).exec(src(file))![1]);
const HUD_MARGIN = numConst('config/game-config.ts', 'HUD_MARGIN');
const MENU_PRIMARY_W = numConst('config/menu-config.ts', 'MENU_PRIMARY_W');
const MENU_PAD_X = numConst('config/menu-config.ts', 'MENU_PAD_X');
const RESULT_BUTTON_H = numConst('config/menu-config.ts', 'RESULT_BUTTON_H');
const RESULT_BUTTON_PX = numConst('config/menu-config.ts', 'RESULT_BUTTON_PX');
const PAUSE_MUSIC_GAP = numConst('config/menu-config.ts', 'PAUSE_MUSIC_GAP');
const PAUSE_NOTE_Y = numConst('config/menu-config.ts', 'PAUSE_NOTE_Y');
const PAUSE_NOTE_PX = numConst('config/menu-config.ts', 'PAUSE_NOTE_PX');
/** 論理の高さ 720（game-config の GAME_HEIGHT）。下の段の上端 */
const GAME_HEIGHT = 720;
const BOTTOM_Y = GAME_HEIGHT - HUD_MARGIN - RESULT_BUTTON_H;
const WIDTHS: number[] = [];
for (let w = 1280; w <= 1584; w += 8) WIDTHS.push(w);

describe('一時停止の「音」ボタン（v0.7.1 S3）', () => {
  it('置き方の式: 幅は主ボタンと同じ 320・x は画面の中央・y と高さは下の段（「任務をやめる」「再開」と同じ）', () => {
    const cfg = src('config/menu-config.ts');
    expect(cfg).toContain('export const PAUSE_SOUND_W = MENU_PRIMARY_W;\n');
    expect(cfg).toContain('export const PAUSE_SOUND_X = GAME_WIDTH / 2 - PAUSE_SOUND_W / 2;\n');
    expect(cfg).toContain('export const MENU_PRIMARY_X = GAME_WIDTH - HUD_MARGIN - MENU_PRIMARY_W;\n');
    expect(cfg).toContain('export const RESULT_LIST_X = HUD_MARGIN;\n');
    expect([MENU_PRIMARY_W, RESULT_BUTTON_H, HUD_MARGIN]).toEqual([320, 96, 24]);
    const scene = src('scenes/pause-scene.ts');
    expect(scene).toContain("    this.soundBtn = new MenuButton(this, { x: PAUSE_SOUND_X, y: RESULT_BUTTON_Y, w: PAUSE_SOUND_W, h: RESULT_BUTTON_H, title: soundTitle(), titlePx: RESULT_BUTTON_PX, align: 'center' }, () => {\n");
    expect(scene).toContain('    this.back(PAUSE_SOUND_X, RESULT_BUTTON_Y, PAUSE_SOUND_W, RESULT_BUTTON_H);\n'); // 下の Hud が透けないように黒を敷く
    expect(scene).toContain('    const soundTitle = (): string => (soundEnabled() ? TITLE_SOUND_ON_JA : TITLE_SOUND_OFF_JA);\n');
    expect(scene).toContain('      this.soundBtn?.destroy();\n');
    expect(scene.split('\n').length).toBeLessThanOrEqual(301);
  });
  it('論理幅 1,280〜1,584 の全部: 左「任務をやめる」・中央「音」・右「再開」は重ならず、間は 136 px 以上（1,280 でちょうど 136）', () => {
    let minGap = Infinity;
    for (const w of WIDTHS) {
      const quit = { x0: HUD_MARGIN, x1: HUD_MARGIN + MENU_PRIMARY_W };
      const sound = { x0: w / 2 - MENU_PRIMARY_W / 2, x1: w / 2 + MENU_PRIMARY_W / 2 };
      const resume = { x0: w - HUD_MARGIN - MENU_PRIMARY_W, x1: w - HUD_MARGIN };
      expect(sound.x0 - quit.x1, `${w}`).toBeGreaterThanOrEqual(136);
      expect(resume.x0 - sound.x1, `${w}`).toBeGreaterThanOrEqual(136);
      expect(sound.x0 - quit.x1, `${w}`).toBe(resume.x0 - sound.x1); // 左右対称
      minGap = Math.min(minGap, sound.x0 - quit.x1);
    }
    expect(minGap).toBe(136);
    expect(WIDTHS[0]).toBe(1280);
    expect(WIDTHS[WIDTHS.length - 1]).toBe(1584);
  });
  it('題は Title のボタンと同じ「音: オン」⇄「音: オフ」で、余白を引いたボタンに収まる。高さは iPhone 15 横で 46 pt 以上', () => {
    expect([TITLE_SOUND_ON_JA, TITLE_SOUND_OFF_JA]).toEqual(['音: オン', '音: オフ']);
    for (const t of [TITLE_SOUND_ON_JA, TITLE_SOUND_OFF_JA]) expect(textWidthPx(t, RESULT_BUTTON_PX)).toBeLessThanOrEqual(MENU_PRIMARY_W - 2 * MENU_PAD_X);
    expect((RESULT_BUTTON_H * 852) / 1560).toBeGreaterThanOrEqual(46);
  });
  it('一時停止を開いた合図はボタンの音を低く・小さく（spec §3.3。rate は 0.5〜2 の内）。押すと Title と同じ口で切り替えて覚える', () => {
    expect(SFX_PAUSE_OPEN).toEqual({ gain: 0.7, rate: 0.7 });
    const scene = src('scenes/pause-scene.ts');
    expect(scene).toContain("    sfxCue('ui_tap', SFX_PAUSE_OPEN.gain, 0, SFX_PAUSE_OPEN.rate);\n");
    expect(scene).toContain('      setSoundEnabled(!soundEnabled());\n      this.soundBtn?.setTitle(soundTitle());\n');
    // v0.7.2 S1: 「曲」の口も同じ import（Title と同じ値）
    expect(scene).toContain("import { musicEnabled, setMusicEnabled, setSoundEnabled, soundEnabled } from '../systems/sfx-settings';\n");
    expect(src('scenes/title-scene.ts')).toContain("import { musicEnabled, setMusicEnabled, setSoundEnabled, soundEnabled } from '../systems/sfx-settings';\n");
  });
});

describe('一時停止の「曲」ボタン（v0.7.2 S1）', () => {
  it('置き方の式: 「音」のすぐ上（同じ x・同じ幅 320・高さ 96・間 16＝y 488〜584）。黒を敷く。題は Title の「曲」と同じで、押すと Title と同じ口で切り替えて覚える', () => {
    const cfg = src('config/menu-config.ts');
    expect(cfg).toContain('export const PAUSE_MUSIC_Y = RESULT_BUTTON_Y - PAUSE_MUSIC_GAP - RESULT_BUTTON_H;\n');
    expect(cfg).toContain('export const RESULT_BUTTON_Y = GAME_HEIGHT - HUD_MARGIN - RESULT_BUTTON_H;\n');
    expect(src('config/game-config.ts')).toMatch(/export const GAME_HEIGHT = 720;/);
    expect(PAUSE_MUSIC_GAP).toBe(16);
    const y0 = BOTTOM_Y - PAUSE_MUSIC_GAP - RESULT_BUTTON_H;
    expect([y0, y0 + RESULT_BUTTON_H, BOTTOM_Y]).toEqual([488, 584, 600]);
    expect(y0).toBeGreaterThan(PAUSE_NOTE_Y + PAUSE_NOTE_PX); // 一言（y 280・22 px）の下
    const scene = src('scenes/pause-scene.ts');
    expect(scene).toContain("    this.musicBtn = new MenuButton(this, { x: PAUSE_SOUND_X, y: PAUSE_MUSIC_Y, w: PAUSE_SOUND_W, h: RESULT_BUTTON_H, title: musicTitle(), titlePx: RESULT_BUTTON_PX, align: 'center' }, () => {\n");
    expect(scene).toContain('    this.back(PAUSE_SOUND_X, PAUSE_MUSIC_Y, PAUSE_SOUND_W, RESULT_BUTTON_H);\n');
    expect(scene).toContain('      setMusicEnabled(!musicEnabled());\n      this.musicBtn?.setTitle(musicTitle());\n');
    expect(scene).toContain('      this.musicBtn?.destroy();\n');
    expect(scene).toContain("import { musicEnabled, setMusicEnabled, setSoundEnabled, soundEnabled } from '../systems/sfx-settings';\n");
  });
  it('論理幅 1,280〜1,584 の全部: 「曲」は下の段の 3 つのどれとも重ならず（「音」とは縦に 16 px）、左右の 2 つより上。題は収まり、高さは 43 pt 以上', () => {
    const overlap = (a: { x0: number; x1: number; y0: number; y1: number }, b: typeof a): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
    for (const w of WIDTHS) {
      const bottom = (x0: number) => ({ x0, x1: x0 + MENU_PRIMARY_W, y0: BOTTOM_Y, y1: BOTTOM_Y + RESULT_BUTTON_H });
      const quit = bottom(HUD_MARGIN), sound = bottom(w / 2 - MENU_PRIMARY_W / 2), resume = bottom(w - HUD_MARGIN - MENU_PRIMARY_W);
      const music = { x0: sound.x0, x1: sound.x1, y0: BOTTOM_Y - PAUSE_MUSIC_GAP - RESULT_BUTTON_H, y1: BOTTOM_Y - PAUSE_MUSIC_GAP };
      for (const b of [quit, sound, resume]) expect(overlap(music, b), `${w}`).toBe(false);
      expect(sound.y0 - music.y1, `${w}`).toBe(PAUSE_MUSIC_GAP);
      expect(music.x1, `${w}`).toBeLessThanOrEqual(w - HUD_MARGIN);
    }
    for (const t of [TITLE_MUSIC_ON_JA, TITLE_MUSIC_OFF_JA]) expect(textWidthPx(t, RESULT_BUTTON_PX)).toBeLessThanOrEqual(MENU_PRIMARY_W - 2 * MENU_PAD_X);
    expect((RESULT_BUTTON_H * 852) / 1560).toBeGreaterThanOrEqual(43);
  });
});
