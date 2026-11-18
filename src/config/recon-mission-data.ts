// 報告・無線・中継（v0.8.2。us_05「スリガオ海峡・最初の接触」の type recon_and_attack。spec-v0820 §4.5 D-N1〜D-N7・§5.3）の任務の読み出し: 任務の v0_1_prototype.recon があれば、
// 報告の条件（艦種 identify_class の艦を目で確かめ、レーダーで track_s 追う）・無線の故障（damage が radio_min_damage 以上の砲弾 1 発ごとに radio_fail_chance）・中継の輪（relay）から
// 世界の値（ReconSetup）を組み、起動時の検査 V-N1〜V-N5 をする（例外は鍵を名指す日本語）。block は生の proto から読む（PrototypeMission に鍵は足さない＝transit-mission-data と同じ作法）。
// S0 では世界は何も読まない（setup の鍵が出るだけ。規則は S1 の core/recon-report、配線は S2 の systems/world-recon・乱数 seed+34）。
import type { GameData, PrototypeMission } from './game-data';
import { getPrototypeMission, hasHardVariant } from './mission-data';
import { SHIP_CLASSES, getColumnPlan, type ShipClass } from './column-mission-data';
import { getRadarParams } from './radar-mission-data';

/** V-N1: recon と relay の鍵（ちょうどこれ）・追う秒の範囲 */
export const RECON_KEYS = ['track_s', 'identify_class', 'radio_fail_chance', 'radio_min_damage', 'relay', 'source'] as const;
export const RECON_RELAY_KEYS = ['x_m', 'y_m', 'radius_m', 'label_ja'] as const;
export const RECON_TRACK_RANGE_S = [5, 60] as const;
/** V-N2: recon を置ける任務の type（scoring.json の objective_by_type の鍵）。V-N3: 中継の輪は岸の線からこの m より沖 */
export const RECON_MISSION_TYPE = 'recon_and_attack';
export const RECON_CHECK_SHORE_CLEAR_M = 400;

/** 報告の世界の値（WorldSetup.recon。S2 の systems/world-recon が読む） */
export interface ReconSetup {
  trackS: number;
  identifyClass: ShipClass;
  /** 報告を送る前に、damage がこれ以上の敵の艦の砲弾を受けるたびに無線が壊れる確率（?debug&noradio は 0・radiofail は 1） */
  radioFailChance: number;
  radioMinDamage: number;
  /** 中継の輪（隣の分隊。黄色）: 中心・半径・半径の 2 乗・名 */
  relay: { x: number; y: number; radiusM: number; radius2: number; labelJa: string };
}

/** 組み立ての上書き（SetupOptions の 2 鍵。V-N5）: radioOff は無線が壊れない（?debug&noradio）・radioFail は必ず壊れる（?debug&radiofail）。URL の配線は v0.8.2 S2 */
export interface ReconSetupOptions {
  radioOff?: boolean;
  radioFail?: boolean;
}

type Rec = Record<string, unknown>;
const isObj = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function closed(raw: Rec, keys: readonly string[], at: string, bad: (v: string, msg: string) => never): void {
  const ks = Object.keys(raw);
  if (ks.length !== keys.length || !keys.every((k) => k in raw)) bad('V-N1', `${at} の鍵はちょうど ${keys.join('・')}（${ks.join('・')}）`);
}

