// 米PT の掃射の航過と追撃の模擬（v0.6.3 実機 2 回目、spec r2 §H.2）の対の無い撃たない 7 行（行の分け方は tests/pt-sim-kit の SIM_FILES）:
// 全速は遠くから見つかり全速でも 14〜40% 沈む・ジグザグは見る行（80% 以下）・静音で転舵・全速で転舵・PT へ向かう・見つかったら全速でまっすぐ帰る（★。8〜26%）・全速で逃げて 4 秒かわす。
// 漂流 2% 以下と不変（§E）。
import { describe, expect } from 'vitest';
import { SIM_FILES, itSimBands } from './pt-sim-kit';

describe('米PT の掃射の航過と追撃の模擬（v0.6.3 実機 2 回目、spec r2 §H.2 の対の無い撃たない行）', () => {
  // 較正の表は 1 回だけ回す（7 行、N 200 で 13 秒ほど）
  itSimBands('較正（N 200・seed 1〜200）: 全速は 1,500 m より遠くで見つかる、全速でまっすぐ逃げても 8〜26% 沈む（後ろから追って撃たれ、機関を撃ち抜かれる夜もある）、PT へ向かうのは罠ではない（50% 以下）。漂流の帯・不変', SIM_FILES.rows, (run) => {
    // 見つかったら全速でまっすぐ帰る（★）: 1 夜 1 回より多い連射、機関損傷の夜 30% より多い（逃げ足を奪う。spec r2 §A の 2）
    const flee = run.cell('flee_full');
    expect([flee.bursts > 1, flee.enginePct > 30]).toEqual([true, true]);
  });
});
