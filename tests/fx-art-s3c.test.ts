// v0.7.0 S3c（アートと音①：コードで描く絵。spec-v0700 §5.4・§5.5・§4.4・§7.8）: 炎と煙・探照灯・星弾・煙幕・岸の帯。
// - 探照灯・星弾・煙幕（assets/light-shape・light-art）: tex-ab の CHECK と同じ数え方で、探照灯の先端の行の α ≥ 0.6・扇の内の α ≥ 0.85、星弾の半径 92% の内の α ≥ 0.6 と明るい縁、
//   煙幕の半径の帯（0〜0.4・0.4〜0.7・0.7〜1.0）の α が v0.6.11 の 3 重の円の ±10%（R2・R32）、覆い（α ≥ 0.5）≥ placeholder の 85%、寸法の式は placeholder と同じ（鍵・寸法・原点はそのまま）。
// - 炎と煙（assets/fire-shape・systems/fire-fx）: 枠の選び方（決まった順・続く枠は保つ・上限 6）、玉の半径 ≤ 15 m（小艇 9）・α ≤ 0.5・持ち主が見えなくなれば 0.3 秒で 0（R10・R26）、
//   炎の体 ≤ 船幅 0.8、同じ種なら同じ舌、確保は constructor だけ、ADD は炎だけ・深さ。
// - 岸の帯（assets/coast-shape・systems/coast-fx）: jp_03 の陰と壕の絵の幅をよける（R16。S4 でやめて帯を通す＝tests/fx-art-s4）、区間を隙間なく覆い・帯の端の列が続き・区間の端は透明へ落とした列（R24 の 1 枚おきの反転）、
//   中身は周期で続き・陸の側 112 m・海の側 8 m、毎フレームは何もしない。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { coastBobs, coastPlan, type CoastBob } from '../src/assets/coast-shape';
import { assignFireSlots, flameDiameterM, flameFlicker, flameTongues, puffAlpha, puffMaxRadiusM, puffRadiusM } from '../src/assets/fire-shape';
import { searchlightPixels, smokeAlphaAt, smokePixels, starshellAlphaAt, starshellPixels } from '../src/assets/light-shape';
import {
  ADD_DEPTH_STEP, ART_SEED_FX, FIRE_HIDE_AFTER_S, FIRE_PUFF_LIFE_S, FIRE_PUFFS, FIRE_SMOKE_DEPTH, FIRE_SMOKE_MAX_ALPHA, FIRE_SMOKE_MAX_RADIUS_M, FIRE_SOURCES, FLAME_ALPHA, FLAME_BEAM_SHARE,
  SINK_RING_DEPTH, WAKE_DEPTH,
} from '../src/config/fx-art-config';
import { ART_SEED_COAST, COAST_STRIP_DEPTH, COAST_STRIP_FADE_M, COAST_STRIP_LAND_M, COAST_STRIP_LEN_M, COAST_STRIP_SEA_M } from '../src/config/sea-art-config';
import { gameData } from '../src/config/game-data';

const read = (f: string): string => readFileSync(f, 'utf8');
/** game-config・ui-config は window を読むので tests（Node の型）から import しない＝source から数を読む */
const GC = read('src/config/game-config.ts');
const UI = read('src/config/ui-config.ts');
const depthOf = (name: string): number => Number(new RegExp(`\\n  ${name}: ([0-9.]+),`).exec(GC)![1]);
const DEPTH = { shallows: depthOf('shallows'), landingMark: depthOf('landingMark'), smoke: depthOf('smoke'), shell: depthOf('shell'), storm: depthOf('storm') };
const uiNum = (name: string): number => Number(new RegExp(`export const ${name} = (0x[0-9a-f]+|[0-9.]+);`).exec(UI)![1]);
const SEARCHLIGHT_COLOR = uiNum('SEARCHLIGHT_COLOR');
const STARSHELL_COLOR = uiNum('STARSHELL_COLOR');
const SMOKE_PUFF_COLOR = uiNum('SMOKE_PUFF_COLOR');
const KS = [1, 1.0415, 1.0915, 2];

