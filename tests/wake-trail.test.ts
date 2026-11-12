// v0.7.0 IP1a（ユーザーの U5「航跡が直線すぎるので少し揺らぎを出してください」・U3「数でも大丈夫」）: 航跡の尾（assets/wake-shape・config/wake-art-config・systems/wake-fx）の規則。
// - 泡を置く: 艇尾が間隔だけ進んだら（2 乗で比べる）・遠すぎれば置かずに点を直す。自艇は速力帯（停止 なし・静音 薄い小さな泡・巡航・全速＝R1・D9）、ほかは速さ。見えない船体は置かない。
// - 泡の曲線: α は寿命で 0・満ちるまでは短い、幅は後ろほど広い（V の形）、横の揺れは有界で規則的でない。重なった帯の α は雷跡の点 0.55 より薄い（R7）。
// - 泡の絵: 横の断面は両側が白く中央が薄い（広がると V の腕）・縦は両端で 0（継ぎ目なし）・同じ種なら同じ。
// - 数（U3 の予算）: 輪の大きさの和（jp_03 の 18 隻の最悪）＋海の物が見える物の門（+150）の内。source の pin（確保は constructor だけ・update は書くだけ・世界の絵を作る時に 1 つの乱数）。
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { puffAlpha, puffFoamAlpha, puffWidth, stackedAlpha, swayAt, trailEmit, trailStep, wakePuffPixels, type TrailEmit } from '../src/assets/wake-shape';
import { WAKE_HIDE_BELOW_MPS, WAKE_HULL_ALPHA_MIN, WAKE_KIND_ART } from '../src/config/fx-art-config';
import { SEA_LIGHT_ART } from '../src/config/sea-art-config';
import {
  ART_SEED_WAKE, WAKE_JUMP_SPACINGS, WAKE_PUFF_ALPHA_MAX, WAKE_PUFF_CRUISE_SHARE, WAKE_PUFF_FADE_IN, WAKE_PUFF_SILENT_ALPHA, WAKE_PUFF_SPEED_FLOOR, WAKE_PUFF_TEX_H, WAKE_PUFF_TEX_W,
  WAKE_SWAY_STEP, WAKE_TRAIL_ART, WAKE_V_LEN_SHARE,
} from '../src/config/wake-art-config';
import { ART_SEED_FX } from '../src/config/fx-art-config';

const read = (f: string): string => readFileSync(f, 'utf8');
const em = (): TrailEmit => ({ on: false, a0: 0, lifeShare: 1, widthShare: 1, bubble: false });
const B = WAKE_KIND_ART.boat;

describe('泡を置く（trailEmit・trailStep）', () => {
  it('自艇は速力帯: 停止＝置かない・静音＝薄い小さな泡（α ≤ 0.12・寿命と幅は割合）・巡航＝上限 × 割合・全速＝上限。帯は速さの値に依らない', () => {
    expect(trailEmit('stop', B, 5, true, 1, em()).on).toBe(false);
    const s = trailEmit('silent', B, 12, true, 1, em());
    expect(s.on && s.bubble).toBe(true);
    expect(s.a0).toBe(WAKE_PUFF_SILENT_ALPHA);
    expect(WAKE_PUFF_SILENT_ALPHA).toBeLessThanOrEqual(0.12);
    expect(s.lifeShare).toBeLessThan(1);
    expect(s.widthShare).toBeLessThan(1);
    const c = trailEmit('cruise', B, 0.1, true, 1, em());
    expect(c.on && !c.bubble).toBe(true);
    expect(c.a0).toBeCloseTo(WAKE_PUFF_ALPHA_MAX * WAKE_PUFF_CRUISE_SHARE, 12);
    expect(trailEmit('full', B, 20, true, 1, em()).a0).toBe(WAKE_PUFF_ALPHA_MAX);
  });
  it('ほかの船体は速さ: 隠す速さ未満は置かない、α は 上限 × (下限 ＋ (1 − 下限) × 速さ/基準)（基準で上限）× 船体の α', () => {
    expect(trailEmit(null, B, WAKE_HIDE_BELOW_MPS - 0.01, true, 1, em()).on).toBe(false);
    const slow = trailEmit(null, B, B.refMps / 2, true, 1, em()).a0;
    expect(slow).toBeCloseTo(WAKE_PUFF_ALPHA_MAX * (WAKE_PUFF_SPEED_FLOOR + (1 - WAKE_PUFF_SPEED_FLOOR) * 0.5), 12);
    expect(trailEmit(null, B, B.refMps * 3, true, 1, em()).a0).toBeCloseTo(WAKE_PUFF_ALPHA_MAX, 12);
    expect(trailEmit(null, B, B.refMps, true, 0.6, em()).a0).toBeCloseTo(WAKE_PUFF_ALPHA_MAX * 0.6, 12);
  });
  it('見えない・薄い船体（夜の sighted・陰に隠れた隊・沈む途中）は置かない（敵の位置をばらさない）', () => {
    for (const band of ['silent', 'cruise', 'full', null] as const) {
      expect(trailEmit(band, B, 20, false, 1, em()).on).toBe(false);
      expect(trailEmit(band, B, 20, true, WAKE_HULL_ALPHA_MIN - 0.01, em()).on).toBe(false);
    }
  });
  it('間隔: まだ（0）・置く（1。ちょうど間隔から）・遠すぎる（2。間隔 × WAKE_JUMP_SPACINGS より遠い＝尾をつながない）', () => {
    expect(trailStep(5, 5, 12)).toBe(0);
    expect(trailStep(12, 0, 12)).toBe(1);
    expect(trailStep(0, -12 * WAKE_JUMP_SPACINGS, 12)).toBe(1);
    expect(trailStep(0, -12 * WAKE_JUMP_SPACINGS - 0.01, 12)).toBe(2);
  });
});

