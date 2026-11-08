// v0.7.0 S2a（アートと音①：コードで描く絵。spec-v0700 §4.2）: 艦と大発の絵を描く共通の道具。形は ship-shape（Phaser に依らない）、色は boat-art-config のパレット、
// 寸法は art-dims の式（placeholder と同じ＝D1）。起動時に 1 回だけ Graphics に描いて generateTexture し、Graphics は捨てる（CLAUDE.md §7）。
// 駆逐艦は destroyer-art、輸送船は transport-art、大発は barge-art がここを呼ぶ（R18: 1 つの ship-art.ts だと 300 行を超えるので分けた）。
import type Phaser from 'phaser';
import { RENDER_SCALE } from '../config/game-config';
import type { HullPalette } from '../config/boat-art-config';
import { hullTexSize, type BoatTextureSpec } from './art-dims';
import { paintTexture, type ArtPen } from './art-pen';
import type { ShipShape, ShipTone } from './ship-shape';

/** 色の役 → パレットの色（mid は台の中間の色） */
export function shipToneColor(tone: ShipTone, pal: HullPalette, mid: number): number {
  switch (tone) {
    case 'rim': return pal.rim;
    case 'deck': return pal.deck;
    case 'side': return pal.side;
    case 'super': return pal.superstructure;
    case 'detail': return pal.detail;
    case 'mid': return mid;
    default: return pal.highlight;
  }
}

/** 形をパレットで描く（輪郭はリムの色・その上に部品を順に） */
export function paintShip(pen: ArtPen, shape: ShipShape, pal: HullPalette, mid: number): void {
  pen.poly(shape.outline, pal.rim, 1);
  pen.parts(shape.parts, (t) => shipToneColor(t, pal, mid));
}

/** 形を key のテクスチャに（寸法は placeholder と同じ ceil(B·k) × ceil(L·k)。原点は表示側の既定＝中央） */
export function paintShipTexture(scene: Phaser.Scene, key: string, spec: BoatTextureSpec, shape: ShipShape, pal: HullPalette, mid: number): void {
  paintTexture(scene, key, hullTexSize(spec.lengthUnits, spec.beamUnits, RENDER_SCALE), RENDER_SCALE, (pen) => paintShip(pen, shape, pal, mid));
}
