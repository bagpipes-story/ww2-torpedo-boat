// v0.8.2 S1（spec-v0820 §4.2 D-C7・§9 の 2、lead の L12・L15）: core/column-screen の列の見張りの規則（列にいる ⇄ 離れている）を、us_05 の setup の計画（transit.column の役と
// rejoin_s＝ノーマルは時雨〔列の 5 隻目＝bit 4〕・ハードは見張りの駆逐艦〔8 隻目＝bit 7〕も・40 秒）と素の艦（AI の出力の playerDetected・沈み始めた）で固定ステップに回す。
// 見つけて離れる・離れている間にまた見つければ見失った時計が戻る・見失って体感の時計で 40 秒で戻る（命中スローで延びる）・戻った艦はまた離れる（回数）・沈み始めた艦は離れも戻りもしない・
// 夜明け（誰も離れない・離れていた艦はそのステップに戻った扱い）・海域の外の艦は読まない・決定性（2 回と夜ごとの戻し）・読み口が entities/destroyer と core/ship-ai の名前のまま・
// step の本体に確保なし・S2 から import するのは systems/column-roles だけ（S1 の「誰も import しない」は S2 の lead の L26 で直した）。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { getColumnPlan } from '../src/config/column-mission-data';
import { getPrototypeMission } from '../src/config/mission-data';
import { FIXED_STEP_S } from '../src/config/step-config';
import {
  createScreenState, resetScreenState, screenAway, screenLeaves, screenLeftAtS, screenPlanOf, screenRejoinedAtS, stepScreens, type ScreenPlan, type ScreenShipView, type ScreenState,
} from '../src/core/column-screen';
import { createShipAiState } from '../src/core/ship-ai';
import { TRANSIT_MAX_SHIPS } from '../src/core/transit-data';
import { buildWorldSetup } from '../src/systems/world-setup';
import { code, imports, scanAllocations } from './core-rules-kit';
import { SRC } from './sfx-rules-kit';

const FILE = 'src/core/column-screen.ts';
const STEP = FIXED_STEP_S;
const { hit_slowmo_factor: SLOW_F, hit_slowmo_seconds: SLOW_S } = gameData.hitRateModel.feel;
const LOST_S = SLOW_S * (1 - SLOW_F); // 命中スロー 1 回で体感の時計が固定ステップの時計から遅れる秒（0.84）
const setupOf = (hard: boolean) => buildWorldSetup(gameData, 'us_05', { hard }).transit!;
const planOf = (hard: boolean): ScreenPlan => { const t = setupOf(hard); return screenPlanOf(t.column!, t.rejoinS)!; };
const NORMAL = planOf(false);
const HARD = planOf(true);
const SHIGURE = 4; // 列の 5 隻目（満潮・朝雲・山雲・最上・時雨・山城・扶桑）
const PICKET = 7; // ハードの 8 隻目（見張りの駆逐艦）
const ALL = (1 << TRANSIT_MAX_SHIPS) - 1;

type What = 'seen' | 'unseen' | 'sink' | 'on' | 'off';
type Ev = readonly [atS: number, ship: number, what: What];
interface Opts { untilS?: number; events?: readonly Ev[]; dawnS?: number; slow?: readonly (readonly [number, number])[]; onMap?: number }
interface Log { left: number[][]; rejoined: number[][] }
interface Ship { ai: { playerDetected: boolean }; sinking: boolean }

