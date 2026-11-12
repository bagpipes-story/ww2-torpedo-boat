// v0.7.0 S3b（アートと音①：コードで描く絵。spec-v0700 §5.2・§5.3）: 演出の Phaser に依らない式。航跡の姿勢（長さ・α・frame）と艇尾の位置、爆発の部品の膨らみと薄れの曲線、
// 水柱の飛沫と砲口炎の光芒の置き方（絵だけの乱数＝種は呼ぶ側の ART_SEED_FX）。tests/fx-art が確かめる。update で使う式は out へ書くだけ（確保しない＝CLAUDE.md §7）。
import {
  EXPLOSION_PUFF_GROW_FROM, EXPLOSION_PUFF_S, EXPLOSION_SPLASH_ALPHA, EXPLOSION_SPLASH_GROW_FROM, EXPLOSION_SPLASH_S, EXPLOSION_FIRE_ALPHA, EXPLOSION_FIRE_GROW_FROM, EXPLOSION_FIRE_S,
  EXPLOSION_FLASH_S, EXPLOSION_SMALL_FLASH_S, MUZZLE_RAY_LEN, MUZZLE_RAYS, SPLASH_DROPLET_R, SPLASH_DROPLET_RING, SPLASH_DROPLETS,
  WAKE_ALPHA_MAX, WAKE_CRUISE_ALPHA_SHARE, WAKE_FRAME_BUBBLE, WAKE_FRAME_V, WAKE_HIDE_BELOW_MPS, WAKE_HULL_ALPHA_MIN, WAKE_KIND_ART, WAKE_SILENT_ALPHA_MAX, WAKE_SILENT_LEN_HULLS, type WakeKindArt,
} from '../config/fx-art-config';
import { SeededRng } from '../core/rng';

export type WakeKind = keyof typeof WAKE_KIND_ART;
export type SpeedBand = 'stop' | 'silent' | 'cruise' | 'full';

/** 航跡の姿勢（update が out へ書く） */
export interface WakePose {
  visible: boolean;
  /** 世界の長さ m（テクスチャの高さに対する scale は呼ぶ側） */
  lengthM: number;
  alpha: number;
  frame: string;
}

/** 速さのままの船体（僚艇・隊の艇・敵・味方。R1 の自艇以外）: 隠す速さ未満か船体の絵が見えなければ出さない。長さ ∝ 速さ（上限）、α ∝ 速さ / 基準（上限）× 船体の α */
export function wakePose(kind: WakeKindArt, speedMps: number, hullLenM: number, hullVisible: boolean, hullAlpha: number, out: WakePose): WakePose {
  if (!hullVisible || hullAlpha < WAKE_HULL_ALPHA_MIN || speedMps < WAKE_HIDE_BELOW_MPS) {
    out.visible = false;
    return out;
  }
  const share = Math.min(1, speedMps / kind.refMps);
  out.visible = true;
  out.lengthM = Math.min(kind.lenHulls, speedMps * kind.lenPerHullPerMps) * hullLenM;
  out.alpha = WAKE_ALPHA_MAX * share * hullAlpha;
  out.frame = WAKE_FRAME_V;
  return out;
}

/** 自艇（jp_03 は座席の隊長艇）は速力帯で段を決める（R1・D9）: 停止＝なし、静音＝艇尾の小さな泡だけ（V なし・α ≤ 0.12）、巡航＝V、全速＝長く明るい V（長さは速さから） */
export function playerWakePose(band: SpeedBand, kind: WakeKindArt, speedMps: number, hullLenM: number, hullVisible: boolean, hullAlpha: number, out: WakePose): WakePose {
  if (band === 'stop' || !hullVisible || hullAlpha < WAKE_HULL_ALPHA_MIN) {
    out.visible = false;
    return out;
  }
  if (band === 'silent') {
    out.visible = true;
    out.lengthM = WAKE_SILENT_LEN_HULLS * hullLenM;
    out.alpha = WAKE_SILENT_ALPHA_MAX * hullAlpha;
    out.frame = WAKE_FRAME_BUBBLE;
    return out;
  }
  wakePose(kind, Math.max(speedMps, WAKE_HIDE_BELOW_MPS), hullLenM, true, hullAlpha, out);
  out.alpha = WAKE_ALPHA_MAX * (band === 'cruise' ? WAKE_CRUISE_ALPHA_SHARE : 1) * hullAlpha;
  return out;
}

