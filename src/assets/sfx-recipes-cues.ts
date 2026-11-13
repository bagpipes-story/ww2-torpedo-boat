// v0.7.1（アートと音②：合成の効果音。spec-v0710 §4）: 合図・UI の音の作り方（金属・電子・機関の音）。S0 は ui_tap、S4 で alarm・bell・reload・hull_hit・engine_cough（IP1 で reload を作り直した）
// （出来事の音＝torp_launch・light_on・flare_pop・bomb_fall・smoke は assets/sfx-recipes-events）。数は音色の定数（聞かせ方）で、鍵ごとの名前つきの表にまとめる。乱数は音だけの種。
// iPhone の本体のスピーカーは約 300〜400 Hz より下がほとんど出ない: どの合図も 400 Hz より上に芯を持たせる（低い打音の engine_cough・hull_hit も歪ませた倍音・帯の雑音で。
// 数は scripts/sfx-mix.ts の「小さいスピーカーの目安」）。直流・端の fade・頂の正規化は assets/sfx-bank。
import { SFX_SEED_ENGINE_COUGH, SFX_SEED_HULL_HIT, SFX_SEED_RELOAD, type SfxKey } from '../config/sfx-config';
import { SeededRng } from '../core/rng';
import { bandPass, envelope, fadeTail, fm, harmonics, highPass, lowPass, mixInto, modes, mul, saturate, sfxSamples, sine, whiteNoise, type SfxRecipe } from './sfx-dsp';

/** ui_tap（0.06 秒）: 正弦 880 → 660 Hz・減衰 40 ms。乱数は使わない */
const UI_TAP = { fromHz: 880, toHz: 660, glideS: 0.06, attackS: 0.002, decayS: 0.04 } as const;

function uiTap(n: number): Float32Array {
  return mul(sine(n, UI_TAP.fromHz, UI_TAP.toHz, UI_TAP.glideS), envelope(n, UI_TAP.attackS, UI_TAP.decayS));
}

/**
 * alarm（0.6 秒。発見された！・空襲の予告は rate 0.7・味方機の識別の要求は rate 1.3）: 2 音（400 Hz・520 Hz）を 0.3 秒ずつ。倍音 6 本（1・0.45・0.3・0.15・0.1・0.05＝
 * 角の丸い電子のブザー。0.3 秒に整数周期）に低域通過 2k Hz（1 極）＝甲高くしない。2 倍音から上を残すのは、rate 0.7 のサイレン（基音 280 Hz）でも本体のスピーカー
 * （約 400 Hz より下が出ない）で聞こえるように。音ごとに少し減衰させ（1 → 0.5）、終わりに短い間（0.03 秒）＝繰り返しても耳に刺さらない
 */
const ALARM = { toneHz: [400, 520], toneS: 0.3, amps: [1, 0.45, 0.3, 0.15, 0.1, 0.05], lowPassHz: 2000, attackS: 0.006, releaseS: 0.03, sag: 0.5 } as const;

function alarm(n: number): Float32Array {
  const c = ALARM;
  const out = new Float32Array(n);
  const tn = sfxSamples(c.toneS);
  const an = sfxSamples(c.attackS);
  const rn = sfxSamples(c.releaseS);
  for (let k = 0; k < c.toneHz.length; k++) {
    const len = Math.min(tn, n - k * tn);
    const tone = harmonics(len, Math.round(c.toneHz[k]! * c.toneS), c.amps);
    for (let i = 0; i < len; i++) {
      const edge = Math.min(1, i / an, Math.max(0, (len - rn - i) / an));
      tone[i] = tone[i]! * edge * (1 - (c.sag * i) / len);
    }
    mixInto(out, tone, 1, k * c.toneS);
  }
  return lowPass(out, c.lowPassHz);
}

/**
 * bell（1.4 秒。帰投せよ・揚陸完了は 1 打、夜明け・空襲の決着は rate 0.7、Result は帰投 2 打・それ以外は rate 0.5 で 1 打）: FM の鐘（搬送 660 Hz・比 2.76＝鐘らしい倍音から外れた
 * 響き・変調の深さは 0.5 秒で 1/10 に澄む）＋ 打った瞬間の金属の明るさ（搬送の 2.0 倍の正弦を速く減衰）。指数の減衰 1.2 秒、尾は 0.15 秒で消し切る
 */
