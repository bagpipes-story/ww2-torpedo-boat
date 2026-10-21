// 執拗な米PT（v0.6.3 実機 1 回目。core/pt-boats・pt-pass の stationHeading・pt-pass-end、spec §C.2・§H）: 13mm の閃光で見つかる、
// 待つ PT は前の航過と反対の舷（艇の針路から 90°・45°・135° を航過ごとに順に、station_m）を取る、待ちが解けたら自分の舷を取り直す、
// 待つ PT は（外で待ち始めたら）350 m より内へ来ない、1 隻 4 回で去る、夜明けはみな去る、後ろへ抜けたかは固めた針路で見る（守りの直し）。
import { describe, expect, it } from 'vitest';
import { PT_BREAK, PT_LEAVE, PT_OUT, PT_PASS, PT_RUN_IN, createPtSection, stepPtSection, type PtSection } from '../src/core/pt-boats';
import { commitPass, endPass } from '../src/core/pt-pass-end';
import { PT_STATION_COURSE_MIN_MPS, holdOffHeading, stationHeading, targetSide } from '../src/core/pt-pass';
import { SeededRng } from '../src/core/rng';
import { bearingDeg } from '../src/core/ship-ai';
import { degToRad, ktToMps, wrapDeg180, wrapDeg360 } from '../src/core/units';
import { CRUISE01, DT, G, HOME, P, SILENT01, TS, VIS2, check, detectM, events, runPtSim, type PtSim } from './pt-kit';

const HOLD_M = Math.sqrt(P.holdOff2);
const KEEP_OUT_M = 350; // spec §C.4 F9（試作の最小 362 m）
const TURN_R = P.runInMps / degToRad(P.turnRateDegS); // 突撃の速さの旋回半径 m（約 43 m）

/** 艇から見た PT の舷角 deg（艇首 0・右舷 +・左舷 −） */
const relOf = (s: { boat: { x: number; y: number; headingDeg: number } }, b: { x: number; y: number }): number => wrapDeg180(bearingDeg(s.boat.x, s.boat.y, b.x, b.y) - s.boat.headingDeg);

describe('13mm の閃光で見つかる（PtCheck.flashM。spec §C.2）', () => {
  it(`止まった T-14（見つかるのは ${detectM('stop')} m まで）を 1,100 m の PT は、撃ったステップ（閃光 ${G.flashRevealM} m）だけ見つける。detect_from_s の前・艇が的でないときは見つけない。最初が閃光なら flashFirst`, () => {
    const at = (distM: number, flashM: number | undefined, timeS = 10, targetValid = true): PtSection => {
      const q = createPtSection(P, 24);
      const c = check({ x: 2000 + distM, y: 2200, headingDeg: 0, speedMps: 0 }, { detectOpenM: detectM('stop'), timeS, targetValid, ...(flashM === undefined ? {} : { flashM }) });
      stepPtSection(q, P, c, new SeededRng(1), DT, DT * TS, events());
      return q;
    };
    expect([at(1100, undefined).detected, at(1100, 0).detected, at(1100, G.flashRevealM).detected, at(1300, G.flashRevealM).detected]).toEqual([false, false, true, false]);
    expect([at(1100, G.flashRevealM, P.detectFromS - 0.01).detected, at(1100, G.flashRevealM, P.detectFromS).detected, at(1100, G.flashRevealM, 10, false).detected]).toEqual([false, true, false]);
    const q = at(1100, G.flashRevealM);
    expect([q.flashFirst, q.firstDetectM]).toEqual([true, 1100]);
    // 閃光の内でも、ふつうに見える距離なら閃光ではない
    const q2 = at(400, G.flashRevealM);
    expect([q2.detected, q2.flashFirst]).toEqual([true, false]);
    // 閃光で見つけた後に止めても、隊は detect_hold_s の間は捉えている（最初の 1 回だけが flashFirst の材料）
    const q3 = at(1100, G.flashRevealM);
    stepPtSection(q3, P, check({ x: 3100, y: 2200, headingDeg: 0, speedMps: 0 }, { detectOpenM: detectM('stop'), timeS: 10 + DT, flashM: 0 }), new SeededRng(1), DT, DT * TS, events());
    expect([q3.detected, q3.flashFirst]).toEqual([true, true]);
  });
});

