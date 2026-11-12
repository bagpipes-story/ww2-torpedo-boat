// v0.7.0（アートと音①：コードで描く絵）の艦の絵（駆逐艦・輸送船・卯月）の定数。S2a の assets/destroyer-art・transport-art が起動時に 1 回だけ描く。
// パレットは boat-art-config（敵・輸送船・味方）。ゲームの強さの値ではないので data/*.json には置かない（evac-art-config と同じ考え）。何も import しない。

/**
 * 敵の id → 駆逐艦の絵の鍵（spec-v0700 D3。S2a で world-enemies が shipArtKey(mission.enemyId) を DestroyerGroup の新しい最後の引数で渡し、Destroyer の既存の textureKey に流す。
 * setup には何も足さない＝R15）。表に無い id は SHIP_ART_DEFAULT_KEY（v0.6.11 までの 1 枚）。値は TEXTURE_KEYS の値か、まだ作らない鍵（tests/art-inventory の PLANNED_NEW）
 */
export const SHIP_ART_DEFAULT_KEY = 'tex-destroyer';
export const SHIP_ART_KEY_BY_ENEMY: Readonly<Record<string, string>> = {
  ijn_destroyer: 'tex-destroyer',
  us_destroyer: 'tex-destroyer-us',
};
export function shipArtKey(enemyId: string): string {
  return SHIP_ART_KEY_BY_ENEMY[enemyId] ?? SHIP_ART_DEFAULT_KEY;
}

/**
 * v0.7.0 IP2b: 艦の絵のテクスチャの密度（1 世界単位の px ＝ RENDER_SCALE × これ。表に無い鍵は 1）。絵は ART_TEX_DENSITY 倍の画素で描き、スプライトは 1 / (RENDER_SCALE × これ) で表示する
 * （世界の大きさは今のまま）。2 の冪に限る: (1/k)/S と w·S は丸めが変わらないので displayWidth・displayHeight（卯月の名前の y・航跡・火災が読む）は S = 1 とビット同一（tests/art-inventory）
 */
export const ART_TEX_DENSITY: Readonly<Record<string, number>> = {
  'tex-destroyer': 2, 'tex-destroyer-us': 2, 'tex-destroyer-friendly': 2, 'tex-transport': 2, 'tex-transport-friendly': 2,
  // v0.7.0 IP3（実機 3 回目の U10「自機（魚雷艇）と大発も視覚的なクオリティを上げてください」）: 艇 5 枚・敵の米PT・大発 2 枚。表示は game-config の artImageScale
  'tex-boat-us_elco80': 2, 'tex-boat-us_elco77': 2, 'tex-boat-jp_t38': 2, 'tex-boat-jp_t14': 2, 'tex-boat-jp_h38_hayabusa': 2, 'tex-pt-boat': 2, 'tex-barge': 2, 'tex-barge-friendly': 2,
};
export function artTexDensity(key: string): number {
  return ART_TEX_DENSITY[key] ?? 1;
}

/**
 * 艦の当たりの形（R22）: 当たりは船幅の円を軸に並べたカプセル（core/torpedo-solver。艦首・艦尾まで船幅いっぱい）。絵の輪郭が当たりより痩せないよう、
 * 長さの SHIP_FULL_BEAM_FROM〜TO の間は幅 ≥ SHIP_FULL_BEAM_SHARE × B、艦首の先は画素の 0 行目、艦尾は長さの SHIP_STERN_MIN_SHARE 以上まで描く
 */
export const SHIP_FULL_BEAM_FROM = 0.2;
export const SHIP_FULL_BEAM_TO = 0.85;
export const SHIP_FULL_BEAM_SHARE = 0.92;
export const SHIP_STERN_MIN_SHARE = 0.98;
/** 大発の艇首の道板の幅（船幅に対して。v0.4.2 の placeholder の輪郭＝平たい艇首が見分けの鍵） */
export const BARGE_RAMP_BEAM_SHARE = 0.76;

/** 艦の絵の乱れの乱数の種（絵だけ。ゲームの乱数とは別） */
export const ART_SEED_SHIP = 7101;

/** 艦の絵の形の種類（S2a。spec §4.2）と、鍵 → 形の表。陽炎型（敵の駆逐艦）・フレッチャー級（jp_06 の米駆逐艦）・睦月型（卯月）・輸送船（敵と味方の 2 枚は同じ形で色だけ違う） */
export type ShipArtKind = 'kagero' | 'fletcher' | 'mutsuki' | 'transport';
export const SHIP_ART_KIND_BY_KEY: Readonly<Record<string, ShipArtKind>> = {
  'tex-destroyer': 'kagero', 'tex-destroyer-us': 'fletcher', 'tex-destroyer-friendly': 'mutsuki', 'tex-transport': 'transport', 'tex-transport-friendly': 'transport',
};
export const SHIP_ART_DEFAULT_KIND: ShipArtKind = 'kagero';
export function shipArtKind(key: string): ShipArtKind {
  return SHIP_ART_KIND_BY_KEY[key] ?? SHIP_ART_DEFAULT_KIND;
}

