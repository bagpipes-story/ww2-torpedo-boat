// 撃墜（v0.6.8。core/air-down。spec-v068 §5.3・§6.1）: 凍結の空中の core の公開の状態を外から書く包み。
// (a) 撃墜が無ければ skipDownedRuns を毎ステップ呼んでも状態は 1 ビットも変わらない（夜明けの空襲 5 任務と jp_02 の夜の出撃 × 艇の 4 つの動き × 3 seed × 120 秒）。
// (b) 接近・旋回・投下前の爆撃進路・爆弾の落下中の抜ける・去る、のどこで 1 機を落としても波は止まらず、次の波は 4 機 × 爆弾 B 発、落とした機はもう投下せず、落下中の爆弾は落ちる。
// (c) 最初の旋回で全機を落とすと、次の波は最後の撃墜から wave_rest_s（± 1 ステップ）。(d) 夜の出撃の 2 機を落とすと出撃は終わり、始め直すと 2 機。
// (e) 夜の水上機: どの段階で落としても 300 秒 SP_DONE のまま・seed+5 は引かない・狙った爆弾は残らない・結果は 2 ビットの欄の中（≤ 3）。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { FIXED_STEP_S } from '../src/config/step-config';
import { AS_DONE, AS_EV_IMPACT, AS_EV_RELEASE, AS_IDLE, AS_INBOUND, AS_LEAVING, AS_ORBIT, AS_OUTBOUND, AS_RUN, createAirStrike, startAirStrike, stepAirStrike, type AirStrikeCheck, type AirStrikeParams, type AirStrikeState } from '../src/core/air-strike';
import { airSortieComplete, createSortieBase, restartAirSortie } from '../src/core/air-sortie';
import { downSeaplane, downStrikePlane, skipDownedRuns } from '../src/core/air-down';
import { stepBoat, type BoatInput, type BoatParams, type BoatState } from '../src/core/boat-motion';
import { SeededRng } from '../src/core/rng';
import { SP_APPROACH, SP_DONE, SP_EV_IMPACT, SP_EV_RELEASE, SP_FLARE_PASS, SP_IDLE, SP_LEAVING, SP_ORBIT, SP_OUT_CANCELLED, SP_PATROL, SP_RUN, createSeaplaneState, stepSeaplane, stepSeaplaneTrigger, type SeaplaneCheck } from '../src/core/seaplane';
import { wrapDeg360 } from '../src/core/units';
import { buildWorldSetup } from '../src/systems/world-setup';

const DT = FIXED_STEP_S;
const EPS = 1e-6;
const STRIKE_IDS = ['us_01', 'us_03', 'jp_01', 'jp_06', 'jp_02'] as const;
const POLS = ['stop', 'straight', 'circle', 'zigzag'] as const;
type Pol = (typeof POLS)[number];

class CountingRng extends SeededRng {
  draws = 0;
  override next(): number {
    this.draws++;
    return super.next();
  }
}

function steer(pol: Pol, boat: BoatState, t: number, inp: BoatInput): void {
  inp.speed01 = pol === 'stop' ? 0 : 1;
  inp.headingDeg = pol === 'stop' ? NaN : pol === 'straight' ? 0 : pol === 'circle' ? wrapDeg360(boat.headingDeg + 90) : Math.floor(t / 2) % 2 === 0 ? 45 : 315;
}

interface Run {
  st: AirStrikeState;
  p: AirStrikeParams;
  bp: BoatParams;
  boat: BoatState;
  c: AirStrikeCheck;
  rng: CountingRng;
  inp: BoatInput;
  t: number;
}

function mkRun(p: AirStrikeParams, bp: BoatParams, seed: number, start = true): Run {
  const boat: BoatState = { x: p.boundsW / 2, y: p.boundsH / 2, headingDeg: 0, speedMps: 0 };
  const st = createAirStrike(p);
  const c: AirStrikeCheck = { player: boat, playerSinking: false, escort: null, escortAfloat: false, cancel: false };
  if (start) startAirStrike(st, p, boat);
  return { st, p, bp, boat, c, rng: new CountingRng(seed), inp: { headingDeg: 0, speed01: 0 }, t: 0 };
}

/** 1 ステップ（艇 → 包み → 空襲）。wrap なら stepAirStrike の前に skipDownedRuns（世界の ArmsStep.stepAir が dawn.step の前に呼ぶのと同じ） */
function stepRun(r: Run, pol: Pol, wrap: boolean): number {
  steer(pol, r.boat, r.t, r.inp);
  stepBoat(r.boat, r.inp, r.bp, DT * r.p.timeScale);
  if (wrap) skipDownedRuns(r.st, r.p);
  r.t += DT;
  return stepAirStrike(r.st, r.p, r.c, r.rng, DT);
}

