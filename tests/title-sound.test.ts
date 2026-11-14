// v0.7.1 S1（アートと音②：合成の効果音。spec-v0710 §8・§14 L1）: Title の右上の「音」ボタン（音: オン ⇄ 音: オフ）と左の一言の置き方。
// 論理幅 1,280〜1,584 の 8 刻みの全部で: ボタンは画面の内（右の余白 24）・タブ（上端 108）の上、一言はロゴとビルド番号にかからずボタンの左、題はボタンに収まる。
// menu-config・game-config は DOM を読むので import しない（値は title-layout-config から、DOM の側の値はソースを読んで結ぶ＝tests/title-grid と同じ）。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TITLE_SOUND_H, TITLE_SOUND_HINT_GAP, TITLE_SOUND_HINT_JA, TITLE_SOUND_HINT_PX, TITLE_SOUND_OFF_JA, TITLE_SOUND_ON_JA, TITLE_SOUND_PX, TITLE_SOUND_W, TITLE_SOUND_Y,
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
const HUD_FONT_DEBUG_PX = numConst('config/ui-config.ts', 'HUD_FONT_DEBUG_PX');
const LOGO = /export const TITLE_LOGO_TEXT = '([^']+)';/.exec(src('config/menu-config.ts'))![1]!;
const WIDTHS: number[] = [];
for (let w = 1280; w <= 1584; w += 8) WIDTHS.push(w);
/** 文の行の高さの見積もり（Phaser の Text は字の大きさの約 1.25 倍） */
const LINE_H = 1.25;
const hintLines = TITLE_SOUND_HINT_JA.split('\n');
const hintW = Math.max(...hintLines.map((l) => textWidthPx(l, TITLE_SOUND_HINT_PX)));
const hintH = hintLines.length * TITLE_SOUND_HINT_PX * LINE_H;

describe('Title の右上の「音」ボタン（v0.7.1 S1）', () => {
  it('200 × 80 px・上端 20（iPhone 15 横で 約 109 × 44 pt）。題は「音: オン」⇄「音: オフ」で、余白を引いたボタンに収まる', () => {
    expect([TITLE_SOUND_W, TITLE_SOUND_H, TITLE_SOUND_Y, TITLE_SOUND_PX]).toEqual([200, 80, 20, 26]);
    expect([TITLE_SOUND_ON_JA, TITLE_SOUND_OFF_JA]).toEqual(['音: オン', '音: オフ']);
    for (const t of [TITLE_SOUND_ON_JA, TITLE_SOUND_OFF_JA]) expect(textWidthPx(t, TITLE_SOUND_PX)).toBeLessThanOrEqual(TITLE_SOUND_W - 2 * MENU_PAD_X);
    // 表示倍率 852 / 1560（iPhone 15 横）で高さ 43 pt 以上
    expect((TITLE_SOUND_H * 852) / 1560).toBeGreaterThanOrEqual(43);
  });
  it('一言は「音が出ない時は／本体の消音を確かめる」の 2 行（本体の消音スイッチはページから読めない＝L1）', () => {
    expect(hintLines).toEqual(['音が出ない時は', '本体の消音を確かめる']);
    expect(TITLE_SOUND_HINT_PX).toBe(18);
    expect(hintH).toBeLessThanOrEqual(TITLE_SOUND_H);
  });
  it('論理幅 1,280〜1,584 の全部: ボタンは画面の内でタブの上、一言はボタンの左でロゴ・ビルド番号・タブにかからない', () => {
    const label = 'claude/v0.7.1-sfx@a1e08c8';
    for (const w of WIDTHS) {
      const btn = { x0: w - HUD_MARGIN - TITLE_SOUND_W, x1: w - HUD_MARGIN, y0: TITLE_SOUND_Y, y1: TITLE_SOUND_Y + TITLE_SOUND_H };
      expect(btn.x1, `${w}`).toBeLessThanOrEqual(w - HUD_MARGIN);
      expect(btn.y1, `${w}`).toBeLessThan(TITLE_TAB_Y);
      const hint = { x0: btn.x0 - TITLE_SOUND_HINT_GAP - hintW, x1: btn.x0 - TITLE_SOUND_HINT_GAP, y0: (btn.y0 + btn.y1) / 2 - hintH / 2, y1: (btn.y0 + btn.y1) / 2 + hintH / 2 };
      expect(hint.x1, `${w}`).toBeLessThan(btn.x0);
      expect(hint.y1, `${w}`).toBeLessThan(TITLE_TAB_Y);
      expect(hint.y0, `${w}`).toBeGreaterThanOrEqual(btn.y0);
      // ロゴ（中央・y 52〜）とは横に 24 px 以上空く。ビルド番号（上中央・18 px）は今のブランチの長さで横に空く
      const logoRight = w / 2 + textWidthPx(LOGO, TITLE_LOGO_PX) / 2;
      expect(hint.x0 - logoRight, `${w}`).toBeGreaterThanOrEqual(24);
      expect(hint.x0 - (w / 2 + textWidthPx(label, HUD_FONT_DEBUG_PX) / 2), `${w}`).toBeGreaterThanOrEqual(24);
      expect(TITLE_LOGO_Y).toBeLessThan(hint.y1); // 縦は重なる帯にいる（だから横で離す）
      // タブ（2 枚・中央）: 1,280 ではボタンと x が重なる（タブの右端 1,112 > ボタンの左端 1,056）ので、ボタンも一言もタブの上端より上に収める
      const tabsRight = w / 2 + TITLE_TAB_W + TITLE_TAB_GAP / 2;
      if (w === 1280) expect([tabsRight, btn.x0]).toEqual([1112, 1056]);
    }
  });
  it('配線（ソース）: x は画面の右端から。Title は sfx-settings で切り替えて題を直し、SHUTDOWN で破棄する', () => {
    expect(src('config/menu-config.ts')).toContain('export const TITLE_SOUND_X = GAME_WIDTH - HUD_MARGIN - TITLE_SOUND_W;');
    const code = src('scenes/title-scene.ts');
    expect(code).toContain("this.soundBtn = new MenuButton(this, { x: TITLE_SOUND_X, y: TITLE_SOUND_Y, w: TITLE_SOUND_W, h: TITLE_SOUND_H, title: soundTitle(), titlePx: TITLE_SOUND_PX, align: 'center' }, () => {");
    expect(code).toContain('setSoundEnabled(!soundEnabled());');
    expect(code).toContain('this.soundBtn?.setTitle(soundTitle());');
    expect(code).toContain("this.add.text(TITLE_SOUND_X - TITLE_SOUND_HINT_GAP, TITLE_SOUND_Y + TITLE_SOUND_H / 2, TITLE_SOUND_HINT_JA, hudTextStyle(TITLE_SOUND_HINT_PX, HUD_COLOR)).setOrigin(1, 0.5).setAlign('right').setDepth(DEPTH.hud);");
    expect(code).toContain('this.soundBtn?.destroy();');
    expect(code.split('\n').length).toBeLessThanOrEqual(301);
  });
});
