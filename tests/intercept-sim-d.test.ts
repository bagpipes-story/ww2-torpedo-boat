// 迎撃の模擬（v0.8.0 S3c。us_04。spec-v0800 §4.11、lead の L47・L48）の帯を軽い組で見る（ハードの後半。前半は tests/intercept-sim-c）: 同じ軽い組（seed 151〜200・
// 1151〜1200）の radar_dodge・charge・home_after_inbound のうち沈まない夜が 20% 以上の行の漂流 D が ✗ 0。
import { describe, expect, it } from 'vitest';
import { interceptBandChecks } from '../src/systems/intercept-calibration';
import { INTERCEPT_LIGHT_HARD_B, interceptFailed, interceptLightCells } from './intercept-sim-kit';

describe('迎撃の模擬の帯（軽い組 N 50 × 2・ハードの後半）', () => {
  it('漂流 D が ✗ 0（radar_dodge・charge・home_after_inbound）', () => {
    const checks = interceptBandChecks(interceptLightCells(true, INTERCEPT_LIGHT_HARD_B), true, null);
    expect(checks.map((x) => x.id)).toEqual(['D']);
    expect(interceptFailed(checks)).toEqual([]);
  });
});
