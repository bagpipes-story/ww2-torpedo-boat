// v0.6.2 実機 1 回目「2本目が当たりそうなのにそれが成果に反映されないと残念」: 終わり際の当たり（core/torpedo-targets）。
// 走査（scanTargets）は v0.6.2 の torpedo-pool の判定と同じ（乱数の 400 通り）、すべて出た後だけ沈む船体へ当たる（演出中と沈み始めて settleS まで）、
// 記録だけ（systems/torpedo-hits の onLateHit は被弾・撃沈・命中スローを触らない）、外れの確定は窓の後（remainingTorpedoesSettled。systems/destroyer-step が毎ステップ）。
import { describe, expect, it } from 'vitest';
import type { ShotRecord } from '../src/core/hit-rate';
import { createTorpedoState, type TorpedoState } from '../src/core/torpedo';
import { createCircles, fillHullCircles, pointHitsHull, type Circle } from '../src/core/torpedo-solver';
import { createTargetScan, lateHitOpen, remainingTorpedoesSettled, scanTargets, type TorpedoTarget } from '../src/core/torpedo-targets';
import { torpedoEventsFor, type TorpedoHitWorld } from '../src/systems/torpedo-hits';

const SETTLE = 3;

interface Ship extends TorpedoTarget {
  circles: Circle[];
  state: { x: number; y: number };
  out: boolean;
  sinking: boolean;
  sunk: boolean;
  withdrawn: boolean;
  sinkStartS: number;
}

/** 東向き 100 m × 10 m の船体（中心 x, y） */
function ship(x: number, y: number, over: Partial<Ship> = {}): Ship {
  const circles = createCircles(5);
  fillHullCircles(circles, x, y, 90, 100, 10);
  const s: Ship = { circles, state: { x, y }, out: false, sinking: false, sunk: false, withdrawn: false, sinkStartS: NaN, ...over };
  if (s.sinking || s.withdrawn) s.out = true;
  return s;
}

/** v0.6.2 の torpedo-pool の走査（浮いている艦だけ。当たりは若い添字、最寄りは距離の二乗） */
function oldScan(x: number, y: number, armed: boolean, targets: readonly TorpedoTarget[]): { hit: number; nearest: number } {
  let hit = -1;
  let nearest = -1;
  let nearestD2 = Infinity;
  for (let k = 0; k < targets.length; k++) {
    const t = targets[k]!;
    if (t.out) continue;
    if (armed && hit < 0 && pointHitsHull(x, y, t.circles)) hit = k;
    const d2 = (x - t.state.x) ** 2 + (y - t.state.y) ** 2;
    if (d2 < nearestD2) {
      nearestD2 = d2;
      nearest = k;
    }
  }
  return { hit, nearest };
}

describe('scanTargets（v0.6.2 実機 1 回目で torpedo-pool から切り出し）', () => {
  it('浮いている艦の当たり・最寄りは v0.6.2 と同じ（乱数の 400 通り。終わり際の当たりを見ない・見るの両方）', () => {
    let seed = 11;
    const r = (): number => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
    const sc = createTargetScan();
    for (let n = 0; n < 400; n++) {
      const ships = [0, 1, 2].map(() => ship(r() * 400, r() * 400, r() < 0.3 ? { sinking: true, sunk: r() < 0.5, sinkStartS: 10 } : r() < 0.2 ? { withdrawn: true } : {}));
      const x = r() * 400;
      const y = r() * 400;
      const armed = r() < 0.8;
      const old = oldScan(x, y, armed, ships);
      for (const now of [NaN, 11, 20]) {
        scanTargets(sc, x, y, armed, ships, now, SETTLE);
        expect([sc.hit, sc.nearest], `${n} ${now}`).toEqual([old.hit, old.nearest]);
        if (old.nearest >= 0 || Number.isNaN(now)) expect(sc.late, `${n} ${now}`).toBe(-1);
      }
    }
  });
  it('すべて出た後だけ、沈む船体（演出中・沈み始めて 3 秒未満）に当たる。武装前・退いた艦・窓の後・時計 NaN は当たらない', () => {
    const sc = createTargetScan();
    const at = (ships: Ship[], now: number, armed = true): number => {
      scanTargets(sc, 0, 0, armed, ships, now, SETTLE);
      return sc.late;
    };
    expect(at([ship(0, 0, { sinking: true, sinkStartS: 10 })], 11)).toBe(0); // 演出中
    expect(at([ship(0, 0, { sinking: true, sinkStartS: 10 })], 30)).toBe(0); // 演出が長引いても演出中は当たる
    expect(at([ship(0, 0, { sinking: true, sunk: true, sinkStartS: 10 })], 12.99)).toBe(0); // 演出の後、沈み始めて 3 秒未満
    expect(at([ship(0, 0, { sinking: true, sunk: true, sinkStartS: 10 })], 13)).toBe(-1); // 窓の後
    expect(at([ship(0, 0, { sinking: true, sinkStartS: 10 })], 11, false)).toBe(-1); // 武装前
    expect(at([ship(0, 0, { sinking: true, sinkStartS: 10 })], NaN)).toBe(-1);
    expect(at([ship(0, 0, { withdrawn: true })], 11)).toBe(-1);
    expect(at([ship(500, 500, { sinking: true, sinkStartS: 10 })], 11)).toBe(-1); // 船体の外
    // 2 隻とも沈む: 添字の若い方
    expect(at([ship(500, 500, { sinking: true, sinkStartS: 9 }), ship(0, 0, { sinking: true, sinkStartS: 10 }), ship(0, 0, { sinking: true, sinkStartS: 10 })], 11)).toBe(1);
    // 浮いている艦が残っていれば沈む船体は抜ける（v0.6.2 のまま。魚雷は残りの艦へ走る）
    scanTargets(sc, 0, 0, true, [ship(0, 0, { sinking: true, sinkStartS: 10 }), ship(2000, 0)], 11, SETTLE);
    expect([sc.late, sc.hit, sc.nearest]).toEqual([-1, -1, 1]);
  });
  it('lateHitOpen と remainingTorpedoesSettled（外れの確定）: すべて出て、どの沈む船体も演出が終わり沈み始めて 3 秒経った。すべて退いたならすぐ', () => {
    const sinking = ship(0, 0, { sinking: true, sinkStartS: 10 });
    expect(lateHitOpen(sinking, 10, SETTLE)).toBe(true);
    expect(remainingTorpedoesSettled([sinking], 12, SETTLE)).toBe(false);
    sinking.sunk = true; // 演出は 2 秒
    expect(remainingTorpedoesSettled([sinking], 12, SETTLE)).toBe(false);
    expect(remainingTorpedoesSettled([sinking], 13, SETTLE)).toBe(true);
    expect(remainingTorpedoesSettled([sinking], 12, 0)).toBe(true); // settle 0 なら演出の終わり（v0.6.2 と同じ）
    expect(remainingTorpedoesSettled([sinking, ship(100, 100)], 99, SETTLE)).toBe(false); // 浮いている艦がいる
    expect(remainingTorpedoesSettled([ship(0, 0, { withdrawn: true }), ship(9, 9, { withdrawn: true })], 0, SETTLE)).toBe(true);
    expect(remainingTorpedoesSettled([ship(0, 0, { withdrawn: true }), ship(9, 9, { sinking: true, sunk: true, sinkStartS: 5 })], 7, SETTLE)).toBe(false);
  });
});

