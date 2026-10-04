// HUD・操作系の見た目の寸法（論理座標 1280×720 の px）。ゲームの数値ではないので data/*.json には置かない。
import type Phaser from 'phaser';
import { RENDER_SCALE } from './game-config';

export const HUD_FONT = 'Menlo, Consolas, monospace';
export const HUD_COLOR = '#9fb3c8';
export const HUD_COLOR_STRONG = '#e6eef7';

/** Text の style。resolution に RENDER_SCALE を渡し、カメラの DPR ズームでぼやけないようにする */
export function hudTextStyle(fontSizePx: number, color: string = HUD_COLOR): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: HUD_FONT, fontSize: `${fontSizePx}px`, color, resolution: RENDER_SCALE };
}

/** バーチャルスティック（docs/02 §5: 左半分、タッチ開始点に出る） */
export const STICK_RADIUS = 110;
export const STICK_KNOB_RADIUS = 38;
export const STICK_DEAD_ZONE = 0.12;
export const STICK_BASE_ALPHA = 0.35;
export const STICK_KNOB_ALPHA = 0.7;

/** 舵インジケータ（右下）。バーの半幅と高さ */
export const RUDDER_BAR_HALF_WIDTH = 120;
export const RUDDER_BAR_HEIGHT = 6;
export const RUDDER_MARKER_WIDTH = 10;
export const RUDDER_MARKER_HEIGHT = 26;

/** 海のグリッド（m）。1枚のテクスチャを TileSprite で敷く */
export const SEA_GRID_CELL_M = 100;
