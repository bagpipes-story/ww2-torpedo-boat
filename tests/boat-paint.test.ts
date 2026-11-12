// v0.7.0 IP3（実機 3 回目の U10「自機（魚雷艇）と大発も視覚的なクオリティを上げてください」）: 艇と大発の Canvas の 2D の描き方（Phaser に依らない assets/boat-paint・barge-paint）を
// 記録するだけの偽の ctx で描き、色は地の色 1 つの明るさだけ（自艇の灰は彩度 ≤ 0.12＝tint が効く・敵は赤の系統・味方は青の系統）・描く物は船体の矩形の内・細部の表は layout と揃う、を確かめる。
// 画素の明るさ・覆い・tint の比の門は scripts/headless/tex-ab（CHECK=1）。
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOAT_ART_KIND_BY_ID, BOAT_ART_LAYOUTS, PALETTE_ALLY, PALETTE_ENEMY, PALETTE_PLAYER, type BoatArtKind } from '../src/config/boat-art-config';
import { BOAT_PAINT_DETAILS } from '../src/config/boat-paint-config';
import { paintSmallBoat } from '../src/assets/boat-paint';
import { paintBarge } from '../src/assets/barge-paint';
import type { C, PaintGradient } from '../src/assets/destroyer-pen';
import { gameData, getBargeParams, getBoatRecord, getPrototypeMission } from '../src/config/game-data';

const SS = gameData.hitRateModel.world.sprite_scale as number;

/** 偽の ctx: 使った色（塗り・線・移りの止め）と、座標（変換なし＝世界単位）の範囲を記録する */
function fakeCtx(): { ctx: C; colors: string[]; xs: number[]; ys: number[] } {
  const colors: string[] = [];
  const xs: number[] = [];
  const ys: number[] = [];
  const pt = (x: number, y: number): void => { xs.push(x); ys.push(y); };
  const grad = (): PaintGradient => ({ addColorStop: (_o: number, c: string) => { colors.push(c); } });
  const ctx: C = {
    set fillStyle(v: unknown) { if (typeof v === 'string') colors.push(v); },
    get fillStyle() { return ''; },
    set strokeStyle(v: unknown) { if (typeof v === 'string') colors.push(v); },
    get strokeStyle() { return ''; },
    lineWidth: 1,
    beginPath() {}, closePath() {}, fill() {}, stroke() {}, clip() {}, save() {}, restore() {},
    moveTo: pt, lineTo: pt,
    quadraticCurveTo(cx: number, cy: number, x: number, y: number) { pt(x, y); },
    ellipse(x: number, y: number, rx: number, ry: number) { pt(x - rx, y - ry); pt(x + rx, y + ry); },
    fillRect(x: number, y: number, w: number, h: number) { pt(x, y); pt(x + w, y + h); },
    createLinearGradient: grad,
    createRadialGradient: grad,
  };
  return { ctx, colors, xs, ys };
}
const hsv = (css: string): { h: number; s: number } => {
  const [r, g, b] = /rgba\((\d+),(\d+),(\d+)/.exec(css)!.slice(1, 4).map(Number) as [number, number, number];
  const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const d = mx - mn;
  let h = 0;
  if (d > 0) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: mx === 0 ? 0 : d / mx };
};
const BOATS = Object.entries(BOAT_ART_KIND_BY_ID).map(([id, kind]) => {
  const b = getBoatRecord(gameData, id);
  return { id, kind, L: b.length_m * SS, B: b.beam_m * SS };
});

