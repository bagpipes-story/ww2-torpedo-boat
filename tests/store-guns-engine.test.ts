// v0.9.1（spec-v0900 §4.2・§4.3・§6-3〜5）: ストアの砲と機関の 3 品（gun_37mm・gun_40mm・engine_tuned）。
// - 燃料: core/fuel の fuelHoursFullKeepingExponent は最大速力を上げても燃料曲線の指数・巡航・アイドルが同じ（23 kt・30 kt の gal/h が base と同じ）。
// - 砲: 37mm は Elco 77 に重い組を頭に足し弾倉 50 → 80・名の頭に「37mm」、40mm は Elco 77 に組を足し、Elco 80・Higgins は重い組 150 → 225・弾倉 120 → 150。両方で重ねる。
//   ご褒美「歴戦の乗員」と重ねても組と弾倉の発は消えない。艦への機銃・対空の 1 発の確率は変えない（data を読む所が同じ）。
// - 機関: 最大速力 +2 kt・加速 ×1.1・静音の上限と速力帯は同じ。us_01 の僚艇も同じ最大速力と加速（遅れない）。us_07 には効かない（S ボートの追撃＞自艇）。
// - 13 任務×ハード×（3 品 1 つずつ・3 品・全部）で自艇の速さを比べる data の検査（米PT・S ボート・暴風・夜の哨戒機・機関の不調・輸送隊）と組み立てが投げない・base は変わらない。
// - Boot の検査 V-S1〜V-S4 が壊れた砲と機関の data を止める。
import { describe, expect, it } from 'vitest';
import { gameData, getBoatFuelCurve, getBoatRecord, getPrototypeMission, getStormParams, type GameData } from '../src/config/game-data';
import { playableMissionIds } from '../src/config/campaign-data';
import { hasHardVariant } from '../src/config/mission-data';
import { applyStoreItems, effectiveStoreItems, sortieGameData, withCustomLoadout } from '../src/config/custom-loadout';
import { getStoreCatalogue, validateStore } from '../src/config/store-data';
import { getAntiAircraftParams, getLoadout } from '../src/config/loadout-data';
import { getPtParams } from '../src/config/pt-mission-data';
import { getEngineParams } from '../src/config/engine-mission-data';
import { getPatrolAirParams } from '../src/config/patrol-air-mission-data';
import { getConvoyParams } from '../src/config/convoy-mission-data';
import { burnGph, fuelCurveFromData, fuelHoursFullKeepingExponent, type BoatFuelDataRecord } from '../src/core/fuel';
import { directSortie } from '../src/core/sortie';
import { ktToMps } from '../src/core/units';
import { buildWorldSetup } from '../src/systems/world-setup';

type Rec = Record<string, unknown>;
const MISSIONS = [...playableMissionIds(gameData, 'us_pt'), ...playableMissionIds(gameData, 'jp_hard')];
const ALL = getStoreCatalogue(gameData).items.map((x) => x.id);
const NEW = ['gun_37mm', 'gun_40mm', 'engine_tuned'];
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
const fuelRec = (d: GameData, id: string): BoatFuelDataRecord => getBoatRecord(d, id) as unknown as BoatFuelDataRecord;
const gun = (d: GameData, id: string) => getLoadout(d, getPrototypeMission(d, id)).gun!;

describe('燃料曲線の指数を保つ fuel_hours_full（core/fuel の fuelHoursFullKeepingExponent）', () => {
  it.each(['us_elco80', 'us_elco77'])('%s: 39 → 41 kt で指数・巡航・アイドルが同じ・23 kt と 30 kt の gal/h が base と同じ・全速は延長の値', (boatId) => {
    const r = fuelRec(gameData, boatId);
    const base = fuelCurveFromData(r);
    const hours = fuelHoursFullKeepingExponent(r, r.speed_max_kt + 2);
    const c = fuelCurveFromData({ ...r, speed_max_kt: r.speed_max_kt + 2, fuel_hours_full: hours });
    expect(c.exponent).toBeCloseTo(base.exponent, 12);
    expect([c.idleGph, c.cruiseGph]).toEqual([base.idleGph, base.cruiseGph]);
    for (const kt of [23, 30]) expect(burnGph(c, ktToMps(kt))).toBeCloseTo(burnGph(base, ktToMps(kt)), 9);
    expect(c.fullGph).toBeCloseTo(base.idleGph + (base.cruiseGph - base.idleGph) * Math.pow(41 / 23, base.exponent), 9);
    expect(hours).toBeLessThan(r.fuel_hours_full);
    expect(fuelHoursFullKeepingExponent(r, r.speed_max_kt)).toBeCloseTo(r.fuel_hours_full, 12); // 今の最大速力なら今の値
  });
  it('値: Elco 80 6 → 5.487 h・Elco 77 5.5 → 5.021 h（data の source の注と同じ）。巡航以下の速さは例外', () => {
    expect(fuelHoursFullKeepingExponent(fuelRec(gameData, 'us_elco80'), 41)).toBeCloseTo(5.487, 3);
    expect(fuelHoursFullKeepingExponent(fuelRec(gameData, 'us_elco77'), 41)).toBeCloseTo(5.021, 3);
    expect(() => fuelHoursFullKeepingExponent(fuelRec(gameData, 'us_elco80'), 23)).toThrow('speed_cruise_kt');
  });
});

