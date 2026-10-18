import { describe, expect, it } from 'vitest';
import { landscapeSize, logicalWidthFor, screenBoxFor } from '../src/core/screen';

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
