// v0.7.0 S3c（アートと音①：コードで描く絵。spec-v0700 §5.5・R2・R32）: 探照灯・星弾・煙幕の絵の画素ごとの α と色（Phaser に依らない式）。assets/light-art が Boot で 1 回だけ
// ImageData に書いてテクスチャにする。鍵・寸法・原点は v0.6.11 のまま（scale は論理の射程・照明半径・煙の半径から＝見える広さ＝論理の広さ）。tests/fx-art-s3c が tex-ab の CHECK と同じ数え方で確かめる。
import {
  SL_EDGE_ALPHA, SL_FULL_TO, SL_HOT_TO, SL_SOFT_SHARE, SL_TIP_ALPHA, SMOKE_LUMP, SMOKE_LUMP_TO, SMOKE_PROFILE, SS_CORE_R, SS_PLATEAU, SS_RIM_FROM, SS_RIM_PEAK,
} from '../config/fx-art-config';

const smooth = (t: number): number => {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
};

/** 探照灯の α: t＝光源からの長さの割合（0 光源 → 1 先端）、u＝中心線からの横の割合（1 が扇の縁＝論理の角）、outPx＝縁の外へ出た px（内は ≤ 0。1 px で 0 へ） */
export function searchlightAlphaAt(t: number, u: number, outPx: number): number {
  const along = t <= SL_FULL_TO ? 1 : 1 - ((1 - SL_TIP_ALPHA) * (t - SL_FULL_TO)) / (1 - SL_FULL_TO);
  const soft = 1 - SL_SOFT_SHARE;
  const across = u <= soft ? 1 : 1 - (1 - SL_EDGE_ALPHA) * Math.min(1, (u - soft) / SL_SOFT_SHARE);
  const aa = outPx <= 0 ? 1 : Math.max(0, 1 - outPx);
  return along * across * aa;
}

/** 星弾の α: r＝中心からの距離 / 照明半径、outPx＝照明半径の外へ出た px（縁は 1 px で 0。中は芯 → 平らな面 → 明るい細い縁） */
export function starshellAlphaAt(r: number, outPx: number): number {
  let a = SS_PLATEAU + (1 - SS_PLATEAU) * (1 - smooth(r / SS_CORE_R));
  if (r >= SS_RIM_FROM) a = SS_PLATEAU + (SS_RIM_PEAK - SS_PLATEAU) * Math.sin((Math.PI * Math.min(1, (r - SS_RIM_FROM) / (1 - SS_RIM_FROM))) / 1.25);
  return outPx <= 0 ? a : a * Math.max(0, 1 - outPx);
}

/** 煙幕の半径ごとの α（折れ線） */
export function smokeProfileAt(r: number): number {
  const P = SMOKE_PROFILE;
  if (r >= P[P.length - 1]![0]) return 0;
  for (let i = 1; i < P.length; i++) {
    const [r1, a1] = P[i]!;
    if (r <= r1) {
      const [r0, a0] = P[i - 1]!;
      return a0 + ((a1 - a0) * (r - r0)) / (r1 - r0);
    }
  }
  return 0;
}

/** 煙幕の α: dx・dy は半径を 1 とした中心からの位置。角度の山（3 つと 5 つ）は輪ごとの平均が 1＝帯の α を変えずに塊に見せる。半径の SMOKE_LUMP_TO の外は山なし（輪郭は丸） */
export function smokeAlphaAt(dx: number, dy: number): number {
  const r = Math.hypot(dx, dy);
  const base = smokeProfileAt(r);
  if (base <= 0) return 0;
  const th = Math.atan2(dy, dx);
  const amp = SMOKE_LUMP * Math.sin(Math.PI * Math.min(1, r / SMOKE_LUMP_TO));
  const lump = 0.6 * Math.cos(3 * th + 0.7) + 0.4 * Math.cos(5 * th + 2.1 + r * 3);
  return Math.min(1, base * (1 + amp * lump));
}

/** 色（0xrrggbb）を白へ t だけ寄せた r・g・b */
function toward(color: number, t: number, out: Uint8ClampedArray, i: number): void {
  out[i] = ((color >> 16) & 255) + (255 - ((color >> 16) & 255)) * t;
  out[i + 1] = ((color >> 8) & 255) + (255 - ((color >> 8) & 255)) * t;
  out[i + 2] = (color & 255) + (255 - (color & 255)) * t;
}

/** 探照灯の画素（W × H・光源は下端の中央・光は上へ。halfW は先端の行の半幅 px＝論理の角 × 長さ） */
export function searchlightPixels(W: number, H: number, halfW: number, color: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(W * H * 4);
  const cx = W / 2;
  for (let y = 0; y < H; y++) {
    const t = (H - (y + 0.5)) / H;
    const hw = halfW * t;
    for (let x = 0; x < W; x++) {
      const dx = Math.abs(x + 0.5 - cx);
      const i = (y * W + x) * 4;
      const u = hw > 0 ? dx / hw : 2;
      toward(color, t < SL_HOT_TO && u < 0.6 ? (1 - t / SL_HOT_TO) * (1 - u / 0.6) : 0, px, i);
      px[i + 3] = Math.round(255 * searchlightAlphaAt(t, u, dx - hw));
    }
  }
  return px;
}

/** 星弾の画素（d × d・照明半径 R px） */
export function starshellPixels(d: number, R: number, color: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(d * d * 4);
  const c = d / 2;
  for (let y = 0; y < d; y++) {
    for (let x = 0; x < d; x++) {
      const dist = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      const r = dist / R;
      const i = (y * d + x) * 4;
      toward(color, r < SS_CORE_R ? 0.6 * (1 - smooth(r / SS_CORE_R)) : r >= SS_RIM_FROM ? 0.25 : 0, px, i);
      px[i + 3] = Math.round(255 * starshellAlphaAt(r, dist - R));
    }
  }
  return px;
}

/** 煙幕の画素（d × d・煙の半径 R px） */
export function smokePixels(d: number, R: number, color: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(d * d * 4);
  const c = d / 2;
  for (let y = 0; y < d; y++) {
    for (let x = 0; x < d; x++) {
      const i = (y * d + x) * 4;
      const dx = (x + 0.5 - c) / R;
      const dy = (y + 0.5 - c) / R;
      const a = smokeAlphaAt(dx, dy);
      // 塊の明るい側を少し明るく（色だけ・±6%。回らない絵だが向きの光は焼かない＝中心の明るさの差だけ）
      toward(color, Math.max(0, 0.12 * (a - smokeProfileAt(Math.hypot(dx, dy)))), px, i);
      px[i + 3] = Math.round(255 * a);
    }
  }
  return px;
}
