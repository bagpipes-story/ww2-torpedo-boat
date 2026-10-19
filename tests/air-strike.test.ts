// 夜明けの空襲（v0.6.1。core/air-strike・core/air-strike-data・config/dawn-data の getAirStrikeParams。spec §4・§10-3）
import { describe, expect, it } from 'vitest';
import { gameData, getPrototypeMission } from '../src/config/game-data';
import { playableMissionIds } from '../src/config/campaign-data';
import { getAirStrikeParams, getDawnStrikeEventRecord, getStrikeAircraftRecord } from '../src/config/dawn-data';
import { FIXED_STEP_S } from '../src/config/step-config';
import {
  AIR_STRIKE_SEED_OFFSET,
  AS_DONE,
  AS_EV_IMPACT,
  AS_EV_RELEASE,
  AS_EV_RUN,
  AS_EV_WAVE,
  AS_IDLE,
  AS_INBOUND,
  AS_LEAVING,
  AS_ORBIT,
  AS_OUTBOUND,
  AS_RUN,
  AS_T_NONE,
  airStrikeActive,
  createAirStrike,
  predictBoat,
  startAirStrike,
  stepAirStrike,
  strikePose,
  strikeThreat,
  type AirStrikeCheck,
  type AirStrikeParams,
  type AirStrikeState,
} from '../src/core/air-strike';
import { airStrikeParamsFromData } from '../src/core/air-strike-data';
import { clampToBounds, stepBoat, stepStraight, type BoatInput, type BoatState } from '../src/core/boat-motion';
import type { AircraftPose } from '../src/core/friendly';
import { NIGHT_SEED_OFFSET } from '../src/core/night';
import { SeededRng } from '../src/core/rng';
import { LOOKOUT_SEED_OFFSET } from '../src/core/ship-ai';
import { RAID_SEED_OFFSET } from '../src/core/sortie';
import { degToRad } from '../src/core/units';
import { buildWorldSetup } from '../src/systems/world-setup';

const DT = FIXED_STEP_S;
const P01 = buildWorldSetup(gameData, 'us_01').airStrike!;
const P06 = buildWorldSetup(gameData, 'jp_06').airStrike!;

/** next() を数える乱数（rng の消費の検査） */
class CountingRng extends SeededRng {
  draws = 0;
  override next(): number {
    this.draws++;
    return super.next();
  }
}

/** 海域の中ほど（us_01 6000×6000・jp_06 6000×4000 の両方の内側）。空襲の狙いは海域に収めるので、的は端から遠い所に置く（端は「端に押し付けた艇」） */
const CX = 3000;
const CY = 2000;
const boat = (x = 0, y = 0, headingDeg = 0, speedMps = 0): BoatState => ({ x: CX + x, y: CY + y, headingDeg, speedMps });
/** 原点の艇（predictBoat の解析解の検査） */
const at = (x: number, y: number, headingDeg: number, speedMps: number): BoatState => ({ x, y, headingDeg, speedMps });
const check = (player: BoatState, escort: BoatState | null = null): AirStrikeCheck => ({ player, playerSinking: false, escort, escortAfloat: escort !== null, cancel: false });

/** 始めてから seconds 秒、固定ステップで進める（onStep は各ステップの後。t はステップの終わりの秒） */
function run(p: AirStrikeParams, c: AirStrikeCheck, rng: SeededRng, seconds: number, onStep?: (s: AirStrikeState, ev: number, t: number) => void, before?: (t: number) => void): AirStrikeState {
  const s = createAirStrike(p);
  startAirStrike(s, p, c.player);
  const n = Math.round(seconds / DT);
  for (let k = 1; k <= n; k++) {
    before?.(k * DT);
    const ev = stepAirStrike(s, p, c, rng, DT);
    onStep?.(s, ev, k * DT);
  }
  return s;
}

/** 等速で旋回する艇（中点の向きで進める＝円弧とほぼ同じ）。yawDegS は deg/game 秒 */
function moveBoat(b: BoatState, yawDegS: number, dtG: number): void {
  const hm = degToRad(b.headingDeg + (yawDegS * dtG) / 2);
  b.x += Math.sin(hm) * b.speedMps * dtG;
  b.y -= Math.cos(hm) * b.speedMps * dtG;
  b.headingDeg += yawDegS * dtG;
}

