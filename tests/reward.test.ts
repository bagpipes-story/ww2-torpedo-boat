// 頑張った証（v0.9.0 IP3。ユーザーの言葉 2026-11-27「史実　デフォルトで達成したシナリオには出撃前の説明画面にトロフィーが表示されたり、全シナリオ史実デフォルトでクリアして場合のみ、
// ご褒美追加装備がもらえるなど、頑張った証が分かるようになればいいな」・ご褒美は「歴戦の乗員（推奨）」）:
// - ご褒美を渡す規則（core/store の grantRewards・systems/store-storage の recordStoreSortie）: 13 任務がみな史実 × デフォルトの達成になった任務の終わりに 1 回だけ・装着して渡す・
//   財布は 1 回の setItem・S0／S1 の配列の記録とカスタムの史実では渡さない・交換できない
// - ストアの札（ui/store-texts）: まだなら値段の代わりに進み n/13・2 行目は「ご褒美（史実・デフォルトで全13任務を達成）」・渡した後は装着中／外している
// - Briefing のトロフィーの置き方（config/trophy-config）: 1280〜1584 で 13 任務の題・1 行目・「← 任務一覧」・行・装備の切り替え・出撃に重ならない
// - ?debug&achieved の形（config/debug-achieved の parseDebugAchieved）と写しの財布（localStorage に書かない）
// - Result の 1 行と配線
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getBriefingRecord } from '../src/config/briefing-data';
import { gameData } from '../src/config/game-data';
import { hasHardVariant } from '../src/config/mission-data';
import { getStoreCatalogue, storeItemById } from '../src/config/store-data';
import { BRIEF_TROPHY_LABEL_PX, briefTrophyJa, briefTrophyLayout, rewardResultJa, storeRewardJa, storeRewardProgressJa } from '../src/config/trophy-config';
import { briefLoadoutRect, storeActionRect } from '../src/config/store-layout-config';
import { achievedVariantBit, parseDebugAchieved, serializeAchievedRecord } from '../src/core/achieved-record';
import { emptyStoreState, grantRewards, purchaseItem, serializeStoreState } from '../src/core/store';
import { clearStoreMemory, enableStoreMemory, loadStoreState, purchaseStoreItem, recordStoreSortie, setStoreItemEquipped } from '../src/systems/store-storage';
import { formatDateJa } from '../src/core/briefing';

import { storeCardState, storeCardSubJa } from '../src/ui/store-texts';
import { textWidthPx } from './pt-ui-kit';

const cat = getStoreCatalogue(gameData);
const OPEN = cat.openMissionIds;
const CREW = storeItemById(cat, 'crew_veteran')!;
const bit = (hard: boolean, historical: boolean, custom: boolean): number => achievedVariantBit({ hard, historical, custom });
const S = bit(false, true, false), HS = bit(true, true, false), P = bit(false, false, false), SC = bit(false, true, true);
const src = (f: string): string => readFileSync(join(__dirname, '..', 'src', f), 'utf8');

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
const ACH = 'night-hunters.achieved';
const STORE = 'night-hunters.store';
/** 13 任務のうち skip 以外を mask で達成した記録 */
const recordOf = (mask: number, skip: string | null): string => serializeAchievedRecord(new Map(OPEN.filter((id) => id !== skip).map((id) => [id, mask])));

describe('ご褒美の品（data/store.json の crew_veteran）', () => {
  it('ご褒美（reward）・値段なし・米の 3 艇・効きは弾倉交換 2.0 秒と消火 0.6 秒。交換はできない', () => {
    expect([CREW.reward, CREW.price, CREW.nameJa, CREW.boats]).toEqual([true, 0, '歴戦の乗員', ['us_elco77', 'us_elco80', 'us_higgins78']]);
    expect(CREW.effect).toEqual({ kind: 'boat_crew', reloadS: 2, extinguishHoldS: 0.6 });
    expect(purchaseItem({ ...emptyStoreState(), points: 1e9 }, CREW)).toEqual({ ok: false, reason: 'reward' });
    expect(purchaseStoreItem(gameData, 'crew_veteran')).toEqual({ ok: false, reason: 'reward' });
    expect(ls.writes).toBe(0);
  });
  it('grantRewards: 条件を満たした時だけ、まだ持っていないご褒美を足して装着（外していた印も外す）。2 回目は何もしない', () => {
    const s0 = { ...emptyStoreState(), owned: ['fuel_tank'], off: ['fuel_tank'] };
    expect(grantRewards(s0, cat.items, false)).toEqual({ state: s0, granted: [] });
    const a = grantRewards(s0, cat.items, true);
    expect(a.granted).toEqual(['crew_veteran']);
    expect(a.state).toMatchObject({ owned: ['fuel_tank', 'crew_veteran'], off: ['fuel_tank'] });
    expect(grantRewards(a.state, cat.items, true).granted).toEqual([]);
    expect(grantRewards({ ...a.state, off: ['crew_veteran'] }, cat.items, true).state.off).toEqual(['crew_veteran']); // 外したご褒美は外したまま
  });
});

