// 沿岸砲の世界側（docs/02 §6.8、v0.4.3）: core/shore-battery を固定ステップで進め、砲台・射界の半円（起動時 1 回の Graphics）・砲弾・砲口の閃光を描く。
// 着弾の水柱は世界の SplashPool（駆逐艦の砲と同じ大きさ）。被害は世界の hitBoat（終了理由 shore_battery）。§7: 砲弾 6 枚と閃光 1 枚を起動時に作り、毎フレームは transform/alpha/visible だけ。
import Phaser from 'phaser';
import { DEPTH, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { hudTextStyle } from '../config/ui-config';
import {
  BATTERY_ARC_COLOR,
  BATTERY_ARC_FILL_ALPHA,
  BATTERY_ARC_LINE_ALPHA,
  BATTERY_ARC_LINE_WIDTH,
  BATTERY_BARREL_COLOR,
  BATTERY_BARREL_WIDTH,
  BATTERY_COLOR,
  BATTERY_LABEL,
  BATTERY_LABEL_COLOR,
  BATTERY_LABEL_FONT_PX,
  BATTERY_LABEL_GAP_M,
  BATTERY_OUTLINE_COLOR,
  BATTERY_OUTLINE_WIDTH,
  BATTERY_FLASH_LIFETIME_S,
  BATTERY_FLASH_SCALE,
  BATTERY_SHELL_POOL_SIZE,
  BATTERY_SHELL_TINT,
  BATTERY_SIZE_M,
} from '../config/hunt-config';
import type { BoatState } from '../core/boat-motion';
import type { HitSpec } from '../core/gunnery';
import type { SeededRng } from '../core/rng';
import { createShoreBattery, stepShoreBattery, type ShoreBatteryCheck, type ShoreBatteryEvents, type ShoreBatteryParams, type ShoreBatteryState } from '../core/shore-battery';
import type { SmokeParams, SmokeState } from '../core/smoke';
import { radToDeg } from '../core/units';
import type { SplashPool } from './splash-pool';

export class ShoreBattery {
  readonly state: ShoreBatteryState;
  private readonly check: ShoreBatteryCheck;
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly shellSprites: Phaser.GameObjects.Image[] = [];
  private readonly flash: Phaser.GameObjects.Image;
  private flashAge = Infinity;
  private readonly events: ShoreBatteryEvents = {
    onFire: (x, y) => {
      this.flash.setPosition(x, y).setAlpha(1).setVisible(true);
      this.flashAge = 0;
    },
    onImpact: (x, y, hit) => {
      if (hit) this.onBoatHit(this.p.hit, this.rng, x, y);
      else this.splashes.splash(x, y, false);
    },
  };

  constructor(
    scene: Phaser.Scene,
    readonly p: ShoreBatteryParams,
    private readonly rng: SeededRng,
    boat: BoatState,
    boatHalfLengthM: number,
    boatHalfBeamM: number,
    private readonly splashes: SplashPool,
    /** 砲弾が艇に当たった（世界が boat-damage で適用。終了理由は shore_battery） */
    private readonly onBoatHit: (spec: HitSpec, rng: SeededRng, x: number, y: number) => void,
  ) {
    this.state = createShoreBattery(BATTERY_SHELL_POOL_SIZE);
    this.check = { boat, boatHalfLengthM, boatHalfBeamM, boatAfloat: true, detectOpenM: 0, smokeFactor: 1, smoke: null, smokeParams: null, bargesAlerted: false, flashM: 0 };
    // 射界の半円（海側）と砲台は起動時に 1 回だけ描く（陸の塗り（shallows の Graphics）より上に。砲台が陸に隠れないように艦艇と同じ深さ）
    const g = scene.add.graphics().setDepth(DEPTH.destroyer);
    const r = p.gun.effectiveM;
    g.fillStyle(BATTERY_ARC_COLOR, BATTERY_ARC_FILL_ALPHA);
    g.slice(p.x, p.y, r, Math.PI, 2 * Math.PI, false);
    g.fillPath();
    g.lineStyle(BATTERY_ARC_LINE_WIDTH, BATTERY_ARC_COLOR, BATTERY_ARC_LINE_ALPHA);
    g.beginPath();
    g.arc(p.x, p.y, r, Math.PI, 2 * Math.PI, false);
    g.strokePath();
    // 砲台: 陸（暗い緑）に紛れない赤い四角＋明るい縁、砲身は海（北）へ。下にラベル（実機 1 回目「見えづらい」）
    const half = BATTERY_SIZE_M / 2;
    g.fillStyle(BATTERY_COLOR, 1);
    g.fillRect(p.x - half, p.y - half, BATTERY_SIZE_M, BATTERY_SIZE_M);
    g.lineStyle(BATTERY_OUTLINE_WIDTH, BATTERY_OUTLINE_COLOR, 1);
    g.strokeRect(p.x - half, p.y - half, BATTERY_SIZE_M, BATTERY_SIZE_M);
    g.lineStyle(BATTERY_BARREL_WIDTH, BATTERY_BARREL_COLOR, 1);
    g.lineBetween(p.x, p.y, p.x, p.y - BATTERY_SIZE_M);
    this.graphics = g;
    this.label = scene.add.text(p.x, p.y + half + BATTERY_LABEL_GAP_M, BATTERY_LABEL, hudTextStyle(BATTERY_LABEL_FONT_PX, BATTERY_LABEL_COLOR)).setOrigin(0.5, 0).setDepth(DEPTH.destroyer);
    for (let i = 0; i < BATTERY_SHELL_POOL_SIZE; i++) this.shellSprites.push(scene.add.image(0, 0, TEXTURE_KEYS.shell).setTint(BATTERY_SHELL_TINT).setScale(1 / RENDER_SCALE).setDepth(DEPTH.shell).setVisible(false));
    this.flash = scene.add.image(0, 0, TEXTURE_KEYS.explosionRing).setTint(BATTERY_SHELL_TINT).setScale(BATTERY_FLASH_SCALE / RENDER_SCALE).setDepth(DEPTH.effects).setVisible(false);
  }

  /** 固定ステップ（大発の後。大発の気づきと艇の射撃の閃光を読む） */
  step(feelDt: number, dt: number, boatAfloat: boolean, detectOpenM: number, smokeFactor: number, smoke: SmokeState | null, smokeParams: SmokeParams | null, bargesAlerted: boolean, flashM: number): void {
    const c = this.check;
    c.boatAfloat = boatAfloat;
    c.detectOpenM = detectOpenM;
    c.smokeFactor = smokeFactor;
    c.smoke = smoke;
    c.smokeParams = smokeParams;
    c.bargesAlerted = bargesAlerted;
    c.flashM = flashM;
    stepShoreBattery(this.state, this.p, c, this.rng, feelDt, dt, this.events);
  }

  updateVisuals(realDt: number): void {
    const shells = this.state.shells;
    for (let i = 0; i < shells.length; i++) {
      const s = shells[i]!;
      const img = this.shellSprites[i]!;
      if (!s.active) {
        if (img.visible) img.setVisible(false);
        continue;
      }
      if (!img.visible) img.setVisible(true);
      img.setPosition(s.x, s.y).setAngle(radToDeg(Math.atan2(s.vx, -s.vy)));
    }
    if (this.flashAge !== Infinity) {
      this.flashAge += realDt;
      if (this.flashAge >= BATTERY_FLASH_LIFETIME_S) {
        this.flashAge = Infinity;
        this.flash.setVisible(false);
      } else this.flash.setAlpha(1 - this.flashAge / BATTERY_FLASH_LIFETIME_S);
    }
  }

  destroy(): void {
    this.graphics.destroy();
    this.label.destroy();
    for (const s of this.shellSprites) s.destroy();
    this.flash.destroy();
  }
}
