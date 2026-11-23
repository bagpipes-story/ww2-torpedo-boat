// v0.8.2 S2b（us_05。spec-v0820 §4.11 D-A1・D-A2、lead の L30）: 戦艦 扶桑型・重巡 最上の部品の描き方（Phaser に依らない。assets/destroyer-paint の paintDestroyer が部品ごとに先に呼ぶ）:
// 塔（段の重なりと、上の段ほど遠くへ落ちる影＝高さ）・舷側の砲郭の列（張り出しと外へ向く短い砲身）・後部の飛行甲板（平らな矩形・板の継ぎ目・レール・回転台・暗い縁）。
// v0.8.2 S2c（ユーザーの実機の感想「デフォルメされすぎている…もう少しディティールに」）: 塔は段の表（capital-layout-config の CAPITAL_TOWER_ROWS: 箱・八角・測距儀の腕・方位盤と、探照灯の台の両端の灯）、
// 主砲塔の細部と背負い式の影は capital-turret-paint、飛行甲板は艦尾へ細る台形にレール・横のレール・回転台。ほかの細部は capital-detail-paint。
// 色は地の色 1 つの明るさだけ（destroyer-pen の toneCss・xGrad＝単系統）。起動時に 1 回だけ（Boot の generateColumnTextures）。
import {
  CASEMATE_BARREL_UNITS, CASEMATE_SPONSON_SHARE, DECK_EDGE_UNITS, DECK_PLANK_UNITS, DECK_RAIL_UNITS, DECK_TURNTABLE_UNITS, 
  PAGODA_LIGHT_UNITS, PAGODA_SHADOW_ALPHA, PAGODA_SHADOW_PER_TIER_UNITS, PAGODA_SHADOW_STEP_UNITS, PAGODA_SHADOW_X_SHARE, PAGODA_STEP_SHADOW_ALPHA, PAGODA_STEP_SHADOW_UNITS, PAGODA_WINDOW_UNITS,
} from '../config/capital-art-config';
import { CAPITAL_TOWER_ROWS } from '../config/capital-layout-config';
import { DESTROYER_TONES as T } from '../config/destroyer-art-config';
import { paintCapitalDetail } from './capital-detail-paint';
import { paintMainTurret } from './capital-turret-paint';
import { pagodaTier } from './capital-plan';
import type { DestroyerPart } from './destroyer-plan';
import { ellipse, rrect, toneCss, xGrad, type C } from './destroyer-pen';

type Pagoda = Extract<DestroyerPart, { t: 'pagoda' }>;

/** 段の形の道（0 箱・1 八角・2 測距儀の腕・3 丸い方位盤） */
function tierPath(ctx: C, shape: number, x: number, y: number, w: number, h: number): void {
  if (shape === 3) ellipse(ctx, x + w / 2, y + h / 2, w / 2, h / 2);
  else if (shape === 2) rrect(ctx, x, y, w, h, h / 2);
  else if (shape === 1) {
    const c = Math.min(w, h) * 0.28;
    ctx.beginPath();
    ctx.moveTo(x + c, y);
    ctx.lineTo(x + w - c, y);
    ctx.lineTo(x + w, y + c);
    ctx.lineTo(x + w, y + h - c);
    ctx.lineTo(x + w - c, y + h);
    ctx.lineTo(x + c, y + h);
    ctx.lineTo(x, y + h - c);
    ctx.lineTo(x, y + c);
    ctx.closePath();
  } else rrect(ctx, x, y, w, h, 1.2);
}

