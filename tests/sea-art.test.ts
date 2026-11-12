// v0.7.0 S3a（アートと音①：コードで描く絵。spec-v0700 §5.1・§5.6・§7.6）＋ IP1a（ユーザーの U2「波の模様が波に見えずにゴミのように見えます」「格子の線はあった方がいい」）: 海の面の Phaser に依らない規則と、作法の pin。
// - 海の面のタイル（assets/sea-shape の seaTilePixels）: 同じ種なら同じ画素・大きさ 512（2 の累乗・0.5 px/m × 1,024 m）・波は整数の山の数（周期の縁で合う＝継ぎ目なし）・
//   帯（波長と向き）の内・隣の画素との差が小さい（S3a の短く硬い筆の線＝差が大きい物を描かない）・夜の明るさは格子の線より暗い（格子が見える）・昼は昼の海より明るく青い。
// - 光の表（config/sea-art-config）: 夜の α ≤ SEA_NIGHT_ALPHA_MAX、きらめきの α ≤ 0.3・明滅の周期 ≥ 2 秒・振れ幅 ≤ 0.5（R9）、夜明けの光の α は 0.22 × sin(π × 段/16) で夜と昼は 0・dayStart は 0（R4）。
// - 升（R5）: 周期の倍数に揃い worldView ＋ 余白を覆う。きらめきの置き直しは反対側へ。波の流れは周期で折り返す。
// - source の pin: Boot の 1 行・world-visuals の最後の 1 行ずつ（R13）・mission-world は論理の後に 1 つ作るだけ・sea-fx は TileSprite を世界の座標に置き setSize を呼ばない・
//   格子の線は海の面の上・texture の鍵は D2 の 3 つ。描画の規則（update で確保しない・絵だけの乱数）は tests/art-rules が sea-art・sea-fx・world-art に自動で効く。
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { dawnGlowAlpha, dirDiffDeg, glintBlink, mixRgb, SEA_TILE_TEX_PX, seaCellInto, seaCrestScore, seaDriftInto, seaField, seaPixel, seaShadeInto, seaTilePixels, seaWaveSet, wrapInto } from '../src/assets/sea-shape';
import { DAY_SEA_COLOR, SEA_COLOR, SEA_LIGHT_STEPS } from '../src/config/dawn-config';
import {
  ART_SEED_GLINT, ART_SEED_SEA, DAWN_GLOW_ALPHA_MAX, DAWN_GLOW_DEPTH, DAWN_GLOW_OVERSCAN, GLINT_ALPHA_MAX, GLINT_DEPTH, GLINT_H_M, GLINT_PERIOD_MIN_S, GLINT_SWING_MAX, GLINT_W_M,
  SEA_ART_DEPTH, SEA_ART_PX_PER_M, SEA_DRIFT_MPS, SEA_GRID_LINE_COLOR, SEA_LIGHT_ART, SEA_NIGHT_ALPHA_MAX, SEA_TEX, SEA_TILE_LOCAL_H, SEA_TILE_LOCAL_W, SEA_TILE_PERIOD_M, SEA_VIEW_MARGIN_M,
  WHITECAP_ALPHA_MAX, WHITECAP_H_M, WHITECAP_W_M,
} from '../src/config/sea-art-config';

const read = (f: string): string => readFileSync(f, 'utf8');
const hex = (s: string): number => parseInt(s.slice(1), 16);
const lum = (c: number): number => 0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255);
const PX = seaTilePixels(ART_SEED_SEA);
const S = SEA_TILE_TEX_PX;

/** 光の tint × α を背景 bg の上に重ねた画面の色（画素ごと）: 明るさの並び（昇順）と平均の RGB */
function composite(light: keyof typeof SEA_LIGHT_ART, bg: number): { lums: number[]; mean: [number, number, number] } {
  const L = SEA_LIGHT_ART[light];
  const lums: number[] = [];
  const m = [0, 0, 0];
  for (let i = 0; i < S * S; i++) {
    const a = (PX[i * 4 + 3]! / 255) * L.crestAlpha;
    const g = PX[i * 4]! / 255;
    const c = [16, 8, 0].map((sh) => ((bg >> sh) & 255) * (1 - a) + ((L.crest >> sh) & 255) * g * a);
    for (let k = 0; k < 3; k++) m[k]! += c[k]!;
    lums.push(0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!);
  }
  lums.sort((p, q) => p - q);
  return { lums, mean: [m[0]! / (S * S), m[1]! / (S * S), m[2]! / (S * S)] };
}

