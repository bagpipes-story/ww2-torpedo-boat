// ストアの純粋な規則（v0.9.0 S0。core/store。spec-v0900 §4.3・§4.5）: 保存の文字列の読み書き（壊れていても既定へ）・貯め方の倍率・開く条件・点を足す（支度金は 1 回）・交換・装着。
import { describe, expect, it } from 'vitest';
import {
  creditSortie,
  emptyStoreState,
  equippedItemIds,
  parseStoreState,
  purchaseItem,
  serializeStoreState,
  setItemEquipped,
  sortieAccrual,
  sortieAchieved,
  storeOpenStatus,
  type StoreItem,
  type StoreState,
} from '../src/core/store';

const ACC = { normal: 1, hard: 1.5, historical: 1.25, custom: 1 };
const item = (id: string, price: number): StoreItem => ({ id, nameJa: id, shortJa: id, descJa: id, price, boats: ['b'], excludeMissions: [], effect: { kind: 'boat_torpedo_count', count: 6 } });
const st = (o: Partial<StoreState> = {}): StoreState => ({ ...emptyStoreState(), ...o });

describe('保存の文字列（parseStoreState・serializeStoreState）', () => {
  it('書いて読むと同じ（版 1）', () => {
    const s = st({ points: 1234, owned: ['a', 'b'], off: ['b'], mode: 'custom', granted: true });
    expect(parseStoreState(serializeStoreState(s))).toEqual(s);
    expect(JSON.parse(serializeStoreState(s))).toEqual({ v: 1, points: 1234, owned: ['a', 'b'], off: ['b'], mode: 'custom', granted: true });
  });
  it.each([null, undefined, '', '{', '[]', '"x"', '42', 'null', '{"v":2,"points":10}', '{"points":10}'])('無い・壊れた・版が違う %s → 空（0 点・持ち物なし・デフォルト）', (t) => {
    expect(parseStoreState(t as string | null | undefined)).toEqual(emptyStoreState());
  });
  it('点は 0 以上の整数だけ（負・小数・文字列・NaN は 0）・持ち物は重複と空の id を落とす・off は持っている品だけ・mode は custom 以外デフォルト', () => {
    for (const p of [-1, 1.5, '10', null]) expect(parseStoreState(JSON.stringify({ v: 1, points: p })).points).toBe(0);
    const s = parseStoreState(JSON.stringify({ v: 1, points: 7, owned: ['a', 'a', '', 3, 'b'], off: ['b', 'c'], mode: 'x', granted: 'yes' }));
    expect(s).toEqual({ points: 7, owned: ['a', 'b'], off: ['b'], mode: 'default', granted: false });
  });
  it('known を渡すと表に無い品を落とす（品を消した版でも読める）', () => {
    expect(parseStoreState(JSON.stringify({ v: 1, points: 1, owned: ['a', 'gone'], off: ['gone'] }), new Set(['a'])).owned).toEqual(['a']);
  });
});

describe('貯め方の倍率（sortieAccrual）', () => {
  it('ノーマル 1.0・ハード 1.5（ハードの違いのある任務だけ）・史実 ×1.25・カスタム ×1.0・四捨五入', () => {
    expect(sortieAccrual(1000, ACC, { hardVariant: false, historical: false, custom: false })).toBe(1000);
    expect(sortieAccrual(1000, ACC, { hardVariant: true, historical: false, custom: false })).toBe(1500);
    expect(sortieAccrual(1001, ACC, { hardVariant: true, historical: true, custom: false })).toBe(Math.round(1001 * 1.5 * 1.25));
    expect(sortieAccrual(1000, ACC, { hardVariant: false, historical: false, custom: true })).toBe(1000);
  });
  it('0・負・NaN の得点は 0 点（引かない）', () => {
    for (const t of [0, -50, NaN]) expect(sortieAccrual(t, ACC, { hardVariant: true, historical: true, custom: false })).toBe(0);
  });
});

describe('達成と開く条件', () => {
  it('達成は帰投して目標を果たした時だけ', () => {
    expect(sortieAchieved({ returned: true, objectiveDone: true })).toBe(true);
    expect(sortieAchieved({ returned: false, objectiveDone: true })).toBe(false);
    expect(sortieAchieved({ returned: true, objectiveDone: false })).toBe(false);
  });
  it('条件の任務がみな達成に入れば開く（数は n/N）・空の条件では開かない', () => {
    expect(storeOpenStatus(new Set(['a', 'x']), ['a', 'b'])).toEqual({ open: false, done: 1, total: 2 });
    expect(storeOpenStatus(new Set(['a', 'b']), ['a', 'b'])).toEqual({ open: true, done: 2, total: 2 });
    expect(storeOpenStatus(new Set(['a']), []).open).toBe(false);
  });
});

describe('点を足す（creditSortie）', () => {
  it('閉じている間も足す・支度金は開いた時の 1 回だけ・元の物は変えない', () => {
    const s0 = st({ points: 100 });
    const a = creditSortie(s0, 50, false, 3000);
    expect(a).toEqual({ state: st({ points: 150 }), granted: 0 });
    expect(s0.points).toBe(100);
    const b = creditSortie(a.state, 50, true, 3000);
    expect(b.granted).toBe(3000);
    expect(b.state).toEqual(st({ points: 3200, granted: true }));
    const c = creditSortie(b.state, 50, true, 3000);
    expect(c.granted).toBe(0);
    expect(c.state.points).toBe(3250);
  });
  it('0・負・小数の点は足さない', () => {
    for (const p of [0, -5, 1.5, NaN]) expect(creditSortie(st({ points: 10 }), p, false, 3000).state.points).toBe(10);
  });
});

describe('交換と装着', () => {
  it('点が足りれば引いて持ち物に足し装着する・2 回目は owned・足りなければ short・表に無ければ unknown', () => {
    const it4 = item('mk13', 4000);
    expect(purchaseItem(st({ points: 3999 }), it4)).toEqual({ ok: false, reason: 'short' });
    expect(purchaseItem(st({ points: 9999 }), undefined)).toEqual({ ok: false, reason: 'unknown' });
    const r = purchaseItem(st({ points: 5000, owned: ['x'], off: ['x'] }), it4);
    expect(r).toEqual({ ok: true, state: st({ points: 1000, owned: ['x', 'mk13'], off: ['x'] }) });
    if (r.ok) expect(purchaseItem(r.state, it4)).toEqual({ ok: false, reason: 'owned' });
  });
  it('装着の入り切りは持っている品だけ・装着中は交換した順', () => {
    const s = st({ owned: ['a', 'b', 'c'] });
    const off = setItemEquipped(s, 'b', false);
    expect(equippedItemIds(off)).toEqual(['a', 'c']);
    expect(equippedItemIds(setItemEquipped(off, 'b', true))).toEqual(['a', 'b', 'c']);
    expect(setItemEquipped(s, 'zzz', false)).toBe(s);
    expect(equippedItemIds(s)).toEqual(['a', 'b', 'c']);
  });
});
