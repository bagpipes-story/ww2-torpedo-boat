// HUD からの入力の消費（v0.3.3 で mission-world から切り出し。中身は v0.3.2 のまま、識別を追加）。毎フレーム 1 回、固定ステップの前に呼ぶ。
// v0.6.1: updateFrame の入力の段（consumeFrameInput）もここへ移した（中身は v0.6.0 のまま）。
import type { BoatState } from '../core/boat-motion';
import type { DamageState } from '../core/gunnery';
import type { InputState } from '../core/input-state';
import { startSmoke, type SmokeParams, type SmokeState } from '../core/smoke';
import type { MissionWorld } from './mission-world';
import type { TorpedoLauncher } from './torpedo-launcher';

/** 発射要求を捨てる（駆逐艦が沈み始めた後・帰投地点の輪の中） */
export function discardFireInput(input: InputState): void {
  input.fireTap = false;
  input.fireSalvoSpreadDeg = NaN;
  input.fireSalvoCount = 0;
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
 * 煙幕ボタンと消火ボタン（docs/02 §5・§6.6。v0.3.1 で別ボタンに）: 煙幕は離したとき（smokeTap）に展開（冷却中は無視）。
 * 消火は火災中に damage.extinguish_hold_s（v0.6.0 で煙幕から移した。煙幕の無い艇でも消せる）以上押し続けると消える。押している時間は燃えている間だけ数える（火災が無いときから押し続けていても、後で起きた火災が即座に消えないように）。消火したら数え直す。
 * holdScale は乗員で伸びる倍率（v0.3.5）。戻り値は押し続けている実秒（呼び出し側が持ち回す）
 */
export function consumeSmokeInput(input: InputState, smoke: SmokeState | null, p: SmokeParams | null, damage: DamageState, extinguishHoldS: number, heldS: number, realDt: number, holdScale: number = 1): number {
  if (input.smokeTap) {
    input.smokeTap = false;
    if (smoke && p) startSmoke(smoke, p);
  }
  if (input.extinguishHeld && damage.fireLeftS > 0) {
    const next = heldS + realDt;
    if (next < extinguishHoldS * holdScale) return next;
    damage.fireLeftS = 0;
  }
  return 0;
}

/** 「識別」（v0.3.3）: 押下は必ず消費する（味方機がいなければ何も起きない） */
export function consumeIdentifyInput(input: InputState, friendly: { identify(): boolean } | null): void {
  if (!input.identifyTap) return;
  input.identifyTap = false;
  friendly?.identify();
}

/** 毎フレームの入力の消費（mission-world の updateFrame から。固定ステップの前に 1 回）: 識別・発射・煙幕と消火・一斉発射の見越し・初発射時の燃料 */
export function consumeFrameInput(w: MissionWorld, realDt: number): void {
  // 識別は沈没中でも消費する（フラグを残さない）。ステップの前なので、猶予が尽きるフレームの押下も間に合う
  consumeIdentifyInput(w.input, w.friendly);
  if (w.boat.sinking) return;
  const g = w.destroyers;
  const boat = w.boat.state;
  // 駆逐艦がすべて沈み始めたか退いた後（v0.6.2）・帰投地点の輪の中・魚雷を使わない任務では発射しない（フラグは消す。輪の中で撃った魚雷が「帰投したので外れ」と記録されないように）。煙幕は漂流中でも使える
  if (!g || g.allOut || w.atHome) discardFireInput(w.input);
  else consumeFireInput(w.input, w.launcher, boat, w.torpedoes.remaining);
  w.extinguishHeldS = consumeSmokeInput(w.input, w.smoke, w.smokeParams, w.damage, w.damageParams.extinguishHoldS, w.extinguishHeldS, realDt, w.extinguishHoldScale);
  // 一斉発射の見越しは最寄りの浮いている艦（すべて沈んでいれば 1 隻目。発射はしない）
  if (g) {
    // 狙う艦は最寄りの浮いている艦。駆逐艦なら KPI に数える（輸送船は数えない。v0.5.0）。夜明けの後に撃った魚雷は数えない（夜戦の調整の根拠を汚さない。v0.6.1）
    const ti = g.nearestAfloatIndex(boat.x, boat.y);
    w.launcher.update(realDt, boat, g.ships[ti < 0 ? 0 : ti]!.state, ti >= 0 && ti < g.destroyerCount && !w.dawn.reached);
  }
  if (Number.isNaN(w.fuelAtFirstLaunchGal) && (w.torpedoes.remaining < w.torpedoes.capacity || (w.hunt !== null && w.hunt.battery.shots > 0))) w.fuelAtFirstLaunchGal = w.fuel.gal;
}