describe('海の面のタイル（assets/sea-shape の seaTilePixels。IP1a。絵だけの乱数 ART_SEED_SEA）', () => {
  it('大きさは 512 px（周期 1,024 m × 0.5 px/m）＝2 の累乗（WebGL の REPEAT）、RGBA', () => {
    expect(S).toBe(512);
    expect(S).toBe(SEA_TILE_PERIOD_M * SEA_ART_PX_PER_M);
    expect(Math.log2(S) % 1).toBe(0);
    expect(PX.length).toBe(S * S * 4);
  });
  it('同じ種なら同じ画素、種が違えば違う', () => {
    const h = (a: Uint8ClampedArray): string => createHash('md5').update(a).digest('hex');
    expect(h(seaTilePixels(ART_SEED_SEA))).toBe(h(PX));
    expect(h(seaTilePixels(ART_SEED_SEA + 1))).not.toBe(h(PX));
  });
  it('波は整数の山の数（周期の縁で合う）で、帯の波長・向きの内。うねり・波・さざ波・ゆがみの数は表のとおり、振幅の和は 1', () => {
    const set = seaWaveSet(ART_SEED_SEA);
    for (const [name, ws, b, dir] of [['swell', set.swell, SEA_TEX.swell, SEA_TEX.dirDeg], ['chop', set.chop, SEA_TEX.chop, SEA_TEX.dirDeg], ['ripple', set.ripple, SEA_TEX.ripple, SEA_TEX.dirDeg]] as const) {
      expect(ws.length, name).toBe(b.count);
      let sum = 0;
      for (const w of ws) {
        expect(Number.isInteger(w.n) && Number.isInteger(w.m), name).toBe(true);
        expect(w.kx).toBeCloseTo((2 * Math.PI * w.n) / SEA_TILE_PERIOD_M, 12);
        const lam = SEA_TILE_PERIOD_M / Math.hypot(w.n, w.m);
        expect(lam, name).toBeGreaterThanOrEqual(b.lamM[0]);
        expect(lam, name).toBeLessThanOrEqual(b.lamM[1]);
        expect(Math.abs(dirDiffDeg((Math.atan2(w.m, w.n) * 180) / Math.PI, dir)), name).toBeLessThanOrEqual(b.spreadDeg + 1e-9);
        sum += w.amp;
      }
      expect(sum, name).toBeCloseTo(1, 9);
      expect(new Set(ws.map((w) => `${w.n},${w.m}`)).size, name).toBe(ws.length); // 同じ波を 2 度選ばない
    }
    expect(set.warpX.length + set.warpY.length).toBe(SEA_TEX.warp.count * 2);
  });
  it('継ぎ目なし: 明るさの式は周期 1,024 m で同じ（表の誤差の内）、タイルの縁をまたぐ画素の差は内側の差より大きくない', () => {
    const f = seaField(ART_SEED_SEA);
    const a = new Float32Array(3);
    const b = new Float32Array(3);
    for (let k = 0; k < 100; k++) {
      seaShadeInto(a, f, k * 13.7, k * 7.3);
      seaShadeInto(b, f, k * 13.7 + SEA_TILE_PERIOD_M, k * 7.3 - 2 * SEA_TILE_PERIOD_M);
      for (let j = 0; j < 3; j++) expect(Math.abs(a[j]! - b[j]!)).toBeLessThan(0.005);
    }
    let inner = 0;
    let seam = 0;
    const white = (q: number): number => (PX[q + 3]! * PX[q]!) / 255;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4;
        const d = Math.max(Math.abs(white(i) - white((y * S + ((x + 1) % S)) * 4)), Math.abs(white(i) - white((((y + 1) % S) * S + x) * 4)));
        if (x === S - 1 || y === S - 1) seam = Math.max(seam, d);
        else inner = Math.max(inner, d);
      }
    }
    expect(seam).toBeLessThanOrEqual(inner);
    expect(inner).toBeLessThanOrEqual(64); // 隣の画素との差（白の量）は 1/4 以下（S3a の 2 px の芯 α 0.7 の筆の線は 1 画素で 178 変わった）
  });
  it('画素: 下地があり（どこも透明でない）、山は白・谷は黒の α（seaPixel と同じ式）。泡は高い所だけ', () => {
    let minA = 255;
    for (let i = 0; i < S * S; i++) minA = Math.min(minA, PX[i * 4 + 3]!);
    expect(minA).toBeGreaterThan(0);
    const [[g0, a0], [g1, a1]] = [seaPixel(-1, 0, 0), seaPixel(1, 1, 1)];
    expect(g0 < g1 && g1 === 1 && a0 > 0 && a1 > a0).toBe(true);
    const f = seaField(ART_SEED_SEA);
    const o = new Float32Array(3);
    let foamy = 0;
    for (let k = 0; k < 2000; k++) {
      seaShadeInto(o, f, (k * 37.1) % 1024, (k * 91.7) % 1024);
      if (o[2]! > 0.5) foamy++;
      expect(seaCrestScore(o, f, (k * 37.1) % 1024, (k * 91.7) % 1024)).toBeCloseTo(o[1]! + o[2]!, 9);
    }
    expect(foamy).toBeGreaterThan(0);
    expect(foamy / 2000).toBeLessThan(0.15); // 泡は疎ら
  });
  it('読みやすさ（夜）: α ≤ SEA_NIGHT_ALPHA_MAX、明るい 1% の画素も格子の線より暗い（格子が波の上に見える）、平均は海の色より少し明るいだけ（白い艇・雷跡と比べて暗い）', () => {
    for (const m of ['dark', 'half', 'full'] as const) {
      expect(SEA_LIGHT_ART[m].crestAlpha).toBeLessThanOrEqual(SEA_NIGHT_ALPHA_MAX);
      const { lums } = composite(m, hex(SEA_COLOR));
      expect(lums[Math.floor(lums.length * 0.99)]!, m).toBeLessThan(lum(SEA_GRID_LINE_COLOR));
      expect(lums[Math.floor(lums.length * 0.5)]!, m).toBeLessThan(lum(hex(SEA_COLOR)) + 16);
      expect(lums[lums.length - 1]!, m).toBeLessThan(255 / 3); // 一番明るい所でも白（雷跡の点・自艇）の 1/3 未満
    }
  });
  it('昼: 平均は昼の海の色より明るく青い（U2「海らしく」・U3）、格子の線は昼の海より暗い（昼は暗い線）', () => {
    const day = hex(DAY_SEA_COLOR);
    const { mean } = composite('day', day);
    expect(lum((Math.round(mean[0]) << 16) | (Math.round(mean[1]) << 8) | Math.round(mean[2]))).toBeGreaterThan(lum(day) + 8);
    expect(mean[2] - mean[0]).toBeGreaterThan((day & 255) - ((day >> 16) & 255));
    expect(lum(SEA_GRID_LINE_COLOR)).toBeLessThan(lum(day) - 20);
    expect(lum(SEA_GRID_LINE_COLOR)).toBeGreaterThan(lum(hex(SEA_COLOR)) + 20);
  });
  it('波の流れ: 向き dirDeg へ m/秒（tilePosition は逆へ）、周期の px で折り返す', () => {
    const d = new Float32Array(2);
    seaDriftInto(d, 1, 0, 2, 0.5, 512);
    expect(d[0]).toBeCloseTo(511, 4); // 0 − 1 px → 折り返して 511
    expect(d[1]).toBeCloseTo(0, 4);
    for (let k = 0; k < 10000; k++) seaDriftInto(d, 1 / 60, SEA_TEX.dirDeg, SEA_DRIFT_MPS, SEA_ART_PX_PER_M, 512);
    expect(d[0]).toBeGreaterThanOrEqual(0);
    expect(d[0]).toBeLessThan(512);
    expect(d[1]).toBeGreaterThanOrEqual(0);
    expect(d[1]).toBeLessThan(512);
    expect(SEA_DRIFT_MPS > 0 && SEA_DRIFT_MPS < 5).toBe(true); // ゆっくり（艇の静音より遅い）
  });
});

