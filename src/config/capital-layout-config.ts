// v0.8.2 S2c（ユーザーの実機の感想 2026-11-18「連装六基で山城、扶桑。航空巡洋艦で最上と軍オタはわかるのですが、デフォルメされすぎているというか、もう少しディティールにこだわれないでしょうか？
// 最上は後部甲板に水上機乗せててもいいと思います」）: 戦艦（山城の 1944 年の姿。扶桑と 1 枚を共有）と重巡（最上の 1944 年の航空巡洋艦の姿）の細部の置き方。S2b の capital-art-config から分けた。
// 位置は資料（scratchpad の facts-S2c: 山城の 3 番砲塔は後ろ向き・艦尾のカタパルトとクレーン・水上機 3 機、最上の前部の 3 基の 3 番が背負い式・後部の甲板・1944 年の 7 機）に合わせた。
// 骨組み（船体・主砲塔の位置と向き・塔の足元・煙突・マスト）は ship-art-config の SHIP_ART_LAYOUTS、描き方の定数は capital-art-config。乱数なし。何も import しない。

/**
 * 1 隻の細部（位置は長さの割合: 艦首 0・艦尾 1。x は B の倍・大きさは単位か割合。角度は度で、艦首へ向く軸を右舷へ回す＋）:
 * turret: 主砲塔 [長さ（L の割合）, 砲身（砲塔から出る長さ。L の割合）, 砲身の太さ（単位）, 連装の砲身の間隔（中心から・単位）]。lifts: 主砲塔ごとの高さの段（0 は甲板・1 は背負い式や高い台。SHIP_ART_LAYOUTS の mounts の順）。
 * tower・aftHouse: 塔の段の表の名（CAPITAL_TOWER_ROWS）と、後部の上部構造 [前, 後, 幅（B 倍）]（無ければ null）。stack: 煙突の台 [幅（B 倍）, 長さ（L の割合）, 最上の傾いた煙突か]。
 * casemates: 舷側の副砲の砲郭の列 [前, 後, 片舷の門数]（無ければ null）。ha・haSize: 連装の高角砲 [位置, x, 砲身の向き] と [幅（B 倍）, 長さ（L の割合）, 砲身（L の割合）, 砲身の太さ, 間隔]。
 * aa3・aa1: 25 mm の三連装・単装 [位置, x]。tubes・tubeSize: 発射管 [位置, x] と [幅（B 倍）, 長さ（L の割合）, 連装の数]。catapults・catapultSize: [位置, x, 角度] と [長さ（L の割合）, 幅（単位）]。
 * planes: 置いた水上機 [位置, x, 角度, 複葉 1・単葉 0]。deck・deckPlanes: 後部の飛行甲板 [前, 後, 前の幅, 後ろの幅（B 倍）, レールの数] と、その上に艦首側から並べる水上機（複葉 1・単葉 0）。
 * cranes: [柱の位置, 柱の x, 先の位置, 先の x]。boats・boatSize: 短艇 [位置, x] と [幅, 長さ（単位）]（舷側寄りにダビット 2）。lockers: 甲板の小物 [位置, x]。yardHalfB: マストの桁の半分（B 倍）
 */