describe('ご褒美を渡す（任務の終わり。systems/store-storage の recordStoreSortie）', () => {
  it('13 任務目を史実 × デフォルトで達成した出撃で 1 回だけ渡し、装着する（財布は 1 回の setItem）。次の出撃では渡さない', () => {
    ls.map.set(ACH, recordOf(S, 'jp_05'));
    ls.map.set(STORE, serializeStoreState({ ...emptyStoreState(), points: 10, granted: true }));
    const r0 = recordStoreSortie(gameData, 'jp_05', true, 100, bit(false, false, false)); // 史実オフで達成 → まだ
    expect(r0.rewards).toEqual([]);
    const w = ls.writes;
    const r = recordStoreSortie(gameData, 'jp_05', true, 100, S);
    expect(ls.writes - w).toBe(2); // 達成の鍵と財布の 1 回ずつ
    expect(r.rewards).toEqual(['crew_veteran']);
    expect(loadStoreState(gameData)).toMatchObject({ owned: ['crew_veteran'], off: [], points: 210 });
    expect(recordStoreSortie(gameData, 'us_02', true, 0, S).rewards).toEqual([]);
    expect(loadStoreState(gameData).owned).toEqual(['crew_veteran']);
  });
  it('ハードの史実 × デフォルトも数える。未達・カスタムの史実・S0／S1 の配列の記録では渡さない', () => {
    ls.map.set(ACH, recordOf(HS, 'us_03'));
    expect(recordStoreSortie(gameData, 'us_03', false, 0, S).rewards).toEqual([]); // 未達
    expect(recordStoreSortie(gameData, 'us_03', true, 0, SC).rewards).toEqual([]); // 史実でもカスタム
    expect(recordStoreSortie(gameData, 'us_03', true, 0, P).rewards).toEqual([]); // 史実オフ
    expect(recordStoreSortie(gameData, 'us_03', true, 0, HS).rewards).toEqual(['crew_veteran']);
    ls.map.clear();
    ls.map.set(ACH, JSON.stringify(OPEN)); // S0・S1 の配列（ビット 1）
    for (const id of OPEN) expect(recordStoreSortie(gameData, id, true, 0, P).rewards, id).toEqual([]);
    expect(loadStoreState(gameData).owned).toEqual([]);
  });
  it('前のビルドが表に無い品として落としていても、条件のままなら次の任務の終わりで戻る（持ち物＝渡した印）', () => {
    ls.map.set(ACH, recordOf(S, null));
    ls.map.set(STORE, serializeStoreState({ ...emptyStoreState(), granted: true }));
    expect(recordStoreSortie(gameData, 'us_01', false, 0).rewards).toEqual(['crew_veteran']);
  });
  it('渡した後は装着の入り切りがほかの品と同じ', () => {
    ls.map.set(STORE, serializeStoreState({ ...emptyStoreState(), owned: ['crew_veteran'] }));
    expect(setStoreItemEquipped(gameData, 'crew_veteran', false).off).toEqual(['crew_veteran']);
    expect(setStoreItemEquipped(gameData, 'crew_veteran', true).off).toEqual([]);
  });
});

describe('ストアの札（ui/store-texts）', () => {
  it('まだ: 右は進み n/13（short の色）・2 行目は札。渡した後: 装着中／外している（2 行目は札のまま）。主ボタンの 2 行目は「史実デフォルト n/13」', () => {
    const s = { ...emptyStoreState(), points: 1e6 };
    expect(storeCardState(s, CREW, { done: 4, total: 13 })).toEqual({ text: '4/13', tone: 'short' });
    expect(storeCardState({ ...s, owned: ['crew_veteran'] }, CREW, { done: 13, total: 13 })).toEqual({ text: '装着中', tone: 'on' });
    expect(storeCardState({ ...s, owned: ['crew_veteran'], off: ['crew_veteran'] }, CREW)).toEqual({ text: '外している', tone: 'off' });
    expect(storeCardSubJa(gameData, CREW)).toBe('ご褒美（史実・デフォルトで全13任務を達成）');
    expect(storeRewardJa(13)).toBe('ご褒美（史実・デフォルトで全13任務を達成）');
    expect(storeCardSubJa(gameData, storeItemById(cat, 'fuel_tank')!)).toBe('燃料の割当 ×1.25');
    expect(storeRewardProgressJa(4, 13)).toBe('史実デフォルト 4/13');
  });
});

describe('?debug&achieved の形（parseDebugAchieved）と写しの財布', () => {
  it('<id|all>[:形]。形は 無し・hard・hist・hardhist（カスタムは無い）。表に無い形・空の語は落とす', () => {
    expect(parseDebugAchieved('all')).toEqual([{ id: 'all', bit: 1 }]);
    expect(parseDebugAchieved('all:hist')).toEqual([{ id: 'all', bit: S }]);
    expect(parseDebugAchieved('us_02:hardhist,us_03:hard,jp_01')).toEqual([{ id: 'us_02', bit: HS }, { id: 'us_03', bit: 2 }, { id: 'jp_01', bit: 1 }]);
    expect(parseDebugAchieved('us_02:custom,,us_03:hist:x,:hist,us_04:toString')).toEqual([]);
  });
  it('ご褒美を写しの財布に足しても localStorage の財布は書かない（点は保存の物のまま）', () => {
    ls.map.set(STORE, serializeStoreState({ ...emptyStoreState(), points: 500 }));
    const before = ls.map.get(STORE);
    enableStoreMemory(gameData, null, ['crew_veteran']);
    expect(loadStoreState(gameData)).toMatchObject({ points: 500, owned: ['crew_veteran'], off: [] });
    setStoreItemEquipped(gameData, 'crew_veteran', false);
    expect(ls.map.get(STORE)).toBe(before);
    expect(ls.writes).toBe(0);
  });
});

