// v0.8.5 S1（spec-v0850 §4.1）: 生存者の救助の純粋な規則（core/rescue）と達成（core/mission-flow の rescueObjectiveDone）。
// 速さの縁 ±0.1 kt・距離の縁・1 名 0.8 秒（60 Hz で 48 ステップ）・満員で止まる・群の途中で満員・一番近い群 1 つ・時計の戻り・輪の外では移さない（1 名 0.25 秒）・
// 着弾 1 発 1 名（20 m の内の一番近い群だけ）・救助の時間の終わり・沈没・帰投・漂流・同じ入力で同じ出力・作る関数のほかの本体に確保なし・乱数は群のずれだけ。
import { describe, expect, it, vi } from 'vitest';
import { gameData } from '../src/config/game-data';
import { endCountsAsReturn, rescueObjectiveDone, type MissionEndReason } from '../src/core/mission-flow';
import {
  createRescueState, finishRescue, nearestRescueGroup, RESCUE_FIELD_SEED_OFFSET, rescueEndAfloat, rescueOnWater, rescueShell, rescueTimeUp, rollRescueGroups, stepRescue, type RescueRules, type RescueState,
} from '../src/core/rescue';
import { SeededRng } from '../src/core/rng';
import { ktToMps } from '../src/core/units';
import { buildWorldSetup } from '../src/systems/world-setup';
import { REASON_LABEL } from '../src/ui/result-heading';
import { code, imports, scanAllocations } from './core-rules-kit';

const S = buildWorldSetup(gameData, 'us_07');
const R: RescueRules = S.rescue!;
const HALF = S.boatHalfLengthM;
const DT = 1 / 60;
const SLOW = ktToMps(4);
const FAST = ktToMps(20);

/** 群を 1 つ（か渡した群）だけにした値（フィッチはそのまま） */
const rules = (groups: { x: number; y: number; count: number }[], over: Partial<RescueRules> = {}): RescueRules => ({ ...R, groups, ...over });
const ONE = rules([{ x: 1000, y: 1000, count: 7 }]);
const steps = (st: RescueState, r: RescueRules, n: number, x: number, y: number, v = SLOW, afloat = true): void => {
  for (let k = 0; k < n; k++) stepRescue(st, r, x, y, v, afloat, DT);
};

describe('data（us_07。spec §4.1）', () => {
  it('12 群・60 名・20 名まで・40 m ＋ 艇の半長・5 kt・1 名 0.8 秒・移す 0.25 秒・20 m・40 名で達成・フィッチの輪 180 m。系列は seed+47', () => {
    expect([R.groups.length, R.groups.reduce((s, g) => s + g.count, 0), R.capacity, R.pickupM, R.pickupMaxMps, R.perPersonS, R.transferPerPersonS, R.shellKill2, R.objectiveDelivered, R.fitch.ring2]).toEqual([12, 60, 20, 40, ktToMps(5), 0.8, 0.25, 400, 40, 180 * 180]);
    expect(RESCUE_FIELD_SEED_OFFSET).toBe(47);
    const st = createRescueState(R, HALF);
    expect([st.n, rescueOnWater(st), st.reach2]).toEqual([12, 60, (40 + HALF) * (40 + HALF)]);
    expect(Array.from(st.gx)).toEqual(R.groups.map((g) => g.x));
  });
});