describe('泡の曲線と揺れ', () => {
  it('α: 0 から短く満ちて（寿命の WAKE_PUFF_FADE_IN）、単調に薄れ、寿命で 0', () => {
    const life = 3;
    expect(puffAlpha(0, life, 0.2)).toBe(0);
    expect(WAKE_PUFF_FADE_IN).toBeLessThanOrEqual(0.05); // 艇尾から離れて見えない
    let prev = puffAlpha(life * WAKE_PUFF_FADE_IN, life, 0.2);
    expect(prev).toBeGreaterThan(0.18);
    for (let t = life * WAKE_PUFF_FADE_IN; t < life; t += 0.05) {
      const a = puffAlpha(t, life, 0.2);
      expect(a).toBeLessThanOrEqual(prev + 1e-12);
      prev = a;
    }
    expect(puffAlpha(life, life, 0.2)).toBe(0);
  });
  it('幅: 生まれた時 w0 → 寿命で w1（後ろほど広い＝V の形）。どの種類も w1 > w0', () => {
    expect(puffWidth(0, 2, 5, 20)).toBe(5);
    expect(puffWidth(2, 2, 5, 20)).toBeCloseTo(20, 12);
    expect(puffWidth(0.5, 2, 5, 20)).toBeGreaterThan(5 + 15 * 0.25); // easeOut＝艇尾の近くで速く広がる
    for (const t of Object.values(WAKE_TRAIL_ART)) expect(t.w1Beams).toBeGreaterThan(t.w0Beams);
  });
  it('揺れ: 振幅は有界（≤ 1.35 倍）で、位相の進みが乱数の帯なので同じ形を繰り返さない。どの種類も揺れは船幅の半分未満（小さな揺らぎ）', () => {
    let lo = 0;
    let hi = 0;
    for (let p = 0; p < 50; p += 0.01) {
      lo = Math.min(lo, swayAt(p));
      hi = Math.max(hi, swayAt(p));
    }
    expect(hi).toBeLessThanOrEqual(1.35 + 1e-9);
    expect(lo).toBeGreaterThanOrEqual(-1.35 - 1e-9);
    expect(hi - lo).toBeGreaterThan(2);
    expect(WAKE_SWAY_STEP[1]).toBeGreaterThan(WAKE_SWAY_STEP[0]);
    for (const t of Object.values(WAKE_TRAIL_ART)) expect(t.swayBeams * 1.35).toBeLessThan(0.5);
  });
  it('重なった帯の α（泡の α の上限 × 種類の倍率 が lenShare 枚重なる）は雷跡の点 0.55 より薄い（R7）。泡は切れ目なく重なる（lenShare > 1）', () => {
    for (const [k, t] of Object.entries(WAKE_TRAIL_ART)) {
      expect(t.lenShare, k).toBeGreaterThan(1);
      expect(stackedAlpha(WAKE_PUFF_ALPHA_MAX * t.alphaMul, t.lenShare), k).toBeLessThan(0.55);
    }
    expect(stackedAlpha(0.5, 1)).toBeCloseTo(0.5, 12);
    expect(stackedAlpha(0.5, 2)).toBeCloseTo(0.75, 12);
  });
});

