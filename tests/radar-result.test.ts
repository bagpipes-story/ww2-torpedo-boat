// v0.8.0 S4（spec-v0800 §4.9・§3.2 D-R9、brief L26・L31・L34）: Result の us_04 の 2 行（ui/radar-result・strait-result）と、その材料（systems/strait-result-part・world-radar の数え）。
// - 文の形: 最初の接触が 1 秒の前なら「出撃直後」・後なら「出撃 N 秒」・接触なし／目で見えない間に撃った魚雷 0 本・N 本（命中 N）。列の行は往路・復路・撃沈・揚陸の地に残った。
// - 幅: 20 px で論理幅 1280 の行の幅 1232 の内（縮めない）。本文の下端（result-scene の line() の足し方）は 592 の内に収まるか、収める上げは行の間の半分より小さい。
// - 目で見えない間に撃った魚雷（L31）: 狙える艦がある間に撃った 1 本ごとに、発射の時に 3 行目が敵影なし（t.enemySighted と同じ規則）なら数え、その魚雷の命中（不発を除く・終わり際も）を数える。
//   凍結の魚雷のファイルは触らない（発射の口は systems/torpedo-free の stepLauncher・命中の口は systems/torpedo-hits）。レーダーの無い世界は何もしない。
// - Result の鍵はレーダー・列の通過のある任務だけ（ほかの任務の Result は今のまま＝tests/result-body-neutral）。人名・有名な艇の番号は無い。
import { describe, expect, it } from 'vitest';
import { RADAR_LINE_STEP_M } from '../src/config/strait-hud-config';
import type { ShotRecord } from '../src/core/hit-rate';
import type { TorpedoState } from '../src/core/torpedo';
import { radarResultPart, straitResultPart } from '../src/systems/strait-result-part';
import { torpedoEventsFor } from '../src/systems/torpedo-hits';
import { stepLauncher } from '../src/systems/torpedo-free';
import type { WorldEvents } from '../src/systems/world-events';
import { WorldRadar } from '../src/systems/world-radar';
import { RADAR_RESULT_SOON_S, radarResultLineJa, type RadarResult } from '../src/ui/radar-result';
import { resultBodyLines, resultFitLiftPx, type ResultBodySource } from '../src/ui/result-body';
import { straitResultLineJa, type StraitResult } from '../src/ui/strait-result';
import { FAMOUS_BOAT_RE, PERSON_DENYLIST, RANK_RE } from './person-denylist';
import { textWidthPx } from './pt-ui-kit';
import { code } from './sfx-rules-kit';
import { DT, fakeGroup, fakeShip, kit } from './torpedo-free-kit';
import { kitStep, kitWorld } from './transit-world-kit';

const R0: RadarResult = { firstS: 0.0167, firstDx: -1800, firstDy: -1400, unseenShots: 2, unseenHits: 0 };
const S0: StraitResult = { forceJa: '東京急行', vilaJa: 'ビラ', inCount: 3, outCount: 2, sunk: 1, away: 0, inbound: 0 };
const BODY_MAX_Y = 720 - 24 - 96 - 8; // RESULT_BODY_MAX_Y（menu-config は DOM を読むので値で。tests/evac-result と同じ）

