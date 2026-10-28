// 米PT の魚雷（2 つ目のプール。v0.6.9。jp_04。docs/02 §6.11、spec-v069 §4.3・D12・R8/F16）の Phaser 非依存の部分: 模擬の魚雷のプール（systems/torpedo-pool の写し）と、
// 雷撃（core/pt-torpedo の入れ先）・魚雷の決着（TorpedoEvents）を輸送船（core/landing）と斉射の数え（PtTorpedoState の salvo*）へつなぐ LandingTorpedoLink（世界と模擬が同じものを使う）。
// stepLandingTorpedoes は systems/torpedo-pool.ts:86-118 の TorpedoPool.step と 1 手ずつ同じ順（stepTorpedo → 射程か海域の外 → onMiss → scanTargets（終わり際の当たりは見ない＝NaN）
// → 命中 → 通り過ぎ）。雷跡の点は絵だけなので置かない（nextWakeAtM は他に読まれない）。プールは自艇の魚雷（w.torpedoes・KPI・終わりの待ち）に触らない。
// R14 A3（S6a-fix）: 同じステップの同じ種類の斉射は 1 つの出来事に足す（「米PT 2 隻が慌てて発射！ 輸送船へ 6 本」）、外れ・不発の出来事はプールにまだ決着していない魚雷が無いときだけ
// （ほかの斉射が走っている間に「それた！ 輸送船は無事」と言わない。残りは雷跡の行が数える）。
// Phaser 非依存・毎ステップ確保しない（状態・走査の書き先・PT の添字は組み立てで 1 回）。
import type { SeaBounds } from './boat-motion';
import { hitLanding, landingEvent, LANDING_SUNK, LE_CALM, LE_DUD, LE_ENGAGED, LE_HIT, LE_HURRIED, LE_MISS, LE_SUNK, LE_SUNK_DONE, type LandingState } from './landing';
import type { LandingParams } from './landing-data';
import { createTorpedoState, isArmed, launchTorpedo, markMissIfPassed, stepTorpedo, type TorpedoParams, type TorpedoState } from './torpedo';
import { createTargetScan, scanTargets, type TorpedoEvents, type TorpedoTarget } from './torpedo-targets';

/** 走査の書き先（module に 1 個。毎ステップ確保しない） */
const SCAN = createTargetScan();

/** 斉射の種類（core/pt-torpedo の PT_SALVO_HURRIED・PT_SALVO_ENGAGED と同じ値。ここは pt-torpedo を import しない＝tests/landing-imports。値の一致は tests/pt-torpedo） */
const SALVO_HURRIED = 2;
const SALVO_ENGAGED = 3;

/**
 * 模擬の固定ステップ（TorpedoPool.step の写し。late hit は無し）。dt は time_scale 込みの秒、realDt は実時間（蛇行の位相）。hulls は輸送船（沈み始めれば out＝当たらず通り過ぎも見ない）、
 * passRadius2 は通り過ぎの判定の半径の二乗（LandingParams.passRadius2）
 */
export function stepLandingTorpedoes(states: readonly TorpedoState[], params: TorpedoParams, bounds: SeaBounds, hulls: readonly TorpedoTarget[], passRadius2: number, ev: TorpedoEvents, dt: number, realDt: number): void {
  for (let i = 0; i < states.length; i++) {
    const s = states[i]!;
    if (!s.active) continue;
    const expired = stepTorpedo(s, params, dt, realDt);
    if (expired || s.x < 0 || s.y < 0 || s.x > bounds.width || s.y > bounds.height) {
      s.active = false;
      if (!s.resolved) ev.onMiss(s);
      continue;
    }
    if (s.resolved) continue;
    scanTargets(SCAN, s.x, s.y, isArmed(s, params), hulls, NaN, 0);
    if (SCAN.late >= 0) {
      s.active = false;
      s.resolved = true;
      ev.onLateHit(SCAN.late, s.x, s.y, s);
      continue;
    }
    if (SCAN.nearest < 0) continue;
    if (SCAN.hit >= 0) {
      s.active = false;
      s.resolved = true;
      ev.onHit(SCAN.hit, s.x, s.y, s);
      continue;
    }
    const n = hulls[SCAN.nearest]!.state;
    if (markMissIfPassed(s, params, n.x, n.y, passRadius2)) ev.onMiss(s);
  }
}

