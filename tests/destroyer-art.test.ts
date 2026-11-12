// v0.7.0 IP2（実機 2 回目。ユーザーの U8「駆逐艦のグラフィックを見直してクオリティを上げてください。でも、色は現在と同じ単系統のままで表現してください。」）:
// 駆逐艦 3 種の描き直し（assets/destroyer-plan・destroyer-paint・destroyer-part-paint・destroyer-pen。Phaser に依らない）。
// - 置き方: 部品は船体の縁から 1 単位以上内・艦首と艦尾から 1 単位以上内・大きさ ≥ 2 単位（R17）、中心線の部品（砲は砲身まで）は長さの向きに重ならない、形で見分ける（連装 3・単装 5・単装 4）。
// - 色: 記録する ctx で描いた全部の色（塗り・線・グラデーションの止め）が陣営のパレットの地の色と同じ色相（±2°）＝単系統、純白は使わない、toneRgb は色相を変えない。
// - 描く範囲: 点・矩形はテクスチャの矩形の内（陰のずれの分だけの余白）。source の pin: 鍵・寸法（hullTexSize）・paintCanvas・Math.random なし・300 行。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PALETTE_ALLY, PALETTE_ENEMY } from '../src/config/boat-art-config';
import { DESTROYER_BARREL_UNITS, DESTROYER_TONES, DESTROYER_TWIN_DX } from '../src/config/destroyer-art-config';
import { gameData, getEnemyRecord } from '../src/config/game-data';
import { validateAllyDestroyerMissions } from '../src/config/ally-destroyer-mission-data';
import { destroyerPartBounds, destroyerPartBoxes, destroyerPlan, planHalfAt, type DestroyerKind } from '../src/assets/destroyer-plan';
import { paintDestroyer, toneRgb, type PaintCtx } from '../src/assets/destroyer-paint';

const SS = gameData.hitRateModel.world.sprite_scale as number;
const TS = gameData.hitRateModel.world.time_scale as number;
const dims = (id: string): { L: number; B: number } => { const r = getEnemyRecord(gameData, id); return { L: r.length_m * SS, B: r.beam_m * SS }; };
const ally = validateAllyDestroyerMissions(gameData, TS, getEnemyRecord(gameData, 'ijn_destroyer').searchlight!.cone_deg)!;
const SHIPS: { kind: DestroyerKind; L: number; B: number; base: number }[] = [
  { kind: 'kagero', ...dims('ijn_destroyer'), base: PALETTE_ENEMY.deck },
  { kind: 'fletcher', ...dims('us_destroyer'), base: PALETTE_ENEMY.deck },
  { kind: 'mutsuki', L: ally.lengthM * SS, B: ally.beamM * SS, base: PALETTE_ALLY.deck },
];

function hsv(r: number, g: number, b: number): { h: number; s: number } {
  const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const d = mx - mn;
  let h = 0;
  if (d > 0) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: mx === 0 ? 0 : d / mx };
}
const hueOf = (c: number): number => hsv((c >> 16) & 255, (c >> 8) & 255, c & 255).h;
const hueDiff = (a: number, b: number): number => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

/** 色と座標を記録する ctx（Canvas の 2D の使う所だけ） */
function recorder(): { ctx: PaintCtx; colors: string[]; xs: number[]; ys: number[] } {
  const colors: string[] = []; const xs: number[] = []; const ys: number[] = [];
  const pt = (x: number, y: number): void => { xs.push(x); ys.push(y); };
  const grad = { addColorStop: (_t: number, c: string) => colors.push(c) };
  const o = {
    set fillStyle(v: unknown) { if (typeof v === 'string') colors.push(v); },
    set strokeStyle(v: unknown) { if (typeof v === 'string') colors.push(v); },
    lineWidth: 1,
    beginPath() {}, closePath() {}, fill() {}, stroke() {}, clip() {}, save() {}, restore() {},
    moveTo: pt, lineTo: pt,
    quadraticCurveTo(cx: number, cy: number, x: number, y: number) { pt(cx, cy); pt(x, y); },
    ellipse(x: number, y: number, rx: number, ry: number) { pt(x - rx, y - ry); pt(x + rx, y + ry); },
    fillRect(x: number, y: number, w: number, h: number) { pt(x, y); pt(x + w, y + h); },
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
  };
  return { ctx: o as unknown as PaintCtx, colors, xs, ys };
}
function rgbaOf(c: string): [number, number, number, number] {
  const m = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(c);
  if (!m) throw new Error(`色の形: ${c}`);
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
}