/**
 * 艦の絵の置き方（位置はすべて長さの割合: 艦首 0・艦尾 1。幅は B の倍・大きさは世界単位か長さの割合）。
 * hull: [割合, 半幅（B/2 の倍）] を艦首から艦尾へ（最初は艦首の先 [0, 0]・最後は艦尾。R22: 長さの 0.19〜0.86 は幅いっぱい＝当たりのカプセルを細らせない）。
 * forecastle: 船首楼の段 [位置, 'line'（明るい横線）| 'notch'（切れ込み＝暗い帯）]。null は平甲板。
 * bridge: [前, 後, 幅] 艦橋（上部構造の色の角丸の塊。上面は明るい）。
 * funnels: [位置, 幅（B 倍）, 長さ（割合）] 煙突（暗い楕円に明るい縁）。
 * mounts: [位置, 幅（B 倍）, 砲身の向き 1＝前・−1＝後] 砲。幅 ≥ SHIP_TWIN_MIN_B なら連装の箱（砲身 2 本）、未満は単装の丸い台（砲身 1 本）。
 * tubes: [位置, 幅（B 倍）] 魚雷の発射管の台（中央に明るい筋）。tubs: [位置, 中心の x（B 倍）] 機銃の丸い台。
 * hatches: [前, 後, 幅] 船倉のハッチ（明るい縁の暗い矩形。輸送船）。masts: 位置（明るい点）。derricks: [前, 後] 荷役の腕（中心線の 2 単位の線）。
 */
