// v0.7.1 IP2（実機 2 回目）: 音の試聴の場（?sfxlab。scenes/sound-lab-scene）で聞き比べる案の表。弾倉の始め（reload）・弾倉の終わり（reload_end）・魚雷の発射（torp_launch）に
// 案 A〜D（D は IP1 の音＝比べる用）。既定（ゲームで鳴る案）は作り方のファイル（sfx-recipes-reload・sfx-recipes-launch）の *_DEFAULT_ID。案の標本は renderSfx と同じ仕上げ
// （assets/sfx-bank の finishSfx）で作る＝既定の案の標本は renderSfx(鍵) とビット同一（tests/sfx-variants）。試聴の場は押された時に 1 回だけ作って覚える（起動時には作らない）。
// IP3（実機 3 回目「弾倉はBでいきましょう。魚雷はんーもう何案か出してください」）: 弾倉の既定は B（U-R1）。魚雷の発射に新しい案 E〜I（sfx-recipes-launch2。秒は案ごと・
// 試聴の場だけ）を足して 9 案。試聴の場の行は SFX_LAB_ROWS（魚雷の発射は前の案 A〜D の行と新しい案 E〜I の行に分ける）。
import type { SfxKey } from '../config/sfx-config';
import { finishSfx } from './sfx-bank';
import { sfxSamples } from './sfx-dsp';
import { LAUNCH_DEFAULT_ID, LAUNCH_VARIANTS } from './sfx-recipes-launch';
import { LAUNCH_NEW_VARIANTS } from './sfx-recipes-launch2';
import { RELOAD_DEFAULT_ID, RELOAD_END_VARIANTS, RELOAD_VARIANTS, type SfxRecipeVariant } from './sfx-recipes-reload';

/** 試聴の 1 つの音（鍵と案の並び） */
export interface SfxVariantGroup {
  readonly key: SfxKey;
  readonly variants: readonly SfxRecipeVariant[];
  readonly defaultId: string;
  /** 案ごとの一言（ボタンの 2 行目。案の並びと同じ順） */
  readonly notesJa: readonly string[];
  /** IP3: 案ごとの短い型（ボタンの題の記号の後。'' は記号だけ。無ければ全部 ''） */
  readonly kindsJa?: readonly string[];
}

/** 試聴の場の 3 つの音（「続けて聞く」は 0 番と 1 番の同じ記号を続けて鳴らす） */
export const SFX_VARIANT_GROUPS: readonly SfxVariantGroup[] = [
  { key: 'reload', variants: RELOAD_VARIANTS, defaultId: RELOAD_DEFAULT_ID, notesJa: ['雑音の打音', '重い がしゃっ', '乾いた 小銃', 'IP1 の音'] },
  { key: 'reload_end', variants: RELOAD_END_VARIANTS, defaultId: RELOAD_DEFAULT_ID, notesJa: ['雑音の打音', '重い がしゃっ', '乾いた 小銃', 'IP1 の音'] },
  {
    key: 'torp_launch', variants: [...LAUNCH_VARIANTS, ...LAUNCH_NEW_VARIANTS], defaultId: LAUNCH_DEFAULT_ID,
    notesJa: ['どすん＋ぶしゅっ', '大きい どおん', 'ばしゅっ', 'IP1 の音', 'ドンッ＋ザバーン', 'ガコン＋ザブン', 'シュッ…ズドン', 'ドシュウゥン', '大きく 重く'],
    kindsJa: ['', '', '', '', '大砲', '落とす', '映画', '走り去る', 'Aを重く'],
  },
];

/** 試聴の場の 1 行: 音 group（SFX_VARIANT_GROUPS の添字）の案 first から count 個 */
export interface SfxLabRow {
  readonly group: number;
  readonly first: number;
  readonly count: number;
}
/** 試聴の場の行（上から。この後に「続けて聞く」の行）: 弾倉の始め A〜D・弾倉の終わり A〜D・魚雷の発射 A〜D（前の案）・魚雷の発射 E〜I（新しい案） */
export const SFX_LAB_ROWS: readonly SfxLabRow[] = [
  { group: 0, first: 0, count: 4 },
  { group: 1, first: 0, count: 4 },
  { group: 2, first: 0, count: 4 },
  { group: 2, first: 4, count: 5 },
];

/** 案の標本（長さ round(案の秒 × 22,050)・モノ・頂 0.9。renderSfx と同じ仕上げ）。呼ぶたびに作る（覚えるのは呼ぶ側） */
export function renderSfxVariant(v: SfxRecipeVariant): Float32Array {
  const n = sfxSamples(v.seconds);
  const x = v.recipe(n);
  if (x.length !== n) throw new Error(`sfx の案 '${v.id}' の長さ ${x.length} が ${n} と違う`);
  return finishSfx(x, false);
}
