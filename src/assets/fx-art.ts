// v0.7.0 S3b（アートと音①：コードで描く絵。spec-v0700 §5.2・§5.3・D2）: 演出の絵を Boot で 1 回だけ Canvas の 2D に描いてテクスチャにする（CLAUDE.md §7。毎フレームは描かない。
// 鍵が既にあれば描かない＝sea-art の paintCanvas）。色は付けず白で描き、表示側の tint で色を付ける（水柱 外れ 青白・命中 橙、砲口炎 各所の tint、閃光・火球は fx-art-config の tint）。
// - tex-splash・tex-muzzle-flash・tex-fireball: 爆発の輪と同じ寸法（art-dims の discTexSize(40, k, 8)＝96×96 at k 1.09）＝SplashPool と砲口炎 7 か所の今の scale 定数で同じ世界の大きさ。
//   水柱＝明るい芯（置いた所が読める）＋放射の飛沫の筋＋薄い外の輪、砲口炎＝8 本の光芒（長い十字と短い斜め）と丸い芯、火球＝放射のグラデーション（ADD で重ねる）。
// - tex-wake-boat・tex-wake-ship: 艇尾を頂点にした V（半角 19.5°。R7: 腕が主・中央の泡は短く薄い）。frame p0＝V、p1＝泡だけ（自艇の静音＝R1）。k に依らない固定の px（96×128）。
import type Phaser from 'phaser';
import { EXPLOSION_RING_RADIUS_UNITS, discTexSize } from './art-dims';
import { muzzleRays, splashDroplets } from './fx-shape';
import { paintCanvas } from './sea-art';
import {
  ART_SEED_FX, MUZZLE_CORE_R, MUZZLE_RAY_HALF_W, SPLASH_CORE_R, SPLASH_RING_R, WAKE_ARM_ALPHA, WAKE_ARM_HALF_ANGLE_DEG, WAKE_ARM_WIDTH_PX, WAKE_CENTER_ALPHA, WAKE_CENTER_LENGTH_SHARE,
  WAKE_CENTER_WIDTH_PX, WAKE_KIND_ART, WAKE_SHIP_ARM_WIDTH_PX, WAKE_SHIP_CENTER_WIDTH_PX, WAKE_TEX_H, WAKE_TEX_W,
} from '../config/fx-art-config';
import { RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';

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

/** 水柱: 芯（α 0.95 → SPLASH_CORE_R で 0.55 → 0）＋放射の飛沫の筋（芯から SPLASH_RING_R へ。玉の列にすると小さい scale で歯車に見えた）＋薄い外の輪（置いた所の広がりが読める） */
function paintSplash(scene: Phaser.Scene, d: number, R: number): void {
  paintCanvas(scene, TEXTURE_KEYS.splash, d, d, (ctx) => {
    const c = d / 2;
    radial(ctx, c, c, R, [[0, 0.95], [SPLASH_CORE_R * 0.6, 0.75], [SPLASH_CORE_R, 0.4], [SPLASH_CORE_R + 0.25, 0.1], [1, 0]]);
    ctx.lineCap = 'round';
    for (const p of splashDroplets(ART_SEED_FX)) {
      const len = Math.hypot(p.x, p.y);
      const ux = p.x / len;
      const uy = p.y / len;
      ctx.lineWidth = Math.max(2, p.r * R * 0.9);
      ctx.strokeStyle = white(0.8);
      ctx.beginPath();
      ctx.moveTo(c + ux * R * SPLASH_CORE_R * 0.5, c + uy * R * SPLASH_CORE_R * 0.5);
      ctx.lineTo(c + ux * R * len, c + uy * R * len);
      ctx.stroke();
    }
    ctx.lineWidth = Math.max(1.5, R * 0.05);
    ctx.strokeStyle = white(0.3);
    ctx.beginPath();
    ctx.arc(c, c, R * SPLASH_RING_R, 0, Math.PI * 2);
    ctx.stroke();
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

/** 腕 1 本（頂点から向き (ux, uy) へ長さ L。根元 → 端で幅と α を線形に。8 区切りの線＝細部は 2 px 以上） */
function arm(ctx: CanvasRenderingContext2D, x0: number, y0: number, ux: number, uy: number, L: number, w: readonly [number, number], a: readonly [number, number]): void {
  const N = 8;
  for (let i = 0; i < N; i++) {
    const t0 = i / N;
    const t1 = (i + 1) / N;
    const tm = (t0 + t1) / 2;
    ctx.lineWidth = Math.max(2, w[0] + (w[1] - w[0]) * tm);
    ctx.strokeStyle = white(a[0] + (a[1] - a[0]) * tm);
    ctx.beginPath();
    ctx.moveTo(x0 + ux * L * t0, y0 + uy * L * t0);
    ctx.lineTo(x0 + ux * L * t1, y0 + uy * L * t1);
    ctx.stroke();
  }
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
    ctx.lineCap = 'round';
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
  };
  paintCanvas(scene, key, W, H, (ctx) => {
    draw(ctx, 0, true); // frame p0（WAKE_FRAME_V）
    draw(ctx, H, false); // frame p1（WAKE_FRAME_BUBBLE）
  }, 2);
}

/** Boot で 1 回: 水柱・砲口炎・火球（爆発の輪と同じ寸法）・航跡 2 枚 */
export function generateFxTextures(scene: Phaser.Scene): void {
  const k = RENDER_SCALE;
  const d = discTexSize(EXPLOSION_RING_RADIUS_UNITS, k, 8).w;
  const R = EXPLOSION_RING_RADIUS_UNITS * k;
  paintSplash(scene, d, R);
  paintMuzzleFlash(scene, d, R);
  paintFireball(scene, d, R);
  paintWake(scene, TEXTURE_KEYS.wakeBoat, false);
  paintWake(scene, TEXTURE_KEYS.wakeShip, true);
}
