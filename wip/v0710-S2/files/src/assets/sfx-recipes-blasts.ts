// v0.7.1（アートと音②：合成の効果音。spec-v0710 §4）: 爆発の系統の音の作り方。S0 は大きい爆発 blast_l、S2 で小さい爆発 blast_s・魚雷の命中 torp_hit・沈没 sink
// （水柱 splash_s・splash_l は assets/sfx-recipes-splashes）。数は音色の定数（聞かせ方）で、鍵ごとの名前つきの表にまとめる。乱数は音だけの種。
import { SFX_SEED_BLAST_L, SFX_SEED_BLAST_S, SFX_SEED_SINK, SFX_SEED_TORP_HIT, type SfxKey } from '../config/sfx-config';
import { SeededRng } from '../core/rng';
import { bandPass, envelope, fadeTail, highPass, lowPass, mixInto, mul, saturate, sfxSamples, sine, whiteNoise, type SfxRecipe } from './sfx-dsp';

/** 尾のぱちぱちの値（乱数の小さな破裂。高域だけ・後ろほど小さい） */
interface Crackle {
  readonly crackles: number; readonly crackleFromS: number; readonly crackleToS: number; readonly crackleHighPassHz: number; readonly crackleAttackS: number;
  readonly crackleDecayMinS: number; readonly crackleDecayMaxS: number; readonly crackleGainMin: number; readonly crackleGainMax: number; readonly crackleTailFade: number;
}

/** 尾のぱちぱちを out に足す: 時刻・長さ・大きさは音だけの乱数（1 個につき 3 回引く）。歪みの後に足す（鋭いまま） */
function addCrackles(out: Float32Array, rng: SeededRng, c: Crackle): void {
  const n = out.length;
  const hiss = highPass(whiteNoise(rng, n), c.crackleHighPassHz);
  for (let i = 0; i < c.crackles; i++) {
    const atS = rng.nextRange(c.crackleFromS, c.crackleToS);
    const decayS = rng.nextRange(c.crackleDecayMinS, c.crackleDecayMaxS);
    const gain = rng.nextRange(c.crackleGainMin, c.crackleGainMax) * (1 - (atS / c.crackleToS) * c.crackleTailFade);
    const at = sfxSamples(atS);
    const len = Math.min(sfxSamples(decayS * 3), n - at);
    mixInto(out, mul(hiss.slice(at, at + len), envelope(len, c.crackleAttackS, decayS)), gain, atS);
  }
}

/** 芯（正弦の掃引）＋轟き（雑音の低域通過の掃引）を柔らかく歪ませた爆発の体（小さいスピーカーでも芯が聞こえる）の値 */
interface Boom {
  readonly bodyFromHz: number; readonly bodyToHz: number; readonly bodyGlideS: number; readonly bodyAttackS: number; readonly bodyDecayS: number; readonly bodyGain: number;
  readonly roarFromHz: number; readonly roarToHz: number; readonly roarGlideS: number; readonly roarPoles: number; readonly roarAttackS: number; readonly roarDecayS: number; readonly roarGain: number;
  readonly drive: number;
}

function boom(n: number, rng: SeededRng, c: Boom): Float32Array {
  const out = new Float32Array(n);
  mixInto(out, mul(sine(n, c.bodyFromHz, c.bodyToHz, c.bodyGlideS), envelope(n, c.bodyAttackS, c.bodyDecayS)), c.bodyGain);
  mixInto(out, mul(lowPass(whiteNoise(rng, n), c.roarFromHz, c.roarToHz, c.roarGlideS, c.roarPoles), envelope(n, c.roarAttackS, c.roarDecayS)), c.roarGain);
  return saturate(out, c.drive);
}

/**
 * blast_l（1.6 秒）: 芯＝正弦 120 → 30 Hz（減衰 0.8 秒）＋ 轟き＝雑音の低域通過（2 極）の掃引 3k → 100 Hz を柔らかく歪ませ、
 * 尾にぱちぱち（乱数の小さな破裂。高域だけ・後ろほど小さい）
 */
