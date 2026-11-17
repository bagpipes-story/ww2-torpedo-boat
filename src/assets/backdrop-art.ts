// 岸の陰の絵（v0.8.1 IP1。us_06。実機 1 回目のユーザー「暗い岸という視覚的表現がマップになく…」）: 2 つの絵。どちらも背に岸のある任務（setup.backdrop）だけ systems/backdrop-fx が作る。
// - 暗い陸（tex-backdrop-hills。512 m × 陸の側。初めて使う時に 1 回・ページの間残る）: 砂浜（今の岸の帯の浜を残す）の後ろの黒い密林の縁・
//   岸に沿う 3 本の尾根（星明かりの縁と海の側の陰）・暗い樹冠・奥で透明へ（今の陸の色と陸の名の字はそのまま）。尾根と樹冠は 1 枚に整数の周期・端の写し＝継ぎ目なし。
// - 岸の陰の海（止まった艦ごと。core/backdrop-zone の升を 1 画素で塗る＝升の中心で本当の判定）: 一様な α・陰の外から 3 升の内は濃い縁・境の升は割合を掛ける。任務ごとに描き、世界の破棄で消す（removeBackdropZoneTexture）。
// 乱れは絵だけの SeededRng（BACKDROP_ART_SEED）。座標は m を px の倍で。毎フレームは何も描かない（systems/backdrop-fx は Image と Blitter の α と見える／見えないだけ）。
import type Phaser from 'phaser';
import {
  BACKDROP_ART_SEED, BACKDROP_HILLS_BASE_COLOR, BACKDROP_HILLS_BEACH_M, BACKDROP_HILLS_CROWNS, BACKDROP_HILLS_CROWN_COLORS, BACKDROP_HILLS_CROWN_R_M, BACKDROP_HILLS_FADE_M,
  BACKDROP_HILLS_LAND_M, BACKDROP_HILLS_LEN_M, BACKDROP_HILLS_PX_PER_M, BACKDROP_HILLS_RIDGES, BACKDROP_HILLS_RIDGE_COLOR, BACKDROP_HILLS_TEX_KEY, BACKDROP_ZONE_ALPHA, BACKDROP_ZONE_COLOR, BACKDROP_ZONE_EDGE_ALPHA, BACKDROP_ZONE_EDGE_CELLS, BACKDROP_ZONE_EDGE_SUB,
} from '../config/backdrop-art-config';
import type { BackdropZone } from '../core/backdrop-zone';
import { SeededRng } from '../core/rng';
import { paintCanvas } from './sea-art';

const rgba = (c: number, a: number): string => `rgba(${(c >> 16) & 0xff},${(c >> 8) & 0xff},${c & 0xff},${a})`;

/** 砂浜の後ろの密林の縁の、浜の側からの奥行き m（x は 1 枚の中の m。1 枚に整数の周期） */
function edgeAt(x: number): number {
  const P = BACKDROP_HILLS_LEN_M;
  return BACKDROP_HILLS_BEACH_M + 5 * Math.sin((2 * Math.PI * 3 * x) / P) + 3 * Math.sin((2 * Math.PI * 7 * x) / P + 1.3);
}

/** 尾根 k の奥行き m（砂浜の後ろから。1 枚に整数の周期） */
function ridgeAt(k: number, x: number): number {
  const P = BACKDROP_HILLS_LEN_M;
  return BACKDROP_HILLS_RIDGES[k]! + 14 * Math.sin((2 * Math.PI * (2 + k) * x) / P + k * 1.9) + 6 * Math.sin((2 * Math.PI * (5 + 2 * k) * x) / P + k);
}

/** 暗い陸の帯（初めて使う時に 1 回。鍵があれば描かない）。上端の行が波打ち際 */
export function ensureBackdropHillsTexture(scene: Phaser.Scene): void {
  const K = BACKDROP_HILLS_PX_PER_M;
  const P = BACKDROP_HILLS_LEN_M;
  const H = BACKDROP_HILLS_LAND_M;
  paintCanvas(scene, BACKDROP_HILLS_TEX_KEY, P * K, H * K, (ctx) => {
    ctx.scale(K, K);
    // 黒い密林の地（砂浜の後ろの縁から奥へ。奥の FADE m で透明へ）
    const land = ctx.createLinearGradient(0, 0, 0, H);
    const f0 = 1 - BACKDROP_HILLS_FADE_M / BACKDROP_HILLS_LAND_M;
    land.addColorStop(0, rgba(BACKDROP_HILLS_BASE_COLOR, 1));
    land.addColorStop(f0, rgba(BACKDROP_HILLS_BASE_COLOR, 1));
    land.addColorStop(1, rgba(BACKDROP_HILLS_BASE_COLOR, 0));
    ctx.fillStyle = land;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= P; x += 2) ctx.lineTo(x, edgeAt(x));
    ctx.lineTo(P, H);
    ctx.closePath();
    ctx.fill();
    // 樹冠（暗い丸の重なり。奥へ薄く。端の写しで継ぎ目なし）
    const rng = new SeededRng(BACKDROP_ART_SEED);
    for (let i = 0; i < BACKDROP_HILLS_CROWNS; i++) {
      const x = rng.next() * P;
      const d = edgeAt(x) + 4 + rng.next() * (BACKDROP_HILLS_LAND_M - BACKDROP_HILLS_FADE_M - 10);
      const r = BACKDROP_HILLS_CROWN_R_M[0] + rng.next() * (BACKDROP_HILLS_CROWN_R_M[1] - BACKDROP_HILLS_CROWN_R_M[0]);
      const col = BACKDROP_HILLS_CROWN_COLORS[Math.floor(rng.next() * BACKDROP_HILLS_CROWN_COLORS.length)]!;
      const a = Math.max(0, Math.min(1, 1.15 - d / (BACKDROP_HILLS_LAND_M - BACKDROP_HILLS_FADE_M)));
      for (const dx of x < r ? [0, P] : x > P - r ? [0, -P] : [0]) {
        const g = ctx.createRadialGradient(x + dx, d, 0, x + dx, d, r);
        g.addColorStop(0, rgba(col, a));
        g.addColorStop(0.8, rgba(col, a * 0.8));
        g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g;
        ctx.fillRect(x + dx - r, d - r, r * 2, r * 2);
      }
    }
    // 尾根: 海の側に陰の帯（丘の斜面）、尾根の上に星明かりの細い縁（奥の尾根ほど薄く）
    ctx.lineCap = 'round';
    for (let k = 0; k < BACKDROP_HILLS_RIDGES.length; k++) {
      const a = 1 - k * 0.22;
      ctx.lineWidth = 14;
      ctx.strokeStyle = rgba(0x000000, 0.35 * a);
      ctx.beginPath();
      for (let x = 0; x <= P; x += 2) ctx.lineTo(x, ridgeAt(k, x) + 9);
      ctx.stroke();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = rgba(BACKDROP_HILLS_RIDGE_COLOR, 0.85 * a);
      ctx.beginPath();
      for (let x = 0; x <= P; x += 2) ctx.lineTo(x, ridgeAt(k, x));
      ctx.stroke();
    }
  });
}

