// 出撃（Sortie）と出撃前の港内空襲（docs/02 §6.8、risk_events.json の harbor_fire_explosion、v0.4.0）。Phaser 非依存。確保は Briefing と出撃のときだけ。
// seed は Briefing の前に決め、seed+4 の系列から必ず 2 回引く（1 回目 < chance で空襲、2 回目 < stay_hit_chance なら「残る」で至近弾）。
// 乱数の系列: 魚雷 seed、砲撃 +1、掃射 +2、暴風 +3、空襲 +4。空襲は別系列なので、どちらを選んでも任務中の乱数は変わらない。
import { createDamageState, type DamageParams, type DamageState } from './gunnery';
import { SeededRng } from './rng';

export const RAID_EVENT_ID = 'harbor_fire_explosion';
export const RAID_SEED_OFFSET = 4;
/** 2 択: 未選択 / 分散して退避 / 残って給油・消火 */
export const RAID_NONE = 0;
export const RAID_DISPERSE = 1;
export const RAID_STAY = 2;

export interface RaidParams {
  /** 出撃ごとに空襲が起きる確率 */
  chance: number;
  /** 分散したときに積む燃料（割当に対する割合） */
  disperseFuelFactor: number;
  /** 残ったときに至近弾を受ける確率と、その HP 減・火災 */
  stayHitChance: number;
  stayHitDamage: number;
  stayHitFire: boolean;
}

/** この出撃: 任務、seed、空襲が起きたか、選んだ 2 択、残ったら至近弾を受けるか（空襲の夜だけ意味がある）、難易度ハード（v0.4.5。敵の数が増える）、史実モード（v0.5.2） */
export interface Sortie {
  missionId: string;
  seed: number;
  raid: boolean;
  choice: number;
  stayHit: boolean;
  hard: boolean;
  /** 史実モード（v0.5.2。hit_rate_model.historical_mode: 敵の見張り・回避と見つかる距離を強め、不発を増やし、見越し点マーカーを出さない） */
  historical: boolean;
}

/** 出撃時の状態（world-setup が data の値に当てる） */
export interface SortieConditions {
  /** 積む燃料（割当に対する割合。燃料計・燃料点の 100% は割当のまま） */
  fuelFactor: number;
  hpLoss: number;
  fireAtStart: boolean;
}

export const NO_SORTIE_EFFECT: Readonly<SortieConditions> = Object.freeze({ fuelFactor: 1, hpLoss: 0, fireAtStart: false });

/** ?debug の上書き: none＝抽選どおり、force＝必ず空襲、off＝空襲なし、disperse / stay / hit＝直行ではその結果で出撃（通しでは空襲を起こすだけ。hit は至近弾、stay は無傷に固定） */
export type RaidOverride = 'none' | 'force' | 'off' | 'disperse' | 'stay' | 'hit';

/** URL の raid の値（null＝無し、''＝値なし）と noraid の有無。noraid が優先 → off。'' と '1' は force、'0' は off、disperse|stay|hit はそのまま、他は none */
export function parseRaidOverride(raid: string | null, noraid: boolean): RaidOverride {
  if (noraid) return 'off';
  if (raid === null) return 'none';
  if (raid === '' || raid === '1') return 'force';
  if (raid === '0') return 'off';
  if (raid === 'disperse' || raid === 'stay' || raid === 'hit') return raid;
  return 'none';
}

/** 空襲の抽選（§2.1）。choice は RAID_NONE。p が null（任務に空襲が無い）なら空襲なし。上書き・任務に関わらず必ず 2 回引く（seed と選択が同じなら再現する） */
export function rollRaid(missionId: string, seed: number, p: RaidParams | null, o: RaidOverride = 'none', hard: boolean = false, historical: boolean = false): Sortie {
  const rng = new SeededRng((seed + RAID_SEED_OFFSET) >>> 0);
  const u1 = rng.next();
  const u2 = rng.next();
  const raid = p !== null && o !== 'off' && (o === 'none' ? u1 < p.chance : true);
  const stayHit = raid && p !== null && (o === 'hit' ? true : o === 'stay' ? false : u2 < p.stayHitChance);
  return { missionId, seed: seed >>> 0, raid, choice: RAID_NONE, stayHit, hard, historical };
}

