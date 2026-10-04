// Boot: data/*.json を Registry に置き、共有の入力状態を作り、プレースホルダーをテクスチャ化して Mission へ（docs/02 §4）。
// 音のアンロックは v0.7 でここに足す。
import Phaser from 'phaser';
import { PROTOTYPE_MISSION_ID, REGISTRY_KEY_DATA, REGISTRY_KEY_INPUT, SCENE_KEYS } from '../config/game-config';
import { gameData, getBoatRecord, getEnemyRecord, getPrototypeMission, getTorpedoRecord } from '../config/game-data';
import { createInputState } from '../core/input-state';
import {
  generateDestroyerTexture,
  generatePlayerBoatTexture,
  generateTargetMarkerTexture,
  generateTorpedoButtonTexture,
  generateTorpedoTextures,
  generateUiTextures,
} from '../assets/placeholders';
import { TARGET_MARKER_COLOR, TARGET_MARKER_SIZE } from '../config/ui-config';

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENE_KEYS.boot);
  }

  create(): void {
    this.registry.set(REGISTRY_KEY_DATA, gameData);
    this.registry.set(REGISTRY_KEY_INPUT, createInputState());

    // プレースホルダー生成は 1 回だけ（CLAUDE.md §7）
    const mission = getPrototypeMission(gameData, PROTOTYPE_MISSION_ID);
    const boat = getBoatRecord(gameData, mission.playerBoatId);
    const spriteScale = gameData.hitRateModel.world.sprite_scale;
    generatePlayerBoatTexture(this, { lengthUnits: boat.length_m * spriteScale, beamUnits: boat.beam_m * spriteScale });
    const enemy = getEnemyRecord(gameData, mission.enemyId);
    generateDestroyerTexture(this, { lengthUnits: enemy.length_m * spriteScale, beamUnits: enemy.beam_m * spriteScale });
    const torpedo = getTorpedoRecord(gameData, mission.torpedoId);
    generateTorpedoTextures(this, torpedo.length_m * spriteScale);
    generateUiTextures(this);
    generateTorpedoButtonTexture(this);
    generateTargetMarkerTexture(this, TARGET_MARKER_SIZE, TARGET_MARKER_COLOR);

    this.scene.start(SCENE_KEYS.mission);
  }
}
