// 隼艇の data（v0.6.6「日本ハードモード⑤：隼艇」。spec-v066 §B.5・§B.6・§G）: boats.json の jp_h38_hayabusa（と jp_h2 の notes）・jp_01 の hard.gunboat（ちょうど 12 鍵）・
// 読み出し（core/gunboat-data の形と値の検査、config/gunboat-mission-data の他の記録を跨ぐ検査）・WorldSetup.gunboat はハードの jp_01 だけ（他の任務とノーマルは鍵ごと出ない）。
import { describe, expect, it } from 'vitest';
import { gameData, getGunBatteryParams, getPrototypeMission } from '../src/config/game-data';
import { getGunboatParams, gunboatSetupPart } from '../src/config/gunboat-mission-data';
import { playableMissionIds } from '../src/config/campaign-data';
import { boatParamsFromData, isBoatDataRecord } from '../src/core/boat-motion';
import { GUNBOAT_KEYS, readGunboatBlock } from '../src/core/gunboat-data';
import { isBoatSmokeDataRecord } from '../src/core/smoke';
import { ktToMps } from '../src/core/units';
import { buildWorldSetup } from '../src/systems/world-setup';
import { PERSON_DENYLIST, RANK_RE } from './person-denylist';

type Rec = Record<string, unknown>;
type Data = typeof gameData;
const clone = (): Data => JSON.parse(JSON.stringify(gameData)) as Data;
const protoOf = (d: Data, id: string): Rec => (d.missionsSeed.missions as unknown as Rec[]).find((m) => m['id'] === id)!['v0_1_prototype'] as Rec;
const gbOf = (d: Data): Rec => (protoOf(d, 'jp_01')['hard'] as Rec)['gunboat'] as Rec;
const boatOf = (d: Data, id: string): Rec => (d.boats.boats as unknown as Rec[]).find((b) => b['id'] === id)!;
const enemyOf = (d: Data, id: string): Rec => (d.enemies.enemies as unknown as Rec[]).find((e) => e['id'] === id)!;
const hardOf = (d: Data): ReturnType<typeof getPrototypeMission> => getPrototypeMission(d, 'jp_01', true);
const EXCERPT = 'WebSearch の抜粋のみ・本文未読';
const LABEL = 'jp_01.v0_1_prototype.hard.gunboat';

function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) for (const x of v) strings(x, out);
  else if (typeof v === 'object' && v !== null) for (const x of Object.values(v as Rec)) strings(x, out);
  return out;
}

