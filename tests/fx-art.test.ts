// v0.7.0 S3b（アートと音①：コードで描く絵。spec-v0700 §5.2・§5.3・§5.7・§7.7）: 航跡・水柱・砲口炎・爆発のプールの Phaser に依らない規則と、作法の pin。
// - 航跡（assets/fx-shape・config/fx-art-config）: 倍率と α の式（速さ ∝・上限・船体の α）、自艇の速力帯ごとの段（停止 なし・静音 泡だけ α ≤ 0.12・巡航 V・全速 長く明るい V＝R1）、
//   見えない船体で隠す、α の上限 ≤ 0.35（雷跡 0.55 より薄い＝R7）、中央の泡 ≤ 船体の 0.5 倍、腕の半角 19.5°・テクスチャに収まる、艇尾の位置。
// - 爆発: 枠 4 × 部品 4 ＝ 16（R12）、小さい版に水柱が無い（R11）、曲線（Cubic.easeOut・線形の薄れ）、暗い玉 ≤ 15 m（R10）、寿命。
// - 絵の置き方は同じ種なら同じ（描く順を固定）。
// - source の pin: Boot の 1 行・SplashPool と砲口炎 7 か所の鍵・mission-effects は登録の口だけ（new も tween も無い）・world-art が作って登録し破棄で外す・プールの使い回しが確保をしない・
//   私的な絵のプールは readonly で出す（行数は増やさない）・新しい鍵は D2 の 5 つ。描画の規則（update で確保しない・絵だけの乱数）は tests/art-rules が fx-art・wake-fx・explosion-fx に自動で効く。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EXPLOSION_RING_RADIUS_UNITS } from '../src/assets/art-dims';
import { FIRE_GROW, PUFF_GROW, SPLASH_GROW, easeOutCubic, flashLifeS, muzzleRays, partFade, partGrow, playerWakePose, slotLifeS, splashDroplets, sternOffsetInto, wakePose, type WakePose } from '../src/assets/fx-shape';
import {
  ART_SEED_FX, BLEND_ADD, EXPLOSION_FIRE_S, EXPLOSION_FLASH_S, EXPLOSION_PARTS, EXPLOSION_PUFF_RADIUS_M, EXPLOSION_PUFF_S, EXPLOSION_SLOTS, EXPLOSION_SMALL_FLASH_S, EXPLOSION_SPLASH_S,
  FIRE_SMOKE_MAX_RADIUS_M, MUZZLE_RAYS, SPLASH_DROPLETS, WAKE_ALPHA_MAX, WAKE_ARM_HALF_ANGLE_DEG, WAKE_ARM_WIDTH_PX, WAKE_CENTER_LENGTH_SHARE, WAKE_CRUISE_ALPHA_SHARE, WAKE_DEPTH,
  WAKE_EVAC_LEADERS_ONLY, WAKE_FRAME_BUBBLE, WAKE_FRAME_V, WAKE_HIDE_BELOW_MPS, WAKE_HULL_ALPHA_MIN, WAKE_KIND_ART, WAKE_SHIP_ARM_WIDTH_PX, WAKE_SILENT_ALPHA_MAX, WAKE_TEX_H, WAKE_TEX_W,
} from '../src/config/fx-art-config';

const read = (f: string): string => readFileSync(f, 'utf8');
const pose = (): WakePose => ({ visible: false, lengthM: 0, alpha: 0, frame: '' });
const B = WAKE_KIND_ART.boat;
const HULL = 49; // Elco 80 の表示上の長さ（24.4 m × 2）

