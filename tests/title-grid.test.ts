// Title の日本のタブの 2 列の格子（v0.6.7。spec-v067 §D.6・§G.1・N6）: ui/title-grid の矩形（論理幅 1,280〜1,584 の 8 刻みの全部で画面の内・重ならない・中央）、
// 3 つの論理幅の置き方、米PT のタブは 1 列のまま（x 160・w 960）、格子の副題（「（」の前まで）と状態・題が重ならない、操作の一言の幅（日本 1,218・米 960）、title-scene の配線。
// menu-config・game-config は DOM を読むので import しない（値は title-layout-config から、DOM の側の 2 つの値はソースを読んで結ぶ）。
// v0.8.0 S5: us_04 が遊べるようになり米PT のタブも 4 任務＝日本のタブと同じ 2 列の格子（2 × 2。1 列は 3 行以下のタブの形として titleRowRect に残る）。
// v0.8.1 S4（lead の L65）: us_06 が遊べるようになり米PT のタブは 5 任務＝今の 2 列の格子で 3 段（2・2・1。日本のタブの v0.6.9 の 5 任務と同じ置き方。格子のコードは変えない）。
// v0.8.2 S4（lead の L44）: us_05 が遊べるようになり米PT のタブは 6 任務＝2 列 × 3 段で満杯（日本のタブの v0.6.11 の 6 任務と同じ矩形。order 5 のまま＝us_05 が 3 段目の左・us_06 が右。格子のコードは変えない）。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { getMenuEntries } from '../src/config/campaign-data';
import { getPrototypeMission } from '../src/config/mission-data';
import { TITLE_HINT_BY_CAMPAIGN_JA, TITLE_HINT_PX } from '../src/config/title-hint-config';
import { TITLE_GRID_COL_W, TITLE_GRID_FROM, TITLE_GRID_ROWS_MAX, TITLE_HINT_Y, TITLE_ROW_H, TITLE_ROW_STATUS_PX, TITLE_ROW_SUB_PX, TITLE_ROW_TITLE_PX, TITLE_ROW_W, TITLE_ROW_X, TITLE_TOGGLE_GAP } from '../src/config/title-layout-config';
import { shortLabelJa } from '../src/core/briefing';
import { TITLE_GRID_W, titleGridOn, titleGridSubJa, titleRowRect, type TitleRowRect } from '../src/ui/title-grid';
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
  it('日本のタブは 6 任務（order 順 jp_01・jp_02・jp_03・jp_04・jp_05・jp_06。v0.6.9 で jp_04、v0.6.11 S6 で jp_03）で 2 列 × 3 段（行優先）＝上限ちょうど。米PT は v0.8.0 S5 から 4 任務で 2 × 2、v0.8.1 S4 から 5 任務で 3 段（2・2・1）、v0.8.2 S4 から 6 任務で満杯', () => {
    expect(JP.map((e) => [e.id, e.title, e.playable])).toEqual([
      ['jp_01', '夜の輸送護衛', true],
      ['jp_02', '孤島の哨戒', true],
      ['jp_03', '運天港・空襲下の退避', true],
      ['jp_04', '多号作戦・オルモック湾へ', true],
      ['jp_05', '鹵獲艇の哨戒', true],
      ['jp_06', '慶良間の夜・最終出撃', true],
    ]);
    expect([TITLE_GRID_FROM, titleGridOn(JP.length), titleGridOn(US.length)]).toEqual([4, true, true]);
    // v0.6.11 S6: 6 任務で 2 × TITLE_GRID_ROWS_MAX の格子が満杯（次の日本の任務は並べ方が要る＝CHANGELOG の既知の制約）
    expect([JP.length, 2 * TITLE_GRID_ROWS_MAX]).toEqual([6, 6]);
    expect(US.map((e) => [e.id, e.title, e.playable])).toEqual([
      ['us_01', 'コレヒドール脱出', true],
      ['us_02', '東京急行を迎え撃て', true],
      ['us_03', '大発を狩れ', true],
      ['us_04', 'ブラケット海峡の夜', true],
      ['us_05', 'スリガオ海峡・最初の接触', true],
      ['us_06', 'オルモック湾の決着', true],
    ]);
    expect([US.length, 2 * TITLE_GRID_ROWS_MAX]).toEqual([6, 6]); // v0.8.2 S4: 格子が満杯（7 枚目の us_07 の置き方は v0.8.3＝CHANGELOG の既知の制約）
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
    // v0.6.9 の日本のタブ（5 任務）: 3 段目は左の列だけ（jp_06。y 432・下端 528）。1〜4 番目は 4 任務と同じ所（jp_04 が 3 番目＝2 段目の左に入り、jp_05・jp_06 が 1 つずつ後ろへ）
    for (const [w, [l]] of Object.entries(want)) {
      expect(rects(5, Number(w)).slice(0, 4), w).toEqual(rects(4, Number(w)));
      expect(titleRowRect(4, 5, Number(w)), w).toEqual({ x: l, y: 432, w: 597 });
    }
    // v0.6.11 S6 の日本のタブ（6 任務）: 3 段目は左右とも（jp_05・jp_06。y 432・下端 528）。1〜5 番目は 5 任務と同じ所（jp_03 が 3 番目＝2 段目の左に入り、jp_04〜jp_06 が 1 つずつ後ろへ）
    for (const [w, [l, r]] of Object.entries(want)) {
      expect(rects(6, Number(w)).slice(0, 5), w).toEqual(rects(5, Number(w)));
      expect(titleRowRect(5, 6, Number(w)), w).toEqual({ x: r, y: 432, w: 597 });
    }
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
  it('米PT のタブ（v0.8.0 S5 から 4 行・v0.8.1 S4 から 5 行・v0.8.2 S4 から 6 行）は日本のタブの 6 任務と同じ 3 段（左上 us_01・右上 us_02・左中 us_03・右中 us_04・左下 us_05・右下 us_06。y 432・下端 528）。3 行以下のタブは v0.6.6 と同じ 1 列 x 160・y 216／324／432・w 960（N6）', () => {
    expect([TITLE_ROW_X, TITLE_ROW_W, US.length]).toEqual([160, 960, 6]);
    for (const w of WIDTHS) {
      const l = w / 2 - 609;
      expect(rects(US.length, w), String(w)).toEqual([
        { x: l, y: 216, w: 597 },
        { x: l + 621, y: 216, w: 597 },
        { x: l, y: 324, w: 597 },
        { x: l + 621, y: 324, w: 597 },
        { x: l, y: 432, w: 597 },
        { x: l + 621, y: 432, w: 597 },
      ]);
      expect(rects(US.length, w), String(w)).toEqual(rects(JP.length, w)); // 日本のタブ（v0.6.11 から 6 任務）と同じ矩形
      expect(rects(3, w), String(w)).toEqual([216, 324, 432].map((y) => ({ x: 160, y, w: 960 })));
    }
  });
  it('押しやすさ: 列 597 × 96 px は iPhone 15 横（393 pt / 720 px）で 326 × 52 pt（≥ 44 pt）', () => {
    const pt = 393 / 720;
    expect(Math.round(TITLE_GRID_COL_W * pt)).toBe(326);
    expect(Math.round(TITLE_ROW_H * pt)).toBe(52);
  });
});

