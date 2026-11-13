// v0.7.1 S4（アートと音②：合成の効果音。spec-v0710 §4・§3.2）: 状態の合図のうち「出来事の音」の作り方＝魚雷の発射 torp_launch・探照灯 light_on・星弾と照明弾 flare_pop・
// 爆弾の落ちてくる音 bomb_fall・煙幕 smoke（金属・電子・機関の合図は assets/sfx-recipes-cues）。IP1 で torp_launch を作り直した。数は音色の定数（聞かせ方）で、鍵ごとの名前つきの表にまとめる。乱数は音だけの種。
// 本体のスピーカー（約 300〜400 Hz より下がほとんど出ない）でも聞こえるように、どれも 400 Hz より上に芯を持たせる。直流・端の fade・頂の正規化は assets/sfx-bank。
import { SFX_SAMPLE_RATE, SFX_SEED_BOMB_FALL, SFX_SEED_FLARE_POP, SFX_SEED_LIGHT_ON, SFX_SEED_SMOKE, SFX_SEED_TORP_LAUNCH, type SfxKey } from '../config/sfx-config';
import { SeededRng } from '../core/rng';
import { bandPass, envelope, fadeTail, harmonics, highPass, lowPass, mixInto, modes, mul, ramp, saturate, sfxSamples, sine, whiteNoise, type SfxRecipe } from './sfx-dsp';

const TAU = Math.PI * 2;
const SR = SFX_SAMPLE_RATE;

/**
 * torp_launch（1.0 秒。魚雷の発射＝積んでいる魚雷が減った・米PT の雷撃の報告は音量 0.6）: 重ねた 5 つの層を順に。
 * ① 発射の衝撃「どぅん」（t = 0）: 鋭い雑音の割れ（高域通過 2k Hz・3 ms）＋ 低い打撃（正弦 140 → 60 Hz を強く歪ませる＝倍音が本体のスピーカーへ・減衰 0.15 秒）＋
 *   帯の雑音の「どん」（300〜1.2k Hz・減衰 0.12 秒）
 * ② 圧縮空気の「ぶしゅっ」: 雑音の帯の掃引 3.5k → 700 Hz（0.3 秒。帯は中心の 0.55〜1.45 倍・減衰 0.32 秒）
 * ③ 発射管の金属の響き「きぃん」: 整数比から外れた 5 本のモード（640 Hz〜2.9k Hz・減衰 0.2〜0.35 秒。鐘にしない小ささ）
 * ④ 0.37 秒に魚雷が海に入る「ざぶん」: 低い帯の雑音の「どぼ」（250〜800 Hz・減衰 80 ms）＋ 雑音の帯 400 Hz〜4k Hz（減衰 0.2 秒）
 * ⑤ 着水の後にスクリューの「ういーん」: 少しずらした 2 本の正弦 ＋ 細い帯の雑音を 700 → 1.1k Hz へ上げながら小さく消えていく（遠ざかる）
 * IP1（実機 1 回目「もう少しカッコよく」）: S4 の 0.7 秒（空気の掃引 2.5k → 400 Hz ＋ 小さな「とん」＋ 小さな水音）に、衝撃の芯・管の響き・スクリューを足した
 */