/** 魚雷を撃つプールの部分（systems/torpedo-pool の TorpedoPool と LandingTorpedoPool がそのまま満たす） */
export interface LandingFirePool {
  readonly states: readonly TorpedoState[];
  fire(x: number, y: number, headingDeg: number, dud: boolean, erratic: boolean, erraticBiasDeg: number, rangeAtLaunchM: number): TorpedoState | null;
}

/** 模擬の魚雷のプール（TorpedoPool の状態と発射の写し。絵・雷跡なし）。wakeSpacingM は launchTorpedo の雷跡の間隔（何にも効かない。世界と同じ値を渡せる） */
export class LandingTorpedoPool implements LandingFirePool {
  readonly states: TorpedoState[] = [];
  private firedCount = 0;

  constructor(
    private readonly params: TorpedoParams,
    readonly capacity: number,
    private readonly bounds: SeaBounds,
    private readonly wakeSpacingM: number = 0,
  ) {
    for (let i = 0; i < capacity; i++) this.states.push(createTorpedoState());
  }

  get remaining(): number {
    return this.capacity - this.firedCount;
  }

  fire(x: number, y: number, headingDeg: number, dud: boolean, erratic: boolean, erraticBiasDeg: number, rangeAtLaunchM: number): TorpedoState | null {
    if (this.remaining <= 0) return null;
    const s = this.states[this.firedCount]!;
    this.firedCount++;
    launchTorpedo(s, x, y, headingDeg, dud, erratic, erraticBiasDeg, rangeAtLaunchM, this.wakeSpacingM);
    return s;
  }

  step(dt: number, realDt: number, hulls: readonly TorpedoTarget[], passRadius2: number, ev: TorpedoEvents): void {
    stepLandingTorpedoes(this.states, this.params, this.bounds, hulls, passRadius2, ev, dt, realDt);
  }
}

/** 斉射の魚雷の決着の数え（core/pt-torpedo の PtTorpedoState がそのまま満たす）: PT ごとの命中・不発の命中・まだ決着していない本数 */
export interface SalvoBook {
  readonly salvoHits: Uint8Array;
  readonly salvoDuds: Uint8Array;
  readonly salvoLeft: Uint8Array;
}

/** 世界の演出（模擬は NO_LANDING_HOOKS）: 魚雷が輸送船に当たった（不発も）。sunk はこの命中で沈み始めた（命中スロー・沈む演出） */
export interface LandingHitHooks {
  onShipHit(x: number, y: number, dud: boolean, sunk: boolean): void;
}

export const NO_LANDING_HOOKS: LandingHitHooks = { onShipHit: () => {} };

/**
 * 雷撃の入れ先（core/pt-torpedo の PtTorpedoSink）と敵の魚雷の決着（TorpedoEvents）を 1 つで（世界と模擬が同じ規則で輸送船と斉射を数える）。
 * 斉射: 出来事（同じステップ＝同じ nowS の同じ種類の斉射が続けば、その出来事に本数と隻数を足す。R14 A3）。
 * 命中: 不発なら不発の出来事（そのときの被雷の数で文が変わる。F16）、そうでなければ hitLanding → 被雷・沈没・揚陸の後の沈没。外れ: 斉射の最後の 1 本が決着して命中が無く、プールにほかの
 * 決着していない魚雷が無ければ、不発の命中があれば不発・無ければ外れの出来事（spec §4.3・R14 A3）。沈み始めた後の外れは出来事にしない（沈んだ後に「それた！ 輸送船は無事」と出さない）。
 * 終わり際の当たりは無い（late hit を見ない）
 */
export class LandingTorpedoLink implements TorpedoEvents {
  /** 時計（出撃からの実秒＝世界の stepTimeS。命中スローで遅れない）: 呼ぶ側が雷撃（stepPtTorpedoes）の前に書く（足す斉射の同じステップ・沈み始めた時計） */
  nowS = 0;
  /** プールの魚雷ごとの撃った PT（−1 は撃っていない） */
  private readonly boatOf: Int8Array;
  /** 最後の斉射の出来事の通し番号とその時計（同じステップの同じ種類の斉射を足す。A3） */
  private salvoSeq = -1;
  private salvoAtS = NaN;

