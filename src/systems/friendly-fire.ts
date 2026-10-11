// 味方機（友軍誤射。docs/02 §6.8、v0.3.3）の世界側: 開始条件の材料を集めて core/friendly に渡し、掃射の命中を世界に伝え、機体・信号弾・掃射の水柱を描く。
// §7: 機体 1 枚と信号弾 1 枚だけ持ち、毎フレームは transform/alpha だけ触る。水柱は EnemyFire のプールを借りる。tween は使わない。
import Phaser from 'phaser';
import { DEPTH, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import {
  FLARE_LIFETIME_S,
  FLARE_RADIUS_FROM_M,
  FLARE_RADIUS_TO_M,
  FLARE_TINT,
  STARSHELL_TEX_RADIUS_UNITS,
  STRAFE_SPLASH_INTERVAL_S,
  STRAFE_SPLASH_LEAD_M,
  STRAFE_SPLASH_TAIL_S,
} from '../config/ui-config';
import type { BoatState } from '../core/boat-motion';
import {
  FF_CHALLENGE,
  FF_EV_STRIKE,
  FF_IDLE,
  FF_LEAVING,
  FF_OUT_IDENTIFIED,
  FF_STRAFE,
  aircraftPose,
  cancelFriendly,
  createFriendlyState,
  identifyFriendly,
  stepFriendly,
  stepFriendlyTrigger,
  type AircraftPose,
  type FriendlyCheck,
  type FriendlyParams,
  type FriendlyState,
} from '../core/friendly';
import type { ReturnPoint } from '../core/mission-flow';
import { SHALLOW_NONE, type ShallowStatus } from '../core/shallows';
import { degToRad } from '../core/units';

/** 開始条件と中断の材料として世界から読む部分（MissionWorld がそのまま満たす） */
export interface FriendlyWorldView {
  readonly boat: { readonly state: BoatState; readonly sinking: boolean };
  readonly destroyer: { readonly sinking: boolean; readonly sunk: boolean; readonly ai: { readonly playerDetected: boolean } };
  readonly enemyFire: { readonly illuminated: boolean };
  readonly torpedoes: { readonly remaining: number; readonly capacity: number };
  readonly fuel: { readonly empty: boolean };
  readonly returnPoint: ReturnPoint;
  readonly atHome: boolean;
  readonly grounded: boolean;
  readonly slowMoLeftS: number;
  readonly shallowStatus: ShallowStatus;
}

export class FriendlyFire {
  readonly state: FriendlyState = createFriendlyState();
  private readonly check: FriendlyCheck = { fired: false, homeDx: 0, homeDy: 0, headingDeg: 0, speedMps: 0, underFire: false, busy: false, shallow: false, blocked: false };
  private readonly pose: AircraftPose = { dx: 0, dy: 0, headingDeg: 0, alpha: 0 };
  private readonly plane: Phaser.GameObjects.Image;
  private readonly flare: Phaser.GameObjects.Image;
  private flareAgeS = Infinity;
  private splashAtS = 0;
  private lastPhase = FF_IDLE;
  private planeShown = false;

  constructor(
    scene: Phaser.Scene,
    private readonly p: FriendlyParams,
    /** ?debug&ff: 「魚雷を撃った」を満たした扱い */
    private readonly forceFired: boolean,
    private readonly splash: (x: number, y: number, hit: boolean) => void,
    private readonly onStrike: (x: number, y: number) => void,
  ) {
    this.plane = scene.add.image(0, 0, TEXTURE_KEYS.aircraft).setScale(1 / RENDER_SCALE).setDepth(DEPTH.aircraft).setVisible(false);
    this.flare = scene.add.image(0, 0, TEXTURE_KEYS.starshell).setTint(FLARE_TINT).setDepth(DEPTH.effects).setVisible(false);
  }

  /** 「識別」ボタン。受け付けたら true（core/friendly の規則） */
  identify(): boolean {
    return identifyFriendly(this.state, this.p);
  }

  /** 固定ステップ（feelDt は体感の実秒）: 中断 → 開始条件 → 進行。真上を航過したら onStrike */
  step(feelDt: number, w: FriendlyWorldView): void {
    const s = this.state;
    const b = w.boat.state;
    if ((s.phase === FF_CHALLENGE || s.phase === FF_STRAFE) && (w.atHome || w.boat.sinking || w.grounded || w.fuel.empty)) cancelFriendly(s, this.p);
    if (s.phase === FF_IDLE) {
      const c = this.check;
      c.fired = this.forceFired || w.torpedoes.remaining < w.torpedoes.capacity;
      c.homeDx = w.returnPoint.x - b.x;
      c.homeDy = w.returnPoint.y - b.y;
      c.headingDeg = b.headingDeg;
      c.speedMps = b.speedMps;
      c.underFire = (w.enemyFire.illuminated || w.destroyer.ai.playerDetected) && !w.destroyer.sinking;
      c.busy = w.slowMoLeftS > 0 || (w.destroyer.sinking && !w.destroyer.sunk);
      c.shallow = w.shallowStatus.state !== SHALLOW_NONE;
      c.blocked = w.boat.sinking || w.grounded || w.fuel.empty || w.atHome;
      stepFriendlyTrigger(s, c, this.p, feelDt);
      return;
    }
    if (stepFriendly(s, this.p, feelDt) & FF_EV_STRIKE) this.onStrike(b.x, b.y);
  }

  /** 毎フレーム: 機体の位置・向き・濃さ、識別の信号弾（去り始めた瞬間に艇の位置で膨らんで消える）、掃射の水柱（機首の先を歩く） */
  updateVisuals(realDt: number, w: FriendlyWorldView): void {
    const s = this.state;
    const p = this.p;
    const b = w.boat.state;
    const phase = s.phase;
    const show = phase === FF_CHALLENGE || phase === FF_STRAFE || phase === FF_LEAVING;
    if (show !== this.planeShown) {
      this.planeShown = show;
      this.plane.setVisible(show);
    }
    if (show) {
      const q = aircraftPose(s, p, this.pose);
      this.plane.setPosition(b.x + q.dx, b.y + q.dy).setAngle(q.headingDeg).setAlpha(q.alpha);
    }
    if (phase !== this.lastPhase) {
      if (phase === FF_LEAVING && s.outcome === FF_OUT_IDENTIFIED) {
        this.flareAgeS = 0;
        this.flare.setPosition(b.x, b.y).setVisible(true);
      }
      if (phase === FF_STRAFE) this.splashAtS = 0;
      this.lastPhase = phase;
    }
    if (this.flareAgeS !== Infinity) {
      this.flareAgeS += realDt;
      if (this.flareAgeS >= FLARE_LIFETIME_S) {
        this.flareAgeS = Infinity;
        this.flare.setVisible(false);
      } else {
        const k = this.flareAgeS / FLARE_LIFETIME_S;
        const r = FLARE_RADIUS_FROM_M + (FLARE_RADIUS_TO_M - FLARE_RADIUS_FROM_M) * k;
        this.flare.setScale(r / STARSHELL_TEX_RADIUS_UNITS / RENDER_SCALE).setAlpha(0.9 * (1 - k));
      }
    }
    // 掃射の水柱: 航過の始まりから真上の少し後まで、機首の先 STRAFE_SPLASH_LEAD_M に一定間隔で置く（1 フレーム 1 つ）
    if (phase === FF_STRAFE && s.timerS >= this.splashAtS && this.splashAtS <= p.overpassS + STRAFE_SPLASH_TAIL_S) {
      const h = degToRad(this.pose.headingDeg);
      this.splash(this.plane.x + Math.sin(h) * STRAFE_SPLASH_LEAD_M, this.plane.y - Math.cos(h) * STRAFE_SPLASH_LEAD_M, false);
      this.splashAtS += STRAFE_SPLASH_INTERVAL_S;
    }
  }

  destroy(): void {
    this.plane.destroy();
    this.flare.destroy();
  }
}
