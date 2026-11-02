// 味方の駆逐艦 卯月（v0.6.10。jp_04「多号作戦・オルモック湾へ」。docs/02 §6.11、spec-v0610 §3）の数値: missions_seed の v0_1_prototype.ally_destroyer（ちょうど 14 鍵）の形と
// 値の検査（V-A6）、艦の記録（enemies.json の ship_id）の読み出しを持ち、AllyDestroyerParams を組む。艦の記録は getEnemyRecord を通さない（リードの決定 LD7。止まった艦なので
// AI・回避・体当たりの値を持たない＝getEnemyRecord は例外になる）。他の記録・任務を跨ぐ検査（V-A1〜V-A5・V-A7・V-A8）は config/ally-destroyer-mission-data。
// Phaser 非依存・確保は出撃の組み立てのときだけ。距離の比較は二乗で持つ。
import { gunneryParamsFromData, isEnemyGunneryDataRecord, type EnemyGunneryDataRecord, type GunneryParams } from './gunnery';
import { ktToMps } from './units';

/** ally_destroyer の鍵（ちょうどこの 14 個）と station の鍵（ちょうど 3 個） */
export const ALLY_DESTROYER_KEYS = [
  'ship_id', 'label_ja', 'station', 'watch_arc_deg', 'guard_legs', 'lookout_slow_m', 'spot_rate_slow_per_s', 'lookout_fast_m', 'spot_rate_fast_per_s',
  'fast_kt', 'light_react_s', 'chase_fire_s', 'ring_call_before_dawn', 'source',
] as const;
export const ALLY_STATION_KEYS = ['x_m', 'y_m', 'heading_deg'] as const;
/** V-A6 の上限: 見張りの気づき方（1 秒あたり）と、照らされてからの反応・去る PT を追う秒 */
export const ALLY_RATE_MAX_PER_S = 5;
export const ALLY_TIMER_MAX_S = 5;

export interface AllyDestroyerBlock {
  ship_id: string;
  label_ja: string;
  station: { x_m: number; y_m: number; heading_deg: number };
  watch_arc_deg: [number, number];
  guard_legs: number[];
  lookout_slow_m: number;
  spot_rate_slow_per_s: number;
  lookout_fast_m: number;
  spot_rate_fast_per_s: number;
  fast_kt: number;
  light_react_s: number;
  chase_fire_s: number;
  ring_call_before_dawn: boolean;
  source: string;
}

/** 艦の記録（enemies.json）のうち使う部分: 砲・探照灯（null は不可）・星弾（null 可）・寸法。砲のちょうど 1 つが pt_sink_chance（12 cm の 1 命中で PT が沈む確率）を持つ */
export type AllyShipRecord = EnemyGunneryDataRecord & { length_m: number; beam_m: number; searchlight: NonNullable<EnemyGunneryDataRecord['searchlight']> };

/** 卯月の値（WorldSetup.allyDestroyer。core/ally-destroyer・systems/world-ally・模擬が読む。S2 以降） */
export interface AllyDestroyerParams {
  shipId: string;
  labelJa: string;
  /** 止まったままの位置と艇首（動かない） */
  x: number; y: number; headingDeg: number;
  /** 最初に気づく扇 [arc0Deg, arc1Deg]（0 = 北・時計回り・端を含む）と、扇で見張る米PT の線の添字 */
  arc0Deg: number; arc1Deg: number; guardLegs: number[];
  /** 遅い PT（fastMps 未満）・速い PT の見張りの距離 m とその二乗・1 秒あたりの気づき方。fastMps は PtBoatState.speedMps と同じ単位（ktToMps） */
  lookSlowM: number; lookSlow2: number; rateSlow: number;
  lookFastM: number; lookFast2: number; rateFast: number;
  fastMps: number;
  /** 照らされてから反応するまでの秒・去る PT を追って撃つ秒・夜明け近しの帰投の輪の呼びかけ（R-U9） */
  lightReactS: number; chaseFireS: number; ringCallBeforeDawn: boolean;
  /** 探照灯と砲（core/gunnery の形。星弾は null＝射程 0） */
  gunnery: GunneryParams;
  /** pt_sink_chance を持つ砲の添字と、その 1 命中で PT が沈む確率（hitPt の fireChance の代わり。ほかの砲は米PT の under_fire のまま） */
  sinkGunIndex: number; ptSinkChance: number;
  /** 絵の元の寸法 m（記録の値） */
  lengthM: number; beamM: number;
  /** 砲弾のプールの大きさ（config/ally-config。世界と模擬が同じ値で createShells する＝レビュー L8） */
  shellPoolSize: number;
}

