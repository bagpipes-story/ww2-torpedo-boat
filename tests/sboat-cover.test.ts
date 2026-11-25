// v0.8.5 S1（spec-v0850 §4.4）: フィッチの砲火で S ボートが退く（core/sboat-cover）。凍結の米PT の AI（tests/frozen-files の 20 本）は変えない。
// 距離の縁 ±1 m・秒の縁（4 秒＝60 Hz の 240 ステップ目）・外へ出れば 0 から・航過の中は待つ（抜けたステップに内なら去る）・去った・海域の外・沈んだは数えない・乱数を引かない、
// 外から去らせた後に隊の欄（owner・burst・held・相方・追撃の目標・連射）が宙に浮かない（凍結の stepPtSection を回して、去った S ボートは戻らず海域の外へ出て、残りの S ボートは航過を続ける）。
import { describe, expect, it, vi } from 'vitest';
import { gameData } from '../src/config/game-data';
import { PT_SHELL_POOL_SIZE } from '../src/config/pt-config';
import { PT_ALERT, PT_BREAK, PT_CHASE, PT_LEAVE, PT_OUT, PT_PASS, PT_PATROL, PT_RUN_IN, PT_SUNK, createPtSection, stepPtSection, type PtSection } from '../src/core/pt-boats';
import { SeededRng } from '../src/core/rng';
import { createSboatCover, stepSboatCover, type SboatCoverRules, type SboatCoverState } from '../src/core/sboat-cover';
import { buildWorldSetup } from '../src/systems/world-setup';
import { code, imports, scanAllocations } from './core-rules-kit';
import { checkAt, events, FEEL_DT, TS } from './landing-kit';

const S = buildWorldSetup(gameData, 'us_07');
const P = S.ptBoats!;
const F: SboatCoverRules = S.rescue!.fitch;
const COVER_M = Math.sqrt(F.cover2);

interface Bench { q: PtSection; st: SboatCoverState; left: number[] }
const bench = (): Bench => {
  const q = createPtSection(P, PT_SHELL_POOL_SIZE);
  for (const b of q.boats) b.phase = PT_OUT;
  return { q, st: createSboatCover(q.boats.length), left: [] };
};
const put = (b: Bench, i: number, d: number, phase: number): void => {
  const pt = b.q.boats[i]!;
  pt.x = F.x - d;
  pt.y = F.y;
  pt.phase = phase;
};
const cover = (b: Bench, n: number, r: SboatCoverRules = F): void => {
  for (let k = 0; k < n; k++) stepSboatCover(b.st, r, b.q, FEEL_DT, { onLeave: (i) => b.left.push(i) });
};

describe('data（us_07）', () => {
  it('フィッチ (3750, 1450。v0.8.5 S3 で寄せ、IP1 で北へ) から 1,550 m（IP1 で 1,200 から。コリーまでの距離 − 約 150 m）の内に 4 秒。S ボートはノーマル 2・ハード 3', () => {
    expect([F.x, F.y, COVER_M, F.coverS, P.count, buildWorldSetup(gameData, 'us_07', { hard: true }).ptBoats!.count]).toEqual([3750, 1450, 1550, 4, 2, 3]);
  });
});

