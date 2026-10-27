// 兵装（v0.6.8。spec-v068 §3.2・§4.3・§4.5）の HUD と絵の定数（数は data でなく見た目の値）。何も import しない（tests が node で読める）。
// 世界の値（対空の確率・射程・閃光の秒）は data/hit_rate_model.json の anti_aircraft・gun_flash、艇の砲は boats.json の gun_battery。

/** 艦への機銃の弾のプールの大きさ（艦は数隻、曳光弾は 0.15 秒ほどで落ちる） */
export const ARMS_SHELL_POOL_SIZE = 24;
/** 対空の曳光弾の絵: プールの大きさと 1 本の体感秒 */
export const AA_TRACER_POOL = 8;
export const AA_TRACER_S = 0.12;
/** 対空の曳光弾の行き先のずれ（機の位置からの m。[dx0, dy0, dx1, dy1, …] を順に使う＝乱数なし。まず当たらないのが見える） */
export const AA_TRACER_OFFSETS_M: readonly number[] = [-18, 6, 12, -10, -6, -16, 20, 14, 4, 22, -22, -4, 16, -20, -10, 18];
/** 撃墜した機の落ちる絵: プールの大きさと実秒（回りながら小さく薄くなり、最後に水柱）・回る角度・最後の大きさの倍率 */
export const ARMS_WRECK_POOL = 2;
export const ARMS_WRECK_S = 1.4;
export const ARMS_WRECK_SPIN_DEG = 200;
export const ARMS_WRECK_SCALE_TO = 0.5;
/** 兵装の上の 1 行の文: 魚雷の出来事・撃墜の出来事を出すミリ秒、状態の文を撃ち終えてから残す体感秒 */
export const ARMS_CUE_TORP_MS = 1600;
export const ARMS_CUE_DOWN_MS = 2200;
export const ARMS_CUE_LINGER_S = 0.6;
/** 機銃のボタンの輪の色（橙。魚雷の黄と白黒でも分かる）・撃っている間の色・撃墜の文の色（金） */
export const GUN_BUTTON_STROKE = 0xff9a5a;
export const GUN_FIRING_TINT = 0xffd0a0;
export const CUE_DOWN_COLOR = '#ffd27a';
/** 副兵装（列 2）の大きさ（R56 / R64） */
export const SECONDARY_SCALE = 0.875;
