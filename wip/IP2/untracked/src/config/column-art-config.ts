// v0.7.0 IP2（実機 2 回目の直し。ユーザーの U7「魚雷の爆発はもっと轟沈感を出すために派手に水柱を立たせてください」）: 魚雷の命中の水柱（systems/torpedo-column-fx・assets/column-shape）の定数。
// 砲撃・爆撃の命中（U6「眩しい」）の柱 BLAST_COLUMN_*（上がる高さ 55 m）の約 3.5 倍の高さ（190 m）・太さは艦の幅の約 3〜4 倍。真上から見た画面なので「高さ」は画面の上へずらして見せる（IP1b の柱と同じ見せ方）。
// ゲームの強さの値ではないので data/*.json には置かない（evac-art-config と同じ考え）。数はすべて世界の作成時に確保するプールの大きさ（update で new しない＝CLAUDE.md §7）。何も import しない。

/** 同時に立つ水柱の枠（尽きたら一番古い枠を使い回す）と 1 枠の物: 柱の塊・根元の飛沫・輪 2（飛沫の輪と泡の輪）・霧 */
export const COLUMN_SLOTS = 3;
export const COLUMN_BLOBS = 6;
export const COLUMN_SKIRTS = 2;
export const COLUMN_MISTS = 3;
/** 1 枠の Image の数（柱の塊＋根元の飛沫＋輪 2＋霧） */
export const COLUMN_PARTS = COLUMN_BLOBS + COLUMN_SKIRTS + 2 + COLUMN_MISTS;
/** 落ちる水滴のプール（全部の枠で分ける）と 1 本の柱が落とす数 */
export const COLUMN_RAIN_POOL = 28;
export const COLUMN_RAIN_PER = 14;

/**
 * 柱の時間（秒）: 上がる（0〜RISE。速く上がって緩む）→ 保つ（〜HOLD_END。少し伸びて頂が広がる）→ 崩れる（〜FALL_END。縮みながら広がり薄れる＝落ちる飛沫）。
 * 高さ m（画面の上へ）・保つ間の伸び・崩れの終わりに残る高さの割合
 */
export const COLUMN_RISE_S = 0.6;
export const COLUMN_HOLD_END_S = 1.5;
export const COLUMN_FALL_END_S = 3.2;
export const COLUMN_HEIGHT_M = 190;
export const COLUMN_HOLD_GROW = 0.08;
export const COLUMN_FALL_LEFT = 0.12;
/** 柱の塊の半径 m（tex-splash の外の半径＝見える塊はその約 0.6）: 根元と頂（頂ほど太い＝噴き上がって開く）・縦の伸び・崩れで広がる割合・α・色（根元は白に近く、頂ほど灰青。同じ明るさの帯で眩しくしない＝U6） */
export const COLUMN_BLOB_R_BASE_M = 62;
export const COLUMN_BLOB_R_TOP_M = 96;
export const COLUMN_BLOB_STRETCH = 1.3;
export const COLUMN_FALL_SPREAD = 0.9;
export const COLUMN_BLOB_ALPHA = 0.9;
export const COLUMN_TINT_BASE = 0xe6edf1;
export const COLUMN_TINT_TOP = 0xc4d0d8;
/** 根元の飛沫（tex-splash を平たく 2 つ）: 半径 m・平たさ・膨らみの終わりの割合・寿命・α・色 */
export const COLUMN_SKIRT_R_M = 72;
export const COLUMN_SKIRT_FLAT = 0.6;
export const COLUMN_SKIRT_GROW = 1.7;
export const COLUMN_SKIRT_S = 2.8;
export const COLUMN_SKIRT_ALPHA = 0.85;
export const COLUMN_SKIRT_TINT = 0xdce6ec;
/** 飛沫の輪（tex-shockwave。速い）: 寿命・半径 m の始まりと終わり・α・色 */
export const COLUMN_SPRAY_RING_S = 0.9;
export const COLUMN_SPRAY_RING_R_M: readonly [number, number] = [25, 120];
export const COLUMN_SPRAY_RING_ALPHA = 0.6;
export const COLUMN_SPRAY_RING_TINT = 0xe2eaf0;
/** 泡の輪（崩れた水が水面に広がる。遅い）: 始まり・寿命・半径 m・α・色 */
export const COLUMN_FOAM_RING_AT_S = 1.5;
export const COLUMN_FOAM_RING_S = 4.0;
export const COLUMN_FOAM_RING_R_M: readonly [number, number] = [50, 190];
export const COLUMN_FOAM_RING_ALPHA = 0.45;
export const COLUMN_FOAM_RING_TINT = 0xcfdae2;
/** 残る霧（tex-smoke-puff を明るい灰に。煙幕の 60 m より小さく薄い＝R10 と同じ考え）: 始まり・寿命・半径 m（始まりと上限）・α・色・置く高さ（柱の高さの割合の帯）・風下へ流れる m/実秒・沈む m/実秒 */
export const COLUMN_MIST_AT_S = 1.2;
export const COLUMN_MIST_S = 5.0;
export const COLUMN_MIST_R_M: readonly [number, number] = [16, 30];
export const COLUMN_MIST_ALPHA = 0.3;
export const COLUMN_MIST_TINT = 0xdfe6ea;
export const COLUMN_MIST_HEIGHT: readonly [number, number] = [0.05, 0.55];
export const COLUMN_MIST_DRIFT_MPS = 6;
export const COLUMN_MIST_SINK_MPS = 12;
/** 落ちる水滴（崩れ始めに柱の頂の近くから落ちる白い粒＝tex-spark の p1）: 放つ時刻・高さの帯（柱の高さの割合）・横の散らばり（頂の半径の割合）・横へ飛ぶ速さの帯 m/秒・重さ m/秒²・半径の帯 m・色 */
export const COLUMN_RAIN_AT_S = 1.4;
export const COLUMN_RAIN_HEIGHT: readonly [number, number] = [0.4, 1.0];
export const COLUMN_RAIN_SPREAD = 0.9;
export const COLUMN_RAIN_VX: readonly [number, number] = [4, 20];
export const COLUMN_RAIN_GRAVITY = 150;
export const COLUMN_RAIN_R_M: readonly [number, number] = [2.4, 4.2];
export const COLUMN_RAIN_TINT = 0xe2ecf2;
/** 枠の寿命（霧の終わりまで） */
export const COLUMN_SLOT_S = COLUMN_MIST_AT_S + COLUMN_MIST_S;
/** 深さ: 柱・根元の飛沫・水滴は艦艇と演出の上（ADD の閃光・火球 effects+0.01 の下）、輪は艦艇の下（衝撃波と同じ 3.6）、霧は火災の煙の高さ */
export const COLUMN_RING_DEPTH = 3.6;
/** 絵だけの乱数の種（ゲームの乱数とは別＝R30） */
export const ART_SEED_COLUMN = 7315;
