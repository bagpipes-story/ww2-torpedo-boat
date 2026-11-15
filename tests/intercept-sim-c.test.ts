// 迎撃の模擬（v0.8.0 S3c。us_04「ブラケット海峡の夜」。spec-v0800 §4.11、lead の L47・L48）の帯を軽い組で見る（ハード。ノーマルは tests/intercept-sim-b。1 本の
// vitest のファイルを 30 秒の内に保つため、ハードの 7 つの遊び方は -c（radar_ambush・radar_twice・eye_only・idle_lane）と -d（radar_dodge・charge・home_after_inbound）に分けた）:
// 同じ軽い組（seed 151〜200・1151〜1200）で H1・H2（radar_ambush）と漂流 D（この 4 行のうち沈まない夜が 20% 以上の行）が ✗ 0。
import { describe, expect, it } from 'vitest';
import { interceptBandChecks } from '../src/systems/intercept-calibration';
import { INTERCEPT_LIGHT_HARD_A, interceptFailed, interceptLightCells } from './intercept-sim-kit';

describe('迎撃の模擬の帯（軽い組 N 50 × 2・ハードの前半）', () => {
  it('H1・H2・漂流 D が ✗ 0（radar_ambush・radar_twice・eye_only・idle_lane）', () => {
    const checks = interceptBandChecks(interceptLightCells(true, INTERCEPT_LIGHT_HARD_A), true, null);
    expect(checks.map((x) => x.id)).toEqual(['H1', 'H2', 'D']);
    expect(interceptFailed(checks)).toEqual([]);
  });
});
