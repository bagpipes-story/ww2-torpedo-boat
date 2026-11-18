// 駆逐艦（v0.2.0: 巡航・雷跡回避・体当たり。docs/02 §6.4）。判断と操舵は core/ship-ai.ts、船体円は事前確保して座標だけ更新する（§7）。
// 夜明けに退く（v0.6.2）: ai.retiring の間は海域の縁で止めず、縁の外へ boundsMarginM より出たら withdrawn（スプライトを 1 回だけ隠す）。
// out（沈み始めたか退いた）は「もう狙えない・撃たない・見えない」、撃沈の数と任務の達成は sinking のまま（退いた艦は撃沈に数えない）。
// 列の通過（v0.8.0 S2。us_04。systems/destroyer-transit が段階を当てる）: offMap（まだ来ない・揚陸の地＝海域の外）も out に入れる（ほかの任務の艦はいつも false）。
// 列の艦（transitShip）は退く動きのまま縁の外へ出ても withdrawn を自分で立てない（縁の外 118 m で止まると段階の goneX 150 m に届かない）。去ったかは段階が決める（goAway）。
// 止まった艦（v0.8.1 S2。us_06。systems/destroyer-anchor が立てて下ろす）: anchored の間も見張り（updateShipAi＝発見・雷跡・seed+17 の引き方）は今のまま走り、舵・速さ・縁・当たりの円は作った時のまま。
// 列の見張り（v0.8.2 S2。us_05 の時雨。systems/column-roles だけが setAiParams を呼ぶ）: AI の値の物を列の AI ⇄ 見張りの AI に替える（どちらも setup で 1 回作った物。ほかの任務は作った時の物のまま）。
import Phaser from 'phaser';
import { DEPTH, TEXTURE_KEYS, artImageScale } from '../config/game-config';
import { SINK_DURATION_MS, SINK_SCALE_TO, SINK_TILT_DEG } from '../config/ui-config';
import { clampToBounds, clampYToBounds, type BoatState, type SeaBounds } from '../core/boat-motion';
import { beyondBounds } from '../core/dawn-withdraw';
import type { SeededRng } from '../core/rng';
import { createShipAiState, steerShip, turnRateFor, updateShipAi, type ShipAiMode, type ShipAiParams, type ShipAiState } from '../core/ship-ai';
import type { TorpedoState } from '../core/torpedo';
import { boatTouchesHull, createCircles, fillHullCircles, type Circle } from '../core/torpedo-solver';
import type { DestroyerSpec } from '../systems/world-setup';

export type { DestroyerSpec };

export class Destroyer {
  readonly sprite: Phaser.GameObjects.Image;
  readonly state: BoatState;
  /** 船体を近似する円の列（実寸 × ship_hit_scale。v0.4.8 から見た目（sprite_scale 倍）と同じ。docs/02 §6.10） */
  readonly circles: Circle[];
  readonly ai: ShipAiState;
  hitsTaken = 0;
  /** 沈没演出中または沈没済み。運動と当たり判定を止める */
  sinking = false;
  /** 沈没演出が終わった（sinking は演出中も true のまま。終了判定は「演出中」をこれで区別する） */
  sunk = false;
  /** 沈み始めたときの時計（世界の stepTimeS。沈んでいなければ NaN）。終わり際の当たりの窓（v0.6.2 実機 1 回目。core/torpedo-targets） */
  sinkStartS = NaN;
  /** 夜明けに退いて海域を出た（v0.6.2。スプライトは隠した。運動・当たり判定・反撃を止める。撃沈には数えない） */
  withdrawn = false;
  /** 列の通過の艦がまだ来ない・揚陸の地にいる（v0.8.0 S2。海域の外。隠す・動かない・当たらない・撃たない。退いた・撃沈のどちらにも数えない） */
  offMap = false;
  /** 列の通過の艦（v0.8.0 S2。systems/destroyer-transit が立てる）: 縁の外の退き終わり（withdrawn）は段階が決める */
  transitShip = false;
  /** 止まっている（v0.8.1 S2。us_06 の卯月と空知丸＝systems/destroyer-anchor が作った後に立て、動き出したら下ろす。ほかの任務の艦はいつも false） */
  anchored = false;
  private sighted = true;

  constructor(
    private readonly scene: Phaser.Scene,
    start: { x: number; y: number; headingDeg: number },
    readonly spec: DestroyerSpec,
    private aiParams: ShipAiParams,
    private readonly bounds: SeaBounds,
    /** 見張りが雷跡に気づく抽選（v0.5.0。seed+17。隊の艦が順に同じ系列を引く） */
    private readonly lookoutRng: SeededRng,
    textureKey: string = TEXTURE_KEYS.destroyer,
  ) {
    this.state = { x: start.x, y: start.y, headingDeg: start.headingDeg, speedMps: aiParams.cruiseSpeedMps };
    this.ai = createShipAiState(start.headingDeg, aiParams.cruiseSpeedMps);
    this.circles = createCircles(spec.hullCircles);
    this.sprite = scene.add.image(start.x, start.y, textureKey).setScale(artImageScale(textureKey)).setDepth(DEPTH.destroyer); // 絵の密度（v0.7.0 IP2b。2 の冪＝大きさはビット同一）
    this.refreshHull();
    this.syncSprite();
  }

  get mode(): ShipAiMode {
    return this.ai.mode;
  }

  /** もう狙えない（沈み始めたか、夜明けに退いて海域を出たか、列の通過で海域の外＝v0.8.0） */
  get out(): boolean {
    return this.sinking || this.withdrawn || this.offMap;
  }

