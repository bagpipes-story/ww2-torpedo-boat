// 停泊して揚陸する輸送船を守る模擬（core/landing-sim）の 1 夜の記録（v0.6.9 S3。spec-v069 §8 の表の列・I1〜I6・R2・R4。pt-trial・convoy-trial と同じ分け方）。Phaser 非依存。
// 確保は 1 夜の始めに 1 回だけ（PT ごとの列は隻数の長さ）。記録の道具（landing-sim が 300 行を超えないため）: LandingTrialWatch は PT ごとの見張りの条件・哨戒の出入り・斉射（I1〜I4）、
// LandingTrialTorpedoes は敵の魚雷のプール（世界の写し）・LandingTorpedoLink・測るだけの影のプール（いつも浮いている同じ船体へ同じ魚雷。斉射の当たりうる本数）と、その決着を記録へ書く口。
// 夜の終わりに finishLandingTrial が隊・輸送船・自艇の結果を写す。
import type { SeaBounds } from './boat-motion';
import { LANDING_REPORT_TOWARD_DEG, LD_UNLOADING, type LandingState } from './landing';
import type { LandingParams } from './landing-data';
import { LandingTorpedoLink, LandingTorpedoPool, type SalvoBook } from './landing-torpedoes';
import { PT_PATROL, type PtSection } from './pt-boats';
import { bearingDeg } from './ship-ai';
import type { TorpedoParams, TorpedoState } from './torpedo';
import type { TorpedoEvents, TorpedoTarget } from './torpedo-targets';
import { wrapDeg180 } from './units';

export type LandingTrialEnd = 'home' | 'sunk' | 'adrift' | 'timeout';

/** 斉射の種類（core/pt-torpedo の PT_SALVO_CALM・PT_SALVO_HURRIED と同じ値。pt-torpedo を import するのは landing-sim だけ＝tests/landing-imports） */
const SALVO_CALM = 1;
const SALVO_HURRIED = 2;

export interface LandingTrial {
  /** 終わり方（輪に入った・沈んだ・燃料 0 で止まった・夜明け + 打ち切りの秒）と秒、夜明けが来た */
  end: LandingTrialEnd; timeS: number; dawn: boolean;
  /** 輸送船（core/landing の LD_*・割合・被雷・不発の命中・揚陸の後に沈んだ）と決着の秒（揚陸完了か沈み始め。無ければ NaN） */
  phase: number; pct: number; hits: number; duds: number; sunkAfterDone: boolean; resolvedS: number;
  /** R4: 決着の前に「燃料少」（巡航で輪の縁まで × call_margin）が立った秒（NaN は無し）・決着の前に輪に入った */
  fuelCallS: number; ringEarly: boolean;
  /** 自艇: 失った HP・被弾・残りの燃料 %、見つかった秒（NaN は無し）・捉えられた回数・見失わせた回数 */
  hpLost: number; playerHits: number; fuelPct: number; detectS: number; contacts: number; lostContacts: number;
  /** 25mm: 発射・PT への命中・撃退・撃沈（隊の数え） */
  gunShots: number; gunHits: number; ptRetired: number; ptSunk: number;
  /** 見張りの報告の最初の秒（遠い・近いどちらでも）と近い報告の最初の秒（NaN は無し） */
  reportS: number; nearReportS: number;
  /**
   * PT ごと（線の順）: 雷撃の結末（core/pt-torpedo の OUT_*）、斉射の種類（PT_SALVO_*）・時刻・距離 m、斉射の後に輸送船が浮いている間に決着した本数・その命中（不発を除く）・不発の命中、
   * 影の魚雷の命中（不発を除く）・不発、揚陸に効く斉射（発射の秒 + 距離 ÷ 魚雷の速さ < unload_s）
   */
  outcome: Uint8Array; kind: Uint8Array; launchS: Float64Array; launchM: Float64Array;
  arrived: Uint8Array; arrivedHits: Uint8Array; arrivedDuds: Uint8Array; potHits: Uint8Array; potDuds: Uint8Array; relevant: Uint8Array;
  /** I1: 初めての接近の気づかれていない斉射の、その PT が報告の条件を満たし始めてからの最短秒（無ければ Infinity）。I2: 見失って哨戒に戻ってから斉射までの最短秒（無ければ Infinity） */
  i1LeadS: number; i2LeadS: number;
  /** I3: 夜明けの後の斉射・I4: 1 隻の斉射の最大・I5: seed+26 から引いた回数と斉射ごとの 1 + 2n + 蛇行の本数の和・I6: 夜明けに揚陸が決着していなかった */
  afterDawnSalvos: number; maxSalvosPerPt: number; draws26: number; drawsWant: number; unresolvedAtDawn: boolean;
}

