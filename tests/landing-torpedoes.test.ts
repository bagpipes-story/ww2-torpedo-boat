// 米PT の魚雷（2 つ目のプール。v0.6.9 S2。core/landing-torpedoes。spec-v069 §4.3・D12・§9・R8/F16）:
// (1) 模擬の写し（stepLandingTorpedoes）は systems/torpedo-pool.ts の TorpedoPool.step（凍結の pin のファイルの本文をそのまま esbuild で JS にして回す）と、
//     同じ発射の並びで状態（雷跡の点の位置 nextWakeAtM を除く）と知らせの順が 1 手ずつ同じ。
// (2) 決まった場面で 命中・通り過ぎの外れ・射程の外れ・海域の外・武装前・沈んだ船体（out）・終わり際の当たりなし。
// (3) LandingTorpedoLink: 斉射の数え（salvo*）と出来事（被雷・不発（そのときの被雷の数）・外れ・沈没・揚陸の後の沈没。沈んだ後の外れは出さない）・演出の知らせ。
// (4) 雷撃 → link → 写しのプール → 輸送船の通しで、気づかれていない斉射の 1 本の命中率が帯（spec §8: 0.30〜0.50）に入る（試作 aspect-mc の 0.44）。
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { createLanding, tickLanding, LD_SUNK, LE_CALM, LE_DUD, LE_ENGAGED, LE_HIT, LE_HURRIED, LE_MISS, LE_SUNK, LE_SUNK_DONE, type LandingState } from '../src/core/landing';
import { LandingTorpedoLink, LandingTorpedoPool, stepLandingTorpedoes, type LandingHitHooks } from '../src/core/landing-torpedoes';
import { PT_PATROL } from '../src/core/pt-boats';
import { PT_SALVO_CALM, PT_SALVO_ENGAGED, PT_SALVO_HURRIED, createPtTorpedoState, stepPtTorpedoes } from '../src/core/pt-torpedo';
import { SeededRng } from '../src/core/rng';
import { consumeWakeMark, createTorpedoState, isArmed, launchTorpedo, markMissIfPassed, stepTorpedo, type TorpedoState } from '../src/core/torpedo';
import { createTargetScan, scanTargets, type TorpedoEvents, type TorpedoTarget } from '../src/core/torpedo-targets';
import { FEEL_DT, LP, P, TP, TS, bench, place } from './landing-kit';

const MK = TP.torpedo;
const BOUNDS = P.bounds;
const DT = FEEL_DT * TS;
const read = (p: string): string => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
const WAKE_M = Number(/export const WAKE_DOT_SPACING_M = (\d+)/.exec(read('config/ui-config.ts'))![1]);

type PoolStep = (dt: number, realDt: number, targets: readonly TorpedoTarget[], passRadius2: number, events: TorpedoEvents, nowS?: number, settleS?: number) => void;
/** systems/torpedo-pool.ts の TorpedoPool.step の本文（this は ctx・雷跡の点を置くのは何もしない）をそのまま JS にした関数 */
function poolStepFromSource(states: TorpedoState[]): PoolStep {
  const src = read('systems/torpedo-pool.ts');
  const method = src.slice(src.indexOf('  step(dt: number'), src.indexOf('  /** 任務終了時'));
  expect(method).toContain('events.onHit(sc.hit, s.x, s.y, s);');
  const ts = `function step${method.trim().slice('step'.length).replace(/this\./g, 'ctx.')}`;
  const js = transformSync(ts, { loader: 'ts' }).code;
  const ctx = { states, params: MK, bounds: BOUNDS, scan: createTargetScan(), placeWakeDot: (): void => {} };
  const make = new Function('ctx', 'stepTorpedo', 'consumeWakeMark', 'isArmed', 'scanTargets', 'markMissIfPassed', 'WAKE_DOT_SPACING_M', `${js}; return step;`);
  return make(ctx, stepTorpedo, consumeWakeMark, isArmed, scanTargets, markMissIfPassed, WAKE_M) as PoolStep;
}

/** 知らせを記録し、命中は輸送船に数える（沈めば out＝同じ場面の 2 つの走りで同じに進む） */
function recorder(ld: LandingState, states: readonly TorpedoState[], log: string[]): TorpedoEvents {
  const k = (s: TorpedoState): number => states.indexOf(s);
  return {
    onHit: (t, x, y, s) => {
      log.push(`hit ${k(s)} ${t} ${x} ${y}`);
      if (++ld.hits >= 2) ld.out = ld.sinking = ld.sunk = true;
    },
    onLateHit: (t, _x, _y, s) => log.push(`late ${k(s)} ${t}`),
    onMiss: (s) => log.push(`miss ${k(s)} ${s.x} ${s.y}`),
  };
}

