// v0.7.1 S0（アートと音②：合成の効果音。spec-v0710 §4）: 合図・UI の音の作り方。S0 は ui_tap だけ
// （torp_launch・hull_hit・alarm・light_on・flare_pop・bomb_fall・reload・smoke・bell・engine_cough は S4 で足す）。数は音色の定数（聞かせ方）。
import type { SfxKey } from '../config/sfx-config';
import { envelope, mul, sine, type SfxRecipe } from './sfx-dsp';

/** ui_tap（0.06 秒）: 正弦 880 → 660 Hz・減衰 40 ms。乱数は使わない */
const UI_TAP = { fromHz: 880, toHz: 660, glideS: 0.06, attackS: 0.002, decayS: 0.04 } as const;

function uiTap(n: number): Float32Array {
  return mul(sine(n, UI_TAP.fromHz, UI_TAP.toHz, UI_TAP.glideS), envelope(n, UI_TAP.attackS, UI_TAP.decayS));
}

/** 合図・UI の作り方（鍵 → 関数）。S4 で残りを足す */
export const CUE_RECIPES: Partial<Record<SfxKey, SfxRecipe>> = { ui_tap: uiTap };
