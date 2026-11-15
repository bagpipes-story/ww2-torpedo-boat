// v0.8.0 S1（spec-v0800 §4.3・§4.9・§3.2 D-R4・§6 の S1）: core/strait-geometry の岸の線（切れ目＝水道を除いた陸の区間）・陸までの距離の 2 乗（岸の角も見る）・
// 衝突の危険（艦首が自艇へ ±15°・500 m の内。2 乗の距離と内積だけ）。us_04 の両岸（setup の shores）と、今の岸の形（南だけ・切れ目なし＝v0.8.1 の us_06）の両方で。
// 判定の本体に確保が無く、平方根・atan2・乱数を使わないことも source で見る。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { bowOnCos2, bowOnRisk, landDist2, landLine, landLinesFromShores, type LandLine } from '../src/core/strait-geometry';
import { buildWorldSetup } from '../src/systems/world-setup';
import { code, imports, scanAllocations } from './core-rules-kit';

const FILE = 'src/core/strait-geometry.ts';
const us04 = buildWorldSetup(gameData, 'us_04', {});
const { width: W, height: H } = us04.mission.bounds;
const STRAIT: LandLine[] = landLinesFromShores(us04.shores!, W, H);
const d = (x: number, y: number, lines: readonly LandLine[] = STRAIT): number => Math.sqrt(landDist2(lines, x, y));
const CLUTTER = 400; // hit_rate_model.json の radar.models.so_early.land_clutter_m（tests/radar が data と合わせる）

describe('岸の線（陸の区間＝海域の幅から切れ目を除く）', () => {
  it('us_04: 北は y 0・陸は y の小さい側で切れ目なし、南は y 4,000・陸はその外で x 700〜1,900 が切れ目（ファーガソン水道）', () => {
    expect([W, H]).toEqual([6000, 4000]);
    expect(STRAIT.map((l) => [l.edge, l.y, l.landSide, l.spans])).toEqual([
      ['north', 0, -1, [{ x0: 0, x1: 6000 }]],
      ['south', 4000, 1, [{ x0: 0, x1: 700 }, { x0: 1900, x1: 6000 }]],
    ]);
  });
  it('切れ目が縁に付く・いくつもある・全部が切れ目・無い（今の岸の形）', () => {
    expect(landLine('south', 6000, 3000, [{ x0: 0, x1: 300 }, { x0: 2000, x1: 2500 }, { x0: 5800, x1: 6000 }]).spans).toEqual([{ x0: 300, x1: 2000 }, { x0: 2500, x1: 5800 }]);
    expect(landLine('north', 6000, 3000, [{ x0: 0, x1: 6000 }]).spans).toEqual([]);
    expect(landLine('south', 6000, 3000, [])).toEqual({ edge: 'south', y: 3000, landSide: 1, spans: [{ x0: 0, x1: 6000 }] });
  });
});

describe('陸までの距離（2 乗。レーダーの陸の反射の帯）', () => {
  it('北の岸の真横は y、南の岸の真横は 4,000 − y（陸の区間の上）', () => {
    for (const x of [0, 1300, 3000, 6000]) expect(d(x, 300)).toBeCloseTo(300, 9);
    for (const x of [0, 650, 2500, 6000]) expect(d(x, 3700)).toBeCloseTo(300, 9);
    expect(landDist2(STRAIT, 3000, 399) < CLUTTER * CLUTTER && landDist2(STRAIT, 3000, 401) > CLUTTER * CLUTTER).toBe(true);
  });
  it('水道の切れ目の上は切れ目の両端の陸（岸の角）までの距離: 中ほどは遠く、端に寄れば近い', () => {
    expect(d(1300, 3900)).toBeCloseTo(Math.hypot(600, 100), 9); // 水道の中ほど・南の縁から 100 m でも陸から 608 m＝反射の外
    expect(d(1300, 4000)).toBeCloseTo(600, 9);
    expect(d(750, 3900)).toBeCloseTo(Math.hypot(50, 100), 9); // 切れ目の西の端の 50 m 内
    expect(d(1850, 3950)).toBeCloseTo(Math.hypot(50, 50), 9);
    expect(d(650, 3900)).toBeCloseTo(100, 9); // 切れ目の外（陸の区間の上）は線まで
    expect(d(1300, 3200)).toBeCloseTo(Math.hypot(600, 800), 9); // 水道の北では線の上の角と北の岸の近い方
  });
  it('線の向こう（陸の側）は線の上と同じ（陸の区間の上なら 0）・線が無いか陸が無ければ Infinity', () => {
    expect([landDist2(STRAIT, 3000, -10), landDist2(STRAIT, 3000, 4010)]).toEqual([0, 0]);
    expect(landDist2(STRAIT, 1300, 4010)).toBeCloseTo(600 * 600, 6);
    expect(landDist2([], 3000, 2000)).toBe(Infinity);
    expect(landDist2([landLine('north', 6000, 4000, [{ x0: 0, x1: 6000 }])], 3000, 10)).toBe(Infinity);
  });
  it('us_04 の往路と復路の道（y 1,500・2,300 ± 今夜の 150）・護衛の見回り（縁から 700 m の内）・出発点・帰投の輪の北は陸の反射の帯（400 m）の外（spec §4.3）', () => {
    const t = us04.transit!;
    const jy = us04.mission.night!.enemyJitterYM;
    for (let x = 0; x <= W; x += 50) {
      for (const y of [t.inbound.laneY - jy, t.inbound.laneY + jy, t.outbound.laneY - jy, t.outbound.laneY + jy, 700, H - 700]) expect(landDist2(STRAIT, x, y), `${x},${y}`).toBeGreaterThan(CLUTTER * CLUTTER);
    }
    expect(d(us04.mission.playerStart.x, us04.mission.playerStart.y)).toBeGreaterThan(CLUTTER);
    expect(d(us04.mission.returnPoint.x, us04.mission.returnPoint.y - us04.mission.returnPoint.radiusM)).toBeGreaterThan(CLUTTER);
  });
  it('今の岸の形（南だけ・切れ目なし＝v0.8.1 の us_06 が coast から作る）: 南の縁からの距離だけ', () => {
    const coast = [landLine('south', 6000, 3000, [])];
    for (const [x, y] of [[0, 2760], [3000, 2760], [3620, 2380], [6000, 100]] as const) expect(d(x, y, coast)).toBeCloseTo(3000 - y, 9);
  });
});

