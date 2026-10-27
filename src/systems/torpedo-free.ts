// どの任務でも魚雷を撃てる（v0.6.8 S2。spec-v068 §1.1 D3・§5.1。ユーザー「魚雷も意味が無くても魚雷艇に搭載しているならユーザーが自由に発射できるべき」）。
// 狙える艦（浮いている駆逐艦・輸送船）が無いとき（駆逐艦のいない任務＝us_03・jp_01・jp_02・jp_05、駆逐艦の任務ですべて出た後）の発射は「狙う艦の無い魚雷」:
// 発射の時に決着（resolved）させる＝記録（ShotRecord）・走査・終わり際の当たり・終わりの待ち・得点・KPI のどれにも入らない。絵は走り、大発・PT の下を抜ける。
// 味方（僚艇・輸送隊・隼艇・味方機）はもともと魚雷の的の配列に無い。乱数は今までの発射管制の +0（1 本 2〜3 回。撃たなければ引かない）だけ。
// 狙える艦がある間の道は v0.6.7 の systems/world-input と同じ文（consumeFireInput も world-input から移した。中身はそのまま）。§7: 確保しない。
import type { BoatState } from '../core/boat-motion';
import { discardFireInput, type InputState } from '../core/input-state';
import type { TorpedoEvents, TorpedoTarget } from '../core/torpedo-targets';
import type { TorpedoLauncher } from './torpedo-launcher';

/** 駆逐艦のいない任務の魚雷の的（空＝当たらず、通過の外れも記録しない） */
export const NO_TORPEDO_TARGETS: readonly TorpedoTarget[] = Object.freeze([]);

/** 狙う艦を選ぶ隊の部分（systems/destroyer-group がそのまま満たす） */
export interface TorpedoAimGroup {
  readonly allOut: boolean;
  readonly destroyerCount: number;
  readonly ships: readonly { readonly state: BoatState }[];
  nearestAfloatIndex(x: number, y: number): number;
}

/** 魚雷のプールの部分（systems/torpedo-pool の TorpedoPool がそのまま満たす。構造の型＝DOM を読む config を引かない） */
export interface FreeTorpedoPool {
  readonly remaining: number;
  step(dt: number, realDt: number, targets: readonly TorpedoTarget[], passRadius2: number, events: TorpedoEvents): void;
}

/** 魚雷の発射に読む世界の部分（MissionWorld がそのまま満たす。tests から作れる） */
export interface FreeTorpedoWorld {
  readonly input: InputState;
  readonly launcher: TorpedoLauncher;
  readonly torpedoes: FreeTorpedoPool;
  readonly boat: { readonly state: BoatState };
  readonly destroyers: TorpedoAimGroup | null;
  readonly atHome: boolean;
  readonly dawn: { readonly reached: boolean };
  /** 狙う艦の無い魚雷を数える（systems/arms-step。無い世界は数えない） */
  readonly arms: { noteBlindTorpedo(): void } | null;
}

/** 狙える艦がある（駆逐艦の隊がいて、すべては出ていない） */
function hasLiveTarget(g: TorpedoAimGroup | null): boolean {
  return g !== null && !g.allOut;
}

/** HUD からの発射要求を消費する。タップは 1 本、一斉は本数（v0.4.8。0 なら残弾すべて）を扇状に（間隔は launcher が持つ） */
export function consumeFireInput(input: InputState, launcher: TorpedoLauncher, boat: BoatState, remaining: number): void {
  if (input.fireTap) {
    input.fireTap = false;
    launcher.queueFan(boat, 1, 0);
  }
  if (!Number.isNaN(input.fireSalvoSpreadDeg)) {
    const spread = input.fireSalvoSpreadDeg;
    const count = input.fireSalvoCount > 0 ? Math.min(input.fireSalvoCount, remaining) : remaining;
    input.fireSalvoSpreadDeg = NaN;
    input.fireSalvoCount = 0;
    launcher.queueFan(boat, count, spread);
  }
}

/**
 * 発射の要求（world-input の consumeFrameInput から毎フレーム）: 帰投地点の輪の中では捨てる（輪の中で撃った魚雷が「帰投したので外れ」と記録されないように。v0.6.7 のまま）。
 * 狙える艦が無ければ輪の中で残りの一斉発射も捨てる（狙う艦の無い一斉発射で帰投の決着待ちを延ばさない）。輪の外ならどの任務でも撃てる（v0.6.7 は狙える艦が無ければ捨てた）
 */
export function consumeTorpedoFire(w: FreeTorpedoWorld): void {
  if (w.atHome) {
    discardFireInput(w.input);
    if (!hasLiveTarget(w.destroyers)) w.launcher.clearQueue();
    return;
  }
  consumeFireInput(w.input, w.launcher, w.boat.state, w.torpedoes.remaining);
}

/**
 * 発射管制を 1 フレーム進める。狙える艦があれば v0.6.7 のまま: 狙う艦は最寄りの浮いている艦。駆逐艦なら KPI に数える（輸送船は数えない。v0.5.0）。夜明けの後に撃った魚雷は数えない（v0.6.1）。
 * 狙える艦が無ければ狙う艦の無い魚雷（発射の時に決着。数えるのは兵装の arms）。待ち行列が空なら何もしない（v0.6.7 の「すべて出た後」は待ち行列が必ず空だった）
 */
export function stepLauncher(w: FreeTorpedoWorld, realDt: number): void {
  const g = w.destroyers;
  const boat = w.boat.state;
  if (g !== null && !g.allOut) {
    const ti = g.nearestAfloatIndex(boat.x, boat.y);
    w.launcher.update(realDt, boat, g.ships[ti < 0 ? 0 : ti]!.state, ti >= 0 && ti < g.destroyerCount && !w.dawn.reached);
    return;
  }
  const s = w.launcher.update(realDt, boat, null, false);
  if (s) {
    s.resolved = true;
    w.arms?.noteBlindTorpedo();
  }
}

/** 駆逐艦のいない任務の固定ステップ（world-enemy-step から）: 走っている魚雷を進める（的は空。決着済みなので外れも記録しない。乱数なし。走っていなければ 4 本ほどの状態を見るだけ） */
export function stepFreeTorpedoes(w: { readonly torpedoes: FreeTorpedoPool; readonly torpedoEvents: TorpedoEvents }, dt: number, feelDt: number): void {
  w.torpedoes.step(dt, feelDt, NO_TORPEDO_TARGETS, 0, w.torpedoEvents);
}
