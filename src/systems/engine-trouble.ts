// 機関の不調（v0.6.5。日本ハードモード④・jp_05。docs/02 §6.8、spec-v065 §C.1・§E.2）の世界側: core/engine-trouble の状態を 1 出撃に 1 個持ち、
// 固定ステップで米PT の段の直後（火災の前。時計は feelDt＝米PT の AI と同じ。模擬 core/pt-sim-engine と同じ順）に熱を進め、
// 自艇の運動（world-boat）には不調の間だけ速さの上限を艇の静音の上限にした入力を渡す（舵は残る。燃料切れの漂流が優先）。HUD へは writeTelemetry。
// 任務に不調が無いか ?debug&engoff の夜は WorldSetup.engine が無く、世界はこれを作らない（mission-world の engine が null＝v0.6.4 と同じ演算・同じ順）。
// 乱数を引かない・入力（InputState）を書き換えない・Phaser を使わない。§7: 確保は作るときだけ（入力の写しは 1 個）。
import type { BoatInput, BoatParams, SpeedStep } from '../core/boat-motion';
import { createEngineState, engineCap01, engineInput, stepEngine, writeEngineTelemetry, type EngineParams, type EngineState, type EngineTelemetry } from '../core/engine-trouble';

/** 世界から読むものだけ（MissionWorld がそのまま満たす。テストは同じ形の素の値で回す） */
export interface EngineWorldView {
  /** プレイヤーの入力（スティック。world-boat が stepBoat に渡す元） */
  readonly input: BoatInput;
  /** 自艇の今の値（機関損傷で speedMaxMps が落ちれば上限の比も変わる） */
  readonly params: Pick<BoatParams, 'silentMaxMps' | 'speedMaxMps'>;
  /** このステップの速力帯（自艇を動かした後の nextSpeedBand） */
  readonly band: SpeedStep;
  /** 米PT の隊（owner ≥ 0 が攻撃の最中＝赤い線。不調は pt_boats の任務だけなので普通は null でない） */
  readonly pts: { readonly section: { readonly owner: number } } | null;
  readonly boat: { readonly sinking: boolean };
  readonly atHome: boolean;
  readonly fuel: { readonly empty: boolean };
  /** 固定ステップで進んだ実秒（米PT の隊の timeS と同じ時計。不調の始まりの時刻に写すだけ） */
  readonly stepTimeS: number;
}

export class EngineTrouble {
  /** 熱・段・不調・数え（ヘッドレスの再生と Result が読む） */
  readonly state: EngineState;
  /** 不調の間の入力（engineInput が針路と上限の速さを書く。出撃時に 1 個） */
  private readonly capInput: BoatInput = { headingDeg: NaN, speed01: 0 };

  constructor(readonly p: EngineParams) {
    this.state = createEngineState(p);
  }

  /** 自艇の運動に渡す入力（world-boat。燃料切れでないとき）: 不調でなければ w.input そのもの、不調なら速さを静音の上限 / 今の全速までにした写し */
  input(w: Pick<EngineWorldView, 'input' | 'params'>): BoatInput {
    return engineInput(this.state, w.input, this.capInput, engineCap01(w.params));
  }

  /**
   * 1 固定ステップ（mission-world の stepFn。米PT の段の直後・火災の前）。赤い線はこのステップに固めた線も入る（隊の段の後に読む）。
   * 不調になれるのは沈み始めていない・帰投の輪の中でない・燃料切れでないとき（模擬の simEngineStep と同じ条件）
   */
  step(w: EngineWorldView, feelDt: number): void {
    const lineOnPlayer = w.pts !== null && w.pts.section.owner >= 0;
    stepEngine(this.state, this.p, w.band, lineOnPlayer, !w.boat.sinking && !w.atHome && !w.fuel.empty, feelDt, w.stepTimeS);
  }

  /** HUD へ（mission-telemetry の refreshTelemetry。毎フレーム。確保なし） */
  writeTelemetry(t: EngineTelemetry): void {
    writeEngineTelemetry(t, this.state, this.p);
  }
}
