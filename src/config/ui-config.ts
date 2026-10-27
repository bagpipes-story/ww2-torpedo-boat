// HUD・操作系の見た目の寸法（論理座標 GAME_WIDTH×720（幅は画面の縦横比で 1280〜1584。v0.5.1） の px）。ゲームの数値ではないので data/*.json には置かない。
import type Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, HUD_MARGIN, RENDER_SCALE } from './game-config';
import { markerRightMargin, pinchMaxX, speedHudRightX } from './hud-layout-config';
// 文の色と距離の刻みは hud-text-config（v0.6.1。DOM 無しで ui/hud-lines・ui/dawn-lines が読む）。速力段・見出し・3 行目の文字サイズも（v0.6.7。ui/result-body が読む）
export { HOME_COLOR_TEXT, HOME_MARKER_DISTANCE_STEP_M, HUD_COLOR_STRONG, HUD_COLOR_WARN, HUD_FONT_HEADING_PX, HUD_FONT_STATUS_PX, HUD_FONT_STEP_PX, PLANE_DISTANCE_STEP_M, SHALLOW_WARN_STEP_M } from './hud-text-config';

export const HUD_FONT = 'Menlo, Consolas, monospace';
export const HUD_COLOR = '#9fb3c8';
/** Result の通算の命中率の行の色（v0.5.0。値は v0.6.7 から result-text-config。ui/result-body が DOM 無しで読む） */
export { HUD_COLOR_KPI } from './result-text-config';

/** Text の style。resolution に RENDER_SCALE を渡し、カメラの DPR ズームでぼやけないようにする */
export function hudTextStyle(fontSizePx: number, color: string = HUD_COLOR): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: HUD_FONT, fontSize: `${fontSizePx}px`, color, resolution: RENDER_SCALE };
}

/** HUD の文字サイズと配置（論理 px） */
export const HUD_FONT_DEBUG_PX = 18;
export const HUD_FONT_SPEED_PX = 44;
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

/** 僚艇（v0.4.4）: 自艇と同じ船形に掛ける色（薄い青）、下のラベル、被弾の表示 ms */
export const ESCORT_TINT = 0x9ad0ff;
export const ESCORT_TEXT_COLOR = '#9ad0ff';
export const ESCORT_LABEL = '僚艇';
export const ESCORT_LABEL_FONT_PX = 22;
/** ラベルを船体の下（南）に離す m */
export const ESCORT_LABEL_OFFSET_M = 18;
export const ESCORT_EVENT_SHOW_MS = 2500;

/** 任務情報（残り時間・命中）の文字サイズ。上中央のビルド番号の下 */
export const HUD_FONT_MISSION_PX = 22;
export const HUD_STATUS_OFFSET_Y = HUD_DEBUG_LINE_HEIGHT + HUD_FONT_MISSION_PX + 8;
/**
 * 史実モードの印（v0.5.2 実機 2 回目「FPS の右に［史実］とだけ」）: 左上の FPS と同じ行・同じ大きさで、FPS の右に黄色で。固定文字列なので 1 回だけ描く。
 * x は「FPS 120」（7 文字 × 約 10.8 px）の右に 12 px 空けた所。上中央の「ビルド番号｜データ版」の行（約 80 文字以内）は論理幅 1280 でも x 約 208 から始まるので重ならない
 */
export const HUD_HIST_BADGE_JA = '［史実］';
export const HUD_HIST_BADGE_X = HUD_MARGIN + 88;

/** 魚雷ボタン（右下、docs/02 §5）。タップ=1本、長押し→離す=扇状一斉（タップと長押しの境目 salvo_hold_start_s・本数の刻み salvo_count_step_s は data の hit_rate_model.torpedo_launch。v0.4.8 実機 3 回目まではここに 0.3 秒の閾値があった）。
 * 半径は魚雷・機銃のボタンのテクスチャの大きさ（主兵装の R64。副兵装は SECONDARY_SCALE で縮める）。置き場所は v0.6.8 から config/hud-layout-config の右側の 2 列 */