describe('駆逐艦の描き直し（v0.7.0 IP2・U8）', () => {
  it.each(SHIPS)('$kind: 部品は船体の内（縁・艦首・艦尾から 1 単位）・大きさ ≥ 2 単位・中心線の部品は重ならない', ({ kind, L, B }) => {
    const plan = destroyerPlan(kind, L, B);
    expect(plan.parts.length).toBeGreaterThan(15);
    for (const p of plan.parts) {
      for (const b of destroyerPartBoxes(p, DESTROYER_TWIN_DX + DESTROYER_BARREL_UNITS / 2)) {
        expect(b.y0, `${kind} ${p.t} 艦首`).toBeGreaterThanOrEqual(1);
        expect(b.y1, `${kind} ${p.t} 艦尾`).toBeLessThanOrEqual(L - 1);
        for (const y of [b.y0, (b.y0 + b.y1) / 2, b.y1]) {
          const off = Math.max(Math.abs(b.x0 - B / 2), Math.abs(b.x1 - B / 2));
          expect(off, `${kind} ${p.t} y ${y.toFixed(1)}`).toBeLessThanOrEqual(planHalfAt(plan, y / L) - 1 + 1e-9);
        }
      }
      expect(Math.min(p.w, p.len), `${kind} ${p.t}`).toBeGreaterThanOrEqual(2 - 1e-9);
    }
    const spans = plan.parts.filter((p) => Math.abs(p.cx - B / 2) < 1e-9 && p.t !== 'mast').map(destroyerPartBounds).sort((a, b) => a.y0 - b.y0);
    for (let i = 1; i < spans.length; i++) expect(spans[i]!.y0, `${kind} 中心線の部品 ${i}`).toBeGreaterThanOrEqual(spans[i - 1]!.y1 - 1e-9);
  });
  it('形で見分ける: 陽炎型は連装 3・四連装 2、フレッチャー級は単装の密閉 5・五連装 2、睦月型は盾つきの単装 4・三連装 2。どれも煙突 2・短艇 2・マスト ≥ 1', () => {
    const count = (k: DestroyerKind, t: string): number => destroyerPlan(k, 100, 10).parts.filter((p) => p.t === t).length;
    const guns = (k: DestroyerKind): string[] => destroyerPlan(k, 100, 10).parts.flatMap((p) => (p.t === 'gun' ? [p.style] : []));
    expect(guns('kagero')).toEqual(['twin', 'twin', 'twin']);
    expect(guns('fletcher')).toEqual(Array(5).fill('single5'));
    expect(guns('mutsuki')).toEqual(Array(4).fill('single12'));
    const tubes = (k: DestroyerKind): number[] => destroyerPlan(k, 100, 10).parts.flatMap((p) => (p.t === 'tubes' ? [p.n] : []));
    expect(tubes('kagero')).toEqual([4, 4]);
    expect(tubes('fletcher')).toEqual([5, 5]);
    expect(tubes('mutsuki')).toEqual([3, 3]);
    for (const k of ['kagero', 'fletcher', 'mutsuki'] as const) {
      expect(count(k, 'funnel')).toBe(2);
      expect(count(k, 'boat')).toBe(2);
      expect(count(k, 'mast')).toBeGreaterThanOrEqual(1);
      expect(count(k, 'bridge')).toBe(1);
    }
  });
  it.each(SHIPS)('$kind: 描いた全部の色は地の色と同じ色相（単系統）・純白なし、点はテクスチャの内（陰のずれの余白 3 単位）', ({ kind, L, B, base }) => {
    const r = recorder();
    paintDestroyer(r.ctx, destroyerPlan(kind, L, B), base);
    expect(r.colors.length).toBeGreaterThan(100);
    const h0 = hueOf(base);
    for (const c of new Set(r.colors)) {
      const [R, G, Bl] = rgbaOf(c);
      const { h, s } = hsv(R, G, Bl);
      if (s > 0.06) expect(hueDiff(h, h0), `${kind} ${c}`).toBeLessThanOrEqual(2);
      expect(R === 255 && G === 255 && Bl === 255, `${kind} ${c}`).toBe(false);
    }
    for (const x of r.xs) { expect(x).toBeGreaterThanOrEqual(-3); expect(x).toBeLessThanOrEqual(B + 3); }
    for (const y of r.ys) { expect(y).toBeGreaterThanOrEqual(-1e-9); expect(y).toBeLessThanOrEqual(L + 3); }
  });
  it('toneRgb は色相を変えない（暗くは RGB に掛け、明るくは白へ混ぜる）。明るさの表は 2 未満（白にならない）。白に近い 1.6 を超える明るさは彩度が小さく、色相の丸めの揺れは色の検査で除く', () => {
    for (const base of [PALETTE_ENEMY.deck, PALETTE_ALLY.deck]) {
      for (const v of [0.2, 0.36, 0.5, 0.8, 1, 1.2, 1.4, 1.6]) {
        const [R, G, B] = toneRgb(base, v);
        expect(hueDiff(hsv(R, G, B).h, hueOf(base)), `${base.toString(16)} ${v}`).toBeLessThanOrEqual(2);
      }
    }
    for (const v of Object.values(DESTROYER_TONES)) expect(v).toBeLessThan(2);
  });
  it('source の pin: 鍵・寸法（hullTexSize）・paintCanvas で 1 回、Math.random なし、300 行以下', () => {
    const art = readFileSync('src/assets/destroyer-art.ts', 'utf8');
    expect(art).toContain('const size = hullTexSize(spec.lengthUnits, spec.beamUnits, k);');
    expect(art).toContain('paintCanvas(scene, key, size.w * S, size.h * S, (ctx) => {'); // IP2b: 画素は論理の寸法の S 倍（S＝artTexDensity。tests/art-inventory）
    expect(art).toContain("paintDestroyerTexture(scene, TEXTURE_KEYS.destroyerFriendly, spec, 'mutsuki', PALETTE_ALLY.deck);");
    for (const f of ['destroyer-art', 'destroyer-plan', 'destroyer-paint', 'destroyer-part-paint', 'destroyer-pen']) {
      const s = readFileSync(`src/assets/${f}.ts`, 'utf8');
      expect(s, f).not.toMatch(/Math\.random/);
      if (f !== 'destroyer-art') expect(s, f).not.toContain("from 'phaser'"); // 形と描き方は Phaser に依らない
      expect(s.split('\n').length - 1, f).toBeLessThanOrEqual(300);
    }
    expect(readFileSync('src/config/destroyer-art-config.ts', 'utf8')).not.toMatch(/^import /m);
  });
});
