// v0.7.0 S3a（アートと音①：コードで描く絵。spec-v0700 §5.1・§5.6）: 海の面の絵を Boot で 1 回だけ Canvas の 2D に描いてテクスチャにする（CLAUDE.md §7。毎フレームは描かない）。
// - tex-sea-tile 512 × 512 px（0.5 px/m ＝ 1,024 m 周期。2 の累乗＝WebGL の TileSprite が REPEAT で貼る）: 海の面（IP1a。うねりの明暗の帯・波頭・泡＝周期の縁で合う正弦の和）。
//   画素の式は assets/sea-shape の seaTilePixels（絵だけの乱数 ART_SEED_SEA）を ImageData に書く。白と黒の α だけ（systems/sea-fx が光ごとに TileSprite の tint × α で色を付ける）。
// - tex-dawn-glow 256 × 64 px: 右（東）の橙から左の透明への横のグラデーション（画面へ拡大。α は sea-fx が段ごとに）。
// - tex-glint 16 × 8 px: 横に細長い柔らかい筋（月のきらめき・昼の白波。R9）。
// - tex-coast-strip 512 × 120 px の frame 2 枚（S3c。1.0 px/m。初めて使う時に 1 回＝ensureCoastStripTexture）: 上 8 m は海の寄せ波の白、波打ち際から砂浜と陸の際の樹冠、奥へ透明。
//   x は周期 512 で折り返す（帯の端は隣と同じ画素）。frame p1 は右端の 16 m を透明へ（jp_03 の陰・壕の絵をよけた端＝R16）。回らない絵だが南北で反転して貼るので向きの光は焼かない。
import type Phaser from 'phaser';
import { TEXTURE_KEYS } from '../config/game-config';
import {
  ART_SEED_COAST, ART_SEED_SEA, COAST_CROWN_COLORS, COAST_CROWN_LIGHT_COLOR, COAST_DRY_SAND_COLOR, COAST_EDGE_SHADE_COLOR, COAST_SAND_COLOR, COAST_STRIP_FADE_M, COAST_STRIP_LAND_M,
  COAST_STRIP_LEN_M, COAST_STRIP_SEA_M, COAST_SURF_ALPHA, COAST_SURF_PX, COAST_WET_SAND_COLOR, DAWN_GLOW_COLOR, DAWN_GLOW_TEX_H, DAWN_GLOW_TEX_W, GLINT_TEX_H, GLINT_TEX_W,
} from '../config/sea-art-config';
import { coastPlan } from './coast-shape';
import { SEA_TILE_TEX_PX, seaTilePixels } from './sea-shape';

/** Canvas のテクスチャを 1 枚作って draw で描き、GPU へ上げる（鍵が既にあれば何もしない＝「もう一度」でも描かない）。frames があれば同じ鍵に縦に並んだ frame を足す */
export function paintCanvas(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, frames = 0): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h * (frames > 0 ? frames : 1));
  if (!tex) return;
  draw(tex.context);
  for (let f = 0; f < frames; f++) tex.add(`p${f}`, 0, 0, f * h, w, h);
  tex.refresh();
}

function white(a: number): string {
  return `rgba(255,255,255,${a})`;
}

/** 海の面のタイル（白と黒の α。画素の式は sea-shape） */
function paintSeaTile(scene: Phaser.Scene): void {
  const S = SEA_TILE_TEX_PX;
  paintCanvas(scene, TEXTURE_KEYS.seaTile, S, S, (ctx) => {
    const img = ctx.createImageData(S, S);
    img.data.set(seaTilePixels(ART_SEED_SEA));
    ctx.putImageData(img, 0, 0);
  });
}

