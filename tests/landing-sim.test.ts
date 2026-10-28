// 停泊して揚陸する輸送船を守る模擬（v0.6.9 S3・S4。core/landing-sim・landing-sim-cell・landing-trial・landing-sim-policy、systems/landing-sim-setup。spec-v069 §6 S3・§8・R1・R2・R4・R7）:
// 同じ seed なら同じ夜（決まった結果）、どの遊び方も I1〜I6、輸送船の被雷と斉射の数えが合う（浮いている間の命中の和 = 被雷・影の当たりうる本数 ≥ 本物）、上書きは data を変えず
// 世界と同じ検査を通す（V8・V10・V13 を破る組み合わせは止まる＝R7）、R2 の期待値の畳み込み、出発点で巡航して回っても見つからない（R1・V13）。帯（S4 の較正）はここでは見ない。
// R14（S6a-fix）: 揚陸の決着の前に輪に入っても終わらない（A5。home_early は輪の中で待って決着の後に帰投）、lure_cue は警告（landingFireLine）の間だけ離れる（A1）。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import type { BoatState } from '../src/core/boat-motion';
import { LD_DONE, LD_SUNK, createLandingReport } from '../src/core/landing';
import { OUT_ENGAGED, PT_SALVO_ENGAGED, runLandingTrial } from '../src/core/landing-sim';
import { landingCell, salvoStats, surviveOf, type SalvoStats } from '../src/core/landing-sim-cell';
import { LANDING_PLAY, LANDING_POLICIES, LANDING_POLICY_SPECS, landingPlayPoints, landingSteer, type LandingSteer, type LandingSteerCtx } from '../src/core/landing-sim-policy';
import type { PtSection } from '../src/core/pt-boats';
import { bearingDeg } from '../src/core/ship-ai';
import { landingCalibrationRun, landingInvariantMisses, landingSimSetup } from '../src/systems/landing-sim-setup';

const S = landingSimSetup(gameData, 'jp_04');
const N = 12;
const RUN = landingCalibrationRun(gameData, 'jp_04', LANDING_POLICIES, N, 1, 1);
/** 1 夜の記録の文字列（型付き配列は中身の配列に） */
const snap = (r: object): string => JSON.stringify(r, (_k, v: unknown) => (ArrayBuffer.isView(v) ? Array.from(v as Uint8Array) : v));

describe('組み立て', () => {
  it('jp_04 の値（world-setup の landing・米PT 2 隻・T-38 の 25mm）', () => {
    expect([S.landing.unloadS, S.landing.hitsToSink, S.landing.lookoutM, S.torpedo.launchM, S.torpedo.hurriedM, S.pt.count, S.gun?.rangeM]).toEqual([140, 2, 1800, 900, 1300, 2, 600]);
    expect(landingSimSetup(gameData, 'jp_04', { hard: true }).pt.count).toBe(3);
  });
  it('上書きは data の写しに当て、data は変えない（R12 の EFACTOR も。V11 を破る値は止まる）', () => {
    const o = landingSimSetup(gameData, 'jp_04', { unloadS: 120, lookoutM: 1850, hitsToSink: 1, aimDeg: 12, spacingDeg: 6, hurriedM: 1200, hurriedFactor: 2, engagedFactor: 1.5, reacquireS: 5, fuelGal: 17 });
    expect([o.landing.unloadS, o.landing.lookoutM, o.landing.hitsToSink, o.torpedo.aimDeg, o.torpedo.spacingDeg, o.torpedo.hurriedM, o.torpedo.hurriedFactor, o.torpedo.engagedFactor, o.torpedo.reacquireS, o.fuelGal]).toEqual([120, 1850, 1, 12, 6, 1200, 2, 1.5, 5, 17]);
    expect([S.landing.unloadS, S.landing.lookoutM, S.torpedo.aimDeg, S.torpedo.engagedFactor, S.fuelGal]).toEqual([140, 1800, 10, 2, 19]);
    expect(landingSimSetup(gameData, 'jp_04', { engagedFactor: 0 }).torpedo.engagedFactor).toBe(0);
    expect(() => landingSimSetup(gameData, 'jp_04', { engagedFactor: 0.5 })).toThrow(/engaged_error_factor（0\.5）は 0（戦いながらの斉射なし）か 1 以上/);
    expect(landingSimSetup(gameData, 'jp_04').landing.unloadS).toBe(140);
  });
  it('R7: 世界と同じ検査を破る上書きは止まる（V8 出発点が見張りの内・V10 報告から 20 秒未満・V13 出発点のそばで引きつけられる・V6 夜明け）', () => {
    expect(() => landingSimSetup(gameData, 'jp_04', { lookoutM: 1950 })).toThrow(/lookout_m/);
    expect(() => landingSimSetup(gameData, 'jp_04', { lookoutM: 1700 })).toThrow(/20 秒以上/);
    expect(() => landingSimSetup(gameData, 'jp_04', { hurriedM: 1400 })).toThrow(/20 秒以上/);
    expect(() => landingSimSetup(gameData, 'jp_04', { hurriedM: 1000 })).toThrow(/出発点のそばで引きつけられない/);
    expect(() => landingSimSetup(gameData, 'jp_04', { unloadS: 175 })).toThrow(/duration_s/);
  });
  it('台本の点: 待つ点は泊地から出発点の側へ 250 m、picket は泊地の北東 1,000 m', () => {
    const p = landingPlayPoints(S.landing, S.start);
    expect(Math.hypot(p.station.x - S.landing.x, p.station.y - S.landing.y)).toBeCloseTo(LANDING_PLAY.stationM, 6);
    expect([p.picket.x, p.picket.y].map((v) => Math.round(v))).toEqual([3707, 2053]);
    for (const pol of LANDING_POLICIES) expect(LANDING_POLICY_SPECS[pol]).toBeDefined();
  });
});

