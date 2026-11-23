// v0.8.2 S2c（ユーザーの実機の感想 2026-11-18「最上は後部甲板に水上機乗せててもいいと思います」）: 水上機の絵（Phaser に依らない。assets/capital-detail-paint から）:
// 甲板に落ちる影・浮舟（単葉＝零式水偵の形は主翼の下の 2 本、複葉＝零観の形は中央の 1 本と翼端の 2 つ）・細る主翼と補助翼の筋・尾翼・胴・複葉の上の翼と支柱・風防・カウリングとプロペラ。
// 斜めの物（カタパルト・カタパルトの上の機）の局所の座標の道具も持つ。色は地の色 1 つの明るさだけ（単系統）。起動時に 1 回だけ。
import { PLANE_SHADOW_UNITS } from '../config/capital-art-config';
import { DESTROYER_TONES as T } from '../config/destroyer-art-config';
import type { DestroyerPart } from './destroyer-plan';
import { toneCss, type C } from './destroyer-pen';

/** 斜めの物の局所の座標（u は右舷・v は艦尾）→ 世界。ang 度は艦首へ向く軸を右舷へ回す */
export function frame(cx: number, cy: number, ang: number): (u: number, v: number) => [number, number] {
  const a = (ang * Math.PI) / 180;
  const [c, s] = [Math.cos(a), Math.sin(a)];
  return (u, v) => [cx + u * c - v * s, cy + u * s + v * c];
}
export function poly(ctx: C, F: (u: number, v: number) => [number, number], pts: readonly (readonly [number, number])[], dx = 0, dy = 0): void {
  ctx.beginPath();
  pts.forEach(([u, v], i) => { const [x, y] = F(u, v); if (i === 0) ctx.moveTo(x + dx, y + dy); else ctx.lineTo(x + dx, y + dy); });
  ctx.closePath();
}
export function oval(ctx: C, F: (u: number, v: number) => [number, number], ang: number, u: number, v: number, ru: number, rv: number, dx = 0, dy = 0): void {
  const [x, y] = F(u, v);
  ctx.beginPath();
  ctx.ellipse(x + dx, y + dy, Math.max(0.1, ru), Math.max(0.1, rv), (ang * Math.PI) / 180, 0, Math.PI * 2);
}

