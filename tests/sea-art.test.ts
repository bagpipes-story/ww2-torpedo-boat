// v0.7.0 S3a（アートと音①：コードで描く絵。spec-v0700 §5.1・§5.6・§7.6）: 海の面の Phaser に依らない規則と、作法の pin。
// - タイルの置き方（assets/sea-shape）: 同じ種なら同じ・大きさ 512（2 の累乗・0.5 px/m × 1,024 m）・弧の本数と長さ・向きは波の来る向き ± 乱れ・細部は 2 px 以上（R17）・
//   周期の縁をまたぐ物は反対側にも描く（継ぎ目なし）・白波は弧の上。
// - 光の表（config/sea-art-config）: 夜の α ≤ 0.12（§3.2）、きらめきの α ≤ 0.3・明滅の周期 ≥ 2 秒・振れ幅 ≤ 0.5（R9）、夜明けの光の α は 0.22 × sin(π × 段/16) で夜と昼は 0・dayStart は 0（R4）。
// - 升（R5）: 周期の倍数に揃い worldView ＋ 余白を覆う。きらめきの置き直しは反対側へ。
// - source の pin: Boot の 1 行・world-visuals の最後の 1 行ずつ（R13）・mission-world は論理の後に 1 つ作るだけ・sea-fx は TileSprite を世界の座標に置き setSize を呼ばない・
//   texture の鍵は D2 の 3 つ。描画の規則（update で確保しない・絵だけの乱数）は tests/art-rules が sea-art・sea-fx・world-art に自動で効く。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dawnGlowAlpha, glintBlink, mixRgb, patchEdgeFade, SEA_TILE_TEX_PX, seaCellInto, seaPatchPlan, seaTilePlan, wrapInto, wrapOffsets } from '../src/assets/sea-shape';
import { SEA_LIGHT_STEPS } from '../src/config/dawn-config';
import {
  ART_SEED_GLINT, ART_SEED_SEA, DAWN_GLOW_ALPHA_MAX, DAWN_GLOW_DEPTH, DAWN_GLOW_OVERSCAN, GLINT_ALPHA_MAX, GLINT_DEPTH, GLINT_H_M, GLINT_PERIOD_MIN_S, GLINT_SWING_MAX, GLINT_W_M,
  SEA_ART_DEPTH, SEA_ART_PX_PER_M, SEA_CAP_COUNT, SEA_CREST_BASE_DEG, SEA_CREST_COUNT, SEA_CREST_JITTER_DEG, SEA_CREST_LEN_PX, SEA_LAYER_MODE, SEA_LIGHT_ART, SEA_NIGHT_ALPHA_MAX,
  SEA_PATCH_ARCS, SEA_PATCH_COUNT, SEA_PATCH_EDGE_FADE_PX, SEA_PATCH_FRAMES, SEA_PATCH_H_PX, SEA_PATCH_W_PX, SEA_TILE_LOCAL_H, SEA_TILE_LOCAL_W, SEA_TILE_PERIOD_M, SEA_VIEW_MARGIN_M, WHITECAP_ALPHA_MAX,
} from '../src/config/sea-art-config';

const read = (f: string): string => readFileSync(f, 'utf8');
const DEG = Math.PI / 180;

describe('海の模様のタイルの置き方（assets/sea-shape。絵だけの乱数 ART_SEED_SEA）', () => {
  const plan = seaTilePlan(ART_SEED_SEA);
  it('大きさは 512 px（周期 1,024 m × 0.5 px/m）＝2 の累乗（WebGL の REPEAT）', () => {
    expect(SEA_TILE_TEX_PX).toBe(512);
    expect(SEA_TILE_TEX_PX).toBe(SEA_TILE_PERIOD_M * SEA_ART_PX_PER_M);
    expect(Math.log2(SEA_TILE_TEX_PX) % 1).toBe(0);
    expect(plan.size).toBe(SEA_TILE_TEX_PX);
  });
  it('同じ種なら同じ置き方、種が違えば違う（描く順を固定＝同じ画素）', () => {
    expect(seaTilePlan(ART_SEED_SEA)).toEqual(plan);
    expect(seaTilePlan(ART_SEED_SEA + 1)).not.toEqual(plan);
  });
  it('弧は本数 × 2（下塗りと芯）、中心はタイルの内、長さは表の範囲、向きは波の来る向き ± 乱れ、たわみは弧（真っ直ぐな点の列ではない）', () => {
    expect(plan.crests.length).toBe(SEA_CREST_COUNT * 2);
    for (const c of plan.crests) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThan(plan.size);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeLessThan(plan.size);
      expect(c.len).toBeGreaterThanOrEqual(SEA_CREST_LEN_PX[0]);
      expect(c.len).toBeLessThanOrEqual(SEA_CREST_LEN_PX[1]);
      expect(Math.abs(c.ang - SEA_CREST_BASE_DEG * DEG)).toBeLessThanOrEqual(SEA_CREST_JITTER_DEG * DEG + 1e-9);
      expect(c.sag).toBeGreaterThan(0);
    }
    const angles = new Set(plan.crests.map((c) => Math.round(c.ang / DEG)));
    expect(angles.size).toBeGreaterThan(20); // 一方向にそろった縞にしない
  });
  it('細部は 2 px 以上（R17）、α は 0〜1', () => {
    for (const s of [...plan.crests, ...plan.caps]) {
      expect(s.w).toBeGreaterThanOrEqual(2);
      expect(s.a).toBeGreaterThan(0);
      expect(s.a).toBeLessThanOrEqual(1);
    }
    for (const s of plan.swells) expect(s.a).toBeLessThanOrEqual(0.15); // うねりはごく薄い
  });
  it('白波は本数どおりで、どれかの弧の上（中心から長さの 0.3 以内・同じ向き）', () => {
    expect(plan.caps.length).toBe(SEA_CAP_COUNT);
    for (const cap of plan.caps) {
      const near = plan.crests.some((c) => c.ang === cap.ang && Math.hypot(c.x - cap.x, c.y - cap.y) <= c.len * 0.3 + 1e-9);
      expect(near).toBe(true);
    }
  });
  it('周期の縁をまたぐ物は反対側にも描く（継ぎ目なし）: 内側は 1 か所、縁は 2、角は 4', () => {
    expect(wrapOffsets(256, 256, 20, 512)).toEqual([[0, 0]]);
    expect(wrapOffsets(5, 256, 20, 512).map((o) => o[0]).sort()).toEqual([0, 512]);
    expect(wrapOffsets(510, 256, 20, 512).map((o) => o[0]).sort()).toEqual([-512, 0]);
    expect(wrapOffsets(5, 5, 20, 512)).toHaveLength(4);
    let crossing = 0;
    for (const c of plan.crests) if (wrapOffsets(c.x, c.y, c.len / 2 + c.w, plan.size).length > 1) crossing++;
    expect(crossing).toBeGreaterThan(0);
  });
});

