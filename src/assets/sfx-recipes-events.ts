// v0.7.1 S4（アートと音②：合成の効果音。spec-v0710 §4・§3.2）: 状態の合図のうち「出来事の音」の作り方＝探照灯 light_on・星弾と照明弾 flare_pop・
// 爆弾の落ちてくる音 bomb_fall・煙幕 smoke（金属・電子・機関の合図は assets/sfx-recipes-cues。魚雷の発射 torp_launch は IP2 から assets/sfx-recipes-launch・IP4 から既定 F は sfx-recipes-launch2）。数は音色の定数（聞かせ方）で、鍵ごとの名前つきの表にまとめる。乱数は音だけの種。
// 本体のスピーカー（約 300〜400 Hz より下がほとんど出ない）でも聞こえるように、どれも 400 Hz より上に芯を持たせる。直流・端の fade・頂の正規化は assets/sfx-bank。
import { SFX_SAMPLE_RATE, SFX_SEED_BOMB_FALL, SFX_SEED_FLARE_POP, SFX_SEED_LIGHT_ON, SFX_SEED_SMOKE, type SfxKey } from '../config/sfx-config';
import { SeededRng } from '../core/rng';
import { bandPass, envelope, fadeTail, harmonics, highPass, lowPass, mixInto, mul, ramp, saturate, sfxSamples, sine, whiteNoise, type SfxRecipe } from './sfx-dsp';

const TAU = Math.PI * 2;
const SR = SFX_SAMPLE_RATE;

/**
 * light_on（0.5 秒。探照灯に照らされた）: 開閉器の低い打音（雑音の低域通過 600 Hz・30 ms で 1/10）＋ アーク灯のうなり＝120 Hz の倍音 14 本（3 倍音から上を 1/√h で強く・
 * 基音と 2 倍音は小さく・高域通過 300 Hz＝本体のスピーカーでは 360〜1,700 Hz の「じー」に聞こえる。0.5 秒に 60 周期の整数）を
 * 20 ms で立ち上げ、40 ms ほど強く鳴って少し下がり（点いた瞬間の「ぶぅん」）、0.12 秒で消える
 */
const LIGHT_ON = {
  clickHz: 600, clickPoles: 2, clickAttackS: 0.001, clickDecayS: 0.03, clickGain: 1.6,
  humHz: 120, humHarmonics: 14, humLowShare: 0.3, humHighPassHz: 300, humAttackS: 0.02, humPeakS: 0.06, humSag: 0.35, humGain: 0.7, drive: 1.4, tailFadeS: 0.12,
} as const;

function lightOn(n: number): Float32Array {
  const c = LIGHT_ON;
  const rng = new SeededRng(SFX_SEED_LIGHT_ON);
  const amps: number[] = [];
  for (let h = 1; h <= c.humHarmonics; h++) amps.push(h < 3 ? c.humLowShare : 1 / Math.sqrt(h));
  const hum = highPass(harmonics(n, Math.round((c.humHz * n) / SR), amps), c.humHighPassHz);
  const an = sfxSamples(c.humAttackS), pn = sfxSamples(c.humPeakS);
  for (let i = 0; i < n; i++) hum[i] = hum[i]! * (i < an ? i / an : i < pn ? 1 : 1 - c.humSag);
  const out = saturate(hum, c.drive);
  for (let i = 0; i < n; i++) out[i] = out[i]! * c.humGain;
  mixInto(out, mul(lowPass(whiteNoise(rng, n), c.clickHz, c.clickHz, 0, c.clickPoles), envelope(n, c.clickAttackS, c.clickDecayS)), c.clickGain);
  return fadeTail(out, c.tailFadeS);
}

/**
 * flare_pop（1.2 秒。星弾・照明弾が開いた・味方機が識別の信号弾を撃った）: 遠くの柔らかい「ぽん」（正弦 200 → 90 Hz を歪ませる＋帯 500〜2k Hz の短い雑音）＋ 燃えて落ちてくる
 * 「しゅうう」（雑音の高域通過 3k Hz・立ち上がり 0.06 秒・減衰 1.0 秒・ゆっくり揺らぐ）
 */
const FLARE_POP = {
  popFromHz: 200, popToHz: 90, popGlideS: 0.12, popAttackS: 0.003, popDecayS: 0.12, popDrive: 2.4, popGain: 0.4,
  puffLowHz: 500, puffHighHz: 2000, puffAttackS: 0.002, puffDecayS: 0.04, puffGain: 1.2,
  hissHz: 3000, hissAttackS: 0.06, hissDecayS: 1.0, hissGain: 0.7, swayHz: 3, sway: 0.3, tailFadeS: 0.15,
} as const;

