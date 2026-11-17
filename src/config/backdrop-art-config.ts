// 岸の陰の絵の見せ方の定数（v0.8.1 IP1。us_06。実機 1 回目のユーザー「暗い岸という視覚的表現がマップになく…」。assets/backdrop-art と systems/backdrop-fx が読む）。
// ゲームの強さの値ではない（背に岸の係数・距離は data/missions_seed.json の shore_backdrop。絵は判定に従うだけ＝core/backdrop-zone）。CLAUDE.md §2「アート」の作法。何も import しない。
// 絵の鍵は config/game-config の TEXTURE_KEYS に入れない（v0.7.0 からの棚卸し＝tests/art-inventory を変えない。radar-art-config と同じ置き場）。背に岸の無い任務は作らない。

/** 暗い陸（岸の陰の任務の南の陸の際の、黒い丘と密林の帯）の絵の鍵。1 枚の長さ m（Blitter で岸に並べる・1 枚おきに左右を返す＝継ぎ目が合う） */
export const BACKDROP_HILLS_TEX_KEY = 'tex-backdrop-hills';
export const BACKDROP_HILLS_LEN_M = 512;
/** 1 m あたりの px（岸の帯 tex-coast-strip と同じ 1.0） */
export const BACKDROP_HILLS_PX_PER_M = 1;
/**
 * 帯の海の側 m（丘の影が水に落ちる）と陸の側 m（砂浜の後ろから。陸の名の字＝陸の中 300 m の上に掛けない）・砂浜を残す幅 m（「浜」は見える目印のまま）・
 * 陸の奥で今の陸の色へ溶かす幅 m
 */
export const BACKDROP_HILLS_SEA_M = 56;
export const BACKDROP_HILLS_LAND_M = 236;
export const BACKDROP_HILLS_BEACH_M = 24;
export const BACKDROP_HILLS_FADE_M = 80;
/** 丘の影の水の上の α（波打ち際。沖へ 0） */
export const BACKDROP_HILLS_SEA_SHADOW_ALPHA = 0.6;
/** 丘の地の色（今の陸 0x26301e・岸の帯の樹冠 0x2b3a21 より暗い）・尾根の線（星明かりの縁。浜の線 0x8a7a48 より暗い）・樹冠の色の段・樹冠の数と半径 m */
export const BACKDROP_HILLS_BASE_COLOR = 0x0b110a;
export const BACKDROP_HILLS_RIDGE_COLOR = 0x26331f;
export const BACKDROP_HILLS_CROWN_COLORS: readonly number[] = [0x0f170d, 0x131d10, 0x182314];
export const BACKDROP_HILLS_CROWNS = 260;
export const BACKDROP_HILLS_CROWN_R_M: readonly [number, number] = [6, 14];
/** 尾根の数（岸に沿う。1 枚に整数の周期＝継ぎ目なし）と、尾根の奥行き m（砂浜の後ろから） */
export const BACKDROP_HILLS_RIDGES: readonly number[] = [70, 130, 185];
/** 深さ: 岸の帯（1.2）の上・陰の絵の陸（1.25）と同じ段＝輪（1）・光（2）・航跡と艦の下 */
export const BACKDROP_HILLS_DEPTH = 1.25;
/** 絵の乱れの乱数の種（絵だけ。ゲームの乱数とは別） */
export const BACKDROP_ART_SEED = 8101;

/**
 * 岸の陰の海（止まった艦ごと。背に岸が効く自艇の位置の集合＝core/backdrop-zone を格子で塗る）: 格子の 1 辺 m（艇の長さ約 25 m の半分より小さく、テクスチャは横 750 px 以下）・
 * 色・α（一様。IP1 の絵の選び＝案 A: 岸へ近いほど濃くする案 B は艦のそばで薄くて境が読めなかった）・縁の α と幅（升の数。陰の外の升からこの数の内で縁の α へ寄せる＝
 * 判定が変わる線が見える）・境の升の滑らかさ（升の中の SUB × SUB 点で割合を見る＝縁がぎざぎざにならない）
 */
export const BACKDROP_ZONE_GRID_M = 8;
export const BACKDROP_ZONE_COLOR = 0x000308;
export const BACKDROP_ZONE_ALPHA = 0.4;
export const BACKDROP_ZONE_EDGE_ALPHA = 0.75;
export const BACKDROP_ZONE_EDGE_CELLS = 3;
export const BACKDROP_ZONE_EDGE_SUB = 4;
/** 深さ（海の面と格子・きらめき 0.2 の上・帰投の輪と浅瀬 1・光 2・航跡 4・輝点 5・魚雷 8・艦 9・字の下）と、見せる艦が替わる時の α の薄れの ms（見た目の時計） */
export const BACKDROP_ZONE_DEPTH = 0.3;
export const BACKDROP_ZONE_FADE_MS = 400;
/** 艦を「知った」とみなすレーダーの輝点までの m（輝点は 50 m の格子に丸めて置く＝艦から 71 m の内。余裕を見て 100 m） */
export const BACKDROP_ZONE_RADAR_NEAR_M = 100;
/** 岸の陰の海の絵の鍵の頭（隊の艦の添字を足す。任務ごとに描き、世界の破棄で消す＝艦の位置は夜ごとに揺れる） */
export const BACKDROP_ZONE_TEX_PREFIX = 'tex-backdrop-zone-';