/** 同じ乱数で n 本: 泊地のまわり 500〜2,500 m から泊地へ ±12° で、不発・蛇行あり。何本かは海域の縁から外へ、最後の 1 本は泊地の遠くを東へ（通り過ぎの外れの後に射程が尽きる） */
function launchAll(states: TorpedoState[], seed: number): void {
  const r = new SeededRng(seed);
  for (let i = 0; i < states.length; i++) {
    const s = states[i]!;
    if (i === states.length - 1) {
      launchTorpedo(s, 100, 300, 90, false, false, 0, NaN, WAKE_M); // 東へ（泊地の北 2,460 m を通り過ぎ、海域の中で射程 5,760 m が尽きる）
      continue;
    }
    const a = r.nextRange(0, 2 * Math.PI);
    const d = r.nextRange(500, 2500);
    const x = Math.min(5990, Math.max(10, LP.x + d * Math.sin(a)));
    const y = Math.min(2990, Math.max(10, LP.y - d * Math.cos(a)));
    const h = (Math.atan2(LP.x - x, -(LP.y - y)) * 180) / Math.PI + r.nextRange(-12, 12);
    const er = r.chance(0.3);
    launchTorpedo(s, x, y, h, r.chance(0.2), er, er ? r.nextRange(-2, 2) : 0, d, WAKE_M);
  }
}

describe('(1) 写しは TorpedoPool.step と 1 手ずつ同じ（spec §4.3・D12）', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('seed %i: 12 本・6,000 ステップの状態と知らせの順が同じ（nextWakeAtM だけ違う＝写しは雷跡の点を置かない）', (seed) => {
    const a = Array.from({ length: 12 }, createTorpedoState);
    const b = Array.from({ length: 12 }, createTorpedoState);
    launchAll(a, seed);
    launchAll(b, seed);
    const la = createLanding(LP);
    const lb = createLanding(LP);
    const logA: string[] = [];
    const logB: string[] = [];
    const evA = recorder(la, a, logA);
    const evB = recorder(lb, b, logB);
    const pool = poolStepFromSource(a);
    for (let k = 0; k < 6000; k++) {
      pool(DT, FEEL_DT, [la], LP.passRadius2, evA); // nowS 既定 NaN＝終わり際の当たりは見ない（世界の敵のプールと同じ）
      stepLandingTorpedoes(b, MK, BOUNDS, [lb], LP.passRadius2, evB, DT, FEEL_DT);
      if (k % 500 === 0) expect(JSON.stringify(b.map(({ nextWakeAtM: _, ...r }) => r))).toBe(JSON.stringify(a.map(({ nextWakeAtM: _, ...r }) => r)));
    }
    expect(logB).toEqual(logA);
    expect(JSON.stringify(b.map(({ nextWakeAtM: _, ...r }) => r))).toBe(JSON.stringify(a.map(({ nextWakeAtM: _, ...r }) => r)));
    expect(logA.some((l) => l.startsWith('hit'))).toBe(true);
    expect(logA.some((l) => l.startsWith('miss'))).toBe(true);
    expect(logA.some((l) => l.startsWith('late'))).toBe(false);
  });
});

