// v0.7.1 IP2（実機 2 回目）: 音の試聴の場（?sfxlab。scenes/sound-lab-scene）の置き方と語・道を固定する（ui/sound-lab-layout は Phaser なし）。
// - 論理幅 1280〜1584 の全部で: 4 行 × 4 列のボタンと「戻る」が画面の内・重ならない・高さ 96 px 以上、行の名前はボタンの左、説明（y 52）より下、上中央のビルド番号の行（y 24〜）に重ならない。
// - ボタンの題は記号（既定の案だけ「（今）」）、行の名前は 弾倉の始め・弾倉の終わり・魚雷の発射・続けて聞く。案のボタンはボタンの音を鳴らさない（silent）。
// - 道: ?sfxlab の時だけ Boot から来る（tests/sfx-inventory がシーンの並びと Boot の行を固定）。差し替えの口 sfxSetBuffer・sfxCanPlay を呼ぶのは試聴の場だけ（ゲームの中では呼ばない）。
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SFX_LAB } from '../src/config/sfx-config';
import { SOUND_LAB_HEAD_Y, SOUND_LAB_ROW_LABELS_JA, SOUND_LAB_ROW_SUBS_JA } from '../src/config/sound-lab-config';
import { SFX_VARIANT_GROUPS } from '../src/assets/sfx-variants';
import { soundLabBackRect, soundLabButtonRect, soundLabButtonTitle, soundLabLabelRect, type SoundLabRect } from '../src/ui/sound-lab-layout';

const H = 720;
const MARGIN = 24;
const ROWS = SFX_VARIANT_GROUPS.length + 1;
const overlap = (a: SoundLabRect, b: SoundLabRect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('音の試聴の場の置き方（v0.7.1 IP2）', () => {
  it.each([1280, 1360, 1440, 1520, 1584])('論理幅 %i: ボタン 16 と「戻る」が画面の内・重ならない・高さ 96 以上・幅 200 以上。行の名前は左・説明より下', (w) => {
    const f = { gameWidth: w, gameHeight: H, margin: MARGIN };
    const rects: SoundLabRect[] = [];
    for (let row = 0; row < ROWS; row++) for (let col = 0; col < 4; col++) rects.push(soundLabButtonRect(row, col, f));
    rects.push(soundLabBackRect(f));
    expect(rects.length).toBe(17);
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(MARGIN);
      expect(r.x + r.w).toBeLessThanOrEqual(w - MARGIN + 1e-9);
      expect(r.y).toBeGreaterThan(SOUND_LAB_HEAD_Y + 60);
      expect(r.y + r.h).toBeLessThanOrEqual(H - MARGIN);
      expect(r.h).toBeGreaterThanOrEqual(96);
      expect(r.w).toBeGreaterThanOrEqual(200);
    }
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlap(rects[i]!, rects[j]!), `${i}-${j}`).toBe(false);
    for (let row = 0; row < ROWS; row++) {
      const l = soundLabLabelRect(row, f);
      expect(l.x + l.w).toBeLessThan(soundLabButtonRect(row, 0, f).x);
      expect(l.y).toBe(soundLabButtonRect(row, 0, f).y);
    }
  });
  it('語: 行の名前と一言・ボタンの題（既定だけ「（今）」）・「続けて聞く」は 1.2 秒の間', () => {
    expect([...SOUND_LAB_ROW_LABELS_JA]).toEqual(['弾倉の始め', '弾倉の終わり', '魚雷の発射', '続けて聞く']);
    expect(SOUND_LAB_ROW_SUBS_JA.length).toBe(ROWS);
    expect(soundLabButtonTitle('A', true)).toBe('A（今）');
    expect(soundLabButtonTitle('B', false)).toBe('B');
    expect(SFX_LAB).toEqual({ pairGapS: 1.2, pendingS: 1.0 });
    expect(SOUND_LAB_ROW_SUBS_JA[3]).toContain(`${SFX_LAB.pairGapS} 秒`);
  });
  it('シーン: 案のボタンは silent（4 行 × 4）・「戻る」はタイトルへ・create は鳴らさない・update は確保しない', () => {
    const s = readFileSync('src/scenes/sound-lab-scene.ts', 'utf8');
    expect(s.match(/new MenuButton\(/g)!.length).toBe(2);
    expect(s).toContain("align: 'center' as const, silent: true };");
    expect(s).toContain('    this.scene.start(SCENE_KEYS.title);\n');
    expect(s).toContain('  override update(time: number): void {');
    const upd = s.slice(s.indexOf('  override update('), s.indexOf('  private tap('));
    expect(upd).not.toMatch(/\bnew\s|\.(map|filter|slice)\(|=>|setText/);
    expect(s.split('\n').length).toBeLessThanOrEqual(300);
  });
  it('差し替えの口（sfxSetBuffer・sfxCanPlay）を呼ぶのは試聴の場だけ', () => {
    const files = readdirSync('src', { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.ts')).map((f) => join('src', f).split('\\').join('/'));
    const users = files.filter((f) => /\bsfx(?:SetBuffer|CanPlay)\(/.test(readFileSync(f, 'utf8').replace(/\/\/[^\n]*/g, ''))).sort();
    expect(users).toEqual(['src/scenes/sound-lab-scene.ts', 'src/systems/sfx-bus.ts']);
  });
});