describe('文の形（spec §4.9）', () => {
  it('最初の接触: 1 秒の前は「出撃直後」・後は「出撃 N 秒」・無ければ「接触なし」。魚雷は 0 本なら命中を付けない。列の行', () => {
    expect(radarResultLineJa(R0)).toBe('レーダー: 最初の接触 北西 2300 m（出撃直後） ・ 目で見えない間に撃った魚雷 2 本（命中 0）');
    expect(radarResultLineJa({ ...R0, firstS: 37.6, firstDx: -3450, firstDy: -1100, unseenShots: 0 })).toBe('レーダー: 最初の接触 西 3600 m（出撃 38 秒） ・ 目で見えない間に撃った魚雷 0 本');
    expect(radarResultLineJa({ ...R0, firstS: NaN, firstDx: NaN, firstDy: NaN, unseenShots: 4, unseenHits: 1 })).toBe('レーダー: 接触なし ・ 目で見えない間に撃った魚雷 4 本（命中 1）');
    expect(radarResultLineJa({ ...R0, firstS: RADAR_RESULT_SOON_S })).toContain('（出撃 1 秒）');
    expect(straitResultLineJa(S0)).toBe('東京急行: 往路 3 隻 → 復路 2 隻（撃沈 1・ビラに残った 0）');
    expect(straitResultLineJa({ ...S0, outCount: 0, sunk: 0, inbound: 3 })).toBe('東京急行: 往路 3 隻 → 復路 0 隻（撃沈 0・ビラに残った 0・往路の途中 3）'); // 早く終わった夜だけの尾
    expect(RADAR_LINE_STEP_M).toBe(100);
  });
  it('幅: いちばん広い形（4000 m・北東・出撃 260 秒・魚雷 4 本（命中 4）／ハードの 4 隻・往路の途中の尾）は 20 px で 1232 px（論理幅 1280 − 左右 24）の内。px を固定', () => {
    const wide = radarResultLineJa({ firstS: 259.6, firstDx: 2828, firstDy: -2828, unseenShots: 4, unseenHits: 4 });
    const st = straitResultLineJa({ ...S0, inCount: 4, outCount: 4, sunk: 4, away: 4, inbound: 4 });
    expect([wide, st]).toEqual(['レーダー: 最初の接触 北東 4000 m（出撃 260 秒） ・ 目で見えない間に撃った魚雷 4 本（命中 4）', '東京急行: 往路 4 隻 → 復路 4 隻（撃沈 4・ビラに残った 4・往路の途中 4）']);
    expect([Math.round(textWidthPx(wide, 20) * 10) / 10, Math.round(textWidthPx(st, 20) * 10) / 10]).toEqual([964.9, 752.6]);
    for (const s of [wide, st]) expect(textWidthPx(s, 20)).toBeLessThanOrEqual(1280 - 48);
  });
});

/** 本文の材料（駆逐艦の任務の魚雷の枝。ほかの枝の鍵は null） */
function body(over: Partial<ResultBodySource>): ResultBodySource {
  return { hunt: null, pt: null, convoy: null, engine: null, gunboat: null, detections: 0, returned: true, objectiveDone: true, shots: [1, 2, 3, 4], capacity: 4, hits: 1, duds: 0, misses: 3, bands: [], kpi: null, sortie: { historical: false }, ...over } as ResultBodySource;
}

describe('本文の 2 行と下端（result-scene の line() の足し方）', () => {
  it('魚雷の枝の後ろ（KPI の行の後・兵装の行の前）に 1 行ずつ（20 px・KPI の色）。鍵の無い任務は今の行のまま', () => {
    const with2 = resultBodyLines(body({ radar: R0, strait: S0 }), false).map((l) => l.text);
    const without = resultBodyLines(body({}), false).map((l) => l.text);
    expect(with2.slice(0, without.length)).toEqual(without);
    expect(with2.slice(without.length)).toEqual([radarResultLineJa(R0), straitResultLineJa(S0)]);
    expect(resultBodyLines(body({ radar: R0, strait: S0, arms: { blindTorpedoes: 1 } as never }), false).map((l) => l.text).slice(-3, -1)).toEqual([radarResultLineJa(R0), straitResultLineJa(S0)]);
  });
  it('本文の下端 ≤ 592（W 1280・1560: 行の幅は 1232 の内で縮めないので縦の置き方は同じ）。帰投した夜（帯 2 つまで）は上げずに 592 の内、行の多い夜は上げて 592（行の間は重ならない）', () => {
    const bands = ['〜500', '〜1000', '〜1500', '1500〜'].map((band) => ({ band, shots: 1, hits: 0, duds: 0 }));
    /** 見出し・本文（帯 nb 本＋凡例・2 行・兵装）・スコア・得点・状況・extra 行の下端と行の数（result-scene の line(): 字の大きさ ＋ 12、節の間 10。下端は字 × 1.25 で多めに） */
    const layout = (nb: number, arms: boolean, extra: number): [number, number] => {
      const lines: [number, boolean][] = [[44, false]];
      const src = body({ radar: R0, strait: S0, bands: bands.slice(0, nb) as never, kpi: { byBand: ['a', 'b', 'c', 'd'], legend: 'L' }, ...(arms ? { arms: { blindTorpedoes: 1 } as never } : {}) });
      for (const l of resultBodyLines(src, false)) lines.push([l.px, l.sectionAfter]);
      lines[lines.length - 1]![1] = true;
      lines.push([44, false], [20, true], [20, false], ...Array.from({ length: extra }, (): [number, boolean] => [20, false]));
      let y = 56;
      let lastTop = y;
      for (const [px, sec] of lines) {
        lastTop = y;
        y += px + 12 + (sec ? 10 : 0);
      }
      return [lastTop + Math.ceil(20 * 1.25), lines.length];
    };
    // 帰投した夜（4 本が 1〜2 つの帯・夜明けの行「前に帰投」・味方機と水上機の行）は上げない
    const [usual1] = layout(1, false, 3);
    const [usual2] = layout(2, false, 3);
    expect([usual1, usual2]).toEqual([515, 547]);
    expect(usual2).toBeLessThanOrEqual(BODY_MAX_Y);
    // 4 帯の帰投した夜は 611 → 上げる（行の間 1.4 px ずつ）
    const [four, n4] = layout(4, false, 3);
    expect([four, n4]).toEqual([611, 15]);
    expect((four - BODY_MAX_Y) / (n4 - 1)).toBeLessThan(12 / 2);
    // 行の多い夜（4 帯・兵装・夜明けの後の空襲の行・味方機・水上機・乗員・帰投地点まで＝漂流した夜明けの後）は 707 → 上げて 592。行の間は 12 − 6.8 ＝ 5.2 px 残る（重ならない）
    const [worst, n] = layout(4, true, 5);
    expect([worst, n]).toEqual([707, 18]);
    expect((worst - BODY_MAX_Y) / (n - 1)).toBeLessThan(12);
    expect(Math.round(((worst - BODY_MAX_Y) / (n - 1)) * 10) / 10).toBe(6.8);
    expect(worst - resultFitLiftPx(n - 1, n, worst, BODY_MAX_Y)).toBeCloseTo(BODY_MAX_Y, 9);
  });
});

