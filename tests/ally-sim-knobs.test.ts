// 卯月の模擬のつまみと夜明け（v0.6.10 S3b。systems/ally-sim-knobs・systems/landing-sim-setup。spec-v0610 §6.4・リードの決定 LD14・LD16）: 範囲（端を含む）の外は例外、data の写しに当てて
// 世界と同じ組み立ての検査（V-A1〜V-A6）を通す（V-A3 の上限を超える遅い PT の見張りは止まる）、data は変えない、位置の候補はノーマル・ハードとも通る、卯月を切った夜に卯月のつまみは使えず
// 夜明けは使える、25 mm を切ると 12 cm だけ、I9 の卯月の無い夜はつまみを除く。TABLE=4 の集計（core/landing-ally-cell）と scripts の口も見る。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { ALLY_EAST_FATES, landingAllyCell } from '../src/core/landing-ally-cell';
import { OUT_CALM, OUT_DAWN, OUT_HURRIED, OUT_LIT_AWAY, OUT_RETIRED, OUT_SUNK, PT_SALVO_CALM, PT_SALVO_HURRIED } from '../src/core/landing-sim';
import { createLandingTrial } from '../src/core/landing-trial';
import { ALLY_KNOB_KEYS, ALLY_KNOB_RANGES, ALLY_KNOB_STATIONS, checkAllyKnobs, hasAllyKnobs, withoutAllyKnobs } from '../src/systems/ally-sim-knobs';
import { landingCalibrationRun, landingSimSetup } from '../src/systems/landing-sim-setup';

const BASE = landingSimSetup(gameData, 'jp_04');

describe('つまみの範囲（§6.4・LD16）', () => {
  it('範囲と位置の候補（採った (3620, 2380) と S1 の探索で釣り合いの余裕の大きい近くの 2 か所）', () => {
    expect(ALLY_KNOB_STATIONS).toEqual([[3620, 2380], [3610, 2400], [3590, 2420]]);
    expect(ALLY_KNOB_RANGES).toEqual({
      allyArc0: [50, 60], allyLookSlowM: [300, Infinity], allyRateSlow: [0.2, 0.4], allyLookFastM: [700, 900], allyRateFast: [0.3, 1], allyReactS: [0.5, 1.5], allyChaseS: [0, 3], dawnS: [160, 200],
    });
    expect([BASE.allyDestroyer!.x, BASE.allyDestroyer!.y]).toEqual([...ALLY_KNOB_STATIONS[0]!]);
  });
  it('範囲の外・候補の外の位置は例外（鍵を名指す）。端は通る', () => {
    for (const [k, [lo, hi]] of Object.entries(ALLY_KNOB_RANGES)) {
      expect(() => checkAllyKnobs({ [k]: lo - 0.01 }, false), k).toThrow(new RegExp(`卯月のつまみ ${k} は`));
      if (hi !== Infinity) expect(() => checkAllyKnobs({ [k]: hi + 0.01 }, false), k).toThrow(new RegExp(`卯月のつまみ ${k} は`));
      expect(() => checkAllyKnobs({ [k]: lo }, false), k).not.toThrow();
    }
    expect(() => checkAllyKnobs({ allyStation: [3450, 2580] }, false)).toThrow(/allyStation は \(3620, 2380\)・\(3610, 2400\)・\(3590, 2420\) のどれか/);
    expect(() => checkAllyKnobs({ allyRateFast: 1.2 }, false)).toThrow(/allyRateFast は 0\.3〜1（1\.2）/);
  });
  it('卯月を切った夜（allyOff）に卯月のつまみは例外、夜明けは使える。I9 の卯月の無い夜はつまみを除く（夜明けとほかの上書きは残す）', () => {
    expect(() => landingSimSetup(gameData, 'jp_04', { allyOff: true, allyRateFast: 0.6 })).toThrow(/allyRateFast は卯月を切った夜/);
    expect(landingSimSetup(gameData, 'jp_04', { allyOff: true, dawnS: 200 }).durationS).toBe(200);
    const o = { allyRateFast: 0.6, ally25Off: true, dawnS: 200, hard: true, unloadS: 130 };
    expect(withoutAllyKnobs(o)).toEqual({ dawnS: 200, hard: true, unloadS: 130 });
    expect(hasAllyKnobs(o)).toBe(true);
    expect(hasAllyKnobs({ dawnS: 200 })).toBe(false);
    expect(ALLY_KNOB_KEYS.length).toBe(9);
    const run = landingCalibrationRun(gameData, 'jp_04', ['hide'], 3, 1, 1, { allyRateFast: 0.6, dawnS: 200 });
    expect(run.i9Misses('hide', 0)).toBe(0);
  });
});

