// 空襲下の退避（v0.6.11 S4。jp_03）の地形の絵（spec-v0611-r2 §3.1・§11 の r2 L4）: 北の縁 y 0 の外の屋我地島（陸・浜の線・名）、南の岸の壕と引き上げの斜路、
// 北の岸の際の陰（暗い海）。起動時 1 回だけ Graphics に記録し、毎フレーム触らない（entities/shallows の作法。世界の大きさのテクスチャにしない＝3,200 m は
// RENDER_SCALE 2 で 6,400 px になり古い iPhone の最大テクスチャを越えうる）。南の岸（本部半島（運天））は entities/shallows が mission.coast で描く。隠れ場所の輪と札は S5（ui/evac-markers）。
// v0.6.11 IP1 の U10（ユーザー「レールの画面での描写が線一本で何がなんだかわかりません。もう少し視覚的にレール（ドッグ）であることがわかるように」）: 壕ごとに
// コンクリートの斜路（海の中は薄く）・枕木・2 本のレールが隠れ場所の点の少し海側から陸の岩の口（暗い楕円）へ入る。海の中の部分は陸の塗りより下（shallows。隠れ場所の輪が上に重なる）、
// 陸の部分と口は陸の塗りの上（landingMark＝entities/shallows の陸に隠れない）。上げている艇の絵の動きは systems/evac-boats-view、% の札は ui/evac-markers。
import type Phaser from 'phaser';
import {
  EVAC_CAVE_COLOR, EVAC_CAVE_MOUTH_H_M, EVAC_CAVE_MOUTH_W_M, EVAC_CAVE_ROCK_COLOR, EVAC_CAVE_ROCK_H_M, EVAC_CAVE_ROCK_W_M, EVAC_COVER_ALPHA, EVAC_COVER_COLOR,
  EVAC_COVER_H_M, EVAC_COVER_W_M, EVAC_ISLAND_LABEL_PX, EVAC_ISLAND_LAND_M, EVAC_RAIL_COLOR, EVAC_RAIL_GAUGE_M, EVAC_RAIL_WIDTH_M, EVAC_RAMP_COLOR, EVAC_RAMP_SEA_ALPHA, EVAC_RAMP_SEA_M,
  EVAC_RAMP_W_M, EVAC_TIE_COLOR, EVAC_TIE_H_M, EVAC_TIE_STEP_M, EVAC_TIE_W_M, evacCaveMouthY,
} from '../config/evac-config';
import type { EvacSetup } from '../config/evac-mission-data';
import { DEPTH } from '../config/game-config';
import { COAST_LAND_COLOR, COAST_LINE_COLOR, COAST_LINE_WIDTH, COAST_TEXT_COLOR } from '../config/hunt-config';
import { hudTextStyle } from '../config/ui-config';
import { SHELTER_CAVE } from '../core/evac-data';

/** 斜路の y0〜y1 の区間に枕木とレールを描く（y0 < y1） */
function railsBetween(g: Phaser.GameObjects.Graphics, x: number, y0: number, y1: number, alpha: number): void {
  g.fillStyle(EVAC_TIE_COLOR, alpha);
  for (let y = y0 + EVAC_TIE_STEP_M / 2; y < y1; y += EVAC_TIE_STEP_M) g.fillRect(x - EVAC_TIE_W_M / 2, y - EVAC_TIE_H_M / 2, EVAC_TIE_W_M, EVAC_TIE_H_M);
  g.lineStyle(EVAC_RAIL_WIDTH_M, EVAC_RAIL_COLOR, alpha);
  g.lineBetween(x - EVAC_RAIL_GAUGE_M, y0, x - EVAC_RAIL_GAUGE_M, y1);
  g.lineBetween(x + EVAC_RAIL_GAUGE_M, y0, x + EVAC_RAIL_GAUGE_M, y1);
}

export class EvacTerrain {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly slips: Phaser.GameObjects.Graphics;
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
    // 壕と引き上げの斜路（壕は南の岸の際＝spec §3.1）: 海の中（隠れ場所の点の少し海側〜岸の線）は薄く g に、陸の上（岸の線〜口）と岩の口は陸の塗りの上の slip に
    const slip = scene.add.graphics().setDepth(DEPTH.landingMark);
    const h = bounds.height;
    const mouthY = evacCaveMouthY(h);
    for (const s of ev.params.shelters) {
      if (s.kind !== SHELTER_CAVE) continue;
      const y0 = s.y - EVAC_RAMP_SEA_M;
      g.fillStyle(EVAC_RAMP_COLOR, EVAC_RAMP_SEA_ALPHA);
      g.fillRect(s.x - EVAC_RAMP_W_M / 2, y0, EVAC_RAMP_W_M, h - y0);
      railsBetween(g, s.x, y0, h, EVAC_RAMP_SEA_ALPHA + (1 - EVAC_RAMP_SEA_ALPHA) / 2);
      // 岩の縁 → 斜路の陸の部分 → 暗い口（斜路とレールは口の中へ消える）
      slip.fillStyle(EVAC_CAVE_ROCK_COLOR, 1);
      slip.fillEllipse(s.x, mouthY, EVAC_CAVE_ROCK_W_M, EVAC_CAVE_ROCK_H_M);
      slip.fillStyle(EVAC_RAMP_COLOR, 1);
      slip.fillRect(s.x - EVAC_RAMP_W_M / 2, h, EVAC_RAMP_W_M, mouthY - h);
      railsBetween(slip, s.x, h, mouthY, 1);
      slip.fillStyle(EVAC_CAVE_COLOR, 1);
      slip.fillEllipse(s.x, mouthY + EVAC_CAVE_MOUTH_H_M / 4, EVAC_CAVE_MOUTH_W_M, EVAC_CAVE_MOUTH_H_M);
    }
    this.graphics = g;
    this.slips = slip;
    this.label = scene.add.text(bounds.width / 2, -land / 2, ev.raid.northShoreLabelJa, hudTextStyle(EVAC_ISLAND_LABEL_PX, COAST_TEXT_COLOR)).setOrigin(0.5).setDepth(DEPTH.shallows);
  }

  destroy(): void {
    this.graphics.destroy();
    this.slips.destroy();
    this.label.destroy();
  }
}
