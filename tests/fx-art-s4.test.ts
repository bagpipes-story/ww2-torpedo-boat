// v0.7.0 S4（アートと音①：コードで描く絵。spec-v0700 §7.9 の仕上げ・独立の見え方の検査の指摘）: 
// - 火災の物の上限（jp_03 ハードの見える物 ≤ +40）: 1 つの火災＝炎 1 ＋ 玉 ceil(寿命/間隔)≤ 5 ＝ 6 まで（60 fps の積み上げで確かめる）・玉のプール 12・玉は煙幕の色より暗く小さいまま（R10）。
// - 水柱（tex-splash）: 柔らかい不揃いな白い塊＋少しの水滴（放射の筋なし）・芯は明るい・輪郭は角度で揺れる・縁は 0。油の輪（tex-oil-slick）: 暗い油膜・縁の光・泡・縁は 0・tint しない。
// - 航跡の腕は 1 枚のグラデーションの台形・frame を枠で切る。星弾の光は白に近い。昼の波頭は控えめで、世界の外には出さない。
// - 岸の帯は jp_03 でも切らない（陰の絵の陸の側は帯の上の深さ・海の側は輪の下）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { puffAlpha, puffMaxRadiusM } from '../src/assets/fire-shape';
import { slickBubbles, slickPixels, splashAlphaAt, splashPixels } from '../src/assets/splash-shape';
import {
  ART_SEED_FX, FIRE_OBJECTS_PER_SOURCE, FIRE_PUFF_INTERVAL_S, FIRE_PUFF_LIFE_S, FIRE_PUFFS, FIRE_SMOKE_MAX_ALPHA, FIRE_SMOKE_MAX_RADIUS_M, FIRE_SMOKE_TINT, SLICK_BUBBLES, SPLASH_DROPLETS, SS_LIGHT_COLOR,
} from '../src/config/fx-art-config';
import { COAST_STRIP_DEPTH, COAST_STRIP_SEA_M, EVAC_COVER_LAND_DEPTH, SEA_LIGHT_ART, WHITECAP_ALPHA_MAX } from '../src/config/sea-art-config';

const read = (f: string): string => readFileSync(f, 'utf8');
const GC = read('src/config/game-config.ts');
const depthOf = (name: string): number => Number(new RegExp(`\\n  ${name}: ([0-9.]+),`).exec(GC)![1]);
const SMOKE_PUFF_COLOR = Number(/export const SMOKE_PUFF_COLOR = (0x[0-9a-f]+);/.exec(read('src/config/ui-config.ts'))![1]);
const lum = (c: number): number => 0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255);
const mul = (a: number, b: number): number => {
  let out = 0;
  for (const s of [16, 8, 0]) out |= Math.round((((a >> s) & 255) * ((b >> s) & 255)) / 255) << s;
  return out;
};
const K = 1.0915;
const R = 40 * K;
const D = Math.ceil(40 * 2 * K) + 8;

describe('火災の物の上限（S4。jp_03 ハードの見える物 ≤ +40）', () => {
  it('1 つの火災は炎 1 ＋ 玉 5 ＝ 6 まで（fire-fx と同じ順: 出す → 年を足す → 寿命で消す。60 fps で 10 秒）、玉のプール 12', () => {
    expect(FIRE_PUFFS).toBe(12);
    expect(1 + Math.ceil(FIRE_PUFF_LIFE_S / FIRE_PUFF_INTERVAL_S)).toBeLessThanOrEqual(FIRE_OBJECTS_PER_SOURCE);
    const dt = 1 / 60;
    const ages: number[] = [];
    let emitIn = 0;
    let maxAlive = 0;
    for (let f = 0; f < 600; f++) {
      emitIn -= dt;
      if (emitIn <= 0) {
        emitIn = FIRE_PUFF_INTERVAL_S;
        ages.push(0);
      }
      for (let i = 0; i < ages.length; i++) ages[i]! += dt;
      const alive = ages.filter((a) => puffAlpha(a, FIRE_PUFF_LIFE_S, 0) > 0).length;
      maxAlive = Math.max(maxAlive, alive);
    }
    expect(1 + maxAlive).toBeLessThanOrEqual(FIRE_OBJECTS_PER_SOURCE);
  });
  it('玉は煙幕と見分けられるまま（R10）: 半径 ≤ 15 m・α ≤ 0.5・tint を掛けた色は煙幕の青灰より暗い', () => {
    expect(puffMaxRadiusM(true)).toBeLessThanOrEqual(FIRE_SMOKE_MAX_RADIUS_M);
    expect(FIRE_SMOKE_MAX_RADIUS_M).toBeLessThanOrEqual(15);
    expect(FIRE_SMOKE_MAX_ALPHA).toBeLessThanOrEqual(0.5);
    expect(lum(mul(SMOKE_PUFF_COLOR, FIRE_SMOKE_TINT))).toBeLessThan(lum(SMOKE_PUFF_COLOR) * 0.85);
  });
});

