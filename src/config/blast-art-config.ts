// v0.7.0 IP1b（実機 1 回目の直し②。ユーザーの U3「もっと派手な演出、数でも大丈夫」・U4「沿岸砲もリメイク」）: 派手にした演出（爆発の 2 段目・水面の衝撃波・水柱の柱・火花と破片・
// 飛沫の水滴・爆発の煙・砲口の火花と硝煙・沈没の段（2 次の爆発・艦の上の炎・泡））と沿岸砲の絵の定数。ゲームの強さの値ではないので data/*.json には置かない（evac-art-config と同じ考え）。
// 数はすべて世界の作成時に確保するプールの大きさ（update の中で new しない＝CLAUDE.md §7）。何も import しない。見える物の予算は U3 の lead の門（基準 +150）。

/** 爆発の 2 段目（systems/blast-fx。枠は explosion-fx と同じ EXPLOSION_SLOTS・番号も同じ）: 2 つ目の閃光・2 つ目の火球・水柱の柱・水面の衝撃波＝1 枠 4 部品 */
export const BLAST_PARTS = 4;
/** 2 つ目の閃光（遅れ 秒・寿命 秒・半径 m・中心からのずれ m） */
export const BLAST_FLASH2_DELAY_S = 0.12;
export const BLAST_FLASH2_S = 0.24;
export const BLAST_FLASH2_RADIUS_M = 85;
export const BLAST_OFFSET_M = 12;
/** 2 つ目の火球（遅れ・寿命・半径・膨らみの始まり） */
export const BLAST_FIRE2_DELAY_S = 0.1;
export const BLAST_FIRE2_S = 1.0;
export const BLAST_FIRE2_RADIUS_M = 48;
export const BLAST_FIRE2_FROM = 0.3;
export const BLAST_FIRE2_TINT = 0xff8a3a;
/** 水柱の柱（魚雷の命中の白い柱。真上から見た白い塊を縦に伸ばし、上がって落ちる）: 寿命・半径・縦の伸び・上がる高さ m（画面の上へ）・α */
export const BLAST_COLUMN_S = 1.6;
export const BLAST_COLUMN_RADIUS_M = 40;
export const BLAST_COLUMN_STRETCH = 1.9;
export const BLAST_COLUMN_RISE_M = 55;
export const BLAST_COLUMN_ALPHA = 0.95;
/** 水面の衝撃波（tex-shockwave の白い輪。艦艇の下＝航跡の上）: 寿命・終わりの半径・始まりの割合・α・深さ */
export const BLAST_SHOCK_S = 0.7;
export const BLAST_SHOCK_RADIUS_M = 150;
export const BLAST_SHOCK_FROM = 0.12;
export const BLAST_SHOCK_ALPHA = 0.8;
export const BLAST_SHOCK_DEPTH = 3.6;
/** 衝撃波の絵（tex-shockwave。k に依らない固定 px）: 一辺・輪の半径・輪の柔らかい幅 */
export const SHOCK_TEX_PX = 128;
export const SHOCK_TEX_RING_PX = 56;
export const SHOCK_TEX_WIDTH_PX = 6;
/** 爆発の煙（tex-smoke-puff を暗く。煙幕の 60 m より小さく暗い＝R10）: 玉のプール・大きい版の玉の数・小さい版・2 次の爆発・遅れの帯 秒・寿命・半径の始まりと上限 m・α・tint・流れ m/実秒 */
export const BLAST_SMOKE_POOL = 18;
export const BLAST_SMOKE_BIG = 5;
export const BLAST_SMOKE_SMALL = 1;
export const BLAST_SMOKE_SECONDARY = 2;
export const BLAST_SMOKE_DELAY_S: readonly [number, number] = [0.12, 0.55];
export const BLAST_SMOKE_S = 4.5;
export const BLAST_SMOKE_RADIUS_M: readonly [number, number] = [10, 30];
export const BLAST_SMOKE_ALPHA = 0.6;
export const BLAST_SMOKE_TINT = 0xe0d0bc;
export const BLAST_SMOKE_DRIFT_MPS = 9;
export const BLAST_SMOKE_SPREAD_M = 16;