const BELL = { carrierHz: 660, ratio: 2.76, index: 3.2, indexDecayS: 0.5, attackS: 0.002, decayS: 1.2, strikeRatio: 2.0, strikeDecayS: 0.15, strikeGain: 0.35, tailFadeS: 0.15 } as const;

function bell(n: number): Float32Array {
  const c = BELL;
  const out = mul(fm(n, c.carrierHz, c.ratio, c.index, c.indexDecayS), envelope(n, c.attackS, c.decayS));
  mixInto(out, mul(sine(n, c.carrierHz * c.strikeRatio), envelope(n, c.attackS, c.strikeDecayS)), c.strikeGain);
  return fadeTail(out, c.tailFadeS);
}

/**
 * reload（0.42 秒。弾倉の交換の始め・終わりは rate 1.06＝同じ金属を少しだけ高く）: 鋼を叩いた音を 3 つ＝弾倉を抜く「かちっ」（軽い）→ 差し込む「がちゃん」
 * （一番強く・低いモード＋胴の雑音＋12 ms 後の跳ね返り）→ 止め金の「じゃきん」（明るい 2 打・間 20 ms・後の打は少し長く鳴る）。1 打は ① 1〜2 ms の雑音の当たり
 * （高域通過 1.5k Hz）② 整数比から外れた 4〜7 本のモード（1.2〜8 kHz・高いほど速く減衰 12〜80 ms＝鋼の板・部品の響き）③ 帯の雑音の胴（600 Hz〜2.5k Hz・15〜40 ms
 * ＝重さ）。400 Hz より下の正弦は無い。打ごとに高さを ±1.5% 揺らす（音だけの種）。
 * IP1（実機 1 回目「まぬけな音」）: S4 の 2 打（2 打目の重さ＝300 Hz の正弦を歪ませた「ぽこっ」・金属の響き＝FM 1 本 1.8k Hz の「ぴっ」）をやめた
 */
const RELOAD = {
  clickHighPassHz: 1500, clickAttackS: 0.0002, detune: 0.03,
  strikes: [
    // 抜く「かちっ」
    { atS: 0.008, gain: 0.7, baseHz: 2150, ratios: [1, 1.43, 1.97, 2.61, 3.27], amps: [1, 0.8, 0.6, 0.45, 0.3], decays: [0.04, 0.03, 0.022, 0.017, 0.013],
      clickS: 0.0012, clickGain: 1.2, bodyLowHz: 1000, bodyHighHz: 2500, bodyDecayS: 0.02, bodyGain: 0.8 },
    // 差す「がちゃん」（一番強い・低いモード）
    { atS: 0.15, gain: 1, baseHz: 1230, ratios: [1, 1.37, 1.81, 2.36, 2.94, 3.71, 4.52], amps: [1, 0.9, 0.75, 0.6, 0.45, 0.35, 0.25],
      decays: [0.08, 0.065, 0.05, 0.04, 0.03, 0.022, 0.016], clickS: 0.002, clickGain: 1.5, bodyLowHz: 600, bodyHighHz: 2000, bodyDecayS: 0.04, bodyGain: 2.2 },
    // 「がちゃん」の跳ね返り
    { atS: 0.162, gain: 0.35, baseHz: 1290, ratios: [1, 1.37, 1.81, 2.36, 2.94], amps: [1, 0.9, 0.75, 0.6, 0.45], decays: [0.05, 0.04, 0.03, 0.025, 0.02],
      clickS: 0.0015, clickGain: 1.2, bodyLowHz: 700, bodyHighHz: 2200, bodyDecayS: 0.025, bodyGain: 1.2 },
    // 止め金の「じゃ」
    { atS: 0.29, gain: 0.6, baseHz: 2750, ratios: [1, 1.52, 2.09, 2.71], amps: [1, 0.7, 0.5, 0.35], decays: [0.03, 0.022, 0.016, 0.012],
      clickS: 0.001, clickGain: 1.4, bodyLowHz: 1200, bodyHighHz: 2500, bodyDecayS: 0.015, bodyGain: 0.8 },
    // 止め金の「きん」（少し長く鳴る）
    { atS: 0.31, gain: 0.8, baseHz: 2900, ratios: [1, 1.52, 2.09, 2.71], amps: [1, 0.7, 0.5, 0.35], decays: [0.06, 0.045, 0.03, 0.02],
      clickS: 0.001, clickGain: 1.2, bodyLowHz: 1200, bodyHighHz: 2500, bodyDecayS: 0.015, bodyGain: 0.6 },
  ],
} as const;

