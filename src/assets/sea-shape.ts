// v0.7.0 S3a（アートと音①：コードで描く絵。spec-v0700 §5.1・§5.6）: 海の面の Phaser に依らない部分。
// - 海の面のタイル（tex-sea-tile 512 × 512 px）の画素（IP1a。ユーザーの U2「波の模様が波に見えずにゴミのように見えます」）: 散らした波頭の弧（S3a）をやめ、
//   周期の縁で合う正弦の波の和（整数の山の数＝継ぎ目なし）で、長いうねり・中くらいの波・細かいさざ波を重ね、ゆるい座標のゆがみで波の筋をうねらせる。
//   明るさは うねりの山（尖らせる）＋波の山の泡（高い所だけ柔らかく）、谷は暗く（昼の海で効く）。白と黒の α で描き、表示側の tint × α で色（assets/sea-art が ImageData に書く）。
//   波の選び方は絵だけの SeededRng（ART_SEED_SEA）。同じ種なら同じ画素。短く硬い筆の線は描かない。
// - 海の TileSprite の升（世界の座標。周期の倍数に揃え、camera.worldView ＋ 余白を覆う。R5）、夜明けの光の α（0.22 × sin(π × 段/16)。R4）、きらめきの明滅と置き直し（R9）。
// systems/sea-fx が毎フレーム使う式はここ（tests/sea-art で検査）。
import { DAWN_GLOW_ALPHA_MAX, GLINT_PERIOD_MIN_S, GLINT_SWING_MAX, SEA_ART_PX_PER_M, SEA_TEX, SEA_TILE_PERIOD_M, type SeaBandArt, type SeaTexArt } from '../config/sea-art-config';
import { SeededRng } from '../core/rng';

/** タイルの 1 辺 px（512＝2 の累乗。WebGL の REPEAT で貼れる） */
export const SEA_TILE_TEX_PX = SEA_TILE_PERIOD_M * SEA_ART_PX_PER_M;

/** 波 1 つ: sin(kx·x ＋ ky·y ＋ phase) × amp（x・y は px。k は 2π × 整数 / タイルの px＝タイルの縁で合う）。n・m は整数の山の数 */
export interface SeaWave {
  readonly n: number;
  readonly m: number;
  readonly kx: number;
  readonly ky: number;
  readonly amp: number;
  readonly phase: number;
}
/** 波の組（うねり・波・さざ波・座標のゆがみ x と y）。振幅は組ごとに和が 1 */
export interface SeaWaveSet {
  readonly swell: readonly SeaWave[];
  readonly chop: readonly SeaWave[];
  readonly ripple: readonly SeaWave[];
  readonly warpX: readonly SeaWave[];
  readonly warpY: readonly SeaWave[];
}

const TAU = Math.PI * 2;
/** 向きの差（180° の周期＝波の向きは ±k で同じ。−90〜90） */
export function dirDiffDeg(a: number, b: number): number {
  const d = (((a - b) % 180) + 180) % 180;
  return d > 90 ? d - 180 : d;
}

/** 帯（波長 m・向き ± 広がり）に入る整数の山の組から n 個を乱数で（重ならない）。振幅 ∝ (波長/上限)^pow × 乱れ、和を 1 に。size は周期 m（k は m あたり） */
function pickWaves(rng: SeededRng, b: SeaBandArt, dirDeg: number, size: number): SeaWave[] {
  const cands: [number, number][] = [];
  const top = Math.ceil(size / b.lamM[0]);
  for (let m = 0; m <= top; m++) {
    for (let n = -top; n <= top; n++) {
      if (m === 0 && n <= 0) continue; // 半分の面（±k は同じ波）
      const lam = size / Math.hypot(n, m);
      if (lam < b.lamM[0] || lam > b.lamM[1]) continue;
      if (Math.abs(dirDiffDeg((Math.atan2(m, n) * 180) / Math.PI, dirDeg)) > b.spreadDeg) continue;
      cands.push([n, m]);
    }
  }
  const out: SeaWave[] = [];
  let sum = 0;
  for (let i = 0; i < b.count && cands.length > 0; i++) {
    const [n, m] = cands.splice(Math.floor(rng.next() * cands.length), 1)[0]!;
    const amp = ((size / Math.hypot(n, m)) / b.lamM[1]) ** b.ampPow * rng.nextRange(0.7, 1);
    sum += amp;
    out.push({ n, m, kx: (TAU * n) / size, ky: (TAU * m) / size, amp, phase: rng.next() * TAU });
  }
  return out.map((w) => ({ ...w, amp: w.amp / sum }));
}

