// v0.8.2 S2b（us_05「スリガオ海峡・最初の接触」。spec-v0820 §4.11 D-A1・D-A2、lead の L30・L33）: 戦艦 扶桑型（tex-battleship-fuso）と重巡 最上（tex-cruiser-mogami）の絵。
// 置き方の決まり（部品は船体の内・≥ 2 単位・中心線の部品は重ならない）と単系統の色は tests/destroyer-art（同じ描き方の 6 形）。ここは:
// - 見分けの鍵（L30）: 戦艦は高い段の塔の艦橋（段は足元の箱の内で上ほど小さい）と連装の主砲塔 6（前 2・中 2・後 2）・舷側の砲郭・艦尾のカタパルト、
//   重巡は前部の主砲塔 3（艦橋より前・後ろに主砲なし）と後部の平らな飛行甲板とレール・カタパルト 2。駆逐艦（陽炎型）と大きさでも見分く。
// - 寸法（art-dims の作法）: Boot の generateColumnTextures が作るのは戦艦・重巡の 2 枚だけ（列の駆逐艦は作らない・1 枚ずつ）で、画素は hullTexSize(記録 × sprite_scale) × 密度 2、
//   描く船体は記録 × sprite_scale（425.5 × 66.2・401.2 × 40.4 単位）で R22 の幅いっぱい＝当たり（kits の寸法 × ship_hit_scale）と同じ大きさ。
// - 今の艦の置き方には新しい部品の型も砲身の任意の欄も無い（今の絵の画素は同じ＝tex-ab）。source の pin: Boot の 1 行・何も import しない config・行数・乱数なし。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { capitalPlan, isCapitalKind, pagodaTier } from '../src/assets/capital-plan';
import { hullTexSize } from '../src/assets/art-dims';
import { hullHalfWidthAt } from '../src/assets/boat-shape';
import { destroyerPlan, type DestroyerPart } from '../src/assets/destroyer-plan';
import { CAPITAL_DETAILS, PAGODA_SHIFT, PAGODA_SHRINK_LEN } from '../src/config/capital-art-config';
import { gameData, getEnemyRecord } from '../src/config/game-data';
import { ART_TEX_DENSITY, SHIP_ART_LAYOUTS, artTexDensity, shipArtKey, shipArtKind } from '../src/config/ship-art-config';
import { setupOf } from './column-world-kit';

const SS = gameData.hitRateModel.world.sprite_scale as number;
const dims = (id: string): { L: number; B: number } => { const r = getEnemyRecord(gameData, id); return { L: r.length_m * SS, B: r.beam_m * SS }; };
const FUSO = dims('ijn_battleship_fuso');
const MOGAMI = dims('ijn_cruiser_mogami');
type Gun = Extract<DestroyerPart, { t: 'gun' }>;
const mains = (parts: readonly DestroyerPart[], B: number): Gun[] => parts.filter((p): p is Gun => p.t === 'gun' && Math.abs(p.cx - B / 2) < 1e-9);
const one = <T extends DestroyerPart['t']>(parts: readonly DestroyerPart[], t: T): Extract<DestroyerPart, { t: T }> => {
  const f = parts.filter((p) => p.t === t);
  expect(f, t).toHaveLength(1);
  return f[0] as Extract<DestroyerPart, { t: T }>;
};

