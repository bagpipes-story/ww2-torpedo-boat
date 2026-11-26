// v0.8.5 S1（spec-v0850 §4.0・§4.2）: 機雷原の純粋な規則（core/minefield）と救助と機雷原の組み立て（core/rescue-field・seed+47）、V-X2（config/minefield-mission-data の checkMinefieldPlaceable）。
// 置き方の決定性（seed ごとに同じ点）・引く回数は難易度に依らず 2 × (12 ＋ 96) ＝ 216（v0.8.5 IP1 で機雷 32 → 64、IP4 で 96）・置かない所（水路・輪・出発・フィッチ・コリー・今夜の群・浅瀬 ＋ 80 m）・ハードはノーマルの 72 個を含む・
// seed 1〜32 でノーマルの 80% 以上を置ける・見える縁（150 m）・触雷の縁（半幅 ＋ 6 m）・1 ステップに 1 個・爆発は 1 回・沈んだ艇は触れない・被害の値・作る関数のほかの本体に確保なし。
import { describe, expect, it, vi } from 'vitest';
import { gameData, type GameData } from '../src/config/game-data';
import { getPrototypeMission } from '../src/config/mission-data';
import { MINEFIELD_GRID_STEP_M, MINEFIELD_PLACEABLE_SHARE, checkMinefieldPlaceable, getMinefieldParams, rescueFieldSite, validateMinefieldMissions } from '../src/config/minefield-mission-data';
import { getRescueParams } from '../src/config/rescue-mission-data';
import type { BoatState } from '../src/core/boat-motion';
import { MINE_BLOWN, MINE_END_REASON, MINE_HIDDEN, MINE_NONE, MINE_SEEN, createMinefield, layMines, mineHitSpec, minePlaceable, mineSlotField, minefieldFreeShare, stepMines } from '../src/core/minefield';
import { rollRescueField } from '../src/core/rescue-field';
import { SeededRng } from '../src/core/rng';
import { segDistM } from '../src/core/ally-geometry';
import { code, imports, scanAllocations } from './core-rules-kit';

type Rec = Record<string, unknown>;
const mission = (hard: boolean) => getPrototypeMission(gameData, 'us_07', hard);
const M = (hard: boolean) => getMinefieldParams(gameData, mission(hard))!;
const RS = getRescueParams(gameData, mission(false))!;
const HALF_L = 11.9;
const HALF_B = 3.05;
const roll = (seed: number, hard: boolean) => rollRescueField(seed, RS, M(hard), rescueFieldSite(mission(hard), RS), HALF_L);
const boat = (x: number, y: number, headingDeg = 0): BoatState => ({ x, y, headingDeg, speedMps: 10 });
const clone = (): GameData => JSON.parse(JSON.stringify(gameData)) as GameData;