/** 塔: 上の段ほど遠くへ落ちる長い影（艦尾・右舷の甲板へ）→ 段ごとに下の段へ落ちる短い影・上ほど明るい段・前の窓の帯・探照灯・測距儀・方位盤 */
function paintTower(ctx: C, base: number, p: Pagoda): void {
  const rows = CAPITAL_TOWER_ROWS[p.style];
  // 長い影: 段ごとの影の箱を、その段の足元（影 0）から高さの所まで少しずつずらして重ね、1 つの道で塗る（重なっても濃さは同じ＝つながった 1 つの影）
  ctx.fillStyle = toneCss(base, T.shadow, PAGODA_SHADOW_ALPHA);
  ctx.beginPath();
  for (let k = 0; k < p.tiers; k++) {
    const [x, y, w, h] = pagodaTier(p, k);
    const top = PAGODA_SHADOW_PER_TIER_UNITS * (k + 1);
    for (let s = 0; s <= top; s += PAGODA_SHADOW_STEP_UNITS) {
      const [sx, sy] = [x + s * PAGODA_SHADOW_X_SHARE, y + s];
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + w, sy);
      ctx.lineTo(sx + w, sy + h);
      ctx.lineTo(sx, sy + h);
      ctx.closePath();
    }
  }
  ctx.fill();
  for (let k = 0; k < p.tiers; k++) {
    const [x, y, w, h] = pagodaTier(p, k);
    const [, , , shape, lights] = rows[k]!;
    if (k > 0) {
      ctx.fillStyle = toneCss(base, T.shadow, PAGODA_STEP_SHADOW_ALPHA);
      tierPath(ctx, shape, x + PAGODA_STEP_SHADOW_UNITS * PAGODA_SHADOW_X_SHARE, y + PAGODA_STEP_SHADOW_UNITS, w, h);
      ctx.fill();
    }
    const v = T.super1 + ((T.boat - T.super1) * k) / Math.max(1, p.tiers - 1); // 上の段ほど明るい（高い）
    ctx.fillStyle = shape === 2 ? xGrad(ctx, base, x, x + w, [[0, T.funnel], [1, T.dark]]) : xGrad(ctx, base, x, x + w, [[0, v * 1.06], [0.55, v * 0.94], [1, v * 0.74]]);
    tierPath(ctx, shape, x, y, w, h);
    ctx.fill();
    ctx.strokeStyle = toneCss(base, T.dark, 0.75);
    ctx.lineWidth = 0.45;
    ctx.stroke();
    if (shape === 2) {
      // 測距儀の腕: 両端の明るい筒先
      ctx.fillStyle = toneCss(base, T.roof, 0.9);
      for (const ex of [x + h * 0.5, x + w - h * 0.5]) { ellipse(ctx, ex, y + h / 2, h * 0.42, h * 0.42); ctx.fill(); }
      continue;
    }
    if (shape === 3) {
      ctx.fillStyle = toneCss(base, T.dark, 0.85);
      ctx.fillRect(x + w * 0.2, y + h * 0.3, w * 0.6, Math.min(0.7, h * 0.2));
      continue;
    }
    if (h > PAGODA_WINDOW_UNITS * 3) {
      ctx.fillStyle = toneCss(base, T.window, 0.85);
      ctx.fillRect(x + 0.8, y + 0.45, w - 1.6, PAGODA_WINDOW_UNITS);
    }
    // 段の縁の手すり（明るい細い線）と探照灯の台の両端の灯
    ctx.fillStyle = toneCss(base, T.roof, 0.45);
    ctx.fillRect(x + 0.6, y + h - 0.7, w - 1.2, 0.3);
    if (lights) {
      for (const ex of [x + PAGODA_LIGHT_UNITS + 0.5, x + w - PAGODA_LIGHT_UNITS - 0.5]) {
        ctx.fillStyle = toneCss(base, T.boat);
        ellipse(ctx, ex, y + h / 2, PAGODA_LIGHT_UNITS, PAGODA_LIGHT_UNITS);
        ctx.fill();
        ctx.strokeStyle = toneCss(base, T.dark, 0.8);
        ctx.lineWidth = 0.5;
        ctx.stroke();
        ctx.fillStyle = toneCss(base, T.window, 0.7);
        ellipse(ctx, ex, y + h / 2 - PAGODA_LIGHT_UNITS * 0.35, PAGODA_LIGHT_UNITS * 0.55, PAGODA_LIGHT_UNITS * 0.3);
        ctx.fill();
      }
    }
  }
}