describe('見分けの鍵（L30・D-A1・D-A2）', () => {
  it('戦艦 扶桑型: 連装の主砲塔 6＝前 2（艦橋の前・前向き）・中 2（煙突と後檣の間・前向きと後ろ向き）・後 2（後ろ向き）、5 段の塔の艦橋・煙突 1・舷側の砲郭 片舷 7・艦尾のカタパルト・高角砲 4', () => {
    const { L, B } = FUSO;
    const plan = capitalPlan('fuso', L, B);
    const g = mains(plan.parts, B);
    const pagoda = one(plan.parts, 'pagoda');
    const funnel = one(plan.parts, 'funnel');
    const mast = one(plan.parts, 'mast');
    expect(g.map((p) => p.style)).toEqual(Array(6).fill('twin'));
    expect(g.every((p) => p.w >= 0.4 * B - 1e-9 && p.barrel > 0 && p.dx! > 0 && p.bw! > 0)).toBe(true);
    const fore = g.filter((p) => p.cy < pagoda.cy);
    const mid = g.filter((p) => p.cy > funnel.cy && p.cy < 0.7 * L);
    const aft = g.filter((p) => p.cy >= 0.7 * L);
    expect([fore.length, mid.length, aft.length]).toEqual([2, 2, 2]);
    expect([...fore, ...mid, ...aft].map((p) => p.dir)).toEqual([1, 1, 1, -1, -1, -1]);
    expect(mid[0]!.cy < mast.cy && mast.cy < mid[1]!.cy).toBe(true);
    expect(pagoda.tiers).toBe(5);
    expect(pagoda.cy).toBeLessThan(funnel.cy);
    const cas = plan.parts.filter((p) => p.t === 'casemate');
    expect(cas.map((p) => (p.t === 'casemate' ? [p.side, p.n] : null))).toEqual([[1, 7], [-1, 7]]);
    const cat = plan.parts.filter((p) => p.t === 'tubes');
    expect(cat.map((p) => (p.t === 'tubes' ? [p.n, p.cy > 0.85 * L, Math.abs(p.cx - B / 2) < 1e-9] : null))).toEqual([[1, true, true]]);
    expect(plan.parts.filter((p) => p.t === 'gun' && Math.abs(p.cx - B / 2) > 1e-9)).toHaveLength(4);
    expect(plan.parts.some((p) => p.t === 'deck' || p.t === 'bridge')).toBe(false);
  });
  it('塔の艦橋の段: 上ほど幅も長さも小さく、どの段も足元の箱の内（前へのずれ ≤ 縮みの半分）', () => {
    expect(PAGODA_SHIFT).toBeLessThanOrEqual(PAGODA_SHRINK_LEN / 2);
    const p = one(capitalPlan('fuso', FUSO.L, FUSO.B).parts, 'pagoda');
    let prev = [Infinity, Infinity];
    for (let k = 0; k < p.tiers; k++) {
      const [x, y, w, h] = pagodaTier(p, k);
      expect(x).toBeGreaterThanOrEqual(p.cx - p.w / 2 - 1e-9);
      expect(x + w).toBeLessThanOrEqual(p.cx + p.w / 2 + 1e-9);
      expect(y).toBeGreaterThanOrEqual(p.cy - p.len / 2 - 1e-9);
      expect(y + h).toBeLessThanOrEqual(p.cy + p.len / 2 + 1e-9);
      expect(w < prev[0]! && h < prev[1]!, `${k}`).toBe(true);
      expect(Math.min(w, h)).toBeGreaterThanOrEqual(2);
      prev = [w, h];
    }
  });
  it('重巡 最上: 前部の連装の主砲塔 3（どれも艦橋の前・前向き）・艦橋より後ろに主砲なし、後部の平らな飛行甲板（長さ ≥ 0.3 L・幅 ≥ 0.7 B・レール ≥ 2）・その前のカタパルト 2・日本の艦橋・煙突 1・高角砲 4', () => {
    const { L, B } = MOGAMI;
    const plan = capitalPlan('mogami', L, B);
    const g = mains(plan.parts, B);
    const bridge = one(plan.parts, 'bridge');
    const deck = one(plan.parts, 'deck');
    one(plan.parts, 'funnel');
    expect(g.map((p) => [p.style, p.dir, p.cy < bridge.cy])).toEqual(Array(3).fill(['twin', 1, true]));
    expect(bridge.style).toBe('ijn');
    expect(deck.cy - deck.len / 2).toBeGreaterThan(0.55 * L);
    expect(deck.len).toBeGreaterThanOrEqual(0.3 * L);
    expect(deck.w).toBeGreaterThanOrEqual(0.7 * B);
    expect(deck.rails).toBeGreaterThanOrEqual(2);
    const cats = plan.parts.filter((p) => p.t === 'tubes');
    expect(cats.map((p) => (p.t === 'tubes' ? [p.n, Math.sign(p.cx - B / 2), p.cy < deck.cy - deck.len / 2] : null))).toEqual([[1, 1, true], [1, -1, true]]);
    expect(plan.parts.filter((p) => p.t === 'gun' && Math.abs(p.cx - B / 2) > 1e-9)).toHaveLength(4);
    expect(plan.parts.some((p) => p.t === 'pagoda' || p.t === 'casemate')).toBe(false);
  });
  it('大きさでも見分く: 戦艦は陽炎型の 1.8 倍の長さ・3 倍の幅、重巡は 1.65 倍の長さ・1.8 倍の幅（記録の寸法）', () => {
    const dd = dims('ijn_destroyer');
    expect(FUSO.L / dd.L).toBeGreaterThan(1.8);
    expect(FUSO.B / dd.B).toBeGreaterThan(3);
    expect(MOGAMI.L / dd.L).toBeGreaterThan(1.65);
    expect(MOGAMI.B / dd.B).toBeGreaterThan(1.8);
  });
  it('今の艦の置き方（駆逐艦 4 形）には新しい部品の型も砲身の任意の欄も無い（今の絵の描く呼び出しは同じ＝tex-ab）', () => {
    for (const k of ['kagero', 'fletcher', 'mutsuki', 'subchaser'] as const) {
      for (const p of destroyerPlan(k, 236, 21.6).parts) {
        expect(['pagoda', 'casemate', 'deck'], k).not.toContain(p.t);
        if (p.t === 'gun') expect([p.dx, p.bw], k).toEqual([undefined, undefined]);
      }
    }
    expect(['fuso', 'mogami'].map(isCapitalKind)).toEqual([true, true]);
    expect(['kagero', 'transport', 'subchaser'].map(isCapitalKind)).toEqual([false, false, false]);
    expect(Object.keys(CAPITAL_DETAILS).sort()).toEqual(['fuso', 'mogami']);
  });
});

