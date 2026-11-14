// v0.7.2 S1（アートと音③：BGM と命中スローの音。spec-v0720 §2・D4・R1・R2・brief L6〜L9）: 曲を作る列（曲の再生 systems/sfx-music-player が 1 つ持つ）。
// - いつ: 効果音の列が終わった次のフレームから（systems/sfx-boot が allow を 1 回。Boot では作らない）。1 フレームに MUSIC_BUILD_BUDGET 単位（決まった量＝分け方が決まる＝L9。
//   標本は分け方に依らずビット同一＝tests/sfx-music-render）。
// - 順: 今の場面の曲（step の want。曲の試聴の場で押した候補）→ ゲームの列 MUSIC_GAME_BUILD（S1 は既定のタイトルの曲だけ＝L6。S2 で任務の家族を後ろに足す）。
//   作りかけと違う「今の場面の曲」がまだ無ければ、作りかけをやめてそちらを先に（やめた曲は後で頭から作り直す＝標本は同じ）。
// - 記憶（L7・L8）: 波形の表と作業用の配列は最初に作る時に作る。できた曲はそのフレームに buffer へ写し、ほかに Float32 の写しは持たない。列が空になれば作業用の配列を捨てる
//   （2.7 MB。試聴の場で押せばまた作る）。表（0.44 MB）は残す（作り直すと 109 万単位＝8 フレームと JIT の初回がまた掛かる。S2 の家族・試聴の場がすぐ始められる）。
// - 作れない端末（buffer を作れない・記憶が足りない）: 投げたらやめて曲なしで続ける（効果音はそのまま）。
// §7: 毎フレームの口 step・dropLab は確保しない。確保は作る時だけの render*（表・作業用の配列・作曲・作り手・buffer）。作る時間は輪に数えるだけ（stats で並べる）。
import { MUSIC_BUILD_BUDGET, MUSIC_KEYS, MUSIC_PLAYER, MUSIC_SAMPLE_RATE, MUSIC_WORK_SAMPLES, type MusicKey } from '../config/sfx-music-config';
import { MusicBuilder, composeMusicKey } from '../assets/sfx-music-render';
import { MusicTables } from '../assets/sfx-music-synth';
import { MUSIC_TITLE_DEFAULT_ID } from '../assets/sfx-music-themes';
import type { SfxBuffer, SfxCtx } from './sfx-audio-types';

const NONE = -1;
/** ゲームの中で作る曲（この順。S1 は既定のタイトルの曲だけ＝L6。S2 で任務の家族 MUSIC_LAYER_KEYS を後ろに足す） */
export const MUSIC_GAME_BUILD: readonly MusicKey[] = [MUSIC_TITLE_DEFAULT_ID];
const GAME_BUILD: readonly number[] = MUSIC_GAME_BUILD.map((k) => MUSIC_KEYS.indexOf(k));
/** まだ作らない・次のフレームから・作ってよい */
const BUILD_OFF = 0, BUILD_ARMED = 1, BUILD_ON = 2;

export class SfxMusicBuild {
  /** 曲の標本（MUSIC_KEYS の順。まだ無ければ null）。再生が読む */
  readonly buffers: (SfxBuffer | null)[] = MUSIC_KEYS.map(() => null);
  private readonly lens = new Int32Array(MUSIC_KEYS.length);
  private state = BUILD_OFF;
  private idle = false;
  private tables: MusicTables | null = null;
  private work: Float32Array | null = null;
  private builder: MusicBuilder | null = null;
  private building = NONE;
  /** 1 フレームの作る仕事の ms の輪（数えるだけ） */
  private readonly ms = new Float64Array(MUSIC_PLAYER.timingRing);
  /** 確かめ用の数: 常駐の標本・作り終えた曲・やめた作りかけ・作る仕事をしたフレーム・その最大 ms・作れなかった */
  resident = 0;
  builds = 0;
  abandoned = 0;
  calls = 0;
  msMax = 0;
  failed = false;

  /** wall は実時間の ms（作る時間の記録だけ） */
  constructor(private readonly ctx: SfxCtx, private readonly wall: () => number) {}

  /** 効果音の列が終わった: 次のフレームから作る */
  allow(): void {
    if (this.state === BUILD_OFF) this.state = BUILD_ARMED;
  }

