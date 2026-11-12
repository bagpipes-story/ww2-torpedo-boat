// v0.7.1（アートと音②：合成の効果音。spec-v0710 §4）: 砲の系統の音の作り方。S0 は機銃 mg、S2 で大砲の近い音 gun_near と遠雷 gun_far（距離の帯で切り替える＝core/sfx-mix の sfxGunKey）。
// 数は音色の定数（聞かせ方。ゲームの強さの値ではない）で、鍵ごとの名前つきの表にまとめる。乱数は音だけの種。直流・端の fade・頂の正規化は assets/sfx-bank。
import { SFX_SEED_GUN_FAR, SFX_SEED_GUN_NEAR, SFX_SEED_MG, type SfxKey } from '../config/sfx-config';
import { SeededRng } from '../core/rng';
import { bandPass, envelope, highPass, lowPass, mixInto, mul, normalizePeak, saturate, sine, whiteNoise, type SfxRecipe } from './sfx-dsp';

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

/**
 * gun_near（0.6 秒。大砲の近い音＝帯 0〜1）: 轟き＝雑音の低域通過（2 極）の掃引 4k → 200 Hz（減衰 0.25 秒）＋腹に来る一打＝正弦 90 → 45 Hz＋
 * 最初の 5 ms の鋭い立ち上がり（高域の雑音の針）。柔らかく歪ませて詰める。機銃より太く長く、爆発より鋭く明るい
 */
const GUN_NEAR = {
  roarFromHz: 4000, roarToHz: 200, roarGlideS: 0.4, roarPoles: 2, roarAttackS: 0.001, roarDecayS: 0.25, roarGain: 2.6,
  thumpFromHz: 90, thumpToHz: 45, thumpGlideS: 0.2, thumpAttackS: 0.003, thumpDecayS: 0.18, thumpGain: 0.6,
  crackHighPassHz: 2500, crackAttackS: 0.0003, crackDecayS: 0.005, crackGain: 1.4,
  drive: 1.8,
} as const;

function gunNear(n: number): Float32Array {
  const c = GUN_NEAR;
  const rng = new SeededRng(SFX_SEED_GUN_NEAR);
  const out = new Float32Array(n);
  mixInto(out, mul(lowPass(whiteNoise(rng, n), c.roarFromHz, c.roarToHz, c.roarGlideS, c.roarPoles), envelope(n, c.roarAttackS, c.roarDecayS)), c.roarGain);
  mixInto(out, mul(sine(n, c.thumpFromHz, c.thumpToHz, c.thumpGlideS), envelope(n, c.thumpAttackS, c.thumpDecayS)), c.thumpGain);
  mixInto(out, mul(highPass(whiteNoise(rng, n), c.crackHighPassHz), envelope(n, c.crackAttackS, c.crackDecayS)), c.crackGain);
  return saturate(out, c.drive);
}

/**
 * gun_far（0.9 秒。こもった遠雷＝帯 2〜3）: 雑音の低域通過 250 Hz（2 極・立ち上がり 40 ms・減衰 0.5 秒）＋60 Hz の正弦。鋭い頭は無い。ゆっくりした乱れ（雑音の低域通過 rollHz）で
 * 音量をうねらせ、遅れた山びこ（echoAtS 後に小さく）を重ねて「遠くでごろごろ」に。小さいスピーカーは 300 Hz より下がほとんど出ないので、こもった空気の層
 * （低域通過 airHz の 1 極を小さく）を足し、少し歪ませて倍音を作る（それでも近い砲よりずっと暗い）
 */
const GUN_FAR = {
  rumbleHz: 250, rumblePoles: 2, attackS: 0.04, decayS: 0.5, rumbleGain: 1.0,
  airHz: 700, airGain: 0.3,
  bodyHz: 60, bodyAttackS: 0.05, bodyDecayS: 0.45, bodyGain: 0.3,
  rollHz: 9, rollDepth: 0.55,
  echoAtS: 0.21, echoGain: 0.4,
  drive: 2.4,
} as const;

function gunFar(n: number): Float32Array {
  const c = GUN_FAR;
  const rng = new SeededRng(SFX_SEED_GUN_FAR);
  const rumble = normalizePeak(lowPass(whiteNoise(rng, n), c.rumbleHz, c.rumbleHz, 0, c.rumblePoles), 1);
  mixInto(rumble, normalizePeak(lowPass(whiteNoise(rng, n), c.airHz), 1), c.airGain);
  const roll = normalizePeak(lowPass(whiteNoise(rng, n), c.rollHz), 1);
  for (let i = 0; i < n; i++) rumble[i] = rumble[i]! * (1 + c.rollDepth * roll[i]!);
  mul(rumble, envelope(n, c.attackS, c.decayS));
  const out = new Float32Array(n);
  mixInto(out, rumble, c.rumbleGain);
  mixInto(out, rumble, c.echoGain, c.echoAtS);
  mixInto(out, mul(sine(n, c.bodyHz), envelope(n, c.bodyAttackS, c.bodyDecayS)), c.bodyGain);
  return saturate(out, c.drive);
}

/** 砲の系統の作り方（鍵 → 関数） */
export const GUN_RECIPES: Partial<Record<SfxKey, SfxRecipe>> = { mg, gun_near: gunNear, gun_far: gunFar };