/** 描いた物を数える偽の場面（paintCanvas の口: textures.exists・createCanvas・get。ctx は何でも受ける） */
function fakeScene(made: { key: string; w: number; h: number; scale: number[] }[]): unknown {
  const grad = { addColorStop: () => undefined };
  const ctxOf = (rec: { scale: number[] }): unknown => new Proxy({}, {
    get: (_t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => grad : k === 'scale' ? (x: number, y: number) => void rec.scale.push(x, y) : () => undefined),
    set: () => true,
  });
  const custom: Record<string, Record<string, unknown>> = {};
  return {
    textures: {
      exists: (key: string) => made.some((m) => m.key === key),
      createCanvas: (key: string, w: number, h: number) => { const rec = { key, w, h, scale: [] as number[] }; made.push(rec); return { context: ctxOf(rec), add: () => undefined, refresh: () => undefined }; },
      get: (key: string) => ({ customData: (custom[key] ??= {}) }),
    },
  };
}
type GenCol = (scene: unknown, data: typeof gameData, spriteScale: number) => void;
const { generateColumnTextures } = (await import(/* @vite-ignore */ ['..', 'src', 'assets', 'destroyer-art'].join('/'))) as { generateColumnTextures: GenCol };

describe('寸法（L30: 絵＝記録 × sprite_scale＝当たり）と Boot', () => {
  it('generateColumnTextures は戦艦・重巡の 2 枚だけを 1 回ずつ（山城と扶桑は 1 枚・列の駆逐艦は作らない）。画素は hullTexSize(記録 × sprite_scale) × 密度 2', () => {
    const made: { key: string; w: number; h: number; scale: number[] }[] = [];
    generateColumnTextures(fakeScene(made), gameData, SS);
    expect(made.map((m) => m.key)).toEqual(['tex-cruiser-mogami', 'tex-battleship-fuso']);
    for (const [m, d] of [[made[0]!, MOGAMI], [made[1]!, FUSO]] as const) {
      const S = artTexDensity(m.key);
      const k = m.scale[0]! / S; // node の RENDER_SCALE（window なし）
      expect(S).toBe(2);
      expect(ART_TEX_DENSITY[m.key]).toBe(2);
      const t = hullTexSize(d.L, d.B, k);
      expect([m.w, m.h]).toEqual([t.w * S, t.h * S]);
      expect(m.scale).toEqual([k * S, k * S]);
    }
    expect([FUSO.L, FUSO.B, MOGAMI.L, MOGAMI.B]).toEqual([425.5, 66.2, 401.2, 40.4]);
  });
  it.each([['fuso', 'ijn_battleship_fuso'], ['mogami', 'ijn_cruiser_mogami']] as const)('%s: 描く船体の輪郭は [0, B] × [0, L] いっぱい・0.19〜0.86 は幅いっぱい（R22）。当たりの寸法（kits の寸法 × ship_hit_scale）と同じ', (kind, id) => {
    const { L, B } = dims(id);
    const plan = capitalPlan(kind, L, B);
    const xs = plan.outline.map((p) => p.x);
    const ys = plan.outline.map((p) => p.y);
    expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]).toEqual([0, B, 0, L]);
    for (const f of [0.19, 0.5, 0.86]) expect(hullHalfWidthAt(SHIP_ART_LAYOUTS[kind].hull, f, B)).toBeCloseTo(B / 2, 9);
    expect(shipArtKind(shipArtKey(id))).toBe(kind);
    const kit = setupOf('us_05').transit!.column!.find((c) => c.enemyId === id)!;
    expect([kit.spec.lengthM * kit.spec.hitScale, kit.spec.beamM * kit.spec.hitScale]).toEqual([L, B]);
    expect(kit.artKey).toBe(shipArtKey(id));
  });
  it('Boot は駆潜艇の絵の直後に 1 行（遊べる任務の id から作る今の 3 行は同じ）。setup には絵の鍵を足さない', () => {
    const boot = readFileSync('src/scenes/boot-scene.ts', 'utf8');
    const i = boot.indexOf('    generatePicketTextures(this, gameData, spriteScale);');
    const j = boot.indexOf('    generateColumnTextures(this, gameData, spriteScale);');
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);
    expect(boot.split('generateColumnTextures(').length).toBe(2);
    expect(readFileSync('src/systems/destroyer-setup.ts', 'utf8')).not.toMatch(/textureKey|artKey|shipArt/);
  });
});

