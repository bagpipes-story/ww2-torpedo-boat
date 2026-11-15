// v0.7.1 IP2〜IP4: 魚雷の発射 `torp_launch` の作り方。IP2（実機 2 回目「魚雷発射音もどんっではなくポンっという音に聞こえます」）の A〜D、IP3（実機 3 回目「魚雷はんーもう何案か
// 出してください」）の E〜I を試聴の場（?sfxlab）で比べ、IP4（実機 4 回目「魚雷はFで行きます」＝ユーザーの決め U-R2）でゲームの既定を F「ガコン＋ザブン」（落とす型。1943 年からの
// 米 PT の Mk 13 は舷側の台から転がして落とした＝史実の向き）に決めた。v0.7.2 S4: 使われなくなった案（A〜E・G〜I）を片づけた（v0.7.2 の束を門の内へ戻すため。ユーザーの OK 2026-11-15）。
// F の作り方・種 SFX_SEED_LAB_LAUNCH_F・秒 1.4 は IP3 で試聴したまま（v0.7.1 IP3〜IP4 の assets/sfx-recipes-launch2 から移した）＝ゲームの標本はビット同一（tests/sfx-synth の指紋 1125567461）。
// 本体のスピーカー向け: 芯のエネルギーは 300〜400 Hz より上、「どん」は高さの無い雑音だけ（長く鳴る低い正弦は倍音が「ぽん」に聞こえる＝使わない）。
// 1 つの音は雑音の塊（Burst）の和: 帯（掃引できる・2 回重ねて外を強く落とす）× 包絡（立ち上がりの曲がり pow）→ 歪み（頂 1 にそろえて tanh＝圧縮して太く）→ 大きさの揺れ。
// 金属の当たりと擦れは弾倉の B と同じ雑音の金属（sfx-recipes-reload の clack・slide）。数は音色の定数（聞かせ方）。直流・端の fade・頂の正規化は assets/sfx-bank。
import { SFX_SAMPLE_RATE, SFX_SEED_LAB_LAUNCH_F, type SfxKey } from '../config/sfx-config';
import { SeededRng } from '../core/rng';
import { bandPass, fadeTail, highPass, mixInto, peakOf, sfxSamples, whiteNoise, type SfxRecipe } from './sfx-dsp';
import { HEAVY, LIGHT, MAG_SLIDE, MID, clack, slide, type Clack, type Slide, type SfxRecipeVariant } from './sfx-recipes-reload';

const SR = SFX_SAMPLE_RATE;
const TAU = Math.PI * 2;
const LN10 = Math.log(10);
/** 塊の終わりの短い fade（途中で切る塊の継ぎ目を鳴らさない） */
const BURST_END_FADE_S = 0.005;

/**
 * 雑音の塊: atS 秒から。帯 loHz〜hiHz（hiHz 0 は loHz の高域通過＝割れ）を glideS 秒で toLoHz〜toHiHz へ掃引・twice で帯を 2 回。包絡は立ち上がり attackS 秒（(j/a)^attackPow）
 * → 減衰 decayS 秒で 1/10。drive > 0 は頂 1 にそろえて tanh(drive)（圧縮＝太く大きく）。amHz > 0 は大きさを 1 − amDepth 〜 1 で揺らす（amToHz へ掃引）。長さは lenS（0 は 6 × 減衰）
 */
interface Burst {
  readonly atS: number; readonly gain: number;
  readonly loHz: number; readonly hiHz: number; readonly toLoHz?: number; readonly toHiHz?: number; readonly glideS?: number; readonly twice?: boolean;
  readonly attackS: number; readonly decayS: number; readonly attackPow?: number; readonly lenS?: number;
  readonly drive?: number; readonly amHz?: number; readonly amToHz?: number; readonly amDepth?: number;
}
/** 泡: fromS〜toS に count 個の短い帯の雑音（中心 loHz〜hiHz のどこか・lenS 秒で rise 倍へ上がる＝「こぽ」）。後ろほど小さい（終わりで fall 倍） */
interface Bubbles { readonly fromS: number; readonly toS: number; readonly count: number; readonly loHz: number; readonly hiHz: number; readonly rise: number; readonly lenS: number; readonly decayS: number; readonly gain: number; readonly fall: number }
interface Recipe2 {
  /** 音だけの乱数（種 SFX_SEED_LAB_LAUNCH_F） */
  readonly rng: () => SeededRng;
  readonly bursts: readonly Burst[];
  readonly clacks?: readonly Clack[];
  readonly slides?: readonly Slide[];
  readonly bubbles?: Bubbles;
  readonly tailFadeS: number;
}

