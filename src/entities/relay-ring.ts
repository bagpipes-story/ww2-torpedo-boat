// 中継の輪（v0.8.2 S2。us_05 の隣の分隊。spec-v0820 §4.5 D-N5・§4.11 D-A5、lead の L22）: 帰投の輪（entities/return-point）と同じ置き方の静的な Image と中心の名。
// 絵は帰投の輪のテクスチャ（Boot で 1 回作った tex-return-ring）に黄を掛けるだけ（新しい絵の鍵は作らない＝tex-ab は変わらない）。§7: 作った後は毎フレーム触らない。
// 作るのは recon のある世界だけ（systems/world-enemies が systems/world-recon と一緒に 1 回）。2 行目の文・端の印は S4。
import type Phaser from 'phaser';
import { DEPTH, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { RELAY_RING_TEXT, RELAY_RING_TINT } from '../config/recon-hud-config';
import { HOME_LABEL_FONT_PX, RETURN_RING_ALPHA, RETURN_RING_TEX_RADIUS_UNITS, hudTextStyle } from '../config/ui-config';

export class RelayRingView {
  private readonly ring: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, relay: { readonly x: number; readonly y: number; readonly radiusM: number; readonly labelJa: string }) {
    this.ring = scene.add
      .image(relay.x, relay.y, TEXTURE_KEYS.returnRing)
      .setScale(relay.radiusM / RETURN_RING_TEX_RADIUS_UNITS / RENDER_SCALE)
      .setTint(RELAY_RING_TINT)
      .setAlpha(RETURN_RING_ALPHA)
      .setDepth(DEPTH.returnRing);
    this.label = scene.add.text(relay.x, relay.y, relay.labelJa, hudTextStyle(HOME_LABEL_FONT_PX, RELAY_RING_TEXT)).setOrigin(0.5).setAlpha(RETURN_RING_ALPHA).setDepth(DEPTH.returnRing);
  }

  destroy(): void {
    this.ring.destroy();
    this.label.destroy();
  }
}
