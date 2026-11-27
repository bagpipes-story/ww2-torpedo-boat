// ストアの品の表と貯め方（v0.9.0。data/store.json。spec-v0900 §4.2・§7）の読み出しと Boot の検査 V-S1〜V-S4。例外は鍵を名指す日本語（ほかの *-mission-data と同じ作法）。
// V-S1 形（鍵・id の重複なし・値段は正の整数・効きの形は 5 つだけ・source は design。v0.9.0 IP3 から kind reward＝値段の代わりに reward_rule）・V-S2 名指した艇・任務・魚雷・キャンペーンが data にあり、艇が boat_condition を満たす
// （燃料は満タンを超えない）・V-S3 2 つの品が同じ鍵を触らない・V-S4 自艇の記録を自艇以外も読む所（us_01 の僚艇・jp_03 の 18 隻・us_07 の味方の艇の "player_full"）の読む鍵に
// 品が触るなら、その品の shared_ok に名がある。全任務の組み立ては Boot ではしない（tests/custom-loadout が 13 任務×ハード×品で組む）。window を読まない（tests と scripts から読める）。
import type { GameData } from './game-data';
import { playableMissionIds } from './campaign-data';
import type { StoreAccrual, StoreCatalogue, StoreEffect, StoreEffectKind, StoreItem } from '../core/store';

type Rec = Record<string, unknown>;

const ITEM_KEYS = ['id', 'kind', 'name_ja', 'short_ja', 'desc_ja', 'boats', 'exclude_missions', 'effect', 'source'] as const;
const ITEM_OPTIONAL_KEYS = ['boat_condition', 'shared_ok'] as const;
/**
 * v0.9 で置ける品の種類と、種類ごとに要る鍵（ally は v0.10 の殴り込みの味方の予約＝今は置かない）: equipment は price（点で交換）、reward（v0.9.0 IP3 のご褒美）は
 * price を持たず reward_rule（渡す条件。今は historical_default_all＝ストアを開く条件の任務をみな史実モード × デフォルトの装備で達成）
 */
const ITEM_KIND_KEYS = { equipment: 'price', reward: 'reward_rule' } as const;
const REWARD_RULES = ['historical_default_all'] as const;

/** 効きの形ごとの鍵（effect の中。kind を除く）と、触る data の鍵（V-S3・V-S4。boat. は自艇の記録、mission. は任務の記録） */
export const STORE_EFFECT_SPEC: Readonly<Record<StoreEffectKind, { readonly keys: readonly string[]; readonly touches: readonly string[] }>> = {
  mission_torpedo: { keys: ['torpedo_id'], touches: ['mission.torpedo_type'] },
  boat_torpedo_count: { keys: ['count'], touches: ['boat.torpedoes.count'] },
  boat_smoke: { keys: ['duration_s', 'cooldown_s'], touches: ['boat.smoke.duration_s', 'boat.smoke.cooldown_s'] },
  mission_fuel_factor: { keys: ['factor'], touches: ['mission.v0_1_prototype.fuel_allotment_gal'] },
  boat_crew: { keys: ['reload_s', 'extinguish_hold_s'], touches: ['boat.gun_battery.magazine.reload_s', 'boat.damage.extinguish_hold_s'] },
};

/** 自艇の記録を自艇以外も読む所（V-S4。コードの事実＝どこが何を読むか。'*' は記録の全部） */
export const SHARED_BOAT_READERS: readonly { readonly id: string; readonly reads: readonly string[]; readonly applies: (proto: Rec, playerBoat: string) => boolean }[] = [
  // us_01 の要人の僚艇（config/game-data の getEscortParams）
  { id: 'escort', reads: ['speed_max_kt', 'accel_mps2', 'turn_rate_deg_s', 'length_m', 'beam_m', 'hull_hp'], applies: (p, b) => (p['escort'] as Rec | undefined)?.['boat'] === b },
  // jp_03 の 18 隻（同じ jp_t38。config/evac-mission-data）
  { id: 'evac', reads: ['*'], applies: (p) => p['evac'] !== undefined },
  // us_07 の味方の艇の速さ "player_full"（config/rescue-friendly-data）
  { id: 'rescue_player_full', reads: ['speed_max_kt'], applies: (p) => ((p['rescue'] as Rec | undefined)?.['friendly_boats'] as Rec | null | undefined)?.['speed_kt'] === 'player_full' },
];

const isObj = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v !== '';
const isPos = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const isIdList = (v: unknown, nonEmpty: boolean): v is string[] => Array.isArray(v) && (!nonEmpty || v.length > 0) && v.every(isStr) && new Set(v).size === v.length;

