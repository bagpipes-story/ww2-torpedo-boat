// 出撃の装備「デフォルト／カスタム」（v0.9.0 S0。config/custom-loadout・config/store-data。spec-v0900 §4.1・§4.2・§6・§7）:
// デフォルト（custom の鍵が無い。史実モードでも）の出撃の data は base そのもの（toBe）を 13 任務×ハードで。v0.9.0 IP1: 史実モードのカスタムはカスタムと同じ data（史実かどうかで変わらない）。カスタムは自艇と任務の記録だけを写し（base を深く freeze しても投げない）、
// 13 任務×ハード×（品 1 つずつ＋全部）の組み立てが投げない。効く品（任務ごと）・効き（数）・日本の艇に効かない・Boot の検査 V-S1〜V-S4 が壊れた data を止める。
import { describe, expect, it } from 'vitest';
import { gameData, getBoatTorpedoCount, getPrototypeMission, type GameData } from '../src/config/game-data';
import { playableMissionIds } from '../src/config/campaign-data';
import { hasHardVariant } from '../src/config/mission-data';
import { applyStoreItems, effectiveStoreItems, sortieGameData, withCustomLoadout } from '../src/config/custom-loadout';
import { getStoreCatalogue, validateStore } from '../src/config/store-data';
import { getLoadout } from '../src/config/loadout-data';
import { directSortie, isSortie } from '../src/core/sortie';
import { buildWorldSetup } from '../src/systems/world-setup';

type Rec = Record<string, unknown>;
const MISSIONS = [...playableMissionIds(gameData, 'us_pt'), ...playableMissionIds(gameData, 'jp_hard')];
const ITEMS = getStoreCatalogue(gameData).items.map((x) => x.id);
const VARIANTS = MISSIONS.flatMap((id) => [false, ...(hasHardVariant(gameData, id) ? [true] : [])].map((hard) => ({ id, hard })));
const clone = (): GameData => JSON.parse(JSON.stringify(gameData)) as GameData;
function deepFreeze<T>(o: T): T {
  if (typeof o === 'object' && o !== null && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as Rec)) deepFreeze(v);
  }
  return o;
}
const FROZEN = deepFreeze(clone());
const custom = (id: string, items: string[], hard = false, historical = false) => ({ ...directSortie(id, 1, 'none', hard, historical), custom: { items } });

describe('デフォルトは base そのもの（ビット同一の芯）', () => {
  it('条件の任務は 13（data の open.campaigns の遊べる任務）・品は v0.9.0 の数の 4 つ＋ご褒美 1 つ（IP3。歴戦の乗員）', () => {
    expect(MISSIONS).toHaveLength(13);
    expect(getStoreCatalogue(gameData).openMissionIds).toEqual(MISSIONS);
    expect(ITEMS).toEqual(['fuel_tank', 'smoke_large', 'torp_mk13', 'torp_rack6', 'crew_veteran']);
    expect(getStoreCatalogue(gameData).items.map((x) => [x.id, x.reward, x.price])).toEqual([['fuel_tank', false, 3000], ['smoke_large', false, 4000], ['torp_mk13', false, 4000], ['torp_rack6', false, 8000], ['crew_veteran', true, 0]]);
  });
  it.each(VARIANTS)('$id hard=$hard: デフォルトの出撃（custom の鍵なし）は史実モードでも toBe。史実モードのカスタムは史実オフのカスタムと同じ data・同じ印（v0.9.0 IP1）', ({ id, hard }) => {
    for (const hist of [false, true]) {
      const s = directSortie(id, 1, 'none', hard, hist);
      expect('custom' in s).toBe(false);
      expect(sortieGameData(gameData, s)).toBe(gameData);
    }
    const eff = effectiveStoreItems(gameData, id, ITEMS);
    const h = withCustomLoadout(directSortie(id, 1, 'none', hard, true), gameData, ITEMS);
    expect(h.custom?.items).toEqual(eff.length > 0 ? eff : undefined);
    expect(h.historical).toBe(true);
    // 同じ品なら史実モードかどうかで data は変わらない（覚えた物も同じ＝Mission と Hud が同じ物を読む）
    const a = sortieGameData(gameData, custom(id, ITEMS, hard, false));
    expect(sortieGameData(gameData, custom(id, ITEMS, hard, true))).toBe(a);
    expect(a === gameData).toBe(eff.length === 0);
  });
  it('効く品の無い印（日本の艇）は base そのもの・withCustomLoadout は印を付けない', () => {
    for (const id of MISSIONS.filter((m) => m.startsWith('jp_'))) {
      expect(effectiveStoreItems(gameData, id, ITEMS)).toEqual([]);
      expect(applyStoreItems(gameData, id, ITEMS)).toBe(gameData);
      const s = directSortie(id, 1, 'none');
      expect(withCustomLoadout(s, gameData, ITEMS)).toBe(s);
    }
  });
});

