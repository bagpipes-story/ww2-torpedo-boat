// v0.7.0 IP2（U8）: 駆逐艦の部品の描き方（Phaser に依らない。assets/destroyer-paint が甲板の後に呼ぶ）: 高い物の陰（右舷・艦尾へずらす）と、砲（連装の砲塔・単装の密閉の砲塔・盾つきの砲）・
// 発射管（筒の陰影と盾）・艦橋（段・窓・測距儀や方位盤）・煙突（胴の陰影・冠・煤の口）・マスト（桁）・短艇・機銃の台・甲板の小物。どれも明るい側（左）と暗い側（右）・屋根の光・縁の線を持つ。
import { DESTROYER_BARREL_UNITS, DESTROYER_SHADOW_DX, DESTROYER_SHADOW_DY, DESTROYER_TONES as T, DESTROYER_TWIN_DX } from '../config/destroyer-art-config';
import type { DestroyerPart } from './destroyer-plan';
import { ellipse, rrect, toneCss, xGrad, type C } from './destroyer-pen';

/** 高い物の陰の形（甲板に落ちる。右舷・艦尾へずらして描く） */
export function shadowOf(ctx: C, p: DestroyerPart): void {
  const dx = DESTROYER_SHADOW_DX * (p.t === 'funnel' || p.t === 'bridge' ? 1.6 : p.t === 'locker' || p.t === 'tub' ? 0.6 : 1);
  const dy = DESTROYER_SHADOW_DY * (p.t === 'funnel' || p.t === 'bridge' ? 1.6 : p.t === 'locker' || p.t === 'tub' ? 0.6 : 1);
  if (p.t === 'funnel' || p.t === 'boat' || p.t === 'tub') {
    ellipse(ctx, p.cx + dx, p.cy + dy, p.w / 2, p.len / 2);
    ctx.fill();
  } else if (p.t === 'mast') {
    ctx.fillRect(p.cx - p.w / 2 + dx, p.cy - 0.4 + dy, p.w, 0.8);
    ctx.save();
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(p.cx + 0.6, p.cy + 0.6);
    ctx.lineTo(p.cx + 6, p.cy + 8);
    ctx.stroke();
    ctx.restore();
  } else {
    rrect(ctx, p.cx - p.w / 2 + dx, p.cy - p.len / 2 + dy, p.w, p.len, 1.2);
    ctx.fill();
    if (p.t === 'gun') {
      const y = p.dir === 1 ? p.cy - p.len / 2 - p.barrel : p.cy + p.len / 2;
      for (const bx of p.style === 'twin' ? [-DESTROYER_TWIN_DX, DESTROYER_TWIN_DX] : [0]) ctx.fillRect(p.cx + bx - DESTROYER_BARREL_UNITS / 2 + dx, y + dy, DESTROYER_BARREL_UNITS, p.barrel);
    }
  }
}

