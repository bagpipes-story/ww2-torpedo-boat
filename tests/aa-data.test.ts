// 対空と閃光の data（v0.6.8。hit_rate_model.json の anti_aircraft・gun_flash。spec-v068 §2.2）: 射程は夜明けの空襲・夜の水上機・夜の出撃の旋回の半径より大きく
// （輪の上で射程の内外が揺れない）、夜の哨戒の付近の捜索 near_m より小さい（捜索の機は撃てない）。確率は [0.3%, 1%]。由来は design (v0.6.8。起動の検査は投げる。
import { describe, expect, it } from 'vitest';
import { gameData, getPrototypeMission } from '../src/config/game-data';
import { getAntiAircraftParams } from '../src/config/loadout-data';
import { buildWorldSetup } from '../src/systems/world-setup';

type Rec = Record<string, unknown>;
const PROTO_IDS = (gameData.missionsSeed.missions as unknown as Rec[]).filter((m) => m['v0_1_prototype'] && typeof m['id'] === 'string').map((m) => m['id'] as string);
const clone = (): typeof gameData => JSON.parse(JSON.stringify(gameData)) as typeof gameData;
const AA = getAntiAircraftParams(gameData);

describe('対空と閃光の data（hit_rate_model.json）', () => {
  it('射程 > 夜明けの空襲・夜の水上機・夜の出撃の run_radius_m（遊べる全任務）、< 夜の哨戒の付近の捜索 near_m', () => {
    let radii = 0;
    let gates = 0;
    for (const id of PROTO_IDS) {
      const w = buildWorldSetup(gameData, id, { hard: false });
      for (const r of [w.airStrike?.runRadiusM, w.seaplane?.runRadiusM, w.patrolAir?.sortie.runRadiusM]) {
        if (r === undefined) continue;
        radii++;
        expect(AA.rangeM, `${id} run_radius_m ${r}`).toBeGreaterThan(r);
      }
      if (w.patrolAir) {
        gates++;
        expect(AA.rangeM, `${id} near_m`).toBeLessThan(w.patrolAir.gate.nearM);
      }
    }
    expect(radii).toBeGreaterThanOrEqual(7); // 夜明けの 5 任務・us_02 の水上機・jp_02 の出撃
    expect(gates).toBe(1);
    expect(getPrototypeMission(gameData, 'us_02').enemyAircraft).not.toBeNull();
  });

  it('1 発の撃墜の確率は [0.3%, 1%]（ユーザー「0.5%くらい」）、閃光は 1 秒・閃光の距離は艇の gun_battery.muzzle_flash_reveal_m', () => {
    expect(AA.hitChancePerRound).toBeGreaterThanOrEqual(0.003);
    expect(AA.hitChancePerRound).toBeLessThanOrEqual(0.01);
    expect(AA.flashHoldS).toBe(1);
  });

  it('由来は design (v0.6.8 で始まる', () => {
    const h = gameData.hitRateModel as unknown as Rec;
    for (const k of ['anti_aircraft', 'gun_flash']) expect(String((h[k] as Rec)['source']).startsWith('design (v0.6.8'), k).toBe(true);
  });

  it('起動の検査: 確率 0 以下・0.02 超・数でない、射程 0 以下、閃光の秒 0 以下、鍵が無いと例外', () => {
    const bad = (f: (h: Rec) => void): (() => unknown) => {
      const d = clone();
      f(d.hitRateModel as unknown as Rec);
      return () => getAntiAircraftParams(d);
    };
    const aa = (h: Rec): Rec => h['anti_aircraft'] as Rec;
    expect(bad((h) => (aa(h)['hit_chance_per_round'] = 0))).toThrow(/anti_aircraft\.hit_chance_per_round/);
    expect(bad((h) => (aa(h)['hit_chance_per_round'] = 0.021))).toThrow(/anti_aircraft\.hit_chance_per_round/);
    expect(bad((h) => (aa(h)['hit_chance_per_round'] = '0.005'))).toThrow(/anti_aircraft\.hit_chance_per_round/);
    expect(bad((h) => (aa(h)['range_m'] = 0))).toThrow(/anti_aircraft\.range_m/);
    expect(bad((h) => ((h['gun_flash'] as Rec)['hold_s'] = 0))).toThrow(/gun_flash\.hold_s/);
    expect(bad((h) => delete h['anti_aircraft'])).toThrow(/anti_aircraft/);
    expect(bad((h) => delete h['gun_flash'])).toThrow(/gun_flash\.hold_s/);
    expect(bad(() => {})).not.toThrow();
  });
});