describe('拾う', () => {
  it('1 名 0.8 秒（60 Hz の 48 ステップ目）。続けて 7 名で群が空き、その後は拾わない', () => {
    const st = createRescueState(ONE, HALF);
    steps(st, ONE, 47, 1000, 1000);
    expect(st.aboard).toBe(0);
    steps(st, ONE, 1, 1000, 1000);
    expect([st.aboard, st.left[0], st.pickSeq, st.pickRun, st.pickGroup]).toEqual([1, 6, 1, 1, 0]);
    steps(st, ONE, 48 * 6, 1000, 1000);
    expect([st.aboard, st.left[0], st.pickSeq, st.pickRun, st.pickGroup, rescueOnWater(st)]).toEqual([7, 0, 7, 7, -1, 0]);
    steps(st, ONE, 600, 1000, 1000);
    expect(st.aboard).toBe(7);
  });
  it('速さの縁: 5 kt ちょうど・4.9 kt は拾う、5.1 kt は拾わない（時計も進まない）', () => {
    for (const [kt, want] of [[5, 1], [4.9, 1], [5.1, 0]] as const) {
      const st = createRescueState(ONE, HALF);
      steps(st, ONE, 48, 1000, 1000, ktToMps(kt));
      expect([st.aboard, Math.abs(st.pickS) < 1e-9], `${kt} kt`).toEqual([want, true]);
    }
  });
  it('距離の縁: 中心から pickup_m ＋ 艇の半長の 0.01 m 内は拾う・0.01 m 外は拾わない', () => {
    const reach = R.pickupM + HALF;
    for (const [d, want] of [[reach - 0.01, 1], [reach + 0.01, 0]] as const) {
      const st = createRescueState(ONE, HALF);
      steps(st, ONE, 48, 1000 + d, 1000);
      expect(st.aboard, `${d} m`).toBe(want);
    }
  });
  it('離れれば時計は 0 に戻す（1 名ずつは数えたまま）: 0.5 秒 → 1 ステップ外 → 0.5 秒では拾わず、続けて 0.8 秒で拾う', () => {
    const st = createRescueState(ONE, HALF);
    steps(st, ONE, 30, 1000, 1000);
    steps(st, ONE, 1, 1200, 1000);
    expect([st.pickS, st.pickGroup]).toEqual([0, -1]);
    steps(st, ONE, 30, 1000, 1000);
    expect(st.aboard).toBe(0);
    steps(st, ONE, 18, 1000, 1000);
    expect(st.aboard).toBe(1);
    // 速すぎる 1 ステップも時計を戻す
    steps(st, ONE, 40, 1000, 1000);
    steps(st, ONE, 1, 1000, 1000, FAST);
    steps(st, ONE, 40, 1000, 1000);
    expect([st.aboard, st.pickSeq]).toEqual([1, 1]);
  });
  it('満員で止まる（20 名）・群の途中で満員（17 名乗せて 7 名の群から 3 名、残り 4）', () => {
    const big = rules([{ x: 1000, y: 1000, count: 30 }]);
    const st = createRescueState(big, HALF);
    steps(st, big, 48 * 25, 1000, 1000);
    expect([st.aboard, st.left[0], st.pickGroup, st.pickS]).toEqual([20, 10, -1, 0]);
    const mid = createRescueState(ONE, HALF);
    mid.aboard = 17;
    steps(mid, ONE, 48 * 7, 1000, 1000);
    expect([mid.aboard, mid.left[0], mid.pickSeq]).toEqual([20, 4, 3]);
  });
  it('一番近い群を 1 つだけ（同じ距離は添字の小さい方）。群が替われば時計と続けて拾った数は 0 から', () => {
    const two = rules([{ x: 1000, y: 1000, count: 3 }, { x: 1030, y: 1000, count: 3 }]);
    const st = createRescueState(two, HALF);
    steps(st, two, 48, 1010, 1000);
    expect([st.left[0], st.left[1]]).toEqual([2, 3]);
    steps(st, two, 30, 1015, 1000); // 中点: 同じ距離は 0
    expect(st.pickGroup).toBe(0);
    steps(st, two, 1, 1025, 1000); // 1 に近い: 替わる
    expect([st.pickGroup, st.pickRun, st.pickS]).toEqual([1, 0, DT]);
    expect(nearestRescueGroup(st, 1015, 1000, Infinity)).toBe(0);
    expect(nearestRescueGroup(st, 5000, 5000, 100)).toBe(-1);
  });
  it('沈んだ（浮いていない）艇は拾わない', () => {
    const st = createRescueState(ONE, HALF);
    steps(st, ONE, 200, 1000, 1000, 0, false);
    expect([st.aboard, st.pickS]).toEqual([0, 0]);
  });
});

