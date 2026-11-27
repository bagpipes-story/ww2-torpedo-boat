// ストア（v0.9.0。spec-v0900 §4.3・§4.5）の純粋な規則: 財布（点）・持ち物と装着・交換・貯め方の倍率・開く条件・保存の文字列の読み書き。Phaser 非依存。
// 品の表の読み出しと検査は config/store-data（V-S1〜V-S4）、data の上書きは config/custom-loadout、localStorage は systems/store-storage。
// 保存の形（1 つの鍵 night-hunters.store）: { v: 1, points, owned: [...], off: [...], mode: "default"|"custom", granted }。交換は「点を引く」と「持ち物に足す」を
// 同じ 1 つの文字列で書く（半分だけ書けた状態を作らない）。読めない・壊れた時は 0 点・持ち物なし・デフォルト（kpi-record の作法）。

/** 品の効きの形（data/store.json の effect.kind。これ以外は Boot で止める） */
export type StoreEffect =
  | { readonly kind: 'mission_torpedo'; readonly torpedoId: string }
  | { readonly kind: 'boat_torpedo_count'; readonly count: number }
  | { readonly kind: 'boat_smoke'; readonly durationS: number; readonly cooldownS: number }
  | { readonly kind: 'mission_fuel_factor'; readonly factor: number };

export type StoreEffectKind = StoreEffect['kind'];

export interface StoreItem {
  readonly id: string;
  readonly nameJa: string;
  readonly shortJa: string;
  readonly descJa: string;
  readonly price: number;
  /** 効く艇（任務の player_boat） */
  readonly boats: readonly string[];
  /** 効かない任務 */
  readonly excludeMissions: readonly string[];
  readonly effect: StoreEffect;
}

/** 貯め方の倍率（data/store.json の accrual） */
export interface StoreAccrual {
  readonly normal: number;
  readonly hard: number;
  readonly historical: number;
  readonly custom: number;
}

export interface StoreCatalogue {
  readonly items: readonly StoreItem[];
  readonly accrual: StoreAccrual;
  /** 開く条件の任務（open.campaigns の遊べる任務。13） */
  readonly openMissionIds: readonly string[];
  /** 開いた時に 1 回だけ配る点 */
  readonly grantPoints: number;
}

export type LoadoutMode = 'default' | 'custom';

/** 端末の財布と持ち物（保存の中身） */
export interface StoreState {
  points: number;
  /** 交換した品の id（交換した順） */
  owned: string[];
  /** 持っているが外している品の id */
  off: string[];
  /** Briefing の「装備」の選び（S1 の切り替え。v0.9.0 S0 では読むだけ） */
  mode: LoadoutMode;
  /** 開店の支度金を配った */
  granted: boolean;
}

export const STORE_STATE_VERSION = 1;

export function emptyStoreState(): StoreState {
  return { points: 0, owned: [], off: [], mode: 'default', granted: false };
}

function idList(v: unknown, known: ReadonlySet<string> | null): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) if (typeof x === 'string' && x !== '' && !out.includes(x) && (known === null || known.has(x))) out.push(x);
  return out;
}

/**
 * 保存の文字列の読み取り。無い・JSON でない・版が違う・形が違う → 空（0 点・持ち物なし・デフォルト）。点は 0 以上の整数だけ（壊れていれば 0）。
 * known（品の id）を渡せば、表に無い id は落とす（品を消した版でも読める）。off は持っている品だけ
 */
export function parseStoreState(text: string | null | undefined, known: ReadonlySet<string> | null = null): StoreState {
  if (text === null || text === undefined || text === '') return emptyStoreState();
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return emptyStoreState();
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return emptyStoreState();
  const r = v as Record<string, unknown>;
  if (r['v'] !== STORE_STATE_VERSION) return emptyStoreState();
  const p = r['points'];
  const points = typeof p === 'number' && Number.isInteger(p) && p >= 0 ? p : 0;
  const owned = idList(r['owned'], known);
  const off = idList(r['off'], known).filter((x) => owned.includes(x));
  return { points, owned, off, mode: r['mode'] === 'custom' ? 'custom' : 'default', granted: r['granted'] === true };
}

