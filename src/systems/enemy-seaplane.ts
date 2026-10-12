// 敵の水上機（docs/02 §6.8、v0.4.1）の世界側: 開始条件の材料を集めて core/seaplane に渡し、照明弾・爆弾の着弾を世界に伝え、機体・照明弾・爆弾を描く。
// §7: 機体 1 枚・照明弾 1 枚・爆弾 count 枚だけ持ち、毎フレームは transform/alpha だけ触る。水柱は EnemyFire のプールを借りる。tween は使わない。
import Phaser from 'phaser';
import { DEPTH, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { BOMB_SCALE_FROM, BOMB_SCALE_TO, BOMB_TINT, SEAPLANE_FLARE_TINT, STARSHELL_ALPHA, STARSHELL_TEX_RADIUS_UNITS } from '../config/ui-config';
import type { BoatState, SpeedStep } from '../core/boat-motion';
import { FF_DONE, FF_IDLE, FF_LEAVING, type AircraftPose } from '../core/friendly';
import type { SeededRng } from '../core/rng';
import {
  SP_EV_FLARE,
  SP_EV_IMPACT,
  SP_EV_RELEASE,
  cancelSeaplane,
  createSeaplaneState,
  seaplaneActive,
  seaplanePose,
  stepSeaplane,
  stepSeaplaneTrigger,
  type SeaplaneCheck,
  type SeaplaneParams,
  type SeaplaneState,
} from '../core/seaplane';

/** 開始条件と中断の材料として世界から読む部分（MissionWorld がそのまま満たす） */
export interface SeaplaneWorldView {
  readonly boat: { readonly state: BoatState; readonly sinking: boolean };
  readonly destroyer: { readonly state: BoatState; readonly sinking: boolean; readonly sunk: boolean };
  readonly enemyFire: { readonly shotsFired: number };
  readonly friendly: { readonly state: { readonly phase: number } } | null;
  readonly storm: { readonly state: { readonly inside: boolean } } | null;
  readonly fuel: { readonly empty: boolean };
  readonly band: SpeedStep;
  readonly atHome: boolean;
  readonly grounded: boolean;
  readonly slowMoLeftS: number;
  readonly stepTimeS: number;
}

export class EnemySeaplane {
  readonly state: SeaplaneState;
  private readonly check: SeaplaneCheck;
  private readonly pose: AircraftPose = { dx: 0, dy: 0, headingDeg: 0, alpha: 0 };
  private readonly plane: Phaser.GameObjects.Image;
  private readonly flare: Phaser.GameObjects.Image;
  private readonly bombs: Phaser.GameObjects.Image[] = [];
  private planeShown = false;
  private flareShown = false;

  constructor(
    scene: Phaser.Scene,
    readonly p: SeaplaneParams,
    /** ?debug&plane / &plane=attack */
    debug: 'none' | 'force' | 'attack',
    private readonly rng: SeededRng,
    boat: BoatState,
    private readonly splash: (x: number, y: number, hit: boolean) => void,
    private readonly onBombHit: (x: number, y: number) => void,
  ) {
    this.state = createSeaplaneState(p);
    this.check = { boat, targetX: 0, targetY: 0, wake: false, stormInside: false, friendlyLive: false, busy: false, blocked: false, boatSinking: false, timeS: 0, shellsFired: 0, forceTrigger: debug !== 'none', forceSeen: debug === 'attack' };
    this.plane = scene.add.image(0, 0, TEXTURE_KEYS.enemyAircraft).setScale(1 / RENDER_SCALE).setDepth(DEPTH.aircraft).setVisible(false);
    this.flare = scene.add
      .image(0, 0, TEXTURE_KEYS.starshell)
      .setTint(SEAPLANE_FLARE_TINT)
      .setAlpha(STARSHELL_ALPHA)
      .setDepth(DEPTH.light)
      .setScale(Math.sqrt(p.flareRadius2) / STARSHELL_TEX_RADIUS_UNITS / RENDER_SCALE)
      .setVisible(false);
    for (let i = 0; i < p.bombCount; i++) this.bombs.push(scene.add.image(0, 0, TEXTURE_KEYS.explosionRing).setTint(BOMB_TINT).setDepth(DEPTH.shell).setVisible(false));
  }

  /** 接近〜去る途中（味方機を同時に来させない） */
  get active(): boolean {
    return seaplaneActive(this.state);
  }

  /** 艇が照明弾の光の中（駆逐艦の発見距離を上げ、砲撃を許す） */
  get flareLit(): boolean {
    return this.state.ordnance.flare.lit;
  }

  /** 固定ステップ（feelDt は体感の実秒）: 中断 → 開始条件 → 進行。着弾で水柱か命中 */
  step(feelDt: number, w: SeaplaneWorldView): void {
    const s = this.state;
    const c = this.check;
    const blocked = w.boat.sinking || w.atHome || w.grounded;
    if (blocked) cancelSeaplane(s, this.p);
    c.targetX = w.destroyer.state.x;
    c.targetY = w.destroyer.state.y;
    c.wake = w.band === 'cruise' || w.band === 'full';
    c.stormInside = w.storm ? w.storm.state.inside : false;
    const fp = w.friendly ? w.friendly.state.phase : FF_IDLE;
    c.friendlyLive = !(fp === FF_IDLE || fp === FF_LEAVING || fp === FF_DONE);
    c.busy = w.slowMoLeftS > 0 || (w.destroyer.sinking && !w.destroyer.sunk);
    c.blocked = blocked || w.fuel.empty;
    c.boatSinking = w.boat.sinking;
    c.timeS = w.stepTimeS;
    c.shellsFired = w.enemyFire.shotsFired;
    stepSeaplaneTrigger(s, c, this.p, feelDt);
    const ev = stepSeaplane(s, this.p, c, this.rng, feelDt);
    if (ev & SP_EV_FLARE) {
      this.flare.setPosition(s.ordnance.flare.x, s.ordnance.flare.y).setVisible(true);
      this.flareShown = true;
    }
    if (ev & SP_EV_RELEASE) {
      const b = s.ordnance.bombs[s.ordnance.bombsDropped - 1]!;
      this.bombs[s.ordnance.bombsDropped - 1]!.setPosition(b.fromX, b.fromY).setScale(BOMB_SCALE_FROM / RENDER_SCALE).setVisible(true);
    }
    if (ev & SP_EV_IMPACT) {
      const b = s.ordnance.bombs[s.ordnance.lastImpact]!;
      this.bombs[s.ordnance.lastImpact]!.setVisible(false);
      if (b.hit) this.onBombHit(b.aimX, b.aimY);
      else this.splash(b.aimX, b.aimY, true);
    }
  }

  /** 毎フレーム: 機体の位置・向き・濃さ、照明弾の減衰、落下中の爆弾の位置と大きさ（変わるものだけ触る） */
  updateVisuals(boat: BoatState): void {
    const s = this.state;
    const show = seaplaneActive(s);
    if (show !== this.planeShown) {
      this.planeShown = show;
      this.plane.setVisible(show);
    }
    if (show) {
      const q = seaplanePose(s, this.p, this.pose);
      this.plane.setPosition(boat.x + q.dx, boat.y + q.dy).setAngle(q.headingDeg).setAlpha(q.alpha);
    }
    const f = s.ordnance.flare;
    if (this.flareShown) {
      if (f.leftS > 0) this.flare.setAlpha(STARSHELL_ALPHA * Math.min(1, f.leftS / this.p.flareDurationS + 0.3));
      else {
        this.flareShown = false;
        this.flare.setVisible(false);
      }
    }
    for (let i = 0; i < this.bombs.length; i++) {
      const b = s.ordnance.bombs[i]!;
      if (!b.active) continue;
      const k = 1 - Math.max(0, b.leftS) / this.p.bombFallFeelS;
      this.bombs[i]!.setPosition(b.fromX + (b.aimX - b.fromX) * k, b.fromY + (b.aimY - b.fromY) * k).setScale((BOMB_SCALE_FROM + (BOMB_SCALE_TO - BOMB_SCALE_FROM) * k) / RENDER_SCALE);
    }
  }

  destroy(): void {
    this.plane.destroy();
    this.flare.destroy();
    for (const b of this.bombs) b.destroy();
  }
}
