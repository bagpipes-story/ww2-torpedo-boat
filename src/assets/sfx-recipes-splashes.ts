// v0.7.1 S2（アートと音②：合成の効果音。spec-v0710 §4）: 水柱の系統の音の作り方。splash_s＝外れ弾の小さい水柱（軽い「ぱしゃ」）、splash_l＝命中・至近弾・爆弾の大きい水柱
// （低い一打＋重い水の幕）。数は音色の定数（聞かせ方）で、鍵ごとの名前つきの表にまとめる。乱数は音だけの種。直流・端の fade・頂の正規化は assets/sfx-bank。
import { SFX_SEED_SPLASH_L, SFX_SEED_SPLASH_S, type SfxKey } from '../config/sfx-config';
import { SeededRng } from '../core/rng';
import { bandPass, envelope, mixInto, mul, saturate, sine, whiteNoise, type SfxRecipe } from './sfx-dsp';

/** splash_s（0.35 秒）: 雑音の帯 1〜5k Hz（少し下へ掃引＝水が落ちる）・立ち上がり 5 ms・減衰 0.15 秒。低い音は入れない＝軽い。再生のたびの rate ±12% は表の rateJitter */
const SPLASH_S = { lowHz: 1000, highHz: 5000, toLowHz: 700, toHighHz: 3600, glideS: 0.3, attackS: 0.005, decayS: 0.15 } as const;

function splashS(n: number): Float32Array {
  const c = SPLASH_S;
  const rng = new SeededRng(SFX_SEED_SPLASH_S);
  return mul(bandPass(whiteNoise(rng, n), c.lowHz, c.highHz, c.toLowHz, c.toHighHz, c.glideS), envelope(n, c.attackS, c.decayS));
}

/**
 * splash_l（0.8 秒）: 低い一打＝正弦 70 Hz（歪ませて倍音を足す）＋水の幕＝雑音の帯 300〜3k Hz（下へ掃引・立ち上がり 12 ms・減衰 0.4 秒）＋
 * 少し遅れて落ちてくる水（帯の高い雑音を小さく・ゆっくり立って消える）。小さい水柱より低く・長く・重い
 */
const SPLASH_L = {
  thumpHz: 70, thumpAttackS: 0.004, thumpDecayS: 0.2, thumpGain: 0.9, thumpDrive: 2.4,
  washLowHz: 300, washHighHz: 3000, washToLowHz: 180, washToHighHz: 1500, washGlideS: 0.6, washAttackS: 0.012, washDecayS: 0.4, washGain: 2.0,
  fallAtS: 0.22, fallLowHz: 1500, fallHighHz: 5000, fallAttackS: 0.12, fallDecayS: 0.35, fallGain: 0.3,
} as const;

function splashL(n: number): Float32Array {
  const c = SPLASH_L;
  const rng = new SeededRng(SFX_SEED_SPLASH_L);
  const out = saturate(mul(sine(n, c.thumpHz), envelope(n, c.thumpAttackS, c.thumpDecayS)), c.thumpDrive);
  for (let i = 0; i < n; i++) out[i] = out[i]! * c.thumpGain;
  mixInto(out, mul(bandPass(whiteNoise(rng, n), c.washLowHz, c.washHighHz, c.washToLowHz, c.washToHighHz, c.washGlideS), envelope(n, c.washAttackS, c.washDecayS)), c.washGain);
  mixInto(out, mul(bandPass(whiteNoise(rng, n), c.fallLowHz, c.fallHighHz), envelope(n, c.fallAttackS, c.fallDecayS, c.fallAtS)), c.fallGain);
  return out;
}

/** 水柱の系統の作り方（鍵 → 関数） */
export const SPLASH_RECIPES: Partial<Record<SfxKey, SfxRecipe>> = { splash_s: splashS, splash_l: splashL };