/**
 * 火花と水滴（systems/spark-fx。tex-spark の frame p0＝細長い火の筋・p1＝丸い水滴）。ADD の火花と通常の水滴は別のプール（尽きたら一番古いもの）。
 * 1 回の数: 爆発の破片（大きい版・小さい版・2 次の爆発）、爆発の水滴、水柱の飛沫（外れ・命中）、砲口の火花（大砲・機銃）、火災の火の粉
 */
export const SPARK_HOT_POOL = 48;
export const SPARK_DROP_POOL = 40;
export const SPARK_DEBRIS_BIG = 12;
export const SPARK_DEBRIS_SMALL = 5;
export const SPARK_DEBRIS_SECONDARY = 8;
export const SPARK_DROPS_BIG = 8;
export const SPARK_SPRAY_MISS = 2;
export const SPARK_SPRAY_HIT = 4;
export const SPARK_MUZZLE_BIG = 4;
export const SPARK_MUZZLE_SMALL = 2;
/** 種類ごとの動き（速さ m/秒の帯・寿命 秒の帯・上へ跳ぶ初速 m/秒の帯・筋の長さ m（水滴は半径）・tint）。重さ（下へ）と空気の抵抗は共通 */
export interface SparkKindArt {
  readonly speed: readonly [number, number];
  readonly life: readonly [number, number];
  readonly lift: readonly [number, number];
  readonly size: readonly [number, number];
  readonly tint: number;
}
export const SPARK_KINDS: Readonly<Record<'debris' | 'muzzle' | 'ember' | 'drop' | 'spray' | 'bubble', SparkKindArt>> = {
  debris: { speed: [60, 150], life: [0.6, 1.2], lift: [25, 60], size: [16, 30], tint: 0xffc070 },
  muzzle: { speed: [35, 80], life: [0.14, 0.3], lift: [0, 8], size: [7, 12], tint: 0xfff0b0 },
  ember: { speed: [3, 9], life: [0.7, 1.3], lift: [6, 14], size: [5, 8], tint: 0xff9a40 },
  drop: { speed: [30, 75], life: [0.7, 1.2], lift: [18, 45], size: [2.8, 4.6], tint: 0xe8f4ff },
  spray: { speed: [10, 26], life: [0.4, 0.65], lift: [6, 16], size: [1.8, 3], tint: 0xd8ecff },
  bubble: { speed: [0, 1.5], life: [0.7, 1.2], lift: [0, 0], size: [2.5, 5.5], tint: 0xcfe0ea },
};
/** 重さ（上へ跳んだ高さを戻す m/秒²）・空気の抵抗（1/秒）・高さの見せ方（画面の上へずらす割合＝真上から見た弧） */
export const SPARK_GRAVITY = 95;
export const SPARK_DRAG = 2.2;
export const SPARK_LIFT_SHOW = 0.6;
/** 火花の絵の px（frame 1 枚。p0 は横長の筋・p1 は丸）・深さ（演出の上。ADD は ＋0.01） */
export const SPARK_TEX_W = 32;
export const SPARK_TEX_H = 12;
export const SPARK_DEPTH = 20.02;
/** 硝煙（大砲の砲口だけ。tex-smoke-puff を明るい灰に）: プール・寿命・半径の帯 m・α・tint・流れ m/実秒 */
export const GUN_SMOKE_POOL = 12;
export const GUN_SMOKE_S = 2.0;
export const GUN_SMOKE_RADIUS_M: readonly [number, number] = [6, 22];
export const GUN_SMOKE_ALPHA = 0.55;
export const GUN_SMOKE_TINT = 0xd0d0cc;
export const GUN_SMOKE_DRIFT_MPS = 7;
/** 火災の火の粉（燃えている間・見えている発生源だけ）: 出す間隔 秒 */
export const EMBER_INTERVAL_S = 0.22;

/**
 * 沈没の段（systems/sink-fx。fire-fx の沈没の始まりから）: 枠の数・2 次の爆発の時刻 秒（艦・小艇）と船体の長さに対するずれ、艦の上の炎の数と置く所（船体の長さの割合）・
 * 炎の直径 m・続く秒（終わりで小さくなる）、泡を出す間隔 秒・続く秒・置く半径（船幅の倍）
 */
