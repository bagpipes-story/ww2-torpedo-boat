// 米PT の航過の読みやすさの部品（v0.6.3。core/pt-pass、spec §C.7）: 最接近までの体感秒・艇首尾の円錐・かわす向き・突撃の狙いの点。
import { describe, expect, it } from 'vitest';
import { PT_DODGE_STRAIGHT_DEG, aimPoint, dodgeTurn, inDeadCone, nearEdge, targetSide, tcpaFeltS } from '../src/core/pt-pass';
import { degToRad } from '../src/core/units';

const TS = 5;

describe('最接近までの体感秒（tcpaFeltS）', () => {
  it('正面から近づく: 1,000 m 先を互いに 10 m/s で → game 50 秒 = 体感 10 秒（time_scale 5）', () => {
    // 自分は北へ 10、相手は北 1,000 m を南へ 10。r = 相手 − 自分、rv = 相手の速度 − 自分の速度
    expect(tcpaFeltS(0, -1000, 0, 20, TS)).toBeCloseTo(10, 9);
  });
  it('追い越す: 前 500 m の 10 m/s を 20 m/s で追う → game 50 秒 = 体感 10 秒', () => {
    expect(tcpaFeltS(0, -500, 0, 10, TS)).toBeCloseTo(10, 9);
  });
  it('離れていく・相対速度 0 は Infinity', () => {
    expect(tcpaFeltS(0, -500, 0, -10, TS)).toBe(Infinity);
    expect(tcpaFeltS(0, -500, 0, 0, TS)).toBe(Infinity);
    expect(tcpaFeltS(300, 0, 0, 10, TS)).toBe(Infinity); // 真横を平行に（今が最接近）
  });
  it('time_scale で割る（体感秒）: time_scale 1 は 5 の 5 倍', () => {
    expect(tcpaFeltS(0, -1000, 0, 20, 1)).toBeCloseTo(5 * tcpaFeltS(0, -1000, 0, 20, TS), 9);
  });
  it('斜めに横切る: 最接近までの時間は相対速度への射影', () => {
    // 相手は東 400・北 300、相対速度は西へ 20 → 最接近まで game 20 秒（体感 4）
    expect(tcpaFeltS(400, -300, -20, 0, TS)).toBeCloseTo(4, 9);
  });
});

describe('艇首尾の撃たない円錐（inDeadCone）', () => {
  const cos2 = Math.cos(degToRad(30)) ** 2;
  // 北向き（h = (0, −1)）から θ° の方向に 100 m
  const at = (deg: number): boolean => {
    const r = degToRad(deg);
    const dx = Math.sin(r) * 100;
    const dy = -Math.cos(r) * 100;
    return inDeadCone(0, -1, dx, dy, dx * dx + dy * dy, cos2);
  };
  it('艇首から 29° は中、31° は外。艇尾の 149° は外、151° は中（左右とも）', () => {
    expect([at(29), at(31), at(149), at(151)]).toEqual([true, false, false, true]);
    expect([at(-29), at(-31), at(-149), at(-151)]).toEqual([true, false, false, true]);
    expect(at(90)).toBe(false);
  });
});

describe('かわす向き（dodgeTurn）: 航過の線から離れる直角へ右回りか左回りか', () => {
  // PT は (0, 0) から東（90°）へ。南は線の右、北は左
  it('4 つの象限: 線の右（南）にいて東向き → 右へ、西向き → 左へ。線の左（北）にいて東向き → 左へ、西向き → 右へ', () => {
    expect(dodgeTurn(90, 0, 0, 500, 100, 90)).toBe(1);
    expect(dodgeTurn(90, 0, 0, 500, 100, 270)).toBe(-1);
    expect(dodgeTurn(90, 0, 0, 500, -100, 90)).toBe(-1);
    expect(dodgeTurn(90, 0, 0, 500, -100, 270)).toBe(1);
  });
  it(`逃げる針路との差が ${PT_DODGE_STRAIGHT_DEG}° 未満なら 0（そのまま全速で離れる）`, () => {
    expect(PT_DODGE_STRAIGHT_DEG).toBe(30);
    expect(dodgeTurn(90, 0, 0, 500, 100, 180)).toBe(0); // すでに南（線から離れる向き）
    expect(dodgeTurn(90, 0, 0, 500, 100, 160)).toBe(0); // 差 20°
    expect(dodgeTurn(90, 0, 0, 500, 100, 205)).toBe(0); // 差 −25°
    expect(dodgeTurn(90, 0, 0, 500, 100, 145)).toBe(1); // 差 35° → 右へ
    expect(dodgeTurn(90, 0, 0, 500, 100, 215)).toBe(-1); // 差 −35° → 左へ
  });
  it('線の上（真正面）は右側として扱う（決まった向きを 1 つ出す）', () => {
    expect(dodgeTurn(90, 0, 0, 500, 0, 90)).toBe(1);
  });
});

describe('突撃の狙いの点（aimPoint）と小さな幾何', () => {
  const out = { x: 0, y: 0 };
  it('止まった目標: 真北 500 m の目標へ、side +1 は目標を右に見る側（西へ 120 m）、−1 は東へ 120 m', () => {
    aimPoint(out, 1000, 1000, 18, 1000, 500, 0, 0, 1, 120, 6000, 4000, 200);
    expect(out.x).toBeCloseTo(880, 9);
    expect(out.y).toBeCloseTo(500, 9);
    aimPoint(out, 1000, 1000, 18, 1000, 500, 0, 0, -1, 120, 6000, 4000, 200);
    expect(out.x).toBeCloseTo(1120, 9);
    expect(targetSide(0, 1000, 1000, 1500, 1000)).toBe(1); // 北向きの東は右
    expect(targetSide(0, 1000, 1000, 500, 1000)).toBe(-1);
    expect(targetSide(90, 1000, 1000, 1000, 1500)).toBe(1); // 東向きの南は右
  });
  it('動く目標は会合点を狙う（東へ 10 m/s の目標 → 狙いは東へずれる）', () => {
    aimPoint(out, 1000, 1000, 18, 1000, 500, 10, 0, 1, 0, 6000, 4000, 200);
    expect(out.x).toBeGreaterThan(1200);
    expect(out.y).toBeCloseTo(500, 9);
  });
  it('海域の縁から余白の内へ収める', () => {
    aimPoint(out, 1000, 1000, 18, 50, 3990, 0, 0, 1, 120, 6000, 4000, 200);
    expect(out.x).toBe(200);
    expect(out.y).toBe(3800);
    expect([nearEdge(150, 2000, { width: 6000, height: 4000 }, 200), nearEdge(3000, 3850, { width: 6000, height: 4000 }, 200), nearEdge(3000, 2000, { width: 6000, height: 4000 }, 200)]).toEqual([true, true, false]);
  });
});
