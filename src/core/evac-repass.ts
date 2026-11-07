// 空襲下の退避（v0.6.11 S3b。jp_03。data evac_raid.passes_max 2・hard.evac_passes_max。ユーザーの U7「編隊が戻ってくる」）のもう一度来る編隊:
// 済み（airSortieComplete＝全部の爆撃進路を始め、全機が去り、空中に爆弾が無い）になったステップに、飛んだ回数が passes_max 未満で、新しい回の全部（予告の先
// announce_lead_s ＋ 1 回の長さの見積もり evacPassS。実際の 1 回より短くないことは起動時の V-E14）が次の波の始まり（次の波の announce_s ＋ announce_lead_s。
// 最後の波は duration_s）までに収まれば、同じ枠で予告し直す（EF_ANNOUNCED・狙い・中心＝最初の予告と同じ欄＝「狙われている」・赤い輪・模擬の方針が同じに読む）。
// 済みになった回の終わり方は問わない: 最後の爆撃進路を始めた後に狙った隊が隠れた（EO_LOST）・全滅した（EO_GONE）回も、済みになればもう一度来る（意図どおり。
// 自分の隊を隠すと、その編隊はほかの隠れていない隊へ向かう＝U5「他の隊は…残りの敵編隊の攻撃に晒され続ける」・U7）。最後の進路を始める前に隠れた・全滅した回は
// 凍結の core が中断して済みにならない＝来ない。予告し直す前に閉じる回の終わり方を closed に数える（telemetry だけ。表の列が 1 回ごとに足し合う）。
// 始めるのは core/evac-plan の evacPlanClock → evacTryStart（restartAirSortie・false なら次のステップ・隠れていれば見失う）。
// 狙いは波の最初の予告と同じ枠の決め（枠 0＝操作中の隊が隠れていなければ、ほかの枠は pickTarget＝走っている隊を先・枠の現れる点に近い順）を、
// この波でいま狙っている編隊（予告した・飛んでいて中断していない）で数えて（1 隊 1 編隊・flights_per_group_max）。枠 ≥ 1 は操作中の隊を狙わない（最初の予告と同じ）。
// 陰の発見（seed+29）は引かない（波ではない＝+29 は波ごとのまま）。散布の系列（+32+波×3+枠）はそのまま続く。撃墜した機は次の回に戻さない
// （凍結の core の spawnWave は全機を接近に戻すので、撃墜のビット EvacFlight.downed から始めたステップに落とし直す＝撃墜は evacDownPlane で）。
// 重なり: 第 k 波の 2 回目は次の波の始まりまでに済むが、次の波の予告（始まりの announce_lead_s 前）の後も ≈ 8 秒飛んでいることがある。その間は 1 つの隊が
// 爆撃中の編隊と新しく予告された編隊を同時に持ちうる（1 隊 1 編隊は波の中だけで数える）。動く編隊は ≤ 2／3（ノーマル／ハード）・機は ≤ 8／12 のまま（2 回目は次の波が始まる前に済む）。
// passes_max 1 は何もしない（S3 の挙動・どの系列も引く回数は同じ）。Phaser 非依存・乱数を引かない・確保は createEvacRepass だけ（起動時に 1 回）。
import { AIR_STRIKE_FADE_S, type AirStrikeParams } from './air-strike';
import { downStrikePlane, skipDownedRuns } from './air-down';
import { G_UNDERWAY } from './evac-data';
import { EF_ANNOUNCED, EO_DONE, EO_NONE, candidate, evacFlightLive, pickTarget, type EvacFlight, type EvacPlan } from './evac-plan';
import { evacLeader } from './evac-squadron';

export interface EvacRepass {
  /** 編隊ごとの 1 回の長さの見積もり（始めてから済みまで・実秒。evacPassS） */
  readonly passS: Float64Array;
  /** 編隊ごとの、新しい回が終わっていなければならない秒（次の波の始まり。最後の波は duration_s） */
  readonly untilS: Float64Array;
  /** このステップの出来事（HUD。core/evac-air が毎ステップの頭で消す）: 予告し直した編隊のビット */
  ev: number;
  /** telemetry: 予告し直した・収まらなかった・狙いが無かった回数 */
  again: number;
  noFit: number;
  noTarget: number;
  /** telemetry: 予告し直して閉じた回の終わり方（EO_* ごとの回数。編隊に残るのは最後の回の終わり方だけなので、模擬の表はこれを足して 1 回ごとに数える） */
  readonly closed: Int32Array;
}

/**
 * 1 回の長さの見積もり（実秒。起動時の V-E6 の長さ ＋ 濃さの秒＝最初の進路 ＋ 爆撃進路 ＋ (機数 × 発 − 1) × 間隔 ＋ 落下 ＋ 去る ＋ 濃さ）。
 * 実際の済みは最後の投下 A（＝最初の進路 ＋ (機数 × 発 − 1) × 間隔 ＋ 爆撃進路）から max(落下, 爆撃進路（離脱）＋ 去る) の後なので、
 * 落下 ＋ 濃さ ≥ 爆撃進路なら見積もりは実際より短くない（起動時の V-E14・tests）
 */
