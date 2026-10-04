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

/** HUD の文字サイズと配置（論理 px） */
export const HUD_FONT_DEBUG_PX = 18;
export const HUD_FONT_SPEED_PX = 44;
export const HUD_FONT_STEP_PX = 24;
export const HUD_FONT_HEADING_PX = 20;
/** デバッグ HUD の行送り。文字サイズに追従させる */
export const HUD_DEBUG_LINE_HEIGHT = HUD_FONT_DEBUG_PX + 8;
/** 速力テキストと舵バーの隙間 */
export const HUD_TEXT_GAP = 8;
/** 速力段ラベルの右端は、最も長い速力文字列（"39 kt" を 44px）にかからない位置 */
export const HUD_STEP_OFFSET_X = 150;
export const HUD_STEP_BASELINE_NUDGE = 6;
export const HUD_HEADING_OFFSET_Y = 54;

/** バーチャルスティック（docs/02 §5: 左半分、タッチ開始点に出る） */
export const STICK_RADIUS = 110;
export const STICK_KNOB_RADIUS = 38;
export const STICK_DEAD_ZONE = 0.12;
export const STICK_BASE_ALPHA = 0.35;
export const STICK_KNOB_ALPHA = 0.7;
/** 画面端で円が切れて親指が届かなくならないよう、原点を内側へ寄せる余白（論理 px） */
export const STICK_EDGE_MARGIN = 16;

/** 舵インジケータ（右下）。バーの半幅と高さ */
export const RUDDER_BAR_HALF_WIDTH = 120;
export const RUDDER_BAR_HEIGHT = 6;
export const RUDDER_MARKER_WIDTH = 10;
export const RUDDER_MARKER_HEIGHT = 26;

/** 海のグリッド（世界単位 m）。起動時に Graphics へ 1 回だけ線を記録する（TileSprite は表示サイズ分の canvas を作るため海域全体には使えない） */
export const SEA_GRID_CELL_M = 100;
export const SEA_GRID_LINE_WIDTH = 2;
export const SEA_GRID_COLOR = 0x1a2540;
/** 海域境界線 */
export const SEA_BORDER_WIDTH = 6;
export const SEA_BORDER_COLOR = 0x3a4a6a;