describe('目で見えない間に撃った魚雷の数え（brief L31）', () => {
  it('狙える艦がある間の 1 本ごとに、発射の時に敵影なし（最寄りの浮いている艦が視程の 2 乗の外）なら数え、その魚雷の命中だけを数える（不発は数えない）', () => {
    const ship = fakeShip(0, 0);
    const k = kit('us_04', fakeGroup([ship]), 5);
    const b = k.w.boat.state;
    ship.state.x = b.x;
    ship.state.y = b.y - 1500; // 目（900 m）の外
    const wr = new WorldRadar(k.s.radar!, k.s.mission.bounds, k.s.shores, 1, null);
    const w = { ...k.w, radar: wr, enemy: { focus: () => ship.state }, visRange2: k.s.visRange2 };
    const fired: TorpedoState[] = [];
    const fire = (): void => {
      w.input.fireTap = true;
      for (let i = 0; i < 30; i++) {
        const before = w.torpedoes.remaining;
        if (i === 0) stepLauncher({ ...w, input: w.input }, DT);
        else stepLauncher(w, DT);
        if (w.torpedoes.remaining < before) fired.push(w.torpedoes.states[w.torpedoes.capacity - before]!);
        if (w.input.fireTap) w.launcher.queueFan(b, 1, 0), (w.input.fireTap = false);
      }
    };
    fire(); // 1 本目: 1,500 m（敵影なし）
    ship.state.y = b.y - 600;
    fire(); // 2 本目: 600 m（敵影あり）
    ship.state.y = b.y - 2000;
    fire(); // 3 本目: 2,000 m（敵影なし）
    expect(fired.length).toBe(3);
    expect([wr.unseenShots, wr.unseenHits]).toEqual([2, 0]);
    const hitWorld = { shots: [] as ShotRecord[], hits: 0, slowMoLeftS: 0, setup: { slowMoSeconds: 1 }, destroyers: { ships: [{ takeHit: () => false, playSinking: () => undefined }], allOut: false, allSettled: false }, launcher: k.w.launcher, dawn: { reached: false, retireHeadingDeg: NaN }, stepTimeS: 0, radar: wr };
    const te = torpedoEventsFor(hitWorld, { onTorpedoHit: () => undefined, onDestroyerSunk: () => undefined } as unknown as WorldEvents);
    te.onHit(0, 0, 0, fired[1]!); // 見えていた魚雷の命中は数えない
    fired[2]!.dud = true;
    te.onHit(0, 0, 0, fired[2]!); // 不発は数えない
    te.onLateHit(0, 0, 0, fired[0]!); // 終わり際の当たりは数える
    expect([wr.unseenShots, wr.unseenHits]).toEqual([2, 1]);
    expect(hitWorld.shots.length).toBe(3); // 記録（ShotRecord）は今のまま
  });
  it('配線（source）: 発射の口は stepLauncher の狙える艦がある道だけ・規則は t.enemySighted と同じ式・凍結のファイルは触らない。命中の口は onHit と onLateHit の不発でない時', () => {
    const tf = code('src/systems/torpedo-free.ts');
    expect(tf).toContain('if (s && w.radar) w.radar.noteLaunch(s, enemyInSight(w, boat));');
    expect(tf).toContain('return dx * dx + dy * dy <= w.visRange2;');
    expect(code('src/systems/mission-telemetry.ts')).toContain('t.enemySighted = e !== null && t.enemyDx * t.enemyDx + t.enemyDy * t.enemyDy <= w.visRange2;');
    const th = code('src/systems/torpedo-hits.ts');
    expect(th).toContain('if (!dud) w.radar?.noteHit(s);');
    expect(th).toContain('if (!s.dud) w.radar?.noteHit(s);');
    for (const f of ['src/core/torpedo.ts', 'src/core/torpedo-targets.ts', 'src/core/torpedo-solver.ts', 'src/systems/torpedo-pool.ts']) expect(code(f)).not.toMatch(/noteLaunch|noteHit|unseen/);
  });
});