function bad(code: string, msg: string): never {
  throw new Error(`store.json ${code}: ${msg}（spec-v0900 §7）`);
}

/** 点で区切った鍵の値（boat_condition の 'torpedoes.launch_late' など） */
export function pathValue(r: unknown, path: string): unknown {
  let cur: unknown = r;
  for (const k of path.split('.')) cur = isObj(cur) ? cur[k] : undefined;
  return cur;
}

function readEffect(raw: unknown, label: string): StoreEffect {
  if (!isObj(raw)) return bad('V-S1', `${label}.effect は object`);
  const kind = raw['kind'];
  if (typeof kind !== 'string' || !(kind in STORE_EFFECT_SPEC)) return bad('V-S1', `${label}.effect.kind は ${Object.keys(STORE_EFFECT_SPEC).join('・')} のどれか（${String(kind)}）`);
  const spec = STORE_EFFECT_SPEC[kind as StoreEffectKind];
  const ks = Object.keys(raw).filter((k) => k !== 'kind');
  if (ks.length !== spec.keys.length || !spec.keys.every((k) => k in raw)) bad('V-S1', `${label}.effect（${kind}）の鍵はちょうど kind・${spec.keys.join('・')}（${ks.join('・') || 'なし'}）`);
  switch (kind as StoreEffectKind) {
    case 'mission_torpedo':
      if (!isStr(raw['torpedo_id'])) bad('V-S1', `${label}.effect.torpedo_id は空でない文字列`);
      return { kind: 'mission_torpedo', torpedoId: raw['torpedo_id'] as string };
    case 'boat_torpedo_count':
      if (!(Number.isInteger(raw['count']) && (raw['count'] as number) > 0)) bad('V-S1', `${label}.effect.count は正の整数`);
      return { kind: 'boat_torpedo_count', count: raw['count'] as number };
    case 'boat_smoke':
      if (!isPos(raw['duration_s']) || !isPos(raw['cooldown_s'])) bad('V-S1', `${label}.effect.duration_s・cooldown_s は正の数`);
      return { kind: 'boat_smoke', durationS: raw['duration_s'] as number, cooldownS: raw['cooldown_s'] as number };
    case 'mission_fuel_factor':
      if (!isPos(raw['factor'])) bad('V-S1', `${label}.effect.factor は正の数`);
      return { kind: 'mission_fuel_factor', factor: raw['factor'] as number };
    case 'boat_crew':
      if (!isPos(raw['reload_s']) || !isPos(raw['extinguish_hold_s'])) bad('V-S1', `${label}.effect.reload_s・extinguish_hold_s は正の数`);
      return { kind: 'boat_crew', reloadS: raw['reload_s'] as number, extinguishHoldS: raw['extinguish_hold_s'] as number };
  }
}

function readAccrual(raw: unknown): StoreAccrual {
  if (!isObj(raw)) return bad('V-S1', 'accrual は object');
  for (const k of ['normal', 'hard', 'historical', 'custom']) if (!isPos(raw[k])) bad('V-S1', `accrual.${k} は正の数`);
  if (!isStr(raw['source']) || !raw['source'].startsWith('design')) bad('V-S1', 'accrual.source は design で始める');
  return { normal: raw['normal'] as number, hard: raw['hard'] as number, historical: raw['historical'] as number, custom: raw['custom'] as number };
}

/** data の任務の記録（id → 記録）と、v0_1_prototype を持つ任務 */
function missionRecords(data: GameData): Rec[] {
  return (data.missionsSeed.missions as readonly Rec[]).filter((m) => isObj(m['v0_1_prototype']) && isStr(m['id']));
}

function boatRecord(data: GameData, id: string): Rec | undefined {
  return (data.boats.boats as readonly Rec[]).find((b) => b['id'] === id);
}

/** 品が狙う任務の記録（v0_1_prototype を持ち、player_boat が品の boats にあり、除く任務でない） */
export function itemTargetMissions(data: GameData, item: StoreItem): Rec[] {
  return missionRecords(data).filter((m) => item.boats.includes(m['player_boat'] as string) && !item.excludeMissions.includes(m['id'] as string));
}