const strikeOf = (id: string): { p: AirStrikeParams; bp: BoatParams } => {
  const w = buildWorldSetup(gameData, id);
  return { p: w.airStrike!, bp: w.boatParams };
};
const J02 = buildWorldSetup(gameData, 'jp_02');
const SORTIE = J02.patrolAir!.sortie;

describe('撃墜の包み（core/air-down）', () => {
  it('(a) 撃墜が無ければ何もしない: 毎ステップ skipDownedRuns を呼んでも状態は呼ばない走りと同じ（夜明け 5 任務・夜の出撃 × 4 つの動き × 3 seed × 120 秒）', () => {
    let compared = 0;
    const cases: Array<{ name: string; p: AirStrikeParams; bp: BoatParams; sortie: boolean }> = [...STRIKE_IDS.map((id) => ({ name: id, ...strikeOf(id), sortie: false })), { name: 'jp_02 sortie', p: SORTIE, bp: J02.boatParams, sortie: true }];
    for (const k of cases)
      for (const pol of POLS)
        for (const seed of [1, 7, 23]) {
          const a = mkRun(k.p, k.bp, seed, !k.sortie);
          const b = mkRun(k.p, k.bp, seed, !k.sortie);
          const baseA = createSortieBase();
          const baseB = createSortieBase();
          let restarts = 0;
          let doneAt = NaN;
          if (k.sortie) {
            expect(restartAirSortie(a.st, k.p, a.boat, 56, 1500, baseA)).toBe(true);
            expect(restartAirSortie(b.st, k.p, b.boat, 56, 1500, baseB)).toBe(true);
          }
          for (let s = 0; s < 60 * 120; s++) {
            if (k.sortie && airSortieComplete(a.st)) {
              // 出撃が終われば 5 秒後に次の出撃（世界では門番の次の発見）。両方の走りで同じステップに
              if (Number.isNaN(doneAt)) doneAt = a.t;
              if (a.t - doneAt >= 5) {
                expect(airSortieComplete(b.st)).toBe(true);
                restartAirSortie(a.st, k.p, a.boat, 56 + 90 * (restarts + 1), 1200, baseA);
                restartAirSortie(b.st, k.p, b.boat, 56 + 90 * (restarts + 1), 1200, baseB);
                restarts++;
                doneAt = NaN;
              }
            }
            stepRun(a, pol, false);
            stepRun(b, pol, true);
            if (s % 5 === 0 || s === 60 * 120 - 1) {
              compared++;
              const ja = JSON.stringify(a.st) + JSON.stringify(a.boat) + a.rng.draws;
              const jb = JSON.stringify(b.st) + JSON.stringify(b.boat) + b.rng.draws;
              if (ja !== jb) expect(jb, `${k.name} ${pol} seed ${seed} step ${s}`).toBe(ja);
            }
          }
          if (k.sortie) expect(restarts, `${k.name} ${pol} ${seed}`).toBeGreaterThanOrEqual(2);
          else expect(a.st.waves, `${k.name} ${pol} ${seed}`).toBeGreaterThanOrEqual(3);
        }
    expect(compared).toBeGreaterThan(6 * 4 * 3 * 1400);
  });

  it('downStrikePlane: 待機・終わりの機は落とさない（false・何も変えない）。飛んでいる機は AS_DONE・残りの爆弾 0', () => {
    const { p } = strikeOf('us_01');
    const st = createAirStrike(p);
    expect(downStrikePlane(st, 0)).toBe(false);
    expect(st.planes[0]!.phase).toBe(AS_IDLE);
    expect(downStrikePlane(st, 99)).toBe(false);
    startAirStrike(st, p, { x: 3000, y: 3000, headingDeg: 0, speedMps: 0 });
    expect(downStrikePlane(st, 1)).toBe(true);
    expect([st.planes[1]!.phase, st.planes[1]!.bombsLeft]).toEqual([AS_DONE, 0]);
    expect(downStrikePlane(st, 1)).toBe(false); // 2 回目は数えない（レビュー F14）
  });

  describe('(b) どこで 1 機を落としても', () => {
    const PH = [AS_INBOUND, AS_ORBIT, AS_RUN, AS_OUTBOUND, AS_LEAVING] as const;
    const NAMES = ['接近', '旋回', '投下前の爆撃進路', '爆弾の落下中の抜ける', '去る'];
    for (const id of ['us_01', 'jp_02'] as const) {
      it(`${id}: 波は止まらず遅れず、次の波は 4 機 × 爆弾 B 発、落とした機の残りの爆弾は落ちず、落下中の爆弾は落ちる`, () => {
        const { p, bp } = strikeOf(id);
        const B = p.bombsPerPlane;
        // 撃墜なしの次の波の時刻
        const base = mkRun(p, bp, 7);
        while (base.st.waves === 1 && base.t < 150) stepRun(base, 'stop', false);
        const baseNext = base.t;
        expect(base.st.waves).toBe(2);
        for (let i = 0; i < p.planes; i++)
          for (let ph = 0; ph < PH.length; ph++) {
            const r = mkRun(p, bp, 7);
            let downed = false;
            let bombsLeftAtDown = -1;
            let fallingAtDown = false;
            let releasesAfter = 0;
            let impactsAfter = 0;
            while (r.st.waves === 1 && r.t < 150) {
              if (!downed && r.st.planes[i]!.phase === PH[ph]) {
                bombsLeftAtDown = r.st.planes[i]!.bombsLeft;
                fallingAtDown = r.st.bombs.some((b) => b.active && b.plane === i);
                expect(downStrikePlane(r.st, i)).toBe(true);
                downed = true;
                skipDownedRuns(r.st, r.p);
              }
              const ev = stepRun(r, 'stop', downed);
              if (downed && ev & AS_EV_RELEASE && r.st.bombs[r.st.lastRelease]!.plane === i) releasesAfter++;
              if (downed && ev & AS_EV_IMPACT && r.st.bombs[r.st.lastImpact]!.plane === i) impactsAfter++;
            }
            const tag = `${id} 機 ${i} ${NAMES[ph]}`;
            expect(downed, tag).toBe(true);
            expect(r.st.waves, `${tag}: 次の波が来ない`).toBe(2);
            expect(r.t, `${tag}: 次の波が遅れた`).toBeLessThanOrEqual(baseNext + EPS);
            expect(r.st.planes.every((pl) => pl.phase === AS_INBOUND && pl.bombsLeft === B), `${tag}: 補充`).toBe(true);
            expect(releasesAfter, tag).toBe(0);
            expect(r.st.bombsDropped, `${tag}: 落とした爆弾`).toBe(p.planes * B - bombsLeftAtDown);
            if (ph === 3) expect(fallingAtDown, tag).toBe(true);
            if (fallingAtDown) expect(impactsAfter, tag).toBeGreaterThanOrEqual(1);
          }
      });
    }
  });

  it('(c) 最初の旋回で全機を落とすと、投下なしで次の波は最後の撃墜から wave_rest_s（+ 1 ステップ以内）。次の波は 4 機', () => {
    for (const id of ['us_01', 'jp_02'] as const) {
      const { p, bp } = strikeOf(id);
      const r = mkRun(p, bp, 3);
      let downAt = NaN;
      while (r.st.waves === 1 && r.t < 150) {
        if (Number.isNaN(downAt) && r.st.planes.every((pl) => pl.phase === AS_ORBIT)) {
          for (let i = 0; i < p.planes; i++) expect(downStrikePlane(r.st, i)).toBe(true);
          skipDownedRuns(r.st, r.p);
          expect([r.st.nextRun, Number.isNaN(r.st.lastReleaseT)]).toEqual([r.st.totalRuns, false]);
          downAt = r.t;
        }
        stepRun(r, 'stop', !Number.isNaN(downAt));
      }
      expect(r.st.waves, id).toBe(2);
      expect(r.st.bombsDropped, id).toBe(0);
      const rest = r.t - downAt;
      expect(rest, id).toBeGreaterThanOrEqual(p.waveRestS - EPS);
      expect(rest, id).toBeLessThanOrEqual(p.waveRestS + DT + EPS);
      expect(r.st.planes.filter((pl) => pl.phase === AS_INBOUND).length).toBe(4);
    }
  });

  it('(d) 夜の出撃（jp_02）: 2 機とも落とすと出撃は終わる（爆弾 0）。始め直すと 2 機 × 爆弾 B 発。1 機だけなら残りの 1 機が投下を終えて終わる', () => {
    for (const both of [true, false]) {
      const r = mkRun(SORTIE, J02.boatParams, 23, false);
      const base = createSortieBase();
      expect(restartAirSortie(r.st, SORTIE, r.boat, 56, 1500, base)).toBe(true);
      let downs = 0;
      let doneAt = NaN;
      while (r.t < 60 && Number.isNaN(doneAt)) {
        if (downs === 0 && r.st.planes.every((pl) => pl.phase === AS_ORBIT)) {
          for (let i = 0; i < (both ? 2 : 1); i++) if (downStrikePlane(r.st, i)) downs++;
          skipDownedRuns(r.st, r.p);
        }
        stepRun(r, 'stop', downs > 0);
        if (airSortieComplete(r.st)) doneAt = r.t;
      }
      expect(doneAt, `both ${both}`).toBeLessThan(60);
      expect(r.st.bombsDropped).toBe(both ? 0 : SORTIE.bombsPerPlane);
      expect(restartAirSortie(r.st, SORTIE, r.boat, 146, 1200, base)).toBe(true);
      expect(r.st.planes.length).toBe(2);
      expect(r.st.planes.every((pl) => pl.phase === AS_INBOUND && pl.bombsLeft === SORTIE.bombsPerPlane)).toBe(true);
      expect([r.st.started, r.st.cancelled, r.st.nextRun]).toEqual([true, false, 0]);
    }
  });

  it('(e) 夜の水上機（us_02）: どの段階で落としても SP_DONE のまま 300 秒・seed+5 を引かない・狙った爆弾が残らない・落下中の爆弾は落ちる・結果 ≤ 3', () => {
    const p = buildWorldSetup(gameData, 'us_02').seaplane!;
    const PHS = [SP_APPROACH, SP_FLARE_PASS, SP_ORBIT, SP_RUN, SP_RUN, SP_LEAVING];
    const NAMES = ['接近', '照明弾の航過', '旋回', '爆撃進路（狙った・投下前）', '爆撃進路（爆弾の落下中）', '去る'];
    for (let k = 0; k < PHS.length; k++) {
      const s = createSeaplaneState(p);
      expect(downSeaplane(s)).toBe(false); // 哨戒（IDLE）は落とせない
      expect(s.phase).toBe(SP_IDLE);
      const boat: BoatState = { x: 2000, y: 4000, headingDeg: 0, speedMps: 0 };
      const c: SeaplaneCheck = { boat, targetX: 2000, targetY: 0, wake: true, stormInside: false, friendlyLive: false, busy: false, blocked: false, boatSinking: false, timeS: 0, shellsFired: 0, forceTrigger: true, forceSeen: true };
      const rng = new CountingRng(5);
      let t = 0;
      let downed = false;
      let drawsAtDown = -1;
      let fallingAtDown = false;
      let releasesAfter = 0;
      let impactsAfter = 0;
      let outcomeBefore = -1;
      while (t < 300) {
        if (!downed && s.phase === PHS[k]) {
          const falling = s.ordnance.bombs.some((b) => b.active);
          const aimedNext = s.ordnance.bombs[s.ordnance.bombsDropped]?.aimed === true;
          const want = PHS[k] !== SP_RUN || (k === 4 ? falling : !falling && aimedNext);
          if (want) {
            fallingAtDown = falling;
            outcomeBefore = s.outcome;
            expect(downSeaplane(s)).toBe(true);
            downed = true;
            drawsAtDown = rng.draws;
          }
        }
        c.timeS = t;
        stepSeaplaneTrigger(s, c, p, DT);
        const ev = stepSeaplane(s, p, c, rng, DT);
        if (downed) {
          if (ev & SP_EV_RELEASE) releasesAfter++;
          if (ev & SP_EV_IMPACT) impactsAfter++;
          expect(s.phase, `${NAMES[k]} t ${t.toFixed(2)}`).toBe(SP_DONE);
        }
        t += DT;
      }
      const tag = `水上機 ${NAMES[k]}`;
      expect(downed, tag).toBe(true);
      expect(rng.draws, tag).toBe(drawsAtDown);
      expect(releasesAfter, tag).toBe(0);
      expect(s.ordnance.bombs.every((b) => !b.aimed), tag).toBe(true);
      expect(s.outcome, tag).toBeLessThanOrEqual(3);
      if (outcomeBefore === 0) expect(s.outcome, tag).toBe(SP_OUT_CANCELLED);
      if (k === 4) expect(fallingAtDown, tag).toBe(true);
      if (fallingAtDown) expect(impactsAfter, tag).toBeGreaterThanOrEqual(1);
      expect(downSeaplane(s)).toBe(false); // 終わり（DONE）はもう落とせない
    }
    const patrol = createSeaplaneState(p);
    patrol.phase = SP_PATROL;
    expect(downSeaplane(patrol)).toBe(false);
  });
});
