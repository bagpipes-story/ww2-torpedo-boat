// v0.7.0 IP3（U10）: 艇の銃座・砲の描き方（Phaser に依らない。assets/boat-paint が船室の後に呼ぶ）。どれも明るい側（左）と暗い側（右）・暗い縁の線・砲身（暗い線に明るい筋）。
import { BOAT_BARREL_W_UNITS, BOAT_TONES as T, type BoatGunStyle } from '../config/boat-paint-config';
import { ellipse, toneCss, xGrad, type C } from './destroyer-pen';

/** 砲身（(x0, y0) から向き (ux, uy) へ長さ len） */
function barrel(ctx: C, base: number, x0: number, y0: number, ux: number, uy: number, len: number, w = BOAT_BARREL_W_UNITS): void {
  ctx.strokeStyle = toneCss(base, T.barrel);
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x0 + ux * len, y0 + uy * len);
  ctx.stroke();
  ctx.strokeStyle = toneCss(base, T.tubeLeft, 0.45);
  ctx.lineWidth = w * 0.35;
  ctx.beginPath();
  ctx.moveTo(x0 - w * 0.2, y0);
  ctx.lineTo(x0 - w * 0.2 + ux * len, y0 + uy * len);
  ctx.stroke();
}

/** 丸い台（輪の陰影と暗い縁） */
function ring(ctx: C, base: number, cx: number, cy: number, r: number): void {
  ctx.fillStyle = xGrad(ctx, base, cx - r, cx + r, [[0, T.tubRing], [1, T.tubRing * 0.72]]);
  ellipse(ctx, cx, cy, r, r);
  ctx.fill();
  ctx.strokeStyle = toneCss(base, T.edge, 0.8);
  ctx.lineWidth = 0.22;
  ctx.stroke();
}

/**
 * 1 つの銃座（中心 cx, cy・半径 r。xf は中心線からの x（B 倍）、f は長さの割合＝後ろ半分の砲は後ろを向く）
 */
export function paintBoatGun(ctx: C, base: number, style: BoatGunStyle, cx: number, cy: number, r: number, xf: number, f: number): void {
  const aft = f > 0.6;
  const fy = aft ? 1 : -1;
  if (style === 'dc') {
    ctx.fillStyle = xGrad(ctx, base, cx - r, cx + r, [[0, T.tubeLeft], [1, T.tubeRight]]);
    ellipse(ctx, cx, cy, r, r);
    ctx.fill();
    ctx.strokeStyle = toneCss(base, T.edge, 0.85);
    ctx.lineWidth = 0.25;
    ctx.stroke();
    ctx.fillStyle = toneCss(base, T.edge, 0.6);
    ellipse(ctx, cx, cy, r * 0.35, r * 0.35);
    ctx.fill();
    return;
  }
  if (style === 'twin50') {
    // 連装 .50 の丸い銃座: 輪・暗い中・外へ向く 2 本の砲身
    ring(ctx, base, cx, cy, r);
    ctx.fillStyle = toneCss(base, T.tubInner);
    ellipse(ctx, cx + 0.08, cy + 0.1, r - 0.5, r - 0.5);
    ctx.fill();
    const s = xf >= 0 ? 1 : -1;
    const ux = s * 0.42;
    const uy = -0.91;
    for (const o of [-0.38, 0.38]) barrel(ctx, base, cx + o, cy, ux, uy, r + 1.8, BOAT_BARREL_W_UNITS * 0.8);
    ctx.fillStyle = toneCss(base, T.tubRing);
    ellipse(ctx, cx, cy, 0.5, 0.5);
    ctx.fill();
    return;
  }
  if (style === 'bofors') {
    // 40 mm: 広い台・後ろへ向く砲身・左右の座席
    ring(ctx, base, cx, cy, r);
    barrel(ctx, base, cx, cy, 0, fy, r + 2.6, BOAT_BARREL_W_UNITS * 1.3);
    ctx.fillStyle = xGrad(ctx, base, cx - r * 0.6, cx + r * 0.6, [[0, T.cabinLeft], [1, T.cabinRight * 0.9]]);
    ellipse(ctx, cx, cy, r * 0.62, r * 0.62);
    ctx.fill();
    ctx.fillStyle = toneCss(base, T.edge, 0.85);
    for (const s of [1, -1]) {
      ellipse(ctx, cx + s * r * 0.55, cy - fy * 0.3, 0.35, 0.35);
      ctx.fill();
    }
    return;
  }
  // bow20・mg13・mg25: 台・盾・砲身（前半は前、後ろ半分は後ろ）
  ring(ctx, base, cx, cy, r);
  const n = style === 'mg25' ? 2 : 1;
  const len = style === 'mg13' ? r + 1.5 : r + 2.2;
  for (let i = 0; i < n; i++) barrel(ctx, base, cx + (n === 2 ? (i === 0 ? -0.35 : 0.35) : 0), cy, 0, fy, len, style === 'mg13' ? BOAT_BARREL_W_UNITS * 0.75 : BOAT_BARREL_W_UNITS);
  // 盾（砲身の根の弧）
  ctx.strokeStyle = toneCss(base, T.cabinLeft);
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 0.7, r * 0.7, 0, aft ? 0.15 * Math.PI : 1.15 * Math.PI, aft ? 0.85 * Math.PI : 1.85 * Math.PI);
  ctx.stroke();
  ctx.fillStyle = toneCss(base, T.tubInner);
  ellipse(ctx, cx, cy + fy * -0.05, r * 0.36, r * 0.36);
  ctx.fill();
}
