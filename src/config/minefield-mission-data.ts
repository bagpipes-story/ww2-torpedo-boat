// 機雷原（v0.8.5。us_07「D-Day・生存者救助」。spec-v0850 §4.2）の任務の読み出し: 任務の v0_1_prototype.minefield（区画 fields・掃海済みの水路 lanes・置かない余白 clear_m）と
// risk_events.json の mine.params（1 個の被害・見える距離・触れる距離）から世界の値（MinefieldSetup）を組み、data だけで決まる起動時の検査 V-X1・V-X3〜V-X5 をする（例外は鍵を名指す日本語）。
// V-X2（置ける面積があり、ノーマルの数の 80% 以上が置ける。v0.8.5 S1）は Boot の validateMinefieldMissions が決まった格子で見る（checkMinefieldPlaceable。群は ±ずれを足した円で広めに）。
// 置き方の組み立て（core/rescue-field・seed+47）を seed 1〜32 で回す tests/minefield も同じ 80% を確かめる。
// block は生の proto から読む（PrototypeMission に鍵は足さない＝ほかの任務の setup の snapshot が変わらない）。S0 では世界は何も読まない（置き方と触雷は S1・配線は S2）。
import { getBoatDamageParams, type GameData, type PrototypeMission } from './game-data';
import { getPrototypeMission, hasHardVariant } from './mission-data';
import { getRescueParams, type RescueSetup } from './rescue-mission-data';
import { segDistM } from '../core/ally-geometry';
import { minefieldFreeShare } from '../core/minefield';
import { createRescueState } from '../core/rescue';
import { mineKeepOut, type RescueFieldSite } from '../core/rescue-field';
import { checkFriendlyRoute } from './rescue-friendly-data';

/** V-X1: minefield の鍵（ちょうどこれ）・機雷の数の上限（固定長の配列の大きさ。v0.8.5 IP1 で 48 → 64＝実機 1 回目のユーザー「機雷の敷設エリアを現在の2倍ほど」で面積と数を約 2 倍＝ノーマル 48・ハード 64）。V-X3: mine.params の鍵。V-X4: 水路がつなぐコリーの周りの円の半径 m。V-X5: 危険の id */
export const MINEFIELD_KEYS = ['fields', 'lanes', 'clear_m', 'source'] as const;
export const MINE_PARAM_KEYS = ['damage', 'fire_chance', 'engine_damage_chance', 'sight_m', 'contact_m', 'source'] as const;
export const MINEFIELD_MAX = 64;
export const MINEFIELD_LANE_CORRY_M = 400;
export const MINE_EVENT_ID = 'mine';
/** V-X2: 置ける見込みの下限（ノーマルの数に対する割合）と、置ける面積を数える格子の間隔 m */
export const MINEFIELD_PLACEABLE_SHARE = 0.8;
export const MINEFIELD_GRID_STEP_M = 20;

/** 機雷原の世界の値（WorldSetup.minefield。S1 の core/minefield・S2 の systems/world-mines が読む）。count はこの難易度の数、maxCount はハードの数（引く回数＝難易度に依らず固定） */
export interface MinefieldSetup {
  fields: { x: number; y: number; w: number; h: number; normal: number; hardExtra: number }[];
  count: number;
  maxCount: number;
  lanes: { x0: number; y0: number; x1: number; y1: number; widthM: number }[];
  clearM: number;
  mine: { damage: number; fireChance: number; engineDamageChance: number; sightM: number; sight2: number; contactM: number };
}

type Rec = Record<string, unknown>;
const isObj = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

function closedKeys(r: Rec, keys: readonly string[]): boolean {
  const ks = Object.keys(r);
  return ks.length === keys.length && keys.every((k) => k in r);
}

/** 2 本の線分の最短 m（交われば 0） */
function segSegM(a: MinefieldSetup['lanes'][number], b: MinefieldSetup['lanes'][number]): number {
  const cross = (ox: number, oy: number, px: number, py: number, qx: number, qy: number): number => (px - ox) * (qy - oy) - (py - oy) * (qx - ox);
  const d1 = cross(a.x0, a.y0, a.x1, a.y1, b.x0, b.y0);
  const d2 = cross(a.x0, a.y0, a.x1, a.y1, b.x1, b.y1);
  const d3 = cross(b.x0, b.y0, b.x1, b.y1, a.x0, a.y0);
  const d4 = cross(b.x0, b.y0, b.x1, b.y1, a.x1, a.y1);
  if (d1 * d2 < 0 && d3 * d4 < 0) return 0;
  return Math.min(segDistM(b.x0, b.y0, a.x0, a.y0, a.x1, a.y1), segDistM(b.x1, b.y1, a.x0, a.y0, a.x1, a.y1), segDistM(a.x0, a.y0, b.x0, b.y0, b.x1, b.y1), segDistM(a.x1, a.y1, b.x0, b.y0, b.x1, b.y1));
}

