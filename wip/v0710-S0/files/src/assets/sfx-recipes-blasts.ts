// v0.7.1 S0（アートと音②：合成の効果音。spec-v0710 §4）: 爆発・水柱の系統の音の作り方。S0 は大きい爆発 blast_l だけ
// （splash_s・splash_l・blast_s・torp_hit・sink は S2 で足す）。数は音色の定数（聞かせ方）で、鍵ごとの名前つきの表にまとめる。乱数は音だけの種。
import { SFX_SEED_BLAST_L, type SfxKey } from '../config/sfx-config';
import { SeededRng } from '../core/rng';
import { envelope, highPass, lowPass, mixInto, mul, saturate, sfxSamples, sine, whiteNoise, type SfxRecipe } from './sfx-dsp';

/**
 * blast_l（1.6 秒）: 芯＝正弦 120 → 30 Hz（減衰 0.8 秒）＋ 轟き＝雑音の低域通過（2 極）の掃引 3k → 100 Hz を柔らかく歪ませ（小さいスピーカーでも芯が聞こえる）、
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
  const c = BLAST_L;
  const rng = new SeededRng(SFX_SEED_BLAST_L);
  const out = new Float32Array(n);
  mixInto(out, mul(sine(n, c.bodyFromHz, c.bodyToHz, c.bodyGlideS), envelope(n, c.bodyAttackS, c.bodyDecayS)), c.bodyGain);
  mixInto(out, mul(lowPass(whiteNoise(rng, n), c.roarFromHz, c.roarToHz, c.roarGlideS, c.roarPoles), envelope(n, c.roarAttackS, c.roarDecayS)), c.roarGain);
  saturate(out, c.drive);
  // 尾のぱちぱち: 時刻・長さ・大きさは音だけの乱数。歪みの後に足す（鋭いまま）
  const hiss = highPass(whiteNoise(rng, n), c.crackleHighPassHz);
  for (let i = 0; i < c.crackles; i++) {
    const atS = rng.nextRange(c.crackleFromS, c.crackleToS);
    const decayS = rng.nextRange(c.crackleDecayMinS, c.crackleDecayMaxS);
    const gain = rng.nextRange(c.crackleGainMin, c.crackleGainMax) * (1 - (atS / c.crackleToS) * c.crackleTailFade);
    const at = sfxSamples(atS);
    const len = Math.min(sfxSamples(decayS * 3), n - at);
    mixInto(out, mul(hiss.slice(at, at + len), envelope(len, c.crackleAttackS, decayS)), gain, atS);
  }
  return out;
}

/** 爆発・水柱の系統の作り方（鍵 → 関数）。S2 で splash_s・splash_l・blast_s・torp_hit・sink を足す */
export const BLAST_RECIPES: Partial<Record<SfxKey, SfxRecipe>> = { blast_l: blastL };
