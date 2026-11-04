// 味方の駆逐艦 卯月（v0.6.10。jp_04「多号作戦・オルモック湾へ」。docs/02 §6.11、spec-v0610 §3.2・§3.3、リードの決定 LD6・LD7・LD16）の任務の読み出し: 任務の
// v0_1_prototype.ally_destroyer があれば、艦の記録（enemies.json の ship_id。core/ally-destroyer-data の読み出し＝getEnemyRecord を通さない）・揚陸（LandingSetup の泊地と雷撃）・
// 米PT の隊（揺らぎの前の ptBase）から AllyDestroyerParams を組む。形と値（V-A6）は core/ally-destroyer-data、線の幾何は core/ally-geometry、他の記録・任務を跨ぐ検査はここ
// （V-A1〜V-A5・V-A8。どれも今夜の南北のずれ込み）。Boot は validateAllyDestroyerMissions で全任務（ハードも）を 1 回組み、V-A7（探照灯の絵の角）と V-A8 の「1 任務だけ」も見る。
// world-setup が組み立てのたびに呼ぶ（allyDestroyerSetupPart。無い任務と allyOff では鍵ごと出ない）。
import type { GameData } from './game-data';
import {
  ALLY_ANCHOR_CLEAR_M, ALLY_BEACH_CLEAR_M, ALLY_CHECK_STEP_M, ALLY_FAN_CLEAR_DEG, ALLY_LANE_CLEAR_M, ALLY_RING_CLEAR_M, ALLY_SHELL_POOL_SIZE, ALLY_START_CLEAR_M,
} from './ally-config';
import { LANDING_BEACH_MARGIN_M } from './landing-config';
import { getLandingSetup, type LandingSetup } from './landing-mission-data';
import { getPrototypeMission, hasHardVariant, type PrototypeMission } from './mission-data';
import { getPtParams } from './pt-mission-data';
import { allyBad, allyDestroyerParamsFromData, isAllyShipRecord, readAllyDestroyerBlock, type AllyDestroyerParams } from '../core/ally-destroyer-data';
import { allyStationMargins, type AllyWorst } from '../core/ally-geometry';
import type { PtParams } from '../core/pt-data';

export type { AllyDestroyerParams } from '../core/ally-destroyer-data';

/** 任務の v0_1_prototype の鍵（landing の外・escort ではない。spec D11） */
export const ALLY_DESTROYER_BLOCK_KEY = 'ally_destroyer';

type Rec = Record<string, unknown>;

/** 線と南北のずれ（例外の文の「線 1・南北 −100 m で」） */
const at = (w: AllyWorst): string => `線 ${w.leg}・南北 ${w.dy >= 0 ? '+' : '−'}${Math.abs(Math.round(w.dy))} m で`;
/** 小数 d 桁（負は「−」） */
const fx = (v: number, d: number): string => v.toFixed(d).replace(/^-/, '−');

/**
 * 任務の卯月の値。v0_1_prototype.ally_destroyer の無い任務は null。data が壊れている・置けない任務・位置が検査を通らないなら「<任務>.v0_1_prototype.ally_destroyer: …」の例外。
 * ptBase は揺らぎの前の隊（ハードなら線を足した隊）、landing はその任務の揚陸（getLandingSetup の値。無い任務は null）
 */
