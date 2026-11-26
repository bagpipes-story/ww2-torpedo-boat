// v0.8.5 S2（us_07「D-Day・生存者救助」）の絵の定数: 生存者の群・機雷・水路のブイ・機雷原と水路の帯・フィッチとコリーの見せ方・フィッチの砲火の見せ方（systems/rescue-view・assets/rescue-art）。
// CLAUDE.md §2「アート」: コードで描く（外部の画像を使わない）。ゲームの強さの値ではないので data/*.json には置かない（論理に効く拾う距離・機雷の数・輪の半径は data のまま）。何も import しない。
// 色の意味は固定（docs/02 §7）: 味方＝薄い青（フィッチ・コリー・輪）、敵の危険＝赤（機雷の輪・機雷原の帯）、生存者＝救命胴衣の橙。

/** 絵のテクスチャの鍵（Boot が救助の任務のある時に 1 回。生存者は人数ごとの frame p0〜p7＝1〜8 名・ブイは p0 赤（左舷）・p1 緑（右舷）） */
export const RESCUE_TEX_SURVIVORS = 'tex-survivors';
export const RESCUE_TEX_MINE = 'tex-mine';
export const RESCUE_TEX_BUOY = 'tex-buoy';
/** 味方のフレッチャー級（フィッチと沈むコリー）の鍵（assets/destroyer-art の paintAllyFletcherTexture。寸法は RESCUE_SHIP_ENEMY_ID の記録） */
export const RESCUE_TEX_ALLY_SHIP = 'tex-destroyer-ally-us';
/** フィッチとコリーの絵の寸法を取る記録（enemies.json のフレッチャー級。当たりは無い＝絵だけ） */
export const RESCUE_SHIP_ENEMY_ID = 'us_destroyer';
/** テクスチャの密度（1 世界単位の px ＝ RENDER_SCALE × これ。艇の絵と同じ 2） */
export const RESCUE_TEX_DENSITY = 2;

/** 生存者の群の絵: 一辺（単位）・人数の上限（これより多い群はこの数で描く）・人の救命胴衣と頭の半径・その下の泡の半径と濃さ・群の周りの波立ちの半径と濃さ・人の置き方（中心からの単位。多い順に足す） */
export const SURVIVOR_TEX_UNITS = 44;
export const SURVIVOR_HEADS_MAX = 8;
export const SURVIVOR_VEST_R = 2.8;
export const SURVIVOR_HEAD_R = 1.2;
export const SURVIVOR_FOAM_R = 4;
export const SURVIVOR_FOAM_ALPHA = 0.35;
export const SURVIVOR_RIPPLE_R = 20;
export const SURVIVOR_RIPPLE_ALPHA = 0.16;
export const SURVIVOR_SPOTS: readonly (readonly [number, number])[] = [[0, 0], [7, -3], [-6, 4], [3, 8], [-4, -8], [11, 5], [-11, -2], [6, -11]];
export const SURVIVOR_VEST_COLOR = 0xff9a3c;
export const SURVIVOR_HEAD_COLOR = 0x5a3a28;
/** 群の人数の札（世界の字。人数が変わった時だけ setText）: 群の中心からの下へのずれ（単位）・字の大きさ・色 */
export const SURVIVOR_LABEL_DY = 24;
export const SURVIVOR_LABEL_FONT_PX = 22;
export const SURVIVOR_LABEL_COLOR = '#ffd9b0';

/** 機雷（見えた物だけ）: 一辺（単位）・球の半径・角の数と長さ・赤い警告の輪の半径と線と濃さ・色 */
export const MINE_TEX_UNITS = 44;
export const MINE_BALL_R = 7;
export const MINE_HORNS = 5;
export const MINE_HORN_UNITS = 2.8;
export const MINE_RING_R = 19;
export const MINE_RING_LINE = 2.6;
export const MINE_RING_ALPHA = 0.85;
export const MINE_BALL_COLOR = 0x3b3330;
export const MINE_RIM_COLOR = 0x8a7a70;
export const MINE_RING_COLOR = 0xff5a4a;