/** 艇尾の位置のずれ（中心から艇首の逆へ半長。方位 0＝北＝上・時計回り）: out[0]＝dx・out[1]＝dy */
export function sternOffsetInto(out: Float32Array, headingDeg: number, halfLenM: number): void {
  const r = (headingDeg * Math.PI) / 180;
  out[0] = -Math.sin(r) * halfLenM;
  out[1] = Math.cos(r) * halfLenM;
}

/** Cubic.easeOut（今の爆発の輪の tween と同じ曲線） */
export function easeOutCubic(t: number): number {
  const u = 1 - Math.min(1, Math.max(0, t));
  return 1 - u * u * u;
}

/** 爆発の部品 1 つの膨らみ（growFrom → 1。easeOut）と α（alpha0 → 0。線形）。age ≥ life なら α 0（呼ぶ側が隠す） */
export function partGrow(age: number, lifeS: number, growFrom: number): number {
  return growFrom + (1 - growFrom) * easeOutCubic(age / lifeS);
}
export function partFade(age: number, lifeS: number, alpha0: number): number {
  return age >= lifeS ? 0 : alpha0 * (1 - age / lifeS);
}
/** 閃光は膨らまず、寿命で線形に消える（0.15 秒・小さい版 0.1 秒） */
export function flashLifeS(small: boolean): number {
  return small ? EXPLOSION_SMALL_FLASH_S : EXPLOSION_FLASH_S;
}
/** 1 枠の寿命（部品の寿命の最大。輪の秒は ui-config の EXPLOSION_DURATION_MS。小さい版は水柱なし＝暗い玉と輪） */
export function slotLifeS(small: boolean, ringS: number): number {
  return Math.max(ringS, small ? Math.max(EXPLOSION_SMALL_FLASH_S, EXPLOSION_PUFF_S) : Math.max(EXPLOSION_FLASH_S, EXPLOSION_FIRE_S, EXPLOSION_SPLASH_S));
}
export const FIRE_GROW = { life: EXPLOSION_FIRE_S, from: EXPLOSION_FIRE_GROW_FROM, alpha0: EXPLOSION_FIRE_ALPHA } as const;
export const SPLASH_GROW = { life: EXPLOSION_SPLASH_S, from: EXPLOSION_SPLASH_GROW_FROM, alpha0: EXPLOSION_SPLASH_ALPHA } as const;
export const PUFF_GROW = { life: EXPLOSION_PUFF_S, from: EXPLOSION_PUFF_GROW_FROM, alpha0: 0.5 } as const;

/** 水柱の水滴（半径 1 の円の中。角は乱数、距離は帯の内、大きさは帯の内）。同じ種なら同じ */
export interface Droplet {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}
export function splashDroplets(seed: number): Droplet[] {
  const rng = new SeededRng(seed);
  const out: Droplet[] = [];
  for (let i = 0; i < SPLASH_DROPLETS; i++) {
    const a = rng.nextRange(0, Math.PI * 2); // 等分にしない（S4。等間隔の輪は線香花火・歯車に見えた）
    const d = rng.nextRange(SPLASH_DROPLET_RING[0], SPLASH_DROPLET_RING[1]);
    out.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: rng.nextRange(SPLASH_DROPLET_R[0], SPLASH_DROPLET_R[1]) });
  }
  return out;
}

/** 砲口炎の光芒（半径 1 に対する長さ。偶数番は長く奇数番は短い＝4 本の長い十字＋4 本の短い斜め） */
export function muzzleRays(): { readonly ang: number; readonly len: number }[] {
  const out: { ang: number; len: number }[] = [];
  for (let i = 0; i < MUZZLE_RAYS; i++) out.push({ ang: (i / MUZZLE_RAYS) * Math.PI * 2, len: i % 2 === 0 ? MUZZLE_RAY_LEN[0] : MUZZLE_RAY_LEN[1] });
  return out;
}
