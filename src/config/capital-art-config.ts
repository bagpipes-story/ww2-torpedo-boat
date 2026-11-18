// v0.8.2 S2b（us_05「スリガオ海峡・最初の接触」。spec-v0820 §4.11 D-A1〜D-A4、lead の L30〜L32）: 戦艦（扶桑型＝山城・扶桑。tex-battleship-fuso）と重巡（最上。tex-cruiser-mogami）の絵の
// 細部と、弾薬庫の誘爆（轟沈）の見た目の定数。骨組み（船体の輪郭・船首楼の段・艦橋の足元・煙突・主砲塔・マスト）は ship-art-config の SHIP_ART_LAYOUTS（当たりの形 R22・tests/ship-art）、
// 置き方は assets/capital-plan、描き方は assets/destroyer-paint（新しい部品の型 pagoda・casemate・deck）と destroyer-part-paint（砲は砲身の間隔と太さだけ任意の欄）。
// 色は駆逐艦と同じく陣営のパレットの地の色 1 つの明るさだけ（destroyer-art-config の DESTROYER_TONES）。乱数は使わない（ART_SEED_* は足さない＝今の絵の種を動かさない）。
// ゲームの強さの値ではないので data/*.json には置かない（沈む長さの 0.5 倍も見た目の長さ。沈む本数・誘爆の確率は data の記録）。何も import しない。

/**
 * 1 隻の細部（位置は長さの割合: 艦首 0・艦尾 1。x は B の倍・大きさは単位か割合）:
 * turret: 主砲塔 [長さ（L の割合）, 砲身の長さ（L の割合）, 砲身の太さ（単位）, 連装の砲身の間隔（中心から・単位）]。tiers: 塔の艦橋の段の数（0 は今の日本の艦橋の形 'ijn'）。
 * casemates: 舷側の副砲の砲郭の列 [前, 後, 片舷の門数]（無ければ null）。ha・haSize: 連装の高角砲 [位置, x, 砲身の向き] と [幅（B 倍）, 長さ（L の割合）, 砲身（L の割合）, 砲身の太さ, 間隔]。
 * tubs: 機銃の台 [位置, x]。catapults・catapultSize: カタパルト [位置, x] と [幅（単位）, 長さ（L の割合）]。deck: 後部の飛行甲板 [前, 後, 幅（B 倍）, レールの数]（無ければ null）。
 * boats・boatSize: 短艇 [位置, x] と [幅, 長さ（単位）]。lockers: 甲板の小物 [位置, x]。yardHalfB: マストの桁の半分の長さ（B 倍）。panelUnits: 甲板の板の継ぎ目の間隔（単位）
 */
export interface CapitalDetail {
  readonly turret: readonly [number, number, number, number];
  readonly tiers: number;
  readonly casemates: readonly [number, number, number] | null;
  readonly ha: readonly (readonly [number, number, 1 | -1])[];
  readonly haSize: readonly [number, number, number, number, number];
  readonly tubs: readonly (readonly [number, number])[];
  readonly catapults: readonly (readonly [number, number])[];
  readonly catapultSize: readonly [number, number];
  readonly deck: readonly [number, number, number, number] | null;
  readonly boats: readonly (readonly [number, number])[];
  readonly boatSize: readonly [number, number];
  readonly lockers: readonly (readonly [number, number])[];
  readonly yardHalfB: number;
  readonly panelUnits: number;
}
export const CAPITAL_DETAILS: Readonly<Record<'fuso' | 'mogami', CapitalDetail>> = {
  // 扶桑型（1944 年の姿の簡略）: 連装の主砲塔 6（前 2・中 2・後 2）・5 段の塔の艦橋・煙突 1・舷側の砲郭 片舷 7・連装の高角砲 4・機銃の台 8・艦尾のカタパルト 1（山城の形）・短艇 4
  fuso: {
    turret: [0.045, 0.028, 2, 3], tiers: 5, casemates: [0.2, 0.47, 7],
    ha: [[0.39, 0.3, 1], [0.39, -0.3, 1], [0.47, 0.3, -1], [0.47, -0.3, -1]], haSize: [0.12, 0.02, 0.012, 1, 1.5],
    tubs: [[0.2, 0.3], [0.2, -0.3], [0.58, 0.34], [0.58, -0.34], [0.7, 0.2], [0.7, -0.2], [0.89, 0.3], [0.89, -0.3]],
    catapults: [[0.915, 0]], catapultSize: [4.6, 0.06], deck: null,
    boats: [[0.55, 0.3], [0.55, -0.3], [0.68, 0.33], [0.68, -0.33]], boatSize: [5, 14],
    lockers: [[0.12, 0.3], [0.12, -0.3], [0.94, 0.15]], yardHalfB: 0.28, panelUnits: 6,
  },
  // 最上（1944 年の航空巡洋艦の形）: 前部の連装の主砲塔 3・日本の艦橋・傾いた煙突 1・連装の高角砲 4・後部の飛行甲板（平らな矩形にレール 3）・その前のカタパルト 2・機銃の台 6・短艇 2
  mogami: {
    turret: [0.036, 0.026, 1.3, 2.2], tiers: 0, casemates: null,
    ha: [[0.375, 0.3, 1], [0.375, -0.3, 1], [0.46, 0.3, -1], [0.46, -0.3, -1]], haSize: [0.17, 0.02, 0.011, 0.8, 1.3],
    tubs: [[0.15, 0.32], [0.15, -0.32], [0.52, 0.3], [0.52, -0.3], [0.95, 0.2], [0.95, -0.2]],
    catapults: [[0.56, 0.24], [0.56, -0.24]], catapultSize: [3.4, 0.05], deck: [0.6, 0.93, 0.78, 3],
    boats: [[0.5, 0.34], [0.5, -0.34]], boatSize: [4, 11],
    lockers: [[0.08, 0.2], [0.08, -0.2], [0.97, 0.1]], yardHalfB: 0.3, panelUnits: 6,
  },
};

