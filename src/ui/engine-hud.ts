// 機関の不調（v0.6.5。jp_05。spec-v065 §D.2・R3）の右下の熱の帯: 速力の表示の上（「針路」の文の上端から ENGINE_GAUGE_GAP_PX 上）に字（18 px）と帯（80 × 8 px）を 1 列に。
// 右端は速力の表示と同じ（W − 176）。2 行目が何を出していても見える（予告がいつも 1 か所に出る）。入力は増えない（ボタンは無い）。
// §7: 帯は Boot で作った HP バーの白い矩形を setScale するだけ（熱を 1/50 に丸めた値が変わったときだけ）、色は段が変わったときだけ、字は段か不調の残りの秒の整数が変わったときだけ setText。
// 限界と不調の間は識別ボタンと同じ速さ（IDENTIFY_PULSE_HZ）で帯の濃さだけ点滅する（字は点滅させない＝レビュー ux-4: 薄いときの字が読めなかった）。字・色・幅の刻みの写像は ui/engine-lines（Phaser 非依存でテストする）。
import Phaser from 'phaser';
import {
  ENGINE_FONT_PX,
  ENGINE_GAUGE_BG_ALPHA,
  ENGINE_GAUGE_GAP_PX,
  ENGINE_GAUGE_H_PX,
  ENGINE_GAUGE_STEPS,
  ENGINE_GAUGE_TEXT_GAP_PX,
  ENGINE_GAUGE_W_PX,
  ENGINE_PULSE_ALPHA_MIN,
} from '../config/engine-config';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH, HUD_MARGIN, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import {
  HP_BAR_HEIGHT,
  HP_BAR_WIDTH,
  HUD_FONT_HEADING_PX,
  HUD_HEADING_OFFSET_Y,
  HUD_TEXT_GAP,
  IDENTIFY_PULSE_HZ,
  RUDDER_MARKER_HEIGHT,
  TORPEDO_BUTTON_RADIUS,
  hudTextStyle,
} from '../config/ui-config';
import type { BoatTelemetry } from '../core/boat-motion';
import { ENGINE_OK, type EngineStage } from '../core/engine-trouble';
import { engineGaugeLabel, engineGaugePulses, engineGaugeStep, engineGaugeTextColor, engineGaugeTint, engineStageKey } from './engine-lines';

/** 帯の右端（速力の表示と同じ。右下の角は射撃ボタン）と、帯と字の縦の中心（「針路」の文の上端から ENGINE_GAUGE_GAP_PX 上の下端から、帯の高さの半分上） */
const GAUGE_RIGHT_X = GAME_WIDTH - HUD_MARGIN - TORPEDO_BUTTON_RADIUS * 2 - HUD_MARGIN;
const GAUGE_BOTTOM_Y = GAME_HEIGHT - HUD_MARGIN - RUDDER_MARKER_HEIGHT - HUD_TEXT_GAP - HUD_HEADING_OFFSET_Y - HUD_FONT_HEADING_PX - ENGINE_GAUGE_GAP_PX;
const GAUGE_CENTER_Y = GAUGE_BOTTOM_Y - ENGINE_FONT_PX / 2;
/** HP バーのテクスチャ（HP_BAR_WIDTH × HP_BAR_HEIGHT を RENDER_SCALE 倍で描いたもの）を 80 × 8 px にする倍率 */
const SCALE_X = ENGINE_GAUGE_W_PX / HP_BAR_WIDTH / RENDER_SCALE;
const SCALE_Y = ENGINE_GAUGE_H_PX / HP_BAR_HEIGHT / RENDER_SCALE;

export class EngineHud {
  private readonly label: Phaser.GameObjects.Text;
  private readonly bg: Phaser.GameObjects.Image;
  private readonly fill: Phaser.GameObjects.Image;
  private lastKey = -1;
  private lastStep = -1;
  private lastStage: EngineStage | -1 = -1;
  private lastAlpha = 1;

  constructor(scene: Phaser.Scene) {
    const left = GAUGE_RIGHT_X - ENGINE_GAUGE_W_PX;
    this.bg = scene.add.image(left, GAUGE_CENTER_Y, TEXTURE_KEYS.hpBarFill).setOrigin(0, 0.5).setScale(SCALE_X, SCALE_Y).setDepth(DEPTH.hud).setAlpha(ENGINE_GAUGE_BG_ALPHA);
    this.fill = scene.add.image(left, GAUGE_CENTER_Y, TEXTURE_KEYS.hpBarFill).setOrigin(0, 0.5).setScale(0, SCALE_Y).setDepth(DEPTH.hud + 1);
    this.label = scene.add.text(left - ENGINE_GAUGE_TEXT_GAP_PX, GAUGE_CENTER_Y, '', hudTextStyle(ENGINE_FONT_PX)).setOrigin(1, 0.5).setDepth(DEPTH.hud);
  }

  /** 毎フレーム（HUD の update）。nowMs は scene.time.now（点滅） */
  refresh(t: BoatTelemetry, nowMs: number): void {
    const e = t.engine;
    const stage: EngineStage = e.on ? e.stage : ENGINE_OK;
    const key = engineStageKey(e);
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.label.setText(engineGaugeLabel(key));
    }
    if (stage !== this.lastStage) {
      this.lastStage = stage;
      this.label.setColor(engineGaugeTextColor(stage));
      this.fill.setTint(engineGaugeTint(stage));
      this.bg.setTint(engineGaugeTint(stage));
    }
    const step = engineGaugeStep(e.heat);
    if (step !== this.lastStep) {
      this.lastStep = step;
      this.fill.setScale((step / ENGINE_GAUGE_STEPS) * SCALE_X, SCALE_Y);
    }
    const alpha = engineGaugePulses(stage) ? ENGINE_PULSE_ALPHA_MIN + (1 - ENGINE_PULSE_ALPHA_MIN) * (0.5 + 0.5 * Math.sin((2 * Math.PI * IDENTIFY_PULSE_HZ * nowMs) / 1000)) : 1;
    if (alpha !== this.lastAlpha) {
      this.lastAlpha = alpha;
      this.fill.setAlpha(alpha);
    }
  }

  destroy(): void {
    this.label.destroy();
    this.bg.destroy();
    this.fill.destroy();
  }
}
