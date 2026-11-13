// v0.7.1 IP2（実機 2 回目）: 音の試聴の場（?sfxlab。scenes/sound-lab-scene）で聞き比べる案の表。弾倉の始め（reload）・弾倉の終わり（reload_end）・魚雷の発射（torp_launch）に
// 案 A〜D（D は IP1 の音＝比べる用）。既定（ゲームで鳴る案）は作り方のファイル（sfx-recipes-reload・sfx-recipes-launch）の *_DEFAULT_ID。案の標本は renderSfx と同じ仕上げ
// （assets/sfx-bank の finishSfx）で作る＝既定の案の標本は renderSfx(鍵) とビット同一（tests/sfx-variants）。試聴の場は押された時に 1 回だけ作って覚える（起動時には作らない）。
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
}

/** 試聴の場の 3 つの音（この順に行を並べる。「続けて聞く」は 0 番と 1 番の同じ記号を続けて鳴らす） */
export const SFX_VARIANT_GROUPS: readonly SfxVariantGroup[] = [
  { key: 'reload', variants: RELOAD_VARIANTS, defaultId: RELOAD_DEFAULT_ID, notesJa: ['雑音の打音', '重い がしゃっ', '乾いた 小銃', 'IP1 の音'] },
  { key: 'reload_end', variants: RELOAD_END_VARIANTS, defaultId: RELOAD_DEFAULT_ID, notesJa: ['雑音の打音', '重い がしゃっ', '乾いた 小銃', 'IP1 の音'] },
  { key: 'torp_launch', variants: LAUNCH_VARIANTS, defaultId: LAUNCH_DEFAULT_ID, notesJa: ['どすん＋ぶしゅっ', '大きい どおん', 'ばしゅっ', 'IP1 の音'] },
];

/** 案の標本（長さ round(案の秒 × 22,050)・モノ・頂 0.9。renderSfx と同じ仕上げ）。呼ぶたびに作る（覚えるのは呼ぶ側） */
export function renderSfxVariant(v: SfxRecipeVariant): Float32Array {
  const n = sfxSamples(v.seconds);
  const x = v.recipe(n);
  if (x.length !== n) throw new Error(`sfx の案 '${v.id}' の長さ ${x.length} が ${n} と違う`);
  return finishSfx(x, false);
}
