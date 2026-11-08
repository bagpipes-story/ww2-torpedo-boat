// v0.7.0 S1（アートと音①：コードで描く絵。S2a で楕円と部品の並びを足した）: 世界単位で描くペン。テクスチャは RENDER_SCALE（k）倍の px で作り、表示側が setScale(1/k) で世界単位に戻す（placeholder と同じ）。
// 起動時に 1 回だけ Graphics に描いて generateTexture し、Graphics は捨てる（CLAUDE.md §7。陰の evac-terrain-art の Pen と同じ考え）。色は呼ぶ側（art config のパレット）。
import type Phaser from 'phaser';
import type { TexSize } from './art-dims';

export interface PenPt {
  readonly x: number;
  readonly y: number;
}

/** 絵の部品（世界単位）。tone は呼ぶ側の色の役（艦: ship-shape の ShipTone。v0.7.0 S2a。艇の boat-shape の BoatPart は S1 の形のまま） */
export type ArtPart<T extends string> =
  | { readonly kind: 'poly'; readonly pts: readonly PenPt[]; readonly tone: T; readonly alpha: number }
  | { readonly kind: 'rect'; readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly r: number; readonly tone: T; readonly alpha: number }
  | { readonly kind: 'disc'; readonly cx: number; readonly cy: number; readonly r: number; readonly tone: T; readonly alpha: number }
  | { readonly kind: 'ellipse'; readonly cx: number; readonly cy: number; readonly rx: number; readonly ry: number; readonly tone: T; readonly alpha: number };

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

  /** 楕円（中心 cx, cy・半径 rx, ry。煙突） */
  ellipse(cx: number, cy: number, rx: number, ry: number, color: number, alpha = 1): void {
    const k = this.k;
    this.g.fillStyle(color, alpha);
    this.g.fillEllipse(cx * k, cy * k, rx * 2 * k, ry * 2 * k);
  }

  /** 部品の並びを順に描く（色は役ごとに colorOf） */
  parts<T extends string>(parts: readonly ArtPart<T>[], colorOf: (tone: T) => number): void {
    for (const p of parts) {
      const c = colorOf(p.tone);
      if (p.kind === 'poly') this.poly(p.pts, c, p.alpha);
      else if (p.kind === 'rect') this.rect(p.x, p.y, p.w, p.h, p.r, c, p.alpha);
      else if (p.kind === 'disc') this.disc(p.cx, p.cy, p.r, c, p.alpha);
      else this.ellipse(p.cx, p.cy, p.rx, p.ry, c, p.alpha);
    }
  }
}

/** Graphics を 1 つ作って draw で描き、key のテクスチャ（size px）にして捨てる */
export function paintTexture(scene: Phaser.Scene, key: string, size: TexSize, k: number, draw: (pen: ArtPen) => void): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(new ArtPen(g, k));
  g.generateTexture(key, size.w, size.h);
  g.destroy();
}