describe('水柱と油の輪の絵（S4）', () => {
  const px = splashPixels(D, R, ART_SEED_FX);
  const a = (u: number, v: number): number => px[(Math.floor(D / 2 + v * R) * D + Math.floor(D / 2 + u * R)) * 4 + 3]! / 255;
  it('水柱: 同じ種なら同じ・芯は明るい（α ≥ 0.9）・縁の外は 0・白', () => {
    expect(splashPixels(D, R, ART_SEED_FX)).toEqual(px);
    expect(a(0, 0)).toBeGreaterThanOrEqual(0.9);
    expect(splashAlphaAt(0.995, 0, [0, 0, 0, 0, 0, 0], [])).toBeLessThan(0.02);
    for (let i = 0; i < px.length; i += 4) if (px[i + 3]! > 0) expect(px[i]! + px[i + 1]! + px[i + 2]!).toBe(765);
  });
  it('水柱: 放射の筋は無い（半径 0.55〜0.9 の輪で α ≥ 0.5 の画素は 15% 以下・水滴は SPLASH_DROPLETS 個）、塊の輪郭は角度で揺れる（α 0.5 の半径の最大/最小 ≥ 1.15）', () => {
    let ring = 0;
    let hot = 0;
    for (let y = 0; y < D; y++) {
      for (let x = 0; x < D; x++) {
        const r = Math.hypot(x + 0.5 - D / 2, y + 0.5 - D / 2) / R;
        if (r < 0.55 || r > 0.9) continue;
        ring++;
        if (px[(y * D + x) * 4 + 3]! >= 128) hot++;
      }
    }
    expect(hot / ring).toBeLessThanOrEqual(0.15);
    expect(SPLASH_DROPLETS).toBeLessThanOrEqual(10);
    const radii: number[] = [];
    for (let k = 0; k < 24; k++) {
      const th = (k / 24) * Math.PI * 2;
      let r = 0;
      while (r < 0.6 && a(Math.cos(th) * r, Math.sin(th) * r) >= 0.5) r += 0.01;
      radii.push(r);
    }
    expect(Math.max(...radii) / Math.min(...radii)).toBeGreaterThanOrEqual(1.15);
  });
  it('油の輪: 中は暗い油膜（α ≥ 0.5・明るさ ≤ 40）、縁の光は中より明るい、泡は SLICK_BUBBLES 個で中の半分の内、縁の外は 0、同じ種なら同じ', () => {
    const s = slickPixels(D, R, ART_SEED_FX);
    expect(slickPixels(D, R, ART_SEED_FX)).toEqual(s);
    const at = (u: number, v: number): number => (Math.floor(D / 2 + v * R) * D + Math.floor(D / 2 + u * R)) * 4;
    const bubbles = slickBubbles(ART_SEED_FX);
    expect(bubbles.length).toBe(SLICK_BUBBLES);
    for (const b of bubbles) expect(Math.hypot(b.x, b.y) + b.r).toBeLessThan(0.6);
    // 泡の無い所の中の明るさ
    let probe = [0.08, 0];
    for (const c of [[0.08, 0], [-0.08, 0], [0, 0.08], [0, -0.08], [0.15, 0.15]]) if (bubbles.every((b) => Math.hypot(c[0]! - b.x, c[1]! - b.y) > b.r + 0.06)) probe = c;
    const i = at(probe[0]!, probe[1]!);
    expect(s[i + 3]! / 255).toBeGreaterThanOrEqual(0.5);
    expect(lum((s[i]! << 16) | (s[i + 1]! << 8) | s[i + 2]!)).toBeLessThanOrEqual(40);
    let edgeMax = 0;
    for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
      const r = Math.hypot(x + 0.5 - D / 2, y + 0.5 - D / 2) / R;
      const j = (y * D + x) * 4;
      if (r >= 0.995) expect(s[j + 3]!).toBeLessThanOrEqual(3);
      if (r > 0.6 && r < 0.95 && s[j + 3]! > 40) edgeMax = Math.max(edgeMax, lum((s[j]! << 16) | (s[j + 1]! << 8) | s[j + 2]!));
    }
    expect(edgeMax).toBeGreaterThan(60);
  });
  it('source: fx-art は画素の式で tex-splash と tex-oil-slick を描き（放射の筋・lineCap なし）、fire-fx の沈没の輪は tex-oil-slick を tint せずに使う', () => {
    const fx = read('src/assets/fx-art.ts');
    expect(fx).toContain('paintPixels(scene, TEXTURE_KEYS.splash, d, splashPixels(d, R, ART_SEED_FX));');
    expect(fx).toContain('paintPixels(scene, TEXTURE_KEYS.oilSlick, d, slickPixels(d, R, ART_SEED_FX));');
    expect(fx).not.toMatch(/lineCap|splashDroplets/);
    expect(GC).toContain("oilSlick: 'tex-oil-slick',");
    const ff = read('src/systems/fire-fx.ts');
    expect(ff).toContain('scene.add.image(0, 0, TEXTURE_KEYS.oilSlick).setDepth(SINK_RING_DEPTH).setVisible(false)');
    expect(ff).not.toMatch(/TEXTURE_KEYS\.splash|SINK_RING_TINT/);
  });
});