describe('退く規則', () => {
  it('距離の縁: cover_m − 1 m（1,549 m）は 4 秒で去る（PT_LEAVE・timerS 0・onLeave）、＋ 1 m（1,551 m）は去らない', () => {
    for (const [d, want] of [[COVER_M - 1, true], [COVER_M + 1, false]] as const) {
      const b = bench();
      put(b, 0, d, PT_RUN_IN);
      b.q.boats[0]!.timerS = 3.3;
      cover(b, 600);
      expect([b.q.boats[0]!.phase === PT_LEAVE, b.left, b.st.count, b.st.retreated[0]], `${d} m`).toEqual(want ? [true, [0], 1, 1] : [false, [], 0, 0]);
      if (want) expect([b.q.boats[0]!.timerS, b.st.seq, b.st.last]).toEqual([0, 1, 0]);
    }
  });
  it('秒の縁: 239 ステップ（3.98 秒）では去らず、240 ステップ目（4 秒）で去る。外へ 1 ステップ出れば 0 から', () => {
    const b = bench();
    put(b, 0, 500, PT_ALERT);
    cover(b, 239);
    expect([b.q.boats[0]!.phase, b.left]).toEqual([PT_ALERT, []]);
    cover(b, 1);
    expect([b.q.boats[0]!.phase, b.left]).toEqual([PT_LEAVE, [0]]);
    const c = bench();
    put(c, 1, 500, PT_CHASE);
    cover(c, 200);
    put(c, 1, COVER_M + 10, PT_CHASE);
    cover(c, 1);
    expect(c.st.inS[1]).toBe(0);
    put(c, 1, 500, PT_CHASE);
    cover(c, 239);
    expect(c.left).toEqual([]);
    cover(c, 1);
    expect([c.q.boats[1]!.phase, c.left]).toEqual([PT_LEAVE, [1]]);
  });
  it('航過の中は待つ（秒は数え続け waiting 1）。航過を抜けた（離脱）最初のステップに内に居ればすぐ去る', () => {
    const b = bench();
    put(b, 0, 300, PT_PASS);
    b.q.owner = 0;
    cover(b, 600);
    expect([b.q.boats[0]!.phase, b.left, b.st.waiting, b.st.inS[0]! > 9.9]).toEqual([PT_PASS, [], 1, true]);
    b.q.boats[0]!.phase = PT_BREAK;
    b.q.owner = -1;
    cover(b, 1);
    expect([b.q.boats[0]!.phase, b.left, b.st.waiting]).toEqual([PT_LEAVE, [0], 0]);
  });
  it('哨戒・警戒・突撃・離脱・追撃は去らせる。去る・海域の外・沈んだは数えない（秒も 0・onLeave なし）', () => {
    for (const ph of [PT_PATROL, PT_ALERT, PT_RUN_IN, PT_BREAK, PT_CHASE, PT_LEAVE, PT_OUT, PT_SUNK]) {
      const b = bench();
      put(b, 0, 100, ph);
      cover(b, 300);
      const live = ph < PT_LEAVE;
      expect([b.q.boats[0]!.phase, b.left, b.st.count], `段階 ${ph}`).toEqual([live ? PT_LEAVE : ph, live ? [0] : [], live ? 1 : 0]);
    }
  });
  it('乱数を引かない（どのステップも）', () => {
    const b = bench();
    put(b, 0, 100, PT_RUN_IN);
    put(b, 1, 100, PT_PASS);
    const spy = vi.spyOn(SeededRng.prototype, 'next');
    cover(b, 600);
    expect(spy.mock.calls.length).toBe(0);
    spy.mockRestore();
  });
});

describe('外から去らせても隊の欄が宙に浮かない（凍結の stepPtSection を回す）', () => {
  /** 止まって見える自艇（コリーの北）へ S ボートの隊を回し、i 隻目が phase になった最初のステップに（航過の外で）フィッチの砲火を当てる（その S ボートの居る所を中心に半径 1 m・1 ステップ） */
  const run = (phase: number): { at: number; q: PtSection; before: number; after: number } => {
    const q = createPtSection(P, PT_SHELL_POOL_SIZE);
    const st = createSboatCover(q.boats.length);
    const c = checkAt(2600, 2200, { targetValid: true, detectOpenM: 3600, visRange2: 2700 * 2700 });
    const rng = new SeededRng(19);
    let at = -1;
    let before = 0;
    for (let k = 0; k < 60 * 400; k++) {
      c.timeS = k * FEEL_DT;
      c.boat.headingDeg = 90;
      c.boat.speedMps = k > 60 * 100 && c.boat.x < 5000 ? 15 : 0;
      c.boat.x += c.boat.speedMps * FEEL_DT * TS;
      stepPtSection(q, P, c, rng, FEEL_DT, FEEL_DT * TS, events());
      const b = q.boats[0]!;
      if (at < 0 && b.phase === phase && q.owner !== 0) {
        at = k;
        before = q.passes;
        stepSboatCover(st, { x: b.x, y: b.y, cover2: 1, coverS: FEEL_DT }, q, FEEL_DT, { onLeave: () => {} });
        expect(b.phase).toBe(PT_LEAVE);
        continue;
      }
      if (at >= 0) {
        expect(b.phase >= PT_LEAVE, `${k}`).toBe(true);
        expect([q.owner === 0, b.burst]).toEqual([false, false]);
      }
    }
    return { at, q, before, after: q.passes };
  };
  it.each([PT_ALERT, PT_RUN_IN, PT_BREAK, PT_CHASE])('段階 %i で去らせた S ボートは戻らず海域の外へ出て、残りの S ボートは航過を続ける', (phase) => {
    const r = run(phase);
    expect(r.at, '段階に着かなかった').toBeGreaterThan(0);
    expect(r.q.boats[0]!.phase).toBe(PT_OUT);
    expect(r.after).toBeGreaterThan(r.before);
  });
});

describe('確保・import', () => {
  it('作る関数（createSboatCover）のほかは本体に確保の形が無い。import は pt-boats だけ・乱数・平方根を使わない', () => {
    const { names, bad } = scanAllocations('src/core/sboat-cover.ts', ['createSboatCover']);
    expect(names).toEqual(['createSboatCover', 'stepSboatCover']);
    expect(bad).toEqual([]);
    const s = code('src/core/sboat-cover.ts');
    expect(imports(s)).toEqual(['./pt-boats']);
    expect(s).not.toMatch(/Math\.(sqrt|hypot|atan2|random)\b|SeededRng|\brng\b/);
  });
});