describe('boats.json の jp_h38_hayabusa（v0.6.6）と jp_h2 の notes', () => {
  it('H-38: T-38 の船体（18 × 4.3・24.8 t・27 kt・巡航 20・静音 7・帯は T-38 と同じ silent_max 13・加減速と旋回も同じ）・乗員 7・魚雷なし・25mm × 3。燃料と火災（damage）の鍵は持たない', () => {
    const h = boatOf(gameData, 'jp_h38_hayabusa');
    const t = boatOf(gameData, 'jp_t38');
    expect([h['nation'], h['role'], h['name'], h['name_ja']]).toEqual(['JP', 'escort_ally', 'H-38 Hayabusa gunboat (No.10 class)', '日 H-38型隼艇（10号隼型・砲艇）']);
    expect([h['length_m'], h['beam_m'], h['displacement_t'], h['speed_max_kt'], h['speed_cruise_kt'], h['speed_silent_kt'], h['crew'], h['hull_hp']]).toEqual([18, 4.3, 24.8, 27, 20, 7, 7, 60]);
    expect(h['speed_bands_kt']).toEqual(t['speed_bands_kt']);
    expect([h['accel_mps2'], h['decel_mps2'], h['turn_rate_deg_s']]).toEqual([t['accel_mps2'], t['decel_mps2'], t['turn_rate_deg_s']]);
    expect([h['smoke_generator'], h['engine_reliability'], h['hull_circles'], h['sea_state_limit'], h['fire_risk']]).toEqual([false, 0.85, 2, 3, t['fire_risk']]);
    expect((h['torpedoes'] as Rec)['count']).toBe(0);
    expect(h['guns']).toEqual(['25mm_x3']);
    for (const k of ['fuel_hours_cruise', 'fuel_hours_full', 'fuel_capacity_gal', 'fuel_idle_ratio', 'damage']) expect(k in h, k).toBe(false);
    // 砲は jp_t38 と同じ値（1 挺ぶん。min_spread_m 22 も＝試作の測った砲）
    expect(h['gun_battery']).toEqual(t['gun_battery']);
    // 全記録の運動・煙幕の検査を通る（tests/boat-motion・tests/smoke と同じ形）
    expect([isBoatDataRecord(h), isBoatSmokeDataRecord(h)]).toEqual([true, true]);
    // jp_h2 は消さない（notes に H-38 へ替えた理由を足しただけ）
    const h2 = boatOf(gameData, 'jp_h2_hayabusa');
    expect(String(h2['notes'])).toBe(`米PT対抗のため魚雷を外して機銃を増備した艇。日本ハードモードでは護衛の相棒。v0.6.6 からの僚艇は H-38（jp_h38_hayabusa）。寸法 18 × 4.3 は H-38 の値で H-2 の寸法は抜粋に無い。H-2 は 8 隻だけで、多くが前線に着く前に輸送中に失われた（medium の推論。${EXCERPT}）`);
    expect((h2['speed_bands_kt'] as Rec)['silent_max']).toBe(7);
  });
  it('source: 史実の値は historical で抜粋の注と確度、T-38 と同じ船体の値・1 挺ぶんの砲・HP は design（3 挺を 1 挺に丸めたのはつり合いの選択）。notes の主張に確度。人物名なし', () => {
    const h = boatOf(gameData, 'jp_h38_hayabusa');
    const src = h['source'] as Rec;
    for (const k of ['name', 'length_m', 'beam_m', 'displacement_t', 'speed_max_kt', 'crew', 'guns']) {
      expect(String(src[k]).startsWith('historical ('), k).toBe(true);
      expect(String(src[k]), k).toContain(`${EXCERPT}。medium`);
    }
    for (const k of ['speed_cruise_kt', 'speed_silent_kt', 'speed_bands_kt', 'accel_mps2', 'gun_battery', 'hull_hp', 'engine_reliability', 'others']) expect(String(src[k]).startsWith('design ('), k).toBe(true);
    expect(String(src['gun_battery'])).toContain('3 挺の火力は 1 挺ぶんに丸めた＝つり合いの選択（抽象・史料なし');
    expect(String(src['gun_battery'])).toContain('scratchpad の試作。repo に無い'); // repo に無い仕様の名を書かない（v0.6.5 レビュー F2）
    const notes = String(h['notes']);
    expect(notes).toContain(`ja.wikipedia 隼艇。${EXCERPT}。high`);
    expect(notes).toContain('抜粋に見つからない（medium。無いことの証拠ではない）');
    expect(notes).toContain('jp_01 のハードでは自艇の後ろに付く僚艇');
    for (const s of strings(h)) {
      for (const name of PERSON_DENYLIST) expect(s, name).not.toContain(name);
      expect(s).not.toMatch(RANK_RE);
    }
  });
});

describe('jp_01 の hard.gunboat（12 鍵）と GunboatParams', () => {
  it('data の値: 後ろ 150・右舷 120・60 m の内は大発の速さ・5 m の内は輸送隊の針路・戻り 450・撃つ 300・10.5 kt・浜の 60 m 沖・30 m の内で止まる・見つかる距離 ×0.5', () => {
    const g = gbOf(gameData);
    expect(Object.keys(g)).toEqual([...GUNBOAT_KEYS]);
    expect(g).toEqual({ boat: 'jp_h38_hayabusa', label_ja: '隼艇', station_astern_m: 150, station_abeam_m: 120, station_slow_m: 60, heading_deadband_m: 5, rejoin_m: 450, fire_m: 300, engage_speed_kt: 10.5, beach_standoff_m: 60, beach_arrive_m: 30, target_range_factor: 0.5 });
    const p = getGunboatParams(gameData, hardOf(gameData))!;
    const h = boatOf(gameData, 'jp_h38_hayabusa');
    if (!isBoatDataRecord(h)) throw new Error('jp_h38');
    const w = gameData.hitRateModel.world;
    expect(p.boat).toEqual(boatParamsFromData(h));
    expect(p.boat.speedMaxMps).toBeCloseTo(ktToMps(27), 9);
    expect(p.boat.silentMaxMps).toBeCloseTo(ktToMps(13), 9);
    expect(p.gun).toEqual(getGunBatteryParams(gameData, hardOf(gameData))); // 自艇（jp_t38）の 25mm と同じ値
    expect([p.boatId, p.labelJa, p.hullHp]).toEqual(['jp_h38_hayabusa', '隼艇', 60]);
    expect([p.halfLengthM, p.halfBeamM, p.boundsMarginM]).toEqual([(18 * w.hit_scale) / 2, (4.3 * w.hit_scale) / 2, (18 * w.sprite_scale) / 2]);
    expect([p.stationAsternM, p.stationAbeamM, p.stationSlowM, p.headingDeadbandM, p.rejoinM, p.fireM, p.beachStandoffM, p.beachArriveM, p.targetRangeFactor]).toEqual([150, 120, 60, 5, 450, 300, 60, 30, 0.5]);
    expect(p.engageMps).toBeCloseTo(ktToMps(10.5), 9);
    expect(p.engageMps).toBeLessThanOrEqual(p.boat.silentMaxMps);
  });
  it('ハードの jp_01 だけ WorldSetup.gunboat がある。ノーマル・他の任務（ノーマル／ハード）・gunboatOff は鍵ごと出ない（setup の snapshot を変えない）', () => {
    const h = buildWorldSetup(gameData, 'jp_01', { hard: true });
    expect(h.gunboat).toEqual(getGunboatParams(gameData, hardOf(gameData)));
    expect('gunboat' in buildWorldSetup(gameData, 'jp_01')).toBe(false);
    expect('gunboat' in buildWorldSetup(gameData, 'jp_01', { hard: true, gunboatOff: true })).toBe(false);
    expect(buildWorldSetup(gameData, 'jp_01', { hard: true, gunboatOff: true }).ptBoats!.count).toBe(3); // 隼艇を切っても米PT 3 隻・ノルマ 3
    const ids = [...playableMissionIds(gameData, 'us_pt'), ...playableMissionIds(gameData, 'jp_hard')];
    expect(ids).toContain('jp_01');
    for (const id of ids) {
      for (const hard of [false, true]) {
        const m = getPrototypeMission(gameData, id, hard);
        const part = gunboatSetupPart(gameData, m, {});
        if (id === 'jp_01' && hard) expect(Object.keys(part)).toEqual(['gunboat']);
        else {
          expect(part, `${id} ${hard}`).toEqual({});
          expect('gunboat' in buildWorldSetup(gameData, id, { hard }), `${id} ${hard}`).toBe(false);
        }
        expect(gunboatSetupPart(gameData, m, { gunboatOff: true })).toEqual({});
      }
    }
    expect(getGunboatParams(gameData, getPrototypeMission(gameData, 'jp_01'))).toBeNull();
  });
});

