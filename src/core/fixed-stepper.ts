// 固定タイムステップの累積器（CLAUDE.md §7「可変タイムステップに依存した物理」の回避）。
// フレームの経過時間を貯め、固定幅 stepS で複数回 step を呼ぶ。端末のフレームレートが違っても同じ結果になる。
export type StepFn = (dt: number) => void;

export class FixedStepper {
  private accumulator = 0;

  constructor(
    private readonly stepS: number,
    private readonly maxStepsPerFrame: number,
  ) {
    if (!(stepS > 0)) throw new Error('stepS は正の数');
    if (!(maxStepsPerFrame >= 1)) throw new Error('maxStepsPerFrame は 1 以上');
  }

  /**
   * 経過秒 deltaS を貯めて step を実行し、実行回数を返す。
   * 1 フレームの実行は maxStepsPerFrame 回まで。回し切っても 1 ステップ分以上残っていれば（タブ復帰や深刻な処理落ち）その分は捨てる。
   * 上限ちょうどで足りたフレームの端数は持ち越すので、低フレームレートでもシミュレーション時間は遅れない。
   */
  advance(deltaS: number, step: StepFn): number {
    const maxDelta = this.stepS * this.maxStepsPerFrame;
    this.accumulator += deltaS > maxDelta ? maxDelta : deltaS;
    let n = 0;
    while (this.accumulator >= this.stepS && n < this.maxStepsPerFrame) {
      step(this.stepS);
      this.accumulator -= this.stepS;
      n++;
    }
    if (this.accumulator >= this.stepS) {
      this.accumulator = 0;
    }
    return n;
  }

  /** 次の step までに貯まっている端数（0 以上 stepS 未満）。補間や試験に使う */
  get pending(): number {
    return this.accumulator;
  }
}
