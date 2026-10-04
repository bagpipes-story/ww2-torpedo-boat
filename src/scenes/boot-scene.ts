// Boot: data/*.json を Registry に置き、Mission へ進む（docs/02 §4）。
// プレースホルダーテクスチャ生成と音のアンロックは v0.1.2 以降でここに足す。
import Phaser from 'phaser';
import { REGISTRY_KEY_DATA, SCENE_KEYS } from '../config/game-config';
import { gameData } from '../config/game-data';

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENE_KEYS.boot);
  }

  create(): void {
    this.registry.set(REGISTRY_KEY_DATA, gameData);
    this.scene.start(SCENE_KEYS.mission);
  }
}
