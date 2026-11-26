// v0.8.2 S1（spec-v0820 §4.5 D-N1〜D-N6・§9 の 6、lead の L13・L15）: core/recon-report の報告の規則（NONE → TRACKING → SENT／PENDING → RELAYED）と無線の故障を、us_05 の setup の計画
// （WorldSetup.recon＝追う 20 秒・敵の艦の砲弾すべて〔damage 1 以上＝機銃も。v0.8.2 IP4。前は 76 mm 以上＝damage 20〕で 30%・?debug&noradio は 0・radiofail は 1）と、世界が数えて渡す見る物（視程の内の戦艦の数・最後の掃引の列の接触の数・中継の輪）で
// 固定ステップに回す。確かめる・20 秒は固定ステップの時計（命中スローで延びない）・接触の無いステップは数えない・無線の故障の前と後・引かない時（damage 1 未満・送った後・壊れた後）・
// 0 と 1 でも引く回数は同じ・中継待ちから中継・夜明けの後の中継・追い終える前の輪は何もしない・沈んだら達成でないが「届いた」は残る・決定性・読み口・source（確保なし・平方根なし）・
// S2 から import するのは systems/world-recon・mission-objective・recon-telemetry だけ（S1 の「誰も import しない」は S2 の lead の L26 で直した）。
import { describe, expect, it, vi } from 'vitest';
import { gameData } from '../src/config/game-data';
import { FIXED_STEP_S } from '../src/config/step-config';
import type { MissionEndReason } from '../src/core/mission-flow';
import {
  RECON_EV_PENDING, RECON_EV_RADIO, RECON_EV_RELAYED, RECON_EV_SEEN, RECON_EV_SENT, RECON_NONE, RECON_PENDING, RECON_RADIO_SEED_OFFSET, RECON_RELAYED, RECON_SENT, RECON_TRACKING,
  createReconState, reconDelivered, reconObjectiveDone, reconOnShellHit, reconTrackLeftS, resetReconState, stepRecon, type ReconPlan, type ReconState, type ReconView,
} from '../src/core/recon-report';
import { SeededRng } from '../src/core/rng';
import { buildWorldSetup } from '../src/systems/world-setup';
import { code, imports, scanAllocations } from './core-rules-kit';
import { SRC } from './sfx-rules-kit';

const FILE = 'src/core/recon-report.ts';
const STEP = FIXED_STEP_S;
const { hit_slowmo_factor: SLOW_F, hit_slowmo_seconds: SLOW_S } = gameData.hitRateModel.feel;
const LOST_S = SLOW_S * (1 - SLOW_F); // 命中スロー 1 回で体感の時計が遅れる秒（0.84）
const planOf = (o: { radioOff?: boolean; radioFail?: boolean } = {}): ReconPlan => buildWorldSetup(gameData, 'us_05', o).recon!; // ReconSetup はそのまま ReconPlan（形で満たす）
const PLAN = planOf();
const NEVER = planOf({ radioOff: true });
const ALWAYS = planOf({ radioFail: true });

/** 秒の区間 [a, b) で値を返す見る物の台本（区間の外は 0・偽） */
type Spans = readonly (readonly [number, number, number])[];
interface Opts { untilS?: number; sight?: Spans; contacts?: Spans; relay?: readonly (readonly [number, number])[]; hits?: readonly (readonly [number, number])[]; slow?: readonly (readonly [number, number])[]; feelClock?: boolean; seed?: number }
interface Log { bits: [number, number][]; radioAt: number[]; nextAfter: number }

const at = (s: Spans | undefined, t: number): number => (s ?? []).find(([a, b]) => t >= a - 1e-9 && t < b - 1e-9)?.[2] ?? 0;

