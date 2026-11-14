// v0.7.1 IP2（実機 2 回目「魚雷発射音もどんっではなくポンっという音に聞こえます」）: 魚雷の発射 `torp_launch` の作り方。IP1 の芯は 140 → 60 Hz の正弦を歪ませた物で、
// 本体のスピーカー（約 300 Hz より下が出ない）では倍音だけが残って高さのある短い「ぽん」になった（管の響き・スクリューの正弦も高さを足した）。
// 小さいスピーカーの「どん・どすっ」＝高さの無い雑音のエネルギーを 180〜700 Hz に集め、速く立ち上げて 0.15〜0.3 秒で減衰、雑音のほうを柔らかく歪ませて太く（正弦は歪ませない）、
// 20〜60 ms の短い拡がった尾（別々の雑音を遅らせて重ねる＝船体の響き。同じ雑音を重ねると櫛の高さが出る）。圧縮空気の「ぶしゅっ」と着水の「ざぶん」は残す。
// 試聴の場（?sfxlab）で聞き比べる案: A「どすん＋ぶしゅっ」（IP2〜IP3 の既定）・B 大きい「どおん」・C「ばしゅっ」（空気の発射が主・低いのは少し）・D IP1 の音（比べる用）。
// IP3（実機 3 回目「魚雷はんーもう何案か出してください」）: 新しい案 E〜I は assets/sfx-recipes-launch2。IP4（実機 4 回目「魚雷はFで行きます」＝U-R2）: ゲームの既定は F
// （両方の案の表が見える sfx-recipes-launch2 の LAUNCH_DEFAULT_ID・LAUNCH_RECIPES。ここから launch2 を import すると輪になる）。A〜D は試聴の場に比べる用に残す。
// 数は音色の定数（聞かせ方）で、案ごとの名前つきの表。乱数は音だけの種 SFX_SEED_TORP_LAUNCH。直流・端の fade・頂の正規化は assets/sfx-bank。
import { SFX_SEED_TORP_LAUNCH } from '../config/sfx-config';
import { SeededRng } from '../core/rng';
import { bandPass, envelope, fadeTail, highPass, mixInto, modes, mul, peakOf, saturate, sfxSamples, sine, whiteNoise, type SfxRecipe } from './sfx-dsp';
import type { SfxRecipeVariant } from './sfx-recipes-reload';

/** 発射の打撃（雑音だけ。帯を 2 回重ねて 180〜700 Hz の外を強く落とす → 頂 1 にそろえて tanh で柔らかく歪ませる＝太く・高さなし） */
interface Thud { readonly loHz: number; readonly hiHz: number; readonly attackS: number; readonly decayS: number; readonly drive: number; readonly gain: number }
/** 拡がった尾: taps の秒ごとに別の雑音の短い打撃（帯・減衰は共通）を gains の大きさで */
interface Tail { readonly tapsS: readonly number[]; readonly gains: readonly number[]; readonly loHz: number; readonly hiHz: number; readonly decayS: number }
export interface Launch {
  /** 頭の割れ（高域通過の雑音・数 ms） */
  readonly crackHpHz: number; readonly crackS: number; readonly crackGain: number;
  readonly thuds: readonly Thud[];
  readonly tail: Tail; readonly tailGain: number;
  /** 長い船体の残り（帯の雑音・ゆっくり立って消える。0 で無し） */
  readonly roomLoHz: number; readonly roomHiHz: number; readonly roomAttackS: number; readonly roomDecayS: number; readonly roomGain: number;
  /** 圧縮空気（帯の掃引。帯は中心の 1 ± airWidth） */
  readonly airAtS: number; readonly airFromHz: number; readonly airToHz: number; readonly airWidth: number; readonly airGlideS: number; readonly airAttackS: number; readonly airDecayS: number; readonly airGain: number;
  /** 着水（低い帯の「どぼ」＋ 広い帯の「ざぶん」） */
  readonly splashAtS: number; readonly splashThumpS: number; readonly splashThumpGain: number; readonly splashS: number; readonly splashGain: number;
  readonly tailFadeS: number;
  /** IP3: 全体の歪み（頂 1 にそろえて tanh＝全体を圧縮して大きく。無しは A〜C） */
  readonly busDrive?: number;
}
const ATTACK_S = 0.0003;
const SPLASH = { thumpLoHz: 250, thumpHiHz: 800, loHz: 400, hiHz: 4000, attackS: 0.005 } as const;