describe('効く品と効き', () => {
  it('任務ごとに効く品（表の順）: 燃料・煙幕は米の 7 任務、Mk 13 は Mk 8 の Elco 80 の任務（us_02・us_04）、架台 6 は Elco 80・Higgins（us_02〜us_07）', () => {
    const got = Object.fromEntries(MISSIONS.filter((m) => m.startsWith('us_')).map((id) => [id, effectiveStoreItems(gameData, id, ITEMS)]));
    expect(got).toEqual({
      us_01: ['fuel_tank', 'smoke_large', 'crew_veteran'],
      us_02: ['fuel_tank', 'smoke_large', 'torp_mk13', 'torp_rack6', 'crew_veteran'],
      us_03: ['fuel_tank', 'smoke_large', 'torp_rack6', 'crew_veteran'],
      us_04: ['fuel_tank', 'smoke_large', 'torp_mk13', 'torp_rack6', 'crew_veteran'],
      us_05: ['fuel_tank', 'smoke_large', 'torp_rack6', 'crew_veteran'],
      us_06: ['fuel_tank', 'smoke_large', 'torp_rack6', 'crew_veteran'],
      us_07: ['fuel_tank', 'smoke_large', 'torp_rack6', 'crew_veteran'],
    });
    expect(effectiveStoreItems(gameData, 'us_02', ['nope', 'torp_mk13'])).toEqual(['torp_mk13']);
  });
  it('us_02 の全部: 魚雷 Mk 13・6 本・煙幕 8 s／15 s・燃料 38 × 1.25。ほかの艇・任務の記録は同じ物（参照）・base は変わらない', () => {
    const before = JSON.stringify(gameData);
    const d = applyStoreItems(FROZEN, 'us_02', ITEMS);
    const s = buildWorldSetup(d, 'us_02');
    const b = buildWorldSetup(FROZEN, 'us_02');
    expect(getPrototypeMission(d, 'us_02').torpedoId).toBe('us_mk13');
    expect(getBoatTorpedoCount(d, 'us_elco80')).toBe(6);
    expect(s.smokeParams).toEqual({ ...b.smokeParams!, durationS: 8, cooldownS: 15 });
    expect(s.fuelAllotmentGal).toBe(38 * 1.25);
    expect(s.torpedoParams).not.toEqual(b.torpedoParams);
    expect(s.boatParams).toEqual(b.boatParams);
    expect(s.fuelCurve).toEqual(b.fuelCurve);
    const boats = d.boats.boats as readonly Rec[];
    const baseBoats = FROZEN.boats.boats as readonly Rec[];
    boats.forEach((x, i) => (x['id'] === 'us_elco80' ? expect(x).not.toBe(baseBoats[i]) : expect(x).toBe(baseBoats[i])));
    const ms = d.missionsSeed.missions as readonly Rec[];
    const baseMs = FROZEN.missionsSeed.missions as readonly Rec[];
    ms.forEach((x, i) => (x['id'] === 'us_02' ? expect(x).not.toBe(baseMs[i]) : expect(x).toBe(baseMs[i])));
    expect(d.enemies).toBe(FROZEN.enemies);
    expect(d.hitRateModel).toBe(FROZEN.hitRateModel);
    expect(JSON.stringify(gameData)).toBe(before);
  });
  it('us_01 の僚艇（同じ us_elco77）は燃料・煙幕・乗員では変わらない（V-S4: 僚艇が読む鍵に触らない）', () => {
    const a = buildWorldSetup(applyStoreItems(FROZEN, 'us_01', ITEMS), 'us_01');
    expect(a.escort).toEqual(buildWorldSetup(FROZEN, 'us_01').escort);
    expect(a.smokeParams?.durationS).toBe(8);
    expect(a.damageParams.extinguishHoldS).toBe(0.6);
  });
  it.each(['us_01', 'us_02', 'us_03', 'us_04', 'us_05', 'us_06', 'us_07'])('%s: ご褒美「歴戦の乗員」（boat_crew。v0.9.0 IP3）は自艇の弾倉交換 3.2 → 2.0 秒・消火 1 → 0.6 秒だけ。乗員の倍率・砲のほかの値・僚艇・味方の艇・base は同じ', (id) => {
    const before = JSON.stringify(gameData);
    const d = applyStoreItems(FROZEN, id, ['crew_veteran']);
    expect(effectiveStoreItems(gameData, id, ['crew_veteran'])).toEqual(['crew_veteran']);
    const a = buildWorldSetup(d, id);
    const b = buildWorldSetup(FROZEN, id);
    expect(a.damageParams).toEqual({ ...b.damageParams, extinguishHoldS: 0.6 });
    expect(b.damageParams.extinguishHoldS).toBe(1);
    expect(a.crew).toEqual(b.crew);
    expect(a.crewEffects).toEqual(b.crewEffects);
    expect(a.escort).toEqual(b.escort); // us_01 の僚艇（ほかの任務は null）
    expect(a.boatParams).toEqual(b.boatParams);
    expect(a.smokeParams).toEqual(b.smokeParams);
    expect(a.torpedoParams).toEqual(b.torpedoParams);
    expect(a.torpedoCapacity).toBe(b.torpedoCapacity);
    expect(a.fuelAllotmentGal).toBe(b.fuelAllotmentGal);
    expect(JSON.stringify((a as unknown as Rec)['rescue'] ?? null)).toBe(JSON.stringify((b as unknown as Rec)['rescue'] ?? null)); // us_07 の味方の艇（player_full の速さ）は同じ
    const ga = getLoadout(d, getPrototypeMission(d, id))!.gun!;
    const gb = getLoadout(FROZEN, getPrototypeMission(FROZEN, id))!.gun!;
    expect(gb.magazine?.reloadS).toBe(3.2);
    expect(ga).toEqual({ ...gb, magazine: { ...gb.magazine!, reloadS: 2 } });
    // 写したのは自艇の記録だけ（gun_battery・damage の中のほかの物は同じ参照）
    const boatId = getPrototypeMission(d, id).playerBoatId;
    const nb = (d.boats.boats as readonly Rec[]).find((x) => x['id'] === boatId)!;
    const ob = (FROZEN.boats.boats as readonly Rec[]).find((x) => x['id'] === boatId)!;
    expect((nb['damage'] as Rec)['crew_effects']).toBe((ob['damage'] as Rec)['crew_effects']);
    expect((nb['gun_battery'] as Rec)['groups']).toBe((ob['gun_battery'] as Rec)['groups']);
    expect(JSON.stringify(gameData)).toBe(before);
  });
  it('同じ出撃の 2 回目は覚えた物（Mission と Hud が同じ物）', () => {
    const s = custom('us_04', ['torp_mk13']);
    const a = sortieGameData(gameData, s);
    expect(a).not.toBe(gameData);
    expect(sortieGameData(gameData, { ...s, seed: 9 })).toBe(a);
    expect(isSortie(s)).toBe(true);
  });
  it.each(VARIANTS)('$id hard=$hard: 品 1 つずつと全部の組み立て（frozen の base）が投げない・兵装も組める', ({ id, hard }) => {
    for (const items of [...ITEMS.map((x) => [x]), ITEMS]) {
      const d = applyStoreItems(FROZEN, id, items);
      expect(() => buildWorldSetup(d, id, { sortie: directSortie(id, 1, 'none', hard, false), hard })).not.toThrow();
      expect(() => getLoadout(d, getPrototypeMission(d, id, hard))).not.toThrow();
    }
  });
});