/** 砲（dir 1＝砲身が前）。u は砲の前 −len/2 → 後ろ +len/2 */
function paintGun(ctx: C, base: number, p: Extract<DestroyerPart, { t: 'gun' }>): void {
  const Y = (u: number): number => p.cy + p.dir * u;
  const h = p.len / 2;
  const hw = p.w / 2;
  const front = Y(-h);
  const tip = Y(-h - p.barrel);
  const barrels = p.style === 'twin' ? [-DESTROYER_TWIN_DX, DESTROYER_TWIN_DX] : [0];
  for (const dx of barrels) {
    const bx = p.cx + dx - DESTROYER_BARREL_UNITS / 2;
    ctx.fillStyle = toneCss(base, T.dark);
    ctx.fillRect(bx, Math.min(front, tip), DESTROYER_BARREL_UNITS, p.barrel + 1);
    ctx.fillStyle = toneCss(base, T.turretLight, 0.55);
    ctx.fillRect(bx, Math.min(front, tip), DESTROYER_BARREL_UNITS * 0.4, p.barrel + 1);
  }
  ctx.fillStyle = xGrad(ctx, base, p.cx - hw, p.cx + hw, [[0, T.turretLight], [0.55, (T.turretLight + T.turretDark) / 2], [1, T.turretDark]]);
  if (p.style === 'twin') {
    // 前が細く後ろが丸い砲塔
    const r = Math.min(hw * 0.7, h * 0.8);
    ctx.beginPath();
    ctx.moveTo(p.cx - hw * 0.72, Y(-h));
    ctx.lineTo(p.cx + hw * 0.72, Y(-h));
    ctx.lineTo(p.cx + hw, Y(-h * 0.35));
    ctx.lineTo(p.cx + hw, Y(h - r));
    ctx.quadraticCurveTo(p.cx + hw, Y(h), p.cx + hw - r, Y(h));
    ctx.lineTo(p.cx - hw + r, Y(h));
    ctx.quadraticCurveTo(p.cx - hw, Y(h), p.cx - hw, Y(h - r));
    ctx.lineTo(p.cx - hw, Y(-h * 0.35));
    ctx.closePath();
  } else if (p.style === 'single5') {
    // 前が半円・後ろが平らな密閉の砲塔
    ctx.beginPath();
    ctx.ellipse(p.cx, Y(-h + hw), hw, hw, 0, p.dir === 1 ? Math.PI : 0, p.dir === 1 ? Math.PI * 2 : Math.PI);
    ctx.lineTo(p.cx + p.dir * hw, Y(h));
    ctx.lineTo(p.cx - p.dir * hw, Y(h));
    ctx.closePath();
  } else {
    // 盾つきの砲: 丸い台の上に前の盾
    ellipse(ctx, p.cx, p.cy, hw * 0.86, h * 0.86);
    ctx.fillStyle = toneCss(base, T.turretDark);
    ctx.fill();
    ctx.strokeStyle = toneCss(base, T.dark, 0.7);
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.fillStyle = toneCss(base, T.dark, 0.7);
    ctx.fillRect(p.cx - 0.6, Math.min(Y(-h * 0.6), Y(h * 0.5)), 1.2, h * 1.1);
    ctx.fillStyle = xGrad(ctx, base, p.cx - hw, p.cx + hw, [[0, T.roof], [0.5, T.super2], [1, T.turretDark]]);
    rrect(ctx, p.cx - hw, Math.min(Y(-h), Y(-h * 0.1)), p.w, h * 0.9, 1.4);
  }
  ctx.fill();
  ctx.strokeStyle = toneCss(base, T.dark, 0.75);
  ctx.lineWidth = 0.5;
  ctx.stroke();
  if (p.style !== 'single12') {
    // 屋根の光と後ろの昇降口
    ctx.fillStyle = toneCss(base, T.roof, 0.5);
    rrect(ctx, p.cx - hw * 0.62, Math.min(Y(-h * 0.45), Y(h * 0.45)), hw * 0.55, h * 0.9, 0.8);
    ctx.fill();
    ctx.fillStyle = toneCss(base, T.dark, 0.65);
    ellipse(ctx, p.cx + hw * 0.3, Y(h * 0.55), 0.8, 0.8);
    ctx.fill();
  }
}