function thud(n: number, rng: SeededRng, t: Thud, atS = 0): Float32Array {
  const len = n - sfxSamples(atS);
  const x = mul(bandPass(bandPass(whiteNoise(rng, len), t.loHz, t.hiHz), t.loHz, t.hiHz), envelope(len, t.attackS, t.decayS));
  const g = 1 / Math.max(1e-9, peakOf(x));
  for (let i = 0; i < len; i++) x[i] = x[i]! * g;
  return saturate(x, t.drive);
}

/** 案の表 → 作り方（乱数は音だけの種。A〜C は SFX_SEED_TORP_LAUNCH・IP3 の I は makeRng＝試聴の場の種） */
export function launch(c: Launch, makeRng?: () => SeededRng): SfxRecipe {
  return (n) => {
    const rng = makeRng ? makeRng() : new SeededRng(SFX_SEED_TORP_LAUNCH);
    const out = mul(highPass(whiteNoise(rng, n), c.crackHpHz), envelope(n, ATTACK_S, c.crackS));
    for (let i = 0; i < n; i++) out[i] = out[i]! * c.crackGain;
    for (const t of c.thuds) mixInto(out, thud(n, rng, t), t.gain);
    const tl = c.tail;
    for (let k = 0; k < tl.tapsS.length; k++) {
      mixInto(out, thud(n, rng, { loHz: tl.loHz, hiHz: tl.hiHz, attackS: ATTACK_S * 10, decayS: tl.decayS, drive: 1, gain: 1 }, tl.tapsS[k]!), tl.gains[k]! * c.tailGain, tl.tapsS[k]!);
    }
    if (c.roomGain > 0) mixInto(out, mul(bandPass(whiteNoise(rng, n), c.roomLoHz, c.roomHiHz), envelope(n, c.roomAttackS, c.roomDecayS)), c.roomGain);
    const an = n - sfxSamples(c.airAtS);
    const lo = 1 - c.airWidth, hi = 1 + c.airWidth;
    mixInto(out, mul(bandPass(whiteNoise(rng, an), c.airFromHz * lo, c.airFromHz * hi, c.airToHz * lo, c.airToHz * hi, c.airGlideS), envelope(an, c.airAttackS, c.airDecayS)), c.airGain, c.airAtS);
    const sn = n - sfxSamples(c.splashAtS);
    mixInto(out, mul(bandPass(whiteNoise(rng, sn), SPLASH.thumpLoHz, SPLASH.thumpHiHz), envelope(sn, SPLASH.attackS, c.splashThumpS)), c.splashThumpGain, c.splashAtS);
    mixInto(out, mul(bandPass(whiteNoise(rng, sn), SPLASH.loHz, SPLASH.hiHz), envelope(sn, SPLASH.attackS, c.splashS)), c.splashGain, c.splashAtS);
    if (c.busDrive) {
      const g = 1 / Math.max(1e-9, peakOf(out));
      for (let i = 0; i < n; i++) out[i] = Math.tanh(out[i]! * g * c.busDrive);
    }
    return fadeTail(out, c.tailFadeS);
  };
}

