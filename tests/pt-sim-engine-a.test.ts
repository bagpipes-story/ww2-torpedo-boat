// 機関の不調の設計の帯（v0.6.5。spec-v065 §F.3 の T-E4・T-E1。tests/pt-sim-engine-kit・systems/pt-engine-calibration）: 最初から全速でまっすぐ帰る（full）の無視の代価を
// N 400・seed 1〜400 の {不調なし, ignore} で。予告を無視すると毎夜（90% 以上）不調になり、不調なしより 5〜16 点沈む。ignore の不変も（従う台本は tests/pt-sim-engine-a2）。
import { describe } from 'vitest';
import { ENGINE_SIM_FILES, itEngineCost } from './pt-sim-engine-kit';

describe('機関の不調の設計の帯（v0.6.5、spec-v065 §F.3: 最初から全速でまっすぐ帰る・無視の代価）', () => {
  itEngineCost('full（N 400・seed 1〜400）: 予告を無視すると毎夜（90% 以上）不調になり、不調なしより 5〜16 点沈む。赤い線の最中に不調が始まらない・予告から不調 12 秒以上・回復から次の不調 12 秒以上・不調は 8 秒まで・打ち切り 0・沈没 76% 以下・漂流は不調なし ＋ 0.5 点まで', ENGINE_SIM_FILES.a);
});