describe('data の写しに当て、世界と同じ検査を通す（data は変えない）', () => {
  it('値は setup の allyDestroyer へ（ノーマルとハード）', () => {
    for (const hard of [false, true]) {
      const s = landingSimSetup(gameData, 'jp_04', { hard, allyStation: [3610, 2400], allyArc0: 55, allyLookSlowM: 300, allyRateSlow: 0.2, allyLookFastM: 900, allyRateFast: 1, allyReactS: 1.5, allyChaseS: 0, dawnS: 200 });
      const a = s.allyDestroyer!;
      expect([a.x, a.y, a.headingDeg, a.arc0Deg, a.arc1Deg, a.lookSlowM, a.lookSlow2, a.rateSlow, a.lookFastM, a.rateFast, a.lightReactS, a.chaseFireS, s.durationS]).toEqual([3610, 2400, 90, 55, 180, 300, 90000, 0.2, 900, 1, 1.5, 0, 200]);
    }
    const a = BASE.allyDestroyer!;
    expect([a.x, a.y, a.arc0Deg, a.lookSlowM, a.rateSlow, a.lookFastM, a.rateFast, a.lightReactS, a.chaseFireS, BASE.durationS]).toEqual([3620, 2380, 50, 350, 0.3, 800, 0.4, 1, 2.5, 160]);
    expect(landingSimSetup(gameData, 'jp_04').allyDestroyer).toEqual(a); // data は変わらない
  });
  it.each(ALLY_KNOB_STATIONS.map((st) => [st[0], st[1]]))('位置 (%i, %i) はノーマル・ハードとも検査を通る（扇の始め 50・60°）', (x, y) => {
    for (const hard of [false, true]) for (const arc0 of [50, 60]) expect(landingSimSetup(gameData, 'jp_04', { hard, allyStation: [x, y], allyArc0: arc0 }).allyDestroyer!.x).toBe(x);
  });
  it('V-A3 の上限（(3620, 2380) は 364 m）を超える遅い PT の見張りは組み立ての検査が止める（範囲の上は検査に任せる）', () => {
    expect(landingSimSetup(gameData, 'jp_04', { allyLookSlowM: 360 }).allyDestroyer!.lookSlowM).toBe(360);
    expect(() => landingSimSetup(gameData, 'jp_04', { allyLookSlowM: 370 })).toThrow(/lookout_slow_m（370 m）は.*V-A3/);
    expect(() => landingSimSetup(gameData, 'jp_04', { allyLookFastM: 700, allyLookSlowM: 300, hard: true })).not.toThrow();
  });
  it('25 mm を切ると砲は pt_sink_chance の 12 cm だけ（沈める砲の添字は 0 のまま）', () => {
    const s = landingSimSetup(gameData, 'jp_04', { ally25Off: true });
    expect(BASE.allyDestroyer!.gunnery.guns.map((g) => g.id)).toEqual(['main_120mm', 'aa_25mm']);
    expect(s.allyDestroyer!.gunnery.guns.map((g) => g.id)).toEqual(['main_120mm']);
    expect([s.allyDestroyer!.sinkGunIndex, s.allyDestroyer!.ptSinkChance]).toEqual([0, 0.1]);
  });
});

