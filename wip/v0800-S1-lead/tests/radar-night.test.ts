// v0.8.0 S1（spec-v0800 §4.5 の表・§3.2 D-R2〜D-R7）: us_04 の揺らぎのない夜を、core/ship-transit（列の通過）・core/radar（掃引）・core/strait-geometry（両岸の陸の反射）だけで
// 理想の直線の動き（世界の写し。自艇は出発点で止まり、護衛は出発点で止まったまま＝AI は S2）で回し、レーダーの接触の数と出来事が表のとおり進むかを見る:
// 出撃の最初の掃引で北西 2,280 m の護衛（最初の接触）→ 西の縁に往路の 3 隻（新しい接触 3,620 m）→ 東の縁で消える（ビラ）→ 東の縁に復路の 3 隻（新しい接触 2,270 m）→ 西の縁で消える。
// 1 ステップの順は世界と同じ: 艦を動かす → 列の段階 → 現れた艦を置く → レーダー（敵の段の後）。レーダーに渡すのは位置と浮いているか（列は海域の中の艦だけ）。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { FIXED_STEP_S } from '../src/config/step-config';
import { RADAR_KIND_SHIP, createRadarState, createRadarTargets, radarSweepDue, stepRadar, type RadarGeometry } from '../src/core/radar';
import { TRANSIT_OUT, createShipTransit, stepShipTransit, transitOnMap } from '../src/core/ship-transit';
import { landLinesFromShores } from '../src/core/strait-geometry';
import { buildWorldSetup } from '../src/systems/world-setup';

const TS = gameData.hitRateModel.world.time_scale;

function night(hard: boolean): { counts: [number, number][]; news: number[][]; losts: number[][]; first: number[]; firstS: number } {
  const w = buildWorldSetup(gameData, 'us_04', { hard });
  const p = w.transit!;
  const { width, height } = w.mission.bounds;
  const geo: RadarGeometry = { width, height, land: landLinesFromShores(w.shores!, width, height) };
  const boat = w.mission.playerStart;
  const cover = w.mission.enemyStarts[0]!;
  const tr = createShipTransit(p);
  const ships = Array.from({ length: p.ships }, () => ({ state: { x: NaN }, sinking: false, dir: 0 }));
  const r = createRadarState();
  const tg = createRadarTargets(1 + p.ships);
  const counts: [number, number][] = [];
  const news: number[][] = [];
  const losts: number[][] = [];
  let now = 0;
  while (now < w.mission.durationS) {
    now += FIXED_STEP_S;
    for (let i = 0; i < p.ships; i++) if (transitOnMap(tr, i)) ships[i]!.state.x += ships[i]!.dir * p.speedMps * TS * FIXED_STEP_S;
    stepShipTransit(tr, p, FIXED_STEP_S, now, false, ships);
    for (let i = 0; i < p.ships; i++) {
      const sh = ships[i]!;
      if (tr.entered & (1 << i)) [sh.dir, sh.state.x] = [1, p.inbound.appearX];
      if (tr.returned & (1 << i)) [sh.dir, sh.state.x] = [-1, p.outbound.appearX];
    }
    if (!radarSweepDue(r, now)) continue;
    tg.n = 1 + p.ships;
    tg.x[0] = cover.x;
    tg.y[0] = cover.y;
    tg.kind[0] = RADAR_KIND_SHIP;
    tg.afloat[0] = 1;
    for (let i = 0; i < p.ships; i++) {
      tg.x[1 + i] = ships[i]!.state.x;
      tg.y[1 + i] = tr.phase[i] === TRANSIT_OUT ? p.outbound.laneY : p.inbound.laneY;
      tg.kind[1 + i] = RADAR_KIND_SHIP;
      tg.afloat[1 + i] = transitOnMap(tr, i) ? 1 : 0;
    }
    const before = [r.newCount, r.lostCount];
    stepRadar(r, w.radar!, geo, now, boat.x, boat.y, tg);
    if (counts.length === 0 || counts[counts.length - 1]![1] !== r.n) counts.push([now, r.n]);
    if (r.newCount > before[0]!) news.push([now, r.newX, r.newY]);
    if (r.lostCount > before[1]!) losts.push([now, r.lostX, r.lostY]);
  }
  return { counts, news, losts, first: [r.firstX, r.firstY, r.firstFromX, r.firstFromY], firstS: r.firstS };
}
const dist = (x: number, y: number): number => Math.hypot(x - 3600, y - 2600);

describe('us_04 の夜のレーダー（揺らぎなし・理想の直線の動き。spec §4.5）', () => {
  it('ノーマル: 接触 1 → 2 → 3 → 4（往路）→ 3 → 2 → 1（ビラ）→ 2 → 3 → 4（復路）→ 3 → 2 → 1（西へ去った）。変わる掃引の秒は 3 秒の刻み', () => {
    const n = night(false);
    expect(n.counts.map((c) => c[1])).toEqual([1, 2, 3, 4, 3, 2, 1, 2, 3, 4, 3, 2, 1]);
    expect(n.counts.slice(1).map((c) => Math.round(c[0]))).toEqual([18, 27, 36, 96, 102, 111, 138, 144, 153, 213, 222, 228]);
  });
  it('最初の接触は出撃の最初の掃引で北西 2,280 m の護衛。往路の新しい接触は西の縁（約 3,500〜3,620 m）、消えるのは東の縁。復路の新しい接触は東の縁（約 2,100〜2,270 m）、消えるのは西の縁', () => {
    const n = night(false);
    expect(n.firstS).toBeCloseTo(FIXED_STEP_S, 12);
    expect(n.first).toEqual([1800, 1200, 3600, 2600]);
    expect(dist(1800, 1200)).toBeCloseTo(2280.35, 1);
    expect(n.news.length).toBe(6);
    expect(n.news[0]!.slice(1)).toEqual([150, 1500]); // 先頭は掃引の秒（18）に現れた: 現れる点そのもの
    for (const [, x, y] of n.news.slice(0, 3)) expect([x! <= 350, y, dist(x!, y!) > 3450 && dist(x!, y!) < 3625]).toEqual([true, 1500, true]);
    for (const [, x, y] of n.news.slice(3)) expect([x! >= 5650, y, dist(x!, y!) > 2050 && dist(x!, y!) < 2275]).toEqual([true, 2300, true]);
    expect(n.losts.length).toBe(6);
    for (const [, x, y] of n.losts.slice(0, 3)) expect([x! >= 5800, y]).toEqual([true, 1500]);
    for (const [, x, y] of n.losts.slice(3)) expect([x! <= 200, y]).toEqual([true, 2300]);
  });
  it('ハード（列 4 隻）: 接触は 5 まで増え、同じ形で 1 に戻る', () => {
    expect(night(true).counts.map((c) => c[1])).toEqual([1, 2, 3, 4, 5, 4, 3, 2, 1, 2, 3, 4, 5, 4, 3, 2, 1]);
  });
});
