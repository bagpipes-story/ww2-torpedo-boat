// 対空の機の枠（v0.6.8。spec-v068 §3.2・§5.1）: 機銃を押している間だけ毎ステップ、撃てる機を core/aa-fire の AaTargets に入れ（世界の座標 = 自艇 + 姿勢の相対）、
// 撃墜した枠を出どころの包み（core/air-down）へ振り分ける。入れる機: 夜明けの空襲の 4 機（待機・終わりでなく濃さ > 0）・jp_02 の夜の出撃の 2 機（同じ）・
// us_02 の夜の水上機（接近〜去る・濃さ > 0）。入れない機: 味方機・jp_02 の捜索の 2 機（900 m より近くへ来ない＝隠れるのが本筋）。
// Phaser 非依存・乱数なし・確保しない（姿勢は呼ぶ側の使い回し）。
import { AA_SRC_DAWN, AA_SRC_SEAPLANE, AA_SRC_SORTIE, addStrikePlanes, pushAaTarget, type AaTargets } from '../core/aa-fire';
import { downSeaplane, downStrikePlane } from '../core/air-down';
import { AS_INBOUND, AS_LEAVING, strikePose, type AirStrikeParams, type AirStrikeState } from '../core/air-strike';
import type { BoatState } from '../core/boat-motion';
import type { AircraftPose } from '../core/friendly';
import { seaplaneActive, seaplanePose, type SeaplaneParams, type SeaplaneState } from '../core/seaplane';

/** 空襲の core の状態と値（WorldDawn の strike・PatrolAirStep の flight と sortie） */
export interface AaStrike {
  readonly state: AirStrikeState;
  readonly p: AirStrikeParams;
}

/** 機の枠に読む世界の部分（MissionWorld がそのまま満たす） */
export interface AaSlotWorld {
  readonly boat: { readonly state: BoatState };
  readonly dawn: { readonly strike: AaStrike | null };
  readonly patrol: { readonly flight: { readonly state: AirStrikeState }; readonly sortie: AirStrikeParams } | null;
  readonly seaplane: { readonly state: SeaplaneState; readonly p: SeaplaneParams } | null;
}

/** 機の来る任務か（夜明けの空襲・夜の出撃・夜の水上機のどれか。+24 の系列はこのときだけ作る） */
export function hasAircraft(w: AaSlotWorld): boolean {
  return w.dawn.strike !== null || w.patrol !== null || w.seaplane !== null;
}

/** 枠を今のステップの機で埋め直す（押している間だけ呼ぶ） */
export function fillAaSlots(t: AaTargets, w: AaSlotWorld, pose: AircraftPose): void {
  t.n = 0;
  const boat = w.boat.state;
  const ds = w.dawn.strike;
  if (ds) addStrikePlanes(t, ds.state, ds.p, boat, AA_SRC_DAWN, pose);
  const pa = w.patrol;
  if (pa) addStrikePlanes(t, pa.flight.state, pa.sortie, boat, AA_SRC_SORTIE, pose);
  const sp = w.seaplane;
  if (sp && seaplaneActive(sp.state)) {
    seaplanePose(sp.state, sp.p, pose);
    if (pose.alpha > 0) pushAaTarget(t, boat.x + pose.dx, boat.y + pose.dy, AA_SRC_SEAPLANE, 0);
  }
}

/**
 * 枠 k の機を撃墜する。撃墜の前の姿勢（向き。落ちる絵が使う）を pose に書く。出どころ（AA_SRC_*）を返す。
 * 包みが false（もう飛んでいない機）なら -1（撃墜に数えない。レビュー F14）
 */
export function downSlot(t: AaTargets, k: number, w: AaSlotWorld, pose: AircraftPose): number {
  const src = t.src[k]!;
  const i = t.idx[k]!;
  if (src === AA_SRC_DAWN) {
    const ds = w.dawn.strike;
    return ds ? downStrike(ds.state, ds.p, i, pose, src) : -1;
  }
  if (src === AA_SRC_SORTIE) {
    const pa = w.patrol;
    return pa ? downStrike(pa.flight.state, pa.sortie, i, pose, src) : -1;
  }
  const sp = w.seaplane;
  if (!sp) return -1;
  seaplanePose(sp.state, sp.p, pose);
  return downSeaplane(sp.state) ? src : -1;
}

function downStrike(s: AirStrikeState, p: AirStrikeParams, i: number, pose: AircraftPose, src: number): number {
  strikePose(s, p, i, pose);
  return downStrikePlane(s, i) ? src : -1;
}

/** 空襲の波で飛んでいる機（接近〜去る）の数（撃墜の文「残り N 機」） */
export function liveStrikePlanes(s: AirStrikeState): number {
  let n = 0;
  for (let i = 0; i < s.planes.length; i++) {
    const ph = s.planes[i]!.phase;
    if (ph >= AS_INBOUND && ph <= AS_LEAVING) n++;
  }
  return n;
}
