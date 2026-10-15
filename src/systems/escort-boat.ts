// 僚艇の世界側（docs/02 §6.4、v0.4.4）: core/escort を固定ステップで進め、自艇と同じ船形（薄い青）とラベル「僚艇」を描く。被弾は世界の SplashPool と Scene の演出、沈没は駆逐艦と同じ tween。
// §7: スプライト 1 枚とラベル 1 つを起動時に作り、毎フレームは位置と角度だけ。沈没の tween は発生時に 1 回。
import Phaser from 'phaser';
import { DEPTH, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { ESCORT_LABEL, ESCORT_LABEL_FONT_PX, ESCORT_LABEL_OFFSET_M, ESCORT_TEXT_COLOR, ESCORT_TINT, SINK_DURATION_MS, SINK_SCALE_TO, SINK_TILT_DEG, hudTextStyle } from '../config/ui-config';
import type { BoatState, SeaBounds } from '../core/boat-motion';
import { createEscort, hitEscort, stepEscort, type EscortParams, type EscortState } from '../core/escort';

export class EscortBoat {
  readonly state: EscortState;
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly p: EscortParams,
    player: BoatState,
    private readonly bounds: SeaBounds,
  ) {
    this.state = createEscort(p, player);
    const b = this.state.boat;
    this.sprite = scene.add.image(b.x, b.y, TEXTURE_KEYS.playerBoat).setTint(ESCORT_TINT).setScale(1 / RENDER_SCALE).setDepth(DEPTH.playerBoat);
    this.label = scene.add.text(b.x, b.y + ESCORT_LABEL_OFFSET_M, ESCORT_LABEL, hudTextStyle(ESCORT_LABEL_FONT_PX, ESCORT_TEXT_COLOR)).setOrigin(0.5, 0).setDepth(DEPTH.playerBoat);
    this.syncSprite();
  }

  /** 固定ステップ（自艇を動かした後）。dt は time_scale 込み */
  step(dt: number, player: BoatState, playerAfloat: boolean): void {
    stepEscort(this.state, this.p, player, playerAfloat, this.bounds, dt);
  }

  /** 砲弾の命中（世界が呼ぶ）。沈んだ（この弾で HP 0）なら true。沈没演出は縮みながら傾いて消える */
  hit(damage: number, nowS: number): boolean {
    if (!hitEscort(this.state, damage, nowS)) return false;
    this.scene.tweens.add({
      targets: [this.sprite, this.label],
      scaleX: this.sprite.scaleX * SINK_SCALE_TO,
      scaleY: this.sprite.scaleY * SINK_SCALE_TO,
      alpha: 0,
      angle: this.sprite.angle + SINK_TILT_DEG,
      duration: SINK_DURATION_MS,
      ease: 'Sine.easeIn',
    });
    return true;
  }

  /** 毎フレーム（沈没演出中は tween に任せる） */
  syncSprite(): void {
    if (this.state.sunk) return;
    const b = this.state.boat;
    this.sprite.setPosition(b.x, b.y).setAngle(b.headingDeg);
    this.label.setPosition(b.x, b.y + ESCORT_LABEL_OFFSET_M);
  }

  destroy(): void {
    this.sprite.destroy();
    this.label.destroy();
  }
}
