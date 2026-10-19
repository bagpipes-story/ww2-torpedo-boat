// 夜明けの空襲の模擬の組み立て（v0.6.1）: data（missions_seed の dawn_strike・enemies の strike・risk_events の dawn_air_strike）から core/air-strike-sim の設定を作り、
// 較正の表（spec §12。tests/air-strike-sim.test.ts が N 200 で帯を検査し、scripts/dawn-strike-sim.ts が N 600 で表にする）を持つ。
// Phaser 非依存・window を読まない（ゲームは使わない）。上書き（ALT・CEP・GAP・REST・VIP）は data の記録を写して airStrikeParamsFromData に通す（§4.1 の検査も通る）。
import { getDawnStrikeEventRecord, getStrikeAircraftRecord } from '../config/dawn-data';
import type { GameData } from '../config/game-data';
import { FIXED_STEP_S } from '../config/step-config';
import { airStrikeParamsFromData } from '../core/air-strike-data';
import { SIM_BOUNDS, parseStrikePolicy, runStrikeCell, type StrikeCellResult, type StrikeSimSetup } from '../core/air-strike-sim';
import { buildWorldSetup } from './world-setup';

/** 感度を見る上書き（無ければ data の値）。tuning の順は wave_rest_s → release_altitude_m → run_gap_s → CEP（spec §12） */
export interface StrikeSimOverrides {
  waveRestS?: number;
  releaseAltitudeM?: number;
  runGapS?: number;
  cepM?: number;
  /** false なら僚艇を狙う機なし（escort_target_planes []＝全弾が自艇へ） */
  vipAim?: boolean;
}

export function strikeSimSetup(data: GameData, missionId: string, o: StrikeSimOverrides = {}): StrikeSimSetup {
  const w = buildWorldSetup(data, missionId);
  const block = w.mission.dawnStrike;
  if (!block || !w.airStrike) throw new Error(`${missionId} に夜明けの空襲（v0_1_prototype.dawn_strike）が無い`);
  const plane = getStrikeAircraftRecord(data, block.aircraft_id, missionId);
  const ev = getDawnStrikeEventRecord(data);
  const strike = {
    ...plane.strike,
    release_altitude_m: o.releaseAltitudeM ?? plane.strike.release_altitude_m,
    bomb: { ...plane.strike.bomb, accuracy_cep_m: o.cepM ?? plane.strike.bomb.accuracy_cep_m },
  };
  const params = { ...ev.params, run_gap_s: o.runGapS ?? ev.params.run_gap_s, wave_rest_s: o.waveRestS ?? ev.params.wave_rest_s };
  const b = { ...block, escort_target_planes: o.vipAim === false ? [] : block.escort_target_planes };
  const esc = w.escort;
  return {
    // 狙いを収める海域は模擬の広い海（SIM_BOUNDS。艇は真ん中から走るので端は効かない）。余白は世界と同じ
    strike: airStrikeParamsFromData({ ...plane, strike }, { ...ev, params }, b, w.timeScale, { halfLengthM: w.boatHalfLengthM, halfBeamM: w.boatHalfBeamM, boundsMarginM: w.boundsMarginM }, esc, SIM_BOUNDS, w.airStrike.fromJa),
    boat: w.boatParams,
    damage: w.damageParams,
    escort: esc,
    ringRadiusM: w.mission.returnPoint.radiusM,
    timeScale: w.timeScale,
    stepS: FIXED_STEP_S,
  };
}

/** 較正の 1 行（spec §12）。帯は % と 1 発あたりの命中。proto* は前回の値（v0.6.1 の最初: 間隔 3 秒・波の休み 28 秒・最初の進路 12 秒、N 600。新しい行は NaN） */
export interface StrikeCalibrationCell {
  missionId: string;
  secs: number;
  policy: string;
  vipAim: boolean;
  survPct: readonly [number, number] | null;
  vipPct: readonly [number, number] | null;
  hitsPerBomb: readonly [number, number] | null;
  protoSurvPct: number;
  protoVipPct: number;
  protoHitsPerBomb: number;
}

const HPB: readonly [number, number] = [0.45, 0.7];
const cell = (missionId: string, secs: number, policy: string, vipAim: boolean, survPct: readonly [number, number] | null, vipPct: readonly [number, number] | null, hitsPerBomb: readonly [number, number] | null, proto: readonly [number, number, number]): StrikeCalibrationCell => ({
  missionId, secs, policy, vipAim, survPct, vipPct, hitsPerBomb, protoSurvPct: proto[0], protoVipPct: proto[1], protoHitsPerBomb: proto[2],
});

