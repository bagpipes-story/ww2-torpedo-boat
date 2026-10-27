// Title の日本のタブの 2 列の格子（v0.6.7。spec-v067 §D.6・§G.1・N6）: ui/title-grid の矩形（論理幅 1,280〜1,584 の 8 刻みの全部で画面の内・重ならない・中央）、
// 3 つの論理幅の置き方、米PT のタブは 1 列のまま（x 160・w 960）、格子の副題（「（」の前まで）と状態・題が重ならない、操作の一言の幅（日本 1,218・米 960）、title-scene の配線。
// menu-config・game-config は DOM を読むので import しない（値は title-layout-config から、DOM の側の 2 つの値はソースを読んで結ぶ）。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { getMenuEntries } from '../src/config/campaign-data';
import { getPrototypeMission } from '../src/config/mission-data';
import { TITLE_HINT_BY_CAMPAIGN_JA, TITLE_HINT_PX } from '../src/config/title-hint-config';
import { TITLE_GRID_COL_W, TITLE_GRID_FROM, TITLE_GRID_ROWS_MAX, TITLE_HINT_Y, TITLE_ROW_H, TITLE_ROW_STATUS_PX, TITLE_ROW_SUB_PX, TITLE_ROW_TITLE_PX, TITLE_ROW_W, TITLE_ROW_X, TITLE_TOGGLE_GAP } from '../src/config/title-layout-config';
import { shortLabelJa } from '../src/core/briefing';
import { TITLE_GRID_W, titleGridOn, titleRowRect, type TitleRowRect } from '../src/ui/title-grid';
import { textWidthPx } from './pt-ui-kit';

const src = (f: string): string => readFileSync(join(__dirname, '..', 'src', f), 'utf8');
/** config/menu-config の値（DOM を読む config なのでソースから読む） */
const menuConst = (name: string): number => Number(new RegExp(`export const ${name} = (\\d+);`).exec(src('config/menu-config.ts'))![1]);
const MENU_PAD_X = menuConst('MENU_PAD_X');
const TITLE_DIFF_W = menuConst('TITLE_DIFF_W');
/** 論理幅（config/game-config の GAME_WIDTH_MIN・MAX・STEP） */
const WIDTHS: number[] = [];
for (let w = 1280; w <= 1584; w += 8) WIDTHS.push(w);
const rects = (n: number, w: number): TitleRowRect[] => Array.from({ length: n }, (_, i) => titleRowRect(i, n, w));
const JP = getMenuEntries(gameData, 'jp_hard').entries;
const US = getMenuEntries(gameData, 'us_pt').entries;

describe('Title の任務の行の矩形（ui/title-grid）', () => {
  it('日本のタブは 4 任務（order 順 jp_01・jp_02・jp_05・jp_06）で 2 列 × 2 段（行優先）。米PT は 3 任務で 1 列', () => {
    expect(JP.map((e) => [e.id, e.title, e.playable])).toEqual([
      ['jp_01', '夜の輸送護衛', true],
      ['jp_02', '孤島の哨戒', true],
      ['jp_05', '鹵獲艇の哨戒', true],
      ['jp_06', '慶良間の夜・最終出撃', true],
    ]);
    expect([TITLE_GRID_FROM, titleGridOn(JP.length), titleGridOn(US.length)]).toEqual([4, true, false]);
    expect(US.map((e) => e.id)).toEqual(['us_01', 'us_02', 'us_03']);
  });
  it('3 つの論理幅の置き方: 列 597・間 24・計 1,218（下の 3 つの切り替えと同じ幅・同じ中心）、左 x = 幅/2 − 609・右 = 左 + 621、段 y 216・324', () => {
    expect([TITLE_GRID_COL_W, TITLE_TOGGLE_GAP, TITLE_GRID_W, 3 * TITLE_DIFF_W + 2 * TITLE_TOGGLE_GAP]).toEqual([597, 24, 1218, 1218]);
    const want: Record<number, [number, number]> = { 1280: [31, 652], 1344: [63, 684], 1584: [183, 804] };
    for (const [w, [l, r]] of Object.entries(want)) {
      expect(rects(4, Number(w)), w).toEqual([
        { x: l, y: 216, w: 597 },
        { x: r, y: 216, w: 597 },
        { x: l, y: 324, w: 597 },
        { x: r, y: 324, w: 597 },
      ]);
    }
    // 右端（1,280: 628／1,249、1,344: 660／1,281、1,584: 780／1,401）
    expect([1280, 1344, 1584].map((w) => [titleRowRect(0, 4, w).x + 597, titleRowRect(1, 4, w).x + 597])).toEqual([[628, 1249], [660, 1281], [780, 1401]]);
  });
  it('論理幅 1,280〜1,584 の 8 刻みの全部・4〜6 任務: 画面の内、左右の余白が同じ、矩形が重ならない（間 ≥ 12 px）、下端は操作の一言（y 560）より上', () => {
    for (const w of WIDTHS) {
      for (let n = TITLE_GRID_FROM; n <= 2 * TITLE_GRID_ROWS_MAX; n++) {
        const rs = rects(n, w);
        for (const r of rs) {
          expect(r.x, `${w} ${n}`).toBeGreaterThanOrEqual(0);
          expect(r.x + r.w, `${w} ${n}`).toBeLessThanOrEqual(w);
          expect(r.y + TITLE_ROW_H, `${w} ${n}`).toBeLessThanOrEqual(TITLE_HINT_Y);
        }
        expect(rs[0]!.x, `${w}`).toBeCloseTo(w - (rs[1]!.x + rs[1]!.w), 9);
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            const a = rs[i]!;
            const b = rs[j]!;
            const gapX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
            const gapY = Math.max(b.y - (a.y + TITLE_ROW_H), a.y - (b.y + TITLE_ROW_H));
            expect(Math.max(gapX, gapY), `${w} ${n} ${i}/${j}`).toBeGreaterThanOrEqual(12);
          }
        }
      }
    }
  });
  it('米PT のタブ（3 行）はどの論理幅でも v0.6.6 と同じ x 160・y 216／324／432・w 960（N6）', () => {
    expect([TITLE_ROW_X, TITLE_ROW_W]).toEqual([160, 960]);
    for (const w of WIDTHS) {
      expect(rects(US.length, w), String(w)).toEqual([216, 324, 432].map((y) => ({ x: 160, y, w: 960 })));
    }
  });
  it('押しやすさ: 列 597 × 96 px は iPhone 15 横（393 pt / 720 px）で 326 × 52 pt（≥ 44 pt）', () => {
    const pt = 393 / 720;
    expect(Math.round(TITLE_GRID_COL_W * pt)).toBe(326);
    expect(Math.round(TITLE_ROW_H * pt)).toBe(52);
  });
});

