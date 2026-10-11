// 燃料計（左上、HP バーの下。docs/02 §6.7、v0.3.0）。HP バーと同じテクスチャを流用し、バー＝残り、文字＝残り %。
// v0.3.2 実機の要望で「巡航で帰るのに要る燃料」の青い目盛りをやめた（残りの表示と見分けがつかず、実態と乖離して見えた）。帰れるかどうかは注意表示の文字で出す。
// §7: バーは拡縮だけ、文字は値が変わったときだけ setText。
import Phaser from 'phaser';
import { DEPTH, HUD_MARGIN, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { FUEL_COLOR_OK, FUEL_FLAGS_OFFSET_X, FUEL_GAUGE_OFFSET_Y, HP_COLOR_LOW, HP_FONT_PX, HUD_COLOR_WARN, HUD_TEXT_GAP, hudTextStyle } from '../config/ui-config';
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
  private readonly label: Phaser.GameObjects.Text;
  private readonly flags: Phaser.GameObjects.Text;
  private lastPct = -1;
  private lastWarn = false;
  private lastFlag = -1;

  constructor(scene: Phaser.Scene) {
    const x = HUD_MARGIN;
    const y = HUD_MARGIN + FUEL_GAUGE_OFFSET_Y;
    this.label = scene.add.text(x, y, '', hudTextStyle(HP_FONT_PX)).setDepth(DEPTH.hud);
    this.flags = scene.add.text(x + FUEL_FLAGS_OFFSET_X, y, '', hudTextStyle(HP_FONT_PX, HUD_COLOR_WARN)).setDepth(DEPTH.hud);
    const barY = y + HP_FONT_PX + HUD_TEXT_GAP;
    this.bg = scene.add.image(x, barY, TEXTURE_KEYS.hpBarBg).setOrigin(0, 0).setScale(1 / RENDER_SCALE).setDepth(DEPTH.hud);
    this.fill = scene.add.image(x, barY, TEXTURE_KEYS.hpBarFill).setOrigin(0, 0).setScale(1 / RENDER_SCALE).setDepth(DEPTH.hud + 1).setTint(FUEL_COLOR_OK);
  }

  refresh(t: BoatTelemetry): void {
    // % は ceil の整数なので、0% になるのは空のときだけ
    const pct = Math.max(0, Math.min(100, Math.ceil(t.fuel01 * 100)));
    if (pct !== this.lastPct) {
      this.lastPct = pct;
      this.label.setText(`燃料 ${pct}%`);
      this.fill.setScale(Math.max(0, Math.min(1, t.fuel01)) / RENDER_SCALE, 1 / RENDER_SCALE);
    }
    // 帰れるか: 空 > 巡航では届かない（減速すれば届くことがある）> 帰投の呼びかけ（ぎりぎり）
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
  }

  destroy(): void {
    this.bg.destroy();
    this.fill.destroy();
    this.label.destroy();
    this.flags.destroy();
  }
}