const BLAST_L = {
  bodyFromHz: 120, bodyToHz: 30, bodyGlideS: 0.8, bodyAttackS: 0.004, bodyDecayS: 0.8, bodyGain: 0.7,
  roarFromHz: 3000, roarToHz: 100, roarGlideS: 1.2, roarPoles: 2, roarAttackS: 0.002, roarDecayS: 0.7, roarGain: 3.2,
  drive: 1.5,
  crackles: 14, crackleFromS: 0.18, crackleToS: 1.3, crackleHighPassHz: 1500, crackleAttackS: 0.0005, crackleDecayMinS: 0.004, crackleDecayMaxS: 0.012,
  crackleGainMin: 0.1, crackleGainMax: 0.3, crackleTailFade: 0.7,
} as const;

function blastL(n: number): Float32Array {
  const rng = new SeededRng(SFX_SEED_BLAST_L);
  const out = boom(n, rng, BLAST_L);
  addCrackles(out, rng, BLAST_L);
  return out;
}

/**
 * blast_s（0.5 秒。魚雷の不発・機銃の被弾・座礁・沈没の 2 次の爆発）: 芯＝正弦 110 → 50 Hz ＋ 轟き＝雑音の低域通過（2 極）の掃引 2k → 150 Hz を歪ませた短い「どん」。
 * 大きい爆発より芯を小さく・轟きを明るいまま短く（小さい爆発ほど高く聞こえる）。砲の鋭い頭は無く、尾に少しだけ破片のぱちぱち
 */
const BLAST_S = {
  bodyFromHz: 110, bodyToHz: 50, bodyGlideS: 0.25, bodyAttackS: 0.003, bodyDecayS: 0.2, bodyGain: 0.5,
  roarFromHz: 2000, roarToHz: 150, roarGlideS: 0.5, roarPoles: 2, roarAttackS: 0.0015, roarDecayS: 0.22, roarGain: 4.5,
  drive: 1.8,
  crackles: 6, crackleFromS: 0.08, crackleToS: 0.42, crackleHighPassHz: 1500, crackleAttackS: 0.0005, crackleDecayMinS: 0.004, crackleDecayMaxS: 0.01,
  crackleGainMin: 0.08, crackleGainMax: 0.2, crackleTailFade: 0.6,
} as const;

function blastS(n: number): Float32Array {
  const rng = new SeededRng(SFX_SEED_BLAST_S);
  const out = boom(n, rng, BLAST_S);
  addCrackles(out, rng, BLAST_S);
  return out;
}

/**
 * torp_hit（2.2 秒。ご褒美の音）: blast_l の芯を低く長く（正弦 80 → 25 Hz・減衰 1.1 秒）＋轟き 2.5k → 80 Hz ＋ 0.25 秒遅れて立つ水の柱（雑音の帯 500〜4k Hz・
 * 立ち上がり 0.3 秒の間に帯が上がっていく＝柱が立ち上がる・減衰 1.2 秒＝降ってくる水）。水の柱は歪みの後に足す（爆発に潰されない）。尾は tailFadeS で消し切る
 */
const TORP_HIT = {
  bodyFromHz: 80, bodyToHz: 25, bodyGlideS: 1.0, bodyAttackS: 0.006, bodyDecayS: 1.1, bodyGain: 0.9,
  roarFromHz: 2500, roarToHz: 80, roarGlideS: 1.0, roarPoles: 2, roarAttackS: 0.002, roarDecayS: 0.8, roarGain: 3.4,
  drive: 1.7,
  washAtS: 0.25, washAttackS: 0.3, washDecayS: 1.2, washLowHz: 500, washHighHz: 2000, washToLowHz: 1000, washToHighHz: 4000, washGlideS: 0.55, washGain: 0.55,
  tailFadeS: 0.4,
} as const;

function torpHit(n: number): Float32Array {
  const c = TORP_HIT;
  const rng = new SeededRng(SFX_SEED_TORP_HIT);
  const out = boom(n, rng, c);
  const wash = bandPass(whiteNoise(rng, n), c.washLowHz, c.washHighHz, c.washToLowHz, c.washToHighHz, c.washAtS + c.washGlideS);
  mixInto(out, mul(wash, envelope(n, c.washAttackS, c.washDecayS, c.washAtS)), c.washGain);
  return fadeTail(out, c.tailFadeS);
}

