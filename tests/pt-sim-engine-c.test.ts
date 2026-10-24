// 機関の不調の設計の帯（v0.6.5。spec-v065 §F.3 の T-E1・T-E4〜T-E7。tests/pt-sim-engine-kit・systems/pt-engine-calibration）: 見つかったら全速で逃げるだけ（★）（flee_full）を
// N 400・seed 1〜400 の {不調なし, ignore, cool, cruise} で（1 回ずつ）。予告を無視すると 55〜80% の夜で不調になり、2 点以上沈む（「逃げるだけなら簡単」への答え）。予告に従えば（静音へ落とせば不調の夜 5% 以下、巡航でも無視より少なく）3 点を超えて損しない。
import { describe } from 'vitest';
import { ENGINE_SIM_FILES, itEngine } from './pt-sim-engine-kit';

describe('機関の不調の設計の帯（v0.6.5、spec-v065 §F.3: 見つかったら全速で逃げるだけ（★）（flee_full））', () => {
  itEngine('flee_full（N 400・seed 1〜400）: 予告を無視すると 55〜80% の夜で不調になり、2 点以上沈む（「逃げるだけなら簡単」への答え）。静音へ落とせば不調の夜 5% 以下、巡航でも無視より少なく、従って 3 点を超えて損しない。ignore・cool・cruise とも赤い線の最中に不調が始まらない・予告から不調 12 秒以上・回復から次の不調 12 秒以上・不調は 8 秒まで・打ち切り 0・沈没 76% 以下・漂流は不調なし ＋ 0.5 点まで', ENGINE_SIM_FILES.c);
});