describe('夜明けの空襲の値（core/air-strike-data の airStrikeParamsFromData。spec §4.1）', () => {
  it('us_01・us_03・jp_06 で組める（jp_06 の T-38 でも例外にならない＝夜の水上機の航跡の検査はしない）。値は spec §4.1', () => {
    for (const p of [P01, P06]) {
      expect([p.planes, p.bombsPerPlane, p.poolSize]).toEqual([4, 2, 2]);
      expect(p.flightMps).toBeCloseTo(308.64, 1);
      expect(p.runS).toBeCloseTo(1.944, 3);
      expect(p.fallGameS).toBeCloseTo(6.386, 3);
      expect(p.fallFeelS).toBeCloseTo(1.277, 3);
      expect(p.scatterM).toBeCloseTo(45.25, 2);
      expect(p.orbitDegPerS).toBeCloseTo(29.47, 2);
      expect([p.fromBearingDeg, p.fromJa, p.firstRunS, p.runGapS, p.waveRestS, p.leaveS, p.aimTurnMinDegS, p.timeScale]).toEqual([90, '東', 12, 3, 28, 2.5, 0.5, 5]);
      expect(p.bombHit).toEqual({ damage: 35, fireChance: 0.3, engineDamageChance: 0.2 });
      expect(p.playerHitRadiusM).toBeGreaterThan(25);
    }
    expect(P01.nameJa).toBe('零式水上観測機');
    expect(P06.nameJa).toBe('米艦載機（F6F 相当）');
    expect(P01.escortPlanes).toEqual([false, true, false, true]); // 2・4 番機は僚艇（要人）へ
    expect(P06.escortPlanes).toEqual([false, false, false, false]);
    expect(P01.escortHitRadiusM).toBeGreaterThan(25);
    expect([P06.escortHalfLengthM, P06.escortHitRadiusM]).toEqual([0, 0]);
    expect(buildWorldSetup(gameData, 'jp_06', { hard: true }).airStrike).not.toBeNull();
    // 狙いを収める海域と余白は世界の clampToBounds と同じ（自艇は world の boundsMarginM、僚艇は僚艇の boundsMarginM。僚艇のいない任務は 0）
    for (const id of ['us_01', 'jp_06']) {
      const w = buildWorldSetup(gameData, id);
      const p = w.airStrike!;
      expect([p.boundsW, p.boundsH, p.playerMarginM, p.escortMarginM], id).toEqual([w.mission.bounds.width, w.mission.bounds.height, w.boundsMarginM, w.escort ? w.escort.boundsMarginM : 0]);
    }
    expect(P01.escortMarginM).toBeGreaterThan(0);
    expect(P06.playerMarginM).toBeGreaterThan(0);
    // 空襲の無い任務と ?debug&nostrike は null（今夜の揺らぎ absent() は通さない）
    expect(buildWorldSetup(gameData, 'us_02').airStrike).toBeNull();
    // us_03 は v0.6.1 の実機 1 回目から空襲あり（零観・西から・僚艇なし・砲の任務でも組める）
    const p03 = buildWorldSetup(gameData, 'us_03').airStrike!;
    expect([p03.planes, p03.fromBearingDeg, p03.fromJa, p03.nameJa, p03.boundsH]).toEqual([4, 270, '西', '零式水上観測機', 2500]);
    expect(p03.escortPlanes).toEqual([false, false, false, false]);
    expect(buildWorldSetup(gameData, 'us_01', { strikeOff: true }).airStrike).toBeNull();
  });

  it('悪い値はそれぞれ例外（機数 5・高度 0・間隔 ≤ 落下・最初の進路 < 旋回に着く秒・機数 × 間隔 < 2 × 進路・波の合間 < 進路 + 去る・僚艇の番号）', () => {
    const pete = getStrikeAircraftRecord(gameData, 'ijn_f1m2_pete', 'us_01');
    const ev = getDawnStrikeEventRecord(gameData);
    const block = getPrototypeMission(gameData, 'us_01').dawnStrike!;
    const hull = { halfLengthM: 11.75, halfBeamM: 3, boundsMarginM: 12 };
    const sea = { width: 6000, height: 4000 };
    type Over = { strike?: Record<string, number>; params?: Record<string, number>; block?: Record<string, unknown>; escort?: typeof hull | null; player?: typeof hull; sea?: typeof sea };
    const build = (o: Over): AirStrikeParams =>
      airStrikeParamsFromData(
        { ...pete, strike: { ...pete.strike, ...o.strike } },
        { ...ev, params: { ...ev.params, ...o.params } },
        { ...block, ...o.block },
        5,
        o.player ?? hull,
        o.escort === undefined ? hull : o.escort,
        o.sea ?? sea,
        '東',
      );
    expect(() => build({})).not.toThrow();
    const cases: [Over, RegExp][] = [
      [{ block: { count: 5 } }, /count/],
      [{ block: { count: 0 } }, /count/],
      [{ strike: { release_altitude_m: 0 } }, /release_altitude_m/],
      [{ strike: { run_speed_kt: 0 } }, /run_speed_kt/],
      [{ params: { run_gap_s: 1.2 } }, /run_gap_s.*落下/],
      [{ params: { run_gap_s: P01.fallFeelS } }, /run_gap_s.*落下/],
      [{ params: { first_run_s: 9 } }, /first_run_s/],
      [{ block: { count: 1, escort_target_planes: [] }, escort: null }, /count × run_gap_s/],
      [{ params: { wave_rest_s: 4 } }, /wave_rest_s/],
      [{ block: { escort_target_planes: [1, 4] } }, /escort_target_planes の 4/],
      [{ block: { escort_target_planes: [1, 1] } }, /重複/],
      [{ escort: null }, /僚艇（escort）のいる任務だけ/],
      // 狙いを海域に収める余白（負・NaN・海域の半分以上）
      [{ player: { ...hull, boundsMarginM: -1 } }, /艇の寸法・端の余白/],
      [{ player: { ...hull, boundsMarginM: NaN } }, /艇の寸法・端の余白/],
      [{ sea: { width: 24, height: 4000 } }, /艇の寸法・端の余白/],
      [{ escort: { ...hull, boundsMarginM: 2001 } }, /僚艇の寸法・端の余白/],
    ];
    for (const [o, re] of cases) expect(() => build(o), JSON.stringify(o)).toThrow(re);
    // 方角のずれが機数より少ない
    expect(() => airStrikeParamsFromData(pete, { ...ev, params: { ...ev.params, spawn_offsets_deg: [0, 10] } }, block, 5, hull, hull, sea, '東')).toThrow(/spawn_offsets_deg/);
    // 自艇の端の余白を省けるのは空襲の無い任務だけ（tests/dawn-air の us_02）
    expect(() => getAirStrikeParams(gameData, getPrototypeMission(gameData, 'jp_06'), 5, { halfLengthM: 12, halfBeamM: 3 }, null)).toThrow(/jp_06.*端の余白/);
    // data から組むときは任務の id を付ける（起動時に分かる）
    const bad = JSON.parse(JSON.stringify(gameData)) as typeof gameData;
    const rec = (bad.riskEvents.events as unknown as Record<string, unknown>[]).find((e) => e['id'] === 'dawn_air_strike')!;
    (rec['params'] as Record<string, unknown>)['run_gap_s'] = 1;
    expect(() => buildWorldSetup(bad, 'us_01')).toThrow(/us_01.*run_gap_s/);
    expect(() => buildWorldSetup(bad, 'jp_06')).toThrow(/jp_06.*run_gap_s/);
    expect(() => buildWorldSetup(bad, 'us_02')).not.toThrow(); // 空襲の無い任務は読まない
  });
});