describe('1 夜', () => {
  it.each(LANDING_POLICIES)('%s: 同じ seed なら同じ夜（配列の中身まで）', (pol) => {
    const a = runLandingTrial(S, pol, 7);
    const b = runLandingTrial(S, pol, 7);
    expect(snap(a)).toBe(snap(b));
  });
  it.each(LANDING_POLICIES)('%s: I1〜I6（seed 1〜12）', (pol) => {
    expect(landingInvariantMisses(RUN.cell(pol, 0), S)).toEqual([]);
  });
  it('ハードも I1〜I6（seed 1〜6・hide と lure）', () => {
    const h = landingCalibrationRun(gameData, 'jp_04', ['hide', 'lure'], 6, 1, 1, { hard: true });
    for (const pol of ['hide', 'lure'] as const) expect(landingInvariantMisses(h.cell(pol, 0), h.setup)).toEqual([]);
  });
  it.each(LANDING_POLICIES)('%s: 浮いている間の命中の和 = 輸送船の被雷、不発も同じ、影の当たりうる本数 ≥ 本物、斉射は 1 隻 1 回、seed+26 の回数 = 1 + 2n + 蛇行', (pol) => {
    for (const r of RUN.trials(pol, 0)) {
      const sum = (a: Uint8Array): number => a.reduce((x, y) => x + y, 0);
      expect(sum(r.arrivedHits)).toBe(r.hits);
      expect(sum(r.arrivedDuds)).toBe(r.duds);
      for (let i = 0; i < r.kind.length; i++) {
        expect(r.potHits[i]).toBeGreaterThanOrEqual(r.arrivedHits[i]!);
        expect(r.potHits[i]! + r.potDuds[i]!).toBeLessThanOrEqual(r.kind[i]! > 0 ? S.torpedo.n : 0);
      }
      expect(r.maxSalvosPerPt).toBeLessThanOrEqual(1);
      expect(r.draws26).toBe(r.drawsWant);
    }
  });
  it('隠れる夜: 2 隻とも 900 m で気づかれずに撃つ（斉射 2・引く回数 2 × 7 + 蛇行）・見つからない・決着の後に帰投', () => {
    for (const r of RUN.trials('hide', 0)) {
      expect(Array.from(r.kind)).toEqual([1, 1]);
      expect(Number.isNaN(r.detectS)).toBe(true);
      expect(r.draws26).toBeGreaterThanOrEqual(14);
      for (const m of r.launchM) expect(m).toBeLessThanOrEqual(900);
      expect([r.end, r.ringEarly]).toEqual(['home', false]);
      expect([LD_DONE, LD_SUNK]).toContain(r.phase);
    }
  });
  it('R1: 出発点で巡航のまま回っても見つからない（V13）＝隠れると同じ斉射', () => {
    for (const r of RUN.trials('circle_start', 0)) expect([Number.isNaN(r.detectS), Array.from(r.kind)]).toEqual([true, [1, 1]]);
  });
  it('R12: 戦いながらの斉射（種類 3）は見つかった夜だけで、撃った PT は去らない（その斉射の結末は OUT_ENGAGED）。EFACTOR 0 ならどの夜にも無い', () => {
    let engaged = 0;
    for (const pol of LANDING_POLICIES) {
      for (const r of RUN.trials(pol, 0)) {
        for (let i = 0; i < r.kind.length; i++) {
          if (r.kind[i] !== PT_SALVO_ENGAGED) continue;
          engaged++;
          expect(Number.isNaN(r.detectS), pol).toBe(false);
          expect(r.outcome[i]).toBe(OUT_ENGAGED);
        }
      }
    }
    expect(engaged).toBeGreaterThan(0);
    const off = landingSimSetup(gameData, 'jp_04', { engagedFactor: 0 });
    for (const pol of ['lure', 'lure_late', 'kite'] as const) for (let seed = 1; seed <= 6; seed++) expect(Array.from(runLandingTrial(off, pol, seed).kind)).not.toContain(PT_SALVO_ENGAGED);
  });
  it('lure_away（R12・表だけ）と lure_near（R13）は lure と同じ台本で、見つかっている間の戦い方だけが違う（stay_out: 一度見つかった後は awayM の内へ戻らない・near: 輸送船のそばへ戻る）', () => {
    const [a, n, l] = [LANDING_POLICY_SPECS.lure_away, LANDING_POLICY_SPECS.lure_near, LANDING_POLICY_SPECS.lure];
    expect({ ...a, fight: 'flee' }).toEqual(l);
    expect({ ...n, fight: 'flee' }).toEqual(l);
    expect([l.fight, a.fight, n.fight, LANDING_PLAY.awayM]).toEqual(['flee', 'stay_out', 'near', 1200]);
  });
  it('R13: 見つかっている間、lure は輸送船から離れる向きへ静音・lure_near は待つ点（泊地から 250 m＝400 m の内）へ静音で戻り、着けば止まる', () => {
    const pts = landingPlayPoints(S.landing, S.start);
    const steer = (pol: 'lure' | 'lure_near', x: number, y: number): LandingSteer => {
      const boat = { x, y, headingDeg: 0 } as BoatState;
      const ctx: LandingSteerCtx = { boat, q: { detected: true, boats: [] } as unknown as PtSection, report: createLandingReport(), start: S.start, anchor: S.landing, station: pts.station, picket: pts.picket, ring: S.ring, silentMps: 7, cruiseMps: 12, cue: false };
      const out: LandingSteer = { headingDeg: NaN, wantMps: NaN };
      landingSteer(LANDING_POLICY_SPECS[pol], ctx, false, { lured: false }, out);
      return out;
    };
    const [ax, ay] = [S.landing.x, S.landing.y];
    const far = { x: ax, y: ay - 1000 }; // 泊地の北 1,000 m
    expect(steer('lure', far.x, far.y)).toEqual({ headingDeg: 0, wantMps: 7 }); // 北へ（泊地から離れる）
    const back = steer('lure_near', far.x, far.y);
    expect(back.headingDeg).toBeCloseTo(bearingDeg(far.x, far.y, pts.station.x, pts.station.y), 9);
    expect(back.wantMps).toBe(7);
    expect(steer('lure_near', pts.station.x, pts.station.y).wantMps).toBe(0);
    expect(Math.hypot(pts.station.x - ax, pts.station.y - ay)).toBeLessThan(400);
  });
});