/** 1 夜を固定ステップで回す（世界の写し: 敵の側＝砲弾の命中 → stepRecon）。dtS は固定ステップの実秒（feelClock の時だけ体感の秒を渡す＝渡し方の違いを見る）。hits は [秒, damage] */
function run(plan: ReconPlan, o: Opts = {}, reuse?: ReconState): { st: ReconState; log: Log } {
  const st = reuse ?? createReconState();
  const rng = new SeededRng((o.seed ?? 1) + RECON_RADIO_SEED_OFFSET);
  const log: Log = { bits: [], radioAt: [], nextAfter: 0 };
  const view = { identifyInSight: 0, columnContacts: 0, inRelay: false };
  let now = 0;
  while (now < (o.untilS ?? 120) - 1e-9) {
    const slow = (o.slow ?? []).some(([a, b]) => now >= a - 1e-9 && now < b - 1e-9);
    now += STEP;
    for (const [t, dmg] of o.hits ?? []) if (Math.abs(now - t) < STEP / 2 && reconOnShellHit(st, plan, dmg, rng)) log.radioAt.push(now);
    view.identifyInSight = at(o.sight, now);
    view.columnContacts = at(o.contacts ?? [[0, 1e9, 3]], now);
    view.inRelay = (o.relay ?? []).some(([a, b]) => now >= a - 1e-9 && now < b - 1e-9);
    const bits = stepRecon(st, plan, view, o.feelClock && slow ? STEP * SLOW_F : STEP);
    expect(bits).toBe(st.changed);
    if (bits) log.bits.push([now, bits]);
  }
  log.nextAfter = rng.next(); // 系列の位置（引いた回数の比べ）
  return { st, log };
}
const near = (a: number | undefined, b: number, steps = 1): void => {
  expect(a, `${a} vs ${b}`).toBeDefined();
  expect(Math.abs(a! - b), `${a} vs ${b}`).toBeLessThanOrEqual(steps * STEP + 1e-9);
};
const when = (log: Log, bit: number): number | undefined => log.bits.find(([, b]) => b & bit)?.[0];
const BB_FROM_10: Spans = [[10, 15, 1], [15, 60, 2], [60, 1e9, 0]];

describe('計画（us_05 の setup）と作る・戻す', () => {
  it('追う 20 秒・敵の艦の砲弾すべて（damage 1 以上＝機銃も。v0.8.2 IP4）で 30%・noradio は 0・radiofail は 1。段と印の数・系列 seed+45', () => {
    expect([PLAN.trackS, PLAN.radioFailChance, PLAN.radioMinDamage, NEVER.radioFailChance, ALWAYS.radioFailChance]).toEqual([20, 0.3, 1, 0, 1]);
    expect([RECON_NONE, RECON_TRACKING, RECON_SENT, RECON_PENDING, RECON_RELAYED]).toEqual([0, 1, 2, 3, 4]);
    expect([RECON_EV_SEEN, RECON_EV_SENT, RECON_EV_PENDING, RECON_EV_RELAYED, RECON_EV_RADIO]).toEqual([1, 2, 4, 8, 16]);
    expect(RECON_RADIO_SEED_OFFSET).toBe(45);
    const st = createReconState();
    expect([st.stage, st.radioBroken, st.clockS, st.seenAtS, st.seenCount, st.trackedS, st.sentAtS, st.pendingAtS, st.radioBrokenAtS, st.relayedAtS, st.draws, st.changed]).toEqual([0, false, 0, NaN, 0, 0, NaN, NaN, NaN, NaN, 0, 0]);
  });
  it('戦艦を見ない夜は何も起きない（接触があっても・輪に入っても・120 秒）', () => {
    const { st, log } = run(PLAN, { relay: [[30, 60]] });
    expect([st.stage, log.bits, reconDelivered(st)]).toEqual([RECON_NONE, [], false]);
    expect(st.clockS).toBeCloseTo(120, 6);
  });
});

