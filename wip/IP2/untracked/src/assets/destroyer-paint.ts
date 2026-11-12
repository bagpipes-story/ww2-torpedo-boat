// v0.7.0 IP2（U8「駆逐艦のグラフィックを見直してクオリティを上げてください。でも、色は現在と同じ単系統のままで」）: 駆逐艦 3 種を Canvas の 2D に描く（Phaser に依らない。
// 起動時に 1 回だけ＝assets/destroyer-art の paintCanvas。世界単位で描き、呼ぶ側が ctx を k 倍にしておく）。置き方は assets/destroyer-plan、明るさは destroyer-art-config の DESTROYER_TONES。
// 色は陣営のパレットの地の色 1 つから明るさだけを変えて作る（toneRgb: 暗くは RGB に掛け、明るくは白へ混ぜる＝色相は変わらない＝「単系統のまま」）。
// 描く順: 喫水の暗い縁 → 舷の明るい帯 → 甲板（左が明るく右が暗い横の陰影・板の継ぎ目・船首楼の段の影・煙突の煤・錨鎖・爆雷の軌条）→ 高い物の陰（右舷・艦尾へずらす）→ 部品
//   （小物・短艇・発射管・砲・機銃の台・艦橋・煙突・マスト。それぞれ明るい側と暗い側・屋根の光・縁の線）→ 艦首の舷の光。部品は甲板の輪郭で切る（船体の外へ漏らさない）。
import { DESTROYER_BOW_FLARE_TO, DESTROYER_SHADOW_ALPHA, DESTROYER_SHEER_UNITS, DESTROYER_STEP_SHADOW_UNITS, DESTROYER_TONES as T, DESTROYER_WATERLINE_UNITS } from '../config/destroyer-art-config';
import { hullOutline } from './boat-shape';
import { planHalfAt, type DestroyerPlan } from './destroyer-plan';
import { paintPart, shadowOf } from './destroyer-part-paint';
import { ellipse, path, toneCss, xGrad, type C } from './destroyer-pen';

export { toneCss, toneRgb, type C as PaintCtx } from './destroyer-pen';

