// v0.7.1 S0（アートと音②：合成の効果音。spec-v0710 §4）: 砲の系統の音の作り方。S0 は機銃 mg だけ（gun_near・gun_far は S2 で足す）。
// 数は音色の定数（聞かせ方。ゲームの強さの値ではない）で、鍵ごとの名前つきの表にまとめる。乱数は音だけの種。直流・端の fade・頂の正規化は assets/sfx-bank。
import { SFX_SEED_MG, type SfxKey } from '../config/sfx-config';
import { SeededRng } from '../core/rng';
import { bandPass, envelope, mixInto, mul, saturate, sine, whiteNoise, type SfxRecipe } from './sfx-dsp';

/** mg（0.12 秒）: 白色雑音の短い 2 連の破裂（帯 900〜3k Hz・減衰 25 ms）＋150 Hz の正弦の一打を柔らかく歪ませる（破裂が詰まって聞こえる）。再生のたびの rate ±8% は表の rateJitter（エンジン） */
const MG = { bandLowHz: 900, bandHighHz: 3000, attackS: 0.0005, decayS: 0.025, secondAtS: 0.05, secondGain: 0.6, thumpHz: 150, thumpAttackS: 0.002, thumpDecayS: 0.03, thumpGain: 0.22, drive: 2.5 } as const;

function mg(n: number): Float32Array {
  const rng = new SeededRng(SFX_SEED_MG);
  const out = new Float32Array(n);
  const first = bandPass(whiteNoise(rng, n), MG.bandLowHz, MG.bandHighHz);
  const second = bandPass(whiteNoise(rng, n), MG.bandLowHz, MG.bandHighHz);
  mixInto(out, mul(first, envelope(n, MG.attackS, MG.decayS)));
  mixInto(out, mul(second, envelope(n, MG.attackS, MG.decayS, MG.secondAtS)), MG.secondGain);
  mixInto(out, mul(sine(n, MG.thumpHz), envelope(n, MG.thumpAttackS, MG.thumpDecayS)), MG.thumpGain);
  return saturate(out, MG.drive);
}

/** 砲の系統の作り方（鍵 → 関数）。S2 で gun_near・gun_far を足す */
export const GUN_RECIPES: Partial<Record<SfxKey, SfxRecipe>> = { mg };
