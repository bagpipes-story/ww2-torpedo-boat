// 夜の哨戒機の出撃（v0.6.7。core/air-sortie。spec-v067 §C.2・§G.1）: 発見の隊形から空襲の core（凍結）を 1 波だけ始め直す。
// 受け渡し（方位 ± 10°・同じ距離・濃さ 1・位置 1 m 以内。PASS の 1,500 m と ORBIT の 900 m）・時間線（投下 6.94／9.14／11.34／13.54 秒、900 m から 0.97 秒で旋回）・
// 空中の爆弾 ≤ 1・F8（1 回の発見に 1 回の出撃・次の波は出ない）・R17（爆弾が空中なら false で何も変えない）・R5（SortieBase からの差はその出撃の分）・F6（乱数の回数）。
// 値は jp_02 の世界（buildWorldSetup の patrolAir。門番の値は tests/patrol-air の fixture と同じ）。
import { describe, expect, it, vi } from 'vitest';
import { gameData } from '../src/config/game-data';
import {
  AS_EV_IMPACT,
  AS_EV_RELEASE,
  AS_EV_WAVE,
  AS_INBOUND,
  AS_ORBIT,
  AS_RUN,
  bombInAir,
  createAirStrike,
  stepAirStrike,
  strikePose,
  type AirStrikeCheck,
  type AirStrikeState,
} from '../src/core/air-strike';
import { airSortieComplete, createSortieBase, restartAirSortie, sortieBombs, sortieDamage, sortieHits, type SortieBase } from '../src/core/air-sortie';
import type { BoatState, SpeedStep } from '../src/core/boat-motion';
import type { AircraftPose } from '../src/core/friendly';
import { PA_EV_FIND, PA_EV_HUNT, PA_ORBIT, PA_PASS, PA_SORTIE, createPatrolAir, patrolFindPose, stepPatrolAir, type PatrolState } from '../src/core/patrol-air';
import { SeededRng } from '../src/core/rng';
import { wrapDeg360 } from '../src/core/units';
import { buildWorldSetup } from '../src/systems/world-setup';
import { DT, hunting, runUntil, steps } from './patrol-air-kit';

const W = buildWorldSetup(gameData, 'jp_02');
const G = W.patrolAir!.gate;
const SP = W.patrolAir!.sortie;
const pose = (): AircraftPose => ({ dx: 0, dy: 0, headingDeg: 0, alpha: 0 });
/** 海域の中ほどに止まった艇（狙いを海域に収める効きが出ない所） */
const still = (): BoatState => ({ x: 3000, y: 2000, headingDeg: 225, speedMps: 0 });
const check = (b: BoatState): AirStrikeCheck => ({ player: b, playerSinking: false, escort: null, escortAfloat: false, cancel: false });

class CountingRng extends SeededRng {
  draws = 0;
  override next(): number {
    this.draws++;
    return super.next();
  }
}

/** 門番を発見まで回す: 最初の捜索（レーダー・止まっている）か、目の捜索（k = 1・帯 band） */
function found(band: SpeedStep, radar: boolean): PatrolState {
  const s = radar ? createPatrolAir() : hunting();
  expect(runUntil(s, G, PA_EV_FIND, band, 60)).not.toBeNaN();
  return s;
}

/** 出撃を始めて n 秒（出撃だけ。中断なし）。onStep は各ステップの後で、t は始めからの秒 */
function fly(st: AirStrikeState, b: BoatState, rng: SeededRng, seconds: number, onStep?: (ev: number, t: number) => void): void {
  const c = check(b);
  for (let k = 1; k <= steps(seconds); k++) {
    const ev = stepAirStrike(st, SP, c, rng, DT); // onStep?.(step(...)) だと onStep が無いとき step が呼ばれない
    onStep?.(ev, k * DT);
  }
}

describe('受け渡し: 発見の隊形と同じ方位・距離に濃さ 1 で出る（R10）', () => {
  it.each([
    ['接近（レーダー・1,500 m）', 'stop', true, PA_PASS, 1500],
    ['付近の捜索（静音・900 m）', 'silent', false, PA_ORBIT, 900],
  ] as const)('%s', (_n, band, radar, phase, rM) => {
    const g = found(band, radar);
    expect(g.findPhase).toBe(phase);
    expect(g.findR).toBeGreaterThan(rM - 6);
    expect(g.findR).toBeLessThanOrEqual(rM);
    const st = createAirStrike(SP);
    const base = createSortieBase();
    expect(restartAirSortie(st, SP, still(), g.findBearingDeg, g.findR, base)).toBe(true);
    expect(st.planes.length).toBe(2);
    for (let i = 0; i < 2; i++) {
      const pl = st.planes[i]!;
      expect(pl.phase).toBe(AS_INBOUND);
      expect(pl.bearingDeg).toBeCloseTo(wrapDeg360(g.findBearingDeg + SP.spawnOffsetsDeg[i]!), 9);
      expect(pl.r).toBe(g.findR);
      const a = strikePose(st, SP, i, pose());
      const b = patrolFindPose(g, SP.spawnOffsetsDeg[i]!, pose());
      expect(a.alpha).toBe(1);
      expect(Math.hypot(a.dx - b.dx, a.dy - b.dy)).toBeLessThan(1);
    }
    expect(SP.spawnOffsetsDeg.slice(0, 2)).toEqual([-10, 10]);
  });
  it('距離は [旋回の半径, spawn_m] に収める（門番は 600〜1,500 m でしか発見しない）', () => {
    const st = createAirStrike(SP);
    restartAirSortie(st, SP, still(), 56, 4000, createSortieBase());
    expect(st.planes[0]!.r).toBe(SP.spawnM);
    const s2 = createAirStrike(SP);
    restartAirSortie(s2, SP, still(), 56, 100, createSortieBase());
    expect(s2.planes[1]!.r).toBe(SP.runRadiusM);
  });
});

