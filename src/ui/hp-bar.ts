// 艇の HP バー（左上、FPS と表示サイズの下。docs/02 §6.6）と乗員（バーの右。v0.3.4。減ると 1.5 秒「-N」）。§7: バーは拡縮だけ、文字は値が変わったときだけ setText。
import Phaser from 'phaser';
import { DEPTH, HUD_MARGIN, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { CREW_LOSS_FLASH_MS, CREW_TEXT_NUDGE_Y, CREW_TEXT_OFFSET_X, HP_BAR_HEIGHT, HP_BAR_OFFSET_Y, HP_COLOR_LOW, HP_COLOR_OK, HP_FONT_PX, HP_LOW_RATIO, HUD_COLOR, HUD_COLOR_WARN, HUD_TEXT_GAP, hudTextStyle } from '../config/ui-config';
import type { BoatTelemetry } from '../core/boat-motion';

/** ラベル「艇 HP 100」の右に出す被害表示の x オフセット（論理 px） */
const FLAGS_OFFSET_X = 120;

export class HpBar {
  private readonly bg: Phaser.GameObjects.Image;
  private readonly fill: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private readonly flags: Phaser.GameObjects.Text;
  private readonly crew: Phaser.GameObjects.Text;
  private lastCrewShown = -1;
  private lastCrewTotal = -1;
  private lastFlashShown = -1;
  private lastCrewWarn = false;
  private lastCrewAlive = -1;
  private flashLost = 0;
  private flashUntil = 0;
  private lastHp = -1;
  private lastLow = false;
  private lastFlags = -1;

  constructor(scene: Phaser.Scene) {
    const x = HUD_MARGIN;
    const y = HUD_MARGIN + HP_BAR_OFFSET_Y;
    this.label = scene.add.text(x, y, '', hudTextStyle(HP_FONT_PX)).setDepth(DEPTH.hud);
    this.flags = scene.add.text(x + FLAGS_OFFSET_X, y, '', hudTextStyle(HP_FONT_PX, HUD_COLOR_WARN)).setDepth(DEPTH.hud);
    const barY = y + HP_FONT_PX + HUD_TEXT_GAP;
    this.bg = scene.add.image(x, barY, TEXTURE_KEYS.hpBarBg).setOrigin(0, 0).setScale(1 / RENDER_SCALE).setDepth(DEPTH.hud);
    this.fill = scene.add.image(x, barY, TEXTURE_KEYS.hpBarFill).setOrigin(0, 0).setScale(1 / RENDER_SCALE).setDepth(DEPTH.hud + 1).setTint(HP_COLOR_OK);
    this.crew = scene.add.text(x + CREW_TEXT_OFFSET_X, barY + HP_BAR_HEIGHT / 2 + CREW_TEXT_NUDGE_Y, '', hudTextStyle(HP_FONT_PX)).setOrigin(0, 0.5).setDepth(DEPTH.hud);
  }

  /** nowMs は scene.time.now（減ったときの「-N」の表示時間に使う） */
  refresh(t: BoatTelemetry, nowMs: number): void {
    const hp = Math.ceil(t.hp);
    if (hp !== this.lastHp) {
      this.lastHp = hp;
      this.label.setText(`艇 HP ${hp}`);
      const ratio = t.hpMax > 0 ? Math.max(0, Math.min(1, t.hp / t.hpMax)) : 0;
      this.fill.setScale(ratio / RENDER_SCALE, 1 / RENDER_SCALE);
      const low = ratio < HP_LOW_RATIO;
      if (low !== this.lastLow) {
        this.lastLow = low;
        this.fill.setTint(low ? HP_COLOR_LOW : HP_COLOR_OK);
      }
    }
    const flags = (t.onFire ? 1 : 0) | (t.engineDamaged ? 2 : 0);
    if (flags !== this.lastFlags) {
      this.lastFlags = flags;
      this.flags.setText(flags === 0 ? '' : flags === 1 ? '火災！' : flags === 2 ? '機関損傷' : '火災！ 機関損傷');
    }
    // 乗員: 減った瞬間から CREW_LOSS_FLASH_MS は「-N」を付ける（表示中にさらに減れば足す）
    if (this.lastCrewAlive >= 0 && t.crewAlive < this.lastCrewAlive) {
      this.flashLost = (nowMs < this.flashUntil ? this.flashLost : 0) + (this.lastCrewAlive - t.crewAlive);
      this.flashUntil = nowMs + CREW_LOSS_FLASH_MS;
    }
    this.lastCrewAlive = t.crewAlive;
    // 文字列は数値のキー（生存・定員・点滅中の減り）が変わったときだけ組み立てる（§7: 毎フレーム確保しない）
    const flashLost = nowMs < this.flashUntil ? this.flashLost : 0;
    if (t.crewAlive !== this.lastCrewShown || t.crewTotal !== this.lastCrewTotal || flashLost !== this.lastFlashShown) {
      this.lastCrewShown = t.crewAlive;
      this.lastCrewTotal = t.crewTotal;
      this.lastFlashShown = flashLost;
      this.crew.setText(`乗員 ${t.crewAlive}/${t.crewTotal}${flashLost > 0 ? ` -${flashLost}` : ''}`);
    }
    const crewWarn = t.crewAlive < t.crewTotal;
    if (crewWarn !== this.lastCrewWarn) {
      this.lastCrewWarn = crewWarn;
      this.crew.setColor(crewWarn ? HUD_COLOR_WARN : HUD_COLOR);
    }
  }

  destroy(): void {
    this.bg.destroy();
    this.fill.destroy();
    this.label.destroy();
    this.flags.destroy();
    this.crew.destroy();
  }
}
