// 海の格子と海域境界。1 つの Graphics に起動時 1 回だけ記録する（毎フレーム clear/再描画しない）。海の面は systems/sea-fx の TileSprite（v0.7.0 IP1a。深さ −0.1＝この下＝格子は波の上に見える）。
// TileSprite は表示サイズ分の canvas を内部に作るため、海域全体（6,000×4,000 m = 24M px）に使うと iOS Safari の canvas 上限を超える。
// 線は 100 本程度なので Graphics の毎フレーム描画コストは無視できる。
import Phaser from 'phaser';
import { DEBUG_GRID_OFF, DEPTH } from '../config/game-config';
import { SEA_GRID_LINE_COLOR, SEA_GRID_ON } from '../config/sea-art-config';
import { SEA_BORDER_COLOR, SEA_BORDER_WIDTH, SEA_GRID_CELL_M, SEA_GRID_LINE_WIDTH } from '../config/ui-config';
import type { SeaBounds } from '../core/boat-motion';

export function drawSea(scene: Phaser.Scene, bounds: SeaBounds): Phaser.GameObjects.Graphics {
  const { width, height } = bounds;
  const g = scene.add.graphics().setDepth(DEPTH.sea);
  // 格子の線（100 m）は残す（ユーザーの決め v0.7.0 実機 1 回目の U2「波があったとしても格子の線はあった方がいいです」。色は sea-art-config。?debug&nogrid は比べる道具）。海域の縁はいつも
  if (SEA_GRID_ON && !DEBUG_GRID_OFF) {
    g.lineStyle(SEA_GRID_LINE_WIDTH, SEA_GRID_LINE_COLOR, 1);
    g.beginPath();
    for (let x = SEA_GRID_CELL_M; x < width; x += SEA_GRID_CELL_M) {
      g.moveTo(x, 0);
      g.lineTo(x, height);
    }
    for (let y = SEA_GRID_CELL_M; y < height; y += SEA_GRID_CELL_M) {
      g.moveTo(0, y);
      g.lineTo(width, y);
    }
    g.strokePath();
  }
  g.lineStyle(SEA_BORDER_WIDTH, SEA_BORDER_COLOR, 1);
  g.strokeRect(0, 0, width, height);
  return g;
}