describe('待つ PT の位置取り（pt-pass の stationHeading。乱数なし・確保なし）', () => {
  const v = ktToMps(14);
  const OUT = { sp: NaN };
  it('目標が北へ走る・前の航過が右舷（flank +1）・90°: 点は目標の左舷 550 m（station_lead_s 先）。点の方位の ±30° なら点へ（150 m の内は目標の速さ + 追い越し）', () => {
    const tx = 3000;
    const ty = 2000;
    const lead = P.stationLeadS * P.timeScale;
    const sx = tx - P.stationM;
    const sy = ty - v * lead;
    // 点の真東 300 m（点の方位 270° から 30° の内）: 点へ全速
    const hd = stationHeading(sx + 300, sy - 50, tx, ty, 0, -v, 1, 90, P, OUT);
    expect(hd).toBeCloseTo(bearingDeg(sx + 300, sy - 50, sx, sy), 9);
    expect(OUT.sp).toBe(P.runInMps);
    // 点の 100 m 内: 目標の速さ + 追い越しで並ぶ
    const hd2 = stationHeading(sx + 40, sy + 60, tx, ty, 0, -v, 1, 90, P, OUT);
    expect(hd2).toBeCloseTo(bearingDeg(sx + 40, sy + 60, sx, sy), 9);
    expect(OUT.sp).toBeCloseTo(Math.min(P.runInMps, v + P.overtakeMps), 9);
    // flank −1 は右舷、45° は左舷の艇首寄り
    expect(stationHeading(tx + 300, ty, tx, ty, 0, -v, -1, 90, P, OUT)).toBeCloseTo(bearingDeg(tx + 300, ty, tx + P.stationM, ty - v * P.stationLeadS * P.timeScale), 9);
    expect(OUT.sp).toBe(P.runInMps);
    const r45 = degToRad(-45);
    const px = tx + Math.sin(r45) * P.stationM;
    const py = ty - Math.cos(r45) * P.stationM - v * lead;
    expect(stationHeading(px, py + 10, tx, ty, 0, -v, 1, 45, P, OUT)).toBeCloseTo(bearingDeg(px, py + 10, px, py), 9);
  });
  it('点の方位から 30° より外: 600 m（曲がり始め）の内なら hold_off の形で短い方へ回り（内へ寄らない）、外なら点へ', () => {
    const tx = 3000;
    const ty = 2000;
    // PT は目標の右舷 550 m、点は左舷: 差 −180 → 左回り（side −1）
    expect(stationHeading(tx + 550, ty, tx, ty, 0, -v, 1, 90, P, OUT)).toBeCloseTo(holdOffHeading(tx + 550, ty, tx, ty, wrapDeg180(-90 - 90) > 0 ? 1 : -1, P.holdOff2, P.holdOuter2), 9);
    expect(OUT.sp).toBe(P.runInMps);
    // PT は艇首 520 m、点は左舷（差 −90）→ 左回り
    expect(stationHeading(tx, ty - 520, tx, ty, 0, -v, 1, 90, P, OUT)).toBeCloseTo(holdOffHeading(tx, ty - 520, tx, ty, -1, P.holdOff2, P.holdOuter2), 9);
    // 500 m より内は真っすぐ外へ
    expect(stationHeading(tx + 450, ty, tx, ty, 0, -v, 1, 90, P, OUT)).toBeCloseTo(90, 9);
    // 900 m の外は点へ真っすぐ
    const lead = P.stationLeadS * P.timeScale;
    expect(stationHeading(tx + 900, ty, tx, ty, 0, -v, 1, 90, P, OUT)).toBeCloseTo(bearingDeg(tx + 900, ty, tx - P.stationM, ty - v * lead), 9);
  });
  it(`止まった目標（${PT_STATION_COURSE_MIN_MPS} m/s 以下）は PT の方位を基準にする: 点はいつも PT から −flank × 角だけ回った先＝待つ PT は艇の周りを回り続ける（内へは寄らない）`, () => {
    const tx = 3000;
    const ty = 2000;
    for (const flank of [1, -1]) {
      const hd = stationHeading(tx + 550, ty, tx, ty, 0, 0, flank, 90, P, OUT);
      expect(hd).toBeCloseTo(holdOffHeading(tx + 550, ty, tx, ty, -flank, P.holdOff2, P.holdOuter2), 9);
    }
  });
});

