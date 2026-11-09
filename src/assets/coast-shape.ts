// v0.7.0 S3c（アートと音①：コードで描く絵。spec-v0700 §4.4・R16・R24）: 岸の帯の Phaser に依らない式。帯の区間（陰・壕の絵の幅をよける）、区間を 512 px の帯で継ぎ目なく覆う並べ方、
// 帯の中身（砂浜の幅・寄せ波・陸の際の木々の樹冠。絵だけの乱数・x は周期 COAST_STRIP_LEN_M で折り返す＝どの帯の端も隣と同じ画素）。tests/fx-art-s3c が確かめる。
// 並べ方（Blitter の Bob は拡大できない＝長さは frame の幅で合わせる）: 区間の左は左右反転の帯（左端に x 512 の列＝透明へ落とした端が来る）、右は反転しない帯（右端に x 512）。
// 真ん中に部分の帯を 2 つ（反転と反転なし・どちらも x c〜512）＝鏡の継ぎ目は同じ列 c で続く。帯の間は 0 ≡ 512（周期）で続く。全部の帯で 1 枚おきに反転（R24）。
import {
  COAST_CROWNS, COAST_CROWN_R_M, COAST_SAND_M, COAST_SAND_WAVE_M, COAST_STRIP_FADE_M, COAST_STRIP_LAND_M, COAST_STRIP_LEN_M, COAST_STRIP_SEA_M,
} from '../config/sea-art-config';
import { SeededRng } from '../core/rng';

/** 区間 [x0, x1] から cuts（中心 ± 半幅）を除いた区間（短すぎる区間は捨てる） */
export function coastSegments(x0: number, x1: number, cuts: readonly (readonly [number, number])[]): [number, number][] {
  const sorted = cuts.map(([c, h]) => [c - h, c + h] as const).sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  let a = x0;
  for (const [l, r] of sorted) {
    if (r <= a) continue;
    if (l > a) out.push([a, Math.min(l, x1)]);
    a = Math.max(a, r);
    if (a >= x1) break;
  }
  if (a < x1) out.push([a, x1]);
  return out.filter(([l, r]) => r - l >= COAST_STRIP_FADE_M * 4);
}

/** 帯 1 つ（Bob）: 左端の x m・frame の行（0 そのまま・1 右端の COAST_STRIP_FADE_M を透明へ）・frame の x の始まり px・幅 px・左右反転 */
export interface CoastBob {
  readonly x: number;
  readonly row: 0 | 1;
  readonly cut: number;
  readonly w: number;
  readonly flipX: boolean;
}

/** 区間 [a, b]（m＝px。1.0 px/m）を帯で覆う。両端は透明へ落とした端（行 1 の x 512 の列） */
export function coastBobs(a: number, b: number): CoastBob[] {
  const P = COAST_STRIP_LEN_M;
  const len = Math.round(b - a);
  const m = Math.floor(len / P);
  const r = len - m * P;
  const out: CoastBob[] = [];
  // 帯の並び（左から）: 反転の満帯 nl・部分 2 つ・反転なしの満帯 nr。部分が無い時（r 0）は満帯だけ
  const parts = r > 0 ? [Math.floor(r / 2), r - Math.floor(r / 2)] : [];
  const nl = parts.length > 0 ? Math.floor(m / 2) : Math.ceil(m / 2);
  const total = m + parts.length;
  let x = a;
  let idx = 0;
  const push = (w: number, flipX: boolean): void => {
    const end = idx === 0 ? flipX : idx === total - 1 ? !flipX : false; // 透明の端（x 512 の列）が区間の端に来る帯だけ行 1
    out.push({ x, row: end ? 1 : 0, cut: P - w, w, flipX });
    x += w;
    idx++;
  };
  for (let i = 0; i < nl; i++) push(P, i % 2 === 0); // 左の満帯: 左端の帯が反転（1 枚おき）
  if (parts.length > 0) {
    push(parts[0]!, true);
    push(parts[1]!, false);
  }
  for (let i = 0; i < m - nl; i++) push(P, (m - nl - 1 - i) % 2 === 1); // 右の満帯: 右端の帯が反転なし（1 枚おき）
  return out;
}

/** 帯の中身（px＝m。y は帯の上端＝海の側から。波打ち際は y COAST_STRIP_SEA_M） */
export interface CoastCrown {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly shade: number;
}
export interface CoastPlan {
  /** 砂浜の幅 m（x 0〜512 の 1 m ごと。周期で続く） */
  readonly sand: Float32Array;
  /** 寄せ波の白の揺れ m（x ごと） */
  readonly surf: Float32Array;
  readonly crowns: readonly CoastCrown[];
}
export function coastPlan(seed: number): CoastPlan {
  const P = COAST_STRIP_LEN_M;
  const rng = new SeededRng(seed);
  const ph = [rng.nextRange(0, 6.28), rng.nextRange(0, 6.28), rng.nextRange(0, 6.28), rng.nextRange(0, 6.28)];
  const sand = new Float32Array(P + 1);
  const surf = new Float32Array(P + 1);
  for (let x = 0; x <= P; x++) {
    const u = (x / P) * Math.PI * 2; // 周期の山の数は整数＝x 0 と 512 で同じ
    sand[x] = COAST_SAND_M + COAST_SAND_WAVE_M * (0.6 * Math.sin(2 * u + ph[0]!) + 0.4 * Math.sin(5 * u + ph[1]!));
    surf[x] = 1.2 * Math.sin(3 * u + ph[2]!) + 0.8 * Math.sin(7 * u + ph[3]!);
  }
  const crowns: CoastCrown[] = [];
  for (let i = 0; i < COAST_CROWNS; i++) {
    const x = rng.nextRange(0, P);
    const deep = rng.next() ** 1.6; // 陸の際に多く、奥へ疎ら
    const edge = COAST_STRIP_SEA_M + sand[Math.floor(x)]!;
    const r = rng.nextRange(COAST_CROWN_R_M[0], COAST_CROWN_R_M[1]);
    crowns.push({ x, y: edge + r * 0.4 + deep * (COAST_STRIP_LAND_M - sand[Math.floor(x)]! - r * 1.4), r, shade: rng.next() });
  }
  crowns.sort((p, q) => p.y - q.y);
  return { sand, surf, crowns };
}
