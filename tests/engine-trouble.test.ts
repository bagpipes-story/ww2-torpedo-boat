// 機関の不調の本体（v0.6.5。core/engine-trouble。spec-v065 §C.1・§C.2 の E1〜E8・§G.1）:
// 帯ごとの熱の傾き・段の境と出来事（下から越えたときだけ数える）・熱 1.0 で不調・赤い線の間は 1.0 で待つ（同じステップの線も）・回数の上限なし・
// 沈み始め／輪の中／燃料切れでは不調にならない・不調はちょうど 8 秒で操作なしに戻る（熱はちょうど recover_heat）・入力の差し替え（確保なし）・乱数 0 回・テレメトリ。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { DEBUG_ENGINE_HOT_HEAT } from '../src/config/engine-config';
import { getEngineParams } from '../src/config/engine-mission-data';
import { gameData, getBoatRecord } from '../src/config/game-data';
import { FIXED_STEP_S } from '../src/config/step-config';
import { boatParamsFromData, stepBoat, type BoatInput, type SpeedStep } from '../src/core/boat-motion';
import {
  ENGINE_EPS,
  ENGINE_EV_FINAL,
  ENGINE_EV_LIMP,
  ENGINE_EV_NONE,
  ENGINE_EV_RECOVER,
  ENGINE_EV_WARN,
  ENGINE_FINAL,
  ENGINE_LIMP,
  ENGINE_OK,
  ENGINE_WARN,
  createEngineState,
  createEngineTelemetry,
  engineCap01,
  engineInput,
  engineLimpLeftS,
  engineStageOf,
  stepEngine,
  writeEngineTelemetry,
  type EngineParams,
  type EngineState,
} from '../src/core/engine-trouble';
import { engineParamsFromData } from '../src/core/engine-trouble-data';
import { SeededRng } from '../src/core/rng';
import { mpsToKt } from '../src/core/units';

const P: EngineParams = getEngineParams(gameData, 'jp_05')!;
const DT = FIXED_STEP_S; // 1/60 秒（世界の固定ステップ。模擬の realDt も同じ）
/** 秒 → ステップ数（1/60 秒刻み） */
const steps = (s: number): number => Math.round(s / DT);

/** 走らせた記録: ステップの通し番号（1 始まり）と時刻 */
interface Run {
  s: EngineState;
  p: EngineParams;
  i: number;
  /** [出来事が起きたステップ, 種類]（eventSeq が増えたステップ） */
  events: [number, number][];
}
const start = (p: EngineParams = P): Run => ({ s: createEngineState(p), p, i: 0, events: [] });
/** n ステップ進める。line・can は各ステップの赤い線と canLimp */
function run(r: Run, n: number, band: SpeedStep, line = false, can = true, dt = DT): Run {
  for (let k = 0; k < n; k++) {
    const seq = r.s.eventSeq;
    r.i++;
    stepEngine(r.s, r.p, band, line, can, dt, r.i * DT);
    if (r.s.eventSeq !== seq) r.events.push([r.i, r.s.lastEvent]);
  }
  return r;
}
/** 冷えた機関から全速で不調の直前（熱 1.0 の 1 ステップ前）まで */
const nearLimp = (p: EngineParams = P): Run => run(start(p), steps(p.fullToLimpS) - 1, 'full');