export const TORPEDO_BUTTON_RADIUS = 64;
/** 扇の角度ボタン（v0.5.1 実機 1 回目）: 魚雷ボタンの下の小さな横長のボタン（幅は魚雷ボタンの直径・高さは hud-layout-config の SPREAD_H）。押すたびに 狭 → 中 → 広（data の salvo_spacing_choices_deg） */
export const SPREAD_BUTTON_H = 40;
export const SPREAD_BUTTON_LABELS = ['狭', '中', '広'] as const;
export const SPREAD_BUTTON_FONT_PX = 20;
export const SPREAD_BUTTON_FILL_ALPHA = 0.22;
export const SPREAD_BUTTON_PRESSED_ALPHA = 0.45;
export const TORPEDO_BUTTON_ALPHA = 0.55;
export const TORPEDO_BUTTON_PRESSED_SCALE = 0.92;
/** Mission が始まってから魚雷ボタンが押下を受けない ms（v0.4.0）。Briefing の「出撃」（?debug 直行では Result の「もう一度」）の右側が魚雷ボタンと重なるので、2 度押しの 2 回目で出だしに 1 本撃たない。出だしの 0.6 秒に撃つ場面は無い */
export const TORPEDO_BUTTON_ARM_MS = 600;
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

/** 燃料計（左上、HP バーの下。docs/02 §6.7）。HP バーのテクスチャを流用。バー＝残り、青い目盛り＝全速で帰投地点の輪まで戻るのに要る燃料（v0.3.3。v0.3.0〜v0.3.2 は巡航基準） */
export const FUEL_GAUGE_OFFSET_Y = HP_BAR_OFFSET_Y + HP_FONT_PX + HUD_TEXT_GAP + HP_BAR_HEIGHT + HUD_TEXT_GAP;
export const FUEL_COLOR_OK = 0xe0c060;
/** 青い目盛りの幅・高さ（論理 px。HP バーの塗りのテクスチャをこの大きさに縮めて使う） */
export const FUEL_TICK_WIDTH = 3;
export const FUEL_TICK_HEIGHT = 18;
export const FUEL_FLAGS_OFFSET_X = 120;
/** 味方＝薄い青（docs/02 §7）。帰投地点の輪・帰投マーカー・燃料の目盛り */
export const HOME_COLOR = 0x8fc8ff;
/** 帰投地点の輪（世界単位 × RENDER_SCALE のテクスチャを半径へ拡縮）。線幅・内側の塗り・濃さ・点滅 */
export const RETURN_RING_TEX_RADIUS_UNITS = 128;
export const RETURN_RING_LINE_WIDTH = 4;
export const RETURN_RING_FILL_ALPHA = 0.08;
export const RETURN_RING_ALPHA = 0.7;
export const RETURN_RING_PULSE_ALPHA = 0.3;
export const RETURN_RING_PULSE_MS = 600;
export const HOME_LABEL_FONT_PX = 28;
/** 浅瀬（docs/02 §6.8）: 砂色の暗い帯。塗り・縁・ラベル。警告の距離の刻み m */
export const SHALLOW_FILL_COLOR = 0x6b5d3a;
export const SHALLOW_FILL_ALPHA = 0.35;
export const SHALLOW_LINE_COLOR = 0xa08a50;
export const SHALLOW_LINE_ALPHA = 0.7;
export const SHALLOW_LINE_WIDTH = 3;
export const SHALLOW_LABEL_FONT_PX = 26;
export const SHALLOW_TEXT_COLOR = '#c8b078';

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

/** Result で誤タップを拾わないよう入力を受け付けるまでの待ち（ms）とレイアウト（v0.4.0 で下端のボタンの分だけ詰めた。ボタンは menu-config） */
export const RESULT_INPUT_DELAY_MS = 400;
export const RESULT_TOP_Y = 56;
export const RESULT_LINE_GAP = 12;
export const RESULT_SECTION_GAP = 10;
export const RESULT_SEED_Y = 24;

/** 爆発リングの拡大率（命中 / 不発）と不発の色 */
export const EXPLOSION_SCALE_FROM = 0.2;
export const EXPLOSION_SCALE_HIT = 1.6;
export const EXPLOSION_SCALE_DUD = 0.6;
export const EXPLOSION_TINT_HIT = 0xffa040;
export const EXPLOSION_TINT_DUD = 0x9a9a9a;

