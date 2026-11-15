// v0.7.1 IP2（実機 2 回目「弾倉交換はやはりまぬけな感じ…機銃の弾倉を変える金属音っぽく聞こえません」）: 弾倉の交換の音の作り方。始め `reload`（止め金を外して弾倉を抜く
// 「かしゃっ」）と終わり `reload_end`（差し込む「がちゃっ」…槓桿を引いて放す「じゃきっ」）の 2 本に分けた（IP1 は同じ 3 打を始めと終わりで 2 回鳴らした＝間抜けに聞こえた）。
// 銃の金属の音は「雑音」が主: 1〜3 ms の雑音の当たり・3〜8 ms で消える短い響き・帯の雑音の胴（重さ）・擦れる「しゃっ」。長く鳴る高さ（IP1 のモード 12〜80 ms＝小さい鐘・木琴）は使わない。
// 試聴の場（?sfxlab。scenes/sound-lab-scene）で A 雑音の打音・B 重い「がしゃっ」・C 乾いた小さい音（小銃の槓桿）・D IP1 の音を聞き比べ、IP3（実機 3 回目。ユーザーの決め
// U-R1「弾倉はBでいきましょう」）で始めも終わりも B に決めた。v0.7.2 S4: 使われなくなった A・C・D を片づけた（B の標本はビット同一＝tests/sfx-synth の指紋）。
// 数は音色の定数（聞かせ方）で、名前つきの表。乱数は音だけの種（SFX_SEED_RELOAD・SFX_SEED_RELOAD_END）。直流・端の fade・頂の正規化は assets/sfx-bank。
import { SFX_SAMPLE_RATE, SFX_SEED_RELOAD, SFX_SEED_RELOAD_END, type SfxKey } from '../config/sfx-config';
import { SeededRng } from '../core/rng';
import { bandPass, envelope, highPass, mixInto, modes, mul, sfxSamples, whiteNoise, type SfxRecipe } from './sfx-dsp';

const SR = SFX_SAMPLE_RATE;
/** 打音の立ち上がり（0.2 ms＝雑音の当たりの鋭さ） */
const ATTACK_S = 0.0002;

/** 金属の部品がぶつかる 1 打: 雑音の当たり（高域通過）＋ 帯の雑音の胴 ＋ 短い響き（ringS 秒で 1/10。8 ms 以下＝高さに聞こえない） */
export interface Clack {
  readonly atS: number; readonly gain: number;
  readonly clickS: number; readonly clickHpHz: number; readonly clickGain: number;
  readonly bodyLoHz: number; readonly bodyHiHz: number; readonly bodyS: number; readonly bodyGain: number;
  readonly ringHz: readonly number[]; readonly ringS: number; readonly ringGain: number;
}
/** 擦れる音（弾倉が溝を滑る・槓桿を引く）: 帯の雑音（帯を loHz〜hiHz から toLoHz〜toHiHz へ掃引）× 山の形 × ざらつき（grainHz ごとに大きさが揺れる＝rough の割合） */
export interface Slide {
  readonly atS: number; readonly durS: number; readonly gain: number;
  readonly loHz: number; readonly hiHz: number; readonly toLoHz: number; readonly toHiHz: number;
  readonly grainHz: number; readonly rough: number;
}
interface Mech {
  readonly slides: readonly Slide[];
  readonly clacks: readonly Clack[];
}

export function clack(out: Float32Array, rng: SeededRng, c: Clack): void {
  const at = sfxSamples(c.atS);
  const len = Math.min(out.length - at, sfxSamples(6 * Math.max(c.bodyS, c.clickS, c.ringS)));
  if (len <= 0) return;
  const hit = mul(highPass(whiteNoise(rng, len), c.clickHpHz), envelope(len, ATTACK_S, c.clickS));
  for (let i = 0; i < len; i++) hit[i] = hit[i]! * c.clickGain;
  mixInto(hit, mul(bandPass(whiteNoise(rng, len), c.bodyLoHz, c.bodyHiHz), envelope(len, ATTACK_S, c.bodyS)), c.bodyGain);
  if (c.ringGain > 0) {
    const decays: number[] = [];
    const amps: number[] = [];
    for (let m = 0; m < c.ringHz.length; m++) { decays.push(c.ringS); amps.push(1 / (1 + m)); }
    mixInto(hit, modes(len, c.ringHz, amps, decays), c.ringGain);
  }
  mixInto(out, hit, c.gain, c.atS);
}

export function slide(out: Float32Array, rng: SeededRng, s: Slide): void {
  const len = Math.min(out.length - sfxSamples(s.atS), sfxSamples(s.durS));
  if (len <= 0) return;
  const x = bandPass(whiteNoise(rng, len), s.loHz, s.hiHz, s.toLoHz, s.toHiHz, s.durS);
  const step = Math.max(1, Math.round(SR / s.grainHz));
  let g0 = rng.next(), g1 = rng.next();
  for (let i = 0; i < len; i++) {
    if (i > 0 && i % step === 0) { g0 = g1; g1 = rng.next(); }
    const u = (i % step) / step;
    x[i] = x[i]! * Math.sin((Math.PI * i) / len) * (1 - s.rough + s.rough * (g0 + (g1 - g0) * u));
  }
  mixInto(out, x, s.gain, s.atS);
}

/** 案の表 → 作り方（end は弾倉の終わり＝種 SFX_SEED_RELOAD_END） */
function mech(m: Mech, end: boolean): SfxRecipe {
  return (n) => {
    const rng = end ? new SeededRng(SFX_SEED_RELOAD_END) : new SeededRng(SFX_SEED_RELOAD);
    const out = new Float32Array(n);
    for (const s of m.slides) slide(out, rng, s);
    for (const c of m.clacks) clack(out, rng, c);
    return out;
  };
}