  constructor(
    private readonly ld: LandingState,
    private readonly p: LandingParams,
    private readonly book: SalvoBook,
    private readonly pool: LandingFirePool,
    private readonly hooks: LandingHitHooks = NO_LANDING_HOOKS,
  ) {
    this.boatOf = new Int8Array(pool.states.length).fill(-1);
  }

  /** PtTorpedoSink: i 隻目の 1 本をプールへ（受け取れなければ、その 1 本は決着したことにする） */
  fire(i: number, x: number, y: number, headingDeg: number, dud: boolean, erratic: boolean, biasDeg: number, rangeM: number): void {
    const s = this.pool.fire(x, y, headingDeg, dud, erratic, biasDeg, rangeM);
    const k = s ? this.slotOf(s) : -1;
    if (k >= 0) this.boatOf[k] = i;
    else this.settle(i);
  }

  /**
   * PtTorpedoSink: 斉射を撃ち終えた（kind は PT_SALVO_*。出来事「米PT 雷撃！」「米PT 慌てて発射！」「米PT 戦いながら発射！」）。同じステップ（nowS が同じ）に同じ種類の斉射の出来事が
   * 最後の出来事なら、それに本数と隻数を足した出来事にする（A3: R2 の慌てた斉射は隊が捉えたステップにみな撃つ。前は最後の 1 隻の「3 本」だけが出た）
   */
  onSalvo(i: number, kind: number, rangeM: number, n: number): void {
    const ld = this.ld;
    const k = kind === SALVO_HURRIED ? LE_HURRIED : kind === SALVO_ENGAGED ? LE_ENGAGED : LE_CALM;
    const add = ld.eventSeq === this.salvoSeq && ld.eventKind === k && this.salvoAtS === this.nowS;
    landingEvent(ld, k, i, rangeM, add ? ld.eventCount + n : n, add ? ld.eventBoats + 1 : 1);
    this.salvoSeq = ld.eventSeq;
    this.salvoAtS = this.nowS;
  }

  onHit(_target: number, x: number, y: number, s: TorpedoState): void {
    const i = this.boatOfState(s);
    if (i < 0) return;
    this.settle(i);
    const ld = this.ld;
    if (s.dud) {
      this.book.salvoDuds[i]!++;
      ld.duds++;
      landingEvent(ld, LE_DUD, i, NaN, 0);
      this.hooks.onShipHit(x, y, true, false);
      return;
    }
    this.book.salvoHits[i]!++;
    const sunk = hitLanding(ld, this.p, this.nowS) === LANDING_SUNK;
    landingEvent(ld, !sunk ? LE_HIT : ld.sunkAfterDone ? LE_SUNK_DONE : LE_SUNK, i, NaN, 0);
    this.hooks.onShipHit(x, y, false, sunk);
  }

  onLateHit(): void {}

  onMiss(s: TorpedoState): void {
    const i = this.boatOfState(s);
    if (i < 0) return;
    this.settle(i);
    const b = this.book;
    if (b.salvoLeft[i] === 0 && b.salvoHits[i] === 0 && !this.ld.sinking && !this.othersRunning(s)) landingEvent(this.ld, b.salvoDuds[i]! > 0 ? LE_DUD : LE_MISS, i, NaN, 0);
  }

  /** プールに s のほかの決着していない魚雷が走っている（≤ 9 本を走査。確保しない。A3） */
  private othersRunning(s: TorpedoState): boolean {
    const st = this.pool.states;
    for (let k = 0; k < st.length; k++) {
      const o = st[k]!;
      if (o !== s && o.active && !o.resolved) return true;
    }
    return false;
  }

  /** i 隻目の斉射の 1 本が決着した */
  private settle(i: number): void {
    if (this.book.salvoLeft[i]! > 0) this.book.salvoLeft[i]!--;
  }

  private boatOfState(s: TorpedoState): number {
    const k = this.slotOf(s);
    return k >= 0 ? this.boatOf[k]! : -1;
  }

  /** プールの中の添字（≤ 9 本を走査。確保しない） */
  private slotOf(s: TorpedoState): number {
    const st = this.pool.states;
    for (let k = 0; k < st.length; k++) if (st[k] === s) return k;
    return -1;
  }
}