/** 機銃の台の大きさ（単位）・甲板の小物の大きさ（単位）・砲郭の列の幅（単位）と船体の縁からの余白（単位。甲板の輪郭の内に収める） */
export const CAPITAL_TUB_UNITS = 4;
export const CAPITAL_LOCKER_UNITS: readonly [number, number] = [2.2, 2];
export const CASEMATE_W_UNITS = 5;
export const CASEMATE_EDGE_UNITS = 2;
/** 砲郭の 1 門の張り出し（幅の割合）と、外へ向く短い砲身の太さ（単位） */
export const CASEMATE_SPONSON_SHARE = 0.62;
export const CASEMATE_BARREL_UNITS = 1;

/**
 * 塔の艦橋（扶桑型の見分けの鍵。高さを段の重なりと影で出す）: 段ごとに幅・長さを縮める割合、前へずらす割合（長さに対して。≤ 縮みの半分＝段は足元の箱の内）、
 * 塔の長い影（k 段目の影は (k + 1) × これ だけ艦尾へ・右舷へはその PAGODA_SHADOW_X_SHARE 倍。甲板に落ちる）と濃さ、段の影（上の段が下の段に落とす短い影。単位）と濃さ、
 * 最上段の測距儀の腕の太さ（単位）と方位盤の半径（最上段の幅の割合）
 */
export const PAGODA_SHRINK_W = 0.17;
export const PAGODA_SHRINK_LEN = 0.16;
export const PAGODA_SHIFT = 0.04;
export const PAGODA_SHADOW_PER_TIER_UNITS = 6.5;
export const PAGODA_SHADOW_X_SHARE = 0.6;
export const PAGODA_SHADOW_ALPHA = 0.32;
export const PAGODA_STEP_SHADOW_UNITS = 1.8;
export const PAGODA_STEP_SHADOW_ALPHA = 0.45;
export const PAGODA_ARM_UNITS = 1.8;
export const PAGODA_DIRECTOR_SHARE = 0.22;

/** 飛行甲板（最上の見分けの鍵）: 横の板の継ぎ目の間隔（単位）・レールの太さ（単位）・縁の暗い線の太さ（単位）・前の端の回転台の半径（幅の割合） */
export const DECK_PLANK_UNITS = 5;
export const DECK_RAIL_UNITS = 1;
export const DECK_EDGE_UNITS = 0.6;
export const DECK_TURNTABLE_SHARE = 0.16;

/**
 * 弾薬庫の誘爆（轟沈。D-A4・L31）の見た目（systems/magazine-fx）: 艦の中央の大きい爆発の大きさ（今の大きい版に対する倍。閃光・火球・水柱・輪と 2 段目の閃光・火球・柱・衝撃波・煙の玉）、
 * 2 次の爆発の遅れ（誘爆の後の実秒）と置く所（艦の中心から艦首の向きへ長さ L の倍。＋は艦首・−は艦尾）、待つ 2 次の爆発の枠の数（戦艦 2 隻 × 2。尽きたら順に上書き）
 */
export const MAGAZINE_BLAST_SIZE = 2.2;
export const MAGAZINE_SECONDARY_DELAY_S: readonly number[] = [0.25, 0.5];
export const MAGAZINE_SECONDARY_AT: readonly number[] = [0.3, -0.3];
export const MAGAZINE_FX_PENDING = 4;
/** 誘爆で沈んだ艦の沈む tween の長さの倍（L32。entities/destroyer の playSinking の任意の引数。ほかの沈み方は 1＝今の SINK_DURATION_MS） */
export const MAGAZINE_SINK_SCALE = 0.5;
