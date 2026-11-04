// 卯月の見張り・照らす PT・ステップの中の順（v0.6.10 S2。core/ally-destroyer。spec-v0610 R-U1〜R-U3・R-U6・リードの決定 LD10）: seed+27 は候補の PT 1 隻 1 ステップに 1 回だけ
// （候補でない PT・気づいた PT・去った PT は引かない＝draws27 = 候補のステップ）、速さの境目（fast_kt。8 kt は遅い・25 kt は速い）・距離・扇（端を含む・最初に気づくときだけ）・
// 気づき方 1 − exp(−rate × 体感秒)、気づいたら去るまで覚える、照らす PT（続ける・最も近い・射程の外・去った PT を chase_fire_s 追う・海域の外と沈んだは追わない・生きた PT が割り込む・
// 照らされた秒は変われば 0）、照らされている印、ステップの中の順（見張り → 照らす PT → 探照灯 → 砲 → 反応 → 印）、毎ステップ確保しない。砲・手柄・反応は tests/ally-destroyer-guns。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALLY_GUN_SEED_OFFSET, ALLY_LOOKOUT_SEED_OFFSET } from '../src/core/ally-destroyer';
import { PT_BREAK, PT_LEAVE, PT_OUT, PT_PASS, PT_PATROL, PT_SUNK } from '../src/core/pt-boats';
import { ktToMps } from '../src/core/units';
import { A, allyBench, atAlly, FixedRng, QUIET, SeqRng, stepAlly, stepUntil } from './ally-kit';
import { FEEL_DT, P } from './landing-kit';

const SLOW = ktToMps(8);
const FAST = ktToMps(25);
/** 気づく確率（1 ステップ） */
const pr = (rate: number): number => 1 - Math.exp(-rate * FEEL_DT);

describe('値（jp_04。data のまま）と組み立て', () => {
  it('seed+27・+28、泊地の北東 (3620, 2380)・艇首 90°・扇 50〜180°・遅い 350 m 0.3/秒・速い 800 m 0.4/秒・15 kt・1.0 秒・2.5 秒・12 cm の沈む確率 0.10・弾 16', () => {
    expect([ALLY_LOOKOUT_SEED_OFFSET, ALLY_GUN_SEED_OFFSET]).toEqual([27, 28]);
    expect([A.x, A.y, A.headingDeg, A.arc0Deg, A.arc1Deg, A.lookSlowM, A.rateSlow, A.lookFastM, A.rateFast, A.lightReactS, A.chaseFireS, A.sinkGunIndex, A.ptSinkChance, A.shellPoolSize]).toEqual([3620, 2380, 90, 50, 180, 350, 0.3, 800, 0.4, 1, 2.5, 0, 0.1, 16]);
    expect(A.fastMps).toBeCloseTo(ktToMps(15), 12);
    expect([A.gunnery.guns.map((g) => g.id), A.gunnery.searchlight.rangeM, A.gunnery.starshell.rangeM]).toEqual([['main_120mm', 'aa_25mm'], 1500, 0]);
    expect(P.patrolMps).toBeLessThan(A.fastMps); // 忍び寄る PT（哨戒 8 kt）は遅い見張り、航過（25 kt）は速い見張り
    expect(P.passMinMps).toBeGreaterThanOrEqual(A.fastMps);
  });
  it('createAllyDestroyer: PT ごとの印は隻数の長さで 0、12 cm の値は米PT の写し（fireChance だけ 0.10。元は変えない）、止まった艦・弾 16・探照灯は艇首から', () => {
    const { a } = allyBench();
    for (const m of [a.spotted, a.reacted, a.lit, a.everLit, a.credit.fateBy]) expect(Array.from(m)).toEqual([0, 0]);
    expect([a.pHit.fireChance, P.fireChance, a.pHit.casualtyChance, a.pHit.retreatHp, a.pHit.hitHalfLengthM]).toEqual([0.1, 0.003, P.casualtyChance, P.retreatHp, P.hitHalfLengthM]);
    expect([a.ship.x, a.ship.y, a.ship.headingDeg, a.ship.speedMps, a.g.shells.length, a.g.light.bearingDeg, a.target, a.light2]).toEqual([3620, 2380, 90, 0, 16, 90, -1, 1500 * 1500]);
  });
  it('PT がみな海域の外なら何も引かない・照らさない', () => {
    const b = allyBench();
    stepAlly(b, 600);
    expect([b.rng27.draws, b.rng28.draws, b.a.candSteps, b.a.target, b.a.g.light.on, b.a.shells]).toEqual([0, 0, 0, -1, false, 0]);
  });
});

