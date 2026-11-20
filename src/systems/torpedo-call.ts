// 撃ち尽くしの呼びかけの時計（v0.8.2 IP2。ユーザー 2026-11-19「うち尽くしたあとの呼びかけは海の外に出るまでまたなくても8秒経過くらいで出せばいいんじゃないかな」）:
// 魚雷の任務の「撃ち尽くし」（core/mission-flow の updateReturnCalls の torpedoesExpended＝「魚雷なし 帰投せよ」）は、残弾 0・発射の待ち行列 0 で、
// 走っている魚雷がみな決着したか、最後の発射から TORPEDO_CALL_AFTER_S（8 秒）たった時の早い方。IP2 で走る魚雷を通り過ぎで外れに決めなくなった（systems/destroyer-group の
// TORPEDO_PASS_RADIUS2）ので、外れた魚雷の決着は海の外・射程の終わりまで（数十秒）かかる＝呼びかけだけその待ちから外す。任務の終わりの魚雷の待ち（最大 5 秒）・命中・終わり際の当たり・
// 得点は今のまま（このファイルは世界を読むだけ）。scenes/mission-scene が毎フレーム呼ぶ（world は mission-world が 1 つ持つ）。確保しない・乱数なし。
import { TORPEDO_CALL_AFTER_S } from '../config/torpedo-call-config';

/** 読む世界の部分（MissionWorld がそのまま満たす） */
export interface TorpedoCallWorld {
  readonly torpedoes: { readonly remaining: number; readonly unresolvedCount: number };
  readonly launcher: { readonly queued: number };
  readonly stepTimeS: number;
}

export class TorpedoCallClock {
  /** 前に見た残弾と、最後に残弾が減った（＝撃った）固定ステップの時計 */
  private seenRemaining: number;
  private lastLaunchS = NaN;

  constructor(capacity: number) {
    this.seenRemaining = capacity;
  }

  /** 撃ち尽くしの呼びかけを出してよいか（毎フレーム。最後に撃った秒もここで覚える） */
  expended(w: TorpedoCallWorld): boolean {
    const left = w.torpedoes.remaining;
    if (left < this.seenRemaining) {
      this.seenRemaining = left;
      this.lastLaunchS = w.stepTimeS;
    }
    if (left > 0 || w.launcher.queued > 0) return false;
    return w.torpedoes.unresolvedCount === 0 || w.stepTimeS - this.lastLaunchS >= TORPEDO_CALL_AFTER_S;
  }
}
