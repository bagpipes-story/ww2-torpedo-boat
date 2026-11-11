// v0.7.0 S3b（アートと音①：コードで描く絵。spec-v0700 §5.2・§5.3・D2）: 演出の絵を Boot で 1 回だけ Canvas の 2D に描いてテクスチャにする（CLAUDE.md §7。毎フレームは描かない。
// 鍵が既にあれば描かない＝sea-art の paintCanvas）。色は付けず白で描き、表示側の tint で色を付ける（水柱 外れ 青白・命中 橙、砲口炎 各所の tint、閃光・火球は fx-art-config の tint）。
// - tex-splash・tex-muzzle-flash・tex-fireball: 爆発の輪と同じ寸法（art-dims の discTexSize(40, k, 8)＝96×96 at k 1.09）＝SplashPool と砲口炎 7 か所の今の scale 定数で同じ世界の大きさ。
//   水柱＝柔らかい不揃いな白い塊（置いた所が読める）＋外の薄い霧＋少しの水滴（S4。画素の式は assets/splash-shape。S3b の放射の筋は雪の結晶・ウニに見えた）、
//   砲口炎＝8 本の光芒（長い十字と短い斜め）と丸い芯、火球＝放射のグラデーション（ADD で重ねる）。
// - tex-oil-slick（S4）: 沈没の油の輪＝暗い不揃いな油膜＋縁の鈍い光＋中の泡（色を焼く・tint しない。splash-shape）。爆発の輪と同じ寸法。
// - tex-wake-puff（IP1a）: 航跡の尾の泡＝横の断面が中央は薄く両側が白い帯（広がると両側が分かれて V の腕に見える）・縦は両端へ柔らかい。p1＝静音の小さな泡。画素の式は assets/wake-shape。
// - tex-flame（S3c）: 真上から見た炎（向きの陰影なし）＝白黄の芯・橙の舌 7 本（半径の 0.5 まで）・外へ薄い赤い光の暈。frame p0・p1 で舌の置き方が違う（替えて揺らぐ）。色つき・ADD。k に依らない 64 px。
// - tex-wake-boat・tex-wake-ship: 艇尾を頂点にした V（半角 19.5°。R7: 腕が主・中央の泡は短く薄い）。frame p0＝V、p1＝泡だけ（自艇の静音＝R1）。k に依らない固定の px（96×128）。
//   S4: 腕は 1 枚の細る台形を長さ方向のグラデーションで塗る（8 区切りの線の丸い端が重なって玉の列に見え、端で切れていた）・frame ごとに枠で切る（p1 の泡が p0 の端に漏れて離れた点に見えた）。
import type Phaser from 'phaser';
import { EXPLOSION_RING_RADIUS_UNITS, discTexSize } from './art-dims';
import { flameTongues } from './fire-shape';
import { muzzleRays } from './fx-shape';
import { paintCanvas } from './sea-art';
import { slickPixels, splashPixels } from './splash-shape';
import { wakePuffPixels } from './wake-shape';
import {
  ART_SEED_FX, FLAME_BODY_SHARE, FLAME_TEX_PX, MUZZLE_CORE_R, MUZZLE_RAY_HALF_W, WAKE_ARM_ALPHA, WAKE_ARM_HALF_ANGLE_DEG, WAKE_ARM_WIDTH_PX, WAKE_CENTER_ALPHA, WAKE_CENTER_LENGTH_SHARE,
  WAKE_CENTER_WIDTH_PX, WAKE_KIND_ART, WAKE_SHIP_ARM_WIDTH_PX, WAKE_SHIP_CENTER_WIDTH_PX, WAKE_TEX_H, WAKE_TEX_W,
} from '../config/fx-art-config';
import { RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { ART_SEED_WAKE, WAKE_PUFF_TEX_H, WAKE_PUFF_TEX_W } from '../config/wake-art-config';

function white(a: number): string {
  return `rgba(255,255,255,${a})`;
}

/** 放射のグラデーション（中心 → 半径 R の stops） */
function radial(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, stops: readonly (readonly [number, number])[]): void {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  for (const [t, a] of stops) g.addColorStop(t, white(a));
  ctx.fillStyle = g;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
}

/** 画素の式（splash-shape）で描いた 1 枚 */
function paintPixels(scene: Phaser.Scene, key: string, d: number, px: Uint8ClampedArray): void {
  paintCanvas(scene, key, d, d, (ctx) => {
    const img = ctx.createImageData(d, d);
    img.data.set(px);
    ctx.putImageData(img, 0, 0);
  });
}

/** 砲口炎: 芯の光（MUZZLE_CORE_R）＋8 本の光芒（細い三角。暖かい色は表示側の tint） */
function paintMuzzleFlash(scene: Phaser.Scene, d: number, R: number): void {
  paintCanvas(scene, TEXTURE_KEYS.muzzleFlash, d, d, (ctx) => {
    const c = d / 2;
    radial(ctx, c, c, R * MUZZLE_CORE_R * 1.6, [[0, 1], [0.5, 0.8], [1, 0]]);
    ctx.fillStyle = white(0.9);
    for (const r of muzzleRays()) {
      const L = r.len * R;
      const hw = MUZZLE_RAY_HALF_W * R;
      const ux = Math.cos(r.ang);
      const uy = Math.sin(r.ang);
      ctx.beginPath();
      ctx.moveTo(c - uy * hw, c + ux * hw);
      ctx.lineTo(c + ux * L, c + uy * L);
      ctx.lineTo(c + uy * hw, c - ux * hw);
      ctx.closePath();
      ctx.fill();
    }
  });
}

/** 火球: 明るい芯 → 橙 → 透明（色は tint）。膨らみは表示側の scale */
function paintFireball(scene: Phaser.Scene, d: number, R: number): void {
  paintCanvas(scene, TEXTURE_KEYS.fireball, d, d, (ctx) => radial(ctx, d / 2, d / 2, R, [[0, 1], [0.35, 0.9], [0.7, 0.4], [1, 0]]));
}

/** 腕 1 本（頂点から向き (ux, uy) へ長さ L）: 根元 → 端で幅 w[0] → w[1] に太る台形を、α a[0] → a[1] の長さ方向のグラデーションで 1 回塗る（継ぎ目・玉の列なし。端は α 0 で溶ける） */
function arm(ctx: CanvasRenderingContext2D, x0: number, y0: number, ux: number, uy: number, L: number, w: readonly [number, number], a: readonly [number, number]): void {
  const x1 = x0 + ux * L;
  const y1 = y0 + uy * L;
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, white(a[0]));
  g.addColorStop(0.55, white(a[0] + (a[1] - a[0]) * 0.45));
  g.addColorStop(1, white(a[1]));
  const h0 = Math.max(2, w[0]) / 2;
  const h1 = Math.max(2, w[1]) / 2;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x0 - uy * h0, y0 + ux * h0);
  ctx.lineTo(x1 - uy * h1, y1 + ux * h1);
  ctx.lineTo(x1 + uy * h1, y1 - ux * h1);
  ctx.lineTo(x0 + uy * h0, y0 - ux * h0);
  ctx.closePath();
  ctx.fill();
}