/** 水上機の主翼（局所。付け根の前縁 v0・後縁 v1、翼端は弦が細る＝前縁が少し後ろへ下がる。翼端は丸めた多角形） */
const wing = (S: number, v0: number, v1: number): [number, number][] => {
  const c = v1 - v0;
  const [t0, t1] = [v0 + c * 0.22, v1 - c * 0.12];
  return [[-S * 0.1, v0], [S * 0.1, v0], [S * 0.48, t0], [S / 2, t0 + c * 0.15], [S / 2, t1 - c * 0.12], [S * 0.47, t1], [S * 0.1, v1], [-S * 0.1, v1], [-S * 0.47, t1], [-S / 2, t1 - c * 0.12], [-S / 2, t0 + c * 0.15], [-S * 0.48, t0]];
};
/** 胴（局所。機首が丸く尾へ細る） */
const body = (S: number, P: number): [number, number][] => {
  const r = S * 0.04;
  return [[0, -0.5 * P], [r * 0.8, -0.47 * P], [r, -0.3 * P], [r * 0.85, 0.05 * P], [r * 0.35, 0.45 * P], [0, 0.5 * P], [-r * 0.35, 0.45 * P], [-r * 0.85, 0.05 * P], [-r, -0.3 * P], [-r * 0.8, -0.47 * P]];
};
export function paintPlane(ctx: C, base: number, p: Extract<DestroyerPart, { t: 'plane' }>): void {
  const F = frame(p.cx, p.cy, p.ang);
  const [S, P] = [p.span, p.plen];
  const line = (a = 0.8): void => { ctx.strokeStyle = toneCss(base, T.dark, a); ctx.lineWidth = 0.45; ctx.stroke(); };
  const [w0, w1] = p.bi ? [-0.2 * P, 0.02 * P] : [-0.24 * P, 0.02 * P];
  const tail: [number, number][] = [[-S * 0.05, 0.34 * P], [S * 0.05, 0.34 * P], [S * 0.19, 0.4 * P], [S * 0.19, 0.47 * P], [-S * 0.19, 0.47 * P], [-S * 0.19, 0.4 * P]];
  // 影（甲板に落ちる主翼・胴・尾翼。1 つの道）
  const [sx, sy] = [PLANE_SHADOW_UNITS * 0.75, PLANE_SHADOW_UNITS];
  ctx.fillStyle = toneCss(base, T.shadow, 0.34);
  for (const pts of [wing(S, w0, w1), body(S, P), tail]) { poly(ctx, F, pts, sx, sy); ctx.fill(); }
  // 浮舟（単葉は主翼の下の 2 本が機首の前まで・複葉は中央の 1 本と翼端の 2 つ）
  ctx.fillStyle = toneCss(base, T.super1);
  const floats: [number, number, number, number][] = p.bi ? [[0, -0.16, 0.05, 0.36], [-0.43, -0.08, 0.024, 0.09], [0.43, -0.08, 0.024, 0.09]] : [[-0.17, -0.14, 0.036, 0.36], [0.17, -0.14, 0.036, 0.36]];
  for (const [u, v, ru, rv] of floats) { oval(ctx, F, p.ang, u * S, v * P, ru * S, rv * P); ctx.fill(); line(0.65); }
  // 主翼（複葉は下の翼の後縁だけが上の翼の後ろに見える）と補助翼の筋
  ctx.fillStyle = toneCss(base, p.bi ? T.super2 : T.boat);
  poly(ctx, F, wing(S, w0, w1));
  ctx.fill();
  line();
  ctx.fillStyle = toneCss(base, T.shadow, 0.3);
  for (const s of [-1, 1]) { poly(ctx, F, [[s * S * 0.2, w1 - 0.06 * P], [s * S * 0.46, w1 - 0.07 * P], [s * S * 0.46, w1 - 0.05 * P], [s * S * 0.2, w1 - 0.04 * P]]); ctx.fill(); }
  // 胴（機首のカウリングは暗い輪）・尾翼
  ctx.fillStyle = toneCss(base, T.boat);
  poly(ctx, F, tail);
  ctx.fill();
  line();
  ctx.fillStyle = toneCss(base, T.boat * 1.05);
  poly(ctx, F, body(S, P));
  ctx.fill();
  line();
  if (p.bi) {
    ctx.fillStyle = toneCss(base, T.boat * 1.06);
    poly(ctx, F, wing(S * 1.02, -0.3 * P, -0.08 * P));
    ctx.fill();
    line();
    ctx.fillStyle = toneCss(base, T.dark, 0.7); // 支柱
    for (const u of [-0.32, 0.32]) { oval(ctx, F, p.ang, u * S, -0.19 * P, 0.45, 0.45); ctx.fill(); }
  }
  ctx.fillStyle = toneCss(base, T.window, 0.6); // 風防（細い暗い帯）
  poly(ctx, F, [[-S * 0.018, -0.26 * P], [S * 0.018, -0.26 * P], [S * 0.018, (p.bi ? 0.0 : 0.1) * P], [-S * 0.018, (p.bi ? 0.0 : 0.1) * P]]);
  ctx.fill();
  ctx.fillStyle = toneCss(base, T.dark, 0.9); // カウリングとプロペラ・垂直尾翼の筋
  oval(ctx, F, p.ang, 0, -0.45 * P, S * 0.042, P * 0.045);
  ctx.fill();
  poly(ctx, F, [[-S * 0.12, -0.515 * P], [S * 0.12, -0.515 * P], [S * 0.12, -0.495 * P], [-S * 0.12, -0.495 * P]]);
  ctx.fill();
  poly(ctx, F, [[-0.3, 0.3 * P], [0.3, 0.3 * P], [0.3, 0.5 * P], [-0.3, 0.5 * P]]);
  ctx.fill();
}
