// v0.8.1 S2（spec-v0810 §3.4 D-R1〜D-R3・§6 の S2「tests/radar-us06」、lead の L35）: us_06 の自艇のレーダー（so_late・自艇）の陸の反射に今の岸（coast の南＝y 3,000）が入る
// （systems/world-radar が core/strait-geometry の landLinesOf で作る。両岸の us_04 は今の線のまま）。今夜の揺らぎ（x ±150・y ±50）の seed 1〜40 のノーマル・ハードで:
// 出撃の最初の掃引に卯月（岸から 620 m 前後＝反射 300 m の外）が映り、空知丸（岸から 240 m 前後＝反射の内）は夜明けの後まで一度も映らない。岸の線が無ければ空知丸は映ってしまう（D-R2 の要）。
// v0.8.1 S2b（D-R3・L44）: ハードの駆潜艇 2 隻は小さい艇（RADAR_KIND_SMALL＝1,800 m）。出発点から今夜の揺らぎ込みで 1,978 m 以上なので最初の掃引に映らず、1,800 m の内なら映る（艦の 6,000 m ではない）。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { RADAR_KIND_SHIP, RADAR_KIND_SMALL } from '../src/core/radar';
import { landDist2, landLinesFromShores } from '../src/core/strait-geometry';
import { WorldRadar } from '../src/systems/world-radar';
import { buildWorldSetup } from '../src/systems/world-setup';
import { anchorKit, anchorStep, type AnchorKitWorld } from './anchor-world-kit';

const UZ = 0;
const SM = 1;
const radarOf = (w: AnchorKitWorld, coast = w.setup.mission.coast !== null): WorldRadar => new WorldRadar(w.setup.radar!, w.setup.mission.bounds, w.setup.shores, w.destroyers.ships.length, null, '', coast);
const q = (w: AnchorKitWorld, v: number): number => Math.round(v / w.setup.radar!.positionStepM) * w.setup.radar!.positionStepM;
const blipAt = (r: WorldRadar, x: number, y: number): boolean => r.state.blips.slice(0, r.state.n).some((b) => b.x === x && b.y === y);
/** so_late の小さい艇の距離（1,800 m） */
const w0SmallRange = (): number => anchorKit().setup.radar!.smallRangeM;