describe('航跡の式（assets/fx-shape。R1・R7）', () => {
  it('速さのままの船体: 隠す速さ未満・見えない絵・α < 0.5 の絵では出さない。長さ ∝ 速さ（船体の倍の上限）、α ∝ 速さ/基準（上限 0.35）× 船体の α', () => {
    expect(wakePose(B, WAKE_HIDE_BELOW_MPS - 0.01, HULL, true, 1, pose()).visible).toBe(false);
    expect(wakePose(B, 10, HULL, false, 1, pose()).visible).toBe(false);
    expect(wakePose(B, 10, HULL, true, WAKE_HULL_ALPHA_MIN - 0.01, pose()).visible).toBe(false);
    const slow = wakePose(B, 5, HULL, true, 1, pose());
    const fast = wakePose(B, 20, HULL, true, 1, pose());
    const over = wakePose(B, 40, HULL, true, 1, pose());
    expect(slow.visible && fast.visible && over.visible).toBe(true);
    expect(slow.lengthM).toBeCloseTo(5 * B.lenPerHullPerMps * HULL);
    expect(fast.lengthM).toBeGreaterThan(slow.lengthM);
    expect(over.lengthM).toBe(B.lenHulls * HULL);
    expect(slow.alpha).toBeCloseTo(WAKE_ALPHA_MAX * 0.25);
    expect(fast.alpha).toBeCloseTo(WAKE_ALPHA_MAX);
    expect(over.alpha).toBeCloseTo(WAKE_ALPHA_MAX);
    expect(wakePose(B, 20, HULL, true, 0.6, pose()).alpha).toBeCloseTo(WAKE_ALPHA_MAX * 0.6);
    expect(fast.frame).toBe(WAKE_FRAME_V);
    for (const k of Object.values(WAKE_KIND_ART)) {
      expect(k.refMps).toBeGreaterThan(0);
      expect(k.lenHulls * HULL).toBeGreaterThan(0);
    }
    expect(WAKE_KIND_ART.ship.ship).toBe(true);
    expect(WAKE_KIND_ART.boat.ship).toBe(false);
  });
  it('自艇は速力帯で段を決める（R1・D9）: 停止＝なし、静音＝泡だけ（V なし・α ≤ 0.12）、巡航＝V、全速＝長く明るい V。見えない絵では出さない', () => {
    expect(playerWakePose('stop', B, 3, HULL, true, 1, pose()).visible).toBe(false);
    const silent = playerWakePose('silent', B, 4, HULL, true, 1, pose());
    expect(silent.visible).toBe(true);
    expect(silent.frame).toBe(WAKE_FRAME_BUBBLE);
    expect(silent.alpha).toBeLessThanOrEqual(WAKE_SILENT_ALPHA_MAX);
    expect(WAKE_SILENT_ALPHA_MAX).toBeLessThanOrEqual(0.12);
    expect(silent.lengthM).toBeLessThan(HULL);
    const cruise = playerWakePose('cruise', B, 10, HULL, true, 1, pose());
    const full = playerWakePose('full', B, 20, HULL, true, 1, pose());
    expect(cruise.frame).toBe(WAKE_FRAME_V);
    expect(full.frame).toBe(WAKE_FRAME_V);
    expect(cruise.alpha).toBeCloseTo(WAKE_ALPHA_MAX * WAKE_CRUISE_ALPHA_SHARE);
    expect(full.alpha).toBeCloseTo(WAKE_ALPHA_MAX);
    expect(full.lengthM).toBeGreaterThan(cruise.lengthM);
    // 帯は速さの値に依らない（ヒステリシス込みの w.band が決める）: 静音の帯で速くても泡だけ、巡航の帯で遅くても V
    expect(playerWakePose('silent', B, 12, HULL, true, 1, pose()).frame).toBe(WAKE_FRAME_BUBBLE);
    expect(playerWakePose('cruise', B, 0.1, HULL, true, 1, pose()).visible).toBe(true);
    expect(playerWakePose('full', B, 20, HULL, false, 1, pose()).visible).toBe(false);
    expect(playerWakePose('full', B, 20, HULL, true, 0.45, pose()).visible).toBe(false);
  });
  it('α の上限 0.35 は雷跡の点 0.55 より薄い（R7）、中央の泡は上限の長さで船体の 0.5 倍まで、腕の半角 19.5° はテクスチャの幅に収まる、細部は 2 px 以上（R17）、深さは暴風 3 と雷跡 4 の間', () => {
    expect(WAKE_ALPHA_MAX).toBeLessThanOrEqual(0.35);
    expect(WAKE_ALPHA_MAX).toBeLessThan(0.55);
    expect(WAKE_CENTER_LENGTH_SHARE).toBeLessThanOrEqual(0.5);
    for (const k of Object.values(WAKE_KIND_ART)) expect((WAKE_CENTER_LENGTH_SHARE / k.lenHulls) * k.lenHulls).toBeLessThanOrEqual(0.5);
    expect(WAKE_ARM_HALF_ANGLE_DEG).toBe(19.5);
    expect(WAKE_TEX_H * Math.tan((WAKE_ARM_HALF_ANGLE_DEG * Math.PI) / 180)).toBeLessThan(WAKE_TEX_W / 2);
    expect(Math.min(...WAKE_ARM_WIDTH_PX, ...WAKE_SHIP_ARM_WIDTH_PX)).toBeGreaterThanOrEqual(2);
    expect(WAKE_DEPTH).toBeGreaterThan(3);
    expect(WAKE_DEPTH).toBeLessThan(4);
    expect(WAKE_EVAC_LEADERS_ONLY).toBe(true);
  });
  it('艇尾の位置: 中心から艇首の逆へ半長（北 0＝上・時計回り）', () => {
    const o = new Float32Array(2);
    sternOffsetInto(o, 0, 10);
    expect(o[0]).toBeCloseTo(0);
    expect(o[1]).toBeCloseTo(10);
    sternOffsetInto(o, 90, 10);
    expect(o[0]).toBeCloseTo(-10);
    expect(o[1]).toBeCloseTo(0, 5);
    sternOffsetInto(o, 180, 10);
    expect(o[1]).toBeCloseTo(-10);
  });
});

