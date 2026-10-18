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

/** 較正の 1 行（spec §12）。帯は % と 1 発あたりの命中。proto* は試作（scratchpad v061/raid-sim、N 600）の値（無ければ NaN） */
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
 * spec §12 の表（jp_06 40 秒の circle は「回り続け ≤ 5%」と全任務の 1 発あたり 0.45〜0.70 のために足した行）。
 * 最後の行（レビュー [11]、試作なし）: 転舵を 2.3 秒保つと次の投下は輪へ戻る旋回の途中に来る。そこで今の旋回と同じ側へ切ると円弧の見越しに当たる
 * （jp_06 N 600 で 4%。逆へ切れば 93%）。表の名前の幅（scripts の 26 字）に収めるため 'react0.5same2.3' と詰めて書く
 */
export const STRIKE_CALIBRATION: readonly StrikeCalibrationCell[] = [
  cell('us_01', 30, 'react0.5', true, [90, 100], [90, 100], null, [99, 100, 0.15]),
  cell('us_01', 30, 'react0.7', true, [70, 92], null, null, [82, 100, 0.39]),
  cell('us_01', 30, 'straight', true, [55, 85], null, null, [70, 95, 0.6]),
  cell('us_01', 30, 'stop', true, [0, 5], null, HPB, [0, 62, 0.6]),
  cell('us_01', 30, 'circle', true, [0, 5], null, HPB, [0, 99, 0.6]),
  cell('us_01', 40, 'straight', true, null, [0, 80], null, [49, 69, 0.59]),
  cell('us_01', 40, 'straight', false, [0, 10], null, null, [4, 100, 0.62]),
  cell('us_01', 40, 'react0.5', false, [70, 100], null, null, [85, 100, 0.15]),
  cell('jp_06', 40, 'react0.35', true, [60, 88], null, null, [74, NaN, 0.12]),
  cell('jp_06', 40, 'react0.5', true, [20, 50], null, null, [32, NaN, 0.27]),
  cell('jp_06', 40, 'react0.7', true, [0, 20], null, null, [7, NaN, 0.43]),
  cell('jp_06', 40, 'straight', true, [0, 10], null, null, [2, NaN, 0.54]),
  cell('jp_06', 40, 'stop', true, [0, 5], null, HPB, [0, NaN, 0.54]),
  cell('jp_06', 40, 'circle', true, [0, 5], null, HPB, [0, NaN, 0.52]),
  cell('jp_06', 20, 'react0.5', true, [70, 100], null, null, [84, NaN, 0.24]),
  cell('jp_06', 40, 'react0.5same2.3', true, [0, 15], null, null, [NaN, NaN, NaN]),
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