/** 任務の機雷原の値。v0_1_prototype.minefield の無い任務は null（hazards に mine があれば例外）。壊れていれば「<任務>.v0_1_prototype.minefield…（V-Xn・spec-v0850 §4.2）」 */
export function getMinefieldParams(data: GameData, mission: PrototypeMission): MinefieldSetup | null {
  const m = (data.missionsSeed.missions as readonly Rec[]).find((x) => x['id'] === mission.id);
  const proto = isObj(m?.['v0_1_prototype']) ? (m['v0_1_prototype'] as Rec) : null;
  if (!proto) return null;
  const at = `${mission.id}.v0_1_prototype`;
  const bad = (v: string, msg: string): never => {
    throw new Error(`${at}.${msg}（${v}・spec-v0850 §4.2）`);
  };
  const raw = proto['minefield'];
  // V-X5 置き場: hazards に mine のある任務だけ（mine のある任務には要る＝Briefing の危険が起きない、を作らない）
  const hasMine = mission.hazards.includes(MINE_EVENT_ID);
  if (raw === undefined) {
    if (hasMine) bad('V-X5', `hazards に ${MINE_EVENT_ID} があるのに minefield が無い`);
    return null;
  }
  if (!hasMine) bad('V-X5', `minefield は hazards に ${MINE_EVENT_ID} のある任務だけ`);
  if (!isObj(raw) || !closedKeys(raw, MINEFIELD_KEYS)) return bad('V-X1', `minefield の鍵はちょうど ${MINEFIELD_KEYS.join('・')}（${isObj(raw) ? Object.keys(raw).join('・') : '形が違う'}）`);
  if (!isText(raw['source'])) bad('V-X1', 'minefield.source は空でない文字列');
  const clearM = raw['clear_m'];
  if (!(isNum(clearM) && clearM >= 0)) bad('V-X1', 'minefield.clear_m は 0 以上');
  // V-X1 形: 区画と水路は海域の中・数の合計（ハード）≤ MINEFIELD_MAX
  const { width, height } = mission.bounds;
  const fs = raw['fields'];
  if (!Array.isArray(fs) || fs.length < 1) return bad('V-X1', 'minefield.fields は空でない配列');
  const fields: MinefieldSetup['fields'] = [];
  for (let i = 0; i < fs.length; i++) {
    const f = fs[i] as unknown;
    if (!Array.isArray(f) || f.length !== 6 || !f.slice(0, 4).every(isNum) || !isCount(f[4]) || !isCount(f[5])) return bad('V-X1', `minefield.fields[${i}] は [x, y, 幅, 高さ, ノーマルの数, ハードで足す数]（数は 0 以上の整数）`);
    const [x, y, w, h] = f as number[];
    if (!(w! > 0 && h! > 0 && x! >= 0 && y! >= 0 && x! + w! <= width && y! + h! <= height)) bad('V-X1', `minefield.fields[${i}]（${x}, ${y}・${w} × ${h}）は海域の中の正の大きさの矩形`);
    fields.push({ x: x!, y: y!, w: w!, h: h!, normal: f[4] as number, hardExtra: f[5] as number });
  }
  const normalCount = fields.reduce((s, f) => s + f.normal, 0);
  const maxCount = fields.reduce((s, f) => s + f.normal + f.hardExtra, 0);
  if (!(normalCount >= 1 && maxCount <= MINEFIELD_MAX)) bad('V-X1', `minefield の数はノーマル 1 以上・ハードの合計 ${MINEFIELD_MAX} 以下（${normalCount}・${maxCount}）`);
  const ls = raw['lanes'];
  if (!Array.isArray(ls) || ls.length < 1) return bad('V-X1', 'minefield.lanes は空でない配列');
  const lanes: MinefieldSetup['lanes'] = [];
  for (let i = 0; i < ls.length; i++) {
    const l = ls[i] as unknown;
    if (!Array.isArray(l) || l.length !== 5 || !l.every(isNum)) return bad('V-X1', `minefield.lanes[${i}] は [x0, y0, x1, y1, 幅] の数`);
    const [x0, y0, x1, y1, wd] = l as number[];
    if (!(wd! > 0 && [x0!, x1!].every((x) => x >= 0 && x <= width) && [y0!, y1!].every((y) => y >= 0 && y <= height))) bad('V-X1', `minefield.lanes[${i}] の端は海域の中・幅は正`);
    lanes.push({ x0: x0!, y0: y0!, x1: x1!, y1: y1!, widthM: wd! });
  }
  // V-X3: 1 個の値（risk_events の mine.params）。sight_m > contact_m > 0・damage < 自艇の HP
  const ev = (data.riskEvents.events as readonly Rec[]).find((e) => e['id'] === MINE_EVENT_ID);
  const p = ev?.['params'];
  if (!isObj(p) || !closedKeys(p, MINE_PARAM_KEYS)) return bad('V-X3', `risk_events.json の mine.params の鍵はちょうど ${MINE_PARAM_KEYS.join('・')}`);
  for (const k of MINE_PARAM_KEYS) if (k !== 'source' && !isNum(p[k])) bad('V-X3', `risk_events.json の mine.params.${k} は数`);
  if (!isText(p['source'])) bad('V-X3', 'risk_events.json の mine.params.source は空でない文字列');
  const [damage, fire, engine, sight, contact] = [p['damage'], p['fire_chance'], p['engine_damage_chance'], p['sight_m'], p['contact_m']] as number[];
  if (!(sight! > contact! && contact! > 0)) bad('V-X3', `risk_events.json の mine.params は sight_m（${sight}）＞ contact_m（${contact}）＞ 0`);
  const hp = getBoatDamageParams(data, mission.playerBoatId).maxHp;
  if (!(damage! > 0 && damage! < hp)) bad('V-X3', `risk_events.json の mine.params.damage（${damage}）は 0 より大きく自艇（${mission.playerBoatId}）の HP ${hp} 未満（1 個では沈まない）`);
  if (!(fire! >= 0 && fire! <= 1 && engine! >= 0 && engine! <= 1)) bad('V-X3', 'risk_events.json の mine.params の fire_chance・engine_damage_chance は 0〜1');
  // V-X4: 水路が帰投の輪・フィッチの輪・コリーの 400 m の内をつなぐ（帯が円に掛かるか、帯どうしが触れれば辺）
  const rescue = getRescueParams(data, mission);
  if (!rescue) return bad('V-X4', 'minefield は救助（rescue）の任務だけ（水路は帰投の輪・フィッチ・コリーをつなぐ）');
  const rp = mission.returnPoint;
  const circles = [[rp.x, rp.y, rp.radiusM], [rescue.fitch.x, rescue.fitch.y, rescue.fitch.ringM], [rescue.corry.x, rescue.corry.y, MINEFIELD_LANE_CORRY_M]] as const;
  const n = circles.length + lanes.length;
  const linked = (i: number, j: number): boolean => {
    if (i < circles.length && j < circles.length) return false;
    if (i >= circles.length && j >= circles.length) {
      const a = lanes[i - circles.length]!, b = lanes[j - circles.length]!;
      return segSegM(a, b) <= (a.widthM + b.widthM) / 2;
    }
    const [c, l] = i < circles.length ? [circles[i]!, lanes[j - circles.length]!] : [circles[j]!, lanes[i - circles.length]!];
    return segDistM(c[0], c[1], l.x0, l.y0, l.x1, l.y1) <= c[2] + l.widthM / 2;
  };
  const seen = [true, ...new Array<boolean>(n - 1).fill(false)];
  for (let grew = true; grew; ) {
    grew = false;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (seen[i] && !seen[j] && linked(i, j)) { seen[j] = true; grew = true; }
  }
  if (!seen[1]) bad('V-X4', 'minefield.lanes は帰投の輪からフィッチの輪へつながらない（道が無い）');
  if (!seen[2]) bad('V-X4', `minefield.lanes は帰投の輪からコリーの ${MINEFIELD_LANE_CORRY_M} m の内へつながらない（道が無い）`);
  return {
    fields,
    count: mission.hard ? maxCount : normalCount,
    maxCount,
    lanes,
    clearM: clearM as number,
    mine: { damage: damage!, fireChance: fire!, engineDamageChance: engine!, sightM: sight!, sight2: sight! * sight!, contactM: contact! },
  };
}

