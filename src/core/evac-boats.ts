// 空襲下の退避（v0.6.11。jp_03。spec-v0611-r2 §8 の段 3）の 1 固定ステップの隊の動き（世界の evac.stepBoats も模擬もこれを呼ぶ＝順が 1 つ）:
// 座席の位置を記録へ → 座席を止める（上げている・隠れている。点と針路＝r2 L14）→ 出る・上げるのをやめる（スティックと latch）→ 操作中の停泊の隊が動き出す →
// 操作していない隊の離岸・ランダム回避（seed+30）・回避の保持 → 隊長艇の記録の速力帯 → 航跡と僚艇 → 隠れ場所（入る・上げる・隠れる・見つかった後）。
// 帰投（atHome）は呼び手が evacSeatHome で書き換える。Phaser 非依存・確保しない。dt は game の秒（time_scale 込み）、realDt は実秒。
import { nextSpeedBand, type BoatInput } from './boat-motion';
import { G_HAULING, G_HIDDEN, G_MOORED, G_UNDERWAY, SW_FREE } from './evac-data';
import { evacAiPick, evacCastOff, evacStepAiLeaders, evacStepWingmen } from './evac-follow';
import type { EvacSeat } from './evac-seat';
import { evacStoreSeatPose } from './evac-seat';
import { evacLaunch, evacStepShelters } from './evac-shelter';
import { evacLeader, evacTrailReset, type EvacSquadron } from './evac-squadron';
import type { SeededRng } from './rng';

/** 1 固定ステップ（stepPlayerBoat の直後）。input はフレームのスティック（出る・下ろすの判定。座席の運動は呼び手が evacSeatCommand を通して済ませている）、aiRng は seed+30 */
export function stepEvacBoats(sq: EvacSquadron, seat: EvacSeat, input: BoatInput, aiRng: SeededRng, stepTimeS: number, dt: number, realDt: number): void {
  const g = sq.groups[sq.control]!;
  const lead = evacLeader(g);
  if (lead) {
    evacStoreSeatPose(sq, seat);
    if (g.phase === G_HAULING || g.phase === G_HIDDEN) {
      // 上げている・隠れている間は座席を止めた点と針路に戻す（stepPlayerBoat が動かした分を消す）
      seat.state.x = lead.state.x = g.holdX;
      seat.state.y = lead.state.y = g.holdY;
      seat.state.headingDeg = lead.state.headingDeg = g.holdHeadingDeg;
      seat.state.speedMps = lead.state.speedMps = 0;
      if (sq.latch === SW_FREE && input.speed01 >= sq.p.launchStick) {
        evacLaunch(sq, g);
        seat.state.x = lead.state.x;
        seat.state.y = lead.state.y;
        seat.state.headingDeg = lead.state.headingDeg;
      }
    } else if (g.phase === G_MOORED && lead.state.speedMps > 0) {
      g.phase = G_UNDERWAY;
      evacTrailReset(g, sq.p.trailStepM);
    }
  }
  evacCastOff(sq, stepTimeS);
  evacAiPick(sq, aiRng, stepTimeS);
  evacStepAiLeaders(sq, dt, realDt);
  for (let gi = 0; gi < sq.groups.length; gi++) {
    const b = evacLeader(sq.groups[gi]!);
    if (b) b.band = nextSpeedBand(b.band, b.state.speedMps, b.params);
  }
  for (let gi = 0; gi < sq.groups.length; gi++) evacStepWingmen(sq, sq.groups[gi]!, dt);
  evacStepShelters(sq, realDt);
}
