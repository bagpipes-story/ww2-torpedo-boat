// トロフィーの絵（v0.9.0 IP3。頑張った証）: 金の杯（椀・取っ手 2 つ・脚・台）をコードで描いて 1 回だけ generateTexture する（画像のファイルは使わない。CLAUDE.md §2「アート」）。
// 作るのは初めて使う時（Briefing・Title がトロフィーを出す時）の 1 回だけ＝トロフィーの無い端末では作らない（Boot の絵の並びは今のまま）。描く密度は RENDER_SCALE（兵装のボタンと同じ作法）。
// 色と大きさは config/trophy-config。
import type Phaser from 'phaser';
import { RENDER_SCALE } from '../config/game-config';
import { TROPHY_GOLD, TROPHY_GOLD_DARK, TROPHY_GOLD_LIGHT, TROPHY_OUTLINE, TROPHY_TEX_PX, TROPHY_TEXTURE_KEY } from '../config/trophy-config';

/** 48 × 48 の格子での形（描く時に 1 格 = TROPHY_TEX_PX / 48 × RENDER_SCALE px） */
const GRID = 48;
const BOWL: readonly (readonly [number, number])[] = [[10, 5], [38, 5], [37, 13], [34, 21], [29, 27], [19, 27], [14, 21], [11, 13]];
const SHINE: readonly (readonly [number, number])[] = [[14, 8], [19, 8], [19, 22], [16, 19]];

/** トロフィーの絵の鍵（無ければ描く。同じページの 2 回目からは描かない） */
export function ensureTrophyTexture(scene: Phaser.Scene): string {
  if (scene.textures.exists(TROPHY_TEXTURE_KEY)) return TROPHY_TEXTURE_KEY;
  const size = Math.ceil(TROPHY_TEX_PX * RENDER_SCALE);
  const u = size / GRID;
  const pts = (ps: readonly (readonly [number, number])[]): { x: number; y: number }[] => ps.map(([x, y]) => ({ x: x * u, y: y * u }));
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  // 取っ手（椀の左右の半円）
  g.lineStyle(3.2 * u, TROPHY_GOLD_DARK, 1);
  g.beginPath();
  g.arc(12 * u, 12 * u, 6 * u, Math.PI / 2, (Math.PI * 3) / 2, false);
  g.strokePath();
  g.beginPath();
  g.arc(36 * u, 12 * u, 6 * u, -Math.PI / 2, Math.PI / 2, false);
  g.strokePath();
  // 脚・節・台（影の色の上に地の色）
  g.fillStyle(TROPHY_GOLD_DARK, 1);
  g.fillRect(21 * u, 26 * u, 6 * u, 10 * u);
  g.fillRect(17 * u, 33 * u, 14 * u, 4 * u);
  g.fillStyle(TROPHY_GOLD, 1);
  g.fillRect(13 * u, 37 * u, 22 * u, 7 * u);
  g.fillStyle(TROPHY_GOLD_LIGHT, 1);
  g.fillRect(13 * u, 37 * u, 22 * u, 1.6 * u);
  // 椀と光
  g.fillStyle(TROPHY_GOLD, 1);
  g.fillPoints(pts(BOWL), true);
  g.fillStyle(TROPHY_GOLD_LIGHT, 1);
  g.fillPoints(pts(SHINE), true);
  g.fillStyle(TROPHY_GOLD_LIGHT, 1);
  g.fillRect(10 * u, 5 * u, 28 * u, 2 * u);
  // 縁（暗い背でも形が読めるように）
  g.lineStyle(Math.max(1, 1.4 * u), TROPHY_OUTLINE, 1);
  g.strokePoints(pts(BOWL), true);
  g.strokeRect(13 * u, 37 * u, 22 * u, 7 * u);
  g.generateTexture(TROPHY_TEXTURE_KEY, size, size);
  g.destroy();
  return TROPHY_TEXTURE_KEY;
}

/** 杯を左上 (x, y) に px の正方形で置く（Image 1 つ。場面の破棄で消える） */
export function addTrophyImage(scene: Phaser.Scene, x: number, y: number, px: number, depth: number): Phaser.GameObjects.Image {
  return scene.add.image(x, y, ensureTrophyTexture(scene)).setOrigin(0, 0).setDisplaySize(px, px).setDepth(depth);
}
