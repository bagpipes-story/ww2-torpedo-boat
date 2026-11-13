// v0.7.1 IP3（実機 3 回目「魚雷はんーもう何案か出してください」）: 魚雷の発射の新しい案 E〜I（試聴の場 ?sfxlab だけ。ゲームの既定は sfx-recipes-launch の A のまま）。
// A〜D のどれも好まれなかった（IP1「ポンっ」・「カッコよく」）ので、小さい調整ではなく向きの違う 5 つ: E 大砲型「ドンッ＋ザバーン」・F 落とす型「ガコン＋ザブン」
// （1943 年からの米 PT の Mk 13 は舷側の台から転がして落とした＝史実の向き）・G 映画型「シュッ…ズドン」・H 走り去る型「ドシュウゥン」・I「A を重く大きく」（大きさが足りなかったかを確かめる）。
// どれも本体のスピーカー向け: 芯のエネルギーは 300〜400 Hz より上、「どん」は高さの無い雑音か速く滑る物だけ（長く鳴る低い正弦は倍音が「ぽん」に聞こえる＝使わない）。
// 1 つの音は雑音の塊（Burst）の和: 帯（掃引できる・2 回重ねて外を強く落とす）× 包絡（立ち上がりの曲がり pow）→ 歪み（頂 1 にそろえて tanh＝圧縮して太く）→ 大きさの揺れ（スクリューの拍）。
// F の金属の当たりと擦れは弾倉の B と同じ雑音の金属（sfx-recipes-reload の clack・slide）。数は音色の定数（聞かせ方）。乱数は案ごとの音だけの種 SFX_SEED_LAB_LAUNCH_*。
import {
  SFX_SAMPLE_RATE, SFX_SEED_LAB_LAUNCH_E, SFX_SEED_LAB_LAUNCH_F, SFX_SEED_LAB_LAUNCH_G, SFX_SEED_LAB_LAUNCH_H, SFX_SEED_LAB_LAUNCH_I,
} from '../config/sfx-config';
import { SeededRng } from '../core/rng';
import { bandPass, fadeTail, highPass, mixInto, peakOf, sfxSamples, whiteNoise, type SfxRecipe } from './sfx-dsp';
import { LAUNCH_A, launch, type Launch } from './sfx-recipes-launch';
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
  /** 音だけの乱数（案ごとの種 SFX_SEED_LAB_LAUNCH_*） */
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

/** 尾の写し（taps 秒ごとに別の雑音・低めの帯・少し歪ませる）＝船体と海面の響き。同じ雑音を重ねると櫛の高さが出るので塊ごとに引き直す */
function echoes(tapsS: readonly number[], gains: readonly number[], loHz: number, hiHz: number, decayS: number, drive: number): Burst[] {
  return tapsS.map((t, i) => ({ atS: t, gain: gains[i]!, loHz, hiHz, twice: true, attackS: 0.004, decayS: decayS * (1 + 0.25 * i), drive }));
}
/** 着水: 低い帯の「どぼ」（歪ませる）＋ 広い帯の「ざあっ」＋ 後の水の崩れ */
function splash(atS: number, thumpGain: number, washS: number, washGain: number, fallGain: number): Burst[] {
  return [
    { atS, gain: thumpGain, loHz: 250, hiHz: 850, twice: true, attackS: 0.004, decayS: 0.09, drive: 2 },
    { atS, gain: washGain, loHz: 500, hiHz: 5000, attackS: 0.008, decayS: washS },
    { atS: atS + 0.08, gain: fallGain, loHz: 350, hiHz: 3000, attackS: 0.06, decayS: washS * 1.6 },
  ];
}

/** E 大砲型「ドンッ＋ザバーン」: 1〜3 ms の鋭い割れ → 250〜900 Hz の雑音の爆風（歪み 6＝強く圧縮・減衰 0.34 秒）→ 30〜120 ms 間隔の拡がった響き 6 つ＋0.5 秒の残り → 0.4 秒に大きい着水 */
const E: Recipe2 = {
  rng: () => new SeededRng(SFX_SEED_LAB_LAUNCH_E),
  bursts: [
    { atS: 0, gain: 2.2, loHz: 2000, hiHz: 0, attackS: 0.0002, decayS: 0.0025 },
    { atS: 0, gain: 1.6, loHz: 300, hiHz: 0, attackS: 0.0002, decayS: 0.0012 },
    { atS: 0, gain: 1, loHz: 250, hiHz: 900, twice: true, attackS: 0.001, decayS: 0.34, drive: 6 },
    { atS: 0, gain: 0.4, loHz: 900, hiHz: 2600, attackS: 0.001, decayS: 0.09, drive: 2 },
    ...echoes([0.031, 0.062, 0.095, 0.13, 0.172, 0.215], [0.5, 0.42, 0.34, 0.27, 0.2, 0.14], 220, 1300, 0.16, 1.5),
    { atS: 0.02, gain: 0.3, loHz: 200, hiHz: 1200, attackS: 0.05, decayS: 0.5 },
    ...splash(0.4, 0.75, 0.3, 0.85, 0.35),
  ],
  tailFadeS: 0.12,
};

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

