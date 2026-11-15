// 海峡の両岸の陸と字（v0.8.0 S2。us_04「ブラケット海峡の夜」。spec-v0800 §4.3・§4.10・§5.2、brief L15）: 北の縁 y 0 の外（コロンバンガラ島）と南の縁の外
// （アランデル島・ギゾ島。ファーガソン水道の切れ目は陸を描かず海が南へ続く）の陸の塗りと浜の線、島・水道・揚陸の地（「ビラ →」）の名。
// systems/evac-terrain の作法: 起動時に 1 回だけ Graphics に記録し、毎フレーム触らない（世界の大きさのテクスチャにしない）。陸の際の砂浜・寄せ波・樹冠は今の岸の帯
// （tex-coast-strip を 1 回だけ作って systems/coast-fx が陸の区間ごとに並べる）。描く命令は 塗りの色 1・陸の矩形（区間の数＝us_04 は 3）・線の色 1・浜の線（区間の数）・
// 水道に面した陸の端の線（切れ目の両端＝us_04 は 2）＝us_04 で 10。字は島の名（labels）・切れ目の名・揚陸の地の名の Text（us_04 は 5）。論理の状態は読むだけ。
import type Phaser from 'phaser';
import { shoreLandSpans } from '../assets/coast-shape';
import { DEPTH } from '../config/game-config';
import { COAST_LABEL_FONT_PX, COAST_LAND_COLOR, COAST_LINE_COLOR, COAST_LINE_WIDTH, COAST_TEXT_COLOR } from '../config/hunt-config';
import type { ShoreSide, ShoresSetup } from '../config/shores-mission-data';
import { STRAIT_LANDING_ARROW_EAST_JA, STRAIT_LANDING_ARROW_WEST_JA } from '../config/strait-art-config';
import type { TransitSetup } from '../config/transit-mission-data';
import { hudTextStyle } from '../config/ui-config';

/** 世界から読む物（WorldSetup の一部） */
export interface StraitSetupView {
  readonly mission: { readonly bounds: { readonly width: number; readonly height: number } };
  readonly shores?: ShoresSetup;
  readonly transit?: TransitSetup;
}

export class StraitTerrain {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly labels: Phaser.GameObjects.Text[] = [];

  constructor(scene: Phaser.Scene, s: StraitSetupView) {
    const g = scene.add.graphics().setDepth(DEPTH.shallows);
    this.graphics = g;
    const sh = s.shores;
    if (!sh) return;
    const { width, height } = s.mission.bounds;
    g.fillStyle(COAST_LAND_COLOR, 1);
    for (const sp of shoreLandSpans(sh.north, width)) g.fillRect(sp.x0, -sh.north.landM, sp.x1 - sp.x0, sh.north.landM);
    for (const sp of shoreLandSpans(sh.south, width)) g.fillRect(sp.x0, height, sp.x1 - sp.x0, sh.south.landM);
    g.lineStyle(COAST_LINE_WIDTH, COAST_LINE_COLOR, 1);
    this.shoreLines(g, sh.north, width, 0, -1);
    this.shoreLines(g, sh.south, width, height, 1);
    this.side(scene, sh.north, -sh.north.landM / 2);
    this.side(scene, sh.south, height + sh.south.landM / 2);
    // 揚陸の地（列が抜ける縁の外。北の陸の上）の名と矢印
    const tr = s.transit;
    if (tr) {
      const east = tr.inbound.edge === 'west';
      const text = east ? `${tr.vilaLabelJa} ${STRAIT_LANDING_ARROW_EAST_JA}` : `${STRAIT_LANDING_ARROW_WEST_JA} ${tr.vilaLabelJa}`;
      this.label(scene, east ? width + sh.north.landM / 2 : -sh.north.landM / 2, -sh.north.landM / 2, text);
    }
  }

  /** 浜の線（陸の区間ごと）と、切れ目（水道）に面した陸の端の線（岸の線 y から陸の側 sign へ陸の幅） */
  private shoreLines(g: Phaser.GameObjects.Graphics, side: ShoreSide, width: number, y: number, sign: number): void {
    for (const sp of shoreLandSpans(side, width)) g.lineBetween(sp.x0, y, sp.x1, y);
    for (const gap of side.gaps) {
      g.lineBetween(gap.x0, y, gap.x0, y + sign * side.landM);
      g.lineBetween(gap.x1, y, gap.x1, y + sign * side.landM);
    }
  }

  /** 1 辺の字: 島の名（陸の中ほど）と切れ目の名（切れ目の真ん中・陸と同じ深さの海の上） */
  private side(scene: Phaser.Scene, side: ShoreSide, y: number): void {
    for (const l of side.labels) this.label(scene, l.x, y, l.labelJa);
    for (const gap of side.gaps) this.label(scene, (gap.x0 + gap.x1) / 2, y, side.gapLabelJa);
  }

  private label(scene: Phaser.Scene, x: number, y: number, text: string): void {
    this.labels.push(scene.add.text(x, y, text, hudTextStyle(COAST_LABEL_FONT_PX, COAST_TEXT_COLOR)).setOrigin(0.5).setDepth(DEPTH.shallows));
  }

  destroy(): void {
    this.graphics.destroy();
    for (const l of this.labels) l.destroy();
    this.labels.length = 0;
  }
}
