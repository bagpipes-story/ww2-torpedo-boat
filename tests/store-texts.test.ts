// v0.9.0 S1: ストアの文（ui/store-texts）と Briefing の切り替えの規則（core/store の briefingLoadoutShown）・?debug&points の財布の写し（systems/store-storage）・
// 開店の支度金を Title で 1 回（grantStoreOpening）・Result の行は開いている端末だけ（systems/sortie-loadout の recordSortieStore）。
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { getStoreCatalogue, storeItemById } from '../src/config/store-data';
import { briefingLoadoutShown, emptyStoreState, serializeStoreState, type StoreItem } from '../src/core/store';
import { clearStoreMemory, enableStoreMemory, grantStoreOpening, loadStoreState, purchaseStoreItem, recordStoreSortie, setStoreLoadoutMode } from '../src/systems/store-storage';
import { formatPoints, loadoutSubJa, resultCustomTagJa, storeCardState, storeEffectJa, storeItemMissionIds, storeItemMissionsJa, storeResultPartJa, walletJa } from '../src/ui/store-texts';

const cat = getStoreCatalogue(gameData);
const item = (id: string): StoreItem => storeItemById(cat, id)!;

describe('文（ui/store-texts）', () => {
  it('点は 3 桁ごとのコンマ（端末の言語に依らない）・財布は「所持 N 点」', () => {
    expect([0, 999, 1000, 12345, 1234567].map(formatPoints)).toEqual(['0', '999', '1,000', '12,345', '1,234,567']);
    expect(walletJa(20000)).toBe('所持 20,000 点');
  });
  it('効きの短い文は data の値から（4 品＋ご褒美。v0.9.0 IP3）', () => {
    expect(cat.items.map((x) => [x.id, storeEffectJa(gameData, x)])).toEqual([
      ['fuel_tank', '燃料の割当 ×1.25'],
      ['smoke_large', '煙幕 8 秒 ・ 次まで 15 秒'],
      ['torp_mk13', '米 Mk 13魚雷を積む'],
      ['torp_rack6', '魚雷 6 本'],
      ['crew_veteran', '弾倉交換 2.0 秒 ・ 消火 0.6 秒'],
    ]);
  });
  it('効く任務は何かを変える任務だけ（Briefing の切り替えが出る任務と同じ判定）', () => {
    expect(storeItemMissionIds(gameData, item('fuel_tank'))).toEqual(['us_01', 'us_02', 'us_03', 'us_04', 'us_05', 'us_06', 'us_07']);
    expect(storeItemMissionIds(gameData, item('torp_mk13'))).toEqual(['us_02', 'us_04']);
    expect(storeItemMissionIds(gameData, item('torp_rack6'))).toEqual(['us_02', 'us_03', 'us_04', 'us_05', 'us_06', 'us_07']);
    expect(storeItemMissionsJa(gameData, item('torp_mk13'))).toBe('効く任務: us_02・us_04');
  });
  it('枠の状態: 持っていなければ値段（足りなければ short）・持っていれば「装着中」／「外している」', () => {
    const s = { ...emptyStoreState(), points: 3500 };
    expect(storeCardState(s, item('fuel_tank'))).toEqual({ text: '3,000 点', tone: 'price' });
    expect(storeCardState(s, item('torp_rack6'))).toEqual({ text: '8,000 点', tone: 'short' });
    expect(storeCardState({ ...s, owned: ['fuel_tank'] }, item('fuel_tank'))).toEqual({ text: '装着中', tone: 'on' });
    expect(storeCardState({ ...s, owned: ['fuel_tank'], off: ['fuel_tank'] }, item('fuel_tank'))).toEqual({ text: '外している', tone: 'off' });
  });
  it('Briefing の 2 行目: 入るだけ並べて「ほか n」', () => {
    expect(loadoutSubJa(['燃料'])).toBe('燃料');
    expect(loadoutSubJa(['燃料', 'Mk 13'], 60, 20)).toBe('燃料 ほか 1');
  });
  it('Result の得点の行の後ろ（開いている端末だけ）と見出しの印（カスタムだけ）', () => {
    expect(storeResultPartJa({ credited: 1594, granted: 0, total: 12345, saved: true })).toBe(' ・ ストア +1,594（計 12,345 点）');
    expect(storeResultPartJa({ credited: 0, granted: 3000, total: 4300, saved: true })).toBe(' ・ ストア +0 ・ 開店 +3,000（計 4,300 点）');
    expect(storeResultPartJa({ credited: 700, granted: 0, total: 700, saved: false })).toBe(' ・ ストア +700（計 700 点・保存できず）');
    expect(resultCustomTagJa({})).toBe('');
    expect(resultCustomTagJa({ custom: { items: ['fuel_tank'] } })).toBe('（カスタム）');
  });
});

