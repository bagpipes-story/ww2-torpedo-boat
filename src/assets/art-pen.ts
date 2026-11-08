// v0.7.0 S1（アートと音①：コードで描く絵）: 世界単位で描くペン。テクスチャは RENDER_SCALE（k）倍の px で作り、表示側が setScale(1/k) で世界単位に戻す（placeholder と同じ）。
// 起動時に 1 回だけ Graphics に描いて generateTexture し、Graphics は捨てる（CLAUDE.md §7。陰の evac-terrain-art の Pen と同じ考え）。色は呼ぶ側（art config のパレット）。
import type Phaser from 'phaser';
import type { TexSize } from './art-dims';

export interface PenPt {
  readonly x: number;
  readonly y: number;
}

export class ArtPen {
  constructor(private readonly g: Phaser.GameObjects.Graphics, readonly k: number) {}

  /** 多角形（世界単位の点列） */
  poly(pts: readonly PenPt[], color: number, alpha = 1): void {
    const k = this.k;
    this.g.fillStyle(color, alpha);
    this.g.fillPoints(pts.map((p) => ({ x: p.x * k, y: p.y * k })), true);
  }

  /** 角丸の矩形（左上 x, y・幅 w・高さ h・角 r。r は辺の半分まで） */
  rect(x: number, y: number, w: number, h: number, r: number, color: number, alpha = 1): void {
    const k = this.k;
    const rr = Math.max(0, Math.min(r, w / 2, h / 2)) * k;
    this.g.fillStyle(color, alpha);
    if (rr > 0) this.g.fillRoundedRect(x * k, y * k, w * k, h * k, rr);
    else this.g.fillRect(x * k, y * k, w * k, h * k);
  }

  /** 丸（中心 cx, cy・半径 r） */
  disc(cx: number, cy: number, r: number, color: number, alpha = 1): void {
    const k = this.k;
    this.g.fillStyle(color, alpha);
    this.g.fillCircle(cx * k, cy * k, r * k);
  }
}

/** Graphics を 1 つ作って draw で描き、key のテクスチャ（size px）にして捨てる */
export function paintTexture(scene: Phaser.Scene, key: string, size: TexSize, k: number, draw: (pen: ArtPen) => void): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(new ArtPen(g, k));
  g.generateTexture(key, size.w, size.h);
  g.destroy();
}