/** ?debug 直行: disperse → 分散、stay → 残って無傷、hit → 残って至近弾、それ以外は空襲なし（乱数は引かない）。hard は ?debug&hard（v0.4.5）、historical は ?debug&historical（v0.5.2） */
export function directSortie(missionId: string, seed: number, o: RaidOverride, hard: boolean = false, historical: boolean = false): Sortie {
  const s: Sortie = { missionId, seed: seed >>> 0, raid: false, choice: RAID_NONE, stayHit: false, hard, historical };
  if (o === 'disperse') {
    s.raid = true;
    s.choice = RAID_DISPERSE;
  } else if (o === 'stay' || o === 'hit') {
    s.raid = true;
    s.choice = RAID_STAY;
    s.stayHit = o === 'hit';
  }
  return s;
}

/** 出撃時の状態（§2.2）: 空襲なし・未選択・任務に空襲が無い → 効果なし、分散 → 燃料の割合、残って至近弾 → HP 減と火災、残って無傷 → 効果なし */
export function sortieConditions(s: Sortie, p: RaidParams | null): SortieConditions {
  if (p === null || !s.raid) return NO_SORTIE_EFFECT;
  if (s.choice === RAID_DISPERSE) return { fuelFactor: p.disperseFuelFactor, hpLoss: 0, fireAtStart: false };
  if (s.choice === RAID_STAY && s.stayHit) return { fuelFactor: 1, hpLoss: p.stayHitDamage, fireAtStart: p.stayHitFire };
  return NO_SORTIE_EFFECT;
}

/** createDamageState に出撃時の HP 減と火災を当てる（機関損傷はなし） */
export function startDamageState(p: DamageParams, c: SortieConditions): DamageState {
  const d = createDamageState(p);
  d.hp = Math.max(0, p.maxHp - c.hpLoss);
  d.fireLeftS = c.fireAtStart ? p.fireDurationS : 0;
  return d;
}

function isSeed(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 0xffffffff;
}

function isMissionId(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

/** missionId は空でない文字列、seed は 0〜0xffffffff の整数、raid・stayHit・hard・historical は boolean、choice は 0/1/2 */
export function isSortie(v: unknown): v is Sortie {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    isMissionId(r['missionId']) &&
    isSeed(r['seed']) &&
    typeof r['raid'] === 'boolean' &&
    typeof r['stayHit'] === 'boolean' &&
    typeof r['hard'] === 'boolean' &&
    typeof r['historical'] === 'boolean' &&
    (r['choice'] === RAID_NONE || r['choice'] === RAID_DISPERSE || r['choice'] === RAID_STAY)
  );
}

/** Briefing に渡すもの（Title の行と Result の「もう一度」が作る）。hard は難易度（v0.4.5）、historical は史実モード（v0.5.2） */
export interface BriefingInit {
  missionId: string;
  seed: number;
  hard: boolean;
  historical: boolean;
}

export function isBriefingInit(v: unknown): v is BriefingInit {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return isMissionId(r['missionId']) && isSeed(r['seed']) && typeof r['hard'] === 'boolean' && typeof r['historical'] === 'boolean';
}

/** 同じ任務の保留（registry）があればその seed、無ければ fresh（選ぶ前に任務一覧へ戻っても同じ夜） */
export function seedForBriefing(pending: unknown, missionId: string, fresh: number): number {
  return isBriefingInit(pending) && pending.missionId === missionId ? pending.seed : fresh;
}

// ---------- 文（data の数値から組む。% は Math.round(x × 100)、マイナスは U+2212） ----------

export const RAID_ALERT_JA = '出撃前: 空襲警報！ 給油中の艇に火が回った。どうする？';
export const RAID_CALM_JA = '出撃前: 異状なし（今夜は空襲なし）';
const DISPERSE_TITLE_JA = '分散して退避';
const STAY_TITLE_JA = '残って給油・消火';

const pct = (x: number): number => Math.round(x * 100);
const hpLoss = (p: RaidParams): string => `HP −${p.stayHitDamage}`;

/** 2 択のボタンの題と説明 */
export function raidChoiceText(p: RaidParams, choice: number): { title: string; detail: string } {
  if (choice === RAID_DISPERSE) return { title: DISPERSE_TITLE_JA, detail: `燃料 ${pct(p.disperseFuelFactor)}% ・ 被弾なし` };
  return { title: STAY_TITLE_JA, detail: `燃料 100% ・ ${pct(p.stayHitChance)}% で ${hpLoss(p)}${p.stayHitFire ? '・火災' : ''}` };
}

