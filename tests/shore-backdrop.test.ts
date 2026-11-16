// v0.8.1 S1（spec-v0810 §3.3 D-B1〜D-B3・§3.4 D-R2・§6 の S1、lead の L22・L24）: 暗い岸を背に（core/strait-geometry の landBehind）と任務の岸の線（landLinesOf）。
// us_06 の本当の data（coast の南の線・shore_backdrop.behind_m 2,000・卯月と空知丸の出発点）で spec の位置の例、behind_m の ±1 m の境（真上からと斜め）、陸の区間の外（海域の東西の縁の先）、
// us_04 の北の岸と両岸（切れ目の水道の先は陸でない）、S と P が同じ・岸へ向かわない線、自艇が岸の線の上か向こう、平方根で解いた参照との一致、
// landLinesOf は両岸があれば landLinesFromShores と同じ線（us_04 は今のまま）・coast の南なら切れ目の無い 1 本・どちらも無ければ空。landBehind の本体に平方根・atan2・確保なし。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { getPrototypeMission } from '../src/config/mission-data';
import { landBehind, landLine, landLinesFromShores, landLinesOf, type LandLine } from '../src/core/strait-geometry';
import { buildWorldSetup } from '../src/systems/world-setup';
import { code, functionBodies } from './core-rules-kit';

const FILE = 'src/core/strait-geometry.ts';
const us06 = buildWorldSetup(gameData, 'us_06', {});
const M = getPrototypeMission(gameData, 'us_06'); // 今夜の揺らぎの前の位置（spec §3.1 D-M2）
const { width: W, height: H } = M.bounds;
const COAST: LandLine[] = landLinesOf(null, M.coast?.side === 'south', W, H);
const X = us06.backdrop!.behindM;
const X2 = us06.backdrop!.behindM2;
const UZUKI = M.enemyStart!;
const SORACHI = M.transport!.start;
const us04 = buildWorldSetup(gameData, 'us_04', {});
const { width: W4, height: H4 } = us04.mission.bounds;
const STRAIT: LandLine[] = landLinesOf(us04.shores!, false, W4, H4);

/** 参照（平方根あり）: S → P の単位ベクトルで P から先へ進み、陸の区間のある岸の線に当たるまでの距離（当たらなければ Infinity） */
function behindRef(lines: readonly LandLine[], sx: number, sy: number, px: number, py: number): number {
  const len = Math.hypot(px - sx, py - sy);
  if (len === 0) return Infinity;
  const ux = (px - sx) / len;
  const uy = (py - sy) / len;
  let best = Infinity;
  for (const l of lines) {
    const toward = uy * l.landSide;
    if (toward <= 0) continue;
    const d = Math.max(0, (l.y - py) * l.landSide) / toward;
    const x = px + ux * d;
    if (l.spans.some((s) => x >= s.x0 && x <= s.x1)) best = Math.min(best, d);
  }
  return best;
}

describe('us_06 の岸と spec §3.3 D-B3 の位置の例（behind_m 2,000）', () => {
  it('岸の線は coast の南の 1 本・切れ目なし（y 3,000・陸は x 0〜6,000）。値は data の shore_backdrop（2,000 m・係数 0.6）', () => {
    expect(COAST).toEqual([landLine('south', W, H, [])]);
    expect(COAST.map((l) => [l.edge, l.y, l.landSide, l.spans])).toEqual([['south', 3000, 1, [{ x0: 0, x1: 6000 }]]]);
    expect([X, X2, us06.backdrop!.detectFactor]).toEqual([2000, 4_000_000, 0.6]);
    expect([UZUKI.x, UZUKI.y, SORACHI.x, SORACHI.y]).toEqual([3620, 2380, 3000, 2760]);
  });
  it('卯月から: 真南の浜 (3620, 2900) は背に岸（100 m 後ろ）・北の海 (3620, 1500) は無し・浜沿い (4400, 2850) は背に岸（291 m 後ろ）', () => {
    expect(landBehind(COAST, UZUKI.x, UZUKI.y, 3620, 2900, X2)).toBe(true);
    expect(behindRef(COAST, UZUKI.x, UZUKI.y, 3620, 2900)).toBeCloseTo(100, 9);
    expect(landBehind(COAST, UZUKI.x, UZUKI.y, 3620, 1500, X2)).toBe(false);
    expect(behindRef(COAST, UZUKI.x, UZUKI.y, 3620, 1500)).toBe(Infinity);
    expect(landBehind(COAST, UZUKI.x, UZUKI.y, 4400, 2850, X2)).toBe(true);
    expect(behindRef(COAST, UZUKI.x, UZUKI.y, 4400, 2850)).toBeCloseTo(290.6, 1);
  });
  it('空知丸から浜沿い (4400, 2850) は無し: 浅い角度の線は岸の線まで 2,338 m（X の外）で、当たる x 6,733 も海域の東の縁の先（陸の区間の外）', () => {
    expect(landBehind(COAST, SORACHI.x, SORACHI.y, 4400, 2850, X2)).toBe(false);
    expect(behindRef([landLine('south', 1e6, H, [])], SORACHI.x, SORACHI.y, 4400, 2850)).toBeCloseTo(2338.15, 2); // 陸が東へ続くとしても X の外
    expect(behindRef(COAST, SORACHI.x, SORACHI.y, 4400, 2850)).toBe(Infinity);
    expect(landBehind([landLine('south', 1e6, H, [])], SORACHI.x, SORACHI.y, 4400, 2850, X2)).toBe(false);
  });
  it('behind_m の境（±1 m・ちょうどは含む）: 真上の艦から（後ろ ＝ 岸の線までの y）と、45° の線から', () => {
    for (const [d, want] of [[X - 1, true], [X, true], [X + 1, false]] as const) expect(landBehind(COAST, 3000, 300, 3000, H - d, X2), String(d)).toBe(want);
    for (const [d, want] of [[X - 1, true], [X + 1, false]] as const) {
      const a = d / Math.SQRT2;
      const p = [2000, H - a] as const;
      expect(behindRef(COAST, p[0] - 300, p[1] - 300, p[0], p[1])).toBeCloseTo(d, 6);
      expect(landBehind(COAST, p[0] - 300, p[1] - 300, p[0], p[1], X2), String(d)).toBe(want);
    }
  });
  it('陸の区間の外: 当たる点が海域の東西の縁の先なら無し（X の内でも）。縁ちょうど（x 6,000）は陸', () => {
    expect(landBehind(COAST, 5450, 2850, 5950, 2900, X2)).toBe(false); // 当たる x 6,950・後ろ 1,005 m
    expect(landBehind(COAST, 550, 2850, 50, 2900, X2)).toBe(false); // 当たる x −950
    expect(landBehind(COAST, 4500, 2850, 5000, 2900, X2)).toBe(true); // 当たる x 6,000 ちょうど
  });
  it('S と P が同じ・岸へ向かわない線（真横・沖へ）は無し。自艇が岸の線の上か向こうなら真後ろの陸（自艇の x）', () => {
    expect(landBehind(COAST, 3000, 2950, 3000, 2950, X2)).toBe(false);
    expect(landBehind(COAST, 2000, 2900, 3000, 2900, X2)).toBe(false);
    expect(landBehind(COAST, 3000, 2900, 3000, 2800, X2)).toBe(false);
    expect([landBehind(COAST, 3000, 2500, 3000, 3000, X2), landBehind(COAST, 3000, 2500, 3000, 3010, X2), landBehind(COAST, 3000, 2500, 7000, 3010, X2)]).toEqual([true, true, false]);
  });
  it('岸の線が無ければ無し（landLinesOf の空）', () => {
    expect(landLinesOf(null, false, W, H)).toEqual([]);
    expect(landBehind([], UZUKI.x, UZUKI.y, 3620, 2900, X2)).toBe(false);
  });
});

