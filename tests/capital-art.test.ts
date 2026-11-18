// v0.8.2 S2b（us_05「スリガオ海峡・最初の接触」。spec-v0820 §4.11 D-A1・D-A2、lead の L30・L33）: 戦艦 扶桑型（tex-battleship-fuso）と重巡 最上（tex-cruiser-mogami）の絵。
// 置き方の決まり（部品は船体の内・≥ 2 単位・中心線の部品は重ならない）と単系統の色は tests/destroyer-art（同じ描き方の 6 形）。ここは:
// - 見分けの鍵（L30）: 戦艦は高い段の塔の艦橋（段は足元の箱の内で上ほど小さい）と連装の主砲塔 6（前 2・中 2・後 2）・舷側の砲郭・艦尾のカタパルト、
//   重巡は前部の主砲塔 3（艦橋より前・後ろに主砲なし）と後部の平らな飛行甲板とレール・カタパルト 2。駆逐艦（陽炎型）と大きさでも見分く。
// - 寸法（art-dims の作法）: Boot の generateColumnTextures が作るのは戦艦・重巡の 2 枚だけ（列の駆逐艦は作らない・1 枚ずつ）で、画素は hullTexSize(記録 × sprite_scale) × 密度 2、
//   描く船体は記録 × sprite_scale（425.5 × 66.2・401.2 × 40.4 単位）で R22 の幅いっぱい＝当たり（kits の寸法 × ship_hit_scale）と同じ大きさ。
// - 今の艦の置き方には新しい部品の型も砲身の任意の欄も無い（今の絵の画素は同じ＝tex-ab）。source の pin: Boot の 1 行・何も import しない config・行数・乱数なし。
// v0.8.2 S2c（ユーザーの実機の感想 2026-11-18「デフォルメされすぎている…もう少しディティールに」「最上は後部甲板に水上機」）: 山城の 1944 年の並び（3 番砲塔は後ろ向きで塔と煙突の間）・
//   段の表の塔・背負い式（砲身が下の砲塔の屋根を越える＝S2b の「中心線の部品は重ならない」を戦艦・重巡だけ外した代わりの決まり）・艦尾のカタパルトと水上機 2、最上の 3 番だけ背負い式・
//   艦尾へ細る飛行甲板の内に水上機 5・斜めのカタパルト 2・三連装の発射管、2 つの config と S2c の描き方のファイルの pin。寸法と Boot の件は S2b のまま（鍵・大きさは変えない）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { capitalPlan, isCapitalKind, pagodaTier } from '../src/assets/capital-plan';
import { hullTexSize } from '../src/assets/art-dims';
import { hullHalfWidthAt } from '../src/assets/boat-shape';
import { destroyerPlan, type DestroyerPart } from '../src/assets/destroyer-plan';
import { CAPITAL_DETAILS, CAPITAL_TOWER_ROWS } from '../src/config/capital-layout-config';
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

