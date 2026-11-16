// v0.8.1 S0（spec-v0810 §3.2 D-S1・D-S8・§4.3・lead の L13）: enemies.json の新しい 2 記録。
// 敵としての卯月（ijn_destroyer_mutsuki_enemy）は寸法・最大速力・主砲の数だけが睦月型（jp_04 の味方の記録 ijn_destroyer_mutsuki と同じ史実の値）で、
// AI・砲の 1 門の値・25 mm・探照灯・星弾・沈む本数は ijn_destroyer の写し（命中率の KPI を合わせた値＝同じことをここで固定）。
// 駆潜艇（ijn_subchaser。ハードの us_06 だけ）は AI と砲の形を持つ記録（getEnemyRecord・destroyerSetup で組める）。世界の配線は S2b。
import { describe, expect, it } from 'vitest';
import { gameData, getEnemyRecord } from '../src/config/game-data';
import { destroyerSetup } from '../src/systems/destroyer-setup';
import { shipArtKey, SHIP_ART_DEFAULT_KEY } from '../src/config/ship-art-config';

type Rec = Record<string, unknown>;
const rec = (id: string): Rec => (gameData.enemies.enemies as unknown as Rec[]).find((e) => e['id'] === id)!;
const gun = (r: Rec, id: string): Rec => (r['guns'] as Rec[]).find((g) => g['id'] === id)!;
const without = (o: Rec, ...keys: string[]): Rec => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));