export interface ShipArtLayout {
  readonly hull: readonly (readonly [number, number])[];
  readonly forecastle: readonly [number, 'line' | 'notch'] | null;
  readonly bridge: readonly [number, number, number];
  readonly funnels: readonly (readonly [number, number, number])[];
  readonly mounts: readonly (readonly [number, number, 1 | -1])[];
  readonly tubes: readonly (readonly [number, number])[];
  readonly tubs: readonly (readonly [number, number])[];
  readonly hatches: readonly (readonly [number, number, number])[];
  readonly masts: readonly number[];
  readonly derricks: readonly (readonly [number, number])[];
}
export const SHIP_ART_LAYOUTS: Readonly<Record<ShipArtKind, ShipArtLayout>> = {
  // 陽炎型の簡略（us_01・us_02）: クリッパー艦首・船首楼の段 30%・連装砲塔 A 15%・艦橋 23〜31%・煙突 2（37%・52%）・四連装の発射管 2（45%・62%）・機銃の台 69%・連装砲塔 X・Y（78%・86%）・丸い艦尾
  kagero: {
    hull: [[0, 0], [0.03, 0.26], [0.08, 0.56], [0.14, 0.8], [0.19, 1], [0.86, 1], [0.93, 0.8], [0.975, 0.56], [1, 0.3]],
    forecastle: [0.3, 'line'], bridge: [0.23, 0.31, 0.6], funnels: [[0.37, 0.4, 0.05], [0.52, 0.4, 0.05]],
    mounts: [[0.15, 0.5, 1], [0.78, 0.5, -1], [0.86, 0.5, -1]], tubes: [[0.45, 0.55], [0.62, 0.55]], tubs: [[0.69, 0.22], [0.69, -0.22]],
    hatches: [], masts: [0.34, 0.57], derricks: [],
  },
  // フレッチャー級（jp_06 の米駆逐艦。新しい鍵 tex-destroyer-us）: 平甲板・単装 5 インチ 5 基（11%・19%・72%・80%・88%）・艦橋 24〜31%・煙突 2（38%・50%）・五連装の発射管 2（56%・64%）・40 mm の台 68%・角のある艦尾
  fletcher: {
    hull: [[0, 0], [0.03, 0.24], [0.08, 0.52], [0.14, 0.78], [0.19, 1], [0.86, 1], [0.95, 0.9], [0.985, 0.72], [1, 0.55]],
    forecastle: null, bridge: [0.24, 0.31, 0.55], funnels: [[0.38, 0.34, 0.045], [0.5, 0.34, 0.045]],
    mounts: [[0.11, 0.36, 1], [0.19, 0.36, 1], [0.72, 0.36, -1], [0.8, 0.36, -1], [0.88, 0.36, -1]], tubes: [[0.56, 0.5], [0.64, 0.5]], tubs: [[0.68, 0.22], [0.68, -0.22]],
    hatches: [], masts: [0.335], derricks: [],
  },
  // 睦月型（卯月。寸法は厳守＝名前の y）: 匙形の艦首・単装 12 cm 4 基（12%・36.5%・70%・88%）・艦橋 19〜26%・船首楼の後ろの切れ込み 27.5%・煙突 2（30%・48%）・三連装の発射管 2（41.5%・58%）
  mutsuki: {
    hull: [[0, 0], [0.02, 0.3], [0.06, 0.62], [0.12, 0.86], [0.19, 1], [0.86, 1], [0.93, 0.82], [0.975, 0.58], [1, 0.3]],
    forecastle: [0.275, 'notch'], bridge: [0.19, 0.26, 0.6], funnels: [[0.3, 0.4, 0.04], [0.48, 0.4, 0.04]],
    mounts: [[0.12, 0.34, 1], [0.365, 0.34, 1], [0.7, 0.34, -1], [0.88, 0.34, -1]], tubes: [[0.415, 0.5], [0.58, 0.5]], tubs: [[0.66, 0.2], [0.66, -0.2]],
    hatches: [], masts: [0.165], derricks: [],
  },
  // 輸送船（敵は灰赤・味方は薄い青。味方の 1 枚は寸法を厳守＝名前と状態の行の y）: 丸い艦首と艦尾・船倉のハッチ 4（前 2・後ろ 2）・中央やや後ろの船橋 50〜62% と煙突 66%・マスト 2 と荷役の腕
  transport: {
    hull: [[0, 0], [0.015, 0.4], [0.04, 0.7], [0.09, 0.9], [0.15, 0.98], [0.19, 1], [0.86, 1], [0.92, 0.92], [0.97, 0.7], [1, 0.4]],
    forecastle: null, bridge: [0.5, 0.62, 0.6], funnels: [[0.66, 0.3, 0.045]], mounts: [], tubes: [], tubs: [],
    hatches: [[0.16, 0.24, 0.5], [0.3, 0.38, 0.5], [0.7, 0.78, 0.5], [0.82, 0.9, 0.5]], masts: [0.27, 0.8], derricks: [[0.2, 0.26], [0.28, 0.35], [0.73, 0.79], [0.81, 0.88]],
  },
};
/** 側の暗い帯（リムの内側。幅 10 単位以上の艦だけ）: 幅（単位）と長さの範囲 */
export const SHIP_SIDE_BAND_UNITS = 2;
export const SHIP_SIDE_BAND_FROM = 0.12;
export const SHIP_SIDE_BAND_TO = 0.9;
/** 中心線の明るい筋（枕の陰影。回転に依らない）: 長さの範囲・半幅（B 倍）・濃さ */
export const SHIP_CENTER_FROM = 0.08;
export const SHIP_CENTER_TO = 0.95;
export const SHIP_CENTER_HALF_W_OF_B = 0.15;
export const SHIP_CENTER_ALPHA = 0.22;
/** 砲: 連装の箱の長さ（割合）・砲身の長さ（割合。単装は 0.025）・砲身の幅（単位）・連装とみなす幅（B 倍）・連装の砲身の間隔（中心から、単位） */
export const SHIP_MOUNT_LEN_SHARE = 0.04;
export const SHIP_BARREL_LEN_SHARE_TWIN = 0.03;
export const SHIP_BARREL_LEN_SHARE_SINGLE = 0.022;
export const SHIP_BARREL_UNITS = 2;
export const SHIP_TWIN_MIN_B = 0.4;
export const SHIP_TWIN_BARREL_DX = 2;
/** 発射管の台の長さ（割合）・機銃の台の半径・マストの点の半径・煙突の明るい縁（単位）・ハッチの明るい縁（単位）・角の丸み・船首楼の段の帯の高さ・艦橋の上面の内寄せと濃さ・荷役の腕の幅 */
export const SHIP_TUBE_LEN_SHARE = 0.035;
export const SHIP_TUB_R = 1.8;
export const SHIP_MAST_R = 1.2;
export const SHIP_FUNNEL_RING_UNITS = 1.5;
export const SHIP_HATCH_BORDER_UNITS = 2;
export const SHIP_CORNER_UNITS = 1.5;
export const SHIP_FORECASTLE_UNITS = 2;
export const SHIP_BRIDGE_TOP_INSET = 2;
export const SHIP_BRIDGE_TOP_ALPHA = 0.5;
export const SHIP_DERRICK_UNITS = 2;
/** 明るい点（砲塔・台の中心）の半径と濃さ */
export const SHIP_DOT_R = 1.2;
export const SHIP_DOT_ALPHA = 0.9;

/** 大発（spec §4.2。輪郭は v0.4.2 の placeholder のまま: 艇首の道板 0.76B・道板の長さ 0.08L・艇尾は角）: 荷台（暗い内側）・荷の点・艇尾の機関と操舵の塊 */
export const BARGE_RAMP_LEN_SHARE = 0.08;
export const BARGE_WELL_INSET_UNITS = 2;
export const BARGE_WELL_FROM = 0.2;
export const BARGE_WELL_TO = 0.66;
export const BARGE_CARGO_DOTS: readonly (readonly [number, number])[] = [[0.3, -0.6], [0.42, 0.6], [0.54, -0.6]];
export const BARGE_CARGO_DOT_R = 1;
export const BARGE_STERN_FROM = 0.72;
export const BARGE_STERN_TO = 0.92;
export const BARGE_STERN_INSET_UNITS = 1.9;
