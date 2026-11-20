// v0.8.2 S2c（ユーザーの実機の感想 2026-11-18「もう少しディティールにこだわれないでしょうか？」「最上は後部甲板に水上機乗せててもいいと思います」）: 戦艦（山城）と重巡（最上）の細部の描き方
// （Phaser に依らない。assets/capital-paint の paintCapitalPart から）: 煙突と探照灯の台（最上は前の煙路が曲がって合わさる傾いた太い煙突・冠 2）・25 mm 機銃・ダビット・斜めのカタパルト・
// 水上機（capital-plane-paint）・クレーンの腕と、それらの影（destroyer-paint の影の輪で capitalShadow が先に呼ばれる）。
// 色は地の色 1 つの明るさだけ（単系統）。起動時に 1 回だけ。
import { CRANE_UNITS, DAVIT_UNITS, STACK_SHADOW_UNITS } from '../config/capital-art-config';
import { DESTROYER_TONES as T } from '../config/destroyer-art-config';
import { frame, oval, paintPlane, poly } from './capital-plane-paint';
import type { DestroyerPart } from './destroyer-plan';
import { ellipse, rrect, toneCss, xGrad, type C } from './destroyer-pen';

type Part<K extends DestroyerPart['t']> = Extract<DestroyerPart, { t: K }>;

/** 煙突: 山城は探照灯の台（四隅に灯）の上の楕円の煙突と冠の格子、最上は前の煙路が曲がって合わさる太い煙突（冠 2）。どちらも高さの長い影 */
function paintStack(ctx: C, base: number, p: Part<'stack'>): void {
  const sh = STACK_SHADOW_UNITS;
  ctx.fillStyle = toneCss(base, T.shadow, 0.24);
  ellipse(ctx, p.cx + sh * 0.4, p.cy + sh, p.fw / 2, p.flen / 2 + (p.trunk ? p.len * 0.2 : 0));
  ctx.fill();
  const [x0, y0] = [p.cx - p.w / 2, p.cy - p.len / 2];
  const caps: [number, number, number][] = [];
  if (!p.trunk) {
    ctx.fillStyle = xGrad(ctx, base, x0, x0 + p.w, [[0, T.super1 * 1.08], [1, T.super1 * 0.8]]);
    rrect(ctx, x0, y0, p.w, p.len, 2.2);
    ctx.fill();
    ctx.strokeStyle = toneCss(base, T.dark, 0.7);
    ctx.lineWidth = 0.5;
    ctx.stroke();
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
      ctx.fillStyle = toneCss(base, T.boat);
      ellipse(ctx, p.cx + sx * (p.w / 2 - 2.6), p.cy + sy * (p.len / 2 - 2.6), 1.7, 1.7);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = xGrad(ctx, base, p.cx - p.fw / 2, p.cx + p.fw / 2, [[0, T.funnel * 1.35], [0.5, T.funnel], [1, T.funnel * 0.7]]);
    ellipse(ctx, p.cx, p.cy, p.fw / 2, p.flen / 2);
    caps.push([p.cy, p.fw / 2 - 1.6, p.flen / 2 - 1.6]);
  } else {
    // 前は細い煙路・後ろは太い煙突（上が艦尾へ傾く＝前の斜面が明るい）
    const [hw, h] = [p.w / 2, p.len / 2];
    ctx.fillStyle = xGrad(ctx, base, x0, x0 + p.w, [[0, T.funnel * 1.4], [0.5, T.funnel * 1.05], [1, T.funnel * 0.72]]);
    ctx.beginPath();
    ctx.moveTo(p.cx, p.cy - h);
    ctx.quadraticCurveTo(p.cx + hw * 0.55, p.cy - h, p.cx + hw * 0.62, p.cy - h * 0.35);
    ctx.lineTo(p.cx + hw, p.cy + h * 0.1);
    ctx.quadraticCurveTo(p.cx + hw, p.cy + h, p.cx, p.cy + h);
    ctx.quadraticCurveTo(p.cx - hw, p.cy + h, p.cx - hw, p.cy + h * 0.1);
    ctx.lineTo(p.cx - hw * 0.62, p.cy - h * 0.35);
    ctx.quadraticCurveTo(p.cx - hw * 0.55, p.cy - h, p.cx, p.cy - h);
    ctx.closePath();
    caps.push([p.cy + h * 0.12, hw * 0.7, h * 0.26], [p.cy + h * 0.62, hw * 0.74, h * 0.28]);
  }
  ctx.fill();
  ctx.strokeStyle = toneCss(base, T.dark);
  ctx.lineWidth = 0.8;
  ctx.stroke();
  for (const [cy, rx, ry] of caps) {
    ctx.fillStyle = toneCss(base, T.soot);
    ellipse(ctx, p.cx + 0.2, cy, rx, ry);
    ctx.fill();
    ctx.fillStyle = toneCss(base, T.funnel * 1.1, 0.6); // 冠の格子
    for (let k = -1; k <= 1; k++) ctx.fillRect(p.cx - rx * 0.8, cy + (k * ry) / 2.2 - 0.15, rx * 1.6, 0.3);
  }
}