/** 組み立ての他の値: 米PT の哨戒と航過の速さ kt（V-A6 の fast_kt の帯）と砲弾のプールの大きさ */
export interface AllyDestroyerContext {
  patrolKt: number;
  passKt: number;
  shellPoolSize: number;
}

type Rec = Record<string, unknown>;
const isObj = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** 例外の文: 「jp_04.v0_1_prototype.ally_destroyer: …（docs/02 §6.11）」 */
export function allyBad(label: string): (msg: string) => never {
  return (msg: string): never => {
    throw new Error(`${label}: ${msg}（docs/02 §6.11）`);
  };
}

/** 形: ちょうど ALLY_DESTROYER_KEYS・station はちょうど 3 鍵の数・watch_arc_deg は数 2 つ・guard_legs は 0 以上の整数の重なりの無い並び（1 つ以上）・ring_call_before_dawn は真偽・文字は空でない・残りは有限の数 */
export function readAllyDestroyerBlock(raw: unknown, label: string): AllyDestroyerBlock {
  const bad = allyBad(label);
  if (!isObj(raw)) return bad('object でない');
  const unknown = Object.keys(raw).filter((k) => !(ALLY_DESTROYER_KEYS as readonly string[]).includes(k));
  const missing = ALLY_DESTROYER_KEYS.filter((k) => !(k in raw));
  if (unknown.length > 0 || missing.length > 0) bad(`鍵はちょうど ${ALLY_DESTROYER_KEYS.join('・')}（知らない鍵 ${unknown.join('・') || 'なし'}・欠け ${missing.join('・') || 'なし'}）`);
  const s = raw['station'];
  if (!isObj(s) || Object.keys(s).length !== ALLY_STATION_KEYS.length || !ALLY_STATION_KEYS.every((k) => isFiniteNum(s[k]))) bad(`station はちょうど ${ALLY_STATION_KEYS.join('・')} の数`);
  for (const k of ['ship_id', 'label_ja', 'source'] as const) if (!nonEmpty(raw[k])) bad(`${k} は空でない文字列`);
  const arc = raw['watch_arc_deg'];
  if (!Array.isArray(arc) || arc.length !== 2 || !arc.every(isFiniteNum)) bad('watch_arc_deg は数 2 つ [始め, 終わり]');
  const g = raw['guard_legs'];
  if (!Array.isArray(g) || g.length === 0 || !g.every((v) => isFiniteNum(v) && Number.isInteger(v) && v >= 0) || new Set(g).size !== g.length) bad('guard_legs は 0 以上の整数の重なりの無い並び（1 つ以上。米PT の線の添字）');
  if (typeof raw['ring_call_before_dawn'] !== 'boolean') bad('ring_call_before_dawn は真偽');
  for (const k of ['lookout_slow_m', 'spot_rate_slow_per_s', 'lookout_fast_m', 'spot_rate_fast_per_s', 'fast_kt', 'light_react_s', 'chase_fire_s'] as const) if (!isFiniteNum(raw[k])) bad(`${k} は有限の数`);
  return raw as unknown as AllyDestroyerBlock;
}

/** 艦の記録の形（リードの決定 LD7 の読み出し。getEnemyRecord を通さない）: 砲・探照灯・星弾の形（core/gunnery）、探照灯は null でない、length_m・beam_m は正、pt_sink_chance を持つ砲がちょうど 1 つ */
export function isAllyShipRecord(v: unknown): v is AllyShipRecord {
  if (!isObj(v) || !isEnemyGunneryDataRecord(v) || v.searchlight === null || !('starshell' in v)) return false;
  const sinkGuns = v.guns.filter((g) => isFiniteNum((g as unknown as Rec)['pt_sink_chance'])).length;
  return isFiniteNum(v['length_m']) && v['length_m'] > 0 && isFiniteNum(v['beam_m']) && v['beam_m'] > 0 && sinkGuns === 1;
}

