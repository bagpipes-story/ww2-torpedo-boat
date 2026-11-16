// v0.8.1 S1（spec-v0810 §3.5 D-K1〜D-K3・§6 の S1、lead の L23・L24）: core/hit-rate の kpiTargetAtLaunch（発射の時の KPI の的＝駆逐艦・夜明けの前・狙った艦の速さが
// kpi_measurement.min_target_speed_kt 以上）。境（4.99／5.00 kt）・止まった艦・夜明けの後・下限 0 は今の規則そのもの、と D-K3 (a) の data の証:
// 遊べる世界のある任務（v0_1_prototype。まだ Title に出ない us_06 も）の駆逐艦の隊の AI の最も遅い目標の速さ ≥ 5 kt＝今のどの任務のどの 1 本の旗も変えない。
// 最も遅い目標の速さは記録と core/ship-ai の値から: 巡航（作った時の速さも）・回避（巡航 ＋ speed_boost_kt を 0〜最大に）・体当たりと退く（最大）・us_04 の列（現れる速さと最大＝30 kt）。
// 艦の速さは目標へ加減速で近づくだけ（steerShip）なので、浮いている艦の速さは作った時・現れた時の速さと目標の速さの最小より下がらない（沈み始めた艦は狙えない）。
// その前提（AI の目標の速さの式・Destroyer が速さを書く所・steerShip の近づき方）も source で固定する（5 kt 未満で回避する艦を足す版はここが落ちて知らせる＝spec §8 R4）。
// S1 ではゲームの誰も kpiTargetAtLaunch を呼ばなかった（S2 から systems/torpedo-free が発射の時に呼ぶ＝tests/kpi-world）。
import { describe, expect, it } from 'vitest';
import { playableMissionIds } from '../src/config/campaign-data';
import { gameData, getEnemyRecord, getEvasionMultiplier } from '../src/config/game-data';
import { getKpiMinTargetSpeedKt, getKpiMinTargetSpeedMps } from '../src/config/kpi-data';
import { hasHardVariant } from '../src/config/mission-data';
import { kpiTargetAtLaunch } from '../src/core/hit-rate';
import { shipAiParamsFromData, type ShipAiParams } from '../src/core/ship-ai';
import { directSortie } from '../src/core/sortie';
import { clamp, ktToMps, mpsToKt } from '../src/core/units';
import { buildWorldSetup } from '../src/systems/world-setup';
import { SRC, code } from './sfx-rules-kit';

const MIN = getKpiMinTargetSpeedMps(gameData);
const r2 = (v: number): number => Math.round(v * 100) / 100;

describe('kpiTargetAtLaunch（発射の時の KPI の的）', () => {
  it('data の下限は 5 kt。5.00 kt は数え、4.99 kt と止まった艦（0）は数えない', () => {
    expect([getKpiMinTargetSpeedKt(gameData), MIN]).toEqual([5, ktToMps(5)]);
    expect(kpiTargetAtLaunch(true, false, ktToMps(5), MIN)).toBe(true);
    expect(kpiTargetAtLaunch(true, false, ktToMps(4.99), MIN)).toBe(false);
    expect(kpiTargetAtLaunch(true, false, 0, MIN)).toBe(false);
    expect(kpiTargetAtLaunch(true, false, ktToMps(25), MIN)).toBe(true);
  });
  it('今の条件はそのまま: 駆逐艦でない（輸送船）・夜明けの後は速さに依らず数えない', () => {
    for (const v of [0, ktToMps(4.99), ktToMps(5), ktToMps(35)]) {
      expect(kpiTargetAtLaunch(false, false, v, MIN), String(v)).toBe(false);
      expect(kpiTargetAtLaunch(true, true, v, MIN), String(v)).toBe(false);
    }
  });
  it('下限 0（鍵の無い data）は今の規則そのもの＝駆逐艦で夜明けの前なら、止まった艦も数える', () => {
    for (const v of [0, ktToMps(4.99), ktToMps(5), ktToMps(35)]) {
      for (const isDestroyer of [false, true]) {
        for (const dawn of [false, true]) expect(kpiTargetAtLaunch(isDestroyer, dawn, v, 0), `${isDestroyer} ${dawn} ${v}`).toBe(isDestroyer && !dawn);
      }
    }
  });
  it('S2 から呼ぶのは systems/torpedo-free の発射の時だけ（S1 は core/hit-rate の中だけ）', () => {
    expect(SRC.filter((f) => code(f).includes('kpiTargetAtLaunch'))).toEqual(['src/core/hit-rate.ts', 'src/systems/torpedo-free.ts']);
  });
});

/** AI の目標の速さ（m/s）: 巡航・回避（巡航 ＋ 増速を 0〜最大に＝core/ship-ai の式）・最大（体当たり・退く） */
const targetSpeeds = (p: ShipAiParams): number[] => [p.cruiseSpeedMps, clamp(p.cruiseSpeedMps + p.speedBoostMps, 0, p.maxSpeedMps), p.maxSpeedMps];
const PROTO_IDS = (gameData.missionsSeed.missions as unknown as Record<string, unknown>[]).filter((m) => m['v0_1_prototype']).map((m) => m['id'] as string);

