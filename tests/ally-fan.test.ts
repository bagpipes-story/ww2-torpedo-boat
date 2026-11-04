// 卯月の見張りの扇の形（v0.6.10 S5a。ui/ally-fan。spec-v0610 LD15・LD16）: 原点（卯月）→ 弧（北 0・時計回りの扇の始めから終わり）を浜の線で切った多角形と、Boot が 1 回作る粗いテクスチャの箱。
// jp_04 の卯月は泊地の北東 (3620, 2380)・扇 50〜180°・速い見張り 800 m で、南の 800 m は浜の線（海域の南の縁 y 3000＝卯月の南 620 m）の向こうのレイテ島の陸なので切る。
import { describe, expect, it } from 'vitest';
import { ALLY_FAN_ARC_STEP_DEG, ALLY_FAN_TEX_M_PER_PX } from '../src/config/ally-config';
import { gameData } from '../src/config/game-data';
import { buildWorldSetup } from '../src/systems/world-setup';
import { allyFanFor, allyFanPolygon, allyFanShape } from '../src/ui/ally-fan';

const brg = (x: number, y: number): number => ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360;

describe('ui/ally-fan', () => {
  it('切らない扇: 原点 → 弧の n + 1 点（刻みは stepDeg 以下）。弧の端は扇の始めと終わりの方位・半径 r', () => {
    const p = allyFanPolygon(800, 50, 180, Infinity, 5);
    expect(p[0]).toEqual({ x: 0, y: 0 });
    expect(p.length).toBe(2 + 26);
    expect(brg(p[1]!.x, p[1]!.y)).toBeCloseTo(50, 9);
    expect(brg(p[p.length - 1]!.x, p[p.length - 1]!.y)).toBeCloseTo(180, 9);
    for (const q of p.slice(1)) expect(Math.hypot(q.x, q.y)).toBeCloseTo(800, 9);
  });
  it('浜の線で切る: どの点も y ≤ shoreDy、切った所は線の上に 2 点、線より北の弧の点はそのまま', () => {
    const full = allyFanPolygon(800, 50, 180, Infinity, 5);
    const cut = allyFanPolygon(800, 50, 180, 620, 5);
    for (const q of cut) expect(q.y).toBeLessThanOrEqual(620 + 1e-9);
    expect(cut.filter((q) => Math.abs(q.y - 620) < 1e-9).length).toBe(2);
    for (const q of full) if (q.y <= 620) expect(cut).toContainEqual(q);
    expect(cut.length).toBeLessThan(full.length);
  });
  it('テクスチャの形: 頂点は箱の内（px）、原点の割合は卯月の位置、1 px は mPerPx m', () => {
    const s = allyFanShape(800, 50, 180, 620, 5, 4);
    for (const q of s.points) {
      expect(q.x).toBeGreaterThanOrEqual(-1e-9);
      expect(q.y).toBeGreaterThanOrEqual(-1e-9);
      expect(q.x).toBeLessThanOrEqual(s.widthPx + 1e-9);
      expect(q.y).toBeLessThanOrEqual(s.heightPx + 1e-9);
    }
    // 原点（卯月）は多角形の最初の点: その px が原点の割合 × 大きさ
    expect(s.points[0]!.x).toBeCloseTo(s.originX * s.widthPx, 9);
    expect(s.points[0]!.y).toBeCloseTo(s.originY * s.heightPx, 9);
    expect(s.mPerPx).toBe(4);
  });
  it('jp_04（ノーマル・ハード）の卯月: 浜の線（海域の南の縁）の南を切った扇・テクスチャは小さい（1 辺 512 px 以下）・ノーマルとハードで同じ（絵は 1 枚＝V-A8）', () => {
    const shapes = [false, true].map((hard) => {
      const w = buildWorldSetup(gameData, 'jp_04', { hard, fuelGal: NaN });
      const p = w.allyDestroyer!;
      expect(w.mission.coast).not.toBeNull();
      const s = allyFanFor(p, true, w.mission.bounds.height);
      expect(s).toEqual(allyFanShape(p.lookFastM, p.arc0Deg, p.arc1Deg, w.mission.bounds.height - p.y, ALLY_FAN_ARC_STEP_DEG, ALLY_FAN_TEX_M_PER_PX));
      // 卯月の南の浜の線まで 620 m（< 800 m）なので切れる: 箱の下端は浜の線
      expect(w.mission.bounds.height - p.y).toBe(620);
      expect((1 - s.originY) * s.heightPx * s.mPerPx).toBeGreaterThanOrEqual(620);
      expect((1 - s.originY) * s.heightPx * s.mPerPx).toBeLessThan(620 + s.mPerPx);
      expect(Math.max(s.widthPx, s.heightPx)).toBeLessThanOrEqual(512);
      return s;
    });
    expect(shapes[1]).toEqual(shapes[0]);
  });
});
