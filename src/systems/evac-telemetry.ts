// 空襲下の退避（v0.6.11 S5。jp_03。spec-v0611-r2 §10.1・§10.2・§10.4）の HUD 向けテレメトリ t.evac: mission-telemetry の refreshTelemetry が兵装の後に毎フレーム 1 回呼ぶ（§7: 確保しない）。
// 世界の値（隊・座席・段取り・もう一度来る編隊）を写し、systems/world-evac の EvacFeed（ステップの間に積んだ出来事）を読んで消す。2 行目の出来事は 1 つだけ持ち、
// 同じか重い出来事が来れば替える（EVE_* の数が重さ）。出す秒は世界の時計（一時停止で止まる。jp_03 の決着の前は命中スローが無い＝r2 M1）。
// 予告の行は波の予告と、もう一度来る編隊の予告し直し（S3b の U7。plan.evWave は立たず repass.ev のビット）の両方で、予告から始まるまで（中央の帯は ui/dawn-banner が annSeq で 2 秒）。
// ［切替］の先（ボタンの字）は sq.order を書かない並びで見る（core/evac-seat の evacNextSwitch に EvacFeed の並び）。world-vs-sim が比べる物は読むだけ。Phaser・DOM を読まない。
// S8b: ほかの隊を座席へ入れてから EVAC_TAKE_HOLD_S の間は takeHold（引き継いだ行が予告より上）・予告の狙いごとの機の数と、狙った隊がいま隠れている（見失う）ビット。
import { AS_T_FALLING, strikeThreat } from '../core/air-strike';
import type { BoatState } from '../core/boat-motion';
import { bearingJa } from '../core/briefing';
import { EV_DOWN_EVAC } from '../core/arms-cue';
import { EVAC_EVENT_SHOW_S, EVAC_SETTLE_SHOW_S, EVAC_TAKE_HOLD_S } from '../config/evac-config';
import { G_ENTERING, G_GONE, G_HAULING, G_HIDDEN, SHELTER_COVER } from '../core/evac-data';
import { EF_ANNOUNCED, EO_NO_TARGET, evacFlightLive, type EvacFlight } from '../core/evac-plan';
import { evacNextSwitch } from '../core/evac-seat';
import { evacAfloat, evacLeader, evacSurvivors } from '../core/evac-squadron';
import {
  EVA_NONE, EVA_REPASS, EVA_WAVE, EVAC_ANN_MAX, EVE_DOWN, EVE_FOUND, EVE_GUN, EVE_HIDDEN, EVE_LOST, EVE_NONE, EVE_SETTLE, EVE_SINK, clearEvacFeed, createEvacTelemetry, type EvacTelemetry,
} from '../core/evac-telemetry';
import type { WorldEvac } from './world-evac';

/** 読む世界の部分（MissionWorld がそのまま満たす。tests は tests/evac-world-kit の小さな世界） */
export interface EvacTelemetryWorld {
  readonly evac: WorldEvac | null;
  readonly stepTimeS: number;
  readonly boat: { readonly state: BoatState };
  readonly damage: { readonly hp: number };
  readonly arms: { readonly evSeq: number; readonly evCode: number; readonly evN: number; readonly aaRounds: number } | null;
  readonly dawn: { readonly strike: { readonly p: { readonly planes: number } } | null };
}

/** 出発時（systems/telemetry-create）: evac の任務だけ呼び名・数を入れて 1 回書く。無い任務は既定（enabled false） */
export function initEvacTelemetry(w: EvacTelemetryWorld): EvacTelemetry {
  const ev = w.evac;
  if (!ev) return createEvacTelemetry();
  const t = createEvacTelemetry(ev.sq.groups.length);
  const p = ev.sq.p;
  const raid = ev.plan.raid;
  t.enabled = true;
  t.groupLabels = p.groups.map((g) => g.labelJa);
  t.shelterLabels = p.shelters.map((s) => s.labelJa);
  t.shelterCover = p.shelters.map((s) => s.kind === SHELTER_COVER);
  t.total = raid.survivorsTotal;
  t.quota = raid.survivorQuota;
  t.historical = raid.historicalSurvivors;
  t.durationS = ev.sq.cfg.durationS;
  t.leadS = raid.announceLeadS;
  t.fromJa = bearingJa(raid.fromBearingDeg);
  t.dawnPlanes = w.dawn.strike ? w.dawn.strike.p.planes : 0;
  refreshEvacTelemetry(t, w);
  return t;
}

/** 撃墜されていない機の数（見失った編隊の「N機が引き返す」・戻ってくる機） */
function livePlanes(fl: EvacFlight): number {
  let n = 0;
  for (let i = 0; i < fl.p.planes; i++) if ((fl.downed & (1 << i)) === 0) n++;
  return n;
}

/** いちばん小さい立っているビット（無ければ −1） */
function lowBit(bits: number): number {
  for (let i = 0; i < 31; i++) if ((bits & (1 << i)) !== 0) return i;
  return -1;
}

