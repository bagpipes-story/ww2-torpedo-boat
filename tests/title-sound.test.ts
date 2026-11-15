// v0.7.1 S1（アートと音②：合成の効果音。spec-v0710 §8・§14 L1）: Title の右上の「音」ボタン（音: オン ⇄ 音: オフ）の置き方。
// v0.7.2 S1（spec-v0720 §4.4・brief L15）: その左に「曲」ボタン（曲: オン ⇄ 曲: オフ。同じ 200 × 80・間 12）。v0.7.1 の左の一言は「音」ボタンの 2 行目「本体の消音も確認」へ移した。
// 論理幅 1,280〜1,584 の 8 刻みの全部で: 2 つのボタンは画面の内（右の余白 24）・タブ（上端 108）の上・重ならず、ロゴとビルド番号に 24 px 以上かからない。題と 2 行目はボタンに収まる。
// menu-config・game-config は DOM を読むので import しない（値は title-layout-config から、DOM の側の値はソースを読んで結ぶ＝tests/title-grid と同じ）。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TITLE_MUSIC_GAP, TITLE_MUSIC_OFF_JA, TITLE_MUSIC_ON_JA, TITLE_SOUND_H, TITLE_SOUND_OFF_JA, TITLE_SOUND_ON_JA, TITLE_SOUND_PX, TITLE_SOUND_SUB_JA, TITLE_SOUND_SUB_PX, TITLE_SOUND_W, TITLE_SOUND_Y,
} from '../src/config/title-layout-config';
import { textWidthPx } from './pt-ui-kit';

const src = (f: string): string => readFileSync(join(__dirname, '..', 'src', f), 'utf8');
const numConst = (file: string, name: string): number => Number(new RegExp(`export const ${name} = (\\d+);`).exec(src(file))![1]);
const HUD_MARGIN = numConst('config/game-config.ts', 'HUD_MARGIN');
const TITLE_TAB_Y = numConst('config/menu-config.ts', 'TITLE_TAB_Y');
const TITLE_TAB_W = numConst('config/menu-config.ts', 'TITLE_TAB_W');
const TITLE_TAB_GAP = numConst('config/menu-config.ts', 'TITLE_TAB_GAP');
const TITLE_LOGO_Y = numConst('config/menu-config.ts', 'TITLE_LOGO_Y');
const TITLE_LOGO_PX = numConst('config/menu-config.ts', 'TITLE_LOGO_PX');
const MENU_PAD_X = numConst('config/menu-config.ts', 'MENU_PAD_X');
const MENU_TWO_LINE_DY = numConst('config/menu-config.ts', 'MENU_TWO_LINE_DY');
const HUD_FONT_DEBUG_PX = numConst('config/ui-config.ts', 'HUD_FONT_DEBUG_PX');
const LOGO = /export const TITLE_LOGO_TEXT = '([^']+)';/.exec(src('config/menu-config.ts'))![1]!;
const WIDTHS: number[] = [];
for (let w = 1280; w <= 1584; w += 8) WIDTHS.push(w);
/** 文の行の高さの見積もり（Phaser の Text は字の大きさの約 1.25 倍） */
const LINE_H = 1.25;
/** 表示倍率 852 / 1560（iPhone 15 横）で pt に */
const PT = 852 / 1560;