export function createLandingTrial(count: number): LandingTrial {
  return {
    end: 'timeout', timeS: 0, dawn: false, phase: 0, pct: 0, hits: 0, duds: 0, sunkAfterDone: false, resolvedS: NaN, fuelCallS: NaN, ringEarly: false,
    hpLost: 0, playerHits: 0, fuelPct: 0, detectS: NaN, contacts: 0, lostContacts: 0, gunShots: 0, gunHits: 0, ptRetired: 0, ptSunk: 0, reportS: NaN, nearReportS: NaN,
    outcome: new Uint8Array(count), kind: new Uint8Array(count), launchS: new Float64Array(count).fill(NaN), launchM: new Float64Array(count).fill(NaN),
    arrived: new Uint8Array(count), arrivedHits: new Uint8Array(count), arrivedDuds: new Uint8Array(count), potHits: new Uint8Array(count), potDuds: new Uint8Array(count), relevant: new Uint8Array(count),
    i1LeadS: Infinity, i2LeadS: Infinity, afterDawnSalvos: 0, maxSalvosPerPt: 0, draws26: 0, drawsWant: 0, unresolvedAtDawn: false,
  };
}

/** PT ごとの見張りの条件・哨戒の出入り・斉射（I1〜I4 の材料。1 夜に 1 個） */
export class LandingTrialWatch {
  /** 報告の条件（哨戒・斉射が残る・見張りの内・輸送船へ向かう）を満たし始めた秒・哨戒の外に出たことがある・見失って哨戒に戻った秒・斉射の数 */
  private readonly eligibleS: Float64Array;
  private readonly everOut: Uint8Array;
  private readonly reenterS: Float64Array;
  private readonly salvos: Uint8Array;

  constructor(count: number) {
    this.eligibleS = new Float64Array(count).fill(NaN);
    this.everOut = new Uint8Array(count);
    this.reenterS = new Float64Array(count).fill(NaN);
    this.salvos = new Uint8Array(count);
  }

  /** 凍結の隊の後・雷撃の前（prevPhase は雷撃の状態の前のステップの終わりの段階）: 哨戒の外に出た・見失って哨戒に戻った */
  afterSection(q: PtSection, prevPhase: Uint8Array, t: number): void {
    for (let i = 0; i < q.boats.length; i++) {
      if (q.boats[i]!.phase !== PT_PATROL) this.everOut[i] = 1;
      else if (prevPhase[i] !== PT_PATROL) this.reenterS[i] = t;
    }
  }

  /** 斉射を撃ち終えた（PtTorpedoSink.onSalvo） */
  salvo(out: LandingTrial, i: number, hurried: boolean, rangeM: number, t: number, dawn: boolean): void {
    out.kind[i] = hurried ? SALVO_HURRIED : SALVO_CALM;
    out.launchS[i] = t;
    out.launchM[i] = rangeM;
    this.salvos[i]!++;
    if (this.salvos[i]! > out.maxSalvosPerPt) out.maxSalvosPerPt = this.salvos[i]!;
    if (dawn) out.afterDawnSalvos++;
    const e = this.eligibleS[i]!;
    if (!hurried && this.everOut[i] === 0) out.i1LeadS = Math.min(out.i1LeadS, Number.isNaN(e) ? -Infinity : t - e);
    if (!Number.isNaN(this.reenterS[i]!)) out.i2LeadS = Math.min(out.i2LeadS, t - this.reenterS[i]!);
  }

  /** ステップの終わり: 報告の条件を初めて満たした（I1。core/landing の landingReport の条件を PT ごとに） */
  endStep(q: PtSection, left: Uint8Array, lp: LandingParams, t: number): void {
    for (let i = 0; i < q.boats.length; i++) {
      const b = q.boats[i]!;
      if (!Number.isNaN(this.eligibleS[i]!) || b.phase !== PT_PATROL || left[i] !== 1) continue;
      const d2 = (lp.x - b.x) * (lp.x - b.x) + (lp.y - b.y) * (lp.y - b.y);
      if (d2 <= lp.lookout2 && Math.abs(wrapDeg180(b.headingDeg - bearingDeg(b.x, b.y, lp.x, lp.y))) <= LANDING_REPORT_TOWARD_DEG) this.eligibleS[i] = t;
    }
  }
}

/** プールの中の添字（≤ 9 本を走査） */
function slotOf(states: readonly TorpedoState[], s: TorpedoState): number {
  for (let k = 0; k < states.length; k++) if (states[k] === s) return k;
  return -1;
}

