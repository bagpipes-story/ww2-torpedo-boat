// v0.7.0（アートと音①：コードで描く絵）の演出（航跡・水柱・砲口炎・爆発・炎と煙）の定数と数の上限（S3b・S3c の assets/fx-art と systems/*-fx）。
// ゲームの強さの値ではないので data/*.json には置かない（evac-art-config と同じ考え）。演出は見た目だけ（論理の状態を読むだけで書かない＝R30）。何も import しない。
// 数はすべて世界の作成時に確保するプールの大きさ（update の中で new しない＝CLAUDE.md §7）。

/** 航跡（R1・R7）: V の腕の半角・中央の泡の長さ（船体の長さに対して）・α の上限（雷跡の点 0.55 より薄い）・自艇の静音の泡の α の上限・隠す速さ m/s */
export const WAKE_ARM_HALF_ANGLE_DEG = 19.5;
export const WAKE_CENTER_LENGTH_SHARE = 0.5;
export const WAKE_ALPHA_MAX = 0.35;
export const WAKE_SILENT_ALPHA_MAX = 0.12;
export const WAKE_HIDE_BELOW_MPS = 0.5;

/** 爆発（R11・R12）: 枠の数 × 1 枠の物（閃光・火球・水柱・輪）。5 つ目は一番古い枠を使い回す */
export const EXPLOSION_SLOTS = 4;
export const EXPLOSION_PARTS = 4;

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

/** 演出の絵の乱れの乱数の種（絵だけ。ゲームの乱数とは別。毎フレーム使う煙の揺れは世界の絵を作る時に new SeededRng(ART_SEED_FX)＝R30） */
export const ART_SEED_FX = 7301;
