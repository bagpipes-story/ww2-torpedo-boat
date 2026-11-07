// 自艇の運動の固定ステップ（v0.6.5 の準備で systems/mission-world.ts の stepFn から移した。順と式は 1 字も変えていない）: 座礁・stepBoat・海域の縁・浅瀬・燃料・帰投の輪。
// v0.6.5: stepBoat の入力だけ、機関の不調（systems/engine-trouble）の上限を通す（燃料切れの漂流が優先）。
// 沈み始めたら何もしない（乗員と setPerformance は沈み始めても回るので mission-world に残す）。§7: 確保しない。
// v0.6.11 S4（jp_03。spec-v0611-r2 §3.3・§3.9）: 座席への入力は systems/world-evac の command（スティックの latch。core/evac-seat の evacSeatCommand）、燃料は stepTimeS が
// fuel_free_until_s に届いてから（空襲の間は数えない。模擬 core/evac-sim と同じ式）。evac の無い任務は今のまま（stepTimeS ≥ 0 − ε はいつも真）。
import { clampToBounds, stepBoat, type BoatInput, type BoatParams, type BoatState } from '../core/boat-motion';
import { stepFuel, type FuelCurve, type FuelState } from '../core/fuel';
import { insideRing, type ReturnPoint } from '../core/mission-flow';
import { EVAC_TIME_EPS_S } from '../core/evac-data';
import { shallowIndexAt } from '../core/shallows';
import type { EngineTrouble } from './engine-trouble';
import { DRIFT_INPUT, type WorldEvents } from './world-events';
import type { WorldSetup } from './world-setup';

/** 自艇の運動が読み書きするものだけ（MissionWorld がそのまま満たす。tests/engine-trouble-world は Phaser なしの素の値で回す） */
export interface PlayerBoatWorld {
  readonly boat: { readonly state: BoatState; readonly sinking: boolean };
  readonly setup: Pick<WorldSetup, 'mission' | 'boundsMarginM' | 'grounding'>;
  readonly input: BoatInput;
  readonly params: BoatParams;
  readonly fuel: FuelState;
  readonly fuelCurve: FuelCurve;
  readonly returnPoint: ReturnPoint;
  readonly events: Pick<WorldEvents, 'onGrounded'>;
  /** 機関の不調（v0.6.5。jp_05）。無い任務・?debug&engoff は null */
  readonly engine: EngineTrouble | null;
  /** 固定ステップで進んだ実秒（燃料を数え始める秒と比べる）と空襲下の退避（jp_03。無い任務は null か無し） */
  readonly stepTimeS: number;
  readonly evac?: { command(input: BoatInput): BoatInput; readonly fuelFreeUntilS: number } | null;
  grounded: boolean;
  atHome: boolean;
}

/** 1 固定ステップ。dt は体感の秒に time_scale を掛けた秒（mission-world の stepFn の dt。運動と燃料は同じ dt で積分する） */
export function stepPlayerBoat(w: PlayerBoatWorld, dt: number): void {
  const boat = w.boat.state;
  const c = w.setup;
  if (!w.boat.sinking) {
    if (w.grounded) {
      boat.speedMps = 0;
    } else {
      // 燃料切れなら漂流（舵も速度指令も効かない）。機関の不調（v0.6.5）の間は速さの上限が艇の静音の上限（舵は残る。不調の無い任務は w.input そのもの）。燃料は運動と同じ game dt で積分する
      stepBoat(boat, w.fuel.empty ? DRIFT_INPUT : w.engine ? w.engine.input(w) : w.evac ? w.evac.command(w.input) : w.input, w.params, dt);
      clampToBounds(boat, c.mission.bounds, c.boundsMarginM);
      // 浅瀬: 安全速力を超えて中に入ると座礁（docs/02 §6.8）。安全速力以下なら通れる
      if (boat.speedMps > c.grounding.safeSpeedMps && shallowIndexAt(c.mission.shallows, boat.x, boat.y) >= 0) {
        w.grounded = true;
        boat.speedMps = 0;
        w.events.onGrounded(boat.x, boat.y);
      }
    }
    if (!w.evac || w.stepTimeS >= w.evac.fuelFreeUntilS - EVAC_TIME_EPS_S) stepFuel(w.fuel, w.fuelCurve, boat.speedMps, dt);
    w.atHome = insideRing(w.returnPoint, boat.x, boat.y);
  }
}