describe('海の面は全面の層 1 枚（IP1a。S3a の波頭の群れ patches はやめた）', () => {
  it('sea-fx: WebGL なら TileSprite を 1 枚、patches の輪は無い。深さは格子の線（DEPTH.sea 0）の下、夜明けの光ときらめきはその上', () => {
    const fx = read('src/systems/sea-fx.ts');
    expect(fx).toContain('this.tile = webgl ? scene.add.tileSprite(');
    expect(fx.replace(/\/\/[^\n]*/g, '')).not.toMatch(/patches|SEA_PATCH|SEA_LAYER_MODE/);
    expect(SEA_ART_DEPTH).toBeLessThan(0);
    expect(read('src/config/game-config.ts')).toContain('  sea: 0,');
    expect(read('src/entities/sea.ts')).toContain('g.lineStyle(SEA_GRID_LINE_WIDTH, SEA_GRID_LINE_COLOR, 1);');
  });
  it('きらめき・白波は升の内の候補から波頭の高い所を選び、波の筋の向きに傾け、波と一緒に流す', () => {
    const fx = read('src/systems/sea-fx.ts');
    expect(fx).toContain('const crestDeg = SEA_TEX.dirDeg - 90;');
    expect(fx).toContain('this.glints.update(v, this.rng, this.vx * realDt, this.vy * realDt);');
    expect(fx).toContain('return seaCrestScore(this.shade, this.field, x + this.drift[0]! / SEA_ART_PX_PER_M, y + this.drift[1]! / SEA_ART_PX_PER_M);');
  });
});