describe('時間線（発見 = 0）と空中の爆弾', () => {
  it('1,500 m から: 旋回に 2.92 秒・投下 6.94／9.14／11.34／13.54 秒（機 0・1・0・1）・空中の爆弾は 1 発まで・攻撃できる機は 2 機まで', () => {
    const st = createAirStrike(SP);
    restartAirSortie(st, SP, still(), 56, 1500, createSortieBase());
    const releases: number[] = [];
    const planes: number[] = [];
    const orbitAt = [Number.NaN, Number.NaN];
    fly(st, still(), new SeededRng(7), 25, (ev, t) => {
      if (ev & AS_EV_RELEASE) {
        releases.push(t);
        planes.push(st.bombs[st.lastRelease]!.plane);
      }
      for (let i = 0; i < 2; i++) if (st.planes[i]!.phase === AS_ORBIT && Number.isNaN(orbitAt[i]!)) orbitAt[i] = t;
      let air = 0;
      for (const b of st.bombs) if (b.active) air++;
      expect(air).toBeLessThanOrEqual(1);
    });
    expect(orbitAt[0]).toBeCloseTo(900 / SP.flightMps, 1);
    expect(orbitAt[0]).toBeCloseTo(2.92, 1);
    expect(releases.length).toBe(4);
    const want = [6.94, 9.14, 11.34, 13.54];
    for (let j = 0; j < 4; j++) {
      expect(Math.abs(releases[j]! - want[j]!), `${j}`).toBeLessThan(0.03);
      expect(releases[j]).toBeCloseTo(SP.firstRunS + j * SP.runGapS + SP.runS, 1);
    }
    expect([SP.firstRunS + SP.runS, SP.runS]).toEqual([expect.closeTo(6.94, 2), expect.closeTo(1.94, 2)]);
    expect(planes).toEqual([0, 1, 0, 1]);
    expect(airSortieComplete(st)).toBe(true);
    expect(st.bombsDropped).toBe(4);
  });
  it('900 m（付近の捜索の発見）から: 0.97 秒で旋回に着く', () => {
    const st = createAirStrike(SP);
    restartAirSortie(st, SP, still(), 146, 900, createSortieBase());
    let at = Number.NaN;
    fly(st, still(), new SeededRng(3), 3, (_ev, t) => {
      if (st.planes[0]!.phase === AS_ORBIT && Number.isNaN(at)) at = t;
    });
    expect(at).toBeCloseTo(300 / SP.flightMps, 1);
    expect(at).toBeCloseTo(0.97, 1);
  });
});

describe('R17・R5: 再出撃の false の道とこの出撃の分', () => {
  it('爆弾が空中なら false で何も変えない。落ちた後なら true（乱数は引かない）', () => {
    const st = createAirStrike(SP);
    const base = createSortieBase();
    const rng = new SeededRng(11);
    restartAirSortie(st, SP, still(), 56, 1500, base);
    let k = 0;
    const c = check(still());
    while (!(stepAirStrike(st, SP, c, rng, DT) & AS_EV_RELEASE)) k++;
    expect(k).toBeGreaterThan(steps(6));
    expect(bombInAir(st)).toBe(true);
    const snap = structuredClone(st);
    const baseSnap = { ...base };
    const spy = vi.spyOn(SeededRng.prototype, 'next');
    expect(restartAirSortie(st, SP, still(), 236, 1200, base)).toBe(false);
    expect(st).toEqual(snap);
    expect(base).toEqual(baseSnap);
    while (bombInAir(st)) stepAirStrike(st, SP, c, rng, DT);
    expect(restartAirSortie(st, SP, still(), 236, 1200, base)).toBe(true);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    expect([st.planes[0]!.phase, st.planes[0]!.r, base.bombs0]).toEqual([AS_INBOUND, 1200, 1]);
  });
  it('2 回の出撃: KPI は夜の累計、SortieBase からの差は 2 回目の分だけ（爆弾 4・命中・HP = 35 × 命中）', () => {
    const st = createAirStrike(SP);
    const base: SortieBase = createSortieBase();
    const rng = new SeededRng(5);
    restartAirSortie(st, SP, still(), 56, 1500, base);
    fly(st, still(), rng, 25);
    expect(airSortieComplete(st)).toBe(true);
    const hits1 = st.hitsPlayer;
    expect([sortieBombs(st, base), sortieHits(st, base), sortieDamage(st, base)]).toEqual([4, hits1, 35 * hits1]);
    expect(restartAirSortie(st, SP, still(), 146, 900, base)).toBe(true);
    expect([sortieBombs(st, base), sortieHits(st, base), sortieDamage(st, base), airSortieComplete(st)]).toEqual([0, 0, 0, false]);
    fly(st, still(), rng, 25);
    expect(airSortieComplete(st)).toBe(true);
    const hits2 = st.hitsPlayer - hits1;
    expect(hits1 + hits2).toBeGreaterThan(0); // 止まった艇には当たる（1 発 47.6%）
    expect([sortieBombs(st, base), sortieHits(st, base), sortieDamage(st, base)]).toEqual([4, hits2, 35 * hits2]);
    expect([st.waves, st.bombsDropped, st.hitsPlayer, st.damagePlayer, st.dodgeCount]).toEqual([2, 8, hits1 + hits2, 35 * (hits1 + hits2), 8]);
  });
});