describe('爆発のプール（R11・R12・D7）と絵の置き方', () => {
  it('枠 4 × 部品 4 ＝ 16、小さい版は水柱なし（暗い玉 ≤ 15 m）、閃光 0.15／0.1 秒、火球 0.5 秒、水柱 0.8 秒、枠の寿命は部品の最大', () => {
    expect(EXPLOSION_SLOTS * EXPLOSION_PARTS).toBe(16);
    expect(EXPLOSION_PUFF_RADIUS_M).toBeLessThanOrEqual(FIRE_SMOKE_MAX_RADIUS_M);
    expect(flashLifeS(false)).toBe(EXPLOSION_FLASH_S);
    expect(flashLifeS(true)).toBe(EXPLOSION_SMALL_FLASH_S);
    expect(EXPLOSION_SMALL_FLASH_S).toBeLessThan(EXPLOSION_FLASH_S);
    expect(FIRE_GROW.life).toBe(EXPLOSION_FIRE_S);
    expect(SPLASH_GROW.life).toBe(EXPLOSION_SPLASH_S);
    expect(PUFF_GROW.life).toBe(EXPLOSION_PUFF_S);
    expect(slotLifeS(false, 0.6)).toBe(Math.max(0.6, EXPLOSION_FLASH_S, EXPLOSION_FIRE_S, EXPLOSION_SPLASH_S));
    expect(slotLifeS(true, 0.6)).toBe(Math.max(0.6, EXPLOSION_SMALL_FLASH_S, EXPLOSION_PUFF_S));
    expect(slotLifeS(true, 0.6)).toBeLessThanOrEqual(slotLifeS(false, 0.6));
    expect(BLEND_ADD).toBe(1); // Phaser.BlendModes.ADD
  });
  it('曲線: Cubic.easeOut（0 → 1・単調・終わりで 1）、膨らみは from → 1、薄れは線形に 0（寿命で 0）', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875);
    let prev = -1;
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const e = easeOutCubic(t);
      expect(e).toBeGreaterThanOrEqual(prev);
      prev = e;
    }
    expect(partGrow(0, 1, 0.35)).toBeCloseTo(0.35);
    expect(partGrow(1, 1, 0.35)).toBeCloseTo(1);
    expect(partGrow(0.5, 1, 0.35)).toBeGreaterThan(0.35 + 0.65 * 0.5);
    expect(partFade(0, 0.8, 0.9)).toBeCloseTo(0.9);
    expect(partFade(0.4, 0.8, 0.9)).toBeCloseTo(0.45);
    expect(partFade(0.8, 0.8, 0.9)).toBe(0);
    expect(partFade(1, 0.8, 0.9)).toBe(0);
  });
  it('水柱の飛沫は同じ種なら同じ・帯の内・数のとおり。砲口炎の光芒は 8 本（長い十字と短い斜めが交互）', () => {
    const a = splashDroplets(ART_SEED_FX);
    expect(a).toEqual(splashDroplets(ART_SEED_FX));
    expect(a).not.toEqual(splashDroplets(ART_SEED_FX + 1));
    expect(a.length).toBe(SPLASH_DROPLETS);
    for (const d of a) {
      const r = Math.hypot(d.x, d.y);
      expect(r).toBeGreaterThanOrEqual(0.5 - 1e-9); // S4: 帯 0.55〜0.9 → 0.5〜0.8（tests/fx-art-s4）
      expect(r).toBeLessThanOrEqual(0.8 + 1e-9);
      expect(d.r).toBeGreaterThan(0);
      expect(r + d.r).toBeLessThanOrEqual(1.1);
    }
    const rays = muzzleRays();
    expect(rays.length).toBe(MUZZLE_RAYS);
    expect(rays[0]!.len).toBeGreaterThan(rays[1]!.len);
    expect(rays[2]!.len).toBe(rays[0]!.len);
    expect(EXPLOSION_RING_RADIUS_UNITS).toBe(40);
  });
});

