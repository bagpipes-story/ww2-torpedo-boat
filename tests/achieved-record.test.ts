// 達成の記録（v0.9.0 IP1。core/achieved-record・systems/store-storage）: 任務ごとに 8 つの形（ハード × 史実モード × カスタム）のビット。ユーザーの言葉（2026-11-27）
// 「史実モードでもカスタム装備使える仕様でいいです。でも史実でカスタムを使ったという表示と記録は必要です。」
// 形のビット・保存の文字列の読み書き・S0／S1 の id の配列の読み替え・壊れた値・印の材料（カスタムでだけ）・ストアを開く条件は今までどおり・1 回の書き込み。
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { hasHardVariant } from '../src/config/mission-data';
import { getStoreCatalogue } from '../src/config/store-data';
import {
  ACH_BIT_PLAIN,
  ACH_CUSTOM,
  ACH_HARD,
  ACH_HISTORICAL,
  ACH_MASK_ALL,
  achievedCount,
  achievedIdSet,
  historicalDefaultAll,
  historicalDefaultCount,
  historicalDefaultTrophy,
  MASK_HIST_DEFAULT,
  BIT_HARD_HIST_DEFAULT,
  trophyMask,
  achievedVariantBit,
  addAchieved,
  parseAchievedRecord,
  serializeAchievedRecord,
} from '../src/core/achieved-record';
import { storeOpenStatus } from '../src/core/store';
import { achievedMissionIds, achievedRecord, grantStoreOpening, recordStoreSortie, storedStoreStatus } from '../src/systems/store-storage';

const bit = (hard: boolean, historical: boolean, custom: boolean): number => achievedVariantBit({ hard, historical, custom });

describe('形のビット（achievedVariantBit）', () => {
  it('8 つの形は別々の 1 ビット（1・2・4・…・128）。ノーマル・史実オフ・デフォルトは 1', () => {
    const all: number[] = [];
    for (const custom of [false, true]) for (const historical of [false, true]) for (const hard of [false, true]) all.push(bit(hard, historical, custom));
    expect(all).toEqual([1, 2, 4, 8, 16, 32, 64, 128]);
    expect(all.reduce((a, b) => a | b, 0)).toBe(ACH_MASK_ALL);
    expect(bit(false, false, false)).toBe(ACH_BIT_PLAIN);
    expect([ACH_HARD, ACH_HISTORICAL, ACH_CUSTOM]).toEqual([1, 2, 4]);
    expect(bit(false, true, true)).toBe(1 << (ACH_HISTORICAL | ACH_CUSTOM)); // 史実でカスタム
  });
});

describe('保存の文字列（parseAchievedRecord・serializeAchievedRecord）', () => {
  it('版 2 の形 { v: 2, m: { id: ビットの和 } } を読み書きして同じ', () => {
    const rec = parseAchievedRecord('{"v":2,"m":{"us_02":1,"us_05":97}}');
    expect([...rec]).toEqual([['us_02', 1], ['us_05', 97]]);
    expect(serializeAchievedRecord(rec)).toBe('{"v":2,"m":{"us_02":1,"us_05":97}}');
    expect([...parseAchievedRecord(serializeAchievedRecord(rec))]).toEqual([...rec]);
  });
  it('S0・S1 のビルドの id の配列は「ノーマル・史実オフ・デフォルトで達成」（ビット 1）。空・重複・文字列でない物は落とす', () => {
    expect([...parseAchievedRecord('["us_02","jp_05"]')]).toEqual([['us_02', 1], ['jp_05', 1]]);
    expect([...parseAchievedRecord('["us_02","us_02","",5,null,"us_01"]')]).toEqual([['us_02', 1], ['us_01', 1]]);
    expect(serializeAchievedRecord(parseAchievedRecord('["us_02"]'))).toBe('{"v":2,"m":{"us_02":1}}');
  });
  it('無い・JSON でない・版違い・形違い → 空。壊れた値（0・256・小数・文字列）の任務は落とす', () => {
    for (const t of [null, undefined, '', '{broken', '3', 'null', '"us_02"', '{"v":1,"m":{"us_02":1}}', '{"v":2}', '{"v":2,"m":["us_02"]}', '{"m":{"us_02":1}}']) expect(parseAchievedRecord(t).size, String(t)).toBe(0);
    expect([...parseAchievedRecord('{"v":2,"m":{"a":0,"b":256,"c":1.5,"d":"1","e":-1,"f":255,"":1,"g":null}}')]).toEqual([['f', 255]]);
  });
});

