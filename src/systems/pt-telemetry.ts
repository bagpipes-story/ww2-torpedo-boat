// 敵の米PT（v0.6.3。docs/02 §6.4、spec §C.5・§D.4）の HUD 向けテレメトリと Result の材料。mission-telemetry から呼ぶ（dawn-telemetry と同じ形）。
// テレメトリの pt は createTelemetry で 1 回だけ作り（initPtTelemetry）、refreshPtTelemetry が毎フレーム 1 回だけ中身を書き換える（§7: 確保しない・平方根なし。
// 距離と方角は 2 行目を出すモードのときだけ ui/pt-lines の ptKey が求める）。米PT の無い任務は enabled false のまま何も書かない。
// 世界は構造の型 PtTelemetryWorld で読む（MissionWorld がそのまま満たす。MissionWorld を import すると Phaser がテストの node 型検査に入るため）。
// v0.6.3 実機 1 回目: T-14 の 13mm（状態・標的の距離・命中・弾倉の交換・出来事）、航過の上限は撃退・撃沈で減る（戦う PT の残り回数）、まだ戦う PT・沈めた数・航過中の PT が黙った。
import type { BoatState, SpeedStep } from '../core/boat-motion';
import { bearingJa } from '../core/briefing';
import { GUN_FIRING, type GunBatteryParams } from '../core/gun-battery';
import { PT_BREAK, PT_FATE_NONE, PT_FATE_SUNK, PT_LEAVE, createPtTelemetry, threatIndex, type PtParams, type PtSection, type PtTelemetry } from '../core/pt-boats';
import type { PtGunState } from '../core/pt-gun';
import { mpsToKt } from '../core/units';
import type { PtResult } from '../ui/result-types';

/** テレメトリと Result が読む世界の部分 */
export interface PtTelemetryWorld {
  /**
   * 米PT の隊（systems/pt-squadron。無い任務は null）: 隊・値・最初に見つかったときの速力帯・enemies.json の id、
   * 艇の 13mm（systems/pt-gun の状態と値。砲の無い任務は null）
   */
  readonly pts: {
    readonly section: PtSection;
    readonly p: PtParams;
    readonly firstDetectBand: SpeedStep | '';
    readonly enemyId: string;
    readonly gun: { readonly state: PtGunState; readonly g: GunBatteryParams } | null;
  } | null;
  readonly boat: { readonly state: BoatState };
  /** 艇の静音の上限（2 行目の「14 kt 以下に」） */
  readonly params: { readonly silentMaxMps: number };
  /** 自艇の視程の二乗（見えている PT だけ距離を出す） */
  readonly visRange2: number;
  /** 艇の最大 HP（Result の「HP −x」を沈んだ艇の HP より大きく言わない） */
  readonly damageParams: { readonly maxHp: number };
}

/** 出発時の pt（任務で決まる値: 隻数・1 発の HP・静音の上限 kt・去る方角、13mm の射程と有効射程。毎フレームは変えない） */
export function initPtTelemetry(w: PtTelemetryWorld): PtTelemetry {
  const t = createPtTelemetry();
  const s = w.pts;
  if (!s) return t;
  t.enabled = true;
  t.total = s.p.count;
  t.damagePerHit = s.p.hit.damage;
  t.silentMaxKt = Math.round(mpsToKt(w.params.silentMaxMps));
  t.leaveDirJa = bearingJa(s.p.leaveHeadingDeg);
  if (s.gun) {
    t.gunEnabled = true;
    t.gunRangeM = s.gun.g.rangeM;
    t.gunEffectiveM = s.gun.g.effectiveM;
  }
  refreshPtTelemetry(t, w);
  return t;
}

/**
 * 航過の上限（HUD の「航過 n/M」・Result）: 終わった航過 + 13mm の結末の無い PT の残りの回数。出撃時は隻数 × max_passes、撃退・撃沈でだけ減る
 * （撃退・撃沈が無ければ夜明けに去っても v0.6.3 と同じ 隻数 × max_passes。spec r1 §E.1 の式から「去っていない」を外した）。確保なし
 */
export function ptMaxPasses(q: PtSection, p: PtParams): number {
  let n = q.passes;
  for (let i = 0; i < q.boats.length; i++) {
    const b = q.boats[i]!;
    if (b.fate === PT_FATE_NONE) n += p.maxPasses - b.passes;
  }
  return n;
}

