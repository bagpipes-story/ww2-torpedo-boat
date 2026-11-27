// Boot: data/*.json を Registry に置き、共有の入力状態を作り、プレースホルダーをテクスチャ化して Title へ（?debug は Mission へ直行。docs/02 §4、v0.4.0。?sfxlab は試聴の場＝v0.7.1 IP2・v0.7.2 S1 から曲）。
// 音（v0.7.1）: 合成の効果音のエンジンをここで 1 回作る（systems/sfx-boot。標本の合成・ゲームの時計・iOS の保険の resume）。最初のタッチの unlock は Phaser の sound manager がする。
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
  SFX_LAB_ENABLED,
  REGISTRY_KEY_INPUT,
  SCENE_KEYS,
  TEXTURE_KEYS,
  boatTextureKey,
  sortieSeed,
} from '../config/game-config';
import { gameData, getBoatRecord, getEnemyRecord, getPrototypeMission, getTorpedoRecord } from '../config/game-data';
import { hasHardVariant } from '../config/mission-data';
import { createInputState } from '../core/input-state';
import { directSortie } from '../core/sortie';
import { migrateLegacyUnlocks } from '../systems/progress-storage';
import { debugStoreMemory } from '../systems/sortie-loadout';
import { createSfx } from '../systems/sfx-boot';
import {
  generateDebugRingTexture,
  generateGunneryTextures,
  generateSmokeTextures,
  generateReturnTextures,
  generateTargetMarkerTexture,
  generateTorpedoButtonTexture,
  generateTorpedoTextures,
  generateUiTextures,
} from '../assets/placeholders';
import { generatePlayerBoatTexture } from '../assets/boat-art';
import { generateColumnTextures, generateDestroyerTexture, generateExtraDestroyerTextures, generatePicketTextures } from '../assets/destroyer-art';
import { generateTransportTexture } from '../assets/transport-art';
import { generateAircraftTexture } from '../assets/aircraft-art';
import { generateGunButtonTexture } from '../assets/weapon-textures';
import { generateRainTexture } from '../assets/storm-placeholder';
import { generateSeaTextures } from '../assets/sea-art';
import { generateFxTextures } from '../assets/fx-art';
import { generateEvacRingTexture, generateImpactRingTexture } from '../assets/impact-ring-placeholder';
import { generateBargeTextures, generateFriendlyBargeTexture } from '../assets/barge-placeholder';
import { generatePtBoatTexture } from '../assets/pt-placeholder';
import { paintSboatTexture } from '../assets/boat-art';
import { generateRescueTextures } from '../assets/rescue-art';
import { PT_TEXTURE_KEY_BY_BOAT, SBOAT_TEXTURE_KEY } from '../config/pt-look-data';
import { generateFriendlyTransportTexture } from '../assets/ally-ship-placeholder';
import { generateAllyDestroyerTextures } from '../assets/ally-destroyer-placeholder';
import { allyFanFor } from '../ui/ally-fan';
import { getBargeParams } from '../config/game-data';
import { getPtParams } from '../config/pt-mission-data';
import { getConvoyParams } from '../config/convoy-mission-data';
import { getEngineParams } from '../config/engine-mission-data';
import { getGunboatParams } from '../config/gunboat-mission-data';
import { getPatrolAirParams } from '../config/patrol-air-mission-data';
import { validateLandingMissions } from '../config/landing-mission-data';
import { validateAllyDestroyerMissions } from '../config/ally-destroyer-mission-data';
import { validateEvacMissions } from '../config/evac-mission-data';
import { validateRadarMissions } from '../config/radar-mission-data';
import { RADAR_BLIP_COLOR, RADAR_MARKER_TEX_KEY } from '../config/radar-art-config';
import { validateTransitMissions } from '../config/transit-mission-data';
import { validateShoresMissions } from '../config/shores-mission-data';
import { validateAnchorMissions } from '../config/anchor-mission-data';
import { validateBackdropMissions } from '../config/backdrop-mission-data';
import { validateSeaplaneMissions } from '../config/seaplane-mission-data';
import { validateColumnMissions } from '../config/column-mission-data';
import { validateReconMissions } from '../config/recon-mission-data';
import { validateMagazineRecords } from '../config/magazine-data';
import { validateLoadouts } from '../config/loadout-data';
import { validateShoreGunsMissions } from '../config/shore-guns-mission-data';
import { validateRescueMissions } from '../config/rescue-mission-data';
import { validateMinefieldMissions } from '../config/minefield-mission-data';
import { validateStore } from '../config/store-data';
import { US_PT_BOAT_REF } from '../config/pt-config';
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
    // 艇の絵（v0.6.0）: v0_1_prototype を持つ任務の自艇と僚艇ごとに 1 枚（今は Elco 80ft・77ft・T-38 の 3 枚。v0.6.6 からハードの隼艇 H-38 も）
    const boatIds = new Set<string>();
    for (const m of gameData.missionsSeed.missions as readonly Record<string, unknown>[]) {
      if (!m['v0_1_prototype'] || typeof m['id'] !== 'string') continue;
      const pm = getPrototypeMission(gameData, m['id']);
      boatIds.add(pm.playerBoatId);
      if (pm.escort) boatIds.add(pm.escort.boat);
      getEngineParams(gameData, m['id']); // 機関の不調（v0.6.5）の data と同居の検査（壊れていれば Boot で止まる。不調の無い任務は null）
      getPatrolAirParams(gameData, m['id']); // 夜の哨戒機（v0.6.7。jp_02）の data・置き場・夜の出撃の検査（壊れていれば Boot で止まる。無い任務は null）
      getPtParams(gameData, pm, gameData.hitRateModel.world.time_scale); // 米PT の隊（v0.8.5 S0 からノーマルも。us_07 の S ボートの「出発で見つからない」を昼の倍率で＝V-U1。無い任務は null）
      const hm = hasHardVariant(gameData, m['id']) ? getPrototypeMission(gameData, m['id'], true) : null; // ハード（v0.6.6）も 1 回組んで米PT と輸送隊を検査（3 本目の哨戒線の出発点・ノルマ。壊れていれば Boot で止まる）
      if (hm) { getPtParams(gameData, hm, gameData.hitRateModel.world.time_scale); getConvoyParams(gameData, hm); }
      const gb = hm ? getGunboatParams(gameData, hm) : null; // 隼艇（v0.6.6。jp_01 のハード）の data と同居の検査、艇の絵
      if (gb) boatIds.add(gb.boatId);
    }
    for (const id of boatIds) {
      const b = getBoatRecord(gameData, id);
      generatePlayerBoatTexture(this, { lengthUnits: b.length_m * spriteScale, beamUnits: b.beam_m * spriteScale }, boatTextureKey(id));
    }
    validateLoadouts(gameData); // 兵装（v0.6.8）: 対空・閃光の data と全任務（ハードも）の艇の魚雷・砲の検査（壊れていれば Boot で止まる。上の輪の後）
    const enemy = getEnemyRecord(gameData, mission.enemyId);
    generateDestroyerTexture(this, { lengthUnits: enemy.length_m * spriteScale, beamUnits: enemy.beam_m * spriteScale });
    generateExtraDestroyerTextures(this, gameData, spriteScale); // 米駆逐艦 tex-destroyer-us（v0.7.0 S2a。jp_06。遊べる任務の駆逐艦の id から 1 枚ずつ＝D3）
    generatePicketTextures(this, gameData, spriteScale); // ハードの駆潜艇 tex-subchaser（v0.8.1 S2b。us_06。hard の picket_enemy_id から 1 枚＝D-A2）
    generateColumnTextures(this, gameData, spriteScale); // 列の戦艦 tex-battleship-fuso・重巡 tex-cruiser-mogami（v0.8.2 S2b。us_05。transit.column から 1 枚ずつ＝D-A1・D-A2）
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
    generateGunButtonTexture(this); // 機銃のボタン（v0.6.8。橙の輪と 4 つの目盛り。assets/weapon-textures）
    generateTargetMarkerTexture(this, TEXTURE_KEYS.targetMarker, TARGET_MARKER_SIZE, TARGET_MARKER_COLOR);
    generateTargetMarkerTexture(this, TEXTURE_KEYS.homeMarker, TARGET_MARKER_SIZE, HOME_COLOR);
    generateTargetMarkerTexture(this, TEXTURE_KEYS.coastMarker, TARGET_MARKER_SIZE, COAST_MARKER_COLOR); // 「岸 N m」（v0.4.2）
    generateTargetMarkerTexture(this, RADAR_MARKER_TEX_KEY, TARGET_MARKER_SIZE, RADAR_BLIP_COLOR); // 緑の「レーダー N m」（v0.8.0 S4。輝点と同じ色）
    generateReturnTextures(this);
    generateImpactRingTexture(this); // 夜明けの空襲の着弾点の輪（v0.6.1）
    generateEvacRingTexture(this); // 空襲下の退避の輪（v0.6.11 S5。jp_03）
    generateAircraftTexture(this);
    generateAircraftTexture(this, TEXTURE_KEYS.enemyAircraft, TARGET_MARKER_COLOR); // 敵の水上機（v0.4.1）
    generateRainTexture(this);
    generateSeaTextures(this); // 海の模様のタイル・夜明けの光・きらめき（v0.7.0 S3a。assets/sea-art。Canvas の 2D に 1 回。systems/sea-fx が使う）
    generateFxTextures(this); // 水柱・砲口炎・火球・航跡 2 枚（v0.7.0 S3b。assets/fx-art。Canvas の 2D に 1 回。SplashPool・閃光 7 か所・systems/explosion-fx・wake-fx が使う）
    // 大発（v0.4.2）: 大発の隊を持つ最初の任務の値から（遊べる任務は Boot ですべて読める）
    const bargeMission = gameData.missionsSeed.missions.find((m) => (m as Record<string, unknown>)['v0_1_prototype'] && ((m as Record<string, unknown>)['v0_1_prototype'] as Record<string, unknown>)['barges']);
    const barge = bargeMission ? getBargeParams(gameData, getPrototypeMission(gameData, bargeMission.id)) : null;
    if (barge) generateBargeTextures(this, { lengthUnits: barge.boundsMarginM * 2, beamUnits: (barge.halfBeamM * 2 * spriteScale) / gameData.hitRateModel.world.hit_scale });
    // 味方の大発（v0.6.4）: 味方の輸送隊を持つ最初の任務の値から（同じ船形を薄い青で。getConvoyParams は輸送隊の data の検査も兼ねる）
    const convoyMission = gameData.missionsSeed.missions.find((m) => (m as Record<string, unknown>)['v0_1_prototype'] && ((m as Record<string, unknown>)['v0_1_prototype'] as Record<string, unknown>)['convoy']);
    const convoy = convoyMission ? getConvoyParams(gameData, getPrototypeMission(gameData, convoyMission.id)) : null;
    if (convoy) generateFriendlyBargeTexture(this, { lengthUnits: convoy.params.boundsMarginM * 2, beamUnits: (convoy.params.halfBeamM * 2 * spriteScale) / gameData.hitRateModel.world.hit_scale });
    // 米PT（v0.6.3）: 米PT の隊を持つ最初の任務の値から（us_elco80 の寸法 × sprite_scale）。getPtParams は米PT の data の検査も兼ねる（壊れていれば Boot で止まる）
    // v0.8.5 S0（spec-v0850 §4.4）: PT の記録の boat_ref が us_elco80（US_PT_BOAT_REF）の最初の任務から（種の配列で jp_* より前の us_07 の S ボートの寸法に変わらない。S ボートの絵は S2 の別の鍵）
    const ptMission = gameData.missionsSeed.missions.find((m) => (m as Record<string, unknown>)['v0_1_prototype'] && ((m as Record<string, unknown>)['v0_1_prototype'] as Record<string, unknown>)['pt_boats'] && ptBoatRefOf(m as Record<string, unknown>) === US_PT_BOAT_REF);
    const pt = ptMission ? getPtParams(gameData, getPrototypeMission(gameData, ptMission.id), gameData.hitRateModel.world.time_scale) : null;
    if (pt) generatePtBoatTexture(this, { lengthUnits: pt.spriteLengthUnits, beamUnits: pt.spriteBeamUnits });
    // v0.8.5 S2（us_07）: 米PT でない PT の隊（S ボート tex-sboat）の絵は、その boat_ref の最初の任務の寸法から 1 枚（config/pt-look-data の鍵の表。米PT の絵は上のまま）
    const sbMission = gameData.missionsSeed.missions.find((m) => ((m as Record<string, unknown>)['v0_1_prototype'] as Record<string, unknown> | undefined)?.['pt_boats'] && PT_TEXTURE_KEY_BY_BOAT[ptBoatRefOf(m as Record<string, unknown>)] === SBOAT_TEXTURE_KEY);
    const sb = sbMission ? getPtParams(gameData, getPrototypeMission(gameData, sbMission.id), gameData.hitRateModel.world.time_scale) : null;
    if (sb) paintSboatTexture(this, { lengthUnits: sb.spriteLengthUnits, beamUnits: sb.spriteBeamUnits });
    // 生存者・機雷・ブイ・味方のフレッチャー級（v0.8.5 S2。救助の任務のある時だけ 1 回。assets/rescue-art）
    if (gameData.missionsSeed.missions.some((m) => ((m as Record<string, unknown>)['v0_1_prototype'] as Record<string, unknown> | undefined)?.['rescue'])) generateRescueTextures(this, gameData, spriteScale);
    // 味方の輸送船（v0.6.9。jp_04）: 揚陸の任務（ハードも）の data・置き場・幾何と V12（艇に煙幕なし）の検査（壊れていれば Boot で止まる）、最初の揚陸の任務の輸送船の絵（薄い青）
    const landing = validateLandingMissions(gameData, gameData.hitRateModel.world.time_scale);
    if (landing) generateFriendlyTransportTexture(this, { lengthUnits: landing.lengthM * spriteScale, beamUnits: landing.beamM * spriteScale });
    // 味方の駆逐艦 卯月（v0.6.10。jp_04）: 置き場・値・位置（今夜の揺らぎ込みの V-A1〜V-A6・V-A8）と探照灯の絵の角（V-A7）の検査（壊れていれば Boot で止まる）、
    // 艦の絵（薄い青）と見張りの扇（陸を切り落とした 1 枚。S5a）。探照灯の絵は us_02 の敵の駆逐艦の 1 枚を使う（V-A7 で同じ角）
    const ally = validateAllyDestroyerMissions(gameData, gameData.hitRateModel.world.time_scale, enemy.searchlight ? enemy.searchlight.cone_deg : 0);
    const allyMission = ally ? getPrototypeMission(gameData, allyMissionId(ally.shipId)) : null;
    if (ally && allyMission) generateAllyDestroyerTextures(this, { lengthUnits: ally.lengthM * spriteScale, beamUnits: ally.beamM * spriteScale }, allyFanFor(ally, allyMission.coast !== null, allyMission.bounds.height));
    validateEvacMissions(gameData); // 空襲下の退避（v0.6.11。jp_03）: 隊・隠れ場所・波と編隊・燃料の V-E1〜V-E12（ハードも。壊れていれば Boot で止まる。絵は S4）
    // 米PT キャンペーン②（v0.8.0。us_04）: レーダー（radar の data と V-R1〜V-R5）・列の通過（V-T1〜V-T6）・海峡の両岸（V-S1〜V-S3）をハードも 1 回（壊れていれば Boot で止まる。絵は S2）
    validateRadarMissions(gameData);
    validateTransitMissions(gameData);
    validateShoresMissions(gameData);
    validateAnchorMissions(gameData); // オルモック湾の決着（v0.8.1。us_06）: 止まった艦（V-A1〜V-A6）と暗い岸を背に（V-B1〜V-B3）をハードも 1 回（壊れていれば Boot で止まる。世界の配線は S2）
    validateBackdropMissions(gameData);
    validateSeaplaneMissions(gameData); // 夜の水上機の任務ごとの値（v0.8.1 IP2。us_06 の attacks_per_night・V-P1〜V-P3）をハードも 1 回
    // スリガオ海峡・最初の接触（v0.8.2。us_05）: 片道の列の艦ごとの記録（V-C1〜V-C6）・報告と中継（V-N1〜V-N5）・戦艦の弾薬庫の記録（V-M1〜V-M3）をハードも 1 回（世界の配線は S2）
    validateColumnMissions(gameData);
    validateReconMissions(gameData);
    validateMagazineRecords(gameData);
    // D-Day・生存者救助（v0.8.5 S0。us_07）: 任務ごとの沿岸砲の値（V-U2）・救助（V-Q1〜V-Q8・V-D1〜V-D2・V-U1）・機雷原（V-X1・V-X3〜V-X5）をハードも 1 回（世界の配線は S2）
    validateShoreGunsMissions(gameData);
    validateRescueMissions(gameData);
    validateMinefieldMissions(gameData);
    validateStore(gameData); // ストア（v0.9.0。data/store.json）: 品の表と貯め方の V-S1〜V-S4（全任務の組み立ては tests/custom-loadout。壊れていれば Boot で止まる）
    debugStoreMemory(gameData); // ?debug&points=N（v0.9.0 S1）・?debug&achieved=all:hist（IP3）: 財布を写しに（N 点・ご褒美を持つ。localStorage の財布は変えない）
    createSfx(this.game); // 合成の効果音（v0.7.1 S1。再生の context が無い端末は何もしない＝音なしで続ける）
    if (DEBUG_ENABLED) generateDebugRingTexture(this);

    if (SFX_LAB_ENABLED) this.scene.start(SCENE_KEYS.musicLab); // 試聴の場（?sfxlab の時だけ。v0.7.2 S1 から曲の試聴の場＝効果音の試聴の場はその中のボタンから。ふだんの URL は Title・?debug は Mission のまま）
    else if (DEBUG_DIRECT_MISSION) this.scene.start(SCENE_KEYS.mission, directSortie(debugMissionId(), sortieSeed(), DEBUG_RAID_OVERRIDE, DEBUG_HARD, DEBUG_HISTORICAL));
    else this.scene.start(SCENE_KEYS.title);
  }
}