export function getAllyDestroyerParams(data: GameData, mission: PrototypeMission, ptBase: PtParams | null, landing: LandingSetup | null): AllyDestroyerParams | null {
  const m = (data.missionsSeed.missions as readonly Rec[]).find((x) => x['id'] === mission.id);
  const proto = m?.['v0_1_prototype'] as Rec | undefined;
  const raw = proto?.[ALLY_DESTROYER_BLOCK_KEY];
  if (!m || !proto || raw === undefined) return null;
  const id = mission.id;
  const label = `${id}.v0_1_prototype.${ALLY_DESTROYER_BLOCK_KEY}`;
  const bad = allyBad(label);
  // V-A8 置き場: 揚陸の任務だけ（泊地と米PT の雷撃が要る）
  if (proto['landing'] === undefined || !landing || !ptBase) return bad('停泊して揚陸する輸送船（v0_1_prototype.landing）と米PT の隊（pt_boats）の任務だけ');
  const b = readAllyDestroyerBlock(raw, label);
  const allies = m['allies'];
  if (!Array.isArray(allies) || !allies.includes(b.ship_id)) bad(`ship_id（${b.ship_id}）が ${id}.allies に無い`);
  const enemies = data.enemies.enemies as readonly Rec[];
  const ship = enemies.find((e) => e['id'] === b.ship_id);
  if (!isAllyShipRecord(ship)) return bad(`ship_id（${b.ship_id}）が enemies.json に guns（pt_sink_chance を持つ砲がちょうど 1 つ）・searchlight（null でない）・starshell・length_m・beam_m 付きで無い`);
  for (const g of b.guard_legs) if (!(g < ptBase.count)) bad(`guard_legs の ${g} は米PT の線の添字（0〜${ptBase.count - 1}。ハードは足した線も）`);
  const pt = enemies.find((e) => e['id'] === mission.enemyId) as Rec;
  const ctx = { patrolKt: (pt['patrol'] as Rec)['speed_kt'] as number, passKt: (pt['attack'] as Rec)['pass_speed_kt'] as number, shellPoolSize: ALLY_SHELL_POOL_SIZE };
  const p = allyDestroyerParamsFromData(b, ship, ctx, label); // V-A6
  // V-A1 置く場所: 海域の縁の余白（米PT の edge_margin_m）の内・泊地・浜の線・帰投の輪の縁・自艇の出発点から離す
  const { x, y } = p;
  const edge = ptBase.edgeMarginM;
  const W = mission.bounds.width;
  const H = mission.bounds.height;
  if (!(x >= edge && x <= W - edge && y >= edge && y <= H - edge)) bad(`station（${x}, ${y}）は海域の縁から ${edge} m（米PT の edge_margin_m）以上内`);
  const L = landing.params;
  const anchorM = Math.hypot(x - L.x, y - L.y);
  if (!(anchorM >= ALLY_ANCHOR_CLEAR_M)) bad(`station は泊地から ${ALLY_ANCHOR_CLEAR_M} m 以上（${Math.round(anchorM)} m）`);
  const beachY = H - LANDING_BEACH_MARGIN_M;
  if (!(beachY - y >= ALLY_BEACH_CLEAR_M)) bad(`station は浜の線（y ${beachY}）から ${ALLY_BEACH_CLEAR_M} m 以上沖（${Math.round(beachY - y)} m）`);
  const rp = mission.returnPoint;
  const ringM = Math.hypot(x - rp.x, y - rp.y) - rp.radiusM;
  if (!(ringM >= ALLY_RING_CLEAR_M)) bad(`station は帰投の輪の縁から ${ALLY_RING_CLEAR_M} m 以上外（${Math.round(ringM)} m）`);
  const ps = mission.playerStart;
  const startM = Math.hypot(x - ps.x, y - ps.y);
  if (!(startM >= ALLY_START_CLEAR_M)) bad(`station は自艇の出発点から ${ALLY_START_CLEAR_M} m 以上（${Math.round(startM)} m）`);
  // V-A2〜V-A5（今夜の南北のずれ込み。core/ally-geometry）
  const tp = landing.torpedo;
  const padM = (p.gunnery.searchlight.onDelayS + p.lightReactS) * ptBase.patrolMps * ptBase.timeScale;
  const spreadDeg = (tp.spacingDeg * (tp.n - 1)) / 2;
  const mg = allyStationMargins(ptBase, {
    x, y, arc0Deg: p.arc0Deg, arc1Deg: p.arc1Deg, guardLegs: p.guardLegs, ax: L.x, ay: L.y, launchM: tp.launchM,
    fastM: p.lookFastM, padM, halfLenM: p.lengthM / 2, aimDeg: tp.aimDeg, spreadDeg,
    jitterYM: mission.night ? mission.night.enemyJitterYM : 0, stepM: ALLY_CHECK_STEP_M, clearDeg: ALLY_FAN_CLEAR_DEG,
  });
  const arcJa = `watch_arc_deg（${p.arc0Deg}〜${p.arc1Deg}°）`;
  if (!(mg.guardIn.value >= ALLY_FAN_CLEAR_DEG)) bad(`${arcJa}: 見張る線（guard_legs）の lookout_fast_m（${p.lookFastM} m）の内の点は扇の内に ${ALLY_FAN_CLEAR_DEG}° 以上（${at(mg.guardIn)} ${fx(mg.guardIn.value, 1)}°。V-A2）`);
  if (!(mg.window.value > 0)) bad(`${arcJa}: 見張る線の気づかれていない斉射の点より前に lookout_fast_m（${p.lookFastM} m）の内で扇の内に ${ALLY_FAN_CLEAR_DEG}° 以上の部分が要る（${at(mg.window)} 0 m＝走る PT が扇に入らない。V-A2）`);
  if (!(mg.nonGuardOut.value >= ALLY_FAN_CLEAR_DEG)) bad(`${arcJa}: 見張らない線の lookout_fast_m（${p.lookFastM} m）の内の点は扇の外に ${ALLY_FAN_CLEAR_DEG}° 以上（${at(mg.nonGuardOut)} ${fx(mg.nonGuardOut.value, 1)}°＝自艇の仕事の PT を卯月が見つける。V-A2）`);
  if (!(mg.cap.value >= p.lookSlowM)) bad(`lookout_slow_m（${p.lookSlowM} m）は、見張る線の気づかれていない斉射の点（とその前）から station まで − 点灯と反応の ${Math.round(padM)} m（on_delay_s + light_react_s の間に哨戒の速さで進む m）の ${Math.round(mg.cap.value)} m 以下（${at(mg.cap)}＝忍び寄る PT はその斉射の前に照らされない。V-A3）`);
  if (!(mg.lane.value >= ALLY_LANE_CLEAR_M)) bad(`station は気づかれていない斉射の道（斉射の点 → 泊地）から ${ALLY_LANE_CLEAR_M} m 以上（${at(mg.lane)} ${Math.round(mg.lane.value)} m。V-A4）`);
  if (!(mg.slack.value >= 0)) bad(`気づかれていない斉射の点から見た泊地と station の角は、卯月の半長の見かけの角・狙いの誤差 aim_error_deg（${tp.aimDeg}°）・斉射の外の魚雷（salvo_spacing_deg × (salvo_count − 1) / 2 = ${spreadDeg}°）の和以上（${at(mg.slack)} 余裕 ${fx(mg.slack.value, 2)}°。V-A5）`);
  return p;
}