describe('熱の傾き（spec §C.1 の 1。jp_05 の T-14＝全速 30 秒・巡航 30 秒・静音以下 20 秒）', () => {
  it('jp_05 の値: T = 30 秒・巡航 30 秒・静音 20 秒・予告 0.6／0.85・回復 0.6・出撃時の熱 0', () => {
    expect(P).toEqual({ fullToLimpS: 30, cruiseCoolS: 30, silentCoolS: 20, warnHeat: 0.6, finalWarnHeat: 0.85, recoverHeat: 0.6, startHeat: 0 });
    const s = createEngineState(P);
    expect(s).toEqual({ heat: 0, prevHeat: 0, limp: false, stage: ENGINE_OK, warns: 0, finals: 0, limps: 0, limpS: 0, limpStartS: NaN, eventSeq: 0, lastEvent: ENGINE_EV_NONE });
  });
  it('全速: 30 秒でちょうど熱 1.0 で不調（1 ステップ前は 1.0 の手前で平常のまま不調でない）', () => {
    const r = nearLimp();
    expect(r.s.heat).toBeCloseTo(1 - DT / 30, 12);
    expect(r.s.limp).toBe(false);
    run(r, 1, 'full');
    expect(r.s.heat).toBe(1);
    expect(r.s.limp).toBe(true);
    expect(r.s.limpStartS).toBeCloseTo(30, 9);
  });
  it('巡航は 30 秒・静音と停止は 20 秒で熱 1 → 0（startHeat 1 から。0 の下へは行かない）', () => {
    for (const [band, sec] of [['cruise', 30], ['silent', 20], ['stop', 20]] as const) {
      const r = start({ ...P, startHeat: 1 });
      run(r, steps(sec) - 1, band);
      expect(r.s.heat, band).toBeCloseTo(DT / sec, 9);
      run(r, 1, band);
      expect(r.s.heat, band).toBeLessThan(1e-9);
      run(r, 60, band);
      expect(r.s.heat, band).toBe(0);
      expect(r.s.limps, band).toBe(0);
    }
  });
  it('不調の間は帯に関わらず静音の傾き（20 秒）: 熱 1.0 → 0.6 にちょうど 8 秒（全速の指令のままでも・巡航でも・停止でも）', () => {
    for (const band of ['full', 'cruise', 'silent', 'stop'] as const) {
      const r = run(nearLimp(), 1, 'full');
      expect(r.s.limp).toBe(true);
      run(r, steps(4), band);
      expect(r.s.heat, band).toBeCloseTo(0.8, 9);
      expect(engineLimpLeftS(r.s, P), band).toBeCloseTo(4, 9);
      run(r, steps(4) - 1, band);
      expect(r.s.limp, band).toBe(true);
      run(r, 1, band);
      expect(r.s.limp, band).toBe(false);
      expect(r.s.limpS, band).toBeCloseTo(8, 9);
    }
  });
});

describe('段の境と出来事・数え（spec §C.1 の 4・R10）', () => {
  it('冷えた機関から全速: 18 秒で過熱（1）・25.5 秒で限界（2）・30 秒で不調（3）・38 秒で回復（4）。段は 0 → 1 → 2 → 3 → 1', () => {
    const r = start();
    const stages: number[] = [];
    for (let k = 0; k < steps(38); k++) {
      run(r, 1, 'full');
      if (stages[stages.length - 1] !== r.s.stage) stages.push(r.s.stage);
    }
    expect(r.events).toEqual([[steps(18), ENGINE_EV_WARN], [steps(25.5), ENGINE_EV_FINAL], [steps(30), ENGINE_EV_LIMP], [steps(38), ENGINE_EV_RECOVER]]);
    expect(stages).toEqual([ENGINE_OK, ENGINE_WARN, ENGINE_FINAL, ENGINE_LIMP, ENGINE_WARN]);
    expect([r.s.warns, r.s.finals, r.s.limps, r.s.eventSeq, r.s.lastEvent]).toEqual([1, 1, 1, 4, ENGINE_EV_RECOVER]);
  });
  it('回復は熱をちょうど recover_heat（0.6）に置き、段は 3 → 1 で過熱の出来事も数えも出ない。また全速なら限界だけ数え（7.5 秒）、12 秒で次の不調', () => {
    const r = run(run(nearLimp(), 1, 'full'), steps(8), 'full');
    expect(r.s.limp).toBe(false);
    expect(r.s.heat).toBe(P.recoverHeat);
    expect(r.s.stage).toBe(ENGINE_WARN);
    expect(r.s.warns).toBe(1);
    const at = r.i;
    r.events.length = 0;
    run(r, steps(12), 'full');
    expect(r.events).toEqual([[at + steps(7.5), ENGINE_EV_FINAL], [at + steps(12), ENGINE_EV_LIMP]]);
    expect([r.s.warns, r.s.finals, r.s.limps]).toEqual([1, 2, 2]);
  });
  it('過熱の数えは 0.6 を下から越えたときだけ: 0.6 の上で巡航と全速を行き来しても増えず、0.6 の下へ冷えてから越えれば増える', () => {
    const r = run(start(), steps(21), 'full'); // 熱 0.7
    expect(r.s.warns).toBe(1);
    for (let k = 0; k < 5; k++) run(run(r, steps(2), 'cruise'), steps(2), 'full');
    expect(r.s.warns).toBe(1);
    run(r, steps(5), 'cruise'); // 0.7 − 5/30 ≈ 0.533
    expect(r.s.stage).toBe(ENGINE_OK);
    run(r, steps(3), 'full'); // 0.633
    expect(r.s.warns).toBe(2);
    expect(r.s.lastEvent).toBe(ENGINE_EV_WARN);
    expect(r.s.finals).toBe(0);
  });
  it('engineStageOf: 不調なら 3、熱 ≥ 0.85 で 2、≥ 0.6 で 1、ほかは 0（境はちょうどの値で上の段）', () => {
    expect([0, 0.5999, 0.6, 0.8499, 0.85, 1].map((h) => engineStageOf(h, false, P))).toEqual([0, 0, 1, 1, 2, 2]);
    expect(engineStageOf(0.6, true, P)).toBe(ENGINE_LIMP);
  });
  it('startHeat（?debug&enghot の 0.75）: 作ったときから段 1、最初のステップで過熱の出来事と数えが 1 回だけ（前の熱を 0 として持つ）。出発の 2 秒の停止で 0.6 を割らない', () => {
    const p = { ...P, startHeat: DEBUG_ENGINE_HOT_HEAT };
    const r = start(p);
    expect([r.s.heat, r.s.prevHeat, r.s.stage, r.s.warns]).toEqual([0.75, 0, ENGINE_WARN, 0]);
    run(r, 1, 'stop');
    expect([r.s.warns, r.s.finals, r.s.eventSeq, r.s.lastEvent]).toEqual([1, 0, 1, ENGINE_EV_WARN]);
    run(r, steps(2) - 1, 'stop');
    expect(r.s.heat).toBeCloseTo(0.65, 9);
    expect(r.s.eventSeq).toBe(1);
    run(r, steps(6), 'full'); // 0.85 に 6 秒
    expect(r.s.lastEvent).toBe(ENGINE_EV_FINAL);
    run(r, steps(4.5), 'full'); // 1.0 に 10.5 秒
    expect(r.s.limp).toBe(true);
    expect([r.s.warns, r.s.finals, r.s.limps]).toEqual([1, 1, 1]);
  });
  it('自艇の engine_reliability が 0.85 なら T = 60 秒（36 秒で過熱・60 秒で不調）', () => {
    const raw = (gameData.riskEvents.events as unknown as Record<string, unknown>[]).find((e) => e['id'] === 'engine_failure')!['params'];
    const p85 = engineParamsFromData(raw, 0.85, 'テスト');
    expect(p85.fullToLimpS).toBeCloseTo(60, 9);
    const r = run(start(p85), steps(60) - 1, 'full');
    expect(r.events).toEqual([[steps(36), ENGINE_EV_WARN], [steps(51), ENGINE_EV_FINAL]]);
    expect(r.s.limp).toBe(false);
    run(r, 1, 'full');
    expect(r.s.limp).toBe(true);
  });
});