function readItem(data: GameData, raw: unknown, i: number, seen: Set<string>): StoreItem {
  const label = `items[${i}]`;
  if (!isObj(raw)) return bad('V-S1', `${label} は object`);
  const kind = raw['kind'];
  if (typeof kind !== 'string' || !(kind in ITEM_KIND_KEYS)) return bad('V-S1', `${label}.kind は ${Object.keys(ITEM_KIND_KEYS).join('・')}（${String(kind)}）`);
  const kindKey = ITEM_KIND_KEYS[kind as keyof typeof ITEM_KIND_KEYS];
  const required: readonly string[] = [...ITEM_KEYS, kindKey];
  const ks = Object.keys(raw);
  const allowed: readonly string[] = [...required, ...ITEM_OPTIONAL_KEYS];
  const extra = ks.filter((k) => !allowed.includes(k));
  const missing = required.filter((k) => !(k in raw));
  if (extra.length > 0 || missing.length > 0) bad('V-S1', `${label}（${kind}）の鍵は ${required.join('・')}（任意 ${ITEM_OPTIONAL_KEYS.join('・')}）。余り ${extra.join('・') || 'なし'}・欠け ${missing.join('・') || 'なし'}`);
  const id = raw['id'];
  if (!isStr(id)) return bad('V-S1', `${label}.id は空でない文字列`);
  if (seen.has(id)) bad('V-S1', `items の id（${id}）が重複している`);
  seen.add(id);
  const L = `items.${id}`;
  const reward = kind === 'reward';
  for (const k of ['name_ja', 'short_ja', 'desc_ja']) if (!isStr(raw[k])) bad('V-S1', `${L}.${k} は空でない文字列`);
  if (!reward && !(Number.isInteger(raw['price']) && (raw['price'] as number) > 0)) bad('V-S1', `${L}.price は正の整数（点）`);
  if (reward && !(REWARD_RULES as readonly unknown[]).includes(raw['reward_rule'])) bad('V-S1', `${L}.reward_rule は ${REWARD_RULES.join('・')}（${String(raw['reward_rule'])}）`);
  if (!isIdList(raw['boats'], true)) bad('V-S1', `${L}.boats は空でない・重複の無い艇の id の配列`);
  if (!isIdList(raw['exclude_missions'], false)) bad('V-S1', `${L}.exclude_missions は重複の無い任務の id の配列`);
  if (!isStr(raw['source']) || !raw['source'].startsWith('design')) bad('V-S1', `${L}.source は design で始める（品の値はみな設計値）`);
  const sharedOk = raw['shared_ok'] ?? [];
  if (!isIdList(sharedOk, false) || !sharedOk.every((s) => SHARED_BOAT_READERS.some((r) => r.id === s))) bad('V-S1', `${L}.shared_ok は ${SHARED_BOAT_READERS.map((r) => r.id).join('・')} の中の名の配列`);
  const cond = raw['boat_condition'] ?? {};
  if (!isObj(cond)) bad('V-S1', `${L}.boat_condition は object（点で区切った鍵 → 値）`);
  const item: StoreItem = {
    id,
    nameJa: raw['name_ja'] as string,
    shortJa: raw['short_ja'] as string,
    descJa: raw['desc_ja'] as string,
    price: reward ? 0 : (raw['price'] as number),
    reward,
    boats: (raw['boats'] as string[]).slice(),
    excludeMissions: (raw['exclude_missions'] as string[]).slice(),
    effect: readEffect(raw['effect'], L),
  };
  // V-S2: 名指した物が data にあり、艇が条件を満たす
  const missionIds = new Set((data.missionsSeed.missions as readonly Rec[]).map((m) => m['id']));
  for (const m of item.excludeMissions) if (!missionIds.has(m)) bad('V-S2', `${L}.exclude_missions の ${m} が missions_seed.json に無い`);
  const e = item.effect;
  for (const b of item.boats) {
    const rec = boatRecord(data, b);
    if (!rec) return bad('V-S2', `${L}.boats の ${b} が boats.json に無い`);
    for (const [path, want] of Object.entries(cond as Rec)) if (pathValue(rec, path) !== want) bad('V-S2', `${L}: 艇 ${b} の ${path} は ${JSON.stringify(want)} でない（${JSON.stringify(pathValue(rec, path))}。boat_condition）`);
    if (e.kind === 'boat_torpedo_count' && typeof pathValue(rec, 'torpedoes.count') !== 'number') bad('V-S2', `${L}: 艇 ${b} に torpedoes.count が無い`);
    if (e.kind === 'boat_smoke' && (rec['smoke_generator'] !== true || !isObj(rec['smoke']))) bad('V-S2', `${L}: 艇 ${b} に煙幕（smoke_generator・smoke）が無い`);
    if (e.kind === 'boat_crew') for (const path of ['gun_battery.magazine.reload_s', 'damage.extinguish_hold_s']) if (typeof pathValue(rec, path) !== 'number') bad('V-S2', `${L}: 艇 ${b} に ${path} が無い`);
  }
  if (e.kind === 'mission_torpedo' && !(data.torpedoes.torpedoes as readonly Rec[]).some((t) => t['id'] === e.torpedoId)) bad('V-S2', `${L}.effect.torpedo_id（${e.torpedoId}）が torpedoes.json に無い`);
  const targets = itemTargetMissions(data, item);
  if (targets.length === 0) bad('V-S2', `${L} が効く任務が無い（boats と exclude_missions）`);
  for (const m of targets) {
    const proto = m['v0_1_prototype'] as Rec;
    const boatId = m['player_boat'] as string;
    if (e.kind === 'mission_fuel_factor') {
      const gal = (proto['fuel_allotment_gal'] as number) * e.factor;
      const cap = boatRecord(data, boatId)?.['fuel_capacity_gal'];
      if (!(typeof cap === 'number' && gal <= cap)) bad('V-S2', `${L}: ${String(m['id'])} の燃料 ${gal} gal が艇 ${boatId} の fuel_capacity_gal（${String(cap)}）を超える`);
    }
    // V-S4: 自艇の記録を自艇以外も読む所
    const boatKeys = STORE_EFFECT_SPEC[e.kind].touches.filter((t) => t.startsWith('boat.')).map((t) => t.slice('boat.'.length));
    for (const r of SHARED_BOAT_READERS) {
      if (!r.applies(proto, boatId)) continue;
      const hit = boatKeys.filter((k) => r.reads.includes('*') || r.reads.some((x) => k === x || k.startsWith(`${x}.`)));
      if (hit.length > 0 && !(sharedOk as string[]).includes(r.id)) bad('V-S4', `${L}: ${String(m['id'])} では ${r.id} も艇 ${boatId} の ${hit.join('・')} を読む（触ってよいなら shared_ok に ${r.id}）`);
    }
  }
  return item;
}