/** 飛行甲板（艦尾へ細る台形）: 板の継ぎ目・縦のレール・前の横のレールと回転台・暗い縁 */
function paintFlightDeck(ctx: C, base: number, p: Extract<DestroyerPart, { t: 'deck' }>): void {
  const [y0, y1] = [p.cy - p.len / 2, p.cy + p.len / 2];
  const half = (y: number): number => (p.w + ((p.wAft - p.w) * (y - y0)) / p.len) / 2;
  const outline = (): void => {
    ctx.beginPath();
    ctx.moveTo(p.cx - half(y0) + 1.2, y0);
    ctx.lineTo(p.cx + half(y0) - 1.2, y0);
    ctx.lineTo(p.cx + half(y0), y0 + 1.2);
    ctx.lineTo(p.cx + half(y1), y1 - 1.2);
    ctx.lineTo(p.cx + half(y1) - 1.2, y1);
    ctx.lineTo(p.cx - half(y1) + 1.2, y1);
    ctx.lineTo(p.cx - half(y1), y1 - 1.2);
    ctx.lineTo(p.cx - half(y0), y0 + 1.2);
    ctx.closePath();
  };
  ctx.fillStyle = xGrad(ctx, base, p.cx - p.w / 2, p.cx + p.w / 2, [[0, T.super1 * 0.98], [0.5, T.turretDark * 1.08], [1, T.turretDark * 0.86]]);
  outline();
  ctx.fill();
  ctx.fillStyle = toneCss(base, T.shadow, 0.3);
  for (let y = y0 + DECK_PLANK_UNITS; y < y1 - 1; y += DECK_PLANK_UNITS) ctx.fillRect(p.cx - half(y) + 0.8, y, half(y) * 2 - 1.6, 0.4);
  const gap = (p.wAft * 0.62) / Math.max(1, p.rails - 1);
  const xs = Array.from({ length: p.rails }, (_, j) => p.cx + (j - (p.rails - 1) / 2) * gap);
  const yr = y0 + DECK_TURNTABLE_UNITS + 1.5;
  for (const x of xs) {
    ctx.fillStyle = toneCss(base, T.dark, 0.9);
    ctx.fillRect(x - DECK_RAIL_UNITS / 2, yr, DECK_RAIL_UNITS, y1 - yr - 2);
    ctx.fillStyle = toneCss(base, T.turretLight, 0.55);
    ctx.fillRect(x - DECK_RAIL_UNITS / 2, yr, DECK_RAIL_UNITS * 0.4, y1 - yr - 2);
  }
  // 前の横のレール（両舷のカタパルトへ）と、縦のレールとの交わりの回転台
  ctx.fillStyle = toneCss(base, T.dark, 0.85);
  ctx.fillRect(p.cx - half(yr) + 1.5, yr - DECK_RAIL_UNITS / 2, half(yr) * 2 - 3, DECK_RAIL_UNITS);
  ctx.strokeStyle = toneCss(base, T.dark, 0.85);
  ctx.lineWidth = DECK_EDGE_UNITS;
  for (const x of xs) {
    ctx.fillStyle = toneCss(base, T.turretDark * 1.1);
    ellipse(ctx, x, yr, DECK_TURNTABLE_UNITS, DECK_TURNTABLE_UNITS);
    ctx.fill();
    ctx.stroke();
  }
  outline();
  ctx.stroke();
  ctx.fillStyle = toneCss(base, T.roof, 0.5); // 前の縁の光（一段高い甲板）
  ctx.fillRect(p.cx - half(y0) + 1.2, y0 + 0.2, half(y0) * 2 - 2.4, 0.5);
}

/** 戦艦・重巡の部品を描いたら true（ほかの型は描かずに false＝destroyer-part-paint の paintPart が描く） */
export function paintCapitalPart(ctx: C, base: number, p: DestroyerPart): boolean {
  if (p.t === 'pagoda') paintTower(ctx, base, p);
  else if (p.t === 'gun' && p.lift !== undefined) {
    paintMainTurret(ctx, base, p); // 主砲塔（戦艦・重巡だけ lift がある）
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
  } else if (p.t === 'deck') paintFlightDeck(ctx, base, p);
  else return paintCapitalDetail(ctx, base, p);
  return true;
}