describe('艇の描き方（v0.7.0 IP3。assets/boat-paint）', () => {
  it.each(BOATS)('$id: 色は自艇の灰の明るさだけ（彩度 ≤ 0.12）・描く物は船体の矩形の内（砲身の先・板の筋は甲板の輪郭で切る）', ({ kind, L, B }) => {
    const f = fakeCtx();
    paintSmallBoat(f.ctx, BOAT_ART_LAYOUTS[kind as BoatArtKind], BOAT_PAINT_DETAILS[kind as BoatArtKind], L, B, PALETTE_PLAYER.rim);
    expect(f.colors.length).toBeGreaterThan(40);
    for (const c of f.colors) expect(hsv(c).s, c).toBeLessThanOrEqual(0.12);
    expect(Math.min(...f.xs)).toBeGreaterThanOrEqual(-0.5);
    expect(Math.max(...f.xs)).toBeLessThanOrEqual(B + 0.5);
    expect(Math.min(...f.ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...f.ys)).toBeLessThanOrEqual(L + 0.5);
  });
  it('米PT（敵の色）: どの色も赤の系統（色相 330〜20°）', () => {
    const f = fakeCtx();
    paintSmallBoat(f.ctx, BOAT_ART_LAYOUTS.elco80, BOAT_PAINT_DETAILS.elco80, 48.8, 12.6, PALETTE_ENEMY.deck);
    for (const c of f.colors) { const { h, s } = hsv(c); if (s > 0.02) expect(h >= 330 || h <= 20, c).toBe(true); }
  });
  it('細部の表は layout と揃う: 銃座の描き方は guns と同じ数、米の艇は発射管・日本の艇は架台の魚雷、H-38 は魚雷なし', () => {
    for (const kind of Object.keys(BOAT_PAINT_DETAILS) as BoatArtKind[]) expect(BOAT_PAINT_DETAILS[kind].guns.length, kind).toBe(BOAT_ART_LAYOUTS[kind].guns.length);
    expect([BOAT_PAINT_DETAILS.elco80.torpedo, BOAT_PAINT_DETAILS.elco77.torpedo, BOAT_PAINT_DETAILS.t38.torpedo]).toEqual(['tube', 'tube', 'rack']);
    expect(BOAT_ART_LAYOUTS.h38.tubes).toHaveLength(0);
    expect(BOAT_PAINT_DETAILS.elco80.guns).toContain('bofors');
    expect(BOAT_PAINT_DETAILS.elco77.guns).not.toContain('bofors');
  });
});

describe('大発の描き方（v0.7.0 IP3。assets/barge-paint）', () => {
  const barge = getBargeParams(gameData, getPrototypeMission(gameData, 'us_03'))!;
  const L = barge.boundsMarginM * 2;
  const B = 3.4 * SS;
  it.each([['敵', PALETTE_ENEMY.deck, (h: number) => h >= 330 || h <= 20], ['味方', PALETTE_ALLY.deck, (h: number) => h >= 190 && h <= 220]] as const)('%s: 色は陣営の系統だけ・描く物は船体の矩形の内', (_n, base, hueOk) => {
    const f = fakeCtx();
    paintBarge(f.ctx, L, B, base);
    expect(f.colors.length).toBeGreaterThan(40);
    for (const c of f.colors) { const { h, s } = hsv(c); if (s > 0.02) expect(hueOk(h), c).toBe(true); }
    expect(Math.min(...f.xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...f.xs)).toBeLessThanOrEqual(B + 1e-9);
    expect(Math.min(...f.ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...f.ys)).toBeLessThanOrEqual(L + 1e-9);
  });
  it('作法: 描き方の 4 ファイルは phaser を import せず 300 行以下・絵の乱数は使わない', () => {
    for (const f of ['src/assets/boat-paint.ts', 'src/assets/boat-gun-paint.ts', 'src/assets/barge-paint.ts', 'src/config/boat-paint-config.ts']) {
      const s = readFileSync(f, 'utf8');
      expect(s, f).not.toMatch(/from 'phaser'/);
      expect(s, f).not.toMatch(/Math\.random|rng/);
      expect(s.split('\n').length, f).toBeLessThanOrEqual(300);
    }
    expect(readFileSync('src/config/boat-paint-config.ts', 'utf8')).not.toMatch(/^import /m);
  });
});

