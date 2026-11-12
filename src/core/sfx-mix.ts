// v0.7.1 S0（アートと音②：合成の効果音。spec-v0710 §6.2・§7.3）: 単発の音を鳴らすかどうかの判断。再生の API にも画面の枠組みにも依らない純粋な計算
// （S1 の systems/sfx-engine が使う。tests/sfx-mix）。値は config/sfx-config（聞かせ方の定数。何も import しない表）。
// - 距離の帯: 聞き手（自艇）からの距離の 2 乗を閾値の 2 乗と比べる（平方根なし。CLAUDE.md §7）。帯の音量・鍵ごとの届く帯・大砲の近い／遠い音の切り替え。
// - パン: clamp(dx / 900 m, −1, 1) × 0.7。30 m 以内は中央。
// - SfxMixer: 鍵ごとの最小間隔（ゲームの時計）と声 16 本の割り当て（空きは再生の時計と長さ）。満ちていれば自分より優先の低い声のうち一番低くて古い声を奪い、
//   同じか高い声しか無ければ新しい方を捨てる。確保は作る時だけ（鳴らす口は配列も物も作らない。結果は自分の欄に書く）。
// 落とす順（spec §7.3 の 2〜4。1 の「消音・context が止まっている」はエンジン）: 最小間隔 → 距離の帯 → 声。最小間隔の時刻は鳴らせた時だけ進める
// （届かない遠い音・声の無い音が、次の近い音を間引かない）。
import { SFX_BAND_GAIN, SFX_BAND_MAX_M, SFX_GUN_FAR_FROM_BAND, SFX_KEYS, SFX_PAN_CENTER_M, SFX_PAN_HALF_WIDTH_M, SFX_PAN_MAX, SFX_TABLE, SFX_VOICES, type SfxKey } from '../config/sfx-config';

/** 帯の上限の 2 乗（読み込みの時に 1 回） */
const BAND_MAX_M2: readonly number[] = SFX_BAND_MAX_M.map((m) => m * m);
const PAN_CENTER_M2 = SFX_PAN_CENTER_M * SFX_PAN_CENTER_M;
/** 鍵 → 添字（SFX_KEYS の順。型つき配列の欄を引く） */
const KEY_INDEX = Object.fromEntries(SFX_KEYS.map((k, i) => [k, i])) as Readonly<Record<SfxKey, number>>;

/** 落とした理由（SfxMixer.lastDrop と数の欄の添字） */
export const SFX_DROP_NONE = 0;
export const SFX_DROP_RATE = 1;
export const SFX_DROP_FAR = 2;
export const SFX_DROP_VOICES = 3;

/** 距離の 2 乗（m²）→ 帯（0 が一番近い。最後の帯より遠ければ −1） */
export function sfxBand(distM2: number): number {
  for (let b = 0; b < BAND_MAX_M2.length; b++) if (distM2 <= BAND_MAX_M2[b]!) return b;
  return -1;
}

/** 帯 → 音量（帯の外は 0） */
export function sfxBandGain(band: number): number {
  return SFX_BAND_GAIN[band] ?? 0;
}

/** 左右のパン（−0.7〜0.7。dx は聞き手から見た世界の x の差 m＝画面の右が正。30 m 以内は中央） */
export function sfxPan(dxM: number, distM2: number): number {
  if (distM2 <= PAN_CENTER_M2) return 0;
  const u = dxM / SFX_PAN_HALF_WIDTH_M;
  return (u < -1 ? -1 : u > 1 ? 1 : u) * SFX_PAN_MAX;
}

/** 大砲の鍵: 近い帯は gun_near、遠い帯はこもった遠雷 gun_far */
export function sfxGunKey(band: number): SfxKey {
  return band >= SFX_GUN_FAR_FROM_BAND ? 'gun_far' : 'gun_near';
}

/** 間引きと声の割り当て（ゲームに 1 つ。エンジンが持つ） */
export class SfxMixer {
  /** 鳴らせた時の結果: 音量（鍵 × 帯 × 呼ぶ側の倍率）・パン・奪った声か（エンジンは奪った声の音源を止めてから鳴らす） */
  gain = 0;
  pan = 0;
  stole = false;
  /** 直前に頼まれた音の距離の帯（落とした時も書く。帯の外は −1・位置なしは 0。scripts/headless/sfx-probe が読む） */
  band = 0;
  /** 直前の呼び出しで落とした理由（SFX_DROP_*） */
  lastDrop = SFX_DROP_NONE;
  /** 数（scripts/headless の probe 用）: 鍵ごとの鳴らした数・理由ごとの落とした数・奪った数・同時の声の最大 */
  readonly played: Uint32Array;
  readonly dropped: Uint32Array;
  stolen = 0;
  maxBusy = 0;

  private readonly lastPlayS: Float64Array;
  private readonly voiceEndS: Float64Array;
  private readonly voiceStartS: Float64Array;
  private readonly voicePriority: Int8Array;

