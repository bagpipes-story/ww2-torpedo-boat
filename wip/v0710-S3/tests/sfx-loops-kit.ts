// v0.7.1 S3: ループの観測器（core/sfx-loops）の偽のテレメトリ（tests/sfx-loops・tests/sfx-engine-loops が使う）。観測器が読む欄だけを持ち、凍らせる（書き込めば投げる＝読むだけの証）。
import { AS_T_NONE } from '../src/core/air-strike-state';
import type { BoatTelemetry } from '../src/core/boat-telemetry';
import { ENGINE_OK } from '../src/core/engine-trouble';
import { EVA_NONE } from '../src/core/evac-telemetry';
import { FF_IDLE } from '../src/core/friendly';
import { PA_OFF } from '../src/core/patrol-air-state';
import { SP_IDLE, SP_OUT_NONE } from '../src/core/seaplane';
import { STORM_NONE } from '../src/core/storm';

export interface FakeTelemetry {
  speedMps: number; targetStep: string; fuelEmpty: boolean; hp: number; engineDamaged: boolean; onFire: boolean; stormState: number;
  planePhase: number; planeDistM: number; planeOutcome: number; friendlyPhase: number;
  engine: { on: boolean; stage: number };
  dawn: { threat: number; inboundDistM: number };
  patrol: { enabled: boolean; phase: number; threat: number; distM: number; resultKind: number };
  evac: { enabled: boolean; settled: boolean; annKind: number; targetedMask: number; control: number };
}
type Nested = 'engine' | 'dawn' | 'patrol' | 'evac';
export type FakeOver = Partial<Omit<FakeTelemetry, Nested>> & { [K in Nested]?: Partial<FakeTelemetry[K]> };

/** 静かな夜（止まっていて・何も来ていない）に上書きを足した偽のテレメトリ（凍らせる） */
export function tel(over: FakeOver = {}): BoatTelemetry {
  const f: FakeTelemetry = {
    speedMps: 0, targetStep: 'stop', fuelEmpty: false, hp: 100, engineDamaged: false, onFire: false, stormState: STORM_NONE,
    planePhase: SP_IDLE, planeDistM: 0, planeOutcome: SP_OUT_NONE, friendlyPhase: FF_IDLE,
    ...over,
    engine: Object.freeze({ on: false, stage: ENGINE_OK, ...over.engine }),
    dawn: Object.freeze({ threat: AS_T_NONE, inboundDistM: NaN, ...over.dawn }),
    patrol: Object.freeze({ enabled: false, phase: PA_OFF, threat: AS_T_NONE, distM: NaN, resultKind: 0, ...over.patrol }),
    evac: Object.freeze({ enabled: false, settled: false, annKind: EVA_NONE, targetedMask: 0, control: 0, ...over.evac }),
  };
  return Object.freeze(f) as unknown as BoatTelemetry;
}
