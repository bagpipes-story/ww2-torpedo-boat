// 大発掃討（v0.4.2）の見た目の寸法・色・語（論理 px と世界単位）。ゲームの数値ではないので data/*.json には置かない（ui-config.ts が 280 行に近いので分けた）。
/** 弾のプール: 艇（10.5 発/体感秒 × 飛行 0.3 秒まで）、大発の 13mm（4 隻 × 3.3 発/秒 × 0.24 秒）、小さい水柱 */
export const GUN_SHELL_POOL_SIZE = 24;
export const MG_SHELL_POOL_SIZE = 16;
export const GUN_SPLASH_POOL_SIZE = 32;
export const GUN_SPLASH_SCALE_MISS = 0.18;
export const GUN_SPLASH_SCALE_HIT = 0.35;
/** 曳光弾の色: 艇の 20mm・12.7mm は自艇の武器の黄（魚雷と同じ）、40mm・37mm は白に近い黄、大発の 13mm は敵の赤 */
export const GUN_TRACER_TINT = 0xffe066;
export const GUN_HEAVY_TINT = 0xfff6d0;
export const MG_TRACER_TINT = 0xff8a7a;
/** 艇の砲口の閃光（黄。爆発の輪を流用。大発は赤い曳光弾だけで閃光は描かない） */
export const GUN_FLASH_SCALE = 0.35;
export const GUN_FLASH_LIFETIME_S = 0.08;
/** 撃っている大発に重ねる輪 */
export const TARGET_RING_SCALE = 0.3;
export const TARGET_RING_TINT = 0xffe066;
export const TARGET_RING_ALPHA = 0.8;
/** 大発の操舵室（艇尾の暗い四角） */
export const BARGE_WHEELHOUSE_COLOR = 0x0b1020;
export const BARGE_WHEELHOUSE_ALPHA = 0.8;
/** 上陸した大発（灰色で浜に残す） */
export const BARGE_BEACHED_TINT = 0x8a8a8a;
export const BARGE_BEACHED_ALPHA = 0.6;
/** 岸の外の陸（海域の外に描く）と浜の線、ラベル */
export const COAST_LAND_COLOR = 0x26301e;
export const COAST_LINE_COLOR = 0x8a7a48;
export const COAST_LINE_WIDTH = 6;
export const COAST_LABEL_FONT_PX = 36;
export const COAST_TEXT_COLOR = '#a89868';
/** 2 行目の「大発 撃破！」「上陸」を出す ms */
export const BARGE_EVENT_SHOW_MS = 2500;
/** ?debug&barges=near の出発点: 大発の隊の先頭からの差 m と向き（浅瀬の縁（航跡の 100 m 北）の 30 m 外、東向き＝南の舷側が航跡を向く。先頭まで約 468 m） */
export const DEBUG_BARGES_NEAR_OFFSET = { dxM: -450, dyM: -130, headingDeg: 90 } as const;
/** 機銃のボタン（v0.6.8 から全任務。実機 1 回目から全任務で右下の角の魚雷の左。ユーザーの言う「機銃ボタン」。v0.6.7 までは「射撃」）。押している間撃つ */
export const GUN_BUTTON_LABEL = '機銃\n押し続け';
/** 「岸 N m」の砂色の矢印（岸のある任務。南の岸沿いの浅瀬の縁が画面外の間。実機で「大発も浅瀬も出てこない」＝出発点からどこへ行くか分からなかった） */
export const COAST_MARKER_LABEL = '岸';
export const COAST_MARKER_COLOR = 0xd0b878;
export const COAST_MARKER_TEXT_COLOR = '#d0b878';
/** 画面外の矢印のラベル（主兵装が砲の任務。駆逐艦の任務は「敵」） */
export const BARGE_MARKER_LABEL = '大発';
/** 浅瀬の中で、安全速力のこの kt 手前から速力の数字を赤にする（見た目だけ。座礁の前に気づけるように） */
export const SHALLOW_SPEED_WARN_MARGIN_KT = 1;
/** 沿岸砲（v0.4.3）: 砲台の四角（論理単位 m）、射界の半円の色、砲弾の色、閃光、砲弾のプール。
 * 実機 1 回目「陸の色に紛れて見えない」→ 40 m の暗い茶 → 70 m の赤い四角＋明るい縁＋ラベル「沿岸砲」、射界の線を濃く */
export const BATTERY_SIZE_M = 70;
export const BATTERY_COLOR = 0xd0503c;
export const BATTERY_OUTLINE_COLOR = 0xffd8b0;
export const BATTERY_OUTLINE_WIDTH = 6;
export const BATTERY_BARREL_COLOR = 0xffd8b0;
export const BATTERY_BARREL_WIDTH = 10;
export const BATTERY_LABEL = '沿岸砲';
export const BATTERY_LABEL_FONT_PX = 30;
export const BATTERY_LABEL_COLOR = '#ff8a78';
/** ラベルを砲台の下（陸側）に離す m */
export const BATTERY_LABEL_GAP_M = 12;
export const BATTERY_ARC_COLOR = 0xff6b5a;
export const BATTERY_ARC_FILL_ALPHA = 0.1;
export const BATTERY_ARC_LINE_ALPHA = 0.75;
export const BATTERY_ARC_LINE_WIDTH = 4;
export const BATTERY_SHELL_TINT = 0xffb060;
export const BATTERY_SHELL_POOL_SIZE = 6;
export const BATTERY_FLASH_SCALE = 0.6;
export const BATTERY_FLASH_LIFETIME_S = 0.12;
