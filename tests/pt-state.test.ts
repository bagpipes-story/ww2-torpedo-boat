// 米PT の段階の番号（v0.6.3 実機 2 回目。core/pt-state、spec r2 §D.1）: 追撃 PT_CHASE を離脱と去るの間に入れ、去る・海域の外・沈んだを 6/7/8 に付け直した。
// まだ戦う段階は ptFighting（< PT_LEAVE）だけで見る（`<= PT_BREAK` の比べは追撃の PT を落とす）。脅威の PT は撃っている PT → 追撃の最寄り → 警戒・突撃 → 離脱 → 哨戒。
import { describe, expect, it } from 'vitest';
import {
  PT_ALERT, PT_BREAK, PT_CHASE, PT_LEAVE, PT_OUT, PT_PASS, PT_PATROL, PT_RUN_IN, PT_SUNK,
  countPass, createPtSection, createPtTelemetry, ptFighting, threatIndex,
} from '../src/core/pt-boats';
import { P } from './pt-kit';

describe('米PT の段階の番号（v0.6.3 実機 2 回目）', () => {
  it('哨戒 0 → 警戒 1 → 突撃 2 → 航過 3 → 離脱 4 → 追撃 5 → 去る 6 → 海域の外 7、沈んだ 8', () => {
    expect([PT_PATROL, PT_ALERT, PT_RUN_IN, PT_PASS, PT_BREAK, PT_CHASE, PT_LEAVE, PT_OUT, PT_SUNK]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('ptFighting: 哨戒〜追撃は true、去る・海域の外・沈んだは false', () => {
    expect([PT_PATROL, PT_ALERT, PT_RUN_IN, PT_PASS, PT_BREAK, PT_CHASE].map(ptFighting)).toEqual([true, true, true, true, true, true]);
    expect([PT_LEAVE, PT_OUT, PT_SUNK].map(ptFighting)).toEqual([false, false, false]);
  });
});

describe('追撃の欄と脅威の PT（v0.6.3 実機 2 回目）', () => {
  it('作るとき: PT の連射・制圧の欄は 0・false、隊の連射・制圧の数は 0、最後に連射を撃った PT は −1。テレメトリの追撃の欄も 0・false', () => {
    const q = createPtSection(P, 24);
    for (const b of q.boats) expect([b.burst, b.bursts, b.slowS, b.chaseHits, b.suppressed, b.coneS]).toEqual([false, 0, 0, 0, false, 0]);
    expect([q.bursts, q.firedBursts, q.burstHits, q.suppressions, q.suppressSeq, q.lastPassBurst, q.lastBurstBoat, q.selfGapLeftS]).toEqual([0, 0, 0, 0, 0, false, -1, 0]);
    const t = createPtTelemetry();
    expect([t.burst, t.burstFired, t.suppressSeq, t.bursts, t.maxBursts, t.chasing]).toEqual([false, false, 0, 0, 0, 0]);
  });

  it('threatIndex: 撃っている PT（航過・連射）→ 追撃の最寄り（突撃より先）→ 警戒・突撃の最寄り → 離脱 → 哨戒', () => {
    const q = createPtSection(P, 24); // PT0 (2000, 2200)・PT1 (2000, 2400)
    q.boats[0]!.phase = PT_RUN_IN;
    q.boats[1]!.phase = PT_CHASE;
    expect(threatIndex(q, 2000, 2100)).toBe(1); // 突撃の PT0 の方が近いが、追撃の PT1 が先
    q.boats[0]!.phase = PT_CHASE;
    expect([threatIndex(q, 2000, 2100), threatIndex(q, 2000, 2500)]).toEqual([0, 1]); // 追撃どうしは最寄り
    q.boats[1]!.phase = PT_PASS;
    q.boats[1]!.burst = true;
    q.owner = 1;
    expect(threatIndex(q, 2000, 2100)).toBe(1); // 連射中の PT が先
    q.owner = -1;
    q.boats[0]!.phase = PT_BREAK;
    q.boats[1]!.phase = PT_LEAVE;
    expect(threatIndex(q, 0, 0)).toBe(0);
  });

  it('countPass: 最後の攻撃が連射だったか（lastPassBurst）を残す。連射は航過の回数に数えない（counts false）が、撃てば firedPasses に入る', () => {
    const q = createPtSection(P, 24);
    const b = q.boats[0]!;
    Object.assign(b, { burst: true, firedThisPass: 3 });
    countPass(q, b, 0, false);
    expect([q.passes, b.passes, q.firedPasses, q.cleanPasses, q.lastPassBurst, q.lastPassFired, q.lastPassBoat]).toEqual([0, 0, 1, 1, true, true, 0]);
    Object.assign(b, { burst: false, firedThisPass: 0 });
    countPass(q, b, 0, true);
    expect([q.passes, b.passes, q.firedPasses, q.lastPassBurst, q.lastPassFired]).toEqual([1, 1, 1, false, false]);
  });
});