/** 選んだ後の 1 行。未選択・空襲なしは '' */
export function raidOutcomeText(s: Sortie, p: RaidParams): string {
  if (!s.raid) return '';
  if (s.choice === RAID_DISPERSE) return `分散した。燃料 ${pct(p.disperseFuelFactor)}% で出撃`;
  if (s.choice !== RAID_STAY) return '';
  if (!s.stayHit) return '被弾なし。燃料 100% で出撃';
  return p.stayHitFire ? `至近弾！ ${hpLoss(p)}・火災のまま出撃 — 出たらすぐ「消火」を長押し` : `至近弾！ ${hpLoss(p)} で出撃`;
}

/**
 * Result の「出撃前」の行。p null（任務に空襲が無い）→ ''。
 * startFireS は出撃時の火災が消えた実秒（0 以上なら「火災 N.N 秒」、NaN・負なら「・火災」まで。火災なしの設定なら「至近弾 HP −20」まで）
 */
export function raidResultLine(s: Sortie, p: RaidParams | null, startFireS: number): string {
  if (p === null) return '';
  if (!s.raid) return '出撃前: 空襲なし';
  if (s.choice === RAID_DISPERSE) return `出撃前: 港内空襲 → ${DISPERSE_TITLE_JA}（燃料 ${pct(p.disperseFuelFactor)}% で出撃）`;
  if (s.choice !== RAID_STAY) return '';
  if (!s.stayHit) return `出撃前: 港内空襲 → ${STAY_TITLE_JA}（被弾なし）`;
  const head = `出撃前: 港内空襲 → ${STAY_TITLE_JA} → 至近弾 ${hpLoss(p)}`;
  if (!p.stayHitFire) return head;
  return startFireS >= 0 ? `${head}・火災 ${startFireS.toFixed(1)} 秒` : `${head}・火災`;
}

// ---------- data の読み出し ----------

export interface RaidDataRecord {
  params: { chance: number; disperse_fuel_factor: number; stay_hit_chance: number; stay_hit_damage: number; stay_hit_fire: boolean };
}

export function isRaidDataRecord(v: unknown): v is RaidDataRecord {
  if (typeof v !== 'object' || v === null) return false;
  const q = (v as Record<string, unknown>)['params'];
  if (typeof q !== 'object' || q === null) return false;
  const r = q as Record<string, unknown>;
  return ['chance', 'disperse_fuel_factor', 'stay_hit_chance', 'stay_hit_damage'].every((k) => typeof r[k] === 'number' && Number.isFinite(r[k] as number)) && typeof r['stay_hit_fire'] === 'boolean';
}

/** 設計値の検査込みで RaidParams を作る。d は艇の被害パラメータ（空襲だけでは沈まないことを検査する） */
export function raidParamsFromData(r: RaidDataRecord, d: DamageParams): RaidParams {
  const q = r.params;
  const bad = (msg: string): never => {
    throw new Error(`risk_events.json の harbor_fire_explosion.params: ${msg}（docs/02 §6.8）`);
  };
  if (!(q.chance >= 0 && q.chance <= 1)) bad('chance は 0〜1');
  if (!(q.disperse_fuel_factor > 0 && q.disperse_fuel_factor <= 1)) bad('disperse_fuel_factor は 0〜1（0 は除く）');
  if (!(q.stay_hit_chance >= 0 && q.stay_hit_chance <= 1)) bad('stay_hit_chance は 0〜1');
  if (!(q.stay_hit_damage >= 0 && q.stay_hit_damage < d.maxHp)) bad('stay_hit_damage は 0 以上で hull_hp より小さい');
  if (q.stay_hit_fire && !(d.maxHp - q.stay_hit_damage > d.fireDps * d.fireDurationS)) bad('至近弾と火災だけで沈む（hull_hp − stay_hit_damage は火災の総被害 fire_dps × fire_duration_s より大きくする）');
  return { chance: q.chance, disperseFuelFactor: q.disperse_fuel_factor, stayHitChance: q.stay_hit_chance, stayHitDamage: q.stay_hit_damage, stayHitFire: q.stay_hit_fire };
}
