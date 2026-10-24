// 米PT の模擬の 1 夜の記録（v0.6.5 の準備で core/pt-pass-sim.ts から移した。型と初期値は 1 字も変えていない。pt-pass-sim が型を再 export する）。Phaser 非依存。
// 確保は createPtTrial の 1 夜に 1 回だけ。finishPtTrial は夜の終わりに隊の KPI と自艇の結果を前と同じ式で写す（失った HP・燃料・13mm の撃った数は runPtTrial が求めて渡す）。
import type { PtSection } from './pt-boats';

export type PtTrialEnd = 'home' | 'sunk' | 'adrift' | 'timeout';

export interface PtTrial {
  /** 終わり方と秒、夜明けの後に帰投した */
  end: PtTrialEnd; timeS: number; afterDawn: boolean;
  /** 隊の KPI（core/pt-state の PtSection と同じ意味）、失った HP、残りの燃料 % */
  detected: boolean; firstDetectM: number; lostContacts: number; passes: number; firedPasses: number; cleanPasses: number; shots: number; hits: number; hpLost: number; fuelPct: number;
  /** 不変の確かめ: 予告から初弾の最短秒、同時に航過中の PT の最大、有効射程・艇の視程の外からの発射、1 回の航過の最大命中、予告から航過の終わりまでの最短秒（v0.6.3 の直し: 一瞬で終わる航過が無い） */
  minWarnS: number; maxPassing: number; beyondEff: number; beyondSight: number; worstPassHits: number; minPassS: number;
  /** 13mm（実機 1 回目）: 撃った・PT に当てた・撃退・撃沈の数、最初に見つかったのが閃光、視程か射程の外へ撃ったステップ（「HP だけでは沈まない」F11 は数えない＝レビュー R4。守りは pt-data と tests/pt-damage） */
  gunShots: number; gunHits: number; ptRetired: number; ptSunk: number; flashFirst: boolean; gunBeyond: number;
  /** 挟み撃ち: 赤い線の PT の舷が前の赤い線と替わった数と比べた数（2 本目から）・赤い線の間の体感秒の和、待つ PT（hold_off_m の外で待ち始めた）の艇への最接近 m（無ければ Infinity） */
  flankAlt: number; flankPairs: number; commitGapSumS: number; heldMinM: number;
  /** 追撃（実機 2 回目。r2 §H.2）: 撃った連射・その命中・制圧、1 回の連射の最大命中、1 隻の撃った連射の最大、同じ PT の続けての連射（相方が撃てる距離で gap_s + self_gap_s の内）、
   * 予告から連射の終わりの最短秒、他の PT が撃っている間の追撃の PT の最接近 m（無ければ Infinity）、機関損傷を受けた */
  bursts: number; burstHits: number; suppressions: number; worstBurstHits: number; maxBoatBursts: number; selfRepeats: number; minBurstS: number; chaseHeldMinM: number; engineHit: boolean;
}

/** 1 夜の記録の初期値（runPtTrial の始めに 1 回） */
export function createPtTrial(): PtTrial {
  return {
    end: 'timeout', timeS: 0, afterDawn: false, detected: false, firstDetectM: NaN, lostContacts: 0, passes: 0, firedPasses: 0, cleanPasses: 0, shots: 0, hits: 0, hpLost: 0, fuelPct: 0,
    minWarnS: Infinity, maxPassing: 0, beyondEff: 0, beyondSight: 0, worstPassHits: 0, minPassS: Infinity,
    gunShots: 0, gunHits: 0, ptRetired: 0, ptSunk: 0, flashFirst: false, gunBeyond: 0, flankAlt: 0, flankPairs: 0, commitGapSumS: 0, heldMinM: Infinity,
    bursts: 0, burstHits: 0, suppressions: 0, worstBurstHits: 0, maxBoatBursts: 0, selfRepeats: 0, minBurstS: Infinity, chaseHeldMinM: Infinity, engineHit: false,
  };
}

/** 夜の終わり: 隊の KPI（q）と時刻・夜明け・失った HP・残りの燃料 %・13mm の撃った数・待つ PT と追撃の PT の最接近の二乗を写す（平方根はここで 1 回ずつ） */
export function finishPtTrial(out: PtTrial, q: PtSection, t: number, dawn: boolean, hpLost: number, fuelPct: number, gunShots: number, heldMin2: number, chaseHeld2: number): PtTrial {
  Object.assign(out, {
    timeS: t, afterDawn: out.end === 'home' && dawn, detected: !Number.isNaN(q.firstDetectM), firstDetectM: q.firstDetectM, lostContacts: q.lostContacts,
    passes: q.passes, firedPasses: q.firedPasses, cleanPasses: q.cleanPasses, shots: q.shots, hits: q.hits, minWarnS: q.minWarnS,
    hpLost, fuelPct,
    gunShots, gunHits: q.gunHits, ptRetired: q.retired, ptSunk: q.sunk, flashFirst: q.flashFirst, heldMinM: Math.sqrt(heldMin2),
    bursts: q.firedBursts, burstHits: q.burstHits, suppressions: q.suppressions, chaseHeldMinM: Math.sqrt(chaseHeld2),
  });
  return out;
}