/** WorldSetup に展開する部分: 機雷原の無い任務は {}（minefield の鍵ごと出ない＝ほかの任務の setup の snapshot が変わらない） */
export function minefieldSetupPart(data: GameData, mission: PrototypeMission): { minefield?: MinefieldSetup } {
  const p = getMinefieldParams(data, mission);
  return p ? { minefield: p } : {};
}

/** 置かない所を作る材料（core/rescue-field。出発・帰投の輪・フィッチの輪・コリー・浅瀬）。世界の組み立て（S2）と V-X2 と tests が使う */
export function rescueFieldSite(mission: PrototypeMission, rescue: RescueSetup): RescueFieldSite {
  return { start: mission.playerStart, returnRing: mission.returnPoint, fitch: rescue.fitch, corry: rescue.corry, shallows: mission.shallows };
}

/**
 * V-X2（v0.8.5 S1）: 区画ごとに置ける面積があり（ノーマルかハードの数のある区画）、置ける割合 × ノーマルの数の和がノーマルの数の 80% 以上（決まった格子。乱数なし）。
 * 群は今夜のずれの最大（±group_jitter_m の対角）を円に足して、どの夜でも置けない所を広めに見る。壊れていれば「<任務>.v0_1_prototype.minefield…（V-X2・spec-v0850 §4.2）」。区画ごとの割合を返す
 */
