// 停泊して揚陸する味方の輸送船（v0.6.9。jp_04「多号作戦・オルモック湾へ」。docs/02 §6.11、spec-v069 §4.4・§4.9 V3）: missions_seed の v0_1_prototype.landing の形と検査（V3 の形の部分）、
// 輸送船の記録（enemies.json の ship_id）と合わせて LandingParams を組む。他の記録・任務を跨ぐ検査（allies・V1〜V10・V13）は config/landing-mission-data。
// Phaser 非依存・確保は出撃の組み立てのときだけ。距離の比較は二乗で持つ。

/** landing の鍵（ちょうどこの 8 個）と anchor の鍵（ちょうど 3 個） */
export const LANDING_KEYS = ['ship_id', 'label_ja', 'anchor', 'unload_s', 'torpedo_hits_to_sink', 'lookout_m', 'mark_label_ja', 'source'] as const;
export const LANDING_ANCHOR_KEYS = ['x_m', 'y_m', 'heading_deg'] as const;
/** 揚陸の秒の上限（HUD の鍵の 8 bit。spec §5.2）と、沈むまでの命中の上限（HUD の「あと N 本」の 2 bit） */
export const LANDING_UNLOAD_MAX_S = 255;
export const LANDING_HITS_MAX = 3;

export interface LandingBlock {
  ship_id: string;
  label_ja: string;
  anchor: { x_m: number; y_m: number; heading_deg: number };
  unload_s: number;
  torpedo_hits_to_sink: number;
  lookout_m: number;
  mark_label_ja: string;
  source: string;
}

/** 輸送船の記録（enemies.json）のうち使う部分 */
export interface LandingShipRecord {
  length_m: number;
  beam_m: number;
  hull_circles: number;
}

/** 揚陸の値（WorldSetup.landing.params。core/landing・systems/world-landing・模擬が読む。S2 以降） */
export interface LandingParams {
  shipId: string;
  /** 泊地（輸送船の中心）と艇首の向き（停泊のまま動かない） */
  x: number; y: number; headingDeg: number;
  /** 絵の元の寸法 m（記録の値。絵は sprite_scale 倍）と、魚雷の当たりの船体 m（記録 × ship_hit_scale）・円の数、通り過ぎの判定の半径の二乗（destroyer-setup と同じ式） */
  lengthM: number; beamM: number; hitLenM: number; hitBeamM: number; circles: number; passRadius2: number;
  /** 沈むまでの命中（任務の上書き。記録の torpedo_hits_to_sink は読まない）・揚陸の秒（出撃からの実秒＝世界の stepTimeS。命中スローで遅れない） */
  hitsToSink: number; unloadS: number;
  /** 見張りの報告の距離 m とその二乗、慌てる距離の二乗（0 なら慌てた斉射なし）と気づかれていない斉射の距離 m（torpedo_attack の写し。報告の遠い・近い） */
  lookoutM: number; lookout2: number; hurried2: number; launchM: number;
  labelJa: string; markLabelJa: string;
  /** 今夜の PT の来る方角（泊地から見た出発点の 8 方位。線の順・重なりは 1 つ。2 つは「と」、3 つ以上は「・」でつなぐ）と、PT ごとの方角（Result の雷撃の行） */
  fromDirsJa: string; runDirJa: string[];
}

/** 組み立ての他の値: 当たりの倍率（ship_hit_scale）・雷撃の 2 距離・今夜の PT ごとの方角 */
export interface LandingContext {
  hitScale: number;
  hurriedM: number;
  launchM: number;
  runDirJa: readonly string[];
}