/** systems/torpedo-hits の世界の形だけ（艦は takeHit・playSinking を数える。一斉発射の破棄も数える） */
function hitWorld(): { w: TorpedoHitWorld; ship: { takes: number; sinks: number[]; done: (() => void) | null }; out: { cleared: number }; g: { allSettled: boolean } } {
  const sh = { takes: 0, sinks: [] as number[], done: null as (() => void) | null };
  const d = {
    takeHit: () => ++sh.takes >= 1,
    playSinking: (now: number, onDone: () => void) => {
      sh.sinks.push(now);
      sh.done = onDone;
    },
  };
  const out = { cleared: 0 };
  const g = { ships: [d], allOut: true, allSettled: false };
  const w = {
    shots: [] as ShotRecord[],
    hits: 0,
    slowMoLeftS: 0,
    setup: { slowMoSeconds: 1.2 },
    destroyers: g,
    launcher: { clearQueue: () => void out.cleared++ },
    dawn: { reached: false, retireHeadingDeg: NaN },
    stepTimeS: 42,
  } as unknown as TorpedoHitWorld;
  return { w, ship: sh, out, g };
}

function torpedo(over: Partial<TorpedoState> = {}): TorpedoState {
  return { ...createTorpedoState(), rangeAtLaunchM: 1500, kpiTarget: true, leadErrDeg: 0.5, ...over };
}

describe('systems/torpedo-hits の onLateHit（記録だけ）', () => {
  it('命中として記録し hits を足して爆発。艦の被弾・撃沈・命中スロー・一斉発射の破棄は触らない。不発は命中（不発）で hits は足さない', () => {
    const h = hitWorld();
    const booms: boolean[] = [];
    const ev = torpedoEventsFor(h.w, { onTorpedoHit: (_x: number, _y: number, dud: boolean) => void booms.push(dud), onDestroyerSunk: () => undefined } as never);
    ev.onLateHit(0, 1, 2, torpedo());
    ev.onLateHit(0, 1, 2, torpedo({ dud: true }));
    expect(h.w.shots.map((s) => [s.hit, s.dud, s.rangeM, s.kpiTarget])).toEqual([
      [true, false, 1500, true],
      [true, true, 1500, true],
    ]);
    expect([h.w.hits, h.w.slowMoLeftS, h.ship.takes, h.ship.sinks.length, h.out.cleared]).toEqual([1, 0, 0, 0, 0]);
    expect(booms).toEqual([false, true]);
  });
  it('ふつうの命中は今までどおり（被弾・撃沈・命中スロー・一斉発射の破棄）。沈み始めた時計を艦に渡し、演出の終わりでは外れの確定をしない', () => {
    const h = hitWorld();
    let sunkEvents = 0;
    const ev = torpedoEventsFor(h.w, { onTorpedoHit: () => undefined, onDestroyerSunk: () => void sunkEvents++ } as never);
    ev.onHit(0, 1, 2, torpedo());
    expect([h.w.hits, h.w.slowMoLeftS, h.ship.takes, h.ship.sinks, h.out.cleared]).toEqual([1, 1.2, 1, [42], 1]);
    h.g.allSettled = true;
    h.ship.done!(); // 世界の形に resolveRemainingAsMisses は無い（呼べば落ちる）
    expect(sunkEvents).toBe(1);
  });
});
