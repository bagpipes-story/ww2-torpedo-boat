// 味方の大発の輸送隊の世界側（v0.6.4。jp_01「夜の輸送護衛」。docs/02 §6.4、spec §C.7・§E.2）: core/convoy を固定ステップで進め（自艇の後・米PT の前＝僚艇と同じ位置）、
// 味方色の大発（assets/barge-placeholder の tex-barge-friendly）とラベル「大発」を描く。上陸は灰色（敵の大発の上陸と同じ）、沈没は駆逐艦と同じ tween と世界の onSunk（命中スロー＋爆発）。
// 米PT の掃射の命中は PtSquadron（systems/pt-target）が hit で伝える（着弾の水柱は PtSquadron の SplashPool）。大発が見つかる距離と米PT の標的の規則もここが持つ（PtTargets が読む）。
// §7: スプライト count 枚とラベル count 個を起動時に作り、毎フレームは視程の内の絵だけ位置・角度を触る（shown でトグル）。乱数は引かない（先頭の揺らぎは world-setup の applyConvoyNight）。
import Phaser from 'phaser';
import { DEPTH, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { CONVOY_MARKER_LABEL } from '../config/convoy-config';
import { BARGE_BEACHED_ALPHA, BARGE_BEACHED_TINT } from '../config/hunt-config';
import { ESCORT_LABEL_FONT_PX, ESCORT_LABEL_OFFSET_M, ESCORT_TEXT_COLOR, SINK_DURATION_MS, SINK_SCALE_TO, SINK_TILT_DEG, hudTextStyle } from '../config/ui-config';
import type { BoatState } from '../core/boat-motion';
import { CV_SAILING, CV_SUNK, convoyResolved, createConvoy, hitConvoyBarge, stepConvoy, type ConvoyEvents, type ConvoyParams, type ConvoyState } from '../core/convoy';
import type { ConvoySetup } from '../core/convoy-data';
import type { PtTargetRule } from '../core/pt-target';
import { enemyDetectRangeM, speedFactorForBand, type VisibilityParams } from '../core/visibility';

export class Convoy {
  readonly state: ConvoyState;
  readonly p: ConvoyParams;
  /** 米PT の標的の規則（keep・ロック・閃光の記憶）と、大発が見つかる距離 m（detect_band の帯。月明込み。出撃時に 1 回） */
  readonly rule: PtTargetRule;
  readonly detectM: number;
  private readonly sprites: Phaser.GameObjects.Image[] = [];
  private readonly labels: Phaser.GameObjects.Text[] = [];
  private readonly shown: Uint8Array;

  private readonly events: ConvoyEvents = {
    onArrived: (i) => {
      const b = this.state.barges[i]!;
      this.sprites[i]!.setPosition(b.x, b.y).setAngle(b.headingDeg).setTint(BARGE_BEACHED_TINT).setAlpha(BARGE_BEACHED_ALPHA); // 止まった位置で灰色（以後は動かさない）
      this.labels[i]!.setPosition(b.x, b.y + ESCORT_LABEL_OFFSET_M);
    },
    onSunk: (i) => {
      const b = this.state.barges[i]!;
      this.show(i, true);
      const img = this.sprites[i]!;
      this.scene.tweens.add({ targets: [img, this.labels[i]!], scaleX: img.scaleX * SINK_SCALE_TO, scaleY: img.scaleY * SINK_SCALE_TO, alpha: 0, angle: img.angle + SINK_TILT_DEG, duration: SINK_DURATION_MS, ease: 'Sine.easeIn' });
      this.onSunk(b.x, b.y);
    },
  };

  constructor(
    private readonly scene: Phaser.Scene,
    setup: ConvoySetup,
    /** 米PT が見つける基準の距離（pt_boats の base_detect_m）と月明・速力帯の値（大発の帯の発見距離に） */
    ptBaseDetectM: number,
    vis: VisibilityParams,
    /** 大発が沈んだ（世界が命中スローと Scene の爆発。大発の撃破と同じ） */
    private readonly onSunk: (x: number, y: number) => void,
  ) {
    this.p = setup.params;
    this.rule = setup.rule;
    this.detectM = enemyDetectRangeM(ptBaseDetectM, speedFactorForBand(setup.detectBand, vis.speedFactor), vis, false);
    this.state = createConvoy(this.p);
    this.shown = new Uint8Array(this.p.count);
    for (const b of this.state.barges) {
      this.sprites.push(scene.add.image(b.x, b.y, TEXTURE_KEYS.bargeFriendly).setScale(1 / RENDER_SCALE).setAngle(b.headingDeg).setDepth(DEPTH.destroyer).setVisible(false));
      this.labels.push(scene.add.text(b.x, b.y + ESCORT_LABEL_OFFSET_M, CONVOY_MARKER_LABEL, hudTextStyle(ESCORT_LABEL_FONT_PX, ESCORT_TEXT_COLOR)).setOrigin(0.5, 0).setDepth(DEPTH.destroyer).setVisible(false));
    }
  }

  /** 固定ステップ（自艇を動かした後・米PT の前。dt は time_scale 込み）: 針路のまま進み、上陸線を越えたら上陸 */
  step(dt: number): void {
    stepConvoy(this.state, this.p, dt, this.events);
  }

  /** 掃射の 1 命中（PtTargets が呼ぶ。damage は PT の砲の damage）。沈んだら true。航行中でなければ当たらない */
  hit(i: number, damage: number, nowS: number): boolean {
    return hitConvoyBarge(this.state, i, damage, nowS, this.events);
  }

  /** 決着（みな上陸か沈没）。「大発 上陸 k/n ・ 帰投せよ」の呼びかけ */
  get resolved(): boolean {
    return convoyResolved(this.state);
  }

  /** 毎フレーム: 視程の内の大発だけ表示して位置・角度を直す（沈み込みは tween に任せる。上陸した大発は止まっているので位置は変わらないが絵は出す） */
  updateVisuals(player: BoatState, visRange2: number): void {
    for (let i = 0; i < this.sprites.length; i++) {
      const b = this.state.barges[i]!;
      if (b.phase === CV_SUNK) continue;
      const show = (b.x - player.x) * (b.x - player.x) + (b.y - player.y) * (b.y - player.y) <= visRange2;
      if (show !== (this.shown[i] === 1)) this.show(i, show);
      if (show && b.phase === CV_SAILING) {
        this.sprites[i]!.setPosition(b.x, b.y).setAngle(b.headingDeg);
        this.labels[i]!.setPosition(b.x, b.y + ESCORT_LABEL_OFFSET_M);
      }
    }
  }

  private show(i: number, on: boolean): void {
    this.shown[i] = on ? 1 : 0;
    const b = this.state.barges[i]!;
    this.sprites[i]!.setVisible(on).setPosition(b.x, b.y).setAngle(b.headingDeg);
    this.labels[i]!.setVisible(on).setPosition(b.x, b.y + ESCORT_LABEL_OFFSET_M);
  }

  destroy(): void {
    for (const s of this.sprites) s.destroy();
    for (const l of this.labels) l.destroy();
  }
}