/** 1 夜を固定ステップで回す（世界の写し: 艦の旗が立つ → 列の段階〔海域の中のビット〕→ stepScreens）。events はその固定ステップの時計の秒に旗とビットを変える。slow は命中スローの [始め, 終わり) 実秒 */
function run(plan: ScreenPlan, n: number, o: Opts = {}, reuse?: ScreenState): { st: ScreenState; log: Log } {
  const st = reuse ?? createScreenState(n);
  const ships: Ship[] = Array.from({ length: n }, () => ({ ai: { playerDetected: false }, sinking: false }));
  const log: Log = { left: ships.map(() => []), rejoined: ships.map(() => []) };
  let onMap = o.onMap ?? ALL;
  let now = 0;
  while (now < (o.untilS ?? 120) - 1e-9) {
    const feel = STEP * ((o.slow ?? []).some(([a, b]) => now >= a - 1e-9 && now < b - 1e-9) ? SLOW_F : 1);
    now += STEP;
    for (const [t, i, w] of o.events ?? []) {
      if (Math.abs(now - t) >= STEP / 2) continue;
      if (w === 'seen' || w === 'unseen') ships[i]!.ai.playerDetected = w === 'seen';
      else if (w === 'sink') ships[i]!.sinking = true;
      else onMap = w === 'on' ? onMap | (1 << i) : onMap & ~(1 << i);
    }
    stepScreens(st, plan, ships, onMap, feel, o.dawnS !== undefined && now >= o.dawnS - 1e-9);
    for (let i = 0; i < n; i++) {
      if (st.left & (1 << i)) log.left[i]!.push(now);
      if (st.rejoined & (1 << i)) log.rejoined[i]!.push(now);
    }
  }
  return { st, log };
}
const near = (a: number | undefined, b: number, steps = 1): void => {
  expect(a, `${a} vs ${b}`).toBeDefined();
  expect(Math.abs(a! - b), `${a} vs ${b}`).toBeLessThanOrEqual(steps * STEP + 1e-9);
};
const away = (st: ScreenState): boolean[] => Array.from({ length: st.n }, (_, i) => screenAway(st, i));
const leaves = (st: ScreenState): number[] => Array.from({ length: st.n }, (_, i) => screenLeaves(st, i));

describe('計画（us_05 の setup）と作る・戻す', () => {
  it('ノーマルは時雨（bit 4）だけ・ハードは見張りの駆逐艦（bit 7）も。戻る秒は 40。setup の transit と S0 の ColumnPlan のどちらからでも同じ', () => {
    expect([NORMAL, HARD]).toEqual([{ mask: 1 << SHIGURE, rejoinS: 40 }, { mask: (1 << SHIGURE) | (1 << PICKET), rejoinS: 40 }]);
    const t = setupOf(false);
    expect(t.column!.map((k) => k.role)).toEqual(['line', 'line', 'line', 'line', 'screen', 'line', 'line']);
    const p = getColumnPlan(gameData, getPrototypeMission(gameData, 'us_05', true), null, false)!;
    expect(screenPlanOf(p.kits, p.rejoinS)).toEqual(HARD);
  });
  it('見張りのいない列は null・見張りがいて戻る秒が無ければ例外（V-C4 が先に止める）', () => {
    expect(screenPlanOf([{ role: 'line' }, { role: 'line' }], null)).toBeNull();
    expect(screenPlanOf([], undefined)).toBeNull();
    for (const r of [null, undefined]) expect(() => screenPlanOf([{ role: 'line' }, { role: 'screen' }], r)).toThrow(/rejoinS が要る（core\/column-screen・V-C4）/);
  });
  it('艦の数は 1〜8 の整数（ビットの印と固定長の枠）。作った時はみな列にいる・回数 0・時計 0', () => {
    for (const n of [0, TRANSIT_MAX_SHIPS + 1, 2.5, NaN]) expect(() => createScreenState(n), String(n)).toThrow(/列の艦の数/);
    const st = createScreenState(TRANSIT_MAX_SHIPS);
    expect([st.n, away(st), leaves(st), st.feelS, st.dawn, st.left, st.rejoined]).toEqual([8, Array(8).fill(false), Array(8).fill(0), 0, false, 0, 0]);
    expect([screenLeftAtS(st, 0), screenRejoinedAtS(st, 7), st.lostAtS[3]]).toEqual([NaN, NaN, NaN]);
  });
  it('何も見つけない夜は誰も離れない（300 秒）', () => {
    const { st, log } = run(HARD, 8, { untilS: 300 });
    expect([away(st), leaves(st), log.left.flat(), log.rejoined.flat()]).toEqual([Array(8).fill(false), Array(8).fill(0), [], []]);
    expect(st.feelS).toBeCloseTo(300, 6);
  });
});

