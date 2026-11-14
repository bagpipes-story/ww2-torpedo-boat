// v0.7.2 S3（アートと音③：BGM と命中スローの音。spec-v0720 §6・brief L28〜L31）: 命中スローの音。スローの論理と data は変えない（U11。v0.7.1 D6 の「命中スローで音程は
// 変えない（v0.7.2 で決める）」をここで決める＝§11 O2。案は config/sfx-music-config の SFX_SLOW）。エンジン（systems/sfx-engine）が 1 つ持つ。
// つなぎ（エンジンが作る）: ベッド＝ループの束と曲の束 → ベッドの濾波器（低域通過。ふだん SFX_SLOW_SHAPE.idleHz＝22,050 Hz の標本では ≤ 0.3 dB の差）→ master。単発（爆発・魚雷の命中・
//   合図・UI）は通らない＝どの案も鋭いまま。
// 入力: スローの最中か（systems/sfx-bus の sfxLoops が、world-art の登録した世界の slowMoLeftS をフレームに 1 回読んで update へ）と、案（既定は SFX_SLOW_DEFAULT_ID。試聴の場だけが替える）。
// 書く（立ち上がり・立ち下がり・案の替わり・止まっていた context が動き出した時だけ）: 欲しい形（スローの最中なら今の案・ふだんは素通し）と書いた形が違い、context が動いている時だけ
//   （止まっている context には積まない。エンジンの tick が毎フレーム step で追いつく）。
//   - 濾波器: 案の Hz へ時定数 filterTcS、素通しへ戻すのは endTcS（予約の前に消す・値は読み返さない）。
//   - 曲: 鳴っている組の 3 層の rate を同じ時刻・同じ時定数で（systems/sfx-music-slots の stepRate＝層ごとに 1 回。これから始める組もその rate）。上げは rateTcS・戻しは endTcS。
//   - ループ: 目標の rate に案の倍率を掛けてからループの再生へ（applySfxSlowRate。書くのはループの再生の 10 Hz・変わった時だけ・その時定数）。
// 戻す（reset）: Hud の SHUTDOWN（sfxLoopsStop）と、メニュー・試聴の場の曲を頼んだ時（sfxMusic）。スローの途中で任務が終わっても Result・Title の曲がこもらない。
// §7: update・step は確保しない（数の比べと、変わった時の予約だけ）。確保は constructor の目標の配列 1 組だけ。
import { SFX_SLOW, SFX_SLOW_DEFAULT_ID, SFX_SLOW_IDS, SFX_SLOW_SHAPE, type SfxSlowId } from '../config/sfx-music-config';
import { SFX_LOOP_COUNT, createSfxLoopTargets, type SfxLoopTargets } from '../core/sfx-loops';
import type { SfxCtx, SfxFilterNode } from './sfx-audio-types';
import type { SfxMusicSlots } from './sfx-music-slots';

const RUNNING = 'running';
const LOWPASS = 'lowpass';
/** 書いた形の「ふだん（素通し）」 */
const IDLE = -1;
/** ふだんの形（素通しの濾波器・ループと曲の rate はそのまま） */
const IDLE_SHAPE = { filterHz: SFX_SLOW_SHAPE.idleHz, loopRate: 1, musicRate: 1 } as const;

/** 確かめ用の数（tests・scripts/headless） */
export interface SfxSlowStats {
  on: boolean; variant: SfxSlowId; shown: SfxSlowId | null; rises: number; writes: number; filterHz: number; musicRate: number; loopFactor: number;
}

/**
 * ループの目標の rate に factor を掛けた目標（音量はそのまま）。factor が 1 なら src をそのまま返す（写さない）、ほかは out に書いて out を返す。
 * 純粋（src は書き換えない＝観測器の目標と probe の記録は音の状態に依らない）・確保しない
 */
export function applySfxSlowRate(src: SfxLoopTargets, factor: number, out: SfxLoopTargets): SfxLoopTargets {
  if (factor === 1) return src;
  for (let i = 0; i < SFX_LOOP_COUNT; i++) {
    out.gain[i] = src.gain[i]!;
    out.rate[i] = src.rate[i]! * factor;
  }
  return out;
}

