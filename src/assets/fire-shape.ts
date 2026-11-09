// v0.7.0 S3c（アートと音①：コードで描く絵。spec-v0700 §5.4・R10・R26）: 炎と煙の Phaser に依らない式。発生源の枠の選び方（決まった順・続いている枠は保つ）、
// 炎の直径とちらつき、煙の玉の半径と α（持ち主が見えなくなれば FIRE_HIDE_AFTER_S で消える）、炎の舌の置き方（絵だけの乱数）。tests/fx-art-s3c が確かめる。
// update で使う式は out へ書くか数を返すだけ（確保しない＝CLAUDE.md §7）。
import {
  FIRE_HIDE_AFTER_S, FIRE_PUFF_BOAT_RADIUS_M, FIRE_PUFF_HOLD_SHARE, FIRE_PUFF_GROW_FROM, FIRE_SMOKE_MAX_ALPHA, FIRE_SMOKE_MAX_RADIUS_M, FLAME_ALPHA, FLAME_BEAM_SHARE, FLAME_FLICKER_S, FLAME_MAX_DIAMETER_M,
  FLAME_SCALE_SWING, FLAME_TONGUES,
} from '../config/fx-art-config';
import { SeededRng } from '../core/rng';

/**
 * 発生源の枠を割り当てる: 燃えていない発生源の枠を空け、燃えている発生源を決まった順（自艇が 0 番）で空いた枠へ。続いて燃えている発生源は同じ枠のまま（炎がちらつかない）。
 * active[i]＝発生源 i が燃えている（1）、slotOf[i]＝発生源 i の枠（−1 なし）、probeOf[s]＝枠 s の発生源（−1 空き）。どちらも書き換える。枠の数を返す
 */
export function assignFireSlots(active: Uint8Array, slotOf: Int16Array, probeOf: Int16Array): number {
  let used = 0;
  for (let s = 0; s < probeOf.length; s++) {
    const p = probeOf[s]!;
    if (p >= 0 && !active[p]) {
      probeOf[s] = -1;
      slotOf[p] = -1;
    }
  }
  for (let i = 0; i < active.length; i++) {
    if (!active[i] || slotOf[i]! >= 0) continue;
    for (let s = 0; s < probeOf.length; s++) {
      if (probeOf[s]! >= 0) continue;
      probeOf[s] = i;
      slotOf[i] = s;
      break;
    }
  }
  for (let s = 0; s < probeOf.length; s++) if (probeOf[s]! >= 0) used++;
  return used;
}

/** 炎の直径 m（船幅 × 割合、上限つき＝小艇で船体の色を覆わない） */
export function flameDiameterM(beamM: number): number {
  return Math.min(FLAME_MAX_DIAMETER_M, beamM * FLAME_BEAM_SHARE);
}

/** 煙の玉の半径の上限 m（小艇は小さく・艦も FIRE_SMOKE_MAX_RADIUS_M まで＝煙幕の 1/4。R10） */
export function puffMaxRadiusM(ship: boolean): number {
  return ship ? FIRE_SMOKE_MAX_RADIUS_M : Math.min(FIRE_SMOKE_MAX_RADIUS_M, FIRE_PUFF_BOAT_RADIUS_M);
}

/** 炎のちらつき（実秒 t・枠ごとの位相）: out[0]＝α、out[1]＝大きさの倍率 */
export function flameFlicker(t: number, phase: number, out: Float32Array): Float32Array {
  const w = (2 * Math.PI) / FLAME_FLICKER_S;
  const s = 0.6 * Math.sin(w * t + phase) + 0.4 * Math.sin(w * 2.3 * t + phase * 1.7);
  out[0] = FLAME_ALPHA[0] + (FLAME_ALPHA[1] - FLAME_ALPHA[0]) * (0.5 + 0.5 * s);
  out[1] = 1 + FLAME_SCALE_SWING * s;
  return out;
}

/** 煙の玉の半径 m（膨らむ: 始まりの割合 → 1。easeOut） */
export function puffRadiusM(age: number, life: number, maxR: number): number {
  const t = Math.min(1, Math.max(0, age / life));
  return maxR * (FIRE_PUFF_GROW_FROM + (1 - FIRE_PUFF_GROW_FROM) * (1 - (1 - t) * (1 - t)));
}

/** 煙の玉の α（0.15 秒で濃くなり、寿命の FIRE_PUFF_HOLD_SHARE まで保ち、寿命で薄れる。持ち主が見えなくなってからの秒 hiddenS で FIRE_HIDE_AFTER_S かけて 0＝R26）。≤ FIRE_SMOKE_MAX_ALPHA */
export function puffAlpha(age: number, life: number, hiddenS: number): number {
  if (age >= life || hiddenS >= FIRE_HIDE_AFTER_S) return 0;
  const rise = Math.min(1, age / 0.15);
  const hold = life * FIRE_PUFF_HOLD_SHARE; // ここまでは濃いまま（夜の海で尾が読めるように）
  const fall = 1 - Math.max(0, age - hold) / (life - hold);
  return FIRE_SMOKE_MAX_ALPHA * Math.min(rise, fall) * (1 - hiddenS / FIRE_HIDE_AFTER_S);
}

/** 炎の舌（frame ごと。中心からの向きと長さ・太さ＝半径 1 に対する割合）。frame ごとに違う種＝2 枚を替えて揺らぐ */
export interface FlameTongue {
  readonly ang: number;
  readonly len: number;
  readonly w: number;
}
export function flameTongues(seed: number, frame: number): FlameTongue[] {
  const rng = new SeededRng(seed + 31 * (frame + 1));
  const out: FlameTongue[] = [];
  const base = rng.nextRange(0, Math.PI * 2);
  for (let i = 0; i < FLAME_TONGUES; i++) {
    out.push({ ang: base + (i / FLAME_TONGUES) * Math.PI * 2 + rng.nextRange(-0.35, 0.35), len: rng.nextRange(0.55, 0.95), w: rng.nextRange(0.16, 0.26) });
  }
  return out;
}
