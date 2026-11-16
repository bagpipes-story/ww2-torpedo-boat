// 列の通過（v0.8.0 S2。us_04「ブラケット海峡の夜」の東京急行。spec-v0800 §4.4・§4.5・§6 の S2、brief L10・L11）の世界の側: core/ship-transit の段階を隊の列の艦に当てる。
// 隊（systems/destroyer-group）が作って持ち、固定ステップでは艦を動かした直後（systems/destroyer-step。魚雷・体当たり・反撃の前）に 1 回進める:
//   入った・戻った艦はその道の現れる点（appearX・laneY・headingDeg）へ置き、道の針路へ退く動き（startRetire＝端で向き直さない・わざとの体当たりはしない）。
//   揚陸の地に着いた艦は海域の外（offMap）、去った艦は退いた（withdrawn＝夜明けの行の「退いた」に数える）、沈み始めた艦はそのまま（撃沈）。
//   復路の最初の艦が現れたら護衛（隊の列より前の艦）も復路の針路へ退く（cover_leaves_with_outbound。護衛は今の縁の外の退き終わり＝entities/destroyer）。
// 海域の外の艦（まだ来ない・揚陸の地・去った）は Destroyer.out（見えない・当たらない・撃たない・照らさない・見つけない・狙えない・レーダーに映らない＝brief L10）。
// 隊の「すべて出た」（allOut・allSettled）は戻りの残り（transitPending）が 0 の時だけ（R2: 列がビラにいる間に一斉発射を捨てない・走る魚雷を外れにしない・「敵艦隊なし」にしない）。
// 夜明けの後は戻りの残りが 0（core）＝まだ来ない・揚陸の地の艦は出たものとして数える（退いた・撃沈のどちらにも数えない）。
// 時計（S1 の作り・brief L11）: 入りは体感の時計（feelDt の和）、着く・去るは縁の x、戻りは固定ステップの時計（stepTimeS）。命中スローで列の順と道は変わらない（tests/transit-world）。
// Phaser 非依存（艦は構造の型 TransitShip＝entities/destroyer の Destroyer が満たす。tests/transit-world が素の艦で回す）・乱数なし。確保は constructor だけ。
import type { TransitSetup } from '../config/transit-mission-data';
import { startRetire, type ShipAiState } from '../core/ship-ai';
import { createShipTransit, stepShipTransit, transitAppearLeg, transitPending, type ShipTransitState } from '../core/ship-transit';

/** 隊の艦（entities/destroyer の Destroyer がそのまま満たす。列の艦は goAway・reappear、護衛は ai だけ使う） */
export interface TransitShip {
  readonly state: { readonly x: number };
  readonly ai: ShipAiState;
  readonly sinking: boolean;
  readonly sunk: boolean;
  readonly withdrawn: boolean;
  readonly offMap: boolean;
  readonly out: boolean;
  transitShip: boolean;
  goAway(gone: boolean): void;
  reappear(x: number, y: number, headingDeg: number, speedMps: number): void;
}

/** 固定ステップで読む世界の部分（MissionWorld がそのまま満たす）: 固定ステップの時計と夜明けのラッチ（このステップの頭で立つ） */
export interface TransitWorldView {
  readonly stepTimeS: number;
  readonly dawn: { readonly reached: boolean };
}

export class DestroyerTransit {
  readonly state: ShipTransitState;
  /** 列の艦（隊の ships の first から plan.ships 隻＝core の艦 0〜ships − 1） */
  readonly column: readonly TransitShip[];

  constructor(
    /** 隊の艦の全部（護衛 → 列。隊の ships をそのまま） */
    private readonly all: readonly TransitShip[],
    /** 列の 1 隻目の添字（＝護衛の隻数） */
    private readonly first: number,
    readonly plan: TransitSetup,
  ) {
    this.state = createShipTransit(plan);
    this.column = all.slice(first, first + plan.ships);
    // 列の艦はまだ来ない（WAIT）＝海域の外で作る。縁の外の退き終わりは段階が決める（S1 の注の必ず直す所）
    for (const s of this.column) {
      s.transitShip = true;
      s.goAway(false);
    }
  }

  /** 残りの戻り（これから海域に現れる艦の数。夜明けの後は 0） */
  get pending(): number {
    return transitPending(this.state);
  }

  /** すべて（護衛と列）が沈み始めたか退いたか、もう来ない（夜明けの後の海域の外）。戻りの残りがある間は偽 */
  get allOut(): boolean {
    if (transitPending(this.state) > 0) return false;
    for (let i = 0; i < this.all.length; i++) if (!this.all[i]!.out) return false;
    return true;
  }

  /** すべての決着がついた（沈没演出が終わったか退いたか、もう来ない）。戻りの残りがある間は偽 */
  get allSettled(): boolean {
    if (transitPending(this.state) > 0) return false;
    for (let i = 0; i < this.all.length; i++) {
      const s = this.all[i]!;
      if (!s.sunk && !s.withdrawn && !s.offMap) return false;
    }
    return true;
  }

  /**
   * 1 固定ステップ（艦を動かした直後）。feelDt は命中スロー込みの実秒。段階を進め、入った・戻った艦を置き、着いた・去った艦を海域の外へ、護衛を退かせる。
   * 戻りは艦が海域を出た（揚陸の地に着いたか去った）ステップか（それで隊のすべてが出たなら destroyer-step が残りの一斉発射を捨てる）
   */
  step(w: TransitWorldView, feelDt: number): boolean {
    const st = this.state;
    const p = this.plan;
    stepShipTransit(st, p, feelDt, w.stepTimeS, w.dawn.reached, this.column);
    const placed = st.entered | st.returned;
    const left = st.arrived | st.gone;
    if (placed === 0 && left === 0 && !st.coverLeaves) return false;
    for (let i = 0; i < st.ships; i++) {
      const bit = 1 << i;
      const s = this.column[i]!;
      if ((placed & bit) !== 0) {
        const leg = transitAppearLeg(p, st.phase[i]!)!;
        s.reappear(leg.appearX, leg.laneY, leg.headingDeg, p.speedMps);
        startRetire(s.ai, leg.headingDeg);
      } else if ((left & bit) !== 0) {
        s.goAway((st.gone & bit) !== 0);
      }
    }
    if (st.coverLeaves) {
      for (let i = 0; i < this.first; i++) {
        const c = this.all[i]!;
        if (!c.out) startRetire(c.ai, p.outbound.headingDeg);
      }
    }
    return left !== 0;
  }
}
