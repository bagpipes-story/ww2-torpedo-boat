// 静音と倍速（v0.8.3。ユーザーの要望 2026-11-23。docs/02 §5）の世界側の純粋な部分。Phaser を使わない・乱数を引かない・確保は作るときだけ。
// - 静音（SilentThrottle）: 入れている間、速度の指令を speed01 × 静音の上限 / 今の全速（core/engine-trouble の engineCap01）に縮める＝スティックの全部の倒し量で 0〜静音の上限を操る
//   （切って止めるのではなく縮める＝細かく操れる。ユーザー「静音の速度内で制御するのが難しいため」）。針路はそのまま。InputState は書き換えない（写しは 1 個）。
//   燃料切れの漂流・機関の不調（上限は同じ静音の上限＝min で変わらない）・空襲下の退避の座席（jp_03。縮めた指令を座席が読む）の前に掛ける（systems/world-boat）。
// - 倍速（boostedFrames）: 1 フレームに世界の 1 回分（入力の消費 → 固定ステップ → 命中スローの時計 → 浅瀬。v0.8.2 までの 1 フレームと同じ順）を factor 回まで回す。
//   固定ステップの幅も 1 回分に渡す実秒も 1 倍と同じなので、倍速の N フレームは 1 倍の 2N フレームと 1 ステップずつ同じ世界になる（tests/control-toggles）。
//   命中スローが残っている間は 2 回目を回さない（命中の瞬間の見た目と長さは今のまま。設計の既定＝ユーザー未確認）。
import type { BoatInput, BoatParams } from './boat-motion';
import { engineCap01 } from './engine-trouble';

/** 静音の入り切りを持つ入力（InputState がそのまま満たす。無ければ切れている） */
export type SilentAwareInput = BoatInput & { readonly silentOn?: boolean };

export class SilentThrottle {
  /** 縮めた指令（出撃時に 1 個） */
  private readonly out: BoatInput = { headingDeg: NaN, speed01: 0 };

  /** 自艇の運動に渡す指令の元（systems/world-boat。燃料切れの漂流が先）: 切れていれば input そのもの、入っていれば速さを静音の上限 / 今の全速まで縮めた写し */
  command(input: SilentAwareInput, p: Pick<BoatParams, 'silentMaxMps' | 'speedMaxMps'>): BoatInput {
    if (!input.silentOn) return input;
    this.out.headingDeg = input.headingDeg;
    this.out.speed01 = input.speed01 * engineCap01(p);
    return this.out;
  }
}

/**
 * 1 フレームに世界を進める（systems/mission-world の updateFrame）: sub(realDt) を 1 回、fast なら factor 回まで。2 回目からは命中スローが残っていれば回さない
 * （1 回目の中で始まった命中スローも）。戻りは回した回数（呼ぶ側はゲームの秒 = 回数 × realDt を夜明けの外の時計に使う）。確保しない
 */
export function boostedFrames(fast: boolean, factor: number, w: { readonly slowMoLeftS: number }, sub: (realDt: number) => void, realDt: number): number {
  let n = 0;
  do {
    sub(realDt);
    n++;
  } while (fast && n < factor && !(w.slowMoLeftS > 0));
  return n;
}