describe('見つけて離れる・見失って戻る', () => {
  it('時雨が 10 秒に見つければそのステップに離れる（回数 1）。列のままの艦（山城）が見つけても何も起きない', () => {
    const { st, log } = run(NORMAL, 7, { events: [[10, SHIGURE, 'seen'], [10, 5, 'seen']], untilS: 30 });
    near(log.left[SHIGURE]![0], 10, 0);
    expect([log.left[SHIGURE]!.length, log.left[5], away(st)[SHIGURE], away(st)[5], screenLeaves(st, SHIGURE), screenLeaves(st, 5)]).toEqual([1, [], true, false, 1, 0]);
    expect(screenLeftAtS(st, SHIGURE)).toBeCloseTo(10, 6);
    expect(log.rejoined[SHIGURE]).toEqual([]); // 見つけている間は戻らない
  });
  it('12 秒に見失えば、体感の時計で 40 秒後の 52 秒に戻る（このステップの印 st.rejoined）', () => {
    const { st, log } = run(NORMAL, 7, { events: [[10, SHIGURE, 'seen'], [12, SHIGURE, 'unseen']] });
    expect(log.rejoined[SHIGURE]!.length).toBe(1);
    near(log.rejoined[SHIGURE]![0], 52);
    expect([away(st)[SHIGURE], screenLeaves(st, SHIGURE)]).toEqual([false, 1]);
    expect(screenRejoinedAtS(st, SHIGURE)).toBeCloseTo(52, 1);
  });
  it('離れている間にまた見つければ見失った時計が戻る（12 秒に見失い 30 秒にまた見つけ 31 秒に見失う → 71 秒に戻る）。離れている間の発見は回数に数えない', () => {
    const { st, log } = run(NORMAL, 7, { events: [[10, SHIGURE, 'seen'], [12, SHIGURE, 'unseen'], [30, SHIGURE, 'seen'], [31, SHIGURE, 'unseen']] });
    expect([log.left[SHIGURE]!.length, log.rejoined[SHIGURE]!.length, screenLeaves(st, SHIGURE)]).toEqual([1, 1, 1]);
    near(log.rejoined[SHIGURE]![0], 71);
  });
  it('戻る秒は体感の時計: 見失った後に命中スローが 1 回あれば、固定ステップの時計で 0.84 秒遅れて戻る（体感の時計では 52 秒）', () => {
    expect(LOST_S).toBeCloseTo(0.84, 9);
    const { st, log } = run(NORMAL, 7, { events: [[10, SHIGURE, 'seen'], [12, SHIGURE, 'unseen']], slow: [[20, 20 + SLOW_S]] });
    near(log.rejoined[SHIGURE]![0], 52 + LOST_S, 1);
    expect(screenRejoinedAtS(st, SHIGURE)).toBeCloseTo(52, 1);
    const before = run(NORMAL, 7, { events: [[10, SHIGURE, 'seen'], [12, SHIGURE, 'unseen']], slow: [[2, 2 + SLOW_S]] }); // 離れる前のスローは戻る秒を動かさない
    near(before.log.rejoined[SHIGURE]![0], 52);
  });
  it('戻った艦はまた見つければまた離れる（60 秒に見つけ 61 秒に見失う → 101 秒に戻る）。回数 2・最後に離れた／戻った秒', () => {
    const { st, log } = run(NORMAL, 7, { events: [[10, SHIGURE, 'seen'], [12, SHIGURE, 'unseen'], [60, SHIGURE, 'seen'], [61, SHIGURE, 'unseen']] });
    expect([log.left[SHIGURE]!.length, log.rejoined[SHIGURE]!.length, screenLeaves(st, SHIGURE), away(st)[SHIGURE]]).toEqual([2, 2, 2, false]);
    near(log.left[SHIGURE]![1], 60, 0);
    near(log.rejoined[SHIGURE]![1], 101);
    expect(screenLeftAtS(st, SHIGURE)).toBeCloseTo(60, 6);
    expect(screenRejoinedAtS(st, SHIGURE)).toBeCloseTo(101, 1);
  });
  it('戻った次のステップにまだ見つけていれば、そのステップにまた離れる（40 秒を待たずに）', () => {
    const st = createScreenState(7);
    const ships: Ship[] = Array.from({ length: 7 }, () => ({ ai: { playerDetected: false }, sinking: false }));
    ships[SHIGURE]!.ai.playerDetected = true;
    stepScreens(st, NORMAL, ships, ALL, STEP, false);
    ships[SHIGURE]!.ai.playerDetected = false;
    for (let k = 0; k < 41 * 60 && st.rejoined === 0; k++) stepScreens(st, NORMAL, ships, ALL, STEP, false);
    expect(st.rejoined).toBe(1 << SHIGURE);
    ships[SHIGURE]!.ai.playerDetected = true;
    stepScreens(st, NORMAL, ships, ALL, STEP, false);
    expect([st.left, st.rejoined, screenLeaves(st, SHIGURE)]).toEqual([1 << SHIGURE, 0, 2]);
  });
  it('ハードの 2 隻は別々: 見張りの駆逐艦が 15 秒に見つけ 20 秒に見失えば 60 秒に戻り、時雨は 10 秒に離れたまま', () => {
    const { st, log } = run(HARD, 8, { events: [[10, SHIGURE, 'seen'], [15, PICKET, 'seen'], [20, PICKET, 'unseen']], untilS: 80 });
    near(log.left[PICKET]![0], 15, 0);
    near(log.rejoined[PICKET]![0], 60);
    expect([away(st)[SHIGURE], away(st)[PICKET], log.rejoined[SHIGURE]]).toEqual([true, false, []]);
  });
});