describe('Briefing の切り替えを出すか（core/store の briefingLoadoutShown）', () => {
  it('開いていて・空襲が無く・効く装着中の品がある時だけ（史実モードかどうかは見ない＝v0.9.0 IP1）', () => {
    const ok = { open: true, raid: false, effectiveItems: 1 };
    expect(briefingLoadoutShown(ok)).toBe(true);
    expect(briefingLoadoutShown({ ...ok, open: false })).toBe(false);
    expect(briefingLoadoutShown({ ...ok, raid: true })).toBe(false);
    expect(briefingLoadoutShown({ ...ok, effectiveItems: 0 })).toBe(false);
  });
});

class FakeStorage {
  readonly map = new Map<string, string>();
  writes = 0;
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.writes++;
    this.map.set(k, v);
  }
}
const g = globalThis as unknown as { localStorage?: unknown };
let ls: FakeStorage;
beforeEach(() => {
  ls = new FakeStorage();
  g.localStorage = ls;
});
afterEach(() => {
  clearStoreMemory();
  delete g.localStorage;
});

describe('?debug&points=N の財布の写し（enableStoreMemory）', () => {
  it('点は N・持ち物は保存の物から。交換・選び・任務の終わりの点は写しだけに書き、localStorage の財布は変えない（達成の鍵はいつもどおり）', () => {
    ls.map.set('night-hunters.store', serializeStoreState({ ...emptyStoreState(), points: 100, owned: ['fuel_tank'] }));
    enableStoreMemory(gameData, 20000);
    expect(loadStoreState(gameData).points).toBe(20000);
    expect(loadStoreState(gameData).owned).toEqual(['fuel_tank']);
    const before = ls.map.get('night-hunters.store');
    const r = purchaseStoreItem(gameData, 'torp_rack6');
    expect(r.ok && r.saved).toBe(true);
    setStoreLoadoutMode(gameData, 'custom');
    recordStoreSortie(gameData, 'us_02', true, 700);
    expect(loadStoreState(gameData)).toMatchObject({ points: 20000 - 8000 + 700, owned: ['fuel_tank', 'torp_rack6'], mode: 'custom' });
    expect(ls.map.get('night-hunters.store')).toBe(before);
    expect(ls.map.get('night-hunters.achieved')).toBe('{"v":2,"m":{"us_02":1}}'); // v0.9.0 IP1: 形のビット（省けばノーマル・史実オフ・デフォルト＝1）
    clearStoreMemory();
    expect(loadStoreState(gameData).points).toBe(100);
  });
});

describe('開店の支度金（grantStoreOpening。Title）', () => {
  it('保存の達成で開いていてまだ配っていない時だけ 1 回（2 回目と閉じている端末は 0）', () => {
    expect(grantStoreOpening(gameData)).toBe(0);
    expect(ls.writes).toBe(0);
    ls.map.set('night-hunters.achieved', JSON.stringify(cat.openMissionIds));
    expect(grantStoreOpening(gameData)).toBe(cat.grantPoints);
    expect(loadStoreState(gameData)).toMatchObject({ points: cat.grantPoints, granted: true });
    expect(grantStoreOpening(gameData)).toBe(0);
    // 任務の終わりでも二重に配らない（同じ印）
    const rec = recordStoreSortie(gameData, 'us_01', false, 500);
    expect([rec.granted, rec.total]).toEqual([0, cat.grantPoints + 500]);
  });
});
