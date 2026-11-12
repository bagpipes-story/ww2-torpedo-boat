// v0.7.0 IP2（実機 2 回目の直し。ユーザーの U6「砲撃、爆撃で命中した際の爆発エフェクトの大きさ自体はいいのですが、少し眩しく感じるため、フラッシュのような白色や輝度は落ち着かせてください」・
// U7「魚雷の爆発はもっと轟沈感を出すために派手に水柱を立たせてください」）: 爆発の明るさの定数と、魚雷の命中の水柱（assets/column-shape・systems/torpedo-column-fx）の式と作法。
// - U6: 閃光は白でなく琥珀・頂の α ≤ 0.6、火球 α ≤ 0.85、2 つ目の閃光は ADD をやめた、水柱・柱・衝撃波は白でなく α を下げた、砲口炎の絵の芯 < 1、昼の海は ADD を下げる（world-art が段を渡す）。大きさと長さは IP1b のまま。
// - U7: 柱は IP1b の柱（55 m）の 3 倍以上の高さ・0.6 秒で上がり保って崩れる・頂ほど早く薄れる、輪と霧と水滴の時刻、1 本の柱の見える物と確保の数（予算）。
// - 経路: mission-scene の onTorpedoHit だけが 'torpedo' を渡す（見た目だけの引数。論理と呼ぶ順は同じ）。確保は constructor だけ・乱数は絵だけの種・300 行。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { columnBlobInto, columnHeightM, columnRingInto, columnSkirtInto, columnVisibleParts, rainHeightM } from '../src/assets/column-shape';
import { BLAST_COLUMN_ALPHA, BLAST_COLUMN_RISE_M, BLAST_FLASH2_ALPHA, BLAST_SHOCK_ALPHA, ART_SEED_SPARK, ART_SEED_BLAST, ART_SEED_SINK, ART_SEED_BATTERY } from '../src/config/blast-art-config';
import {
  ART_SEED_COLUMN, COLUMN_BLOBS, COLUMN_FALL_END_S, COLUMN_FOAM_RING_AT_S, COLUMN_FOAM_RING_S, COLUMN_HEIGHT_M, COLUMN_HOLD_END_S, COLUMN_MIST_AT_S, COLUMN_MIST_R_M, COLUMN_MIST_S, COLUMN_PARTS,
  COLUMN_RAIN_GRAVITY, COLUMN_RAIN_PER, COLUMN_RAIN_POOL, COLUMN_RISE_S, COLUMN_SKIRT_S, COLUMN_SLOTS, COLUMN_SPRAY_RING_S,
} from '../src/config/column-art-config';
import {
  EXPLOSION_DAY_ADD_DIM, EXPLOSION_FIRE_ALPHA, EXPLOSION_FIRE_RADIUS_M, EXPLOSION_FLASH_ALPHA, EXPLOSION_FLASH_RADIUS_M, EXPLOSION_FLASH_S, EXPLOSION_FLASH_TINT, EXPLOSION_SPLASH_ALPHA, EXPLOSION_SPLASH_TINT,
  FIRE_SMOKE_MAX_ALPHA, MUZZLE_CORE_ALPHA, MUZZLE_RAY_ALPHA, ART_SEED_FX,
} from '../src/config/fx-art-config';
import { FIRE_GROW } from '../src/assets/fx-shape';

const read = (f: string): string => readFileSync(f, 'utf8');
const code = (f: string): string => read(f).replace(/\/\/[^\n]*/g, '');

describe('U6: 砲撃・爆撃の命中の爆発を眩しくしない（大きさと長さはそのまま）', () => {
  it('閃光は琥珀（青が赤の半分以下＝白でない）・頂の α ≤ 0.6、火球 α ≤ 0.85、水柱は白でなく α ≤ 0.75、大きさと長さは IP1b のまま', () => {
    const r = (EXPLOSION_FLASH_TINT >> 16) & 255; const b = EXPLOSION_FLASH_TINT & 255;
    expect(b).toBeLessThanOrEqual(r / 2);
    expect(EXPLOSION_FLASH_ALPHA).toBeLessThanOrEqual(0.6);
    expect(EXPLOSION_FIRE_ALPHA).toBeLessThanOrEqual(0.85);
    expect(FIRE_GROW.alpha0).toBe(EXPLOSION_FIRE_ALPHA);
    expect(EXPLOSION_SPLASH_TINT).not.toBe(0xffffff);
    expect(EXPLOSION_SPLASH_ALPHA).toBeLessThanOrEqual(0.75);
    expect(BLAST_FLASH2_ALPHA).toBeLessThanOrEqual(0.6);
    expect(BLAST_COLUMN_ALPHA).toBeLessThanOrEqual(0.75);
    expect(BLAST_SHOCK_ALPHA).toBeLessThanOrEqual(0.55);
    expect([EXPLOSION_FLASH_RADIUS_M, EXPLOSION_FLASH_S, EXPLOSION_FIRE_RADIUS_M]).toEqual([100, 0.2, 64]);
    expect(Math.max(...MUZZLE_CORE_ALPHA)).toBeLessThan(1);
    expect(MUZZLE_RAY_ALPHA).toBeLessThan(0.95);
    expect(EXPLOSION_DAY_ADD_DIM).toBeGreaterThan(0);
    expect(EXPLOSION_DAY_ADD_DIM).toBeLessThan(1);
  });
  it('2 つ目の閃光は ADD をやめた（blast-fx の ADD は 2 つ目の火球だけ）。昼の海の割合は world-art が夜明けの段から毎フレーム渡す', () => {
    const bf = code('src/systems/blast-fx.ts');
    expect(bf.split('setBlendMode(BLEND_ADD)').length - 1).toBe(1);
    expect(bf).toContain('if (add) fi.setBlendMode(BLEND_ADD);');
    const wa = code('src/systems/world-art.ts');
    expect(wa).toContain('this.explosions.setDaylight(w.dawn.lightStep / SEA_LIGHT_STEPS);');
    expect(wa.indexOf('setDaylight(')).toBeLessThan(wa.indexOf('this.explosions.update(realDt);'));
    const ef = code('src/systems/explosion-fx.ts');
    expect(ef).toContain('setAlpha(EXPLOSION_FLASH_ALPHA * this.addMul * (1 - a / fs))');
  });
});