describe('密度の通り道（v0.7.0 IP2b・IP3。tests/art-inventory から移した）', () => {
  it('IP2b・IP3 の密度の通り道: 描く 3 か所が S 倍の画素、密度のある鍵の Image を作る所はみな game-config の artImageScale（1 / RENDER_SCALE / 密度）', () => {
    for (const line of ['paintCanvas(scene, key, size.w * S, size.h * S, (ctx) => {', 'ctx.scale(k * S, k * S);']) expect(readFileSync('src/assets/destroyer-art.ts', 'utf8')).toContain(line);
    const ship = readFileSync('src/assets/ship-art.ts', 'utf8');
    expect(ship).toContain('paintTexture(scene, key, { w: size.w * S, h: size.h * S }, RENDER_SCALE * S, (pen) =>');
    for (const line of ['export function paintHullCanvas(', 'paintCanvas(scene, key, size.w * S, size.h * S, (ctx) => {', 'ctx.scale(k * S, k * S);']) expect(ship).toContain(line);
    expect(readFileSync('src/config/game-config.ts', 'utf8')).toContain('return 1 / RENDER_SCALE / artTexDensity(key);');
    const sites: Record<string, string> = {
      'entities/destroyer.ts': 'scene.add.image(start.x, start.y, textureKey).setScale(artImageScale(textureKey))',
      'entities/ally-destroyer.ts': 'TEXTURE_KEYS.destroyerFriendly).setScale(artImageScale(TEXTURE_KEYS.destroyerFriendly))',
      'entities/ally-ship.ts': 'TEXTURE_KEYS.transportFriendly).setScale(artImageScale(TEXTURE_KEYS.transportFriendly))',
      'entities/player-boat.ts': 'scene.add.image(start.x, start.y, textureKey).setScale(artImageScale(textureKey))',
      'systems/escort-boat.ts': 'scene.add.image(b.x, b.y, textureKey).setTint(ESCORT_TINT).setScale(artImageScale(textureKey))',
      'systems/gunboat.ts': 'scene.add.image(b.x, b.y, boatTextureKey(p.boatId)).setTint(ESCORT_TINT).setScale(artImageScale(boatTextureKey(p.boatId)))',
      'systems/evac-boats-view.ts': 'scene.add.image(0, 0, textureKey).setScale(this.scale)',
      'systems/barge-hunt.ts': 'scene.add.image(b.x, b.y, TEXTURE_KEYS.barge).setScale(artImageScale(TEXTURE_KEYS.barge))',
      'systems/pt-squadron.ts': 'scene.add.image(b.x, b.y, TEXTURE_KEYS.ptBoat).setScale(artImageScale(TEXTURE_KEYS.ptBoat))',
      'systems/convoy.ts': 'scene.add.image(b.x, b.y, TEXTURE_KEYS.bargeFriendly).setScale(artImageScale(TEXTURE_KEYS.bargeFriendly))',
    };
    for (const [f, line] of Object.entries(sites)) expect(readFileSync(join('src', f), 'utf8'), f).toContain(line);
    const evac = readFileSync('src/systems/evac-boats-view.ts', 'utf8');
    expect(evac).toContain('this.scale = artImageScale(textureKey);');
    expect(evac).toContain('img.setScale((1 - (1 - SINK_SCALE_TO) * k) / RENDER_SCALE / this.density)'); // 沈む途中も (x / k) / 密度
    expect(evac).not.toContain('setScale(1 / RENDER_SCALE)');
    const users: string[] = [];
    for (const dir of ['entities', 'systems', 'ui', 'scenes']) {
      for (const f of readdirSync(join('src', dir))) {
        const src = readFileSync(join('src', dir, f), 'utf8');
        if (/TEXTURE_KEYS\.(?:destroyer|destroyerUs|destroyerFriendly|transport|transportFriendly)\b(?!Pool)/.test(src) || /'tex-(?:destroyer|transport)/.test(src)) users.push(`${dir}/${f}`);
      }
    }
    expect(users.sort()).toEqual(['entities/ally-destroyer.ts', 'entities/ally-ship.ts', 'entities/destroyer.ts', 'systems/destroyer-group.ts']); // destroyer-group は鍵を Destroyer へ渡すだけ
    // IP3: 艇・米PT・大発の鍵の Image を作る所は上の表だけ（textureKey を受け取る 3 つ＝自艇・僚艇・jp_03 の 18 隻と、鍵を直に書く 4 つ）
    const boatUsers: string[] = [];
    for (const dir of ['entities', 'systems', 'ui', 'scenes']) {
      for (const f of readdirSync(join('src', dir))) {
        const src = readFileSync(join('src', dir, f), 'utf8');
        if (/add\.(?:image|sprite)\([^;]*(?:TEXTURE_KEYS\.(?:barge|bargeFriendly|ptBoat)\b|boatTextureKey\()/.test(src)) boatUsers.push(`${dir}/${f}`);
      }
    }
    expect(boatUsers.sort()).toEqual(['systems/barge-hunt.ts', 'systems/convoy.ts', 'systems/gunboat.ts', 'systems/pt-squadron.ts']);
  });
});