describe('us_06 のレーダーと泊地（今夜の揺らぎ seed 1〜40）', () => {
  it('data: so_late（艦 6,000 m・小さい艇 1,800 m・反射 300 m・丸め 25 m）・岸の線は南の 1 本（切れ目なし）', () => {
    const w = anchorKit();
    const p = w.setup.radar!;
    expect([p.shipRangeM, p.smallRangeM, p.landClutterM, p.positionStepM]).toEqual([6000, 1800, 300, 25]);
    const r = radarOf(w);
    expect(r.geo.land.map((l) => [l.edge, l.y, l.spans.length])).toEqual([['south', 3000, 1]]);
  });
  for (const hard of [false, true]) {
    it(`${hard ? 'ハード' : 'ノーマル'}: 最初の掃引に卯月が映り（目の 900 m の外）、空知丸は夜明けの後まで一度も映らない`, () => {
      const smM: number[] = [];
      const uzM: number[] = [];
      for (let seed = 1; seed <= 40; seed++) {
        const w = anchorKit({ hard, seed, dawnS: 120 });
        expect(w.destroyers.ships.length, `seed ${seed}`).toBe(hard ? 4 : 2); // S2b からハードは駆潜艇 2 隻が輸送船の後ろ
        const r = radarOf(w);
        const uz0 = { ...w.destroyers.ships[UZ]!.state };
        const sm = w.destroyers.ships[SM]!.state;
        const sm0 = { ...sm };
        expect(landDist2(r.geo.land, uz0.x, uz0.y), `seed ${seed}`).toBeGreaterThan(300 ** 2);
        expect(landDist2(r.geo.land, sm.x, sm.y), `seed ${seed}`).toBeLessThan(300 ** 2);
        const [smx, smy] = [q(w, sm.x), q(w, sm.y)];
        let first = true;
        let smSeen = 0;
        // 掃引は敵の側の段の最後（world-enemy-step の最後の行＝艦を動かした後）。kit の 1 ステップの後に同じ時計で回す
        while (w.stepTimeS < 200) {
          anchorStep(w);
          const before = r.state.sweeps;
          r.step(w);
          if (r.state.sweeps === before) continue;
          if (first) {
            expect(blipAt(r, q(w, uz0.x), q(w, uz0.y)), `seed ${seed} 卯月`).toBe(true);
            expect(Math.hypot(uz0.x - w.boat.state.x, uz0.y - w.boat.state.y), `seed ${seed}`).toBeGreaterThan(900);
            first = false;
          }
          if (blipAt(r, smx, smy)) smSeen++;
          if (!hard || !w.dawn.reached) expect(r.state.n, `seed ${seed} t ${w.stepTimeS}`).toBeLessThanOrEqual(1); // ハードの夜明けの後は東へ退く駆潜艇が出発点の 1,800 m の内を通りうる
        }
        expect(first, `seed ${seed}`).toBe(false);
        expect(smSeen, `seed ${seed} 空知丸`).toBe(0);
        expect([sm.x, sm.y]).toEqual([sm0.x, sm0.y]);
        expect(w.destroyers.ships[UZ]!.state.x, `seed ${seed} 夜明けに東へ`).toBeGreaterThan(uz0.x);
        smM.push(3000 - sm0.y);
        uzM.push(3000 - uz0.y);
      }
      // spec §3.1 D-M4: 岸の線まで空知丸 190〜290 m（反射の内）・卯月 570〜670 m（外）。40 夜で両端に近い夜もある
      expect([Math.min(...smM) >= 190, Math.max(...smM) <= 290, Math.min(...uzM) >= 570, Math.max(...uzM) <= 670]).toEqual([true, true, true, true]);
      expect(new Set(smM).size).toBeGreaterThan(20); // 揺らぎが効いている
    });
  }
  it('ハードの駆潜艇（S2b）: 隊の種類は小さい艇で、出発点から 1,978 m 以上＝最初の掃引に映らない（seed 1〜40）。1,800 m の内なら小さい艇として映り、1,850 m では映らない', () => {
    let minM = Infinity;
    for (let seed = 1; seed <= 40; seed++) {
      const w = anchorKit({ hard: true, seed });
      const g = w.destroyers;
      expect([g.picketIndex, g.picketCount, [0, 1, 2, 3].map((i) => g.radarKindAt(i))], `seed ${seed}`).toEqual([2, 2, [RADAR_KIND_SHIP, RADAR_KIND_SHIP, RADAR_KIND_SMALL, RADAR_KIND_SMALL]]);
      const b = w.boat.state;
      for (const i of [2, 3]) minM = Math.min(minM, Math.hypot(g.ships[i]!.state.x - b.x, g.ships[i]!.state.y - b.y));
      const r = radarOf(w);
      while (r.state.sweeps === 0) {
        anchorStep(w);
        r.step(w);
      }
      for (const i of [2, 3]) expect(blipAt(r, q(w, g.ships[i]!.state.x), q(w, g.ships[i]!.state.y)), `seed ${seed} 駆潜艇 ${i}`).toBe(false);
      expect(r.state.n, `seed ${seed}`).toBe(1); // 卯月だけ
      // 自艇を駆潜艇の真北へ（止まっていれば見つかる 480 m の外）: 1,850 m では映らず、1,700 m で映る
      for (const i of [2, 3]) {
        const p = g.ships[i]!.state;
        for (const [m, seen] of [[1850, false], [1700, true]] as const) {
          Object.assign(b, { x: p.x, y: p.y - m });
          const before = r.state.sweeps;
          while (r.state.sweeps === before) {
            anchorStep(w);
            r.step(w);
          }
          expect(blipAt(r, q(w, p.x), q(w, p.y)), `seed ${seed} 駆潜艇 ${i} ${m} m`).toBe(seen);
        }
      }
      expect(g.ships.map((d) => d.anchored), `seed ${seed}`).toEqual([true, true, true, true]); // 誰も気づいていない（1,700 m は見つかる距離の外）
    }
    expect(minM).toBeGreaterThanOrEqual(1977.9); // V-A4（揺らぎの矩形の隅で 1,978 m）
    expect(minM).toBeGreaterThan(w0SmallRange());
  });
  it('岸の線が無ければ（v0.8.0 の作り＝両岸からだけ）空知丸は最初の掃引に映ってしまう（D-R2 の要）', () => {
    const w = anchorKit();
    const r = radarOf(w, false);
    expect(r.geo.land).toEqual([]);
    r.step({ stepTimeS: 1 / 60, boat: w.boat, destroyers: w.destroyers });
    const sm = w.destroyers.ships[SM]!.state;
    expect(blipAt(r, q(w, sm.x), q(w, sm.y))).toBe(true);
  });
  it('us_04（両岸）の陸の反射の線は今のまま（coast の旗を立てても両岸が先）', () => {
    const s = buildWorldSetup(gameData, 'us_04', {});
    const { width, height } = s.mission.bounds;
    const want = landLinesFromShores(s.shores!, width, height);
    for (const coast of [false, true, undefined]) expect(new WorldRadar(s.radar!, s.mission.bounds, s.shores, 4, null, '', coast).geo.land).toEqual(want);
    expect(s.mission.coast).toBe(null);
  });
});
