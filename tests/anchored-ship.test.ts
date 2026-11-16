// v0.8.1 S1（spec-v0810 §3.2 D-S3〜D-S7・§6 の S1、lead の L21・L24）: core/anchored-ship の止まった艦の規則（ASLEEP → ALERT → UNDERWAY）を、us_06 の setup の計画
// （WorldSetup.anchors＝ノーマル [6, null]・ハード [6, null, 4, 4]・警報 4 秒）と素の艦（AI の出力の 2 つの旗・被雷の数・沈み始めた）で固定ステップに回す。
// 気づく 5 つの理由・警報の秒・動き出す秒（体感の時計＝命中スローで延びる）・夜明けは遅れなし・動かない輸送船（null）・沈み始めた艦・同じステップの順（① → ⑤）・
// 一度気づけば旗が下りても戻らない・決定性（2 回と、夜ごとの戻し）・読み口が entities/destroyer と core/ship-ai の名前のまま・step の本体に確保なし。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import type { AnchorSetup } from '../src/config/anchor-mission-data';
import { FIXED_STEP_S } from '../src/config/step-config';
import {
  ANCHOR_ALERT, ANCHOR_ASLEEP, ANCHOR_MAX_SHIPS, ANCHOR_REASON_ALARM, ANCHOR_REASON_DAWN, ANCHOR_REASON_HIT, ANCHOR_REASON_NONE, ANCHOR_REASON_SEEN, ANCHOR_REASON_WAKE, ANCHOR_UNDERWAY,
  anchorHeld, anchorNoticedAtS, anchorReason, anchorStage, anchorUnderwayAtS, createAnchorState, resetAnchorState, stepAnchors, type AnchorPlan, type AnchorShipView, type AnchorState,
} from '../src/core/anchored-ship';
import { createShipAiState } from '../src/core/ship-ai';
import { buildWorldSetup } from '../src/systems/world-setup';
import { code, imports, scanAllocations } from './core-rules-kit';

const FILE = 'src/core/anchored-ship.ts';
const STEP = FIXED_STEP_S;
const { hit_slowmo_factor: SLOW_F, hit_slowmo_seconds: SLOW_S } = gameData.hitRateModel.feel;
const LOST_S = SLOW_S * (1 - SLOW_F); // 命中スロー 1 回で体感の時計が固定ステップの時計から遅れる秒（0.84）
const setupPlan = (hard: boolean): AnchorSetup => buildWorldSetup(gameData, 'us_06', { hard }).anchors!;
const NORMAL: AnchorPlan = setupPlan(false); // AnchorSetup はそのまま AnchorPlan（形で満たす）
const HARD: AnchorPlan = setupPlan(true);

type What = 'seen' | 'unseen' | 'wake' | 'unwake' | 'hit' | 'sink';
type Ev = readonly [atS: number, ship: number, what: What];
interface Opts { untilS?: number; events?: readonly Ev[]; dawnS?: number; slow?: readonly (readonly [number, number])[] }
interface Log { noticed: number[]; underway: number[]; feelAtEnd: number }
interface Ship { ai: { playerDetected: boolean; wakeSpotted: boolean }; hitsTaken: number; sinking: boolean }