describe('R14（S6a-fix）の遊び方と終わり方', () => {
  const pts = landingPlayPoints(S.landing, S.start);
  const steerAt = (pol: 'lure_cue' | 'lure_near' | 'home_early', x: number, y: number, detected: boolean, cue: boolean): LandingSteer => {
    const boat = { x, y, headingDeg: 0 } as BoatState;
    const ctx: LandingSteerCtx = { boat, q: { detected, boats: [] } as unknown as PtSection, report: createLandingReport(), start: S.start, anchor: S.landing, station: pts.station, picket: pts.picket, ring: S.ring, silentMps: 7, cruiseMps: 12, cue };
    const out: LandingSteer = { headingDeg: NaN, wantMps: NaN };
    landingSteer(LANDING_POLICY_SPECS[pol], ctx, false, { lured: false }, out);
    return out;
  };
  it('台本: lure_cue は lure_near と同じ（fight cue）、home_early は撃たず転舵せず輪へ（表だけ。帯なし）', () => {
    expect({ ...LANDING_POLICY_SPECS.lure_cue, fight: 'near' }).toEqual(LANDING_POLICY_SPECS.lure_near);
    expect(LANDING_POLICY_SPECS.home_early).toEqual({ move: 'home', react: 0, shoot: 'none', dodge: false, kite: false, fight: 'flee' });
    expect(LANDING_POLICIES).toEqual(['hide', 'circle_start', 'picket', 'lure', 'lure_away', 'lure_near', 'lure_cue', 'lure_noshoot', 'lure_late', 'kite', 'shoot_near', 'home_early']);
  });
  it('lure_cue: 警告（射線）の間は輸送船から離れる向きへ静音、警告が無ければ見つかっていても lure_near と同じく輸送船のそばへ戻る', () => {
    const far = { x: S.landing.x, y: S.landing.y - 1000 };
    expect(steerAt('lure_cue', far.x, far.y, true, true)).toEqual({ headingDeg: 0, wantMps: 7 });
    expect(steerAt('lure_cue', far.x, far.y, false, true)).toEqual({ headingDeg: 0, wantMps: 7 });
    expect(steerAt('lure_cue', far.x, far.y, true, false)).toEqual(steerAt('lure_near', far.x, far.y, true, false));
  });
  it('home_early: 輪の中心へ巡航し、着けば止まる', () => {
    const go = steerAt('home_early', S.start.x, S.start.y, false, false);
    expect(go.headingDeg).toBeCloseTo(bearingDeg(S.start.x, S.start.y, S.ring.x, S.ring.y), 9);
    expect(go.wantMps).toBe(12);
    expect(steerAt('home_early', S.ring.x, S.ring.y, false, false).wantMps).toBe(0);
  });
  it('A5: home_early の夜は決着の前に輪に入り（ringEarly）、終わらずに待って、揚陸の決着の後に帰投で終わる（見つからない・撃たない）', () => {
    for (const r of RUN.trials('home_early', 0)) {
      expect(r.ringEarly).toBe(true);
      expect(r.end).toBe('home');
      expect([LD_DONE, LD_SUNK]).toContain(r.phase);
      expect(r.timeS).toBeGreaterThanOrEqual(r.resolvedS);
      expect(r.timeS - r.resolvedS).toBeLessThan(0.05); // 決着したステップに終わる（輪の中）
      expect([Number.isNaN(r.detectS), r.gunShots]).toEqual([true, 0]);
    }
    // ほかの遊び方は決着の前に輪に入らない（R4 の帯 ≤ 10%: lure）
    for (const pol of ['hide', 'lure', 'lure_near', 'lure_cue'] as const) for (const r of RUN.trials(pol, 0)) expect(r.ringEarly, pol).toBe(false);
  });
});