export const SINK_SLOTS = 2;
export const SINK_BLAST_TIMES_SHIP: readonly number[] = [0.35, 1.0, 1.8, 2.9, 4.2];
export const SINK_BLAST_TIMES_BOAT: readonly number[] = [0.4, 1.3];
export const SINK_BLAST_SPREAD = 0.42;
export const SINK_FLAMES_PER_SLOT = 3;
export const SINK_FLAME_AT: readonly number[] = [-0.3, 0.05, 0.32];
export const SINK_FLAME_DIAMETER_M = 26;
export const SINK_FLAME_S = 6;
export const SINK_BUBBLE_INTERVAL_S = 0.09;
export const SINK_BUBBLE_S = 6.5;
export const SINK_BUBBLE_SPREAD = 1.6;

/** 絵だけの乱数の種（ゲームの乱数とは別＝R30）: 火花・2 段目の爆発・沈没の段・沿岸砲の絵 */
export const ART_SEED_SPARK = 7311;
export const ART_SEED_BLAST = 7312;
export const ART_SEED_SINK = 7313;
export const ART_SEED_BATTERY = 7314;

/**
 * 沿岸砲の絵（U4。assets/battery-shape・battery-art。真上から・海＝北が上）: 絵の全体の一辺 m（論理の BATTERY_SIZE_M 70 の砲台の周りの擬装の縁まで）、
 * コンクリートの床と砲の穴の半径、土嚢の輪（半径・厚み・数・開いた後ろの角）、擬装の網と草木の塊（数・半径の帯・置く半径の帯）、赤い印（敵）の数と輪の太さ、
 * 砲（砲身の長さ・太さ・砲口の太さ・防盾の半径・回り軸から後ろの長さ）、向きの速さ 度/秒・見張りの首振り（振れ 度・周期 秒）・射界の向きの限り 度、反動 m・秒
 */
export const BATTERY_ART_SIZE_M = 120;
export const BATTERY_PAD_R = 30;
export const BATTERY_PIT_R = 19;
export const BATTERY_RAIL_R = 15;
export const BATTERY_BAG_RING_R = 38;
export const BATTERY_BAG_THICK_M = 9;
export const BATTERY_BAGS = 22;
export const BATTERY_BAG_GAP_DEG = 64;
export const BATTERY_NET_BLOBS = 26;
export const BATTERY_NET_R: readonly [number, number] = [6, 10];
export const BATTERY_NET_RING: readonly [number, number] = [41, 48];
export const BATTERY_RED_MARKS = 4;
export const BATTERY_RED_RING_W = 4;
export const BATTERY_GUN_LEN_M = 46;
export const BATTERY_GUN_W_M = 4.6;
export const BATTERY_MUZZLE_W_M = 6.6;
export const BATTERY_SHIELD_R = 10.5;
export const BATTERY_GUN_TAIL_M = 12;
export const BATTERY_TURN_DPS = 45;
export const BATTERY_IDLE_SWING_DEG = 24;
export const BATTERY_IDLE_PERIOD_S = 13;
export const BATTERY_AIM_LIMIT_DEG = 85;
export const BATTERY_RECOIL_M = 6;
export const BATTERY_RECOIL_S = 0.4;
/** 沿岸砲の砲口の閃光（絵だけ。v0.6.11 の BATTERY_FLASH_SCALE 0.6＝半径 24 m・0.12 秒は小さく見えなかった）: 半径 m・寿命 秒 */
export const BATTERY_ART_FLASH_RADIUS_M = 62;
export const BATTERY_ART_FLASH_S = 0.24;
/** 沿岸砲の絵の色（敵の赤は ui の BATTERY_COLOR 0xd0503c と同じ系統。砲は敵の艦と同じ PALETTE_ENEMY の鮭色＝敵味方の読み）: 床・穴・軌条・土嚢 2 色・縫い目・網 3 色・赤・砲身（中・暗・明）・防盾と縁・弾薬箱 */
export const BATTERY_COLORS = {
  pad: 0x6e6b62,
  pit: 0x34322e,
  rail: 0x9a968a,
  bagA: 0xb4a479,
  bagB: 0x968a64,
  seam: 0x4a4434,
  net: [0x2c4428, 0x3b5531, 0x24361f] as readonly number[],
  red: 0xd8503c,
  metal: 0xb97c78,
  metalDark: 0x6a4442,
  metalLight: 0xf2c4c0,
  shield: 0xd08c88,
  shieldRim: 0x5a3c3a,
  ammo: 0x6b5a3a,
} as const;
