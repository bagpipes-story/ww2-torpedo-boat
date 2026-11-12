// 味方の輸送船（v0.6.9 S5a。jp_04「多号作戦・オルモック湾へ」。docs/02 §6.11、spec-v069 §5.4・D3・D13）: 泊地に停泊して揚陸する輸送船の絵（assets/ally-ship-placeholder の
// tex-transport-friendly。いつも見える）・ラベル「輸送船」・その上の状態の行（ui/ally-ship-view の鍵が変わったときだけ setText。R14 A6: 字は船体の上＝北。浜は南）・浜の揚陸地点の帯とラベル（起動時に 1 回描く。
// jp_01 の上陸地点の印と同じ形: CONVOY_LANDING_MARK_*・DEPTH.landingMark）・沈む tween（沈み始めた 1 回だけ。駆逐艦・大発と同じ）。状態は core/landing の LandingState を読むだけ。
// 船は動かない: 絵・ラベルの位置と向きは起動時に 1 回だけ。§7: 毎フレームは鍵を比べるだけ（変わったときだけ setText・setColor）。
// S6b: 字が HUD（上の帯・右端の技能・一時停止・スティック・速力・兵装）に重なれば船体の下へ、下も重なれば出さない（ui/ally-ship-view の allyShipTextPlace。本当のカメラの worldView で
// 毎フレーム箱を写して比べるだけ。置き場所が変わったときだけ setOrigin・setPosition・setVisible）。
// S8 のレビュー game-4: 浜の「揚陸地点」の字も HUD の矩形に重なれば出さない（ui/ally-ship-view の allyMarkLabelShown。変わったときだけ setVisible）。
import Phaser from 'phaser';
import { CONVOY_LANDING_MARK_LABEL_OFFSET_M, CONVOY_LANDING_MARK_WIDTH } from '../config/convoy-config';
import { DEPTH, RENDER_SCALE, TEXTURE_KEYS, artImageScale } from '../config/game-config';
import { COAST_LABEL_FONT_PX, COAST_MARKER_COLOR, COAST_MARKER_TEXT_COLOR } from '../config/hunt-config';
import { LANDING_MARK_HALF_M, LANDING_STATUS_DY_M, LANDING_STATUS_FONT_PX, LANDING_SUNK_TEXT_COLOR, LANDING_TEXT_HYST_PX } from '../config/landing-config';
import { ESCORT_LABEL_FONT_PX, ESCORT_LABEL_OFFSET_M, ESCORT_TEXT_COLOR, HUD_COLOR_WARN, SINK_DURATION_MS, SINK_SCALE_TO, SINK_TILT_DEG, hudTextStyle } from '../config/ui-config';
import type { SeaBounds } from '../core/boat-motion';
import type { LandingState, LandingWakes } from '../core/landing';
import type { LandingParams } from '../core/landing-data';
import { degToRad } from '../core/units';
import {
  SHIP_TEXT_ABOVE, SHIP_TEXT_BELOW, SHIP_TEXT_HIDDEN, SHIP_TONE_SUNK, SHIP_TONE_WARN, allyMarkLabelShown, allyShipLabelYs, allyShipLabelYsBelow, allyShipStatusKey, allyShipStatusText, allyShipStatusTone, allyShipTextPlace, landingMarkX,
} from '../ui/ally-ship-view';
import type { ScreenRect } from '../ui/landing-markers';

export class AllyShip {
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private readonly status: Phaser.GameObjects.Text;
  private readonly mark: Phaser.GameObjects.Graphics;
  private readonly markLabel: Phaser.GameObjects.Text;
  /** 状態の行の今の鍵（−1 は未設定） */
  private statusKey = -1;
  private sinkStarted = false;
  /** 字の置き場所（SHIP_TEXT_*）と、上・下に置くときのラベル・状態の行の y（上は下端、下は上端。組み立てで 1 回） */
  private place: number = SHIP_TEXT_ABOVE;
  private readonly x: number;
  private readonly above: { labelY: number; statusY: number };
  private readonly below: { labelY: number; statusY: number };
  /** 状態の行と「輸送船」の幅の大きい方の半分（文が変わったときだけ測る） */
  private halfW = 0;
  /** 「揚陸地点」の字が出ている・字の右上の点（ワールド。動かない） */
  private markShown = true;
  private readonly markRight: number;
  private readonly markTop: number;