/**
 * spec §12 の表を v0.6.1 の実機 1 回目（「一機ずつ順番に来るので避けやすい。テンポ良く」→ 間隔 3 → 2 秒・波の休み 28 → 16 秒・現れる距離 3,600 → 3,000 m・最初の進路 12 → 9 秒）と
 * 実機 2 回目（間隔 2 → 2.2 秒）で測り直した。
 * 決まった反応（react）の行は、転舵を保つ秒と投下の間隔の噛み合わせで大きく振れる（同じ 0.5 秒でも保つ秒しだいで 0〜96%）ので、帯は回帰の検出用。
 * 「輪を見て離れる側へ切る」（ring。画面の着弾点の輪を見る人に近い）は間隔 1.4〜3 秒のどれでもほぼ 100% ＝ 速くしても理不尽にはならない、の行。
 * 直進・止まる・回り続けるは沈む（直進は輪までの距離しだい）。us_03 は実機 1 回目で空襲ありにした
 */
export const STRIKE_CALIBRATION: readonly StrikeCalibrationCell[] = [
  cell('us_01', 30, 'react0.5', true, [90, 100], [78, 100], null, [99, 100, 0.13]),
  cell('us_01', 30, 'react0.7', true, [85, 100], null, null, [83, 100, 0.38]),
  cell('us_01', 30, 'straight', true, [35, 62], null, null, [70, 96, 0.6]),
  cell('us_01', 30, 'stop', true, [0, 5], null, HPB, [0, 59, 0.6]),
  cell('us_01', 30, 'circle', true, [0, 5], null, HPB, [0, 98, 0.59]),
  cell('us_01', 40, 'straight', true, null, [0, 85], null, [50, 75, 0.6]),
  cell('us_01', 40, 'straight', false, [0, 12], null, null, [5, 100, 0.59]),
  cell('us_01', 40, 'react0.5', false, [80, 100], null, null, [91, 100, 0.12]),
  cell('us_01', 30, 'react0.5ring1.2', true, [95, 100], [62, 92], null, [NaN, NaN, NaN]),
  cell('jp_06', 40, 'react0.35', true, [65, 92], null, null, [83, NaN, 0.09]),
  cell('jp_06', 40, 'react0.5', true, [30, 58], null, null, [42, NaN, 0.23]),
  cell('jp_06', 40, 'react0.7', true, [75, 98], null, null, [12, NaN, 0.39]),
  cell('jp_06', 40, 'straight', true, [0, 10], null, null, [3, NaN, 0.52]),
  cell('jp_06', 40, 'stop', true, [0, 5], null, HPB, [0, NaN, 0.51]),
  cell('jp_06', 40, 'circle', true, [0, 5], null, HPB, [0, NaN, 0.52]),
  cell('jp_06', 20, 'react0.5', true, [42, 68], null, null, [82, NaN, 0.25]),
  cell('jp_06', 40, 'react0.5ring0.9', true, [95, 100], null, null, [NaN, NaN, NaN]),
  cell('us_03', 20, 'straight', true, [30, 58], null, null, [96, NaN, 0.62]),
  cell('us_03', 40, 'straight', true, [0, 12], null, null, [3, NaN, 0.6]),
  cell('us_03', 40, 'stop', true, [0, 5], null, HPB, [NaN, NaN, NaN]),
  cell('us_03', 40, 'react0.5ring0.9', true, [95, 100], null, null, [NaN, NaN, NaN]),
];

/** 較正の行の seed（固定。試作と同じく 1000 + 秒） */
export function strikeCellSeed(c: StrikeCalibrationCell): number {
  return 1000 + c.secs;
}

export function runCalibrationCell(data: GameData, c: StrikeCalibrationCell, n: number, o: StrikeSimOverrides = {}): StrikeCellResult {
  return runStrikeCell(strikeSimSetup(data, c.missionId, { ...o, vipAim: c.vipAim && o.vipAim !== false }), parseStrikePolicy(c.policy), c.secs, n, strikeCellSeed(c));
}

/** 帯を外れた項目（空なら合格）。% は 0.5 点の丸めの余裕を持たせない（帯の端は含む） */
export function calibrationMisses(c: StrikeCalibrationCell, r: StrikeCellResult): string[] {
  const out: string[] = [];
  const inBand = (v: number, b: readonly [number, number]): boolean => v >= b[0] && v <= b[1];
  if (c.survPct && !inBand(r.survived * 100, c.survPct)) out.push(`生還 ${(r.survived * 100).toFixed(1)}%（帯 ${c.survPct[0]}〜${c.survPct[1]}）`);
  if (c.vipPct && !inBand(r.vipAlive * 100, c.vipPct)) out.push(`僚艇 ${(r.vipAlive * 100).toFixed(1)}%（帯 ${c.vipPct[0]}〜${c.vipPct[1]}）`);
  if (c.hitsPerBomb && !inBand(r.hitsPerBomb, c.hitsPerBomb)) out.push(`1 発あたり ${r.hitsPerBomb.toFixed(3)}（帯 ${c.hitsPerBomb[0]}〜${c.hitsPerBomb[1]}）`);
  return out;
}

/** 行の名前（表と失敗の表示） */
export function calibrationLabel(c: StrikeCalibrationCell): string {
  return `${c.missionId}${c.vipAim ? '' : ' VIP=0'} ${c.secs}s ${c.policy}`;
}
