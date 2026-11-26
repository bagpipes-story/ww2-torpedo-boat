// 味方の艇の絵（v0.8.5 IP3。us_07。core/friendly-boats）: 自艇と同じ船形（Boot が作った boatTextureKey(自艇)＝初期の Higgins）を味方の薄い青で塗り、名の札（data の label_ja）を上に
// （群の人数の札は群の下。艇は群の北側に止まる＝札が重ならない）。
// 新しい絵は作らない（僚艇 systems/escort-boat と同じ見せ方）。読むだけ（状態・乱数に書かない）。§7: 起動時に艇の数だけ Image と Text を作り（出るまでは隠す）、毎フレームは位置と向きだけ・
// 見える／隠れるは変わった時だけ setVisible。前の艇から FRIENDLY_LABEL_MERGE_M の内の艇は札を出さない（隣の群の 2 隻の札が重ならない）。systems/rescue-view が持つ。
import type Phaser from 'phaser';
import { DEPTH, artImageScale } from '../config/game-config';
import { ESCORT_LABEL_FONT_PX, ESCORT_LABEL_OFFSET_M, ESCORT_TEXT_COLOR, ESCORT_TINT, hudTextStyle } from '../config/ui-config';
import { FRIENDLY_LABEL_MERGE_M } from '../config/rescue-art-config';
import { friendlyVisible, type FriendlyState } from '../core/friendly-boats';

export class FriendlyBoatsView {
  private readonly imgs: Phaser.GameObjects.Image[] = [];
  private readonly labels: Phaser.GameObjects.Text[] = [];
  private readonly shown: Uint8Array;
  private readonly labelShown: Uint8Array;

  constructor(scene: Phaser.Scene, private readonly st: FriendlyState, textureKey: string, labelJa: string) {
    const sc = artImageScale(textureKey);
    const style = hudTextStyle(ESCORT_LABEL_FONT_PX, ESCORT_TEXT_COLOR);
    for (let i = 0; i < st.n; i++) {
      this.imgs.push(scene.add.image(st.x[i]!, st.y[i]!, textureKey).setTint(ESCORT_TINT).setScale(sc).setDepth(DEPTH.playerBoat).setVisible(false));
      this.labels.push(scene.add.text(st.x[i]!, st.y[i]! - ESCORT_LABEL_OFFSET_M, labelJa, style).setOrigin(0.5, 1).setDepth(DEPTH.playerBoat).setVisible(false));
    }
    this.shown = new Uint8Array(st.n);
    this.labelShown = new Uint8Array(st.n);
  }

  /** 毎フレーム: 出た艇の位置と向き（出る前は隠したまま） */
  update(): void {
    const st = this.st;
    for (let i = 0; i < st.n; i++) {
      const v = friendlyVisible(st, i) ? 1 : 0;
      if (v !== this.shown[i]) {
        this.shown[i] = v;
        this.imgs[i]!.setVisible(v === 1);
      }
      const x = st.x[i]!;
      const y = st.y[i]!;
      // 札は前の艇（見えている）から FRIENDLY_LABEL_MERGE_M の内なら出さない（2 乗の距離）
      let lv = v;
      for (let j = 0; j < i && lv === 1; j++) {
        if (this.shown[j] !== 1) continue;
        const dx = st.x[j]! - x;
        const dy = st.y[j]! - y;
        if (dx * dx + dy * dy < FRIENDLY_LABEL_MERGE_M * FRIENDLY_LABEL_MERGE_M) lv = 0;
      }
      if (lv !== this.labelShown[i]) {
        this.labelShown[i] = lv;
        this.labels[i]!.setVisible(lv === 1);
      }
      if (v === 0) continue;
      this.imgs[i]!.setPosition(x, y).setAngle(st.hdg[i]!);
      if (lv === 1) this.labels[i]!.setPosition(x, y - ESCORT_LABEL_OFFSET_M);
    }
  }

  destroy(): void {
    for (const o of this.imgs) o.destroy();
    for (const o of this.labels) o.destroy();
  }
}