describe('E1: 赤い線の最中には不調にならない（米PT の段の後に読む＝同じステップに固めた線も）', () => {
  it('熱が 1.0 に届いた同じステップに線が出たら不調にならず、線の間は 1.0 で待ち（段は限界）、線が消えた最初のステップで不調', () => {
    const r = nearLimp();
    run(r, 1, 'full', true); // 熱 1.0 に届いたステップに線（同じステップの commit）
    expect(r.s.heat).toBeGreaterThanOrEqual(1 - ENGINE_EPS);
    expect([r.s.limp, r.s.stage]).toEqual([false, ENGINE_FINAL]);
    run(r, steps(5), 'full', true);
    expect([r.s.heat, r.s.limp, r.s.stage, r.s.limps]).toEqual([1, false, ENGINE_FINAL, 0]);
    const lineEnd = r.i;
    run(r, 1, 'full', false);
    expect(r.s.limp).toBe(true);
    expect(r.s.limpStartS).toBeCloseTo((lineEnd + 1) * DT, 9);
    expect(r.events[r.events.length - 1]).toEqual([lineEnd + 1, ENGINE_EV_LIMP]);
  });
  it('線が 1 ステップおきに出ても、不調は線の無いステップにだけ始まる（4 回とも）', () => {
    const r = start();
    let startedInLine = 0;
    for (let k = 0; k < steps(100); k++) {
      const line = k % 2 === 0;
      const was = r.s.limps;
      run(r, 1, 'full', line);
      if (r.s.limps > was && line) startedInLine++;
    }
    expect(r.s.limps).toBeGreaterThanOrEqual(4);
    expect(startedInLine).toBe(0);
  });
  it('不調の間に線が来ても、沈み始め・輪の中・燃料切れになっても、不調はちょうど 8 秒で終わる（E5。入力も線も見ない）', () => {
    const r = run(nearLimp(), 1, 'full');
    run(r, steps(8) - 1, 'full', true, false);
    expect(r.s.limp).toBe(true);
    run(r, 1, 'full', true, false);
    expect(r.s.limp).toBe(false);
    expect(r.s.heat).toBe(P.recoverHeat);
  });
});