describe('U7: 魚雷の命中の水柱', () => {
  it('高さ: 0 から 0.6 秒で COLUMN_HEIGHT_M（IP1b の柱 55 m の 3 倍以上）へ、保つ間は少し伸び、崩れで縮む。単調に上がってから下がる', () => {
    expect(COLUMN_HEIGHT_M).toBeGreaterThanOrEqual(3 * BLAST_COLUMN_RISE_M);
    expect(columnHeightM(0)).toBe(0);
    expect(columnHeightM(COLUMN_RISE_S)).toBeCloseTo(COLUMN_HEIGHT_M, 6);
    expect(columnHeightM(COLUMN_RISE_S * 0.5)).toBeGreaterThan(COLUMN_HEIGHT_M * 0.8); // 速く上がる
    expect(columnHeightM(COLUMN_HOLD_END_S)).toBeGreaterThan(COLUMN_HEIGHT_M);
    expect(columnHeightM(COLUMN_FALL_END_S)).toBeLessThan(COLUMN_HEIGHT_M * 0.2);
    let prev = -1;
    for (let a = 0; a <= COLUMN_HOLD_END_S; a += 0.05) { const h = columnHeightM(a); expect(h).toBeGreaterThanOrEqual(prev - 1e-9); prev = h; }
    prev = Infinity;
    for (let a = COLUMN_HOLD_END_S; a <= COLUMN_FALL_END_S; a += 0.05) { const h = columnHeightM(a); expect(h).toBeLessThanOrEqual(prev + 1e-9); prev = h; }
  });
  it('柱の塊: 頂は根元より高く太い、崩れでは頂から薄れる、寿命の外は α 0', () => {
    const o = new Float32Array(5); const top = new Float32Array(5);
    columnBlobInto(o, 1.0, 0); columnBlobInto(top, 1.0, COLUMN_BLOBS - 1);
    expect(top[0]!).toBeGreaterThan(o[0]! + COLUMN_HEIGHT_M * 0.6);
    expect(top[1]!).toBeGreaterThan(o[1]!);
    expect(o[3]!).toBeGreaterThan(0.8);
    columnBlobInto(o, 2.6, 0); columnBlobInto(top, 2.6, COLUMN_BLOBS - 1);
    expect(top[3]!).toBeLessThan(o[3]!);
    for (const a of [0, COLUMN_FALL_END_S, 5]) { columnBlobInto(o, a, 2); expect(o[3]).toBe(0); }
    columnSkirtInto(o, 0.5); expect(o[2]!).toBeGreaterThan(0.5);
    columnSkirtInto(o, COLUMN_SKIRT_S); expect(o[2]).toBe(0);
  });
  it('輪（飛沫は始めに速く・泡は崩れから遅く広がる）・霧（煙幕より小さく薄い）・水滴（重さで水面へ）', () => {
    const o = new Float32Array(2);
    expect(columnRingInto(o, 0.3, 0, COLUMN_SPRAY_RING_S, 25, 120, 0.6)[1]).toBeGreaterThan(0);
    expect(columnRingInto(o, 1.0, COLUMN_FOAM_RING_AT_S, COLUMN_FOAM_RING_S, 50, 190, 0.45)[1]).toBe(0);
    expect(columnRingInto(o, 3.0, COLUMN_FOAM_RING_AT_S, COLUMN_FOAM_RING_S, 50, 190, 0.45)[1]).toBeGreaterThan(0);
    expect(columnRingInto(o, COLUMN_FOAM_RING_AT_S + COLUMN_FOAM_RING_S, COLUMN_FOAM_RING_AT_S, COLUMN_FOAM_RING_S, 50, 190, 0.45)[1]).toBe(0);
    expect(COLUMN_MIST_R_M[1]).toBeLessThanOrEqual(30); // 煙幕 60 m の半分以下（R10 の考え）
    expect(FIRE_SMOKE_MAX_ALPHA).toBeGreaterThanOrEqual(0.3);
    expect(rainHeightM(150, Math.sqrt((2 * 150) / COLUMN_RAIN_GRAVITY), COLUMN_RAIN_GRAVITY)).toBeCloseTo(0, 6);
  });
  it('予算: 確保は 枠 3 × 13 ＋ 水滴 28 ＝ 67。1 本の柱の見える物は ≤ 13 ＋ 水滴 14（U3 の +150 の門の山は CHANGELOG に記録）', () => {
    expect(COLUMN_SLOTS * COLUMN_PARTS + COLUMN_RAIN_POOL).toBe(67);
    let mx = 0;
    for (let a = 0; a < COLUMN_MIST_AT_S + COLUMN_MIST_S; a += 0.05) mx = Math.max(mx, columnVisibleParts(a, COLUMN_MIST_AT_S, COLUMN_MIST_S, COLUMN_FOAM_RING_AT_S, COLUMN_FOAM_RING_S, COLUMN_SPRAY_RING_S));
    expect(mx).toBeLessThanOrEqual(COLUMN_PARTS);
    expect(COLUMN_RAIN_PER).toBeLessThanOrEqual(COLUMN_RAIN_POOL / 2);
  });
  it('経路: mission-scene の onTorpedoHit だけが playExplosion に \'torpedo\' を渡す。explosion-fx は不発でない魚雷の命中だけ水柱を立て、白い水柱の柱と爆発の水滴は出さない', () => {
    const ms = read('src/scenes/mission-scene.ts');
    expect(ms.split("dud, 'torpedo')").length - 1).toBe(1);
    expect(ms).toContain("onTorpedoHit: (x, y, dud) => {\n      playExplosion(this, x, y, dud, 'torpedo');");
    const ef = code('src/systems/explosion-fx.ts');
    expect(ef).toContain('if (torpedo && !dud) this.column.play(x, y);');
    expect(ef).toContain('this.blast.play(i, x, y, dud, torpedo);');
    const bf = code('src/systems/blast-fx.ts');
    expect(bf).toContain('if (!torpedo) this.sparks.drops(x, y, SPARK_DROPS_BIG);');
    expect(bf).toContain('if (k === KIND_BIG && a < BLAST_COLUMN_S) {');
  });
  it('IP4: jp_04 の輸送船が魚雷で沈む時も大きな水柱（世界の onSunk に見た目の印 \'torpedo\' だけ。命中スロー・揺れ・呼ぶ順は今のまま）。ほかの撃破は blast のまま', () => {
    const wl = read('src/systems/world-landing.ts');
    expect(wl).toContain("    this.ship.sink();\n    this.onSunk(x, y, 'torpedo');");
    expect(wl.split("'torpedo')").length - 1).toBe(1);
    const mw = read('src/systems/mission-world.ts');
    expect(mw).toContain("const onSunk = (x: number, y: number, look: ExplosionLook = 'blast'): void => { if (!s.evac) this.slowMoLeftS = s.slowMoSeconds; this.events.onTargetDestroyed(x, y, look); };");
    const ms = read('src/scenes/mission-scene.ts');
    expect(ms).toContain('onTargetDestroyed: (x, y, look) => {\n      playExplosion(this, x, y, false, look);\n      this.shakeCamera();');
    for (const f of ['convoy', 'barge-hunt', 'pt-squadron', 'gunboat', 'world-arms']) expect(read(`src/systems/${f}.ts`)).not.toContain("'torpedo')");
  });
  it('作法: 確保は constructor だけ（play・update に new・add なし）・乱数は絵だけの新しい種・300 行以下', () => {
    const s = code('src/systems/torpedo-column-fx.ts');
    const ctor = s.slice(s.indexOf('  constructor('), s.indexOf('  play('));
    const rest = s.slice(s.indexOf('  play('), s.indexOf('  destroy('));
    expect(ctor.split('scene.add.image(').length - 1).toBe(6);
    expect(rest).not.toMatch(/\bnew\s|tweens\.add|scene\.add\.|\.map\(|\.filter\(/);
    expect(s).toContain('new SeededRng(ART_SEED_COLUMN)');
    expect(new Set([ART_SEED_COLUMN, ART_SEED_SPARK, ART_SEED_BLAST, ART_SEED_SINK, ART_SEED_BATTERY, ART_SEED_FX]).size).toBe(6);
    for (const f of ['src/systems/torpedo-column-fx.ts', 'src/assets/column-shape.ts', 'src/config/column-art-config.ts', 'src/systems/explosion-fx.ts', 'src/systems/blast-fx.ts', 'src/scenes/mission-scene.ts']) {
      expect(read(f).split('\n').length - 1, f).toBeLessThanOrEqual(300);
    }
    expect(read('src/config/column-art-config.ts')).not.toMatch(/^import /m);
  });
});
