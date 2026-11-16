// v0.8.0 実機 1 回目（2026-11-16）: ユーザー「見つかったあと隠れてたら、敵艦隊が陸地を突っ切って進んだようにみえる」「南の陸の遥か下から複数のサーチライトが向かってきた」。
// 艦は陸へ出ていない（ヘッドレスの台本 28 夜・模擬 1,400 夜で 0）。見えたのは探照灯の絵（3,000 m）が自艇を越えて陸の上まで伸びたもの＝岸の線で光を止める（core/strait-geometry の
// beamLengthToLand・systems/enemy-fire の setBeamLand。us_04 の両岸だけ）。あわせて予防: 列の通過の艦（退く動き＝縁で止めない）を南北の縁の内に止める（clampYToBounds。世界と模擬で同じ）。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { clampYToBounds } from '../src/core/boat-motion';
import { SimShip } from '../src/core/intercept-sim-world';
import { startRetire } from '../src/core/ship-ai';
import { beamLengthToLand, landLinesFromShores, type LandLine } from '../src/core/strait-geometry';
import { interceptNightSetup } from '../src/systems/intercept-sim-setup';
import { buildWorldSetup } from '../src/systems/world-setup';
import { code } from './core-rules-kit';
import { SeededRng } from '../src/core/rng';

const us04 = buildWorldSetup(gameData, 'us_04', {});
const { width: W, height: H } = us04.mission.bounds;
const STRAIT: LandLine[] = landLinesFromShores(us04.shores!, W, H);
const R = 3000; // enemies.json の ijn_destroyer の searchlight.range_m（下で data と結ぶ）

describe('探照灯の光を岸の線で止める（beamLengthToLand）', () => {
  it('data: us_04 は 6,000 × 4,000 m・南の岸に切れ目（ファーガソン水道 x 700〜1,900）・探照灯は 3,000 m', () => {
    expect([W, H]).toEqual([6000, 4000]);
    expect(us04.shores!.south.gaps).toEqual([{ x0: 700, x1: 1900 }]);
    expect(us04.destroyer!.gunnery.searchlight.rangeM).toBe(R);
  });
  it('北の道の艦から南の岸のそばの自艇へ: 光は南の岸の線（y 4,000）で止まる（陸の上へ伸びない）。北へは y 0 で止まる', () => {
    expect(beamLengthToLand(STRAIT, 3000, 1500, 180, R)).toBeCloseTo(2500, 6);
    expect(beamLengthToLand(STRAIT, 3000, 2300, 180, R)).toBeCloseTo(1700, 6);
    expect(beamLengthToLand(STRAIT, 1000, 1500, 0, R)).toBeCloseTo(1500, 6);
  });
  it('斜め（北西 315°）は中心線が岸に当たる所まで。切れ目（水道）を通る光・陸の無い向き（東西）・岸より手前で尽きる光は射程のまま', () => {
    expect(beamLengthToLand(STRAIT, 3000, 1000, 315, R)).toBeCloseTo(1000 * Math.SQRT2, 6);
    expect(beamLengthToLand(STRAIT, 1300, 2000, 180, R)).toBe(R); // x 1,300 は切れ目の内
    expect(beamLengthToLand(STRAIT, 3000, 2000, 90, R)).toBe(R);
    expect(beamLengthToLand(STRAIT, 3000, 2000, 270, R)).toBe(R);
    expect(beamLengthToLand(STRAIT, 3000, 2000, 180, 1500)).toBe(1500);
  });
  it('岸の線の向こう（陸の上）の光源は 0。岸の線が無い（今の任務）なら射程のまま', () => {
    expect(beamLengthToLand(STRAIT, 1000, -10, 180, R)).toBe(0);
    expect(beamLengthToLand([], 3000, 1500, 180, R)).toBe(R);
  });
});

describe('列の通過の艦を南北の縁の内に止める（予防。世界と模擬で同じ）', () => {
  it('clampYToBounds は y だけ（x は縁の外でもそのまま）', () => {
    const s = { x: -50, y: -300, headingDeg: 0, speedMps: 10 };
    clampYToBounds(s, { width: W, height: H }, 118);
    expect([s.x, s.y]).toEqual([-50, 118]);
    s.y = H + 10;
    clampYToBounds(s, { width: W, height: H }, 118);
    expect(s.y).toBe(H - 118);
  });
  it('模擬の列の艦（退く動き）が北へ全速でも縁の余白の内に止まる。護衛（列でない）の退きは今のまま縁の外で退き終える', () => {
    const night = interceptNightSetup(gameData, 1, false);
    const bounds = night.bounds;
    const run = (transit: boolean): { y: number; withdrawn: boolean } => {
      const sh = new SimShip({ x: 3000, y: 300, headingDeg: 0 }, night.ship, night.transit.shipAi);
      sh.transitShip = transit;
      startRetire(sh.ai, 0);
      const far = { x: 3000, y: 3900, headingDeg: 0, speedMps: 0 };
      const rng = new SeededRng(1);
      for (let i = 0; i < 600 && !sh.out; i++) sh.step(night.stepS * night.timeScale, night.stepS, far, 0, 1, [], bounds, rng);
      return { y: sh.state.y, withdrawn: sh.withdrawn };
    };
    const col = run(true);
    expect(col.withdrawn).toBe(false);
    expect(col.y).toBe(night.ship.boundsMarginM);
    expect(run(false).withdrawn).toBe(true);
  });
  it('source: Destroyer.step と SimShip.step に同じ 1 行（列の艦だけ clampYToBounds）。探照灯を切るのは岸の線のある任務だけ（world-enemies が s.shores の時に 1 回）', () => {
    for (const f of ['src/entities/destroyer.ts', 'src/core/intercept-sim-world.ts']) expect(code(f), f).toMatch(/else if \(this\.transitShip\) clampYToBounds\(this\.state, (this\.)?bounds, this\.spec\.boundsMarginM\);/);
    expect(code('src/systems/world-enemies.ts')).toContain('if (destroyers && s.shores) destroyers.setBeamLand(landLinesFromShores(s.shores, mission.bounds.width, mission.bounds.height));');
    const ef = code('src/systems/enemy-fire.ts');
    expect(ef).toContain('if (this.beamLand) this.clipBeam(ship, light.bearingDeg);');
    expect(ef).toContain('if (rows === this.beamRows) return;'); // 行数が変わった時だけ setCrop（§7）
  });
});
