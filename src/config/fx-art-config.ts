// v0.7.0（アートと音①：コードで描く絵）の演出（航跡・水柱・砲口炎・爆発・炎と煙）の定数と数の上限（S3b の assets/fx-art・fx-shape と systems/wake-fx・explosion-fx、S3c の fire-fx）。
// ゲームの強さの値ではないので data/*.json には置かない（evac-art-config と同じ考え）。演出は見た目だけ（論理の状態を読むだけで書かない＝R30）。何も import しない。
// 数はすべて世界の作成時に確保するプールの大きさ（update の中で new しない＝CLAUDE.md §7）。

/** 航跡（R1・R7）: V の腕の半角・中央の泡の長さ（船体の長さに対して）・α の上限（雷跡の点 0.55 より薄い）・自艇の静音の泡の α の上限・隠す速さ m/s */
export const WAKE_ARM_HALF_ANGLE_DEG = 19.5;
export const WAKE_CENTER_LENGTH_SHARE = 0.5;
export const WAKE_ALPHA_MAX = 0.35;
export const WAKE_SILENT_ALPHA_MAX = 0.12;
export const WAKE_HIDE_BELOW_MPS = 0.5;
/** 航跡のテクスチャ px（頂点＝艇尾が上端の中央・原点 (0.5, 0)。幅/2 ≥ 高さ × tan(半角)＝腕が枠に収まる）。frame p0＝V の腕＋短い中央の泡、p1＝艇尾の泡だけ（sea-art の paintCanvas の frame の名前）（自艇の静音＝R1） */
export const WAKE_TEX_W = 96;
export const WAKE_TEX_H = 128;
export const WAKE_FRAME_V = 'p0';
export const WAKE_FRAME_BUBBLE = 'p1';
/**
 * 船体の種類ごとの航跡（絵の値。速さは論理の状態を読むだけ）: refMps＝α が上限になる速さ（上限で止める）、lenHulls＝航跡の長さの上限（船体の長さの倍）、
 * lenPerHullPerMps＝速さ 1 m/s あたりの長さ（船体の長さの倍）、key＝絵の鍵の名前（tex-wake-boat は小艇の鋭い V・tex-wake-ship は艦の太い泡立った V）。
 * 中央の泡はテクスチャの高さの WAKE_CENTER_LENGTH_SHARE / lenHulls（上限の長さで船体の 0.5 倍＝R7。短い航跡ではもっと短い）
 */
export interface WakeKindArt {
  readonly refMps: number;
  readonly lenHulls: number;
  readonly lenPerHullPerMps: number;
  readonly ship: boolean;
}
export const WAKE_KIND_ART: Readonly<Record<'boat' | 'barge' | 'ship', WakeKindArt>> = {
  boat: { refMps: 20, lenHulls: 2.5, lenPerHullPerMps: 0.125, ship: false },
  barge: { refMps: 5, lenHulls: 1.5, lenPerHullPerMps: 0.3, ship: false },
  ship: { refMps: 15, lenHulls: 1.0, lenPerHullPerMps: 0.07, ship: true },
};
/** 自艇の速力帯ごとの α の割合（上限に掛ける。R1: 巡航は V・全速は長く明るい V）と、静音の泡の長さ（船体の長さの倍） */
export const WAKE_CRUISE_ALPHA_SHARE = 0.7;
export const WAKE_SILENT_LEN_HULLS = 0.35;
/** 船体の絵の α がこれ未満なら航跡を出さない（jp_03 の陰に隠れた隊 0.45・沈没の tween の終わり。見えない船体の航跡を出さない） */
export const WAKE_HULL_ALPHA_MIN = 0.5;
/** jp_03 の 18 隻は隊長艇だけ航跡を出す（spec §5.7「+40 を超えそうなら僚艇の航跡を隠す」。S3b の計測で最初から true＝見える物 +6） */
export const WAKE_EVAC_LEADERS_ONLY = true;
/** 航跡の腕の絵（白。太い下塗り＋細い芯。遠い端へ向けて細く薄く）: 腕の根元と端の幅 px・α、中央の泡の幅 px・α（R7: 腕が主・泡は薄く短い） */
export const WAKE_ARM_WIDTH_PX: readonly [number, number] = [4, 10];
export const WAKE_ARM_ALPHA: readonly [number, number] = [1.0, 0.0];
export const WAKE_CENTER_WIDTH_PX = 10;
export const WAKE_CENTER_ALPHA = 0.55;
export const WAKE_SHIP_ARM_WIDTH_PX: readonly [number, number] = [5, 16];
export const WAKE_SHIP_CENTER_WIDTH_PX = 22;

