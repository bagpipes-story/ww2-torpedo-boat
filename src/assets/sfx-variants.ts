// v0.7.1 IP2（実機 2 回目）: 音の試聴の場（?sfxlab の「効果音の試聴へ」。scenes/sound-lab-scene）で聞き比べる案の表。弾倉の始め（reload）・弾倉の終わり（reload_end）・魚雷の発射（torp_launch）。
// 案の標本は renderSfx と同じ仕上げ（assets/sfx-bank の finishSfx）で作る＝既定の案の標本は renderSfx(鍵) とビット同一（tests/sfx-variants）。試聴の場は押された時に 1 回だけ作って覚える
// （起動時には作らない）。v0.7.1 IP3（実機 3 回目）で弾倉は B（U-R1）、IP4（実機 4 回目「魚雷はFで行きます。弾倉交換もOKです。」）で魚雷の発射は F（U-R2）に決まった。
// v0.7.2 S4: 決まって使われなくなった案（弾倉の A・C・D・魚雷の発射の A〜E・G〜I）を片づけた（v0.7.2 の束を門の内へ戻すため。ユーザーの OK 2026-11-15）。表は今のゲームの音だけ
// （1 つの音に案 1 つ）で、試聴の場はゲームと同じ大きさでそれを鳴らす。次に聞き比べる時は、作り方のファイルの *_VARIANTS に案を足し、下の一言と SFX_LAB_ROWS を直す。
import type { SfxKey } from '../config/sfx-config';
import { finishSfx } from './sfx-bank';
import { sfxSamples } from './sfx-dsp';
import { LAUNCH_DEFAULT_ID, LAUNCH_VARIANTS } from './sfx-recipes-launch';
import { RELOAD_DEFAULT_ID, RELOAD_END_VARIANTS, RELOAD_VARIANTS, type SfxRecipeVariant } from './sfx-recipes-reload';

/** 試聴の 1 つの音（鍵と案の並び） */
export interface SfxVariantGroup {
  readonly key: SfxKey;
  readonly variants: readonly SfxRecipeVariant[];
  readonly defaultId: string;
  /** 案ごとの一言（ボタンの 2 行目。案の並びと同じ順） */
  readonly notesJa: readonly string[];
  /** v0.7.1 IP3: 案ごとの短い型（ボタンの題の記号の後。'' は記号だけ。無ければ全部 ''） */
  readonly kindsJa?: readonly string[];
}

/** 試聴の場の 3 つの音（「続けて聞く」は 0 番と 1 番の同じ記号を続けて鳴らす） */
export const SFX_VARIANT_GROUPS: readonly SfxVariantGroup[] = [
  { key: 'reload', variants: RELOAD_VARIANTS, defaultId: RELOAD_DEFAULT_ID, notesJa: ['重い がしゃっ'] },
  { key: 'reload_end', variants: RELOAD_END_VARIANTS, defaultId: RELOAD_DEFAULT_ID, notesJa: ['重い がしゃっ'] },
  { key: 'torp_launch', variants: LAUNCH_VARIANTS, defaultId: LAUNCH_DEFAULT_ID, notesJa: ['ガコン＋ザブン'] },
];

/** 試聴の場の 1 行: 音 group（SFX_VARIANT_GROUPS の添字）の案 first から count 個 */
export interface SfxLabRow {
  readonly group: number;
  readonly first: number;
  readonly count: number;
}
/** 試聴の場の行（上から。この後に「続けて聞く」の行）: 弾倉の始め・弾倉の終わり・魚雷の発射（v0.7.2 S4 からどれもゲームの案 1 つ） */
export const SFX_LAB_ROWS: readonly SfxLabRow[] = [
  { group: 0, first: 0, count: 1 },
  { group: 1, first: 0, count: 1 },
  { group: 2, first: 0, count: 1 },
];

/** 案の標本（長さ round(案の秒 × 22,050)・モノ・頂 0.9。renderSfx と同じ仕上げ）。呼ぶたびに作る（覚えるのは呼ぶ側） */
export function renderSfxVariant(v: SfxRecipeVariant): Float32Array {
  const n = sfxSamples(v.seconds);
  const x = v.recipe(n);
  if (x.length !== n) throw new Error(`sfx の案 '${v.id}' の長さ ${x.length} が ${n} と違う`);
  return finishSfx(x, false);
}
