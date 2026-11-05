// 空襲下の退避（v0.6.11 S4。jp_03）の 18 隻の絵（spec-v0611-r2 §11）: 起動時に 18 枚の Image（艇の絵は Boot が作った boatTextureKey(艇)）。毎フレーム位置と向きだけ、
// 見え方（描かない・ふつう・陰に隠れて薄い・沈む途中）は変わったときだけ setVisible・setAlpha。座席に入った艇（操作中の隊長艇）の Image は描かない（世界の自艇 PlayerBoat が描く。
// 操作中の隊が隠れている間は自艇の絵も薄く）。壕に上げ終えた艇は描かない。沈む絵は tween を使わず記録の沈んだ秒から縮み・薄く・傾く（毎フレームの計算だけ）。§7: 確保は constructor だけ。
import type Phaser from 'phaser';
import { EVAC_HIDDEN_ALPHA } from '../config/evac-config';
import { DEPTH, RENDER_SCALE } from '../config/game-config';
import { SINK_DURATION_MS, SINK_SCALE_TO, SINK_TILT_DEG } from '../config/ui-config';
import { G_HIDDEN } from '../core/evac-data';
import type { EvacSquadron } from '../core/evac-squadron';

/** 見え方（変わったときだけ表示と濃さを書く） */
const V_NONE = 0;
const V_SHOWN = 1;
const V_DIM = 2;
const V_SINKING = 3;

export class EvacBoatsView {
  private readonly imgs: Phaser.GameObjects.Image[] = [];
  private readonly look: Uint8Array;
  private seatDim = false;

  constructor(
    scene: Phaser.Scene,
    private readonly sq: EvacSquadron,
    textureKey: string,
    /** 世界の自艇の絵（座席＝操作中の隊長艇） */
    private readonly seatSprite: Phaser.GameObjects.Image,
  ) {
    for (let i = 0; i < sq.boats.length; i++) this.imgs.push(scene.add.image(0, 0, textureKey).setScale(1 / RENDER_SCALE).setDepth(DEPTH.playerBoat).setVisible(false));
    this.look = new Uint8Array(sq.boats.length);
  }

  /** 毎フレーム（nowS は世界の時計＝記録の沈んだ秒と同じ時計） */
  update(nowS: number): void {
    const sq = this.sq;
    for (let i = 0; i < sq.boats.length; i++) {
      const b = sq.boats[i]!;
      const g = sq.groups[b.group]!;
      const img = this.imgs[i]!;
      const k = b.sunk ? (nowS - b.sunkAtS) / (SINK_DURATION_MS / 1000) : 0;
      const look = b.sunk ? (k < 1 ? V_SINKING : V_NONE) : b.up || (b.group === sq.control && b.slot === g.leader) ? V_NONE : g.phase === G_HIDDEN ? V_DIM : V_SHOWN;
      if (look !== this.look[i]) {
        this.look[i] = look;
        img.setVisible(look !== V_NONE).setAlpha(look === V_DIM ? EVAC_HIDDEN_ALPHA : 1);
        if (look !== V_SINKING) img.setScale(1 / RENDER_SCALE);
      }
      if (look === V_NONE) continue;
      img.setPosition(b.state.x, b.state.y).setAngle(b.state.headingDeg + SINK_TILT_DEG * k);
      if (look === V_SINKING) img.setScale((1 - (1 - SINK_SCALE_TO) * k) / RENDER_SCALE).setAlpha(1 - k);
    }
    const dim = sq.groups[sq.control]!.phase === G_HIDDEN;
    if (dim !== this.seatDim) {
      this.seatDim = dim;
      this.seatSprite.setAlpha(dim ? EVAC_HIDDEN_ALPHA : 1);
    }
  }

  destroy(): void {
    for (const img of this.imgs) img.destroy();
  }
}
