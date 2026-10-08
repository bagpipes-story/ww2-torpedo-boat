// HUD・操作系の見た目の寸法（論理座標 1280×720 の px）。ゲームの数値ではないので data/*.json には置かない。
import type Phaser from 'phaser';
import { GAME_HEIGHT, HUD_MARGIN, RENDER_SCALE } from './game-config';

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
/** スティックの固定位置（左下。v0.3.1 実機の要望）。画面端から HUD_MARGIN＋この余白だけ内側に台座の中心を置く（親指が届く・端に触れても倒し切れる） */
export const STICK_FIXED_MARGIN = 40;
export const STICK_FIXED_CENTER_X = HUD_MARGIN + STICK_FIXED_MARGIN + STICK_RADIUS;
export const STICK_FIXED_CENTER_Y = GAME_HEIGHT - HUD_MARGIN - STICK_FIXED_MARGIN - STICK_RADIUS;
/** 台座のこの倍率の半径内に触れたら台座の中心が原点（固定スティックの直感）。外なら触れた点が原点 */
export const STICK_GRAB_RATIO = 1.3;

/** 任務情報（残り時間・命中）の文字サイズ。上中央のビルド番号の下 */
export const HUD_FONT_MISSION_PX = 22;
/** 3 行目: 敵影（見えているか）と発見状態（docs/02 §6.5）。発見されたら警告色 */
export const HUD_FONT_STATUS_PX = 20;
export const HUD_STATUS_OFFSET_Y = HUD_DEBUG_LINE_HEIGHT + HUD_FONT_MISSION_PX + 8;
export const HUD_COLOR_WARN = '#ff8a7a';

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

/** HP バー（左上、FPS と表示サイズの下）。幅・高さ・ラベル */
export const HP_BAR_WIDTH = 200;
export const HP_BAR_HEIGHT = 10;
export const HP_BAR_OFFSET_Y = HUD_DEBUG_LINE_HEIGHT * 2 + 6;
export const HP_FONT_PX = 18;
export const HP_COLOR_OK = 0x7fd38a;
export const HP_COLOR_LOW = 0xff8a7a;
/** これ未満の HP 比率で色を警告に */
export const HP_LOW_RATIO = 0.3;

/** 燃料計（左上、HP バーの下。docs/02 §6.7）。HP バーのテクスチャを流用。青い目盛り＝巡航で帰投地点まで戻るのに要る燃料 */
export const FUEL_GAUGE_OFFSET_Y = HP_BAR_OFFSET_Y + HP_FONT_PX + HUD_TEXT_GAP + HP_BAR_HEIGHT + HUD_TEXT_GAP;
export const FUEL_COLOR_OK = 0xe0c060;
export const FUEL_TICK_WIDTH = 3;
export const FUEL_TICK_HEIGHT = 18;
export const FUEL_FLAGS_OFFSET_X = 120;
/** 味方＝薄い青（docs/02 §7）。帰投地点の輪・帰投マーカー・燃料の目盛り */
export const HOME_COLOR = 0x8fc8ff;
export const HOME_COLOR_TEXT = '#8fc8ff';
/** 帰投地点の輪（世界単位 × RENDER_SCALE のテクスチャを半径へ拡縮）。線幅・内側の塗り・濃さ・点滅 */
export const RETURN_RING_TEX_RADIUS_UNITS = 128;
export const RETURN_RING_LINE_WIDTH = 4;
export const RETURN_RING_FILL_ALPHA = 0.08;
export const RETURN_RING_ALPHA = 0.7;
export const RETURN_RING_PULSE_ALPHA = 0.3;
export const RETURN_RING_PULSE_MS = 600;
export const HOME_LABEL_FONT_PX = 28;
export const HOME_MARKER_DISTANCE_STEP_M = 100;

/** 画面外の敵マーカー（三角と距離）。画面端からの内側マージン、三角の寸法、距離表示の刻み */
export const TARGET_MARKER_MARGIN = 56;
export const TARGET_MARKER_SIZE = 18;
export const TARGET_MARKER_DISTANCE_STEP_M = 50;
export const TARGET_MARKER_COLOR = 0xe08a8a;
export const HUD_FONT_MARKER_PX = 18;
/** 上端だけは上中央の HUD 3 行（ビルド番号・夜明けまで・敵影/発見）と左上の HP バー・燃料計に重ならないよう広く取る（燃料計の下端＋三角の半分＋余白） */
export const TARGET_MARKER_TOP_MARGIN = HUD_MARGIN + FUEL_GAUGE_OFFSET_Y + HP_FONT_PX + HUD_TEXT_GAP + HP_BAR_HEIGHT + TARGET_MARKER_SIZE / 2 + 8;
/** 帰投マーカーはラベルを矢印の上に置くので、その分さらに下げる */
export const HOME_MARKER_TOP_MARGIN = TARGET_MARKER_TOP_MARGIN + HUD_FONT_MARKER_PX + 20;

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

