// 兵装の上の 1 行（v0.6.8。spec-v068 §3.2・§4.5）: 右側の 2 列のパネルの兵装の上（下端 y 488 = 主兵装の魚雷の上端 496 − 8）に 22 px の 1 行。
// 出来事（狙う艦の無い魚雷・撃墜・0 本で魚雷）は決まった秒だけ、状態（機銃を押している間の「艦に効かず閃光で見つかる」「対空 ・ まず当たらない」など）はその間。
// どれを出すかは ui/arms-lines の ArmsCuePicker（魚雷を押している間は隠す > 出ている出来事 > 状態 > 無し）。魚雷の出来事は魚雷のボタンの上、ほかは機銃のボタンの上に寄せ、
// 文の幅が帯 [W − 288, W − 24] に収まるよう中心を寄せる（config/hud-layout-config の cueAnchorX）。撃墜は金色で 1.25 → 1 に飛び出す（tween はその時だけ作る）。
// §7: 文・色・位置・見せる／隠すは（番号・数）が変わったときだけ書く（寄せる先は番号で決まる）。
import Phaser from 'phaser';
import { CUE_POP_MS, CUE_POP_SCALE } from '../config/arms-config';
import { DEPTH } from '../config/game-config';
import { cueAnchorX, type PanelLayout } from '../config/hud-layout-config';
import { hudTextStyle } from '../config/ui-config';
import { CUE_NONE, type ArmsTelemetry } from '../core/arms-cue';
import { ArmsCuePicker, armsCueIsDown, armsCueJa, armsCueOverTorpedo } from './arms-lines';

export class WeaponCue {
  private readonly text: Phaser.GameObjects.Text;
  private readonly picker: ArmsCuePicker;
  private pop: Phaser.Tweens.Tween | null = null;
  /** いま書いてある番号・数（CUE_NONE なら隠している）と色 */
  private shownCode = CUE_NONE;
  private shownN = 0;
  private shownColor = '';
  /** setText の回数（G8 のヘッドレスの数え。確保しない） */
  setTextCount = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layout: PanelLayout,
    /** Hud を作ったときの世界の出来事の通し番号（それより前の出来事は出さない） */
    startSeq: number,
  ) {
    this.picker = new ArmsCuePicker(startSeq);
    this.text = scene.add.text(layout.gun.x, layout.cue.bottom, '', hudTextStyle(layout.cue.px)).setOrigin(0.5, 1).setDepth(DEPTH.hud + 1).setVisible(false);
  }

  /** HUD だけの出来事（0 本で魚雷ボタンを押した＝EV_TORP_EMPTY）を今から出す */
  local(code: number, nowMs: number): void {
    this.picker.local(code, nowMs);
  }

  /** 毎フレーム（ui/weapon-panel の update から）。torpedoHeld は魚雷ボタンを押している間 */
  update(a: ArmsTelemetry, nowMs: number, torpedoHeld: boolean): void {
    const p = this.picker;
    p.pick(a, nowMs, torpedoHeld);
    const code = p.code;
    const n = p.n;
    const pop = p.popPending && armsCueIsDown(code);
    if (code === this.shownCode && n === this.shownN && !pop) return;
    this.shownCode = code;
    this.shownN = n;
    if (code === CUE_NONE) {
      this.text.setVisible(false);
      return;
    }
    const line = armsCueJa(code, n);
    this.text.setText(line.text);
    this.setTextCount++;
    if (line.color !== this.shownColor) {
      this.shownColor = line.color;
      this.text.setColor(line.color);
    }
    this.text.setX(cueAnchorX(this.layout, armsCueOverTorpedo(code) ? 'torpedo' : 'gun', this.text.width));
    this.text.setVisible(true);
    if (pop) {
      p.popPending = false;
      if (this.pop !== null) this.pop.remove();
      this.text.setScale(CUE_POP_SCALE);
      this.pop = this.scene.tweens.add({
        targets: this.text,
        scale: 1,
        duration: CUE_POP_MS,
        ease: 'Back.easeOut',
        onComplete: () => {
          this.pop = null;
        },
      });
    }
  }

  destroy(): void {
    if (this.pop !== null) this.pop.remove();
    this.pop = null;
    this.text.destroy();
  }
}