/** 出来事を取る（今の出来事が無いか、同じか重ければ替える。沈没どうしは軽い沈没が重い沈没に替わらない） */
function take(t: EvacTelemetry, ev: WorldEvac, nowS: number, kind: number, group: number, n: number, sub: number, shelter: number, targeted: boolean): void {
  if (t.event !== EVE_NONE && (kind < t.event || (kind === EVE_SINK && t.event === EVE_SINK && sub < t.eventSub))) return;
  t.event = kind;
  t.eventSeq++;
  t.eventGroup = group;
  t.eventN = n;
  t.eventSub = sub;
  t.eventShelter = shelter;
  t.eventTargeted = targeted;
  ev.feed.untilS = nowS + (kind === EVE_SETTLE ? EVAC_SETTLE_SHOW_S : EVAC_EVENT_SHOW_S);
}

/** 毎フレーム 1 回（兵装の後）。evac の無い任務は何もしない */
export function refreshEvacTelemetry(t: EvacTelemetry, w: EvacTelemetryWorld): void {
  const ev = w.evac;
  if (!ev) return;
  const { sq, plan, feed: f } = ev;
  const nowS = w.stepTimeS;
  const g = sq.groups[sq.control]!;
  t.survivors = evacSurvivors(sq);
  // 出来事（軽い順に取る＝同じフレームでは重い方が残る）
  if (t.event !== EVE_NONE && nowS >= f.untilS) t.event = EVE_NONE;
  if (!f.gunShown && w.arms && w.arms.aaRounds > 0) {
    f.gunShown = true;
    take(t, ev, nowS, EVE_GUN, sq.control, ev.gunN, 0, -1, false);
  }
  if (g.phase === G_HIDDEN && f.prevControl === sq.control && f.prevPhase !== G_HIDDEN) take(t, ev, nowS, EVE_HIDDEN, sq.control, 0, 0, g.shelter, false);
  f.prevControl = sq.control;
  f.prevPhase = g.phase;
  const fg = lowBit(f.found);
  if (fg >= 0) take(t, ev, nowS, EVE_FOUND, fg, 0, 0, sq.groups[fg]!.foundCover, false);
  if (w.arms && w.arms.evSeq !== f.armsSeq) {
    if (f.armsSeq >= 0 && w.arms.evCode === EV_DOWN_EVAC && ev.lastDownFlight >= 0) take(t, ev, nowS, EVE_DOWN, plan.flights[ev.lastDownFlight]!.target, w.arms.evN, 0, -1, false);
    f.armsSeq = w.arms.evSeq;
  }
  if (f.sinkKind > 0) take(t, ev, nowS, EVE_SINK, f.sinkGroup, t.survivors, f.sinkKind, -1, f.sinkTargeted);
  const lf = lowBit(f.lost);
  if (lf >= 0) take(t, ev, nowS, EVE_LOST, plan.flights[lf]!.target, 0, livePlanes(plan.flights[lf]!), -1, false);
  if (f.settle) take(t, ev, nowS, EVE_SETTLE, sq.control, t.survivors, 0, -1, false);
  // 予告の行（波の予告・予告し直し。予告から始まるまで）
  if (f.wave >= 0 || f.repass !== 0) {
    t.annKind = f.wave >= 0 ? EVA_WAVE : EVA_REPASS;
    t.annWave = f.wave >= 0 ? f.wave : plan.flights[lowBit(f.repass)]!.wave;
    t.annSeq++;
    let until = f.wave >= 0 ? plan.raid.waves[f.wave]!.announceS + plan.raid.announceLeadS : nowS;
    for (let i = 0; i < plan.flights.length; i++) if ((f.repass & (1 << i)) !== 0) until = Math.max(until, plan.flights[i]!.startS);
    f.annUntilS = until;
  }
  if (t.annKind !== EVA_NONE && nowS >= f.annUntilS) t.annKind = EVA_NONE;
  t.annCount = 0;
  t.annPlanes = 0;
  t.annNoTarget = 0;
  t.annLost = 0;
  t.annFlights = plan.raid.flights;
  if (t.annKind !== EVA_NONE) {
    for (let i = 0; i < plan.flights.length; i++) {
      const fl = plan.flights[i]!;
      if (fl.wave !== t.annWave) continue;
      if (t.annKind === EVA_WAVE && fl.outcome === EO_NO_TARGET) t.annNoTarget++;
      if (fl.phase !== EF_ANNOUNCED || (t.annKind === EVA_WAVE) !== (fl.passes === 0)) continue;
      if (t.annCount < EVAC_ANN_MAX) {
        // 狙った隊がいま隠れていれば始める時に見失う（入っている・上げている途中に狙われて隠れた隊。S8b: 「狙い」に並べない）
        if (sq.groups[fl.target]!.phase === G_HIDDEN) t.annLost |= 1 << t.annCount;
        t.annTargetPlanes[t.annCount] = livePlanes(fl);
        t.annTargets[t.annCount++] = fl.target;
      }
      if (t.annKind === EVA_REPASS) t.annPlanes += livePlanes(fl);
    }
    if (t.annKind === EVA_WAVE) t.annPlanes = plan.raid.waves[t.annWave]!.planes;
  }
  clearEvacFeed(f);
  // ほかの隊を座席へ入れた（［切替］・全滅の後の自動の切替。同じ隊の交代は latch を置き直さないので数えない）: 引き継いだ行を予告より上に（S8b）
  if (f.seatSeq !== t.seatSeq && sq.control !== t.control) f.takeUntilS = nowS + EVAC_TAKE_HOLD_S;
  t.seatSeq = f.seatSeq;
  t.takeHold = nowS < f.takeUntilS;
  // 操作中の隊と座席
  t.control = sq.control;
  t.latch = sq.latch;
  t.phase = g.phase;
  t.shelter = g.shelter;
  t.afloat = evacAfloat(g);
  t.hint = sq.hint;
  t.hintShelter = sq.hintShelter;
  t.hintFree = sq.hintShelter >= 0 ? sq.p.shelters[sq.hintShelter]!.slots - sq.shelterUsed[sq.hintShelter]! : 0;
  t.settled = sq.settled;
  t.hauling = g.phase === G_HAULING && g.hauling >= 0;
  let up = 0;
  for (let k = 0; k < t.hp.length; k++) {
    const b = g.boats[k];
    t.hp[k] = !b || b.sunk ? -1 : k === g.leader ? w.damage.hp : b.damage.hp;
    if (b && !b.sunk && b.up) up++;
  }
  t.upCount = up;
  let hidden = 0;
  for (let i = 0; i < sq.boats.length; i++) {
    const b = sq.boats[i]!;
    if (!b.sunk && (b.up || sq.groups[b.group]!.phase === G_HIDDEN)) hidden++;
  }
  t.hiddenBoats = hidden;
  t.nextWaveS = plan.nextWave < plan.raid.waves.length ? plan.raid.waves[plan.nextWave]!.announceS - nowS : NaN;
  t.leftS = Math.max(0, t.durationS - nowS);
  t.nextSwitch = evacNextSwitch(sq, f.order);
  // 近い隠れ場所（決着の前は空き枠 ≥ 浮いている隻数・見つかった陰でない。平方根は選んだ 1 つだけ）
  const seat = w.boat.state;
  let best = -1;
  let bestD2 = Infinity;
  for (let s = 0; s < sq.p.shelters.length; s++) {
    const sh = sq.p.shelters[s]!;
    if (!sq.settled && (sh.slots - sq.shelterUsed[s]! < t.afloat || s === g.foundCover)) continue;
    const dx = sh.x - seat.x;
    const dy = sh.y - seat.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      best = s;
      bestD2 = d2;
    }
  }
  t.near = best;
  const moving = g.phase !== G_ENTERING && g.phase !== G_HAULING && g.phase !== G_HIDDEN && g.phase !== G_GONE;
  if (best >= 0) {
    const sh = sq.p.shelters[best]!;
    t.nearFree = sh.slots - sq.shelterUsed[best]!;
    t.nearEdgeM = Math.max(0, Math.sqrt(bestD2) - sq.p.shelterRingM);
    t.nearDx = moving ? sh.x - seat.x : NaN;
    t.nearDy = moving ? sh.y - seat.y : NaN;
  } else {
    t.nearFree = 0;
    t.nearEdgeM = NaN;
    t.nearDx = NaN;
    t.nearDy = NaN;
  }
  // 操作中の隊を狙う爆弾の落下・燃えている操作していない隊長艇・狙われている隊と隊長艇の相対位置
  let falling = false;
  for (let i = 0; i < plan.flights.length && g.phase !== G_HIDDEN; i++) {
    const fl = plan.flights[i]!;
    if (fl.target === sq.control && evacFlightLive(fl) && strikeThreat(fl.port.state) === AS_T_FALLING) falling = true;
  }
  t.falling = falling;
  t.fireGroup = -1;
  let mask = 0;
  for (let gi = 0; gi < sq.groups.length; gi++) {
    const lead = evacLeader(sq.groups[gi]!);
    if (t.fireGroup < 0 && gi !== sq.control && lead && lead.damage.fireLeftS > 0 && lead.damage.hp > 0) t.fireGroup = gi;
    if (sq.targeted[gi]) mask |= 1 << gi;
    t.groupDx[gi] = lead ? lead.state.x - seat.x : NaN;
    t.groupDy[gi] = lead ? lead.state.y - seat.y : NaN;
  }
  t.targetedMask = mask;
  t.camDx = ev.camX - seat.x;
  t.camDy = ev.camY - seat.y;
}