describe('F8・F6: 世界の結び（門番 → 発見なら再出撃 → 出撃を進める。出撃の段でなければ中断＝次の波は出ない）', () => {
  /** 世界の順で seconds 秒。band は一定、艇は円を描いて走る（speedMps > 0 なら）。乱数は数える。命中は世界と同じく同じ系列で火災・機関を 2 回まで引く想定の数を足す */
  function world(seconds: number, band: SpeedStep, speedMps: number) {
    const g = createPatrolAir();
    const st = createAirStrike(SP);
    const base = createSortieBase();
    const rng = new CountingRng(23);
    const b: BoatState = { ...still(), speedMps };
    const c = check(b);
    let waveEv = 0;
    let releases = 0;
    let restartFalse = 0;
    let maxAttack = 0;
    for (let k = 0; k < steps(seconds); k++) {
      b.headingDeg = wrapDeg360(b.headingDeg + 6 * DT);
      b.x += Math.sin((b.headingDeg * Math.PI) / 180) * speedMps * DT * W.timeScale;
      b.y -= Math.cos((b.headingDeg * Math.PI) / 180) * speedMps * DT * W.timeScale;
      const ev = stepPatrolAir(g, G, band, false, airSortieComplete(st), DT);
      if (ev & PA_EV_FIND && !restartAirSortie(st, SP, b, g.findBearingDeg, g.findR, base)) restartFalse++;
      c.cancel = g.phase !== PA_SORTIE;
      const e = stepAirStrike(st, SP, c, rng, DT);
      if (e & AS_EV_WAVE) waveEv++;
      if (e & AS_EV_RELEASE) releases++;
      if (e & AS_EV_IMPACT) expect(g.phase === PA_SORTIE || ev & PA_EV_HUNT).toBeTruthy();
      let attack = 0;
      for (const pl of st.planes) if (pl.phase === AS_INBOUND || pl.phase === AS_ORBIT || pl.phase === AS_RUN) attack++;
      maxAttack = Math.max(maxAttack, attack);
    }
    return { g, st, rng, waveEv, releases, restartFalse, maxAttack };
  }
  it('止まった艇（レーダーの 1 回だけ）: 60 秒で出撃は 1 波・投下 4・次の波は出ない（中断が立つ）・以後の捜索は見つけない', () => {
    const r = world(60, 'stop', 0);
    expect([r.g.finds, r.st.waves, r.waveEv, r.releases, r.st.bombsDropped, r.restartFalse]).toEqual([1, 1, 1, 4, 4, 0]);
    expect(r.st.cancelled).toBe(true);
    expect(r.g.k).toBeGreaterThanOrEqual(2);
    expect(r.maxAttack).toBeLessThanOrEqual(2);
    expect(r.rng.draws).toBe(2 * r.st.bombsDropped);
  });
  it('全速で走り続ける艇（航跡）: 発見のたびに 1 波（来た波 = 発見）・投下は 1 波 4 発まで・再出撃は遅れない（F12）・+23 は投下ごとに 2 回', () => {
    const r = world(180, 'full', 15);
    expect(r.g.finds).toBeGreaterThanOrEqual(4);
    expect([r.st.waves, r.waveEv]).toEqual([r.g.finds, r.g.finds]);
    expect(r.st.bombsDropped).toBeLessThanOrEqual(4 * r.g.finds);
    expect(r.st.bombsDropped).toBeGreaterThanOrEqual(4 * (r.g.finds - 1));
    expect([r.restartFalse, r.g.findsVisual]).toEqual([0, r.g.finds - 1]);
    expect(r.maxAttack).toBeLessThanOrEqual(2);
    expect(r.rng.draws).toBe(2 * r.st.bombsDropped);
  });
});