describe('(2) 決まった場面', () => {
  const one = (x: number, y: number, h: number, hulls: readonly TorpedoTarget[], steps = 5000, dud = false): { s: TorpedoState; log: string[] } => {
    const s = createTorpedoState();
    launchTorpedo(s, x, y, h, dud, false, 0, 0, WAKE_M);
    const log: string[] = [];
    const ev: TorpedoEvents = { onHit: (t) => log.push(`hit ${t}`), onLateHit: () => log.push('late'), onMiss: () => log.push(`miss ${s.active ? 'running' : 'stopped'}`) };
    for (let k = 0; k < steps; k++) stepLandingTorpedoes([s], MK, BOUNDS, hulls, LP.passRadius2, ev, DT, FEEL_DT);
    return { s, log };
  };
  it('泊地へまっすぐ: 命中（武装の後・決着して止まる）。不発も「命中」の知らせ（不発かは呼ぶ側が s.dud で見る）', () => {
    const ld = createLanding(LP);
    expect(one(LP.x - 900, LP.y, 90, [ld]).log).toEqual(['hit 0']);
    expect(one(LP.x - 900, LP.y, 90, [ld], 5000, true).log).toEqual(['hit 0']);
  });
  it('それた魚雷: 通り過ぎで外れ 1 回（走り続ける）、海域の外に出ても 2 回目は無い', () => {
    expect(one(LP.x - 900, LP.y, 60, [createLanding(LP)], 1000).log).toEqual(['miss running']);
    const { s, log } = one(LP.x - 900, LP.y, 60, [createLanding(LP)]);
    expect(log).toEqual(['miss running']);
    expect([s.resolved, s.active]).toEqual([true, false]);
  });
  it('的が無い（沈んだ船体は out）: 通り過ぎを見ずに走り、海域の外か射程で外れ 1 回。終わり際の当たりは無い', () => {
    const ld = createLanding(LP);
    ld.out = ld.sinking = ld.sunk = true;
    ld.sinkStartS = 0;
    expect(one(LP.x - 900, LP.y, 90, [ld]).log).toEqual(['miss stopped']); // 輸送船を抜けて海域の東の縁まで
    expect(one(100, 300, 90, []).log).toEqual(['miss stopped']); // 射程 5,760 m（海域の中）
  });
  it('武装の前（100 m）は船体の中でも当たらない: 船体の中心から撃った 1 本は当たらずに抜けて外れ', () => {
    expect(one(LP.x - 2, LP.y, 90, [createLanding(LP)], 3).log).toEqual([]);
    expect(one(LP.x - 2, LP.y, 90, [createLanding(LP)], 300).log).toEqual(['miss running']);
  });
});

/** 斉射の n 本を link に入れ、知らせを手で順に出す場面 */
function linkBench(done = false): { ld: LandingState; link: LandingTorpedoLink; pool: LandingTorpedoPool; st: ReturnType<typeof createPtTorpedoState>; fx: string[] } {
  const ld = createLanding(LP);
  if (done) tickLanding(ld, LP, LP.unloadS);
  const st = createPtTorpedoState(2, 3);
  const pool = new LandingTorpedoPool(MK, 6, BOUNDS, WAKE_M);
  const fx: string[] = [];
  const hooks: LandingHitHooks = { onShipHit: (x, y, dud, sunk) => fx.push(`${x},${y} ${dud ? 'dud' : 'hit'}${sunk ? ' sunk' : ''}`) };
  const link = new LandingTorpedoLink(ld, LP, st, pool, hooks);
  st.salvoLeft[1] = 3; // pt-torpedo の salvo() は撃つ前に本数を書く
  for (let k = 0; k < 3; k++) link.fire(1, 2000, 2000, 90 + k, false, false, 0, 1000);
  link.onSalvo(1, PT_SALVO_CALM, 1000, 3);
  return { ld, link, pool, st, fx };
}