let cache: { src: unknown; cat: StoreCatalogue } | null = null;

/** 品の表（検査込み。同じ data の物は 1 回だけ読む）。壊れていれば例外 */
export function getStoreCatalogue(data: GameData): StoreCatalogue {
  const raw = (data as unknown as Rec)['store'];
  if (cache && cache.src === raw && cache.cat) return cache.cat;
  if (!isObj(raw)) return bad('V-S1', 'gameData に store が無い（data/store.json）');
  const open = raw['open'];
  if (!isObj(open)) return bad('V-S1', 'open は object');
  if (!isIdList(open['campaigns'], true)) bad('V-S1', 'open.campaigns は空でない・重複の無いキャンペーンの id の配列');
  if (!(Number.isInteger(open['grant_points']) && (open['grant_points'] as number) >= 0)) bad('V-S1', 'open.grant_points は 0 以上の整数');
  if (!isStr(open['source']) || !open['source'].startsWith('design')) bad('V-S1', 'open.source は design で始める');
  const campaigns = new Set((data.missionsSeed.campaigns as readonly Rec[]).map((c) => c['id']));
  const openMissionIds: string[] = [];
  for (const c of open['campaigns'] as string[]) {
    if (!campaigns.has(c)) bad('V-S2', `open.campaigns の ${c} が missions_seed.json の campaigns に無い`);
    openMissionIds.push(...playableMissionIds(data, c));
  }
  if (openMissionIds.length === 0) bad('V-S2', 'open.campaigns に遊べる任務が無い');
  const accrual = readAccrual(raw['accrual']);
  const itemsRaw = raw['items'];
  if (!Array.isArray(itemsRaw)) return bad('V-S1', 'items は配列');
  const seen = new Set<string>();
  const items = itemsRaw.map((x, i) => readItem(data, x, i, seen));
  // V-S3: 2 つの品が同じ鍵を触らない
  const owner = new Map<string, string>();
  for (const it of items) {
    for (const t of STORE_EFFECT_SPEC[it.effect.kind].touches) {
      const o = owner.get(t);
      if (o !== undefined) bad('V-S3', `items.${it.id} と items.${o} が同じ鍵 ${t} を触る`);
      owner.set(t, it.id);
    }
  }
  const cat: StoreCatalogue = { items, accrual, openMissionIds, grantPoints: open['grant_points'] as number };
  cache = { src: raw, cat };
  return cat;
}

/** Boot の検査（1 回。壊れていれば Boot で止まる） */
export function validateStore(data: GameData): void {
  getStoreCatalogue(data);
}

export function storeItemById(cat: StoreCatalogue, id: string): StoreItem | undefined {
  return cat.items.find((x) => x.id === id);
}