/** 毎フレーム 1 回: 隊の段階・航過・脅威の PT（core の threatIndex）の相対位置とそれが見えているか（距離二乗）、13mm の状態（距離は gun-battery が撃つときの 1 回の平方根） */
export function refreshPtTelemetry(t: PtTelemetry, w: PtTelemetryWorld): void {
  const s = w.pts;
  if (!s) return;
  const q = s.section;
  let alive = 0;
  let fighting = 0;
  for (let i = 0; i < q.boats.length; i++) {
    const b = q.boats[i]!;
    if (b.phase < PT_LEAVE) alive++;
    if (b.phase <= PT_BREAK && b.fate === PT_FATE_NONE) fighting++;
  }
  t.alive = alive;
  t.fighting = fighting;
  t.sunk = q.sunk;
  t.maxPasses = ptMaxPasses(q, s.p);
  t.passSilenced = q.owner >= 0 && q.boats[q.owner]!.fate !== PT_FATE_NONE;
  t.gunEventSeq = q.gunEventSeq;
  t.gunEvent = q.gunEvent;
  t.gunHits = q.gunHits;
  const g = s.gun ? s.gun.state : null;
  if (g) {
    t.gunStatus = g.battery.status;
    t.gunFast = g.battery.fast && g.battery.status === GUN_FIRING;
    t.gunTargetM = g.battery.targetM;
    t.gunEverFired = g.battery.shots > 0;
    t.reloadLeftS = g.reloadLeftS;
  }
  t.out = q.out;
  t.detected = q.detected;
  t.passing = q.owner >= 0;
  t.fired = q.owner >= 0 && q.boats[q.owner]!.firedThisPass > 0;
  t.dodge = q.owner >= 0 ? q.dodge : 0;
  t.escapeDeg = q.owner >= 0 ? q.escapeDeg : NaN;
  const b = w.boat.state;
  const i = threatIndex(q, b.x, b.y);
  const pt = i < 0 ? null : q.boats[i]!;
  t.threatPhase = pt ? pt.phase : -1;
  t.dx = pt ? pt.x - b.x : NaN;
  t.dy = pt ? pt.y - b.y : NaN;
  t.sighted = pt !== null && t.dx * t.dx + t.dy * t.dy <= w.visRange2;
  t.passes = q.passes;
  t.passSeq = q.passSeq;
  t.lastPassHits = q.lastPassHits;
  t.lastPassFired = q.lastPassFired;
  t.leftAtDawn = q.leftAtDawn;
}

/**
 * 終了時に 1 回だけ: MissionResult.pt（見つかった回数は世界の detect.count＝MissionResult.detections）。
 * 終わる瞬間に撃っていた航過（沈没・帰投が航過の途中）も航過・撃った航過に数え、その航過の命中が 0 なら無傷に数える
 * （その航過の命中は被弾に入っているので、数えないと沈んだ夜が「かわした 1/1 ・ 被弾 13 発」と出た）。隊の KPI（模擬が読む）は変えない
 */
export function ptResult(w: PtTelemetryWorld): PtResult | null {
  const s = w.pts;
  if (!s) return null;
  const q = s.section;
  let alive = 0;
  // 撃退した PT は今の結末で数える（航過を抜けるところで沈んだ PT は撃沈だけに。隊の KPI q.retired は模擬のまま）
  let retired = 0;
  for (let i = 0; i < q.boats.length; i++) {
    const b = q.boats[i]!;
    if (b.phase < PT_LEAVE) alive++;
    if (b.fate !== PT_FATE_NONE && b.fate !== PT_FATE_SUNK) retired++;
  }
  const open = q.owner >= 0 && q.boats[q.owner]!.firedThisPass > 0 ? 1 : 0;
  const g = s.gun ? s.gun.state : null;
  return {
    enemyId: s.enemyId,
    total: s.p.count,
    out: q.out,
    alive,
    leftAtDawn: q.leftAtDawn,
    passes: q.passes + open,
    maxPasses: ptMaxPasses(q, s.p),
    firedPasses: q.firedPasses + open,
    cleanPasses: q.cleanPasses + (open === 1 && q.passHits === 0 ? 1 : 0),
    shots: q.shots,
    hits: q.hits,
    damagePerHit: s.p.hit.damage,
    hpMax: w.damageParams.maxHp,
    firstDetectM: q.firstDetectM,
    firstDetectBand: s.firstDetectBand,
    lostContacts: q.lostContacts,
    closestM: Math.sqrt(q.closest2),
    minWarnS: q.minWarnS,
    gunEnabled: g !== null,
    gunShots: g ? g.battery.shots : 0,
    gunHits: q.gunHits,
    retired,
    sunk: q.sunk,
    flashFirst: q.flashFirst,
  };
}
