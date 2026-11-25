// 救助の任務のテレメトリ（v0.8.5 S2。us_07。spec-v0850 §7 S2 の「テレメトリは S4 の HUD が読める形に」）: createTelemetry で 1 回作り（rescueTelemetryPart）、毎フレーム refreshTelemetry の中で
// 1 回だけ写す（§7: 確保しない・平方根なし）。setup.rescue の無い任務は rescue の鍵ごと出ない。PT の隊の HUD の名（ptNamesPart）は記録に name_short_ja のある隊だけ（us_07 の S ボート）。
// 世界・AI には何も書かない（読むだけ）。Phaser 非依存・乱数なし。文は S4（ui/rescue-lines・rescue-texts・rescue-result）。
import { MINE_NONE } from '../core/minefield';
import { nearestRescueGroup } from '../core/rescue';
import type { PtNames, RescueTelemetry } from '../core/rescue-telemetry';
import type { PtLook } from '../config/pt-look-data';
import type { WorldRescue } from './world-rescue';

/** 読む世界の部分（MissionWorld がそのまま満たす） */
export interface RescueTelemetryWorld {
  readonly rescue: WorldRescue | null;
  readonly boat: { readonly state: { readonly x: number; readonly y: number } };
  readonly pts: { readonly look: PtLook } | null;
}

/** 出発時の rescue（救助の任務だけ鍵が出る） */
export function rescueTelemetryPart(w: RescueTelemetryWorld): { rescue?: RescueTelemetry } {
  const r = w.rescue;
  if (!r) return {};
  const p = r.rules;
  let total = 0;
  for (const g of p.groups) total += g.count;
  const t: RescueTelemetry = {
    capacity: p.capacity, objective: p.objectiveDelivered, total, fitchJa: p.fitch.labelJa, corryJa: p.corry.labelJa, fitchRingM: p.fitch.ringM, pickupMaxKt: p.pickupMaxKt, coverM: p.fitch.coverM,
    aboard: 0, delivered: 0, deliveredAtReturn: 0, onWater: 0, lostShell: 0, byOthers: 0, lostSunk: 0, objectiveReached: false, timeUp: false, picking: false, transferring: false,
    pickSeq: 0, pickRun: 0, transferSeq: 0, transferRun: 0, shellSeq: 0, nearDx: NaN, nearDy: NaN, nearCount: 0, fitchDx: 0, fitchDy: 0,
    minesSeen: 0, minesBlown: 0, mineSeenSeq: 0, mineDx: NaN, mineDy: NaN, mineBlowSeq: 0, sboatRetreated: 0, sboatRetreatSeq: 0, sboatCovered: 0,
  };
  refreshRescueTelemetry(t, w);
  return { rescue: t };
}

/** 記録に name_short_ja のある PT の隊だけ ptNames（無い隊・PT の無い任務は {}＝今のテレメトリのまま） */
export function ptNamesPart(w: Pick<RescueTelemetryWorld, 'pts'>): { ptNames?: PtNames } {
  const l = w.pts ? w.pts.look : null;
  return l && l.named ? { ptNames: { nameJa: l.nameJa, sunkJa: l.sunkJa } } : {};
}

/** 毎フレーム 1 回（鍵の無い任務は何もしない） */
export function refreshRescueTelemetry(t: RescueTelemetry | undefined, w: RescueTelemetryWorld): void {
  const r = w.rescue;
  if (!t || !r) return;
  const st = r.state;
  const b = w.boat.state;
  t.aboard = st.aboard;
  t.delivered = st.delivered;
  t.deliveredAtReturn = st.deliveredAtReturn;
  let left = 0;
  for (let i = 0; i < st.n; i++) left += st.left[i]!;
  t.onWater = left;
  t.lostShell = st.lostShell;
  t.byOthers = st.byOthers;
  t.lostSunk = st.lostSunk;
  t.objectiveReached = st.objectiveReached;
  t.timeUp = st.timeUp;
  t.picking = st.pickGroup >= 0;
  t.transferring = st.transferring;
  t.pickSeq = st.pickSeq;
  t.pickRun = st.pickRun;
  t.transferSeq = st.transferSeq;
  t.transferRun = st.transferRun;
  t.shellSeq = st.shellSeq;
  const g = nearestRescueGroup(st, b.x, b.y, Infinity);
  t.nearDx = g < 0 ? NaN : st.gx[g]! - b.x;
  t.nearDy = g < 0 ? NaN : st.gy[g]! - b.y;
  t.nearCount = g < 0 ? 0 : st.left[g]!;
  t.fitchDx = r.rules.fitch.x - b.x;
  t.fitchDy = r.rules.fitch.y - b.y;
  const m = r.mines;
  if (m) {
    t.minesSeen = m.seen;
    t.minesBlown = m.blown;
    t.mineSeenSeq = m.seenSeq;
    const k = m.lastSeen;
    t.mineDx = k >= 0 && m.state[k] !== MINE_NONE ? m.x[k]! - b.x : NaN;
    t.mineDy = k >= 0 && m.state[k] !== MINE_NONE ? m.y[k]! - b.y : NaN;
    t.mineBlowSeq = m.blowSeq;
  }
  const c = r.cover;
  if (c) {
    t.sboatRetreated = c.count;
    t.sboatRetreatSeq = c.seq;
    let n = 0;
    for (let i = 0; i < c.inS.length; i++) if (c.inS[i]! > 0) n++;
    t.sboatCovered = n;
  }
}