describe('置き方（seed+47・core/rescue-field）', () => {
  it('枠の順: ノーマルの数を区画の順に（4・40・16・12。IP4）、その後にハードで足す数を区画の順に（3・11・5・5）。枠の外は −1', () => {
    const m = M(true);
    expect([0, 3, 4, 43, 44, 59, 60, 71, 72, 74, 75, 85, 86, 90, 91, 95, 96].map((k) => mineSlotField(m, k))).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 0, 0, 1, 1, 2, 2, 3, 3, -1]);
  });
  it('引く回数は難易度に依らず 2 × (群 12 ＋ 枠 96) ＝ 216（IP4。IP1 は 152）。seed ごとに同じ点（2 回の組み立てで同じ）', () => {
    for (const hard of [false, true]) {
      for (const seed of [1, 2, 12345]) {
        const spy = vi.spyOn(SeededRng.prototype, 'next');
        const a = roll(seed, hard);
        expect(spy.mock.calls.length, `${seed} ${hard}`).toBe(216);
        spy.mockRestore();
        const b = roll(seed, hard);
        expect([Array.from(b.mines!.x), Array.from(b.mines!.y), Array.from(b.mines!.state), Array.from(b.rescue.gx)]).toEqual([Array.from(a.mines!.x), Array.from(a.mines!.y), Array.from(a.mines!.state), Array.from(a.rescue.gx)]);
      }
    }
    expect(Array.from(roll(1, false).mines!.x)).not.toEqual(Array.from(roll(2, false).mines!.x));
  });
  it('ハードはノーマルの 72 個を含む（どの枠も同じ点。ノーマルは 73 枠目から置かない。IP4）。群の位置も難易度で同じ', () => {
    for (let seed = 1; seed <= 16; seed++) {
      const n = roll(seed, false);
      const h = roll(seed, true);
      expect(Array.from(n.mines!.x)).toEqual(Array.from(h.mines!.x));
      expect(Array.from(n.rescue.gx)).toEqual(Array.from(h.rescue.gx));
      for (let k = 0; k < 96; k++) {
        if (k >= 72) expect(n.mines!.state[k]).toBe(MINE_NONE);
        else expect(n.mines!.state[k]).toBe(h.mines!.state[k]);
      }
    }
  });
  it('置かない所: 置いた機雷はみな区画の内で、水路の帯（幅の半分 ＋ 80 m）・帰投の輪・出発・フィッチの輪・コリー・今夜の群（＋ 80 m）・浅瀬（＋ 80 m）の外（seed 1〜32 × 難易度）', () => {
    const site = rescueFieldSite(mission(false), RS);
    for (const hard of [false, true]) {
      const m = M(hard);
      for (let seed = 1; seed <= 32; seed++) {
        const f = roll(seed, hard);
        const st = f.mines!;
        for (let k = 0; k < st.max; k++) {
          if (st.state[k] === MINE_NONE) continue;
          const x = st.x[k]!;
          const y = st.y[k]!;
          const fd = m.fields[mineSlotField(m, k)]!;
          expect(x >= fd.x && x <= fd.x + fd.w && y >= fd.y && y <= fd.y + fd.h).toBe(true);
          for (const l of m.lanes) expect(segDistM(x, y, l.x0, l.y0, l.x1, l.y1)).toBeGreaterThan(l.widthM / 2 + 80);
          const far = (cx: number, cy: number, r: number): boolean => Math.hypot(x - cx, y - cy) > r + 80;
          expect([far(site.returnRing.x, site.returnRing.y, site.returnRing.radiusM), far(site.start.x, site.start.y, 0), far(RS.fitch.x, RS.fitch.y, RS.fitch.ringM), far(RS.corry.x, RS.corry.y, 0)]).toEqual([true, true, true, true]);
          for (let g = 0; g < f.rescue.n; g++) expect(far(f.rescue.gx[g]!, f.rescue.gy[g]!, 0)).toBe(true);
          for (const s of site.shallows) expect(x < s.x - 80 || x > s.x + s.w + 80 || y < s.y - 80 || y > s.y + s.h + 80).toBe(true);
        }
      }
    }
  });
  it('V-X2: seed 1〜32 でノーマルの数の 80% 以上（ハードもハードの数の 80% 以上）を置ける。IP1 の広い帯は水路の余白に掛かるので全部は置けない（IP4 の 4 区画で平均 ノーマル 64.19・ハード 85.22。IP1 は 44.41・59.31）', () => {
    const sum = [0, 0];
    for (const hard of [false, true]) {
      for (let seed = 1; seed <= 32; seed++) {
        const st = roll(seed, hard).mines!;
        expect(st.placed, `${seed} ${hard}`).toBeGreaterThanOrEqual(Math.ceil((hard ? 96 : 72) * MINEFIELD_PLACEABLE_SHARE));
        expect(st.placed).toBeLessThanOrEqual(hard ? 96 : 72);
        sum[hard ? 1 : 0]! += st.placed;
        let hidden = 0;
        for (let k = 0; k < st.max; k++) if (st.state[k] === MINE_HIDDEN) hidden++;
        expect(hidden).toBe(st.placed);
      }
    }
    expect(sum.map((x) => +(x / 32).toFixed(2))).toEqual([64.19, 85.22]);
  });
});

