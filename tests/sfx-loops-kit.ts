// v0.7.1 S3: ループの観測器（core/sfx-loops）の偽のテレメトリ（tests/sfx-loops・tests/sfx-engine-loops・S4 の tests/sfx-cues が使う）。観測器が読む欄だけを持ち、凍らせる（書き込めば投げる＝読むだけの証）。
// S4: 合図の観測器（core/sfx-cues）が読む欄を足した（兵装・発見・照らされた・星弾・照明弾・味方機の結果・煙幕・弾倉・帰投せよ・浅瀬・爆弾・機関の出来事・夜明け・jp_03 の予告と座席・jp_04 の報告）。
// v0.7.2 S2: 任務の曲の段の観測器（core/sfx-music-mood）が読む欄を足した（沿岸砲・水上機の発見確定・米PT の隊・jp_04 の輸送船への脅威）。敵の位置・見えているかの欄（enemyDx・
// enemySighted・pt.dx・pt.sighted など）は持たない（planeDistM・patrol.distM はループの観測器が読むので持つ）。tests/sfx-music-mood の漏らさない試験は、距離の欄を足した偽物でも段が変わらないことを見る。
import { AS_T_NONE } from '../src/core/air-strike-state';
import type { BoatTelemetry } from '../src/core/boat-telemetry';
import { ENGINE_EV_NONE, ENGINE_OK } from '../src/core/engine-trouble';
import { EVA_NONE } from '../src/core/evac-telemetry';
import { FF_IDLE, FF_OUT_NONE } from '../src/core/friendly';
import { LANDING_REPORT_NONE, LE_NONE } from '../src/core/landing';
import { PA_OFF } from '../src/core/patrol-air-state';
import { SP_IDLE, SP_OUT_NONE } from '../src/core/seaplane';
import { SHALLOW_NONE } from '../src/core/shallows';
import { STORM_NONE } from '../src/core/storm';

export interface FakeTelemetry {
  speedMps: number; targetStep: string; fuelEmpty: boolean; hp: number; engineDamaged: boolean; onFire: boolean; stormState: number;
  planePhase: number; planeDistM: number; planeOutcome: number; friendlyPhase: number;
  playerDetected: boolean; illuminated: boolean; starLit: boolean; planeFlareOn: boolean; planeBombAir: boolean; friendlyOutcome: number;
  smokeLeftS: number; gunReloadLeftS: number; callFlags: number; shallowState: number;
  batteryInArc: boolean; batteryAlerted: boolean; planeLocked: boolean;
  engine: { on: boolean; stage: number; eventSeq: number; lastEvent: number };
  dawn: { threat: number; inboundDistM: number; reached: boolean };
  patrol: { enabled: boolean; phase: number; threat: number; distM: number; resultKind: number };
  evac: { enabled: boolean; settled: boolean; annKind: number; targetedMask: number; control: number; annSeq: number; seatSeq: number; falling: boolean };
  arms: { torpedoesAboard: number; reloadN: number };
  landing: { enabled: boolean; eventSeq: number; eventKind: number; resolved: boolean; reportSub: number; wakes: number; fireLineI: number };
  pt: { enabled: boolean; passing: boolean; passTargetLost: boolean; targetKind: number; detected: boolean; alive: number };
}
type Nested = 'engine' | 'dawn' | 'patrol' | 'evac' | 'arms' | 'landing' | 'pt';
export type FakeOver = Partial<Omit<FakeTelemetry, Nested>> & { [K in Nested]?: Partial<FakeTelemetry[K]> };

/** 静かな夜（止まっていて・何も来ていない）に上書きを足した偽のテレメトリ（凍らせる） */
export function tel(over: FakeOver = {}): BoatTelemetry {
  const f: FakeTelemetry = {
    speedMps: 0, targetStep: 'stop', fuelEmpty: false, hp: 100, engineDamaged: false, onFire: false, stormState: STORM_NONE,
    planePhase: SP_IDLE, planeDistM: 0, planeOutcome: SP_OUT_NONE, friendlyPhase: FF_IDLE,
    playerDetected: false, illuminated: false, starLit: false, planeFlareOn: false, planeBombAir: false, friendlyOutcome: FF_OUT_NONE,
    smokeLeftS: 0, gunReloadLeftS: 0, callFlags: 0, shallowState: SHALLOW_NONE,
    batteryInArc: false, batteryAlerted: false, planeLocked: false,
    ...over,
    engine: Object.freeze({ on: false, stage: ENGINE_OK, eventSeq: 0, lastEvent: ENGINE_EV_NONE, ...over.engine }),
    dawn: Object.freeze({ threat: AS_T_NONE, inboundDistM: NaN, reached: false, ...over.dawn }),
    patrol: Object.freeze({ enabled: false, phase: PA_OFF, threat: AS_T_NONE, distM: NaN, resultKind: 0, ...over.patrol }),
    evac: Object.freeze({ enabled: false, settled: false, annKind: EVA_NONE, targetedMask: 0, control: 0, annSeq: 0, seatSeq: 0, falling: false, ...over.evac }),
    arms: Object.freeze({ torpedoesAboard: 4, reloadN: 0, ...over.arms }),
    landing: Object.freeze({ enabled: false, eventSeq: 0, eventKind: LE_NONE, resolved: false, reportSub: LANDING_REPORT_NONE, wakes: 0, fireLineI: -1, ...over.landing }),
    pt: Object.freeze({ enabled: false, passing: false, passTargetLost: false, targetKind: 0, detected: false, alive: 0, ...over.pt }),
  };
  return Object.freeze(f) as unknown as BoatTelemetry;
}