/** 1 夜を固定ステップで回す（世界の写し: 艦の旗が立つ → stepAnchors）。events はその固定ステップの時計の秒に艦の旗を変える。slow は命中スローの [始め, 終わり) 実秒 */
function run(plan: AnchorPlan, o: Opts = {}, reuse?: AnchorState): { st: AnchorState; log: Log } {
  const st = reuse ?? createAnchorState(plan.underwayS.length);
  const ships: Ship[] = plan.underwayS.map(() => ({ ai: { playerDetected: false, wakeSpotted: false }, hitsTaken: 0, sinking: false }));
  const log: Log = { noticed: [], underway: [], feelAtEnd: 0 };
  let now = 0;
  while (now < (o.untilS ?? 60) - 1e-9) {
    const feel = STEP * ((o.slow ?? []).some(([a, b]) => now >= a - 1e-9 && now < b - 1e-9) ? SLOW_F : 1);
    now += STEP;
    for (const [t, i, w] of o.events ?? []) {
      if (Math.abs(now - t) >= STEP / 2) continue;
      const s = ships[i]!;
      if (w === 'seen' || w === 'unseen') s.ai.playerDetected = w === 'seen';
      else if (w === 'wake' || w === 'unwake') s.ai.wakeSpotted = w === 'wake';
      else if (w === 'hit') s.hitsTaken++;
      else s.sinking = true;
    }
    const bits = stepAnchors(st, plan, ships, feel, o.dawnS !== undefined && now >= o.dawnS - 1e-9);
    expect(bits).toBe(st.underway);
    for (let i = 0; i < st.n; i++) {
      if (st.noticed & (1 << i)) log.noticed[i] = now;
      if (bits & (1 << i)) log.underway[i] = now;
    }
  }
  log.feelAtEnd = st.feelS;
  return { st, log };
}
const near = (a: number | undefined, b: number, steps = 1): void => {
  expect(a, `${a} vs ${b}`).toBeDefined();
  expect(Math.abs(a! - b), `${a} vs ${b}`).toBeLessThanOrEqual(steps * STEP + 1e-9);
};
const stages = (st: AnchorState): number[] => Array.from({ length: st.n }, (_, i) => anchorStage(st, i));
const reasons = (st: AnchorState): number[] => Array.from({ length: st.n }, (_, i) => anchorReason(st, i));

describe('計画（us_06 の setup）と作る・戻す', () => {
  it('ノーマルは卯月 6 秒・空知丸は動かない（null）、ハードは駆潜艇 2 隻 4 秒。警報 4 秒。作った時はみな ASLEEP・時計 0', () => {
    expect([NORMAL.underwayS, NORMAL.alarmS, HARD.underwayS, HARD.alarmS]).toEqual([[6, null], 4, [6, null, 4, 4], 4]);
    const st = createAnchorState(4);
    expect([st.n, stages(st), reasons(st), st.feelS, st.dawn, st.alarmAtS, st.noticed, st.underway]).toEqual([4, [0, 0, 0, 0], [0, 0, 0, 0], 0, false, NaN, 0, 0]);
    expect([anchorNoticedAtS(st, 0), anchorUnderwayAtS(st, 3), anchorHeld(st, 0)]).toEqual([NaN, NaN, true]);
    expect([ANCHOR_ASLEEP, ANCHOR_ALERT, ANCHOR_UNDERWAY]).toEqual([0, 1, 2]);
    expect([ANCHOR_REASON_NONE, ANCHOR_REASON_SEEN, ANCHOR_REASON_WAKE, ANCHOR_REASON_HIT, ANCHOR_REASON_ALARM, ANCHOR_REASON_DAWN]).toEqual([0, 1, 2, 3, 4, 5]);
  });
  it('艦の数は 1〜8 の整数（ビットの印と固定長の枠）', () => {
    for (const n of [0, ANCHOR_MAX_SHIPS + 1, 2.5, NaN]) expect(() => createAnchorState(n), String(n)).toThrow(/止まった艦の数/);
    expect(createAnchorState(ANCHOR_MAX_SHIPS).stage.length).toBe(ANCHOR_MAX_SHIPS);
  });
  it('何も起きない夜は誰も気づかず動かない（夜明けの無い 300 秒）', () => {
    const { st, log } = run(HARD, { untilS: 300 });
    expect([stages(st), reasons(st), log.noticed, log.underway, st.alarmAtS]).toEqual([[0, 0, 0, 0], [0, 0, 0, 0], [], [], NaN]);
    expect(log.feelAtEnd).toBeCloseTo(300, 6);
  });
});

