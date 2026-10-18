// 夜明けの空襲の模擬（v0.6.1。core/air-strike-sim・systems/air-strike-sim-setup）: ゲームと同じ値と core で、遊び方ごとの帯（spec §12）を N 200・固定 seed で検査する。
// 帯を外したら、まず模擬が spec どおりかを確かめ、次に data の値だけを wave_rest_s → release_altitude_m → run_gap_s → CEP の順で直す（damage は夜の水偵と揃えたまま）。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { SIM_BOUNDS, parseStrikePolicy, runStrikeCell, strikePolicy, type StrikeCellResult } from '../src/core/air-strike-sim';
import { STRIKE_CALIBRATION, calibrationLabel, calibrationMisses, runCalibrationCell, strikeSimSetup } from '../src/systems/air-strike-sim-setup';
import { buildWorldSetup } from '../src/systems/world-setup';

const N = 200;

describe('夜明けの空襲の模擬（v0.6.1）', () => {
  it('模擬はゲームと同じ空襲の値を使い、上書きは §4.1 の検査を通る（落下以下の間隔は例外、VIP=0 は僚艇を狙う機なし）', () => {
    for (const id of ['us_01', 'jp_06']) {
      const s = strikeSimSetup(gameData, id);
      const w = buildWorldSetup(gameData, id);
      // 狙いを収める海域だけは模擬の広い海（SIM_BOUNDS。艇は真ん中から走るので端は効かない）。余白は世界と同じ
      expect({ ...s.strike, boundsW: w.airStrike!.boundsW, boundsH: w.airStrike!.boundsH }).toEqual(w.airStrike);
      expect([s.strike.boundsW, s.strike.boundsH]).toEqual([SIM_BOUNDS.width, SIM_BOUNDS.height]);
      expect(s.boat).toEqual(w.boatParams);
      expect(s.damage).toEqual(w.damageParams);
      expect(s.ringRadiusM).toBe(w.mission.returnPoint.radiusM);
    }
    expect(strikeSimSetup(gameData, 'us_01').strike.escortPlanes).toEqual([false, true, false, true]);
    expect(strikeSimSetup(gameData, 'us_01', { vipAim: false }).strike.escortPlanes).toEqual([false, false, false, false]);
    expect(strikeSimSetup(gameData, 'us_01', { releaseAltitudeM: 150 }).strike.fallFeelS).toBeCloseTo(Math.sqrt(300 / 9.81) / 5, 6);
    expect(strikeSimSetup(gameData, 'jp_06', { cepM: 40 }).strike.scatterM).toBeCloseTo(40 * Math.SQRT2, 9);
    expect(() => strikeSimSetup(gameData, 'us_01', { runGapS: 1.2 })).toThrow(/run_gap_s/);
    expect(() => strikeSimSetup(gameData, 'us_02')).toThrow(/dawn_strike/);
  });

  it('遊び方の名前（POL）と消すまでの秒、同じ seed なら同じ結果・別の seed なら違う結果', () => {
    expect(parseStrikePolicy('react0.5')).toMatchObject({ kind: 'react', reactS: 0.5, extinguishS: 2.0 });
    expect(parseStrikePolicy('react 0.35').extinguishS).toBe(1.5);
    expect(parseStrikePolicy('react0.7').extinguishS).toBe(3.0);
    expect(parseStrikePolicy('circle')).toMatchObject({ kind: 'circle', extinguishS: 1.5 });
    expect(() => parseStrikePolicy('dance')).toThrow(/straight/);
    expect(() => strikePolicy('react')).toThrow(/反応秒/);
    // react の向きと保つ秒（既定は輪に近い側・0.9 秒。same / opp は旋回中だけ今の旋回の側で決める）
    expect(parseStrikePolicy('react0.5')).toMatchObject({ side: 'home', holdS: 0.9, name: 'react 0.5' });
    expect(parseStrikePolicy('react0.5 same2.3')).toMatchObject({ kind: 'react', reactS: 0.5, side: 'same', holdS: 2.3, extinguishS: 2.0, name: 'react 0.5 same2.3' });
    expect(parseStrikePolicy('react0.5same2.3')).toEqual(parseStrikePolicy('react0.5 same2.3'));
    expect(parseStrikePolicy('react0.35 opp2')).toMatchObject({ side: 'opp', holdS: 2, extinguishS: 1.5 });
    expect(parseStrikePolicy('stop')).toMatchObject({ side: 'home', holdS: NaN });
    expect(() => parseStrikePolicy('react0.5 left2')).toThrow(/react/);
    expect(() => strikePolicy('react', 0.5, 'same', 0)).toThrow(/保つ秒/);
    const s = strikeSimSetup(gameData, 'us_01');
    const pol = parseStrikePolicy('zigzag');
    const a = runStrikeCell(s, pol, 30, 20, 7);
    expect(runStrikeCell(s, pol, 30, 20, 7)).toEqual(a);
    expect(runStrikeCell(s, pol, 30, 20, 8)).not.toEqual(a);
  });

  // 較正の表は 1 回だけ回す（N 200 × 16 行で 2 秒ほど）
  const results = new Map<string, StrikeCellResult>();
  const resultOf = (i: number): StrikeCellResult => {
    const c = STRIKE_CALIBRATION[i]!;
    const key = calibrationLabel(c);
    if (!results.has(key)) results.set(key, runCalibrationCell(gameData, c, N));
    return results.get(key)!;
  };

  it('較正（spec §12、N 200・固定 seed）: 投下を見て舵を切り替えれば帰れ、直進は運しだい、止まる・回り続けるは沈む', () => {
    const misses: string[] = [];
    STRIKE_CALIBRATION.forEach((c, i) => {
      const m = calibrationMisses(c, resultOf(i));
      if (m.length > 0) misses.push(`${calibrationLabel(c)}: ${m.join('・')}`);
    });
    expect(misses).toEqual([]);
  }, 30_000);

  it('止まった艇への 1 発あたりの命中は、散布の一様円盤に占める船体（半長 + 半径の capsule）の面積比に一致する（狙いに偏りがない）', () => {
    STRIKE_CALIBRATION.forEach((c, i) => {
      if (c.policy !== 'stop') return;
      const p = strikeSimSetup(gameData, c.missionId).strike;
      expect(p.playerHalfLengthM + p.playerHitRadiusM).toBeLessThanOrEqual(p.scatterM); // capsule が円盤に収まる
      const area = (Math.PI * p.playerHitRadiusM ** 2 + 4 * p.playerHalfLengthM * p.playerHitRadiusM) / (Math.PI * p.scatterM ** 2);
      const r = resultOf(i);
      expect(r.bombsAtPlayer, calibrationLabel(c)).toBeGreaterThan(400);
      expect(Math.abs(r.hitsPerBomb - area), `${calibrationLabel(c)} ${r.hitsPerBomb.toFixed(3)} vs ${area.toFixed(3)}`).toBeLessThan(0.04);
    });
  }, 30_000);
});
