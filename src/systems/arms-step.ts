// 兵装の新しい道の持ち主（v0.6.8。spec-v068 §3.2・§5.1）: 魚雷と機銃は全任務で両方使える。v0.6.7 から使えるようになった側（狙う艦の無い魚雷・S3 から艦への機銃と対空）の
// 数と出来事の文と、終わりの待ち（cleared・漂流・座礁の窓）の間の停止を持つ。S2 は狙う艦の無い魚雷だけ（発射と決着は systems/torpedo-free。ここは数えて文を出す）。
// Phaser 非依存（tests から作れる）。絵は systems/world-arms の WorldArms（これを継ぐ）。§7: 確保は constructor だけ。押さなければ何も変わらない（新しい状態は使うまで初期値）。
// 再生の道具（scratchpad の replay-v068）が読む公開の名: aaRng・shipRng・aaRounds・downs・shipRounds・blindTorpedoes。
import { CUE_NONE, blindTorpedoCue, type BlindKind } from '../core/arms-cue';
import type { SeededRng } from '../core/rng';

export class ArmsStep {
  /** 対空の乱数の系列（seed+24。S3 で機の来る任務だけ作る。それまでは null） */
  readonly aaRng: SeededRng | null = null;
  /** 機へ撃った発数・撃墜（S3） */
  aaRounds = 0;
  downs = 0;
  /** 艦へ撃った発数（S3） */
  shipRounds = 0;
  /** 狙う艦の無い魚雷の本数（Result・初発射時の燃料から除く） */
  blindTorpedoes = 0;
  /** 終わりの待ちの窓が開いた（MissionEnd.holdFire が毎フレーム hold を呼ぶ。窓は閉じない）。以後は魚雷を撃てない（S3 から新しい機銃の道も止める） */
  endHold = false;
  /** 最後の出来事の文（core/arms-cue の EV_*）・その数・通し番号（HUD は通し番号が変わったときにその秒だけ出す） */
  evCode = CUE_NONE;
  evN = 0;
  evSeq = 0;

  constructor(
    /** 狙う艦の無い魚雷の種類（任務の敵から。systems/world-arms の buildArms が決める） */
    readonly blindKind: BlindKind,
  ) {}

  /** 艦への機銃の乱数の系列（seed+25。S3 で駆逐艦の任務だけ。それまでは null） */
  get shipRng(): SeededRng | null {
    return null;
  }

  /** 狙う艦の無い魚雷を 1 本発射した（systems/torpedo-free の stepLauncher。発射の時に決着済み）: 数えて「大発の下を抜ける」などの文を出す */
  noteBlindTorpedo(): void {
    this.blindTorpedoes++;
    this.evCode = blindTorpedoCue(this.blindKind);
    this.evN = 0;
    this.evSeq++;
  }

  /** 終わりの待ちの窓の間（systems/mission-end の holdFire。毎フレーム）: 新しい道を止める */
  hold(): void {
    this.endHold = true;
  }
}
