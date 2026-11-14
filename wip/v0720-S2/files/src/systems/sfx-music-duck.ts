// v0.7.2 S2（アートと音③：BGM と命中スローの音。spec-v0720 §4.6・D9・brief L22）: 合図の時に曲を下げる（ducking）。エンジン（systems/sfx-engine）が 1 つ持ち、単発を鳴らせた時
// （fire の後＝context が running で消音でない時だけ来る）に鍵を引く。下げるのは曲の再生の「下げる音量」のノード（曲の束の後・master の前）だけ。
// 表は config/sfx-music-config の SFX_MUSIC_DUCK（鍵 → dB・hold 秒・届く帯）: 警報 alarm −8 dB・0.8 秒はユーザーの決め U-M1、ほか（鐘・魚雷の命中・近い大きい爆発・探照灯）は設計の既定。
// メニューの UI の音（ui_tap）は表に無い＝下げない。読み込みの時に鍵ごとの倍率・hold・帯の配列を 1 回作る（鳴らす口は引くだけ）。
// 下げ方（SFX_MUSIC_DUCK_SHAPE）: 鳴り始める時刻に時定数 downTcS で下げ、hold の後に upS 秒で戻す（時定数は秒 × MUSIC_PLAYER.fadeTc）。予約の前に消す（cancel）。
// 下げている間（hold の内）の次の合図は、深いか長い時だけ予約を直す（reworkWindowS 秒に reworkMax 回まで。浅くて短い合図は今の予約のまま）。値は読み返さない（覚えた値で比べる）。
// §7: play は確保しない（数と配列の欄だけ）。遅らせる単発（Result の鐘の 2 打目）は鳴り始める時刻（再生の時計）で下げる。
import { SFX_KEYS } from '../config/sfx-config';
import { MUSIC_PLAYER, SFX_MUSIC_DUCK, SFX_MUSIC_DUCK_SHAPE } from '../config/sfx-music-config';
import type { SfxGainNode } from './sfx-audio-types';

/** 下げない鍵の倍率 */
const NO_DUCK = 1;
/** 帯の上限の無い鍵（位置なしの合図・届く限りどこでも） */
const ANY_BAND = 127;
/** 鍵ごとの下げ（SFX_KEYS の順。読み込みの時に 1 回）: 音量の倍率（1 は下げない）・hold 秒・届く帯 */
const DUCK_GAIN = Float64Array.from(SFX_KEYS, (k) => (SFX_MUSIC_DUCK[k] ? 10 ** (SFX_MUSIC_DUCK[k]!.db / 20) : NO_DUCK));
const DUCK_HOLD = Float64Array.from(SFX_KEYS, (k) => SFX_MUSIC_DUCK[k]?.holdS ?? 0);
const DUCK_BAND = Int16Array.from(SFX_KEYS, (k) => SFX_MUSIC_DUCK[k]?.maxBand ?? ANY_BAND);
const UP_TC = SFX_MUSIC_DUCK_SHAPE.upS * MUSIC_PLAYER.fadeTc;

export class SfxMusicDuck {
  /** 今の予約の倍率と、戻り始める再生の時計（下げていなければ −Infinity） */
  private level = NO_DUCK;
  private untilS = -Infinity;
  /** 直しの窓の始まりと、その中で直した回数 */
  private windowAtS = -Infinity;
  private reworks = 0;
  /** 確かめ用の数: 下げた回数（直しも含む）・直した回数・ノードへ書いた回数 */
  ducks = 0;
  reworked = 0;
  writes = 0;

  /** node は曲の再生の「下げる音量」（systems/sfx-music-player の duck） */
  constructor(private readonly node: SfxGainNode) {}

  /** 単発を鳴らせた（エンジンの fire の後）: keyIndex は SFX_KEYS の添字・band は距離の帯（位置なしは 0）・whenS は鳴り始める再生の時計 */
  play(keyIndex: number, band: number, whenS: number): void {
    const g = DUCK_GAIN[keyIndex]!;
    if (g >= NO_DUCK || band > DUCK_BAND[keyIndex]!) return;
    const sh = SFX_MUSIC_DUCK_SHAPE;
    let level = g;
    let until = whenS + DUCK_HOLD[keyIndex]!;
    if (whenS < this.untilS) {
      // 下げている間: 深いか長い時だけ、窓の内の回数まで予約を直す（深い方の倍率・遅い方の戻り）
      if (level >= this.level && until <= this.untilS) return;
      if (whenS - this.windowAtS >= sh.reworkWindowS) {
        this.windowAtS = whenS;
        this.reworks = 0;
      }
      if (this.reworks >= sh.reworkMax) return;
      this.reworks++;
      this.reworked++;
      if (this.level < level) level = this.level;
      if (this.untilS > until) until = this.untilS;
    }
    const p = this.node.gain;
    p.cancelScheduledValues(whenS);
    p.setTargetAtTime(level, whenS, sh.downTcS);
    p.setTargetAtTime(NO_DUCK, until, UP_TC);
    this.level = level;
    this.untilS = until;
    this.ducks++;
    this.writes += 3;
  }
}