describe('V-X2 の起動時の検査（決まった格子）', () => {
  it('今の data: 区画の置ける割合（20 m の格子・群は ±ずれの対角を足した円。IP4 の西・東の近い帯・東の遠い帯・水路の弧の内）と置ける見込み（ノーマルの数の 80% 以上）。Boot の検査は通る', () => {
    const m = M(false);
    const shares = checkMinefieldPlaceable(mission(false), m, RS);
    expect(shares.map((s) => +s.toFixed(3))).toEqual([1, 0.981, 0.888, 0.582]);
    const expectN = m.fields.reduce((a, f, i) => a + f.normal * shares[i]!, 0);
    expect(expectN).toBeGreaterThanOrEqual(72 * MINEFIELD_PLACEABLE_SHARE);
    expect(MINEFIELD_GRID_STEP_M).toBe(20);
    expect(validateMinefieldMissions(gameData)?.count).toBe(72);
  });
  it('置ける所の無い区画（掃海済みの水路の上）・置ける見込みが 80% 未満（余白が広すぎる）は鍵を名指して止まる', () => {
    const onLane = clone();
    (((onLane.missionsSeed.missions as unknown as Rec[]).find((m) => m['id'] === 'us_07')!['v0_1_prototype'] as Rec)['minefield'] as Rec)['fields'] = [[4350, 1570, 100, 100, 6, 2], [3100, 2400, 1300, 900, 6, 2]]; // 1 つ目は出発 → フィッチの水路（IP1）の上
    expect(() => validateMinefieldMissions(onLane)).toThrow(/us_07\.v0_1_prototype\.minefield\.fields\[0\] に置ける所が無い.*V-X2/);
    const wide = clone();
    const wf = ((wide.missionsSeed.missions as unknown as Rec[]).find((m) => m['id'] === 'us_07')!['v0_1_prototype'] as Rec)['minefield'] as Rec;
    wf['clear_m'] = 600;
    const mw = getPrototypeMission(wide, 'us_07');
    const shares = getMinefieldParams(wide, mw)!.fields.map((_, f) => minefieldFreeShare(getMinefieldParams(wide, mw)!, { circles: [], rects: [] }, f, MINEFIELD_GRID_STEP_M));
    expect(shares.some((s) => s < 1)).toBe(true);
    expect(() => validateMinefieldMissions(wide)).toThrow(/V-X2/);
  });
  it('minePlaceable の縁: 水路の帯の幅の半分 ＋ 余白ちょうどは置けない・1 m 外は置ける', () => {
    const m = M(false);
    const l = m.lanes[0]!;
    const nx = -(l.y1 - l.y0);
    const ny = l.x1 - l.x0;
    const len = Math.hypot(nx, ny);
    const mx = (l.x0 + l.x1) / 2;
    const my = (l.y0 + l.y1) / 2;
    const at = (d: number): boolean => minePlaceable(m, { circles: [], rects: [] }, mx + (nx / len) * d, my + (ny / len) * d);
    expect([at(l.widthM / 2 + m.clearM - 1), at(l.widthM / 2 + m.clearM + 1)]).toEqual([false, true]);
  });
});