describe('E3・E4・canLimp: 巡航以下で熱は増えない・回数の上限なし・沈み始め／輪の中／燃料切れでは不調にならない', () => {
  it('E3: 巡航・静音・停止をどう並べても熱は増えず不調にならない（どの熱からでも）', () => {
    const bands: SpeedStep[] = ['cruise', 'silent', 'stop', 'cruise', 'cruise', 'stop', 'silent'];
    for (const h0 of [0, 0.3, 0.6, 0.85, 0.999, 1]) {
      const r = start({ ...P, startHeat: h0 });
      let prev = r.s.heat;
      for (let k = 0; k < steps(40); k++) {
        run(r, 1, bands[k % bands.length]!);
        expect(r.s.heat).toBeLessThanOrEqual(prev);
        prev = r.s.heat;
      }
      expect(r.s.limps, String(h0)).toBe(0);
      expect(r.s.heat).toBe(0);
    }
  });
  it('E4: 全速を続ければ 3 回目・4 回目も不調になる（30・50・70・90 秒。不調 8 秒＋回復から 12 秒）。不調の秒の和は回数 × 8', () => {
    const r = start();
    const starts: number[] = [];
    for (let k = 0; k < steps(98); k++) {
      const was = r.s.limps;
      run(r, 1, 'full');
      if (r.s.limps > was) starts.push(r.i);
    }
    expect(starts).toEqual([steps(30), steps(50), steps(70), steps(90)]);
    expect(r.s.limps).toBe(4);
    expect(r.s.limpS).toBeCloseTo(32, 6);
    expect([r.s.warns, r.s.finals]).toEqual([1, 4]);
  });
  it('canLimp が false（沈み始め・帰投の輪の中・燃料切れ）の間は熱 1.0 で待ち、true になった最初のステップで不調', () => {
    const r = nearLimp();
    run(r, steps(10), 'full', false, false);
    expect([r.s.heat, r.s.limp, r.s.limps]).toEqual([1, false, 0]);
    run(r, 1, 'full', false, true);
    expect(r.s.limp).toBe(true);
  });
  it('熱 1.0 で待っている間に巡航へ落とせば冷えて、不調にならない（限界の文の「巡航以下に落とせ」が本当）', () => {
    const r = run(nearLimp(), steps(3), 'full', true);
    run(r, 1, 'cruise', false);
    expect(r.s.limp).toBe(false);
    run(r, steps(5), 'cruise');
    expect(r.s.limps).toBe(0);
    expect(r.s.heat).toBeCloseTo(1 - 5 / 30 - DT / 30, 9);
  });
  it('体感の dt が揺れても（命中スロー 0.3 倍の混じり）不調の秒の和は 8 秒に 1 ステップの内', () => {
    const r = run(nearLimp(), 1, 'full');
    let k = 0;
    while (r.s.limp) run(r, 1, 'full', false, true, k++ % 3 === 0 ? DT * 0.3 : DT);
    expect(Math.abs(r.s.limpS - 8)).toBeLessThanOrEqual(DT + ENGINE_EPS);
    expect(r.s.heat).toBe(P.recoverHeat);
  });
});