describe('光の表と夜明けの光・きらめき（spec §3.2・§5.6。R4・R9）', () => {
  it('夜（dark・half・full）の面の α ≤ SEA_NIGHT_ALPHA_MAX、昼はそれより濃い。dark にきらめきは無く、half < full、昼は白波（同じプール）', () => {
    for (const m of ['dark', 'half', 'full'] as const) expect(SEA_LIGHT_ART[m].crestAlpha).toBeLessThanOrEqual(SEA_NIGHT_ALPHA_MAX);
    expect(SEA_LIGHT_ART.day.crestAlpha).toBeGreaterThan(SEA_NIGHT_ALPHA_MAX);
    expect(SEA_LIGHT_ART.dark.glints).toBe(0);
    expect(SEA_LIGHT_ART.half.glints).toBeGreaterThan(0);
    expect(SEA_LIGHT_ART.full.glints).toBeGreaterThanOrEqual(SEA_LIGHT_ART.half.glints);
    expect(SEA_LIGHT_ART.day.whitecaps).toBe(true);
    for (const m of ['dark', 'half', 'full'] as const) expect(SEA_LIGHT_ART[m].whitecaps).toBe(false);
  });
  it('夜明けの光: α ＝ 0.22 × sin(π × 段/16)。夜 0・中ほど（段 8）で最大・昼（段 16）0、dayStart は常に 0、深さは海の模様の直上で輪（1）の下', () => {
    expect(DAWN_GLOW_ALPHA_MAX).toBe(0.22);
    expect(dawnGlowAlpha(0, SEA_LIGHT_STEPS, false)).toBe(0);
    expect(dawnGlowAlpha(SEA_LIGHT_STEPS, SEA_LIGHT_STEPS, false)).toBe(0);
    expect(dawnGlowAlpha(8, SEA_LIGHT_STEPS, false)).toBeCloseTo(0.22, 9);
    expect(dawnGlowAlpha(4, SEA_LIGHT_STEPS, false)).toBeCloseTo(0.22 * Math.SQRT1_2, 9);
    for (let k = 1; k < SEA_LIGHT_STEPS; k++) expect(dawnGlowAlpha(k, SEA_LIGHT_STEPS, false)).toBeGreaterThan(0);
    for (let k = 0; k <= SEA_LIGHT_STEPS; k++) expect(dawnGlowAlpha(k, SEA_LIGHT_STEPS, true)).toBe(0);
    expect(DAWN_GLOW_OVERSCAN).toBeGreaterThan(0);
    expect(SEA_ART_DEPTH).toBeLessThan(DAWN_GLOW_DEPTH);
    expect(DAWN_GLOW_DEPTH).toBeLessThan(GLINT_DEPTH);
    expect(GLINT_DEPTH).toBeLessThan(1);
  });
  it('昼の白波は波頭に沿って長い筋（月のきらめきより長く、横長 4:1 以上。IP1a: 短いと白い点に見えた）', () => {
    expect(WHITECAP_W_M / WHITECAP_H_M).toBeGreaterThanOrEqual(4);
    expect(WHITECAP_W_M).toBeGreaterThan(GLINT_W_M);
  });
  it('きらめき: α ≤ 0.3・横長（2:1 以上）・明滅は 1 − 0.5 〜 1 で周期 ≥ 2 秒（短い周期を頼んでも 2 秒に）、白波の α は 1 より小さい', () => {
    expect(GLINT_ALPHA_MAX).toBeLessThanOrEqual(0.3);
    expect(GLINT_W_M / GLINT_H_M).toBeGreaterThanOrEqual(2);
    expect(GLINT_SWING_MAX).toBeLessThanOrEqual(0.5);
    expect(GLINT_PERIOD_MIN_S).toBeGreaterThanOrEqual(2);
    let lo = 1;
    let hi = 0;
    for (let t = 0; t < 10; t += 0.01) {
      const b = glintBlink(t, 3, 1);
      lo = Math.min(lo, b);
      hi = Math.max(hi, b);
    }
    expect(lo).toBeCloseTo(1 - GLINT_SWING_MAX, 2);
    expect(hi).toBeCloseTo(1, 2);
    expect(glintBlink(0.5, 0.1, 0)).toBeCloseTo(glintBlink(0.5, GLINT_PERIOD_MIN_S, 0), 9);
    expect(WHITECAP_ALPHA_MAX).toBeLessThan(1);
    expect(ART_SEED_GLINT).not.toBe(ART_SEED_SEA);
  });
  it('色の混ぜ: 0 で a・1 で b・中間は中間', () => {
    expect(mixRgb(0x000000, 0xffffff, 0)).toBe(0x000000);
    expect(mixRgb(0x000000, 0xffffff, 1)).toBe(0xffffff);
    expect(mixRgb(0x102030, 0x304050, 0.5)).toBe(0x203040);
  });
});