describe('R2 の期待値', () => {
  const st = (calm: number[], hurried: number[]): SalvoStats => ({ ...salvoStats([], 2, 3), byPt: [], dist: [[], [calm, calm], [hurried, hurried], [hurried, hurried]] });
  it('斉射の組の畳み込み: 沈むまで 2 本なら 気づかれていない 2 斉射の生き残りは p0² + 2 p0 p1、0 斉射は 1', () => {
    const s = st([1, 5, 4, 0], [6, 4, 0, 0]);
    const [p0, p1] = [0.1, 0.5];
    expect(surviveOf([[1, 0], [1, 1]], s, 2)).toBeCloseTo(p0 * p0 + 2 * p0 * p1, 12);
    expect(surviveOf([], s, 2)).toBe(1);
    expect(surviveOf([[2, -1]], s, 2)).toBeCloseTo(1, 12);
    expect(surviveOf([[1, 0]], s, 1)).toBeCloseTo(p0, 12);
  });
  it('期待値は実測に近い（seed 1〜60・隠れると近い報告で寄る: ±20 点。R12 の戦いながらの斉射は数が少ないので 12 夜では分布が粗い＝60 夜）', () => {
    const run = landingCalibrationRun(gameData, 'jp_04', ['hide', 'lure_late'], 60, 1, 1);
    for (const pol of ['hide', 'lure_late'] as const) {
      const c = landingCell(S, pol, run.trials(pol, 0), run.pooledSalvo);
      expect(Math.abs(c.expSurvivePct - c.survivePct), pol).toBeLessThan(20);
    }
  });
});