/** 航跡の 1 枚（frame v・b を縦に並べる）: 頂点は上端の中央。V の腕は下へ半角で開き、中央の泡は高さの WAKE_CENTER_LENGTH_SHARE / lenHulls まで */
function paintWake(scene: Phaser.Scene, key: string, ship: boolean): void {
  const W = WAKE_TEX_W;
  const H = WAKE_TEX_H;
  const armW = ship ? WAKE_SHIP_ARM_WIDTH_PX : WAKE_ARM_WIDTH_PX;
  const centerW = ship ? WAKE_SHIP_CENTER_WIDTH_PX : WAKE_CENTER_WIDTH_PX;
  const half = (WAKE_ARM_HALF_ANGLE_DEG * Math.PI) / 180;
  const L = (H - armW[1]) / Math.cos(half);
  const kind = ship ? WAKE_KIND_ART.ship : WAKE_KIND_ART.boat;
  const centerLen = H * Math.min(1, WAKE_CENTER_LENGTH_SHARE / kind.lenHulls);
  const draw = (ctx: CanvasRenderingContext2D, top: number, withArms: boolean): void => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top, W, H);
    ctx.clip(); // frame の外（隣の frame）へ漏らさない
    const x0 = W / 2;
    const y0 = top + armW[0];
    if (withArms) {
      arm(ctx, x0, y0, Math.sin(half), Math.cos(half), L, armW, WAKE_ARM_ALPHA);
      arm(ctx, x0, y0, -Math.sin(half), Math.cos(half), L, armW, WAKE_ARM_ALPHA);
      arm(ctx, x0, y0, 0, 1, centerLen, [centerW, centerW * 0.5], [WAKE_CENTER_ALPHA, 0]);
    } else {
      arm(ctx, x0, y0, 0, 1, centerLen * 0.6, [centerW, centerW * 0.4], [WAKE_CENTER_ALPHA, 0]);
    }
    radial(ctx, x0, y0, centerW * 0.9, [[0, 0.9], [1, 0]]);
    ctx.restore();
  };
  paintCanvas(scene, key, W, H, (ctx) => {
    draw(ctx, 0, true); // frame p0（WAKE_FRAME_V）
    draw(ctx, H, false); // frame p1（WAKE_FRAME_BUBBLE）
  }, 2);
}

