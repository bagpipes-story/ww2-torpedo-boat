// v0.7.0 IP3（実機 3 回目。U10「自機（魚雷艇）と大発も視覚的なクオリティを上げてください」）: 艇 5 種（Elco 80・Elco 77・T-38・T-14・H-38）と敵の米PT（Elco 80 の形）を
// Canvas の 2D に陰影つきで描く（Phaser に依らない。起動時に 1 回だけ＝assets/boat-art の paintHullCanvas。世界単位で描き、呼ぶ側が ctx を k·S 倍にしておく）。
// 置き方は boat-art-config の BOAT_ART_LAYOUTS（形の決まりは tests/boat-art）、描き方は boat-paint-config。色は地の色 1 つから明るさだけ（IP2 の駆逐艦と同じ toneCss）。
// 描く順: 喫水の暗い縁 → 舷の明るい帯（左が明るい）→ 甲板（横の陰影・板の筋）→ 高い物の陰（右舷・艇尾へずらす）→ ハッチ・換気筒・係船柱 → 発射管か魚雷 → 船室（風防・操舵の窪み・屋根の光）
//   → 銃座と砲身 → 艇尾の煙幕の発生機 → 艇首の舷の光。部品は甲板の輪郭で切る（船体の外へ漏らさない）。
import { BOAT_ART_CORNER_UNITS, type BoatArtLayout } from '../config/boat-art-config';
import {
  BOAT_BOW_FLARE_TO, BOAT_PLANK_UNITS, BOAT_PLANK_W_UNITS, BOAT_SHADOW_DX, BOAT_SHADOW_DY, BOAT_SHEER_UNITS, BOAT_TONES as T, BOAT_TUBE_MOUTH_UNITS, BOAT_TUBE_W_UNITS,
  BOAT_WATERLINE_UNITS, type BoatPaintDetail,
} from '../config/boat-paint-config';
import { paintBoatGun } from './boat-gun-paint';
import { hullOutline } from './boat-shape';
import { ellipse, path, rrect, toneCss, xGrad, type C } from './destroyer-pen';

/** 高い物の陰（甲板に落ちる。右舷・艇尾へ） */
function shadows(ctx: C, base: number, layout: BoatArtLayout, L: number, B: number): void {
  const cx = B / 2;
  ctx.fillStyle = toneCss(base, T.shadow, T.shadowAlpha);
  const dx = BOAT_SHADOW_DX;
  const dy = BOAT_SHADOW_DY;
  if (layout.cabin) {
    const [f0, f1, wf] = layout.cabin;
    rrect(ctx, cx - (wf * B) / 2 + dx * 1.5, f0 * L + dy * 1.5, wf * B, (f1 - f0) * L, 1.2);
    ctx.fill();
  }
  for (const [f0, f1, xf] of layout.tubes) {
    for (const s of [1, -1]) {
      rrect(ctx, cx + s * xf * B - BOAT_TUBE_W_UNITS / 2 + dx, f0 * L + dy, BOAT_TUBE_W_UNITS, (f1 - f0) * L, 1);
      ctx.fill();
    }
  }
  for (let i = 0; i < layout.guns.length; i++) {
    const [f, xf, r] = layout.guns[i]!;
    ellipse(ctx, cx + xf * B + dx, f * L + dy, r, r);
    ctx.fill();
  }
}

/** 甲板の小物: ハッチ（明るい縁と暗い継ぎ目）・換気筒（暗い口）・係船柱（両舷の小さな暗い台） */
function deckFittings(ctx: C, base: number, layout: BoatArtLayout, d: BoatPaintDetail, L: number, B: number): void {
  const cx = B / 2;
  for (const [f, w, h] of d.hatches) {
    const x = cx - w / 2;
    const y = f * L - h / 2;
    ctx.fillStyle = toneCss(base, T.shadow, 0.3);
    rrect(ctx, x + 0.35, y + 0.45, w, h, 0.4);
    ctx.fill();
    ctx.fillStyle = xGrad(ctx, base, x, x + w, [[0, T.cabinLeft], [1, T.cabinRight]]);
    rrect(ctx, x, y, w, h, 0.4);
    ctx.fill();
    ctx.strokeStyle = toneCss(base, T.edge, 0.7);
    ctx.lineWidth = 0.22;
    ctx.stroke();
    ctx.fillStyle = toneCss(base, T.edge, 0.55);
    ctx.fillRect(x + 0.4, y + h / 2 - 0.1, w - 0.8, 0.2);
  }
  for (const [f, xf] of d.vents) {
    ctx.fillStyle = toneCss(base, T.tubRing);
    ellipse(ctx, cx + xf * B, f * L, 0.75, 0.75);
    ctx.fill();
    ctx.fillStyle = toneCss(base, T.tubeMouth);
    ellipse(ctx, cx + xf * B + 0.1, f * L + 0.12, 0.42, 0.42);
    ctx.fill();
  }
  ctx.fillStyle = toneCss(base, T.edge, 0.85);
  for (const f of d.cleats) {
    const half = Math.max(0.8, halfAt(layout, f, B) - BOAT_WATERLINE_UNITS - BOAT_SHEER_UNITS - 0.75);
    for (const s of [1, -1]) {
      rrect(ctx, cx + s * half - 0.35, f * L - 0.55, 0.7, 1.1, 0.3);
      ctx.fill();
    }
  }
}

