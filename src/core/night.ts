// 夜の揺らぎ（docs/02 §6.8、v0.4.6）: 出撃の seed から「今夜の危険の有無」と「敵の出発位置のずれ」を 1 回だけ決める。Phaser 非依存。確保は出撃の組み立てのときだけ。
// 危険の有無: 任務の night.optional_hazards のそれぞれが、risk_events の share × night.hazard_scale（上限 1）の確率で今夜出る（schema note「weight は share をそのまま使う」）。
// 乱数は seed+16 の系列だけ（seed〜seed+9 は魚雷・砲撃・掃射・暴風・空襲・水上機・大発・艇の砲・沿岸砲、+17〜+20 は見張り・米PT・夜明けの空襲・T-14 の 13mm（T-38 の 25mm も）が使う。+21 は大発の 13mm、+22 は v0.6.6 の隼艇の 25mm、+23 は v0.6.7 の夜の哨戒機の出撃。機関の不調（v0.6.5）と夜の哨戒機の門番は引かない）。引く回数は出る・出ないに関わらず固定
// （危険 1 回ずつ → 敵 3 回ずつ（x・y・針路）→ 大発の先頭 1 回 → 沿岸砲 1 回ずつ → 左右反転 1 回）。ある危険が無い夜だけ後ろのずれが変わる、を起こさない。
// 左右反転（実機 1 回目「敵の来る位置の違いが分からない」）: mirror_chance で敵の側を東西に入れ替える（systems/world-night）。
import { SeededRng } from './rng';

export const NIGHT_SEED_OFFSET = 16;

export interface NightBlock {
  /** risk_events の share に掛ける倍率（今夜出る確率 = min(1, share × hazardScale)） */
  hazardScale: number;
  /** 夜ごとに出たり出なかったりする危険（risk_events の id。任務の hazards の中から） */
  optionalHazards: string[];
  /** 敵（駆逐艦）の出発点のずれの最大（± m、± deg） */
  enemyJitterXM: number;
  enemyJitterYM: number;
  enemyJitterHeadingDeg: number;
  /** 大発の隊の先頭の x のずれの最大（± m）と、沿岸砲の x のずれの最大（± m） */
  bargeLeadJitterM: number;
  shoreBatteryJitterM: number;
  /** 敵の側（駆逐艦・大発・沿岸砲）を東西に入れ替える確率（0〜1） */
  mirrorChance: number;
}

export interface NightOffset {
  dx: number;
  dy: number;
  dh: number;
}

/** 今夜: いない危険（任務の hazards の id）、敵ごとのずれ、大発の先頭の x のずれ、沿岸砲ごとの x のずれ、敵の側を東西に入れ替えるか */
export interface NightRoll {
  absentHazards: string[];
  enemyOffsets: NightOffset[];
  bargeLeadDx: number;
  batteryDx: number[];
  mirrored: boolean;
}

/** 揺らぎなし（seed の無い組み立て・?debug&fixed・night block の無い任務） */
export function fixedNight(enemyCount: number, batteryCount: number): NightRoll {
  const enemyOffsets: NightOffset[] = [];
  for (let i = 0; i < enemyCount; i++) enemyOffsets.push({ dx: 0, dy: 0, dh: 0 });
  return { absentHazards: [], enemyOffsets, bargeLeadDx: 0, batteryDx: new Array<number>(batteryCount).fill(0), mirrored: false };
}

/** 今夜を決める。shareOf は risk_events の share（id → 0〜1）。ずれは ±最大の一様 */
export function rollNight(b: NightBlock, shareOf: (id: string) => number, seed: number, enemyCount: number, batteryCount: number): NightRoll {
  const rng = new SeededRng((seed + NIGHT_SEED_OFFSET) >>> 0);
  const sym = (a: number): number => (rng.next() * 2 - 1) * a;
  const absentHazards: string[] = [];
  for (const id of b.optionalHazards) {
    const p = Math.min(1, shareOf(id) * b.hazardScale);
    if (!(rng.next() < p)) absentHazards.push(id);
  }
  const enemyOffsets: NightOffset[] = [];
  for (let i = 0; i < enemyCount; i++) {
    const dx = sym(b.enemyJitterXM);
    const dy = sym(b.enemyJitterYM);
    const dh = sym(b.enemyJitterHeadingDeg);
    enemyOffsets.push({ dx, dy, dh });
  }
  const bargeLeadDx = sym(b.bargeLeadJitterM);
  const batteryDx: number[] = [];
  for (let i = 0; i < batteryCount; i++) batteryDx.push(sym(b.shoreBatteryJitterM));
  const mirrored = rng.next() < b.mirrorChance;
  return { absentHazards, enemyOffsets, bargeLeadDx, batteryDx, mirrored };
}

