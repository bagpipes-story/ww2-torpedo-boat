// v0.8.2 S2c（ユーザーの実機の感想 2026-11-18「デフォルメされすぎている…もう少しディティールに」）: 戦艦・重巡の主砲塔（Phaser に依らない。assets/capital-paint から）:
// 背負い式・高い台の砲塔は描く前に砲塔と砲身の影を下（甲板・下の砲塔の屋根）へ落とし、砲塔は destroyer-part-paint の連装の形のまま描いてから、砲身の付け根の防水布と砲口・
// 屋根の観測鏡の覆い・後ろの測距儀の耳（山城の 35.6 cm 砲塔の見分けの形。最上は小さい）を足す。色は地の色 1 つの明るさだけ（単系統）。起動時に 1 回だけ。
import { LIFT_SHADOW_ALPHA, LIFT_SHADOW_UNITS } from '../config/capital-art-config';
import { DESTROYER_BARREL_UNITS, DESTROYER_TONES as T, DESTROYER_TWIN_DX } from '../config/destroyer-art-config';
import type { DestroyerPart } from './destroyer-plan';
import { paintPart } from './destroyer-part-paint';
import { ellipse, rrect, toneCss, type C } from './destroyer-pen';

/** 高い主砲塔（背負い式・高い台）: 描く前に砲塔と砲身の影を下（甲板・下の砲塔の屋根）へ落とす */
function paintLiftShadow(ctx: C, base: number, p: Extract<DestroyerPart, { t: 'gun' }>): void {
  const s = LIFT_SHADOW_UNITS * (p.lift ?? 0);
  const [dx, dy] = [s * 0.75, s];
  ctx.fillStyle = toneCss(base, T.shadow, LIFT_SHADOW_ALPHA);
  rrect(ctx, p.cx - p.w / 2 + dx, p.cy - p.len / 2 + dy, p.w, p.len, p.w * 0.3);
  ctx.fill();
  const y = p.dir === 1 ? p.cy - p.len / 2 - p.barrel : p.cy + p.len / 2;
  const tdx = p.dx ?? DESTROYER_TWIN_DX;
  const bw = p.bw ?? DESTROYER_BARREL_UNITS;
  for (const bx of [-tdx, tdx]) ctx.fillRect(p.cx + bx - bw / 2 + dx, y + dy, bw, p.barrel);
}

/** 主砲塔の細部（u は砲の前 −len/2 → 後ろ +len/2）: 砲身の付け根の明るい防水布と暗い砲口・屋根の前の観測鏡の覆い 2・後ろの測距儀の耳（両端の明るい覆い） */
function paintTurretDetail(ctx: C, base: number, p: Extract<DestroyerPart, { t: 'gun' }>): void {
  const Y = (u: number): number => p.cy + p.dir * u;
  const [h, hw] = [p.len / 2, p.w / 2];
  const tdx = p.dx ?? DESTROYER_TWIN_DX;
  const bw = p.bw ?? DESTROYER_BARREL_UNITS;
  for (const bx of [-tdx, tdx]) {
    ctx.fillStyle = toneCss(base, T.super1);
    ctx.fillRect(p.cx + bx - bw * 0.8, Math.min(Y(-h), Y(-h - p.barrel * 0.1)), bw * 1.6, p.barrel * 0.1);
    ctx.fillStyle = toneCss(base, T.soot);
    ctx.fillRect(p.cx + bx - bw * 0.55, Math.min(Y(-h - p.barrel), Y(-h - p.barrel + 1)), bw * 1.1, 1);
  }
  ctx.strokeStyle = toneCss(base, T.dark, 0.7);
  ctx.lineWidth = 0.4;
  for (const s of [-1, 1]) {
    ctx.fillStyle = toneCss(base, T.roof);
    ellipse(ctx, p.cx + s * hw * 0.5, Y(-h * 0.5), hw * 0.16, h * 0.14);
    ctx.fill();
    ctx.stroke();
  }
  const ears = (p.ears ?? 0) * p.w;
  if (ears <= 0) return;
  const ey = Y(h * 0.42);
  ctx.fillStyle = toneCss(base, T.turretDark * 0.9);
  rrect(ctx, p.cx - hw - ears, ey - h * 0.11, p.w + ears * 2, h * 0.22, h * 0.1);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = toneCss(base, T.roof);
  for (const s of [-1, 1]) {
    ellipse(ctx, p.cx + s * (hw + ears * 0.45), ey, ears * 0.55, h * 0.16);
    ctx.fill();
    ctx.stroke();
  }
}

/** 主砲塔: 高い砲塔は下へ影 → 砲塔 → 細部 */
export function paintMainTurret(ctx: C, base: number, p: Extract<DestroyerPart, { t: 'gun' }>): void {
  if ((p.lift ?? 0) > 0) paintLiftShadow(ctx, base, p);
  paintPart(ctx, base, p);
  paintTurretDetail(ctx, base, p);
}