describe('確かめる・追う 20 秒・送る', () => {
  it('10 秒に戦艦が視程に入れば確かめ（TRACKING）、次のステップから 20 秒追って 30 秒に送る。報告の隻数は追う間に一度に見えた最大（2）', () => {
    const { st, log } = run(PLAN, { sight: BB_FROM_10 });
    near(when(log, RECON_EV_SEEN), 10, 0);
    near(when(log, RECON_EV_SENT), 30, 0);
    expect([st.stage, st.seenCount, reconDelivered(st), log.bits.length]).toEqual([RECON_SENT, 2, true, 2]);
    expect([st.seenAtS, st.sentAtS, st.trackedS]).toEqual([expect.closeTo(10, 6), expect.closeTo(30, 6), expect.closeTo(20, 6)]);
    expect([st.pendingAtS, st.relayedAtS, st.radioBrokenAtS]).toEqual([NaN, NaN, NaN]);
  });
  it('報告がまとまった後の隻数は変わらない（送った後に 3 隻見えても 2 のまま）・確かめた時の隻数から始まる', () => {
    expect(run(PLAN, { sight: [[10, 31, 2], [31, 1e9, 3]] }).st.seenCount).toBe(2);
    expect(run(PLAN, { sight: [[10, 1e9, 1]] }).st.seenCount).toBe(1);
  });
  it('追う秒はレーダーの接触のあるステップだけ（15〜20 秒の 5 秒が接触 0 なら 35 秒に送る）。確かめた後に戦艦が視程を出ても追い続ける', () => {
    const { log } = run(PLAN, { sight: [[10, 11, 1]], contacts: [[0, 15, 4], [15, 20, 0], [20, 1e9, 4]] });
    near(when(log, RECON_EV_SENT), 35, 0);
  });
  it('「あと N 秒」（reconTrackLeftS）: 確かめた時は 20・22 秒に 8・送った後と確かめる前は 0', () => {
    const st = createReconState();
    const v: ReconView = { identifyInSight: 0, columnContacts: 2, inRelay: false };
    stepRecon(st, PLAN, v, STEP);
    expect(reconTrackLeftS(st, PLAN)).toBe(0);
    stepRecon(st, PLAN, { ...v, identifyInSight: 1 }, STEP);
    expect(reconTrackLeftS(st, PLAN)).toBeCloseTo(20, 9);
    for (let k = 0; k < 12 * 60; k++) stepRecon(st, PLAN, v, STEP);
    expect(reconTrackLeftS(st, PLAN)).toBeCloseTo(8, 6);
    for (let k = 0; k < 8 * 60; k++) stepRecon(st, PLAN, v, STEP);
    expect([st.stage, reconTrackLeftS(st, PLAN)]).toEqual([RECON_SENT, 0]);
  });
  it('20 秒は固定ステップの時計: 追う間に命中スローがあっても世界が FIXED_STEP_S を渡せば 30 秒に送る（体感の秒を渡せば 0.84 秒延びる＝渡し方の違いが見える）', () => {
    const slow: Opts['slow'] = [[15, 15 + SLOW_S]];
    near(when(run(PLAN, { sight: BB_FROM_10, slow }).log, RECON_EV_SENT), 30, 0);
    near(when(run(PLAN, { sight: BB_FROM_10, slow, feelClock: true }).log, RECON_EV_SENT), 30 + LOST_S, 1);
  });
});