describe('砲の 2 品（boat_gun_heavy）', () => {
  it('us_01（Elco 77）: 37mm は組を頭に足し弾倉 50 → 80・40mm も同じ。両方で 40mm・37mm・12.7mm の 3 組・弾倉 110・重い組 150 発/分（Elco 80 と同じ）', () => {
    const b = gun(FROZEN, 'us_01');
    expect([b.label, b.groups.map((g) => [g.id, g.roundsPerMin]), b.magazine]).toEqual(['12.7mm連装×2', [['12.7mm_twin_x2', 400]], { rounds: 50, reloadS: 3.2 }]);
    const g37 = gun(applyStoreItems(FROZEN, 'us_01', ['gun_37mm']), 'us_01');
    expect([g37.label, g37.groups.map((g) => [g.id, g.roundsPerMin, g.damage]), g37.magazine]).toEqual(['37mm・12.7mm連装×2', [['37mm_m4', 75, 8], ['12.7mm_twin_x2', 400, 2]], { rounds: 80, reloadS: 3.2 }]);
    const g40 = gun(applyStoreItems(FROZEN, 'us_01', ['gun_40mm']), 'us_01');
    expect([g40.label, g40.groups.map((g) => g.id), g40.magazine?.rounds]).toEqual(['40mm・12.7mm連装×2', ['40mm_bofors', '12.7mm_twin_x2'], 80]);
    const both = gun(applyStoreItems(FROZEN, 'us_01', ['gun_37mm', 'gun_40mm']), 'us_01');
    expect([both.label, both.groups.map((g) => g.id), both.magazine?.rounds]).toEqual(['40mm・37mm・12.7mm連装×2', ['40mm_bofors', '37mm_m4', '12.7mm_twin_x2'], 110]);
    expect(both.groups.filter((g) => g.damage === 8).reduce((s, g) => s + g.roundsPerMin, 0)).toBe(gun(FROZEN, 'us_02').groups[0]!.roundsPerMin);
    // 射程・死角・閃光・散布の倍率は同じ（足すのは組と弾倉と名だけ）
    expect({ ...both, label: '', groups: [], magazine: undefined }).toEqual({ ...b, label: '', groups: [], magazine: undefined });
  });
  it.each(['us_02', 'us_03', 'us_04', 'us_05', 'us_06', 'us_07'])('%s（Elco 80・Higgins）: 40mm は重い組 150 → 225・弾倉 120 → 150・名は同じ・組の数も同じ。37mm は効かない', (id) => {
    const b = gun(FROZEN, id);
    const a = gun(applyStoreItems(FROZEN, id, ['gun_40mm']), id);
    expect([b.groups[0]!.id, b.groups[0]!.roundsPerMin, b.magazine?.rounds]).toEqual(['40mm_37mm', 150, 120]);
    expect([a.groups[0]!.roundsPerMin, a.magazine?.rounds, a.label]).toEqual([225, 150, b.label]);
    expect(a.groups.slice(1)).toEqual(b.groups.slice(1));
    expect({ ...a.groups[0]!, roundsPerMin: 0 }).toEqual({ ...b.groups[0]!, roundsPerMin: 0 });
    expect(effectiveStoreItems(gameData, id, ['gun_37mm'])).toEqual([]);
  });
  it('主兵装が砲の任務（us_03 の大発・us_07 の S ボート）は WorldSetup の guns も 225 発/分', () => {
    for (const id of ['us_03', 'us_07']) {
      const s = buildWorldSetup(applyStoreItems(FROZEN, id, ['gun_40mm']), id);
      expect(s.guns?.groups[0]?.roundsPerMin, id).toBe(225);
      expect(buildWorldSetup(FROZEN, id).guns?.groups[0]?.roundsPerMin, id).toBe(150);
    }
  });
  it('ご褒美「歴戦の乗員」と重ねても組と弾倉の発は消えない（v0.9.1 から今の写しを読む）・対空の 1 発の確率は data のまま', () => {
    const g = gun(applyStoreItems(FROZEN, 'us_01', ['gun_37mm', 'gun_40mm', 'crew_veteran']), 'us_01');
    expect([g.groups.length, g.magazine]).toEqual([3, { rounds: 110, reloadS: 2 }]);
    const h = gun(applyStoreItems(FROZEN, 'us_03', ALL), 'us_03');
    expect([h.groups[0]!.roundsPerMin, h.magazine]).toEqual([225, { rounds: 150, reloadS: 2 }]);
    expect(getAntiAircraftParams(applyStoreItems(FROZEN, 'us_03', ALL))).toEqual(getAntiAircraftParams(FROZEN));
  });
});

