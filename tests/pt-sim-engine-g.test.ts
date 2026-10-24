// 機関の不調の設計の帯（v0.6.5。spec-v065 §F.3 の T-E1・T-E4〜T-E7。tests/pt-sim-engine-kit・systems/pt-engine-calibration）: 全速で逃げて 4 秒かわして撃つ（fleedodge_shoot）を
// N 400・seed 1〜400 の {不調なし, ignore, cool, cruise} で（1 回ずつ）。予告を無視すると毎夜（90% 以上）不調になるが、不調の 14 kt は 13mm が散りにくいので 4 点より楽にはならない。予告に従えば（静音へ落とせば不調の夜 15% 以下、巡航でも無視より少なく）3 点を超えて損しない。
import { describe } from 'vitest';
import { ENGINE_SIM_FILES, itEngine } from './pt-sim-engine-kit';

describe('機関の不調の設計の帯（v0.6.5、spec-v065 §F.3: 全速で逃げて 4 秒かわして撃つ（fleedodge_shoot））', () => {
  itEngine('fleedodge_shoot（N 400・seed 1〜400）: 予告を無視すると毎夜（90% 以上）不調になるが、不調の 14 kt は 13mm が散りにくいので 4 点より楽にはならない。静音へ落とせば不調の夜 15% 以下、巡航でも無視より少なく、従って 3 点を超えて損しない。ignore・cool・cruise とも赤い線の最中に不調が始まらない・予告から不調 12 秒以上・回復から次の不調 12 秒以上・不調は 8 秒まで・打ち切り 0・沈没 76% 以下・漂流は不調なし ＋ 0.5 点まで', ENGINE_SIM_FILES.g);
});