/** 波の組（同じ seed なら同じ。座標は m＝周期 SEA_TILE_PERIOD_M）。うねりは波の進む向き ± 狭く、波・さざ波は広く。ゆがみは山 1〜2 つの緩い波 */
export function seaWaveSet(seed: number, t: SeaTexArt = SEA_TEX, size = SEA_TILE_PERIOD_M): SeaWaveSet {
  const rng = new SeededRng(seed);
  return {
    swell: pickWaves(rng, t.swell, t.dirDeg, size),
    chop: pickWaves(rng, t.chop, t.dirDeg, size),
    ripple: pickWaves(rng, t.ripple, t.dirDeg, size),
    warpX: pickWaves(rng, t.warp, t.dirDeg + 90, size),
    warpY: pickWaves(rng, t.warp, t.dirDeg, size),
  };
}

/** sin の表（タイルを描く 1M 画素 × 約 30 の波を速く。誤差 ≤ 0.0016＝画素の 1/255 未満） */
const LUT_N = 4096;
const LUT_MASK = LUT_N - 1;
const LUT_K = LUT_N / TAU;
const SIN_LUT = new Float32Array(LUT_N);
for (let i = 0; i < LUT_N; i++) SIN_LUT[i] = Math.sin(i / LUT_K);

/** 波の組を表の引数の形に（[kx, ky, phase] × 表の倍率・amp × gain の 4 つずつ） */
function packWaves(ws: readonly SeaWave[], gain: number): Float32Array {
  const p = new Float32Array(ws.length * 4);
  ws.forEach((w, i) => p.set([w.kx * LUT_K, w.ky * LUT_K, w.phase * LUT_K, w.amp * gain], i * 4));
  return p;
}
function sumPacked(p: Float32Array, x: number, y: number): number {
  let s = 0;
  for (let i = 0; i < p.length; i += 4) s += p[i + 3]! * SIN_LUT[(p[i]! * x + p[i + 1]! * y + p[i + 2]!) & LUT_MASK]!;
  return s;
}
function sumExact(ws: readonly SeaWave[], x: number, y: number): number {
  let s = 0;
  for (let i = 0; i < ws.length; i++) s += ws[i]!.amp * Math.sin(ws[i]!.kx * x + ws[i]!.ky * y + ws[i]!.phase);
  return s;
}

/** 滑らかな段（e0 → e1 で 0 → 1） */
export function smoothstep(e0: number, e1: number, x: number): number {
  const u = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return u * u * (3 - 2 * u);
}
const clamp1 = (v: number): number => (v < -1 ? -1 : v > 1 ? 1 : v);

/** 表の形にした波の組（タイルを描く時・世界の絵を作る時に 1 回） */
interface PackedSet {
  readonly swell: Float32Array;
  readonly chop: Float32Array;
  readonly ripple: Float32Array;
}
function pack(set: SeaWaveSet, t: SeaTexArt): PackedSet {
  return { swell: packWaves(set.swell, t.swellGain), chop: packWaves(set.chop, t.chopGain), ripple: packWaves(set.ripple, 1) };
}
/** 海の面の式（波の組と表の形。systems/sea-fx が世界の絵を作る時に 1 回作り、きらめきを波頭に置く時に seaShadeInto で読む） */
export interface SeaField {
  readonly set: SeaWaveSet;
  readonly packed: PackedSet;
  readonly t: SeaTexArt;
}
export function seaField(seed: number, t: SeaTexArt = SEA_TEX): SeaField {
  const set = seaWaveSet(seed, t);
  return { set, packed: pack(set, t), t };
}