describe('挟み撃ち（待つ PT は前の航過と反対の舷へ回る。spec §C.2）', () => {
  /** 艇は (3000, 3300) から北へ静音で走り、PT1 だけが突撃で待つ（PT0 は海域の外）。PT1 は艇の startRel の舷 800 m から */
  function hold(flank: number, passes: number, startRel: number, seconds: number, onStep?: (q: PtSection, boat: { x: number; y: number; headingDeg: number }) => void): { q: PtSection; boat: { x: number; y: number; headingDeg: number; speedMps: number } } {
    const q = createPtSection(P, 24);
    q.boats[0]!.phase = PT_OUT;
    const boat = { x: 3000, y: 3300, headingDeg: 0, speedMps: ktToMps(14) };
    const r = degToRad(startRel);
    Object.assign(q.boats[1]!, { x: boat.x + Math.sin(r) * 800, y: boat.y - Math.cos(r) * 800, headingDeg: 180, speedMps: P.runInMps, phase: PT_RUN_IN, side: 1 });
    Object.assign(q, { gapLeftS: 1e9, ownerFlank: flank, passes, detected: true, holdLeftS: 1e9 });
    const c = check(boat, { detectOpenM: 5000 });
    for (let k = 0; k < 60 * seconds; k++) {
      c.timeS += DT;
      boat.y -= boat.speedMps * DT * TS;
      stepPtSection(q, P, c, new SeededRng(1), DT, DT * TS, events());
      onStep?.(q, boat);
    }
    return { q, boat };
  }
  it('前の航過が右舷（flank +1）なら左舷へ、左舷なら右舷へ。角は航過ごとに 90° → 45° → 135°（q.passes の順）。550 m 前後に並び、待つ間は撃たない・350 m より内へ来ない', () => {
    for (const flank of [1, -1]) {
      for (const passes of [0, 1, 2, 3]) {
        const want = -flank * P.stationRelDeg[passes % P.stationRelDeg.length]!;
        const rels: number[] = [];
        const ds: number[] = [];
        let min = Infinity;
        const { q } = hold(flank, passes, 90 * flank, 30, (q, boat) => {
          const b = q.boats[1]!;
          const d = Math.hypot(b.x - boat.x, b.y - boat.y);
          min = Math.min(min, d);
          rels.push(relOf({ boat }, b));
          ds.push(d);
        });
        const late = rels.slice(60 * 20);
        const mean = late.reduce((a, x) => a + x, 0) / late.length;
        expect(Math.abs(wrapDeg180(mean - want)), `flank ${flank} passes ${passes}: ${mean}`).toBeLessThan(10);
        expect(late.every((x) => Math.sign(x) === -flank), `flank ${flank} passes ${passes}`).toBe(true);
        for (const d of ds.slice(60 * 20)) expect(Math.abs(d - P.stationM)).toBeLessThan(100);
        expect(min).toBeGreaterThan(KEEP_OUT_M);
        expect([q.held[1], q.owner, q.shots, q.boats[1]!.phase]).toEqual([1, -1, 0, PT_RUN_IN]);
      }
    }
  });

  it('航過を固めると、その PT が艇のどちらの舷か（ownerFlank）を残す: 右舷 +1・左舷 −1（艇の針路から）', () => {
    for (const [px, flank] of [[3400, 1], [2600, -1]] as const) {
      const q = createPtSection(P, 24);
      const boat = { x: 3000, y: 2000, headingDeg: 0, speedMps: 0 };
      Object.assign(q.boats[0]!, { x: px, y: 1900, phase: PT_RUN_IN });
      commitPass(q, check(boat), q.boats[0]!, 0, 270, P.passMinMps, P.roundsPerPass);
      expect([q.ownerFlank, q.owner, q.boats[0]!.phase]).toEqual([flank, 0, PT_PASS]);
    }
  });

  it('待ちが解けたら、取った位置から自分の舷（targetSide）を取り直し、そのステップは固めない（次から固める）', () => {
    const { q, boat } = hold(1, 0, 90, 25);
    const b = q.boats[1]!;
    expect(q.held[1]).toBe(1);
    b.side = -targetSide(b.headingDeg, b.x, b.y, boat.x, boat.y); // わざと逆にしておく
    const want = targetSide(b.headingDeg, b.x, b.y, boat.x, boat.y);
    q.gapLeftS = 0;
    let commits = 0;
    const c = check({ ...boat, speedMps: ktToMps(14) }, { detectOpenM: 5000, timeS: 100 });
    stepPtSection(q, P, c, new SeededRng(1), DT, DT * TS, events({ onCommit: () => void commits++ }));
    expect([q.held[1], b.side, commits, b.phase]).toEqual([0, want, 0, PT_RUN_IN]);
  });
});

