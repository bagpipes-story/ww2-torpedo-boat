// HUD からの入力の消費（v0.3.3 で mission-world から切り出し。中身は v0.3.2 のまま、識別を追加）。毎フレーム 1 回、固定ステップの前に呼ぶ。
import type { BoatState } from '../core/boat-motion';
import type { DamageState } from '../core/gunnery';
import type { InputState } from '../core/input-state';
import { startSmoke, type SmokeParams, type SmokeState } from '../core/smoke';
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
 * 消火は火災中に extinguish_hold_s 以上押し続けると消える。押している時間は燃えている間だけ数える（火災が無いときから押し続けていても、後で起きた火災が即座に消えないように）。消火したら数え直す。
 * holdScale は乗員で伸びる倍率（v0.3.5）。戻り値は押し続けている実秒（呼び出し側が持ち回す）
 */
export function consumeSmokeInput(input: InputState, smoke: SmokeState | null, p: SmokeParams | null, damage: DamageState, heldS: number, realDt: number, holdScale: number = 1): number {
  if (input.smokeTap) {
    input.smokeTap = false;
    if (smoke && p) startSmoke(smoke, p);
  }
  if (input.extinguishHeld && p && damage.fireLeftS > 0) {
    const next = heldS + realDt;
    if (next < p.extinguishHoldS * holdScale) return next;
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