/** 升 (r, c) の中の SUB × SUB 点のうち岸の陰の割合（境の升の縁を滑らかに。inside は本当の判定＝landBehind） */
function coverage(z: BackdropZone, r: number, c: number, inside: (x: number, y: number) => boolean): number {
  const n = BACKDROP_ZONE_EDGE_SUB;
  let k = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (inside(z.x0 + (c + (j + 0.5) / n) * z.stepM, z.y0 + (r + (i + 0.5) / n) * z.stepM)) k++;
  return k / (n * n);
}

/**
 * 艦の岸の陰の海を 1 枚に塗る（任務の開始に 1 回。升 1 つが 1 画素。inside は本当の判定）。升が無ければ作らない（false）。
 * α は一様で、陰の外の升からの距離（升の数。2 回の chamfer）が BACKDROP_ZONE_EDGE_CELLS の内なら縁の α へ寄せ、境の升は割合を掛ける。
 * 格子の外（海域の端・岸の線の向こう）は縁にしない
 */
export function paintBackdropZoneTexture(scene: Phaser.Scene, key: string, z: BackdropZone, inside: (x: number, y: number) => boolean): boolean {
  if (z.count === 0) return false;
  const { cols, rows, cells } = z;
  const dist = new Float32Array(rows * cols);
  for (let i = 0; i < dist.length; i++) dist[i] = cells[i] === 1 ? Infinity : 0;
  const at = (r: number, c: number): number => (r < 0 || c < 0 || r >= rows || c >= cols ? Infinity : dist[r * cols + c]!);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const o = r * cols + c;
    dist[o] = Math.min(dist[o]!, at(r, c - 1) + 1, at(r - 1, c) + 1, at(r - 1, c - 1) + Math.SQRT2, at(r - 1, c + 1) + Math.SQRT2);
  }
  for (let r = rows - 1; r >= 0; r--) for (let c = cols - 1; c >= 0; c--) {
    const o = r * cols + c;
    dist[o] = Math.min(dist[o]!, at(r, c + 1) + 1, at(r + 1, c) + 1, at(r + 1, c + 1) + Math.SQRT2, at(r + 1, c - 1) + Math.SQRT2);
  }
  const cr = (BACKDROP_ZONE_COLOR >> 16) & 0xff;
  const cg = (BACKDROP_ZONE_COLOR >> 8) & 0xff;
  const cb = BACKDROP_ZONE_COLOR & 0xff;
  const differs = (r: number, c: number, v: number): boolean => r >= 0 && c >= 0 && r < rows && c < cols && cells[r * cols + c] !== v;
  paintCanvas(scene, key, cols, rows, (ctx) => {
    const img = ctx.createImageData(cols, rows);
    const d = img.data;
    const base = BACKDROP_ZONE_ALPHA;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const o = r * cols + c;
        const v = cells[o]!;
        let edge = false;
        for (let i = -1; i <= 1 && !edge; i++) for (let j = -1; j <= 1 && !edge; j++) edge = differs(r + i, c + j, v);
        if (v !== 1 && !edge) continue;
        const near = v === 1 ? Math.max(0, 1 - (dist[o]! - 1) / BACKDROP_ZONE_EDGE_CELLS) : 1;
        const a = (base + (Math.max(base, BACKDROP_ZONE_EDGE_ALPHA) - base) * near) * (edge ? coverage(z, r, c, inside) : 1);
        if (a <= 0) continue;
        d[o * 4] = cr;
        d[o * 4 + 1] = cg;
        d[o * 4 + 2] = cb;
        d[o * 4 + 3] = Math.round(255 * a);
      }
    }
    ctx.putImageData(img, 0, 0);
  });
  return true;
}

/** 世界の破棄で岸の陰の海の絵を消す（艦の位置は夜ごとに揺れる＝次の夜は描き直す） */
export function removeBackdropZoneTexture(scene: Phaser.Scene, key: string): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
}
