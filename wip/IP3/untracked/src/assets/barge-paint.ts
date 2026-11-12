// v0.7.0 IP3（実機 3 回目。U10「自機（魚雷艇）と大発も視覚的なクオリティを上げてください」）: 大発を Canvas の 2D に陰影つきで描く（Phaser に依らない。起動時に 1 回だけ＝
// assets/barge-art の paintHullCanvas。世界単位で描き、呼ぶ側が ctx を k·S 倍にしておく）。輪郭は v0.4.2 の placeholder のまま（ship-shape の bargeShape。平たい艇首の道板 0.76B が
// 見分けの鍵＝tests/ship-art）。荷台・艇尾の位置は ship-art-config の BARGE_*、描き方は boat-paint-config の BARGE_*。色は地の色 1 つから明るさだけ（敵＝薄い赤・味方＝薄い青）。
// 描く順: 喫水の暗い縁 → 舷の縁（左が明るい・板の筋・防舷の縄）→ 道板（桁と蝶番・前の縁の光）→ 荷台の窪み（暗い床・左の壁の陰）→ 荷（箱・兵の頭）→ 高い物の陰 → 機関の覆い
//   （格子と排気の口）→ 艇長の台（風防）→ 艇尾の縁。
import { BARGE_COX, BARGE_CRATES, BARGE_FENDERS, BARGE_GUNWALE_UNITS, BARGE_HOUSING, BARGE_RAMP_RIBS, BARGE_RAMP_TO, BARGE_TONES as T, BARGE_TROOP_R, BARGE_TROOP_ROWS } from '../config/boat-paint-config';
import { BARGE_RAMP_BEAM_SHARE, BARGE_RAMP_LEN_SHARE, BARGE_WELL_FROM, BARGE_WELL_INSET_UNITS, BARGE_WELL_TO } from '../config/ship-art-config';
import { ellipse, path, rrect, toneCss, xGrad, type C } from './destroyer-pen';
import { bargeShape } from './ship-shape';

/** 横の陰影の箱（左が明るい）と暗い縁 */
function box(ctx: C, base: number, x: number, y: number, w: number, h: number, r: number, left: number, right: number): void {
  ctx.fillStyle = xGrad(ctx, base, x, x + w, [[0, left], [1, right]]);
  rrect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.strokeStyle = toneCss(base, T.hinge, 0.7);
  ctx.lineWidth = 0.2;
  ctx.stroke();
}

