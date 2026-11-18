// v0.8.2 S2b（us_05。spec-v0820 §4.11 D-A1・D-A2、lead の L30）: 戦艦 扶桑型・重巡 最上の部品の型 3 つの描き方（Phaser に依らない。assets/destroyer-paint の paintDestroyer が部品ごとに先に呼ぶ）:
// 塔の艦橋（段ごとに縮んで明るくなる箱の重なりと、上の段ほど遠くへ落ちる影＝高さ。最上段に測距儀の腕と方位盤）・舷側の砲郭の列（張り出しと外へ向く短い砲身）・後部の飛行甲板
// （平らな明るい矩形・板の継ぎ目・縦のレール・回転台・暗い縁）。色は地の色 1 つの明るさだけ（destroyer-pen の toneCss・xGrad＝単系統）。起動時に 1 回だけ（Boot の generateColumnTextures）。
import {
  CASEMATE_BARREL_UNITS, CASEMATE_SPONSON_SHARE, DECK_EDGE_UNITS, DECK_PLANK_UNITS, DECK_RAIL_UNITS, DECK_TURNTABLE_SHARE, PAGODA_ARM_UNITS, PAGODA_DIRECTOR_SHARE, PAGODA_SHADOW_ALPHA, PAGODA_SHADOW_PER_TIER_UNITS, PAGODA_SHADOW_X_SHARE,
  PAGODA_STEP_SHADOW_ALPHA, PAGODA_STEP_SHADOW_UNITS,
} from '../config/capital-art-config';
import { DESTROYER_TONES as T } from '../config/destroyer-art-config';
import { pagodaTier } from './capital-plan';
import type { DestroyerPart } from './destroyer-plan';
import { ellipse, rrect, toneCss, xGrad, type C } from './destroyer-pen';

/** 戦艦・重巡の部品（pagoda・casemate・deck）を描いたら true（ほかの型は描かずに false＝destroyer-part-paint の paintPart が描く） */
export function paintCapitalPart(ctx: C, base: number, p: DestroyerPart): boolean {
  if (p.t === 'pagoda') {
    // 高さ: 上の段ほど遠くへ落ちる長い影（艦尾・右舷の甲板へ）、段ごとに下の段へ落ちる短い影・上ほど明るい段・前の縁の窓の帯、最上段に測距儀の腕と方位盤
    ctx.fillStyle = toneCss(base, T.shadow, PAGODA_SHADOW_ALPHA);
    for (let k = 0; k < p.tiers; k++) {
      const [x, y, w, h] = pagodaTier(p, k);
      const s = PAGODA_SHADOW_PER_TIER_UNITS * (k + 1);
      rrect(ctx, x + s * PAGODA_SHADOW_X_SHARE, y + s, w, h, 1.5);
      ctx.fill();
    }
    ctx.strokeStyle = toneCss(base, T.dark, 0.7);
    ctx.lineWidth = 0.5;
    for (let k = 0; k < p.tiers; k++) {
      const [x, y, w, h] = pagodaTier(p, k);
      if (k > 0) {
        // 段の影: この段が下の段に落とす短い影（段ごとの高さ）
        ctx.fillStyle = toneCss(base, T.shadow, PAGODA_STEP_SHADOW_ALPHA);
        rrect(ctx, x + PAGODA_STEP_SHADOW_UNITS * PAGODA_SHADOW_X_SHARE, y + PAGODA_STEP_SHADOW_UNITS, w, h, 1.4);
        ctx.fill();
      }
      const v = T.super1 + ((T.boat - T.super1) * k) / Math.max(1, p.tiers - 1); // 上の段ほど明るい（高い）
      ctx.fillStyle = xGrad(ctx, base, x, x + w, [[0, v * 1.06], [0.55, v * 0.94], [1, v * 0.74]]);
      rrect(ctx, x, y, w, h, 1.4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = toneCss(base, T.window, 0.85);
      ctx.fillRect(x + 0.7, y + 0.5, w - 1.4, 0.9);
    }
    const [x, y, w, h] = pagodaTier(p, p.tiers - 1);
    ctx.fillStyle = toneCss(base, T.dark, 0.9);
    rrect(ctx, p.cx - p.w * 0.45, y + h * 0.45, p.w * 0.9, PAGODA_ARM_UNITS, PAGODA_ARM_UNITS / 2);
    ctx.fill();
    ctx.fillStyle = xGrad(ctx, base, x, x + w, [[0, T.roof], [1, T.turretDark]]);
    ellipse(ctx, p.cx, y + h * 0.3, w * PAGODA_DIRECTOR_SHARE, w * PAGODA_DIRECTOR_SHARE);
    ctx.fill();
  } else if (p.t === 'casemate') {
    // 舷側の砲郭: 門ごとに張り出しと外へ向く短い砲身
    const r = (p.w * CASEMATE_SPONSON_SHARE) / 2;
    ctx.strokeStyle = toneCss(base, T.dark, 0.7);
    ctx.lineWidth = 0.45;
    for (let j = 0; j < p.n; j++) {
      const y = p.cy - p.len / 2 + (p.len * (j + 0.5)) / p.n;
      ctx.fillStyle = toneCss(base, T.turretDark);
      ellipse(ctx, p.cx, y, r, r);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = toneCss(base, T.dark);
      ctx.fillRect(p.side > 0 ? p.cx : p.cx - p.w / 2, y - CASEMATE_BARREL_UNITS / 2, p.w / 2, CASEMATE_BARREL_UNITS);
    }
  } else if (p.t === 'deck') {
    // 飛行甲板: 平らな明るい矩形・横の板の継ぎ目・縦のレール（明るい縁つき）・前の端の回転台・暗い縁
    const [x0, y0] = [p.cx - p.w / 2, p.cy - p.len / 2];
    ctx.fillStyle = xGrad(ctx, base, x0, x0 + p.w, [[0, T.super2], [0.5, T.super1], [1, T.turretDark]]);
    rrect(ctx, x0, y0, p.w, p.len, 1.2);
    ctx.fill();
    ctx.fillStyle = toneCss(base, T.shadow, 0.3);
    for (let y = y0 + DECK_PLANK_UNITS; y < y0 + p.len - 1; y += DECK_PLANK_UNITS) ctx.fillRect(x0 + 0.8, y, p.w - 1.6, 0.45);
    for (let j = 1; j <= p.rails; j++) {
      const x = x0 + (p.w * j) / (p.rails + 1) - DECK_RAIL_UNITS / 2;
      ctx.fillStyle = toneCss(base, T.dark, 0.9);
      ctx.fillRect(x, y0 + 2, DECK_RAIL_UNITS, p.len - 4);
      ctx.fillStyle = toneCss(base, T.turretLight, 0.6);
      ctx.fillRect(x, y0 + 2, DECK_RAIL_UNITS * 0.4, p.len - 4);
    }
    const rt = p.w * DECK_TURNTABLE_SHARE;
    ctx.strokeStyle = toneCss(base, T.dark, 0.8);
    ctx.lineWidth = DECK_EDGE_UNITS;
    ellipse(ctx, p.cx, y0 + rt + 1, rt, rt);
    ctx.stroke();
    rrect(ctx, x0, y0, p.w, p.len, 1.2);
    ctx.stroke();
  } else return false;
  return true;
}