describe('無線の故障と中継', () => {
  it('送る前に壊れれば（radiofail）20 秒で中継待ち、西の輪に入ったステップに中継（止まらなくてよい）。無線の印は次の stepRecon に載る', () => {
    const { st, log } = run(ALWAYS, { sight: BB_FROM_10, hits: [[15, 20]], relay: [[50, 55]] });
    near(log.radioAt[0], 15, 0);
    near(when(log, RECON_EV_RADIO), 15, 0);
    near(when(log, RECON_EV_PENDING), 30, 0);
    near(when(log, RECON_EV_RELAYED), 50, 0);
    expect([st.stage, st.radioBroken, st.draws, reconDelivered(st), when(log, RECON_EV_SENT)]).toEqual([RECON_RELAYED, true, 1, true, undefined]);
    expect([st.radioBrokenAtS, st.pendingAtS, st.relayedAtS]).toEqual([expect.closeTo(15 - STEP, 6), expect.closeTo(30, 6), expect.closeTo(50, 6)]);
  });
  it('確かめる前（NONE）の砲弾も引く。壊れていても追う秒は数える', () => {
    const { st, log } = run(ALWAYS, { sight: BB_FROM_10, hits: [[5, 25]], relay: [[60, 70]] });
    near(when(log, RECON_EV_PENDING), 30, 0);
    expect([st.draws, st.stage]).toEqual([1, RECON_RELAYED]);
  });
  it('引かない: damage 1 未満（0）・送った後・壊れた後。同じ夜の系列の位置で確かめる', () => {
    const base = run(ALWAYS, { sight: BB_FROM_10 }).log.nextAfter;
    const under = run(ALWAYS, { sight: BB_FROM_10, hits: [[14, 0]] });
    expect([under.st.draws, under.st.radioBroken, under.log.nextAfter]).toEqual([0, false, base]);
    const after = run(ALWAYS, { sight: BB_FROM_10, hits: [[31, 50], [40, 80]] });
    expect([after.st.draws, after.st.radioBroken, after.st.stage, after.log.nextAfter]).toEqual([0, false, RECON_SENT, base]);
    const twice = run(ALWAYS, { sight: BB_FROM_10, hits: [[12, 20], [13, 20], [14, 80], [31, 20]] });
    expect([twice.st.draws, twice.log.radioAt.length]).toEqual([1, 1]);
    expect(twice.log.nextAfter).toBe(run(ALWAYS, { sight: BB_FROM_10, hits: [[12, 20]] }).log.nextAfter);
  });
  it('確率 0（noradio）・30%・1（radiofail）でも引く回数は同じ（1 発に 1 回）。0 は壊れない', () => {
    const hits: Opts['hits'] = [[12, 20], [13, 30], [14, 40]];
    const n = run(NEVER, { sight: BB_FROM_10, hits });
    expect([n.st.draws, n.st.radioBroken, n.st.stage]).toEqual([3, false, RECON_SENT]);
    const spy = vi.spyOn(SeededRng.prototype, 'next');
    const st = createReconState();
    const rng = new SeededRng(7);
    for (const p of [NEVER, PLAN, ALWAYS]) {
      resetReconState(st);
      spy.mockClear();
      reconOnShellHit(st, p, 20, rng);
      expect(spy.mock.calls.length).toBe(1);
    }
    spy.mockRestore();
  });
  it('30%（data の radio_fail_chance）は seed+45 の系列の 10 万発で ±0.5 点（3 つの夜の種）', () => {
    for (const seed of [1, 2, 12345]) {
      const rng = new SeededRng(seed + RECON_RADIO_SEED_OFFSET);
      const st = createReconState();
      let broke = 0;
      for (let k = 0; k < 100_000; k++) {
        resetReconState(st);
        if (reconOnShellHit(st, PLAN, PLAN.radioMinDamage, rng)) broke++;
      }
      expect(Math.abs(broke / 100_000 - PLAN.radioFailChance), String(seed)).toBeLessThan(0.005);
    }
  });
  it('追い終える前の輪は何もしない（輪の中で追い終えて中継待ちになれば、そのステップに中継）。送った夜の輪も何もしない', () => {
    const a = run(ALWAYS, { sight: BB_FROM_10, hits: [[5, 20]], relay: [[0, 25]] });
    expect([a.st.stage, when(a.log, RECON_EV_RELAYED)]).toEqual([RECON_PENDING, undefined]);
    const b = run(ALWAYS, { sight: BB_FROM_10, hits: [[5, 20]], relay: [[0, 1e9]] });
    near(when(b.log, RECON_EV_PENDING), 30, 0);
    near(when(b.log, RECON_EV_RELAYED), 30, 0);
    const c = run(PLAN, { sight: BB_FROM_10, relay: [[35, 60]] });
    expect([c.st.stage, when(c.log, RECON_EV_RELAYED)]).toEqual([RECON_SENT, undefined]);
  });
  it('夜明け（270 秒）の後も中継できる（core は夜明けを読まない）', () => {
    const { st, log } = run(ALWAYS, { sight: BB_FROM_10, hits: [[11, 20]], relay: [[300, 301]], untilS: 320 });
    near(when(log, RECON_EV_RELAYED), 300, 0);
    expect(st.stage).toBe(RECON_RELAYED);
  });
});