/** tex-ab の metrics と同じ数え方（R＝min(w,h)/2・半径の帯・92% の内・扇の内と先端の行・α ≥ 0.5 の覆い） */
function metrics(px: Uint8ClampedArray, w: number, h: number, searchlight = false): { opaque: number; bands: number[]; in92: number; cone: number; tip: number } {
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) / 2;
  const band = [[0, 0], [0, 0], [0, 0]];
  let opaque = 0;
  let in92 = 0;
  let in92n = 0;
  let cone = 0;
  let conen = 0;
  let tip = 0;
  let tipn = 0;
  const halfW = w / 2 - 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = px[(y * w + x) * 4 + 3]! / 255;
      if (a >= 0.5) opaque++;
      const rr = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / R;
      if (rr < 1) {
        const j = rr < 0.4 ? 0 : rr < 0.7 ? 1 : 2;
        band[j]![0]! += a;
        band[j]![1]!++;
      }
      if (rr < 0.92) {
        in92 += a;
        in92n++;
      }
      if (searchlight && Math.abs(x + 0.5 - cx) <= (halfW * (h - (y + 0.5))) / h) {
        cone += a;
        conen++;
        if (y === 0) {
          tip += a;
          tipn++;
        }
      }
    }
  }
  return { opaque, bands: band.map(([s, n]) => s! / n!), in92: in92 / in92n, cone: conen ? cone / conen : 0, tip: tipn ? tip / tipn : 0 };
}

/** v0.6.11 の煙（3 重の円 α 0.35・0.35・0.3 を半径 1・0.7・0.4 に重ねた）の画素 */
function placeholderSmoke(d: number, R: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(d * d * 4);
  for (let y = 0; y < d; y++) {
    for (let x = 0; x < d; x++) {
      const r = Math.hypot(x + 0.5 - d / 2, y + 0.5 - d / 2);
      let t = 1;
      if (r < R) t *= 0.65;
      if (r < R * 0.7) t *= 0.65;
      if (r < R * 0.4) t *= 0.7;
      px[(y * d + x) * 4 + 3] = Math.round(255 * (1 - t));
    }
  }
  return px;
}