describe('Title の右上の「曲」「音」ボタン（v0.7.1 S1・v0.7.2 S1）', () => {
  it('どちらも 200 × 80 px・上端 20（iPhone 15 横で 約 109 × 44 pt＝43 pt 以上）・間 12。題は「曲: オン」⇄「曲: オフ」・「音: オン」⇄「音: オフ」で、余白を引いたボタンに収まる', () => {
    expect([TITLE_SOUND_W, TITLE_SOUND_H, TITLE_SOUND_Y, TITLE_SOUND_PX, TITLE_MUSIC_GAP]).toEqual([200, 80, 20, 26, 12]);
    expect([TITLE_SOUND_ON_JA, TITLE_SOUND_OFF_JA, TITLE_MUSIC_ON_JA, TITLE_MUSIC_OFF_JA]).toEqual(['音: オン', '音: オフ', '曲: オン', '曲: オフ']);
    for (const t of [TITLE_SOUND_ON_JA, TITLE_SOUND_OFF_JA, TITLE_MUSIC_ON_JA, TITLE_MUSIC_OFF_JA]) expect(textWidthPx(t, TITLE_SOUND_PX), t).toBeLessThanOrEqual(TITLE_SOUND_W - 2 * MENU_PAD_X);
    expect(TITLE_SOUND_H * PT).toBeGreaterThanOrEqual(43);
    expect(TITLE_SOUND_W * PT).toBeGreaterThanOrEqual(43);
  });
  it('「音」の 2 行目「本体の消音も確認」（本体の消音スイッチはページから読めない＝v0.7.1 L1 の一言）: 17 px で余白を引いた幅 136 に収まり、題と 2 行目はボタンの内で重ならない', () => {
    expect([TITLE_SOUND_SUB_JA, TITLE_SOUND_SUB_PX]).toEqual(['本体の消音も確認', 17]);
    expect(textWidthPx(TITLE_SOUND_SUB_JA, TITLE_SOUND_SUB_PX)).toBeLessThanOrEqual(TITLE_SOUND_W - 2 * MENU_PAD_X);
    const cy = TITLE_SOUND_Y + TITLE_SOUND_H / 2;
    const title = { y0: cy - MENU_TWO_LINE_DY - (TITLE_SOUND_PX * LINE_H) / 2, y1: cy - MENU_TWO_LINE_DY + (TITLE_SOUND_PX * LINE_H) / 2 };
    const sub = { y0: cy + MENU_TWO_LINE_DY - (TITLE_SOUND_SUB_PX * LINE_H) / 2, y1: cy + MENU_TWO_LINE_DY + (TITLE_SOUND_SUB_PX * LINE_H) / 2 };
    expect(title.y0).toBeGreaterThanOrEqual(TITLE_SOUND_Y);
    expect(title.y1).toBeLessThan(sub.y0);
    expect(sub.y1).toBeLessThanOrEqual(TITLE_SOUND_Y + TITLE_SOUND_H);
  });
  it('論理幅 1,280〜1,584 の全部: 2 つは画面の内でタブの上・間 12 で重ならず、「曲」の左端はロゴ・ビルド番号から 24 px 以上離れる（1,280 で 844〜1,044・1,056〜1,256）', () => {
    const label = 'claude/v0.7.2-bgm@89a43a3';
    let minLogoGap = Infinity;
    for (const w of WIDTHS) {
      const sound = { x0: w - HUD_MARGIN - TITLE_SOUND_W, x1: w - HUD_MARGIN, y1: TITLE_SOUND_Y + TITLE_SOUND_H };
      const music = { x0: sound.x0 - TITLE_MUSIC_GAP - TITLE_SOUND_W, x1: sound.x0 - TITLE_MUSIC_GAP };
      expect(sound.x1, `${w}`).toBeLessThanOrEqual(w - HUD_MARGIN);
      expect(sound.y1, `${w}`).toBeLessThan(TITLE_TAB_Y);
      expect(sound.x0 - music.x1, `${w}`).toBe(TITLE_MUSIC_GAP);
      const logoRight = w / 2 + textWidthPx(LOGO, TITLE_LOGO_PX) / 2;
      expect(music.x0 - logoRight, `${w}`).toBeGreaterThanOrEqual(24);
      expect(music.x0 - (w / 2 + textWidthPx(label, HUD_FONT_DEBUG_PX) / 2), `${w}`).toBeGreaterThanOrEqual(24);
      expect(TITLE_LOGO_Y).toBeLessThan(sound.y1); // 縦は重なる帯にいる（だから横で離す）
      minLogoGap = Math.min(minLogoGap, music.x0 - logoRight);
      if (w === 1280) {
        expect([music.x0, music.x1, sound.x0, sound.x1]).toEqual([844, 1044, 1056, 1256]);
        expect([w / 2 + TITLE_TAB_W + TITLE_TAB_GAP / 2, sound.x0]).toEqual([1112, 1056]); // タブとは x が重なる＝ボタンはタブの上端より上に収める
      }
    }
    expect(Math.round(minLogoGap)).toBe(32);
  });
  it('配線（ソース）: x は画面の右端から。Title はメニューの曲を頼み、sfx-settings で 2 つを別に切り替えて題を直し、SHUTDOWN で破棄する。左の一言は無くなった', () => {
    const cfg = src('config/menu-config.ts');
    expect(cfg).toContain('export const TITLE_SOUND_X = GAME_WIDTH - HUD_MARGIN - TITLE_SOUND_W;');
    expect(cfg).toContain('export const TITLE_MUSIC_X = TITLE_SOUND_X - TITLE_MUSIC_GAP - TITLE_SOUND_W;');
    const code = src('scenes/title-scene.ts');
    expect(code).toContain("const soundSpec = { x: TITLE_SOUND_X, y: TITLE_SOUND_Y, w: TITLE_SOUND_W, h: TITLE_SOUND_H, title: soundTitle(), titlePx: TITLE_SOUND_PX, sub: TITLE_SOUND_SUB_JA, subPx: TITLE_SOUND_SUB_PX, align: 'center' as const };");
    expect(code).toContain("this.musicBtn = new MenuButton(this, { x: TITLE_MUSIC_X, y: TITLE_SOUND_Y, w: TITLE_SOUND_W, h: TITLE_SOUND_H, title: musicTitle(), titlePx: TITLE_SOUND_PX, align: 'center' }, () => {");
    expect(code).toContain('      setSoundEnabled(!soundEnabled());\n      this.soundBtn?.setTitle(soundTitle());\n');
    expect(code).toContain('      setMusicEnabled(!musicEnabled());\n      this.musicBtn?.setTitle(musicTitle());\n');
    expect(code).toContain('    sfxMusic(MUSIC_CTX_MENU); //');
    expect(code).toContain('this.soundBtn?.destroy();');
    expect(code).toContain('this.musicBtn?.destroy();');
    expect(code).not.toMatch(/TITLE_SOUND_HINT/);
    expect(src('config/title-layout-config.ts')).not.toMatch(/TITLE_SOUND_HINT/);
    expect(code.split('\n').length).toBeLessThanOrEqual(301);
  });
});
