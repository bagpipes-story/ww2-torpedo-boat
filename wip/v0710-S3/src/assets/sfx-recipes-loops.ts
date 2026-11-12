// v0.7.1 S3（アートと音②：合成の効果音。spec-v0710 §4・§5・§14 L6）: ループ 5 本の作り方（engine・sea・fire・rain・drone）。任務の間だけ鳴らし続ける（systems/sfx-loop-player）。
// 継ぎ目: buffer 全体を繰り返す（L6）ので、終わりの次が頭に続くように作る。周期の合う音（engine の点火の拍・drone の倍音）は整数周期、雑音（sea・fire・rain と engine の排気）は
// 末尾 0.3 秒を頭に等電力で重ねる（crossfadeLoop）。ゆっくりした揺れは重ねた後に整数周期の cos で掛ける（継ぎ目の前後で対称）。最後に継ぎ目を近くの静かな所へ少し回す
// （rotateToQuietSeam。頭と末尾の標本の差 < 0.05）。端の fade は掛けない（assets/sfx-bank がループには掛けない）。
// iPhone の本体のスピーカーは約 300〜400 Hz より下がほとんど出ない: どのループも 400 Hz より上に聞こえる層を持たせる（engine＝点火の拍で刻んだ排気の雑音 300〜1.8k Hz、
// drone＝倍音を 16 本まで伸ばして 500〜900 Hz を持ち上げる。数は scripts/sfx-mix.ts の「小さいスピーカーの目安」）。
// 数は音色の定数（聞かせ方。ゲームの強さの値ではない）で、鍵ごとの名前つきの表にまとめる。乱数は音だけの種。直流・頂の正規化は assets/sfx-bank。
import { SFX_SEED_DRONE, SFX_SEED_ENGINE, SFX_SEED_FIRE, SFX_SEED_RAIN, SFX_SEED_SEA, type SfxKey } from '../config/sfx-config';
import { SeededRng } from '../core/rng';
import { bandPass, crossfadeLoop, envelope, harmonics, highPass, loopSway, lowPass, mixInto, mixWrap, mul, normalizePeak, rotateToQuietSeam, saturate, sfxSamples, whiteNoise, type SfxRecipe } from './sfx-dsp';

/** 継ぎ目: 雑音の末尾を頭に重ねる秒と、継ぎ目を静かな所へ回す範囲（前後の秒） */
const SEAM = { overlapS: 0.3, quietS: 0.05 } as const;

/** 継ぎ目の合う雑音（長さ n）: 長さ n ＋ 重ねの白色雑音に filter を掛けてから、末尾を頭に等電力で重ねる */
function loopNoise(rng: SeededRng, n: number, filter: (x: Float32Array) => Float32Array): Float32Array {
  return crossfadeLoop(filter(whiteNoise(rng, n + sfxSamples(SEAM.overlapS))), n, SEAM.overlapS);
}

/**
 * engine（1.0 秒。自艇のエンジン。rate 0.75〜1.5 で回す）: 毎秒 28 回の点火の拍（1 秒に整数周期＝継ぎ目は周期で合う）。
 * 低いうなり＝28 Hz の倍音 6 本（イヤホン用。本体のスピーカーでは出ない）＋ 排気＝雑音の帯 300〜1.8k Hz と低域通過 500 Hz を点火の拍の包絡（鋭く立って周期の中で減衰。
 * 4 発で 1 巡の大きさのむら＝毎秒 7 回のうねり）で刻む（本体のスピーカーで「ばばばば」と聞こえる層）。全体を柔らかく歪ませて詰める
 */
const ENGINE = {
  firings: 28, harmonics: [1, 0.5, 0.33, 0.25, 0.2, 0.17], toneGain: 0.3,
  lump: [1, 0.8, 0.92, 0.74], pulseAttack: 0.05, pulseDecay: 0.3, pulseFloor: 0.14,
  exhaustLowHz: 300, exhaustHighHz: 1800, exhaustGain: 2.7, bodyHz: 500, bodyPoles: 2, bodyGain: 4.5,
  drive: 1.5,
} as const;

