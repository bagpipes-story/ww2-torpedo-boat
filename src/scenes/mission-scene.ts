// Mission: v0.1.1 は黒い海＋デバッグHUD（FPS・ビルド番号）だけ。艇・魚雷は v0.1.2 / v0.1.3 で足す。
import Phaser from 'phaser';
import { REGISTRY_KEY_DATA, SCENE_KEYS } from '../config/game-config';
import { getGameData } from '../config/game-data';
import { DebugHud } from '../ui/debug-hud';

export class MissionScene extends Phaser.Scene {
  private hud?: DebugHud;

  constructor() {
    super(SCENE_KEYS.mission);
  }

  create(): void {
    const data = getGameData(this.registry, REGISTRY_KEY_DATA);
    const world = data.hitRateModel.world;

    this.hud = new DebugHud(this, {
      buildLabel: import.meta.env.VITE_BUILD_LABEL,
      dataSummary: `data v${data.hitRateModel.version} / time_scale x${world.time_scale} / boats ${data.boats.boats.length}`,
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.hud?.destroy();
      this.hud = undefined;
    });
  }
}