function halfAt(layout: BoatArtLayout, f: number, B: number): number {
  const h = layout.hull;
  for (let i = 1; i < h.length; i++) {
    const [y0, w0] = h[i - 1]!;
    const [y1, w1] = h[i]!;
    if (f <= y1) return ((w0 + ((w1 - w0) * (f - y0)) / (y1 - y0)) * B) / 2;
  }
  return (h[h.length - 1]![1] * B) / 2;
}

/** 発射管（米）: 筒の横の陰影・前の暗い口・2 本の架台の帯。魚雷（日本の艇）: 明るい胴・丸い頭・暗い架台の帯・尾の羽 */
function torpedoes(ctx: C, base: number, layout: BoatArtLayout, d: BoatPaintDetail, L: number, B: number): void {
  const cx = B / 2;
  for (const [f0, f1, xf] of layout.tubes) {
    for (const s of [1, -1]) {
      const y0 = f0 * L;
      const h = (f1 - f0) * L;
      const tw = d.torpedo === 'tube' ? BOAT_TUBE_W_UNITS : BOAT_TUBE_W_UNITS * 0.82;
      const x = cx + s * xf * B - tw / 2;
      if (d.torpedo === 'rack') {
        ctx.fillStyle = toneCss(base, T.edge, 0.9);
        for (const t of [0.2, 0.55, 0.85]) ctx.fillRect(x - 0.35, y0 + h * t - 0.3, tw + 0.7, 0.6);
      }
      ctx.fillStyle = xGrad(ctx, base, x, x + tw, [[0, T.tubeLeft], [0.4, (T.tubeLeft + 1) / 2], [1, T.tubeRight]]);
      rrect(ctx, x, y0, tw, h, d.torpedo === 'tube' ? 0.5 : tw / 2);
      ctx.fill();
      ctx.strokeStyle = toneCss(base, T.edge, 0.6);
      ctx.lineWidth = 0.2;
      ctx.stroke();
      if (d.torpedo === 'tube') {
        ctx.fillStyle = toneCss(base, T.tubeMouth);
        ellipse(ctx, x + tw / 2, y0 + BOAT_TUBE_MOUTH_UNITS * 0.7, tw * 0.34, BOAT_TUBE_MOUTH_UNITS * 0.45);
        ctx.fill();
        ctx.fillStyle = toneCss(base, T.edge, 0.7);
        for (const t of [0.3, 0.72]) ctx.fillRect(x - 0.15, y0 + h * t, tw + 0.3, 0.35);
        ctx.fillStyle = toneCss(base, T.roof, 0.6);
        ctx.fillRect(x + 0.3, y0 + 1.3, 0.35, h - 2.2);
      } else {
        ctx.fillStyle = toneCss(base, T.edge, 0.85);
        ctx.fillRect(x + tw / 2 - 0.15, y0 + h - 1.2, 0.3, 1.1);
        ctx.fillRect(x - 0.1, y0 + h - 0.5, tw + 0.2, 0.3);
      }
    }
  }
}

/** 船室: 横の陰影の箱・前の風防（暗いガラスと明るい枠）・屋根の光。米の艇は後ろ半分が操舵の窪み（舵輪の明るい点）、日本の艇は屋根の上の小さな天窓 */
function cabin(ctx: C, base: number, layout: BoatArtLayout, d: BoatPaintDetail, L: number, B: number): void {
  if (!layout.cabin) return;
  const [f0, f1, wf] = layout.cabin;
  const w = wf * B;
  const x = B / 2 - w / 2;
  const y = f0 * L;
  const h = (f1 - f0) * L;
  const r = BOAT_ART_CORNER_UNITS * 1.4;
  ctx.fillStyle = xGrad(ctx, base, x, x + w, [[0, T.cabinLeft], [0.5, (T.cabinLeft + T.cabinRight) / 2 + 0.05], [1, T.cabinRight]]);
  rrect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.strokeStyle = toneCss(base, T.edge, 0.75);
  ctx.lineWidth = 0.28;
  ctx.stroke();
  // 風防（前の縁の暗いガラスの帯と中の桟）
  ctx.fillStyle = toneCss(base, T.glass);
  rrect(ctx, x + 0.45, y + 0.4, w - 0.9, 1.15, 0.5);
  ctx.fill();
  ctx.fillStyle = toneCss(base, T.roof, 0.7);
  for (const t of [0.33, 0.67]) ctx.fillRect(x + w * t - 0.12, y + 0.4, 0.24, 1.15);
  const us = d.torpedo === 'tube';
  if (us) {
    // 操舵の窪み（後ろの 45%）と舵輪
    const wy = y + h * 0.55;
    ctx.fillStyle = toneCss(base, T.well);
    rrect(ctx, x + 0.6, wy, w - 1.2, h * 0.45 - 0.6, 0.6);
    ctx.fill();
    ctx.fillStyle = toneCss(base, T.shadow, 0.5);
    ctx.fillRect(x + 0.6, wy, w - 1.2, 0.5);
    ctx.fillStyle = toneCss(base, T.roof, 0.85);
    ellipse(ctx, x + w * 0.38, wy + 1.1, 0.55, 0.55);
    ctx.fill();
    ctx.fillStyle = toneCss(base, T.roof, 0.6);
    rrect(ctx, x + 0.9, y + 2, w * 0.4, h * 0.55 - 2.6, 0.5);
    ctx.fill();
  } else {
    ctx.fillStyle = toneCss(base, T.roof, 0.6);
    rrect(ctx, x + 0.6, y + 2, w * 0.42, h - 2.8, 0.5);
    ctx.fill();
    ctx.fillStyle = toneCss(base, T.well, 0.9);
    rrect(ctx, B / 2 - 0.7, y + h - 1.9, 1.4, 1.1, 0.3);
    ctx.fill();
  }
}

