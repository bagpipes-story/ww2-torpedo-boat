// 味方の大発を守る模擬（v0.6.4。core/convoy-sim・convoy-sim-policy・convoy-sim-cell・systems/convoy-sim-setup、spec §F）: 模擬の組み立て・上書き・再現・行の分け方（速い検査だけ）。
// 遊び方ごとの帯（spec §F.4。N 200・固定 seed）は tests/convoy-sim-{a,b,c,d,e,f}（簡単側への揺れを捕まえるかは convoy-sim-g。行の分け方は tests/convoy-sim-kit の SIM_FILES。1 夜が 170〜200 秒で 1 行 6 秒ほどなので 1 ファイル 2〜3 行＝vitest で 13〜16 秒ほど。実測は tests/convoy-sim-kit）。
// 帯を外したら、まず模擬が spec §F.1〜F.2 どおりかを確かめ、次に data の jp_01・jp_t38 の値だけを直す（source に理由）。
import { describe, expect, it } from 'vitest';
import { gameData, getPrototypeMission } from '../src/config/game-data';
import { convoyStartClearM, getPtParams } from '../src/config/pt-mission-data';
import { FIXED_STEP_S } from '../src/config/step-config';
import { convoyNight, runConvoyTrial } from '../src/core/convoy-sim';
import { runConvoyCell } from '../src/core/convoy-sim-cell';
import { CONVOY_POLICIES, CONVOY_POLICY_SPECS, type ConvoyPolicy } from '../src/core/convoy-sim-policy';
import { ptNightParams } from '../src/core/pt-pass-sim';
import { directSortie } from '../src/core/sortie';
import { CONVOY_CALIBRATION, convoySimSetup } from '../src/systems/convoy-sim-setup';
import { ptSimSetup } from '../src/systems/pt-pass-sim-setup';
import { buildWorldSetup } from '../src/systems/world-setup';
import { SIM_FILES, simPartners } from './convoy-sim-kit';

const TS = gameData.hitRateModel.world.time_scale;