/** 大発を 1 枚（ctx は世界単位）。base は陣営のパレットの地の色（敵 PALETTE_ENEMY.deck・味方 PALETTE_ALLY.deck） */
export function paintBarge(ctx: C, L: number, B: number, base: number): void {
  const cx = B / 2;
  const shape = bargeShape(L, B);
  const ry = BARGE_RAMP_LEN_SHARE * L;
  const rx0 = ((1 - BARGE_RAMP_BEAM_SHARE) / 2) * B;
  const g = BARGE_GUNWALE_UNITS;
  // 喫水の暗い縁と舷の縁（明るい側は左）
  path(ctx, shape.outline);
  ctx.fillStyle = toneCss(base, T.waterline);
  ctx.fill();
  ctx.fillStyle = xGrad(ctx, base, 0, B, [[0, T.gunwaleLeft], [0.5, 1.08], [1, T.gunwaleRight]]);
  ctx.fillRect(0.45, ry + 0.45, B - 0.9, L - ry - 0.9);
  ctx.fillRect(rx0 + 0.45, 0.45, B - rx0 * 2 - 0.9, ry);
  // 舷の板の筋（長さに沿う）
  ctx.fillStyle = toneCss(base, T.plank, T.plankAlpha);
  for (const x of [0.75, B - 0.95]) ctx.fillRect(x, ry + 0.6, 0.2, L - ry - 1.2);
  // 道板（艇首の平たい板）: 横の陰影・桁・後ろの蝶番・前の縁の光
  const rampY1 = BARGE_RAMP_TO * L;
  box(ctx, base, rx0 + 0.6, 0.6, B - rx0 * 2 - 1.2, rampY1 - 0.6, 0.5, T.rampLeft, T.rampRight);
  ctx.fillStyle = toneCss(base, T.rampRib, 0.8);
  for (let i = 1; i <= BARGE_RAMP_RIBS; i++) ctx.fillRect(rx0 + 1.1, 0.6 + ((rampY1 - 0.6) * i) / (BARGE_RAMP_RIBS + 1) - 0.15, B - rx0 * 2 - 2.2, 0.3);
  ctx.fillStyle = toneCss(base, T.hinge);
  ctx.fillRect(rx0 + 0.6, rampY1 - 0.5, B - rx0 * 2 - 1.2, 0.5);
  ctx.fillStyle = toneCss(base, T.roof, 0.8);
  ctx.fillRect(rx0 + 0.8, 0.65, B - rx0 * 2 - 1.6, 0.35);
  // 荷台の窪み（暗い床・左の壁の陰）
  const wx = BARGE_WELL_INSET_UNITS * 0.6;
  const wy0 = BARGE_WELL_FROM * L;
  const wy1 = BARGE_WELL_TO * L;
  const ww = B - wx * 2;
  ctx.fillStyle = toneCss(base, T.floor);
  rrect(ctx, wx, wy0, ww, wy1 - wy0, 0.4);
  ctx.fill();
  const sh = ctx.createLinearGradient(wx, 0, wx + 1.2, 0);
  sh.addColorStop(0, toneCss(base, T.floorShade, 0.9));
  sh.addColorStop(1, toneCss(base, T.floorShade, 0));
  ctx.fillStyle = sh;
  ctx.fillRect(wx, wy0, 1.2, wy1 - wy0);
  ctx.fillStyle = toneCss(base, T.floorShade, 0.7);
  ctx.fillRect(wx, wy0, ww, 0.6);
  // 荷: 箱（陰と横の陰影）・兵の頭（明るい点）
  for (const [f, xf, w, h] of BARGE_CRATES) {
    const x = cx + xf * B - w / 2;
    const y = f * L - h / 2;
    ctx.fillStyle = toneCss(base, T.shadow, T.shadowAlpha);
    ctx.fillRect(x + 0.35, y + 0.45, w, h);
    box(ctx, base, x, y, w, h, 0.2, T.crateLeft, T.crateRight);
    ctx.fillStyle = toneCss(base, T.hinge, 0.5);
    ctx.fillRect(x + w / 2 - 0.1, y, 0.2, h);
  }
  for (let row = 0; row < BARGE_TROOP_ROWS.length; row++) {
    const [f, n] = BARGE_TROOP_ROWS[row]!;
    for (let i = 0; i < n; i++) {
      const x = wx + ((i + 0.5) * ww) / n + ((row % 2) - 0.5) * 0.7; // 列ごとに互い違い（格子に見せない）
      ctx.fillStyle = toneCss(base, T.shadow, 0.45);
      ellipse(ctx, x + 0.25, f * L + 0.3, BARGE_TROOP_R, BARGE_TROOP_R);
      ctx.fill();
      ctx.fillStyle = toneCss(base, T.troop);
      ellipse(ctx, x, f * L, BARGE_TROOP_R, BARGE_TROOP_R);
      ctx.fill();
    }
  }
  // 防舷の縄（両舷の縁の小さな楕円）
  for (const f of BARGE_FENDERS) {
    for (const x of [0.5, B - 0.5]) {
      ctx.fillStyle = toneCss(base, T.fender);
      ellipse(ctx, x, f * L, 0.42, 0.85);
      ctx.fill();
      ctx.fillStyle = toneCss(base, T.fenderLight, 0.7);
      ellipse(ctx, x - 0.12, f * L - 0.25, 0.18, 0.35);
      ctx.fill();
    }
  }
  // 機関の覆い（陰・横の陰影・格子・排気の口）と艇長の台（風防）
  const [h0, h1, hwf] = BARGE_HOUSING;
  const hw = hwf * B;
  const [c0, c1, cwf] = BARGE_COX;
  const cw = cwf * B;
  ctx.fillStyle = toneCss(base, T.shadow, T.shadowAlpha);
  rrect(ctx, cx - hw / 2 + 0.5, h0 * L + 0.7, hw, (h1 - h0) * L, 0.6);
  ctx.fill();
  rrect(ctx, cx - cw / 2 + 0.6, c0 * L + 0.8, cw, (c1 - c0) * L, 0.5);
  ctx.fill();
  box(ctx, base, cx - hw / 2, h0 * L, hw, (h1 - h0) * L, 0.6, T.housingLeft, T.housingRight);
  ctx.fillStyle = toneCss(base, T.grille, 0.75);
  for (let i = 0; i < 4; i++) ctx.fillRect(cx - hw / 2 + 0.6, h0 * L + 0.9 + i * 0.85, hw - 1.2, 0.3);
  ctx.fillStyle = toneCss(base, T.roof, 0.55);
  ctx.fillRect(cx - hw / 2 + 0.4, h0 * L + 0.3, hw * 0.38, (h1 - h0) * L - 0.6);
  ctx.fillStyle = toneCss(base, T.glass);
  ellipse(ctx, cx + hw * 0.22, h1 * L - 0.9, 0.5, 0.5);
  ctx.fill();
  box(ctx, base, cx - cw / 2, c0 * L, cw, (c1 - c0) * L, 0.5, T.housingLeft, T.housingRight);
  ctx.fillStyle = toneCss(base, T.glass);
  rrect(ctx, cx - cw / 2 + 0.3, c0 * L + 0.25, cw - 0.6, 0.75, 0.3);
  ctx.fill();
  // 艇尾の縁
  ctx.fillStyle = toneCss(base, T.hinge, 0.6);
  ctx.fillRect(0.45, L - 0.85, B - 0.9, 0.4);
}