/**
 * ゆがめた座標 (qx, qy) の明るさを out へ: [0]＝うねりの明暗（−1〜1。緩い帯）・[1]＝波頭（0〜1。うねりの山を尖らせた筋 ＋ 波 ＋ さざ波）・[2]＝泡（0〜1。高い所だけ）
 */
function shadeAt(out: Float32Array, p: PackedSet, qx: number, qy: number, t: SeaTexArt): void {
  const sw = clamp1(sumPacked(p.swell, qx, qy));
  const ch = clamp1(sumPacked(p.chop, qx, qy));
  const rp = sumPacked(p.ripple, qx, qy);
  const u = (sw + 1) / 2;
  const crest = 2 * u * (1 - t.crestBend + t.crestBend * u) - 1; // u と u² の間（山は細く谷は広い）。冪（**）は 1 画素に重い
  const lift = 1 - t.chopOnSwell + t.chopOnSwell * (sw > 0 ? sw : 0);
  const v = t.mix[0] * crest + t.mix[1] * ch * lift + t.mix[2] * rp;
  out[0] = sw;
  out[1] = v > 0 ? (v > 1 ? 1 : v) : 0;
  out[2] = smoothstep(t.foam[0], t.foam[1], 0.55 * sw + 0.45 * ch + 0.15 * rp);
}

/** タイルの (x, y) m の明るさ（out は 3 つ。確保しない＝きらめきを波頭に置き直す時に update から呼ぶ）。ゆがみはそのまま計算する */
export function seaShadeInto(out: Float32Array, f: SeaField, x: number, y: number): void {
  const t = f.t;
  shadeAt(out, f.packed, x + t.warpM * sumExact(f.set.warpX, x, y), y + t.warpM * sumExact(f.set.warpY, x, y), t);
}

/** きらめき・白波を置く所の点（波頭 ＋ 泡。0〜2） */
export function seaCrestScore(out: Float32Array, f: SeaField, x: number, y: number): number {
  seaShadeInto(out, f, x, y);
  return out[1]! + out[2]!;
}

/** 1 画素の (灰 0〜1, α 0〜1): 白＝下地 ＋ うねりの帯（明るい側）＋ 波頭 ＋ 泡、黒＝うねりの谷（α だけ。昼の海で効く）。表示は tint × α */
export function seaPixel(sw: number, crest: number, foam: number, t: SeaTexArt = SEA_TEX): [number, number] {
  const L = t.base + t.band * (0.5 + 0.5 * sw) + t.light * crest + t.foamAlpha * foam;
  const D = t.dark * (sw < 0 ? -sw : 0);
  const a = Math.min(1, L + D);
  return [a > 0 ? Math.min(1, L / a) : 1, a];
}

/** ゆがみの粗い格子の間隔 px（ゆがみの波は山 1〜2 つ＝格子の 1 次の補間で十分） */
const WARP_STEP = 16;

/** タイルの画素（RGBA・size × size px＝周期 SEA_TILE_PERIOD_M を size px に。同じ seed なら同じ。縁は周期で合う＝波の山の数が整数・ゆがみも周期） */
export function seaTilePixels(seed: number, t: SeaTexArt = SEA_TEX, size = SEA_TILE_TEX_PX): Uint8ClampedArray {
  const set = seaWaveSet(seed, t);
  const m = SEA_TILE_PERIOD_M / size; // 1 px の m
  const p = pack(set, t);
  const g = size / WARP_STEP + 1;
  const wx = new Float32Array(g * g);
  const wy = new Float32Array(g * g);
  for (let j = 0; j < g; j++) {
    for (let i = 0; i < g; i++) {
      wx[j * g + i] = t.warpM * sumExact(set.warpX, i * WARP_STEP * m, j * WARP_STEP * m);
      wy[j * g + i] = t.warpM * sumExact(set.warpY, i * WARP_STEP * m, j * WARP_STEP * m);
    }
  }
  const px = new Uint8ClampedArray(size * size * 4);
  const o = new Float32Array(3);
  for (let y = 0; y < size; y++) {
    const j = Math.floor(y / WARP_STEP);
    const fy = (y - j * WARP_STEP) / WARP_STEP;
    for (let x = 0; x < size; x++) {
      const i = Math.floor(x / WARP_STEP);
      const fx = (x - i * WARP_STEP) / WARP_STEP;
      const k = j * g + i;
      const dx = (wx[k]! * (1 - fx) + wx[k + 1]! * fx) * (1 - fy) + (wx[k + g]! * (1 - fx) + wx[k + g + 1]! * fx) * fy;
      const dy = (wy[k]! * (1 - fx) + wy[k + 1]! * fx) * (1 - fy) + (wy[k + g]! * (1 - fx) + wy[k + g + 1]! * fx) * fy;
      shadeAt(o, p, x * m + dx, y * m + dy, t);
      const sw = o[0]!;
      const L = t.base + t.band * (0.5 + 0.5 * sw) + t.light * o[1]! + t.foamAlpha * o[2]!;
      const a = Math.min(1, L + (sw < 0 ? -sw * t.dark : 0));
      const q = (y * size + x) * 4;
      px[q] = px[q + 1] = px[q + 2] = Math.round(255 * (a > 0 ? Math.min(1, L / a) : 1));
      px[q + 3] = Math.round(255 * a);
    }
  }
  return px;
}

