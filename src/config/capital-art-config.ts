// v0.8.2 S2b（us_05「スリガオ海峡・最初の接触」。spec-v0820 §4.11 D-A1〜D-A4、lead の L30〜L32）: 戦艦（扶桑型＝山城・扶桑。tex-battleship-fuso）と重巡（最上。tex-cruiser-mogami）の絵の
// 描き方の定数と、弾薬庫の誘爆（轟沈）の見た目の定数（v0.8.2 S2c: 細部の置き方 CAPITAL_DETAILS は config/capital-layout-config へ分けた）。骨組み（船体の輪郭・船首楼の段・艦橋の足元・煙突・主砲塔・マスト）は ship-art-config の SHIP_ART_LAYOUTS（当たりの形 R22・tests/ship-art）、
// 置き方は assets/capital-plan、描き方は assets/destroyer-paint（新しい部品の型 pagoda・casemate・deck）と destroyer-part-paint（砲は砲身の間隔と太さだけ任意の欄）。
// 色は駆逐艦と同じく陣営のパレットの地の色 1 つの明るさだけ（destroyer-art-config の DESTROYER_TONES）。乱数は使わない（ART_SEED_* は足さない＝今の絵の種を動かさない）。
// ゲームの強さの値ではないので data/*.json には置かない（沈む長さの 0.5 倍も見た目の長さ。沈む本数・誘爆の確率は data の記録）。何も import しない。

/** 甲板の小物の大きさ（単位）・砲郭の列の幅（単位）と船体の縁からの余白（単位。甲板の輪郭の内に収める） */
export const CAPITAL_LOCKER_UNITS: readonly [number, number] = [2.2, 2];
export const CASEMATE_W_UNITS = 5;
export const CASEMATE_EDGE_UNITS = 2;
/** 砲郭の 1 門の張り出し（幅の割合）と、外へ向く短い砲身の太さ（単位） */
export const CASEMATE_SPONSON_SHARE = 0.62;
export const CASEMATE_BARREL_UNITS = 1;

/**
 * 塔（山城の塔の艦橋・後部の上部構造・最上の艦橋。段は capital-layout-config の CAPITAL_TOWER_ROWS）: 高さの長い影（k 段目の影は (k + 1) × これ だけ艦尾へ・右舷へはその PAGODA_SHADOW_X_SHARE 倍。甲板に落ちる）と濃さ、
 * 段の影（上の段が下の段に落とす短い影。単位）と濃さ、窓の帯の太さ（単位）、探照灯の半径（単位）
 */
export const PAGODA_SHADOW_PER_TIER_UNITS = 6;
/** 長い影を 1 つの道にする時の箱のずらしの刻み（単位。細かいほど階段が見えない） */
export const PAGODA_SHADOW_STEP_UNITS = 1.2;
export const PAGODA_SHADOW_X_SHARE = 0.4;
export const PAGODA_SHADOW_ALPHA = 0.3;
export const PAGODA_STEP_SHADOW_UNITS = 2;
export const PAGODA_STEP_SHADOW_ALPHA = 0.5;
export const PAGODA_WINDOW_UNITS = 0.8;
export const PAGODA_LIGHT_UNITS = 1.5;

/** 飛行甲板（最上の見分けの鍵）: 横の板の継ぎ目の間隔（単位）・レールの太さ（単位）・縁の暗い線の太さ（単位）・回転台の半径（単位） */
export const DECK_PLANK_UNITS = 5;
export const DECK_RAIL_UNITS = 1;
export const DECK_EDGE_UNITS = 0.6;
export const DECK_TURNTABLE_UNITS = 2.6;

/**
 * v0.8.2 S2c の細部: 木甲板の縦の板の幅（単位）と継ぎ目の濃さ、板の突き合わせの間隔（単位）、背負い式の砲塔が下へ落とす影（単位。右舷・艦尾へ）と濃さ、
 * 煙突の高さの影（単位）、25 mm の台の半径（三連装・単装。単位）、ダビットの大きさ（単位）、水上機の影のずれ（単位）、クレーンの腕の太さ（単位）、防波堤（艦首からの割合・幅の割合）
 */
export const PLANK_UNITS = 1.5;
export const PLANK_ALPHA = 0.07;
export const PLANK_BUTT_UNITS = 17;
export const LIFT_SHADOW_UNITS = 2.6;
export const LIFT_SHADOW_ALPHA = 0.38;
export const STACK_SHADOW_UNITS = 9;
export const AA_R_UNITS: readonly [number, number] = [2.3, 1.3];
export const DAVIT_UNITS = 2;
export const PLANE_SHADOW_UNITS = 2.2;
export const CRANE_UNITS = 1.1;
/** 木甲板の範囲（長さの割合。外の艦首と艦尾は鋼の甲板＝少し暗く板なし）と、甲板を沈める濃さ（上部構造と砲塔を浮かせる）・鋼の甲板の濃さ */
export const PLANK_ZONE: Readonly<Record<'fuso' | 'mogami', readonly [number, number]>> = { fuso: [0.155, 0.865], mogami: [0.075, 0.6] };
export const DECK_DIM_ALPHA = 0.1;
export const STEEL_DIM_ALPHA = 0.09;
export const BREAKWATER: Readonly<Record<'fuso' | 'mogami', readonly [number, number, number]>> = { fuso: [0.155, 0.185, 0.78], mogami: [0.075, 0.1, 0.7] };

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
