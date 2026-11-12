// v0.7.0 IP2（U8）: 駆逐艦の絵の Canvas の 2D の道具（Phaser に依らない）。色は地の色 1 つの明るさだけを変える（toneRgb: 暗くは RGB に掛け、明るくは白へ混ぜる＝色相は変わらない＝「単系統のまま」）。
import type { Pt } from './boat-shape';

/** 地の色 base の明るさ v（< 1 は RGB に掛ける・> 1 は 1 を超えた分だけ白へ混ぜる）。色相は base と同じ */
export function toneRgb(base: number, v: number): [number, number, number] {
  const c = [(base >> 16) & 255, (base >> 8) & 255, base & 255] as [number, number, number];
  if (v <= 1) return [Math.round(c[0] * v), Math.round(c[1] * v), Math.round(c[2] * v)];
  const t = Math.min(1, v - 1);
  return [Math.round(c[0] + (255 - c[0]) * t), Math.round(c[1] + (255 - c[1]) * t), Math.round(c[2] + (255 - c[2]) * t)];
}
export function toneCss(base: number, v: number, a = 1): string {
  const [r, g, b] = toneRgb(base, v);
  return `rgba(${r},${g},${b},${a})`;
}

export type C = CanvasRenderingContext2D;

export function path(ctx: C, pts: readonly Pt[], dx = 0, dy = 0): void {
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x + dx, pts[0]!.y + dy);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x + dx, pts[i]!.y + dy);
  ctx.closePath();
}
export function rrect(ctx: C, x: number, y: number, w: number, h: number, r: number): void {
  const q = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + q, y);
  ctx.lineTo(x + w - q, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + q);
  ctx.lineTo(x + w, y + h - q);
  ctx.quadraticCurveTo(x + w, y + h, x + w - q, y + h);
  ctx.lineTo(x + q, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - q);
  ctx.lineTo(x, y + q);
  ctx.quadraticCurveTo(x, y, x + q, y);
  ctx.closePath();
}
export function ellipse(ctx: C, cx: number, cy: number, rx: number, ry: number): void {
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
}
/** 横（x0 → x1）の明るさの移り（左が明るい＝甲板・砲塔・煙突の陰影） */
export function xGrad(ctx: C, base: number, x0: number, x1: number, stops: readonly (readonly [number, number])[]): CanvasGradient {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  for (const [t, v] of stops) g.addColorStop(t, toneCss(base, v));
  return g;
}

