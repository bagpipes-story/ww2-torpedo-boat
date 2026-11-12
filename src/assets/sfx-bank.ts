// v0.7.1 S0（アートと音②：合成の効果音。spec-v0710 §2・§4）: 音の鍵 → 標本。renderSfx(key) が作り方（assets/sfx-recipes-*）を呼び、どの鍵にも同じ仕上げを掛ける:
// 直流を引く → 単発は両端 2 ms の fade（ループは継ぎ目を作り方が合わせるので掛けない）→ 頂を 0.9 に正規化。同じ鍵は何度作っても同じ標本（乱数は音だけの種）。
// 起動時に 1 回だけ使う（S1 の systems/sfx-boot が AudioBuffer に写したら Float32Array は捨てる＝ここでは覚えない）。
// 段: S0 は ui_tap・mg・blast_l の 3 本。作り方の無い鍵は sfxImplementedKeys() に入らず、renderSfx は投げる（tests/sfx-inventory が段ごとの鍵を固定する。
// S2〜S4 は sfx-recipes-* の表に足すだけ。25 本そろったら Partial を外す）。
import { SFX_KEYS, SFX_TABLE, type SfxKey } from '../config/sfx-config';
import { fadeEdges, normalizePeak, removeDc, sfxSamples, type SfxRecipe } from './sfx-dsp';
import { BLAST_RECIPES } from './sfx-recipes-blasts';
import { CUE_RECIPES } from './sfx-recipes-cues';
import { GUN_RECIPES } from './sfx-recipes-guns';

const RECIPES: Partial<Record<SfxKey, SfxRecipe>> = { ...GUN_RECIPES, ...BLAST_RECIPES, ...CUE_RECIPES };

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
  removeDc(x);
  if (!def.loop) fadeEdges(x);
  return normalizePeak(x);
}
