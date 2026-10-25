// 味方の大発を守る模擬の 1 夜の記録（v0.6.6 の準備で core/convoy-sim.ts から移した。convoy-sim が型を再 export する。v0.6.5 の core/pt-trial と同じ形）。Phaser 非依存。
// 確保は createConvoyTrial の 1 夜に 1 回だけ。finishConvoyTrial は夜の終わりに隊の KPI・輸送隊・自艇の結果を前と同じ式で写す（失った HP・燃料・25mm の撃った数は runConvoyTrial が求めて渡す）。
import type { ConvoyState } from './convoy';
import type { GunboatTrial } from './convoy-sim-gunboat';
import type { PtSection } from './pt-boats';

export interface ConvoyTrial {
  /** 終わり方と秒、夜明けの後に帰投した */
  end: 'home' | 'sunk' | 'adrift' | 'timeout'; timeS: number; afterDawn: boolean;
  /** 上陸・沈んだ大発・大発への命中・自艇への命中・失った HP・残りの燃料 % */
  arrived: number; bargesSunk: number; bargeHits: number; playerHits: number; hpLost: number; fuelPct: number;
  /** 見つかった（秒）・最初の標的が大発・大発への航過・自艇への航過・連射（自艇・大発。大発は不変で 0）・標的が替わった回数 */
  detected: boolean; detectS: number; firstTargetBarge: boolean; passesBarge: number; passesPlayer: number; burstsPlayer: number; burstsBarge: number; switches: number;
  /** 25mm: 発射・命中・撃退・撃沈・制圧 */
  gunShots: number; gunHits: number; ptRetired: number; ptSunk: number; suppressions: number;
  /** 不変の確かめ: 予告から初弾の最短秒、同時に航過中の最大、有効射程・標的の視程の外からの発射、自艇の視程の外からの発射（大発への掃射で起きる）、1 回の攻撃の最大命中（大発・自艇）、健全な大発が 1 回の航過で沈んだ数 */
  minWarnS: number; maxPassing: number; beyondEff: number; beyondSight: number; beyondPlayerSight: number; worstBargePassHits: number; worstPlayerPassHits: number; singlePassKills: number;
  /** 決着（みな上陸か沈没）の秒（NaN は無し）・夜明けの後の決着・機関損傷 */
  resolvedS: number; resolvedAfterDawn: boolean; engineHit: boolean;
  /** 隼艇（v0.6.6。setup.gunboat のある夜だけ。無い夜は鍵ごと無い＝ノーマルの記録は同じ） */
  gunboat?: GunboatTrial;
}

/** 1 夜の記録の初期値（runConvoyTrial の始めに 1 回） */
export function createConvoyTrial(): ConvoyTrial {
  return {
    end: 'timeout', timeS: 0, afterDawn: false, arrived: 0, bargesSunk: 0, bargeHits: 0, playerHits: 0, hpLost: 0, fuelPct: 0,
    detected: false, detectS: NaN, firstTargetBarge: false, passesBarge: 0, passesPlayer: 0, burstsPlayer: 0, burstsBarge: 0, switches: 0,
    gunShots: 0, gunHits: 0, ptRetired: 0, ptSunk: 0, suppressions: 0,
    minWarnS: Infinity, maxPassing: 0, beyondEff: 0, beyondSight: 0, beyondPlayerSight: 0, worstBargePassHits: 0, worstPlayerPassHits: 0, singlePassKills: 0,
    resolvedS: NaN, resolvedAfterDawn: false, engineHit: false,
  };
}

/** 夜の終わり: 時刻・夜明け・輸送隊（f）・標的が替わった回数・失った HP・残りの燃料 %・25mm の撃った数・隊の KPI（q）を写す */
export function finishConvoyTrial(out: ConvoyTrial, q: PtSection, f: ConvoyState, t: number, dawn: boolean, switches: number, hpLost: number, fuelPct: number, gunShots: number): ConvoyTrial {
  Object.assign(out, {
    timeS: t, afterDawn: out.end === 'home' && dawn, arrived: f.arrived, bargesSunk: f.sunk, detected: !Number.isNaN(out.detectS), switches,
    hpLost, fuelPct,
    gunShots, gunHits: q.gunHits, ptRetired: q.retired, ptSunk: q.sunk, suppressions: q.suppressions, minWarnS: q.minWarnS,
  });
  return out;
}
