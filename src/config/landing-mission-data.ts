// 停泊して揚陸する味方の輸送船（v0.6.9。jp_04「多号作戦・オルモック湾へ」。docs/02 §6.11、spec-v069 §4.9）の任務の読み出し: 任務の v0_1_prototype.landing があれば、
// 輸送船の記録（enemies.json の ship_id）・米PT の雷撃（us_pt_enemy.torpedo_attack。core/pt-torpedo-data の V11）・米PT の隊（揺らぎの前の ptBase と今夜の ptNight）から LandingSetup を組む。
// 形の検査（V3 の形）は core/landing-data、線の幾何は core/landing-geometry。他の記録・任務を跨ぐ検査はここ（V1〜V10・V13）。Boot は validateLandingMissions で全任務（ハードも）を 1 回組み、V12 も見る（v0.6.9 S5a）。
// PrototypeMission に鍵は足さない（block は生の proto から読む。engine-mission-data・patrol-air-mission-data と同じ作法）。world-setup が組み立てのたびに呼ぶ（landingSetupPart）。
import { getVisibilityParams, type GameData } from './game-data';
import { LANDING_BEACH_CLEAR_M, LANDING_BEACH_MARGIN_M, LANDING_DAWN_MARGIN_S, LANDING_LAUNCH_INSIDE_M, LANDING_RING_CLEAR_M, LANDING_WARN_MIN_S } from './landing-config';
import { getPrototypeMission, hasHardVariant, type PrototypeMission } from './mission-data';
import { getPtParams, nearestStartM } from './pt-mission-data';
import { bearingJa } from '../core/briefing';
import { isLandingShipRecord, landingParamsFromData, readLandingBlock, type LandingParams } from '../core/landing-data';
import { farLegClearM, legEndBowErrDeg, legEndRangeM } from '../core/landing-geometry';
import type { PtParams } from '../core/pt-data';
import { ptTorpedoParamsFromData, type PtTorpedoParams } from '../core/pt-torpedo-data';
import { bearingDeg } from '../core/ship-ai';
import { createCircles, fillHullCircles } from '../core/torpedo-solver';
import { enemyDetectRangeM } from '../core/visibility';

export type { LandingParams } from '../core/landing-data';
export type { PtTorpedoParams } from '../core/pt-torpedo-data';

/** 揚陸の世界の値（WorldSetup.landing）: 泊地・輸送船・揚陸（core/landing-data）と米PT の雷撃（core/pt-torpedo-data） */
export interface LandingSetup {
  params: LandingParams;
  torpedo: PtTorpedoParams;
}

/** V2: 揚陸の任務と同居しない v0_1_prototype の鍵（大発の輸送隊・敵の大発・駆逐艦・夜の哨戒機・敵の輸送船・僚艇）。PATROL_AIR_EXCLUSIVE_KEYS には足さない（pt_boats が既に排他。spec R8/F8） */
export const LANDING_EXCLUSIVE_KEYS = ['convoy', 'barges', 'enemy_start', 'patrol_air', 'transport', 'escort'] as const;

type Rec = Record<string, unknown>;

/**
 * 任務の揚陸の値。v0_1_prototype.landing の無い任務は null。data が壊れている・同居できない任務なら「<任務>.v0_1_prototype.landing: …」の例外（雷撃は「<任務>: enemies.json の <id>.torpedo_attack: …」）。
 * ptBase は揺らぎの前（config/pt-mission-data の getPtParams。ハードなら線を足した隊）、ptNight は今夜の揺らぎ込み（PT の来る方角）、hitScale は当たりの倍率（?debug&shiphit の上書き込み）
 */
