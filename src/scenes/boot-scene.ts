// Boot: data/*.json を Registry に置き、共有の入力状態を作り、プレースホルダーをテクスチャ化して Title へ（?debug は Mission へ直行。docs/02 §4、v0.4.0）。
// 音のアンロックは v0.7 でここに足す。
import Phaser from 'phaser';
import {
  DEBUG_DIRECT_MISSION,
  DEBUG_ENABLED,
  DEBUG_HARD,
  DEBUG_HISTORICAL,
  DEBUG_MISSION_ID,
  DEBUG_RAID_OVERRIDE,
  PROTOTYPE_MISSION_ID,
  REGISTRY_KEY_DATA,
  REGISTRY_KEY_INPUT,
  SCENE_KEYS,
  TEXTURE_KEYS,
  boatTextureKey,
  sortieSeed,
} from '../config/game-config';
import { gameData, getBoatRecord, getEnemyRecord, getPrototypeMission, getTorpedoRecord } from '../config/game-data';
import { createInputState } from '../core/input-state';
import { directSortie } from '../core/sortie';
import { migrateLegacyUnlocks } from '../systems/progress-storage';
import {
  generateDebugRingTexture,
  generateDestroyerTexture,
  generateTransportTexture,
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
import { generateImpactRingTexture } from '../assets/impact-ring-placeholder';
import { generateBargeTextures } from '../assets/barge-placeholder';
import { generatePtBoatTexture } from '../assets/pt-placeholder';
import { getBargeParams } from '../config/game-data';
import { getPtParams } from '../config/pt-mission-data';
import { COAST_MARKER_COLOR } from '../config/hunt-config';
import { HOME_COLOR, STICK_DEAD_ZONE, TARGET_MARKER_COLOR, TARGET_MARKER_SIZE } from '../config/ui-config';

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENE_KEYS.boot);
  }

  create(): void {
    this.registry.set(REGISTRY_KEY_DATA, gameData);
    // v0.5.2 までの端末のキャンペーンの解放の移し替え（v0.6.0）: どの任務より先に 1 回（?debug 直行でも）
    migrateLegacyUnlocks(gameData);
    this.registry.set(REGISTRY_KEY_INPUT, createInputState());

    // プレースホルダー生成は 1 回だけ（CLAUDE.md §7）
    const mission = getPrototypeMission(gameData, PROTOTYPE_MISSION_ID);
    const boat = getBoatRecord(gameData, mission.playerBoatId);
    const spriteScale = gameData.hitRateModel.world.sprite_scale;
    // 艇の絵（v0.6.0）: v0_1_prototype を持つ任務の自艇と僚艇ごとに 1 枚（今は Elco 80ft・77ft・T-38 の 3 枚）
    const boatIds = new Set<string>();
    for (const m of gameData.missionsSeed.missions as readonly Record<string, unknown>[]) {
      if (!m['v0_1_prototype'] || typeof m['id'] !== 'string') continue;
      const pm = getPrototypeMission(gameData, m['id']);
      boatIds.add(pm.playerBoatId);
      if (pm.escort) boatIds.add(pm.escort.boat);
    }
    for (const id of boatIds) {
      const b = getBoatRecord(gameData, id);
      generatePlayerBoatTexture(this, { lengthUnits: b.length_m * spriteScale, beamUnits: b.beam_m * spriteScale }, boatTextureKey(id));
    }
    const enemy = getEnemyRecord(gameData, mission.enemyId);
    generateDestroyerTexture(this, { lengthUnits: enemy.length_m * spriteScale, beamUnits: enemy.beam_m * spriteScale });
    const torpedo = getTorpedoRecord(gameData, mission.torpedoId);
    generateTorpedoTextures(this, torpedo.length_m * spriteScale);
    // 台座の輪: 静音帯の上限（speed_bands_kt.silent_max / speed_max_kt）に当たる倒し量。デッドゾーンの再スケールを逆に掛ける
    const silentRatio = boat.speed_bands_kt.silent_max / boat.speed_max_kt;
    generateUiTextures(this, STICK_DEAD_ZONE + (1 - STICK_DEAD_ZONE) * silentRatio);
    generateGunneryTextures(this, enemy.searchlight ? enemy.searchlight.cone_deg : 0);
    // 輸送船（v0.4.7）: 輸送船を持つ最初の任務の値から（灰色の幅広い船形）
    const transportMission = gameData.missionsSeed.missions.find((m) => (m as Record<string, unknown>)['v0_1_prototype'] && ((m as Record<string, unknown>)['v0_1_prototype'] as Record<string, unknown>)['transport']);
    const transport = transportMission ? getPrototypeMission(gameData, transportMission.id).transport : null;
    if (transport) {
      const tr = getEnemyRecord(gameData, transport.enemyId);
      generateTransportTexture(this, { lengthUnits: tr.length_m * spriteScale, beamUnits: tr.beam_m * spriteScale });
    }
    generateSmokeTextures(this);
    generateTorpedoButtonTexture(this);
    generateTargetMarkerTexture(this, TEXTURE_KEYS.targetMarker, TARGET_MARKER_SIZE, TARGET_MARKER_COLOR);
    generateTargetMarkerTexture(this, TEXTURE_KEYS.homeMarker, TARGET_MARKER_SIZE, HOME_COLOR);
    generateTargetMarkerTexture(this, TEXTURE_KEYS.coastMarker, TARGET_MARKER_SIZE, COAST_MARKER_COLOR); // 「岸 N m」（v0.4.2）
    generateReturnTextures(this);
    generateImpactRingTexture(this); // 夜明けの空襲の着弾点の輪（v0.6.1）
    generateAircraftTexture(this);
    generateAircraftTexture(this, TEXTURE_KEYS.enemyAircraft, TARGET_MARKER_COLOR); // 敵の水上機（v0.4.1）
    generateRainTexture(this);
    // 大発（v0.4.2）: 大発の隊を持つ最初の任務の値から（遊べる任務は Boot ですべて読める）
    const bargeMission = gameData.missionsSeed.missions.find((m) => (m as Record<string, unknown>)['v0_1_prototype'] && ((m as Record<string, unknown>)['v0_1_prototype'] as Record<string, unknown>)['barges']);
    const barge = bargeMission ? getBargeParams(gameData, getPrototypeMission(gameData, bargeMission.id)) : null;
    if (barge) generateBargeTextures(this, { lengthUnits: barge.boundsMarginM * 2, beamUnits: (barge.halfBeamM * 2 * spriteScale) / gameData.hitRateModel.world.hit_scale });
    // 米PT（v0.6.3）: 米PT の隊を持つ最初の任務の値から（us_elco80 の寸法 × sprite_scale）。getPtParams は米PT の data の検査も兼ねる（壊れていれば Boot で止まる）
    const ptMission = gameData.missionsSeed.missions.find((m) => (m as Record<string, unknown>)['v0_1_prototype'] && ((m as Record<string, unknown>)['v0_1_prototype'] as Record<string, unknown>)['pt_boats']);
    const pt = ptMission ? getPtParams(gameData, getPrototypeMission(gameData, ptMission.id), gameData.hitRateModel.world.time_scale) : null;
    if (pt) generatePtBoatTexture(this, { lengthUnits: pt.spriteLengthUnits, beamUnits: pt.spriteBeamUnits });
    if (DEBUG_ENABLED) generateDebugRingTexture(this);

    if (DEBUG_DIRECT_MISSION) this.scene.start(SCENE_KEYS.mission, directSortie(debugMissionId(), sortieSeed(), DEBUG_RAID_OVERRIDE, DEBUG_HARD, DEBUG_HISTORICAL));
    else this.scene.start(SCENE_KEYS.title);
  }
}

/** ?debug&mission= の任務が出撃できなければ（v0_1_prototype が無い・打ち間違い）us_02 で直行する（黒画面にしない） */
function debugMissionId(): string {
  try {
    getPrototypeMission(gameData, DEBUG_MISSION_ID);
    return DEBUG_MISSION_ID;
  } catch (e) {
    console.warn(`?debug&mission=${DEBUG_MISSION_ID} は出撃できない（${e instanceof Error ? e.message : String(e)}）。${PROTOTYPE_MISSION_ID} で始める`);
    return PROTOTYPE_MISSION_ID;
  }
}