describe('達成・決定性・source', () => {
  it('達成は届いた（送った・中継した）かつ帰投と同じに数える終わり。沈めば届いていても達成でない（「届いた」は残る）', () => {
    const sent = run(PLAN, { sight: BB_FROM_10 }).st;
    const relayed = run(ALWAYS, { sight: BB_FROM_10, hits: [[12, 20]], relay: [[40, 41]] }).st;
    const pending = run(ALWAYS, { sight: BB_FROM_10, hits: [[12, 20]] }).st;
    const none = run(PLAN).st;
    const ends: MissionEndReason[] = ['returned', 'cleared', 'destroyed', 'rammed', 'adrift', 'grounded'];
    expect(ends.map((r) => [reconObjectiveDone(sent, r), reconObjectiveDone(relayed, r), reconObjectiveDone(pending, r), reconObjectiveDone(none, r)])).toEqual([
      [true, true, false, false], [true, true, false, false], [false, false, false, false], [false, false, false, false], [false, false, false, false], [false, false, false, false],
    ]);
    expect([reconDelivered(sent), reconDelivered(relayed), reconDelivered(pending), reconDelivered(none)]).toEqual([true, true, false, false]);
  });
  const busy: Opts = { sight: [[8, 9, 1], [20, 40, 2]], contacts: [[0, 12, 3], [12, 14, 0], [14, 1e9, 5]], hits: [[6, 20], [9, 13], [10, 40], [11, 76], [27, 90]], relay: [[50, 52]], slow: [[9, 9 + SLOW_S]], seed: 5 };
  it('同じ入力で同じ段・秒・引く回数（2 回）。夜ごとに戻した状態で回し直しても新しく作った物と同じ', () => {
    const a = run(PLAN, busy);
    expect(JSON.stringify(a)).toBe(JSON.stringify(run(PLAN, busy)));
    expect(a.st.draws).toBeGreaterThan(0);
    resetReconState(a.st);
    expect([a.st.stage, a.st.radioBroken, a.st.clockS, a.st.draws, a.st.seenAtS, a.st.relayedAtS, a.st.radioEvent]).toEqual([0, false, 0, 0, NaN, NaN, false]);
    expect(JSON.stringify(run(PLAN, busy, a.st))).toBe(JSON.stringify(run(PLAN, busy)));
  });
  it('作る関数（createReconState）のほかは本体に確保の形が無い。import は core/mission-flow と core/rng の型だけ・平方根・atan2・Math.random を使わない', () => {
    const { names, bad } = scanAllocations(FILE, ['createReconState']);
    expect(names).toEqual(['createReconState', 'reconDelivered', 'reconObjectiveDone', 'reconOnShellHit', 'reconTrackLeftS', 'resetReconState', 'stepRecon']);
    expect(bad).toEqual([]);
    const s = code(FILE);
    expect(imports(s)).toEqual(['./mission-flow', './rng']);
    expect(s).toMatch(/import type \{ SeededRng \} from '\.\/rng'/);
    expect(s).not.toMatch(/Math\.(sqrt|hypot|atan2|random)\b|\.chance\(/);
  });
  it('S2 から import するのは systems/world-recon（世界の側）・mission-objective（達成）・recon-telemetry（あと何秒）だけ（lead の L26。S1 は誰も import しなかった）。S4 から HUD と Result の段の定数・状態の型も', () => {
    // v0.8.2 S4: 2 行目の文（ui/recon-texts の段）・中継の端の印（ui/hud-markers の中継待ち）・Result の報告の行（ui/recon-result の段）と材料（systems/recon-result-part の状態の型）。どれも読むだけ
    // v0.8.5 IP7: 4 行目の任務の行（ui/objective-specs の段。読むだけ）
    expect(SRC.filter((f) => imports(code(f)).some((p) => p.endsWith('/recon-report')))).toEqual(['src/systems/mission-objective.ts', 'src/systems/recon-result-part.ts', 'src/systems/recon-telemetry.ts', 'src/systems/world-recon.ts', 'src/ui/hud-markers.ts', 'src/ui/objective-specs.ts', 'src/ui/recon-result.ts', 'src/ui/recon-texts.ts']);
  });
});
