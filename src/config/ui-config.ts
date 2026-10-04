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

/** 任務情報（残り時間・命中）の文字サイズ。上中央のビルド番号の下 */
export const HUD_FONT_MISSION_PX = 22;

/** 魚雷ボタン（右下、docs/02 §5）。タップ=1本、長押し→離す=扇状一斉 */
export const TORPEDO_BUTTON_RADIUS = 64;
/** これより短い押下はタップ扱い（秒）。長押しの開き角は、この閾値を超えてからの時間で spread_hold_seconds_for_max に達する */
export const TORPEDO_BUTTON_TAP_MAX_S = 0.3;
export const TORPEDO_BUTTON_ALPHA = 0.55;
export const TORPEDO_BUTTON_PRESSED_SCALE = 0.92;
export const HUD_FONT_BUTTON_PX = 22;

/** 雷跡の点（見た目）。間隔 m、プール数、消えるまでの実時間秒、濃さ */
export const WAKE_DOT_SPACING_M = 25;
export const WAKE_DOT_POOL_SIZE = 240;
export const WAKE_DOT_LIFETIME_S = 25;
export const WAKE_DOT_ALPHA = 0.55;

/** カメラの先読み（m）。進行方向にこの分だけ視点をずらし、前方の視界を広げる（ズーム 0.75 では前方 ≈ 480+320 = 800 m、典型的な発射距離 800yd が見える） */
export const CAMERA_LOOK_AHEAD_M = 320;

/** 画面外の敵マーカー（三角と距離）。画面端からの内側マージン、三角の寸法、距離表示の刻み */
export const TARGET_MARKER_MARGIN = 56;
export const TARGET_MARKER_SIZE = 18;
export const TARGET_MARKER_DISTANCE_STEP_M = 50;
export const TARGET_MARKER_COLOR = 0xe08a8a;
export const HUD_FONT_MARKER_PX = 18;

/** Result で誤タップを拾わないよう入力を受け付けるまでの待ち（ms）とレイアウト */
export const RESULT_INPUT_DELAY_MS = 400;
export const RESULT_TOP_Y = 90;
export const RESULT_LINE_GAP = 14;
export const RESULT_SECTION_GAP = 10;
export const RESULT_FOOTER_Y = 70;
export const RESULT_SEED_Y = 36;

/** 爆発リングの拡大率（命中 / 不発）と不発の色 */
export const EXPLOSION_SCALE_FROM = 0.2;
export const EXPLOSION_SCALE_HIT = 1.6;
export const EXPLOSION_SCALE_DUD = 0.6;
export const EXPLOSION_TINT_HIT = 0xffa040;
export const EXPLOSION_TINT_DUD = 0x9a9a9a;

/** 沈没演出: 縮小率と傾き（度） */
export const SINK_SCALE_TO = 0.6;
export const SINK_TILT_DEG = 18;
/** 魚雷ボタン: 開き角予告の位置（ボタン上端からの隙間）と残弾 0 のときの濃さ */
export const TORPEDO_SPREAD_LABEL_GAP = 8;
export const TORPEDO_BUTTON_EMPTY_ALPHA_FACTOR = 0.4;
/** デバッグ時（?debug）だけ出す見越し点マーカー（docs/02 §6.3「v0.1 はデバッグ切替で常時表示可」） */
export const LEAD_MARKER_SCALE = 0.35;
export const LEAD_MARKER_TINT = 0xffe066;
export const LEAD_MARKER_ALPHA = 0.8;

/** 演出の時間（ms）。爆発リング、沈没、任務終了から Result までの間 */
export const EXPLOSION_DURATION_MS = 600;
export const SINK_DURATION_MS = 2000;
export const MISSION_END_DELAY_MS = 1500;
/** 命中時のカメラ揺れ（ms, 強さ） */
export const HIT_SHAKE_MS = 200;
export const HIT_SHAKE_INTENSITY = 0.004;

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
