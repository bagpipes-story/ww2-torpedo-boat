// 機関の不調の世界側（v0.6.5。systems/engine-trouble・systems/world-boat。spec-v065 §C.1・§E.4 の S4）:
// 入力の差し替え（不調でなければ w.input そのもの・不調なら同じ写しに上限・燃料切れの漂流が優先）、米PT の段の後に読む赤い線（owner ≥ 0）・沈み始め／輪の中／燃料切れでは不調にならない、
// jp_05 の本物の値と stepBoat で「全速を続ける → 30 秒で不調 → 14 kt まで落ちる → 8 秒で戻ってまた全速」、乱数 0 回、テレメトリ、?debug&engoff／enghot の組み立て。
import { describe, expect, it, vi } from 'vitest';
import { DEBUG_ENGINE_HOT_HEAT } from '../src/config/engine-config';
import { gameData } from '../src/config/game-data';
import { FIXED_STEP_S } from '../src/config/step-config';
import { nextSpeedBand, type BoatInput, type BoatState, type SpeedStep } from '../src/core/boat-motion';
import { ENGINE_LIMP, ENGINE_OK, createEngineTelemetry } from '../src/core/engine-trouble';
import { createFuelState } from '../src/core/fuel';
import { SeededRng } from '../src/core/rng';
import { mpsToKt } from '../src/core/units';
import { EngineTrouble, type EngineWorldView } from '../src/systems/engine-trouble';
import { stepPlayerBoat, type PlayerBoatWorld } from '../src/systems/world-boat';
import { DRIFT_INPUT } from '../src/systems/world-events';
import { buildWorldSetup } from '../src/systems/world-setup';

const DT = FIXED_STEP_S;
const S = buildWorldSetup(gameData, 'jp_05');
const P = S.engine!;
const steps = (s: number): number => Math.round(s / DT);

/** 世界から読む形だけ（MissionWorld と同じ鍵）。owner は米PT の隊の攻撃の最中 */
function view(over: Partial<{ band: SpeedStep; owner: number; sinking: boolean; atHome: boolean; empty: boolean }> = {}): EngineWorldView & { band: SpeedStep; pts: { section: { owner: number } }; boat: { sinking: boolean }; atHome: boolean; fuel: { empty: boolean }; stepTimeS: number } {
  return {
    input: { headingDeg: 90, speed01: 1 },
    params: { silentMaxMps: S.boatParams.silentMaxMps, speedMaxMps: S.boatParams.speedMaxMps },
    band: over.band ?? 'full',
    pts: { section: { owner: over.owner ?? -1 } },
    boat: { sinking: over.sinking ?? false },
    atHome: over.atHome ?? false,
    fuel: { empty: over.empty ?? false },
    stepTimeS: 0,
  };
}
function stepN(e: EngineTrouble, w: ReturnType<typeof view>, n: number): void {
  for (let k = 0; k < n; k++) {
    w.stepTimeS += DT;
    e.step(w, DT);
  }
}

