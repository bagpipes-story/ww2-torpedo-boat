// v0.7.1 S0（アートと音②：合成の効果音。spec-v0710 §2・§4）: 音の鍵 → 標本。renderSfx(key) が作り方（assets/sfx-recipes-*）を呼び、どの鍵にも同じ仕上げを掛ける:
// 直流を引く → 単発は両端 2 ms の fade（ループは継ぎ目を作り方が合わせるので掛けない）→ 頂を 0.9 に正規化。同じ鍵は何度作っても同じ標本（乱数は音だけの種）。
// 起動時に鍵ごとに 1 回だけ使う（systems/sfx-boot が AudioBuffer に写したら Float32Array は捨てる＝ここでは覚えない。S2 から Boot の後の数フレームに 1 本ずつ）。
// 段: S0 は ui_tap・mg・blast_l の 3 本、S2 で砲・水柱・爆発・沈没の 7 本、S3 でループ 5 本、S4 で合図 10 本（sfx-recipes-cues・sfx-recipes-events）＝25 本そろった。
// IP2: 弾倉の交換（reload・reload_end）は sfx-recipes-reload、魚雷の発射は sfx-recipes-launch（どちらも試聴の場の案の表の既定）＝26 本。
// IP4: 魚雷の発射の既定は F（U-R2）。既定の選びは前の案と新しい案の両方が見える sfx-recipes-launch2。
// 表は作り方のファイルごとの Partial を合わせた物なので、作り方の無い鍵は sfxImplementedKeys() に入らず renderSfx は投げる（tests/sfx-inventory が 26 本全部を固定する）。
import { SFX_KEYS, SFX_TABLE, type SfxKey } from '../config/sfx-config';
import { fadeEdges, normalizePeak, removeDc, sfxSamples, type SfxRecipe } from './sfx-dsp';
import { BLAST_RECIPES } from './sfx-recipes-blasts';
import { CUE_RECIPES } from './sfx-recipes-cues';
import { LAUNCH_RECIPES } from './sfx-recipes-launch2';
import { RELOAD_RECIPES } from './sfx-recipes-reload';
import { EVENT_RECIPES } from './sfx-recipes-events';
import { GUN_RECIPES } from './sfx-recipes-guns';
import { LOOP_RECIPES } from './sfx-recipes-loops';
import { SPLASH_RECIPES } from './sfx-recipes-splashes';

const RECIPES: Partial<Record<SfxKey, SfxRecipe>> = { ...GUN_RECIPES, ...SPLASH_RECIPES, ...BLAST_RECIPES, ...CUE_RECIPES, ...RELOAD_RECIPES, ...EVENT_RECIPES, ...LAUNCH_RECIPES, ...LOOP_RECIPES };

/** 作り方のある鍵（SFX_KEYS の順）。起動時の合成・tests・scripts/sfx-mix はこの鍵だけを回す */
export function sfxImplementedKeys(): SfxKey[] {
  return SFX_KEYS.filter((k) => RECIPES[k] !== undefined);
}

/** 鍵の標本を合成する（長さ round(表の秒 × SFX_SAMPLE_RATE)・モノ・頂 0.9）。作り方のまだ無い鍵は投げる */
export function renderSfx(key: SfxKey): Float32Array {
  const recipe = RECIPES[key];
  if (!recipe) throw new Error(`sfx '${key}' の作り方はまだ無い（v0.7.1 の S2〜S4 で足す）`);
  const def = SFX_TABLE[key];
  const n = sfxSamples(def.seconds);
  const x = recipe(n);
  if (x.length !== n) throw new Error(`sfx '${key}' の長さ ${x.length} が表の ${n} と違う`);
  return finishSfx(x, def.loop);
}

/** どの鍵にも同じ仕上げ（直流を引く → 単発は両端 2 ms の fade → 頂 0.9）。x を書き換えて返す。試聴の場の案（assets/sfx-variants）も同じ仕上げ */
export function finishSfx(x: Float32Array, loop: boolean): Float32Array {
  removeDc(x);
  if (!loop) fadeEdges(x);
  return normalizePeak(x);
}
