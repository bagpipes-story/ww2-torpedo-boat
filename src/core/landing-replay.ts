// 記録した入力の再生の口（v0.6.10 S5a。spec-v0610 part 2 の G7「世界と模擬の突き合わせ」。scripts/headless/world-vs-sim が使う）: ヘッドレスで回した jp_04 の世界の夜の
// 自艇の入力（針路・速力・射撃ボタン）と命中スローの倍率を固定ステップごとに core/landing-sim の runLandingTrial へ渡し、ステップの終わりの状態を見せる。
// 渡すと台本（landingSteer）・赤い線への反応・射撃の台本・消火の台本は使わない（世界のヘッドレスの夜は消火ボタンを押さない）。渡さなければ模擬は今までと 1 ビットも変わらない。
// 型だけ（ゲームは import しない＝dist に入らない）。
import type { AllyDestroyer } from './ally-destroyer';
import type { BoatInput, BoatState } from './boat-motion';
import type { FuelState } from './fuel';
import type { DamageState } from './gunnery';
import type { LandingState } from './landing';
import type { PtSection } from './pt-boats';
import type { PtTorpedoState } from './pt-torpedo';
import type { SeededRng } from './rng';
import type { TorpedoState } from './torpedo';

/** ステップ k の射撃ボタンと体感の倍率（世界の stepFn の slowMoFactor か 1） */
export interface LandingReplayStep {
  held: boolean;
  feel: number;
}

/** 模擬の 1 夜の状態（runLandingTrial が最初に 1 回渡す。どれも世界の同じ名の物に当たる: 隊・揚陸・雷撃・敵の魚雷・卯月・自艇・被害・燃料と乱数 seed+18・+20・+26・+27・+28） */
export interface LandingReplayView {
  readonly q: PtSection;
  readonly ld: LandingState;
  readonly st: PtTorpedoState;
  readonly torps: readonly TorpedoState[];
  readonly ally: AllyDestroyer | null;
  readonly boat: BoatState;
  readonly d: DamageState;
  readonly fuel: FuelState;
  readonly rng: SeededRng;
  readonly gunRng: SeededRng;
  readonly trng: SeededRng;
  readonly a27: SeededRng;
  readonly a28: SeededRng;
}

export interface LandingReplay {
  /** 1 夜の始めに 1 回（状態の参照） */
  begin(v: LandingReplayView): void;
  /** ステップ k（0 から）の入力を input と o に書く。記録が尽きたら false（その前で終わる） */
  step(k: number, input: BoatInput, o: LandingReplayStep): boolean;
  /** ステップ k の終わり（世界の stepFn の終わりと同じ時点）。t は出撃からの実秒 */
  after(k: number, t: number): void;
}