/** A「どすん＋ぶしゅっ」（IP2〜IP3 の既定）: 180〜700 Hz の雑音の打撃（減衰 0.22 秒・歪み 2.5）＋ 22〜64 ms の尾 4 つ ＋ 空気の掃引 3k → 800 Hz ＋ 0.37 秒に着水 */
export const LAUNCH_A: Launch = {
  crackHpHz: 1500, crackS: 0.005, crackGain: 2.4,
  thuds: [{ loHz: 180, hiHz: 700, attackS: 0.002, decayS: 0.22, drive: 2.5, gain: 1 }],
  tail: { tapsS: [0.022, 0.037, 0.051, 0.064], gains: [0.5, 0.38, 0.28, 0.2], loHz: 200, hiHz: 900, decayS: 0.12 }, tailGain: 0.7,
  roomLoHz: 0, roomHiHz: 0, roomAttackS: 0, roomDecayS: 0, roomGain: 0,
  airAtS: 0.04, airFromHz: 3000, airToHz: 800, airWidth: 0.45, airGlideS: 0.3, airAttackS: 0.02, airDecayS: 0.35, airGain: 1.6,
  splashAtS: 0.37, splashThumpS: 0.08, splashThumpGain: 1, splashS: 0.2, splashGain: 1.1, tailFadeS: 0.1,
};
/** B 大きい「どおん」: 低い打撃 140〜600 Hz（減衰 0.32 秒・歪み 3.5）＋ 上の打撃 300 Hz〜1.2k Hz ＋ 90 ms までの尾 6 つ ＋ 長い船体の残り（0.45 秒）。空気は小さく、着水は 0.45 秒 */
const LAUNCH_B: Launch = {
  crackHpHz: 1200, crackS: 0.005, crackGain: 0.5,
  thuds: [{ loHz: 140, hiHz: 600, attackS: 0.003, decayS: 0.32, drive: 3.5, gain: 1 }, { loHz: 300, hiHz: 1200, attackS: 0.002, decayS: 0.12, drive: 2, gain: 0.45 }],
  tail: { tapsS: [0.019, 0.031, 0.046, 0.058, 0.073, 0.089], gains: [0.6, 0.5, 0.42, 0.34, 0.26, 0.2], loHz: 160, hiHz: 750, decayS: 0.18 }, tailGain: 1,
  roomLoHz: 200, roomHiHz: 800, roomAttackS: 0.03, roomDecayS: 0.45, roomGain: 0.6,
  airAtS: 0.03, airFromHz: 2500, airToHz: 700, airWidth: 0.4, airGlideS: 0.3, airAttackS: 0.02, airDecayS: 0.3, airGain: 0.8,
  splashAtS: 0.45, splashThumpS: 0.09, splashThumpGain: 1.2, splashS: 0.2, splashGain: 1.1, tailFadeS: 0.1,
};
/** C「ばしゅっ」: 鋭い割れ（高域通過 2.5k Hz・7 ms）＋ 小さい打撃 400 Hz〜1.5k Hz（0.08 秒）＋ 長い空気の掃引 5k → 900 Hz（0.45 秒）。低いのは少し。着水は 0.42 秒 */
const LAUNCH_C: Launch = {
  crackHpHz: 2500, crackS: 0.007, crackGain: 1.4,
  thuds: [{ loHz: 400, hiHz: 1500, attackS: 0.001, decayS: 0.08, drive: 1.5, gain: 0.45 }],
  tail: { tapsS: [0.02, 0.035], gains: [0.3, 0.2], loHz: 500, hiHz: 1800, decayS: 0.06 }, tailGain: 1,
  roomLoHz: 0, roomHiHz: 0, roomAttackS: 0, roomDecayS: 0, roomGain: 0,
  airAtS: 0.004, airFromHz: 5000, airToHz: 900, airWidth: 0.45, airGlideS: 0.45, airAttackS: 0.005, airDecayS: 0.5, airGain: 2.6,
  splashAtS: 0.42, splashThumpS: 0.07, splashThumpGain: 0.9, splashS: 0.2, splashGain: 1.3, tailFadeS: 0.1,
};