/** 発射管: 回る台の上に並んだ管（筒の陰影）と前の盾 */
function paintTubes(ctx: C, base: number, p: Extract<DestroyerPart, { t: 'tubes' }>): void {
  const hw = p.w / 2;
  const top = p.cy - p.len / 2;
  ctx.fillStyle = toneCss(base, T.turretDark);
  ellipse(ctx, p.cx, p.cy, hw * 0.9, Math.min(hw * 0.9, p.len * 0.42));
  ctx.fill();
  const gap = 0.35;
  const tw = (p.w - gap * (p.n - 1)) / p.n;
  for (let i = 0; i < p.n; i++) {
    const x = p.cx - hw + i * (tw + gap);
    ctx.fillStyle = xGrad(ctx, base, x, x + tw, [[0, T.turretLight], [0.45, T.super2], [1, T.turretDark * 0.92]]);
    rrect(ctx, x, top, tw, p.len, tw / 2);
    ctx.fill();
    ctx.fillStyle = toneCss(base, T.dark, 0.85);
    ellipse(ctx, x + tw / 2, top + 0.9, tw * 0.32, 0.6);
    ctx.fill();
  }
  if (p.shield) {
    ctx.fillStyle = xGrad(ctx, base, p.cx - hw, p.cx + hw, [[0, T.roof], [0.6, T.super2], [1, T.turretDark]]);
    rrect(ctx, p.cx - hw - 0.3, p.cy - p.len * 0.08, p.w + 0.6, p.len * 0.36, 1.2);
    ctx.fill();
    ctx.strokeStyle = toneCss(base, T.dark, 0.6);
    ctx.lineWidth = 0.45;
    ctx.stroke();
  }
}

/** 艦橋: 1 段目（広い）・2 段目（明るい）・前の窓の帯・屋根の測距儀や方位盤 */
function paintBridge(ctx: C, base: number, p: Extract<DestroyerPart, { t: 'bridge' }>): void {
  const x0 = p.cx - p.w / 2;
  const y0 = p.cy - p.len / 2;
  const usn = p.style === 'usn';
  ctx.fillStyle = xGrad(ctx, base, x0, x0 + p.w, [[0, T.super1 * 1.12], [1, T.super1 * 0.82]]);
  if (usn) {
    ctx.beginPath();
    ctx.ellipse(p.cx, y0 + p.w * 0.45, p.w / 2, p.w * 0.45, 0, Math.PI, Math.PI * 2);
    ctx.lineTo(x0 + p.w, y0 + p.len);
    ctx.lineTo(x0, y0 + p.len);
    ctx.closePath();
  } else rrect(ctx, x0, y0, p.w, p.len, 1.6);
  ctx.fill();
  ctx.strokeStyle = toneCss(base, T.dark, 0.6);
  ctx.lineWidth = 0.5;
  ctx.stroke();
  const w2 = p.w * (p.style === 'ijnSmall' ? 0.64 : usn ? 0.74 : 0.8);
  const t2 = y0 + p.len * (usn ? 0.1 : 0.12);
  const h2 = p.len * (p.style === 'ijnSmall' ? 0.55 : 0.62);
  ctx.fillStyle = xGrad(ctx, base, p.cx - w2 / 2, p.cx + w2 / 2, [[0, T.super2 * 1.05], [1, T.super1 * 0.95]]);
  rrect(ctx, p.cx - w2 / 2, t2, w2, h2, usn ? w2 * 0.4 : 1.2);
  ctx.fill();
  ctx.fillStyle = toneCss(base, T.window);
  rrect(ctx, p.cx - w2 / 2 + 0.5, t2 + 0.3, w2 - 1, 1.2, 0.6);
  ctx.fill();
  ctx.fillStyle = toneCss(base, T.roof, 0.55);
  rrect(ctx, p.cx - w2 / 2 + 0.8, t2 + 2, w2 * 0.45, h2 - 2.8, 0.8);
  ctx.fill();
  const ry = t2 + h2 * (usn ? 0.66 : 0.58);
  ctx.fillStyle = toneCss(base, T.dark, 0.9);
  rrect(ctx, p.cx - p.w * 0.44, ry - 0.65, p.w * 0.88, 1.3, 0.65);
  ctx.fill();
  const dr = usn ? p.w * 0.22 : p.w * (p.style === 'ijnSmall' ? 0.13 : 0.16);
  ctx.fillStyle = xGrad(ctx, base, p.cx - dr, p.cx + dr, [[0, T.roof], [1, T.turretDark]]);
  if (usn) rrect(ctx, p.cx - dr, ry - dr, dr * 2, dr * 2, dr * 0.5);
  else ellipse(ctx, p.cx, ry, dr, dr);
  ctx.fill();
  ctx.strokeStyle = toneCss(base, T.dark, 0.7);
  ctx.lineWidth = 0.45;
  ctx.stroke();
}

