// 中継の輪（v0.8.2 S2。us_05 の隣の分隊。spec-v0820 §4.5 D-N5・§4.11 D-A5、lead の L22）: 帰投の輪（entities/return-point）と同じ置き方の静的な Image と中心の名。
// 絵は帰投の輪のテクスチャ（Boot で 1 回作った tex-return-ring）に黄を掛けるだけ（新しい絵の鍵は作らない＝tex-ab は変わらない）。§7: 作った後は毎フレーム触らない。
// 作るのは recon のある世界だけ（systems/world-enemies が systems/world-recon と一緒に 1 回）。2 行目の文・端の印は S4。
// v0.8.2 IP3（実機 3 回目「黄色い丸い円だけでなんのこっちゃ分かりません」「実際に停まっている分隊を配置してはどうでしょうか」）: 輪の中に止まっている隣の分隊の艇 3 隻（自艇と同じ Elco の絵の鍵＝新しい鍵なし。
// 少しずつ違う向き・輪の下に描く・作った後は触らない）。絵だけ（世界・当たり・発見・テレメトリには入らない）。輪の名は艇の上（輪の内）へ。
import type Phaser from 'phaser';
import { DEPTH, RENDER_SCALE, TEXTURE_KEYS, artImageScale } from '../config/game-config';
import { RELAY_LABEL_UP_M, RELAY_RING_TEXT, RELAY_RING_TINT, RELAY_SECTION_BOATS, RELAY_SECTION_DEPTH } from '../config/recon-hud-config';
import { HOME_LABEL_FONT_PX, RETURN_RING_ALPHA, RETURN_RING_TEX_RADIUS_UNITS, hudTextStyle } from '../config/ui-config';

export class RelayRingView {
  private readonly ring: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private readonly boats: Phaser.GameObjects.Image[] = [];

  /** boatTextureKey は隣の分隊の艇の絵（自艇と同じ Elco の鍵。world-enemies が任務の艇から渡す） */
  constructor(scene: Phaser.Scene, relay: { readonly x: number; readonly y: number; readonly radiusM: number; readonly labelJa: string }, boatTextureKey: string) {
    for (const [dx, dy, h] of RELAY_SECTION_BOATS) this.boats.push(scene.add.image(relay.x + dx, relay.y + dy, boatTextureKey).setScale(artImageScale(boatTextureKey)).setAngle(h).setDepth(RELAY_SECTION_DEPTH));
    this.ring = scene.add
      .image(relay.x, relay.y, TEXTURE_KEYS.returnRing)
      .setScale(relay.radiusM / RETURN_RING_TEX_RADIUS_UNITS / RENDER_SCALE)
      .setTint(RELAY_RING_TINT)
      .setAlpha(RETURN_RING_ALPHA)
      .setDepth(DEPTH.returnRing);
    this.label = scene.add.text(relay.x, relay.y - RELAY_LABEL_UP_M, relay.labelJa, hudTextStyle(HOME_LABEL_FONT_PX, RELAY_RING_TEXT)).setOrigin(0.5).setAlpha(RETURN_RING_ALPHA).setDepth(DEPTH.returnRing);
  }

  destroy(): void {
    this.ring.destroy();
    this.label.destroy();
    for (const b of this.boats) b.destroy();
  }
}