function engine(n: number): Float32Array {
  const c = ENGINE;
  const rng = new SeededRng(SFX_SEED_ENGINE);
  const pulse = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = (c.firings * i) / n;
    const k = Math.floor(u);
    const ph = u - k;
    const e = ph < c.pulseAttack ? ph / c.pulseAttack : Math.exp(-(ph - c.pulseAttack) / c.pulseDecay);
    pulse[i] = c.lump[k % c.lump.length]! * (c.pulseFloor + (1 - c.pulseFloor) * e);
  }
  const out = harmonics(n, c.firings, c.harmonics);
  for (let i = 0; i < n; i++) out[i] = out[i]! * c.toneGain;
  mixInto(out, mul(loopNoise(rng, n, (x) => bandPass(x, c.exhaustLowHz, c.exhaustHighHz)), pulse), c.exhaustGain);
  mixInto(out, mul(loopNoise(rng, n, (x) => lowPass(x, c.bodyHz, c.bodyHz, 0, c.bodyPoles)), pulse), c.bodyGain);
  return rotateToQuietSeam(saturate(normalizePeak(out, 1), c.drive), SEAM.quietS);
}

/**
 * sea（4.0 秒。波と艇首の水）: 桃色寄りの雑音（低域通過 1.2k Hz。120 Hz より下のごろごろは切る）に、4 秒で 1 回と 2 回のうねり（0.25 Hz・0.5 Hz。継ぎ目が谷）。
 * うねりの山で白い泡の層（雑音の帯 1.5k〜4.5k Hz）が立つ
 */
const SEA = {
  bedHz: 1200, bedPoles: 2, bedCutHz: 120, bedGain: 1, swellCycles: 1, swellDepth: -0.28, chopCycles: 2, chopDepth: -0.16,
  foamLowHz: 1500, foamHighHz: 4500, foamGain: 0.22, foamDepth: -0.75,
} as const;

function sea(n: number): Float32Array {
  const c = SEA;
  const rng = new SeededRng(SFX_SEED_SEA);
  const out = loopSway(loopSway(loopNoise(rng, n, (x) => highPass(lowPass(x, c.bedHz, c.bedHz, 0, c.bedPoles), c.bedCutHz)), c.swellCycles, c.swellDepth), c.chopCycles, c.chopDepth);
  for (let i = 0; i < n; i++) out[i] = out[i]! * c.bedGain;
  mixInto(out, loopSway(loopNoise(rng, n, (x) => bandPass(x, c.foamLowHz, c.foamHighHz)), c.swellCycles, c.foamDepth), c.foamGain);
  return rotateToQuietSeam(out, SEAM.quietS);
}

/**
 * fire（2.0 秒。艇の火災）: ごうごう＝雑音の低域通過 800 Hz（2 極）と帯 300〜1.5k Hz を、不揃いな速さの揺らぎ（2 秒に整数周期の cos を 5 本。向きは乱数）で揺らす＋
 * ぱちぱち＝乱数の時刻の短い高域の破裂（輪の中に回して置く＝継ぎ目をまたいでも切れない）
 */
const FIRE = {
  roarHz: 800, roarPoles: 2, roarGain: 2.2, midLowHz: 300, midHighHz: 1500, midGain: 0.8,
  flutterCycles: [3, 5, 8, 13, 19], flutterDepth: [0.16, 0.13, 0.1, 0.08, 0.06],
  crackles: 26, crackleHighPassHz: 1800, crackleAttackS: 0.0004, crackleDecayMinS: 0.003, crackleDecayMaxS: 0.012, crackleGainMin: 0.5, crackleGainMax: 1.6,
} as const;

