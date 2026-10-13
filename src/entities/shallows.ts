// 浅瀬の見た目（docs/02 §6.8、v0.3.2）: 暗い帯（塗りと縁）と中心のラベル。岸（v0.4.2）は海域の外の陸と浜の線とラベル。1 つの Graphics に起動時 1 回だけ記録する（毎フレーム触らない）。
import Phaser from 'phaser';
import { DEPTH } from '../config/game-config';
import { SHALLOW_FILL_ALPHA, SHALLOW_FILL_COLOR, SHALLOW_LABEL_FONT_PX, SHALLOW_LINE_ALPHA, SHALLOW_LINE_COLOR, SHALLOW_LINE_WIDTH, SHALLOW_TEXT_COLOR, hudTextStyle } from '../config/ui-config';
import { COAST_LABEL_FONT_PX, COAST_LAND_COLOR, COAST_LINE_COLOR, COAST_LINE_WIDTH, COAST_TEXT_COLOR } from '../config/hunt-config';
import type { CoastBlock } from '../config/mission-data';
import type { ShallowRect } from '../core/shallows';

export class ShallowsView {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly labels: Phaser.GameObjects.Text[] = [];

  constructor(scene: Phaser.Scene, rects: readonly ShallowRect[], coast: CoastBlock | null = null, bounds: { width: number; height: number } | null = null) {
    const g = scene.add.graphics().setDepth(DEPTH.shallows);
    if (coast && bounds) {
      // 南の岸: 海域の外（y > 高さ）に陸、縁に浜の線、陸の中央にラベル（海域の外なので左右も陸の幅だけ伸ばす）
      g.fillStyle(COAST_LAND_COLOR, 1);
      g.fillRect(-coast.landM, bounds.height, bounds.width + coast.landM * 2, coast.landM);
      g.lineStyle(COAST_LINE_WIDTH, COAST_LINE_COLOR, 1);
      g.lineBetween(-coast.landM, bounds.height, bounds.width + coast.landM, bounds.height);
      this.labels.push(scene.add.text(bounds.width / 2, bounds.height + coast.landM / 2, coast.label, hudTextStyle(COAST_LABEL_FONT_PX, COAST_TEXT_COLOR)).setOrigin(0.5).setDepth(DEPTH.shallows));
    }
    g.fillStyle(SHALLOW_FILL_COLOR, SHALLOW_FILL_ALPHA);
    g.lineStyle(SHALLOW_LINE_WIDTH, SHALLOW_LINE_COLOR, SHALLOW_LINE_ALPHA);
    for (const r of rects) {
      g.fillRect(r.x, r.y, r.w, r.h);
      g.strokeRect(r.x, r.y, r.w, r.h);
      this.labels.push(scene.add.text(r.x + r.w / 2, r.y + r.h / 2, r.label, hudTextStyle(SHALLOW_LABEL_FONT_PX, SHALLOW_TEXT_COLOR)).setOrigin(0.5).setAlpha(SHALLOW_LINE_ALPHA).setDepth(DEPTH.shallows));
    }
    this.graphics = g;
  }

  destroy(): void {
    this.graphics.destroy();
    for (const l of this.labels) l.destroy();
  }
}