/** 爆発（R11・R12）: 枠の数 × 1 枠の物（閃光・火球・水柱／暗い玉・輪）。5 つ目は一番古い枠を使い回す */
export const EXPLOSION_SLOTS = 4;
export const EXPLOSION_PARTS = 4;
/** 爆発の部品の寿命 秒（輪は ui-config の EXPLOSION_DURATION_MS のまま）: 大きい版の閃光・小さい版の閃光（R11）・火球・水柱・小さい版の暗い玉 */
export const EXPLOSION_FLASH_S = 0.15;
export const EXPLOSION_SMALL_FLASH_S = 0.1;
export const EXPLOSION_FIRE_S = 0.5;
export const EXPLOSION_SPLASH_S = 0.8;
export const EXPLOSION_PUFF_S = 0.6;
/** 爆発の部品の世界の半径 m（テクスチャの半径 40 単位＝爆発の輪と同じ寸法に対する scale に直す）: 閃光（大・小）・火球（膨らみの始まりの割合つき）・水柱（同）・暗い玉（≤ 煙の玉の上限 15 m） */
export const EXPLOSION_FLASH_RADIUS_M = 70;
export const EXPLOSION_SMALL_FLASH_RADIUS_M = 30;
export const EXPLOSION_FIRE_RADIUS_M = 36;
export const EXPLOSION_FIRE_GROW_FROM = 0.35;
export const EXPLOSION_SPLASH_RADIUS_M = 44;
export const EXPLOSION_SPLASH_GROW_FROM = 0.5;
export const EXPLOSION_SPLASH_ALPHA = 0.9;
export const EXPLOSION_PUFF_RADIUS_M = 14;
export const EXPLOSION_PUFF_GROW_FROM = 0.6;
/** 閃光と火球の tint（ADD で重ねる＝暖かい黄白と橙）、水柱は白のまま */
export const EXPLOSION_FLASH_TINT = 0xfff2c0;
export const EXPLOSION_FIRE_TINT = 0xffb060;

/** 演出の絵（Boot で 1 回。tex-splash・tex-muzzle-flash・tex-fireball＝爆発の輪と同じ寸法 96×96 at k 1.09）: 水柱の飛沫の筋の数・端の半径の帯・太さの帯・芯と外の輪の半径、砲口炎の光芒の数と長さの比 */
export const SPLASH_DROPLETS = 14;
export const SPLASH_DROPLET_R: readonly [number, number] = [0.08, 0.16];
export const SPLASH_DROPLET_RING: readonly [number, number] = [0.55, 0.9];
export const SPLASH_CORE_R = 0.45;
export const SPLASH_RING_R = 0.82;
export const MUZZLE_RAYS = 8;
export const MUZZLE_RAY_LEN: readonly [number, number] = [1.0, 0.55];
export const MUZZLE_RAY_HALF_W = 0.07;
export const MUZZLE_CORE_R = 0.3;

/** 炎と煙（R10・R26）: 発生源の枠・煙の玉のプール・玉の半径の上限 m（煙幕の 60 m の 1/4）・α の上限・持ち主が見えなくなってから消すまでの秒 */
export const FIRE_SOURCES = 6;
export const FIRE_PUFFS = 16;
export const FIRE_SMOKE_MAX_RADIUS_M = 15;
export const FIRE_SMOKE_MAX_ALPHA = 0.5;
/** 煙の玉の tint（tex-smoke-puff の地 0x9aa4b0 に掛けて約 #6a645e＝暗い茶灰（煙幕の青灰 0x9aa4b0 より暗く小さい）。#3a3430 そのままの tint だと夜の海 #0b1020 に沈んで見えなかった＝S3c の写し） */
export const FIRE_SMOKE_TINT = 0xb09c88;
export const FIRE_HIDE_AFTER_S = 0.3;
/** 炎（tex-flame。k に依らない固定 px の frame 2 枚・ADD）: 1 frame の px・炎の体（芯と舌）はテクスチャの半径の FLAME_BODY_SHARE まで、外は薄い赤い光の暈（ADD＝夜に炎が読める）・
 * 炎の体の直径＝船幅 × 割合（小艇で船体の色を覆わない）と上限 m・ちらつき（α の帯・大きさの振れ・周期 秒・frame を替える秒）・舌の数 */