export function getLandingSetup(data: GameData, mission: PrototypeMission, ptBase: PtParams | null, ptNight: PtParams | null, hitScale: number): LandingSetup | null {
  const m = (data.missionsSeed.missions as readonly Rec[]).find((x) => x['id'] === mission.id);
  const proto = m?.['v0_1_prototype'] as Rec | undefined;
  const raw = proto?.['landing'];
  if (!m || !proto || raw === undefined) return null;
  const id = mission.id;
  const label = `${id}.v0_1_prototype.landing`;
  const bad = (msg: string): never => {
    throw new Error(`${label}: ${msg}（docs/02 §6.11）`);
  };
  // V2 置き場・V1 任務の形: 米PT の隊の任務・岸は南・主兵装は 25mm・東西反転なし
  for (const k of LANDING_EXCLUSIVE_KEYS) if (proto[k] !== undefined) bad(`v0_1_prototype.${k} と同居しない（停泊する味方の輸送船と米PT の隊の任務）`);
  if (!mission.ptBoats || !ptBase || !ptNight) return bad('米PT の隊（pt_boats）の任務だけ');
  if (mission.coast?.side !== 'south') bad('岸（coast.side south）が要る（浜の線と揚陸地点）');
  if (mission.mainWeapon !== 'guns') bad(`main_weapon は guns（${mission.mainWeapon}。25mm で PT を追い払う）`);
  if (mission.night && mission.night.mirrorChance !== 0) bad(`night.mirror_chance は 0（${mission.night.mirrorChance}。泊地と帰投の輪は反転しない）`);
  // V3 輸送船: 形・allies・記録
  const b = readLandingBlock(raw, label);
  const allies = m['allies'];
  if (!Array.isArray(allies) || !allies.includes(b.ship_id)) bad(`ship_id（${b.ship_id}）が ${id}.allies に無い`);
  const enemies = data.enemies.enemies as readonly Rec[];
  const ship = enemies.find((e) => e['id'] === b.ship_id);
  if (!isLandingShipRecord(ship)) return bad(`ship_id（${b.ship_id}）が enemies.json に length_m・beam_m・hull_circles（2 以上の整数）付きで無い`);
  // V11 雷撃（core/pt-torpedo-data）: boat_ref の torpedoes と torpedo_id の魚雷の記録を渡す
  const pt = enemies.find((e) => e['id'] === mission.enemyId)!;
  const boatRef = String(pt['boat_ref']);
  const tRaw = pt['torpedo_attack'];
  const tid = (tRaw as Rec | undefined)?.['torpedo_id'];
  const launch = data.hitRateModel.torpedo_launch;
  const torpedo = ptTorpedoParamsFromData(tRaw, {
    boatRef,
    boatTorpedoes: (data.boats.boats as readonly Rec[]).find((x) => x['id'] === boatRef)?.['torpedoes'] as { count: unknown; type_late: unknown } | undefined,
    torpedoRecord: (data.torpedoes.torpedoes as readonly Rec[]).find((x) => x['id'] === tid),
    armingM: launch.arming_distance_m,
    erraticPeriodS: launch.erratic_period_s,
  }, `${id}: enemies.json の ${mission.enemyId}.torpedo_attack`);
  // V4 船体（data の ship_hit_scale。?debug&shiphit の上書きでは止めない）: 海域の中・浜の線の LANDING_BEACH_CLEAR_M 沖
  const ax = b.anchor.x_m;
  const ay = b.anchor.y_m;
  const scale = data.hitRateModel.world.ship_hit_scale;
  const circles = createCircles(ship.hull_circles);
  fillHullCircles(circles, ax, ay, b.anchor.heading_deg, ship.length_m * scale, ship.beam_m * scale);
  const beachY = mission.bounds.height - LANDING_BEACH_MARGIN_M;
  for (const c of circles) {
    if (!(c.x - c.r >= 0 && c.x + c.r <= mission.bounds.width && c.y - c.r >= 0 && c.y + c.r <= mission.bounds.height)) bad(`輸送船の船体（ship_hit_scale ${scale} 倍）は海域の中`);
    if (!(c.y + c.r <= beachY - LANDING_BEACH_CLEAR_M)) bad(`輸送船の船体（ship_hit_scale ${scale} 倍）は浜の線（y ${beachY}）から ${LANDING_BEACH_CLEAR_M} m 以上沖（${Math.round(beachY - c.y - c.r)} m）`);
  }
  // V5 帰投の輪・V6 夜明け
  const rp = mission.returnPoint;
  const ringM = Math.hypot(ax - rp.x, ay - rp.y);
  if (!(ringM >= LANDING_RING_CLEAR_M)) bad(`泊地と帰投の輪の中心は ${LANDING_RING_CLEAR_M} m 以上（${Math.round(ringM)} m）`);
  if (!(b.unload_s + LANDING_DAWN_MARGIN_S <= mission.durationS)) bad(`unload_s + ${LANDING_DAWN_MARGIN_S}（${b.unload_s + LANDING_DAWN_MARGIN_S} 秒）≤ duration_s（${mission.durationS} 秒。揚陸は夜明けの前に決着する）`);
  // V7 線の終わり・V9 艇首の向き（線ごとに南北のずれの両端。ハードなら足した線も）
  const jy = mission.night ? mission.night.enemyJitterYM : 0;
  const endMax = torpedo.launchM - Math.sqrt(ptBase.arrive2) - LANDING_LAUNCH_INSIDE_M;
  for (let i = 0; i < ptBase.count; i++) {
    const far = legEndRangeM(ptBase, i, jy, ax, ay)[1];
    if (!(far <= endMax)) bad(`pt_boats の線 ${i} の終わりは泊地から ${Math.round(endMax)} m（launch_range_m − arrive_m − ${LANDING_LAUNCH_INSIDE_M}）の内（今夜の揺らぎで ${Math.round(far)} m）`);
    const err = legEndBowErrDeg(ptBase, i, jy, ax, ay);
    if (!(err <= torpedo.tolDeg / 2)) bad(`pt_boats の線 ${i} の向きと、線の終わりから泊地への方位の差は launch_heading_tol_deg / 2（${torpedo.tolDeg / 2}°）以下（今夜の揺らぎで ${err.toFixed(1)}°）`);
  }
  // V8 出発で報告しない・V10 報告から慌てる距離まで LANDING_WARN_MIN_S 秒
  const startM = nearestStartM(ptBase, mission.night, ax, ay);
  if (!(startM > b.lookout_m)) bad(`今夜の揺らぎの PT の出発点は泊地から lookout_m（${b.lookout_m} m）より遠い（${Math.round(startM)} m。出発で見張りが報告しない）`);
  const nearM = Math.max(torpedo.hurriedM, torpedo.launchM);
  const warnS = (b.lookout_m - nearM) / (ptBase.patrolMps * ptBase.timeScale);
  if (!(warnS >= LANDING_WARN_MIN_S)) bad(`見張りの報告から ${nearM} m（max(hurried_max_m, launch_range_m)）まで哨戒の速さで ${warnS.toFixed(2)} 秒（${LANDING_WARN_MIN_S} 秒以上）`);
  // V13 出発点のそばでは引きつけられない（spec R1）: 泊地から nearM より遠い線の部分は、自艇の出発点から巡航で見つかる距離（ノーマルと史実モードの遠い方）より遠い
  const detectM = cruiseDetectM(data, mission, ptBase);
  const ps = mission.playerStart;
  for (let i = 0; i < ptBase.count; i++) {
    const clear = farLegClearM(ptBase, i, jy, ax, ay, nearM, ps.x, ps.y);
    if (!(clear > detectM)) bad(`pt_boats の線 ${i} の泊地から ${nearM} m より遠い部分（今夜の揺らぎ込み）は、自艇の出発点から巡航で見つかる ${Math.round(detectM)} m（史実モード込み）より遠い（${Math.round(clear)} m。出発点のそばで引きつけられない）`);
  }
  // 今夜の PT の来る方角（泊地から見た出発点の 8 方位。線の順）
  const runDirJa: string[] = [];
  for (let i = 0; i < ptNight.count; i++) runDirJa.push(bearingJa(bearingDeg(ax, ay, ptNight.startX[i]!, ptNight.startY[i]!)));
  return { params: landingParamsFromData(b, ship, { hitScale, hurriedM: torpedo.hurriedM, launchM: torpedo.launchM, runDirJa }), torpedo };
}

