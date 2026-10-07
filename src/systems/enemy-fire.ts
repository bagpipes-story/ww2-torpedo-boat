// 駆逐艦の反撃の見た目（v0.2.1）: 探照灯の扇・星弾の照明・砲弾/曳光弾・着弾の水柱・砲口の閃光。
// 判断と運動は core/gunnery.ts。§7: すべて起動時にプールし、毎フレームは transform/alpha だけ触る。
import Phaser from 'phaser';
import { DEPTH, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import {
  MUZZLE_FLASH_LIFETIME_S,
  MUZZLE_FLASH_SCALE,
  MUZZLE_FLASH_TINT,
  SEARCHLIGHT_ALPHA,
  SEARCHLIGHT_TEX_LENGTH_UNITS,
  SHELL_POOL_SIZE,
  SPLASH_LIFETIME_S,
  SPLASH_POOL_SIZE,
  SPLASH_SCALE_HIT,
  SPLASH_SCALE_MISS,
  SPLASH_TINT_HIT,
  SPLASH_TINT_MISS,
  STARSHELL_ALPHA,
  STARSHELL_TEX_RADIUS_UNITS,
} from '../config/ui-config';
import type { BoatState } from '../core/boat-motion';
import { createGunneryState, updateGuns, updateIllumination, type GunneryParams, type GunneryState, type ShellEvents } from '../core/gunnery';
import type { SeededRng } from '../core/rng';
import { radToDeg } from '../core/units';

/** 命中の通知（引数はプリミティブ） */
export type ShellHitHandler = (gunIndex: number, x: number, y: number) => void;

export class EnemyFire {
  readonly state: GunneryState;
  private readonly shellSprites: Phaser.GameObjects.Image[] = [];
  /** 各スプライトが今どの砲のテクスチャか（-1 = 未設定）。同じフレーム内でスロットが別の砲に使い回されても正しく描く */
  private readonly shellTexGun: Int8Array;
  private readonly splashes: Phaser.GameObjects.Image[] = [];
  private readonly splashAges: Float32Array;
  private splashNext = 0;
  private readonly light: Phaser.GameObjects.Image;
  private readonly star: Phaser.GameObjects.Image;
  private readonly flash: Phaser.GameObjects.Image;
  private flashAge = Infinity;
  private onHit: ShellHitHandler = () => {};

  private readonly events: ShellEvents = {
    onFire: (_gunIndex, x, y) => {
      this.flash.setPosition(x, y).setAlpha(1).setVisible(true);
      this.flashAge = 0;
    },
    onImpact: (gunIndex, x, y, hit) => {
      this.placeSplash(x, y, hit);
      if (hit) this.onHit(gunIndex, x, y);
    },
  };

  constructor(
    scene: Phaser.Scene,
    private readonly params: GunneryParams,
    private readonly rng: SeededRng,
    shipHeadingDeg: number,
  ) {
    this.state = createGunneryState(params, SHELL_POOL_SIZE, shipHeadingDeg);
    this.shellTexGun = new Int8Array(SHELL_POOL_SIZE).fill(-1);
    for (let i = 0; i < SHELL_POOL_SIZE; i++) {
      this.shellSprites.push(scene.add.image(0, 0, TEXTURE_KEYS.tracer).setScale(1 / RENDER_SCALE).setDepth(DEPTH.shell).setVisible(false));
    }
    this.splashAges = new Float32Array(SPLASH_POOL_SIZE).fill(Infinity);
    for (let i = 0; i < SPLASH_POOL_SIZE; i++) {
      this.splashes.push(scene.add.image(0, 0, TEXTURE_KEYS.explosionRing).setDepth(DEPTH.effects).setVisible(false));
    }
    this.light = scene.add
      .image(0, 0, TEXTURE_KEYS.searchlight)
      .setOrigin(0.5, 1) // 光源（テクスチャ下端）を艦の位置に。角度 0 で北へ伸びる
      .setAlpha(SEARCHLIGHT_ALPHA)
      .setDepth(DEPTH.light)
      .setScale(params.searchlight.rangeM / SEARCHLIGHT_TEX_LENGTH_UNITS / RENDER_SCALE)
      .setVisible(false);
    this.star = scene.add
      .image(0, 0, TEXTURE_KEYS.starshell)
      .setAlpha(STARSHELL_ALPHA)
      .setDepth(DEPTH.light)
      .setScale(params.starshell.illumRadiusM / STARSHELL_TEX_RADIUS_UNITS / RENDER_SCALE)
      .setVisible(false);
    this.flash = scene.add
      .image(0, 0, TEXTURE_KEYS.explosionRing)
      .setTint(MUZZLE_FLASH_TINT)
      .setScale(MUZZLE_FLASH_SCALE / RENDER_SCALE)
      .setDepth(DEPTH.effects)
      .setVisible(false);
  }

  setHitHandler(h: ShellHitHandler): void {
    this.onHit = h;
  }

  get illuminated(): boolean {
    return this.state.illuminated;
  }

  /**
   * 固定ステップ。dt は time_scale 込み、realDt は実時間。
   * canFire=false（艦か艇が沈没中）でも飛んでいる弾は着弾まで進める。detected=false なら探照灯は消え、星弾は撃たない。
   */
  step(dt: number, realDt: number, ship: BoatState, player: BoatState, detected: boolean, canFire: boolean, playerHalfLengthM: number, playerHalfBeamM: number): void {
    updateIllumination(this.state, ship, player, detected, this.params, realDt);
    updateGuns(this.state, ship, player, canFire, playerHalfLengthM, playerHalfBeamM, this.params, this.rng, realDt, dt, this.events);
  }

  /** 毎フレーム: 探照灯の位置と向き、星弾の減衰、砲弾の位置、水柱・閃光のフェード（変わるものだけ触る） */
  updateVisuals(realDt: number, ship: BoatState): void {
    const light = this.state.light;
    if (light.on) {
      this.light.setPosition(ship.x, ship.y).setAngle(light.bearingDeg);
      if (!this.light.visible) this.light.setVisible(true);
    } else if (this.light.visible) {
      this.light.setVisible(false);
    }
    const star = this.state.star;
    if (star.leftS > 0) {
      this.star.setPosition(star.x, star.y).setAlpha(STARSHELL_ALPHA * Math.min(1, star.leftS / this.params.starshell.durationS + 0.3));
      if (!this.star.visible) this.star.setVisible(true);
    } else if (this.star.visible) {
      this.star.setVisible(false);
    }
    const shells = this.state.shells;
    for (let i = 0; i < shells.length; i++) {
      const s = shells[i]!;
      const img = this.shellSprites[i]!;
      if (!s.active) {
        if (img.visible) img.setVisible(false);
        continue;
      }
      if (this.shellTexGun[i] !== s.gunIndex) {
        // 主砲（index 0）は点、ほかは曳光弾。砲が変わったときだけ切り替える
        this.shellTexGun[i] = s.gunIndex;
        img.setTexture(s.gunIndex === 0 ? TEXTURE_KEYS.shell : TEXTURE_KEYS.tracer);
      }
      if (!img.visible) img.setVisible(true);
      img.setPosition(s.x, s.y).setAngle(radToDeg(Math.atan2(s.vx, -s.vy)));
    }
    for (let i = 0; i < SPLASH_POOL_SIZE; i++) {
      const age = this.splashAges[i]!;
      if (age === Infinity) continue;
      const next = age + realDt;
      if (next >= SPLASH_LIFETIME_S) {
        this.splashAges[i] = Infinity;
        this.splashes[i]!.setVisible(false);
        continue;
      }
      this.splashAges[i] = next;
      this.splashes[i]!.setAlpha(1 - next / SPLASH_LIFETIME_S);
    }
    if (this.flashAge !== Infinity) {
      this.flashAge += realDt;
      if (this.flashAge >= MUZZLE_FLASH_LIFETIME_S) {
        this.flashAge = Infinity;
        this.flash.setVisible(false);
      } else {
        this.flash.setAlpha(1 - this.flashAge / MUZZLE_FLASH_LIFETIME_S);
      }
    }
  }

  private placeSplash(x: number, y: number, hit: boolean): void {
    const i = this.splashNext;
    this.splashNext = (this.splashNext + 1) % SPLASH_POOL_SIZE;
    this.splashAges[i] = 0;
    this.splashes[i]!
      .setPosition(x, y)
      .setScale((hit ? SPLASH_SCALE_HIT : SPLASH_SCALE_MISS) / RENDER_SCALE)
      .setTint(hit ? SPLASH_TINT_HIT : SPLASH_TINT_MISS)
      .setAlpha(1)
      .setVisible(true);
  }

  destroy(): void {
    for (const s of this.shellSprites) s.destroy();
    for (const s of this.splashes) s.destroy();
    this.light.destroy();
    this.star.destroy();
    this.flash.destroy();
  }
}