/** デバッグ時（?debug）だけ出す距離の円: テクスチャの半径（世界単位。表示時に必要な半径へ拡縮する）、線幅、色、濃さ */
export const DEBUG_RING_RADIUS_UNITS = 500;
export const DEBUG_RING_LINE_WIDTH = 3;
export const DEBUG_RING_TINT_DETECT = 0xff8a7a;
export const DEBUG_RING_TINT_VIS = 0x9fd0ff;
export const DEBUG_RING_ALPHA = 0.5;

/** 反撃の見た目（v0.2.1）。探照灯は長さ 1 単位のテクスチャを射程へ拡大、星弾は半径 1 単位の円を照明半径へ拡大 */
export const SEARCHLIGHT_TEX_LENGTH_UNITS = 256;
export const SEARCHLIGHT_COLOR = 0xfff2c0;
export const SEARCHLIGHT_ALPHA = 0.2;
/** 煙幕に遮られている間の探照灯の濃さ（SEARCHLIGHT_ALPHA に掛ける。向いてはいるが届いていないことを見せる） */
export const SEARCHLIGHT_BLOCKED_ALPHA_FACTOR = 0.4;
export const STARSHELL_TEX_RADIUS_UNITS = 128;
export const STARSHELL_COLOR = 0xfff0b0;
export const STARSHELL_ALPHA = 0.14;
/** 砲弾（主砲: 点、機銃: 曳光弾の短い線）の寸法（世界単位）と色 */
export const SHELL_DOT_UNITS = 5;
export const TRACER_WIDTH_UNITS = 2.5;
export const TRACER_LENGTH_UNITS = 18;
export const SHELL_COLOR = 0xfff6d0;
export const TRACER_COLOR = 0xffb060;
/** 砲弾プール、着弾の水柱（リング）のプールと寿命・大きさ、砲口の閃光 */
export const SHELL_POOL_SIZE = 48;
export const SPLASH_POOL_SIZE = 32;
export const SPLASH_LIFETIME_S = 0.7;
export const SPLASH_SCALE_MISS = 0.45;
export const SPLASH_SCALE_HIT = 0.9;
export const SPLASH_TINT_MISS = 0xa8c8ff;
export const SPLASH_TINT_HIT = 0xffa040;
export const MUZZLE_FLASH_LIFETIME_S = 0.15;
export const MUZZLE_FLASH_SCALE = 0.6;
export const MUZZLE_FLASH_TINT = 0xfff0a0;
/** 被弾時のカメラ揺れ（命中演出より弱く）。最大 HP に対してこの比率未満のダメージは小さな（灰色の）爆発で描く */
export const BOAT_HIT_SHAKE_INTENSITY = 0.002;
export const SMALL_HIT_DAMAGE_RATIO = 0.1;

/** 右上「煙幕」・右中「見張り」の丸ボタン（docs/02 §5）。魚雷ボタンより小さい。タップ判定は魚雷ボタンと同じ閾値 */
export const ROUND_BUTTON_RADIUS = 48;
export const ROUND_BUTTON_ALPHA = 0.55;
export const ROUND_BUTTON_DISABLED_ALPHA_FACTOR = 0.4;
export const ROUND_BUTTON_PRESSED_SCALE = 0.92;
/** 右側の丸ボタンの列（煙幕・消火）の縦の間隔（縁と縁の間） */
export const ROUND_BUTTON_GAP = 48;
/** 画面外マーカーの右端の余白: 右上「煙幕」・右中「見張り」の丸ボタンの列（直径）と距離ラベル（「敵 1500 m」約 100 px）の半分を避ける */
export const TARGET_MARKER_RIGHT_MARGIN = HUD_MARGIN + ROUND_BUTTON_RADIUS * 2 + HUD_TEXT_GAP + 52;
/** 煙幕の煙（見た目）: テクスチャ半径（世界単位。表示時に puff_radius_m へ拡縮）、色、濃さ、プール数（core と同じ） */
export const SMOKE_PUFF_TEX_RADIUS_UNITS = 64;
export const SMOKE_PUFF_COLOR = 0x9aa4b0;
export const SMOKE_PUFF_ALPHA = 0.55;
export const SMOKE_POOL_SIZE = 32;
/** 見張りズーム: 1 フレームあたりの補間係数（dt では割らない。カメラ追従と同じ扱い） */
export const ZOOM_LERP = 0.12;

/** 演出の時間（ms）。爆発リング、沈没、任務終了から Result までの間 */
export const EXPLOSION_DURATION_MS = 600;
export const SINK_DURATION_MS = 2000;
export const MISSION_END_DELAY_MS = 1500;
/** 命中時のカメラ揺れ（ms, 強さ） */
export const HIT_SHAKE_MS = 200;
export const HIT_SHAKE_INTENSITY = 0.004;

/** 舵インジケータ（右下）。バーの半幅と高さ。マーカーは目標方位への残り角を RUDDER_BAR_FULL_DEG で正規化して置く */
export const RUDDER_BAR_HALF_WIDTH = 120;
export const RUDDER_BAR_FULL_DEG = 45;
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
