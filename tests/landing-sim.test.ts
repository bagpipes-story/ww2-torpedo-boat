// 停泊して揚陸する輸送船を守る模擬（v0.6.9 S3。core/landing-sim・landing-sim-cell・landing-trial・landing-sim-policy、systems/landing-sim-setup。spec-v069 §6 S3・§8・R1・R2・R4・R7）:
// 同じ seed なら同じ夜（決まった結果）、どの遊び方も I1〜I6、輸送船の被雷と斉射の数えが合う（浮いている間の命中の和 = 被雷・影の当たりうる本数 ≥ 本物）、上書きは data を変えず
// 世界と同じ検査を通す（V8・V10・V13 を破る組み合わせは止まる＝R7）、R2 の期待値の畳み込み、出発点で巡航して回っても見つからない（R1・V13）。帯（S4 の較正）はここでは見ない。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { LD_DONE, LD_SUNK } from '../src/core/landing';
import { runLandingTrial } from '../src/core/landing-sim';
import { landingCell, salvoStats, surviveOf, type SalvoStats } from '../src/core/landing-sim-cell';
import { LANDING_PLAY, LANDING_POLICIES, LANDING_POLICY_SPECS, landingPlayPoints } from '../src/core/landing-sim-policy';
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
  it('上書きは data の写しに当て、data は変えない', () => {
    const o = landingSimSetup(gameData, 'jp_04', { unloadS: 120, lookoutM: 1850, hitsToSink: 1, aimDeg: 12, spacingDeg: 6, hurriedM: 1200, hurriedFactor: 2, reacquireS: 5, fuelGal: 17 });
    expect([o.landing.unloadS, o.landing.lookoutM, o.landing.hitsToSink, o.torpedo.aimDeg, o.torpedo.spacingDeg, o.torpedo.hurriedM, o.torpedo.hurriedFactor, o.torpedo.reacquireS, o.fuelGal]).toEqual([120, 1850, 1, 12, 6, 1200, 2, 5, 17]);
    expect([S.landing.unloadS, S.landing.lookoutM, S.torpedo.aimDeg, S.fuelGal]).toEqual([140, 1800, 10, 19]);
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
});

describe('R2 の期待値', () => {
  const st = (calm: number[], hurried: number[]): SalvoStats => ({ n: 3, calm: salvoStats([], 2, 3).calm, hurried: salvoStats([], 2, 3).hurried, byPt: [], dist: [[], [calm, calm], [hurried, hurried]] });
  it('斉射の組の畳み込み: 沈むまで 2 本なら 気づかれていない 2 斉射の生き残りは p0² + 2 p0 p1、0 斉射は 1', () => {
    const s = st([1, 5, 4, 0], [6, 4, 0, 0]);
    const [p0, p1] = [0.1, 0.5];
    expect(surviveOf([[1, 0], [1, 1]], s, 2)).toBeCloseTo(p0 * p0 + 2 * p0 * p1, 12);
    expect(surviveOf([], s, 2)).toBe(1);
    expect(surviveOf([[2, -1]], s, 2)).toBeCloseTo(1, 12);
    expect(surviveOf([[1, 0]], s, 1)).toBeCloseTo(p0, 12);
  });
  it('期待値は実測に近い（seed 1〜12・隠れると近い報告で寄る: ±20 点）', () => {
    for (const pol of ['hide', 'lure_late'] as const) {
      const c = landingCell(S, pol, RUN.trials(pol, 0), RUN.pooledSalvo);
      expect(Math.abs(c.expSurvivePct - c.survivePct), pol).toBeLessThan(20);
    }
  });
});
