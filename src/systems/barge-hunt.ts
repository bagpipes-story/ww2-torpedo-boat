// 大発掃討（docs/02 §6.4、v0.4.2）の世界側: 艇の砲（core/gun-battery）→ 大発の隊（core/barges）の順に固定ステップで進め、撃破・被弾を世界に伝え、大発・曳光弾・砲口の閃光・標的の輪・小さい水柱を描く。
// §7: 大発 count 枚・弾は両側のプール・閃光 1 枚・輪 1 枚・水柱 32 枚を起動時に作り、毎フレームは transform/alpha/visible だけ触る。撃破の沈み込みだけ発生時に 1 回 tween。
// 乱数: 大発の 13mm（散布と命中の火災・機関）は seed+6、艇の砲は seed+7。ほかの系列（seed〜seed+5）は動かさない。
import Phaser from 'phaser';
import { DEPTH, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import {
  BARGE_BEACHED_ALPHA,
  BARGE_BEACHED_TINT,
  GUN_FLASH_LIFETIME_S,
  GUN_FLASH_SCALE,
  GUN_HEAVY_TINT,
  GUN_SHELL_POOL_SIZE,
  GUN_SPLASH_POOL_SIZE,
  GUN_SPLASH_SCALE_HIT,
  GUN_SPLASH_SCALE_MISS,
  GUN_TRACER_TINT,
  MG_SHELL_POOL_SIZE,
  MG_TRACER_TINT,
  TARGET_RING_ALPHA,
  TARGET_RING_SCALE,
  TARGET_RING_TINT,
} from '../config/hunt-config';
import { SINK_DURATION_MS, SINK_SCALE_TO, SINK_TILT_DEG } from '../config/ui-config';
import type { BoatState, SpeedStep } from '../core/boat-motion';
import { BARGE_SUNK, createFlotilla, hitBarge, stepFlotilla, type BargeParams, type FlotillaCheck, type FlotillaEvents, type FlotillaState } from '../core/barges';
import { GUN_FIRING, createGunBattery, stepGunBattery, type GunBatteryParams, type GunBatteryState, type GunEvents } from '../core/gun-battery';
import type { HitSpec } from '../core/gunnery';
import { SeededRng } from '../core/rng';
import type { ShellState } from '../core/shells';
import type { ShoreBatteryParams } from '../core/shore-battery';
import type { SmokeParams, SmokeState } from '../core/smoke';
import { radToDeg } from '../core/units';
import { ShoreBattery } from './shore-battery';
import { SplashPool } from './splash-pool';

/** 固定ステップで世界から読む部分（MissionWorld がそのまま満たす） */
export interface BargeHuntView {
  readonly boat: { readonly sinking: boolean };
  readonly band: SpeedStep;
  readonly visRange2: number;
  /** 大発の任務では煙幕を掛けない発見距離（煙幕は大発ごとに掛ける） */
  readonly detectRangeM: number;
  readonly smoke: SmokeState | null;
  readonly smokeParams: SmokeParams | null;
  readonly vis: { readonly smokeFactor: number };
}

export class BargeHunt {
  readonly flotilla: FlotillaState;
  readonly battery: GunBatteryState;
  /** 沿岸砲（v0.4.3。任務に shore_battery が無ければ []。v0.4.5 からハードで 2 門以上）。乱数は seed+8（2 門目は seed+9、…） */
  readonly shores: ShoreBattery[] = [];
  /** KPI: 撃破したときの艇からの距離の最小・最大 m（撃破なしなら NaN） */
  killMinM = NaN;
  killMaxM = NaN;
  /** 夜明け（v0.6.2。withdraw）の時点で上陸していた隻数（夜明けの後に岸へ隠れた数 = beached − これ） */
  private beachedAtDawn = 0;
  private readonly bargeRng: SeededRng;
  private readonly gunRng: SeededRng;
  private readonly check: FlotillaCheck;
  private readonly splashes: SplashPool;
  private readonly sprites: Phaser.GameObjects.Image[] = [];
  private readonly shown: Uint8Array;
  private readonly gunSprites: Phaser.GameObjects.Image[] = [];
  private readonly gunTex: Int8Array;
  private readonly mgSprites: Phaser.GameObjects.Image[] = [];
  private readonly flash: Phaser.GameObjects.Image;
  private readonly ring: Phaser.GameObjects.Image;
  private flashAge = Infinity;
  /** 固定ステップの世界（13mm の着弾で艇が沈み始めたかを読む。step で置くだけで確保しない） */
  private view: BargeHuntView | null = null;

  private readonly gunEvents: GunEvents = {
    onFire: (x, y) => {
      this.flash.setPosition(x, y).setAlpha(1).setVisible(true);
      this.flashAge = 0;
    },
    onHit: (i, group, x, y) => {
      this.splashes.splash(x, y, true);
      if (hitBarge(this.flotilla, this.p, i, this.g.groups[group]!.damage)) this.sink(i);
    },
    onMiss: (x, y) => this.splashes.splash(x, y, false),
  };

  private readonly flotillaEvents: FlotillaEvents = {
    onFire: () => {},
    onImpact: (x, y, hit) => {
      if (hit) {
        this.onBoatHit(this.p.gunHit, this.bargeRng, x, y, 'barge_fire');
        // この弾で沈み始めたら、同じステップに着く残りの弾は当たり（被弾数）に数えない
        if (this.view && this.view.boat.sinking) this.check.boatAfloat = false;
      } else this.splashes.splash(x, y, false);
    },
    onBeached: (i) => {
      this.sprites[i]!.setTint(BARGE_BEACHED_TINT).setAlpha(BARGE_BEACHED_ALPHA);
    },
  };

  constructor(
    private readonly scene: Phaser.Scene,
    readonly p: BargeParams,
    readonly g: GunBatteryParams,
    seed: number,
    private readonly boat: BoatState,
    boatHalfLengthM: number,
    boatHalfBeamM: number,
    /** 13mm・沿岸砲が艇に当たった（世界が boat-damage で適用。終了理由は barge_fire / shore_battery） */
    private readonly onBoatHit: (spec: HitSpec, rng: SeededRng, x: number, y: number, reason: 'barge_fire' | 'shore_battery') => void,
    /** 大発を撃破した（世界が命中スローと Scene の爆発・揺れ） */
    private readonly onSunk: (x: number, y: number) => void,
    shores: readonly ShoreBatteryParams[] = [],
    worldSplashes: SplashPool | null = null,
  ) {
    this.bargeRng = new SeededRng((seed + 6) >>> 0);
    this.gunRng = new SeededRng((seed + 7) >>> 0);
    if (worldSplashes) for (let i = 0; i < shores.length; i++) this.shores.push(new ShoreBattery(scene, shores[i]!, new SeededRng((seed + 8 + i) >>> 0), boat, boatHalfLengthM, boatHalfBeamM, worldSplashes, (spec, rng, x, y) => onBoatHit(spec, rng, x, y, 'shore_battery')));
    this.flotilla = createFlotilla(p, MG_SHELL_POOL_SIZE);
    this.battery = createGunBattery(g, GUN_SHELL_POOL_SIZE);
    this.check = { boat, boatHalfLengthM, boatHalfBeamM, detectOpenM: 0, smokeFactor: 1, smoke: null, smokeParams: null, flashM: 0, boatAfloat: true, dawn: false };
    this.splashes = new SplashPool(scene, GUN_SPLASH_POOL_SIZE, GUN_SPLASH_SCALE_MISS, GUN_SPLASH_SCALE_HIT);
    this.shown = new Uint8Array(p.count);
    for (const b of this.flotilla.barges) this.sprites.push(scene.add.image(b.x, b.y, TEXTURE_KEYS.barge).setScale(1 / RENDER_SCALE).setAngle(b.headingDeg).setDepth(DEPTH.destroyer).setVisible(false));
    this.gunTex = new Int8Array(GUN_SHELL_POOL_SIZE).fill(-1);
    for (let i = 0; i < GUN_SHELL_POOL_SIZE; i++) this.gunSprites.push(scene.add.image(0, 0, TEXTURE_KEYS.gunTracer).setScale(1 / RENDER_SCALE).setDepth(DEPTH.shell).setVisible(false));
    for (let i = 0; i < MG_SHELL_POOL_SIZE; i++) this.mgSprites.push(scene.add.image(0, 0, TEXTURE_KEYS.gunTracer).setScale(1 / RENDER_SCALE).setTint(MG_TRACER_TINT).setDepth(DEPTH.shell).setVisible(false));
    this.flash = scene.add.image(0, 0, TEXTURE_KEYS.explosionRing).setTint(GUN_TRACER_TINT).setScale(GUN_FLASH_SCALE / RENDER_SCALE).setDepth(DEPTH.effects).setVisible(false);
    this.ring = scene.add.image(0, 0, TEXTURE_KEYS.explosionRing).setTint(TARGET_RING_TINT).setAlpha(TARGET_RING_ALPHA).setScale(TARGET_RING_SCALE / RENDER_SCALE).setDepth(DEPTH.effects).setVisible(false);
  }

  /** 撃破のノルマに達した（任務の目標） */
  get quotaMet(): boolean {
    return this.flotilla.sunk >= this.p.quota;
  }

  /** 夜明けに岸へ隠れる（v0.6.2。hide の任務で夜明けのラッチの 1 回だけ）。次の固定ステップで、岸沿いを進む大発がすぐ岸へ逃げる（実機 1 回目で反応の遅れを外した。乱数は引かない） */
  withdraw(): void {
    if (this.check.dawn) return;
    this.check.dawn = true;
    this.beachedAtDawn = this.flotilla.beached;
  }

  /** 夜明けの後に岸へ隠れた（上陸した）隻数（夜明け前は 0。Result の夜明けの行） */
  get hiddenAfterDawn(): number {
    return this.check.dawn ? this.flotilla.beached - this.beachedAtDawn : 0;
  }

  /** 夜明けの後に岸へ逃げている隻数（夜明け前は 0。v0.6.2 実機 1 回目: 空襲の行の「大発 岸へ N 隻」） */
  get runningAfterDawn(): number {
    return this.check.dawn ? this.flotilla.running : 0;
  }

  /** 固定ステップ: 艇の砲（押している間）→ 大発（撃ったら閃光の距離で気づく）。held は射撃ボタン */
  step(dt: number, feelDt: number, w: BargeHuntView, held: boolean): void {
    this.view = w;
    const afloat = !w.boat.sinking;
    stepGunBattery(this.battery, this.g, this.boat, w.band, held, afloat, this.flotilla.barges, this.p.halfLengthM, this.p.halfBeamM, w.visRange2, this.gunRng, feelDt, dt, this.gunEvents);
    const c = this.check;
    c.detectOpenM = w.detectRangeM;
    c.smokeFactor = w.vis.smokeFactor;
    c.smoke = w.smoke;
    c.smokeParams = w.smokeParams;
    c.flashM = this.battery.fired ? this.g.flashRevealM : 0;
    c.boatAfloat = afloat;
    stepFlotilla(this.flotilla, this.p, c, this.bargeRng, feelDt, dt, this.flotillaEvents);
    // 沿岸砲（v0.4.3）は大発の後: 大発の気づきと、このステップの閃光を読む
    for (const sb of this.shores) sb.step(feelDt, dt, c.boatAfloat, w.detectRangeM, w.vis.smokeFactor, w.smoke, w.smokeParams, this.flotilla.anyDetected, c.flashM);
  }

  /** 沿岸砲のまとめ（HUD・Result。v0.4.5）: どれかの射界の中、どれかが撃ってくる、射界の中にいた体感秒の最大、砲撃・命中・被害の合計 */
  get shoreInArc(): boolean {
    for (const sb of this.shores) if (sb.state.inArc) return true;
    return false;
  }

  get shoreAlerted(): boolean {
    for (const sb of this.shores) if (sb.state.alerted) return true;
    return false;
  }

  get shoreInArcS(): number {
    let m = 0;
    for (const sb of this.shores) if (sb.state.inArcS > m) m = sb.state.inArcS;
    return m;
  }

  get shoreShots(): number {
    let n = 0;
    for (const sb of this.shores) n += sb.state.shots;
    return n;
  }

  get shoreHits(): number {
    let n = 0;
    for (const sb of this.shores) n += sb.state.hits;
    return n;
  }

  get shoreDamage(): number {
    let n = 0;
    for (const sb of this.shores) n += sb.state.hits * sb.p.hit.damage;
    return n;
  }

  private sink(i: number): void {
    const b = this.flotilla.barges[i]!;
    const d = Math.hypot(b.x - this.boat.x, b.y - this.boat.y);
    if (!(this.killMinM <= d)) this.killMinM = d;
    if (!(this.killMaxM >= d)) this.killMaxM = d;
    const img = this.sprites[i]!.setVisible(true);
    this.scene.tweens.add({ targets: img, scaleX: img.scaleX * SINK_SCALE_TO, scaleY: img.scaleY * SINK_SCALE_TO, alpha: 0, angle: img.angle + SINK_TILT_DEG, duration: SINK_DURATION_MS, ease: 'Sine.easeIn' });
    this.onSunk(b.x, b.y);
  }

  /** 毎フレーム: 大発（視程の内だけ表示）、弾、閃光、標的の輪、水柱（変わるものだけ触る） */
  updateVisuals(realDt: number, visRange2: number): void {
    const boat = this.boat;
    for (let i = 0; i < this.sprites.length; i++) {
      const b = this.flotilla.barges[i]!;
      if (b.phase === BARGE_SUNK) continue; // 沈み込みは tween に任せる
      const img = this.sprites[i]!;
      const show = (b.x - boat.x) * (b.x - boat.x) + (b.y - boat.y) * (b.y - boat.y) <= visRange2;
      if (show !== (this.shown[i] === 1)) {
        this.shown[i] = show ? 1 : 0;
        img.setVisible(show);
      }
      if (show) img.setPosition(b.x, b.y).setAngle(b.headingDeg);
    }
    syncShells(this.battery.shells, this.gunSprites, this.gunTex);
    syncShells(this.flotilla.shells, this.mgSprites, null);
    if (this.flashAge !== Infinity) {
      this.flashAge += realDt;
      if (this.flashAge >= GUN_FLASH_LIFETIME_S) {
        this.flashAge = Infinity;
        this.flash.setVisible(false);
      } else this.flash.setAlpha(1 - this.flashAge / GUN_FLASH_LIFETIME_S);
    }
    const t = this.battery.status === GUN_FIRING ? this.flotilla.barges[this.battery.target] : undefined;
    if (t) this.ring.setPosition(t.x, t.y);
    if (!!t !== this.ring.visible) this.ring.setVisible(!!t);
    this.splashes.updateVisuals(realDt);
    for (const sb of this.shores) sb.updateVisuals(realDt);
  }

  destroy(): void {
    for (const s of this.sprites) s.destroy();
    for (const s of this.gunSprites) s.destroy();
    for (const s of this.mgSprites) s.destroy();
    this.flash.destroy();
    this.ring.destroy();
    this.splashes.destroy();
    for (const sb of this.shores) sb.destroy();
  }
}

/** 弾のスプライトを状態に合わせる。tex があれば組 0（40mm・37mm）は点、他は曳光弾（組が変わったときだけ切り替える）。T-14 の 13mm（systems/pt-gun。v0.6.3 実機 1 回目）も使う */
export function syncShells(shells: ShellState[], sprites: Phaser.GameObjects.Image[], tex: Int8Array | null): void {
  for (let i = 0; i < shells.length; i++) {
    const s = shells[i]!;
    const img = sprites[i]!;
    if (!s.active) {
      if (img.visible) img.setVisible(false);
      continue;
    }
    if (tex && tex[i] !== s.gunIndex) {
      tex[i] = s.gunIndex;
      if (s.gunIndex === 0) img.setTexture(TEXTURE_KEYS.shell).setTint(GUN_HEAVY_TINT);
      else img.setTexture(TEXTURE_KEYS.gunTracer).setTint(GUN_TRACER_TINT);
    }
    if (!img.visible) img.setVisible(true);
    img.setPosition(s.x, s.y).setAngle(radToDeg(Math.atan2(s.vx, -s.vy)));
  }
}
