// 暴風の帯（docs/02 §6.8、v0.3.4）の世界側: 帯を進め、中なら旋回率を下げ、速すぎれば波の叩きつけ（HP）を世界に適用し、帯・前線・ラベル・雨筋・艇の横揺れを描く。
// 判断は core/storm.ts。§7: 帯と前線は既存の白い矩形テクスチャを伸ばす、雨筋は起動時に 40 本作って表示中だけ動かす、水しぶきは EnemyFire のプールを借りる、tween 無し。
import Phaser from 'phaser';
import { DEPTH, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import {
  STORM_BAND_ALPHA,
  STORM_BAND_COLOR,
  STORM_FRONT_ALPHA,
  STORM_FRONT_COLOR,
  STORM_FRONT_WIDTH_M,
  STORM_LABEL_FONT_PX,
  STORM_LABEL_OFFSET_M,
  STORM_RAIN_ALPHA,
  STORM_RAIN_POOL_SIZE,
  STORM_RAIN_VX_MPS,
  STORM_RAIN_VY_MPS,
  STORM_ROLL_DEG,
  STORM_ROLL_HZ,
  STORM_SLAM_BOW_M,
  STORM_SLAM_SIDE_M,
  STORM_TEXT_COLOR,
  hudTextStyle,
} from '../config/ui-config';
import type { BoatParams, BoatState } from '../core/boat-motion';
import type { DamageState } from '../core/gunnery';
import { SeededRng } from '../core/rng';
import { STORM_NONE, createStormState, stepStorm, stormTurnRate, updateStormStatus, type StormParams, type StormState, type StormStatus } from '../core/storm';
import { degToRad, radToDeg } from '../core/units';

export class StormFront {
  readonly state: StormState;
  /** HUD 用の状態（毎フレーム更新。生成時にも 1 回計算してフレーム 0 から正しい） */
  readonly status: StormStatus = { state: STORM_NONE, gapM: 0, north: true, fast: false };
  /** 艇の横揺れ（度）。中にいる間だけ */
  rollDeg = 0;
  private readonly band: Phaser.GameObjects.Image;
  private readonly front: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private readonly rain: Phaser.GameObjects.Image[] = [];
  private readonly rainOx = new Float32Array(STORM_RAIN_POOL_SIZE);
  private readonly rainOy = new Float32Array(STORM_RAIN_POOL_SIZE);
  private readonly rainShown = new Uint8Array(STORM_RAIN_POOL_SIZE);
  private readonly turnBaseDegS: number;
  private t = 0;
  private gone = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly p: StormParams,
    seed: number,
    debugStartY: number,
    turnBaseDegS: number,
    boat: BoatState,
    private readonly splash: (x: number, y: number, hit: boolean) => void,
    private readonly onSlam: (x: number, y: number) => void,
  ) {
    this.turnBaseDegS = turnBaseDegS;
    // 始まりの位置は別系列の乱数（seed+3）を 1 回だけ引く。?debug&storm=Y なら固定
    this.state = createStormState(p, new SeededRng((seed + 3) >>> 0).next());
    if (Number.isFinite(debugStartY)) this.state.southY = debugStartY;
    updateStormStatus(this.status, this.state, p, boat.y, boat.headingDeg, boat.speedMps);
    this.band = scene.add.image(0, this.state.southY, TEXTURE_KEYS.hpBarFill).setOrigin(0, 1).setDisplaySize(p.boundsWidth, p.depthM).setTint(STORM_BAND_COLOR).setAlpha(STORM_BAND_ALPHA).setDepth(DEPTH.storm);
    this.front = scene.add.image(0, this.state.southY, TEXTURE_KEYS.hpBarFill).setOrigin(0, 0.5).setDisplaySize(p.boundsWidth, STORM_FRONT_WIDTH_M).setTint(STORM_FRONT_COLOR).setAlpha(STORM_FRONT_ALPHA).setDepth(DEPTH.storm);
    this.label = scene.add.text(0, this.state.southY - STORM_LABEL_OFFSET_M, '暴風', hudTextStyle(STORM_LABEL_FONT_PX, STORM_TEXT_COLOR)).setOrigin(0.5, 1).setAlpha(STORM_FRONT_ALPHA).setDepth(DEPTH.storm);
    const angle = radToDeg(Math.atan2(-STORM_RAIN_VX_MPS, STORM_RAIN_VY_MPS));
    for (let i = 0; i < STORM_RAIN_POOL_SIZE; i++) {
      // 決定的な初期位置（黄金比の小数部）。乱数は使わない
      this.rainOx[i] = (i * 0.618034) % 1;
      this.rainOy[i] = (i * 0.7548777) % 1;
      this.rain.push(scene.add.image(0, 0, TEXTURE_KEYS.rainStreak).setScale(1 / RENDER_SCALE).setAngle(angle).setAlpha(STORM_RAIN_ALPHA).setDepth(DEPTH.rain).setVisible(false));
    }
  }

  /**
   * 固定ステップ（feelDt は体感の実秒）。帯を進め、中なら旋回率を下げ、叩きつけがあれば HP を減らして水しぶきと揺れ。HP 0 なら true（世界が沈没にする）。
   * 判定は艇を動かす前の位置（切り替わりは 1 ステップ遅れる）
   */
  step(feelDt: number, boat: BoatState, ship: BoatState, shipAlive: boolean, params: BoatParams, damage: DamageState, sinking: boolean): boolean {
    const n = stepStorm(this.state, this.p, boat.y, boat.speedMps, ship.y, shipAlive, feelDt, !sinking);
    params.turnRateDegS = stormTurnRate(this.p, this.turnBaseDegS, this.state.inside);
    if (n <= 0) return false;
    damage.hp = Math.max(0, damage.hp - n * this.p.slamDamage);
    // 艇首の左右に水しぶき（叩かれたときだけ sin/cos を計算する）
    const h = degToRad(boat.headingDeg);
    const bx = boat.x + Math.sin(h) * STORM_SLAM_BOW_M;
    const by = boat.y - Math.cos(h) * STORM_SLAM_BOW_M;
    const sx = Math.cos(h) * STORM_SLAM_SIDE_M;
    const sy = Math.sin(h) * STORM_SLAM_SIDE_M;
    this.splash(bx + sx, by + sy, false);
    this.splash(bx - sx, by - sy, false);
    this.onSlam(boat.x, boat.y);
    return damage.hp <= 0;
  }

  /** 雨の係数（艦と艇を結ぶ線が帯にかかる間だけ） */
  get detectFactor(): number {
    return this.state.los ? this.p.detectFactor : 1;
  }

  get visFactor2(): number {
    return this.state.los ? this.p.visFactor * this.p.visFactor : 1;
  }

  /** 毎フレーム: HUD の状態、帯・前線・ラベルの位置、雨筋（画面内を流れ、帯の中だけ表示）、横揺れ。transform と visible だけ触る */
  updateVisuals(realDt: number, boat: BoatState): void {
    const s = this.state;
    const p = this.p;
    updateStormStatus(this.status, s, p, boat.y, boat.headingDeg, boat.speedMps);
    this.t += realDt;
    this.rollDeg = s.inside ? STORM_ROLL_DEG * Math.sin(2 * Math.PI * STORM_ROLL_HZ * this.t) : 0;
    const north = s.southY - p.depthM;
    if (north > p.boundsHeight) {
      if (!this.gone) {
        this.gone = true;
        this.band.setVisible(false);
        this.front.setVisible(false);
        this.label.setVisible(false);
        for (let i = 0; i < STORM_RAIN_POOL_SIZE; i++) if (this.rainShown[i]) this.rain[i]!.setVisible(false);
      }
      return;
    }
    const view = this.scene.cameras.main.worldView;
    this.band.setY(s.southY);
    this.front.setY(s.southY);
    this.label.setPosition(view.centerX, s.southY - STORM_LABEL_OFFSET_M);
    const vw = view.width;
    const vh = view.height;
    for (let i = 0; i < STORM_RAIN_POOL_SIZE; i++) {
      const x = view.x + (((this.rainOx[i]! * vw + STORM_RAIN_VX_MPS * this.t) % vw) + vw) % vw;
      const y = view.y + (((this.rainOy[i]! * vh + STORM_RAIN_VY_MPS * this.t) % vh) + vh) % vh;
      const show = y >= north && y <= s.southY;
      const img = this.rain[i]!;
      if (show !== (this.rainShown[i] === 1)) {
        this.rainShown[i] = show ? 1 : 0;
        img.setVisible(show);
      }
      if (show) img.setPosition(x, y);
    }
  }

  destroy(): void {
    this.band.destroy();
    this.front.destroy();
    this.label.destroy();
    for (const r of this.rain) r.destroy();
  }
}
