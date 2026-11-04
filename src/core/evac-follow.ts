// 空襲下の退避（v0.6.11。jp_03。spec-v0611-r2 §3.4・§3.5）の動き: 僚艇は隊長艇の航跡をたどる縦列（r2 M4。core/escort は触らない＝us_01 の中立）と、
// 入る時の枠の点、操作していない隊の離岸（生成の時に引いた秒）・ランダム回避（時計の pick_s ごとに seed+30 から 6 隊 × 2 回）・爆撃から逃げる（投下ごとに seed+31 から 1 回）。
// Phaser 非依存・毎ステップ確保しない（作業の点は使い回し）。平方根は航跡の点を書く時だけ（区間の長さを輪に持つ。隊長艇と最新の点の間は艇首への射影＝直進で正確）。
// 運動は艇の stepBoat（隊長艇）と steerShip（僚艇。旋回・加速は T-38 の無傷の値）。秒は実秒（realDt）、運動は game の dt（time_scale 込み）。
import { clampToBounds, setPerformance, stepBoat, type BoatInput, type BoatParams } from './boat-motion';
import { crewAccelFactor, crewLost, crewTurnFactor } from './crew';
import { G_ENTERING, G_MOORED, G_UNDERWAY } from './evac-data';
import { evacLeader, evacTrailReset, type EvacGroup, type EvacSquadron } from './evac-squadron';
import type { SeededRng } from './rng';
import { bearingDeg, steerShip } from './ship-ai';
import { clamp, degToRad, radToDeg, wrapDeg180, wrapDeg360 } from './units';

/** 航跡の上の点（定位置）と、その点での進む向きの単位ベクトル */
export interface EvacTrailPoint {
  x: number;
  y: number;
  ux: number;
  uy: number;
}

const station: EvacTrailPoint = { x: 0, y: 0, ux: 0, uy: 0 };
const slotPt: EvacTrailPoint = { x: 0, y: 0, ux: 0, uy: 0 };
const aiInput: BoatInput = { headingDeg: NaN, speed01: 0 };

/** 隊長艇が最新の点から trail_step_m 以上進んだら、その点を輪に書く（古い点を上書き。区間の長さはここで 1 回だけ平方根） */
export function evacTrailWrite(g: EvacGroup, stepM: number): void {
  const lead = evacLeader(g);
  if (!lead) return;
  const h = g.trailHead;
  const dx = lead.state.x - g.trailX[h]!;
  const dy = lead.state.y - g.trailY[h]!;
  const d2 = dx * dx + dy * dy;
  if (d2 < stepM * stepM) return;
  const n = (h + 1) % g.trailX.length;
  g.trailX[n] = lead.state.x;
  g.trailY[n] = lead.state.y;
  g.trailSeg[n] = Math.sqrt(d2);
  g.trailHead = n;
  if (g.trailCount < g.trailX.length) g.trailCount++;
}

/** 隊長艇から航跡を弧長 arcM さかのぼった点（輪の 2 点の間を線形に補間）を out に書く。輪が尽きれば最も古い点 */
export function evacStation(g: EvacGroup, arcM: number, out: EvacTrailPoint): EvacTrailPoint {
  const lead = evacLeader(g)!.state;
  const n = g.trailX.length;
  let j = g.trailHead;
  const h = degToRad(lead.headingDeg);
  // 隊長艇は最新の点より前にいる（< trail_step_m）。その分を艇首への射影で引く（直進なら正確・平方根なし）
  const ahead = (lead.x - g.trailX[j]!) * Math.sin(h) - (lead.y - g.trailY[j]!) * Math.cos(h);
  let rem = arcM - (ahead > 0 ? ahead : 0);
  out.x = g.trailX[j]!;
  out.y = g.trailY[j]!;
  out.ux = Math.sin(h);
  out.uy = -Math.cos(h);
  for (let c = 1; c < g.trailCount; c++) {
    const seg = g.trailSeg[j]!;
    const pj = (j - 1 + n) % n;
    const ux = (g.trailX[j]! - g.trailX[pj]!) / seg;
    const uy = (g.trailY[j]! - g.trailY[pj]!) / seg;
    out.ux = ux;
    out.uy = uy;
    if (rem <= seg) {
      out.x = g.trailX[j]! - ux * rem;
      out.y = g.trailY[j]! - uy * rem;
      return out;
    }
    rem -= seg;
    j = pj;
    out.x = g.trailX[j]!;
    out.y = g.trailY[j]!;
  }
  return out;
}

/** 入る時の僚艇 k（浮いている僚艇の順に 1・2）の枠の点: 隊長艇の点から右舷（k 奇数）・左舷へ slot_abeam_m。海域の縁の内に収める */
export function evacSlotPoint(sq: EvacSquadron, g: EvacGroup, k: number, out: EvacTrailPoint): EvacTrailPoint {
  const lead = evacLeader(g)!.state;
  const h = degToRad(lead.headingDeg);
  const side = (k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2) * sq.p.slotAbeamM;
  const m = sq.cfg.boundsMarginM;
  out.x = clamp(lead.x + Math.cos(h) * side, m, sq.cfg.bounds.width - m);
  out.y = clamp(lead.y + Math.sin(h) * side, m, sq.cfg.bounds.height - m);
  out.ux = Math.sin(h);
  out.uy = -Math.cos(h);
  return out;
}

