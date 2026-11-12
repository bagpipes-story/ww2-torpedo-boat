// 空襲下の退避（v0.6.11 S4。jp_03）の 18 隻の絵（spec-v0611-r2 §11）: 起動時に 18 枚の Image（艇の絵は Boot が作った boatTextureKey(艇)）。毎フレーム位置と向きだけ、
// 見え方（描かない・ふつう・陰に隠れて薄い・沈む途中）は変わったときだけ setVisible・setAlpha。座席に入った艇（操作中の隊長艇）の Image は描かない（世界の自艇 PlayerBoat が描く。
// 操作中の隊が隠れている間は自艇の絵も薄く）。壕に上げ終えた艇は描かない。沈む絵は tween を使わず記録の沈んだ秒から縮み・薄く・傾く（毎フレームの計算だけ）。§7: 確保は constructor だけ。
// v0.6.11 IP1 の U9・U10: レールで上げている艇（隊の hauling）の絵は、その艇の点から壕の口（systems/evac-terrain の evacCaveMouthY）まで進み（core/evac-shelter の evacHaulProgress）に
// 合わせて斜路を上がる（艇首は壕の向き）。座席の隊長艇なら世界の自艇の絵を動かす（world-visuals の syncSprite の後に呼ばれる＝次のフレームで記録の点へ戻る）。絵だけ（記録は変えない）。
// v0.6.11 IP2 の U11: 陰に隠れている間は薄さに加えて暗い色（EVAC_HIDDEN_TINT。崖の陰の下に見せる。見つかればふつうの色に戻る）。
import type Phaser from 'phaser';
import { EVAC_HIDDEN_TINT } from '../config/evac-art-config';
import { EVAC_HIDDEN_ALPHA } from '../config/evac-config';
import { DEPTH, RENDER_SCALE, artImageScale } from '../config/game-config';
import { artTexDensity } from '../config/ship-art-config';
import { SINK_DURATION_MS, SINK_SCALE_TO, SINK_TILT_DEG } from '../config/ui-config';
import { G_HAULING, G_HIDDEN } from '../core/evac-data';
import { evacHaulProgress } from '../core/evac-shelter';
import type { EvacSquadron } from '../core/evac-squadron';
import type { BoatState } from '../core/boat-motion';

/** 見え方（変わったときだけ表示と濃さを書く） */
const V_NONE = 0;
const V_SHOWN = 1;
const V_DIM = 2;
const V_SINKING = 3;
/** 斜路を上がる艇首（北 0・時計回り。壕は南の岸＝南向き） */
const HAUL_HEADING_DEG = 180;
/** 色を付けない tint（白） */
const NO_TINT = 0xffffff;

export class EvacBoatsView {
  readonly imgs: Phaser.GameObjects.Image[] = []; // 航跡の絵が読む（v0.7.0 S3b。systems/wake-fx）
  private readonly look: Uint8Array;
  private seatDim = false;
  /** 絵の密度（v0.7.0 IP3。2 の冪）と Image の倍率（game-config の artImageScale） */
  private readonly density: number;
  private readonly scale: number;

  constructor(
    scene: Phaser.Scene,
    private readonly sq: EvacSquadron,
    textureKey: string,
    /** 世界の自艇の絵（座席＝操作中の隊長艇） */
    private readonly seatSprite: Phaser.GameObjects.Image,
    /** 壕の口の中心の y（systems/evac-terrain の evacCaveMouthY） */
    private readonly mouthY: number,
    /** 座席の記録（世界の自艇の state） */
    private readonly seat: BoatState,
  ) {
    this.density = artTexDensity(textureKey);
    this.scale = artImageScale(textureKey);
    for (let i = 0; i < sq.boats.length; i++) this.imgs.push(scene.add.image(0, 0, textureKey).setScale(this.scale).setDepth(DEPTH.playerBoat).setVisible(false));
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
        img.setVisible(look !== V_NONE).setAlpha(look === V_DIM ? EVAC_HIDDEN_ALPHA : 1).setTint(look === V_DIM ? EVAC_HIDDEN_TINT : NO_TINT);
        if (look !== V_SINKING) img.setScale(this.scale);
      }
      if (look === V_NONE) continue;
      img.setPosition(b.state.x, b.state.y).setAngle(b.state.headingDeg + SINK_TILT_DEG * k);
      if (look === V_SINKING) img.setScale((1 - (1 - SINK_SCALE_TO) * k) / RENDER_SCALE / this.density).setAlpha(1 - k); // IP3: (x / k) / 密度＝密度 1 とビット同一の表示の大きさ
    }
    // レールの上の艇（壕で上げている隊ごとに 1 隻）を斜路の上へ
    for (let gi = 0; gi < sq.groups.length; gi++) {
      const g = sq.groups[gi]!;
      if (g.phase !== G_HAULING || g.hauling < 0) continue;
      const k = evacHaulProgress(g, sq.p.haulS);
      const sh = sq.p.shelters[g.shelter];
      if (Number.isNaN(k) || !sh) continue;
      const seatBoat = gi === sq.control && g.hauling === g.leader;
      const from = seatBoat ? this.seat : g.boats[g.hauling]!.state;
      const img = seatBoat ? this.seatSprite : this.imgs[g.boats[g.hauling]!.index]!;
      img.setPosition(from.x + (sh.x - from.x) * k, from.y + (this.mouthY - from.y) * k).setAngle(HAUL_HEADING_DEG);
    }
    const dim = sq.groups[sq.control]!.phase === G_HIDDEN;
    if (dim !== this.seatDim) {
      this.seatDim = dim;
      this.seatSprite.setAlpha(dim ? EVAC_HIDDEN_ALPHA : 1).setTint(dim ? EVAC_HIDDEN_TINT : NO_TINT);
    }
  }

  destroy(): void {
    for (const img of this.imgs) img.destroy();
  }
}
