// v0.8.2 S2c（ユーザーの実機の感想 2026-11-18「もう少しディティールにこだわれないでしょうか？」）: 戦艦・重巡の甲板の模様（Phaser に依らない。destroyer-paint の paintDestroyer が
// 甲板の模様の後・部品の前に、戦艦と重巡だけ呼ぶ＝駆逐艦の絵は今のまま）: 木甲板の縦の板の継ぎ目と板の突き合わせ・艦首の防波堤・錨の揚錨機と錨鎖・舷側のボラード。
// 木と鋼の違いは明るさと線だけ（色は単系統＝ユーザーの決め U8。参考の図の黄土色の木甲板は採らない）。起動時に 1 回だけ。
import { BREAKWATER, DECK_DIM_ALPHA, PLANK_ALPHA, PLANK_BUTT_UNITS, PLANK_UNITS, PLANK_ZONE, STEEL_DIM_ALPHA } from '../config/capital-art-config';
import { DESTROYER_TONES as T } from '../config/destroyer-art-config';
import type { CapitalKind, DestroyerPlan } from './destroyer-plan';
import { planHalfAt } from './destroyer-plan';
import { ellipse, toneCss, type C } from './destroyer-pen';

export function paintCapitalDeck(ctx: C, base: number, plan: DestroyerPlan): void {
  const { L, B } = plan;
  const cx = B / 2;
  // 甲板を少し沈め（上部構造・砲塔・水上機が浮く）、木甲板の外（艦首と艦尾の鋼の甲板）はもう少し暗く
  const kind = plan.kind as CapitalKind;
  const [z0, z1] = [PLANK_ZONE[kind][0] * L, PLANK_ZONE[kind][1] * L];
  ctx.fillStyle = toneCss(base, T.shadow, DECK_DIM_ALPHA);
  ctx.fillRect(0, 0, B, L);
  ctx.fillStyle = toneCss(base, T.shadow, STEEL_DIM_ALPHA);
  ctx.fillRect(0, 0, B, z0);
  ctx.fillRect(0, z1, B, L - z1);
  // 縦の板の継ぎ目と、列ごとにずらした板の突き合わせ（規則のずれ＝乱数なし）
  ctx.fillStyle = toneCss(base, T.shadow, PLANK_ALPHA);
  let i = 0;
  for (let x = PLANK_UNITS; x < B; x += PLANK_UNITS, i++) {
    ctx.fillRect(x, z0, 0.22, z1 - z0);
    for (let y = z0 + ((i * 7) % PLANK_BUTT_UNITS) + 2; y < z1; y += PLANK_BUTT_UNITS) ctx.fillRect(x - PLANK_UNITS, y, PLANK_UNITS, 0.22);
  }
  // 艦首の防波堤（前へ尖った V の低い壁: 暗い線と前の明るい縁）
  const [fa, fe, ws] = BREAKWATER[kind];
  const he = planHalfAt(plan, fe) * ws;
  for (const [v, a, w, dy] of [[T.dark, 0.85, 1.1, 0.5], [T.roof, 0.6, 0.45, -0.2]] as const) {
    ctx.strokeStyle = toneCss(base, v, a);
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(cx - he, fe * L + dy);
    ctx.lineTo(cx, fa * L + dy);
    ctx.lineTo(cx + he, fe * L + dy);
    ctx.stroke();
  }
  // 揚錨機 2 と錨鎖（両舷の錨孔から）・鎖の口
  const yh = 0.04 * L;
  const yw = 0.085 * L;
  ctx.strokeStyle = toneCss(base, T.dark, 0.6);
  ctx.lineWidth = 0.7;
  for (const s of [1, -1]) {
    const xw = cx + s * 0.11 * B;
    ctx.beginPath();
    ctx.moveTo(cx + s * (planHalfAt(plan, 0.04) - 1.6), yh);
    ctx.lineTo(xw, yw);
    ctx.lineTo(cx + s * 0.05 * B, yw + 0.03 * L);
    ctx.stroke();
    ctx.fillStyle = toneCss(base, T.turretDark);
    ellipse(ctx, xw, yw, 1.9, 1.9);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = toneCss(base, T.dark, 0.85);
    ellipse(ctx, cx + s * 0.05 * B, yw + 0.03 * L, 0.9, 0.9);
    ctx.fill();
  }
  // 舷側のボラード（2 つ 1 組）
  ctx.fillStyle = toneCss(base, T.dark, 0.7);
  for (const f of [0.07, 0.3, 0.5, 0.68, 0.9]) {
    const off = planHalfAt(plan, f) - 2.2;
    for (const s of [1, -1]) for (const d of [-0.9, 0.9]) { ellipse(ctx, cx + s * off, f * L + d, 0.6, 0.6); ctx.fill(); }
  }
}
