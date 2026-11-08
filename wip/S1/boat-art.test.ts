// v0.7.0 S1（アートと音①：コードで描く絵。spec-v0700 §4.1・§7.3）: 自艇・僚艇・隼艇の絵の形の決まり（Phaser に依らない boat-shape と boat-art-config を読む）。
// - 輪郭はテクスチャの矩形 [0, B] × [0, L] の内・艇首の先が上の中央 (B/2, 0)・艇尾は四角（幅 0.84B〜0.92B。placeholder の 0.84B と同じ読み）・最大幅は長さの 55%。
// - 部品（筒・船室・丸い物・箱）はリムの内（船体の縁から 1 単位以上内。半透明の中心線の筋は船体の内）で、細部は 2 単位以上（R17）。幅 10 単位未満の艇は側の暗い帯（palette.side）を使わない。
// - 自艇のパレット（tint される鍵）は彩度 ≤ 0.12。寸法は art-dims の式のまま（source の pin）・Boot の呼び出しの行は変えない（R14）・placeholders.ts は 300 行以下。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ART_DETAIL_MIN_UNITS, ART_RIM_UNITS, ART_SIDE_BAND_MIN_BEAM_UNITS, ART_TINTED_SATURATION_MAX, BOAT_ART_KIND_BY_ID, BOAT_ART_LAYOUTS, PALETTE_PLAYER, PALETTE_PLAYER_MID,
  type BoatArtKind,
} from '../src/config/boat-art-config';
import { boatShape, hullHalfWidthAt, hullOutline, partBounds } from '../src/assets/boat-shape';
import { gameData, getBoatRecord } from '../src/config/game-data';

const SPRITE_SCALE = gameData.hitRateModel.world.sprite_scale as number;
/** Boot が作る 5 枚（tests/art-inventory の BOAT_IDS と同じ）と、その寸法（世界単位） */
const BOATS = Object.entries(BOAT_ART_KIND_BY_ID).map(([id, kind]) => {
  const b = getBoatRecord(gameData, id);
  return { id, kind, L: b.length_m * SPRITE_SCALE, B: b.beam_m * SPRITE_SCALE };
});
const sat = (c: number): number => {
  const r = (c >> 16) & 255; const g = (c >> 8) & 255; const b = c & 255;
  const mx = Math.max(r, g, b); const mn = Math.min(r, g, b);
  return mx === 0 ? 0 : (mx - mn) / mx;
};