export interface CapitalDetail {
  readonly turret: readonly [number, number, number, number];
  readonly lifts: readonly number[];
  readonly tower: 'fuso' | 'mogami';
  readonly aftHouse: readonly [number, number, number] | null;
  readonly stack: readonly [number, number, boolean];
  readonly casemates: readonly [number, number, number] | null;
  readonly ha: readonly (readonly [number, number, 1 | -1])[];
  readonly haSize: readonly [number, number, number, number, number];
  readonly aa3: readonly (readonly [number, number])[];
  readonly aa1: readonly (readonly [number, number])[];
  readonly tubes: readonly (readonly [number, number])[];
  readonly tubeSize: readonly [number, number, number];
  readonly catapults: readonly (readonly [number, number, number])[];
  readonly catapultSize: readonly [number, number];
  readonly planes: readonly (readonly [number, number, number, 0 | 1])[];
  readonly deck: readonly [number, number, number, number, number] | null;
  readonly deckPlanes: readonly (0 | 1)[];
  readonly cranes: readonly (readonly [number, number, number, number])[];
  readonly boats: readonly (readonly [number, number])[];
  readonly boatSize: readonly [number, number];
  readonly lockers: readonly (readonly [number, number])[];
  readonly yardHalfB: number;
}
const pair = (f: number, x: number): [number, number][] => [[f, x], [f, -x]];
export const CAPITAL_DETAILS: Readonly<Record<'fuso' | 'mogami', CapitalDetail>> = {
  // 山城（1944 年）: 主砲塔 1・2（2 が背負い式で 1 の上へ）・塔の艦橋・3（後ろ向き・高い台）・煙突と探照灯の台・4（後ろ向き）・後部の上部構造と後檣とデリック・5（背負い式）・6、
  // 舷側の砲郭 片舷 7・連装の高角砲 4・25 mm 三連装 8 と単装 8・短艇 4・艦尾の右舷寄りに斜めのカタパルト（零観の形 1 機）と左舷に 1 機・クレーン
  fuso: {
    turret: [0.042, 0.055, 2.2, 3.4], lifts: [0, 1, 1, 1, 1, 0], tower: 'fuso', aftHouse: [0.685, 0.742, 0.36], stack: [0.42, 0.055, false],
    casemates: [0.22, 0.6, 7],
    ha: [[0.335, 0.31, 1], [0.335, -0.31, 1], [0.41, 0.33, -1], [0.41, -0.33, -1]], haSize: [0.12, 0.02, 0.016, 1, 1.5],
    aa3: [...pair(0.375, 0.36), ...pair(0.455, 0.37), ...pair(0.535, 0.36), ...pair(0.66, 0.36)],
    aa1: [...pair(0.25, 0.36), ...pair(0.62, 0.38), ...pair(0.72, 0.31), ...pair(0.79, 0.34)],
    tubes: [], tubeSize: [0, 0, 0],
    catapults: [[0.92, 0.19, 6]], catapultSize: [0.09, 3.4],
    planes: [[0.912, 0.195, 6, 1], [0.885, -0.25, 0, 1]], deck: null, deckPlanes: [],
    cranes: [[0.712, 0, 0.66, -0.27], [0.955, -0.12, 0.905, -0.3]],
    boats: [...pair(0.505, 0.3), ...pair(0.655, 0.3)], boatSize: [5, 14],
    lockers: [[0.12, 0.3], [0.12, -0.3], [0.975, 0.1]], yardHalfB: 0.28,
  },
  // 最上（1944 年の航空巡洋艦）: 前部の連装 3（3 番が背負い式で 2 番の上へ）・塔の艦橋と前檣・傾いた太い煙突・連装の高角砲 4・三連装の発射管 片舷 2・主檣と腕・
  // 25 mm 三連装 10 と単装 8・短艇 2・後部の飛行甲板（レール 3・回転台）の前の両舷に斜めのカタパルト 2、甲板に水上機 5 機（零式水偵の形 3・零観の形 2）
  mogami: {
    turret: [0.036, 0.038, 1.5, 2.4], lifts: [0, 0, 1], tower: 'mogami', aftHouse: null, stack: [0.36, 0.08, true],
    casemates: null,
    ha: [[0.4, 0.32, 1], [0.4, -0.32, 1], [0.44, 0.32, -1], [0.44, -0.32, -1]], haSize: [0.17, 0.02, 0.011, 0.8, 1.3],
    aa3: [...pair(0.29, 0.36), ...pair(0.33, 0.39), ...pair(0.5, 0.15), ...pair(0.545, 0.41), ...pair(0.95, 0.24)],
    aa1: [...pair(0.11, 0.22), ...pair(0.15, 0.36), ...pair(0.6, 0.44), ...pair(0.62, 0.44)],
    tubes: [...pair(0.475, 0.34), ...pair(0.52, 0.34)], tubeSize: [0.2, 0.045, 3],
    catapults: [[0.59, 0.27, 8], [0.59, -0.27, -8]], catapultSize: [0.097, 3.4],
    planes: [], deck: [0.6, 0.955, 0.86, 0.66, 3], deckPlanes: [0, 0, 0, 1, 1],
    cranes: [[0.515, 0, 0.6, -0.28]],
    boats: pair(0.36, 0.34), boatSize: [4, 11],
    lockers: [[0.055, 0.12], [0.055, -0.12], [0.975, 0.1]], yardHalfB: 0.3,
  },
};

