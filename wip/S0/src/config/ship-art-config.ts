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