describe('泡の絵（tex-wake-puff。wakePuffPixels）', () => {
  it('横の断面は両側が白く中央が薄い（広がると両側が分かれて V の腕）、外と縦の両端は 0', () => {
    expect(puffFoamAlpha(0, 0)).toBeLessThan(puffFoamAlpha(0.62, 0));
    expect(puffFoamAlpha(0.62, 0)).toBeCloseTo(1, 9);
    expect(puffFoamAlpha(1, 0)).toBe(0);
    expect(puffFoamAlpha(0.3, 1)).toBe(0);
    expect(puffFoamAlpha(0.3, -1)).toBe(0);
  });
  it('大きさ 48 × 64 の frame 2 枚（縦に）・白・同じ種なら同じ・縁の画素はほぼ透明（継ぎ目が出ない）', () => {
    const px = wakePuffPixels(WAKE_PUFF_TEX_W, WAKE_PUFF_TEX_H, ART_SEED_WAKE);
    expect(px.length).toBe(WAKE_PUFF_TEX_W * WAKE_PUFF_TEX_H * 2 * 4);
    const h = (a: Uint8ClampedArray): string => createHash('md5').update(a).digest('hex');
    expect(h(wakePuffPixels(WAKE_PUFF_TEX_W, WAKE_PUFF_TEX_H, ART_SEED_WAKE))).toBe(h(px));
    for (let i = 0; i < px.length; i += 4) expect(px[i]).toBe(255);
    for (let x = 0; x < WAKE_PUFF_TEX_W; x++) {
      expect(px[x * 4 + 3]!).toBeLessThanOrEqual(8); // p0 の上の縁
      expect(px[((WAKE_PUFF_TEX_H - 1) * WAKE_PUFF_TEX_W + x) * 4 + 3]!).toBeLessThanOrEqual(8); // p0 の下の縁
    }
    let p1 = 0;
    for (let i = WAKE_PUFF_TEX_W * WAKE_PUFF_TEX_H; i < WAKE_PUFF_TEX_W * WAKE_PUFF_TEX_H * 2; i++) if (px[i * 4 + 3]! > 0) p1++;
    expect(p1).toBeGreaterThan(0); // 静音の泡がある
    expect(ART_SEED_WAKE).not.toBe(ART_SEED_FX);
  });
});

describe('数（U3 の予算: 見える物 ≤ 基準 +150）と作法の pin', () => {
  it('jp_03 の 18 隻の輪の和（自艇＝座席の隊長艇 ＋ 隊長艇 5 ＋ 僚艇 12）＋ V 18 ＋ 白波 ＋ 海の面 1 は +150 の内（台本の p95 は全部が満ちない）', () => {
    const T = WAKE_TRAIL_ART;
    const puffs = T.player.cap + 5 * T.evacLeader.cap + 12 * T.evacFollower.cap;
    expect(puffs + 18 + SEA_LIGHT_ART.day.glints + 1).toBeLessThanOrEqual(150);
    for (const t of Object.values(T)) expect(t.cap).toBeGreaterThan(0);
    expect(WAKE_V_LEN_SHARE).toBeLessThan(1); // V は艇尾の近くだけ
  });
  it('wake-fx: 泡の Image は constructor で輪の和だけ作り、update は書くだけ。乱数は ART_SEED_WAKE の 1 つ。world-art は realDt を渡す', () => {
    const s = read('src/systems/wake-fx.ts').replace(/\/\/[^\n]*/g, '');
    const body = s.slice(s.indexOf('  update('), s.indexOf('  destroy('));
    expect(body).not.toMatch(/\bnew\s|scene\.add\.|\.push\(/);
    expect(s).toContain("for (let j = 0; j < total; j++) this.puffs.push(scene.add.image(0, 0, TEXTURE_KEYS.wakePuff, WAKE_PUFF_FRAME_FOAM).setDepth(WAKE_DEPTH).setVisible(false));");
    expect(s.split('new SeededRng(').length - 1).toBe(1);
    expect(s).toContain('private readonly rng = new SeededRng(ART_SEED_WAKE);');
    expect(s).not.toMatch(/Math\.(sqrt|hypot)/);
    expect(read('src/systems/world-art.ts')).toContain('this.wake.update(realDt, w);');
    expect(read('src/config/game-config.ts')).toContain("wakePuff: 'tex-wake-puff',");
  });
  it('触ったファイルは 300 行以下', () => {
    for (const f of ['src/assets/wake-shape.ts', 'src/config/wake-art-config.ts', 'src/systems/wake-fx.ts', 'src/assets/sea-shape.ts', 'src/systems/sea-fx.ts', 'src/config/sea-art-config.ts', 'src/assets/sea-art.ts']) {
      expect(read(f).split('\n').length - 1, f).toBeLessThanOrEqual(300);
    }
  });
});
