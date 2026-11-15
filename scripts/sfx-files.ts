// 音の道具の部品（v0.7.1 S0。scripts/sfx-mix.ts が使う。ゲームは import しない）: 16 bit・モノの WAV、波形と声紋（スペクトログラム）の PNG、FFT と重心。
// どれも scratchpad へ書く物（repo には音・画像のファイルを入れない＝CLAUDE.md §2「アート」）。PNG は node:zlib だけで書く（依存を足さない）。
import { deflateSync } from 'node:zlib';

/** Float32（−1〜1）→ 16 bit・モノの WAV */
export function wavBytes(x: Float32Array, sampleRate: number): Buffer {
  const b = Buffer.alloc(44 + x.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sampleRate, 24); b.writeUInt32LE(sampleRate * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i]!)) * 32767), 44 + i * 2);
  return b;
}

/** 左右の Float32（−1〜1。同じ長さ）→ 16 bit・ステレオの WAV（1 を超える標本は頭打ち） */
export function wavStereoBytes(l: Float32Array, r: Float32Array, sampleRate: number): Buffer {
  const b = Buffer.alloc(44 + l.length * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + l.length * 4, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(sampleRate, 24); b.writeUInt32LE(sampleRate * 4, 28);
  b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(l.length * 4, 40);
  for (let i = 0; i < l.length; i++) {
    b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, l[i]!)) * 32767), 44 + i * 4);
    b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, r[i]!)) * 32767), 46 + i * 4);
  }
  return b;
}

/** 2 の冪の長さの FFT の大きさ（Hann 窓を掛け、0 で埋める）。戻りは size/2 個の |X| */
export function spectrum(x: Float32Array, from: number, len: number, size: number): Float64Array {
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let i = 0; i < Math.min(len, size); i++) re[i] = (x[from + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / len));
  for (let i = 1, j = 0; i < size; i++) {
    let bit = size >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const t = re[i]!; re[i] = re[j]!; re[j] = t; }
  }
  for (let m = 2; m <= size; m <<= 1) {
    const ang = (-2 * Math.PI) / m;
    for (let s = 0; s < size; s += m) {
      for (let k = 0; k < m / 2; k++) {
        const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
        const a = s + k, c = a + m / 2;
        const tr = re[c]! * wr - im[c]! * wi, ti = re[c]! * wi + im[c]! * wr;
        re[c] = re[a]! - tr; im[c] = im[a]! - ti; re[a] = re[a]! + tr; im[a] = im[a]! + ti;
      }
    }
  }
  const out = new Float64Array(size / 2);
  for (let i = 0; i < out.length; i++) out[i] = Math.hypot(re[i]!, im[i]!);
  return out;
}

/**
 * 帯のエネルギーの割合 [hz より上, lowHz より下]（1,024 標本ごとの FFT。scripts/sfx-mix.ts の「小さいスピーカーの目安」と同じ数え方。v0.7.2 S0 の曲の §3.3 の帯の確かめ:
 * 400 Hz より上 ≥ 60%・200 Hz より下 ≤ 12%）
 */
export function bandShares(x: Float32Array, sampleRate: number, hz = 400, lowHz = 200): [number, number] {
  const size = 1024;
  let hi = 0, lo = 0, all = 0;
  for (let from = 0; from < x.length; from += size) {
    const mag = spectrum(x, from, Math.min(size, x.length - from), size);
    for (let i = 1; i < mag.length; i++) { const p = mag[i]! * mag[i]!, f = (i * sampleRate) / size; all += p; if (f >= hz) hi += p; if (f < lowHz) lo += p; }
  }
  return all > 0 ? [hi / all, lo / all] : [0, 0];
}

/** [lo, hi) Hz の帯のエネルギーの割合（v0.7.2 IP1。緊張と戦闘の 2〜5 kHz の比べ。1,024 標本ごとの FFT・端の半端は数えない） */
export function bandShare(x: Float32Array, sampleRate: number, lo: number, hi: number): number {
  const size = 1024;
  let b = 0, all = 0;
  for (let from = 0; from + size <= x.length; from += size) {
    const mag = spectrum(x, from, size, size);
    for (let i = 1; i < mag.length; i++) { const p = mag[i]! * mag[i]!, f = (i * sampleRate) / size; all += p; if (f >= lo && f < hi) b += p; }
  }
  return all > 0 ? b / all : 0;
}

/**
 * 発音の密度（毎秒。v0.7.2 IP1 の緊張と戦闘の比べ）: RMS を 0.1 にそろえ、1,024 の FFT を 512 ずつ進めて log(1 + 100|X|) の正の差（150 Hz〜8 kHz）の和を取り、
 * 山＝前後 3 窓（約 70 ms）で最大・前後 0.5 秒の平均 × 1.5 ＋ 全体の 99% 点 × 0.05 より大きい・前の山から 3 窓以上を数える
 */