describe('北の岸と両岸（us_04 の setup.shores）', () => {
  it('landLinesOf は両岸があれば landLinesFromShores と同じ線（us_04 は今のまま。coastSouth が真でも両岸が先）', () => {
    expect(STRAIT).toEqual(landLinesFromShores(us04.shores!, W4, H4));
    expect(landLinesOf(us04.shores!, true, W4, H4)).toEqual(STRAIT);
    expect(STRAIT.map((l) => [l.edge, l.y, l.spans.length])).toEqual([['north', 0, 1], ['south', 4000, 2]]);
  });
  it('北の岸（y 0・陸は y の小さい側）: 南の艦から北の自艇の向こうは陸、北の艦から南へは南の岸まで 3,000 m で無し', () => {
    expect(landBehind(STRAIT, 3000, 1000, 3000, 300, X2)).toBe(true);
    expect(landBehind(STRAIT, 3000, 300, 3000, 1000, X2)).toBe(false);
    expect(landBehind(STRAIT, 3000, 3000, 3000, 3700, X2)).toBe(true);
  });
  it('南の岸の切れ目（ファーガソン水道 x 700〜1,900）の先は陸でない。斜めに陸の区間へ当たれば背に岸', () => {
    expect(landBehind(STRAIT, 1300, 3000, 1300, 3800, X2)).toBe(false);
    expect(landBehind(STRAIT, 300, 2800, 1300, 3800, X2)).toBe(false); // 当たる x 1,500
    expect(landBehind(STRAIT, 3300, 3300, 1300, 3800, X2)).toBe(true); // 当たる x 500・後ろ 825 m
    expect(behindRef(STRAIT, 3300, 3300, 1300, 3800)).toBeCloseTo(824.6, 1);
  });
  it('平方根で解いた参照と一致（us_06 の岸と us_04 の両岸の格子。境の ±0.5 m は除く）', () => {
    let n = 0;
    for (const [lines, w, h] of [[COAST, W, H], [STRAIT, W4, H4]] as const) {
      for (let sx = 250; sx < w; sx += 1100) for (let sy = 150; sy < h; sy += 650) {
        for (let px = 100; px < w; px += 700) for (let py = 75; py < h; py += 410) {
          const d = behindRef(lines, sx, sy, px, py);
          if (Math.abs(d - X) < 0.5) continue;
          expect(landBehind(lines, sx, sy, px, py, X2), `${sx},${sy} → ${px},${py}`).toBe(d <= X);
          n++;
        }
      }
    }
    expect(n).toBeGreaterThan(4000);
  });
});

describe('source（landBehind は 2 乗の比べと割り算だけ）', () => {
  it('landBehind の本体に平方根・atan2・三角関数・確保の形が無く、割り算は 1 つだけ。landLinesOf は作る関数（起動時に 1 回）', () => {
    const body = functionBodies(code(FILE)).get('landBehind')!;
    expect(body).toBeDefined();
    expect(body).not.toMatch(/Math\.(sqrt|hypot|atan2|sin|cos|random)\b/);
    expect(body.match(/\//g)!.length).toBe(1);
    expect(body).not.toMatch(/\bnew\s|=>|`|\.\.\.|\[\s*\]/);
    expect(functionBodies(code(FILE)).get('landLinesOf')).toContain('landLinesFromShores(shores, width, height)');
  });
});