/** 任務の報告の値。v0_1_prototype.recon の無い任務は null（type が recon_and_attack の遊べる任務に無ければ例外）。壊れていれば「<任務>.v0_1_prototype.recon…（V-Nn・spec-v0820 §5.3）」 */
export function getReconParams(data: GameData, mission: PrototypeMission, o: ReconSetupOptions = {}): ReconSetup | null {
  const m = (data.missionsSeed.missions as readonly Rec[]).find((x) => x['id'] === mission.id);
  const proto = isObj(m?.['v0_1_prototype']) ? (m['v0_1_prototype'] as Rec) : null;
  if (!proto) return null;
  const at = `${mission.id}.v0_1_prototype`;
  const bad = (v: string, msg: string): never => { throw new Error(`${at}.${msg}（${v}・spec-v0820 §5.3）`); };
  const raw = proto['recon'];
  if (raw === undefined) {
    if (mission.type === RECON_MISSION_TYPE) bad('V-N2', `recon は type ${RECON_MISSION_TYPE} の任務に要る（報告の条件と中継の輪）`);
    return null;
  }
  // V-N1 形: 鍵の閉じた集合・追う秒・確率・ダメージ・中継の輪・出典
  if (!isObj(raw)) return bad('V-N1', 'recon は object');
  closed(raw, RECON_KEYS, 'recon', bad);
  const [tMin, tMax] = RECON_TRACK_RANGE_S;
  const trackS = raw['track_s'];
  if (!(isNum(trackS) && trackS >= tMin && trackS <= tMax)) bad('V-N1', `recon.track_s は ${tMin}〜${tMax} 秒（${String(trackS)}）`);
  const chance = raw['radio_fail_chance'];
  if (!(isNum(chance) && chance >= 0 && chance <= 1)) bad('V-N1', `recon.radio_fail_chance は 0〜1（${String(chance)}）`);
  const minDamage = raw['radio_min_damage'];
  if (!(isNum(minDamage) && minDamage > 0)) bad('V-N1', `recon.radio_min_damage は正（${String(minDamage)}）`);
  const cls = raw['identify_class'];
  if (!(SHIP_CLASSES as readonly unknown[]).includes(cls)) bad('V-N1', `recon.identify_class は ${SHIP_CLASSES.join('・')} のどれか（${String(cls)}）`);
  if (!(typeof raw['source'] === 'string' && raw['source'].trim() !== '')) bad('V-N1', 'recon.source は空でない文字列');
  const rl = raw['relay'];
  if (!isObj(rl)) return bad('V-N1', 'recon.relay は object');
  closed(rl, RECON_RELAY_KEYS, 'recon.relay', bad);
  const [x, y, r] = [rl['x_m'], rl['y_m'], rl['radius_m']];
  if (!(isNum(x) && isNum(y) && isNum(r) && r > 0)) return bad('V-N1', 'recon.relay の x_m・y_m は数・radius_m は正');
  if (!(typeof rl['label_ja'] === 'string' && rl['label_ja'].trim() !== '')) bad('V-N1', 'recon.relay.label_ja は空でない文字列');
  // V-N2 置き場: type recon_and_attack の任務だけ・レーダーがある・確かめる艦種の艦が列にいる（ハード込みでなくノーマルの列で）
  if (mission.type !== RECON_MISSION_TYPE) bad('V-N2', `recon は type ${RECON_MISSION_TYPE} の任務だけ（${mission.type}）`);
  if (!getRadarParams(data, mission)) bad('V-N2', 'recon はレーダー（v0_1_prototype.radar）のある任務だけ（レーダーで追って報告する）');
  const plan = getColumnPlan(data, getPrototypeMission(data, mission.id, false), null, false);
  if (!plan || !plan.kits.some((k) => k.shipClass === cls)) bad('V-N2', `recon.identify_class（${String(cls)}）の艦が片道の列（transit.column）にいない`);
  // V-N3 中継の輪: 海域の内・帰投の輪と出発点に重ならない・岸の線から 400 m より沖
  const { width, height } = mission.bounds;
  if (!(x - r >= 0 && x + r <= width && y - r >= 0 && y + r <= height)) bad('V-N3', `recon.relay（${x}, ${y}・半径 ${r}）は海域の内`);
  const rp = mission.returnPoint;
  if (!(Math.hypot(x - rp.x, y - rp.y) > r + rp.radiusM)) bad('V-N3', 'recon.relay は帰投の輪に重ならない');
  const ps = mission.playerStart;
  if (!(Math.hypot(x - ps.x, y - ps.y) > r)) bad('V-N3', 'recon.relay は出発点にかからない');
  const shoreYs = proto['shores'] !== undefined ? [0, height] : mission.coast ? [height] : [];
  if (!shoreYs.every((ly) => Math.abs(ly - y) - r >= RECON_CHECK_SHORE_CLEAR_M)) bad('V-N3', `recon.relay の縁は岸の線から ${RECON_CHECK_SHORE_CLEAR_M} m 以上沖`);
  // V-N4 点: scoring.json に type の達成の点がある
  if (typeof (data.scoring.objective_by_type as Record<string, unknown>)[mission.type] !== 'number') bad('V-N4', `scoring.json の objective_by_type に ${mission.type} が無い`);
  // V-N5 上書き: 確率だけ替える（noradio は 0・radiofail は 1。両方は無い）
  if (o.radioOff && o.radioFail) bad('V-N5', '?debug&noradio と radiofail は一緒に使えない');
  return { trackS: trackS as number, identifyClass: cls as ShipClass, radioFailChance: o.radioOff ? 0 : o.radioFail ? 1 : (chance as number), radioMinDamage: minDamage as number, relay: { x, y, radiusM: r, radius2: r * r, labelJa: rl['label_ja'] as string } };
}

/** WorldSetup に展開する部分: 報告の無い任務は {}（recon の鍵ごと出ない＝ほかの任務の setup の snapshot が変わらない） */
export function reconSetupPart(data: GameData, mission: PrototypeMission, o: ReconSetupOptions = {}): { recon?: ReconSetup } {
  const p = getReconParams(data, mission, o);
  return p ? { recon: p } : {};
}

/** Boot の検査: v0_1_prototype を持つ全任務（ハードも）を 1 回組む（壊れていれば Boot で止まる）。最初の報告の任務の値（ノーマル）を返す（無ければ null） */
export function validateReconMissions(data: GameData): ReconSetup | null {
  let first: ReconSetup | null = null;
  for (const m of data.missionsSeed.missions as readonly Rec[]) {
    const id = m['id'];
    if (typeof id !== 'string' || !m['v0_1_prototype']) continue;
    for (const hard of hasHardVariant(data, id) ? [false, true] : [false]) {
      const p = getReconParams(data, getPrototypeMission(data, id, hard));
      if (p && !first) first = p;
    }
  }
  return first;
}