export function onsetRate(x0: Float32Array, sampleRate: number): number {
  let s = 0;
  for (let i = 0; i < x0.length; i++) s += x0[i]! * x0[i]!;
  const g = 0.1 / Math.max(1e-9, Math.sqrt(s / x0.length)), x = x0.map((v) => v * g), size = 1024, hop = 512, fl: number[] = [];
  let prev: Float64Array | null = null;
  for (let from = 0; from + size <= x.length; from += hop) {
    const mag = spectrum(x, from, size, size), lg = mag.map((m) => Math.log(1 + 100 * m));
    let f = 0;
    for (let i = 1; prev && i < mag.length; i++) { const hz = (i * sampleRate) / size; if (hz >= 150 && hz <= 8000 && lg[i]! > prev[i]!) f += lg[i]! - prev[i]!; }
    fl.push(f);
    prev = lg;
  }
  const p99 = [...fl].sort((a, b) => a - b)[Math.floor(fl.length * 0.99)]!, half = Math.round((0.5 * sampleRate) / hop);
  let n = 0, last = -99;
  for (let t = 1; t < fl.length - 1; t++) {
    let peak = true, sum = 0, c = 0;
    for (let k = -3; k <= 3; k++) if (k !== 0 && (fl[t + k] ?? -1) > fl[t]!) peak = false;
    for (let k = -half; k <= half; k++) if (fl[t + k] !== undefined) { sum += fl[t + k]!; c++; }
    if (peak && fl[t]! > (sum / c) * 1.5 + p99 * 0.05 && t - last >= 3) { n++; last = t; }
  }
  return n / (x.length / sampleRate);
}

/** 区間 [from, to) のスペクトルの重心 Hz（エネルギーの重み。音の明るさの目安） */
export function centroidHz(x: Float32Array, from: number, to: number, sampleRate: number): number {
  let size = 256;
  while (size < to - from) size <<= 1;
  const mag = spectrum(x, from, to - from, size);
  let num = 0, den = 0;
  for (let i = 1; i < mag.length; i++) { const p = mag[i]! * mag[i]!; num += p * ((i * sampleRate) / size); den += p; }
  return den > 0 ? num / den : 0;
}

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** RGB の画素（w × h × 3）→ PNG */
export function pngBytes(rgb: Uint8Array, w: number, h: number): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(rgb.buffer, rgb.byteOffset + y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

export const STRIP_W = 640;
const WAVE_H = 72;
const SPEC_H = 128;
export const STRIP_H = WAVE_H + SPEC_H + 6;

/**
 * 1 本の音の帯（幅 640）を rgb の y0 から描く: 上は波形（列ごとの最小〜最大。中央の線が 0・上下の端が ±1）、下は声紋（窓 256・0〜11 kHz が下から上・−70〜0 dB を
 * 黒 → 青 → 黄 → 白）。横は音の長さ全体（音ごとに縮尺が違う）
 */
export function drawStrip(rgb: Uint8Array, y0: number, x: Float32Array): void {
  const put = (px: number, py: number, r: number, g: number, b: number): void => { const o = ((y0 + py) * STRIP_W + px) * 3; rgb[o] = r; rgb[o + 1] = g; rgb[o + 2] = b; };
  for (let px = 0; px < STRIP_W; px++) {
    const a = Math.floor((px * x.length) / STRIP_W), b = Math.max(a + 1, Math.floor(((px + 1) * x.length) / STRIP_W));
    let lo = 1, hi = -1;
    for (let i = a; i < b; i++) { const v = x[i]!; if (v < lo) lo = v; if (v > hi) hi = v; }
    const yHi = Math.round((1 - hi) * 0.5 * (WAVE_H - 1)), yLo = Math.round((1 - lo) * 0.5 * (WAVE_H - 1));
    for (let py = 0; py < WAVE_H; py++) { const on = py >= yHi && py <= yLo; const mid = py === (WAVE_H - 1) >> 1; put(px, py, on ? 120 : mid ? 60 : 16, on ? 220 : mid ? 60 : 16, on ? 140 : mid ? 60 : 24); }
    const win = Math.min(256, x.length);
    const from = Math.max(0, Math.min(x.length - win, Math.round(((px + 0.5) * x.length) / STRIP_W - win / 2)));
    const mag = spectrum(x, from, win, 256);
    for (let py = 0; py < SPEC_H; py++) {
      const db = 20 * Math.log10(mag[SPEC_H - 1 - py]! / (win / 4) + 1e-9);
      const u = Math.max(0, Math.min(1, (db + 70) / 70));
      put(px, WAVE_H + 6 + py, Math.round(255 * Math.min(1, u * 1.6)), Math.round(255 * Math.max(0, u * 1.8 - 0.6)), Math.round(255 * (u < 0.5 ? u * 1.2 : Math.max(0, u * 3 - 2))));
    }
  }
}
