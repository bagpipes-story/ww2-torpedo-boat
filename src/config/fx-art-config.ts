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
export const FIRE_SMOKE_TINT = 0x3a3430;
export const FIRE_HIDE_AFTER_S = 0.3;

/** 深さ（game-config の DEPTH は変えない）: 航跡（暴風の帯 3 の上・雷跡 4 の下）・火災の煙・炎（煙幕 11 の上・砲弾 12 の下）。ADD の物は同じ系統の ＋ADD_DEPTH_STEP にまとめる（R25） */
export const WAKE_DEPTH = 3.5;
export const FIRE_SMOKE_DEPTH = 11.5;
export const ADD_DEPTH_STEP = 0.01;
/** Phaser.BlendModes.ADD（＝1）。explosion-fx が phaser の値の import を避ける */
export const BLEND_ADD = 1;

/** 演出の絵の乱れの乱数の種（絵だけ。ゲームの乱数とは別。毎フレーム使う煙の揺れは世界の絵を作る時に new SeededRng(ART_SEED_FX)＝R30） */
export const ART_SEED_FX = 7301;
