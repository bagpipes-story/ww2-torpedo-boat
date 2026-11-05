// 空襲下の退避（v0.6.11。jp_03。spec-v0611-r2 §3.6）の隠れ場所の段: 入る（輪の中・hide_max 以下・空き枠 ≥ 浮いている隻数）→ 取りやめ／僚艇が枠の点に着く →
// 壕はレール 1 本で 1 隻ずつ上げる（僚艇の番号の大きい順・隊長艇は最後・haul_s ずつ）・陰はそのまま隠れる → 出る（壕は入口から縦列・艇首は data の exit_heading_deg）・
// 上げるのをやめて下ろす（r2 M12 (c)）、陰の発見（予告ごとに陰の順に seed+29 から 1 回ずつ）と見つかった後の離脱・見つかった陰に入り直せない（r2 M14）、
// 隊長艇の交代（隠れ場所の中の規則 r2 M12 (a)(b)）・僚艇の沈没。Phaser 非依存・確保しない。秒は実秒。
import { nextSpeedBand } from './boat-motion';
import { G_ENTERING, G_FOUND, G_GONE, G_HAULING, G_HIDDEN, G_UNDERWAY, SHELTER_CAVE, SHELTER_COVER } from './evac-data';
import { evacWingmenArrived } from './evac-follow';
import {
  EVAC_HINT_FOUND, EVAC_HINT_FULL, EVAC_HINT_NONE, evacAfloat, evacColumnPoint, evacInRing, evacLeader, evacReleaseShelter, evacReslot, evacSetHold, evacShelterAt, evacTrailReset,
  type EvacBoat, type EvacGroup, type EvacSquadron,
} from './evac-squadron';
import type { SeededRng } from './rng';
import { bearingDeg } from './ship-ai';


/** 次に上げる艇の番号: 僚艇の番号の大きい順、隊長艇は最後（M5）。浮いている艇がみな上がっていれば −1 */
export function evacNextHaul(g: EvacGroup): number {
  for (let s = g.boats.length - 1; s >= 0; s--) {
    const b = g.boats[s]!;
    if (s !== g.leader && !b.sunk && !b.up) return s;
  }
  const lead = evacLeader(g);
  return lead && !lead.up ? g.leader : -1;
}

/** 上げる艇を決め直す（上がった・沈んだ後）。替われば haul_s から数え直す。みな上がっていれば G_HIDDEN */
export function evacHaulAdvance(g: EvacGroup, haulS: number): void {
  const s = evacNextHaul(g);
  if (s < 0) {
    g.phase = G_HIDDEN;
    g.hauling = -1;
    return;
  }
  if (s !== g.hauling) {
    g.hauling = s;
    g.haulLeftS = haulS;
  }
}

/** 艇の記録を沈没にする（HP 0・火災なし・止まる） */
export function evacMarkSunk(b: EvacBoat, nowS: number): void {
  b.sunk = true;
  b.sunkAtS = nowS;
  b.damage.hp = 0;
  b.damage.fireLeftS = 0;
  b.state.speedMps = 0;
}

/** 僚艇の沈没（HP だけの艇）: 枠を取り直し、上げている艇なら次へ（残りがみな上がっていれば G_HIDDEN） */
export function evacSinkWingman(sq: EvacSquadron, b: EvacBoat, nowS: number): void {
  const g = sq.groups[b.group]!;
  evacMarkSunk(b, nowS);
  evacReslot(sq, g);
  if (g.phase === G_HAULING) evacHaulAdvance(g, sq.p.haulS);
}

/**
 * 隊長艇の記録が沈んだ後の交代（記録の側だけ。座席・編隊・HUD は core/evac-seat の evacSinkLeader）。新しい隊長艇＝浮いている最小の番号。
 * 隠れ場所の中（r2 M12）: (a) 上げている隊で浮いている艇がみな上がっていれば G_HIDDEN、(b) 入っている隊は枠を取り直し、新しい隊長艇が輪の外なら取りやめ・輪の中なら止める（入るのを続ける）。
 * 航跡は新しい隊長艇の艇尾方向で満たし直し、帯はその時の速さで決める。全滅なら枠を返して G_GONE。新しい隊長艇の番号（全滅は −1）を返す
 */
