// 米PT の航過の読みやすさの部品（v0.6.3。core/pt-pass、spec §C.7）: 最接近までの体感秒・航過を固めてよいか・待つ PT の針路・艇首尾の円錐・かわす向き・突撃の狙いの点。
import { describe, expect, it } from 'vitest';
import { PT_DODGE_STRAIGHT_DEG, aimPoint, dodgeTurn, holdOffHeading, inDeadCone, nearEdge, passCommitOk, targetSide, tcpaFeltS } from '../src/core/pt-pass';
import { degToRad, ktToMps } from '../src/core/units';

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

describe('航過を固めてよいか（passCommitOk。v0.6.3 の直し: 本当に向かってくるときだけ）', () => {
  // 艇は原点、PT は (bx, by)。(dx, dy) = 艇 − PT。速さは game m/s、許容 30°・最接近 5 秒・有効射程 400 m
  const TOL = 30;
  const EFF2 = 400 ** 2;
  const ok = (bx: number, by: number, headingDeg: number, lockDeg: number, passKt: number, vpx: number, vpy: number): boolean =>
    passCommitOk(headingDeg, lockDeg, ktToMps(passKt), -bx, -by, vpx, vpy, TOL, 5, EFF2, TS);
  const v20 = ktToMps(20);
  it('正面から: 北 500 m の PT が南へ（艇は北へ 20 kt、航過 26 kt）→ 最接近まで 4.2 秒・その距離 0 m で固める', () => {
    expect(ok(0, -500, 180, 180, 26, 0, -v20)).toBe(true);
    expect(tcpaFeltS(0, 500, 0, -v20 - ktToMps(26), TS)).toBeCloseTo(500 / (v20 + ktToMps(26)) / TS, 9);
  });
  it('向きの許容: 今の針路と固める針路の差が 30° を超えたら固めない（離脱から向き直る前。29° は固め、31° は固めない）', () => {
    expect(ok(0, -500, 209, 180, 26, 0, -v20)).toBe(true);
    expect(ok(0, -500, 211, 180, 26, 0, -v20)).toBe(false);
    expect(ok(0, -500, 151, 180, 26, 0, -v20)).toBe(true);
    expect(ok(0, -500, 149, 180, 26, 0, -v20)).toBe(false);
    // 直す前の形: 真横（東）へ 35 kt で走る PT に艇が寄ってくる → 今の速度どうしでは最接近まで 2.4 秒（直す前はここで固め、1 ステップで航過が終わった）
    expect(tcpaFeltS(0, 500, -ktToMps(35), -v20, TS)).toBeLessThan(5);
    expect(ok(0, -500, 90, 180, 26, 0, -v20)).toBe(false);
  });
  it('固める線が艇から離れる向き（艇が線の後ろ）なら固めない', () => {
    expect(ok(0, -500, 0, 0, 26, 0, -v20)).toBe(false); // PT は北、線も北へ（艇は後ろ）
    expect(ok(0, -500, 0, 0, 26, 0, v20 * 3)).toBe(false); // 艇が速く追っても同じ
  });
  it('航過の速さで最接近まで: 止まった艇へ 450 m は、突撃 35 kt なら 5.0 秒だが航過 25 kt では 7.0 秒 → まだ固めない。320 m で固める', () => {
    expect(tcpaFeltS(0, 450, 0, -ktToMps(35), TS)).toBeLessThanOrEqual(5 + 1e-9);
    expect(ok(0, -450, 180, 180, 25, 0, 0)).toBe(false);
    expect(ok(0, -320, 180, 180, 25, 0, 0)).toBe(true);
  });
  it('後ろから追い越す: 北へ 20 kt の艇の後ろ 150 m・横 155 m を 26 kt（追い越し 6 kt）→ 9.7 秒で固めない、後ろ 70 m なら固める（遠い後ろからの航過は追いつけない）', () => {
    expect(ok(155, 150, 0, 0, 26, 0, -v20)).toBe(false);
    expect(ok(155, 70, 0, 0, 26, 0, -v20)).toBe(true);
    expect(ok(155, 785, 0, 0, 26, 0, -v20)).toBe(false);
  });
  it('最接近の距離が有効射程の外なら固めない（最接近までは近くても、横 450 m を抜ける線は撃てない）', () => {
    // PT は北西、東へ 25 kt。止まった艇は線の右 450 m → 最接近まで 4.7 秒・距離 450 m
    expect(ok(-300, -450, 90, 90, 25, 0, 0)).toBe(false);
    expect(ok(-300, -350, 90, 90, 25, 0, 0)).toBe(true);
  });
});

describe('航過を待つ PT の針路（holdOffHeading。v0.6.3 の直し: 2 番手が艇に寄り過ぎない）', () => {
  // 目標は原点、PT は北 d m（目標から見た PT の方位 0°）。hold 500 m・曲がり始め 600 m
  const H2 = 500 ** 2;
  const O2 = 600 ** 2;
  const at = (d: number, side: number): number => holdOffHeading(0, -d, 0, 0, side, H2, O2);
  it('hold_off_m の内は真っすぐ外へ（北）、曲がり始めの距離で目標へ真っすぐ（南）、二乗の中ほどで真横（side +1 は東＝目標を右に見る、−1 は西）', () => {
    expect([at(300, 1), at(500, -1)]).toEqual([0, 0]);
    expect(at(600, 1)).toBeCloseTo(180, 9);
    expect(at(700, -1)).toBeCloseTo(180, 9);
    const mid = Math.sqrt((H2 + O2) / 2);
    expect(at(mid, 1)).toBeCloseTo(90, 9);
    expect(at(mid, -1)).toBeCloseTo(270, 9);
    // 外へ向かう成分: hold_off_m の内では針路と外向きのなす角が 90° 未満
    for (const d of [100, 450, 499]) expect(Math.cos(degToRad(at(d, 1)))).toBeGreaterThan(0);
  });
  it('目標から見た方位に回す（東 520 m の PT は外向き 90° から side × θ）', () => {
    const k = (520 ** 2 - H2) / (O2 - H2);
    expect(holdOffHeading(520, 0, 0, 0, 1, H2, O2)).toBeCloseTo(90 + 180 * k, 9);
    expect(holdOffHeading(520, 0, 0, 0, -1, H2, O2)).toBeCloseTo(90 - 180 * k, 9);
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