describe('格子の行の文（副題は「（」の前まで。spec §D.6）', () => {
  it('副題は 4 つとも「（」の前まで（20 px で 368／288／288／368 px）', () => {
    const subs = JP.map((e) => shortLabelJa(e.sub));
    expect(subs).toEqual(['1942年12月9日 ・ ガダルカナル島北岸', '1944年1月30日 ・ ウェーク島', '1944年2月18日 ・ ラバウル沖', '1945年3月28日 ・ 沖縄・慶良間列島沖']);
    expect(subs.map((s) => Math.round(textWidthPx(s, TITLE_ROW_SUB_PX)))).toEqual([368, 288, 288, 368]);
  });
  it('状態（右寄せ 24 px「出撃準備 →」134 px）と副題・題が重ならない（すき間 ≥ 16 px。最悪は副題 30 px・題 99 px）', () => {
    const inner = TITLE_GRID_COL_W - 2 * MENU_PAD_X;
    let worstSub = Infinity;
    let worstTitle = Infinity;
    for (const e of JP) {
      const status = textWidthPx(e.status, TITLE_ROW_STATUS_PX);
      expect(Math.round(status), e.id).toBe(134);
      const subGap = inner - status - textWidthPx(shortLabelJa(e.sub), TITLE_ROW_SUB_PX);
      const titleGap = inner - status - textWidthPx(e.title, TITLE_ROW_TITLE_PX);
      expect(subGap, e.id).toBeGreaterThanOrEqual(16);
      expect(titleGap, e.id).toBeGreaterThanOrEqual(16);
      worstSub = Math.min(worstSub, subGap);
      worstTitle = Math.min(worstTitle, titleGap);
    }
    expect([Math.round(worstSub), Math.round(worstTitle)]).toEqual([30, 99]);
    // 1 列（米PT）は副題を切らない: 960 − 64 の内に「出撃準備 →」と並ぶ（いちばん長い us_02）
    for (const e of US) expect(TITLE_ROW_W - 2 * MENU_PAD_X - textWidthPx(e.status, TITLE_ROW_STATUS_PX) - textWidthPx(e.sub, TITLE_ROW_SUB_PX), e.id).toBeGreaterThanOrEqual(16);
  });
  it('操作の一言（18 px）: 日本は「右下で魚雷と機銃（隅の大きいボタンが主。…）」（v0.6.8。全任務で両方使える）で、格子の幅 1,218 px の内（1,170 px）。米PT は 1 列の 960 px の内（R12）', () => {
    const jp = TITLE_HINT_BY_CAMPAIGN_JA['jp_hard']!;
    expect(jp).toContain('魚雷と機銃');
    expect(jp).toContain('隅の大きいボタン');
    expect(getPrototypeMission(gameData, 'jp_02').mainWeapon).toBe('none');
    expect(Math.round(textWidthPx(jp, TITLE_HINT_PX))).toBe(1170);
    expect(textWidthPx(jp, TITLE_HINT_PX)).toBeLessThanOrEqual(TITLE_GRID_W);
    expect(textWidthPx(TITLE_HINT_BY_CAMPAIGN_JA['us_pt']!, TITLE_HINT_PX)).toBeLessThanOrEqual(TITLE_ROW_W);
  });
});

describe('title-scene の配線（ソース）', () => {
  it('行の矩形は titleRowRect から、副題は格子のときだけ shortLabelJa。行の固定の x・y・w は使わない', () => {
    const code = src('scenes/title-scene.ts');
    expect(code).toContain('const r = titleRowRect(i, n, GAME_WIDTH);');
    expect(code).toContain('sub: grid ? shortLabelJa(e.sub) : e.sub,');
    for (const k of ['TITLE_ROW_X', 'TITLE_ROW_W', 'TITLE_ROW_TOP', 'TITLE_ROW_GAP']) expect(code.includes(k), k).toBe(false);
  });
});