/** 煙突: 胴（左が明るい）・暗い冠の輪・煤の口・左の縁の光 */
function paintFunnel(ctx: C, base: number, p: Extract<DestroyerPart, { t: 'funnel' }>): void {
  const rx = p.w / 2;
  const ry = p.len / 2;
  ctx.fillStyle = xGrad(ctx, base, p.cx - rx, p.cx + rx, [[0, T.funnel * 1.35], [0.5, T.funnel], [1, T.funnel * 0.7]]);
  ellipse(ctx, p.cx, p.cy, rx, ry);
  ctx.fill();
  ctx.strokeStyle = toneCss(base, T.dark);
  ctx.lineWidth = 0.9;
  ctx.stroke();
  ctx.fillStyle = toneCss(base, T.soot);
  ellipse(ctx, p.cx + 0.2, p.cy + 0.2, rx - 1.7, ry - 1.7);
  ctx.fill();
  ctx.strokeStyle = toneCss(base, T.roof, 0.7);
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.ellipse(p.cx, p.cy, rx - 0.5, ry - 0.5, 0, Math.PI * 0.75, Math.PI * 1.35);
  ctx.stroke();
}

export function paintPart(ctx: C, base: number, p: DestroyerPart): void {
  if (p.t === 'gun') paintGun(ctx, base, p);
  else if (p.t === 'tubes') paintTubes(ctx, base, p);
  else if (p.t === 'bridge') paintBridge(ctx, base, p);
  else if (p.t === 'funnel') paintFunnel(ctx, base, p);
  else if (p.t === 'mast') {
    ctx.fillStyle = toneCss(base, T.dark);
    ctx.fillRect(p.cx - p.w / 2, p.cy - 0.4, p.w, 0.8);
    ctx.fillStyle = toneCss(base, T.turretLight, 0.7);
    ctx.fillRect(p.cx - p.w / 2, p.cy - 0.4, p.w, 0.3);
    ctx.fillStyle = toneCss(base, T.super2);
    ellipse(ctx, p.cx, p.cy, 1.1, 1.1);
    ctx.fill();
    ctx.strokeStyle = toneCss(base, T.dark, 0.8);
    ctx.lineWidth = 0.45;
    ctx.stroke();
  } else if (p.t === 'boat') {
    ctx.fillStyle = toneCss(base, T.boat);
    ellipse(ctx, p.cx, p.cy, p.w / 2, p.len / 2);
    ctx.fill();
    ctx.strokeStyle = toneCss(base, T.dark, 0.6);
    ctx.lineWidth = 0.4;
    ctx.stroke();
    ctx.fillStyle = toneCss(base, T.super1);
    ellipse(ctx, p.cx, p.cy, p.w / 2 - 0.6, p.len / 2 - 1.1);
    ctx.fill();
  } else {
    // 機銃の台・甲板の小物
    ctx.fillStyle = toneCss(base, T.super2);
    if (p.t === 'tub') ellipse(ctx, p.cx, p.cy, p.w / 2, p.len / 2);
    else rrect(ctx, p.cx - p.w / 2, p.cy - p.len / 2, p.w, p.len, 0.4);
    ctx.fill();
    ctx.strokeStyle = toneCss(base, T.dark, 0.7);
    ctx.lineWidth = 0.45;
    ctx.stroke();
    ctx.fillStyle = toneCss(base, p.t === 'tub' ? T.dark : T.roof, 0.8);
    ellipse(ctx, p.cx - (p.t === 'tub' ? 0 : 0.3), p.cy - (p.t === 'tub' ? 0 : 0.3), p.w * 0.25, p.len * 0.25);
    ctx.fill();
  }
}

