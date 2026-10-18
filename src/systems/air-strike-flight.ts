// 夜明けの空襲（v0.6.1。docs/02 §6.8）の世界側: core/air-strike を固定ステップで進め、投下・着弾を世界に伝え、機体・爆弾・着弾点の輪・爆撃進路の線を描く。
// §7: 機体（機数）・爆弾と輪（プールの数）・線 1 本を constructor で 1 回だけ作り、毎フレームは transform/alpha と、表示の切り替え（前回の値と比べる）だけ。
// tween・new・配列の filter/map は使わない。水柱は世界の SplashPool を借りる。乱数は seed+19 の専用の系列（散布は core が投下ごとに 2 回、
// 自艇への命中の火災・機関は世界の hitBoat が同じ系列から引く。僚艇の被弾は乱数を引かない）。
import type Phaser from 'phaser';
import { DEPTH, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { AIR_STRIKE_RING_ALPHA, AIR_STRIKE_RING_TINT, AIR_STRIKE_RUN_LINE_ALPHA, AIR_STRIKE_RUN_LINE_TINT, AIR_STRIKE_RUN_LINE_WIDTH_M } from '../config/dawn-config';
import { BOMB_SCALE_FROM, BOMB_SCALE_TO, BOMB_TINT, RETURN_RING_TEX_RADIUS_UNITS } from '../config/ui-config';
import type { BoatState } from '../core/boat-motion';
import type { AircraftPose } from '../core/friendly';
import type { SeededRng } from '../core/rng';
import {
  AS_DONE,
  AS_EV_IMPACT,
  AS_EV_RELEASE,
  AS_IDLE,
  AS_RUN,
  airStrikeActive,
  createAirStrike,
  startAirStrike,
  stepAirStrike,
  strikePose,
  type AirStrikeCheck,
  type AirStrikeParams,
  type AirStrikeState,
} from '../core/air-strike';

/** 中断と的の材料として世界から読む部分（MissionWorld がそのまま満たす） */
export interface AirStrikeWorldView {
  readonly boat: { readonly state: BoatState; readonly sinking: boolean };
  readonly atHome: boolean;
  readonly grounded: boolean;
  readonly escort: { readonly state: { readonly boat: BoatState; readonly sunk: boolean } } | null;
}

export class AirStrikeFlight {
  readonly state: AirStrikeState;
  private readonly check: AirStrikeCheck;
  private readonly pose: AircraftPose = { dx: 0, dy: 0, headingDeg: 0, alpha: 0 };
  private readonly planes: Phaser.GameObjects.Image[] = [];
  private readonly planeShown: boolean[] = [];
  private readonly bombs: Phaser.GameObjects.Image[] = [];
  private readonly rings: Phaser.GameObjects.Image[] = [];
  private readonly line: Phaser.GameObjects.Image;
  private lineShown = false;
  /** 線の絵の元の幅・高さ px（横に伸ばして太さ AIR_STRIKE_RUN_LINE_WIDTH_M に） */
  private readonly lineTexW: number;
  private readonly lineScaleY: number;

  constructor(
    scene: Phaser.Scene,
    readonly p: AirStrikeParams,
    private readonly rng: SeededRng,
    private readonly splash: (x: number, y: number, hit: boolean) => void,
    private readonly onPlayerHit: (x: number, y: number) => void,
    private readonly onEscortHit: (damage: number, x: number, y: number) => void,
  ) {
    this.state = createAirStrike(p);
    this.check = { player: { x: 0, y: 0, headingDeg: 0, speedMps: 0 }, playerSinking: false, escort: null, escortAfloat: false, cancel: false };
    for (let i = 0; i < p.planes; i++) {
      this.planes.push(scene.add.image(0, 0, TEXTURE_KEYS.enemyAircraft).setScale(1 / RENDER_SCALE).setDepth(DEPTH.aircraft).setVisible(false));
      this.planeShown.push(false);
    }
    const ringScale = p.playerHitRadiusM / RETURN_RING_TEX_RADIUS_UNITS / RENDER_SCALE;
    for (let i = 0; i < p.poolSize; i++) {
      this.bombs.push(scene.add.image(0, 0, TEXTURE_KEYS.explosionRing).setTint(BOMB_TINT).setDepth(DEPTH.shell).setVisible(false));
      this.rings.push(scene.add.image(0, 0, TEXTURE_KEYS.returnRing).setTint(AIR_STRIKE_RING_TINT).setAlpha(AIR_STRIKE_RING_ALPHA).setScale(ringScale).setDepth(DEPTH.returnRing).setVisible(false));
    }
    this.line = scene.add.image(0, 0, TEXTURE_KEYS.tracer).setOrigin(0, 0.5).setTint(AIR_STRIKE_RUN_LINE_TINT).setAlpha(AIR_STRIKE_RUN_LINE_ALPHA).setDepth(DEPTH.returnRing).setVisible(false);
    this.lineTexW = this.line.width;
    this.lineScaleY = AIR_STRIKE_RUN_LINE_WIDTH_M / this.line.height;
  }

  /** 機が来ているか爆弾が空中（味方機を同時に来させない） */
  get active(): boolean {
    return airStrikeActive(this.state);
  }

  /** 夜明けのラッチで 1 回（乱数は引かない） */
  start(player: BoatState): void {
    this.check.player = player;
    startAirStrike(this.state, this.p, player);
  }

  /** 固定ステップの最後（feelDt は体感の実秒）。投下で爆弾と輪を出し、着弾で消して命中か水柱 */
  step(feelDt: number, w: AirStrikeWorldView): void {
    const c = this.check;
    const e = w.escort;
    c.player = w.boat.state;
    c.playerSinking = w.boat.sinking;
    c.escort = e ? e.state.boat : null;
    c.escortAfloat = e !== null && !e.state.sunk;
    c.cancel = w.boat.sinking || w.atHome || w.grounded;
    const s = this.state;
    const ev = stepAirStrike(s, this.p, c, this.rng, feelDt);
    if (ev & AS_EV_RELEASE) {
      const b = s.bombs[s.lastRelease]!;
      this.bombs[s.lastRelease]!.setPosition(b.fromX, b.fromY).setScale(BOMB_SCALE_FROM / RENDER_SCALE).setVisible(true);
      this.rings[s.lastRelease]!.setPosition(b.aimX, b.aimY).setVisible(true);
    }
    if (ev & AS_EV_IMPACT) {
      const b = s.bombs[s.lastImpact]!;
      this.bombs[s.lastImpact]!.setVisible(false);
      this.rings[s.lastImpact]!.setVisible(false);
      if (b.hitPlayer) this.onPlayerHit(b.aimX, b.aimY);
      if (b.hitEscort) this.onEscortHit(this.p.bombHit.damage, b.aimX, b.aimY);
      if (!b.hitPlayer && !b.hitEscort) this.splash(b.aimX, b.aimY, true);
    }
  }

  /** 毎フレーム: 機の位置・向き・濃さ、爆撃進路の線（hypot と atan2 は線の 1 回だけ）、落下中の爆弾の位置と大きさ */
  updateVisuals(player: BoatState, escort: BoatState | null): void {
    const s = this.state;
    let runPlane = -1;
    let runX = 0;
    let runY = 0;
    for (let i = 0; i < this.planes.length; i++) {
      const ph = s.planes[i]!.phase;
      const show = ph !== AS_IDLE && ph !== AS_DONE;
      if (show !== this.planeShown[i]) {
        this.planeShown[i] = show;
        this.planes[i]!.setVisible(show);
      }
      if (!show) continue;
      const q = strikePose(s, this.p, i, this.pose);
      const x = player.x + q.dx;
      const y = player.y + q.dy;
      this.planes[i]!.setPosition(x, y).setAngle(q.headingDeg).setAlpha(q.alpha);
      if (ph === AS_RUN) {
        runPlane = i;
        runX = x;
        runY = y;
      }
    }
    const lineOn = runPlane >= 0;
    if (lineOn !== this.lineShown) {
      this.lineShown = lineOn;
      this.line.setVisible(lineOn);
    }
    if (lineOn) {
      const toEscort = s.planes[runPlane]!.toEscort && escort !== null;
      const dx = (toEscort ? escort!.x : player.x) - runX;
      const dy = (toEscort ? escort!.y : player.y) - runY;
      this.line.setPosition(runX, runY).setRotation(Math.atan2(dy, dx)).setScale(Math.hypot(dx, dy) / this.lineTexW, this.lineScaleY);
    }
    for (let i = 0; i < this.bombs.length; i++) {
      const b = s.bombs[i]!;
      if (!b.active) continue;
      const k = 1 - Math.max(0, b.leftS) / this.p.fallFeelS;
      this.bombs[i]!.setPosition(b.fromX + (b.aimX - b.fromX) * k, b.fromY + (b.aimY - b.fromY) * k).setScale((BOMB_SCALE_FROM + (BOMB_SCALE_TO - BOMB_SCALE_FROM) * k) / RENDER_SCALE);
    }
  }

  destroy(): void {
    for (const img of this.planes) img.destroy();
    for (const img of this.bombs) img.destroy();
    for (const img of this.rings) img.destroy();
    this.line.destroy();
  }
}
