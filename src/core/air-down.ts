// 撃墜（v0.6.8。spec-v068 §5.3）: 凍結の空中の core（core/air-strike*.ts・core/seaplane.ts）の公開の状態を外から書く包み（凍結のファイルは 1 字も変えない。
// 前例は core/air-sortie の restartAirSortie）。Phaser 非依存・乱数なし・確保しない。呼ぶのは systems の ArmsStep.stepAir だけ。
//  - downStrikePlane: 飛んでいる（接近〜去る）空襲の機を撃墜 → AS_DONE・残りの爆弾 0（もう落とさない。落下中の爆弾はそのまま落ちる）。
//  - skipDownedRuns: 撃墜が 1 機でもあった後は毎ステップ、stepAirStrike の前に（夜明けの空襲と jp_02 の夜の出撃）。撃墜された機の順番を飛ばして波が止まらないようにし、
//    投下の前に波の全機が落ちたら波の休みの時計を始める（lastReleaseT が NaN のままだと次の波が来ない）。
//    撃墜が無ければ何もしない: 撃墜されていない機が AS_DONE になるのは最後の進路の後の LEAVING の後だけなので、nextRun < totalRuns の間 nextRun % planes の機は DONE でない。
//    allDone で nextRun === totalRuns なら全機が投下したので lastReleaseT は数（tests/air-down の (a) が毎ステップの状態で確かめる）。
//  - downSeaplane: us_02 の夜の水上機を撃墜 → SP_DONE（stepSeaplaneTrigger は DONE から始めない＝今夜はもう来ない）。
import { AS_DONE, AS_INBOUND, AS_LEAVING, allDone, bombInAir, type AirStrikeParams, type AirStrikeState } from './air-strike';
import { SP_DONE, SP_OUT_CANCELLED, SP_OUT_NONE, seaplaneActive, type SeaplaneState } from './seaplane';

/** 空襲の機 i を撃墜する。飛んでいない（待機・終わり）なら何も変えずに false（撃墜は true のときだけ数える。レビュー F14） */
export function downStrikePlane(s: AirStrikeState, i: number): boolean {
  const pl = s.planes[i];
  if (!pl || pl.phase < AS_INBOUND || pl.phase > AS_LEAVING) return false;
  pl.phase = AS_DONE;
  pl.bombsLeft = 0;
  return true;
}

/** 撃墜があった後は毎ステップ、stepAirStrike の前に。撃墜された機の順番を飛ばし、投下の前に全機が落ちた波は今から波の休みを数える。撃墜が無ければ何もしない */
export function skipDownedRuns(s: AirStrikeState, p: AirStrikeParams): void {
  if (!s.started || s.cancelled) return;
  while (s.nextRun < s.totalRuns && s.planes[s.nextRun % p.planes]!.phase === AS_DONE) s.nextRun++;
  if (s.nextRun === s.totalRuns && Number.isNaN(s.lastReleaseT) && allDone(s) && !bombInAir(s)) s.lastReleaseT = s.waveT;
}

/**
 * 夜の水上機を撃墜する（接近〜去る。それ以外は何も変えずに false）。狙いを決めて落としていない爆弾は狙いを外す（転舵の KPI を数え続けない）。
 * 結果が無ければ「中断」にする（HUD のキーの 2 ビットの欄に 4 を入れない。ui/mission-line-air.ts）。落下中の爆弾と照明弾はそのまま
 */
export function downSeaplane(s: SeaplaneState): boolean {
  if (!seaplaneActive(s)) return false;
  const o = s.ordnance;
  const b = o.bombs[o.bombsDropped];
  if (b && b.aimed && !b.active) b.aimed = false;
  if (s.outcome === SP_OUT_NONE) s.outcome = SP_OUT_CANCELLED;
  s.phase = SP_DONE;
  return true;
}