describe('夜明けの空襲の段階（core/air-strike。spec §4.2・§4.3）', () => {
  it('乱数: create の後 1,000 ステップ・start までは 1 回も引かない。投下ごとにちょうど 2 回（命中の火災・機関は世界の hitBoat）', () => {
    const rng = new CountingRng(7);
    const s = createAirStrike(P01);
    const c = check(boat(), boat(-20, 60));
    for (let k = 0; k < 1000; k++) expect(stepAirStrike(s, P01, c, rng, DT)).toBe(0);
    expect(rng.draws).toBe(0);
    expect(s.planes.every((pl) => pl.phase === AS_IDLE)).toBe(true);
    startAirStrike(s, P01, c.player);
    expect(rng.draws).toBe(0);
    let releases = 0;
    for (let k = 0; k < 150 / DT; k++) {
      const before = rng.draws;
      const ev = stepAirStrike(s, P01, c, rng, DT);
      if (ev & AS_EV_RELEASE) releases++;
      expect(rng.draws - before).toBe(ev & AS_EV_RELEASE ? 2 : 0);
    }
    expect(releases).toBeGreaterThanOrEqual(16);
  });

  it('止まった的: 投下は 13.94 + 3k 秒（k = 0〜7、±1 ステップ）、2 波目の最初は 76.89、3 波目は 139.83。波は 3 回。空中の爆弾は常に 1 発まで', () => {
    const rel: number[] = [];
    let waves = 0;
    let maxInAir = 0;
    run(P06, check(boat(300, 400, 30)), new SeededRng(3), 140, (s, ev, t) => {
      if (ev & AS_EV_RELEASE) rel.push(t);
      if (ev & AS_EV_WAVE) waves++;
      maxInAir = Math.max(maxInAir, s.bombs.filter((b) => b.active).length);
    });
    const first = P06.firstRunS + P06.runS;
    const want: number[] = [];
    for (let w = 0, f = first; w < 3; w++, f += 7 * P06.runGapS + P06.waveRestS + first) for (let k = 0; k < 8; k++) want.push(f + k * P06.runGapS);
    expect(want[0]).toBeCloseTo(13.94, 2);
    expect(want[8]).toBeCloseTo(76.89, 2);
    expect(want[16]).toBeCloseTo(139.83, 2);
    expect(rel.length).toBe(17);
    for (let i = 0; i < rel.length; i++) expect(Math.abs(rel[i]! - want[i]!), `release ${i}`).toBeLessThanOrEqual(DT * 1.01);
    expect(waves).toBe(3);
    expect(maxInAir).toBe(1);
  });

  it('予定の秒の順に 1 機ずつ（nextRun % 4）。爆弾を落とし切った機は去り、全機が終わってから次の波', () => {
    const order: number[] = [];
    run(P06, check(boat()), new SeededRng(5), 80, (s, ev) => {
      if (ev & AS_EV_RELEASE) order.push(s.bombs[s.lastRelease]!.plane);
      if (ev & AS_EV_WAVE) expect(s.planes.every((pl) => pl.phase === AS_INBOUND)).toBe(true);
    });
    expect(order.slice(0, 9)).toEqual([0, 1, 2, 3, 0, 1, 2, 3, 0]);
  });

  it('predictBoat: 直進（旋回 0）、四分円（90° を落下の秒で回る＝解析解）、最小の旋回率の閾値、左旋回', () => {
    const o = { x: 0, y: 0 };
    predictBoat(at(10, 20, 90, 15), 0, 4, 0.5, o);
    expect(o.x).toBeCloseTo(70, 9);
    expect(o.y).toBeCloseTo(20, 9);
    const T = P01.fallGameS;
    const yaw = 90 / T;
    const rho = 20 / degToRad(yaw);
    predictBoat(at(0, 0, 0, 20), yaw, T, 0.5, o);
    expect(o.x).toBeCloseTo(rho, 6);
    expect(o.y).toBeCloseTo(-rho, 6);
    predictBoat(at(0, 0, 0, 20), -yaw, T, 0.5, o);
    expect(o.x).toBeCloseTo(-rho, 6);
    expect(o.y).toBeCloseTo(-rho, 6);
    predictBoat(at(0, 0, 0, 20), 0.49, T, 0.5, o); // 閾値未満は直進
    expect(o.x).toBe(0);
    expect(o.y).toBeCloseTo(-20 * T, 9);
    predictBoat(at(0, 0, 0, 20), 0.51, T, 0.5, o); // 閾値以上は円弧
    expect(o.x).toBeGreaterThan(0);
    predictBoat(at(0, 0, 0, 20), 3, T, 0, o); // 閾値 0 でも割り算は旋回 0 のときだけ避ける
    expect(Number.isFinite(o.x)).toBe(true);
  });

  it('狙い: 止まった的はすべて散布の半径（45.25 m）以内。等速で旋回し続ける的は円弧の点から半径以内（回り続けると当たる）', () => {
    const b0 = boat(100, 200, 30);
    run(P06, check(b0), new SeededRng(11), 150, (s, ev) => {
      if (!(ev & AS_EV_IMPACT)) return;
      const b = s.bombs[s.lastImpact]!;
      expect(Math.hypot(b.aimX - b0.x, b.aimY - b0.y)).toBeLessThanOrEqual(P06.scatterM + 1e-9);
    });
    const b1 = boat(0, 0, 0, 20);
    const yaw = 12;
    let impacts = 0;
    let hits = 0;
    run(
      P06,
      check(b1),
      new SeededRng(12),
      110,
      (s, ev) => {
        if (!(ev & AS_EV_IMPACT)) return;
        const b = s.bombs[s.lastImpact]!;
        impacts++;
        if (b.hitPlayer) hits++;
        expect(Math.hypot(b.aimX - b1.x, b.aimY - b1.y)).toBeLessThanOrEqual(P06.scatterM + 2);
      },
      () => moveBoat(b1, yaw, DT * P06.timeScale),
    );
    expect(impacts).toBe(16);
    expect(hits).toBeGreaterThan(0);
  });

  it('狙い: 全速で旋回中の的が投下を見て舵を切り返すと、400 回中 90% 以上外れる。転舵の秒（dodgeS）が残る', () => {
    let misses = 0;
    for (let trial = 0; trial < 400; trial++) {
      const b = boat(0, 0, (trial * 37) % 360, 20);
      let yaw = trial % 2 === 0 ? 12 : -12;
      let slot = -1;
      let done = false;
      let dodge = NaN;
      const c = check(b);
      const s = createAirStrike(P06);
      const rng = new SeededRng(1000 + trial);
      startAirStrike(s, P06, b);
      for (let k = 0; k < 20 / DT && !done; k++) {
        moveBoat(b, yaw, DT * P06.timeScale);
        const ev = stepAirStrike(s, P06, c, rng, DT);
        if (ev & AS_EV_RELEASE && slot < 0) {
          slot = s.lastRelease;
          yaw = -yaw; // 投下を見て切り返す
        }
        if (ev & AS_EV_IMPACT && s.lastImpact === slot) {
          done = true;
          if (!s.bombs[slot]!.hitPlayer) misses++;
          dodge = s.dodgeS[0]!;
        }
      }
      expect(done).toBe(true);
      expect(Number.isFinite(dodge)).toBe(true);
    }
    expect(misses / 400).toBeGreaterThanOrEqual(0.9);
  });

  it('us_01: 2・4 番機（index 1・3）は僚艇が浮いている間は僚艇を狙う（直進の見越し）。僚艇が沈んだ後の進路は自艇へ', () => {
    const player = boat();
    const vip = boat(-20, 60);
    const c = check(player, vip);
    const log: { t: number; plane: number; toEscort: boolean }[] = [];
    const s = run(
      P01,
      c,
      new SeededRng(21),
      36,
      (st, ev, t) => {
        if (!(ev & AS_EV_RELEASE)) return;
        const b = st.bombs[st.lastRelease]!;
        log.push({ t, plane: b.plane, toEscort: b.toEscort });
        if (b.toEscort) expect(Math.hypot(b.aimX - vip.x, b.aimY - vip.y)).toBeLessThanOrEqual(P01.scatterM + 1e-9);
      },
      (t) => {
        if (t > 20) c.escortAfloat = false;
      },
    );
    expect(log.length).toBe(8);
    for (const r of log) expect(r.toEscort, JSON.stringify(r)).toBe(r.t < 20 && (r.plane === 1 || r.plane === 3));
    expect(log.filter((r) => r.toEscort).length).toBe(1); // 16.94 秒の 2 番機だけ（22.94 秒の 4 番機は 21 秒の進路入りで自艇へ）
    expect(s.bombsAtEscort).toBe(1);
    // ずっと浮いていれば 8 発中 4 発が僚艇へ
    expect(run(P01, check(boat(), boat(-20, 60)), new SeededRng(21), 36).bombsAtEscort).toBe(4);
  });

  it('中断（沈没・輪の中・座礁）: 来ている機は全部去って終わり、それ以上の進路も波も無い', () => {
    const c = check(boat(), boat(-20, 60));
    let runsAfter = 0;
    let wavesAfter = 0;
    let checkedLeaving = false;
    const s = run(
      P01,
      c,
      new SeededRng(31),
      120,
      (st, ev, t) => {
        if (t <= 18) return;
        if (ev & AS_EV_RUN) runsAfter++;
        if (ev & AS_EV_WAVE) wavesAfter++;
        if (!checkedLeaving) {
          checkedLeaving = true;
          for (const pl of st.planes) expect([AS_LEAVING, AS_DONE]).toContain(pl.phase);
        }
      },
      (t) => {
        if (t > 18) c.cancel = true;
      },
    );
    expect(checkedLeaving).toBe(true);
    expect(runsAfter).toBe(0);
    expect(wavesAfter).toBe(0);
    expect(s.planes.every((pl) => pl.phase === AS_DONE)).toBe(true);
    expect(strikeThreat(s)).toBe(AS_T_NONE);
    expect(airStrikeActive(s)).toBe(false);
  });

  it('沈没中の自艇には当てない（同じ seed で沈んでいなければ当たる）', () => {
    const cs = check(boat());
    cs.playerSinking = true;
    const sunk = run(P06, cs, new SeededRng(41), 150);
    const live = run(P06, check(boat()), new SeededRng(41), 150);
    expect(sunk.bombsDropped).toBe(live.bombsDropped);
    expect(sunk.bombsDropped).toBeGreaterThanOrEqual(16);
    expect(sunk.hitsPlayer).toBe(0);
    expect(live.hitsPlayer).toBeGreaterThan(0);
    expect(live.damagePlayer).toBe(live.hitsPlayer * 35);
  });

  it('機の位置は 1 ステップで 1.5 × v × dt より跳ばない（接近→旋回・進路→抜ける・抜ける→旋回／去る・僚艇への進路・中断）', () => {
    const lim = 1.5 * P01.flightMps * DT;
    const seen = new Set<string>();
    const scan = (cancelAt: number): void => {
      const c = check(boat(), boat(-20, 60));
      const prev: (AircraftPose & { phase: number })[] = [];
      for (let i = 0; i < P01.planes; i++) prev.push({ dx: 0, dy: 0, headingDeg: 0, alpha: 0, phase: AS_IDLE });
      const q: AircraftPose = { dx: 0, dy: 0, headingDeg: 0, alpha: 0 };
      run(
        P01,
        c,
        new SeededRng(51),
        130,
        (s) => {
          for (let i = 0; i < P01.planes; i++) {
            const pl = s.planes[i]!;
            const pr = prev[i]!;
            strikePose(s, P01, i, q);
            const vis = (ph: number): boolean => ph !== AS_IDLE && ph !== AS_DONE;
            if (vis(pr.phase) && vis(pl.phase)) {
              expect(Math.hypot(q.dx - pr.dx, q.dy - pr.dy), `${pr.phase}→${pl.phase}`).toBeLessThanOrEqual(lim);
              if (pr.phase !== pl.phase) seen.add(`${pr.phase}>${pl.phase}`);
              if (pl.phase === AS_RUN && pl.toEscort) seen.add('run-vip');
            }
            pr.dx = q.dx;
            pr.dy = q.dy;
            pr.phase = pl.phase;
          }
        },
        (t) => {
          if (t > cancelAt) c.cancel = true;
        },
      );
    };
    scan(Infinity);
    scan(16); // 2 番機の僚艇への爆撃進路の途中で中断（1 番機は旋回に戻った直後、3・4 番機は旋回中）
    for (const tr of [`${AS_INBOUND}>${AS_ORBIT}`, `${AS_ORBIT}>${AS_RUN}`, `${AS_RUN}>${AS_OUTBOUND}`, `${AS_OUTBOUND}>${AS_ORBIT}`, `${AS_OUTBOUND}>${AS_LEAVING}`, `${AS_RUN}>${AS_LEAVING}`, `${AS_ORBIT}>${AS_LEAVING}`, 'run-vip']) expect(seen.has(tr), tr).toBe(true);
  });

  it('同じ seed なら同じ着弾、違う seed なら違う着弾', () => {
    const impacts = (seed: number): number[] => {
      const out: number[] = [];
      run(P01, check(boat(0, 0, 45, 10), boat(-20, 60)), new SeededRng(seed), 100, (s, ev) => {
        if (ev & AS_EV_IMPACT) {
          const b = s.bombs[s.lastImpact]!;
          out.push(b.aimX, b.aimY, b.hitPlayer ? 1 : 0, b.hitEscort ? 1 : 0);
        }
      });
      return out;
    };
    const a = impacts((12345 + AIR_STRIKE_SEED_OFFSET) >>> 0);
    expect(a.length).toBe(16 * 4);
    expect(impacts((12345 + AIR_STRIKE_SEED_OFFSET) >>> 0)).toEqual(a);
    expect(impacts((54321 + AIR_STRIKE_SEED_OFFSET) >>> 0)).not.toEqual(a);
  });

  it('確保しない: 10,000 ステップの後も機・爆弾・転舵の秒の配列は同じもので長さも同じ', () => {
    const s = createAirStrike(P01);
    const planes = s.planes;
    const bombs = s.bombs;
    const dodge = s.dodgeS;
    const items = [...planes, ...bombs];
    const c = check(boat(0, 0, 0, 15)); // 僚艇なし＝全弾が自艇へ（転舵の秒が 16 を超える）
    startAirStrike(s, P01, c.player);
    const rng = new SeededRng(61);
    for (let k = 0; k < 10000; k++) {
      moveBoat(c.player, k % 600 < 300 ? 8 : -8, DT * P01.timeScale);
      stepAirStrike(s, P01, c, rng, DT);
    }
    expect(s.planes).toBe(planes);
    expect(s.bombs).toBe(bombs);
    expect(s.dodgeS).toBe(dodge);
    expect([planes.length, bombs.length, dodge.length]).toEqual([4, 2, 16]);
    expect([...s.planes, ...s.bombs].every((x, i) => x === items[i])).toBe(true);
    expect(s.dodgeCount).toBeGreaterThan(16); // 17 発目からは数だけ（配列は伸ばさない）
  });

  it('乱数の系列は重ならない: seed+0〜7、沿岸砲 8〜8+門数−1、今夜 16、見張り 17、敵の PT 18（予約）、空襲 19。data の最大の門数は 8 以下', () => {
    let maxBatteries = 0;
    for (const id of [...playableMissionIds(gameData, 'us_pt'), ...playableMissionIds(gameData, 'jp_hard')])
      for (const hard of [false, true]) maxBatteries = Math.max(maxBatteries, buildWorldSetup(gameData, id, { hard }).shoreBatteries.length);
    expect(maxBatteries).toBeGreaterThan(0);
    expect(maxBatteries).toBeLessThanOrEqual(8);
    const offsets = [0, 1, 2, 3, RAID_SEED_OFFSET, 5, 6, 7];
    for (let i = 0; i < maxBatteries; i++) offsets.push(8 + i);
    offsets.push(NIGHT_SEED_OFFSET, LOOKOUT_SEED_OFFSET, 18, AIR_STRIKE_SEED_OFFSET);
    expect(new Set(offsets).size).toBe(offsets.length);
    expect(AIR_STRIKE_SEED_OFFSET).toBe(19);
    expect([RAID_SEED_OFFSET, NIGHT_SEED_OFFSET, LOOKOUT_SEED_OFFSET]).toEqual([4, 16, 17]);
  });
});