export class SfxSlowMo {
  /** sfx-bus の sfxLoops が applySfxSlowRate に渡す書き場所（起動時に 1 回作る） */
  readonly targets: SfxLoopTargets = createSfxLoopTargets();
  /** 今の案（SFX_SLOW_IDS の添字）・スローの最中か・ノードへ書いた形（案の添字。IDLE はふだん） */
  private variant = SFX_SLOW_IDS.indexOf(SFX_SLOW_DEFAULT_ID);
  private on = false;
  private shown = IDLE;
  /** 確かめ用の数: スローの立ち上がり（止まっている context の間も数える）・ノードへ書いた回数・最後に書いた濾波器の Hz（値は読み返さない） */
  rises = 0;
  writes = 0;
  private lastHz: number = SFX_SLOW_SHAPE.idleHz;

  /** bed はエンジンが作ってつないだベッドの濾波器（ここで低域通過・素通しの Hz にする）。slots は曲の音源の組（rate を書く） */
  constructor(private readonly ctx: SfxCtx, readonly bed: SfxFilterNode, private readonly slots: SfxMusicSlots) {
    bed.type = LOWPASS;
    bed.frequency.value = SFX_SLOW_SHAPE.idleHz;
  }

  /** ループの rate に掛ける倍率（スローの最中は今の案の loopRate・ふだん 1） */
  get loopFactor(): number {
    return this.on ? SFX_SLOW[SFX_SLOW_IDS[this.variant]!].loopRate : 1;
  }

  /** 任務の間、毎フレーム（sfx-bus の sfxLoops）: スローの最中か。変わった時だけ書く */
  update(on: boolean): void {
    if (on && !this.on) this.rises++;
    this.on = on;
    this.step();
  }

  /** 戻す（Hud の SHUTDOWN・メニューと試聴の場の曲）: スローを解いて素通しへ（止まっている context なら、動き出した後に tick の step で） */
  reset(): void {
    this.on = false;
    this.step();
  }

  /** 曲の試聴の場（L31）: 案を替える（スローの最中なら新しい案で書き直す）。場を出る時に既定へ戻す */
  setVariant(id: SfxSlowId): void {
    this.variant = SFX_SLOW_IDS.indexOf(id);
    this.step();
  }

  /** 書く（update・reset・setVariant と、エンジンの tick から毎フレーム）: 欲しい形と書いた形が違い、context が動いている時だけ。同じなら何もしない */
  step(): void {
    const want = this.on ? this.variant : IDLE;
    if (want === this.shown || this.ctx.state !== RUNNING) return;
    const now = this.ctx.currentTime;
    const to = want === IDLE ? IDLE_SHAPE : SFX_SLOW[SFX_SLOW_IDS[want]!];
    const from = this.shown === IDLE ? IDLE_SHAPE : SFX_SLOW[SFX_SLOW_IDS[this.shown]!];
    const back = want === IDLE;
    if (to.filterHz !== from.filterHz) {
      const f = this.bed.frequency;
      f.cancelScheduledValues(now);
      f.setTargetAtTime(to.filterHz, now, back ? SFX_SLOW_SHAPE.endTcS : SFX_SLOW_SHAPE.filterTcS);
      this.lastHz = to.filterHz;
      this.writes++;
    }
    if (to.musicRate !== from.musicRate) {
      this.writes += this.slots.stepRate(now, to.musicRate, back ? SFX_SLOW_SHAPE.endTcS : SFX_SLOW_SHAPE.rateTcS);
    }
    this.shown = want;
  }

  /** 確かめ用の数（tests・scripts/headless。毎フレームは呼ばない） */
  stats(): SfxSlowStats {
    return {
      on: this.on, variant: SFX_SLOW_IDS[this.variant]!, shown: this.shown === IDLE ? null : SFX_SLOW_IDS[this.shown]!, rises: this.rises, writes: this.writes,
      filterHz: this.lastHz, musicRate: this.slots.rate, loopFactor: this.loopFactor,
    };
  }
}