/** 組み立ての上書き（systems/world-setup の SetupOptions の 1 鍵）: allyOff は卯月を切る（?debug&noally・模擬の ALLY_OFF。jp_04 でも v0.6.9 の S0b と同じ世界） */
export interface AllyDestroyerSetupOptions {
  allyOff?: boolean;
}

/** WorldSetup に展開する部分: 卯月の無い任務・allyOff は {}（allyDestroyer の鍵ごと出ない＝他の任務の setup の snapshot が変わらない。gunboatSetupPart と同じ作法） */
export function allyDestroyerSetupPart(data: GameData, mission: PrototypeMission, ptBase: PtParams | null, landing: LandingSetup | null, o: AllyDestroyerSetupOptions): { allyDestroyer?: AllyDestroyerParams } {
  const p = o.allyOff ? null : getAllyDestroyerParams(data, mission, ptBase, landing);
  return p ? { allyDestroyer: p } : {};
}

/**
 * Boot の検査（spec §3.3）: v0_1_prototype.ally_destroyer のある任務ごとに、ノーマルとハード（あれば）の卯月の値を 1 回組み（V-A1〜V-A6・V-A8。今夜の揺らぎの前の隊で。
 * 壊れていれば Boot で止まる）、V-A7: 探照灯の cone_deg は Boot が探照灯の絵（TEXTURE_KEYS.searchlight）に使う角 textureConeDeg と同じ（絵は 1 枚）、V-A8: block は 1 任務だけ（扇の絵は 1 枚）。
 * 戻りは最初の任務のノーマルの値（扇と艦の絵の寸法。S5）。無ければ null
 */
export function validateAllyDestroyerMissions(data: GameData, timeScale: number, textureConeDeg: number): AllyDestroyerParams | null {
  let first: AllyDestroyerParams | null = null;
  let owner = '';
  for (const m of data.missionsSeed.missions as readonly Rec[]) {
    const proto = m['v0_1_prototype'] as Rec | undefined;
    const id = m['id'];
    if (!proto || proto[ALLY_DESTROYER_BLOCK_KEY] === undefined || typeof id !== 'string') continue;
    const label = `${id}.v0_1_prototype.${ALLY_DESTROYER_BLOCK_KEY}`;
    if (owner !== '') allyBad(label)(`卯月の block は 1 任務だけ（${owner} にもある。海の上の扇の絵は 1 枚。V-A8）`);
    owner = id;
    for (const hard of hasHardVariant(data, id) ? [false, true] : [false]) {
      const pm = getPrototypeMission(data, id, hard);
      const pt = pm.ptBoats ? getPtParams(data, pm, timeScale) : null;
      const ld = getLandingSetup(data, pm, pt, pt, data.hitRateModel.world.ship_hit_scale);
      const p = getAllyDestroyerParams(data, pm, pt, ld)!;
      const cone = p.gunnery.searchlight.coneDeg;
      if (cone !== textureConeDeg) allyBad(label)(`${p.shipId} の searchlight.cone_deg（${cone}°）は探照灯の絵の角（${textureConeDeg}°。Boot が us_02 の敵の駆逐艦から 1 枚作る）と同じ（V-A7）`);
      if (!first) first = p;
    }
  }
  return first;
}