export function evacPromote(sq: EvacSquadron, g: EvacGroup): number {
  let nl = -1;
  for (let s = 0; s < g.boats.length; s++) {
    if (!g.boats[s]!.sunk) {
      nl = s;
      break;
    }
  }
  g.leader = nl;
  if (nl < 0) {
    evacReleaseShelter(sq, g);
    g.phase = G_GONE;
    return -1;
  }
  evacReslot(sq, g);
  const lead = g.boats[nl]!;
  // 僚艇は帯を回していない（HP だけ）。隊長艇になった瞬間の速さで決める（座席へ入れる帯）
  lead.band = nextSpeedBand(lead.band, lead.state.speedMps, lead.params);
  if (g.phase === G_HAULING) evacHaulAdvance(g, sq.p.haulS);
  if (g.phase === G_HAULING || g.phase === G_HIDDEN) evacSetHold(g);
  else if (g.phase === G_ENTERING) {
    if (!evacInRing(sq, g.shelter, lead.state.x, lead.state.y)) {
      evacReleaseShelter(sq, g);
      g.phase = G_UNDERWAY;
    } else lead.state.speedMps = 0; // 枠の点へ寄っていた僚艇の速さを持ち越さない（v0.6.11 S8。操作中なら次のステップに取りやめ、操作していなければ止まった艇の先を爆弾が狙った）
  }
  evacTrailReset(g, sq.p.trailStepM);
  return nl;
}

/**
 * 操作中の隊が入り始める: 隊長艇が輪の中（縁ちょうどは中）で hide_max 以下、その場所の空き枠 ≥ 隊の浮いている隻数なら G_ENTERING（枠を取っておく）。
 * 足りなければ札「満杯」、その波で見つかった陰なら札「見つかった」（輪の外へ出るまで入れない）。決着の後は枠を数えない（帰投の判定は evacSeatHome）
 */
export function evacTryEnter(sq: EvacSquadron): void {
  sq.hint = EVAC_HINT_NONE;
  sq.hintShelter = -1;
  const g = sq.groups[sq.control]!;
  const lead = evacLeader(g);
  if (sq.settled || g.phase !== G_UNDERWAY || !lead) return;
  const s = evacShelterAt(sq, lead.state.x, lead.state.y);
  if (s < 0) return;
  if (s === g.foundCover) {
    sq.hint = EVAC_HINT_FOUND;
    sq.hintShelter = s;
    return;
  }
  if (lead.state.speedMps > sq.p.hideMaxMps || g.launched) return;
  const need = evacAfloat(g);
  if (sq.p.shelters[s]!.slots - sq.shelterUsed[s]! < need) {
    sq.hint = EVAC_HINT_FULL;
    sq.hintShelter = s;
    return;
  }
  sq.shelterUsed[s] = sq.shelterUsed[s]! + need;
  g.shelter = s;
  g.slotsHeld = need;
  g.phase = G_ENTERING;
}

/** 出る・上げるのをやめて下ろす: 壕は浮いている全員が入口（隠れ場所の中心）から縦列（moored_gap_m・隊長艇が先頭）、艇首は exit_heading_deg。陰はその場から。枠を返して G_UNDERWAY */
export function evacLaunch(sq: EvacSquadron, g: EvacGroup): void {
  const sh = sq.p.shelters[g.shelter];
  if (sh && sh.kind === SHELTER_CAVE) {
    let k = 0;
    for (let i = -1; i < g.boats.length; i++) {
      const s = i < 0 ? g.leader : i;
      const b = g.boats[s];
      if (!b || b.sunk || (i >= 0 && s === g.leader)) continue;
      evacColumnPoint(b.state, sh.x, sh.y, sh.exitHeadingDeg, k++, sq.p.mooredGapM);
      b.state.headingDeg = sh.exitHeadingDeg;
      b.state.speedMps = 0;
      b.up = false;
    }
  }
  evacReleaseShelter(sq, g);
  g.phase = G_UNDERWAY;
  g.launched = true;
  evacTrailReset(g, sq.p.trailStepM);
}