export function evacPassS(p: AirStrikeParams): number {
  return p.firstRunS + p.runS + (p.planes * p.bombsPerPlane - 1) * p.runGapS + p.fallFeelS + p.leaveS + AIR_STRIKE_FADE_S;
}

/** 起動時に 1 回: 編隊ごとの 1 回の長さと波の終わり */
export function createEvacRepass(plan: EvacPlan): EvacRepass {
  const { raid, flights } = plan;
  const passS = new Float64Array(flights.length);
  const untilS = new Float64Array(flights.length);
  for (let i = 0; i < flights.length; i++) {
    const fl = flights[i]!;
    const next = raid.waves[fl.wave + 1];
    passS[i] = evacPassS(fl.p);
    untilS[i] = next ? next.announceS + raid.announceLeadS : plan.sq.cfg.durationS;
  }
  return { passS, untilS, ev: 0, again: 0, noFit: 0, noTarget: 0, closed: new Int32Array(EO_DONE + 1) };
}

/** 港の空襲の機を撃墜する（core/air-down の downStrikePlane ＋ 撃墜のビット。模擬の対空も世界の arms-step もこれで）。飛んでいない機は false */
export function evacDownPlane(fl: EvacFlight, i: number): boolean {
  if (!downStrikePlane(fl.port.state, i)) return false;
  fl.downed |= 1 << i;
  return true;
}

/** 浮いている（撃墜されていない）機の数 */
function livePlanes(fl: EvacFlight): number {
  let n = 0;
  for (let i = 0; i < fl.p.planes; i++) if ((fl.downed & (1 << i)) === 0) n++;
  return n;
}

/**
 * 済みになったステップに 1 回（core/evac-air の段の中・evacRefreshView の後）。もう一度来るなら予告し直す（狙い・中心・始める秒）。
 * 来ない（回数・決着・全機撃墜・収まらない・狙いが無い）なら何も変えない＝済み（EO_DONE）のまま
 */
export function evacRepassOnComplete(plan: EvacPlan, rp: EvacRepass, fl: EvacFlight): void {
  const { sq, raid } = plan;
  if (fl.passes >= raid.passesMax || sq.settled || livePlanes(fl) === 0) return;
  const startS = plan.nowS + raid.announceLeadS;
  if (!(startS + rp.passS[fl.index]! <= rp.untilS[fl.index]!)) {
    rp.noFit++;
    return;
  }
  // 狙いの数え: この波でいま狙っている（予告した・飛んでいて中断していない＝evacPlanTargeted と同じ）ほかの編隊。枠 ≥ 1 は操作中の隊を数え済みにする
  const a = plan.assigned;
  a.fill(0);
  for (let s = 0; s < raid.flights; s++) {
    const o = plan.flights[fl.wave * raid.flights + s]!;
    if (o !== fl && o.target >= 0 && (o.phase === EF_ANNOUNCED || (evacFlightLive(o) && !o.port.state.cancelled))) a[o.target] = a[o.target]! + 1;
  }
  const ctl = candidate(sq, sq.control);
  if (fl.slot > 0 && ctl) a[sq.control] = a[sq.control]! + raid.flightsPerGroupMax;
  let gi = fl.slot === 0 && ctl && a[sq.control] === 0 ? sq.control : pickTarget(plan, fl.slot, 0);
  if (gi < 0 && raid.flightsPerGroupMax > 1) gi = pickTarget(plan, fl.slot, 1);
  if (gi < 0) {
    rp.noTarget++;
    return;
  }
  a[gi] = a[gi]! + 1;
  rp.closed[fl.outcome] = rp.closed[fl.outcome]! + 1;
  fl.target = gi;
  fl.phase = EF_ANNOUNCED;
  fl.outcome = EO_NONE;
  fl.complete = false;
  fl.startS = startS;
  fl.view.boat.state = evacLeader(sq.groups[gi]!)!.state;
  fl.view.boat.sinking = false;
  fl.view.atHome = false;
  if (fl.slot > 0) {
    if (sq.groups[gi]!.phase === G_UNDERWAY) plan.tierB++;
    else plan.tierA++;
  }
  rp.ev |= 1 << fl.index;
  rp.again++;
}

/** 始めたステップ（evacPlanClock の後・plan.evStart のビット）: 飛んだ回数を数え、撃墜した機を落とし直して順番を飛ばす（撃墜が無ければ数えるだけ） */
export function evacRepassStarted(plan: EvacPlan): void {
  for (let i = 0; i < plan.flights.length; i++) {
    if ((plan.evStart & (1 << i)) === 0) continue;
    const fl = plan.flights[i]!;
    fl.passes++;
    if (fl.downed === 0) continue;
    for (let k = 0; k < fl.p.planes; k++) if ((fl.downed & (1 << k)) !== 0) downStrikePlane(fl.port.state, k);
    skipDownedRuns(fl.port.state, fl.p);
  }
}
