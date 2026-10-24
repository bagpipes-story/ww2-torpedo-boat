// 機関の不調の設計の帯（v0.6.5。spec-v065 §F.3 の T-E5・T-E6・T-E1。tests/pt-sim-engine-kit・systems/pt-engine-calibration）: ずっと全速で線の間かわし続ける（flee_hold）で予告に従う台本を
// N 400・seed 1〜400 の {ignore, cool, cruise} で。静音へ落とせば不調の夜 30% 以下（線の間も全速なので冷やす隙が少ない）、巡航へ落としても無視より不調の夜が多くならず、どちらも無視より 3 点を超えて沈まない（無視の代価は tests/pt-sim-engine-e）。
import { describe } from 'vitest';
import { ENGINE_SIM_FILES, itEngineFollow } from './pt-sim-engine-kit';

describe('機関の不調の設計の帯（v0.6.5、spec-v065 §F.3: ずっと全速で線の間かわし続ける・予告に従う）', () => {
  itEngineFollow('flee_hold（N 400・seed 1〜400）: 静音へ落とせば不調の夜 30% 以下（線の間も全速なので冷やす隙が少ない）、巡航でも無視より少なく、従って 3 点を超えて損しない。cool・cruise とも赤い線の最中に不調が始まらない・予告から不調 12 秒以上・回復から次の不調 12 秒以上・不調は 8 秒まで・打ち切り 0・沈没 76% 以下・漂流は ignore ＋ 0.5 点まで', ENGINE_SIM_FILES.e);
});