describe('source の pin（§7・§8・L30）', () => {
  const lines = (f: string): number => readFileSync(f, 'utf8').split('\n').length - 1;
  it('capital-art-config は何も import しない・乱数なし（ART_SEED を足さない）。行数: capital-plan ≤ 160・capital-art-config ≤ 120・destroyer-paint ≤ 160・ほか ≤ 300', () => {
    const cfg = readFileSync('src/config/capital-art-config.ts', 'utf8');
    expect(cfg).not.toMatch(/^import /m);
    expect(cfg).not.toMatch(/export const \w*SEED/);
    for (const f of ['src/assets/capital-plan.ts', 'src/assets/capital-paint.ts', 'src/config/capital-art-config.ts']) expect(readFileSync(f, 'utf8'), f).not.toMatch(/Math\.random|SeededRng/);
    expect(lines('src/assets/capital-plan.ts')).toBeLessThanOrEqual(160);
    expect(lines('src/config/capital-art-config.ts')).toBeLessThanOrEqual(120);
    expect(lines('src/assets/destroyer-paint.ts')).toBeLessThanOrEqual(160);
    for (const f of ['src/assets/capital-paint.ts', 'src/assets/destroyer-art.ts', 'src/assets/destroyer-plan.ts', 'src/assets/destroyer-part-paint.ts', 'src/config/ship-art-config.ts', 'src/systems/magazine-fx.ts', 'src/systems/explosion-fx.ts', 'src/systems/blast-fx.ts', 'src/systems/world-art.ts']) {
      expect(lines(f), f).toBeLessThanOrEqual(300);
    }
  });
});
