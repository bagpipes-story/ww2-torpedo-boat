// 機関の不調の本体（v0.6.5。core/engine-trouble。spec-v065 §C.2 の E1〜E8・§G.1）の規則: 赤い線の間は 1.0 で待つ（同じステップの線も）・回数の上限なし・
// 沈み始め／輪の中／燃料切れでは不調にならない・不調はちょうど 8 秒で操作なしに戻る・巡航以下で熱は増えない・入力の差し替え（確保なし）・乱数 0 回・テレメトリ。
// 値は tests/engine-trouble-kit の固定の fixture（data の値は tests/engine-data）。熱の傾き・段・回復の後の保ちは tests/engine-trouble.test.ts。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { DEBUG_ENGINE_HOT_HEAT } from '../src/config/engine-config';
import { gameData, getBoatRecord } from '../src/config/game-data';
import { boatParamsFromData, stepBoat, type BoatInput, type SpeedStep } from '../src/core/boat-motion';
import {
  ENGINE_EPS,
  ENGINE_EV_LIMP,
  ENGINE_EV_NONE,
  ENGINE_EV_RECOVER,
  ENGINE_FINAL,
  ENGINE_LIMP,
  ENGINE_OK,
  ENGINE_WARN,
  createEngineState,
  createEngineTelemetry,
  engineCap01,
  engineInput,
  writeEngineTelemetry,
} from '../src/core/engine-trouble';
import { SeededRng } from '../src/core/rng';
import { mpsToKt } from '../src/core/units';
import { DT, P, nearLimp, run, start, steps } from './engine-trouble-kit';

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