  constructor(
    private readonly scene: Phaser.Scene,
    p: LandingParams,
    bounds: SeaBounds,
    /** 字が重なってはいけない HUD の矩形（論理 px。ui/landing-markers の landingHudRects） */
    private readonly hud: readonly ScreenRect[],
  ) {
    this.sprite = scene.add.image(p.x, p.y, TEXTURE_KEYS.transportFriendly).setScale(artImageScale(TEXTURE_KEYS.transportFriendly)).setAngle(p.headingDeg).setDepth(DEPTH.destroyer);
    // ラベルは回った絵の外接の箱の上、状態の行はその上（艇首の向きで決まる。動かないので 1 回だけ。R14 A6: 泊地は南の縁から 240 m で、カメラは北の自艇を追うので、
    // 下に置いた字は画面の外か右下の兵装・速力の HUD の下に入った）
    const h = degToRad(p.headingDeg);
    const halfY = (this.sprite.displayHeight / 2) * Math.abs(Math.cos(h)) + (this.sprite.displayWidth / 2) * Math.abs(Math.sin(h));
    const ys = allyShipLabelYs(p.y, halfY, ESCORT_LABEL_OFFSET_M, LANDING_STATUS_DY_M);
    this.x = p.x;
    this.above = ys;
    this.below = allyShipLabelYsBelow(p.y, halfY, ESCORT_LABEL_OFFSET_M, LANDING_STATUS_DY_M);
    this.label = scene.add.text(p.x, ys.labelY, p.labelJa, hudTextStyle(ESCORT_LABEL_FONT_PX, ESCORT_TEXT_COLOR)).setOrigin(0.5, 1).setDepth(DEPTH.destroyer);
    this.status = scene.add.text(p.x, ys.statusY, '', hudTextStyle(LANDING_STATUS_FONT_PX, ESCORT_TEXT_COLOR)).setOrigin(0.5, 1).setDepth(DEPTH.destroyer);
    // 揚陸地点: 艇首の先が浜の線（海域の南の縁）に届く点を中心に砂色の帯、陸の側にラベル（jp_01 の「上陸地点」と同じ帯の太さ・字・下げ）。ラベルは帯の西の端の外に右揃え
    // （jp_04 の出発点と帰投の輪は西＝画面の真ん中の側。帯の真ん中の下だと出発の画面で右下の兵装のボタンの下に入った。jp_01 のレビュー ux-4 と同じ考え）
    const shoreY = bounds.height;
    const mx = landingMarkX(p, shoreY, bounds.width);
    this.mark = scene.add.graphics().setDepth(DEPTH.landingMark);
    this.mark.lineStyle(CONVOY_LANDING_MARK_WIDTH, COAST_MARKER_COLOR, 1).lineBetween(mx - LANDING_MARK_HALF_M, shoreY, mx + LANDING_MARK_HALF_M, shoreY);
    this.markRight = mx - LANDING_MARK_HALF_M;
    this.markTop = shoreY + CONVOY_LANDING_MARK_LABEL_OFFSET_M;
    this.markLabel = scene.add.text(this.markRight, this.markTop, p.markLabelJa, hudTextStyle(COAST_LABEL_FONT_PX, COAST_MARKER_TEXT_COLOR)).setOrigin(1, 0).setDepth(DEPTH.landingMark);
  }

  /** 毎フレーム: 状態の行の鍵が変わったときだけ文と色を書く（wakes はこのフレームの走っている雷跡。core/landing の landingWakes） */
  update(st: LandingState, wakes: LandingWakes): void {
    const key = allyShipStatusKey(st, wakes);
    if (key !== this.statusKey) {
      this.statusKey = key;
      const tone = allyShipStatusTone(key);
      this.status.setText(allyShipStatusText(key)).setColor(tone === SHIP_TONE_WARN ? HUD_COLOR_WARN : tone === SHIP_TONE_SUNK ? LANDING_SUNK_TEXT_COLOR : ESCORT_TEXT_COLOR);
      this.halfW = Math.max(this.label.width, this.status.width) / 2;
    }
    this.placeText();
  }

  /** 毎フレーム: 上・下の字と「揚陸地点」の字の箱を本当のカメラで論理画面へ写し、置き場所・出す出さないが変わったときだけ字を動かす（最初の描画の前＝worldView が空なら何もしない） */
  private placeText(): void {
    const cam = this.scene.cameras.main;
    const v = cam.worldView;
    if (v.width <= 0) return;
    const z = cam.zoom / RENDER_SCALE;
    const mr = (this.markRight - v.x) * z;
    const mt = (this.markTop - v.y) * z;
    const mark = allyMarkLabelShown(this.markShown, mr - this.markLabel.width * z, mt, mr, mt + this.markLabel.height * z, this.hud, LANDING_TEXT_HYST_PX);
    if (mark !== this.markShown) {
      this.markShown = mark;
      this.markLabel.setVisible(mark);
    }
    const sh = this.status.height;
    const at = allyShipTextPlace(
      this.place, (this.x - this.halfW - v.x) * z, (this.x + this.halfW - v.x) * z,
      (this.above.statusY - sh - v.y) * z, (this.above.labelY - v.y) * z, (this.below.labelY - v.y) * z, (this.below.statusY + sh - v.y) * z, this.hud, LANDING_TEXT_HYST_PX,
    );
    if (at === this.place) return;
    this.place = at;
    const shown = at !== SHIP_TEXT_HIDDEN;
    this.label.setVisible(shown);
    this.status.setVisible(shown);
    if (!shown) return;
    const ys = at === SHIP_TEXT_BELOW ? this.below : this.above;
    const oy = at === SHIP_TEXT_BELOW ? 0 : 1;
    this.label.setOrigin(0.5, oy).setPosition(this.x, ys.labelY);
    this.status.setOrigin(0.5, oy).setPosition(this.x, ys.statusY);
  }

  /** 沈み始めた（1 回だけ）: 絵を沈み込ませる（大発・駆逐艦と同じ tween）。ラベルと状態の行（灰色の「沈没（揚陸 N%）」）は残す */
  sink(): void {
    if (this.sinkStarted) return;
    this.sinkStarted = true;
    const img = this.sprite;
    this.scene.tweens.add({ targets: img, scaleX: img.scaleX * SINK_SCALE_TO, scaleY: img.scaleY * SINK_SCALE_TO, alpha: 0, angle: img.angle + SINK_TILT_DEG, duration: SINK_DURATION_MS, ease: 'Sine.easeIn' });
  }

  destroy(): void {
    this.sprite.destroy();
    this.label.destroy();
    this.status.destroy();
    this.mark.destroy();
    this.markLabel.destroy();
  }
}