describe('見える・触雷', () => {
  const one = (): ReturnType<typeof createMinefield> => {
    const m = M(false);
    const st = createMinefield(m);
    st.state.fill(MINE_NONE);
    st.x[0] = 1000;
    st.y[0] = 1000;
    st.state[0] = MINE_HIDDEN;
    return st;
  };
  it('見える縁: 自艇の中心から 150 m の内（149.99 m）で見えた・150.01 m は隠れのまま。見えたまま（離れても）', () => {
    const m = M(false);
    const a = one();
    expect(stepMines(a, m, boat(1000 + 149.99, 1000), HALF_L, HALF_B, true)).toBe(-1);
    expect([a.state[0], a.seen, a.seenSeq, a.lastSeen]).toEqual([MINE_SEEN, 1, 1, 0]);
    stepMines(a, m, boat(4000, 1000), HALF_L, HALF_B, true);
    expect([a.state[0], a.seen]).toEqual([MINE_SEEN, 1]);
    const b = one();
    stepMines(b, m, boat(1000 + 150.01, 1000), HALF_L, HALF_B, true);
    expect([b.state[0], b.seen]).toEqual([MINE_HIDDEN, 0]);
  });
  it('触雷の縁: 艇首 0°（北）の艇の真横で半幅 ＋ 6 m の 0.01 m 内は爆発・0.01 m 外は爆発しない。艇首の先は半長 ＋ 半幅 ＋ 6 m', () => {
    const m = M(false);
    for (const [dx, dy, want] of [[HALF_B + 6 - 0.01, 0, 0], [HALF_B + 6 + 0.01, 0, -1], [0, -(HALF_L + HALF_B + 6 - 0.01), 0], [0, -(HALF_L + HALF_B + 6 + 0.01), -1]] as const) {
      const st = one();
      expect(stepMines(st, m, boat(1000 - dx, 1000 - dy), HALF_L, HALF_B, true), `${dx} ${dy}`).toBe(want);
      expect(st.state[0]).toBe(want === 0 ? MINE_BLOWN : MINE_SEEN);
    }
  });
  it('爆発は 1 回（同じ所に居ても次は −1）・見えずに触れても見えたに数える・沈んだ艇は触れず見もしない・1 ステップに 1 個', () => {
    const m = M(false);
    const st = one();
    st.x[1] = 1002;
    st.y[1] = 1000;
    st.state[1] = MINE_HIDDEN;
    const sunk = one();
    expect(stepMines(sunk, m, boat(1000, 1000), HALF_L, HALF_B, false)).toBe(-1);
    expect([sunk.state[0], sunk.seen, sunk.blown]).toEqual([MINE_HIDDEN, 0, 0]);
    expect(stepMines(st, m, boat(1000, 1000), HALF_L, HALF_B, true)).toBe(0);
    expect([st.state[0], st.state[1], st.seen, st.blown, st.blowSeq, st.lastBlown]).toEqual([MINE_BLOWN, MINE_SEEN, 2, 1, 1, 0]);
    expect(stepMines(st, m, boat(1000, 1000), HALF_L, HALF_B, true)).toBe(1);
    expect(stepMines(st, m, boat(1000, 1000), HALF_L, HALF_B, true)).toBe(-1);
    expect([st.blown, st.blowSeq, st.lastBlown, st.seen]).toEqual([2, 2, 1, 2]);
  });
  it('被害は risk_events の mine.params（60・火災 0.5・機関 0.5）を今の被弾の作法で。終わりの理由は mine', () => {
    const h = mineHitSpec(M(false));
    expect([h.damage, h.fireChance, h.engineDamageChance, MINE_END_REASON]).toEqual([60, 0.5, 0.5, 'mine']);
  });
});

describe('確保・import', () => {
  it('作る関数（createMinefield）のほかは本体に確保の形が無い。乱数は layMines の引数だけ（Math.random なし）・平方根・atan2 を使わない', () => {
    const { names, bad } = scanAllocations('src/core/minefield.ts', ['createMinefield']);
    expect(names).toEqual(['createMinefield', 'layMines', 'mineHitSpec', 'minePlaceable', 'mineSlotField', 'minefieldFreeShare', 'segDist2', 'stepMines']);
    expect(bad).toEqual([]);
    const s = code('src/core/minefield.ts');
    expect(imports(s).sort()).toEqual(['./boat-motion', './gunnery', './mission-flow', './rng', './shells']);
    expect(s).not.toMatch(/Math\.(sqrt|hypot|atan2|random)\b|new SeededRng/);
    const rf = code('src/core/rescue-field.ts');
    expect(rf.match(/new SeededRng\(/g)!.length).toBe(1);
    expect(rf).toContain('new SeededRng((seed + RESCUE_FIELD_SEED_OFFSET) >>> 0)');
  });
});