/** 沈没演出: 縮小率と傾き（度） */
export const SINK_SCALE_TO = 0.6;
export const SINK_TILT_DEG = 18;
/** 魚雷ボタン: 本数の予告「一斉 N 本」の位置（ボタン上端からの隙間）と残弾 0 のときの濃さ */
export const TORPEDO_SPREAD_LABEL_GAP = 8;
export const TORPEDO_BUTTON_EMPTY_ALPHA_FACTOR = 0.4;
/** 見越し点マーカー（docs/02 §6.3。v0.5.1 までは ?debug だけ、v0.5.2 から任務を 3 回終えると解放。?debug では常に） */
export const LEAD_MARKER_SCALE = 0.35;
export const LEAD_MARKER_TINT = 0xffe066;
export const LEAD_MARKER_ALPHA = 0.8;
/** 到達秒数（v0.5.2。aim_assist の lead_marker_time。任務を 6 回終えると解放）: マーカーの上に「N 秒」。世界座標の px（既定ズーム 0.75 で約 20 px） */
export const LEAD_MARKER_TIME_PX = 26;
export const LEAD_MARKER_TIME_DY = 36;
export const LEAD_MARKER_TIME_COLOR = '#ffe066';

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

/** 技能の丸ボタン（煙幕・消火・見張り・識別。docs/02 §5。v0.6.8 から右側の 2 列の上の 2 段＝config/hud-layout-config の R_SKILL）。魚雷ボタンより小さい。タップ判定は魚雷ボタンと同じ閾値 */
export const ROUND_BUTTON_RADIUS = 48;
export const ROUND_BUTTON_ALPHA = 0.55;
export const ROUND_BUTTON_DISABLED_ALPHA_FACTOR = 0.4;
export const ROUND_BUTTON_PRESSED_SCALE = 0.92;
/** ピンチズームが数える指の右端（v0.6.8: 右側の 2 列のパネルの左端 − 16 = W − 304。これより右と、ボタンの上で始まった指はズームに使わない） */
export const PINCH_BUTTON_COLUMN_X = pinchMaxX(GAME_WIDTH);
/** ピンチの基準距離の下限（論理 px）。指が重なって距離がほぼ 0 になったときに倍率が跳ねないように */
export const PINCH_MIN_DIST_PX = 40;
/** 画面外マーカーの右端の余白（v0.6.8: 348 = 右側の 2 列のパネルの幅 288・隙間 8・距離ラベル「敵 1500 m」約 100 px の半分 52） */
export const TARGET_MARKER_RIGHT_MARGIN = markerRightMargin(GAME_WIDTH);
/** 右下の速力・舵・針路と機関の熱の帯の右端（v0.6.8: W − 312 = パネルの左端 − 24。v0.6.7 までは W − 176） */
export const SPEED_HUD_RIGHT_X = speedHudRightX(GAME_WIDTH);
/** 「識別」ボタン（v0.3.3）: 味方機が識別を求めている間だけ青く点滅し、残り秒を出す */
export const IDENTIFY_PULSE_HZ = 2.5;
export const IDENTIFY_PULSE_ALPHA_MAX = 0.95;
/**
 * 「一時停止」（v0.5.1 実機 1 回目。ホーム画面のアプリにはブラウザの戻るが無い）: 左端、燃料計の下とスティックの間（燃料計の下端 162・スティックの上端 436 から離す）。
 * 押しても止まるだけ（任務をやめるのは一時停止の画面で 1 秒長押し）。丸は見張りなどの丸ボタンの 3/4
 */
