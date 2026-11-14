// v0.7.1 IP2（実機 2 回目「弾倉交換はやはりまぬけな感じ…機銃の弾倉を変える金属音っぽく聞こえません」）: 弾倉の交換の音の作り方。始め `reload`（止め金を外して弾倉を抜く
// 「かしゃっ」）と終わり `reload_end`（差し込む「がちゃっ」…槓桿を引いて放す「じゃきっ」）の 2 本に分けた（IP1 は同じ 3 打を始めと終わりで 2 回鳴らした＝間抜けに聞こえた）。
// 銃の金属の音は「雑音」が主: 1〜3 ms の雑音の当たり・3〜8 ms で消える短い響き・帯の雑音の胴（重さ）・擦れる「しゃっ」。長く鳴る高さ（IP1 のモード 12〜80 ms＝小さい鐘・木琴）は使わない。
// 試聴の場（?sfxlab。scenes/sound-lab-scene）で聞き比べる案: A 雑音の打音・B 重い「がしゃっ」・C 乾いた小さい音（小銃の槓桿）・D IP1 の音（比べる用）。
// IP3（実機 3 回目。ユーザーの決め U-R1「弾倉はBでいきましょう」）: 始めも終わりも B が既定（ゲームで鳴る）。A・C・D は試聴の場に比べる用に残す。
// 数は音色の定数（聞かせ方）で、案ごとの名前つきの表。乱数は音だけの種（SFX_SEED_RELOAD・SFX_SEED_RELOAD_END）。直流・端の fade・頂の正規化は assets/sfx-bank。
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

const NO_RING: readonly number[] = [];
/** 打音の型（重い・中・軽い・乾いた）。案の表は at と gain と少しの違いだけを書く */
export const HEAVY = { clickS: 0.002, clickHpHz: 1000, clickGain: 1, bodyLoHz: 450, bodyHiHz: 1700, bodyS: 0.035, bodyGain: 2.4, ringHz: [1530, 2270, 3110, 3940], ringS: 0.007, ringGain: 0.25 } as const;
export const MID = { clickS: 0.0015, clickHpHz: 1500, clickGain: 1, bodyLoHz: 800, bodyHiHz: 2600, bodyS: 0.02, bodyGain: 1.6, ringHz: [2230, 3290, 4470], ringS: 0.006, ringGain: 0.25 } as const;
export const LIGHT = { clickS: 0.001, clickHpHz: 2500, clickGain: 1, bodyLoHz: 1500, bodyHiHz: 4200, bodyS: 0.008, bodyGain: 1, ringHz: [3620, 4810], ringS: 0.004, ringGain: 0.2 } as const;
const DRY = { clickS: 0.0008, clickHpHz: 2000, clickGain: 1, bodyLoHz: 1200, bodyHiHz: 4500, bodyS: 0.005, bodyGain: 0.9, ringHz: NO_RING, ringS: 0, ringGain: 0 } as const;
/** 擦れの型: 弾倉が溝を滑る（中の帯・粗い）・槓桿（明るい帯・細かい） */
export const MAG_SLIDE = { loHz: 1600, hiHz: 4800, toLoHz: 1300, toHiHz: 3800, grainHz: 170, rough: 0.6 } as const;
const BOLT_SLIDE = { loHz: 2200, hiHz: 6000, toLoHz: 2600, toHiHz: 7000, grainHz: 320, rough: 0.7 } as const;