describe('敵の卯月（ijn_destroyer_mutsuki_enemy）', () => {
  const m = rec('ijn_destroyer_mutsuki_enemy');
  const d = rec('ijn_destroyer');
  const ally = rec('ijn_destroyer_mutsuki');
  it('AI・回避・体当たり・端の向き直し・探照灯・星弾・発見（note を除く）・巡航と旋回と加速・耐久・沈む本数は ijn_destroyer と同じ（命中率の KPI を合わせた値）', () => {
    for (const k of ['speed_typical_kt', 'turn_rate_deg_s', 'accel_mps2', 'hull_hp', 'hull_circles', 'torpedo_hits_to_sink', 'searchlight', 'starshell', 'evasion', 'ram', 'patrol'] as const) expect(m[k], k).toEqual(d[k]);
    expect(m['detection']).toEqual(without(d['detection'] as Rec, 'note'));
    expect(m['torpedo_hits_to_sink']).toBe(2); // 史実「2 本以上が命中して沈んだ」とも合う。任務の enemy_hits_to_sink は置かない
    expect(Object.keys(m).sort()).toEqual(Object.keys(d).sort());
    expect([m['faction'], m['name_ja']]).toEqual(['IJN', '駆逐艦（睦月型・卯月）']);
  });
  it('砲: main_120mm は 2 門（卯月 1944-08 の 12 cm 単装 2）で、1 門の値は ijn_destroyer の main_127mm と同じ。aa_25mm は ijn_destroyer のまま', () => {
    expect((m['guns'] as Rec[]).map((g) => [g['id'], g['count']])).toEqual([['main_120mm', 2], ['aa_25mm', 4]]);
    expect(without(gun(m, 'main_120mm'), 'id', 'count')).toEqual(without(gun(d, 'main_127mm'), 'id', 'count'));
    expect(gun(m, 'aa_25mm')).toEqual(gun(d, 'aa_25mm'));
    expect(gun(ally, 'main_120mm')['count']).toBe(2);
  });
  it('寸法と最大速力は睦月型（jp_04 の味方の記録と同じ史実の値・ijn_destroyer の陽炎型 118 m とは違う）', () => {
    expect([m['length_m'], m['beam_m'], m['speed_max_kt']]).toEqual([ally['length_m'], ally['beam_m'], ally['speed_max_kt']]);
    expect([m['length_m'], m['beam_m'], m['speed_max_kt']]).toEqual([102.7, 9.16, 34]);
    expect(d['length_m']).toBe(118);
    const src = m['source'] as Rec;
    expect(String(src['length_m・beam_m'])).toMatch(/^historical .*\/ design \(v0\.8\.1 S0/);
    expect(String(src['guns'])).toMatch(/^historical .*\/ design \(v0\.8\.1 S0/);
  });
  it('getEnemyRecord と destroyerSetup で組める（AI と砲の形）。当たりは 102.7 m の 2 倍・沈むのは 2 本・見つける基準 2,000 m。絵の鍵は S2 から敵の色の睦月型（S0・S1 は既定のまま）', () => {
    const r = getEnemyRecord(gameData, 'ijn_destroyer_mutsuki_enemy');
    expect(r.detection.base_detect_m).toBe(2000);
    const s = destroyerSetup(gameData, [{ x: 3620, y: 2380, headingDeg: 270 }], 'ijn_destroyer_mutsuki_enemy', null, 2, false);
    const k = destroyerSetup(gameData, [{ x: 3620, y: 2380, headingDeg: 270 }], 'ijn_destroyer', null, 2, false);
    expect([s.spec.lengthM, s.spec.hitsToSink, s.spec.boundsMarginM, s.baseDetectM]).toEqual([102.7, 2, 102.7, 2000]);
    expect(s.shipAi).toEqual({ ...k.shipAi, maxSpeedMps: s.shipAi.maxSpeedMps });
    expect(s.gunnery.guns.map((g) => g.id)).toEqual(['main_120mm', 'aa_25mm']);
    expect(s.gunnery.searchlight).toEqual(k.gunnery.searchlight);
    expect(s.gunnery.starshell).toEqual(k.gunnery.starshell);
    expect(shipArtKey('ijn_destroyer_mutsuki_enemy')).toBe('tex-destroyer-mutsuki'); // v0.8.1 S2（D-A1）: 敵の色の睦月型（S0・S1 は既定の SHIP_ART_DEFAULT_KEY）
    expect(SHIP_ART_DEFAULT_KEY).toBe('tex-destroyer');
  });
});

describe('駆潜艇（ijn_subchaser。第13号型。ハードの us_06 だけ）', () => {
  const c = rec('ijn_subchaser');
  it('寸法・最大速力・兵装（1940 の形の 76.2 mm 1・13.2 mm 2）と、1 本で沈む・体当たりしない・星弾なし・探照灯 1,500 m', () => {
    expect([c['length_m'], c['beam_m'], c['speed_max_kt'], c['speed_typical_kt'], c['torpedo_hits_to_sink'], c['hull_circles']]).toEqual([51, 6.7, 16, 12, 1, 3]);
    expect((c['guns'] as Rec[]).map((g) => [g['id'], g['count']])).toEqual([['aa_76mm', 1], ['aa_13mm', 2]]);
    expect(without(gun(c, 'aa_76mm'), 'id')).toEqual(without(gun(rec('ijn_transport'), 'deck_gun_76mm'), 'id'));
    expect(without(gun(c, 'aa_13mm'), 'id', 'count')).toEqual(without(gun(rec('ijn_destroyer'), 'aa_25mm'), 'id', 'count'));
    expect([c['starshell'], (c['searchlight'] as Rec)['range_m'], (c['ram'] as Rec)['enabled'], (c['evasion'] as Rec)['mode']]).toEqual([null, 1500, false, 'turn_away']);
    expect(without(c['searchlight'] as Rec, 'range_m')).toEqual(without(rec('ijn_destroyer')['searchlight'] as Rec, 'range_m'));
    expect('torpedo_immune' in c).toBe(false); // 喫水 2.75 m ＞ Mk 13 の min_run_depth_m 2（魚雷は当たる）
    expect(String((c['source'] as Rec)['length_m・beam_m・speed_max_kt'])).toContain('喫水 2.75 m');
  });
  it('getEnemyRecord と destroyerSetup で組める（AI と砲の形）。端の向き直しは旋回半径＋縁の余白より大きい', () => {
    const r = getEnemyRecord(gameData, 'ijn_subchaser');
    const s = destroyerSetup(gameData, [{ x: 4300, y: 2200, headingDeg: 270 }], 'ijn_subchaser', null, 2, false);
    expect([s.spec.lengthM, s.spec.hitsToSink, s.spec.boundsMarginM, s.shipAi.ramEnabled]).toEqual([51, 1, 51, false]);
    const radiusM = s.shipAi.cruiseSpeedMps / ((r.turn_rate_deg_s * Math.PI) / 180);
    expect(radiusM).toBeCloseTo(117.9, 1);
    expect(r.patrol.edge_turn_margin_m).toBeGreaterThan(radiusM + s.spec.boundsMarginM);
  });
});