function burst(out: Float32Array, rng: SeededRng, b: Burst): void {
  const at = sfxSamples(b.atS);
  const len = Math.min(out.length - at, sfxSamples(b.lenS ?? b.attackS + 6 * b.decayS));
  if (len <= 0) return;
  let x = whiteNoise(rng, len);
  if (b.hiHz <= 0) x = highPass(x, b.loHz);
  else {
    const g = b.glideS ?? 0;
    x = bandPass(x, b.loHz, b.hiHz, b.toLoHz ?? b.loHz, b.toHiHz ?? b.hiHz, g);
    if (b.twice) x = bandPass(x, b.loHz, b.hiHz, b.toLoHz ?? b.loHz, b.toHiHz ?? b.hiHz, g);
  }
  const an = Math.max(1, sfxSamples(b.attackS));
  const k = LN10 / Math.max(1, b.decayS * SR);
  const pw = b.attackPow ?? 1;
  for (let j = 0; j < len; j++) x[j] = x[j]! * (j < an ? Math.pow(j / an, pw) : Math.exp(-k * (j - an)));
  if (b.drive) {
    const g = 1 / Math.max(1e-9, peakOf(x));
    for (let j = 0; j < len; j++) x[j] = Math.tanh(x[j]! * g * b.drive);
  }
  if (b.amHz) {
    const d = b.amDepth ?? 0.5, to = b.amToHz ?? b.amHz;
    let ph = 0;
    for (let j = 0; j < len; j++) {
      x[j] = x[j]! * (1 - d + d * (0.5 + 0.5 * Math.sin(ph)));
      ph += (TAU * b.amHz * Math.pow(to / b.amHz, j / len)) / SR;
    }
  }
  fadeTail(x, BURST_END_FADE_S);
  mixInto(out, x, b.gain, b.atS);
}

function bubbles(out: Float32Array, rng: SeededRng, s: Bubbles): void {
  for (let i = 0; i < s.count; i++) {
    const t = s.fromS + (s.toS - s.fromS) * ((i + rng.next()) / s.count);
    const c = s.loHz * Math.pow(s.hiHz / s.loHz, rng.next());
    const u = (t - s.fromS) / (s.toS - s.fromS);
    burst(out, rng, {
      atS: t, gain: s.gain * (0.6 + 0.4 * rng.next()) * Math.pow(s.fall, u), loHz: c * 0.8, hiHz: c * 1.25, toLoHz: c * s.rise * 0.8, toHiHz: c * s.rise * 1.25,
      glideS: s.lenS, attackS: 0.002, decayS: s.decayS, lenS: s.lenS,
    });
  }
}

function recipe2(r: Recipe2): SfxRecipe {
  return (n) => {
    const rng = r.rng();
    const out = new Float32Array(n);
    for (const s of r.slides ?? []) slide(out, rng, s);
    for (const c of r.clacks ?? []) clack(out, rng, c);
    for (const b of r.bursts) burst(out, rng, b);
    if (r.bubbles) bubbles(out, rng, r.bubbles);
    return fadeTail(out, r.tailFadeS);
  };
}

/** F の重い金属（弾倉 B の雑音の金属を低く重く: 胴 200〜900 Hz・70 ms） */
const F_HEAVY = { ...HEAVY, clickHpHz: 700, bodyLoHz: 200, bodyHiHz: 900, bodyS: 0.07, bodyGain: 4, ringHz: [820, 1240, 1770], ringS: 0.008 } as const;
/** F 落とす型「ガコン＋ザブン」: 止め金が外れる重い「ガコン」＋がたつき 4 つ → 台を転がる擦れ（0.17 秒）→ 0.24 秒に大きい「ザブン」（200 Hz〜3k Hz の胴 0.35 秒）→ 泡の「こぽこぽ」 */
const F: Recipe2 = {
  rng: () => new SeededRng(SFX_SEED_LAB_LAUNCH_F),
  clacks: [
    { ...F_HEAVY, atS: 0.004, gain: 1 }, { ...F_HEAVY, atS: 0.016, gain: 0.45 },
    { ...MID, atS: 0.038, gain: 0.32 }, { ...MID, atS: 0.055, gain: 0.26 }, { ...LIGHT, atS: 0.074, gain: 0.2 }, { ...MID, atS: 0.1, gain: 0.15 },
  ],
  slides: [{ ...MAG_SLIDE, loHz: 450, hiHz: 2200, toLoHz: 380, toHiHz: 1700, grainHz: 70, rough: 0.85, atS: 0.03, durS: 0.19, gain: 1.4 }],
  bursts: [
    { atS: 0.24, gain: 1.1, loHz: 200, hiHz: 700, twice: true, attackS: 0.004, decayS: 0.15, drive: 3 },
    { atS: 0.24, gain: 0.9, loHz: 200, hiHz: 3000, attackS: 0.006, decayS: 0.35, drive: 1.5 },
    { atS: 0.245, gain: 0.45, loHz: 1500, hiHz: 6000, attackS: 0.003, decayS: 0.16 },
    { atS: 0.3, gain: 0.25, loHz: 250, hiHz: 1500, attackS: 0.05, decayS: 0.6 },
  ],
  bubbles: { fromS: 0.42, toS: 1.2, count: 22, loHz: 500, hiHz: 1600, rise: 1.6, lenS: 0.03, decayS: 0.02, gain: 0.6, fall: 0.3 },
  tailFadeS: 0.1,
};

/** 試聴の場（assets/sfx-variants）の魚雷の発射の案: ゲームの F だけ（秒 1.4 は config/sfx-config の表の torp_launch の秒と同じ＝tests/sfx-variants） */
export const LAUNCH_VARIANTS: readonly SfxRecipeVariant[] = [{ id: 'F', recipe: recipe2(F), seconds: 1.4, rate: 1 }];
/** ゲームで鳴らす案（試聴の場の「（今）」）。IP4 で A → F（U-R2） */
export const LAUNCH_DEFAULT_ID = 'F';
/** 魚雷の発射の作り方（鍵 → 関数）: 既定の案 */
export const LAUNCH_RECIPES: Partial<Record<SfxKey, SfxRecipe>> = { torp_launch: LAUNCH_VARIANTS.find((v) => v.id === LAUNCH_DEFAULT_ID)!.recipe };
