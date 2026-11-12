import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { landscapeSize, logicalWidthFor, renderScaleFor, screenBoxFor } from '../src/core/screen';

// iPhone 15 の CSS px（横 852 × 393）と safe-area（横: 左右 59・下 21、縦: 上 59・下 34）
const LAND = { top: 0, right: 59, bottom: 21, left: 59 };
const PORT = { top: 59, right: 0, bottom: 34, left: 0 };
const W = (w: number, h: number): number => logicalWidthFor(w, h, 720, 1280, 1584, 8);

describe('画面の枠と論理幅（v0.5.1 実機 1 回目。core/screen）', () => {
  it('枠: 左右と上の safe-area を引き、下（ホームバー）は引かない。iPhone 15 横で (59, 0) から 734 × 393', () => {
    expect(screenBoxFor(852, 393, LAND)).toEqual({ left: 59, top: 0, width: 734, height: 393 });
    expect(screenBoxFor(852, 393, { top: 0, right: 0, bottom: 0, left: 0 })).toEqual({ left: 0, top: 0, width: 852, height: 393 });
    expect(screenBoxFor(10, 10, { top: 20, right: 20, bottom: 0, left: 20 })).toEqual({ left: 20, top: 20, width: 1, height: 1 });
  });
  it('横持ちの大きさ: 横で起動すれば枠そのもの。縦で起動（ホーム画面は縦）しても、上の safe-area を横の左右と見なして同じ 734 × 393', () => {
    expect(landscapeSize(852, 393, LAND)).toEqual({ width: 734, height: 393 });
    expect(landscapeSize(393, 852, PORT)).toEqual({ width: 734, height: 393 });
  });
  it('論理幅: 高さ 720 のまま縦横比に合わせ 8 刻みに切り捨て（はみ出さない）。16:9 より太い画面は 1280、上限 1584', () => {
    expect(W(734, 393)).toBe(1344); // 720 × 734 / 393 = 1344.7
    expect((1344 / 720) * 393).toBeLessThanOrEqual(734); // FIT は高さで決まり、上下は切れない
    expect(W(852, 393)).toBe(1560); // safe-area の無い横長（Safari のツールバーを隠した等）
    expect(W(1024, 768)).toBe(1280); // iPad（4:3）は従来どおり 16:9 で左右に黒帯
    expect(W(1280, 720)).toBe(1280);
    expect(W(3000, 1000)).toBe(1584);
    expect(W(393, 734)).toBe(1344); // 縦の値を渡しても長辺を幅にする
  });
});

describe('描画スケールの上限（v0.7.0 IP3。ユーザーの決め U9「描画の解像度の上限を上げてみましょうか」。core/screen の renderScaleFor）', () => {
  const src = readFileSync('src/config/game-config.ts', 'utf8');
  const CAP = Number(/export const DPR_CAP = (\d+);/.exec(src)![1]); // game-config は DOM を読むので字で読む
  const MAXPX = Number(/export const MAX_CANVAS_PIXELS = ([0-9_]+);/.exec(src)![1]!.replace(/_/g, ''));
  const old = (fw: number, fh: number, gw: number, dpr: number): number => Math.max(1, Math.min(fw / gw, fh / 720) * Math.min(dpr || 1, 2)); // v0.6.11 の式
  it('上限は 3（名前の付いた定数・U9 の理由つき）・canvas の画素の上限は iOS の 16,777,216 px・RENDER_SCALE はこの関数から', () => {
    expect(CAP).toBe(3);
    expect(MAXPX).toBe(16777216);
    expect(src).toContain('U9');
    expect(src).toContain('return renderScaleFor(SCREEN.width, SCREEN.height, GAME_WIDTH, GAME_HEIGHT, window.devicePixelRatio || 1, DPR_CAP, MAX_CANVAS_PIXELS);');
  });
  it('dpr ≤ 2 の端末は v0.6.11 の式とビット同一（iPhone SE・iPhone 15 の dpr 2 の模擬・iPad・PC）', () => {
    for (const [fw, fh] of [[734, 393], [852, 393], [667, 375], [1560, 720], [1194, 834], [1366, 1024], [1920, 1080]] as const) {
      const gw = W(fw, fh);
      for (const dpr of [0, 1, 1.25, 1.5, 2]) expect(renderScaleFor(fw, fh, gw, 720, dpr, CAP, MAXPX), `${fw}x${fh}@${dpr}`).toBe(old(fw, fh, gw, dpr));
    }
  });
  it('iPhone 15 の横持ち（枠 734 × 393・dpr 3）は 1.09 → 1.64（canvas 2,201 × 1,179＝2.6 M px）。論理の大きさ（論理幅・高さ 720）は同じ', () => {
    const gw = W(734, 393);
    expect(gw).toBe(1344);
    const k = renderScaleFor(734, 393, gw, 720, 3, CAP, MAXPX);
    expect(k).toBeCloseTo((393 / 720) * 3, 12);
    expect(old(734, 393, gw, 3)).toBeCloseTo((393 / 720) * 2, 12);
    expect(gw * 720 * k * k).toBeLessThan(3.6e6);
    expect(renderScaleFor(852, 393, W(852, 393), 720, 3, CAP, MAXPX) * W(852, 393)).toBeLessThanOrEqual(852 * 3); // 画面の物理画素を超えない
  });
  it('dpr 3 より上は 3 で止まり、canvas の画素は 16,777,216 px を超えない（下限 1 が優先）', () => {
    expect(renderScaleFor(734, 393, 1344, 720, 4, CAP, MAXPX)).toBe(renderScaleFor(734, 393, 1344, 720, 3, CAP, MAXPX));
    const big = renderScaleFor(3000, 1500, 1440, 720, 3, CAP, MAXPX);
    expect(1440 * 720 * big * big).toBeLessThanOrEqual(MAXPX * (1 + 1e-12));
    expect(big).toBeLessThan(Math.min(3000 / 1440, 1500 / 720) * 3);
    expect(renderScaleFor(100, 50, 1280, 720, 3, CAP, 1)).toBe(1);
  });
});