describe('見張り（seed+27。R-U2）', () => {
  it('候補（遅い PT・300 m・扇の内）は気づくまで 1 ステップ 1 回、気づいた後は引かない（draws27 = 候補のステップ）', () => {
    const b = allyBench();
    atAlly(b, 0, 300, 100, 270, SLOW, PT_PATROL);
    const k = stepUntil(b, () => b.a.spotted[0] === 1);
    expect(k).toBeGreaterThan(0);
    expect([b.rng27.draws, b.a.candSteps, b.a.spots]).toEqual([k, k, 1]);
    stepAlly(b, 300);
    expect([b.rng27.draws, b.a.candSteps, b.a.spotted[0]]).toEqual([k, k, 1]);
  });
  it('候補でない PT は引かない: 扇の外（20°）・遅いのに 400 m・速いのに 850 m・去った・海域の外・沈んだ', () => {
    for (const [d, brg, v, ph] of [[300, 20, SLOW, PT_PATROL], [400, 100, SLOW, PT_PATROL], [850, 100, FAST, PT_BREAK], [300, 100, SLOW, PT_LEAVE], [300, 100, SLOW, PT_OUT], [300, 100, SLOW, PT_SUNK]] as const) {
      const b = allyBench();
      atAlly(b, 0, d, brg, 0, v, ph);
      stepAlly(b, 120);
      expect([b.rng27.draws, b.a.candSteps, b.a.spotted[0]], `${d} m ${brg}° 段階 ${ph}`).toEqual([0, 0, 0]);
    }
  });
  it('速さの境目: 600 m では fast_kt ちょうど・25 kt は候補、それより遅い・8 kt は候補でない。300 m の 8 kt は候補', () => {
    for (const [d, v, cand] of [[600, A.fastMps, true], [600, FAST, true], [600, A.fastMps - 1e-9, false], [600, SLOW, false], [300, SLOW, true], [349, SLOW, true]] as const) {
      const b = allyBench({ rng27: new FixedRng(0.999999) });
      atAlly(b, 0, d, 120, 0, v, PT_PATROL);
      stepAlly(b);
      expect(b.a.candSteps, `${d} m ${v} m/s`).toBe(cand ? 1 : 0);
    }
  });
  it('気づき方: u < 1 − exp(−rate × 体感秒)（遅い 0.3・速い 0.4。境目の u は気づかない）', () => {
    for (const [v, rate] of [[SLOW, A.rateSlow], [FAST, A.rateFast]] as const) {
      for (const [u, want] of [[pr(rate) * (1 - 1e-9), 1], [pr(rate), 0]] as const) {
        const b = allyBench({ rng27: new FixedRng(u) });
        atAlly(b, 0, 300, 120, 0, v, PT_PATROL);
        stepAlly(b);
        expect(b.a.spotted[0], `${v} ${u}`).toBe(want);
      }
    }
  });
  it('扇は端を含む（180° は候補・180.5° と 49.5° は外・50.5° は内）', () => {
    for (const [brg, cand] of [[180, true], [180.5, false], [49.5, false], [50.5, true]] as const) {
      const b = allyBench();
      atAlly(b, 0, 300, brg, 0, SLOW, PT_PATROL);
      stepAlly(b);
      expect(b.a.candSteps, `${brg}°`).toBe(cand ? 1 : 0);
    }
  });
  it('候補は添字の順に 1 回ずつ（1 ステップに 2 隻なら 2 回。並び 0.9・0.0 なら 0 隻目は気づかず 1 隻目が気づく）', () => {
    const b = allyBench({ rng27: new SeqRng([0.9, 0.0, 0.9]) });
    atAlly(b, 0, 300, 100, 0, SLOW, PT_PATROL);
    atAlly(b, 1, 700, 150, 0, FAST, PT_BREAK);
    stepAlly(b);
    expect([b.rng27.draws, b.a.candSteps, b.a.spotted[0], b.a.spotted[1]]).toEqual([2, 2, 0, 1]);
  });
  it('扇は最初に気づくときだけ: 気づいた PT が扇の外（20°）へ出ても覚えたまま・照らし続け、光はそちらへ回る（もう引かない）', () => {
    const b = allyBench({ p: QUIET, rng27: new FixedRng(0) });
    atAlly(b, 0, 300, 100, 0, SLOW, PT_PASS); // 航過の PT は反応しない（光を見るだけ）
    stepAlly(b);
    expect([b.a.spotted[0], b.a.target, b.rng27.draws]).toEqual([1, 0, 1]);
    atAlly(b, 0, 300, 20, 0, SLOW, PT_PASS);
    stepAlly(b, 360);
    expect([b.a.spotted[0], b.a.target, b.rng27.draws, b.a.g.light.on, b.a.g.illuminated, b.a.lit[0]]).toEqual([1, 0, 1, true, true, 1]);
    expect(b.a.g.light.bearingDeg).toBeCloseTo(20, 6);
  });
  it('気づいた PT は見張りの外（1,000 m）でも覚えたまま（探照灯の射程 1,500 m の内なら照らし続け、外なら照らす PT でなくなる）', () => {
    const b = allyBench({ p: QUIET, rng27: new FixedRng(0) });
    atAlly(b, 0, 300, 100, 0, SLOW, PT_PASS);
    stepAlly(b);
    atAlly(b, 0, 1000, 100, 0, SLOW, PT_PASS);
    stepAlly(b, 30);
    expect([b.a.spotted[0], b.a.target, b.rng27.draws]).toEqual([1, 0, 1]);
    atAlly(b, 0, 1600, 100, 0, SLOW, PT_PASS);
    stepAlly(b);
    expect([b.a.spotted[0], b.a.target, b.a.litS, b.rng27.draws]).toEqual([1, -1, 0, 1]);
  });
});