describe('E6: 不調の間の入力（静音の上限まで・舵は残る・確保なし）', () => {
  const boat = boatParamsFromData(getBoatRecord(gameData, 'jp_t14'));
  it('engineCap01: T-14 は 14 / 31 kt。機関損傷で全速が 0.7 倍（21.7 kt）なら 14 / 21.7。静音の上限が全速以上なら 1', () => {
    expect(engineCap01(boat)).toBeCloseTo(14 / 31, 9);
    expect(engineCap01(boat) * boat.speedMaxMps).toBeCloseTo(boat.silentMaxMps, 9);
    expect(engineCap01({ silentMaxMps: boat.silentMaxMps, speedMaxMps: boat.speedMaxMps * 0.7 })).toBeCloseTo(14 / 21.7, 9);
    expect(engineCap01({ silentMaxMps: 10, speedMaxMps: 8 })).toBe(1);
  });
  it('不調でなければ元の input をそのまま返す。不調なら同じ capInput に針路（NaN も）を写し speed01 = min(元, cap01)。input は書き換えない', () => {
    const s = createEngineState(P);
    const input: BoatInput = { headingDeg: 135, speed01: 1 };
    const cap: BoatInput = { headingDeg: 0, speed01: 0 };
    const c01 = engineCap01(boat);
    expect(engineInput(s, input, cap, c01)).toBe(input);
    s.limp = true;
    const out = engineInput(s, input, cap, c01);
    expect(out).toBe(cap);
    expect(out).toEqual({ headingDeg: 135, speed01: c01 });
    expect(input).toEqual({ headingDeg: 135, speed01: 1 });
    input.headingDeg = NaN;
    input.speed01 = 0.2;
    expect(engineInput(s, input, cap, c01)).toBe(cap);
    expect(Number.isNaN(cap.headingDeg)).toBe(true);
    expect(cap.speed01).toBe(0.2); // 上限より遅い指令はそのまま（止まらない・速度の指令を 0 にしない）
    s.limp = false;
    expect(engineInput(s, input, cap, c01)).toBe(input);
  });
  it('不調の指令で走ると 31 kt から静音の上限 14 kt に落ちて保ち、舵は効く', () => {
    const s = createEngineState(P);
    s.limp = true;
    const st = { x: 0, y: 0, headingDeg: 0, speedMps: boat.speedMaxMps };
    const input: BoatInput = { headingDeg: 90, speed01: 1 };
    const cap: BoatInput = { headingDeg: 0, speed01: 0 };
    for (let k = 0; k < steps(10); k++) stepBoat(st, engineInput(s, input, cap, engineCap01(boat)), boat, DT * 4);
    expect(mpsToKt(st.speedMps)).toBeCloseTo(14, 6);
    expect(st.headingDeg).toBeCloseTo(90, 6);
  });
});

describe('E8・§7: 乱数を引かない・確保しない・テレメトリ', () => {
  it('作る・進める・入力・テレメトリのどれも SeededRng.prototype.next を 0 回（新しい系列なし）', () => {
    const spy = vi.spyOn(SeededRng.prototype, 'next');
    const r = start({ ...P, startHeat: DEBUG_ENGINE_HOT_HEAT });
    const t = createEngineTelemetry();
    const input: BoatInput = { headingDeg: 10, speed01: 1 };
    const cap: BoatInput = { headingDeg: 0, speed01: 0 };
    for (let k = 0; k < steps(120); k++) {
      run(r, 1, k % 900 < 700 ? 'full' : 'cruise', k % 300 < 40, k % 1000 > 20);
      engineInput(r.s, input, cap, 0.45);
      writeEngineTelemetry(t, r.s, P);
    }
    expect(r.s.limps).toBeGreaterThan(0);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
  it('ソース: 乱数・Math.random・atan2・Phaser・機関損傷（engineDamaged。E11 の別の状態）を使わず、毎ステップの関数（stepEngine・engineInput・engineCap01・engineLimpLeftS・writeEngineTelemetry）は new・配列・クロージャ・展開を書かない', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'core', 'engine-trouble.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(src).not.toMatch(/SeededRng|\brng\b|Math\.random|atan2|phaser|engineDamaged/i);
    for (const name of ['stepEngine', 'engineInput', 'engineCap01', 'engineLimpLeftS', 'writeEngineTelemetry']) {
      const m = new RegExp(`export function ${name}\\b[\\s\\S]*?\\n}`).exec(src);
      expect(m, name).not.toBeNull();
      const body = m![0].slice(m![0].indexOf('{'));
      expect(body, name).not.toMatch(/\bnew\b|\[|=>|\.\.\.|\{\s*\w+\s*:/);
    }
  });
  it('テレメトリ: 作ったときは on false（不調の無い任務の HUD は何も出さない）。写すと on・熱・段・不調の残りの秒（8 → 0）・出来事', () => {
    const t = createEngineTelemetry();
    expect(t).toEqual({ on: false, heat: 0, stage: ENGINE_OK, limpLeftS: 0, eventSeq: 0, lastEvent: ENGINE_EV_NONE });
    const r = run(nearLimp(), 1, 'full');
    writeEngineTelemetry(t, r.s, P);
    expect(t.on).toBe(true);
    expect([t.heat, t.stage, t.eventSeq, t.lastEvent]).toEqual([1, ENGINE_LIMP, 3, ENGINE_EV_LIMP]);
    expect(t.limpLeftS).toBeCloseTo(8, 9);
    run(r, steps(2.5), 'cruise');
    writeEngineTelemetry(t, r.s, P);
    expect(t.limpLeftS).toBeCloseTo(5.5, 9);
    run(r, steps(5.5), 'cruise');
    writeEngineTelemetry(t, r.s, P);
    expect([t.limpLeftS, t.stage, t.lastEvent, t.heat]).toEqual([0, ENGINE_WARN, ENGINE_EV_RECOVER, P.recoverHeat]);
  });
});