describe('移す（フィッチの輪）', () => {
  const F = R.fitch;
  const ring = Math.sqrt(F.ring2);
  it('輪の内で 5 kt 以下なら 1 名 0.25 秒（15 ステップ目）。40 名に届けば objectiveReached', () => {
    const st = createRescueState(R, HALF);
    st.aboard = 20;
    st.delivered = 25;
    steps(st, R, 14, F.x, F.y);
    expect(st.delivered).toBe(25);
    steps(st, R, 1, F.x, F.y);
    expect([st.aboard, st.delivered, st.transferSeq, st.transferRun, st.objectiveReached]).toEqual([19, 26, 1, 1, false]);
    steps(st, R, 15 * 14, F.x, F.y);
    expect([st.aboard, st.delivered, st.objectiveReached]).toEqual([5, 40, true]);
    steps(st, R, 15 * 10, F.x, F.y);
    expect([st.aboard, st.delivered, st.transferRun]).toEqual([0, 45, 20]);
  });
  it('輪の外（縁の 0.01 m 外）・速い（5.1 kt）では移さず、時計は 0', () => {
    for (const [x, v, want] of [[F.x + ring - 0.01, SLOW, 1], [F.x + ring + 0.01, SLOW, 0], [F.x, ktToMps(5.1), 0]] as const) {
      const st = createRescueState(R, HALF);
      st.aboard = 5;
      steps(st, R, 15, x, F.y, v);
      expect([st.delivered, st.transferS < R.transferPerPersonS], `${x} ${v}`).toEqual([want, true]);
    }
  });
});

describe('砲撃・救助の時間の終わり・任務の終わり', () => {
  it('着弾 1 発で 1 名（shell_kill_m 20 の内の一番近い群だけ。ちょうど 20 m は内・20.01 m は外）', () => {
    const two = rules([{ x: 1000, y: 1000, count: 2 }, { x: 1015, y: 1000, count: 4 }]);
    const st = createRescueState(two, HALF);
    expect(rescueShell(st, two, 1010, 1000)).toBe(1);
    expect([st.left[0], st.left[1], st.lostShell, st.shellSeq, st.shellGroup]).toEqual([2, 3, 1, 1, 1]);
    expect(rescueShell(st, two, 980, 1000)).toBe(0);
    expect(rescueShell(st, two, 979.99, 1000)).toBe(-1);
    rescueShell(st, two, 1000, 1000);
    expect([st.left[0], rescueShell(st, two, 1000, 1000), st.left[1]]).toEqual([0, 1, 2]); // 空いた群は数えない（20 m の内の隣の群へ）
    expect(st.lostShell).toBe(4);
  });
  it('救助の時間の終わり: 残りはみな他艦が拾った（1 回だけ）。乗せている分はそのまま移せる・拾うのは止まる', () => {
    const st = createRescueState(R, HALF);
    steps(st, R, 48 * 3, R.groups[0]!.x, R.groups[0]!.y);
    expect(st.aboard).toBe(3);
    rescueTimeUp(st);
    rescueTimeUp(st);
    expect([st.timeUp, st.byOthers, rescueOnWater(st), st.aboard]).toEqual([true, 57, 0, 3]);
    steps(st, R, 200, R.groups[1]!.x, R.groups[1]!.y);
    expect(st.aboard).toBe(3);
    steps(st, R, 45, R.fitch.x, R.fitch.y);
    expect([st.aboard, st.delivered]).toEqual([0, 3]);
  });
  it('帰投と同じに数える終わり（returned・cleared）は乗せている分も渡したに。沈めば沈没で失った。漂流・座礁は乗せたまま。1 回だけ効き、後は何も変えない', () => {
    const reasons = Object.keys(REASON_LABEL) as MissionEndReason[];
    expect(reasons).toContain('mine');
    for (const reason of reasons) {
      const st = createRescueState(R, HALF);
      st.aboard = 12;
      st.delivered = 30;
      finishRescue(st, R, reason);
      finishRescue(st, R, 'returned');
      const back = endCountsAsReturn(reason);
      const afloat = rescueEndAfloat(reason);
      expect([st.ended, st.delivered, st.deliveredAtReturn, st.lostSunk, st.aboard, st.objectiveReached], reason).toEqual([true, back ? 42 : 30, back ? 12 : 0, back || afloat ? 0 : 12, back || !afloat ? 0 : 12, back]);
      steps(st, R, 100, R.fitch.x, R.fitch.y);
      expect([rescueShell(st, R, R.groups[0]!.x, R.groups[0]!.y), st.delivered, st.lostShell], reason).toEqual([-1, back ? 42 : 30, 0]);
    }
    expect(['adrift', 'grounded'].every((r) => rescueEndAfloat(r as MissionEndReason))).toBe(true);
    expect(rescueEndAfloat('mine')).toBe(false);
  });
  it('達成 rescueObjectiveDone: 帰投と同じに数える終わりで渡した数 ≥ 40（沈めば 40 名渡していても未達）', () => {
    expect([rescueObjectiveDone('returned', 40, 40), rescueObjectiveDone('returned', 39, 40), rescueObjectiveDone('cleared', 60, 40), rescueObjectiveDone('mine', 60, 40), rescueObjectiveDone('adrift', 45, 40), rescueObjectiveDone('shore_battery', 45, 40)]).toEqual([true, false, true, false, false, false]);
    expect(REASON_LABEL.mine).toBe('触雷で沈没');
  });
});