  /** 欲しい曲が変わったかもしれない（場面・試聴の候補）: 次のフレームで列を見直す */
  wake(): void {
    this.idle = false;
  }

  /** 作っている曲と進み（0〜1。試聴の場の「作成中… 40%」）・作業用の配列と表を持っているか */
  get key(): MusicKey | null {
    return this.builder === null ? null : MUSIC_KEYS[this.building]!;
  }
  get progress(): number {
    return this.builder === null ? 0 : this.builder.progress;
  }
  get hasWork(): boolean {
    return this.work !== null;
  }
  get hasTables(): boolean {
    return this.tables !== null;
  }

  /** 毎フレーム（再生の update から。want は今の場面の曲の鍵の番号か −1）: 決まった量だけ作る。できたらそのフレームに buffer へ */
  step(want: number): void {
    if (this.state !== BUILD_ON) {
      if (this.state === BUILD_ARMED) this.state = BUILD_ON;
      return;
    }
    if (this.failed || (this.idle && this.builder === null)) return;
    const t0 = this.wall();
    try {
      if (this.builder !== null && want !== NONE && want !== this.building && this.buffers[want] === null) {
        this.builder = null; // 今の場面の曲を先に
        this.abandoned++;
      }
      if (this.builder === null) {
        let k = want !== NONE && this.buffers[want] === null ? want : NONE;
        for (let i = 0; i < GAME_BUILD.length && k === NONE; i++) if (this.buffers[GAME_BUILD[i]!] === null) k = GAME_BUILD[i]!;
        if (k === NONE) {
          this.idle = true;
          this.work = null; // 列が空: 作業用の配列を捨てる（表は残す）
          return;
        }
        this.renderStart(k);
      }
      const b = this.builder!;
      b.stepBuild(MUSIC_BUILD_BUDGET);
      if (b.done) this.renderFinish(b);
    } catch (err) {
      this.failed = true;
      this.builder = null;
      this.work = null;
      console.warn(`曲を作れない（曲なしで続ける）: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    const dt = this.wall() - t0;
    this.ms[this.calls % this.ms.length] = dt;
    this.calls++;
    if (dt > this.msMax) this.msMax = dt;
  }

  /** 曲の試聴の場を出る: ゲームの列に無い候補の標本と、その作りかけを捨てる（鳴り残りの音源は自分の buffer を持っている） */
  dropLab(): void {
    if (this.builder !== null && !inGame(this.building)) {
      this.builder = null;
      this.abandoned++;
    }
    for (let k = 0; k < this.buffers.length; k++) {
      if (this.buffers[k] === null || inGame(k)) continue;
      this.buffers[k] = null;
      this.resident -= this.lens[k]!;
    }
    this.idle = false;
  }

  /** 作る時間の中央値と 95%（ms。stats から。確保してよい） */
  timing(): { median: number; p95: number } {
    const ms = Array.from(this.ms.subarray(0, Math.min(this.calls, this.ms.length))).sort((a, b) => a - b);
    const q = (p: number): number => (ms.length ? ms[Math.min(ms.length - 1, Math.floor(ms.length * p))]! : 0);
    return { median: q(0.5), p95: q(0.95) };
  }

  /** 作り始める（作る時だけ: 表と作業用の配列は無ければ作り、楽譜と作り手は 1 曲に 1 回） */
  private renderStart(k: number): void {
    if (this.tables === null) this.tables = new MusicTables();
    if (this.work === null) this.work = new Float32Array(MUSIC_WORK_SAMPLES);
    this.building = k;
    this.builder = new MusicBuilder(this.tables, this.work, composeMusicKey(MUSIC_KEYS[k]!));
  }

  /** できた: buffer へ写す（曲の buffer を作るのはここの 1 か所）。作業用の配列は次の曲が使う */
  private renderFinish(b: MusicBuilder): void {
    const x = b.result();
    const buf = this.ctx.createBuffer(1, x.length, MUSIC_SAMPLE_RATE);
    buf.getChannelData(0).set(x);
    this.buffers[this.building] = buf;
    this.lens[this.building] = x.length;
    this.resident += x.length;
    this.builder = null;
    this.builds++;
  }
}

/** ゲームの列の曲か（試聴の場を出ても残す） */
function inGame(k: number): boolean {
  for (let i = 0; i < GAME_BUILD.length; i++) if (GAME_BUILD[i] === k) return true;
  return false;
}