describe('照らす PT（乱数なし。R-U3・LD10）', () => {
  /** 気づいた 2 隻（航過で反応しない・砲は撃たない） */
  function two(d0: number, d1: number): ReturnType<typeof allyBench> {
    const b = allyBench({ p: QUIET, rng27: new FixedRng(0.999999) });
    atAlly(b, 0, d0, 100, 0, 0, PT_PASS);
    atAlly(b, 1, d1, 140, 0, 0, PT_PASS);
    b.a.spotted[0] = 1;
    b.a.spotted[1] = 1;
    return b;
  }
  it('無ければ最も近い気づいた PT（同じ距離なら添字の小さい方）。今の PT は生きて射程の内なら、もっと近い PT が来ても続ける', () => {
    const b = two(900, 600);
    stepAlly(b);
    expect(b.a.target).toBe(1);
    atAlly(b, 0, 200, 100, 0, 0, PT_PASS);
    stepAlly(b, 10);
    expect(b.a.target).toBe(1);
    const c = two(700, 700);
    stepAlly(c);
    expect(c.a.target).toBe(0);
  });
  it('射程の外へ出たら次の PT へ、照らされた秒は 0 に', () => {
    const b = two(600, 900);
    stepUntil(b, () => b.a.litS > 0.5);
    expect(b.a.target).toBe(0);
    atAlly(b, 0, 1550, 100, 0, 0, PT_PASS);
    stepAlly(b);
    expect([b.a.target, b.a.litS]).toEqual([1, 0]);
  });
  it('去った PT（PT_LEAVE）は射程の内で chase_fire_s（2.5 秒）追う、その後は無し', () => {
    const b = two(600, 1600);
    stepAlly(b, 5);
    b.q.boats[0]!.phase = PT_LEAVE;
    stepAlly(b);
    expect([b.a.target, b.a.chasing, b.a.chaseLeftS]).toEqual([0, true, A.chaseFireS]);
    const k = stepUntil(b, () => b.a.target !== 0);
    expect(k).toBeGreaterThanOrEqual(Math.floor(A.chaseFireS / FEEL_DT) - 1);
    expect(k).toBeLessThanOrEqual(Math.ceil(A.chaseFireS / FEEL_DT) + 1);
    expect([b.a.target, b.a.chasing]).toEqual([-1, false]);
    stepAlly(b, 60);
    expect(b.a.target).toBe(-1); // 去った PT は二度と照らす PT にならない
  });
  it.each([PT_OUT, PT_SUNK])('海域の外・沈んだ PT（段階 %i）は追わない（LD10）', (ph) => {
    const b = two(600, 1600);
    stepAlly(b, 5);
    b.q.boats[0]!.phase = ph;
    stepAlly(b);
    expect([b.a.target, b.a.chasing]).toEqual([-1, false]);
  });
  it('追っている間に気づいた生きた PT が射程の内にいれば、すぐそちらへ（照らされた秒は 0）', () => {
    const b = two(600, 1600);
    stepAlly(b, 5);
    b.q.boats[0]!.phase = PT_LEAVE;
    stepAlly(b, 10);
    expect([b.a.target, b.a.chasing]).toEqual([0, true]);
    atAlly(b, 1, 1200, 140, 0, 0, PT_PASS);
    stepAlly(b);
    expect([b.a.target, b.a.chasing, b.a.litS]).toEqual([1, false, 0]);
  });
  it('chase_fire_s 0 なら追わない・追う PT が射程の外へ出たら追わない', () => {
    const b = allyBench({ p: { ...QUIET, chaseFireS: 0 } });
    atAlly(b, 0, 600, 100, 0, 0, PT_PASS);
    b.a.spotted[0] = 1;
    stepAlly(b, 5);
    b.q.boats[0]!.phase = PT_LEAVE;
    stepAlly(b);
    expect([b.a.target, b.a.chasing]).toEqual([-1, false]);
    const c = two(600, 1600);
    stepAlly(c, 5);
    c.q.boats[0]!.phase = PT_LEAVE;
    stepAlly(c);
    atAlly(c, 0, 1550, 100, 0, 0, PT_LEAVE);
    stepAlly(c);
    expect([c.a.target, c.a.chasing]).toEqual([-1, false]);
  });
});