describe('作法の pin（S3b）', () => {
  it('Boot は generateFxTextures を generateSeaTextures の直後に 1 回。fx-art は sea-art の paintCanvas（鍵が無い時だけ描く）で 5 枚、寸法は爆発の輪の式と固定の 96×128', () => {
    const boot = read('src/scenes/boot-scene.ts');
    expect(boot.split('generateFxTextures(this);').length - 1).toBe(1);
    expect(boot.indexOf('generateFxTextures(this);')).toBeGreaterThan(boot.indexOf('generateSeaTextures(this);'));
    const art = read('src/assets/fx-art.ts');
    expect(art).toContain("import { paintCanvas } from './sea-art';");
    expect(art).toContain('discTexSize(EXPLOSION_RING_RADIUS_UNITS, k, 8)');
    for (const k of ['TEXTURE_KEYS.splash', 'TEXTURE_KEYS.muzzleFlash', 'TEXTURE_KEYS.fireball', 'TEXTURE_KEYS.wakeBoat', 'TEXTURE_KEYS.wakeShip']) expect(art).toContain(k);
    expect(art).not.toMatch(/generateTexture|\.clear\(\)/);
    const keys = read('src/config/game-config.ts');
    for (const k of ["splash: 'tex-splash'", "muzzleFlash: 'tex-muzzle-flash'", "fireball: 'tex-fireball'", "wakeBoat: 'tex-wake-boat'", "wakeShip: 'tex-wake-ship'"]) expect(keys).toContain(k);
  });
  it('SplashPool は tex-splash を使い、数・寿命・tint・scale はそのまま。砲口炎 7 か所の閃光は tex-muzzle-flash、爆発の輪・目標の輪・爆弾は tex-explosion-ring のまま', () => {
    const sp = read('src/systems/splash-pool.ts');
    expect(sp).toContain('TEXTURE_KEYS.splash');
    expect(sp).not.toContain('TEXTURE_KEYS.explosionRing');
    expect(sp).toContain('SPLASH_LIFETIME_S, SPLASH_TINT_HIT, SPLASH_TINT_MISS');
    for (const f of ['src/systems/enemy-fire.ts', 'src/systems/shore-battery.ts', 'src/systems/pt-gun.ts', 'src/systems/world-arms.ts', 'src/systems/barge-hunt.ts', 'src/systems/pt-squadron.ts', 'src/entities/ally-destroyer.ts']) {
      const s = read(f);
      expect(s.split('TEXTURE_KEYS.muzzleFlash').length - 1, f).toBe(1);
      expect(/this\.flash(Img)? = [\s\S]{0,40}TEXTURE_KEYS\.muzzleFlash/.test(s) || /flash\w* = this\.\w+ \|\| aa \? scene\.add\.image\(0, 0, TEXTURE_KEYS\.muzzleFlash/.test(s), f).toBe(true);
    }
    for (const f of ['src/systems/pt-gun.ts', 'src/systems/barge-hunt.ts']) expect(read(f), f).toMatch(/this\.ring = [^\n]*TEXTURE_KEYS\.explosionRing/);
    expect(read('src/systems/air-strike-flight.ts')).toContain('TEXTURE_KEYS.explosionRing');
    expect(read('src/systems/enemy-seaplane.ts')).toContain('TEXTURE_KEYS.explosionRing');
    expect(read('src/systems/mission-effects.ts')).toContain('.image(0, 0, TEXTURE_KEYS.explosionRing)'); // 見越し点
  });
  it('mission-effects の playExplosion は名前と引数のまま登録先へ渡すだけ（new も tween も無い）。world-art が作って登録し、破棄で外す（R12）。mission-scene は触らない', () => {
    const me = read('src/systems/mission-effects.ts');
    expect(me).toContain('export function playExplosion(scene: Phaser.Scene, x: number, y: number, dud: boolean): void {');
    expect(me).toContain('explosions?.play(x, y, dud);');
    expect(me).toContain('export function registerExplosionFx(fx: ExplosionFx | null): void {');
    expect(me).not.toMatch(/tweens\.add/);
    expect(me).not.toMatch(/forScene/);
    const wa = read('src/systems/world-art.ts');
    expect(wa).toContain('registerExplosionFx(this.explosions);');
    expect(wa).toContain('registerExplosionFx(null);');
    expect(wa.indexOf('registerExplosionFx(null);')).toBeLessThan(wa.indexOf('this.explosions.destroy();'));
    const ms = read('src/scenes/mission-scene.ts');
    expect(ms.split('playExplosion(this, ').length - 1).toBe(5);
    expect(ms).toContain("import { DebugRanges, LeadMarker, playExplosion } from '../systems/mission-effects';");
  });
  it('explosion-fx: 確保は constructor だけ（play・update に new・tween・add.image が無い）、ADD は閃光と火球だけで深さ ＋0.01（R25）、小さい版は火球なし・暗い玉', () => {
    const s = read('src/systems/explosion-fx.ts').replace(/\/\/[^\n]*/g, '');
    const ctor = s.slice(s.indexOf('  constructor('), s.indexOf('  play('));
    const rest = s.slice(s.indexOf('  play('));
    expect(ctor.split('scene.add.image(').length - 1).toBe(EXPLOSION_PARTS);
    expect(rest).not.toMatch(/\bnew\s|tweens\.add|scene\.add\./);
    expect(ctor).toContain('setBlendMode(BLEND_ADD)');
    expect(ctor.split('setBlendMode(BLEND_ADD)').length - 1).toBe(2);
    expect(ctor).toContain('DEPTH.effects + ADD_DEPTH_STEP');
    expect(rest).toContain('setVisible(!dud)');
    expect(rest).toContain('if (dud) wet.setTexture(TEXTURE_KEYS.smokePuff).setTint(FIRE_SMOKE_TINT)');
    expect(rest).toContain('else wet.setTexture(TEXTURE_KEYS.splash)');
  });
  it('wake-fx: 確保は constructor だけ、原点 (0.5, 0)・深さ WAKE_DEPTH、速さは状態から（絵の位置の差からではない）、自艇は w.band、見えない絵は隠す。私的な絵のプールは readonly で出した（行数はそのまま）', () => {
    const s = read('src/systems/wake-fx.ts').replace(/\/\/[^\n]*/g, '');
    const upd = s.slice(s.indexOf('  update('), s.indexOf('  destroy('));
    expect(upd).not.toMatch(/\bnew\s|scene\.add\.|\.push\(/);
    expect(s).toContain('.setOrigin(0.5, 0).setDepth(WAKE_DEPTH).setVisible(false)');
    expect(upd).toContain('playerWakePose(w.band,');
    expect(upd).toContain('st.speedMps');
    expect(upd).not.toMatch(/prevX|lastX|\.x - /);
    expect(s).not.toMatch(/Math\.(sqrt|hypot)/);
    for (const [f, line] of [
      ['src/systems/escort-boat.ts', '  readonly sprite: Phaser.GameObjects.Image;'],
      ['src/systems/gunboat.ts', '  readonly sprite: Phaser.GameObjects.Image;'],
      ['src/systems/barge-hunt.ts', '  readonly sprites: Phaser.GameObjects.Image[] = [];'],
      ['src/systems/convoy.ts', '  readonly sprites: Phaser.GameObjects.Image[] = [];'],
      ['src/systems/pt-squadron.ts', '  readonly sprites: Phaser.GameObjects.Image[] = [];'],
      ['src/systems/evac-boats-view.ts', '  readonly imgs: Phaser.GameObjects.Image[] = [];'],
    ] as const) expect(read(f), f).toContain(line);
    expect(read('src/systems/evac-flights.ts')).toContain('    boats, //');
    expect(read('src/systems/world-visuals.ts')).toContain('w.art.update(realDt, w);');
  });
  it('触った src の 300 行のファイル（pt-squadron・mission-scene）は 300 行のまま、新しいファイルは 300 行以下', () => {
    for (const f of ['src/systems/pt-squadron.ts', 'src/scenes/mission-scene.ts']) expect(read(f).split('\n').length - 1, f).toBeLessThanOrEqual(300);
    for (const f of ['src/assets/fx-art.ts', 'src/assets/fx-shape.ts', 'src/systems/wake-fx.ts', 'src/systems/explosion-fx.ts', 'src/systems/world-art.ts', 'src/config/fx-art-config.ts']) expect(read(f).split('\n').length - 1, f).toBeLessThanOrEqual(300);
  });
});