function fire(n: number): Float32Array {
  const c = FIRE;
  const rng = new SeededRng(SFX_SEED_FIRE);
  const out = loopNoise(rng, n, (x) => lowPass(x, c.roarHz, c.roarHz, 0, c.roarPoles));
  for (let i = 0; i < n; i++) out[i] = out[i]! * c.roarGain;
  mixInto(out, loopNoise(rng, n, (x) => bandPass(x, c.midLowHz, c.midHighHz)), c.midGain);
  for (let k = 0; k < c.flutterCycles.length; k++) loopSway(out, c.flutterCycles[k]!, rng.next() < 0.5 ? c.flutterDepth[k]! : -c.flutterDepth[k]!);
  const hiss = highPass(whiteNoise(rng, n), c.crackleHighPassHz);
  // ぱちぱち 1 個につき 3 回引く（時刻・長さ・大きさ）
  for (let k = 0; k < c.crackles; k++) {
    const at = Math.floor(rng.next() * n);
    const decayS = rng.nextRange(c.crackleDecayMinS, c.crackleDecayMaxS);
    const gain = rng.nextRange(c.crackleGainMin, c.crackleGainMax);
    const len = sfxSamples(decayS * 3);
    mixWrap(out, mul(hiss.slice(k * len, (k + 1) * len), envelope(len, c.crackleAttackS, decayS)), gain, at);
  }
  return rotateToQuietSeam(out, SEAM.quietS);
}

/**
 * rain（2.0 秒。暴風の帯の雨と風）: 雨＝雑音の高域通過 2.5k Hz（少しだけ揺らす）＋ 風＝雑音の帯 200〜500 Hz のゆっくりした揺れ（2 秒で 1 回）と、
 * 本体のスピーカーでも聞こえる風の層（帯 500〜1.4k Hz。同じ揺れ）
 */
const RAIN = {
  rainHz: 2500, rainGain: 1, rainCycles: 3, rainDepth: 0.08,
  windLowHz: 200, windHighHz: 500, windGain: 1.5, gustLowHz: 500, gustHighHz: 1400, gustGain: 0.45, windCycles: 1, windDepth: -0.45,
} as const;

function rain(n: number): Float32Array {
  const c = RAIN;
  const rng = new SeededRng(SFX_SEED_RAIN);
  const out = loopSway(loopNoise(rng, n, (x) => highPass(x, c.rainHz)), c.rainCycles, c.rainDepth);
  for (let i = 0; i < n; i++) out[i] = out[i]! * c.rainGain;
  mixInto(out, loopSway(loopNoise(rng, n, (x) => bandPass(x, c.windLowHz, c.windHighHz)), c.windCycles, c.windDepth), c.windGain);
  mixInto(out, loopSway(loopNoise(rng, n, (x) => bandPass(x, c.gustLowHz, c.gustHighHz)), c.windCycles, c.windDepth), c.gustGain);
  return rotateToQuietSeam(out, SEAM.quietS);
}

/**
 * drone（1.5 秒。機の爆音。rate 0.9〜1.15）: 96 Hz の鋸波寄りの倍音（1.5 秒に 144 周期）と、少しずれた 100 Hz（150 周期）の 2 本＝毎秒 4 回のうなり。
 * 倍音は 16 本まで（大きさは 1/h^tilt。5〜9 倍音＝約 500〜900 Hz を持ち上げて本体のスピーカーでも聞こえるように）。歪ませてさらに倍音を足し、
 * プロペラの風切り（雑音の帯 400〜1.6k Hz を毎秒 12 回で刻む）を薄く重ねる
 */
const DRONE = {
  cyclesA: 144, cyclesB: 150, harmonics: 16, tilt: 0.8, boostFrom: 5, boostTo: 9, boost: 2.2, gainB: 0.8, drive: 1.2,
  washLowHz: 400, washHighHz: 1600, washCycles: 18, washDepth: 0.6, washGain: 0.5,
} as const;

function drone(n: number): Float32Array {
  const c = DRONE;
  const rng = new SeededRng(SFX_SEED_DRONE);
  const amps: number[] = [];
  for (let h = 1; h <= c.harmonics; h++) amps.push(Math.pow(h, -c.tilt) * (h >= c.boostFrom && h <= c.boostTo ? c.boost : 1));
  const out = saturate(normalizePeak(mixInto(harmonics(n, c.cyclesA, amps), harmonics(n, c.cyclesB, amps), c.gainB), 1), c.drive);
  mixInto(out, loopSway(loopNoise(rng, n, (x) => bandPass(x, c.washLowHz, c.washHighHz)), c.washCycles, c.washDepth), c.washGain);
  return rotateToQuietSeam(out, SEAM.quietS);
}

/** ループの作り方（鍵 → 関数） */
export const LOOP_RECIPES: Partial<Record<SfxKey, SfxRecipe>> = { engine, sea, fire, rain, drone };
