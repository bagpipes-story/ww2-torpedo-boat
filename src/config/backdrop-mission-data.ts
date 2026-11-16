// 暗い岸を背に（v0.8.1。us_06「オルモック湾の決着」。spec-v0810 §3.3・§4.1・§4.4・§4.5）の任務の読み出し: 任務の v0_1_prototype.shore_backdrop があれば、
// 艦から自艇への線を自艇の向こうへ伸ばして behind_m の内で陸の岸の線に当たる時に、その艦の見つける距離に掛ける係数と X²（世界の値 BackdropSetup）を組み、
// 起動時の検査 V-B1〜V-B3 をする（例外は鍵を名指す日本語）。block は生の proto から読む（PrototypeMission に鍵は足さない）。world-setup が組み立てのたびに（backdropSetupPart）、
// Boot が全任務（ハードも）を 1 回（validateBackdropMissions）呼ぶ。S0 では世界は何も読まない（幾何は S1 の core/strait-geometry の landBehind、配線は S2 の systems/shore-backdrop）。
import type { GameData, PrototypeMission } from './game-data';
import { getPrototypeMission, hasHardVariant } from './mission-data';

/** V-B1: shore_backdrop の鍵（閉じた集合。どれも要る） */
export const BACKDROP_KEYS = ['detect_factor', 'behind_m', 'source'] as const;

/** 暗い岸を背にの世界の値（WorldSetup.backdrop） */
export interface BackdropSetup {
  /** 背に岸がある艦の見つける距離に掛ける係数（0〜1 の間） */
  detectFactor: number;
  /** 自艇の向こうの陸までの距離の上限 m（X）とその 2 乗（幾何は 2 乗で比べる＝平方根なし） */
  behindM: number;
  behindM2: number;
}

/** 組み立ての上書き（systems/world-setup の SetupOptions の 1 鍵）: backdropOff はその任務の背に岸を切る（?debug&nobackdrop。V-B3。配線は S2 の config/debug-setup） */
export interface BackdropSetupOptions {
  backdropOff?: boolean;
}

type Rec = Record<string, unknown>;
const isObj = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** 任務の暗い岸を背にの値。v0_1_prototype.shore_backdrop の無い任務は null。壊れていれば「<任務>.v0_1_prototype.shore_backdrop…（V-Bn・spec-v0810 §4.4）」 */
export function getBackdropParams(data: GameData, mission: PrototypeMission): BackdropSetup | null {
  const m = (data.missionsSeed.missions as readonly Rec[]).find((x) => x['id'] === mission.id);
  const proto = isObj(m?.['v0_1_prototype']) ? (m['v0_1_prototype'] as Rec) : null;
  const raw = proto?.['shore_backdrop'];
  if (!proto || raw === undefined) return null;
  const at = `${mission.id}.v0_1_prototype.shore_backdrop`;
  const bad = (v: string, msg: string): never => {
    throw new Error(`${at}${msg}（${v}・spec-v0810 §4.4）`);
  };
  // V-B1 形: 鍵の閉じた集合・0 ＜ 係数 ＜ 1・0 ＜ 距離 ≤ 海域の対角・出典
  if (!isObj(raw)) return bad('V-B1', ' は object');
  const keys = Object.keys(raw);
  if (keys.length !== BACKDROP_KEYS.length || !BACKDROP_KEYS.every((k) => keys.includes(k))) bad('V-B1', `: 鍵はちょうど ${BACKDROP_KEYS.join('・')}（${keys.join('・') || 'なし'}）`);
  const f = raw['detect_factor'];
  if (!(isNum(f) && f > 0 && f < 1)) bad('V-B1', `.detect_factor は 0 ＜ 係数 ＜ 1（${String(f)}）`);
  const diag = Math.hypot(mission.bounds.width, mission.bounds.height);
  const x = raw['behind_m'];
  if (!(isNum(x) && x > 0 && x <= diag)) bad('V-B1', `.behind_m は 0 ＜ 距離 ≤ 海域の対角（${diag.toFixed(1)} m。${String(x)}）`);
  if (!(typeof raw['source'] === 'string' && raw['source'].trim() !== '')) bad('V-B1', '.source は空でない文字列');
  // V-B2 置き場: 岸の線のある任務（coast の south か shores）・駆逐艦の任務だけ（大発・米PT の任務は発見の仕組みが別）
  if (!mission.coast && proto['shores'] === undefined) bad('V-B2', ' は岸の線のある任務（coast の south か shores）だけ');
  if (!mission.enemyStart || mission.barges || mission.ptBoats) bad('V-B2', ' は駆逐艦の任務（enemy_start）だけ（大発・米PT の任務は発見の仕組みが別）');
  const behindM = x as number;
  return { detectFactor: f as number, behindM, behindM2: behindM * behindM };
}

/** WorldSetup に展開する部分: 背に岸の無い任務・backdropOff の夜は {}（backdrop の鍵ごと出ない＝ほかの任務の setup の snapshot が変わらない。V-B3） */
export function backdropSetupPart(data: GameData, mission: PrototypeMission, o: BackdropSetupOptions): { backdrop?: BackdropSetup } {
  const p = o.backdropOff ? null : getBackdropParams(data, mission);
  return p ? { backdrop: p } : {};
}

/** Boot の検査: v0_1_prototype を持つ全任務（ハードも）を 1 回組む（壊れていれば Boot で止まる）。最初の背に岸の任務の値（ノーマル）を返す（無ければ null） */
export function validateBackdropMissions(data: GameData): BackdropSetup | null {
  let first: BackdropSetup | null = null;
  for (const m of data.missionsSeed.missions as readonly Rec[]) {
    const id = m['id'];
    if (typeof id !== 'string' || !m['v0_1_prototype']) continue;
    for (const hard of hasHardVariant(data, id) ? [false, true] : [false]) {
      const p = getBackdropParams(data, getPrototypeMission(data, id, hard));
      if (p && !first) first = p;
    }
  }
  return first;
}