/** 25 mm 機銃: 丸い台・台座・舷側へ向く銃身（三連装 3・単装 1） */
function paintAa(ctx: C, base: number, p: Part<'aa'>): void {
  const r = p.w / 2;
  ctx.fillStyle = toneCss(base, T.dark, 0.95);
  for (let i = 0; i < p.n; i++) ctx.fillRect(p.side > 0 ? p.cx : p.cx - r * 1.35, p.cy + (i - (p.n - 1) / 2) * 0.75 - 0.18, r * 1.35, 0.36);
  ctx.fillStyle = toneCss(base, p.n === 3 ? T.super2 : T.super1);
  ellipse(ctx, p.cx, p.cy, r * (p.n === 3 ? 0.8 : 0.75), r * (p.n === 3 ? 0.8 : 0.75));
  ctx.fill();
  ctx.strokeStyle = toneCss(base, T.dark, 0.75);
  ctx.lineWidth = 0.4;
  ctx.stroke();
  ctx.fillStyle = toneCss(base, T.turretDark);
  ellipse(ctx, p.cx, p.cy, r * 0.38, r * 0.38);
  ctx.fill();
}

export function paintCapitalDetail(ctx: C, base: number, p: DestroyerPart): boolean {
  if (p.t === 'plane') paintPlane(ctx, base, p);
  else if (p.t === 'stack') paintStack(ctx, base, p);
  else if (p.t === 'aa') paintAa(ctx, base, p);
  else if (p.t === 'davit') {
    ctx.fillStyle = toneCss(base, T.dark, 0.85);
    ctx.fillRect(p.cx - 0.3, p.cy - DAVIT_UNITS / 2, 0.6, DAVIT_UNITS);
    ctx.fillRect(p.side > 0 ? p.cx - DAVIT_UNITS / 2 : p.cx, p.cy - DAVIT_UNITS / 2, DAVIT_UNITS / 2, 0.55);
  } else if (p.t === 'catapult') {
    const F = frame(p.cx, p.cy, p.ang);
    const [hw, hl] = [p.cw / 2, p.cl / 2];
    ctx.fillStyle = toneCss(base, T.dark, 0.9);
    poly(ctx, F, [[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]]);
    ctx.fill();
    ctx.fillStyle = toneCss(base, T.turretLight, 0.6); // 2 本の軌条
    for (const u of [-hw * 0.55, hw * 0.35]) { poly(ctx, F, [[u, -hl + 0.6], [u + 0.35, -hl + 0.6], [u + 0.35, hl - 0.6], [u, hl - 0.6]]); ctx.fill(); }
    ctx.fillStyle = toneCss(base, T.turretDark * 1.1); // 艦尾の端の旋回台
    oval(ctx, F, p.ang, 0, hl - hw, hw * 1.3, hw * 1.3);
    ctx.fill();
    ctx.strokeStyle = toneCss(base, T.dark, 0.8);
    ctx.lineWidth = 0.45;
    ctx.stroke();
  } else if (p.t === 'crane') {
    ctx.strokeStyle = toneCss(base, T.dark, 0.95);
    ctx.lineWidth = CRANE_UNITS;
    ctx.beginPath();
    ctx.moveTo(p.x0, p.y0);
    ctx.lineTo(p.x1, p.y1);
    ctx.stroke();
    ctx.strokeStyle = toneCss(base, T.turretLight, 0.6);
    ctx.lineWidth = CRANE_UNITS * 0.35;
    ctx.stroke();
    ctx.fillStyle = toneCss(base, T.super2);
    ellipse(ctx, p.x0, p.y0, CRANE_UNITS * 1.4, CRANE_UNITS * 1.4);
    ctx.fill();
    ctx.strokeStyle = toneCss(base, T.dark, 0.8);
    ctx.lineWidth = 0.45;
    ctx.stroke();
    ctx.fillStyle = toneCss(base, T.dark);
    ellipse(ctx, p.x1, p.y1, CRANE_UNITS * 0.7, CRANE_UNITS * 0.7);
    ctx.fill();
  } else return false;
  return true;
}

/** 新しい型の影（destroyer-paint の影の輪。true なら destroyer-part-paint の shadowOf を呼ばない）。塔・煙突・水上機は自分の描き方の中で影を落とす */
export function capitalShadow(ctx: C, p: DestroyerPart): boolean {
  if (p.t === 'pagoda' || p.t === 'stack' || p.t === 'deck' || p.t === 'davit' || p.t === 'plane') return true;
  if (p.t === 'aa') {
    ellipse(ctx, p.cx + 0.8, p.cy + 1, p.w * 0.4, p.w * 0.4);
    ctx.fill();
    return true;
  }
  if (p.t === 'catapult') {
    const F = frame(p.cx, p.cy, p.ang);
    poly(ctx, F, [[-p.cw / 2, -p.cl / 2], [p.cw / 2, -p.cl / 2], [p.cw / 2, p.cl / 2], [-p.cw / 2, p.cl / 2]], 0.6, 0.8);
    ctx.fill();
    return true;
  }
  if (p.t === 'crane') {
    ctx.save();
    ctx.lineWidth = CRANE_UNITS;
    ctx.beginPath();
    ctx.moveTo(p.x0 + 1, p.y0 + 1.4);
    ctx.lineTo(p.x1 + 4, p.y1 + 5.5);
    ctx.stroke();
    ctx.restore();
    return true;
  }
  return false;
}