/** 自艇が巡航で見つかる距離 m（ノーマルと史実モードの遠い方。config/pt-mission-data の出発の検査と同じ式） */
export function cruiseDetectM(data: GameData, mission: PrototypeMission, p: PtParams): number {
  const vis = getVisibilityParams(data, mission.moon, false);
  const hist = getVisibilityParams(data, mission.moon, true);
  return Math.max(enemyDetectRangeM(p.baseDetectM, vis.speedFactor.cruise, vis, false), enemyDetectRangeM(p.baseDetectM, hist.speedFactor.cruise, hist, false));
}

/** 組み立ての上書き（systems/world-setup の SetupOptions の 1 鍵）: 船体の当たりの倍率（?debug&shiphit=N。正の数でなければ data の world.ship_hit_scale） */
export interface LandingSetupOptions {
  shipHitScale?: number;
}

/** WorldSetup に展開する部分: 揚陸の無い任務は {}（landing の鍵ごと出ない＝他の任務の setup の snapshot が変わらない。engineSetupPart と同じ作法） */
export function landingSetupPart(data: GameData, mission: PrototypeMission, ptBase: PtParams | null, ptNight: PtParams | null, o: LandingSetupOptions): { landing?: LandingSetup } {
  const hitScale = o.shipHitScale !== undefined && o.shipHitScale > 0 ? o.shipHitScale : data.hitRateModel.world.ship_hit_scale;
  const p = getLandingSetup(data, mission, ptBase, ptNight, hitScale);
  return p ? { landing: p } : {};
}