/**
 * 値の検査（V-A6）込みで AllyDestroyerParams を組む: station.heading_deg は 0 以上 360 未満・0 ≤ 扇の始め < 終わり ≤ 360・0 < lookout_slow_m ≤ lookout_fast_m ≤ 探照灯の range_m・
 * 気づき方は (0, ALLY_RATE_MAX_PER_S]・light_react_s と chase_fire_s は [0, ALLY_TIMER_MAX_S]・pt_sink_chance は [0, 1]・米PT の哨戒の速さ < fast_kt ≤ 航過の速さ
 */
export function allyDestroyerParamsFromData(b: AllyDestroyerBlock, ship: AllyShipRecord, ctx: AllyDestroyerContext, label: string): AllyDestroyerParams {
  const bad = allyBad(label);
  const st = b.station;
  if (!(st.heading_deg >= 0 && st.heading_deg < 360)) bad(`station.heading_deg は 0 以上 360 未満（${st.heading_deg}）`);
  const [a0, a1] = b.watch_arc_deg;
  if (!(a0 >= 0 && a0 < a1 && a1 <= 360)) bad(`watch_arc_deg は 0 ≤ 始め < 終わり ≤ 360（${a0}・${a1}。0 = 北・時計回り）`);
  const lightM = ship.searchlight.range_m;
  if (!(b.lookout_slow_m > 0 && b.lookout_slow_m <= b.lookout_fast_m && b.lookout_fast_m <= lightM)) bad(`0 < lookout_slow_m ≤ lookout_fast_m ≤ 探照灯の range_m（${b.lookout_slow_m}・${b.lookout_fast_m}・${lightM} m）`);
  for (const k of ['spot_rate_slow_per_s', 'spot_rate_fast_per_s'] as const) if (!(b[k] > 0 && b[k] <= ALLY_RATE_MAX_PER_S)) bad(`${k} は 0 より大きく ${ALLY_RATE_MAX_PER_S} 以下（${b[k]}）`);
  for (const k of ['light_react_s', 'chase_fire_s'] as const) if (!(b[k] >= 0 && b[k] <= ALLY_TIMER_MAX_S)) bad(`${k} は 0〜${ALLY_TIMER_MAX_S} 秒（${b[k]}）`);
  if (!(ctx.patrolKt < b.fast_kt && b.fast_kt <= ctx.passKt)) bad(`米PT の哨戒の速さ < fast_kt ≤ 航過の速さ（${ctx.patrolKt}・${b.fast_kt}・${ctx.passKt} kt。忍び寄る PT は遅い見張り、走る PT は速い見張り）`);
  const sinkGunIndex = ship.guns.findIndex((g) => isFiniteNum((g as unknown as Rec)['pt_sink_chance']));
  const sink = (ship.guns[sinkGunIndex] as unknown as Rec)['pt_sink_chance'] as number;
  if (!(sink >= 0 && sink <= 1)) bad(`${b.ship_id} の ${ship.guns[sinkGunIndex]!.id}.pt_sink_chance は 0〜1（${sink}）`);
  return {
    shipId: b.ship_id,
    labelJa: b.label_ja,
    x: st.x_m, y: st.y_m, headingDeg: st.heading_deg,
    arc0Deg: a0, arc1Deg: a1, guardLegs: b.guard_legs.slice(),
    lookSlowM: b.lookout_slow_m, lookSlow2: b.lookout_slow_m * b.lookout_slow_m, rateSlow: b.spot_rate_slow_per_s,
    lookFastM: b.lookout_fast_m, lookFast2: b.lookout_fast_m * b.lookout_fast_m, rateFast: b.spot_rate_fast_per_s,
    fastMps: ktToMps(b.fast_kt),
    lightReactS: b.light_react_s, chaseFireS: b.chase_fire_s, ringCallBeforeDawn: b.ring_call_before_dawn,
    gunnery: gunneryParamsFromData(ship),
    sinkGunIndex, ptSinkChance: sink,
    lengthM: ship.length_m, beamM: ship.beam_m,
    shellPoolSize: ctx.shellPoolSize,
  };
}