describe('沈み始めた艦・夜明け・海域の外', () => {
  it('離れている間に沈み始めた艦は戻らない（離れたまま）。列にいる間に沈み始めた艦は見つけても離れない', () => {
    const a = run(NORMAL, 7, { events: [[10, SHIGURE, 'seen'], [11, SHIGURE, 'sink'], [12, SHIGURE, 'unseen']], untilS: 200, dawnS: 150 });
    expect([a.log.rejoined[SHIGURE], away(a.st)[SHIGURE], screenLeaves(a.st, SHIGURE)]).toEqual([[], true, 1]);
    const b = run(NORMAL, 7, { events: [[5, SHIGURE, 'sink'], [10, SHIGURE, 'seen']] });
    expect([b.log.left[SHIGURE], away(b.st)[SHIGURE], screenLeaves(b.st, SHIGURE)]).toEqual([[], false, 0]);
  });
  it('夜明け: 離れていた艦は見つけていても夜明けのステップに戻った扱い。夜明けの後は誰も離れない（見つけ直しても）', () => {
    const { st, log } = run(HARD, 8, { events: [[10, SHIGURE, 'seen'], [30, PICKET, 'seen'], [31, PICKET, 'unseen'], [50, PICKET, 'seen']], dawnS: 40, untilS: 200 });
    near(log.rejoined[SHIGURE]![0], 40, 0);
    near(log.rejoined[PICKET]![0], 40, 0);
    expect([log.left[PICKET]!.length, log.rejoined[SHIGURE]!.length, away(st), st.dawn]).toEqual([1, 1, Array(8).fill(false), true]);
    const c = run(NORMAL, 7, { events: [[50, SHIGURE, 'seen']], dawnS: 40 });
    expect([c.log.left[SHIGURE], c.log.rejoined[SHIGURE], screenLeaves(c.st, SHIGURE)]).toEqual([[], [], 0]);
  });
  it('夜明けは列にいる艦に戻った印を立てない。夜明けのラッチは一度立てば消えない', () => {
    const st = createScreenState(7);
    const ships: Ship[] = Array.from({ length: 7 }, () => ({ ai: { playerDetected: false }, sinking: false }));
    stepScreens(st, NORMAL, ships, ALL, STEP, true);
    expect([st.rejoined, st.dawn]).toEqual([0, true]);
    ships[SHIGURE]!.ai.playerDetected = true;
    stepScreens(st, NORMAL, ships, ALL, STEP, false);
    expect([st.left, st.dawn, away(st)[SHIGURE]]).toEqual([0, true, false]);
  });
  it('海域の外の艦（まだ来ない）は見つけた旗が立っていても読まず、海域に入ったステップに離れる', () => {
    const { log } = run(NORMAL, 7, { onMap: ALL & ~(1 << SHIGURE), events: [[10, SHIGURE, 'seen'], [30, SHIGURE, 'on']], untilS: 40 });
    expect(log.left[SHIGURE]!.length).toBe(1);
    near(log.left[SHIGURE]![0], 30, 0);
  });
  it('離れたまま海域の外へ出た艦（去った）は読まない: 見失っても戻らず、夜明けにも戻った印は立たない', () => {
    const { st, log } = run(NORMAL, 7, { events: [[10, SHIGURE, 'seen'], [20, SHIGURE, 'off'], [21, SHIGURE, 'unseen']], dawnS: 150, untilS: 200 });
    expect([log.rejoined[SHIGURE], away(st)[SHIGURE]]).toEqual([[], true]);
  });
});

