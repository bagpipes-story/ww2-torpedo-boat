// v0.8.2 S2（spec-v0820 §4.6 D-R1〜D-R3・§8 の S2「radar-us05」、lead の L24・L26）: us_05 の自艇のレーダー（so_late・自艇）が列だけの隊を今の読み方で映す（systems/world-radar は
// 確かめだけ＝変えない）。本物の DestroyerGroup（tests/column-world-kit）・本物の world-radar で、揺らぎなしと今夜の揺らぎ（seed 1〜20）の 270 秒:
// - 出撃 5〜7 秒に満潮（西の縁の内 150 m・道 y 2,800）が最初の接触（出発点 (4,200, 700) から約 4,560 m＝艦の 6,000 m の内）。前衛 4 → 本隊 3 の順に増え、海域の中の 7 隻はどれも
//   映る（道は北の岸から 1,650 m 以上・南の岸（東のカミギン島）から 1,050 m 以上＝陸の反射 300 m の外）。種類はみな艦（戦艦も駆逐艦も同じ輪）。東の縁の外へ去れば消え、戻らない。
// - 輝点は近い順・丸め 25 m・16 の枠の内（ハード 8 隻）。陸の線は北の 1 本と南の東の 1 本（カミギン島。x 4,800〜6,500）。
import { describe, expect, it } from 'vitest';
import { RADAR_KIND_SHIP } from '../src/core/radar';
import { landDist2 } from '../src/core/strait-geometry';
import { colRun, colWorld, type ColWorld } from './column-world-kit';

/** 掃引ごとの [秒, 輝点の数, 海域の中の艦の数（6,000 m の内）] */
function sweeps(w: ColWorld, untilS: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  let last = 0;
  const r = w.radar!;
  const range2 = w.setup.radar!.shipRangeM ** 2;
  colRun(w, untilS, () => {
    if (r.state.sweeps === last) return;
    last = r.state.sweeps;
    const b = w.boat.state;
    const onMap = w.destroyers.ships.filter((d) => !d.out && (d.state.x - b.x) ** 2 + (d.state.y - b.y) ** 2 <= range2 && d.state.x >= 0 && d.state.x <= w.setup.mission.bounds.width).length;
    out.push([r.state.lastSweepS, r.state.n, onMap]);
  });
  return out;
}

describe('us_05 のレーダーと片道の列', () => {
  it('data と陸の線: so_late（6,000・1,800・掃引 2 秒・反射 300・丸め 25）。北の岸 1 本と南の岸の東（カミギン島）。どの道も陸の反射の外', () => {
    const w = colWorld();
    const p = w.setup.radar!;
    expect([p.shipRangeM, p.smallRangeM, p.sweepS, p.landClutterM, p.positionStepM]).toEqual([6000, 1800, 2, 300, 25]);
    const lines = w.radar!.geo.land.map((l) => [l.edge, l.y, l.spans.map((s) => [s.x0, s.x1])]);
    expect(lines).toEqual([['north', 0, [[0, 6500]]], ['south', 4000, [[4800, 6500]]]]);
    const tr = w.setup.transit!;
    for (const dy of tr.laneDyM!) for (const x of [150, 3000, 6400]) expect(landDist2(w.radar!.geo.land, x, tr.inbound.laneY + dy)).toBeGreaterThan(p.landClutterM ** 2 + 1e5);
  });
  for (const hard of [false, true]) {
    it(`${hard ? 'ハード 8 隻' : 'ノーマル 7 隻'}: 最初の接触は 5〜7 秒の満潮・海域の中の艦はどれも映る・種類はみな艦・去れば消えて戻らない（揺らぎなしと seed 1〜20）`, () => {
      for (const seed of [undefined, ...Array.from({ length: 20 }, (_, i) => i + 1)]) {
        const w = colWorld({ hard, seed });
        const n = hard ? 8 : 7;
        expect(w.destroyers.total).toBe(n);
        expect(Array.from({ length: n }, (_, i) => w.destroyers.radarKindAt(i))).toEqual(Array(n).fill(RADAR_KIND_SHIP));
        const sw = sweeps(w, 270);
        const r = w.radar!.state;
        const tag = `seed ${seed}`;
        expect(r.firstS, tag).toBeGreaterThanOrEqual(seed === undefined ? 5 : 0);
        expect(r.firstS, tag).toBeLessThanOrEqual(seed === undefined ? 7 : 14);
        expect(Math.abs(r.firstX - 150), tag).toBeLessThanOrEqual(400); // 西の縁の内（今夜のずれ ±300 m の入りの秒＝現れる x は同じ・丸め）
        for (const [t, blips, onMap] of sw) expect(blips, `${tag} ${t}`).toBe(onMap);
        expect(Math.max(...sw.map((s) => s[1])), tag).toBeLessThanOrEqual(n);
        expect(sw[sw.length - 1]![1], tag).toBe(0); // 夜明けの前にみな東の縁の外へ去った
        // 増えた・減った回数: 増えるのは入る時だけ（戻らない）・減るのは去る時だけ
        let rising = true;
        let back = 0;
        for (let k = 1; k < sw.length; k++) if (sw[k]![1] < sw[k - 1]![1]) rising = false; else if (!rising && sw[k]![1] > sw[k - 1]![1]) back++;
        expect(back, tag).toBeLessThanOrEqual(1); // 本隊が入る間に前衛が去り始める重なりは 1 回まで（増えて減って増えてはしない）
      }
    });
  }
  it('輝点は近い順・丸め 25 m', () => {
    const w = colWorld();
    colRun(w, 110);
    const r = w.radar!.state;
    const b = w.boat.state;
    const d2 = r.blips.slice(0, r.n).map((x) => (x.x - r.fromX) ** 2 + (x.y - r.fromY) ** 2);
    expect(r.n).toBeGreaterThanOrEqual(6);
    for (let k = 1; k < d2.length; k++) expect(d2[k]!).toBeGreaterThanOrEqual(d2[k - 1]!);
    for (const x of r.blips.slice(0, r.n)) expect([x.x % 25, x.y % 25]).toEqual([0, 0]);
    expect([r.fromX, r.fromY]).toEqual([b.x, b.y]);
  });
  it('?debug&noradar の setup はレーダーの鍵ごと無い（世界はレーダーを作らない）', () => {
    expect(colWorld({ setup: { radarOff: true } }).radar).toBeNull();
  });
});