/** A 雑音の打音（IP2 の既定）: 始め＝止め金の「かち」→ 弾倉が抜ける「しゃっ」→ 抜けた「かしゃ」。終わり＝差し込む「しゃ・がちゃっ」＋止め金 → 0.22 秒に槓桿を引く「じゃっ」→ 放して「きっ」 */
const RELOAD_A: Mech = {
  slides: [{ ...MAG_SLIDE, atS: 0.03, durS: 0.11, gain: 1.3 }],
  clacks: [{ ...LIGHT, atS: 0.006, gain: 0.8 }, { ...MID, atS: 0.13, gain: 1 }, { ...LIGHT, atS: 0.142, gain: 0.35 }],
};
const RELOAD_END_A: Mech = {
  slides: [{ ...MAG_SLIDE, atS: 0, durS: 0.05, gain: 0.9 }, { ...BOLT_SLIDE, atS: 0.225, durS: 0.07, gain: 0.9 }],
  clacks: [
    { ...HEAVY, atS: 0.048, gain: 1 }, { ...LIGHT, atS: 0.064, gain: 0.45 },
    { ...LIGHT, atS: 0.22, gain: 0.4 }, { ...MID, atS: 0.3, gain: 1, ringS: 0.008 }, { ...LIGHT, atS: 0.313, gain: 0.3 },
  ],
};
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
/** C 乾いた小さい音（小銃の槓桿）: どの打も 1 ms の当たりと 5 ms の胴だけ（響きなし）・擦れは短く明るい */
const RELOAD_C: Mech = {
  slides: [{ ...BOLT_SLIDE, loHz: 3000, hiHz: 7500, toLoHz: 2600, toHiHz: 6500, atS: 0.025, durS: 0.05, gain: 0.5 }],
  clacks: [{ ...DRY, atS: 0.006, gain: 1 }, { ...DRY, atS: 0.09, gain: 0.9 }],
};
const RELOAD_END_C: Mech = {
  slides: [{ ...BOLT_SLIDE, loHz: 3000, hiHz: 7500, toLoHz: 3400, toHiHz: 8500, atS: 0.17, durS: 0.05, gain: 0.5 }],
  clacks: [{ ...DRY, atS: 0.004, gain: 1 }, { ...DRY, atS: 0.017, gain: 0.6 }, { ...DRY, atS: 0.165, gain: 0.5 }, { ...DRY, atS: 0.24, gain: 1 }, { ...DRY, atS: 0.25, gain: 0.5 }],
};

/**
 * D＝IP1 の reload（0.42 秒。比べる用。IP1 は始めにこれ・終わりに rate 1.06 で同じ物を鳴らした）: 鋼を叩いた音を 3 つ（抜く「かちっ」→ 差す「がちゃん」＋跳ね返り → 止め金の「じゃきん」）。
 * 1 打は 1〜2 ms の雑音の当たり ＋ 整数比から外れた 4〜7 本のモード（1.2〜8 kHz・12〜80 ms）＋ 帯の雑音の胴。打ごとに高さを ±1.5% 揺らす。IP1 のまま（指紋 3382733306）
 */
const IP1 = {
  clickHighPassHz: 1500, clickAttackS: 0.0002, detune: 0.03,
  strikes: [
    { atS: 0.008, gain: 0.7, baseHz: 2150, ratios: [1, 1.43, 1.97, 2.61, 3.27], amps: [1, 0.8, 0.6, 0.45, 0.3], decays: [0.04, 0.03, 0.022, 0.017, 0.013],
      clickS: 0.0012, clickGain: 1.2, bodyLowHz: 1000, bodyHighHz: 2500, bodyDecayS: 0.02, bodyGain: 0.8 },
    { atS: 0.15, gain: 1, baseHz: 1230, ratios: [1, 1.37, 1.81, 2.36, 2.94, 3.71, 4.52], amps: [1, 0.9, 0.75, 0.6, 0.45, 0.35, 0.25],
      decays: [0.08, 0.065, 0.05, 0.04, 0.03, 0.022, 0.016], clickS: 0.002, clickGain: 1.5, bodyLowHz: 600, bodyHighHz: 2000, bodyDecayS: 0.04, bodyGain: 2.2 },
    { atS: 0.162, gain: 0.35, baseHz: 1290, ratios: [1, 1.37, 1.81, 2.36, 2.94], amps: [1, 0.9, 0.75, 0.6, 0.45], decays: [0.05, 0.04, 0.03, 0.025, 0.02],
      clickS: 0.0015, clickGain: 1.2, bodyLowHz: 700, bodyHighHz: 2200, bodyDecayS: 0.025, bodyGain: 1.2 },
    { atS: 0.29, gain: 0.6, baseHz: 2750, ratios: [1, 1.52, 2.09, 2.71], amps: [1, 0.7, 0.5, 0.35], decays: [0.03, 0.022, 0.016, 0.012],
      clickS: 0.001, clickGain: 1.4, bodyLowHz: 1200, bodyHighHz: 2500, bodyDecayS: 0.015, bodyGain: 0.8 },
    { atS: 0.31, gain: 0.8, baseHz: 2900, ratios: [1, 1.52, 2.09, 2.71], amps: [1, 0.7, 0.5, 0.35], decays: [0.06, 0.045, 0.03, 0.02],
      clickS: 0.001, clickGain: 1.2, bodyLowHz: 1200, bodyHighHz: 2500, bodyDecayS: 0.015, bodyGain: 0.6 },
  ],
} as const;

