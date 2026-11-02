// 味方の駆逐艦 卯月（v0.6.10。jp_04。spec-v0610 §3.3・§3.4）の検査の余裕と見せ方・仕組みの定数（遊びの釣り合いの値ではない。それは data の v0_1_prototype.ally_destroyer）。
// ui-config.ts は 300 行を超えているのでここに置く。Phaser・window を読まない（模擬と検査が読む）。
import { GUNBOAT_TRACER_TINT } from './gunboat-config';

/** V-A1: 泊地から・浜の線の沖・帰投の輪の縁の外・自艇の出発点からの最短 m（海域の縁は米PT の attack.edge_margin_m） */
export const ALLY_ANCHOR_CLEAR_M = 300;
export const ALLY_BEACH_CLEAR_M = 200;
export const ALLY_RING_CLEAR_M = 300;
export const ALLY_START_CLEAR_M = 300;
/** V-A2: 速い PT の見張りの内の点は、見張る線なら扇の内に・見張らない線なら扇の外に、この角 deg 以上 */
export const ALLY_FAN_CLEAR_DEG = 10;
/** V-A4: 卯月から気づかれていない斉射の道（斉射の点 → 泊地）までの最短 m */
export const ALLY_LANE_CLEAR_M = 120;
/** V-A2〜V-A5 の今夜の南北のずれと線の上の標本の刻み m（以下。両端を含む） */
export const ALLY_CHECK_STEP_M = 5;
/** 卯月の砲弾のプール（世界と模擬の createShells に同じ値。WorldSetup.allyDestroyer.shellPoolSize で渡す＝レビュー L8） */
export const ALLY_SHELL_POOL_SIZE = 16;
/** 海の上の見張りの扇の濃さ（ふだん・照らす PT がいる間）。変えるのは真偽が変わったときだけ（S5） */
export const ALLY_FAN_ALPHA = 0.08;
export const ALLY_FAN_ALPHA_ACTIVE = 0.14;
/** 探照灯が消えてから光の絵が消えるまでの実秒（世界の見た目だけ） */
export const ALLY_BEAM_FADE_S = 0.6;
/** 撃ってからこの実秒は艦の字が「砲撃中」 */
export const ALLY_FIRING_LABEL_S = 1.0;
/** 卯月の曳光弾と砲口の閃光（隼艇と同じ薄い青。自艇の 25mm の黄・米PT の赤と見分ける） */
export const ALLY_TRACER_TINT = GUNBOAT_TRACER_TINT;