describe('航跡・星弾・昼の海・岸の帯（S4）', () => {
  it('航跡: 腕は 1 枚の台形を長さ方向のグラデーションで塗り（端は α 0）、frame ごとに枠で切る', () => {
    const fx = read('src/assets/fx-art.ts');
    expect(fx).toContain('const g = ctx.createLinearGradient(x0, y0, x1, y1);');
    expect(fx).toContain('ctx.rect(0, top, W, H);');
    expect(fx.split('ctx.clip();').length - 1).toBe(1);
    expect(fx).not.toMatch(/const N = 8;/);
  });
  it('星弾の光は白に近い（彩度 < 0.06。照明弾の tint は掛け算のまま）、light-art は SS_LIGHT_COLOR・探照灯は SL_LIGHT_COLOR で描く', () => {
    const r = (SS_LIGHT_COLOR >> 16) & 255;
    const g = (SS_LIGHT_COLOR >> 8) & 255;
    const b = SS_LIGHT_COLOR & 255;
    expect((Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(r, g, b)).toBeLessThan(0.06);
    expect(read('src/assets/light-art.ts')).toContain('starshellPixels(d, R, SS_LIGHT_COLOR)');
    expect(read('src/assets/light-art.ts')).toContain('searchlightPixels(W, H, halfW, SL_LIGHT_COLOR)');
  });
  it('昼の波頭は控えめ（α ≤ 0.25・白波 ≤ 0.4）、波頭の群れ・きらめきは世界の内に収まる所だけ出す（見え方が変わった時だけ setVisible）', () => {
    expect(SEA_LIGHT_ART.day.crestAlpha).toBeLessThanOrEqual(0.25);
    expect(WHITECAP_ALPHA_MAX).toBeLessThanOrEqual(0.4);
    const fx = read('src/systems/sea-fx.ts');
    expect(fx).toContain('const v = this.on && x - b.hw >= 0 && x + b.hw <= b.bw && y - b.hh >= 0 && y + b.hh <= b.bh;');
    expect(fx).toContain('if (img.visible !== v) img.setVisible(v);');
    expect(read('src/systems/world-art.ts')).toContain('w.setup.mission.bounds);');
  });
  it('岸の帯は jp_03 でも切らない。陰の絵は陸の側（岸の線から海へ 8 m）を帯の上・上陸の印の下の深さに、海の側は輪と同じ shallows に分けて置く', () => {
    expect(COAST_STRIP_DEPTH).toBeLessThan(EVAC_COVER_LAND_DEPTH);
    expect(EVAC_COVER_LAND_DEPTH).toBeLessThan(depthOf('landingMark'));
    expect(COAST_STRIP_SEA_M).toBe(8);
    const t = read('src/systems/evac-terrain.ts');
    expect(t).toContain('const land = artImage(scene, a, EVAC_COVER_LAND_DEPTH);');
    expect(t).toContain('const sea = artImage(scene, a, DEPTH.shallows);');
    expect(t).toContain('land.setCrop(0, 0, land.width, cut);');
    expect(t).toContain('sea.setCrop(0, cut, sea.width, sea.height - cut);');
  });
  it('触ったファイルは 300 行以下', () => {
    for (const f of ['src/assets/splash-shape.ts', 'src/assets/fx-art.ts', 'src/systems/fire-fx.ts', 'src/systems/sea-fx.ts', 'src/systems/coast-fx.ts', 'src/assets/coast-shape.ts', 'src/systems/evac-terrain.ts',
      'src/assets/light-art.ts', 'src/config/fx-art-config.ts', 'src/config/sea-art-config.ts', 'src/config/game-config.ts', 'src/systems/world-art.ts']) {
      expect(read(f).split('\n').length - 1, f).toBeLessThanOrEqual(300);
    }
  });
});
