// v0.7.2 S1（アートと音③：BGM と命中スローの音。spec-v0720 §12 の 1・brief L18）: context の見張り（v0.7.1 S1 の L3c）。systems/sfx-engine（288 行）に曲の再生を足す前に、
// 振る舞いを変えずにここへ分けた（tests/sfx-engine-wake の見張りの試験は import も中身もそのまま通る）。
// running なのに再生の時計が実時間 SFX_WATCHDOG.frozenMs 進まなければ（iOS の復帰の不具合の 1 つ）、止めてすぐ再開を 1 回。次は throttleMs の後・進まないまま maxTries 回まで
// （効かない再開を繰り返さない。時計が進むのを見たら数え直す。context の作り直しは入れない＝L3）。1 回の間は capMs までしか数えない（裏から戻った最初の 1 回で誤って動かさない）。
// 見るのは checkMs ごと（10 Hz）。context を止める（suspend）のは音の層でここの 1 か所だけ（消音は master の音量＝L4。tests/sfx-rules）。
// §7: tick は確保しない（数の比べと、動かす時の 2 つの呼び出しだけ）。約束の拒否は握る（L2）。
import { SFX_WATCHDOG } from '../config/sfx-config';
import type { SfxCtx, SfxThenable } from './sfx-audio-types';

const RUNNING = 'running';
function noop(): void {}
/** 約束の拒否を握る（iOS 26 の「Failed to start the audio device」。L2）。エンジンの kick も使う */
export function sfxSwallow(p: SfxThenable | undefined): void {
  if (p && typeof p.catch === 'function') p.catch(noop);
}

export class SfxWatchdog {
  private lastMs = 0;
  private ctS = -1;
  private frozenMs = 0;
  private kickMs = -Infinity;
  private tries = 0;
  /** 見張りが動いた数（確かめ用。エンジンの stats の watchdogKicks） */
  kicks = 0;

  constructor(private readonly ctx: SfxCtx) {}

  /** 毎フレーム（エンジンの tick から。wallMs は実時間）: checkMs ごとに再生の時計を見る */
  tick(wallMs: number): void {
    const el = wallMs - this.lastMs;
    if (el < SFX_WATCHDOG.checkMs) return;
    this.lastMs = wallMs;
    const ct = this.ctx.currentTime;
    if (this.ctx.state !== RUNNING) {
      this.ctS = -1;
      this.frozenMs = 0;
      return;
    }
    if (ct !== this.ctS) {
      if (this.ctS >= 0) this.tries = 0; // 時計が進むのを見た
      this.ctS = ct;
      this.frozenMs = 0;
      return;
    }
    this.frozenMs += el < SFX_WATCHDOG.capMs ? el : SFX_WATCHDOG.capMs;
    if (this.frozenMs < SFX_WATCHDOG.frozenMs || wallMs - this.kickMs < SFX_WATCHDOG.throttleMs || this.tries >= SFX_WATCHDOG.maxTries) return;
    // running なのに時計が進まない: 止めてすぐ再開を 1 回
    this.kickMs = wallMs;
    this.frozenMs = 0;
    this.tries++;
    this.kicks++;
    sfxSwallow(this.ctx.suspend());
    sfxSwallow(this.ctx.resume());
  }
}