/**
 * Boot の検査（v0.6.9 S5a。spec §4.9 V12・§6 S5）: v0_1_prototype.landing のある任務ごとに、ノーマルとハード（あれば）の揚陸の値を 1 回組み（V1〜V11・V13。今夜の揺らぎの前の隊で。
 * 壊れていれば Boot で止まる＝黒い画面で遊ばせない）、V12: その任務の艇は smoke_generator false（右上の揚陸の時計が煙幕の場所を使う。hud-layout-config）。
 * 戻りは最初の揚陸の任務のノーマルの揚陸の値（輸送船の絵の寸法 lengthM・beamM）。揚陸の任務が無ければ null
 */
export function validateLandingMissions(data: GameData, timeScale: number): LandingParams | null {
  let first: LandingParams | null = null;
  for (const m of data.missionsSeed.missions as readonly Rec[]) {
    const proto = m['v0_1_prototype'] as Rec | undefined;
    const id = m['id'];
    if (!proto || proto['landing'] === undefined || typeof id !== 'string') continue;
    for (const hard of hasHardVariant(data, id) ? [false, true] : [false]) {
      const pm = getPrototypeMission(data, id, hard);
      const pt = pm.ptBoats ? getPtParams(data, pm, timeScale) : null;
      const ld = getLandingSetup(data, pm, pt, pt, data.hitRateModel.world.ship_hit_scale)!;
      const boat = (data.boats.boats as readonly Rec[]).find((b) => b['id'] === pm.playerBoatId);
      if (boat?.['smoke_generator'] !== false) throw new Error(`${id}.v0_1_prototype.landing: 艇（${pm.playerBoatId}）は smoke_generator false（右上の揚陸の時計が煙幕の場所を使う。V12・docs/02 §6.11）`);
      if (!first) first = ld.params;
    }
  }
  return first;
}
