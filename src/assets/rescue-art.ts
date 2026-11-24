// v0.8.5 S2（us_07「D-Day・生存者救助」）の絵: 生存者の群（人数ごとの frame）・機雷（見えた物の絵）・水路のブイ（赤と緑の frame）と、味方のフレッチャー級（フィッチと沈むコリー）。
// CLAUDE.md §2「アート」: コードで描く（Canvas の 2D に 1 回。外部の画像なし）。Boot が救助の任務（v0_1_prototype.rescue）のある時に 1 回だけ（§7）。定数は config/rescue-art-config。
import type Phaser from 'phaser';
import { RENDER_SCALE } from '../config/game-config';
import { getEnemyRecord, type GameData } from '../config/game-data';
import {
  BUOY_GREEN, BUOY_R, BUOY_RED, BUOY_RIM, BUOY_TEX_UNITS,
  MINE_BALL_COLOR, MINE_BALL_R, MINE_HORNS, MINE_HORN_UNITS, MINE_RIM_COLOR, MINE_RING_ALPHA, MINE_RING_COLOR, MINE_RING_LINE, MINE_RING_R, MINE_TEX_UNITS,
  RESCUE_SHIP_ENEMY_ID, RESCUE_TEX_ALLY_SHIP, RESCUE_TEX_BUOY, RESCUE_TEX_DENSITY, RESCUE_TEX_MINE, RESCUE_TEX_SURVIVORS,
  SURVIVOR_FOAM_ALPHA, SURVIVOR_FOAM_R, SURVIVOR_HEADS_MAX, SURVIVOR_HEAD_COLOR, SURVIVOR_HEAD_R, SURVIVOR_VEST_R, SURVIVOR_RIPPLE_ALPHA, SURVIVOR_RIPPLE_R, SURVIVOR_SPOTS, SURVIVOR_TEX_UNITS, SURVIVOR_VEST_COLOR,
} from '../config/rescue-art-config';
import { paintAllyFletcherTexture } from './destroyer-art';
import { paintCanvas } from './sea-art';

type C = CanvasRenderingContext2D;

function css(c: number, a = 1): string {
  return `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
}

function disc(ctx: C, x: number, y: number, r: number, fill: string): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

/** 1 枚の絵を units × units 単位（frames 枚を縦に）で描く。表示は 1 / (RENDER_SCALE × 密度) */
function paintUnits(scene: Phaser.Scene, key: string, units: number, frames: number, draw: (ctx: C, f: number) => void): void {
  const px = Math.ceil(units * RENDER_SCALE * RESCUE_TEX_DENSITY);
  const s = px / units;
  paintCanvas(scene, key, px, px, (ctx) => {
    for (let f = 0; f < frames; f++) {
      ctx.save();
      ctx.translate(0, f * px);
      ctx.scale(s, s);
      draw(ctx, f);
      ctx.restore();
    }
  }, frames);
}

/** 生存者の群: frame pN は N+1 名（波立ちの輪・泡・救命胴衣の橙・頭） */
function paintSurvivors(scene: Phaser.Scene): void {
  const c = SURVIVOR_TEX_UNITS / 2;
  paintUnits(scene, RESCUE_TEX_SURVIVORS, SURVIVOR_TEX_UNITS, SURVIVOR_HEADS_MAX, (ctx, f) => {
    ctx.beginPath();
    ctx.arc(c, c, SURVIVOR_RIPPLE_R, 0, Math.PI * 2);
    ctx.strokeStyle = css(0xffffff, SURVIVOR_RIPPLE_ALPHA);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    for (let i = 0; i <= f; i++) {
      const [dx, dy] = SURVIVOR_SPOTS[i]!;
      disc(ctx, c + dx, c + dy, SURVIVOR_FOAM_R, css(0xffffff, SURVIVOR_FOAM_ALPHA));
    }
    for (let i = 0; i <= f; i++) {
      const [dx, dy] = SURVIVOR_SPOTS[i]!;
      disc(ctx, c + dx, c + dy, SURVIVOR_VEST_R, css(SURVIVOR_VEST_COLOR));
      disc(ctx, c + dx - 0.3, c + dy - 0.4, SURVIVOR_HEAD_R, css(SURVIVOR_HEAD_COLOR));
    }
  });
}

/** 機雷: 赤い警告の輪・暗い球と角・明るい縁 */
function paintMine(scene: Phaser.Scene): void {
  const c = MINE_TEX_UNITS / 2;
  paintUnits(scene, RESCUE_TEX_MINE, MINE_TEX_UNITS, 1, (ctx) => {
    ctx.beginPath();
    ctx.arc(c, c, MINE_RING_R, 0, Math.PI * 2);
    ctx.strokeStyle = css(MINE_RING_COLOR, MINE_RING_ALPHA);
    ctx.lineWidth = MINE_RING_LINE;
    ctx.stroke();
    for (let i = 0; i < MINE_HORNS; i++) {
      const a = (i / MINE_HORNS) * Math.PI * 2 - Math.PI / 2;
      disc(ctx, c + Math.cos(a) * (MINE_BALL_R + MINE_HORN_UNITS * 0.4), c + Math.sin(a) * (MINE_BALL_R + MINE_HORN_UNITS * 0.4), MINE_HORN_UNITS * 0.55, css(MINE_RIM_COLOR));
    }
    disc(ctx, c, c, MINE_BALL_R + 0.5, css(MINE_RIM_COLOR));
    disc(ctx, c, c, MINE_BALL_R, css(MINE_BALL_COLOR));
    disc(ctx, c - MINE_BALL_R * 0.33, c - MINE_BALL_R * 0.33, MINE_BALL_R * 0.28, css(0xffffff, 0.45));
  });
}

/** 水路のブイ: p0 赤（左舷）・p1 緑（右舷）。白い縁と暗い芯 */
function paintBuoy(scene: Phaser.Scene): void {
  const c = BUOY_TEX_UNITS / 2;
  paintUnits(scene, RESCUE_TEX_BUOY, BUOY_TEX_UNITS, 2, (ctx, f) => {
    disc(ctx, c, c, BUOY_R + BUOY_RIM, css(0xffffff, 0.9));
    disc(ctx, c, c, BUOY_R, css(f === 0 ? BUOY_RED : BUOY_GREEN));
    disc(ctx, c, c, BUOY_R * 0.32, css(0x202020, 0.8));
  });
}

/** Boot で 1 回（救助の任務がある時だけ呼ぶ）: 生存者・機雷・ブイと味方のフレッチャー級（寸法は RESCUE_SHIP_ENEMY_ID の記録 × sprite_scale） */
export function generateRescueTextures(scene: Phaser.Scene, data: GameData, spriteScale: number): void {
  paintSurvivors(scene);
  paintMine(scene);
  paintBuoy(scene);
  const r = getEnemyRecord(data, RESCUE_SHIP_ENEMY_ID);
  paintAllyFletcherTexture(scene, { lengthUnits: r.length_m * spriteScale, beamUnits: r.beam_m * spriteScale }, RESCUE_TEX_ALLY_SHIP);
}

/** 艇・艦と同じ表示の倍率（1 / (RENDER_SCALE × 密度)） */
export function rescueArtScale(): number {
  return 1 / RENDER_SCALE / RESCUE_TEX_DENSITY;
}
