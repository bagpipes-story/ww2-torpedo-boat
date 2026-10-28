// HUD からの入力の消費（v0.3.3 で mission-world から切り出し。中身は v0.3.2 のまま、識別を追加）。毎フレーム 1 回、固定ステップの前に呼ぶ。
// v0.6.1: updateFrame の入力の段（consumeFrameInput）もここへ移した（中身は v0.6.0 のまま）。
// v0.6.8 S2: 魚雷の発射（要求の消費と発射管制）は systems/torpedo-free（どの任務でも撃てる。狙える艦がある間の文は同じ）。
import type { DamageState } from '../core/gunnery';
import { discardFireInput, type InputState } from '../core/input-state';
import { startSmoke, type SmokeParams, type SmokeState } from '../core/smoke';
import type { MissionWorld } from './mission-world';
import { consumeFireInput, consumeTorpedoFire, stepLauncher } from './torpedo-free';

export { discardFireInput }; // 発射要求を捨てる（core/input-state へ移した。v0.6.2 実機 1 回目）
export { consumeFireInput }; // HUD からの発射要求の消費（v0.6.8 S2 で systems/torpedo-free へ移した。中身はそのまま）

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
  // 帰投地点の輪の中では発射しない（フラグは消す。輪の中で撃った魚雷が「帰投したので外れ」と記録されないように）。v0.6.8 から輪の外ならどの任務でも撃てる（狙える艦が無ければ狙う艦の無い魚雷）。煙幕は漂流中でも使える
  consumeTorpedoFire(w);
  w.extinguishHeldS = consumeSmokeInput(w.input, w.smoke, w.smokeParams, w.damage, w.damageParams.extinguishHoldS, w.extinguishHeldS, realDt, w.extinguishHoldScale);
  stepLauncher(w, realDt); // 発射管制（狙う艦は最寄りの浮いている艦。無ければ狙う艦の無い魚雷を発射の時に決着させて数える）
  // 初発射時の燃料（Result）: 主兵装の魚雷（狙う艦の無い魚雷は除く。v0.6.8。この前の stepLauncher が同じフレームに数える）か大発への射撃
  if (Number.isNaN(w.fuelAtFirstLaunchGal) && ((w.setup.mainWeapon === 'torpedo' && w.torpedoes.remaining + (w.arms ? w.arms.blindTorpedoes : 0) < w.torpedoes.capacity) || (w.hunt !== null && w.hunt.battery.shots > 0))) w.fuelAtFirstLaunchGal = w.fuel.gal;
}