/** 入っている隊の僚艇がみな枠の点に着いて止まった（slot_arrive_m 以内・速さ 0。2 乗の距離） */
export function evacWingmenArrived(sq: EvacSquadron, g: EvacGroup): boolean {
  const r2 = sq.p.slotArriveM * sq.p.slotArriveM;
  let k = 0;
  for (let s = 0; s < g.boats.length; s++) {
    const b = g.boats[s]!;
    if (s === g.leader || b.sunk || b.up) continue;
    evacSlotPoint(sq, g, ++k, slotPt);
    const dx = slotPt.x - b.state.x;
    const dy = slotPt.y - b.state.y;
    if (dx * dx + dy * dy > r2 || b.state.speedMps > 0) return false;
  }
  return true;
}

/** 僚艇を 1 ステップ: 走っている隊は航跡の定位置へ（遅れれば増速・前に出れば止まる＝後進なし）、入っている隊は枠の点へ寄って止まる。ほかの段階は動かない */
export function evacStepWingmen(sq: EvacSquadron, g: EvacGroup, dt: number): void {
  const lead = evacLeader(g);
  if (!lead || (g.phase !== G_UNDERWAY && g.phase !== G_ENTERING)) return;
  const p = sq.p;
  const base = sq.cfg.boat;
  if (g.phase === G_UNDERWAY) evacTrailWrite(g, p.trailStepM);
  const db2 = p.headingDeadbandM * p.headingDeadbandM;
  const slow2 = p.slotAbeamM * p.slotAbeamM;
  const arrive2 = p.slotArriveM * p.slotArriveM;
  let k = 0;
  for (let s = 0; s < g.boats.length; s++) {
    const b = g.boats[s]!;
    if (s === g.leader || b.sunk || b.up) continue;
    k++;
    const w = b.state;
    if (g.phase === G_UNDERWAY) {
      evacStation(g, k * p.followGapM, station);
      const dx = station.x - w.x;
      const dy = station.y - w.y;
      const along = dx * station.ux + dy * station.uy;
      const v = clamp(lead.state.speedMps + along * p.catchUpGainPerS, 0, base.speedMaxMps);
      // 定位置が前にあり離れていればそこへ向き、それ以外は航跡の向き（定位置が後ろの時にその場で回らない）
      const hd = dx * dx + dy * dy > db2 && along > 0 ? radToDeg(Math.atan2(dx, -dy)) : radToDeg(Math.atan2(station.ux, -station.uy));
      steerShip(w, hd, v, base.turnRateDegS, base.accelMps2, dt);
    } else {
      evacSlotPoint(sq, g, k, slotPt);
      const dx = slotPt.x - w.x;
      const dy = slotPt.y - w.y;
      const d2 = dx * dx + dy * dy;
      // 遠ければ静音の速さ、枠の点の slot_abeam_m 内では hide_max の速さ、slot_arrive_m 内で止まる（平方根なし）
      if (d2 <= arrive2) steerShip(w, w.headingDeg, 0, base.turnRateDegS, base.accelMps2, dt);
      else steerShip(w, radToDeg(Math.atan2(dx, -dy)), d2 > slow2 ? base.speedSilentMps : p.hideMaxMps, base.turnRateDegS, base.accelMps2, dt);
    }
    clampToBounds(w, sq.cfg.bounds, sq.cfg.boundsMarginM);
  }
}

/** 巡航の指令（全速に対する比。機関損傷で最高速が下がれば頭打ち） */
export function evacCruise01(params: BoatParams): number {
  return params.speedMaxMps > 0 ? Math.min(1, params.speedCruiseMps / params.speedMaxMps) : 0;
}

/** 操作していない停泊の隊は、生成の時に引いた秒で岸を離れる（今の針路・巡航から。操作中の隊は離岸しない） */
export function evacCastOff(sq: EvacSquadron, stepTimeS: number): void {
  for (let gi = 0; gi < sq.groups.length; gi++) {
    const g = sq.groups[gi]!;
    const lead = evacLeader(g);
    if (gi === sq.control || g.phase !== G_MOORED || !lead || stepTimeS < g.castOffS) continue;
    g.phase = G_UNDERWAY;
    g.aiHeadingDeg = lead.state.headingDeg;
    g.aiSpeed01 = evacCruise01(lead.params);
    evacTrailReset(g, sq.p.trailStepM);
  }
}