describe('気づく 5 つの理由・警報・動き出す秒', () => {
  it.each([['seen', ANCHOR_REASON_SEEN], ['wake', ANCHOR_REASON_WAKE], ['hit', ANCHOR_REASON_HIT]] as const)('① 〜 ③ %s: 卯月が 10 秒に気づき 16 秒に動き出す。空知丸は 14 秒に警報で気づき、動かない', (what, reason) => {
    const { st, log } = run(NORMAL, { events: [[10, 0, what]] });
    expect(reasons(st)).toEqual([reason, ANCHOR_REASON_ALARM]);
    expect(stages(st)).toEqual([ANCHOR_UNDERWAY, ANCHOR_ALERT]);
    near(log.noticed[0], 10, 0);
    near(log.underway[0], 16);
    near(log.noticed[1], 14);
    expect([log.underway[1], anchorUnderwayAtS(st, 1), anchorHeld(st, 0), anchorHeld(st, 1)]).toEqual([undefined, NaN, false, true]);
    expect(anchorNoticedAtS(st, 0)).toBeCloseTo(10, 6);
    expect(st.alarmAtS).toBeCloseTo(10, 6);
  });
  it('④ 警報: 空知丸が 10 秒に見つければ、卯月は 14 秒に警報で気づき 20 秒に動き出す。ハードの駆潜艇 2 隻も 14 秒に気づき 18 秒に動く', () => {
    const n = run(NORMAL, { events: [[10, 1, 'seen']] });
    expect(reasons(n.st)).toEqual([ANCHOR_REASON_ALARM, ANCHOR_REASON_SEEN]);
    near(n.log.noticed[0], 14);
    near(n.log.underway[0], 20);
    expect(n.log.underway[1]).toBeUndefined();
    const h = run(HARD, { events: [[10, 1, 'seen']] });
    expect([reasons(h.st), stages(h.st)]).toEqual([[4, 1, 4, 4], [2, 1, 2, 2]]);
    for (const i of [2, 3]) {
      near(h.log.noticed[i], 14);
      near(h.log.underway[i], 18);
    }
  });
  it('警報は隊の最初の 1 隻から: 2 隻目が後で自分で気づいても警報の秒は変わらず、警報より先に自分で気づいた艦は自分の理由のまま', () => {
    const { st, log } = run(HARD, { events: [[10, 0, 'wake'], [12, 2, 'seen']] });
    expect(reasons(st)).toEqual([ANCHOR_REASON_WAKE, ANCHOR_REASON_ALARM, ANCHOR_REASON_SEEN, ANCHOR_REASON_ALARM]);
    expect(st.alarmAtS).toBeCloseTo(10, 6);
    near(log.noticed[2], 12, 0);
    near(log.underway[2], 16);
    near(log.noticed[3], 14);
  });
  it('⑤ 夜明け: 止まっている艦はみなそのステップに気づき、動く艦は遅れなしで動き出す（空知丸は気づいても動かない）', () => {
    const { st, log } = run(HARD, { dawnS: 30 });
    expect([reasons(st), stages(st)]).toEqual([[5, 5, 5, 5], [2, 1, 2, 2]]);
    for (const i of [0, 2, 3]) {
      near(log.noticed[i], 30, 0);
      near(log.underway[i], 30, 0);
    }
    expect(log.underway[1]).toBeUndefined();
    expect(st.alarmAtS).toBeNaN(); // 夜明けは警報を上げない（みな気づいた）
  });
  it('夜明けは気づいて待っている艦も今すぐ動かす（卯月は 10 秒に見つけ、12 秒の夜明けで 16 秒を待たずに）', () => {
    const { st, log } = run(NORMAL, { events: [[10, 0, 'seen']], dawnS: 12 });
    expect(reasons(st)).toEqual([ANCHOR_REASON_SEEN, ANCHOR_REASON_DAWN]);
    near(log.underway[0], 12, 0);
    near(log.noticed[1], 12, 0);
  });
  it('一度気づけば旗が下りても戻らない（見失った・雷跡が通り過ぎた）', () => {
    const a = run(NORMAL, { events: [[10, 0, 'seen'], [11, 0, 'unseen']] });
    near(a.log.underway[0], 16);
    const b = run(NORMAL, { events: [[10, 0, 'wake'], [10.5, 0, 'unwake']] });
    expect(reasons(b.st)[0]).toBe(ANCHOR_REASON_WAKE);
    near(b.log.underway[0], 16);
  });
  it('このステップに気づいた艦の印（st.noticed）は気づいたステップだけ立つ', () => {
    const st = createAnchorState(2);
    const ships: Ship[] = [{ ai: { playerDetected: true, wakeSpotted: false }, hitsTaken: 0, sinking: false }, { ai: { playerDetected: false, wakeSpotted: false }, hitsTaken: 0, sinking: false }];
    expect([stepAnchors(st, NORMAL, ships, STEP, false), st.noticed]).toEqual([0, 1]);
    expect([stepAnchors(st, NORMAL, ships, STEP, false), st.noticed]).toEqual([0, 0]);
  });
});