function reloadIp1(n: number): Float32Array {
  const c = IP1;
  const rng = new SeededRng(SFX_SEED_RELOAD);
  const out = new Float32Array(n);
  for (const s of c.strikes) {
    const len = n - sfxSamples(s.atS);
    const f = 1 + c.detune * (rng.next() - 0.5);
    const hit = modes(len, s.ratios.map((r) => s.baseHz * f * r), s.amps, s.decays);
    mixInto(hit, mul(highPass(whiteNoise(rng, len), c.clickHighPassHz), envelope(len, c.clickAttackS, s.clickS)), s.clickGain);
    mixInto(hit, mul(bandPass(whiteNoise(rng, len), s.bodyLowHz, s.bodyHighHz), envelope(len, c.clickAttackS, s.bodyDecayS)), s.bodyGain);
    mixInto(out, hit, s.gain, s.atS);
  }
  return out;
}

/** 案 1 つ（試聴の場の 1 ボタン）: 作り方・標本の秒・鳴らす速さ（D の終わりだけ IP1 の 1.06） */
export interface SfxRecipeVariant {
  readonly id: string;
  readonly recipe: SfxRecipe;
  readonly seconds: number;
  readonly rate: number;
}
/** IP1 の標本の秒と、IP1 が弾倉の終わりに鳴らした速さ（D を IP1 のとおりに聞かせる） */
const IP1_SECONDS = 0.42;
const IP1_END_RATE = 1.06;
/** 始めと終わりの標本の秒（既定の案 B の長さ＝config/sfx-config の表の秒。A・C も同じ長さに収める） */
export const RELOAD_SECONDS = 0.3;
export const RELOAD_END_SECONDS = 0.42;
export const RELOAD_VARIANTS: readonly SfxRecipeVariant[] = [
  { id: 'A', recipe: mech(RELOAD_A, false), seconds: RELOAD_SECONDS, rate: 1 },
  { id: 'B', recipe: mech(RELOAD_B, false), seconds: RELOAD_SECONDS, rate: 1 },
  { id: 'C', recipe: mech(RELOAD_C, false), seconds: RELOAD_SECONDS, rate: 1 },
  { id: 'D', recipe: reloadIp1, seconds: IP1_SECONDS, rate: 1 },
];
export const RELOAD_END_VARIANTS: readonly SfxRecipeVariant[] = [
  { id: 'A', recipe: mech(RELOAD_END_A, true), seconds: RELOAD_END_SECONDS, rate: 1 },
  { id: 'B', recipe: mech(RELOAD_END_B, true), seconds: RELOAD_END_SECONDS, rate: 1 },
  { id: 'C', recipe: mech(RELOAD_END_C, true), seconds: RELOAD_END_SECONDS, rate: 1 },
  { id: 'D', recipe: reloadIp1, seconds: IP1_SECONDS, rate: IP1_END_RATE },
];
/** ゲームで鳴らす案（試聴の場の「（今）」）。IP3: ユーザーの決め U-R1（始め・終わりとも B「重い がしゃっ」） */
export const RELOAD_DEFAULT_ID = 'B';

function pick(list: readonly SfxRecipeVariant[], id: string): SfxRecipe {
  const v = list.find((x) => x.id === id);
  if (!v) throw new Error(`弾倉の音の案 '${id}' が無い`);
  return v.recipe;
}

/** 弾倉の交換の作り方（鍵 → 関数）: 既定の案 */
export const RELOAD_RECIPES: Partial<Record<SfxKey, SfxRecipe>> = { reload: pick(RELOAD_VARIANTS, RELOAD_DEFAULT_ID), reload_end: pick(RELOAD_END_VARIANTS, RELOAD_DEFAULT_ID) };