function flarePop(n: number): Float32Array {
  const c = FLARE_POP;
  const rng = new SeededRng(SFX_SEED_FLARE_POP);
  const out = saturate(mul(sine(n, c.popFromHz, c.popToHz, c.popGlideS), envelope(n, c.popAttackS, c.popDecayS)), c.popDrive);
  for (let i = 0; i < n; i++) out[i] = out[i]! * c.popGain;
  mixInto(out, mul(bandPass(whiteNoise(rng, n), c.puffLowHz, c.puffHighHz), envelope(n, c.puffAttackS, c.puffDecayS)), c.puffGain);
  const hiss = mul(highPass(whiteNoise(rng, n), c.hissHz), envelope(n, c.hissAttackS, c.hissDecayS));
  for (let i = 0; i < n; i++) hiss[i] = hiss[i]! * (1 - c.sway * (0.5 + 0.5 * Math.sin((TAU * c.swayHz * i) / SR)));
  mixInto(out, hiss, c.hissGain);
  return fadeTail(out, c.tailFadeS);
}

/**
 * bomb_fall（1.2 秒。爆弾が落ちてくる＝落下中の爆弾が出た）: 笛の音＝正弦の掃引 1.8k → 600 Hz（指数・1.15 秒）に 6 Hz の揺れ（高さ ±1.5%・大きさ ±25%）と、風を切る
 * 雑音（帯を同じ高さで追う）を少し。大きさは後ろへ立ち上がっていく（近づく）。終わりは 60 ms で消す（爆発は絵の層の口が鳴らす）
 */
const BOMB_FALL = {
  fromHz: 1800, toHz: 600, glideS: 1.15, vibHz: 6, vibDepth: 0.015, tremDepth: 0.25,
  riseS: 1.1, risePow: 1.6, floor: 0.12, airWidth: 0.25, airGain: 0.5, tailFadeS: 0.06,
} as const;

function bombFall(n: number): Float32Array {
  const c = BOMB_FALL;
  const rng = new SeededRng(SFX_SEED_BOMB_FALL);
  const tone = new Float32Array(n);
  const glideN = sfxSamples(c.glideS);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const vib = Math.sin((TAU * c.vibHz * i) / SR);
    tone[i] = Math.sin(ph) * (1 - c.tremDepth * (0.5 + 0.5 * vib));
    ph += (TAU * c.fromHz * Math.pow(c.toHz / c.fromHz, Math.min(1, i / glideN)) * (1 + c.vibDepth * vib)) / SR;
  }
  const lo = 1 - c.airWidth, hi = 1 + c.airWidth;
  mixInto(tone, bandPass(whiteNoise(rng, n), c.fromHz * lo, c.fromHz * hi, c.toHz * lo, c.toHz * hi, c.glideS), c.airGain);
  const rise = ramp(n, c.riseS, c.risePow);
  for (let i = 0; i < n; i++) tone[i] = tone[i]! * (c.floor + (1 - c.floor) * rise[i]!);
  return fadeTail(tone, c.tailFadeS);
}

/**
 * smoke（1.0 秒。煙幕の展開・消火は rate 1.6）: 吹き出す「しゅわー」＝雑音の高域通過 2k Hz（上は 1 極の低域通過 5k Hz で丸める・立ち上がり 0.15 秒・減衰 0.8 秒）＋
 * 噴き出しの太さ（帯 600〜1.6k Hz を小さく）。
 * 星弾の「しゅうう」（3k Hz・頭に「ぽん」）より低く・ゆっくり立つ（頭が無い）
 */
const SMOKE = { hissHz: 2000, softHz: 5000, attackS: 0.15, decayS: 0.8, bodyLowHz: 600, bodyHighHz: 1600, bodyGain: 0.6, tailFadeS: 0.12 } as const;

function smoke(n: number): Float32Array {
  const c = SMOKE;
  const rng = new SeededRng(SFX_SEED_SMOKE);
  const out = lowPass(highPass(whiteNoise(rng, n), c.hissHz), c.softHz);
  mixInto(out, bandPass(whiteNoise(rng, n), c.bodyLowHz, c.bodyHighHz), c.bodyGain);
  return fadeTail(mul(out, envelope(n, c.attackS, c.decayS)), c.tailFadeS);
}

/** 出来事の合図の作り方（鍵 → 関数） */
export const EVENT_RECIPES: Partial<Record<SfxKey, SfxRecipe>> = { light_on: lightOn, flare_pop: flarePop, bomb_fall: bombFall, smoke };