describe('足す・数える', () => {
  it('addAchieved は新しいビットが立った時だけ true（＝保存する）。1 つのビットでない値・空の id は何もしない', () => {
    const rec = parseAchievedRecord(null);
    expect(addAchieved(rec, 'us_02', bit(false, false, false))).toBe(true);
    expect(addAchieved(rec, 'us_02', bit(false, false, false))).toBe(false);
    expect(addAchieved(rec, 'us_02', bit(false, true, true))).toBe(true);
    expect(rec.get('us_02')).toBe(1 | 64);
    for (const bad of [0, 3, 256, 1.5, NaN, -1]) expect(addAchieved(rec, 'us_02', bad), String(bad)).toBe(false);
    expect(addAchieved(rec, '', 1)).toBe(false);
    expect(rec.get('us_02')).toBe(65);
    expect([...achievedIdSet(rec)]).toEqual(['us_02']);
    expect(achievedCount(rec, ['us_01', 'us_02', 'us_03'])).toBe(1);
  });
  it('ストアを開く条件は今までどおり: どの形でも 1 つ立っていれば達成に数える', () => {
    const open = getStoreCatalogue(gameData).openMissionIds;
    const rec = parseAchievedRecord(null);
    open.forEach((id, i) => addAchieved(rec, id, 1 << (i % 8)));
    expect(storeOpenStatus(achievedIdSet(rec), open)).toEqual({ open: true, done: 13, total: 13 });
    rec.delete(open[0]!);
    expect(storeOpenStatus(achievedIdSet(rec), open)).toEqual({ open: false, done: 12, total: 13 });
  });
});

