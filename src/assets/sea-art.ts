// v0.7.0 S3a（アートと音①：コードで描く絵。spec-v0700 §5.1・§5.6）: 海の面の絵を Boot で 1 回だけ Canvas の 2D に描いてテクスチャにする（CLAUDE.md §7。毎フレームは描かない）。
// - tex-sea-tile 512 × 512 px（0.5 px/m ＝ 1,024 m 周期。2 の累乗＝WebGL の TileSprite が REPEAT で貼る）: 白い波頭の弧・白波・うねり。置き方は assets/sea-shape（絵だけの乱数 ART_SEED_SEA）。
//   周期の縁をまたぐ弧は反対側にも描く（継ぎ目なし）。色は付けない（systems/sea-fx が光ごとに TileSprite の tint × α で付ける）。
// - tex-dawn-glow 256 × 64 px: 右（東）の橙から左の透明への横のグラデーション（画面へ拡大。α は sea-fx が段ごとに）。
// - tex-glint 16 × 8 px: 横に細長い柔らかい筋（月のきらめき・昼の白波。R9）。
import type Phaser from 'phaser';
import { TEXTURE_KEYS } from '../config/game-config';
import { ART_SEED_SEA, DAWN_GLOW_COLOR, DAWN_GLOW_TEX_H, DAWN_GLOW_TEX_W, GLINT_TEX_H, GLINT_TEX_W, SEA_LAYER_MODE } from '../config/sea-art-config';
import { SEA_TILE_TEX_PX, seaPatchPlan, seaTilePlan, wrapOffsets, type SeaStroke } from './sea-shape';

/** Canvas のテクスチャを 1 枚作って draw で描き、GPU へ上げる（鍵が既にあれば何もしない＝「もう一度」でも描かない）。frames があれば同じ鍵に縦に並んだ frame を足す */
function paintCanvas(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, frames = 0): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h * (frames > 0 ? frames : 1));
  if (!tex) return;
  draw(tex.context);
  for (let f = 0; f < frames; f++) tex.add(`p${f}`, 0, 0, f * h, w, h);
  tex.refresh();
}

/** 波頭の群れ（patches 方式）: 1 つの canvas に frame p0〜 を縦に並べる（鍵は tex-sea-tile のまま＝D2） */
function paintSeaPatches(scene: Phaser.Scene): void {
  const plan = seaPatchPlan(ART_SEED_SEA);
  paintCanvas(scene, TEXTURE_KEYS.seaTile, plan.w, plan.h, (ctx) => {
    ctx.lineCap = 'round';
    for (let f = 0; f < plan.frames.length; f++) {
      ctx.save();
      ctx.translate(0, f * plan.h);
      for (const c of plan.frames[f]!) stroke(ctx, c, Number.POSITIVE_INFINITY);
      ctx.restore();
    }
  }, plan.frames.length);
}

const NO_WRAP: readonly (readonly [number, number])[] = [[0, 0]];

function white(a: number): string {
  return `rgba(255,255,255,${a})`;
}

/** 弧 1 本（中心から ±len/2・たわみ sag × len の二次曲線。縁をまたげば写しも。size が Infinity なら写しなし） */
function stroke(ctx: CanvasRenderingContext2D, s: SeaStroke, size: number): void {
  const hx = Math.cos(s.ang) * s.len * 0.5;
  const hy = Math.sin(s.ang) * s.len * 0.5;
  const nx = -Math.sin(s.ang) * s.sag * s.len;
  const ny = Math.cos(s.ang) * s.sag * s.len;
  ctx.lineWidth = s.w;
  ctx.strokeStyle = white(s.a);
  for (const [dx, dy] of Number.isFinite(size) ? wrapOffsets(s.x, s.y, s.len * 0.5 + s.w, size) : NO_WRAP) {
    ctx.beginPath();
    ctx.moveTo(s.x + dx - hx, s.y + dy - hy);
    ctx.quadraticCurveTo(s.x + dx + nx, s.y + dy + ny, s.x + dx + hx, s.y + dy + hy);
    ctx.stroke();
  }
}

/** 海の模様のタイル（白・透明。うねり → 弧の下塗りと芯 → 白波の順） */
function paintSeaTile(scene: Phaser.Scene): void {
  const plan = seaTilePlan(ART_SEED_SEA);
  paintCanvas(scene, TEXTURE_KEYS.seaTile, SEA_TILE_TEX_PX, SEA_TILE_TEX_PX, (ctx) => {
    ctx.lineCap = 'round';
    for (const sw of plan.swells) {
      for (const [dx, dy] of wrapOffsets(sw.x, sw.y, sw.r, plan.size)) {
        const g = ctx.createRadialGradient(sw.x + dx, sw.y + dy, 0, sw.x + dx, sw.y + dy, sw.r);
        g.addColorStop(0, white(sw.a));
        g.addColorStop(1, white(0));
        ctx.fillStyle = g;
        ctx.fillRect(sw.x + dx - sw.r, sw.y + dy - sw.r, sw.r * 2, sw.r * 2);
      }
    }
    for (const c of plan.crests) stroke(ctx, c, plan.size);
    for (const c of plan.caps) stroke(ctx, c, plan.size);
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

/** Boot で 1 回: 海の模様・夜明けの光・きらめき（鍵は TEXTURE_KEYS.seaTile・dawnGlow・glint） */
export function generateSeaTextures(scene: Phaser.Scene): void {
  if (SEA_LAYER_MODE === 'tile') paintSeaTile(scene);
  else paintSeaPatches(scene);
  paintDawnGlow(scene);
  paintGlint(scene);
}