/** 打音の型（重い・中・軽い）。表は at と gain と少しの違いだけを書く（軽い LIGHT は魚雷の発射の F＝sfx-recipes-launch が使う） */
export const HEAVY = { clickS: 0.002, clickHpHz: 1000, clickGain: 1, bodyLoHz: 450, bodyHiHz: 1700, bodyS: 0.035, bodyGain: 2.4, ringHz: [1530, 2270, 3110, 3940], ringS: 0.007, ringGain: 0.25 } as const;
export const MID = { clickS: 0.0015, clickHpHz: 1500, clickGain: 1, bodyLoHz: 800, bodyHiHz: 2600, bodyS: 0.02, bodyGain: 1.6, ringHz: [2230, 3290, 4470], ringS: 0.006, ringGain: 0.25 } as const;
export const LIGHT = { clickS: 0.001, clickHpHz: 2500, clickGain: 1, bodyLoHz: 1500, bodyHiHz: 4200, bodyS: 0.008, bodyGain: 1, ringHz: [3620, 4810], ringS: 0.004, ringGain: 0.2 } as const;
/** 擦れの型: 弾倉が溝を滑る（中の帯・粗い）・槓桿（明るい帯・細かい） */
export const MAG_SLIDE = { loHz: 1600, hiHz: 4800, toLoHz: 1300, toHiHz: 3800, grainHz: 170, rough: 0.6 } as const;
const BOLT_SLIDE = { loHz: 2200, hiHz: 6000, toLoHz: 2600, toHiHz: 7000, grainHz: 320, rough: 0.7 } as const;

/** B 重い「がしゃっ」（IP3 から既定＝U-R1）: 胴が低く厚い（300〜1.3k Hz）・擦れが長く粗い・打ちに跳ね返り。槓桿は強い「がしゃっ」 */
const B_BODY = { bodyLoHz: 260, bodyHiHz: 1100, bodyS: 0.055, bodyGain: 3.6, ringHz: [1130, 1690, 2410], ringS: 0.008 } as const;
const RELOAD_B: Mech = {
  slides: [{ ...MAG_SLIDE, loHz: 800, hiHz: 3000, toLoHz: 700, toHiHz: 2500, grainHz: 120, rough: 0.75, atS: 0.035, durS: 0.16, gain: 1.6 }],
  clacks: [{ ...HEAVY, bodyLoHz: 500, bodyHiHz: 1800, bodyS: 0.02, atS: 0.008, gain: 0.7 }, { ...HEAVY, ...B_BODY, atS: 0.2, gain: 1 }, { ...HEAVY, ...B_BODY, atS: 0.215, gain: 0.35 }],
};
const RELOAD_END_B: Mech = {
  slides: [
    { ...MAG_SLIDE, loHz: 900, hiHz: 3200, toLoHz: 800, toHiHz: 2600, grainHz: 120, rough: 0.75, atS: 0, durS: 0.07, gain: 1.2 },
    { ...BOLT_SLIDE, loHz: 1300, hiHz: 4200, toLoHz: 1600, toHiHz: 5000, grainHz: 220, rough: 0.8, atS: 0.25, durS: 0.09, gain: 1.2 },
  ],
  clacks: [
    { ...HEAVY, ...B_BODY, atS: 0.068, gain: 1 }, { ...HEAVY, ...B_BODY, atS: 0.081, gain: 0.35 }, { ...MID, atS: 0.1, gain: 0.5 },
    { ...MID, atS: 0.245, gain: 0.5 }, { ...HEAVY, bodyLoHz: 500, bodyHiHz: 2000, bodyS: 0.03, atS: 0.35, gain: 1 }, { ...MID, atS: 0.364, gain: 0.4 },
  ],
};
/** 案 1 つ（試聴の場の 1 ボタン）: 作り方・標本の秒・鳴らす速さ（v0.7.1 IP2 の D の終わりは IP1 の 1.06 で鳴らした。今の案はどれも 1） */
export interface SfxRecipeVariant {
  readonly id: string;
  readonly recipe: SfxRecipe;
  readonly seconds: number;
  readonly rate: number;
}
/** 始めと終わりの標本の秒（B の長さ＝config/sfx-config の表の秒） */
export const RELOAD_SECONDS = 0.3;
export const RELOAD_END_SECONDS = 0.42;
/** 試聴の場（assets/sfx-variants）の弾倉の始め・終わりの案: ゲームの B だけ */
export const RELOAD_VARIANTS: readonly SfxRecipeVariant[] = [{ id: 'B', recipe: mech(RELOAD_B, false), seconds: RELOAD_SECONDS, rate: 1 }];
export const RELOAD_END_VARIANTS: readonly SfxRecipeVariant[] = [{ id: 'B', recipe: mech(RELOAD_END_B, true), seconds: RELOAD_END_SECONDS, rate: 1 }];
/** ゲームで鳴らす案（試聴の場の「（今）」）。IP3: ユーザーの決め U-R1（始め・終わりとも B「重い がしゃっ」） */
export const RELOAD_DEFAULT_ID = 'B';

function pick(list: readonly SfxRecipeVariant[], id: string): SfxRecipe {
  const v = list.find((x) => x.id === id);
  if (!v) throw new Error(`弾倉の音の案 '${id}' が無い`);
  return v.recipe;
}

/** 弾倉の交換の作り方（鍵 → 関数）: 既定の案 */
export const RELOAD_RECIPES: Partial<Record<SfxKey, SfxRecipe>> = { reload: pick(RELOAD_VARIANTS, RELOAD_DEFAULT_ID), reload_end: pick(RELOAD_END_VARIANTS, RELOAD_DEFAULT_ID) };