/** 予告の瞬間の陰の発見: 陰の順に必ず 1 回ずつ引き（隠れている隊がいなくても）、u < chance ならその陰に隠れている隊を G_FOUND に。見つかった隊の番号のビットを返す */
export function evacRevealCovers(sq: EvacSquadron, rng: SeededRng, chance: number): number {
  let found = 0;
  for (let s = 0; s < sq.p.shelters.length; s++) {
    if (sq.p.shelters[s]!.kind !== SHELTER_COVER) continue;
    if (!(rng.next() < chance)) continue;
    for (let gi = 0; gi < sq.groups.length; gi++) {
      const g = sq.groups[gi]!;
      if (g.phase !== G_HIDDEN || g.shelter !== s) continue;
      g.phase = G_FOUND;
      g.foundCover = s;
      g.foundLeftS = sq.p.foundReactS;
      found |= 1 << gi;
    }
  }
  return found;
}

/** 見つかった隊が陰を出る（枠を返す。航跡を満たし直す）。操作していない隊は港の中心へ全速（次の pick から回避） */
function leaveFound(sq: EvacSquadron, g: EvacGroup): void {
  evacReleaseShelter(sq, g);
  g.phase = G_UNDERWAY;
  evacTrailReset(g, sq.p.trailStepM);
  const lead = evacLeader(g)!;
  if (g.index === sq.control) return;
  g.aiHeadingDeg = bearingDeg(lead.state.x, lead.state.y, sq.cfg.bounds.width / 2, sq.cfg.bounds.height / 2);
  g.aiSpeed01 = 1;
  g.dodgeLeftS = 0;
}

/**
 * 隠れ場所の段を 1 ステップ（全隊。操作中の隊の入り始めが先）: 入っている隊は取りやめ（操作中の隊長艇が hide_max を超えた・輪の外）か、僚艇が着けば
 * 壕は G_HAULING・陰は G_HIDDEN、上げている隊は実秒で上げ、見つかった隊は操作していなければ found_react_s で陰を出る（操作中なら動かせば出る）。
 * 見つかった陰の印は隊長艇がその輪の外へ出た時に消す。出た・下ろした隊は隊長艇が hide_max を超えるまで入らない（出た同じステップに入り直さない）
 */
export function evacStepShelters(sq: EvacSquadron, realDt: number): void {
  const p = sq.p;
  for (let gi = 0; gi < sq.groups.length; gi++) {
    const g = sq.groups[gi]!;
    const lead = evacLeader(g);
    if (g.launched && lead && lead.state.speedMps > p.hideMaxMps) g.launched = false;
  }
  evacTryEnter(sq);
  for (let gi = 0; gi < sq.groups.length; gi++) {
    const g = sq.groups[gi]!;
    const lead = evacLeader(g);
    if (!lead) continue;
    if (g.phase === G_ENTERING) {
      if (gi === sq.control && (lead.state.speedMps > p.hideMaxMps || !evacInRing(sq, g.shelter, lead.state.x, lead.state.y))) {
        evacReleaseShelter(sq, g);
        g.phase = G_UNDERWAY;
      } else if (evacWingmenArrived(sq, g)) {
        evacSetHold(g);
        if (p.shelters[g.shelter]!.kind === SHELTER_CAVE) {
          g.phase = G_HAULING;
          g.hauling = -1;
          evacHaulAdvance(g, p.haulS);
        } else g.phase = G_HIDDEN;
      }
    } else if (g.phase === G_HAULING) {
      g.haulLeftS -= realDt;
      while (g.phase === G_HAULING && g.hauling >= 0 && g.haulLeftS <= 0) {
        const b = g.boats[g.hauling]!;
        b.up = true;
        b.state.speedMps = 0;
        const carry = g.haulLeftS;
        g.hauling = -1;
        evacHaulAdvance(g, p.haulS);
        g.haulLeftS += carry;
      }
    } else if (g.phase === G_FOUND) {
      if (gi === sq.control) {
        // 動かせば出る: hide_max を超えた・輪の外へ出た（v0.6.11 S8。2 kt 以下で這い出ると僚艇を陰に残したまま G_FOUND で離れた）
        if (lead.state.speedMps > p.hideMaxMps || !evacInRing(sq, g.shelter, lead.state.x, lead.state.y)) leaveFound(sq, g);
      } else {
        g.foundLeftS -= realDt;
        if (g.foundLeftS <= 0) leaveFound(sq, g);
      }
    }
    if (g.foundCover >= 0 && g.phase !== G_FOUND && !evacInRing(sq, g.foundCover, lead.state.x, lead.state.y)) g.foundCover = -1;
  }
}