describe('Result の材料（systems/strait-result-part）', () => {
  it('レーダー・列の通過のある夜だけ鍵が出る。最初の接触はその時の自艇から一番近い輝点・列の数は段階の数え（往路・復路・撃沈・揚陸の地）', () => {
    const w = kitWorld();
    while (w.stepTimeS < 120) kitStep(w);
    const r = radarResultPart({ radar: w.radar });
    expect(Math.round(Math.hypot(r.radar!.firstDx, r.radar!.firstDy) / 100) * 100).toBe(2300);
    expect(r.radar!.firstS).toBeLessThan(RADAR_RESULT_SOON_S);
    const g = { destroyers: { transit: w.transit } as never, setup: w.setup };
    expect(straitResultPart(g).strait).toEqual({ forceJa: '東京急行', vilaJa: 'ビラ', inCount: 3, outCount: 0, sunk: 0, away: 3, inbound: 0 });
    expect([radarResultPart({ radar: null }), straitResultPart({ destroyers: null, setup: w.setup })]).toEqual([{}, {}]);
    const mt = code('src/systems/mission-telemetry.ts');
    expect(mt).toContain('...radarResultPart(w),');
    expect(mt).toContain('...straitResultPart(w),');
  });
  it('数が合う: 撃沈の無い夜はどの秒に終わっても 往路 = 復路 + ビラに残った + 往路の途中。早く終わった夜（列がまだ往路）だけ尾が出る', () => {
    const w = kitWorld();
    const g = { destroyers: { transit: w.transit } as never, setup: w.setup };
    let early = '';
    for (let next = 1; w.stepTimeS < 260; ) {
      kitStep(w);
      if (w.stepTimeS < next) continue;
      next++;
      const s = straitResultPart(g).strait!;
      expect(s.sunk).toBe(0);
      expect(s.inCount, `${w.stepTimeS}`).toBe(s.outCount + s.away + s.inbound);
      if (s.inbound > 0 && early === '') early = straitResultLineJa(s);
    }
    expect(early).toMatch(/^東京急行: 往路 \d 隻 → 復路 0 隻（撃沈 0・ビラに残った \d・往路の途中 \d）$/);
  });
});

describe('人物と有名な艇（§4.12）', () => {
  it('どの形の文にも人名・階級・有名な艇の番号が無い', () => {
    for (const t of [radarResultLineJa(R0), radarResultLineJa({ ...R0, firstS: NaN }), straitResultLineJa(S0)]) {
      for (const name of PERSON_DENYLIST) expect(t).not.toContain(name);
      expect(RANK_RE.test(t) || FAMOUS_BOAT_RE.test(t), t).toBe(false);
    }
  });
});