describe('hard.gunboat の検査（壊れた写しは「jp_01.v0_1_prototype.hard.gunboat: …」の例外）', () => {
  const throwsOn = (d: Data, re: RegExp, mission = hardOf(d)): void => {
    expect(() => getGunboatParams(d, mission)).toThrow(re);
    expect(() => getGunboatParams(d, mission)).toThrow(LABEL);
  };
  it.each([...GUNBOAT_KEYS])('鍵 %s が欠けると例外（鍵の名が文に出る）', (k) => {
    const d = clone();
    delete gbOf(d)[k];
    throwsOn(d, new RegExp(`${k} が無いか`));
  });
  it('知らない鍵・object でない・文字の鍵が空・数の鍵が文字は例外。readGunboatBlock は 12 鍵の写しを返す', () => {
    const extra = clone();
    gbOf(extra)['leash_m'] = 450;
    throwsOn(extra, /知らない鍵 leash_m（鍵はちょうど 12 個/);
    const arr = clone();
    (protoOf(arr, 'jp_01')['hard'] as Rec)['gunboat'] = [];
    throwsOn(arr, /object でない/);
    const empty = clone();
    gbOf(empty)['label_ja'] = '';
    throwsOn(empty, /label_ja が無いか空でない文字列でない/);
    const str = clone();
    gbOf(str)['fire_m'] = '300';
    throwsOn(str, /fire_m が無いか有限の数でない/);
    const b = readGunboatBlock(gbOf(gameData), LABEL);
    expect(b).toEqual(gbOf(gameData));
    expect(b).not.toBe(gbOf(gameData));
  });
  const edge = (k: string, v: number): Data => {
    const d = clone();
    gbOf(d)[k] = v;
    return d;
  };
  it('境の両側: fire_m = 射程 600 は通る・600.001 は例外、engage_speed_kt = 静音の上限 13 は通る・13.01 は例外、target_range_factor 1 は通る・0 と 1.0001 は例外、heading_deadband_m ≥ station_slow_m と 0 は例外', () => {
    expect(getGunboatParams(edge('fire_m', 600), hardOf(gameData))!.fireM).toBe(600);
    throwsOn(edge('fire_m', 600.001), /0 < fire_m ≤ 艇の gun_battery.range_m/);
    throwsOn(edge('fire_m', 0), /0 < fire_m/);
    expect(getGunboatParams(edge('engage_speed_kt', 13), hardOf(gameData))!.engageMps).toBeCloseTo(ktToMps(13), 9);
    throwsOn(edge('engage_speed_kt', 13.01), /0 < engage_speed_kt ≤ 艇の speed_bands_kt.silent_max/);
    expect(getGunboatParams(edge('target_range_factor', 1), hardOf(gameData))!.targetRangeFactor).toBe(1);
    throwsOn(edge('target_range_factor', 0), /0 < target_range_factor ≤ 1/);
    throwsOn(edge('target_range_factor', 1.0001), /0 < target_range_factor ≤ 1/);
    throwsOn(edge('heading_deadband_m', 60), /0 < heading_deadband_m < station_slow_m/);
    throwsOn(edge('heading_deadband_m', 0), /0 < heading_deadband_m < station_slow_m/);
    expect(getGunboatParams(edge('heading_deadband_m', 59.9), hardOf(gameData))!.headingDeadbandM).toBe(59.9);
    for (const k of ['station_astern_m', 'station_slow_m', 'rejoin_m', 'beach_standoff_m', 'beach_arrive_m']) throwsOn(edge(k, 0), new RegExp(`${k} は正`));
    expect(getGunboatParams(edge('station_abeam_m', -120), hardOf(gameData))!.stationAbeamM).toBe(-120); // 左舷（負）も読める
  });
  it('W2: 1 回の航過（rounds_per_pass × damage）・1 回の連射（burst_rounds × damage）の弾が隼艇の HP 以上なら例外（今 40・24 < 60）', () => {
    const hp40 = clone();
    boatOf(hp40, 'jp_h38_hayabusa')['hull_hp'] = 40;
    throwsOn(hp40, /rounds_per_pass × damage（40）は隼艇の HP（40）未満/);
    const burst = clone();
    (enemyOf(burst, 'us_pt_enemy')['chase'] as Rec)['burst_rounds'] = 15;
    throwsOn(burst, /chase.burst_rounds × damage（60）は隼艇の HP（60）未満/);
    const nohp = clone();
    delete boatOf(nohp, 'jp_h38_hayabusa')['hull_hp'];
    throwsOn(nohp, /hull_hp（正の数）が無い/);
  });
  it('艇: boats.json に無い・運動の値が無い・gun_battery が無い（jp_h2）・弾倉が無い・射程が自艇の視程（900 m）を超える・閃光が射程より短いと例外', () => {
    throwsOn(((d) => ((gbOf(d)['boat'] = 'jp_h99'), d))(clone()), /boat（jp_h99）が boats.json に無い/);
    const nomove = clone();
    delete boatOf(nomove, 'jp_h38_hayabusa')['turn_rate_deg_s'];
    throwsOn(nomove, /運動の値/);
    throwsOn(((d) => ((gbOf(d)['boat'] = 'jp_h2_hayabusa'), d))(clone()), /jp_h2_hayabusa.gun_battery/);
    const nomag = clone();
    delete (boatOf(nomag, 'jp_h38_hayabusa')['gun_battery'] as Rec)['magazine'];
    throwsOn(nomag, /magazine（弾倉の発数・交換秒）を持つ/);
    const far = clone();
    (boatOf(far, 'jp_h38_hayabusa')['gun_battery'] as Rec)['range_m'] = 1000;
    throwsOn(far, /range_m（1000 m）は自艇の視程（900 m）以下/);
    const dim = clone();
    (boatOf(dim, 'jp_h38_hayabusa')['gun_battery'] as Rec)['muzzle_flash_reveal_m'] = 500;
    throwsOn(dim, /muzzle_flash_reveal_m（500 m）は range_m（600 m）以上/);
    const bad = clone();
    (boatOf(bad, 'jp_h38_hayabusa')['gun_battery'] as Rec)['effective_m'] = 0;
    throwsOn(bad, /jp_h38_hayabusa: boats.json の gun_battery: range_m は正、effective_m は 0〜range_m/);
  });
  it('置き場: 輸送隊と米PT の隊の任務だけ（jp_05 は例外）・僚艇（escort）と同居しない・輸送隊に浜（beach）が要る', () => {
    const j5 = clone();
    protoOf(j5, 'jp_05')['hard'] = { gunboat: gbOf(gameData), source: 'design (test)' };
    expect(() => getGunboatParams(j5, getPrototypeMission(j5, 'jp_05', true))).toThrow(/jp_05.v0_1_prototype.hard.gunboat: 輸送隊（convoy）と米PT の隊（pt_boats）の任務だけ/);
    expect(getGunboatParams(j5, getPrototypeMission(j5, 'jp_05'))).toBeNull(); // ノーマルは読まない
    const esc = { ...hardOf(gameData), escort: getPrototypeMission(gameData, 'us_01').escort };
    throwsOn(gameData, /僚艇（escort）と同居しない/, esc);
    const nb = clone();
    delete (protoOf(nb, 'jp_01')['convoy'] as Rec)['beach'];
    throwsOn(nb, /輸送隊に浜（convoy.beach）が要る/);
  });
});