describe('Briefing のトロフィーの置き方（config/trophy-config）', () => {
  /** config/menu-config の値（DOM を読む config なのでソースから） */
  const num = (name: string): number => Number(new RegExp(`export const ${name} = (\\d+);`).exec(src('config/menu-config.ts'))![1]);
  const [BX, TY, TPX, SY, SPX, BACK_W, BACK_H, ROW_TOP] = ['BRIEF_X', 'BRIEF_TITLE_Y', 'BRIEF_TITLE_PX', 'BRIEF_SUB_Y', 'BRIEF_SUB_PX', 'BRIEF_BACK_W', 'BRIEF_BACK_H', 'BRIEF_ROW_TOP'].map(num) as [number, number, number, number, number, number, number, number];
  const BACK_Y = 24; // BRIEF_BACK_Y = HUD_MARGIN（24）
  expect(src('config/menu-config.ts')).toContain('export const BRIEF_BACK_Y = HUD_MARGIN;');
  it('1280〜1584 の全部 × 13 任務 × ノーマル・ハード × 史実: 題・1 行目（日付・場所・難易度・史実モード）・「← 任務一覧」・6 行・装備の切り替え・出撃に重ならない', () => {
    const ids = OPEN;
    for (let w = 1280; w <= 1584; w += 8) {
      const backX = w - 24 - BACK_W;
      for (const hard of [false, true]) {
        const l = briefTrophyLayout(backX, TY, TPX, hard);
        expect(l.right).toBe(backX - 24);
        expect(l.labelX + textWidthPx(briefTrophyJa(hard), BRIEF_TROPHY_LABEL_PX)).toBeLessThanOrEqual(l.right + 0.01);
        expect(l.bottom, `${w}`).toBeLessThan(ROW_TOP); // 6 行の上
        expect(l.top, `${w}`).toBeGreaterThan(SY + SPX * 1.21 - 1); // 1 行目の下（行の高さ ≈ 字 × 1.21）
        expect(l.bottom).toBeLessThan(BACK_Y + BACK_H + 30);
        const lo = briefLoadoutRect(w);
        const go = storeActionRect(w);
        expect(l.bottom).toBeLessThan(Math.min(lo.y, go.y));
        for (const id of ids) {
          const rec = getBriefingRecord(gameData, id, hard && hasHardVariant(gameData, id));
          expect(BX + textWidthPx(rec.titleJa, TPX), `${id} ${w}`).toBeLessThan(l.left - 24);
          const sub = `${formatDateJa(rec.date)} ・ ${rec.place} ・ ハード ・ 史実モード`;
          // 1 行目は縦で重ならない（上の判定）。横に長くてもよいが、念のため幅を記録の範囲で見る
          expect(BX + textWidthPx(sub, SPX), `${id}`).toBeLessThan(backX);
        }
      }
    }
  });
  it('文: 「史実で達成」・ハードでも達成していれば「史実で達成（ハード）」。Result の 1 行', () => {
    expect([briefTrophyJa(false), briefTrophyJa(true)]).toEqual(['史実で達成', '史実で達成（ハード）']);
    expect(rewardResultJa(['歴戦の乗員'])).toBe('ご褒美: 歴戦の乗員 を手に入れた');
  });
});

describe('配線（ソース）', () => {
  it('Briefing: create で 1 回だけ（トロフィーが無ければ何も作らない）。Result: ご褒美を渡した出撃だけ 1 行。Boot: 写しの財布は 1 か所', () => {
    expect(src('scenes/briefing-scene.ts')).toContain('addBriefingTrophy(this, briefingTrophy(base, id));');
    expect(src('ui/briefing-trophy.ts')).toContain('if (!trophy) return;');
    expect(src('scenes/result-scene.ts')).toContain('if (r.store && r.store.rewards.length > 0) line(rewardResultJa(');
    expect(src('scenes/boot-scene.ts')).toContain('debugStoreMemory(gameData);');
    expect(src('assets/trophy-art.ts')).toContain('if (scene.textures.exists(TROPHY_TEXTURE_KEY)) return TROPHY_TEXTURE_KEY;');
    for (const f of ['scenes/briefing-scene.ts', 'scenes/result-scene.ts', 'scenes/store-scene.ts', 'scenes/title-scene.ts', 'config/store-data.ts', 'systems/sortie-loadout.ts', 'systems/store-storage.ts']) expect(src(f).split('\n').length, f).toBeLessThanOrEqual(301);
  });
});