describe('頑張った証の形（v0.9.0 IP3・IP4。トロフィーとご褒美の材料。IP4 のユーザーの言葉 2026-11-28「達成条件をハード×史実 × デフォルトにしてください」）', () => {
  const P = bit(false, false, false), H = bit(true, false, false), S = bit(false, true, false), HS = bit(true, true, false);
  const C = bit(false, false, true), HC = bit(true, false, true), SC = bit(false, true, true), HSC = bit(true, true, true);
  const hv = (id: string): boolean => hasHardVariant(gameData, id);
  it('ハードの違いのある任務: トロフィーはハード・史実・デフォルト（8）だけ（語はハード）。ノーマルの史実 × デフォルト（4）だけでは出ない', () => {
    expect(BIT_HARD_HIST_DEFAULT).toBe(HS);
    expect(trophyMask(true)).toBe(HS);
    expect(historicalDefaultTrophy(0, true)).toBeNull();
    expect(historicalDefaultTrophy(S, true)).toBeNull(); // IP3 では出た
    expect(historicalDefaultTrophy(HS, true)).toEqual({ hard: true });
    expect(historicalDefaultTrophy(S | HS | P, true)).toEqual({ hard: true });
    for (const m of [P, H, S, C, HC, SC, HSC, P | H | S | C | HC | SC | HSC]) expect(historicalDefaultTrophy(m, true), String(m)).toBeNull();
    for (const bad of [256, 1.5, -1, NaN]) expect(historicalDefaultTrophy(bad, true), String(bad)).toBeNull();
    for (let m = 1; m <= 255; m++) expect(historicalDefaultTrophy(m, true) !== null, String(m)).toBe((m & HS) !== 0);
  });
  it('ハードの違いの無い任務（jp_02・jp_05。設計の既定）: 史実・デフォルト（4）で出る（語はハードなし）。8 も同じ世界の形として数える', () => {
    expect(['jp_02', 'jp_05'].map(hv)).toEqual([false, false]);
    expect(getStoreCatalogue(gameData).openMissionIds.filter((id) => !hv(id))).toEqual(['jp_02', 'jp_05']);
    expect(MASK_HIST_DEFAULT).toBe(S | HS);
    expect(trophyMask(false)).toBe(S | HS);
    expect(historicalDefaultTrophy(S, false)).toEqual({ hard: false });
    expect(historicalDefaultTrophy(HS, false)).toEqual({ hard: false });
    for (const m of [P, H, C, HC, SC, HSC]) expect(historicalDefaultTrophy(m, false), String(m)).toBeNull();
    for (let m = 1; m <= 255; m++) expect(historicalDefaultTrophy(m, false) !== null, String(m)).toBe((m & 12) !== 0);
  });
  it('数と全部（ご褒美の条件）: 11 任務はハード・史実・デフォルト、jp_02・jp_05 は史実・デフォルト。ノーマルの史実だけ・カスタムの史実・S0／S1 の配列では満たさない。任務が空なら偽', () => {
    const open = getStoreCatalogue(gameData).openMissionIds;
    const rec = parseAchievedRecord(null);
    for (const id of open) addAchieved(rec, id, hv(id) ? HS : S);
    expect(historicalDefaultCount(rec, open, hv)).toBe(13);
    expect(historicalDefaultAll(rec, open, hv)).toBe(true);
    expect(historicalDefaultAll(rec, [], hv)).toBe(false);
    rec.set('us_05', P | H | S | SC | HSC); // 1 つだけハードの史実はカスタムでだけ（ノーマルの史実 × デフォルトはある）
    expect(historicalDefaultCount(rec, open, hv)).toBe(12);
    expect(historicalDefaultAll(rec, open, hv)).toBe(false);
    const normalHist = parseAchievedRecord(null); // IP3 の条件（ノーマルの史実 × デフォルト）だけ → jp_02・jp_05 の 2 つ
    for (const id of open) addAchieved(normalHist, id, S);
    expect(historicalDefaultCount(normalHist, open, hv)).toBe(2);
    expect(historicalDefaultAll(normalHist, open, hv)).toBe(false);
    const legacy = parseAchievedRecord(JSON.stringify(open)); // S0・S1 の配列
    expect(historicalDefaultCount(legacy, open, hv)).toBe(0);
    expect(historicalDefaultAll(legacy, open, hv)).toBe(false);
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
  delete g.localStorage;
});
const KEY = 'night-hunters.achieved';

describe('保存（systems/store-storage。鍵は S0・S1 と同じ night-hunters.achieved の 1 つ）', () => {
  it('任務の終わりに形のビットを足す（史実でカスタムの達成を覚える）。同じ形の 2 回目は書かない・未達は書かない', () => {
    recordStoreSortie(gameData, 'us_02', true, 100, bit(false, true, true));
    expect(ls.map.get(KEY)).toBe('{"v":2,"m":{"us_02":64}}');
    const w = ls.writes;
    recordStoreSortie(gameData, 'us_02', true, 100, bit(false, true, true));
    expect(ls.writes).toBe(w + 1); // 財布の 1 回だけ（達成の鍵は書かない）
    recordStoreSortie(gameData, 'us_02', false, 100, bit(true, false, false));
    expect(ls.map.get(KEY)).toBe('{"v":2,"m":{"us_02":64}}');
    recordStoreSortie(gameData, 'us_02', true, 100, bit(true, false, false));
    recordStoreSortie(gameData, 'us_03', true, 100);
    expect([...achievedRecord()]).toEqual([['us_02', 66], ['us_03', 1]]);
    expect([...achievedMissionIds()]).toEqual(['us_02', 'us_03']);
  });
  it('S0・S1 の配列の端末: 読めて（達成の数・ストアが開いたまま）、次に新しいビットが立った時に新しい形へ書き直る（前の達成は消えない）', () => {
    const open = getStoreCatalogue(gameData).openMissionIds;
    ls.map.set(KEY, JSON.stringify(open));
    expect(storedStoreStatus(gameData)).toEqual({ open: true, done: 13, total: 13 });
    expect(grantStoreOpening(gameData)).toBe(getStoreCatalogue(gameData).grantPoints);
    recordStoreSortie(gameData, 'us_01', true, 0); // 同じ形（ノーマル・デフォルト）＝配列のまま書かない
    expect(ls.map.get(KEY)).toBe(JSON.stringify(open));
    recordStoreSortie(gameData, 'us_01', true, 0, bit(true, true, true));
    const rec = achievedRecord();
    expect(rec.get('us_01')).toBe(1 | 128);
    expect(open.every((id) => rec.has(id))).toBe(true);
    expect(JSON.parse(ls.map.get(KEY)!)).toMatchObject({ v: 2 });
    expect(storedStoreStatus(gameData).open).toBe(true);
  });
  it('localStorage が無い・壊れた保存でも例外なし（達成なし）', () => {
    ls.map.set(KEY, '{broken');
    expect(achievedRecord().size).toBe(0);
    delete g.localStorage;
    expect(achievedRecord().size).toBe(0);
    expect(() => recordStoreSortie(gameData, 'us_02', true, 0, 64)).not.toThrow();
  });
});
