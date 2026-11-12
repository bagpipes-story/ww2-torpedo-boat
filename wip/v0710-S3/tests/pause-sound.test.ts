// v0.7.1 S3（アートと音②：合成の効果音。spec-v0710 §8）: 一時停止の画面の「音」ボタン（音: オン ⇄ 音: オフ）の置き方。下の段の中央＝左「任務をやめる」と右「再開」の間。
// 論理幅 1,280〜1,584 の 8 刻みの全部で: 3 つのボタンは重ならず（1,280 で間 136 px）、題はボタンに収まる。選んだ値は Title のボタンと同じ（systems/sfx-settings）。
// menu-config・game-config は DOM を読むので import しない（値はソースを読んで結ぶ＝tests/title-sound と同じ）。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SFX_PAUSE_OPEN } from '../src/config/sfx-config';
import { TITLE_SOUND_OFF_JA, TITLE_SOUND_ON_JA } from '../src/config/title-layout-config';
import { textWidthPx } from './pt-ui-kit';

const src = (f: string): string => readFileSync(join(__dirname, '..', 'src', f), 'utf8');
const numConst = (file: string, name: string): number => Number(new RegExp(`export const ${name} = (\\d+);`).exec(src(file))![1]);
const HUD_MARGIN = numConst('config/game-config.ts', 'HUD_MARGIN');
const MENU_PRIMARY_W = numConst('config/menu-config.ts', 'MENU_PRIMARY_W');
const MENU_PAD_X = numConst('config/menu-config.ts', 'MENU_PAD_X');
const RESULT_BUTTON_H = numConst('config/menu-config.ts', 'RESULT_BUTTON_H');
const RESULT_BUTTON_PX = numConst('config/menu-config.ts', 'RESULT_BUTTON_PX');
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
    expect(scene).toContain("import { setSoundEnabled, soundEnabled } from '../systems/sfx-settings';\n");
    expect(src('scenes/title-scene.ts')).toContain("import { setSoundEnabled, soundEnabled } from '../systems/sfx-settings';\n");
  });
});
