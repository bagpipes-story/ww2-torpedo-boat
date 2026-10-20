// 任務の終わり（v0.6.2 実機 1 回目で mission-scene から切り出し）: 終了判定の材料（core/mission-flow の EndCheck）を毎フレーム書き、decideMissionEnd で理由を決め、
// stepEndSettle で終わり際の魚雷を待つ（自艇の沈没・敵艦隊なし（cleared）・漂流・座礁は、走っている魚雷がすべて決着するか torpedo_end_settle_s まで終えない）。
// 待つ間も世界は進む（魚雷・敵は動き、自艇は沈むか止まっている）。窓の前の世界は v0.6.2 と同じ（終わりが遅れるだけ）。§7: 確保は constructor だけ。
// Phaser も config（DOM を読む game-config）も読まない（tests から作れる）。世界は構造の型 MissionEndWorld で受ける（MissionWorld がそのまま満たす）。
// レビューの直し: 漂流の窓の間に敵艦隊がいなくなれば cleared に上げる（promoteAdriftToCleared）、窓（cleared・漂流・座礁）の間は新しい魚雷を撃たない（holdFire）。
import { discardFireInput, type InputState } from '../core/input-state';
import { createEndSettle, decideMissionEnd, promoteAdriftToCleared, stepEndSettle, type EndCheck, type EndParams, type MissionEndReason, type ReturnPoint } from '../core/mission-flow';

/** 終了判定に読む世界の部分 */
export interface MissionEndWorld {
  readonly boat: { readonly sinking: boolean };
  readonly atHome: boolean;
  readonly grounded: boolean;
  /** 走っている魚雷か発射待ちがある */
  readonly torpedoesRunning: boolean;
  readonly torpedoes: { readonly unresolvedCount: number };
  readonly enemy: { readonly sinkPlaying: boolean; readonly allOut: boolean };
  readonly fuel: { readonly empty: boolean };
  readonly band: string;
  /** 固定ステップで進んだ実秒（窓の時計） */
  readonly stepTimeS: number;
}

export class MissionEnd {
  private readonly check: EndCheck = {
    boatSinking: false,
    atHome: false,
    torpedoesRunning: false,
    waitS: 0,
    timeLeftS: 0,
    destroyerSinkPlaying: false,
    fuelEmpty: false,
    stopped: true,
    grounded: false,
    fleetGone: false,
  };
  private readonly params: EndParams;
  private readonly settle = createEndSettle();
  /** 自艇の沈没演出が終わったときの理由（終わるまで null） */
  private sunkReason: MissionEndReason | null = null;

  constructor(
    rp: ReturnPoint,
    adriftDelayS: number,
    /** 制空権下で敵艦隊がいなくなれば終える（missions_seed の fleet_gone_clears。setup.dawnAir.fleetGoneClears） */
    private readonly fleetGoneClears: boolean,
  ) {
    this.params = { torpedoSettleMaxS: rp.torpedoSettleMaxS, adriftDelayS, endSettleS: rp.torpedoEndSettleS };
  }

  /** 毎フレーム、世界を進めた後に 1 回。終えるなら理由（waitS は輪の中・座礁・燃料切れで止まっている間の実秒、timeLeftS は夜明けまでの実秒） */
  step(w: MissionEndWorld, waitS: number, timeLeftS: number): MissionEndReason | null {
    const c = this.check;
    c.boatSinking = w.boat.sinking;
    c.atHome = w.atHome;
    c.torpedoesRunning = w.torpedoesRunning;
    c.waitS = waitS;
    c.timeLeftS = timeLeftS;
    c.destroyerSinkPlaying = w.enemy.sinkPlaying;
    c.fuelEmpty = w.fuel.empty;
    c.stopped = w.band === 'stop';
    c.grounded = w.grounded;
    c.fleetGone = this.fleetGoneClears && w.enemy.allOut;
    if (promoteAdriftToCleared(this.settle, w.stepTimeS, c.boatSinking, c.fleetGone, c.destroyerSinkPlaying)) return null;
    return stepEndSettle(this.settle, w.stepTimeS, c.boatSinking, this.sunkReason, decideMissionEnd(c, this.params), running(w), this.params.endSettleS);
  }

  /**
   * 窓（cleared・漂流・座礁）が開いている間は新しい魚雷を撃たない（窓は延びないので、撃てば決着の前に外れで記録され、通算の命中率を汚す。帰投の輪の中と同じ）。
   * 残りの一斉発射も捨てる。毎フレーム、世界を進める（updateFrame の入力の消費）前に 1 回。窓が開くまでは何もしない（窓より前の世界は同じ）
   */
  holdFire(w: { readonly input: InputState; readonly launcher: { clearQueue(): void } }): void {
    if (this.settle.reason === null) return;
    discardFireInput(w.input);
    w.launcher.clearQueue();
  }

  /** 自艇の沈没演出が終わった（WorldEvents.onBoatSunk）。魚雷がすべて決着しているか窓が過ぎていればその理由、待つなら null（後の step が返す） */
  boatSunk(w: MissionEndWorld, reason: MissionEndReason): MissionEndReason | null {
    this.sunkReason = reason;
    return stepEndSettle(this.settle, w.stepTimeS, true, reason, null, running(w), this.params.endSettleS);
  }
}

/** 待つ魚雷: 決着していない魚雷。発射待ちは自艇が浮いている間だけ数える（沈み始めた艇からは撃たない＝待っても決着しない） */
function running(w: MissionEndWorld): boolean {
  return w.boat.sinking ? w.torpedoes.unresolvedCount > 0 : w.torpedoesRunning;
}