  constructor(private readonly voices: number = SFX_VOICES) {
    this.played = new Uint32Array(SFX_KEYS.length);
    this.dropped = new Uint32Array(SFX_DROP_VOICES + 1);
    this.lastPlayS = new Float64Array(SFX_KEYS.length).fill(-Infinity);
    this.voiceEndS = new Float64Array(voices).fill(-Infinity);
    this.voiceStartS = new Float64Array(voices);
    this.voicePriority = new Int8Array(voices);
  }

  /**
   * 位置つきの単発（dx・dy は聞き手からの差 m）。鳴らすなら声の添字（0〜）を返し gain・pan・band・stole を書く。落とすなら −1（lastDrop に理由）。
   * gameS はゲームの時計（最小間隔）、nowS は再生の時計（声の空き）、rate は再生の速さ（声の長さ＝表の秒 ÷ rate）。
   * minIntervalS はこの 1 発だけの最小間隔（表の値より長い時だけ効く＝沈没の 2 次の爆発。同じ鍵が鳴ってからこの秒の内は落とす）
   */
  playAt(key: SfxKey, dxM: number, dyM: number, gameS: number, nowS: number, rate = 1, gainMul = 1, minIntervalS = 0): number {
    const d = SFX_TABLE[key];
    const ki = KEY_INDEX[key];
    const d2 = dxM * dxM + dyM * dyM;
    const band = sfxBand(d2);
    this.band = band;
    const since = gameS - this.lastPlayS[ki]!;
    if (since < d.minIntervalS || since < minIntervalS) return this.drop(SFX_DROP_RATE);
    if (band < 0 || band > d.reachBand) return this.drop(SFX_DROP_FAR);
    const v = this.allocVoice(d.priority, nowS, d.seconds / rate);
    if (v < 0) return this.drop(SFX_DROP_VOICES);
    this.gain = d.gain * sfxBandGain(band) * gainMul;
    this.pan = sfxPan(dxM, d2);
    this.accept(ki, gameS);
    return v;
  }

  /** 位置なしの単発（合図・UI。中央・帯 0）。戻りと欄は playAt と同じ */
  playFlat(key: SfxKey, gameS: number, nowS: number, rate = 1, gainMul = 1): number {
    const d = SFX_TABLE[key];
    const ki = KEY_INDEX[key];
    this.band = 0;
    if (gameS - this.lastPlayS[ki]! < d.minIntervalS) return this.drop(SFX_DROP_RATE);
    const v = this.allocVoice(d.priority, nowS, d.seconds / rate);
    if (v < 0) return this.drop(SFX_DROP_VOICES);
    this.gain = d.gain * gainMul;
    this.pan = 0;
    this.accept(ki, gameS);
    return v;
  }

  /** 今鳴っている声の数（nowS は再生の時計） */
  busyVoices(nowS: number): number {
    let n = 0;
    for (let i = 0; i < this.voices; i++) if (this.voiceEndS[i]! > nowS) n++;
    return n;
  }

  /** 全部の声を空け、最小間隔の時刻を忘れる（任務の切り替え・context の復帰の後。数は残す） */
  reset(): void {
    this.lastPlayS.fill(-Infinity);
    this.voiceEndS.fill(-Infinity);
    this.lastDrop = SFX_DROP_NONE;
    this.stole = false;
  }

  /** 声を 1 本取る: 空きがあればそれ、無ければ自分より優先の低い声のうち一番低くて古い声を奪う（無ければ −1）。stole に奪ったかを書く */
  private allocVoice(priority: number, nowS: number, durS: number): number {
    let free = -1;
    let victim = -1;
    let busy = 0;
    for (let i = 0; i < this.voices; i++) {
      if (this.voiceEndS[i]! <= nowS) {
        if (free < 0) free = i;
        continue;
      }
      busy++;
      const p = this.voicePriority[i]!;
      if (p >= priority) continue;
      if (victim < 0 || p < this.voicePriority[victim]! || (p === this.voicePriority[victim]! && this.voiceStartS[i]! < this.voiceStartS[victim]!)) victim = i;
    }
    const v = free >= 0 ? free : victim;
    if (v < 0) return -1;
    this.stole = free < 0;
    if (this.stole) this.stolen++;
    else busy++;
    if (busy > this.maxBusy) this.maxBusy = busy;
    this.voiceEndS[v] = nowS + durS;
    this.voiceStartS[v] = nowS;
    this.voicePriority[v] = priority;
    return v;
  }

  private accept(keyIndex: number, gameS: number): void {
    this.lastPlayS[keyIndex] = gameS;
    this.played[keyIndex] = this.played[keyIndex]! + 1;
    this.lastDrop = SFX_DROP_NONE;
  }

  private drop(reason: number): number {
    this.lastDrop = reason;
    this.dropped[reason] = this.dropped[reason]! + 1;
    return -1;
  }
}

/** 鍵の添字（SFX_KEYS の順。SfxMixer.played を読む時に使う） */
export function sfxKeyIndex(key: SfxKey): number {
  return KEY_INDEX[key];
}
