// 空襲下の退避（v0.6.11 S4。jp_03）の地形の絵（spec-v0611-r2 §3.1・§11 の r2 L4）: 北の縁 y 0 の外の屋我地島（陸・浜の線・名）、南の岸の壕と引き上げの斜路、
// 北の岸の際の陰（暗い海）。起動時 1 回だけ Graphics に記録し、毎フレーム触らない（entities/shallows の作法。世界の大きさのテクスチャにしない＝3,200 m は
// RENDER_SCALE 2 で 6,400 px になり古い iPhone の最大テクスチャを越えうる）。南の岸（本部半島（運天））は entities/shallows が mission.coast で描く。隠れ場所の輪と札は S5（ui/evac-markers）。
// v0.6.11 IP1 の U10（ユーザー「レールの画面での描写が線一本で何がなんだかわかりません。もう少し視覚的にレール（ドッグ）であることがわかるように」）: 壕ごとに
// コンクリートの斜路（海の中は薄く）・枕木・2 本のレールが隠れ場所の点の少し海側から陸の岩の口（暗い楕円）へ入る。海の中の部分は陸の塗りより下（shallows。隠れ場所の輪が上に重なる）、
// 陸の部分と口は陸の塗りの上（landingMark＝entities/shallows の陸に隠れない）。上げている艇の絵の動きは systems/evac-boats-view、% の札は ui/evac-markers。
// v0.6.11 IP2 の U11（ユーザー「屋我地の陰の方も視覚的に何がなんだかよくわからないので岩などを描画したりしてビジュアルのクオリティを上げてください」）: 陰は張り出した崖・入り江の腕・
// 海の暗い陰・口の外の岩・波・崖の上の木々の 1 枚の画像、壕の口の岩の縁と脇の岩・木々も 1 枚の画像（assets/evac-terrain-art が初回だけテクスチャに描く）。足した表示物は陰 1・壕 3 の 4 枚。
// v0.7.0 S4: 陰の絵は同じテクスチャの Image 2 枚に分けて置く（setCrop。陸の側＝岸の線から海へ 8 m までは岸の帯 1.2 の上 EVAC_COVER_LAND_DEPTH、海の側は今の shallows＝隠れ場所の輪と
// 爆撃進路の線の下）。岸の帯（systems/coast-fx）が陰の絵をよけずに崖と岩の下を通る（S3c はよけた ± 460 m に何も無い暗緑の矩形が見えた）。表示物は陰 2・壕 3 の 5 枚。
import type Phaser from 'phaser';
import { ensureEvacCaveArt, ensureEvacCoverArt, type EvacArtPlacement } from '../assets/evac-terrain-art';
import {
  EVAC_CAVE_COLOR, EVAC_CAVE_MOUTH_H_M, EVAC_CAVE_MOUTH_W_M, EVAC_ISLAND_LABEL_PX, EVAC_ISLAND_LAND_M, EVAC_RAIL_COLOR, EVAC_RAIL_GAUGE_M, EVAC_RAIL_WIDTH_M, EVAC_RAMP_COLOR, EVAC_RAMP_SEA_ALPHA, EVAC_RAMP_SEA_M,
  EVAC_RAMP_W_M, EVAC_TIE_COLOR, EVAC_TIE_H_M, EVAC_TIE_STEP_M, EVAC_TIE_W_M, evacCaveMouthY,
} from '../config/evac-config';
import type { EvacSetup } from '../config/evac-mission-data';
import { DEPTH } from '../config/game-config';
import { COAST_LAND_COLOR, COAST_LINE_COLOR, COAST_LINE_WIDTH, COAST_TEXT_COLOR } from '../config/hunt-config';
import { COAST_STRIP_SEA_M, EVAC_COVER_LAND_DEPTH } from '../config/sea-art-config';
import { hudTextStyle } from '../config/ui-config';
import { SHELTER_CAVE } from '../core/evac-data';

/** 岩の絵の 1 枚（陰は隠れ場所の id ごと、壕は 3 つで同じ 1 枚） */
const COVER_ART_KEY = 'tex-evac-cover-art-';
const CAVE_ART_KEY = 'tex-evac-cave-art';

function artImage(scene: Phaser.Scene, a: EvacArtPlacement, depth: number): Phaser.GameObjects.Image {
  return scene.add.image(a.x, a.y, a.key).setOrigin(0, 0).setScale(a.scale).setDepth(depth);
}

/** 陰の絵を 2 枚（陸の側は岸の帯の上・海の側は輪の下。切れ目は世界の y＝COAST_STRIP_SEA_M＝帯の海の側の端） */
function coverImages(scene: Phaser.Scene, a: EvacArtPlacement, out: Phaser.GameObjects.Image[]): void {
  const land = artImage(scene, a, EVAC_COVER_LAND_DEPTH);
  const sea = artImage(scene, a, DEPTH.shallows);
  const cut = Math.round((COAST_STRIP_SEA_M - a.y) / a.scale);
  land.setCrop(0, 0, land.width, cut);
  sea.setCrop(0, cut, sea.width, sea.height - cut);
  out.push(land, sea);
}

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
  private readonly art: Phaser.GameObjects.Image[] = [];

  constructor(scene: Phaser.Scene, ev: EvacSetup, bounds: { readonly width: number; readonly height: number }) {
    const g = scene.add.graphics().setDepth(DEPTH.shallows);
    const land = EVAC_ISLAND_LAND_M;
    // 屋我地島（北の縁の外。左右も陸の幅だけ伸ばす）と浜の線
    g.fillStyle(COAST_LAND_COLOR, 1);
    g.fillRect(-land, -land, bounds.width + land * 2, land);
    g.lineStyle(COAST_LINE_WIDTH, COAST_LINE_COLOR, 1);
    g.lineBetween(-land, 0, bounds.width + land, 0);
    // 陰の崖と岩と海の暗い陰（陸の塗りの上・隠れ場所の輪と艇の下）
    for (const s of ev.params.shelters) if (s.kind !== SHELTER_CAVE) coverImages(scene, ensureEvacCoverArt(scene, COVER_ART_KEY + s.id, s.x, s.y), this.art);
    // 壕と引き上げの斜路（壕は南の岸の際＝spec §3.1）: 海の中（隠れ場所の点の少し海側〜岸の線）は薄く g に、陸の上（岸の線〜口）と岩の口は陸の塗りの上の slip に
    const h = bounds.height;
    const mouthY = evacCaveMouthY(h);
    // 壕の口の岩の縁・脇の岩・木々（陸の塗りの上・斜路と口の下）
    for (const s of ev.params.shelters) if (s.kind === SHELTER_CAVE) this.art.push(artImage(scene, ensureEvacCaveArt(scene, CAVE_ART_KEY, s.x, mouthY), DEPTH.landingMark));
    const slip = scene.add.graphics().setDepth(DEPTH.landingMark);
    for (const s of ev.params.shelters) {
      if (s.kind !== SHELTER_CAVE) continue;
      const y0 = s.y - EVAC_RAMP_SEA_M;
      g.fillStyle(EVAC_RAMP_COLOR, EVAC_RAMP_SEA_ALPHA);
      g.fillRect(s.x - EVAC_RAMP_W_M / 2, y0, EVAC_RAMP_W_M, h - y0);
      railsBetween(g, s.x, y0, h, EVAC_RAMP_SEA_ALPHA + (1 - EVAC_RAMP_SEA_ALPHA) / 2);
      // 斜路の陸の部分 → 暗い口（斜路とレールは口の中へ消える。岩の縁は下の画像）
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
    for (const a of this.art) a.destroy();
  }
}