describe('待つ PT は内へ来ない・赤い線は左右から代わる代わる（40 夜 × 遊び方。spec §C.4 F9）', () => {
  const toHome = (s: PtSim): number => bearingDeg(s.boat.x, s.boat.y, HOME.x, HOME.y);
  const straight = (v: number) => (s: PtSim): void => {
    s.input.headingDeg = toHome(s);
    s.input.speed01 = s.t < 1 ? 0 : v;
  };
  /** 待つ PT（見えている）へ艇首を向けて追う */
  const chase = (v: number) => (s: PtSim): void => {
    straight(v)(s);
    for (let i = 0; i < s.q.boats.length; i++) {
      const b = s.q.boats[i]!;
      if (s.q.held[i] === 1 && b.phase === PT_RUN_IN && (b.x - s.boat.x) ** 2 + (b.y - s.boat.y) ** 2 <= VIS2) s.input.headingDeg = bearingDeg(s.boat.x, s.boat.y, b.x, b.y);
    }
  };
  /** 赤い線で線から離れる直角へ全速 4 秒（HUD の教え） */
  const dodge = (s: PtSim): void => {
    straight(1)(s);
    if ((s.m['until'] ?? -1) > s.t) s.input.headingDeg = s.m['deg']!;
  };
  interface Tally { episodes: number; outsideMin: number; closeFarFromEdge: number; pairs: number; alt: number }
  function run(policy: (s: PtSim) => void): Tally {
    const r: Tally = { episodes: 0, outsideMin: Infinity, closeFarFromEdge: 0, pairs: 0, alt: 0 };
    for (let seed = 1; seed <= 40; seed++) {
      const start = [NaN, NaN];
      let lastFlank = 0;
      runPtSim({
        seed, steps: 60 * 170, night: true, stopAtHome: true, policy,
        ev: (s) => ({
          onCommit: (i, lock) => {
            const b = s.q.boats[i]!;
            const fl = targetSide(s.boat.headingDeg, s.boat.x, s.boat.y, b.x, b.y);
            if (lastFlank !== 0) {
              r.pairs++;
              if (fl !== lastFlank) r.alt++;
            }
            lastFlank = fl;
            const lr = degToRad(lock);
            const cross = Math.sin(lr) * (s.boat.y - b.y) + Math.cos(lr) * (s.boat.x - b.x);
            s.m['deg'] = wrapDeg360(lock + (cross >= 0 ? 90 : -90));
            s.m['until'] = s.t + 4;
          },
        }),
        onStep: (s) => {
          for (let i = 0; i < s.q.boats.length; i++) {
            const b = s.q.boats[i]!;
            const d = Math.hypot(b.x - s.boat.x, b.y - s.boat.y);
            if (!(s.q.held[i] === 1 && b.phase === PT_RUN_IN && s.c.targetValid)) {
              start[i] = NaN;
              continue;
            }
            if (Number.isNaN(start[i]!)) {
              start[i] = d;
              r.episodes++;
            }
            if (start[i]! <= HOLD_M) continue;
            r.outsideMin = Math.min(r.outsideMin, d);
            const edge = Math.min(b.x, b.y, s.p.bounds.width - b.x, s.p.bounds.height - b.y);
            if (d < KEEP_OUT_M && edge > P.edgeMarginM + 2 * TURN_R) r.closeFarFromEdge++;
          }
        },
      });
    }
    return r;
  }
  it.each([
    ['まっすぐ巡航', straight(CRUISE01)],
    ['まっすぐ静音', straight(SILENT01)],
    ['赤い線で全速の転舵', dodge],
    ['待つ PT を巡航で追う', chase(CRUISE01)],
  ] as const)(`%s: 外（${HOLD_M} m）で待ち始めた PT は ${KEEP_OUT_M} m より内へ来ない。赤い線の半分より多くが前と反対の舷から`, (_name, policy) => {
    const r = run(policy);
    expect(r.episodes).toBeGreaterThan(100);
    expect(r.outsideMin).toBeGreaterThanOrEqual(KEEP_OUT_M);
    expect(r.pairs).toBeGreaterThan(60);
    expect(r.alt / r.pairs).toBeGreaterThan(0.5);
  });
  it(`待つ PT を全速で追い詰めると縁の帯で内へ入りうる（縁の内向きが勝つ。待つ PT は撃たない）: ${KEEP_OUT_M} m より内はどれも縁から edge_margin_m + 旋回半径 × 2 の内`, () => {
    const r = run(chase(1));
    expect(r.episodes).toBeGreaterThan(100);
    expect(r.closeFarFromEdge).toBe(0);
  });
});