function reload(n: number): Float32Array {
  const c = RELOAD;
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

/**
 * hull_hit（0.3 秒。自艇の被弾＝HP が減った。爆発の音は絵の層の口が別に出す）: FM の金属音（搬送 320 Hz・比 1.4・深さは 0.06 秒で澄む・指数の減衰 0.12 秒）を歪ませて
 * 板を叩いた倍音に ＋ 当たった瞬間の短い雑音（高域通過 1.5k Hz・減衰 12 ms）
 */
const HULL_HIT = {
  carrierHz: 320, ratio: 1.4, index: 6, indexDecayS: 0.06, attackS: 0.001, decayS: 0.12, drive: 1.6,
  noiseHighPassHz: 1500, noiseAttackS: 0.0005, noiseDecayS: 0.012, noiseGain: 0.8,
  ringHz: 1240, ringDecayS: 0.09, ringGain: 0.25,
} as const;

function hullHit(n: number): Float32Array {
  const c = HULL_HIT;
  const rng = new SeededRng(SFX_SEED_HULL_HIT);
  const out = saturate(mul(fm(n, c.carrierHz, c.ratio, c.index, c.indexDecayS), envelope(n, c.attackS, c.decayS)), c.drive);
  mixInto(out, mul(sine(n, c.ringHz), envelope(n, c.attackS, c.ringDecayS)), c.ringGain);
  mixInto(out, mul(highPass(whiteNoise(rng, n), c.noiseHighPassHz), envelope(n, c.noiseAttackS, c.noiseDecayS)), c.noiseGain);
  return out;
}

/**
 * engine_cough（0.8 秒。機関の損傷・機関の不調（段で rate 1.0／0.9／0.8）・燃料切れ（rate 0.7））: 低い破裂 3 つ（間は不揃い＝0、0.21、0.47 秒・後ほど小さい）。
 * 1 つは 雑音の低域通過 300 Hz（2 極）＋ 70 Hz の正弦を強く歪ませ（倍音が本体のスピーカーに届く「ぼっ」）＋ 排気の帯の雑音 500〜2k Hz（「ぱすっ」。本体のスピーカーで聞こえる層）。
 * 破裂の間は空回りの雑音を小さく（止まりかけのエンジン）
 */
const ENGINE_COUGH = {
  atS: [0, 0.21, 0.47], gains: [1, 0.8, 0.6],
  lowHz: 300, lowPoles: 2, lowGain: 2, bodyHz: 70, bodyGain: 0.9, attackS: 0.004, decayS: 0.09, drive: 4,
  puffLowHz: 500, puffHighHz: 2000, puffDecayS: 0.07, puffGain: 5,
  idleLowHz: 250, idleHighHz: 900, idleGain: 0.06,
} as const;

function engineCough(n: number): Float32Array {
  const c = ENGINE_COUGH;
  const rng = new SeededRng(SFX_SEED_ENGINE_COUGH);
  const out = new Float32Array(n);
  for (let k = 0; k < c.atS.length; k++) {
    const atS = c.atS[k]!;
    const len = n - sfxSamples(atS);
    const pop = mul(lowPass(whiteNoise(rng, len), c.lowHz, c.lowHz, 0, c.lowPoles), envelope(len, c.attackS, c.decayS));
    for (let i = 0; i < len; i++) pop[i] = pop[i]! * c.lowGain;
    mixInto(pop, mul(sine(len, c.bodyHz), envelope(len, c.attackS, c.decayS)), c.bodyGain);
    mixInto(out, saturate(pop, c.drive), c.gains[k]!, atS);
    mixInto(out, mul(bandPass(whiteNoise(rng, len), c.puffLowHz, c.puffHighHz), envelope(len, c.attackS, c.puffDecayS)), c.gains[k]! * c.puffGain, atS);
  }
  const idle = bandPass(whiteNoise(rng, n), c.idleLowHz, c.idleHighHz);
  for (let i = 0; i < n; i++) out[i] = out[i]! + idle[i]! * c.idleGain * (1 - i / n);
  return out;
}

/** 合図・UI の作り方（鍵 → 関数） */
export const CUE_RECIPES: Partial<Record<SfxKey, SfxRecipe>> = { alarm, ui_tap: uiTap, bell, reload, hull_hit: hullHit, engine_cough: engineCough };