describe('艇の絵の形（v0.7.0 S1）', () => {
  it('5 枚の艇（Elco 80・Elco 77・T-38・T-14・H-38）に形があり、どれも幅 10 単位以上の艇ではない（側の暗い帯は描かない）', () => {
    expect(BOATS.map((b) => b.kind).sort()).toEqual(['elco77', 'elco80', 'h38', 't14', 't38']);
    for (const b of BOATS) expect(b.B, b.id).toBeLessThan(ART_SIDE_BAND_MIN_BEAM_UNITS + 3); // Elco 80 の 12.6 も「小艇」（spec §3.3）
  });
  it.each(BOATS)('$id: 輪郭は矩形の内・艇首の先が上の中央・艇尾は四角（0.84B〜0.92B）・最大幅は長さの 55%', ({ kind, L, B }) => {
    const layout = BOAT_ART_LAYOUTS[kind as BoatArtKind];
    const pts = hullOutline(layout.hull, L, B);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(B + 1e-9);
      expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(L + 1e-9);
    }
    expect(pts[0]).toEqual({ x: B / 2, y: 0 });
    const stern = layout.hull[layout.hull.length - 1]!;
    expect(stern[0]).toBe(1);
    expect(stern[1] * B).toBeGreaterThanOrEqual(0.84 * B - 1e-9);
    expect(stern[1] * B).toBeLessThanOrEqual(0.92 * B + 1e-9);
    const widest = layout.hull.reduce((a, s) => (s[1] > a[1] ? s : a));
    expect(widest[1]).toBe(1);
    expect(widest[0]).toBeCloseTo(0.55, 5);
    expect(hullHalfWidthAt(layout.hull, 0.55, B)).toBeCloseTo(B / 2, 9);
    // 内側の輪郭（地）はリムの幅だけ内
    for (const p of hullOutline(layout.hull, L, B, ART_RIM_UNITS)) expect(Math.abs(p.x - B / 2)).toBeLessThanOrEqual(B / 2 - ART_RIM_UNITS + 1e-9);
  });
  it.each(BOATS)('$id: 部品は船体の縁から 1 単位以上内（艇首・艇尾も）で、細部は 2 単位以上（R17）', ({ kind, L, B }) => {
    const layout = BOAT_ART_LAYOUTS[kind as BoatArtKind];
    const shape = boatShape(layout, L, B);
    expect(shape.parts.length).toBeGreaterThan(3);
    for (const p of shape.parts) {
      if (p.kind === 'poly') continue; // 地の面（リムの内側の輪郭）
      const bb = partBounds(p);
      expect(bb.y0, `${kind} ${p.kind} 艇首`).toBeGreaterThanOrEqual(1 - 1e-9);
      expect(bb.y1, `${kind} ${p.kind} 艇尾`).toBeLessThanOrEqual(L - 1 + 1e-9);
      const margin = p.tone === 'highlight' ? 0.3 : 1; // 中心線の明るい筋（半透明）は船体の内なら良い。筒・船室・丸い物・箱は縁から 1 単位以上内
      for (const y of [bb.y0, (bb.y0 + bb.y1) / 2, bb.y1]) {
        const half = hullHalfWidthAt(layout.hull, y / L, B);
        expect(Math.max(Math.abs(bb.x0 - B / 2), Math.abs(bb.x1 - B / 2)), `${kind} ${p.kind} ${p.tone} y ${y.toFixed(1)}`).toBeLessThanOrEqual(half - margin + 1e-9);
      }
      const w = bb.x1 - bb.x0; const h = bb.y1 - bb.y0;
      expect(Math.min(w, h), `${kind} ${p.kind} ${p.tone}`).toBeGreaterThanOrEqual(ART_DETAIL_MIN_UNITS - 1e-9);
      expect(['rim', 'deck', 'super', 'mid', 'highlight']).toContain(p.tone); // 側の暗い帯（side）は無い
    }
  });
  it('日本の艇は魚雷の有無・船室の位置で、米の艇は操舵室の位置と艇尾の砲で見分ける（spec §3.3「違いは色でなく形」）', () => {
    const l = BOAT_ART_LAYOUTS;
    expect(l.h38.tubes).toHaveLength(0);
    expect(l.t38.tubes.length + l.t14.tubes.length).toBe(2);
    expect(l.t14.cabin![0]).toBeGreaterThan(l.t38.cabin![0]);
    expect(l.elco77.cabin![0]).toBeLessThan(l.elco80.cabin![0]);
    expect(l.elco80.guns.some(([f, x]) => f > 0.8 && x === 0)).toBe(true);
    expect(l.elco77.guns.some(([f]) => f > 0.8)).toBe(false);
  });
  it('自艇のパレット（tint される鍵）は彩度 ≤ 0.12・中間の色も', () => {
    for (const c of [PALETTE_PLAYER.deck, PALETTE_PLAYER.rim, PALETTE_PLAYER.superstructure, PALETTE_PLAYER.highlight, PALETTE_PLAYER_MID]) expect(sat(c)).toBeLessThanOrEqual(ART_TINTED_SATURATION_MAX);
  });
  it('source の pin: boat-art は寸法を art-dims の hullTexSize から・Boot の呼び出しの行は同じ（import だけ boat-art）・placeholders.ts は 300 行以下で艇の絵を持たない', () => {
    const art = readFileSync('src/assets/boat-art.ts', 'utf8');
    expect(art).toContain('hullTexSize(spec.lengthUnits, spec.beamUnits, RENDER_SCALE)');
    expect(art).toContain('export function generatePlayerBoatTexture(scene: Phaser.Scene, spec: BoatTextureSpec, key: string): void');
    const boot = readFileSync('src/scenes/boot-scene.ts', 'utf8');
    expect(boot).toContain("import { generatePlayerBoatTexture } from '../assets/boat-art';");
    expect(boot).toContain('generatePlayerBoatTexture(this, { lengthUnits: b.length_m * spriteScale, beamUnits: b.beam_m * spriteScale }, boatTextureKey(id));');
    const ph = readFileSync('src/assets/placeholders.ts', 'utf8');
    expect(ph).not.toContain('export function generatePlayerBoatTexture');
    expect(ph.split('\n').length).toBeLessThanOrEqual(301);
  });
});
