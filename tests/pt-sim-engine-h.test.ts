// 機関の不調の不変（v0.6.5。spec-v065 §F.3 の T-E1・T-E7。tests/pt-sim-engine-kit）: 全速で北の縁へ逃げて止まる（edge_flee）は帯の 7 台本のほかで唯一予告に届く（28〜29%・不調 0）。
// 従う台本（cool・cruise）はこの台本の速さを変えるので、その不変（漂流は不調なし ＋ 0.5 点まで）を N 400・seed 1〜400 で見る（レビュー F4。ignore は不調 0 なので不調なしと同じ夜＝T-E3）。
import { describe } from 'vitest';
import { ENGINE_SIM_EXTRA, itEngineInvariants } from './pt-sim-engine-kit';

describe('機関の不調の不変（v0.6.5、spec-v065 §F.3: 縁へ逃げて止まる・予告に従う）', () => {
  itEngineInvariants('edge_flee（N 400・seed 1〜400）: 予告に届き、cool・cruise とも赤い線の最中に不調が始まらない・予告から不調 12 秒以上・回復から次の不調 12 秒以上・不調は 8 秒まで・打ち切り 0・沈没 76% 以下・漂流は不調なし ＋ 0.5 点まで', ENGINE_SIM_EXTRA.h);
});