/**
 * sink（2.5 秒。沈み始め）: 泡＝雑音の低域通過 400 Hz を毎秒 9 回ほどの乱れた拍で揺らす（ごぼごぼ）＋拍ごとの泡の粒（音程が上がる短い正弦）と水の音（雑音の帯 waterLowHz〜
 * waterHighHz を同じ拍で。小さいスピーカーでも聞こえる層）＋きしみ＝正弦 80 → 50 Hz を強く歪ませ（倍音が船体のうめきになる）ゆっくり揺らす。全体を軽く歪ませて粒の頂をならす。
 * 泡は後ろほどまばら、全体は立ち上がり 0.12 秒・終わり 0.9 秒で消える
 */
const SINK = {
  gurgleHz: 400, gurglePoles: 2, gurgleGain: 3.0, gurgleFloor: 0.08,
  waterLowHz: 500, waterHighHz: 2400, waterGain: 1.0,
  beatHz: 9, beatJitter: 0.5, beatAttackS: 0.012, beatDecayS: 0.09, beatGainMin: 0.45, beatGainMax: 1, beatThinTo: 2.2,
  blipMinHz: 320, blipMaxHz: 760, blipRise: 1.7, blipS: 0.06, blipAttackS: 0.004, blipDecayS: 0.045, blipGain: 0.8,
  creakFromHz: 80, creakToHz: 50, creakDrive: 3.5, creakGain: 0.16, creakWobbleHz: 2.3, creakWobble: 0.45,
  drive: 0.7, attackS: 0.12, tailFadeS: 0.9,
} as const;

function sink(n: number): Float32Array {
  const c = SINK;
  const rng = new SeededRng(SFX_SEED_SINK);
  const out = lowPass(whiteNoise(rng, n), c.gurgleHz, c.gurgleHz, 0, c.gurglePoles);
  for (let i = 0; i < n; i++) out[i] = out[i]! * c.gurgleGain;
  mixInto(out, bandPass(whiteNoise(rng, n), c.waterLowHz, c.waterHighHz), c.waterGain);
  const beat = new Float32Array(n).fill(c.gurgleFloor);
  const blips = new Float32Array(n);
  const totalS = n / sfxSamples(1);
  // 乱れた拍: 間は 1/beatHz 秒 × (1 ± beatJitter)、後ろほど間が延びる（泡がまばらに）。拍ごとに 3 回引く
  for (let tS = 0.02; tS < totalS; ) {
    const gain = rng.nextRange(c.beatGainMin, c.beatGainMax);
    const hz = rng.nextRange(c.blipMinHz, c.blipMaxHz);
    const len = Math.min(sfxSamples(c.blipS), n - sfxSamples(tS));
    if (len > 0) {
      mixInto(beat, envelope(sfxSamples(c.beatDecayS * 2), c.beatAttackS, c.beatDecayS), gain, tS);
      mixInto(blips, mul(sine(len, hz, hz * c.blipRise, c.blipS), envelope(len, c.blipAttackS, c.blipDecayS)), gain * c.blipGain, tS);
    }
    tS += ((1 + rng.nextRange(-c.beatJitter, c.beatJitter)) / c.beatHz) * (1 + ((c.beatThinTo - 1) * tS) / totalS);
  }
  mixInto(mul(out, beat), blips);
  const creak = saturate(sine(n, c.creakFromHz, c.creakToHz, totalS), c.creakDrive);
  const wobble = sine(n, c.creakWobbleHz);
  for (let i = 0; i < n; i++) out[i] = out[i]! + creak[i]! * c.creakGain * (1 - c.creakWobble * (0.5 + 0.5 * wobble[i]!));
  return fadeTail(mul(saturate(out, c.drive), envelope(n, c.attackS, totalS * 100)), c.tailFadeS);
}

/** 爆発の系統の作り方（鍵 → 関数） */
export const BLAST_RECIPES: Partial<Record<SfxKey, SfxRecipe>> = { blast_s: blastS, blast_l: blastL, torp_hit: torpHit, sink };