describe('端に押し付けた艇（狙いは clampToBounds と同じ余白で海域に収める）と、進路の途中で僚艇が沈んだ爆弾の絵', () => {
  const W01 = buildWorldSetup(gameData, 'us_01');
  const W06 = buildWorldSetup(gameData, 'jp_06');
  /** 見越しを海域に収めない（直す前と同じ）。端の効きを確かめる対照 */
  const open = (p: AirStrikeParams): AirStrikeParams => ({ ...p, boundsW: Infinity, boundsH: Infinity, playerMarginM: -Infinity, escortMarginM: -Infinity });
  const STEPS = Math.round(37 / DT); // 1 波（8 発。最後の着弾は 36.2 秒）
  const TRIALS = 100;

  /** 世界の順（艇 → clampToBounds → 空襲）で 1 波を TRIALS 回。舵（針路）と速力は一定。自艇を狙った爆弾 1 発あたりの命中 */
  function playerRate(w: typeof W01, p: AirStrikeParams, x: number, y: number, headingDeg: number, speed01: number, seed: number): number {
    const rng = new SeededRng(seed);
    const input: BoatInput = { headingDeg, speed01 };
    let bombs = 0;
    let hits = 0;
    for (let t = 0; t < TRIALS; t++) {
      const b = at(x, y, headingDeg, speed01 * w.boatParams.speedMaxMps);
      const c = check(b);
      const s = createAirStrike(p);
      startAirStrike(s, p, b);
      for (let k = 0; k < STEPS; k++) {
        stepBoat(b, input, w.boatParams, DT * w.timeScale);
        clampToBounds(b, w.mission.bounds, w.boundsMarginM);
        const ev = stepAirStrike(s, p, c, rng, DT);
        if (ev & AS_EV_IMPACT) {
          bombs++;
          if (s.bombs[s.lastImpact]!.hitPlayer) hits++;
        }
      }
    }
    expect(bombs).toBe(TRIALS * 8);
    return hits / bombs;
  }

  it('自艇: 端へ全速で押し付けても、端を 45° 押し付けて滑っても、止まった艇と同じくらい当たる（0.45〜0.70。収めなければ ほぼ 0）', () => {
    const rows: [typeof W01, number, number, number, string][] = [];
    // jp_06（6000×4000）: 南の端へ真っ直ぐ・南西へ押し付けて西へ滑る・西の端へ。us_01（6000×6000）: 北の端へ・北西へ押し付けて西へ滑る
    const m6 = W06.boundsMarginM;
    const m1 = W01.boundsMarginM;
    rows.push([W06, 3000, 4000 - m6, 180, 'jp_06 南へ押し付け'], [W06, 5500, 4000 - m6, 225, 'jp_06 南の端を滑る'], [W06, m6, 2000, 270, 'jp_06 西へ押し付け']);
    rows.push([W01, 3000, m1, 0, 'us_01 北へ押し付け'], [W01, 5500, m1, 315, 'us_01 北の端を滑る']);
    const stopped = new Map<typeof W01, number>();
    for (const w of [W01, W06]) {
      const r = playerRate(w, w.airStrike!, CX, CY, 0, 0, 71);
      expect(r).toBeGreaterThanOrEqual(0.45);
      expect(r).toBeLessThanOrEqual(0.7);
      stopped.set(w, r);
    }
    for (const [w, x, y, h, name] of rows) {
      const r = playerRate(w, w.airStrike!, x, y, h, 1, 71);
      expect(r, name).toBeGreaterThanOrEqual(0.45);
      expect(r, name).toBeLessThanOrEqual(0.7);
      expect(Math.abs(r - stopped.get(w)!), `${name} ${r.toFixed(3)} vs 止まった艇 ${stopped.get(w)!.toFixed(3)}`).toBeLessThan(0.08);
    }
    // 対照: 収めなければ押し付けた艇にはほとんど当たらない（直す前の抜け道）
    expect(playerRate(W06, open(W06.airStrike!), 3000, 4000 - m6, 180, 1, 71)).toBeLessThan(0.1);
    expect(playerRate(W01, open(W01.airStrike!), 3000, m1, 0, 1, 71)).toBeLessThan(0.1);
  }, 30_000);

  it('僚艇: 端へ全速で押し付けた僚艇も、止まった僚艇と同じくらい当たる（僚艇の余白で収める。収めなければ ほぼ 0）', () => {
    const esc = W01.escort!;
    const m = esc.boundsMarginM;
    /** 僚艇を狙った爆弾 1 発あたりの命中（自艇は 1,000 m 北で停止。2・4 番機が僚艇へ） */
    const escortRate = (p: AirStrikeParams, x: number, y: number, headingDeg: number, speedMps: number): number => {
      const rng = new SeededRng(73);
      let bombs = 0;
      let hits = 0;
      for (let t = 0; t < TRIALS * 2; t++) {
        const e = at(x, y, headingDeg, speedMps);
        const c = check(at(x, y - 1000, 0, 0), e);
        const s = createAirStrike(p);
        startAirStrike(s, p, c.player);
        for (let k = 0; k < STEPS; k++) {
          stepStraight(e, DT * W01.timeScale); // 僚艇の操舵（steerShip）は針路に進んでから端で止める
          clampToBounds(e, W01.mission.bounds, m);
          const ev = stepAirStrike(s, p, c, rng, DT);
          if (ev & AS_EV_IMPACT && s.bombs[s.lastImpact]!.toEscort) {
            bombs++;
            if (s.bombs[s.lastImpact]!.hitEscort) hits++;
          }
        }
      }
      expect(bombs).toBe(TRIALS * 2 * 4);
      return hits / bombs;
    };
    const still = escortRate(P01, CX, CY, 0, 0);
    const pinned = escortRate(P01, 3000, 6000 - m, 180, esc.speedMaxMps);
    expect(still).toBeGreaterThanOrEqual(0.45);
    expect(still).toBeLessThanOrEqual(0.7);
    expect(Math.abs(pinned - still), `${pinned.toFixed(3)} vs ${still.toFixed(3)}`).toBeLessThan(0.08);
    expect(escortRate(open(P01), 3000, 6000 - m, 180, esc.speedMaxMps)).toBeLessThan(0.1);
  }, 30_000);

  it('開けた海では収めても狙いは 1 ビットも変わらない（同じ seed で収めない値と同じ着弾）', () => {
    const impacts = (p: AirStrikeParams): number[] => {
      const out: number[] = [];
      const b1 = boat(0, 0, 0, 20);
      run(p, check(b1, boat(-20, 60)), new SeededRng(81), 100, (s, ev) => {
        if (ev & AS_EV_IMPACT) out.push(s.bombs[s.lastImpact]!.aimX, s.bombs[s.lastImpact]!.aimY);
      }, () => moveBoat(b1, 12, DT * P01.timeScale));
      return out;
    };
    const a = impacts(P01);
    expect(a.length).toBe(32);
    expect(impacts(open(P01))).toEqual(a);
  });

  it('爆弾の絵は機の投下点から: 自艇へはちょうど自艇の位置、僚艇へは僚艇の位置。進路の途中で僚艇が沈めば狙いは自艇へ移るが、絵は沈んだ所の上の機から', () => {
    const player = boat();
    const vip = boat(-20, 130);
    const c = check(player, vip);
    const q: AircraftPose = { dx: 0, dy: 0, headingDeg: 0, alpha: 0 };
    let checked = 0;
    // 2 番機（index 1）の僚艇への進路は 15 秒から、投下は 16.94 秒。16 秒（進路の途中）で僚艇が沈む
    run(
      P01,
      c,
      new SeededRng(91),
      24,
      (s, ev, t) => {
        if (!(ev & AS_EV_RELEASE)) return;
        const b = s.bombs[s.lastRelease]!;
        const pl = s.planes[b.plane]!;
        expect([b.fromX, b.fromY]).toEqual([player.x + pl.e0x, player.y + pl.e0y]); // 投下点 E0（自艇からの相対）
        strikePose(s, P01, b.plane, q); // 抜け始めの機（投下から持ち越した秒だけ進んでいる）
        expect(Math.hypot(b.fromX - (player.x + q.dx), b.fromY - (player.y + q.dy)), `t ${t.toFixed(2)}`).toBeLessThanOrEqual(P01.flightMps * DT);
        if (b.plane === 0) expect([b.fromX, b.fromY]).toEqual([player.x, player.y]);
        if (b.plane === 1) {
          expect(b.toEscort).toBe(false);
          expect(pl.toEscort).toBe(true); // 進路は僚艇（の沈んだ所）へ飛んだ
          expect(Math.hypot(b.fromX - vip.x, b.fromY - vip.y)).toBeLessThan(1e-9);
          expect(Math.hypot(b.aimX - player.x, b.aimY - player.y)).toBeLessThanOrEqual(P01.scatterM + 1e-9);
        }
        checked++;
      },
      (t) => {
        if (t > 16) c.escortAfloat = false;
      },
    );
    expect(checked).toBe(4); // 1〜4 番機（13.94・16.94・19.94・22.94 秒）
    // 浮いている僚艇へ: 絵は僚艇の位置から（丸めの差だけ）
    run(P01, check(boat(), boat(-20, 130)), new SeededRng(92), 18, (s, ev) => {
      if (!(ev & AS_EV_RELEASE)) return;
      const b = s.bombs[s.lastRelease]!;
      if (b.toEscort) expect(Math.hypot(b.fromX - (CX - 20), b.fromY - (CY + 130))).toBeLessThan(1e-9);
    });
  });
});