/** 卯月の block を持つ任務の id（V-A8 で 1 任務だけ。validateAllyDestroyerMissions の後に呼ぶ） */
function allyMissionId(shipId: string): string {
  const m = (gameData.missionsSeed.missions as readonly Record<string, unknown>[]).find((x) => {
    const proto = x['v0_1_prototype'] as Record<string, unknown> | undefined;
    const a = proto?.['ally_destroyer'] as Record<string, unknown> | undefined;
    return a !== undefined && a['ship_id'] === shipId;
  });
  return m ? String(m['id']) : '';
}

/** 任務の PT の隊の記録（v0_1_prototype.enemies の最初の id の enemies.json の記録）の boat_ref（無ければ ''） */
function ptBoatRefOf(m: Record<string, unknown>): string {
  const ids = (m['v0_1_prototype'] as Record<string, unknown>)['enemies'];
  const id = Array.isArray(ids) ? ids[0] : undefined;
  const rec = (gameData.enemies.enemies as readonly Record<string, unknown>[]).find((e) => e['id'] === id);
  return typeof rec?.['boat_ref'] === 'string' ? rec['boat_ref'] : '';
}

/** ?debug&mission= の任務が出撃できなければ（v0_1_prototype が無い・打ち間違い）us_02 で直行する（黒画面にしない）。v0.8.5 S2 から救助（us_07）の世界もある（S0 の除けを外した。Title に出すのは S5） */
function debugMissionId(): string {
  try {
    getPrototypeMission(gameData, DEBUG_MISSION_ID);
    return DEBUG_MISSION_ID;
  } catch (e) {
    console.warn(`?debug&mission=${DEBUG_MISSION_ID} は出撃できない（${e instanceof Error ? e.message : String(e)}）。${PROTOTYPE_MISSION_ID} で始める`);
    return PROTOTYPE_MISSION_ID;
  }
}