/** G 映画型「シュッ…ズドン」: 0.16 秒の吸い込み（逆回しのように上がる帯の雑音 400 Hz〜1.2k → 1.8k〜6k Hz）→ 割れ＋雑音の爆発（歪み 7）→ 0.75 秒の長い尾と高い「空気」→ 0.62 秒に中くらいの着水 */
const G: Recipe2 = {
  rng: () => new SeededRng(SFX_SEED_LAB_LAUNCH_G),
  bursts: [
    { atS: 0, gain: 0.7, loHz: 400, hiHz: 1200, toLoHz: 1800, toHiHz: 6000, glideS: 0.16, attackS: 0.155, attackPow: 3, decayS: 0.008, lenS: 0.18 },
    { atS: 0.16, gain: 2.4, loHz: 1500, hiHz: 0, attackS: 0.0002, decayS: 0.003 },
    { atS: 0.16, gain: 1, loHz: 200, hiHz: 800, twice: true, attackS: 0.001, decayS: 0.3, drive: 7 },
    { atS: 0.16, gain: 0.4, loHz: 700, hiHz: 2200, attackS: 0.001, decayS: 0.1, drive: 2 },
    ...echoes([0.2, 0.245, 0.295], [0.4, 0.3, 0.22], 200, 1000, 0.25, 1.5),
    { atS: 0.17, gain: 0.45, loHz: 150, hiHz: 900, attackS: 0.04, decayS: 0.75, drive: 1.5 },
    { atS: 0.17, gain: 0.12, loHz: 3000, hiHz: 8000, attackS: 0.03, decayS: 0.5 },
    ...splash(0.62, 0.45, 0.22, 0.5, 0.2),
  ],
  tailFadeS: 0.12,
};

/** H 走り去る型「ドシュウゥン」: 割れ＋打撃＋空気の噴き出し → 1.6k → 500 Hz へ 1.15 秒で下がる帯の雑音（ドップラーで遠ざかる）を 34 → 26 Hz の拍（スクリュー）で揺らしながら 1.2 秒で消す */
const H: Recipe2 = {
  rng: () => new SeededRng(SFX_SEED_LAB_LAUNCH_H),
  bursts: [
    { atS: 0, gain: 2.2, loHz: 1800, hiHz: 0, attackS: 0.0002, decayS: 0.003 },
    { atS: 0, gain: 0.8, loHz: 250, hiHz: 900, twice: true, attackS: 0.001, decayS: 0.12, drive: 3 },
    { atS: 0.005, gain: 0.9, loHz: 1500, hiHz: 6000, toLoHz: 900, toHiHz: 3000, glideS: 0.15, attackS: 0.003, decayS: 0.15 },
    { atS: 0.18, gain: 0.35, loHz: 500, hiHz: 4000, attackS: 0.006, decayS: 0.12 },
    { atS: 0.05, gain: 0.9, loHz: 1040, hiHz: 2160, toLoHz: 325, toHiHz: 675, glideS: 1.15, attackS: 0.12, decayS: 1.2, lenS: 1.4, amHz: 34, amToHz: 26, amDepth: 0.55, drive: 1.2 },
    { atS: 0.05, gain: 0.4, loHz: 300, hiHz: 900, toLoHz: 180, toHiHz: 550, glideS: 1.1, attackS: 0.15, decayS: 0.9, lenS: 1.4, amHz: 34, amToHz: 26, amDepth: 0.55 },
  ],
  tailFadeS: 0.12,
};

/** I「A を重く大きく」: A の形のまま、打撃 170〜720 Hz を歪み 5・減衰 0.34 秒に・上の打撃・尾 6 つ（0.1 秒まで）・0.55 秒の船体の残り・0.42 秒の大きい着水 */
const I: Launch = {
  ...LAUNCH_A,
  crackGain: 2.6,
  thuds: [{ loHz: 170, hiHz: 720, attackS: 0.002, decayS: 0.34, drive: 7, gain: 1 }, { loHz: 350, hiHz: 1300, attackS: 0.001, decayS: 0.12, drive: 2.5, gain: 0.35 }],
  tail: { tapsS: [0.022, 0.037, 0.051, 0.064, 0.082, 0.101], gains: [0.55, 0.45, 0.36, 0.28, 0.2, 0.14], loHz: 200, hiHz: 950, decayS: 0.2 }, tailGain: 0.8,
  roomLoHz: 250, roomHiHz: 1200, roomAttackS: 0.03, roomDecayS: 0.75, roomGain: 0.6,
  airGain: 1.9, splashAtS: 0.42, splashThumpS: 0.1, splashThumpGain: 1.1, splashS: 0.26, splashGain: 1.2, tailFadeS: 0.12, busDrive: 2,
};

/** 新しい案 E〜I（秒は案ごと。試聴の場だけ＝起動時の標本の合計 70 万には入らない） */
export const LAUNCH_NEW_VARIANTS: readonly SfxRecipeVariant[] = [
  { id: 'E', recipe: recipe2(E), seconds: 1.3, rate: 1 },
  { id: 'F', recipe: recipe2(F), seconds: 1.4, rate: 1 },
  { id: 'G', recipe: recipe2(G), seconds: 1.5, rate: 1 },
  { id: 'H', recipe: recipe2(H), seconds: 1.5, rate: 1 },
  { id: 'I', recipe: launch(I, () => new SeededRng(SFX_SEED_LAB_LAUNCH_I)), seconds: 1.2, rate: 1 },
];
