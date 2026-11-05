// 空襲下の退避（v0.6.11 S4。jp_03）の地形の絵（spec-v0611-r2 §3.1・§11 の r2 L4）: 北の縁 y 0 の外の屋我地島（陸・浜の線・名）、南の岸の壕の口とレール（1 本ずつ）、
// 北の岸の際の陰（暗い海）。1 つの Graphics に起動時 1 回だけ記録し、毎フレーム触らない（entities/shallows の作法。世界の大きさのテクスチャにしない＝3,200 m は
// RENDER_SCALE 2 で 6,400 px になり古い iPhone の最大テクスチャを越えうる）。南の岸（本部半島（運天））は entities/shallows が mission.coast で描く。隠れ場所の輪と札は S5（ui/evac-markers）。
import type Phaser from 'phaser';
import { EVAC_CAVE_COLOR, EVAC_CAVE_MOUTH_D_M, EVAC_CAVE_MOUTH_W_M, EVAC_COVER_ALPHA, EVAC_COVER_COLOR, EVAC_COVER_H_M, EVAC_COVER_W_M, EVAC_ISLAND_LABEL_PX, EVAC_ISLAND_LAND_M, EVAC_RAIL_COLOR, EVAC_RAIL_WIDTH_M } from '../config/evac-config';
import type { EvacSetup } from '../config/evac-mission-data';
import { DEPTH } from '../config/game-config';
import { COAST_LAND_COLOR, COAST_LINE_COLOR, COAST_LINE_WIDTH, COAST_TEXT_COLOR } from '../config/hunt-config';
import { hudTextStyle } from '../config/ui-config';
import { SHELTER_CAVE } from '../core/evac-data';

export class EvacTerrain {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, ev: EvacSetup, bounds: { readonly width: number; readonly height: number }) {
    const g = scene.add.graphics().setDepth(DEPTH.shallows);
    const land = EVAC_ISLAND_LAND_M;
    // 陰（北の岸の際の暗い海。陸の塗りの下になる北の半分は隠れる）
    g.fillStyle(EVAC_COVER_COLOR, EVAC_COVER_ALPHA);
    for (const s of ev.params.shelters) if (s.kind !== SHELTER_CAVE) g.fillEllipse(s.x, s.y, EVAC_COVER_W_M, EVAC_COVER_H_M);
    // 屋我地島（北の縁の外。左右も陸の幅だけ伸ばす）と浜の線
    g.fillStyle(COAST_LAND_COLOR, 1);
    g.fillRect(-land, -land, bounds.width + land * 2, land);
    g.lineStyle(COAST_LINE_WIDTH, COAST_LINE_COLOR, 1);
    g.lineBetween(-land, 0, bounds.width + land, 0);
    // 壕: 南の縁の陸の側の口と、口から隠れ場所の点までのレール 1 本（壕は南の岸の際＝spec §3.1）
    for (const s of ev.params.shelters) {
      if (s.kind !== SHELTER_CAVE) continue;
      g.lineStyle(EVAC_RAIL_WIDTH_M, EVAC_RAIL_COLOR, 1);
      g.lineBetween(s.x, s.y, s.x, bounds.height + EVAC_CAVE_MOUTH_D_M / 2);
      g.fillStyle(EVAC_CAVE_COLOR, 1);
      g.fillRect(s.x - EVAC_CAVE_MOUTH_W_M / 2, bounds.height, EVAC_CAVE_MOUTH_W_M, EVAC_CAVE_MOUTH_D_M);
    }
    this.graphics = g;
    this.label = scene.add.text(bounds.width / 2, -land / 2, ev.raid.northShoreLabelJa, hudTextStyle(EVAC_ISLAND_LABEL_PX, COAST_TEXT_COLOR)).setOrigin(0.5).setDepth(DEPTH.shallows);
  }

  destroy(): void {
    this.graphics.destroy();
    this.label.destroy();
  }
}
