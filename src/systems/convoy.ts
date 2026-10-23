// 味方の大発の輸送隊の世界側（v0.6.4。jp_01「夜の輸送護衛」。docs/02 §6.4、spec §C.7・§E.2）: core/convoy を固定ステップで進め（自艇の後・米PT の前＝僚艇と同じ位置）、
// 味方色の大発（assets/barge-placeholder の tex-barge-friendly）とラベル「大発」を描く。浜の無い隊の上陸は灰色（敵の大発の上陸と同じ。視程の外では隠す）、沈没は駆逐艦と同じ tween と世界の onSunk（命中スロー＋爆発）。
// v0.6.4 実機 1 回目（「何もない海の真ん中で消えていく」）: 浜（ConvoyParams.beach）のある隊は、起動時に 1 回だけ浜の線に砂色の帯とラベル「上陸地点」を描き（core/convoy の convoyLandingMark。
// DEPTH.landingMark＝陸の塗りの上）、上陸した大発は少し暗い不透明の絵とラベル「上陸」（味方の青）で浜に残す（視程の外でも消さない。onArrived で 1 回だけ触り、以後 updateVisuals は飛ばす）。
// 米PT の掃射の命中は PtSquadron（systems/pt-target）が hit で伝える（着弾の水柱は PtSquadron の SplashPool）。大発が見つかる距離と米PT の標的の規則もここが持つ（PtTargets が読む）。
// §7: スプライト count 枚とラベル count 個を起動時に作り、毎フレームは視程の内の絵だけ位置・角度を触る（shown でトグル）。乱数は引かない（先頭の揺らぎは world-setup の applyConvoyNight）。
// v0.6.4 レビュー ux-5: 米PT の隊が狙っている大発のラベルを 2 行の「大発／狙われている」の警告色に（狙いが替わったときだけ setText。systems/pt-target の aimedBarge。1 行目は隣と同じ幅＝重ならない。config/convoy-config）。
import Phaser from 'phaser';
import { DEPTH, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import {
  CONVOY_BEACHED_ALPHA, CONVOY_BEACHED_LABEL, CONVOY_BEACHED_TINT, CONVOY_LANDING_MARK_LABEL, CONVOY_LANDING_MARK_LABEL_OFFSET_M, CONVOY_LANDING_MARK_PAD_M, CONVOY_LANDING_MARK_WIDTH,
  CONVOY_MARKER_LABEL, CONVOY_TARGET_LABEL,
} from '../config/convoy-config';
import { BARGE_BEACHED_ALPHA, BARGE_BEACHED_TINT, COAST_LABEL_FONT_PX, COAST_MARKER_COLOR, COAST_MARKER_TEXT_COLOR } from '../config/hunt-config';
import { ESCORT_LABEL_FONT_PX, ESCORT_LABEL_OFFSET_M, ESCORT_TEXT_COLOR, HUD_COLOR_WARN, SINK_DURATION_MS, SINK_SCALE_TO, SINK_TILT_DEG, hudTextStyle } from '../config/ui-config';
import type { BoatState } from '../core/boat-motion';
import { CV_ARRIVED, CV_SAILING, CV_SUNK, convoyLandingMark, convoyResolved, createConvoy, hitConvoyBarge, stepConvoy, type ConvoyEvents, type ConvoyParams, type ConvoyState } from '../core/convoy';
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
  /** ラベルを「狙われている」にしている大発（−1 は無し） */
  private marked = -1;
  /** 浜（ConvoyParams.beach）のある隊の上陸地点の印（起動時に 1 回描く。無ければ null） */
  private readonly mark: Phaser.GameObjects.Graphics | null = null;
  private readonly markLabel: Phaser.GameObjects.Text | null = null;

  private readonly events: ConvoyEvents = {
    onArrived: (i) => {
      const b = this.state.barges[i]!;
      if (this.p.beach) {
        // 浜に着いた大発は浜に残す（v0.6.4 実機 1 回目。前の灰色 0.6 は「消えていく」と読めた）: 視程に関わらず出したまま・少し暗い不透明・ラベル「上陸」は陸の上（以後は触らない。updateVisuals も飛ばす）
        this.shown[i] = 1;
        this.sprites[i]!.setVisible(true).setPosition(b.x, b.y).setAngle(b.headingDeg).setTint(CONVOY_BEACHED_TINT).setAlpha(CONVOY_BEACHED_ALPHA);
        this.labels[i]!.setVisible(true).setPosition(b.x, b.y + ESCORT_LABEL_OFFSET_M).setText(CONVOY_BEACHED_LABEL).setColor(ESCORT_TEXT_COLOR);
        if (this.marked === i) this.marked = -1;
        return;
      }
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
    if (this.p.beach) {
      // 上陸地点の印: 浜の線の上の砂色の帯と、陸の側のラベル「上陸地点」（1 回だけ記録。毎フレーム触らない。Scene の終わりに destroy）
      const mk = convoyLandingMark(this.p.beach, CONVOY_LANDING_MARK_PAD_M, CONVOY_LANDING_MARK_LABEL_OFFSET_M);
      this.mark = scene.add.graphics().setDepth(DEPTH.landingMark);
      this.mark.lineStyle(CONVOY_LANDING_MARK_WIDTH, COAST_MARKER_COLOR, 1).lineBetween(mk.x0, mk.y, mk.x1, mk.y);
      this.markLabel = scene.add.text(mk.labelX, mk.labelY, CONVOY_LANDING_MARK_LABEL, hudTextStyle(COAST_LABEL_FONT_PX, COAST_MARKER_TEXT_COLOR)).setOrigin(0.5, 0).setDepth(DEPTH.landingMark);
    }
    for (const b of this.state.barges) {
      this.sprites.push(scene.add.image(b.x, b.y, TEXTURE_KEYS.bargeFriendly).setScale(1 / RENDER_SCALE).setAngle(b.headingDeg).setDepth(DEPTH.destroyer).setVisible(false));
      // 中央揃え: 狙われている大発の 2 行のラベル（CONVOY_TARGET_LABEL）の 1 行目「大発」を絵の真下に置く（1 行のラベルには効かない）
      this.labels.push(scene.add.text(b.x, b.y + ESCORT_LABEL_OFFSET_M, CONVOY_MARKER_LABEL, hudTextStyle(ESCORT_LABEL_FONT_PX, ESCORT_TEXT_COLOR)).setOrigin(0.5, 0).setAlign('center').setDepth(DEPTH.destroyer).setVisible(false));
    }
  }

  /** 固定ステップ（自艇を動かした後・米PT の前。dt は time_scale 込み）: 針路のまま進み、浜の線に着いたら上陸（浜の無い隊は上陸線を越えたら） */
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

  /**
   * 毎フレーム: 視程の内の大発だけ表示して位置・角度を直す（沈み込みは tween に任せる。上陸した大発は止まっているので位置は変わらないが絵は出す。浜に上陸した大発は触らない）。
   * aimed は米PT の隊が狙っている航行中の大発（PtTargets.aimedBarge。無ければ −1）: 替わったときだけ前のラベルを戻し、新しいラベルを警告色の 2 行「大発／狙われている」に（CONVOY_TARGET_LABEL）
   */
  updateVisuals(player: BoatState, visRange2: number, aimed: number): void {
    if (aimed !== this.marked) {
      if (this.marked >= 0) this.labels[this.marked]!.setText(this.state.barges[this.marked]!.phase === CV_ARRIVED && this.p.beach ? CONVOY_BEACHED_LABEL : CONVOY_MARKER_LABEL).setColor(ESCORT_TEXT_COLOR);
      if (aimed >= 0) this.labels[aimed]!.setText(CONVOY_TARGET_LABEL).setColor(HUD_COLOR_WARN);
      this.marked = aimed;
    }
    for (let i = 0; i < this.sprites.length; i++) {
      const b = this.state.barges[i]!;
      if (b.phase === CV_SUNK || (b.phase === CV_ARRIVED && this.p.beach)) continue;
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
    this.mark?.destroy();
    this.markLabel?.destroy();
  }
}