/** 海の TileSprite の升（周期の単位。out に [左, 上, 横の数, 縦の数] を書く＝毎フレーム呼んでも確保しない）: 左上は view − margin を含む period の倍数、数は view ＋ margin を覆うだけ */
export function seaCellInto(out: Int32Array, viewX: number, viewY: number, viewW: number, viewH: number, period: number, margin: number): void {
  const cx = Math.floor((viewX - margin) / period);
  const cy = Math.floor((viewY - margin) / period);
  out[0] = cx;
  out[1] = cy;
  out[2] = Math.ceil((viewX + viewW + margin) / period) - cx;
  out[3] = Math.ceil((viewY + viewH + margin) / period) - cy;
}

/** 波の流れ（tilePosition の px。周期 size で折り返す＝浮動小数の桁を保つ）: 模様が向き dirDeg へ mps m/秒で動くように、tile の位置を逆へ */
export function seaDriftInto(out: Float32Array, dtS: number, dirDeg: number, mps: number, pxPerM: number, size: number): void {
  const r = (dirDeg * Math.PI) / 180;
  const nx = out[0]! - Math.cos(r) * mps * pxPerM * dtS;
  const ny = out[1]! - Math.sin(r) * mps * pxPerM * dtS;
  out[0] = ((nx % size) + size) % size;
  out[1] = ((ny % size) + size) % size;
}

/** 夜明けの光の α: 夜 0・移り変わりの中ほどで最大・昼 0（R4）。昼から始まる任務（dayStart）は 0。段は 0〜steps */
export function dawnGlowAlpha(step: number, steps: number, dayStart: boolean): number {
  if (dayStart || step <= 0 || step >= steps) return 0;
  return DAWN_GLOW_ALPHA_MAX * Math.sin((Math.PI * step) / steps);
}

/** 2 色の線形の混ぜ（f 0 → a・1 → b） */
export function mixRgb(a: number, b: number, f: number): number {
  const ch = (sh: number): number => Math.round(((a >> sh) & 0xff) + (((b >> sh) & 0xff) - ((a >> sh) & 0xff)) * f);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** きらめきの明滅（1 − swing × (0.5 + 0.5 sin)。1 − swing 〜 1 の間。周期 ≥ GLINT_PERIOD_MIN_S・swing ≤ GLINT_SWING_MAX） */
export function glintBlink(t: number, periodS: number, phase: number): number {
  const p = periodS < GLINT_PERIOD_MIN_S ? GLINT_PERIOD_MIN_S : periodS;
  return 1 - GLINT_SWING_MAX * (0.5 + 0.5 * Math.sin((2 * Math.PI * t) / p + phase));
}

/** 画面（lo〜hi）＋余白 m の外へ出た座標を反対側へ（出た分だけ内側に） */
export function wrapInto(v: number, lo: number, hi: number, m: number): number {
  const span = hi - lo + 2 * m;
  if (v < lo - m) return v + span;
  if (v > hi + m) return v - span;
  return v;
}