describe('D-K3 (a): 遊べる世界のある任務の駆逐艦の AI の最も遅い目標の速さ ≥ 5 kt（data から）', () => {
  /** 任務 × ノーマル／ハード × 史実モードの駆逐艦の隊ごと（護衛と、us_04 の列）の [任務, 記録, 隊の部分, 最も遅い kt] */
  const rows: [string, string, string, number][] = [];
  for (const id of PROTO_IDS) {
    for (const hard of hasHardVariant(gameData, id) ? [false, true] : [false]) {
      for (const historical of [false, true]) {
        const s = buildWorldSetup(gameData, id, { sortie: directSortie(id, 1, 'none', hard, historical), hard });
        if (!s.destroyer) continue;
        const rec = getEnemyRecord(gameData, s.mission.enemyId);
        // 隊の駆逐艦の AI は記録の値そのもの（史実モードの倍率は反応・旋回・見張りだけで速さを変えない）
        expect(s.destroyer.shipAi, `${id} ${hard} ${historical}`).toEqual(shipAiParamsFromData(rec, getEvasionMultiplier(gameData, historical)));
        const tag = `${id}${hard ? '&hard' : ''}${historical ? '&hist' : ''}`;
        rows.push([tag, s.mission.enemyId, 'escort', r2(mpsToKt(Math.min(...targetSpeeds(s.destroyer.shipAi))))]);
        if (s.transit) rows.push([tag, s.mission.enemyId, 'column', r2(mpsToKt(Math.min(s.transit.speedMps, ...targetSpeeds(s.transit.shipAi))))]);
      }
    }
  }
  it('表（kt）: ijn_destroyer（us_01・us_02・us_04 の護衛と列）と卯月（us_06）は回避の 25 − 10 ＝ 15、us_destroyer（jp_06）は 18 − 10 ＝ 8。最も遅いのは 8 kt ≥ 5 kt', () => {
    const uniq = [...new Set(rows.map(([t, r, part, kt]) => `${t.split('&')[0]} ${r} ${part} ${kt}`))];
    expect(uniq).toEqual([
      'us_01 ijn_destroyer escort 15', 'us_02 ijn_destroyer escort 15', 'us_04 ijn_destroyer escort 15', 'us_04 ijn_destroyer column 15',
      'us_06 ijn_destroyer_mutsuki_enemy escort 15', 'jp_06 us_destroyer escort 8',
    ]);
    for (const [t, , part, kt] of rows) expect(ktToMps(kt), `${t} ${part}`).toBeGreaterThanOrEqual(MIN);
    expect(Math.min(...rows.map((r) => r[3]))).toBe(8);
  });
  it('記録から直に: 巡航・回避（巡航 ＋ speed_boost_kt）・最大の最小（卯月の記録 ijn_destroyer_mutsuki_enemy を含む）。us_04 の列は 30 kt（現れる速さ＝列の最大）', () => {
    const byRec = (rid: string): number => {
      const r = getEnemyRecord(gameData, rid);
      return Math.min(r.speed_typical_kt, clamp(r.speed_typical_kt + r.evasion.speed_boost_kt, 0, r.speed_max_kt), r.speed_max_kt);
    };
    expect(['ijn_destroyer', 'ijn_destroyer_mutsuki_enemy', 'us_destroyer'].map((r) => [r, byRec(r)])).toEqual([['ijn_destroyer', 15], ['ijn_destroyer_mutsuki_enemy', 15], ['us_destroyer', 8]]);
    const t = buildWorldSetup(gameData, 'us_04', {}).transit!;
    expect([t.speedKt, r2(mpsToKt(t.shipAi.maxSpeedMps))]).toEqual([30, 30]);
  });
  it('遊べる任務（playable_from）の駆逐艦の任務はみな表にあり、まだ遊べない us_06 も表にある', () => {
    const covered = new Set(rows.map((r) => r[0].split('&')[0]));
    const campaigns = [...new Set((gameData.missionsSeed.missions as unknown as Record<string, unknown>[]).map((m) => m['campaign'] as string))];
    expect(campaigns.sort()).toEqual(['jp_hard', 'us_pt']);
    const playable = campaigns.flatMap((c) => playableMissionIds(gameData, c)).filter((id) => buildWorldSetup(gameData, id, {}).destroyer !== null);
    expect(playable.sort()).toEqual(['jp_06', 'us_01', 'us_02', 'us_04']);
    for (const id of [...playable, 'us_06']) expect(covered.has(id), id).toBe(true);
  });
  it('前提の source: AI の目標の速さは巡航・回避・最大だけ、Destroyer が速さを書くのは作る時（巡航）・現れる時（列の速さ）・沈み始め（0）だけ、steerShip は目標を越えない', () => {
    const ai = code('src/core/ship-ai.ts');
    const rhs = [...ai.matchAll(/\bdesiredSpeedMps\s*[:=]\s*([^;\n]+)/g)].map((m) => m[1]!.trim()).filter((v) => !v.startsWith('number'));
    expect(rhs).toEqual(['cruiseSpeedMps,', 'clamp(p.cruiseSpeedMps + p.speedBoostMps, 0, p.maxSpeedMps);', 'p.maxSpeedMps;', 'p.maxSpeedMps;', 'p.cruiseSpeedMps;'].map((v) => v.replace(/;$/, '')));
    expect(ai).toContain('if (ship.speedMps < desiredSpeedMps) ship.speedMps = Math.min(desiredSpeedMps, ship.speedMps + accelMps2 * dt);');
    expect(ai).toContain('else if (ship.speedMps > desiredSpeedMps) ship.speedMps = Math.max(desiredSpeedMps, ship.speedMps - accelMps2 * dt);');
    const d = code('src/entities/destroyer.ts');
    expect(d.match(/speedMps\s*=(?!=)|speedMps:(?!\s*number)/g)!.length).toBe(3);
    for (const s of ['speedMps: aiParams.cruiseSpeedMps }', 'this.state.speedMps = 0;', 's.speedMps = speedMps;']) expect(d).toContain(s);
    expect(code('src/systems/destroyer-transit.ts')).toContain('s.reappear(leg.appearX, leg.laneY, leg.headingDeg, p.speedMps);');
  });
});