describe('格子の行の文（副題は「（」の前まで。spec §D.6。v0.8.0 S5 から「→」の前まで も＝titleGridSubJa）', () => {
  it('副題は 6 つとも「（」の前まで（20 px で 368／288／360／320／288／368 px。jp_04 は「パロンポン沖（レイテ島西岸）」→「パロンポン沖」、jp_03 は「（」が無いのでそのまま）', () => {
    const subs = JP.map((e) => shortLabelJa(e.sub));
    expect(subs).toEqual(['1942年12月9日 ・ ガダルカナル島北岸', '1944年1月30日 ・ ウェーク島', '1944年10月10日 ・ 沖縄本島・運天港', '1944年12月11日 ・ パロンポン沖', '1944年2月18日 ・ ラバウル沖', '1945年3月28日 ・ 沖縄・慶良間列島沖']);
    expect(subs.map((s) => Math.round(textWidthPx(s, TITLE_ROW_SUB_PX)))).toEqual([368, 288, 360, 320, 288, 368]);
  });
  it('状態（右寄せ 24 px「出撃準備 →」134 px）と副題・題が重ならない（すき間 ≥ 16 px。最悪は副題 30 px・題 39 px＝jp_04「多号作戦・オルモック湾へ」。v0.6.8 までは 99 px。v0.6.11 S6 の jp_03 は副題 39・題 99 px）', () => {
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
    expect([Math.round(worstSub), Math.round(worstTitle)]).toEqual([30, 39]);
  });
  it('v0.8.0 S5（lead の L59）: 格子の副題は titleGridSubJa＝最初の「（」か「→」の先に来る方の前まで。どちらも無ければそのまま。日本の 6 つは shortLabelJa と同じ（「→」を持たない＝日本のタブは物体ごとに同じ）', () => {
    expect(titleGridSubJa('1942年3月11日 ・ コレヒドール→ミンダナオ（フィリピン）')).toBe('1942年3月11日 ・ コレヒドール'); // 「→」が先
    expect(titleGridSubJa('1943年8月1日 ・ ブラケット海峡（コロンバンガラ島沖→ビラ）')).toBe('1943年8月1日 ・ ブラケット海峡'); // 「（」が先
    expect(titleGridSubJa('1944年10月10日 ・ 沖縄本島・運天港')).toBe('1944年10月10日 ・ 沖縄本島・運天港'); // どちらも無い
    expect(titleGridSubJa('A → B')).toBe('A');
    for (const e of JP) {
      expect(e.sub.includes('→'), e.id).toBe(false);
      expect(titleGridSubJa(e.sub), e.id).toBe(shortLabelJa(e.sub));
    }
  });
  it('v0.8.0 S5（L59）: 米PT の札（v0.8.1 S4 から 5 つ・v0.8.2 S4 から 6 つ）も状態「出撃準備 →」と副題・題が重ならない（すき間 ≥ 16 px＝日本の格子と同じ規則。W 1,280・1,584 とも列 597 px）。us_01 は「→」の前まで（91 px）', () => {
    const subs = US.map((e) => titleGridSubJa(e.sub));
    expect(subs).toEqual(['1942年3月11日 ・ コレヒドール', '1942年12月11日 ・ ガダルカナル島沖', '1943年7月15日 ・ ニューギニア北岸', '1943年8月1日 ・ ブラケット海峡', '1944年10月24日 ・ ミンダナオ海', '1944年12月11日 ・ パロンポン沖']); // us_06 は jp_04 と同じ副題（同じ夜・同じ場所）。us_05 は「（ボホール島沖）」の前まで（spec D-H6）
    for (const w of [1280, 1584]) {
      US.forEach((e, i) => {
        const r = titleRowRect(i, US.length, w);
        expect(r.w, `${w} ${e.id}`).toBe(TITLE_GRID_COL_W);
        const inner = r.w - 2 * MENU_PAD_X;
        const status = textWidthPx(e.status, TITLE_ROW_STATUS_PX);
        expect(inner - status - textWidthPx(subs[i]!, TITLE_ROW_SUB_PX), `${w} ${e.id} 副題`).toBeGreaterThanOrEqual(16);
        expect(inner - status - textWidthPx(e.title, TITLE_ROW_TITLE_PX), `${w} ${e.id} 題`).toBeGreaterThanOrEqual(16);
      });
    }
    // 副題のすき間（us_01 は「→」で切らないと −30 px＝状態に食い込んでいた）と題のすき間
    const gap = (t: string, px: number): number => Math.round(TITLE_GRID_COL_W - 2 * MENU_PAD_X - textWidthPx('出撃準備 →', TITLE_ROW_STATUS_PX) - textWidthPx(t, px));
    expect(subs.map((t) => gap(t, TITLE_ROW_SUB_PX))).toEqual([90, 38, 50, 82, 78, 78]); // v0.8.2 S4: us_05「1944年10月24日 ・ ミンダナオ海」は us_06 と同じ字の数
    expect(gap(shortLabelJa(US[0]!.sub), TITLE_ROW_SUB_PX)).toBe(-30);
    expect(US.map((e) => gap(e.title, TITLE_ROW_TITLE_PX))).toEqual([159, 129, 249, 129, 39, 129]); // v0.8.2 S4: us_05「スリガオ海峡・最初の接触」は 39 px（日本の jp_04「多号作戦・オルモック湾へ」と同じ＝最悪の 39 の内）
  });
  it('操作の一言（18 px）: 日本は「右下の角で魚雷（効くのは駆逐艦だけ）・その左で機銃」（v0.6.8 実機 1 回目。全任務で両方使え、位置も同じ）で、格子の幅 1,218 px の内（1,037 px）。米PT も格子の幅の内（v0.8.0 S5 から 2 × 2。今の一言は 1 列の 960 px の内のまま。R12）', () => {
    const jp = TITLE_HINT_BY_CAMPAIGN_JA['jp_hard']!;
    expect(jp).toContain('右下の角で魚雷');
    expect(jp).toContain('その左で機銃');
    expect(getPrototypeMission(gameData, 'jp_02').mainWeapon).toBe('none');
    expect(Math.round(textWidthPx(jp, TITLE_HINT_PX))).toBe(1037);
    expect(textWidthPx(jp, TITLE_HINT_PX)).toBeLessThanOrEqual(TITLE_GRID_W);
    expect(textWidthPx(TITLE_HINT_BY_CAMPAIGN_JA['us_pt']!, TITLE_HINT_PX)).toBeLessThanOrEqual(TITLE_ROW_W);
    expect(textWidthPx(TITLE_HINT_BY_CAMPAIGN_JA['us_pt']!, TITLE_HINT_PX)).toBeLessThanOrEqual(TITLE_GRID_W);
  });
});

describe('title-scene の配線（ソース）', () => {
  it('行の矩形は titleRowRect から、副題は格子のときだけ titleGridSubJa（v0.8.0 S5 まで shortLabelJa）。行の固定の x・y・w は使わない', () => {
    const code = src('scenes/title-scene.ts');
    expect(code).toContain('const r = titleRowRect(i, n, GAME_WIDTH);');
    expect(code).toContain('sub: grid ? titleGridSubJa(e.sub) : e.sub,');
    expect(code.includes('shortLabelJa'), 'shortLabelJa').toBe(false);
    for (const k of ['TITLE_ROW_X', 'TITLE_ROW_W', 'TITLE_ROW_TOP', 'TITLE_ROW_GAP']) expect(code.includes(k), k).toBe(false);
  });
});