describe('体感の時計（命中スロー）', () => {
  it('動き出す秒は体感の時計: 気づいた後に命中スローが 1 回あれば、固定ステップの時計で 0.84 秒遅れる。気づいた秒は体感の時計で残る', () => {
    expect(LOST_S).toBeCloseTo(0.84, 9);
    const { st, log } = run(NORMAL, { events: [[10, 0, 'seen']], slow: [[11, 11 + SLOW_S]] });
    near(log.underway[0], 16 + LOST_S, 1);
    expect(anchorUnderwayAtS(st, 0)).toBeCloseTo(16, 1);
    const early = run(NORMAL, { events: [[12, 0, 'seen']], slow: [[5, 5 + SLOW_S]] });
    expect(anchorNoticedAtS(early.st, 0)).toBeCloseTo(12 - LOST_S, 6);
    near(early.log.underway[0], 18, 1);
  });
  it('警報の秒も体感の時計: 卯月の気づきの直後の命中スローで、空知丸の警報は 14 秒から 0.84 秒遅れる', () => {
    const { log } = run(NORMAL, { events: [[10, 0, 'seen']], slow: [[10.5, 10.5 + SLOW_S]] });
    near(log.noticed[1], 14 + LOST_S, 1);
  });
});

describe('沈み始めた艦・動かない艦・同じステップの順', () => {
  it('止まっている間に沈み始めた艦は被雷で気づいて警報を上げるが、自分は夜明けにも動き出さない', () => {
    const { st, log } = run(HARD, { events: [[10, 0, 'hit'], [10, 0, 'sink']], dawnS: 40 });
    expect([reasons(st), stages(st)]).toEqual([[3, 4, 4, 4], [1, 1, 2, 2]]);
    near(log.noticed[1], 14);
    near(log.underway[2], 18);
    expect(log.underway[0]).toBeUndefined();
  });
  it('気づいて待っている間に沈み始めた艦は ALERT のまま（16 秒にも 40 秒の夜明けにも動かない）', () => {
    const { st, log } = run(NORMAL, { events: [[10, 0, 'seen'], [13, 0, 'hit'], [13, 0, 'sink']], dawnS: 40 });
    expect([stages(st), log.underway[0]]).toEqual([[ANCHOR_ALERT, ANCHOR_ALERT], undefined]);
  });
  it('沈み始めた旗だけでも ③（被雷の数を読まない素の艦）', () => {
    const { st } = run(NORMAL, { events: [[10, 1, 'sink']] });
    expect(reasons(st)).toEqual([ANCHOR_REASON_ALARM, ANCHOR_REASON_HIT]);
  });
  it('動かない艦（null）は見つけても、警報でも、夜明けでも動かない', () => {
    for (const o of [{ events: [[10, 1, 'seen']] as const }, { events: [[10, 0, 'seen']] as const }, { dawnS: 20 }] as Opts[]) {
      const { st, log } = run(NORMAL, { ...o, untilS: 200 });
      expect([anchorStage(st, 1), log.underway[1], anchorUnderwayAtS(st, 1)]).toEqual([ANCHOR_ALERT, undefined, NaN]);
    }
  });
  it('同じステップの理由は ① → ⑤ の順（見た ＞ 雷跡 ＞ 被雷 ＞ 警報 ＞ 夜明け）', () => {
    const r0 = (o: Opts): number => anchorReason(run(NORMAL, o).st, 0);
    expect(r0({ events: [[10, 0, 'seen'], [10, 0, 'wake'], [10, 0, 'hit']] })).toBe(ANCHOR_REASON_SEEN);
    expect(r0({ events: [[10, 0, 'wake'], [10, 0, 'hit']] })).toBe(ANCHOR_REASON_WAKE);
    expect(r0({ events: [[10, 0, 'hit'], [10, 0, 'sink']] })).toBe(ANCHOR_REASON_HIT);
    expect(r0({ events: [[20, 0, 'hit']], dawnS: 20 })).toBe(ANCHOR_REASON_HIT);
    expect(r0({ events: [[20, 0, 'seen']], dawnS: 20 })).toBe(ANCHOR_REASON_SEEN);
    // 空知丸の 10 秒の発見の警報（14 秒）と夜明け（14 秒）が同じステップ: 卯月は警報で気づき、夜明けなので今すぐ動き出す
    const { st, log } = run(NORMAL, { events: [[10, 1, 'seen']], dawnS: 14 });
    expect([anchorReason(st, 0), anchorStage(st, 0)]).toEqual([ANCHOR_REASON_ALARM, ANCHOR_UNDERWAY]);
    near(log.noticed[0], 14, 0);
    near(log.underway[0], 14, 0);
  });
});