  /**
   * 固定ステップ。dt は time_scale 込み、realDt は実時間（反応遅れ・警戒解除）。
   * playerDetectRangeM はこのステップで自艇を見つける距離（速力・月明・煙幕込み）。torpedoes は雷跡の発見に読むだけ。
   * 戻り値は「このステップで退き終えた（海域を出た）」（v0.6.2。最後の 1 隻なら隊の側が残りの一斉発射を捨てる）
   */
  step(dt: number, realDt: number, player: BoatState, playerDetectRangeM: number, detectHoldS: number, torpedoes: readonly TorpedoState[]): boolean {
    if (this.out) return false;
    updateShipAi(this.ai, this.state, player, playerDetectRangeM, detectHoldS, torpedoes, this.aiParams, this.bounds, realDt, this.lookoutRng);
    if (this.anchored) return false; // 止まっている間は AI の舵と速さを使わない（位置・針路・当たりの円は作った時のまま。v0.8.1 S2）
    steerShip(this.state, this.ai.desiredHeadingDeg, this.ai.desiredSpeedMps, turnRateFor(this.ai.mode, this.aiParams), this.aiParams.accelMps2, dt);
    if (!this.ai.retiring) clampToBounds(this.state, this.bounds, this.spec.boundsMarginM);
    else if (this.transitShip) clampYToBounds(this.state, this.bounds, this.spec.boundsMarginM); // 列の艦は南北の縁（陸）へ出さない（v0.8.0 実機 1 回目。東西は段階が決める）
    else if (beyondBounds(this.state.x, this.state.y, this.bounds, this.spec.boundsMarginM)) {
      this.withdrawn = true;
      this.sprite.setVisible(false);
      return true;
    }
    this.refreshHull();
    return false;
  }

  /** AI の値の物を替える（v0.8.2 S2。列の見張りが離れる・戻るステップに systems/column-roles が。確保しない・乱数なし。次の step から効く） */
  setAiParams(p: ShipAiParams): void {
    this.aiParams = p;
  }

  private refreshHull(): void {
    fillHullCircles(this.circles, this.state.x, this.state.y, this.state.headingDeg, this.spec.lengthM * this.spec.hitScale, this.spec.beamM * this.spec.hitScale);
  }

  /** 沈没演出中は tween が角度と拡縮を持つので触らない（退いた艦は隠したまま） */
  syncSprite(): void {
    if (this.out) return;
    this.sprite.setPosition(this.state.x, this.state.y);
    this.sprite.setAngle(this.state.headingDeg);
  }

  /** 自艇の視程内かどうかでスプライトを出し入れする（変わったときだけ setVisible。沈没演出中と退いた後は触らない） */
  setSighted(v: boolean): void {
    if (v === this.sighted || this.out) return;
    this.sighted = v;
    this.sprite.setVisible(v);
  }

  /** 艇（中心・方位・半長）が船体に触れているか（体当たり） */
  touchesBoat(boat: BoatState, boatHalfLengthM: number): boolean {
    return !this.out && boatTouchesHull(boat.x, boat.y, boat.headingDeg, boatHalfLengthM, this.circles);
  }

  /** 命中（有効弾）。沈没に達したら true */
  takeHit(): boolean {
    this.hitsTaken++;
    return this.hitsTaken >= this.spec.hitsToSink;
  }

  /** 沈没演出（図形: 縮みながら傾いて消える）。終わったら onDone。発生時に 1 回だけ tween を作る。nowS は沈み始めた時計（世界の stepTimeS） */
  playSinking(nowS: number, onDone: () => void): void {
    if (this.sinking) return;
    this.sinking = true;
    this.sinkStartS = nowS;
    this.state.speedMps = 0;
    if (!this.sighted) this.sprite.setVisible(true);
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: this.sprite.scaleX * SINK_SCALE_TO,
      scaleY: this.sprite.scaleY * SINK_SCALE_TO,
      alpha: 0,
      angle: this.sprite.angle + SINK_TILT_DEG,
      duration: SINK_DURATION_MS,
      ease: 'Sine.easeIn',
      onComplete: () => {
        this.sunk = true;
        onDone();
      },
    });
  }

  /**
   * 列の通過（v0.8.0 S2）: 海域の外へ（gone＝去った＝withdrawn・退いたに数える、ほか＝まだ来ない・揚陸の地＝offMap）。絵を隠し、見つけていた・雷跡を見ていた覚えを解く
   * （戻っても前の通過の発見を持ち越さない。体当たりの覚えは退く動きの間は使わない）。乱数は引かない
   */
  goAway(gone: boolean): void {
    if (gone) this.withdrawn = true;
    else this.offMap = true;
    this.sprite.setVisible(false);
    this.sighted = false;
    const ai = this.ai;
    ai.playerDetected = false;
    ai.detectHoldLeftS = 0;
    ai.wakeSpotted = false;
    ai.wakeSeenForS = -1;
  }

  /** 列の通過（v0.8.0 S2）: 道の現れる点へ置き直して海域の中へ（絵は視程の出し入れ＝mission-telemetry の setSighted が出す。退く向きは呼ぶ側の startRetire） */
  reappear(x: number, y: number, headingDeg: number, speedMps: number): void {
    const s = this.state;
    s.x = x;
    s.y = y;
    s.headingDeg = headingDeg;
    s.speedMps = speedMps;
    this.offMap = false;
    this.refreshHull();
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