/**
 * ランダム回避の選び（時計の pick_s の境。dawnReached と同じ形: stepTimeS ≥ nextPickS なら引いて nextPickS += pick_s。境は決着の秒より前だけ）。
 * 6 隊すべてが隊番号の順に 2 回ずつ引く（隠れ・沈没・操作中・回避の保持中でも引く＝引く回数は時計だけで決まる）。使うのは操作していない走っている隊だけ:
 * 針路は今の針路 ± turn_max_deg（look_m 先が縁から wall_m の内側の箱の外なら港の中心への方位 ± wall_turn_deg）、速さは狙われているか u₂ < full_p で全速・ほかは巡航
 */
export function evacAiPick(sq: EvacSquadron, rng: SeededRng, stepTimeS: number): void {
  if (!(sq.nextPickS < sq.cfg.durationS) || stepTimeS < sq.nextPickS) return;
  sq.nextPickS += sq.p.pickS;
  const p = sq.p;
  const W = sq.cfg.bounds.width;
  const H = sq.cfg.bounds.height;
  for (let gi = 0; gi < sq.groups.length; gi++) {
    const u1 = rng.next();
    const u2 = rng.next();
    const g = sq.groups[gi]!;
    const lead = evacLeader(g);
    if (gi === sq.control || g.phase !== G_UNDERWAY || !lead || g.dodgeLeftS > 0) continue;
    const s = lead.state;
    let hd = s.headingDeg + (2 * u1 - 1) * p.turnMaxDeg;
    const r = degToRad(hd);
    const lx = s.x + Math.sin(r) * p.lookM;
    const ly = s.y - Math.cos(r) * p.lookM;
    if (lx < p.wallM || lx > W - p.wallM || ly < p.wallM || ly > H - p.wallM) hd = bearingDeg(s.x, s.y, W / 2, H / 2) + (2 * u1 - 1) * p.wallTurnDeg;
    g.aiHeadingDeg = wrapDeg360(hd);
    g.aiSpeed01 = sq.targeted[gi] || u2 < p.fullP ? 1 : evacCruise01(lead.params);
  }
}

/** 操作していない走っている隊長艇を 1 ステップ（AI の最後の指令で stepBoat。旋回・加速は乗員の倍率＝座席と同じ式。回避の保持を実秒で減らす） */
export function evacStepAiLeaders(sq: EvacSquadron, dt: number, realDt: number): void {
  const c = sq.cfg;
  for (let gi = 0; gi < sq.groups.length; gi++) {
    const g = sq.groups[gi]!;
    const lead = evacLeader(g);
    if (gi === sq.control || g.phase !== G_UNDERWAY || !lead) continue;
    if (g.dodgeLeftS > 0) g.dodgeLeftS -= realDt;
    const lost = crewLost(c.crew, c.damage.maxHp, lead.damage.hp);
    setPerformance(lead.params, c.boat.turnRateDegS, c.boat.accelMps2, crewTurnFactor(c.crewEffects, lost), crewAccelFactor(c.crewEffects, lost));
    aiInput.headingDeg = g.aiHeadingDeg;
    aiInput.speed01 = g.aiSpeed01;
    stepBoat(lead.state, aiInput, lead.params, dt);
    clampToBounds(lead.state, c.bounds, c.boundsMarginM);
  }
}

/**
 * 爆撃から逃げる: どの編隊でも投下ごとに必ず 1 回引く（編隊の番号順。中心が座席・隠れた隊・中心なし（−1）でも引く）。
 * 中心が操作していない走っている隊長艇で u < dodge.success なら、今の旋回の逆へ dodge.turn_deg 切って全速を dodge.hold_s（直進なら左へ）。転舵したら true
 */
export function evacOnRelease(sq: EvacSquadron, rng: SeededRng, centerGroup: number): boolean {
  const u = rng.next();
  const g = sq.groups[centerGroup];
  const lead = g ? evacLeader(g) : null;
  if (!g || !lead || centerGroup === sq.control || g.phase !== G_UNDERWAY || !(u < sq.p.dodgeSuccess)) return false;
  const turning = wrapDeg180(g.aiHeadingDeg - lead.state.headingDeg);
  g.aiHeadingDeg = wrapDeg360(lead.state.headingDeg + (turning >= 0 ? -sq.p.dodgeTurnDeg : sq.p.dodgeTurnDeg));
  g.aiSpeed01 = 1;
  g.dodgeLeftS = sq.p.dodgeHoldS;
  return true;
}

/** 操作をやめた隊（r2 M13）: 走っていれば今の針路・今の速さから回避を始め（次の pick の境で選ぶ）、ほかの段階は隊長艇を止める（入る・上げるは自動で続く） */
export function evacReleaseControl(g: EvacGroup): void {
  const lead = evacLeader(g);
  if (!lead) return;
  if (g.phase === G_UNDERWAY) {
    g.aiHeadingDeg = lead.state.headingDeg;
    g.aiSpeed01 = lead.params.speedMaxMps > 0 ? clamp(lead.state.speedMps / lead.params.speedMaxMps, 0, 1) : 0;
    g.dodgeLeftS = 0;
  } else lead.state.speedMps = 0;
}