describe('探照灯・星弾・煙幕の絵（S3c。R2・R32。鍵・寸法・原点は v0.6.11 のまま）', () => {
  const cones = [...new Set((gameData.enemies.enemies as unknown as { searchlight?: { cone_deg: number } }[]).filter((e) => e.searchlight).map((e) => e.searchlight!.cone_deg)), 8, 16];
  it.each(KS)('探照灯（k %s）: 先端の行の α ≥ 0.6・扇の内の α ≥ 0.85・覆い ≥ 扇の 85%・扇の外は 1 px で 0（縁は論理の角のまま）', (k) => {
    for (const cone of cones) {
      const L = 256 * k;
      const halfW = Math.tan(((cone / 2) * Math.PI) / 180) * L;
      const W = Math.ceil(halfW * 2) + 2;
      const H = Math.ceil(L);
      const px = searchlightPixels(W, H, halfW, SEARCHLIGHT_COLOR);
      const m = metrics(px, W, H, true);
      expect(m.tip, `${cone}°`).toBeGreaterThanOrEqual(0.6);
      expect(m.cone, `${cone}°`).toBeGreaterThanOrEqual(0.85);
      let tri = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (Math.abs(x + 0.5 - W / 2) <= (halfW * (H - (y + 0.5))) / H) tri++;
      expect(m.opaque).toBeGreaterThanOrEqual(tri * 0.85);
      // 先端の行の扇の外（半幅 + 1.5 px より外）は 0
      const y0 = 0;
      const xOut = Math.ceil(W / 2 + halfW + 1.5);
      if (xOut < W) expect(px[(y0 * W + xOut) * 4 + 3]).toBe(0);
      const yMid = Math.floor(H * 0.7); // 光源から長さの 3 割の行の中心は α 1
      expect(px[(yMid * W + Math.floor(W / 2)) * 4 + 3]).toBe(255);
    }
  });
  it.each(KS)('星弾（k %s）: 半径 92%% の内の α ≥ 0.6・覆い ≥ 円の 85%%・縁（92〜100%%）は面より明るく、照明半径の外は 0', (k) => {
    const R = 128 * k;
    const d = Math.ceil(R * 2) + 2;
    const m = metrics(starshellPixels(d, R, STARSHELL_COLOR), d, d);
    expect(m.in92).toBeGreaterThanOrEqual(0.6);
    let disk = 0;
    for (let y = 0; y < d; y++) for (let x = 0; x < d; x++) if (Math.hypot(x + 0.5 - d / 2, y + 0.5 - d / 2) < R) disk++;
    expect(m.opaque).toBeGreaterThanOrEqual(disk * 0.85);
    expect(starshellAlphaAt(0.97, -1)).toBeGreaterThan(starshellAlphaAt(0.6, -1) + 0.15);
    expect(starshellAlphaAt(0.6, -1)).toBeGreaterThanOrEqual(0.6);
    expect(starshellAlphaAt(1, 1)).toBe(0);
  });
  it.each(KS)('煙幕（k %s）: 半径の帯の α が v0.6.11 の 3 重の円の ±10%%（余裕を見て ±7%%）・覆い ≥ 85%%・輪郭は丸（半径の 93%% の外は角度で変わらない）・最後の 5%% で落とす', (k) => {
    const R = 64 * k;
    const d = Math.ceil(R * 2) + 2;
    const b = metrics(smokePixels(d, R, SMOKE_PUFF_COLOR), d, d);
    const a = metrics(placeholderSmoke(d, R), d, d);
    for (let i = 0; i < 3; i++) expect(Math.abs(b.bands[i]! - a.bands[i]!), `帯 ${i}: ${b.bands[i]} / ${a.bands[i]}`).toBeLessThanOrEqual(a.bands[i]! * 0.07);
    expect(b.opaque).toBeGreaterThanOrEqual(a.opaque * 0.85);
    for (const r of [0.95, 0.97]) {
      const v0 = smokeAlphaAt(r, 0);
      for (let th = 0; th < Math.PI * 2; th += 0.4) expect(smokeAlphaAt(r * Math.cos(th), r * Math.sin(th))).toBeCloseTo(v0, 6);
    }
    expect(smokeAlphaAt(0.95, 0)).toBeGreaterThan(0.25);
    expect(smokeAlphaAt(1, 0)).toBe(0);
  });
  it('寸法の式は placeholder と同じ（探照灯 ceil(2·半幅)+2 × ceil(L)・星弾と煙 ceil(2R)+2）。placeholders は名前と UI の部分を残して light-art を呼ぶ（Graphics で描かない）', () => {
    const la = read('src/assets/light-art.ts').replace(/\/\/[^\n]*/g, '');
    expect(la).toContain('const W = Math.ceil(halfW * 2) + 2;');
    expect(la).toContain('const H = Math.ceil(L);');
    expect(la.split('const d = Math.ceil(R * 2) + 2;').length - 1).toBe(2);
    expect(la).toContain("import { paintCanvas } from './sea-art';");
    expect(la).not.toMatch(/generateTexture|fillGradientStyle/);
    const ph = read('src/assets/placeholders.ts');
    expect(ph).toContain('export function generateGunneryTextures(scene: Phaser.Scene, searchlightConeDeg: number): void {');
    expect(ph).toContain('export function generateSmokeTextures(scene: Phaser.Scene): void {');
    expect(ph).toContain('paintSearchlightTexture(scene, searchlightConeDeg);');
    expect(ph).toContain('paintStarshellTexture(scene);');
    expect(ph).toContain('paintSmokePuffTexture(scene);');
    expect(ph).not.toMatch(/TEXTURE_KEYS\.(searchlight|starshell|smokePuff)/);
    expect(read('src/scenes/boot-scene.ts')).toContain('generateGunneryTextures(this, enemy.searchlight ? enemy.searchlight.cone_deg : 0);');
  });
});

