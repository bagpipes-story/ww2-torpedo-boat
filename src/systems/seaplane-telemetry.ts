// 敵の水上機（docs/02 §6.8、v0.4.1）の HUD 向けテレメトリ（v0.6.4 で systems/mission-telemetry の refreshTelemetry から切り出し。中身はそのまま）。
// 毎フレーム中身だけ書き換える（§7: 確保しない。機の姿勢は呼ぶ側の scratchPose に書く）。mission-telemetry だけが呼ぶ（味方機の後・夜明けの refreshDawnTelemetry の前）。
import type { BoatTelemetry } from '../core/boat-motion';
import type { AircraftPose } from '../core/friendly';
import { SP_APPROACH, SP_IDLE, SP_OUT_NONE, bombInAir, seaplaneActive, seaplanePose } from '../core/seaplane';
import type { MissionWorld } from './mission-world';

/** 水上機: 段階・接近中の距離・照明弾・爆弾・結末・マーカーの相対位置（来ている間だけ。無い任務は SP_IDLE・NaN） */
export function refreshSeaplaneTelemetry(t: BoatTelemetry, w: MissionWorld, scratchPose: AircraftPose): void {
  // 敵の水上機（docs/02 §6.8、v0.4.1）: 距離は接近中だけ（相対の半径。sqrt 無し）。マーカーの相対位置は来ている間だけ
  const sp = w.seaplane ? w.seaplane.state : null;
  t.planePhase = sp ? sp.phase : SP_IDLE;
  t.planeDistM = sp && sp.phase === SP_APPROACH ? sp.approachR : 0;
  t.planeLocked = sp ? sp.locked : false;
  t.planeWake = w.band === 'cruise' || w.band === 'full';
  t.planeFlareOn = sp ? sp.ordnance.flare.leftS > 0 : false;
  t.planeBombsDropped = sp ? sp.ordnance.bombsDropped : 0;
  t.planeBombAir = sp ? bombInAir(sp.ordnance) : false;
  t.planeBombsHit = sp ? sp.ordnance.bombsHit : 0;
  t.planeOutcome = sp ? sp.outcome : SP_OUT_NONE;
  if (sp && w.seaplane && seaplaneActive(sp)) {
    const q = seaplanePose(sp, w.seaplane.p, scratchPose);
    t.planeDx = q.dx;
    t.planeDy = q.dy;
  } else {
    t.planeDx = NaN;
    t.planeDy = NaN;
  }
}