export function serializeStoreState(s: StoreState): string {
  return JSON.stringify({ v: STORE_STATE_VERSION, points: s.points, owned: s.owned, off: s.off, mode: s.mode, granted: s.granted });
}

/**
 * 1 出撃で足す点 = round(得点の合計 × 倍率)。倍率 = （ハードの違いのある任務のハードなら hard、そうでなければ normal）×（史実モードなら historical）×（カスタムなら custom）。
 * 負・NaN の得点は 0 点（足すだけ。引かない）
 */
export function sortieAccrual(total: number, a: StoreAccrual, o: { readonly hardVariant: boolean; readonly historical: boolean; readonly custom: boolean }): number {
  if (!(total > 0)) return 0;
  const m = (o.hardVariant ? a.hard : a.normal) * (o.historical ? a.historical : 1) * (o.custom ? a.custom : 1);
  return Math.max(0, Math.round(total * m));
}

/**
 * 達成（ユーザーの決め U2「13任務すべて達成」。問いの言葉「目的を果たして帰投」）: 帰投して（敵艦隊なしの cleared も帰投に数える）任務の目標を果たした出撃。
 * ノーマル・ハードのどちらでも同じ 1 つ（night-hunters.achieved は任務の id の集合）
 */
export function sortieAchieved(r: { readonly returned: boolean; readonly objectiveDone: boolean }): boolean {
  return r.returned && r.objectiveDone;
}

/** 開く条件: 条件の任務がみな達成に入っている（条件の任務が空なら開かない）。done は達成した数（Title の「n/13」） */
export function storeOpenStatus(achieved: ReadonlySet<string>, openMissionIds: readonly string[]): { open: boolean; done: number; total: number } {
  let done = 0;
  for (const id of openMissionIds) if (achieved.has(id)) done++;
  const total = openMissionIds.length;
  return { open: total > 0 && done === total, done, total };
}

/**
 * 任務の終わりの 1 回（systems/store-storage の recordStoreSortie）: 点を足し、開いていてまだ配っていなければ支度金を配る（開いたのが前の出撃でも、書けなかった分をここで取り戻す）。
 * 新しい物を返す（s は変えない）
 */
export function creditSortie(s: StoreState, points: number, open: boolean, grantPoints: number): { state: StoreState; granted: number } {
  const add = Number.isInteger(points) && points > 0 ? points : 0;
  const grant = open && !s.granted ? grantPoints : 0;
  return { state: { ...s, owned: s.owned.slice(), off: s.off.slice(), points: s.points + add + grant, granted: s.granted || open }, granted: grant };
}

export type PurchaseRefusal = 'unknown' | 'owned' | 'short';

/** 交換: 表にある・まだ持っていない・点が足りる品だけ。成り立てば点を引いて持ち物に足し、装着する（off から外す）。新しい物を返す */
export function purchaseItem(s: StoreState, item: StoreItem | undefined): { ok: true; state: StoreState } | { ok: false; reason: PurchaseRefusal } {
  if (!item) return { ok: false, reason: 'unknown' };
  if (s.owned.includes(item.id)) return { ok: false, reason: 'owned' };
  if (s.points < item.price) return { ok: false, reason: 'short' };
  return { ok: true, state: { ...s, points: s.points - item.price, owned: [...s.owned, item.id], off: s.off.filter((x) => x !== item.id) } };
}

/** 装着の入り切り（持っている品だけ。持っていなければそのまま）。新しい物を返す */
export function setItemEquipped(s: StoreState, id: string, on: boolean): StoreState {
  if (!s.owned.includes(id)) return s;
  const off = s.off.filter((x) => x !== id);
  if (!on) off.push(id);
  return { ...s, owned: s.owned.slice(), off };
}

/** 装着中の品（持っていて外していない。交換した順） */
export function equippedItemIds(s: StoreState): string[] {
  return s.owned.filter((x) => !s.off.includes(x));
}