/**
 * 塔の段の表（下の段から上へ。[幅（部品の幅の割合）, 長さ（部品の長さの割合）, 中心のずれ（長さの割合。− は艦首）, 形 0 箱・1 八角・2 測距儀の腕・3 丸い方位盤, 探照灯の数（両端。0・2）]）。
 * どの段も部品の箱の内（|ずれ| + 長さ/2 ≤ 1/2・幅 ≤ 1＝tests/capital-art）、最上段がいちばん小さい。山城は前へ傾いた高い塔（段が多く、上ほど前）、後部は 1 段の上部構造と後ろの測距儀
 */
export type TowerRow = readonly [number, number, number, 0 | 1 | 2 | 3, 0 | 2];
export const CAPITAL_TOWER_ROWS: Readonly<Record<'fuso' | 'fusoAft' | 'mogami', readonly TowerRow[]>> = {
  fuso: [
    [0.72, 1, 0, 0, 0], [1, 0.36, 0.06, 0, 2], [0.6, 0.66, -0.04, 1, 0], [0.86, 0.24, -0.08, 0, 2], [0.5, 0.5, -0.1, 1, 0],
    [0.7, 0.2, -0.15, 0, 2], [0.42, 0.34, -0.15, 1, 0], [0.76, 0.08, -0.16, 2, 0], [0.2, 0.14, -0.16, 3, 0],
  ],
  fusoAft: [[1, 1, 0, 0, 0], [0.84, 0.3, 0.12, 0, 2], [0.62, 0.5, -0.06, 1, 0], [0.86, 0.1, -0.06, 2, 0], [0.26, 0.2, -0.06, 3, 0]],
  mogami: [[0.9, 1, 0, 0, 0], [1, 0.4, -0.05, 0, 2], [0.62, 0.6, -0.08, 1, 0], [0.5, 0.36, -0.14, 0, 0], [0.8, 0.1, -0.16, 2, 0], [0.26, 0.16, -0.16, 3, 0]],
};

/**
 * 水上機の寸法（単位＝実寸の m × 2）: 単葉＝零式水偵の形（幅 14.5 m・長さ 11.3 m）・複葉＝零観の形（11 m・9.5 m）。飛行甲板の前の縁から 1 機目の機首までの余白（単位。両舷のカタパルトの後ろ）と、
 * 機と機の間（単位）。重ねて並べると遊ぶ時の大きさで 1 本の帯に見えたので、間を空けて 5 機（1944 年の資料の 6〜7 機のうち甲板に見える数）
 */
export const PLANE_MONO_UNITS: readonly [number, number] = [29, 22.6];
export const PLANE_BI_UNITS: readonly [number, number] = [22, 19];
export const DECK_PLANE_FRONT_UNITS = 18;
export const DECK_PLANE_GAP_UNITS = 4.4;
/** 主砲塔の後ろの測距儀の耳の張り出し（砲塔の幅の割合。山城の 35.6 cm 砲塔。最上は小さい） */
export const TURRET_EARS: Readonly<Record<'fuso' | 'mogami', number>> = { fuso: 0.13, mogami: 0.06 };
