// 沿岸砲の世界側（docs/02 §6.8、v0.4.3）: core/shore-battery を固定ステップで進め、砲台・射界の半円（起動時 1 回の Graphics）・砲弾・砲口の閃光を描く。
// 着弾の水柱は世界の SplashPool（駆逐艦の砲と同じ大きさ）。被害は世界の hitBoat（終了理由 shore_battery）。§7: 砲弾 6 枚と閃光 1 枚を起動時に作り、毎フレームは transform/alpha/visible だけ。
// v0.7.0 IP1b（U4「沿岸砲もリメイク」）: 平らな赤い四角と線の砲身をやめ、真上から見た砲台の絵（assets/battery-art: 擬装・土嚢・床・敵の赤の輪と印）と回る砲の絵に。砲は気づいて射界の中なら艇へ向き、
//   ふだんは海へゆっくり首を振る（assets/battery-shape。論理の状態は読むだけ）。撃つと砲身が反動で下がり、閃光は砲口に、火花と硝煙（SplashPool の muzzle）。射界の半円・ラベルはそのまま。
import Phaser from 'phaser';
import { DEPTH, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { gunOriginY, ensureShoreBatteryTextures } from '../assets/battery-art';
import { batteryAimDeg, turnToward } from '../assets/battery-shape';
import { BATTERY_ART_FLASH_RADIUS_M, BATTERY_ART_FLASH_S, BATTERY_ART_SIZE_M, BATTERY_GUN_LEN_M, BATTERY_RECOIL_M, BATTERY_RECOIL_S, BATTERY_TURN_DPS } from '../config/blast-art-config';
import { EXPLOSION_RING_RADIUS_UNITS } from '../assets/art-dims';
import { ADD_DEPTH_STEP } from '../config/fx-art-config';
import { hudTextStyle } from '../config/ui-config';
import {
  BATTERY_ARC_COLOR,
  BATTERY_ARC_FILL_ALPHA,
  BATTERY_ARC_LINE_ALPHA,
  BATTERY_ARC_LINE_WIDTH,
  BATTERY_LABEL,
  BATTERY_LABEL_COLOR,
  BATTERY_LABEL_FONT_PX,
  BATTERY_LABEL_GAP_M,
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
  /** 砲台と回る砲の絵（IP1b）・砲の向き（度・0＝北）・反動の年・見た目の時計 */
  private readonly base: Phaser.GameObjects.Image;
  private readonly gun: Phaser.GameObjects.Image;
  private gunDeg = 0;
  private recoilAge = Infinity;
  private t = 0;
  private readonly events: ShoreBatteryEvents = {
    onFire: (x, y) => {
      const r = (this.gunDeg * Math.PI) / 180;
      const mx = x + Math.sin(r) * BATTERY_GUN_LEN_M;
      const my = y - Math.cos(r) * BATTERY_GUN_LEN_M;
      this.flash.setPosition(mx, my).setAlpha(1).setVisible(true);
      this.flashAge = 0;
      this.recoilAge = 0;
      this.splashes.muzzle(mx, my, true); // 砲口の火花と硝煙（見た目だけ）
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
    // 砲台（IP1b: 描いた砲台と回る砲。v0.6.11 までは赤い四角＋明るい縁＋線の砲身）。下にラベル（実機 1 回目「見えづらい」。位置は BATTERY_SIZE_M のまま）
    const half = BATTERY_SIZE_M / 2;
    const perPx = ensureShoreBatteryTextures(scene);
    this.base = scene.add.image(p.x, p.y, TEXTURE_KEYS.shoreBattery).setDisplaySize(BATTERY_ART_SIZE_M, BATTERY_ART_SIZE_M).setDepth(DEPTH.destroyer);
    this.gun = scene.add.image(p.x, p.y, TEXTURE_KEYS.shoreGun).setOrigin(0.5, gunOriginY).setScale(perPx).setDepth(DEPTH.destroyer + ADD_DEPTH_STEP);
    this.graphics = g;
    this.label = scene.add.text(p.x, p.y + half + BATTERY_LABEL_GAP_M, BATTERY_LABEL, hudTextStyle(BATTERY_LABEL_FONT_PX, BATTERY_LABEL_COLOR)).setOrigin(0.5, 0).setDepth(DEPTH.destroyer);
    for (let i = 0; i < BATTERY_SHELL_POOL_SIZE; i++) this.shellSprites.push(scene.add.image(0, 0, TEXTURE_KEYS.shell).setTint(BATTERY_SHELL_TINT).setScale(1 / RENDER_SCALE).setDepth(DEPTH.shell).setVisible(false));
    this.flash = scene.add.image(0, 0, TEXTURE_KEYS.muzzleFlash).setTint(BATTERY_SHELL_TINT).setScale(BATTERY_ART_FLASH_RADIUS_M / EXPLOSION_RING_RADIUS_UNITS / RENDER_SCALE).setDepth(DEPTH.effects).setVisible(false); // IP1b: 24 → 62 m・0.12 → 0.24 秒
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
    this.aimGun(realDt);
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
      if (this.flashAge >= BATTERY_ART_FLASH_S) {
        this.flashAge = Infinity;
        this.flash.setVisible(false);
      } else this.flash.setAlpha(1 - this.flashAge / BATTERY_ART_FLASH_S);
    }
  }

  /** 砲の向き（気づいて射界の中なら艇へ・ふだんは海へ首振り）と反動（見た目だけ。論理の状態は読むだけ） */
  private aimGun(realDt: number): void {
    this.t += realDt;
    const b = this.check.boat;
    const target = batteryAimDeg(this.state.alerted && this.state.inArc, b.x - this.p.x, b.y - this.p.y, this.t);
    this.gunDeg = turnToward(this.gunDeg, target, BATTERY_TURN_DPS * realDt);
    let back = 0;
    if (this.recoilAge !== Infinity) {
      this.recoilAge += realDt;
      if (this.recoilAge >= BATTERY_RECOIL_S) this.recoilAge = Infinity;
      else back = BATTERY_RECOIL_M * (1 - this.recoilAge / BATTERY_RECOIL_S) ** 2;
    }
    const r = (this.gunDeg * Math.PI) / 180;
    this.gun.setPosition(this.p.x - Math.sin(r) * back, this.p.y + Math.cos(r) * back).setAngle(this.gunDeg);
  }

  destroy(): void {
    this.base.destroy();
    this.gun.destroy();
    this.graphics.destroy();
    this.label.destroy();
    for (const s of this.shellSprites) s.destroy();
    this.flash.destroy();
  }
}
