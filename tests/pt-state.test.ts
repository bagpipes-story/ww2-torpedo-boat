// 米PT の段階の番号（v0.6.3 実機 2 回目。core/pt-state、spec r2 §D.1）: 追撃 PT_CHASE を離脱と去るの間に入れ、去る・海域の外・沈んだを 6/7/8 に付け直した。
// まだ戦う段階は ptFighting（< PT_LEAVE）だけで見る（`<= PT_BREAK` の比べは追撃の PT を落とす）。
import { describe, expect, it } from 'vitest';
import { PT_ALERT, PT_BREAK, PT_CHASE, PT_LEAVE, PT_OUT, PT_PASS, PT_PATROL, PT_RUN_IN, PT_SUNK, ptFighting } from '../src/core/pt-boats';

describe('米PT の段階の番号（v0.6.3 実機 2 回目）', () => {
  it('哨戒 0 → 警戒 1 → 突撃 2 → 航過 3 → 離脱 4 → 追撃 5 → 去る 6 → 海域の外 7、沈んだ 8', () => {
    expect([PT_PATROL, PT_ALERT, PT_RUN_IN, PT_PASS, PT_BREAK, PT_CHASE, PT_LEAVE, PT_OUT, PT_SUNK]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('ptFighting: 哨戒〜追撃は true、去る・海域の外・沈んだは false', () => {
    expect([PT_PATROL, PT_ALERT, PT_RUN_IN, PT_PASS, PT_BREAK, PT_CHASE].map(ptFighting)).toEqual([true, true, true, true, true, true]);
    expect([PT_LEAVE, PT_OUT, PT_SUNK].map(ptFighting)).toEqual([false, false, false]);
  });
});
