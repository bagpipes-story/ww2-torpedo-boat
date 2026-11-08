// v0.7.0 S1（アートと音①：コードで描く絵。spec-v0700 §4.1）: 自艇・僚艇・隼艇の絵（boatTextureKey の 5 枚: Elco 80・Elco 77・T-38・T-14・H-38）。S2a で敵の米PT（同じ形を敵の色で）も。
// placeholders の generatePlayerBoatTexture と同じ名前・引数・鍵・寸法（art-dims の式。D1）で、Boot の呼び出しの行は変えない（R14）。
// 真上から見た絵・艇首が上・回転に依らない枕の陰影（縁の明るいリム 1.5 単位・中心線の明るい筋）。無彩色に近い白で描き、僚艇・隼艇の ESCORT_TINT・jp_03 の EVAC_HIDDEN_TINT の
// 掛け算で薄い青・暗い灰になる。細部は 2 単位以上（R17）・幅 10 単位未満の艇なので側の暗い帯は描かない。被害・沈没の絵は作らない（§3.6: 炎と煙は S3c・沈没は今の tween）。
import type Phaser from 'phaser';
import { RENDER_SCALE, TEXTURE_KEYS, boatTextureKey } from '../config/game-config';
import {
  BOAT_ART_DEFAULT_KIND, BOAT_ART_KIND_BY_ID, BOAT_ART_LAYOUTS, PALETTE_ENEMY, PALETTE_ENEMY_MID, PALETTE_PLAYER, PALETTE_PLAYER_MID, type BoatArtKind, type HullPalette,
} from '../config/boat-art-config';
import { hullTexSize, type BoatTextureSpec } from './art-dims';
import { paintTexture, type ArtPen } from './art-pen';
import { boatShape, type BoatShape, type BoatTone } from './boat-shape';

/** 鍵（boatTextureKey(id)）→ 形の種類。表に無い艇は既定 */
export function boatArtKindForKey(key: string): BoatArtKind {
  for (const id of Object.keys(BOAT_ART_KIND_BY_ID)) if (boatTextureKey(id) === key) return BOAT_ART_KIND_BY_ID[id]!;
  return BOAT_ART_DEFAULT_KIND;
}

function toneColor(tone: BoatTone, pal: HullPalette, mid: number): number {
  switch (tone) {
    case 'rim': return pal.rim;
    case 'deck': return pal.deck;
    case 'super': return pal.superstructure;
    case 'mid': return mid;
    default: return pal.highlight;
  }
}

/** 形をパレットで描く（S2a の米PT は同じ形を敵のパレットで） */
export function paintBoat(pen: ArtPen, shape: BoatShape, pal: HullPalette, mid: number): void {
  pen.poly(shape.outline, pal.rim, 1);
  for (const p of shape.parts) {
    const c = toneColor(p.tone, pal, mid);
    if (p.kind === 'poly') pen.poly(p.pts, c, p.alpha);
    else if (p.kind === 'rect') pen.rect(p.x, p.y, p.w, p.h, p.r, c, p.alpha);
    else pen.disc(p.cx, p.cy, p.r, c, p.alpha);
  }
}

/** 自艇・僚艇・隼艇: 艇首を上にした絵。原点はテクスチャ中央。key は艇ごと（boatTextureKey。v0.6.0）。寸法は placeholder と同じ ceil(B·k) × ceil(L·k) */
export function generatePlayerBoatTexture(scene: Phaser.Scene, spec: BoatTextureSpec, key: string): void {
  const shape = boatShape(BOAT_ART_LAYOUTS[boatArtKindForKey(key)], spec.lengthUnits, spec.beamUnits);
  paintTexture(scene, key, hullTexSize(spec.lengthUnits, spec.beamUnits, RENDER_SCALE), RENDER_SCALE, (pen) => paintBoat(pen, shape, PALETTE_PLAYER, PALETTE_PLAYER_MID));
}

/** 敵の米PT（S2a。tex-pt-boat。jp_01・jp_04・jp_05）: Elco 80 と同じ形を敵のパレットで（形は自艇と同じ＝史実。色で敵。去れば PT_RETIRED_TINT の掛け算で灰）。pt-placeholder の generatePtBoatTexture が呼ぶ */
export function paintPtBoatTexture(scene: Phaser.Scene, spec: BoatTextureSpec): void {
  const shape = boatShape(BOAT_ART_LAYOUTS.elco80, spec.lengthUnits, spec.beamUnits);
  paintTexture(scene, TEXTURE_KEYS.ptBoat, hullTexSize(spec.lengthUnits, spec.beamUnits, RENDER_SCALE), RENDER_SCALE, (pen) => paintBoat(pen, shape, PALETTE_ENEMY, PALETTE_ENEMY_MID));
}