describe('機関の整備（boat_engine）', () => {
  it.each(['us_01', 'us_02', 'us_03', 'us_04', 'us_05', 'us_06'])('%s: 最大速力 39 → 41 kt・加速 ×1.1・静音の上限と速力帯と巡航は同じ・燃料曲線の指数が同じ', (id) => {
    const a = buildWorldSetup(applyStoreItems(FROZEN, id, ['engine_tuned']), id);
    const b = buildWorldSetup(FROZEN, id);
    expect(a.boatParams.speedMaxMps).toBeCloseTo(ktToMps(41), 12);
    expect(a.boatParams.accelMps2).toBeCloseTo(b.boatParams.accelMps2 * 1.1, 12);
    expect({ ...a.boatParams, speedMaxMps: 0, accelMps2: 0 }).toEqual({ ...b.boatParams, speedMaxMps: 0, accelMps2: 0 });
    expect(a.fuelCurve.exponent).toBeCloseTo(b.fuelCurve.exponent, 12);
    for (const kt of [18, 23, 30, 39]) expect(burnGph(a.fuelCurve, ktToMps(kt))).toBeCloseTo(burnGph(b.fuelCurve, ktToMps(kt)), 9);
    expect(a.fuelAllotmentGal).toBe(b.fuelAllotmentGal);
  });
  it('us_01 の要人の僚艇は同じ記録を読む＝同じ最大速力と加速（遅れない）。定位置・HP・寸法は同じ', () => {
    const d = applyStoreItems(FROZEN, 'us_01', ['engine_tuned']);
    const a = buildWorldSetup(d, 'us_01');
    const b = buildWorldSetup(FROZEN, 'us_01');
    expect([a.escort!.speedMaxMps, a.escort!.accelMps2]).toEqual([a.boatParams.speedMaxMps, a.boatParams.accelMps2]);
    expect({ ...a.escort!, speedMaxMps: 0, accelMps2: 0 }).toEqual({ ...b.escort!, speedMaxMps: 0, accelMps2: 0 });
  });
  it('us_07（Higgins）には効かない: 効く品に入らず、data は base そのもの・味方の艇の "player_full" も S ボートも同じ', () => {
    expect(effectiveStoreItems(gameData, 'us_07', ['engine_tuned'])).toEqual([]);
    expect(applyStoreItems(FROZEN, 'us_07', ['engine_tuned'])).toBe(FROZEN);
    const s = directSortie('us_07', 1, 'none');
    expect(withCustomLoadout(s, gameData, ['engine_tuned'])).toBe(s);
    const d = applyStoreItems(FROZEN, 'us_07', ALL);
    expect(getBoatRecord(d, 'us_higgins78').speed_max_kt).toBe(39);
    expect(JSON.stringify(buildWorldSetup(d, 'us_07').rescue)).toBe(JSON.stringify(buildWorldSetup(FROZEN, 'us_07').rescue));
  });
  it('ほかの艇の記録（日本の任務の敵の米PT が読む us_elco80 を含む）は自艇の任務の写しでだけ変わる: 日本の任務の data は base そのもの', () => {
    for (const id of MISSIONS.filter((m) => m.startsWith('jp_'))) expect(applyStoreItems(FROZEN, id, ALL), id).toBe(FROZEN);
    expect(getBoatFuelCurve(sortieGameData(gameData, { ...directSortie('us_02', 1, 'none'), custom: { items: ['engine_tuned'] } }), 'us_elco80').fullMps).toBeCloseTo(ktToMps(41), 12);
    expect(getBoatRecord(gameData, 'us_elco80').speed_max_kt).toBe(39);
  });
});