/** 水路のブイ: 一辺（単位）・半径・縁・左舷（赤）と右舷（緑）の色・水路に沿う間隔 m（両端も置く。合計の上限 BUOY_MAX）・帯の縁から内への寄せ m */
export const BUOY_TEX_UNITS = 20;
export const BUOY_R = 6.5;
export const BUOY_RIM = 1.6;
export const BUOY_RED = 0xd8453b;
export const BUOY_GREEN = 0x3fa15a;
export const BUOY_SPACING_M = 420;
export const BUOY_MAX = 24;
export const BUOY_INSET_M = 10;

/** 水路の帯（任務の開始に 1 回描く Graphics）の薄い色: 色と濃さ。機雷原の区画の赤い色は v0.8.5 IP1 で消した（区画を描かない。ユーザー「わざわざ赤くエリアを示さなくていい」） */
export const LANE_FILL_COLOR = 0xbfe6ff;
export const LANE_FILL_ALPHA = 0.07;

/** フィッチ: 輪の色（味方の青）と濃さ・艦名の字の大きさ・色・艦の下へのずれ（単位） */
export const FITCH_RING_COLOR = 0x9ad0ff;
export const FITCH_RING_ALPHA = 0.55;
export const SHIP_LABEL_FONT_PX = 24;
export const SHIP_LABEL_COLOR = '#b8e0ff';
export const SHIP_LABEL_GAP = 20;
/** 沈んでいくコリー: 暗くする tint・初めと救助の時間の終わりの濃さ（濃さの段の数＝変わった時だけ setAlpha）・横から見た傾き（幅の縮み）・艦首を下げる回り（度）・油の輪の半径 m と濃さ */
export const CORRY_TINT = 0xa9b6c2;
export const CORRY_ALPHA_FROM = 0.95;
export const CORRY_ALPHA_TO = 0.5;
export const CORRY_LIST_SCALE_X = 0.82;
export const CORRY_SETTLE_DEG = 4;
export const CORRY_ALPHA_STEPS = 24;
export const CORRY_OIL_RADIUS_M = 110;
export const CORRY_OIL_ALPHA = 0.32;

/** フィッチの砲火の見せ方（絵だけ・乱数なし）: S ボートがフィッチの砲火の距離の内に居る間の発砲の間隔（実秒）と、S ボートの周りの水柱の決まった 4 点（S ボートからの m） */
export const FITCH_FIRE_INTERVAL_S = 0.9;
export const FITCH_SPLASH_OFFSETS: readonly (readonly [number, number])[] = [[60, -40], [-50, 30], [35, 55], [-40, -60]];

/** 味方の艇（v0.8.5 IP3。systems/friendly-boats-view）: 前の艇からこの距離 m の内の艇は名の札を出さない（隣の群で拾う 2 隻の札が重ならない＝札は 1 つで足りる） */
export const FRIENDLY_LABEL_MERGE_M = 120;

/**
 * 210 mm の砲台の見せ方（v0.8.5 IP5。実機 2 回目「沿岸砲もきちんと描画してください」。systems/shore-guns → systems/shore-battery の artScale）: 絵・砲・砲身・反動・閃光の倍率
 * （us_03 の 75 mm の絵 120 m → 約 190 m。位置は data のまま＝岸の線から陸へ inland_m 600 m）と、砲台の後ろ（南）へ足す陸の幅 m（data の coast.land_m 600 m の陸の端に砲台が載り、
 * 絵の南の半分が陸の外＝背景の色に出ていた。陸の塗りを砲台の y ＋ この幅まで伸ばす。見た目だけ）
 */
export const SHORE_GUNS_ART_SCALE = 1.6;
export const SHORE_GUNS_LAND_PAD_M = 500;