export const FLAME_TEX_PX = 64;
export const FLAME_BODY_SHARE = 0.5;
export const FLAME_BEAM_SHARE = 0.8;
export const FLAME_MAX_DIAMETER_M = 16;
export const FLAME_ALPHA: readonly [number, number] = [0.75, 1];
export const FLAME_SCALE_SWING = 0.15;
export const FLAME_FLICKER_S = 0.37;
export const FLAME_FRAME_S = 0.11;
export const FLAME_TONGUES = 7;
/** 火災の煙の玉: 出す間隔 秒・寿命 秒・膨らみの始まりの割合・小艇の玉の半径の上限 m（艦は FIRE_SMOKE_MAX_RADIUS_M）・風下へ流れる向き（方位 度）と速さ m/実秒・出す所の散らばり（船幅の割合） */
export const FIRE_PUFF_INTERVAL_S = 0.25;
export const FIRE_PUFF_LIFE_S = 2.5;
export const FIRE_PUFF_GROW_FROM = 0.35;
/** 煙の玉が濃いまま保つ寿命の割合（その後に薄れる） */
export const FIRE_PUFF_HOLD_SHARE = 0.4;
export const FIRE_PUFF_BOAT_RADIUS_M = 9;
export const FIRE_DRIFT_DEG = 65;
export const FIRE_DRIFT_MPS = 24;
export const FIRE_PUFF_JITTER_SHARE = 0.25;
/** 沈没の始まり（R: spec §5.4）: 泡と油の輪（tex-splash を大きく薄く）の数・寿命 秒・α・tint・半径 m（艦・小艇）と、煙の玉を出し続ける秒 */
export const SINK_RINGS = 2;
export const SINK_RING_S = 3;
export const SINK_RING_ALPHA = 0.35;
export const SINK_RING_TINT = 0xb8c4cc;
export const SINK_RING_RADIUS_M: readonly [number, number] = [110, 30];
export const SINK_PLUME_S = 4;
export const SINK_RING_DEPTH = 3.45;
/** 味方の輸送船（jp_04。絵は entities/ally-ship の私的な Image）の炎の船幅 m（輸送船の絵の幅 32 単位） */
export const FIRE_ALLY_SHIP_BEAM_M = 32;

/** 深さ（game-config の DEPTH は変えない）: 航跡（暴風の帯 3 の上・雷跡 4 の下）・火災の煙・炎（煙幕 11 の上・砲弾 12 の下）。ADD の物は同じ系統の ＋ADD_DEPTH_STEP にまとめる（R25） */
export const WAKE_DEPTH = 3.5;
export const FIRE_SMOKE_DEPTH = 11.5;
export const ADD_DEPTH_STEP = 0.01;
/** Phaser.BlendModes.ADD（＝1）。explosion-fx が phaser の値の import を避ける */
export const BLEND_ADD = 1;

/**
 * 探照灯・星弾・煙幕の絵（S3c。R2・R32。鍵・寸法・原点は v0.6.11 のまま＝scale は論理の射程・照明半径・煙の半径から）。どれも画素ごとの式（assets/light-shape）で 1 回描く。
 * 探照灯: 光源から長さの SL_FULL_TO までは α 1、そこから先端へ SL_TIP_ALPHA に下がる。横は半幅の外側 SL_SOFT_SHARE だけ柔らかく、扇の縁で SL_EDGE_ALPHA（縁は論理の角のまま見える）。
 *   光源の近く（長さの SL_HOT_TO まで）は白へ寄せる（色だけ。α は 1 のまま）。
 * 星弾: 芯（半径の SS_CORE_R まで α 1 → 面）・半径の SS_RIM_FROM まで平らな面 SS_PLATEAU・そこから縁へ明るい細い縁（山 SS_RIM_PEAK）・半径で 1 px の縁取りで 0。
 * 煙幕: 半径ごとの α の折れ線（SMOKE_PROFILE。今の 3 重の円の帯の α 0.70・0.58・0.35 に合わせる）× 角度の塊（3 つと 5 つの山。輪ごとの平均は 1＝帯の α は変わらない・半径の SMOKE_LUMP_TO の内だけ＝輪郭は丸のまま）
 */
export const SL_FULL_TO = 0.5;
export const SL_TIP_ALPHA = 0.8;
export const SL_SOFT_SHARE = 0.1;
export const SL_EDGE_ALPHA = 0.6;
export const SL_HOT_TO = 0.12;
export const SS_CORE_R = 0.28;
export const SS_PLATEAU = 0.72;
export const SS_RIM_FROM = 0.92;
export const SS_RIM_PEAK = 1;
export const SMOKE_PROFILE: readonly (readonly [number, number])[] = [[0, 0.78], [0.3, 0.71], [0.45, 0.6], [0.6, 0.56], [0.7, 0.56], [0.75, 0.42], [0.85, 0.37], [0.95, 0.34], [1, 0]];
export const SMOKE_LUMP = 0.22;
export const SMOKE_LUMP_TO = 0.93;

/** 演出の絵の乱れの乱数の種（絵だけ。ゲームの乱数とは別。毎フレーム使う煙の揺れは世界の絵を作る時に new SeededRng(ART_SEED_FX)＝R30） */
export const ART_SEED_FX = 7301;