describe('TABLE=4 の集計（core/landing-ally-cell）', () => {
  it('見張る線の PT の結末の分け方・船体の下の魚雷の種類ごとの %・呼びかけ・最初の seed', () => {
    const a = createLandingTrial(2);
    a.outcome.set([OUT_CALM, OUT_LIT_AWAY]);
    a.kind.set([PT_SALVO_CALM, 0]);
    a.torpThroughAlly.set([1, 0]);
    a.litAways = 1;
    a.allyLitPts = 1;
    a.ringCallS = 120;
    a.ringShownS = 121;
    a.ringObeyS = 121;
    a.end = 'home';
    const b = createLandingTrial(2);
    b.outcome.set([OUT_HURRIED, OUT_RETIRED]);
    b.kind.set([PT_SALVO_HURRIED, 0]);
    b.allyFate.set([0, 1]);
    b.allyRetired = 1;
    b.ringCallS = 100;
    b.ringCallHidden = true;
    b.end = 'sunk';
    const c = createLandingTrial(2);
    c.outcome.set([OUT_SUNK, OUT_DAWN]);
    c.dawn = true;
    c.end = 'home';
    const cell = landingAllyCell('lure', [a, b, c], 11, [1], 3);
    expect(ALLY_EAST_FATES).toEqual(['calm', 'fight', 'litSalvo', 'litAway', 'ally', 't38', 'dawn', 'other']);
    expect(cell.east.litAway).toBeCloseTo(100 / 3, 9);
    expect(cell.east.ally).toBeCloseTo(100 / 3, 9);
    expect(cell.east.dawn).toBeCloseTo(100 / 3, 9);
    expect([cell.east.calm, cell.east.fight, cell.east.t38]).toEqual([0, 0, 0]);
    expect(cell.t38Off).toBeCloseTo(1 / 3, 9); // c の PT 0 の撃沈は自艇（allyFate 0）
    expect([cell.thruCalmPct, cell.thruHurriedPct, Number.isNaN(cell.thruEngagedPct)]).toEqual([100 / 3, 0, true]);
    expect([cell.litNightPct, cell.ownSunkPct, cell.homeBeforeDawnPct]).toEqual([100 / 3, 100 / 3, 100 / 3]);
    expect([cell.callPct, cell.callHiddenPct, cell.callShownPct, cell.callObeyPct]).toEqual([200 / 3, 100 / 3, 100 / 3, 100 / 3]);
    expect(cell.first).toEqual({ litAway: 11, retire: 12, sink: NaN, litSalvo: NaN, chase: NaN });
    // 見張る線が無い（卯月のいない表）なら結末の列は NaN
    expect(Object.values(landingAllyCell('lure', [a], 1, [], 3).east).every((v) => Number.isNaN(v))).toBe(true);
  });
  it('scripts/landing-sim は TABLE=4 を受け、行は scripts/landing-sim-ally。つまみの env は上書きの o の中（見出しに出る）・ALLY_OFF は外（LD9）', () => {
    const src = readFileSync(new URL('../scripts/landing-sim.ts', import.meta.url), 'utf8');
    expect(src).toContain("if (!['', '1', '2', '3', '4'].includes(table))");
    expect(src).toContain("if (table === '4') for (const l of allyTableLines(run, pols, blocks, n, seed, span)) console.log(l);");
    const o = src.slice(src.indexOf('const o: LandingSimOverrides = {'), src.indexOf('};', src.indexOf('const o: LandingSimOverrides = {')));
    for (const k of ["allyStation: pair('ALLY_STATION')", "allyRateFast: num('ALLY_FAST_RATE')", "ally25Off: process.env['ALLY_25OFF'] === '1' ? true : undefined", "dawnS: num('DAWN')"]) expect(o).toContain(k);
    expect(o).not.toContain('allyOff');
  });
});