describe('海の升ときらめきの置き直し（R5）', () => {
  it('升は周期の倍数に揃い、worldView ＋ 余白を覆う（既定のズーム約 2,080 × 960 m → 4 × 3、見張り約 3,120 × 1,440 m → 5 × 4 升）', () => {
    const out = new Int32Array(4);
    const P = SEA_TILE_PERIOD_M;
    const m = SEA_VIEW_MARGIN_M;
    for (const [x, y, w, h] of [[1500, 900, 2080, 960], [-300, 3500, 3120, 1440], [0, 0, 2080, 960], [5999, 3999, 2080, 960]]) {
      seaCellInto(out, x!, y!, w!, h!, P, m);
      expect(out[0]! * P).toBeLessThanOrEqual(x! - m);
      expect(out[1]! * P).toBeLessThanOrEqual(y! - m);
      expect((out[0]! + out[2]!) * P).toBeGreaterThanOrEqual(x! + w! + m);
      expect((out[1]! + out[3]!) * P).toBeGreaterThanOrEqual(y! + h! + m);
      expect(out[2]!).toBeLessThanOrEqual(Math.ceil((w! + 2 * m) / P) + 1);
      expect(out[3]!).toBeLessThanOrEqual(Math.ceil((h! + 2 * m) / P) + 1);
    }
    seaCellInto(out, 1500, 900, 2080, 960, P, m);
    expect([...out]).toEqual([0, -1, 5, 4]);
    // 少し動いても同じ升（升が変わるのは縁が周期の線を越えた時だけ）
    const before = [...out];
    seaCellInto(out, 1530, 912, 2080, 960, P, m);
    expect([...out]).toEqual(before);
  });
  it('きらめきは画面＋余白の外へ出たら反対側へ（出た分だけ内側）、内なら動かない', () => {
    expect(wrapInto(50, 0, 100, 10)).toBe(50);
    expect(wrapInto(-11, 0, 100, 10)).toBe(-11 + 120);
    expect(wrapInto(111, 0, 100, 10)).toBe(111 - 120);
    expect(wrapInto(-10, 0, 100, 10)).toBe(-10);
  });
});