describe('13 任務×ハード×品: 自艇の速さ・砲を読む data の検査と組み立て（frozen の base）', () => {
  it.each(VARIANTS)('$id hard=$hard', ({ id, hard }) => {
    const before = JSON.stringify(gameData);
    const ts = gameData.hitRateModel.world.time_scale;
    for (const items of [...NEW.map((x) => [x]), NEW, ALL]) {
      const d = applyStoreItems(FROZEN, id, items);
      const m = getPrototypeMission(d, id, hard);
      expect(() => buildWorldSetup(d, id, { sortie: directSortie(id, 1, 'none', hard, false), hard }), `${items.join(',')}`).not.toThrow();
      expect(() => getLoadout(d, m)).not.toThrow();
      expect(() => getPtParams(d, m, ts)).not.toThrow(); // 米PT・S ボートの「突撃・追撃＞自艇の最大速力」（V-U1・pt-mission-data）
      expect(() => getStormParams(d, m, ts)).not.toThrow(); // 暴風の安全な速さ＜自艇の最大速力
      expect(() => getPatrolAirParams(d, id)).not.toThrow(); // 夜の哨戒機の自艇の速さ（jp_02）
      expect(() => getEngineParams(d, id)).not.toThrow();
      expect(() => getConvoyParams(d, m)).not.toThrow();
    }
    expect(JSON.stringify(gameData)).toBe(before);
  });
});

describe('Boot の検査（V-S1〜V-S4）: 砲と機関の壊れた data', () => {
  const broken = (f: (s: Rec) => void): GameData => {
    const d = clone();
    f((d as unknown as Rec)['store'] as Rec);
    return d;
  };
  const byId = (s: Rec, id: string): Rec => (s['items'] as Rec[]).find((x) => x['id'] === id)!;
  const eff = (s: Rec, id: string): Rec => byId(s, id)['effect'] as Rec;
  it('今の data は通る（砲の 2 品は同じ鍵を触っても additive の同じ形＝V-S3 で止めない）', () => expect(() => validateStore(gameData)).not.toThrow());
  it.each([
    ['V-S1', '組の鍵が欠ける', (s: Rec) => delete (eff(s, 'gun_37mm')['group'] as Rec)['damage']],
    ['V-S1', '組の発射速度が 0', (s: Rec) => ((eff(s, 'gun_37mm')['group'] as Rec)['rounds_per_min'] = 0)],
    ['V-S1', 'merge_into が数', (s: Rec) => (eff(s, 'gun_40mm')['merge_into'] = 1)],
    ['V-S1', '弾倉に足す発が負', (s: Rec) => (eff(s, 'gun_40mm')['magazine_add'] = -1)],
    ['V-S1', '砲の名の頭が空', (s: Rec) => (eff(s, 'gun_37mm')['label_ja'] = '')],
    ['V-S1', '機関の速さが 0', (s: Rec) => (eff(s, 'engine_tuned')['speed_add_kt'] = 0)],
    ['V-S1', '機関の鍵が余る', (s: Rec) => (eff(s, 'engine_tuned')['fuel'] = 1)],
    ['V-S2', '37mm を重い組のある Elco 80 に', (s: Rec) => (byId(s, 'gun_37mm')['boats'] = ['us_elco77', 'us_elco80'])],
    ['V-S2', '足す組の id が艇に既にある', (s: Rec) => ((eff(s, 'gun_40mm')['group'] as Rec)['id'] = '40mm_37mm')],
    ['V-S2', '砲の無い艇（英の艇）に 40mm', (s: Rec) => (byId(s, 'gun_40mm')['boats'] = ['us_elco80', 'uk_vosper73'])],
    ['V-S2', '機関を us_07 の Higgins に（S ボートの追撃＞自艇）', (s: Rec) => (byId(s, 'engine_tuned')['boats'] = ['us_elco80', 'us_higgins78'])],
    ['V-S2', '機関の艇に燃料曲線が無い（英の艇）', (s: Rec) => (byId(s, 'engine_tuned')['boats'] = ['us_elco80', 'uk_vosper73'])],
    ['V-S3', '2 つの品が機関の鍵を触る', (s: Rec) => (s['items'] as Rec[]).push({ ...byId(s, 'engine_tuned'), id: 'engine_2' })],
    ['V-S4', '機関の shared_ok に僚艇が無い（us_01 の僚艇も読む）', (s: Rec) => delete byId(s, 'engine_tuned')['shared_ok']],
  ])('%s: %s → 例外', (code, _label, f) => {
    expect(() => validateStore(broken(f as (s: Rec) => void))).toThrow(code);
  });
});