type Rec = Record<string, unknown>;
const isObj = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** V3 の形: ちょうど LANDING_KEYS・anchor はちょうど 3 鍵の数。unload_s は 1〜255 の整数、torpedo_hits_to_sink は 1〜3 の整数、lookout_m は正、文字は空でない。label は「<任務>.v0_1_prototype.landing」 */
export function readLandingBlock(raw: unknown, label: string): LandingBlock {
  const bad = (msg: string): never => {
    throw new Error(`${label}: ${msg}（docs/02 §6.11）`);
  };
  if (!isObj(raw)) return bad('object でない');
  const keys = Object.keys(raw);
  const unknown = keys.filter((k) => !(LANDING_KEYS as readonly string[]).includes(k));
  const missing = LANDING_KEYS.filter((k) => !(k in raw));
  if (unknown.length > 0 || missing.length > 0) bad(`鍵はちょうど ${LANDING_KEYS.join('・')}（知らない鍵 ${unknown.join('・') || 'なし'}・欠け ${missing.join('・') || 'なし'}）`);
  const a = raw['anchor'];
  if (!isObj(a) || Object.keys(a).length !== LANDING_ANCHOR_KEYS.length || !LANDING_ANCHOR_KEYS.every((k) => isFiniteNum(a[k]))) bad(`anchor はちょうど ${LANDING_ANCHOR_KEYS.join('・')} の数`);
  const hd = (a as Rec)['heading_deg'] as number;
  if (!(hd >= 0 && hd < 360)) bad('anchor.heading_deg は 0 以上 360 未満');
  for (const k of ['ship_id', 'label_ja', 'mark_label_ja', 'source'] as const) if (!nonEmpty(raw[k])) bad(`${k} は空でない文字列`);
  const unload = raw['unload_s'];
  if (!(isFiniteNum(unload) && Number.isInteger(unload) && unload >= 1 && unload <= LANDING_UNLOAD_MAX_S)) bad(`unload_s は 1〜${LANDING_UNLOAD_MAX_S} の整数`);
  const hits = raw['torpedo_hits_to_sink'];
  if (!(isFiniteNum(hits) && Number.isInteger(hits) && hits >= 1 && hits <= LANDING_HITS_MAX)) bad(`torpedo_hits_to_sink は 1〜${LANDING_HITS_MAX} の整数`);
  const look = raw['lookout_m'];
  if (!(isFiniteNum(look) && look > 0)) bad('lookout_m は正の数');
  return raw as unknown as LandingBlock;
}

/** 輸送船の記録の形（length_m・beam_m は正、hull_circles は 2 以上の整数＝fillHullCircles の帯） */
export function isLandingShipRecord(v: unknown): v is LandingShipRecord {
  if (!isObj(v)) return false;
  const c = v['hull_circles'];
  return isFiniteNum(v['length_m']) && v['length_m'] > 0 && isFiniteNum(v['beam_m']) && v['beam_m'] > 0 && isFiniteNum(c) && Number.isInteger(c) && c >= 2;
}

/** 今夜の PT ごとの方角（線の順）から「北と東」「北・東・北東」（重なりは 1 つ） */
export function joinDirsJa(dirs: readonly string[]): string {
  const uniq: string[] = [];
  for (const d of dirs) if (!uniq.includes(d)) uniq.push(d);
  return uniq.join(uniq.length === 2 ? 'と' : '・');
}

export function landingParamsFromData(b: LandingBlock, ship: LandingShipRecord, ctx: LandingContext): LandingParams {
  const hitLenM = ship.length_m * ctx.hitScale;
  const hitBeamM = ship.beam_m * ctx.hitScale;
  const pass = hitLenM / 2 + hitBeamM;
  return {
    shipId: b.ship_id,
    x: b.anchor.x_m, y: b.anchor.y_m, headingDeg: b.anchor.heading_deg,
    lengthM: ship.length_m, beamM: ship.beam_m, hitLenM, hitBeamM, circles: ship.hull_circles, passRadius2: pass * pass,
    hitsToSink: b.torpedo_hits_to_sink, unloadS: b.unload_s,
    lookoutM: b.lookout_m, lookout2: b.lookout_m * b.lookout_m, hurried2: ctx.hurriedM * ctx.hurriedM, launchM: ctx.launchM,
    labelJa: b.label_ja, markLabelJa: b.mark_label_ja,
    fromDirsJa: joinDirsJa(ctx.runDirJa), runDirJa: ctx.runDirJa.slice(),
  };
}
