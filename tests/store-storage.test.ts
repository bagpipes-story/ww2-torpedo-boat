// ストアの保存（v0.9.0 S0。systems/store-storage。spec-v0900 §4.5・§6-6）: 任務の終わりの 1 回で達成と点を書く・13 任務の達成で支度金を 1 回・交換は 1 回の setItem・
// 読めない／書けない localStorage では既定のまま例外を出さない。globalThis.localStorage を Map の偽物に差し替えて確かめる（node には localStorage が無い）。
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { getStoreCatalogue } from '../src/config/store-data';
import { achievedMissionIds, equippedStoreItems, loadStoreState, purchaseStoreItem, recordStoreSortie, setStoreItemEquipped, setStoreLoadoutMode, storedStoreStatus } from '../src/systems/store-storage';

class FakeStorage {
  readonly map = new Map<string, string>();
  writes = 0;
  failWrites = false;
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    if (this.failWrites) throw new Error('QuotaExceededError');
    this.writes++;
    this.map.set(k, v);
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
}

const g = globalThis as unknown as { localStorage?: unknown };
let ls: FakeStorage;
beforeEach(() => {
  ls = new FakeStorage();
  g.localStorage = ls;
});
afterEach(() => {
  delete g.localStorage;
});

const OPEN = getStoreCatalogue(gameData).openMissionIds;
const GRANT = getStoreCatalogue(gameData).grantPoints;

describe('任務の終わり（recordStoreSortie）', () => {
  it('点を足して 1 つの鍵に書く・達成なら達成の鍵に足す（同じ任務は 1 回）・閉じている間は支度金なし', () => {
    const r = recordStoreSortie(gameData, 'us_02', true, 1300);
    expect(r).toEqual({ credited: 1300, granted: 0, total: 1300, saved: true, rewards: [] });
    recordStoreSortie(gameData, 'us_02', true, 200);
    expect([...achievedMissionIds()]).toEqual(['us_02']);
    expect(loadStoreState(gameData).points).toBe(1500);
    recordStoreSortie(gameData, 'us_03', false, 0);
    expect([...achievedMissionIds()]).toEqual(['us_02']);
    expect(JSON.parse(ls.map.get('night-hunters.achieved')!)).toEqual({ v: 2, m: { us_02: 1 } }); // v0.9.0 IP1: 形のビット（tests/achieved-record）
    expect(JSON.parse(ls.map.get('night-hunters.store')!)).toMatchObject({ v: 1, points: 1500, granted: false });
  });
  it('13 任務目の達成の出撃で支度金を 1 回だけ（次からは配らない）', () => {
    for (const id of OPEN.slice(0, -1)) expect(recordStoreSortie(gameData, id, true, 100).granted).toBe(0);
    expect(storedStoreStatus(gameData)).toEqual({ open: false, done: 12, total: 13 });
    const r = recordStoreSortie(gameData, OPEN[OPEN.length - 1]!, true, 100);
    expect(r).toEqual({ credited: 100, granted: GRANT, total: 1300 + GRANT, saved: true, rewards: [] });
    expect(storedStoreStatus(gameData).open).toBe(true);
    expect(recordStoreSortie(gameData, 'us_01', false, 100)).toEqual({ credited: 100, granted: 0, total: 1400 + GRANT, saved: true, rewards: [] });
  });
  it('帰投の記録（night-hunters.cleared）は達成に数えない', () => {
    ls.map.set('night-hunters.cleared', JSON.stringify(OPEN));
    expect(storedStoreStatus(gameData).done).toBe(0);
    expect(storedStoreStatus(gameData).open).toBe(false);
  });
  it('書けない・localStorage が無い → saved false で例外なし・壊れた保存は 0 点から', () => {
    ls.failWrites = true;
    expect(recordStoreSortie(gameData, 'us_02', true, 500)).toEqual({ credited: 500, granted: 0, total: 500, saved: false, rewards: [] });
    ls.failWrites = false;
    ls.map.set('night-hunters.store', '{broken');
    expect(loadStoreState(gameData).points).toBe(0);
    delete g.localStorage;
    expect(recordStoreSortie(gameData, 'us_02', true, 500).saved).toBe(false);
    expect(loadStoreState(gameData).points).toBe(0);
  });
});

describe('交換と装着（S1 の画面が呼ぶ）', () => {
  it('交換は 1 回の setItem で点を引いて持ち物に足す・足りなければ書かない・装着の入り切り・装備の選び', () => {
    recordStoreSortie(gameData, 'us_02', false, 5000);
    const w = ls.writes;
    expect(purchaseStoreItem(gameData, 'torp_rack6')).toEqual({ ok: false, reason: 'short' });
    expect(ls.writes).toBe(w);
    const r = purchaseStoreItem(gameData, 'torp_mk13');
    expect(r.ok).toBe(true);
    expect(ls.writes).toBe(w + 1);
    expect(loadStoreState(gameData)).toMatchObject({ points: 1000, owned: ['torp_mk13'], off: [] });
    expect(purchaseStoreItem(gameData, 'torp_mk13')).toEqual({ ok: false, reason: 'owned' });
    expect(purchaseStoreItem(gameData, 'nope')).toEqual({ ok: false, reason: 'unknown' });
    setStoreItemEquipped(gameData, 'torp_mk13', false);
    expect(equippedStoreItems(gameData)).toEqual([]);
    setStoreItemEquipped(gameData, 'torp_mk13', true);
    expect(equippedStoreItems(gameData)).toEqual(['torp_mk13']);
    setStoreLoadoutMode(gameData, 'custom');
    expect(loadStoreState(gameData)).toMatchObject({ mode: 'custom', points: 1000 });
  });
});