export function checkMinefieldPlaceable(mission: PrototypeMission, field: MinefieldSetup, rescue: RescueSetup): number[] {
  const rs = createRescueState(rescue, 0);
  const keep = mineKeepOut(rescueFieldSite(mission, rescue), rs, rescue.groupJitterM * Math.SQRT2);
  const shares = field.fields.map((_, f) => minefieldFreeShare(field, keep, f, MINEFIELD_GRID_STEP_M));
  const at = `${mission.id}.v0_1_prototype.minefield`;
  field.fields.forEach((f, i) => {
    if (f.normal + f.hardExtra > 0 && !(shares[i]! > 0)) throw new Error(`${at}.fields[${i}] に置ける所が無い（水路・輪・出発・コリー・群・浅瀬の余白 ${field.clearM} m 込み。V-X2・spec-v0850 §4.2）`);
  });
  const normal = field.fields.reduce((a, f) => a + f.normal, 0);
  const expect = field.fields.reduce((a, f, i) => a + f.normal * shares[i]!, 0);
  if (!(expect >= normal * MINEFIELD_PLACEABLE_SHARE)) throw new Error(`${at} の置ける見込み ${expect.toFixed(1)} 個はノーマルの数 ${normal} の ${MINEFIELD_PLACEABLE_SHARE * 100}% 未満（V-X2・spec-v0850 §4.2）`);
  return shares;
}

/** Boot の検査: v0_1_prototype を持つ全任務（ハードも）を 1 回組む（壊れていれば Boot で止まる）。V-X2 も（v0.8.5 S1）・V-F4 も（v0.8.5 IP3）。最初の機雷原の任務の値（ノーマル）を返す（無ければ null） */
export function validateMinefieldMissions(data: GameData): MinefieldSetup | null {
  let first: MinefieldSetup | null = null;
  for (const m of data.missionsSeed.missions as readonly Rec[]) {
    const id = m['id'];
    if (typeof id !== 'string' || !m['v0_1_prototype']) continue;
    for (const hard of hasHardVariant(data, id) ? [false, true] : [false]) {
      const mission = getPrototypeMission(data, id, hard);
      const p = getMinefieldParams(data, mission);
      const r = p ? getRescueParams(data, mission)! : null;
      if (p && r) checkMinefieldPlaceable(mission, p, r);
      if (p && r && r.friendly) checkFriendlyRoute(mission, r.friendly, p, r.groups, r.groupJitterM); // V-F4（v0.8.5 IP3）: 味方の艇の道は水路の帯の内
      if (p && !first) first = p;
    }
  }
  return first;
}
