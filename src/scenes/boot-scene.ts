// Boot: data/*.json を Registry に置き、共有の入力状態を作り、プレースホルダーをテクスチャ化して Title へ（?debug は Mission へ直行。docs/02 §4、v0.4.0）。
// 音のアンロックは v0.7 でここに足す。
import Phaser from 'phaser';
import {
  DEBUG_DIRECT_MISSION,
  DEBUG_ENABLED,
  DEBUG_RAID_OVERRIDE,
  PROTOTYPE_MISSION_ID,
  REGISTRY_KEY_DATA,
  REGISTRY_KEY_INPUT,
  SCENE_KEYS,
  TEXTURE_KEYS,
  sortieSeed,
} from '../config/game-config';
import { gameData, getBoatRecord, getEnemyRecord, getPrototypeMission, getTorpedoRecord } from '../config/game-data';
import { createInputState } from '../core/input-state';
import { directSortie } from '../core/sortie';
import {
  generateDebugRingTexture,
  generateDestroyerTexture,
  generateGunneryTextures,
  generateSmokeTextures,
  generatePlayerBoatTexture,
  generateReturnTextures,
  generateTargetMarkerTexture,
  generateTorpedoButtonTexture,
  generateTorpedoTextures,
  generateUiTextures,
} from '../assets/placeholders';
import { generateAircraftTexture } from '../assets/aircraft-placeholder';
import { generateRainTexture } from '../assets/storm-placeholder';
import { HOME_COLOR, STICK_DEAD_ZONE, TARGET_MARKER_COLOR, TARGET_MARKER_SIZE } from '../config/ui-config';

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
    // 台座の輪: 静音帯の上限（speed_bands_kt.silent_max / speed_max_kt）に当たる倒し量。デッドゾーンの再スケールを逆に掛ける
    const silentRatio = boat.speed_bands_kt.silent_max / boat.speed_max_kt;
    generateUiTextures(this, STICK_DEAD_ZONE + (1 - STICK_DEAD_ZONE) * silentRatio);
    generateGunneryTextures(this, enemy.searchlight.cone_deg);
    generateSmokeTextures(this);
    generateTorpedoButtonTexture(this);
    generateTargetMarkerTexture(this, TEXTURE_KEYS.targetMarker, TARGET_MARKER_SIZE, TARGET_MARKER_COLOR);
    generateTargetMarkerTexture(this, TEXTURE_KEYS.homeMarker, TARGET_MARKER_SIZE, HOME_COLOR);
    generateReturnTextures(this);
    generateAircraftTexture(this);
    generateAircraftTexture(this, TEXTURE_KEYS.enemyAircraft, TARGET_MARKER_COLOR); // 敵の水上機（v0.4.1）
    generateRainTexture(this);
    if (DEBUG_ENABLED) generateDebugRingTexture(this);

    if (DEBUG_DIRECT_MISSION) this.scene.start(SCENE_KEYS.mission, directSortie(PROTOTYPE_MISSION_ID, sortieSeed(), DEBUG_RAID_OVERRIDE));
    else this.scene.start(SCENE_KEYS.title);
  }
}