describe('見分けの鍵（L30・D-A1・D-A2）と 1944 年の並び（v0.8.2 S2c）', () => {
  // S2c（ユーザーの実機の感想 2026-11-18「連装六基で山城、扶桑。航空巡洋艦で最上と軍オタはわかるのですが、デフォルメされすぎているというか、もう少しディティールにこだわれないでしょうか？
  // 最上は後部甲板に水上機乗せててもいいと思います」）: 並びは資料（scratchpad の facts-S2c）に合わせて山城を描く（扶桑と 1 枚を共有）。S2b の pin（中の 2 基が煙突と後檣の間・前向きと後ろ向き、
  // 5 段の塔、最上の日本の艦橋の形）は山城の 3 番砲塔が後ろ向きで塔と煙突の間にある並びと、段の表の塔に直した
  it('山城: 連装の主砲塔 6＝1・2（塔の前・前向き。2 は背負い式）・3（塔と煙突の間・後ろ向き）・4（煙突と後部の上部構造の間・後ろ向き）・5・6（後部の上部構造の後ろ・後ろ向き。5 は背負い式）', () => {
    const { L, B } = FUSO;
    const plan = capitalPlan('fuso', L, B);
    const g = mains(plan.parts, B).sort((a, b) => a.cy - b.cy);
    const towers = plan.parts.filter((p): p is Extract<DestroyerPart, { t: 'pagoda' }> => p.t === 'pagoda');
    expect(towers.map((p) => p.style)).toEqual(['fusoAft', 'fuso']);
    const [aft, tower] = [towers[0]!, towers[1]!];
    const stack = one(plan.parts, 'stack');
    expect(g.map((p) => [p.style, p.dir, p.lift])).toEqual([['twin', 1, 0], ['twin', 1, 1], ['twin', -1, 1], ['twin', -1, 1], ['twin', -1, 1], ['twin', -1, 0]]);
    expect(g.every((p) => p.w >= 0.4 * B - 1e-9 && p.barrel >= 0.05 * L && p.dx! > 0 && p.bw! > 0 && p.ears! > 0)).toBe(true);
    const front = (p: { cy: number; len: number }): number => p.cy - p.len / 2;
    const back = (p: { cy: number; len: number }): number => p.cy + p.len / 2;
    expect(back(g[1]!)).toBeLessThan(front(tower));
    expect(front(g[2]!) > back(tower) && back(g[2]!) < front(stack)).toBe(true);
    expect(front(g[3]!) > back(stack) && back(g[3]!) < front(aft)).toBe(true);
    expect(front(g[4]!)).toBeGreaterThan(back(aft) - 1e-9);
    expect(stack.trunk).toBe(false);
    expect(plan.parts.filter((p) => p.t === 'mast').map((p) => p.cy > front(aft) && p.cy < back(aft))).toEqual([true]);
    expect(plan.parts.filter((p) => p.t === 'casemate').map((p) => (p.t === 'casemate' ? [p.side, p.n] : null))).toEqual([[1, 7], [-1, 7]]);
    expect(plan.parts.filter((p) => p.t === 'gun' && Math.abs(p.cx - B / 2) > 1e-9)).toHaveLength(4); // 連装の高角砲 4
    expect([3, 1].map((n) => plan.parts.filter((p) => p.t === 'aa' && p.n === n).length)).toEqual([8, 8]);
    expect([plan.parts.filter((p) => p.t === 'boat').length, plan.parts.filter((p) => p.t === 'davit').length, plan.parts.filter((p) => p.t === 'crane').length]).toEqual([4, 8, 2]);
    // 艦尾のカタパルト 1 と水上機 2（1 機はカタパルトの上）
    const cat = one(plan.parts, 'catapult');
    expect(cat.cy).toBeGreaterThan(0.85 * L);
    const planes = plan.parts.filter((p): p is Extract<DestroyerPart, { t: 'plane' }> => p.t === 'plane');
    expect(planes.map((p) => p.bi)).toEqual([true, true]);
    expect(planes.some((p) => Math.abs(p.cx - cat.cx) < cat.w / 2 && Math.abs(p.cy - cat.cy) < cat.len / 2)).toBe(true);
    for (const p of planes) for (const t of g) expect(p.cy - p.len / 2 > back(t) || p.cy + p.len / 2 < front(t), '水上機は砲塔に重ならない').toBe(true);
    expect(plan.parts.some((p) => p.t === 'deck' || p.t === 'bridge' || p.t === 'funnel')).toBe(false);
  });
  it('塔の段（山城の塔・後部の上部構造・最上の塔）: どの段も部品の箱の内・最上段がいちばん小さい・山城の塔は 8 段以上で上の段ほど前（前へ傾いた塔）', () => {
    const towers = [...capitalPlan('fuso', FUSO.L, FUSO.B).parts, ...capitalPlan('mogami', MOGAMI.L, MOGAMI.B).parts].filter((p): p is Extract<DestroyerPart, { t: 'pagoda' }> => p.t === 'pagoda');
    expect(towers.map((p) => p.style).sort()).toEqual(['fuso', 'fusoAft', 'mogami']);
    for (const p of towers) {
      expect(p.tiers).toBe(CAPITAL_TOWER_ROWS[p.style].length);
      const areas: number[] = [];
      for (let k = 0; k < p.tiers; k++) {
        const [x, y, w, h] = pagodaTier(p, k);
        expect(x, `${p.style} ${k}`).toBeGreaterThanOrEqual(p.cx - p.w / 2 - 1e-9);
        expect(x + w, `${p.style} ${k}`).toBeLessThanOrEqual(p.cx + p.w / 2 + 1e-9);
        expect(y, `${p.style} ${k}`).toBeGreaterThanOrEqual(p.cy - p.len / 2 - 1e-9);
        expect(y + h, `${p.style} ${k}`).toBeLessThanOrEqual(p.cy + p.len / 2 + 1e-9);
        expect(Math.min(w, h), `${p.style} ${k}`).toBeGreaterThanOrEqual(2);
        areas.push(w * h);
      }
      expect(Math.min(...areas)).toBe(areas[areas.length - 1]);
    }
    const rows = CAPITAL_TOWER_ROWS.fuso;
    expect(rows.length).toBeGreaterThanOrEqual(8);
    expect(rows[rows.length - 1]![2]).toBeLessThan(rows[0]![2]);
  });
  it('最上: 前部の連装 3（艦橋の前・前向き。3 番だけ背負い式）・後ろに主砲なし、塔の艦橋・傾いた太い煙突・三連装の発射管 片舷 2・後部の飛行甲板（艦尾へ細る・レール ≥ 2）と前の両舷の斜めのカタパルト 2・甲板に水上機 5', () => {
    const { L, B } = MOGAMI;
    const plan = capitalPlan('mogami', L, B);
    const g = mains(plan.parts, B).sort((a, b) => a.cy - b.cy);
    const tower = one(plan.parts, 'pagoda');
    const deck = one(plan.parts, 'deck');
    expect(tower.style).toBe('mogami');
    expect(one(plan.parts, 'stack').trunk).toBe(true);
    expect(g.map((p) => [p.style, p.dir, p.lift, p.cy < tower.cy])).toEqual([['twin', 1, 0, true], ['twin', 1, 0, true], ['twin', 1, 1, true]]);
    expect(deck.cy - deck.len / 2).toBeGreaterThan(0.55 * L);
    expect(deck.len).toBeGreaterThanOrEqual(0.3 * L);
    expect(deck.w).toBeGreaterThanOrEqual(0.7 * B);
    expect(deck.wAft).toBeLessThan(deck.w);
    expect(deck.rails).toBeGreaterThanOrEqual(2);
    const cats = plan.parts.filter((p): p is Extract<DestroyerPart, { t: 'catapult' }> => p.t === 'catapult');
    expect(cats.map((p) => [Math.sign(p.cx - B / 2), Math.sign(p.ang), p.cy < deck.cy - deck.len / 2])).toEqual([[1, 1, true], [-1, -1, true]]); // 前の端が舷側へ
    expect(plan.parts.filter((p) => p.t === 'tubes').map((p) => (p.t === 'tubes' ? [Math.sign(p.cx - B / 2), p.n] : null))).toEqual([[1, 3], [-1, 3], [1, 3], [-1, 3]]);
    expect(plan.parts.filter((p) => p.t === 'gun' && Math.abs(p.cx - B / 2) > 1e-9)).toHaveLength(4);
    expect([3, 1].map((n) => plan.parts.filter((p) => p.t === 'aa' && p.n === n).length)).toEqual([10, 8]);
    // 水上機は飛行甲板の内（艦尾へ細る台形の、機の前と後ろの幅の内）で互いに重ならず、カタパルトの後ろ
    const planes = plan.parts.filter((p): p is Extract<DestroyerPart, { t: 'plane' }> => p.t === 'plane').sort((a, b) => a.cy - b.cy);
    expect(planes.map((p) => p.bi)).toEqual([false, false, false, true, true]);
    const [d0, d1] = [deck.cy - deck.len / 2, deck.cy + deck.len / 2];
    const halfAt = (y: number): number => (deck.w + ((deck.wAft - deck.w) * (y - d0)) / deck.len) / 2;
    for (const [i, p] of planes.entries()) {
      const [y0, y1] = [p.cy - p.len / 2, p.cy + p.len / 2];
      expect(y0 > d0 && y1 < d1, `${i}`).toBe(true);
      expect(p.w / 2, `${i}`).toBeLessThanOrEqual(Math.min(halfAt(y0), halfAt(y1)));
      expect(y0, `${i}`).toBeGreaterThan(Math.max(...cats.map((c) => c.cy + c.len / 2)));
      if (i > 0) expect(y0, `${i}`).toBeGreaterThan(planes[i - 1]!.cy + planes[i - 1]!.len / 2);
    }
    expect(plan.parts.some((p) => p.t === 'casemate' || p.t === 'bridge' || p.t === 'funnel')).toBe(false);
  });
  it.each([['fuso', FUSO], ['mogami', MOGAMI]] as const)('%s: 背負い式（S2c で S2b の「中心線の部品は重ならない」を外した）: 砲塔どうしは重ならず、砲身が別の砲塔に掛かるのは高い砲塔が後で描かれる時だけ。塔・煙突・マスト・クレーンは砲塔の後', (kind, { L, B }) => {
    const parts = capitalPlan(kind, L, B).parts;
    const g = mains(parts, B).sort((a, b) => a.cy - b.cy);
    const body = (p: Gun): [number, number] => [p.cy - p.len / 2, p.cy + p.len / 2];
    const barrel = (p: Gun): [number, number] => (p.dir === 1 ? [p.cy - p.len / 2 - p.barrel, p.cy - p.len / 2] : [p.cy + p.len / 2, p.cy + p.len / 2 + p.barrel]);
    const hit = (a: [number, number], b: [number, number]): boolean => a[0] < b[1] - 1e-9 && b[0] < a[1] - 1e-9;
    const over: number[][] = [];
    for (const a of g) {
      for (const b of g) {
        if (a === b) continue;
        expect(hit(body(a), body(b))).toBe(false);
        if (!hit(barrel(a), body(b))) continue;
        expect(a.lift!).toBeGreaterThan(b.lift!);
        expect(parts.indexOf(a)).toBeGreaterThan(parts.indexOf(b));
        over.push([g.indexOf(a), g.indexOf(b)]);
      }
    }
    expect(over).toEqual(kind === 'fuso' ? [[1, 0], [4, 5]] : [[2, 1]]); // 山城は 2 番が 1 番の上・5 番が 6 番の上、最上は 3 番が 2 番の上
    const last = Math.max(...g.map((p) => parts.indexOf(p)));
    for (const p of parts) if (p.t === 'pagoda' || p.t === 'stack' || p.t === 'mast' || p.t === 'crane') expect(parts.indexOf(p), p.t).toBeGreaterThan(last);
  });
  it('大きさでも見分く: 戦艦は陽炎型の 1.8 倍の長さ・3 倍の幅、重巡は 1.65 倍の長さ・1.8 倍の幅（記録の寸法）', () => {
    const dd = dims('ijn_destroyer');
    expect(FUSO.L / dd.L).toBeGreaterThan(1.8);
    expect(FUSO.B / dd.B).toBeGreaterThan(3);
    expect(MOGAMI.L / dd.L).toBeGreaterThan(1.65);
    expect(MOGAMI.B / dd.B).toBeGreaterThan(1.8);
  });
  it('今の艦の置き方（駆逐艦 4 形）には新しい部品の型も砲身の任意の欄も無い（今の絵の描く呼び出しは同じ＝tex-ab）', () => {
    const NEW = ['pagoda', 'casemate', 'deck', 'stack', 'aa', 'davit', 'catapult', 'plane', 'crane'];
    for (const k of ['kagero', 'fletcher', 'mutsuki', 'subchaser'] as const) {
      for (const p of destroyerPlan(k, 236, 21.6).parts) {
        expect(NEW, k).not.toContain(p.t);
        if (p.t === 'gun') expect([p.dx, p.bw, p.lift, p.ears], k).toEqual([undefined, undefined, undefined, undefined]);
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
  it('capital-art-config・capital-layout-config（S2c で分けた）は何も import しない・乱数なし（ART_SEED を足さない）。行数: capital-plan ≤ 160・2 つの config ≤ 120・destroyer-paint ≤ 160・S2c の描き方 ≤ 200・ほか ≤ 300', () => {
    for (const f of ['src/config/capital-art-config.ts', 'src/config/capital-layout-config.ts']) {
      const cfg = readFileSync(f, 'utf8');
      expect(cfg, f).not.toMatch(/^import /m);
      expect(cfg, f).not.toMatch(/export const \w*SEED/);
      expect(lines(f), f).toBeLessThanOrEqual(120);
    }
    const S2C = ['src/assets/capital-paint.ts', 'src/assets/capital-detail-paint.ts', 'src/assets/capital-deck-paint.ts', 'src/assets/capital-turret-paint.ts', 'src/assets/capital-plane-paint.ts'];
    for (const f of ['src/assets/capital-plan.ts', 'src/config/capital-art-config.ts', 'src/config/capital-layout-config.ts', ...S2C]) expect(readFileSync(f, 'utf8'), f).not.toMatch(/Math\.random|SeededRng/);
    for (const f of S2C) expect(lines(f), f).toBeLessThanOrEqual(200);
    expect(lines('src/assets/capital-plan.ts')).toBeLessThanOrEqual(160);
    expect(lines('src/assets/destroyer-paint.ts')).toBeLessThanOrEqual(160);
    for (const f of ['src/assets/capital-paint.ts', 'src/assets/destroyer-art.ts', 'src/assets/destroyer-plan.ts', 'src/assets/destroyer-part-paint.ts', 'src/config/ship-art-config.ts', 'src/systems/magazine-fx.ts', 'src/systems/explosion-fx.ts', 'src/systems/blast-fx.ts', 'src/systems/world-art.ts']) {
      expect(lines(f), f).toBeLessThanOrEqual(300);
    }
  });
});