describe('群の位置のずれ・決定性・確保', () => {
  it('群ごとに x → y の 2 回（±40 m の一様）。引く回数は 2 × 群の数', () => {
    for (const seed of [1, 2, 12345]) {
      const st = createRescueState(R, HALF);
      const rng = new SeededRng(seed + RESCUE_FIELD_SEED_OFFSET);
      const spy = vi.spyOn(SeededRng.prototype, 'next');
      rollRescueGroups(st, R, rng);
      expect(spy.mock.calls.length).toBe(24);
      spy.mockRestore();
      const ref = new SeededRng(seed + RESCUE_FIELD_SEED_OFFSET);
      for (let i = 0; i < st.n; i++) {
        expect(st.gx[i]).toBeCloseTo(R.groups[i]!.x + (ref.next() * 2 - 1) * 40, 9);
        expect(st.gy[i]).toBeCloseTo(R.groups[i]!.y + (ref.next() * 2 - 1) * 40, 9);
        expect(Math.abs(st.gx[i]! - R.groups[i]!.x) <= 40 && Math.abs(st.gy[i]! - R.groups[i]!.y) <= 40).toBe(true);
      }
    }
  });
  it('同じ入力で同じ出力（拾う → 着弾 → 移す → 時間の終わり → 帰投の台本を 2 回）。ステップの中では乱数を引かない', () => {
    const run = (): string => {
      const st = createRescueState(R, HALF);
      rollRescueGroups(st, R, new SeededRng(7 + RESCUE_FIELD_SEED_OFFSET));
      const spy = vi.spyOn(SeededRng.prototype, 'next');
      for (let i = 0; i < st.n; i++) steps(st, R, 48 * 4, st.gx[i]!, st.gy[i]!, ktToMps((i % 6) + 0.5));
      rescueShell(st, R, st.gx[3]! + 5, st.gy[3]!);
      steps(st, R, 60 * 30, R.fitch.x + 50, R.fitch.y);
      rescueTimeUp(st);
      finishRescue(st, R, 'returned');
      expect(spy.mock.calls.length).toBe(0);
      spy.mockRestore();
      return JSON.stringify({ ...st, gx: Array.from(st.gx), gy: Array.from(st.gy), left: Array.from(st.left) });
    };
    const a = run();
    expect(run()).toBe(a);
    expect(JSON.parse(a).delivered).toBeGreaterThan(0);
  });
  it('作る関数（createRescueState）のほかは本体に確保の形が無い。import は mission-flow と rng（型）だけ・平方根・atan2・Math.random を使わない', () => {
    const { names, bad } = scanAllocations('src/core/rescue.ts', ['createRescueState']);
    expect(names).toEqual(['createRescueState', 'finishRescue', 'nearestRescueGroup', 'rescueEndAfloat', 'rescueOnWater', 'rescueShell', 'rescueTimeUp', 'rollRescueGroups', 'stepRescue']);
    expect(bad).toEqual([]);
    const s = code('src/core/rescue.ts');
    expect(imports(s).sort()).toEqual(['./mission-flow', './rng']);
    expect(s).not.toMatch(/Math\.(sqrt|hypot|atan2|random)\b/);
  });
});