const TORP_LAUNCH = {
  crackHighPassHz: 2000, crackAttackS: 0.0003, crackDecayS: 0.003, crackGain: 1.6,
  punchFromHz: 140, punchToHz: 60, punchGlideS: 0.1, punchAttackS: 0.001, punchDecayS: 0.15, punchDrive: 4, punchGain: 0.5,
  thumpLowHz: 300, thumpHighHz: 1200, thumpAttackS: 0.001, thumpDecayS: 0.12, thumpGain: 2.4,
  airFromHz: 3500, airToHz: 700, airWidth: 0.45, airGlideS: 0.3, airAttackS: 0.004, airDecayS: 0.32, airGain: 2.6,
  ringHz: [640, 1047, 1523, 2210, 2870], ringAmps: [0.6, 0.9, 1, 0.75, 0.5], ringDecays: [0.35, 0.33, 0.3, 0.27, 0.24], ringGain: 0.3,
  splashAtS: 0.37, splashThumpLowHz: 250, splashThumpHighHz: 800, splashThumpDecayS: 0.08, splashThumpGain: 1.6,
  splashLowHz: 400, splashHighHz: 4000, splashAttackS: 0.005, splashDecayS: 0.2, splashGain: 1.6,
  whineAtS: 0.45, whineFromHz: 700, whineToHz: 1100, whineGlideS: 0.5, whineDetune: 1.012, whineWidth: 0.06,
  whineAttackS: 0.06, whineDecayS: 0.4, whineGain: 0.16, whineNoiseGain: 0.6,
  tailFadeS: 0.1,
} as const;

function torpLaunch(n: number): Float32Array {
  const c = TORP_LAUNCH;
  const rng = new SeededRng(SFX_SEED_TORP_LAUNCH);
  // ① 衝撃
  const out = mul(highPass(whiteNoise(rng, n), c.crackHighPassHz), envelope(n, c.crackAttackS, c.crackDecayS));
  for (let i = 0; i < n; i++) out[i] = out[i]! * c.crackGain;
  mixInto(out, saturate(mul(sine(n, c.punchFromHz, c.punchToHz, c.punchGlideS), envelope(n, c.punchAttackS, c.punchDecayS)), c.punchDrive), c.punchGain);
  mixInto(out, mul(bandPass(whiteNoise(rng, n), c.thumpLowHz, c.thumpHighHz), envelope(n, c.thumpAttackS, c.thumpDecayS)), c.thumpGain);
  // ② 圧縮空気
  const lo = 1 - c.airWidth, hi = 1 + c.airWidth;
  mixInto(out, mul(bandPass(whiteNoise(rng, n), c.airFromHz * lo, c.airFromHz * hi, c.airToHz * lo, c.airToHz * hi, c.airGlideS), envelope(n, c.airAttackS, c.airDecayS)), c.airGain);
  // ③ 管の響き
  mixInto(out, modes(n, c.ringHz, c.ringAmps, c.ringDecays), c.ringGain);
  // ④ 着水
  const sn = n - sfxSamples(c.splashAtS);
  mixInto(out, mul(bandPass(whiteNoise(rng, sn), c.splashThumpLowHz, c.splashThumpHighHz), envelope(sn, c.splashAttackS, c.splashThumpDecayS)), c.splashThumpGain, c.splashAtS);
  mixInto(out, mul(bandPass(whiteNoise(rng, sn), c.splashLowHz, c.splashHighHz), envelope(sn, c.splashAttackS, c.splashDecayS)), c.splashGain, c.splashAtS);
  // ⑤ スクリュー（遠ざかる）
  const wn = n - sfxSamples(c.whineAtS);
  const whine = sine(wn, c.whineFromHz, c.whineToHz, c.whineGlideS);
  mixInto(whine, sine(wn, c.whineFromHz * c.whineDetune, c.whineToHz * c.whineDetune, c.whineGlideS));
  const wlo = 1 - c.whineWidth, whi = 1 + c.whineWidth;
  mixInto(whine, bandPass(whiteNoise(rng, wn), c.whineFromHz * wlo, c.whineFromHz * whi, c.whineToHz * wlo, c.whineToHz * whi, c.whineGlideS), c.whineNoiseGain);
  mixInto(out, mul(whine, envelope(wn, c.whineAttackS, c.whineDecayS)), c.whineGain, c.whineAtS);
  return fadeTail(out, c.tailFadeS);
}

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
export const EVENT_RECIPES: Partial<Record<SfxKey, SfxRecipe>> = { torp_launch: torpLaunch, light_on: lightOn, flare_pop: flarePop, bomb_fall: bombFall, smoke };
