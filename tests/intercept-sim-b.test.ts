// 迎撃の模擬（v0.8.0 S3。us_04「ブラケット海峡の夜」。spec-v0800 §4.11、lead の L23・L44・L48）の帯を軽い組で見る（ノーマル。ハードは tests/intercept-sim-c・-d）:
// N 50 × 2 組（seed 151〜200・1151〜1200）の 7 つの遊び方（S3c の F は radar_twice、漂流 D は 7 行の沈まない夜が 20% 以上の行を見るので全部）で、systems/intercept-calibration の帯
// （B1・B2a・B2b・B3〜B6・燃料 F・漂流 D）が ✗ 0。
// 軽い組の選び方: 表（scripts/intercept-sim の TABLE=2＝N 400 × 2 組）の 800 夜を 50 × 2 の 8 つの組（seed 1+50k〜50+50k・1001+50k〜1050+50k、k = 0〜7）に割り、
// 帯ごとの ✓/✗ を 800 夜の表と比べた（CHANGELOG v0.8.0 S3）。S3b・S3c の data では k = 0 の B1a が 33.0%（800 夜は 35.8%）で裏返るので、全部の帯で 800 夜と同じ ✓/✗ の組のうち
// 帯の端から一番遠い k = 3 にした（B1a 40.0%・F 25.2%・D 1.0%、ハードの H1 41.0%。800 夜の B1a は端から 0.8 点）。8 組の揺れは B1a 31〜41・H1 32〜45・F 25.0〜26.0・D 0〜2。
// 帯の端に寄った値は軽い組で裏返りうるので、つまみや帯を動かしたら 8 組をもう一度比べる。B6 は夜に依らない（固定の seed の 1 本の射撃）。本数（N 400 × 2 組）の帯は scripts/headless/g2.sh の US04=1。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { interceptB6, interceptBandChecks } from '../src/systems/intercept-calibration';
import { interceptNightSetup } from '../src/systems/intercept-sim-setup';
import { interceptFailed, interceptLightCells } from './intercept-sim-kit';

describe('迎撃の模擬の帯（軽い組 N 50 × 2・ノーマル）', () => {
  it('B1・B2a・B2b・B3〜B6・燃料 F・漂流 D が ✗ 0（7 つの遊び方）', () => {
    const checks = interceptBandChecks(interceptLightCells(false), false, interceptB6(gameData, interceptNightSetup(gameData, 1, false)));
    expect(checks.map((x) => x.id)).toEqual(['B1a', 'B1b', 'B1c', 'B2a', 'B2b', 'B3', 'B4', 'B5', 'B6', 'F', 'D']);
    expect(interceptFailed(checks)).toEqual([]);
  });
});
