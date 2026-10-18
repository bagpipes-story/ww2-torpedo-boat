// WorldDawn（v0.6.1。systems/world-dawn）の夜明けのラッチと caughtOutside の規則（レビュー [2]・[3] の直し）。
// [2] 夜明けのフレームが輪の中で終わらなければ caughtOutside（夜明け後のステップが輪の外で終われば後からも立てる）。
// [3] 沈没中・座礁中は夜明けをラッチしない（任務が終わる途中。夜明け後の終わり・空襲の 1 行・夜明けの帯にしない）。
import { describe, expect, it } from 'vitest';
import type { BoatState } from '../src/core/boat-motion';
import { WorldDawn, type DawnStrike, type DawnWorldView } from '../src/systems/world-dawn';
import type { WorldSetup } from '../src/systems/world-setup';

const STEP_S = 1 / 60;
const DURATION_S = 10;

interface FakeView extends DawnWorldView {
  stepTimeS: number;
  atHome: boolean;
  grounded: boolean;
  boat: { state: BoatState; sinking: boolean };
}

function view(): FakeView {
  return { stepTimeS: 0, atHome: false, grounded: false, boat: { state: { x: 0, y: 0, headingDeg: 0, speedMps: 0 } as BoatState, sinking: false }, escort: null };
}

function fakeStrike(log: string[]): DawnStrike {
  return {
    state: null as never,
    p: null as never,
    active: false,
    start: () => log.push('start'),
    step: () => log.push('step'),
    updateVisuals: () => log.push('vis'),
    destroy: () => log.push('destroy'),
  };
}

const scene = { cameras: { main: { setBackgroundColor: () => undefined } } } as never;
const setup = { durationS: DURATION_S, dawnAir: { playAs: 'enemy' } } as WorldSetup;

/** MissionWorld.stepFn と同じ順: 時計を進めて latch →（自艇を動かす＝before で atHome などを変える）→ step */
function runStep(d: WorldDawn, w: FakeView, before?: (w: FakeView) => void): void {
  w.stepTimeS += STEP_S;
  d.latch(w);
  before?.(w);
  d.step(STEP_S, w);
}

/** 夜明けの 1 ステップ前まで進める（夜は何も起きない） */
function runNight(d: WorldDawn, w: FakeView): void {
  w.stepTimeS = DURATION_S - STEP_S / 2;
  d.latch(w);
  d.step(STEP_S, w);
}

describe('WorldDawn.caughtOutside（レビュー [2]: 夜明けのフレームの途中で輪を出る）', () => {
  it('夜明けに輪の中でラッチ → 次のステップで輪の外なら caughtOutside が立つ。後で輪に戻っても消えない', () => {
    const log: string[] = [];
    const d = new WorldDawn(scene, setup, fakeStrike(log));
    const w = view();
    w.atHome = true;
    runNight(d, w);
    expect(d.reached).toBe(false);
    runStep(d, w); // 夜明けのステップ: 輪の中のまま
    expect(d.reached).toBe(true);
    expect(d.caughtOutside).toBe(false);
    runStep(d, w, (v) => (v.atHome = false)); // 同じフレームの次のステップで輪を出る
    expect(d.caughtOutside).toBe(true);
    runStep(d, w, (v) => (v.atHome = true));
    expect(d.caughtOutside).toBe(true);
    expect(log).toEqual(['start', 'step', 'step', 'step']);
  });

  it('夜明けのステップの中で輪を出ても（ラッチは前の位置＝輪の中）、そのステップの step で立つ', () => {
    const d = new WorldDawn(scene, setup, null);
    const w = view();
    w.atHome = true;
    runNight(d, w);
    runStep(d, w, (v) => (v.atHome = false));
    expect(d.reached).toBe(true);
    expect(d.caughtOutside).toBe(true);
  });

  it('夜明け後も輪の中にいれば caughtOutside は false のまま', () => {
    const d = new WorldDawn(scene, setup, null);
    const w = view();
    w.atHome = true;
    runNight(d, w);
    for (let i = 0; i < 10; i++) runStep(d, w);
    expect(d.reached).toBe(true);
    expect(d.caughtOutside).toBe(false);
  });

  it('夜明け前は step で輪の外にいても何もしない（夜は v0.6.0 と同じ）', () => {
    const log: string[] = [];
    const d = new WorldDawn(scene, setup, fakeStrike(log));
    const w = view();
    for (let i = 0; i < 300; i++) runStep(d, w, (v) => (v.atHome = i % 2 === 0));
    expect(d.reached).toBe(false);
    expect(d.caughtOutside).toBe(false);
    expect(log).toEqual([]);
  });

  it('夜明け後に沈没し始めたら（atHome は止まる）step では立てない', () => {
    const d = new WorldDawn(scene, setup, null);
    const w = view();
    w.atHome = true;
    runNight(d, w);
    runStep(d, w);
    runStep(d, w, (v) => {
      v.boat.sinking = true;
      v.atHome = false;
    });
    expect(d.reached).toBe(true);
    expect(d.caughtOutside).toBe(false);
  });
});

describe('WorldDawn.latch（レビュー [3]: 沈没中・座礁中は夜明けをラッチしない）', () => {
  it('沈没中に夜明けの時刻を過ぎても reached は立たず、空襲は始まらない（その後のステップも）', () => {
    const log: string[] = [];
    const d = new WorldDawn(scene, setup, fakeStrike(log));
    const w = view();
    runNight(d, w);
    w.boat.sinking = true;
    for (let i = 0; i < 120; i++) runStep(d, w);
    expect(d.reached).toBe(false);
    expect(d.caughtOutside).toBe(false);
    expect(d.strikeActive).toBe(false);
    expect(log).toEqual([]);
  });

  it('座礁中に夜明けの時刻を過ぎても reached は立たず、空襲は始まらない（その後のステップも）', () => {
    const log: string[] = [];
    const d = new WorldDawn(scene, setup, fakeStrike(log));
    const w = view();
    runNight(d, w);
    w.grounded = true;
    for (let i = 0; i < 120; i++) runStep(d, w);
    expect(d.reached).toBe(false);
    expect(d.caughtOutside).toBe(false);
    expect(log).toEqual([]);
  });

  it('夜明けのステップの中で沈没・座礁が始まったら（ラッチの後）、夜明け後の終わりのまま', () => {
    for (const lose of [(v: FakeView) => (v.boat.sinking = true), (v: FakeView) => (v.grounded = true)]) {
      const log: string[] = [];
      const d = new WorldDawn(scene, setup, fakeStrike(log));
      const w = view();
      runNight(d, w);
      runStep(d, w, lose);
      expect(d.reached).toBe(true);
      expect(d.caughtOutside).toBe(true);
      expect(log).toEqual(['start', 'step']);
    }
  });
});
