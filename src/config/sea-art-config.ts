// v0.7.0（アートと音①：コードで描く絵）の海の面・夜明けの光・月のきらめき・岸の帯の定数（S3a・S3c の assets/sea-art と systems/sea-fx・coast-fx）。
// ゲームの強さの値ではないので data/*.json には置かない（evac-art-config と同じ考え）。海の色（SEA_COLOR・DAY_SEA_COLOR）と夜明けの 16 段は dawn-config・ui/sea-light のまま。何も import しない。

/** 海の格子の線（100 m ごと。entities/sea）を出すか（R6・決め D5: 既定は残す。消すのはユーザー未確認。?debug&title&nogrid で比べ、実機テストで聞いて次の版で決める） */
export const SEA_GRID_ON = true;

/** 海の模様のテクスチャの 1 m あたりの px（k に依らない固定。陰の 1.5 px/m の先例）と模様の周期（m。512 px の 2 の累乗＝REPEAT で貼れる） */
export const SEA_ART_PX_PER_M = 0.5;
export const SEA_TILE_PERIOD_M = 1024;
/** TileSprite の局所の大きさ（px。setScale で広げる＝その canvas と GPU の写しを小さく。R21） */
export const SEA_TILE_LOCAL_W = 128;
export const SEA_TILE_LOCAL_H = 64;

/** 光（data の moon: dark・half・full・day）ごとの波頭の色・α・月のきらめきの数（spec-v0700 §3.2。夜は α ≤ 0.12） */
export interface SeaLightArt {
  readonly crest: number;
  readonly crestAlpha: number;
  readonly glints: number;
  readonly whitecaps: boolean;
}
export const SEA_LIGHT_ART: Readonly<Record<'dark' | 'half' | 'full' | 'day', SeaLightArt>> = {
  dark: { crest: 0x1c2a46, crestAlpha: 0.1, glints: 0, whitecaps: false },
  half: { crest: 0x2a3c60, crestAlpha: 0.12, glints: 12, whitecaps: false },
  full: { crest: 0x2a3c60, crestAlpha: 0.12, glints: 16, whitecaps: false },
  day: { crest: 0x8fb0c8, crestAlpha: 0.3, glints: 0, whitecaps: true },
};

/** 夜明けの光（東＝画面の右端の橙。α ＝ 最大 × sin(π × 段/16)＝夜 0・移り変わりの中ほどで最大・昼 0。昼から始まる任務は 0。R3・R4）。テクスチャの px と画面からはみ出す割合 */
export const DAWN_GLOW_COLOR = 0xff9a4a;
export const DAWN_GLOW_ALPHA_MAX = 0.22;
export const DAWN_GLOW_TEX_W = 256;
export const DAWN_GLOW_TEX_H = 64;
export const DAWN_GLOW_OVERSCAN = 0.03;

/** 月のきらめき（R9: 砲口炎の星と見分ける＝横に細長い筋・冷たい青白・α ≤ 0.3・ゆっくりした明滅） */
export const GLINT_COLOR = 0xcfe4ff;
export const GLINT_ALPHA_MAX = 0.3;
export const GLINT_TEX_W = 16;
export const GLINT_TEX_H = 8;
export const GLINT_PERIOD_MIN_S = 2;
export const GLINT_SWING_MAX = 0.5;

/** 岸の帯（S3c。砂浜・寄せ波・陸の際の木々）: 1 m あたりの px・1 枚の長さ m・陸の側の幅 m・海の側の寄せ波の幅 m・jp_03 の陰と壕の絵をよける端の透明の幅 m（R16・R24） */
export const COAST_ART_PX_PER_M = 1.0;
export const COAST_STRIP_LEN_M = 512;
export const COAST_STRIP_LAND_M = 112;
export const COAST_STRIP_SEA_M = 8;
export const COAST_STRIP_FADE_M = 16;

/** 深さ（game-config の DEPTH は変えない。ここに絶対値で）: 海の模様・夜明けの光（海の模様の直上＝陸・艇・艦・字の下。R3）・月のきらめき・岸の帯 */
export const SEA_ART_DEPTH = 0.05;
export const DAWN_GLOW_DEPTH = 0.1;
export const GLINT_DEPTH = 0.2;
export const COAST_STRIP_DEPTH = 1.2;

/** 海の絵の乱れの乱数の種（絵だけ。ゲームの乱数とは別。毎フレーム使うきらめきの置き直しは世界の絵を作る時に new SeededRng(ART_SEED_GLINT)＝R30） */
export const ART_SEED_SEA = 7401;
export const ART_SEED_GLINT = 7402;
export const ART_SEED_COAST = 7403;