/** 今夜それぞれの危険が出る確率（Briefing・テスト・docs の表の根拠） */
export function hazardChance(b: NightBlock, shareOf: (id: string) => number, id: string): number {
  return b.optionalHazards.includes(id) ? Math.min(1, shareOf(id) * b.hazardScale) : 1;
}

// ---------- data の読み出し（missions_seed の v0_1_prototype.night） ----------

export interface NightDataRecord {
  hazard_scale: number;
  optional_hazards: string[];
  enemy_jitter?: { x_m: number; y_m: number; heading_deg: number };
  barge_lead_jitter_m?: number;
  shore_battery_jitter_m?: number;
  mirror_chance?: number;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function isNightDataRecord(v: unknown): v is NightDataRecord {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  if (!isNum(r['hazard_scale']) || !Array.isArray(r['optional_hazards']) || !r['optional_hazards'].every((h) => typeof h === 'string')) return false;
  const j = r['enemy_jitter'] as Record<string, unknown> | undefined;
  if (j !== undefined && (typeof j !== 'object' || j === null || !isNum(j['x_m']) || !isNum(j['y_m']) || !isNum(j['heading_deg']))) return false;
  return (r['barge_lead_jitter_m'] === undefined || isNum(r['barge_lead_jitter_m'])) && (r['shore_battery_jitter_m'] === undefined || isNum(r['shore_battery_jitter_m'])) && (r['mirror_chance'] === undefined || isNum(r['mirror_chance']));
}

/** 検査込み。missionHazards は任務の hazards（optional はこの中から）、hasShare は risk_events に share がある id か */
export function nightFromData(r: NightDataRecord, missionHazards: readonly string[], hasShare: (id: string) => boolean, label: string): NightBlock {
  const bad = (msg: string): never => {
    throw new Error(`${label}.v0_1_prototype.night: ${msg}（docs/02 §6.8）`);
  };
  if (!(r.hazard_scale > 0)) bad('hazard_scale は正');
  for (const h of r.optional_hazards) {
    if (!missionHazards.includes(h)) bad(`optional_hazards の ${h} が任務の hazards に無い`);
    if (!hasShare(h)) bad(`optional_hazards の ${h} が risk_events に無いか share が無い`);
  }
  if (new Set(r.optional_hazards).size !== r.optional_hazards.length) bad('optional_hazards が重複している');
  const j = r.enemy_jitter ?? { x_m: 0, y_m: 0, heading_deg: 0 };
  const lead = r.barge_lead_jitter_m ?? 0;
  const sb = r.shore_battery_jitter_m ?? 0;
  if (!(j.x_m >= 0 && j.y_m >= 0 && j.heading_deg >= 0 && j.heading_deg <= 180)) bad('enemy_jitter は 0 以上（heading_deg は 180 まで）');
  if (!(lead >= 0) || !(sb >= 0)) bad('barge_lead_jitter_m・shore_battery_jitter_m は 0 以上');
  const mirror = r.mirror_chance ?? 0;
  if (!(mirror >= 0 && mirror <= 1)) bad('mirror_chance は 0〜1');
  return { hazardScale: r.hazard_scale, optionalHazards: [...r.optional_hazards], enemyJitterXM: j.x_m, enemyJitterYM: j.y_m, enemyJitterHeadingDeg: j.heading_deg, bargeLeadJitterM: lead, shoreBatteryJitterM: sb, mirrorChance: mirror };
}