describe('波頭の群れ（patches 方式＝S3a の計測で既定。spec §5.1 の第 2 案）', () => {
  const plan = seaPatchPlan(ART_SEED_SEA);
  it('既定は patches（全面の層を塗らない）。個数 ＋ きらめきの最大 ≤ 画面に見える物の門 +40、1 枚は 0.5 px/m で 320 × 96 m', () => {
    expect(SEA_LAYER_MODE).toBe('patches');
    const maxGlints = Math.max(...Object.values(SEA_LIGHT_ART).map((l) => l.glints));
    expect(SEA_PATCH_COUNT + maxGlints + 1).toBeLessThanOrEqual(40); // +1 は夜明けの光（移り変わりの間だけ見える）
    expect(SEA_PATCH_W_PX / SEA_ART_PX_PER_M).toBe(320);
    expect(SEA_PATCH_H_PX / SEA_ART_PX_PER_M).toBe(96);
  });
  it('同じ種なら同じ。frame は FRAMES 枚で弧 ARCS × 2、弧は枠の内（長さの半分 ＋ 2 px 以上内）、縁へ向けて α が落ちる、細部 2 px 以上', () => {
    expect(seaPatchPlan(ART_SEED_SEA)).toEqual(plan);
    expect(plan.frames.length).toBe(SEA_PATCH_FRAMES);
    for (const f of plan.frames) {
      expect(f.length).toBe(SEA_PATCH_ARCS * 2);
      for (const c of f) {
        expect(c.x - c.len / 2).toBeGreaterThanOrEqual(2 - 1e-9);
        expect(c.x + c.len / 2).toBeLessThanOrEqual(plan.w - 2 + 1e-9);
        expect(c.y).toBeGreaterThan(0);
        expect(c.y).toBeLessThan(plan.h);
        expect(c.w).toBeGreaterThanOrEqual(2);
        expect(c.a).toBeLessThanOrEqual(patchEdgeFade(c.x, c.y, plan.w, plan.h) + 1e-9);
      }
    }
    expect(patchEdgeFade(plan.w / 2, plan.h / 2, plan.w, plan.h)).toBe(1);
    expect(patchEdgeFade(SEA_PATCH_EDGE_FADE_PX / 2, plan.h / 2, plan.w, plan.h)).toBeCloseTo(0.5, 9);
    expect(patchEdgeFade(0, plan.h / 2, plan.w, plan.h)).toBe(0);
    expect(new Set(plan.frames.map((f) => JSON.stringify(f))).size).toBe(SEA_PATCH_FRAMES); // 3 枚は違う絵
  });
  it('sea-fx: patches は同じ鍵の frame p0〜を 1/0.5 倍（1 px ＝ 2 m）で置き、奇数番は左右反転、tint と α は段が変わった時だけ', () => {
    const fx = read('src/systems/sea-fx.ts');
    expect(fx).toContain("scene.add.image(0, 0, TEXTURE_KEYS.seaTile, `p${i % SEA_PATCH_FRAMES}`).setDepth(SEA_ART_DEPTH).setScale(k).setFlipX(i % 2 === 1)");
    expect(fx).toContain('if (this.patches) for (const g of this.patches.imgs) g.setTint(tint).setAlpha(alpha);');
    expect(fx).toContain("const tileMode = SEA_LAYER_MODE === 'tile';");
  });
});

describe('光の表と夜明けの光・きらめき（spec §3.2・§5.6。R4・R9）', () => {
  it('夜（dark・half・full）の模様の α ≤ 0.12、昼はそれより濃い。dark にきらめきは無く、half < full、昼は白波（同じプール）', () => {
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
    expect(art).toContain("if (SEA_LAYER_MODE === 'tile') paintSeaTile(scene);\n  else paintSeaPatches(scene);");
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
    expect(fx).not.toMatch(/\.tilePosition|setTilePosition/);
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