describe('味方の大発を守る模擬（v0.6.4、spec §F）', () => {
  it('模擬はゲームと同じ値（buildWorldSetup・getPtParams・getConvoyParams）を使い、今夜の揺らぎは出撃の組み立てと同じ（seed ごとに world-setup の米PT・輸送隊の先頭と一致。反転なし）', () => {
    const s = convoySimSetup(gameData, 'jp_01');
    const w = buildWorldSetup(gameData, 'jp_01');
    const m = getPrototypeMission(gameData, 'jp_01');
    expect(s.pt).toEqual(getPtParams(gameData, m, TS));
    expect([s.pt, s.boat, s.damage, s.fuel, s.crew, s.vis, s.ring, s.start]).toEqual([w.ptBoats, w.boatParams, w.damageParams, w.fuelCurve, w.crew, w.vis, w.mission.returnPoint, w.playerStart]);
    expect([s.convoy, s.detectBand, s.rule]).toEqual([w.convoy!.params, 'silent', { keepRatio2: 0.8 * 0.8, lockS: 1, flashHoldS: 1 }]);
    expect([s.convoy.count, s.convoy.hp, s.convoy.quota, s.convoy.landingX, s.convoy.leadX, s.convoy.leadY, s.convoy.headingDeg, s.convoy.offsetsM]).toEqual([3, 12, 2, 3600, 1200, 2550, 90, [0, 120, 240]]);
    expect(s.convoy.beach).toEqual(w.convoy!.params.beach);
    expect([s.fuelGal, s.durationS, s.timeScale, s.stepS, s.gun?.label, s.gun?.magazine, s.gun?.minSpreadM, s.gun?.groups[0]?.roundsPerMin, s.gun?.groups[0]?.damage]).toEqual([19, 200, TS, FIXED_STEP_S, '25mm機銃', { rounds: 15, reloadS: 3.2 }, 22, 220, 4]);
    expect('fireRangeM' in s).toBe(false); // 射撃ボタンは射程 600 m の内で押す（上書きしたときだけ鍵がある）
    expect([s.nightEnemyRolls, s.nightBatteries, s.night]).toEqual([1, 0, w.mission.night]);
    // 米PT の部分は jp_05 と同じ組み立て（ptSimSetup）
    const pt = ptSimSetup(gameData, 'jp_01');
    expect({ ...s, convoy: undefined, detectBand: undefined, rule: undefined }).toEqual({ ...pt, convoy: undefined, detectBand: undefined, rule: undefined });
    for (let seed = 1; seed <= 40; seed++) {
      const game = buildWorldSetup(gameData, 'jp_01', { sortie: directSortie('jp_01', seed, 'none', false, false) });
      const night = convoyNight(s, seed);
      expect(night.pt, `seed ${seed}`).toEqual(game.ptBoats);
      expect(night.pt, `seed ${seed}`).toEqual(ptNightParams(s, seed));
      expect(night.convoy, `seed ${seed}`).toEqual(game.convoy!.params);
      expect(Math.abs(night.convoy.leadX - 1200), `seed ${seed}`).toBeLessThanOrEqual(250);
      expect([night.convoy.headingDeg, night.convoy.landingX], `seed ${seed}`).toEqual([90, 3600]); // mirror_chance 0
      expect(night.convoy.beach, `seed ${seed}`).toBe(s.convoy.beach); // 浜は地形（揺らぎで動かない）
    }
    // 出発で大発が見つからない: PT の出発の隅（clamp 込み）から船団まで約 1,464 m ≥ 静音の帯 600 × 史実 1.3 = 780 m
    expect(convoyStartClearM(s.pt, m)).toBeCloseTo(1463.7, 0);
    expect(() => convoySimSetup(gameData, 'jp_05')).toThrow(/convoy/);
  });

  it('上書き（scripts の BHP・DBAND・KEEP・HOLD・FLASHHOLD・GDMG・GRPM・GMAG・ALLOT・DAWN・GFLOOR・FIRER）は data の写しに当てて検査を通る。data は変えない', () => {
    const s = convoySimSetup(gameData, 'jp_01', { bargeHp: 24, detectBand: 'stop', keepRatio: 1, holdS: 0, flashHoldS: 3.2, gunDamage: 3, gunRpm: 180, magRounds: 12, fuelGal: 18, dawnS: 210, gunFloorM: 18, fireRangeM: 200 });
    expect([s.convoy.hp, s.detectBand, s.rule, s.gun!.groups[0]!.damage, s.gun!.groups[0]!.roundsPerMin, s.gun!.magazine, s.fuelGal, s.durationS]).toEqual([24, 'stop', { keepRatio2: 1, lockS: 0, flashHoldS: 3.2 }, 3, 180, { rounds: 12, reloadS: 3.2 }, 18, 210]);
    expect([s.gun!.minSpreadM, s.fireRangeM]).toEqual([18, 200]);
    expect(convoySimSetup(gameData, 'jp_01', { gunFloorM: 0 }).gun!.minSpreadM).toBe(0); // 0 は外したのと同じ（比例の円のまま）
    const base = convoySimSetup(gameData, 'jp_01');
    expect([base.convoy.hp, base.detectBand, base.gun!.groups[0]!.damage, base.gun!.groups[0]!.roundsPerMin, base.gun!.minSpreadM]).toEqual([12, 'silent', 4, 220, 22]);
    expect(() => convoySimSetup(gameData, 'jp_01', { gunFloorM: -1 })).toThrow(/min_spread_m は 0 以上/);
    expect(() => convoySimSetup(gameData, 'jp_01', { bargeHp: 0 })).toThrow(/barge_hp/);
    expect(() => convoySimSetup(gameData, 'jp_01', { keepRatio: 1.2 })).toThrow(/target_keep_ratio/);
    expect(() => convoySimSetup(gameData, 'jp_01', { detectBand: 'full' })).toThrow(/出発で大発が見つかる/); // 全速の帯 1,920 × 1.3 > 1,464 m
  });

  it('同じ seed なら同じ夜・同じ集計、違う seed なら違う。撃たない遊び方は 25mm を作らない（数はみな 0）。14 の遊び方に帯の行があり、★ は none・follow_shoot・follow_full・shield_full', () => {
    const s = convoySimSetup(gameData, 'jp_01');
    expect(runConvoyTrial(s, 'follow_full', 7)).toEqual(runConvoyTrial(s, 'follow_full', 7));
    const a = runConvoyCell(s, 'follow_full', 12, 1);
    expect(runConvoyCell(s, 'follow_full', 12, 1)).toEqual(a);
    expect(runConvoyCell(s, 'follow_full', 12, 2)).not.toEqual(a);
    expect(a.gunShots).toBeGreaterThan(0);
    const r = runConvoyTrial(s, 'follow', 7);
    expect([r.gunShots, r.gunHits, r.ptRetired, r.ptSunk, r.suppressions]).toEqual([0, 0, 0, 0, 0]);
    expect(CONVOY_CALIBRATION.map((x) => x.policy)).toEqual([...CONVOY_POLICIES]);
    expect(CONVOY_CALIBRATION.filter((x) => x.star).map((x) => x.policy)).toEqual(['none', 'follow_shoot', 'follow_full', 'shield_full']);
    for (const p of CONVOY_POLICIES) expect([CONVOY_POLICY_SPECS[p].shoot, CONVOY_POLICY_SPECS[p].dodge], p).toEqual([p.endsWith('_shoot') || p.endsWith('_full'), p.startsWith('lead') || p.endsWith('_dodge') || p.endsWith('_full')]);
    // 帯のある行は 6 つのファイルで 1 回ずつ回す（表だけの lead_shoot は回さない。帯の無い shield_dodge は shield_full の対の相手として a で回る）。対の相手は同じファイルで回る（相手を含めて 1 ファイル 3 行まで）
    const files = Object.values(SIM_FILES) as readonly (readonly ConvoyPolicy[])[];
    expect(files.flat().sort()).toEqual(CONVOY_CALIBRATION.filter((x) => Object.keys(x.bands).length > 0).map((x) => x.policy).sort());
    for (const f of files) expect(new Set([...f, ...f.flatMap((p) => simPartners(p))]).size, f.join(',')).toBeLessThanOrEqual(3);
  });
});