describe('EngineTrouble（世界側の状態と入力の差し替え）', () => {
  it('不調でなければ w.input そのもの（同じ object・書き換えない）。不調なら同じ写しに針路を写し、速さは静音の上限 / 今の全速まで', () => {
    const e = new EngineTrouble(P);
    const w = view();
    expect(e.input(w)).toBe(w.input);
    stepN(e, w, steps(P.fullToLimpS));
    expect(e.state.limp).toBe(true);
    const a = e.input(w);
    expect(a).not.toBe(w.input);
    expect(a.headingDeg).toBe(90);
    expect(a.speed01).toBeCloseTo(S.boatParams.silentMaxMps / S.boatParams.speedMaxMps, 12);
    expect(w.input).toEqual({ headingDeg: 90, speed01: 1 });
    // 静音より遅い指令はそのまま（上限だけ）。針路 NaN（針路を保つ）も写す。写しは毎回同じ object（確保なし）
    (w.input as BoatInput).speed01 = 0.2;
    (w.input as BoatInput).headingDeg = NaN;
    const b = e.input(w);
    expect(b).toBe(a);
    expect(b.speed01).toBe(0.2);
    expect(Number.isNaN(b.headingDeg)).toBe(true);
    // 機関損傷で全速が落ちれば比は上がる（上限は静音の速さのまま）
    (w.input as BoatInput).speed01 = 1;
    const hurt = { ...w, params: { silentMaxMps: S.boatParams.silentMaxMps, speedMaxMps: S.boatParams.speedMaxMps * 0.7 } };
    expect(e.input(hurt).speed01 * hurt.params.speedMaxMps).toBeCloseTo(S.boatParams.silentMaxMps, 9);
  });

  it('赤い線（米PT の隊の owner ≥ 0）の間は熱 1.0 で待ち、線が消えた次のステップで不調。沈み始め・輪の中・燃料切れでも待つ', () => {
    for (const over of [{ owner: 0 }, { owner: 1 }, { sinking: true }, { atHome: true }, { empty: true }]) {
      const e = new EngineTrouble(P);
      const w = view(over);
      stepN(e, w, steps(P.fullToLimpS) + steps(5));
      expect([e.state.heat, e.state.limp], JSON.stringify(over)).toEqual([1, false]);
      w.pts.section.owner = -1;
      w.boat.sinking = false;
      w.atHome = false;
      w.fuel.empty = false;
      stepN(e, w, 1);
      expect(e.state.limp, JSON.stringify(over)).toBe(true);
      expect(e.state.limpStartS).toBeCloseTo(w.stepTimeS, 9);
    }
    // 米PT の隊の無い世界（null）は線なしとして扱う
    const e = new EngineTrouble(P);
    const w = { ...view(), pts: null };
    for (let k = 0; k < steps(P.fullToLimpS); k++) e.step(w, DT);
    expect(e.state.limp).toBe(true);
  });

  it('時計は渡された dt（世界の feelDt）: 命中スロー（0.3 倍）の間は熱の溜まりも 0.3 倍', () => {
    const e = new EngineTrouble(P);
    const w = view();
    for (let k = 0; k < steps(10); k++) e.step(w, DT * 0.3);
    expect(e.state.heat).toBeCloseTo((10 * 0.3) / P.fullToLimpS, 9);
  });

  it('テレメトリ: 写すと on が立ち、熱・段・不調の残りの秒・出来事が状態と同じ', () => {
    const e = new EngineTrouble(P);
    const t = createEngineTelemetry();
    expect(t.on).toBe(false);
    const w = view();
    stepN(e, w, steps(P.fullToLimpS) + steps(2));
    e.writeTelemetry(t);
    expect(t).toEqual({ on: true, heat: e.state.heat, stage: ENGINE_LIMP, limpLeftS: (e.state.heat - P.recoverHeat) * P.silentCoolS, eventSeq: e.state.eventSeq, lastEvent: e.state.lastEvent });
    expect(t.limpLeftS).toBeCloseTo((1 - P.recoverHeat) * P.silentCoolS - 2, 6);
  });
});

/** world-boat と mission-world の順（自艇 → 速力帯 → 米PT の段（ここでは owner を書くだけ）→ 機関）だけの小さな世界。jp_05 の本物の値と stepBoat */
function miniWorld(engine: boolean) {
  const boat: BoatState = { ...S.playerStart, speedMps: 0 };
  const input = { headingDeg: 180, speed01: 1 }; // 南へ（帰投の輪から離れて走り続ける。海域の縁は位置だけを止めるので速さは変わらない）
  const w: PlayerBoatWorld & { boat: { state: BoatState; sinking: boolean }; fuel: { gal: number; empty: boolean }; engine: EngineTrouble | null; band: SpeedStep; pts: { section: { owner: number } }; stepTimeS: number } = {
    boat: { state: boat, sinking: false },
    setup: S,
    params: { ...S.boatParams },
    input,
    fuel: createFuelState(S.fuelStartGal),
    fuelCurve: S.fuelCurve,
    returnPoint: S.mission.returnPoint,
    grounded: false,
    atHome: false,
    events: { onGrounded: () => {} },
    engine: engine ? new EngineTrouble(P) : null,
    band: 'stop',
    pts: { section: { owner: -1 } },
    stepTimeS: 0,
  };
  const step = (): void => {
    w.stepTimeS += DT;
    stepPlayerBoat(w, DT * S.timeScale);
    w.band = nextSpeedBand(w.band, boat.speedMps, w.params);
    w.engine?.step(w, DT);
  };
  return { w, boat, step };
}