describe('決定性・読み口・source', () => {
  const busy: Opts = { events: [[7, 2, 'wake'], [9, 0, 'hit'], [9.5, 3, 'seen'], [30, 0, 'sink']], slow: [[9, 9 + SLOW_S], [31, 31 + SLOW_S]], dawnS: 150, untilS: 200 };
  it('同じ入力で同じ段・理由・秒（2 回）。夜ごとに戻した状態で回し直しても新しく作った物と同じ', () => {
    const a = run(HARD, busy);
    expect(JSON.stringify(a)).toBe(JSON.stringify(run(HARD, busy)));
    const st = a.st;
    resetAnchorState(st);
    expect([stages(st), reasons(st), st.feelS, st.dawn, st.alarmAtS, anchorNoticedAtS(st, 2)]).toEqual([[0, 0, 0, 0], [0, 0, 0, 0], 0, false, NaN, NaN]);
    expect(JSON.stringify(run(HARD, busy, st))).toBe(JSON.stringify(run(HARD, busy)));
  });
  it('読み口は entities/destroyer と core/ship-ai の名前のまま（Destroyer をそのまま渡せる＝S2）: ShipAiState は ai の形を満たす', () => {
    const v: AnchorShipView = { ai: createShipAiState(270, 0), hitsTaken: 0, sinking: false };
    expect([v.ai.playerDetected, v.ai.wakeSpotted]).toEqual([false, false]);
    const d = code('src/entities/destroyer.ts');
    for (const s of ['readonly ai: ShipAiState;', 'hitsTaken = 0;', 'sinking = false;']) expect(d).toContain(s);
    const ai = code('src/core/ship-ai.ts');
    for (const s of ['wakeSpotted: boolean;', 'playerDetected: boolean;']) expect(ai).toContain(s);
  });
  it('作る関数（createAnchorState）のほかは本体に確保の形が無い。import なし・乱数・平方根・atan2 を使わない', () => {
    const { names, bad } = scanAllocations(FILE, ['createAnchorState']);
    expect(names).toEqual(['anchorHeld', 'anchorNoticedAtS', 'anchorReason', 'anchorStage', 'anchorUnderwayAtS', 'createAnchorState', 'notice', 'resetAnchorState', 'stepAnchors']);
    expect(bad).toEqual([]);
    const s = code(FILE);
    expect(imports(s)).toEqual([]);
    expect(s).not.toMatch(/Math\.(sqrt|hypot|atan2|random)\b|SeededRng|\brng\b/);
  });
});
