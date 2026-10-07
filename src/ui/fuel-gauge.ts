// 燃料計（左上、HP バーの下。docs/02 §6.7、v0.3.0）。HP バーと同じテクスチャを流用し、青い目盛りで「巡航で帰投地点まで戻るのに要る燃料」を示す。
// §7: バーは拡縮だけ、目盛りは丸めた px が変わったときだけ setX、文字は値が変わったときだけ setText。
import Phaser from 'phaser';
import { DEPTH, HUD_MARGIN, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import {
  FUEL_COLOR_OK,
  FUEL_FLAGS_OFFSET_X,
  FUEL_GAUGE_OFFSET_Y,
  HOME_COLOR,
  HP_BAR_HEIGHT,
  HP_BAR_WIDTH,
  HP_COLOR_LOW,
  HP_FONT_PX,
  HUD_COLOR_WARN,
  HUD_TEXT_GAP,
  hudTextStyle,
} from '../config/ui-config';
import type { BoatTelemetry } from '../core/boat-motion';
import { CALL_FUEL } from '../core/mission-flow';

/** 注意表示の種類（変わったときだけ setText） */
const FLAG_NONE = 0;
const FLAG_TIGHT = 1;
const FLAG_SLOW_DOWN = 2;
const FLAG_EMPTY = 3;
const FLAG_LABEL: readonly string[] = ['', '帰投ぎりぎり', '減速しないと届かない', '燃料切れ'];

export class FuelGauge {
  private readonly bg: Phaser.GameObjects.Image;
  private readonly fill: Phaser.GameObjects.Image;
  private readonly tick: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private readonly flags: Phaser.GameObjects.Text;
  private readonly barX: number;
  private lastPct = -1;
  private lastWarn = false;
  private lastFlag = -1;
  private lastTickX = -1;
  private tickShown = true;

  constructor(scene: Phaser.Scene) {
    const x = HUD_MARGIN;
    const y = HUD_MARGIN + FUEL_GAUGE_OFFSET_Y;
    this.barX = x;
    this.label = scene.add.text(x, y, '', hudTextStyle(HP_FONT_PX)).setDepth(DEPTH.hud);
    this.flags = scene.add.text(x + FUEL_FLAGS_OFFSET_X, y, '', hudTextStyle(HP_FONT_PX, HUD_COLOR_WARN)).setDepth(DEPTH.hud);
    const barY = y + HP_FONT_PX + HUD_TEXT_GAP;
    this.bg = scene.add.image(x, barY, TEXTURE_KEYS.hpBarBg).setOrigin(0, 0).setScale(1 / RENDER_SCALE).setDepth(DEPTH.hud);
    this.fill = scene.add.image(x, barY, TEXTURE_KEYS.hpBarFill).setOrigin(0, 0).setScale(1 / RENDER_SCALE).setDepth(DEPTH.hud + 1).setTint(FUEL_COLOR_OK);
    this.tick = scene.add
      .image(x, barY + HP_BAR_HEIGHT / 2, TEXTURE_KEYS.fuelTick)
      .setOrigin(0.5, 0.5)
      .setScale(1 / RENDER_SCALE)
      .setDepth(DEPTH.hud + 2)
      .setTint(HOME_COLOR);
  }

  refresh(t: BoatTelemetry): void {
    // % は ceil の整数なので、0% になるのは空のときだけ
    const pct = Math.max(0, Math.min(100, Math.ceil(t.fuel01 * 100)));
    if (pct !== this.lastPct) {
      this.lastPct = pct;
      this.label.setText(`燃料 ${pct}%`);
      this.fill.setScale(Math.max(0, Math.min(1, t.fuel01)) / RENDER_SCALE, 1 / RENDER_SCALE);
    }
    const flag = t.fuelEmpty ? FLAG_EMPTY : t.fuel01 < t.fuelNeed01 ? FLAG_SLOW_DOWN : t.callFlags & CALL_FUEL ? FLAG_TIGHT : FLAG_NONE;
    if (flag !== this.lastFlag) {
      this.lastFlag = flag;
      this.flags.setText(FLAG_LABEL[flag]!);
    }
    const warn = flag !== FLAG_NONE;
    if (warn !== this.lastWarn) {
      this.lastWarn = warn;
      this.fill.setTint(warn ? HP_COLOR_LOW : FUEL_COLOR_OK);
    }
    // 目盛り: 巡航で輪の縁まで戻るのに要る燃料の位置。輪の中では隠す
    const show = !t.atHome;
    if (show !== this.tickShown) {
      this.tickShown = show;
      this.tick.setVisible(show);
    }
    if (show) {
      const tx = Math.round(this.barX + Math.max(0, Math.min(1, t.fuelNeed01)) * HP_BAR_WIDTH);
      if (tx !== this.lastTickX) {
        this.lastTickX = tx;
        this.tick.setX(tx);
      }
    }
  }

  destroy(): void {
    this.bg.destroy();
    this.fill.destroy();
    this.tick.destroy();
    this.label.destroy();
    this.flags.destroy();
  }
}