describe('決定性・読み口・source', () => {
  const busy: Opts = {
    events: [[10, SHIGURE, 'seen'], [12, SHIGURE, 'unseen'], [15, PICKET, 'seen'], [16, PICKET, 'unseen'], [40, SHIGURE, 'seen'], [42, SHIGURE, 'unseen'], [70, PICKET, 'sink'], [100, SHIGURE, 'seen']],
    slow: [[11, 11 + SLOW_S], [41, 41 + SLOW_S]], dawnS: 150, untilS: 200,
  };
  it('同じ入力で同じ印・回数・秒（2 回）。夜ごとに戻した状態で回し直しても新しく作った物と同じ', () => {
    const a = run(HARD, 8, busy);
    expect(JSON.stringify(a)).toBe(JSON.stringify(run(HARD, 8, busy)));
    expect(leaves(a.st)).toEqual([0, 0, 0, 0, 2, 0, 0, 1]);
    resetScreenState(a.st);
    expect([away(a.st), leaves(a.st), a.st.feelS, a.st.dawn, screenLeftAtS(a.st, SHIGURE), screenRejoinedAtS(a.st, PICKET)]).toEqual([Array(8).fill(false), Array(8).fill(0), 0, false, NaN, NaN]);
    expect(JSON.stringify(run(HARD, 8, busy, a.st))).toBe(JSON.stringify(run(HARD, 8, busy)));
  });
  it('読み口は entities/destroyer と core/ship-ai の名前のまま（Destroyer をそのまま渡せる＝S2）: ShipAiState は ai の形を満たす', () => {
    const v: ScreenShipView = { ai: createShipAiState(90, 0), sinking: false };
    expect(v.ai.playerDetected).toBe(false);
    const d = code('src/entities/destroyer.ts');
    for (const s of ['readonly ai: ShipAiState;', 'sinking = false;']) expect(d).toContain(s);
    expect(code('src/core/ship-ai.ts')).toContain('playerDetected: boolean;');
  });
  it('作る関数（screenPlanOf・createScreenState）のほかは本体に確保の形が無い。import は core/transit-data だけ・乱数・平方根・atan2 を使わない', () => {
    const { names, bad } = scanAllocations(FILE, ['screenPlanOf', 'createScreenState']);
    expect(names).toEqual(['createScreenState', 'resetScreenState', 'screenAway', 'screenLeaves', 'screenLeftAtS', 'screenPlanOf', 'screenRejoinedAtS', 'stepScreens']);
    expect(bad).toEqual([]);
    const s = code(FILE);
    expect(imports(s)).toEqual(['./transit-data']);
    expect(s).not.toMatch(/Math\.(sqrt|hypot|atan2|random)\b|SeededRng|\brng\b/);
  });
  it('S2 から import するのは systems/column-roles だけ（lead の L26。S1 は誰も import しなかった＝束は S0 とバイトで同じだった）', () => {
    expect(SRC.filter((f) => imports(code(f)).some((p) => p.endsWith('/column-screen')))).toEqual(['src/systems/column-roles.ts']);
  });
});