describe('world-boat の入力（jp_05 の本物の値。spec §G.4 の秒の目安）', () => {
  it('全速を続ける: 全速の帯から約 18 秒で過熱・25.5 秒で限界・30 秒で不調、不調の間は 14 kt まで（減速の後）、ちょうど 8 秒で戻ってまた全速', () => {
    const { w, boat, step } = miniWorld(true);
    const e = w.engine!;
    let fullAt = NaN;
    let warnAt = NaN;
    let finalAt = NaN;
    let limpAt = NaN;
    let recoverAt = NaN;
    let maxKtLate = 0;
    let maxKtAfter = 0;
    for (let i = 0; i < steps(60); i++) {
      const was = e.state.stage;
      const wasLimp = e.state.limp;
      step();
      const t = w.stepTimeS;
      if (Number.isNaN(fullAt) && w.band === 'full') fullAt = t;
      if (was < 1 && e.state.stage === 1 && Number.isNaN(warnAt)) warnAt = t;
      if (was < 2 && e.state.stage === 2 && Number.isNaN(finalAt)) finalAt = t;
      if (!wasLimp && e.state.limp && Number.isNaN(limpAt)) limpAt = t;
      if (wasLimp && !e.state.limp && Number.isNaN(recoverAt)) recoverAt = t;
      if (e.state.limp && t - e.state.limpStartS > 2) maxKtLate = Math.max(maxKtLate, mpsToKt(boat.speedMps));
      if (!Number.isNaN(recoverAt)) maxKtAfter = Math.max(maxKtAfter, mpsToKt(boat.speedMps));
    }
    expect(warnAt - fullAt).toBeCloseTo(18, 1);
    expect(finalAt - fullAt).toBeCloseTo(25.5, 1);
    expect(limpAt - fullAt).toBeCloseTo(30, 1);
    expect(recoverAt - limpAt).toBeCloseTo(8, 6);
    expect(maxKtLate).toBeLessThanOrEqual(mpsToKt(S.boatParams.silentMaxMps) + 0.5);
    expect(maxKtLate).toBeGreaterThan(mpsToKt(S.boatParams.silentMaxMps) - 0.5); // 止まらない（静音の上限で走り続ける）
    expect(maxKtAfter).toBeGreaterThan(30); // 戻った後はまた全速
    expect(w.input).toEqual({ headingDeg: 180, speed01: 1 }); // 入力は書き換えない
    expect(w.atHome).toBe(false);
  });

  it('不調の無い世界（engine null）は w.input そのまま（全速のまま）。燃料切れは不調より漂流が優先', () => {
    const off = miniWorld(false);
    for (let i = 0; i < steps(45); i++) off.step();
    expect(mpsToKt(off.boat.speedMps)).toBeGreaterThan(30);
    const on = miniWorld(true);
    for (let i = 0; i < steps(32); i++) on.step();
    expect(on.w.engine!.state.limp).toBe(true);
    on.w.fuel.empty = true;
    const spy = vi.fn();
    on.w.engine!.input = spy as never;
    on.step();
    expect(spy).not.toHaveBeenCalled(); // DRIFT_INPUT が先（舵も効かない）
    expect(DRIFT_INPUT.speed01).toBe(0);
  });

  it('乱数を引かない（SeededRng.prototype.next が 0 回）', () => {
    const spy = vi.spyOn(SeededRng.prototype, 'next');
    const { step } = miniWorld(true);
    for (let i = 0; i < steps(60); i++) step();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('?debug&engoff／enghot の組み立て（config/debug-setup が SetupOptions に渡す鍵）', () => {
  it('engineOff なら jp_05 も engine の鍵ごと出ない（世界は EngineTrouble を作らない）。engineHot は出撃時の熱 0.75 で、熱の段は過熱から', () => {
    expect('engine' in buildWorldSetup(gameData, 'jp_05', { engineOff: true })).toBe(false);
    const hot = buildWorldSetup(gameData, 'jp_05', { engineHot: true }).engine!;
    expect(hot.startHeat).toBe(DEBUG_ENGINE_HOT_HEAT);
    const e = new EngineTrouble(hot);
    expect(e.state.heat).toBe(DEBUG_ENGINE_HOT_HEAT);
    expect(e.state.stage).toBe(1);
    expect(new EngineTrouble(P).state.stage).toBe(ENGINE_OK);
  });
});