describe('1 隻 4 回・夜明け・後ろへ抜けたの判定（pt-pass-end の endPass、pt-boats）', () => {
  it(`航過の終わり（endPass）: 数えた航過が ${P.maxPasses} 回目なら去る（onLeave）、まだなら離脱。撃たず open_fire_s 前に抜けた航過は数えず離脱のまま`, () => {
    for (const [passesBefore, fired, timerS, phase, leaves] of [
      [P.maxPasses - 1, 2, 3, PT_LEAVE, 1],
      [P.maxPasses - 2, 2, 3, PT_BREAK, 0],
      [P.maxPasses - 1, 0, 1, PT_BREAK, 0],
    ] as const) {
      const q = createPtSection(P, 24);
      const b = q.boats[0]!;
      Object.assign(b, { phase: PT_PASS, passes: passesBefore, firedThisPass: fired, timerS });
      q.owner = 0;
      let left = 0;
      endPass(q, P, b, 0, events({ onLeave: () => void left++ }));
      expect([b.phase, left, q.owner, q.gapLeftS], `${passesBefore} ${fired} ${timerS}`).toEqual([phase, leaves, -1, P.passGapS]);
    }
  });

  it('夜明け: 待つ（突撃）・離脱の PT はそのステップで去り、東の縁の外へ（待ちの印は関係ない）', () => {
    const q = createPtSection(P, 24);
    Object.assign(q.boats[0]!, { x: 2500, y: 2000, phase: PT_RUN_IN });
    Object.assign(q.boats[1]!, { x: 3500, y: 2000, phase: PT_BREAK });
    Object.assign(q, { gapLeftS: 1e9, detected: true, holdLeftS: 1e9 });
    q.held[0] = 1;
    const c = check({ x: 3000, y: 2500, headingDeg: 0, speedMps: 0 }, { dawn: true });
    stepPtSection(q, P, c, new SeededRng(1), DT, DT * TS, events());
    expect(q.boats.map((b) => b.phase)).toEqual([PT_LEAVE, PT_LEAVE]);
    for (let k = 0; k < 60 * 80; k++) stepPtSection(q, P, c, new SeededRng(1), DT, DT * TS, events());
    expect([q.out, ...q.boats.map((b) => b.phase)]).toEqual([2, PT_OUT, PT_OUT]);
  });

  it('後ろへ抜けたかは固めた針路で見る: 固めた線（東）へ向き直る途中（針路 115°）の PT の真横 404 m に艇がいても、2 ステップで航過は終わらない（今の針路だと 1 ステップで終わった）', () => {
    const q = createPtSection(P, 24);
    const b = q.boats[0]!;
    Object.assign(b, { x: 3000, y: 2000, headingDeg: 115, lockDeg: 90, passMps: P.passMinMps, speedMps: P.passMinMps, phase: PT_PASS, timerS: 0.1, roundsLeft: P.roundsPerPass });
    q.boats[1]!.phase = PT_OUT;
    Object.assign(q, { owner: 0, detected: true, holdLeftS: 1e9, commitAtS: 9.9 });
    const boat = { x: 3020, y: 2000 - 404, headingDeg: 0, speedMps: 0 };
    // 今の針路で見た「後ろへ抜けた」は真（直す前の判定）、固めた針路では偽
    const h = degToRad(b.headingDeg);
    const l = degToRad(b.lockDeg);
    const dx = boat.x - b.x;
    const dy = boat.y - b.y;
    expect([Math.sin(h) * dx - Math.cos(h) * dy < 0, Math.sin(l) * dx - Math.cos(l) * dy < 0, dx * dx + dy * dy > P.gun.effectiveM ** 2]).toEqual([true, false, true]);
    let ends = 0;
    const c = check(boat, { detectOpenM: 5000 });
    for (let k = 0; k < 2; k++) {
      c.timeS += DT;
      stepPtSection(q, P, c, new SeededRng(1), DT, DT * TS, events({ onPassEnd: () => void ends++ }));
    }
    expect([ends, b.phase, q.owner]).toEqual([0, PT_PASS, 0]);
  });
});