describe('作法の pin（Boot・world-visuals・mission-world・sea-fx・鍵）', () => {
  const fx = read('src/systems/sea-fx.ts');
  const boot = read('src/scenes/boot-scene.ts');
  const mw = read('src/systems/mission-world.ts');
  const vis = read('src/systems/world-visuals.ts');
  const gc = read('src/config/game-config.ts');
  it('Boot は generateSeaTextures を 1 回呼び、sea-art は Canvas のテクスチャを鍵が無い時だけ作る（やり直しで描かない）', () => {
    expect(boot.split('generateSeaTextures(this);').length - 1).toBe(1);
    const art = read('src/assets/sea-art.ts');
    expect(art).toContain('if (scene.textures.exists(key)) return;');
    expect(art).toContain('scene.textures.createCanvas(key, w, h * (frames > 0 ? frames : 1))');
    expect(art).toContain('export function generateSeaTextures(scene: Phaser.Scene): void {\n  paintSeaTile(scene);');
    expect(art).toContain('img.data.set(seaTilePixels(ART_SEED_SEA));');
    expect(art).toContain('tex.refresh();');
    expect(art).not.toMatch(/generateTexture|setSize\(/);
  });
  it('world-visuals の最後の 1 行ずつが世界の絵、mission-world は論理の全部の後に 1 つ作るだけ（R13）', () => {
    expect(vis).toMatch(/w\.art\.update\(realDt, w\);[^\n]*\n\}/);
    expect(vis).toMatch(/w\.art\.destroy\(\);[^\n]*\n\}/);
    const i = mw.indexOf('this.evac = buildEvac(');
    const j = mw.indexOf('this.art = new WorldArt(scene, this);');
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);
    expect(mw.split('new WorldArt(').length - 1).toBe(1);
  });
  it('sea-fx: TileSprite は世界の座標（setScrollFactor(0) にしない）・原点 (0, 0)・局所 128 × 64 のまま setScale で広げ setSize を呼ばない・Canvas レンダラーでは作らない。夜明けの光だけ scrollFactor 0', () => {
    expect(SEA_TILE_LOCAL_W).toBe(128);
    expect(SEA_TILE_LOCAL_H).toBe(64);
    expect(fx).toContain('scene.add.tileSprite(0, 0, SEA_TILE_LOCAL_W, SEA_TILE_LOCAL_H, TEXTURE_KEYS.seaTile).setOrigin(0, 0)');
    expect(fx).toContain('renderer.type === RENDERER_WEBGL');
    expect(fx).not.toMatch(/\.setSize\(/);
    // 波の流れ: tilePosition は毎フレーム（WebGL では uv のずれだけ＝描き直さない。IP1a）。升が変わった時だけ setPosition・setScale・setTileScale
    expect(fx).toContain('this.tile.setTilePosition(this.drift[0]!, this.drift[1]!);');
    expect(fx.split('setTilePosition(').length - 1).toBe(1);
    expect(fx.split(').setScrollFactor(0)').length - 1).toBe(1);
    expect(fx).toMatch(/scene\.add\.image\(0, 0, TEXTURE_KEYS\.dawnGlow\)\.setScrollFactor\(0\)\.setOrigin\(1, 0\.5\)/);
    expect(fx).toContain('(W * (DAWN_GLOW_SCREEN_SHARE + DAWN_GLOW_OVERSCAN)) / zoom / DAWN_GLOW_TEX_W'); // 右端の帯だけ（全面の層にしない）
    // 段・ズーム・升が変わった時だけ書く
    expect(fx).toContain('if (step !== this.step) this.applyStep(step);');
    expect(fx).toContain('if (cam.zoom !== this.zoom) this.applyZoom(cam.zoom);');
    expect(fx).toMatch(/if \(c\[0\] !== this\.cx \|\| c\[1\] !== this\.cy \|\| c\[2\] !== this\.nx \|\| c\[3\] !== this\.ny\) this\.moveTile\(/);
  });
  it('鍵は D2 の 3 つ（tex-sea-tile・tex-dawn-glow・tex-glint）で、格子の切り替えは ?debug&nogrid（R6）', () => {
    expect(gc).toContain("seaTile: 'tex-sea-tile',");
    expect(gc).toContain("dawnGlow: 'tex-dawn-glow',");
    expect(gc).toContain("glint: 'tex-glint',");
    expect(gc).toContain("has('nogrid')");
    const sea = read('src/entities/sea.ts');
    expect(sea).toContain('if (SEA_GRID_ON && !DEBUG_GRID_OFF) {');
    expect(sea).toContain('g.strokeRect(0, 0, width, height);');
  });
  it('WorldDawn は段（lightStep）を updateVisuals で書き、dayStart を読める', () => {
    const d = read('src/systems/world-dawn.ts');
    expect(d).toContain('  lightStep = 0;');
    expect(d).toContain('  readonly dayStart: boolean;');
    expect(d).toContain('this.seaLight.update(this.lightStep);');
  });
});