describe('衝突の危険（艦首が自艇へ半角 15° の内・500 m の内。境界は含む）', () => {
  const R2 = 500 * 500;
  const C2 = bowOnCos2(15);
  const at = (deg: number, m: number): [number, number] => [m * Math.cos((deg * Math.PI) / 180), m * Math.sin((deg * Math.PI) / 180)];
  it('cos²15° と、東向き（090°）の艦の前 ±14.9° は危険・±15.1° は危険でない・真後ろと真横は危険でない', () => {
    expect(C2).toBeCloseTo(Math.cos(Math.PI / 12) ** 2, 12);
    for (const a of [0, 14.9, -14.9]) expect(bowOnRisk(0, 0, 90, ...at(a, 400), R2, C2), String(a)).toBe(true);
    for (const a of [15.1, -15.1, 90, -90, 180]) expect(bowOnRisk(0, 0, 90, ...at(a, 400), R2, C2), String(a)).toBe(false);
  });
  it('距離: 500 m ちょうどは危険・500.01 m は危険でない・同じ点は危険', () => {
    expect([bowOnRisk(0, 0, 90, 500, 0, R2, C2), bowOnRisk(0, 0, 90, 500.01, 0, R2, C2), bowOnRisk(10, 20, 33, 10, 20, R2, C2)]).toEqual([true, false, true]);
  });
  it('針路の向き（0＝北＝y の小さい側・時計回り）と 0/360 の回り込み', () => {
    expect([bowOnRisk(0, 0, 0, 0, -300, R2, C2), bowOnRisk(0, 0, 0, 0, 300, R2, C2)]).toEqual([true, false]);
    expect([bowOnRisk(0, 0, 180, 0, 300, R2, C2), bowOnRisk(0, 0, 270, -300, 0, R2, C2), bowOnRisk(0, 0, 270, 300, 0, R2, C2)]).toEqual([true, true, false]);
    expect([bowOnRisk(0, 0, 359, 5, -300, R2, C2), bowOnRisk(0, 0, 1, -5, -300, R2, C2), bowOnRisk(0, 0, -10, 0, -300, R2, C2)]).toEqual([true, true, true]);
  });
  it('us_04 の復路の艦（270°）の進路の前にいる自艇は危険、進路の横 300 m（道から離れた）は危険でない', () => {
    const y = us04.transit!.outbound.laneY;
    expect(bowOnRisk(3900, y, 270, 3500, y + 20, R2, C2)).toBe(true);
    expect(bowOnRisk(3900, y, 270, 3500, y + 300, R2, C2)).toBe(false);
  });
});

describe('source（判定は確保しない・平方根も atan2 も乱数も使わない）', () => {
  it('作る関数（landLine・landLinesFromShores）のほかは本体に確保の形が無い。import は core/units だけ', () => {
    const { names, bad } = scanAllocations(FILE, ['landLine', 'landLinesFromShores']);
    expect(names).toEqual(['bowOnCos2', 'bowOnRisk', 'landDist2', 'landLine', 'landLinesFromShores']);
    expect(bad).toEqual([]);
    const s = code(FILE);
    expect(imports(s)).toEqual(['./units']);
    expect(s).not.toMatch(/Math\.(sqrt|hypot|atan2|random)\b|SeededRng|\brng\b/);
  });
});
