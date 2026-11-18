// 列の見張り（v0.8.2 S2。us_05「スリガオ海峡・最初の接触」の時雨、ハードは見張りの駆逐艦も。spec-v0820 §4.2 D-C7・§9 の 2、lead の L20）の世界の側: S1 の core/column-screen の判断を隊の列の艦に当てる。
// 隊（systems/destroyer-group）が見張り（role screen）のいる片道の列の任務だけ作って持ち、固定ステップでは列の段階（systems/destroyer-transit）の直後に 1 回進める（systems/destroyer-step）:
//   離れた艦（自艇を見つけたステップ）: 見張りの AI（記録の値そのまま＝体当たり 400 m・端で向き直す）に替え、退く旗（retiring は core/ship-ai の startRetire のラッチ）を外から下ろし
//   （entities/destroyer の goAway が AI の欄を外から書くのと同じ前例）、哨戒の針路を列の針路にする＝次のステップから us_02 の AI で照らして撃ち、寄れば体当たり。
//   戻った艦（見失って体感の rejoin_s 秒）: 列の AI（最大速力が列の速さ）に戻し、列の針路へ startRetire（東へ去る）。夜明けに離れていた艦は S1 がそのステップに戻った扱いにする
//   （隊の withdraw が先に夜明けの退く向きを立てているので、その向きは書き換えない）。
// AI の値の物は setup で 1 回作った 2 つ（kits の lineAi・screenAi）の参照を替えるだけ（§9 の 2）。core/ship-ai は触らない。艦ごとの離れた・戻った世界の秒（固定ステップの時計）も残す
// （core の秒は体感＝命中スロー込み。S3 の探りの「時雨が離れた／戻った秒」）。Phaser 非依存（艦は構造の型 RoleShip＝Destroyer が満たす）・乱数なし。確保は作る時だけ。
import type { TransitSetup } from '../config/transit-mission-data';
import { createScreenState, screenPlanOf, stepScreens, type ScreenPlan, type ScreenState } from '../core/column-screen';
import { startRetire, type ShipAiParams, type ShipAiState } from '../core/ship-ai';
import { transitOnMap, type ShipTransitState } from '../core/ship-transit';

/** 列の艦（entities/destroyer の Destroyer がそのまま満たす） */
export interface RoleShip {
  readonly ai: ShipAiState;
  readonly sinking: boolean;
  setAiParams(p: ShipAiParams): void;
}

/** 固定ステップで読む世界の部分（MissionWorld がそのまま満たす） */
export interface RolesWorldView {
  readonly stepTimeS: number;
  readonly dawn: { readonly reached: boolean };
}

export class ColumnRoles {
  readonly st: ScreenState;
  /** 艦ごと（列の i 隻目）の最後に離れた・戻った世界の秒（固定ステップの時計。NaN は未だ） */
  readonly leftAtS: Float64Array;
  readonly rejoinedAtS: Float64Array;

  private constructor(
    /** 列の艦（隊の ships の列の部分。core の艦 0〜n − 1） */
    private readonly ships: readonly RoleShip[],
    readonly plan: ScreenPlan,
    /** 列の段階（隊の DestroyerTransit の状態。海域の中の艦だけを読む） */
    private readonly transit: ShipTransitState,
    private readonly lineAi: readonly ShipAiParams[],
    private readonly screenAi: readonly (ShipAiParams | null)[],
    /** 列の針路（離れた艦の哨戒の針路・戻った艦の退く向き） */
    readonly headingDeg: number,
  ) {
    this.st = createScreenState(ships.length);
    this.leftAtS = new Float64Array(ships.length).fill(NaN);
    this.rejoinedAtS = new Float64Array(ships.length).fill(NaN);
  }

  /** 見張りのいる片道の列だけ作る（transit.column の無い任務・見張りのいない列は null）。ships は列の艦・transit は隊の列の段階 */
  static of(ships: readonly RoleShip[], plan: TransitSetup, transit: ShipTransitState): ColumnRoles | null {
    const col = plan.column;
    const sp = col ? screenPlanOf(col, plan.rejoinS) : null;
    if (!col || !sp) return null;
    if (ships.length !== col.length) throw new Error(`列の艦の数（${ships.length}）が transit.column（${col.length}）と違う（systems/column-roles）`);
    return new ColumnRoles(ships, sp, transit, col.map((k) => k.lineAi), col.map((k) => k.screenAi), plan.inbound.headingDeg);
  }

  /** 1 固定ステップ（列の段階の直後）。feelDt は命中スロー込みの実秒 */
  step(w: RolesWorldView, feelDt: number): void {
    const st = this.st;
    let onMap = 0;
    for (let i = 0; i < st.n; i++) if (transitOnMap(this.transit, i)) onMap |= 1 << i;
    stepScreens(st, this.plan, this.ships, onMap, feelDt, w.dawn.reached);
    if ((st.left | st.rejoined) === 0) return;
    for (let i = 0; i < st.n; i++) {
      const bit = 1 << i;
      const d = this.ships[i]!;
      if ((st.left & bit) !== 0) {
        d.setAiParams(this.screenAi[i]!);
        d.ai.retiring = false;
        d.ai.patrolHeadingDeg = this.headingDeg;
        this.leftAtS[i] = w.stepTimeS;
      } else if ((st.rejoined & bit) !== 0) {
        d.setAiParams(this.lineAi[i]!);
        if (!d.ai.retiring) startRetire(d.ai, this.headingDeg); // 夜明けの withdraw が立てた退く向きは残す
        this.rejoinedAtS[i] = w.stepTimeS;
      }
    }
  }
}