/** 炎の 1 frame（top から 64 px）: 赤い外の光 → 橙の舌（中心から外へ細る三角に近い楕円）→ 白黄の芯 */
function paintFlameFrame(ctx: CanvasRenderingContext2D, top: number, frame: number): void {
  const S = FLAME_TEX_PX;
  const c = S / 2;
  const cy = top + c;
  const glow = ctx.createRadialGradient(c, cy, 0, c, cy, c - 1);
  glow.addColorStop(0, 'rgba(255,140,50,0.8)');
  glow.addColorStop(FLAME_BODY_SHARE, 'rgba(235,80,25,0.4)');
  glow.addColorStop(1, 'rgba(200,40,10,0)');
  const R = (c - 1) * FLAME_BODY_SHARE; // 炎の体（舌と芯）の半径
  ctx.fillStyle = glow;
  ctx.fillRect(0, top, S, S);
  for (const t of flameTongues(ART_SEED_FX, frame)) {
    ctx.save();
    ctx.translate(c, cy);
    ctx.rotate(t.ang);
    const L = t.len * R;
    const g = ctx.createLinearGradient(0, 0, L, 0);
    g.addColorStop(0, 'rgba(255,200,90,0.95)');
    g.addColorStop(0.6, 'rgba(255,130,40,0.7)');
    g.addColorStop(1, 'rgba(230,70,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -t.w * R);
    ctx.quadraticCurveTo(L * 0.55, -t.w * R * 0.9, L, 0);
    ctx.quadraticCurveTo(L * 0.55, t.w * R * 0.9, 0, t.w * R);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  const core = ctx.createRadialGradient(c, cy, 0, c, cy, R * 0.38);
  core.addColorStop(0, 'rgba(255,250,225,1)');
  core.addColorStop(0.5, 'rgba(255,220,120,0.9)');
  core.addColorStop(1, 'rgba(255,160,60,0)');
  ctx.fillStyle = core;
  ctx.fillRect(0, top, S, S);
}

/** Boot で 1 回: 水柱・砲口炎・火球・油の輪（S4）（爆発の輪と同じ寸法）・航跡 2 枚・航跡の尾の泡（IP1a。frame p0・p1）・炎（S3c） */
export function generateFxTextures(scene: Phaser.Scene): void {
  const k = RENDER_SCALE;
  const d = discTexSize(EXPLOSION_RING_RADIUS_UNITS, k, 8).w;
  const R = EXPLOSION_RING_RADIUS_UNITS * k;
  paintPixels(scene, TEXTURE_KEYS.splash, d, splashPixels(d, R, ART_SEED_FX));
  paintPixels(scene, TEXTURE_KEYS.oilSlick, d, slickPixels(d, R, ART_SEED_FX));
  paintMuzzleFlash(scene, d, R);
  paintFireball(scene, d, R);
  paintWake(scene, TEXTURE_KEYS.wakeBoat, false);
  paintWake(scene, TEXTURE_KEYS.wakeShip, true);
  paintCanvas(scene, TEXTURE_KEYS.wakePuff, WAKE_PUFF_TEX_W, WAKE_PUFF_TEX_H, (ctx) => {
    const img = ctx.createImageData(WAKE_PUFF_TEX_W, WAKE_PUFF_TEX_H * 2);
    img.data.set(wakePuffPixels(WAKE_PUFF_TEX_W, WAKE_PUFF_TEX_H, ART_SEED_WAKE));
    ctx.putImageData(img, 0, 0);
  }, 2);
  paintCanvas(scene, TEXTURE_KEYS.flame, FLAME_TEX_PX, FLAME_TEX_PX, (ctx) => {
    paintFlameFrame(ctx, 0, 0);
    paintFlameFrame(ctx, FLAME_TEX_PX, 1);
  }, 2);
}