describe('(3) LandingTorpedoLink（斉射の数えと出来事。spec §4.3・F16）', () => {
  it('fire はプールへ・onSalvo は「雷撃！」（気づかれていない・慌てた・戦いながら（R12））の出来事（距離と本数）', () => {
    const { ld, pool, link } = linkBench();
    expect(pool.remaining).toBe(3);
    expect([ld.eventKind, ld.eventBoat, ld.eventM, ld.eventCount, ld.eventSeq]).toEqual([LE_CALM, 1, 1000, 3, 1]);
    link.onSalvo(0, PT_SALVO_HURRIED, 1250, 3);
    expect([ld.eventKind, ld.eventBoat, ld.eventM]).toEqual([LE_HURRIED, 0, 1250]);
    link.onSalvo(1, PT_SALVO_ENGAGED, 820, 3);
    expect([ld.eventKind, ld.eventBoat, ld.eventM, ld.eventCount, ld.eventSeq]).toEqual([LE_ENGAGED, 1, 820, 3, 3]);
  });
  it('3 本とも外れ: 最後の 1 本で「外れ」（途中は出さない）', () => {
    const { ld, link, pool, st } = linkBench();
    link.onMiss(pool.states[0]!);
    link.onMiss(pool.states[1]!);
    expect(ld.eventSeq).toBe(1);
    link.onMiss(pool.states[2]!);
    expect([ld.eventKind, ld.eventBoat, ld.eventSeq, st.salvoLeft[1]]).toEqual([LE_MISS, 1, 2, 0]);
  });
  it('不発 → 外れ → 外れ: 不発の命中で「不発」（被雷 0）、命中の無い斉射の終わりも「不発」（spec §4.3）', () => {
    const { ld, link, pool, st, fx } = linkBench();
    pool.states[0]!.dud = true;
    link.onHit(0, 2950, 2760, pool.states[0]!);
    expect([ld.eventKind, ld.eventHits, ld.duds, ld.hits, st.salvoDuds[1], fx]).toEqual([LE_DUD, 0, 1, 0, 1, ['2950,2760 dud']]);
    link.onMiss(pool.states[1]!);
    link.onMiss(pool.states[2]!);
    expect([ld.eventKind, ld.eventSeq]).toEqual([LE_DUD, 3]);
  });
  it('命中 → 不発 → 外れ: 「被雷」、不発は被雷 1 のまま（F16: eventHits 1）、斉射の終わりは出さない（命中がある）', () => {
    const { ld, link, pool, st } = linkBench();
    link.onHit(0, 2950, 2760, pool.states[0]!);
    expect([ld.eventKind, ld.eventHits, ld.hits, st.salvoHits[1], ld.phase]).toEqual([LE_HIT, 1, 1, 1, 0]);
    pool.states[1]!.dud = true;
    link.onHit(0, 2950, 2760, pool.states[1]!);
    expect([ld.eventKind, ld.eventHits]).toEqual([LE_DUD, 1]);
    link.onMiss(pool.states[2]!);
    expect([ld.eventSeq, st.salvoLeft[1]]).toEqual([3, 0]);
  });
  it('2 本命中: 「撃沈」（演出は沈没）・沈み始めた時計は link.nowS。沈んだ後の外れは出来事にしない', () => {
    const { ld, link, pool, fx } = linkBench();
    link.nowS = 77.5;
    link.onHit(0, 1, 2, pool.states[0]!);
    link.onHit(0, 3, 4, pool.states[1]!);
    expect([ld.eventKind, ld.phase, ld.sinkStartS, fx]).toEqual([LE_SUNK, LD_SUNK, 77.5, ['1,2 hit', '3,4 hit sunk']]);
    link.onMiss(pool.states[2]!);
    expect(ld.eventSeq).toBe(3);
  });
  it('揚陸完了の後の 2 本命中は「揚陸の後の沈没」', () => {
    const { ld, link, pool } = linkBench(true);
    link.onHit(0, 0, 0, pool.states[0]!);
    link.onHit(0, 0, 0, pool.states[1]!);
    expect([ld.eventKind, ld.sunkAfterDone]).toEqual([LE_SUNK_DONE, true]);
  });
  it('プールが受け取れない 1 本はその場で決着（斉射の残りが 0 に戻る）。知らない魚雷の知らせは無視', () => {
    const ld = createLanding(LP);
    const st = createPtTorpedoState(1, 3);
    const pool = new LandingTorpedoPool(MK, 0, BOUNDS);
    const link = new LandingTorpedoLink(ld, LP, st, pool);
    st.salvoLeft[0] = 3;
    for (let k = 0; k < 3; k++) link.fire(0, 0, 0, 0, false, false, 0, 900);
    expect(st.salvoLeft[0]).toBe(0);
    link.onMiss(createTorpedoState());
    expect(ld.eventSeq).toBe(0);
  });
});

describe('(4) 雷撃 → link → 写しのプール → 輸送船（通し）', () => {
  it('気づかれていない斉射（北の線・泊地から 900 m・角度 49°）の 1 本の命中率が 0.30〜0.50、斉射の数えは決着の合計と合う', () => {
    let hits = 0;
    let fired = 0;
    let duds = 0;
    const N = 300;
    for (let n = 0; n < N; n++) {
      const b = bench();
      const pool = new LandingTorpedoPool(MK, 6, BOUNDS, WAKE_M);
      const link = new LandingTorpedoLink(b.ld, LP, b.st, pool);
      place(b, 0, 899.5, 4.5, 0, PT_PATROL); // 北の線の終わりの向き（線 0 は 175° 前後で南へ）
      const rng = new SeededRng(1000 + n);
      stepPtTorpedoes(b.st, TP, b.q, b.ld, rng, false, 60, FEEL_DT, link, () => {});
      for (let k = 0; k < 900; k++) {
        link.nowS = 60 + k * FEEL_DT;
        pool.step(DT, FEEL_DT, [b.ld], LP.passRadius2, link);
      }
      expect(b.st.salvoLeft[0], `night ${n}`).toBe(0);
      expect(b.st.salvoHits[0]).toBe(b.ld.hits);
      hits += b.st.salvoHits[0]!;
      duds += b.st.salvoDuds[0]!;
      fired += b.st.fired;
    }
    const perTorpedo = hits / fired;
    expect(fired).toBe(3 * N);
    expect(perTorpedo).toBeGreaterThan(0.3);
    expect(perTorpedo).toBeLessThan(0.5);
    expect(duds).toBeGreaterThan(0);
  });
});