/** 甲板の上の模様（部品の下）: 板の継ぎ目・船首楼の段・煙突の煤・錨鎖・爆雷の軌条 */
function paintDeckMarks(ctx: C, base: number, plan: DestroyerPlan): void {
  const { L, B } = plan;
  const cx = B / 2;
  ctx.fillStyle = toneCss(base, T.shadow, T.panelAlpha);
  for (let y = plan.detail.panelUnits; y < L; y += plan.detail.panelUnits) ctx.fillRect(0, y, B, 0.5);
  if (plan.forecastle) {
    const [f, kind] = plan.forecastle;
    const y = f * L;
    if (kind === 'line') {
      ctx.fillStyle = toneCss(base, 1.6, 0.08); // 高い船首楼は少し明るい
      ctx.fillRect(0, 0, B, y);
      const g = ctx.createLinearGradient(0, y, 0, y + DESTROYER_STEP_SHADOW_UNITS);
      g.addColorStop(0, toneCss(base, T.shadow, 0.6));
      g.addColorStop(1, toneCss(base, T.shadow, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, y, B, DESTROYER_STEP_SHADOW_UNITS);
      ctx.fillStyle = toneCss(base, T.roof, 0.75);
      ctx.fillRect(0, y - 0.6, B, 0.6);
    } else {
      ctx.fillStyle = toneCss(base, T.shadow, 0.75);
      ctx.fillRect(0, y - 1.4, B, 2.8);
      ctx.fillStyle = toneCss(base, T.roof, 0.7);
      ctx.fillRect(0, y - 2, B, 0.6);
    }
  }
  for (const p of plan.parts) {
    if (p.t !== 'funnel') continue;
    const g = ctx.createRadialGradient(p.cx + 0.8, p.cy + p.len, 0, p.cx + 0.8, p.cy + p.len, p.len * 1.3);
    g.addColorStop(0, toneCss(base, T.soot, 0.28));
    g.addColorStop(1, toneCss(base, T.soot, 0));
    ctx.fillStyle = g;
    ctx.fillRect(p.cx - p.w, p.cy, p.w * 2, p.len * 2.4);
  }
  // 錨鎖（艦首の両舷の錨孔から揚錨機へ）
  const yh = 0.05 * L;
  const hh = planHalfAt(plan, 0.05) - 1.6;
  ctx.strokeStyle = toneCss(base, T.dark, 0.6);
  ctx.lineWidth = 0.6;
  for (const s of [1, -1]) {
    ctx.beginPath();
    ctx.moveTo(cx + s * hh, yh);
    ctx.lineTo(cx + s * 0.9, 0.1 * L);
    ctx.stroke();
  }
  ctx.fillStyle = toneCss(base, T.dark, 0.8);
  ellipse(ctx, cx, 0.1 * L + 0.6, 1.4, 1);
  ctx.fill();
  if (plan.detail.dcRacks) {
    const hs = planHalfAt(plan, 0.96) - 2.4;
    for (const s of [1, -1]) {
      ctx.fillStyle = toneCss(base, T.dark, 0.8);
      ctx.fillRect(cx + s * hs - 0.7, 0.93 * L, 1.4, 0.055 * L - 1);
      ctx.fillStyle = toneCss(base, T.turretLight, 0.6);
      ctx.fillRect(cx + s * hs - 0.7, 0.93 * L, 0.5, 0.055 * L - 1);
    }
  }
}

/** 駆逐艦を 1 枚（ctx は世界単位＝呼ぶ側が k 倍にしてある）。base は陣営のパレットの地の色 */
export function paintDestroyer(ctx: C, plan: DestroyerPlan, base: number): void {
  const { L, B } = plan;
  path(ctx, plan.outline);
  ctx.fillStyle = toneCss(base, T.waterline);
  ctx.fill();
  path(ctx, hullOutline(plan.hull, L, B, DESTROYER_WATERLINE_UNITS));
  ctx.fillStyle = xGrad(ctx, base, 0, B, [[0, T.sheerLeft], [0.5, T.sheerMid], [1, T.sheerRight]]);
  ctx.fill();
  const deck = hullOutline(plan.hull, L, B, DESTROYER_WATERLINE_UNITS + DESTROYER_SHEER_UNITS);
  path(ctx, deck);
  ctx.fillStyle = xGrad(ctx, base, 0, B, [[0, T.deckLeft], [0.42, T.deckMid], [1, T.deckRight]]);
  ctx.fill();
  ctx.save();
  path(ctx, deck);
  ctx.clip();
  paintDeckMarks(ctx, base, plan);
  ctx.fillStyle = toneCss(base, T.shadow, DESTROYER_SHADOW_ALPHA);
  ctx.strokeStyle = toneCss(base, T.shadow, DESTROYER_SHADOW_ALPHA * 0.8);
  for (const p of plan.parts) shadowOf(ctx, p);
  for (const p of plan.parts) paintPart(ctx, base, p);
  path(ctx, deck);
  ctx.strokeStyle = toneCss(base, T.shadow, 0.35);
  ctx.lineWidth = 0.5;
  ctx.stroke();
  ctx.restore();
  // 艦首の舷の光（波を切る舷の明るい線）
  const flare = hullOutline(plan.hull, L, B, DESTROYER_WATERLINE_UNITS + 0.3);
  const tip = flare[0]!;
  ctx.strokeStyle = toneCss(base, 1.55, 0.75);
  ctx.lineWidth = 0.6;
  for (const s of [1, -1]) {
    const side = flare.filter((q) => (q.x - B / 2) * s > 0 && q.y <= DESTROYER_BOW_FLARE_TO * L).sort((a, b) => a.y - b.y);
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    for (const q of side) ctx.lineTo(q.x, q.y);
    ctx.stroke();
  }
}