/** 艇尾の箱（煙幕の発生機）: 横たえた筒＝縦の陰影と暗い両端 */
function sternBoxes(ctx: C, base: number, layout: BoatArtLayout, L: number, B: number): void {
  for (const [f0, f1, wf, xf] of layout.sternBoxes) {
    const w = wf * B;
    const x = B / 2 + xf * B - w / 2;
    const y = f0 * L;
    const h = (f1 - f0) * L;
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, toneCss(base, T.tubeLeft));
    g.addColorStop(1, toneCss(base, T.tubeRight));
    ctx.fillStyle = g;
    rrect(ctx, x, y, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = toneCss(base, T.edge, 0.85);
    ctx.fillRect(x, y, 0.4, h);
    ctx.fillRect(x + w - 0.4, y, 0.4, h);
  }
}

/** 艇を 1 枚（ctx は世界単位＝呼ぶ側が k·S 倍）。base は陣営のパレットの地の色（自艇 PALETTE_PLAYER.deck・米PT PALETTE_ENEMY.deck） */
export function paintSmallBoat(ctx: C, layout: BoatArtLayout, d: BoatPaintDetail, L: number, B: number, base: number): void {
  path(ctx, hullOutline(layout.hull, L, B));
  ctx.fillStyle = toneCss(base, T.waterline);
  ctx.fill();
  path(ctx, hullOutline(layout.hull, L, B, BOAT_WATERLINE_UNITS));
  ctx.fillStyle = xGrad(ctx, base, 0, B, [[0, T.sheerLeft], [0.5, 1.08], [1, T.sheerRight]]);
  ctx.fill();
  const deck = hullOutline(layout.hull, L, B, BOAT_WATERLINE_UNITS + BOAT_SHEER_UNITS);
  path(ctx, deck);
  ctx.fillStyle = xGrad(ctx, base, 0, B, [[0, T.deckLeft], [0.45, T.deckMid], [1, T.deckRight]]);
  ctx.fill();
  ctx.save();
  path(ctx, deck);
  ctx.clip();
  ctx.fillStyle = toneCss(base, T.plank, T.plankAlpha);
  for (let off = BOAT_PLANK_UNITS / 2; off < B / 2; off += BOAT_PLANK_UNITS) {
    for (const s of [1, -1]) ctx.fillRect(B / 2 + s * off - BOAT_PLANK_W_UNITS / 2, 0, BOAT_PLANK_W_UNITS, L);
  }
  ctx.fillStyle = toneCss(base, T.edge, 0.45);
  ctx.fillRect(0, L - BOAT_WATERLINE_UNITS - BOAT_SHEER_UNITS - 0.35, B, 0.35); // 艇尾の縁
  shadows(ctx, base, layout, L, B);
  deckFittings(ctx, base, layout, d, L, B);
  torpedoes(ctx, base, layout, d, L, B);
  cabin(ctx, base, layout, d, L, B);
  for (let i = 0; i < layout.guns.length; i++) {
    const [f, xf, r] = layout.guns[i]!;
    paintBoatGun(ctx, base, d.guns[i] ?? 'mg13', B / 2 + xf * B, f * L, r, xf, f);
  }
  sternBoxes(ctx, base, layout, L, B);
  ctx.restore();
  // 艇首の舷の光
  const flare = hullOutline(layout.hull, L, B, BOAT_WATERLINE_UNITS * 0.5);
  const tip = flare[0]!;
  ctx.strokeStyle = toneCss(base, T.bowFlare, 0.85);
  ctx.lineWidth = 0.4;
  for (const s of [1, -1]) {
    const side = flare.filter((q) => (q.x - B / 2) * s > 0 && q.y <= BOAT_BOW_FLARE_TO * L).sort((a, b) => a.y - b.y);
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    for (const q of side) ctx.lineTo(q.x, q.y);
    ctx.stroke();
  }
}