/**
 * D＝IP1 の torp_launch（1.0 秒。比べる用。IP1 のまま＝指紋 1786366453）: ① 雑音の割れ ＋ 正弦 140 → 60 Hz を強く歪ませた打撃 ＋ 帯の雑音 300 Hz〜1.2k Hz ② 空気の掃引 3.5k → 700 Hz
 * ③ 管の響き（5 本のモード 640 Hz〜2.9k Hz）④ 0.37 秒に着水 ⑤ スクリューの「ういーん」（700 → 1.1k Hz）
 */
const IP1 = {
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

function launchIp1(n: number): Float32Array {
  const c = IP1;
  const rng = new SeededRng(SFX_SEED_TORP_LAUNCH);
  const out = mul(highPass(whiteNoise(rng, n), c.crackHighPassHz), envelope(n, c.crackAttackS, c.crackDecayS));
  for (let i = 0; i < n; i++) out[i] = out[i]! * c.crackGain;
  mixInto(out, saturate(mul(sine(n, c.punchFromHz, c.punchToHz, c.punchGlideS), envelope(n, c.punchAttackS, c.punchDecayS)), c.punchDrive), c.punchGain);
  mixInto(out, mul(bandPass(whiteNoise(rng, n), c.thumpLowHz, c.thumpHighHz), envelope(n, c.thumpAttackS, c.thumpDecayS)), c.thumpGain);
  const lo = 1 - c.airWidth, hi = 1 + c.airWidth;
  mixInto(out, mul(bandPass(whiteNoise(rng, n), c.airFromHz * lo, c.airFromHz * hi, c.airToHz * lo, c.airToHz * hi, c.airGlideS), envelope(n, c.airAttackS, c.airDecayS)), c.airGain);
  mixInto(out, modes(n, c.ringHz, c.ringAmps, c.ringDecays), c.ringGain);
  const sn = n - sfxSamples(c.splashAtS);
  mixInto(out, mul(bandPass(whiteNoise(rng, sn), c.splashThumpLowHz, c.splashThumpHighHz), envelope(sn, c.splashAttackS, c.splashThumpDecayS)), c.splashThumpGain, c.splashAtS);
  mixInto(out, mul(bandPass(whiteNoise(rng, sn), c.splashLowHz, c.splashHighHz), envelope(sn, c.splashAttackS, c.splashDecayS)), c.splashGain, c.splashAtS);
  const wn = n - sfxSamples(c.whineAtS);
  const whine = sine(wn, c.whineFromHz, c.whineToHz, c.whineGlideS);
  mixInto(whine, sine(wn, c.whineFromHz * c.whineDetune, c.whineToHz * c.whineDetune, c.whineGlideS));
  const wlo = 1 - c.whineWidth, whi = 1 + c.whineWidth;
  mixInto(whine, bandPass(whiteNoise(rng, wn), c.whineFromHz * wlo, c.whineFromHz * whi, c.whineToHz * wlo, c.whineToHz * whi, c.whineGlideS), c.whineNoiseGain);
  mixInto(out, mul(whine, envelope(wn, c.whineAttackS, c.whineDecayS)), c.whineGain, c.whineAtS);
  return fadeTail(out, c.tailFadeS);
}

/** 標本の秒（A〜D は 1.0 秒。IP2〜IP3 の表の秒。IP4 から表の秒は既定 F の 1.4 秒） */
export const LAUNCH_SECONDS = 1.0;
export const LAUNCH_VARIANTS: readonly SfxRecipeVariant[] = [
  { id: 'A', recipe: launch(LAUNCH_A), seconds: LAUNCH_SECONDS, rate: 1 },
  { id: 'B', recipe: launch(LAUNCH_B), seconds: LAUNCH_SECONDS, rate: 1 },
  { id: 'C', recipe: launch(LAUNCH_C), seconds: LAUNCH_SECONDS, rate: 1 },
  { id: 'D', recipe: launchIp1, seconds: LAUNCH_SECONDS, rate: 1 },
];