/**
 * 1 夜の敵の魚雷: 世界と同じプール（core/landing-torpedoes の写し）と LandingTorpedoLink、影のプール（同じ順に撃つので添字は同じ。乱数を引かず世界に触らない）。
 * ev はプールの決着（輸送船が浮いている間に決着した本数を数えてから link へ）、shadowEv は影の当たり。shipHulls は輸送船、shadowHulls はいつも浮いている同じ船体
 */
export class LandingTrialTorpedoes {
  readonly pool: LandingTorpedoPool;
  readonly shadow: LandingTorpedoPool;
  readonly link: LandingTorpedoLink;
  readonly shipHulls: readonly TorpedoTarget[];
  readonly shadowHulls: readonly TorpedoTarget[];
  readonly ev: TorpedoEvents;
  readonly shadowEv: TorpedoEvents;
  /** 蛇行の本数（I5） */
  erratic = 0;
  private readonly boatOf: Int8Array;

  constructor(ld: LandingState, lp: LandingParams, book: SalvoBook, params: TorpedoParams, capacity: number, bounds: SeaBounds, out: LandingTrial) {
    this.pool = new LandingTorpedoPool(params, capacity, bounds);
    this.shadow = new LandingTorpedoPool(params, capacity, bounds);
    this.link = new LandingTorpedoLink(ld, lp, book, this.pool);
    this.boatOf = new Int8Array(capacity).fill(-1);
    this.shipHulls = [ld];
    this.shadowHulls = [{ circles: ld.circles, state: ld.state, out: false, sinking: false, sunk: false, sinkStartS: NaN }];
    const boatAt = (states: readonly TorpedoState[], s: TorpedoState): number => {
      const k = slotOf(states, s);
      return k >= 0 ? this.boatOf[k]! : -1;
    };
    this.ev = {
      onHit: (k, x, y, s) => {
        const i = boatAt(this.pool.states, s);
        if (i >= 0) {
          out.arrived[i]!++;
          if (s.dud) out.arrivedDuds[i]!++;
          else out.arrivedHits[i]!++;
        }
        this.link.onHit(k, x, y, s);
      },
      onLateHit: () => {},
      onMiss: (s) => {
        const i = ld.afloat ? boatAt(this.pool.states, s) : -1;
        if (i >= 0) out.arrived[i]!++;
        this.link.onMiss(s);
      },
    };
    this.shadowEv = {
      onHit: (_k, _x, _y, s) => {
        const i = boatAt(this.shadow.states, s);
        if (i >= 0 && s.dud) out.potDuds[i]!++;
        else if (i >= 0) out.potHits[i]!++;
      },
      onLateHit: () => {}, onMiss: () => {},
    };
  }

  /** PtTorpedoSink.fire の中身: 本物のプール（link）と影へ同じ 1 本 */
  fire(i: number, x: number, y: number, h: number, dud: boolean, erratic: boolean, bias: number, rangeM: number): void {
    const k = this.pool.capacity - this.pool.remaining;
    this.link.fire(i, x, y, h, dud, erratic, bias, rangeM);
    this.shadow.fire(x, y, h, dud, erratic, bias, rangeM);
    if (k < this.pool.capacity) this.boatOf[k] = i;
    if (erratic) this.erratic++;
  }

  /** 夜の終わり: 影の魚雷がみな決着するまで（終わりに走っている斉射の当たりうる本数も数える。本物は捨てる＝世界と同じ） */
  settleShadow(dt: number, realDt: number, passRadius2: number, maxSteps: number): void {
    for (let k = 0; k < maxSteps && this.shadow.states.some((s) => s.active && !s.resolved); k++) this.shadow.step(dt, realDt, this.shadowHulls, passRadius2, this.shadowEv);
  }
}

/** 夜の終わり: 時刻・夜明け・輸送船（ld）・隊の KPI（q）・失った HP・残りの燃料 %・25mm の撃った数・seed+26 から引いた回数を写す */
export function finishLandingTrial(out: LandingTrial, q: PtSection, ld: LandingState, t: number, dawn: boolean, hpLost: number, fuelPct: number, gunShots: number, draws26: number): LandingTrial {
  Object.assign(out, {
    timeS: t, dawn, phase: ld.phase, pct: ld.pct, hits: ld.hits, duds: ld.duds, sunkAfterDone: ld.sunkAfterDone, ringEarly: out.end === 'home' && ld.phase === LD_UNLOADING,
    hpLost, fuelPct, lostContacts: q.lostContacts, gunShots, gunHits: q.gunHits, ptRetired: q.retired, ptSunk: q.sunk, draws26,
  });
  return out;
}
