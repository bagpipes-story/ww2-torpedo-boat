// v0.7.2 S2（アートと音③：BGM と命中スローの音。spec-v0720 §4.2・D1・R6）: 曲の再生（systems/sfx-music-player）の音源の組。S1 の sfx-music-player から分けた（300 行に収める。
// 決めは再生の側・ここは書くだけ）。音量の節 MUSIC_PLAYER.slots 本（起動時に作って使い回す＝1 組 layersMax 層まで × 3 組＝鳴っている組・止めかけの組・急いで 0 にした組）→ 曲の束。
// 組の音源は同じ when（今 ＋ startLeadS）で buffer 全体を繰り返す（任務の家族の 3 層が同じ標本から鳴る＝層がずれない）。古い組は音量を時定数で 0 へ・予約の stop（1 音源 1 回だけ＝古い WebKit は
// 2 回目の stop で投げる）。止めかけの組がまだ鳴っている時にまた止めれば、その組の音量を 30 ms で 0 へ（節は予約の stop まで空けない）。家族の組の段の移りは 3 層の音量だけを書く。
// 音源の数（spec §4.2）: 始めると鳴っている音源（止めかけを含む）が MUSIC_MAX_SOURCES を超えるなら、まだ始めない（止めかけの組が鳴り終わる次の 10 Hz で。S2: 3 層の組が 3 つ重なると 7〜9 本に
// なる＝メニュー ⇄ 任務をすばやく行き来した時だけ少し遅れて始まる）。
// 移りの秒 → 時定数は × MUSIC_PLAYER.fadeTc（秒の後に約 2%＝止める時に「ぷつっ」としない）。値は読み返さない（L6）。予約の前に必ず消す（R4）。
// §7: step* は確保しない（音源は組を始める時に作る使い捨て。曲の音源を作るのはここの 1 か所）。
import { MUSIC_CTX_NONE, MUSIC_FADE, MUSIC_GAIN, MUSIC_KEYS, MUSIC_MAX_SOURCES, MUSIC_MOOD_QUIET, MUSIC_PLAYER } from '../config/sfx-music-config';
import { musicMoodGain, musicMoodTc } from '../core/sfx-music-mood';
import type { SfxBuffer, SfxCtx, SfxGainNode, SfxSource } from './sfx-audio-types';

const NONE = -1;
const SLOTS = MUSIC_PLAYER.slots;
/** 曲の標本の並び（作る列の buffers。型の名前にした＝tests/sfx-rules の毎フレームの口の検査が引数のかっこで止まらない） */
type MusicBuffers = readonly (SfxBuffer | null)[];
const TC = MUSIC_PLAYER.fadeTc;

export class SfxMusicSlots {
  private readonly gains: SfxGainNode[] = [];
  private readonly srcs: (SfxSource | null)[] = [];
  /** 節ごとの音源が鳴り終わる再生の時計（鳴っている組の節は Infinity。過ぎていれば空き）と、急いで 0 にしたか */
  private readonly endAt = new Float64Array(SLOTS);
  private readonly hurried = new Uint8Array(SLOTS);
  /** 鳴っている組の節の番号 */
  private readonly cur = new Int8Array(MUSIC_PLAYER.layersMax);
  /** 鳴っている組: 層の数（0 は無し）・最初の鍵の番号・場面・書いた段（家族の組だけ） */
  n = 0;
  key = NONE;
  scene = MUSIC_CTX_NONE;
  mood = MUSIC_MOOD_QUIET;
  /** 確かめ用の数: 作った音源・止めた音源・ノードへ書いた回数 */
  starts = 0;
  stops = 0;
  writes = 0;

  /** bus は曲の束（節はここへつなぐ） */
  constructor(private readonly ctx: SfxCtx, bus: SfxGainNode) {
    for (let s = 0; s < SLOTS; s++) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(bus);
      this.gains.push(g);
      this.srcs.push(null);
    }
  }

  /** 鳴っている音源（予約の stop がまだ先の物も）の数（stats と、組を始める前の数え） */
  live(now: number): number {
    let n = 0;
    for (let s = 0; s < SLOTS; s++) if (this.srcs[s] !== null || this.endAt[s]! > now) n++;
    return n;
  }

  /** 今の組を止める（fadeS 0 は今すぐ 0）: 音量を 0 へ・予約の stop（1 音源 1 回）。止めかけの組は音量だけを 30 ms で 0 へ（3 組を同時に聞かせない） */
  stepStop(now: number, fadeS: number): void {
    for (let s = 0; s < SLOTS; s++) {
      if (this.srcs[s] !== null || this.endAt[s]! <= now || this.hurried[s] === 1) continue;
      const g = this.gains[s]!.gain;
      g.cancelScheduledValues(now);
      g.setTargetAtTime(0, now, MUSIC_FADE.hastyStopS * TC);
      this.hurried[s] = 1;
      this.writes++;
    }
    const end = now + (fadeS > 0 ? fadeS : MUSIC_FADE.hastyStopS);
    for (let i = 0; i < this.n; i++) {
      const s = this.cur[i]!;
      const g = this.gains[s]!.gain;
      g.cancelScheduledValues(now);
      if (fadeS > 0) g.setTargetAtTime(0, now, fadeS * TC);
      else g.setValueAtTime(0, now);
      this.srcs[s]!.stop(end);
      this.srcs[s] = null;
      this.endAt[s] = end;
      this.stops++;
      this.writes++;
    }
    this.n = 0;
    this.key = NONE;
    this.scene = MUSIC_CTX_NONE;
  }

  /**
   * 組を始める（曲の音源を作るのはここの 1 か所）: 鍵 k から n 層を同じ when で、音量は 0 から inS 秒で上げる（家族＝n > 1 は段 mood の音量・ほかは鍵の音量）。
   * 空きの節が足りなければ始めずに false（止めかけの組が鳴り終わる次の決めで）
   */
  stepStart(now: number, k: number, n: number, scene: number, mood: number, inS: number, buffers: MusicBuffers): boolean {
    if (this.live(now) + n > MUSIC_MAX_SOURCES) return false;
    let got = 0;
    for (let s = 0; s < SLOTS && got < n; s++) if (this.srcs[s] === null && this.endAt[s]! <= now) this.cur[got++] = s;
    if (got < n) return false;
    const when = now + MUSIC_PLAYER.startLeadS;
    for (let i = 0; i < n; i++) {
      const s = this.cur[i]!;
      const g = this.gains[s]!.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(0, now);
      g.setTargetAtTime(n > 1 ? musicMoodGain(i, mood) : MUSIC_GAIN[MUSIC_KEYS[k]!], when, inS * TC);
      const src = this.ctx.createBufferSource();
      src.buffer = buffers[k + i]!;
      src.loop = true;
      src.connect(this.gains[s]!);
      src.start(when);
      this.srcs[s] = src;
      this.endAt[s] = Infinity;
      this.hurried[s] = 0;
      this.starts++;
      this.writes++;
    }
    this.n = n;
    this.key = k;
    this.scene = scene;
    this.mood = mood;
    return true;
  }

  /** 家族の組の段が変わった: 3 層の音量を移りの時定数で段 mood へ（変わった時だけ・予約の前に消す） */
  stepMood(now: number, mood: number): void {
    const tc = musicMoodTc(this.mood, mood);
    for (let i = 0; i < this.n; i++) {
      const g = this.gains[this.cur[i]!]!.gain;
      g.cancelScheduledValues(now);
      g.setTargetAtTime(musicMoodGain(i, mood), now, tc);
      this.writes++;
    }
    this.mood = mood;
  }
}