describe('Sortie の custom（core/sortie の isSortie）', () => {
  it('無い・空でない文字列の配列は通る。空の配列・文字列でない・object でない は通らない', () => {
    const s = directSortie('us_02', 1, 'none');
    expect(isSortie({ ...s, custom: { items: ['a'] } })).toBe(true);
    for (const c of [{ items: [] }, { items: [1] }, { items: [''] }, 'x', null, {}]) expect(isSortie({ ...s, custom: c })).toBe(false);
  });
});

describe('Boot の検査（validateStore の V-S1〜V-S4）', () => {
  const broken = (f: (s: Rec) => void): GameData => {
    const d = clone();
    f((d as unknown as Rec)['store'] as Rec);
    return d;
  };
  const items = (s: Rec): Rec[] => s['items'] as Rec[];
  it('今の data は通る', () => expect(() => validateStore(gameData)).not.toThrow());
  it.each([
    ['V-S1', 'id の重複', (s: Rec) => items(s).push({ ...items(s)[0]! })],
    ['V-S1', '値段が正の整数でない', (s: Rec) => (items(s)[0]!['price'] = 10.5)],
    ['V-S1', '効きの形が無い', (s: Rec) => (items(s)[0]!['effect'] = { kind: 'boat_speed', kt: 2 })],
    ['V-S1', '効きの鍵が余る', (s: Rec) => ((items(s)[0]!['effect'] as Rec)['extra'] = 1)],
    ['V-S1', 'source が design でない', (s: Rec) => (items(s)[0]!['source'] = 'historical')],
    ['V-S1', '品の鍵が余る', (s: Rec) => (items(s)[0]!['speed'] = 1)],
    ['V-S1', 'kind が ally（v0.10 の予約）', (s: Rec) => (items(s)[0]!['kind'] = 'ally')],
    ['V-S1', '倍率が 0', (s: Rec) => ((s['accrual'] as Rec)['hard'] = 0)],
    ['V-S2', '艇が無い', (s: Rec) => (items(s)[0]!['boats'] = ['us_elco99'])],
    ['V-S2', '艇が条件を満たさない（Elco 77 は架台でない）', (s: Rec) => (items(s)[3]!['boats'] = ['us_elco77', 'us_elco80'])],
    ['V-S2', '魚雷が無い', (s: Rec) => ((items(s)[2]!['effect'] as Rec)['torpedo_id'] = 'us_mk99')],
    ['V-S2', '燃料が満タンを超える', (s: Rec) => ((items(s)[0]!['effect'] as Rec)['factor'] = 100)],
    ['V-S2', 'キャンペーンが無い', (s: Rec) => ((s['open'] as Rec)['campaigns'] = ['us_pt', 'zz'])],
    ['V-S2', '除く任務が無い', (s: Rec) => (items(s)[0]!['exclude_missions'] = ['us_99'])],
    ['V-S3', '2 つの品が同じ鍵', (s: Rec) => items(s).push({ ...items(s)[0]!, id: 'fuel_tank_2' })],
    ['V-S4', '日本の jp_03 の 18 隻が読む艇に触る', (s: Rec) => items(s).push({ ...items(s)[3]!, id: 'jp_rack', boats: ['jp_t38'], boat_condition: {} })],
    // v0.9.0 IP3: ご褒美（kind reward）と boat_crew
    ['V-S1', 'ご褒美に値段がある', (s: Rec) => (items(s)[4]!['price'] = 100)],
    ['V-S1', 'ご褒美に reward_rule が無い', (s: Rec) => delete items(s)[4]!['reward_rule']],
    ['V-S1', 'ご褒美の reward_rule が表に無い', (s: Rec) => (items(s)[4]!['reward_rule'] = 'all_hard')],
    ['V-S1', '交換の品に reward_rule がある', (s: Rec) => (items(s)[0]!['reward_rule'] = 'hard_historical_default_all')],
    ['V-S1', '交換の品に値段が無い', (s: Rec) => delete items(s)[0]!['price']],
    ['V-S1', '乗員の効きが 0', (s: Rec) => ((items(s)[4]!['effect'] as Rec)['reload_s'] = 0)],
    ['V-S1', '乗員の効きの鍵が欠ける', (s: Rec) => delete (items(s)[4]!['effect'] as Rec)['extinguish_hold_s']],
    ['V-S2', '乗員の艇に弾倉が無い（英の艇）', (s: Rec) => (items(s)[4]!['boats'] = ['us_elco80', 'uk_vosper73'])],
    ['V-S3', '2 つの品が乗員の鍵を触る', (s: Rec) => items(s).push({ ...items(s)[4]!, id: 'crew_2' })],
    ['V-S4', '日本の jp_03 の 18 隻の艇に乗員', (s: Rec) => (items(s)[4]!['boats'] = ['us_elco80', 'jp_t38'])],
  ])('%s: %s → 例外', (code, _label, f) => {
    expect(() => validateStore(broken(f as (s: Rec) => void))).toThrow(code);
  });
});