/** 夜明けの光（東＝右の橙。左端は透明。画面の右端の帯に貼る） */
function paintDawnGlow(scene: Phaser.Scene): void {
  const w = DAWN_GLOW_TEX_W;
  const h = DAWN_GLOW_TEX_H;
  const r = (DAWN_GLOW_COLOR >> 16) & 0xff;
  const g = (DAWN_GLOW_COLOR >> 8) & 0xff;
  const b = DAWN_GLOW_COLOR & 0xff;
  paintCanvas(scene, TEXTURE_KEYS.dawnGlow, w, h, (ctx) => {
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
    grad.addColorStop(0.5, `rgba(${r},${g},${b},0.35)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},1)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  });
}

/** きらめきの筋（横に細長い楕円の柔らかい光。芯は白） */
function paintGlint(scene: Phaser.Scene): void {
  const w = GLINT_TEX_W;
  const h = GLINT_TEX_H;
  paintCanvas(scene, TEXTURE_KEYS.glint, w, h, (ctx) => {
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(1, h / w);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, w / 2);
    grad.addColorStop(0, white(1));
    grad.addColorStop(0.35, white(0.8));
    grad.addColorStop(1, white(0));
    ctx.fillStyle = grad;
    ctx.fillRect(-w / 2, -w / 2, w, w);
    ctx.restore();
  });
}

/** Boot で 1 回: 海の面・夜明けの光・きらめき（鍵は TEXTURE_KEYS.seaTile・dawnGlow・glint） */
export function generateSeaTextures(scene: Phaser.Scene): void {
  paintSeaTile(scene);
  paintDawnGlow(scene);
  paintGlint(scene);
}

function rgba(c: number, a: number): string {
  return `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
}

/** 岸の帯の 1 行（top から高さ SEA + LAND）: 砂浜（濡れた暗い縁 → 砂 → 乾いた砂）→ 陸の際の陰 → 樹冠（奥へ薄く）→ 寄せ波の白（2 本）。樹冠と寄せ波は周期の写しも描く */
function paintCoastRow(ctx: CanvasRenderingContext2D, top: number): void {
  const P = COAST_STRIP_LEN_M;
  const H = COAST_STRIP_SEA_M + COAST_STRIP_LAND_M;
  const plan = coastPlan(ART_SEED_COAST);
  const wl = top + COAST_STRIP_SEA_M;
  const g = ctx.createLinearGradient(0, wl, 0, wl + 30);
  g.addColorStop(0, rgba(COAST_WET_SAND_COLOR, 1));
  g.addColorStop(0.18, rgba(COAST_SAND_COLOR, 1));
  g.addColorStop(1, rgba(COAST_DRY_SAND_COLOR, 1));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, wl);
  for (let x = 0; x <= P; x++) ctx.lineTo(x, wl + plan.sand[x]!);
  ctx.lineTo(P, wl);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = rgba(COAST_EDGE_SHADE_COLOR, 0.7);
  ctx.beginPath();
  for (let x = 0; x <= P; x++) ctx.lineTo(x, wl + plan.sand[x]! + 1.5);
  ctx.stroke();
  for (const c of plan.crowns) {
    const fade = Math.max(0, 1 - Math.max(0, c.y - (COAST_STRIP_SEA_M + 40)) / (H - COAST_STRIP_SEA_M - 40));
    if (fade <= 0) continue;
    const col = COAST_CROWN_COLORS[Math.min(COAST_CROWN_COLORS.length - 1, Math.floor(c.shade * COAST_CROWN_COLORS.length))]!;
    for (const dx of c.x < c.r ? [0, P] : c.x > P - c.r ? [0, -P] : [0]) {
      const cx = c.x + dx;
      const cy = top + c.y;
      const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, c.r);
      rg.addColorStop(0, rgba(COAST_CROWN_LIGHT_COLOR, fade));
      rg.addColorStop(0.55, rgba(col, fade));
      rg.addColorStop(0.9, rgba(col, fade * 0.9));
      rg.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = rg;
      ctx.fillRect(cx - c.r, cy - c.r, c.r * 2, c.r * 2);
    }
  }
  ctx.lineCap = 'round';
  for (const [off, a, w] of [[-1, COAST_SURF_ALPHA, COAST_SURF_PX], [-4.5, COAST_SURF_ALPHA * 0.4, 2]] as const) {
    ctx.lineWidth = w;
    ctx.strokeStyle = white(a);
    ctx.beginPath();
    for (let x = 0; x <= P; x += 2) ctx.lineTo(x, wl + off + plan.surf[x]! * (off < -2 ? 1.2 : 0.5));
    ctx.stroke();
  }
}

/** 岸の帯（初めて使う時に 1 回。jp_03 で陰の絵と同じく世界の作成の時。鍵が既にあれば描かない）: frame p0 そのまま・p1 右端の 16 m を透明へ */
export function ensureCoastStripTexture(scene: Phaser.Scene): void {
  const P = COAST_STRIP_LEN_M;
  const H = COAST_STRIP_SEA_M + COAST_STRIP_LAND_M;
  paintCanvas(scene, TEXTURE_KEYS.coastStrip, P, H, (ctx) => {
    for (const top of [0, H]) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, top, P, H);
      ctx.clip(); // 行の外（隣の行）へはみ出さない
      paintCoastRow(ctx, top);
      ctx.restore();
    }
    const fade = ctx.createLinearGradient(P - COAST_STRIP_FADE_M, 0, P, 0);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = fade;
    ctx.fillRect(P - COAST_STRIP_FADE_M, H, COAST_STRIP_FADE_M, H);
    ctx.globalCompositeOperation = 'source-over';
  }, 2);
}