describe('照らされている印・ステップの中の順・確保しない（R-U6）', () => {
  it('印は照らす PT が光の中にいるステップだけ 1（点灯の遅れ 1.5 秒の間は 0）、一度でも照らした PT の数', () => {
    const b = allyBench({ p: QUIET });
    atAlly(b, 0, 600, 95, 0, 0, PT_PASS);
    atAlly(b, 1, 1400, 140, 0, 0, PT_PASS);
    b.a.spotted[0] = 1;
    stepAlly(b, Math.floor(A.gunnery.searchlight.onDelayS / FEEL_DT) - 2);
    expect([b.a.target, b.a.g.light.on, Array.from(b.a.lit), b.a.litPts, b.a.litS]).toEqual([0, false, [0, 0], 0, 0]);
    stepUntil(b, () => b.a.lit[0] === 1, 120);
    expect([Array.from(b.a.lit), Array.from(b.a.everLit), b.a.litPts]).toEqual([[1, 0], [1, 0], 1]);
  });
  it('気づいたステップにそのまま照らす PT になり、探照灯の点灯の遅れが同じステップから減る（見張り → 照らす PT → 探照灯）', () => {
    const b = allyBench({ rng27: new FixedRng(0) });
    atAlly(b, 0, 300, 100, 0, SLOW, PT_PASS);
    stepAlly(b);
    expect([b.a.spotted[0], b.a.target]).toEqual([1, 0]);
    expect(b.a.g.light.onDelayLeftS).toBeCloseTo(A.gunnery.searchlight.onDelayS - FEEL_DT, 12);
  });
  const src = readFileSync(new URL('../src/core/ally-destroyer.ts', import.meta.url), 'utf8');
  const step = src.slice(src.indexOf('export function stepAllyDestroyer'));
  it('stepAllyDestroyer の順: 見張り → 照らす PT → 探照灯 → 砲 → 反応 → 印', () => {
    const at = ['allyLookout(a', 'allyTarget(a', 'updateIllumination(', 'updateGuns(', 'ptLitReact(', 'a.lit[i] ='].map((s) => step.indexOf(s));
    for (const i of at) expect(i).toBeGreaterThan(0);
    expect([...at].sort((x, y) => x - y)).toEqual(at);
  });
  it('毎ステップの関数と着弾の口は確保しない（new・配列・オブジェクト・閉包が無い）', () => {
    const body = (step + src.slice(src.indexOf('  onFire(gunIndex: number, x: number, y: number): void {'), src.indexOf('/** 出撃の組み立てで 1 回')))
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/onLeave: \(i: number\) => void/g, ''); // 引数の型の矢印は閉包でない
    expect(body.length).toBeGreaterThan(2000);
    expect(body).not.toMatch(/\bnew\b|=>|[=(,:]\s*\[|[=(,:]\s*\{|\.\.\./);
  });
});