export const PAUSE_BUTTON_SIZE_SCALE = 0.75;
export const PAUSE_BUTTON_X = HUD_MARGIN + ROUND_BUTTON_RADIUS * PAUSE_BUTTON_SIZE_SCALE;
export const PAUSE_BUTTON_Y = 270;
export const PAUSE_BUTTON_LABEL = '一時\n停止';
/** 味方機のプレースホルダー（上から見た十字。世界単位。味方＝薄い青）: 全長・翼幅・胴の幅・尾翼の幅 */
export const AIRCRAFT_LENGTH_UNITS = 48;
export const AIRCRAFT_SPAN_UNITS = 60;
export const AIRCRAFT_BODY_UNITS = 7;
export const AIRCRAFT_TAIL_SPAN_UNITS = 22;
/** 識別の信号弾（星弾のテクスチャを流用）: 色、半径 m の始まり→終わり、寿命 実秒 */
export const FLARE_TINT = 0x8cff8c;
export const FLARE_RADIUS_FROM_M = 10;
export const FLARE_RADIUS_TO_M = 40;
export const FLARE_LIFETIME_S = 1.2;
/** 掃射の着弾（水柱のプールを流用）: 間隔 実秒、機首のこの先に置く m、真上を過ぎてから続ける秒 */
export const STRAFE_SPLASH_INTERVAL_S = 0.06;
export const STRAFE_SPLASH_LEAD_M = 50;
export const STRAFE_SPLASH_TAIL_S = 0.15;
/** 敵の水上機（docs/02 §6.8、v0.4.1）: 照明弾の色（星弾のテクスチャを流用。艦の星弾・識別の緑と区別）、爆弾の点（爆発の輪を流用）の色と落下中の拡大、敵機の画面外マーカー */
export const SEAPLANE_FLARE_TINT = 0xffc070;
export const BOMB_TINT = 0xc0c0c0;
export const BOMB_SCALE_FROM = 0.6;
export const BOMB_SCALE_TO = 1.4;
export const PLANE_MARKER_TOP_MARGIN = HOME_MARKER_TOP_MARGIN + HUD_FONT_MARKER_PX + 20;
/** 暴風の帯（docs/02 §6.8、v0.3.4）: 帯と前線（南の縁）は HP バーの塗りを伸ばして tint、ラベル、雨筋（世界単位。画面内を流れる）、艇の横揺れ、叩きつけの水しぶきの位置と揺れ、HUD の距離の刻み */
export const STORM_BAND_COLOR = 0x5a6a88;
export const STORM_BAND_ALPHA = 0.32;
export const STORM_FRONT_COLOR = 0xa8b8d0;
export const STORM_FRONT_ALPHA = 0.7;
export const STORM_FRONT_WIDTH_M = 8;
export const STORM_LABEL_FONT_PX = 32;
export const STORM_TEXT_COLOR = '#b8c8e0';
export const STORM_LABEL_OFFSET_M = 40;
export const STORM_RAIN_POOL_SIZE = 40;
export const STORM_RAIN_LENGTH_UNITS = 28;
export const STORM_RAIN_WIDTH_UNITS = 2;
export const STORM_RAIN_ALPHA = 0.35;
export const STORM_RAIN_VX_MPS = 180;
export const STORM_RAIN_VY_MPS = 520;
export const STORM_ROLL_DEG = 5;
export const STORM_ROLL_HZ = 0.7;
/** 横揺れの振幅を寄せる割合（1 フレームあたり。帯の出入りで ±5° に跳ねず約 0.3 秒でなめらかに） */
export const STORM_ROLL_LERP = 0.12;
export const STORM_SLAM_BOW_M = 20;
export const STORM_SLAM_SIDE_M = 8;
export const STORM_SLAM_SHAKE_MS = 120;
export const STORM_SLAM_SHAKE_INTENSITY = 0.0012;
export const STORM_WARN_STEP_M = 50;
export const STORM_AHEAD_STEP_M = 100;
/** 乗員の表示（HP バーの右）: 減ったときの「-N」を出す時間 ms、x オフセット */
export const CREW_LOSS_FLASH_MS = 1500;
export const CREW_TEXT_OFFSET_X = HP_BAR_WIDTH + HUD_TEXT_GAP;
/** 乗員の文字を少し下げる（照射中で最長の 3 行目の下端 104 px と触れないように。燃料の注意の行 126 px とは 1 px 以内） */
export const CREW_TEXT_NUDGE_Y = 3;
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