describe('炎と煙（S3c。R10・R26）', () => {
  it('枠の選び方: 燃えている発生源を決まった順で空いた枠へ、続く発生源は同じ枠、上限 FIRE_SOURCES、消えたら空ける', () => {
    expect(FIRE_SOURCES).toBe(6);
    expect(FIRE_PUFFS).toBe(12); // S4: 16 → 12（tests/fx-art-s4）
    const n = 9;
    const active = new Uint8Array(n);
    const slotOf = new Int16Array(n).fill(-1);
    const probeOf = new Int16Array(FIRE_SOURCES).fill(-1);
    active.set([0, 0, 1, 0, 1]);
    expect(assignFireSlots(active, slotOf, probeOf)).toBe(2);
    expect([slotOf[2], slotOf[4]]).toEqual([0, 1]);
    active[0] = 1;
    assignFireSlots(active, slotOf, probeOf);
    expect([slotOf[2], slotOf[4], slotOf[0]]).toEqual([0, 1, 2]); // 続く枠は保つ
    active[2] = 0;
    assignFireSlots(active, slotOf, probeOf);
    expect(slotOf[2]).toBe(-1);
    expect(probeOf[0]).toBe(-1);
    active.fill(1);
    expect(assignFireSlots(active, slotOf, probeOf)).toBe(FIRE_SOURCES);
    expect([...slotOf].filter((s) => s >= 0)).toHaveLength(FIRE_SOURCES);
  });
  it('煙の玉は煙幕と見分ける: 半径 ≤ 15 m（煙幕の 60 m の 1/4。小艇は 9）・α ≤ 0.5・膨らむ・寿命で 0', () => {
    expect(FIRE_SMOKE_MAX_RADIUS_M).toBeLessThanOrEqual(15);
    expect(FIRE_SMOKE_MAX_ALPHA).toBeLessThanOrEqual(0.5);
    expect(puffMaxRadiusM(true)).toBeLessThanOrEqual(15);
    expect(puffMaxRadiusM(false)).toBeLessThanOrEqual(9);
    let prev = 0;
    for (let t = 0; t <= FIRE_PUFF_LIFE_S; t += 0.1) {
      const r = puffRadiusM(t, FIRE_PUFF_LIFE_S, puffMaxRadiusM(true));
      expect(r).toBeGreaterThanOrEqual(prev);
      expect(r).toBeLessThanOrEqual(15);
      expect(puffAlpha(t, FIRE_PUFF_LIFE_S, 0)).toBeLessThanOrEqual(FIRE_SMOKE_MAX_ALPHA + 1e-9);
      prev = r;
    }
    expect(puffAlpha(FIRE_PUFF_LIFE_S, FIRE_PUFF_LIFE_S, 0)).toBe(0);
  });
  it('持ち主が見えなくなった玉は FIRE_HIDE_AFTER_S（0.3 秒）で消える（隠れた敵の位置を指さない＝R26）', () => {
    expect(FIRE_HIDE_AFTER_S).toBe(0.3);
    expect(puffAlpha(1, FIRE_PUFF_LIFE_S, 0.15)).toBeCloseTo(puffAlpha(1, FIRE_PUFF_LIFE_S, 0) * 0.5, 6);
    expect(puffAlpha(1, FIRE_PUFF_LIFE_S, 0.3)).toBe(0);
  });
  it('炎の体は船幅の 0.8 倍まで（小艇で船体の色を覆わない）・ちらつきは α の帯の内・同じ種なら同じ舌（frame で違う）', () => {
    expect(FLAME_BEAM_SHARE).toBeLessThanOrEqual(0.8);
    for (const beam of [7.3, 8.6, 12.6, 21.6, 32]) expect(flameDiameterM(beam)).toBeLessThanOrEqual(beam * 0.8 + 1e-9);
    const out = new Float32Array(2);
    for (let t = 0; t < 3; t += 0.05) {
      flameFlicker(t, 1.3, out);
      expect(out[0]).toBeGreaterThanOrEqual(FLAME_ALPHA[0] - 1e-6);
      expect(out[0]).toBeLessThanOrEqual(FLAME_ALPHA[1] + 1e-6);
    }
    expect(flameTongues(ART_SEED_FX, 0)).toEqual(flameTongues(ART_SEED_FX, 0));
    expect(flameTongues(ART_SEED_FX, 0)).not.toEqual(flameTongues(ART_SEED_FX, 1));
  });
  it('深さの読み口（source から）が v0.6.11 の DEPTH と同じ', () => {
    expect(DEPTH).toEqual({ shallows: 1, landingMark: 1.5, smoke: 11, shell: 12, storm: 3 });
    expect([SEARCHLIGHT_COLOR, STARSHELL_COLOR, SMOKE_PUFF_COLOR]).toEqual([0xfff2c0, 0xfff0b0, 0x9aa4b0]);
  });
  it('fire-fx: 確保は constructor だけ（update に new・scene.add なし）、ADD は炎だけで深さは煙の ＋0.01（R25）、深さは煙幕 11 の上・砲弾 12 の下、玉は持ち主の番号を持つ', () => {
    const s = read('src/systems/fire-fx.ts').replace(/\/\/[^\n]*/g, '');
    const ctor = s.slice(s.indexOf('  constructor('), s.indexOf('  update('));
    const rest = s.slice(s.indexOf('  update('), s.indexOf('  destroy('));
    expect(rest).not.toMatch(/\bnew\s|scene\.add\.|\.push\(|tweens/);
    expect(ctor.split('setBlendMode(BLEND_ADD)').length - 1).toBe(1);
    expect(ctor).toContain('FIRE_SMOKE_DEPTH + ADD_DEPTH_STEP');
    expect(ctor).toContain('setTint(FIRE_SMOKE_TINT).setDepth(FIRE_SMOKE_DEPTH)');
    expect(s).toContain('private readonly owner = new Int16Array(FIRE_PUFFS)');
    expect(FIRE_SMOKE_DEPTH).toBeGreaterThan(DEPTH.smoke);
    expect(FIRE_SMOKE_DEPTH + ADD_DEPTH_STEP).toBeLessThan(DEPTH.shell);
    expect(SINK_RING_DEPTH).toBeGreaterThan(DEPTH.storm);
    expect(SINK_RING_DEPTH).toBeLessThan(WAKE_DEPTH);
  });
});

describe('岸の帯（S3c。R16・R24）', () => {
  const bobsOk = (a: number, b: number, bobs: readonly CoastBob[]): void => {
    const P = COAST_STRIP_LEN_M;
    expect(bobs[0]!.x).toBe(a);
    let x = a;
    for (let i = 0; i < bobs.length; i++) {
      const bb = bobs[i]!;
      expect(bb.x).toBe(x);
      expect(bb.cut + bb.w).toBe(P);
      x += bb.w;
      if (i > 0) {
        const p = bobs[i - 1]!;
        const right = p.flipX ? p.cut : P; // 左の帯の右端の列
        const left = bb.flipX ? P : bb.cut; // 右の帯の左端の列
        const same = p.flipX !== bb.flipX ? Math.abs(right - left) <= 1 : (right % P) === (left % P) || Math.abs(right - left) <= 1;
        expect(same, `${i}: ${right} | ${left}`).toBe(true);
      }
    }
    expect(Math.abs(x - b)).toBeLessThanOrEqual(1);
    // 区間の両端は透明へ落とした列（行 1 の x 512）
    expect(bobs[0]!.flipX && bobs[0]!.row === 1).toBe(true);
    const last = bobs[bobs.length - 1]!;
    expect(!last.flipX && last.row === 1).toBe(true);
    for (let i = 1; i < bobs.length - 1; i++) expect(bobs[i]!.row).toBe(0);
    // 満帯は 1 枚おきに反転（R24）: 同じ向きの満帯が 3 つ続かない
    for (let i = 2; i < bobs.length; i++) if (bobs[i]!.w === P && bobs[i - 1]!.w === P && bobs[i - 2]!.w === P) expect(bobs[i]!.flipX === bobs[i - 1]!.flipX && bobs[i - 1]!.flipX === bobs[i - 2]!.flipX).toBe(false);
  };
  it('南の岸の全幅（例 us_03 −600〜6,600）と色々な長さを隙間なく覆い、帯の継ぎ目の列が続く', () => {
    for (const [a, b] of [[-600, 6600], [-400, 3600], [800, 1450], [-400, 500], [2710, 3600], [0, 100], [0, 1024], [0, 1500]] as const) bobsOk(a, b, coastBobs(a, b));
  });
  it('jp_03（S4）: 帯は陰の絵・壕の絵をよけずに岸の端から端まで通す（よけた所の暗緑の矩形をやめた）。壕の岩の絵は帯の上 1.5、陰の絵の陸の側は帯の上（tests/fx-art-s4）', () => {
    const s = read('src/systems/coast-fx.ts').replace(/\/\/[^\n]*/g, '');
    expect(s).not.toMatch(/coastSegments|CAVE_ART_HALF_W_M|COVER_ART_HALF_W_M|shelters/);
    expect(s).toContain('for (const bob of coastBobs(x0, x1)) {');
    for (const [a, b] of [[-400, 3600], [-600, 3800]] as const) bobsOk(a, b, coastBobs(a, b));
  });
  it('帯の中身は絵だけの乱数で同じ種なら同じ・周期で続く（x 0 と 512）・樹冠は陸の側 112 m の内・波打ち際は海の側 8 m', () => {
    const p = coastPlan(ART_SEED_COAST);
    expect(coastPlan(ART_SEED_COAST)).toEqual(p);
    expect(p.sand[0]).toBeCloseTo(p.sand[COAST_STRIP_LEN_M]!, 4);
    expect(p.surf[0]).toBeCloseTo(p.surf[COAST_STRIP_LEN_M]!, 4);
    expect(COAST_STRIP_SEA_M).toBe(8);
    expect(COAST_STRIP_LAND_M).toBe(112);
    expect(COAST_STRIP_FADE_M).toBe(16);
    for (const c of p.crowns) {
      expect(c.y - c.r * 0.5).toBeGreaterThanOrEqual(COAST_STRIP_SEA_M);
      expect(c.y + c.r).toBeLessThanOrEqual(COAST_STRIP_SEA_M + COAST_STRIP_LAND_M + 1e-6);
    }
    // 岸の名の字（陸の中 land_m/2 ≥ 200 m）にかからない
    for (const m of gameData.missionsSeed.missions as unknown as { v0_1_prototype?: { coast?: { land_m: number } } }[]) if (m.v0_1_prototype?.coast) expect(m.v0_1_prototype.coast.land_m / 2).toBeGreaterThan(COAST_STRIP_LAND_M);
  });
  it('coast-fx: 岸の線ごとに Blitter 1 つ（深さ 1.2＝陸の塗り 1 の上・上陸地点の帯 1.5 の下）、毎フレームは何もしない、北の島は上下を反転。world-art が作って破棄する', () => {
    expect(COAST_STRIP_DEPTH).toBeGreaterThan(DEPTH.shallows);
    expect(COAST_STRIP_DEPTH).toBeLessThan(DEPTH.landingMark);
    const s = read('src/systems/coast-fx.ts').replace(/\/\/[^\n]*/g, '');
    expect(s.split('scene.add.blitter(').length - 1).toBe(1);
    expect(s).not.toMatch(/\bupdate\w*\(/);
    expect(s).toContain('.setFlip(bob.flipX, flipY)');
    expect(s).toContain('ensureCoastStripTexture(scene);');
    const wa = read('src/systems/world-art.ts');
    for (const line of ['this.fire = new FireFx(scene, w);', 'this.coast = new CoastFx(scene, w.setup);', 'this.fire.update(realDt);', 'this.fire.destroy();', 'this.coast.destroy();']) expect(wa).toContain(line);
  });
  it('新しい・触ったファイルは 300 行以下', () => {
    for (const f of ['src/assets/light-shape.ts', 'src/assets/light-art.ts', 'src/assets/fire-shape.ts', 'src/assets/coast-shape.ts', 'src/systems/fire-fx.ts', 'src/systems/coast-fx.ts', 'src/systems/world-art.ts', 'src/assets/fx-art.ts', 'src/assets/sea-art.ts', 'src/assets/placeholders.ts', 'src/config/fx-art-config.ts', 'src/config/sea-art-config.ts', 'src/config/game-config.ts']) {
      expect(read(f).split('\n').length - 1, f).toBeLessThanOrEqual(300);
    }
  });
});
