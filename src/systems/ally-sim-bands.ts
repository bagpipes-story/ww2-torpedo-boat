// 卯月のいる jp_04 の模擬の帯（v0.6.10 S4。spec-v0610 §6.3・リードの決定 LD14・LD3・LD6・D9）: 行の帯（ノーマル・ハード。人に近い 3 つの遊び方も帯を持つ）、卯月の得の対
// （得 = 卯月あり − 卯月なし（ALLY_OFF）の達成 %、同じ seed と夜明け）、卯月が照らした夜 %（組ごと）、ハードの段（ハード − ノーマル。同じ seed とつまみ）。対・得・段は組を合わせた夜。
// 卯月を切った夜（ALLY_OFF=1）は S0b の帯（systems/landing-sim-setup の *_NO_ALLY）のまま＝表のバイトが S0b と同じ（G6）。7 つの対の帯（LANDING_PAIRS）と斉射の帯は両方で同じ。
// 帯は §6.3 のまま（G-B4: 帯を広げて通さない。S4 のつまみの掃きと値は CHANGELOG v0.6.10 S4）。Phaser 非依存・window を読まない。
import type { LandingPolicy } from '../core/landing-sim-policy';
import type { LandingTrial } from '../core/landing-trial';
import { LANDING_CALIBRATION_NO_ALLY, LANDING_HARD_CALIBRATION_NO_ALLY, type LandingBandRow, type LandingRun } from './landing-sim-setup';

/**
 * ノーマル（§6.3）: lure 88〜99%（自艇の沈没 ≤ 10・漂流 ≤ 3・夜明けの前の帰投 ≥ 85（S0b で外した帯を呼びかけで戻す）・決着の前の燃料少と輪 ≤ 10）、hide ≤ 15（自艇の沈没 ≤ 3。前のまま）、
 * 人に近い遊び方（主な的＝LD14）: human 72〜88・human_face 52〜70・face 60〜85（組の差が大きいので広い）。ほかの 9 つは行の帯なし（対の帯と I9 だけ）
 */
export const LANDING_CALIBRATION_ALLY: readonly LandingBandRow[] = [
  ...LANDING_CALIBRATION_NO_ALLY.map((r): LandingBandRow => {
    if (r.policy === 'lure') return { policy: 'lure', bands: { objPct: [88, 99], ownSunkPct: [0, 10], adriftPct: [0, 3], homeBeforeDawnPct: [85, 100], fuelCallPct: [0, 10], ringEarlyPct: [0, 10] } };
    return r;
  }),
  { policy: 'face', bands: { objPct: [60, 85] } },
  { policy: 'human', bands: { objPct: [72, 88] } },
  { policy: 'human_face', bands: { objPct: [52, 70] } },
];
/** ハード（PT 3 隻・卯月は同じ。§6.3）: hide ≤ 8・lure 80〜97（自艇の沈没 ≤ 15）・face 38〜60・human 55〜75・human_face 20〜40 */
export const LANDING_HARD_CALIBRATION_ALLY: readonly LandingBandRow[] = [
  { policy: 'hide', bands: { objPct: [0, 8] } },
  { policy: 'lure', bands: { objPct: [80, 97], ownSunkPct: [0, 15] } },
  { policy: 'face', bands: { objPct: [38, 60] } },
  { policy: 'human', bands: { objPct: [55, 75] } },
  { policy: 'human_face', bands: { objPct: [20, 40] } },
];

/** 卯月の得の対: 得(policy) − 得(other) ≥ lo（ノーマル） */
export interface AllyGainPair { policy: LandingPolicy; other: LandingPolicy; lo: number }
/** 人に近い遊び方は手本より卯月の得が大きい（卯月は人の遅れと乱れを埋める。§6.3） */
export const ALLY_GAIN_PAIRS: readonly AllyGainPair[] = [
  { policy: 'human', other: 'lure', lo: 5 },
  { policy: 'human_face', other: 'lure', lo: 10 },
];
/** 卯月が照らした夜 % の下限（ノーマル・組ごと。「卯月が見える」） */
export const ALLY_LIT_BANDS: readonly { policy: LandingPolicy; lo: number }[] = [
  { policy: 'lure', lo: 80 },
  { policy: 'human', lo: 60 },
];
/** ハードの段: ハード − ノーマル（同じ seed・つまみ）の達成 % ≤ hi（ハードははっきり難しい＝LD14） */
export const ALLY_HARD_LADDER: readonly { policy: LandingPolicy; hi: number }[] = [
  { policy: 'human', hi: -8 },
  { policy: 'human_face', hi: -20 },
];

/** 帯の組: 卯月がいれば卯月の帯（人に近い遊び方も帯）、いなければ S0b の帯（人に近い遊び方は表だけ） */
export function landingBandSet(ally: boolean, hard: boolean): { rows: readonly LandingBandRow[]; humanBanded: boolean } {
  if (ally) return { rows: hard ? LANDING_HARD_CALIBRATION_ALLY : LANDING_CALIBRATION_ALLY, humanBanded: true };
  return { rows: hard ? LANDING_HARD_CALIBRATION_NO_ALLY : LANDING_CALIBRATION_NO_ALLY, humanBanded: false };
}

/** 確かめの 1 行（名前・値・帯・合否） */
export interface AllyCheck { name: string; value: number; lo: number; hi: number; ok: boolean }
const check = (name: string, value: number, lo: number, hi: number): AllyCheck => ({ name, value, lo, hi, ok: value >= lo && value <= hi });

/** 照らした夜 %（卯月が PT を 1 隻でも照らした夜） */
export function litNightPct(rs: readonly LandingTrial[]): number {
  return rs.length > 0 ? (100 * rs.filter((r) => r.allyLitPts > 0).length) / rs.length : NaN;
}

/** 卯月の得の対（組を合わせた夜。回した遊び方だけ）。得は run.allyGain */
export function allyGainChecks(run: LandingRun, pols: readonly LandingPolicy[]): AllyCheck[] {
  return ALLY_GAIN_PAIRS.filter((p) => pols.includes(p.policy) && pols.includes(p.other)).map((p) =>
    check(`得(${p.policy}) ${run.allyGain(p.policy).toFixed(1)} − 得(${p.other}) ${run.allyGain(p.other).toFixed(1)}`, run.allyGain(p.policy) - run.allyGain(p.other), p.lo, Infinity),
  );
}

/** 照らした夜 %（組ごと） */
export function allyLitChecks(run: LandingRun, pols: readonly LandingPolicy[], blocks: number): AllyCheck[] {
  return ALLY_LIT_BANDS.filter((p) => pols.includes(p.policy)).flatMap((p) =>
    Array.from({ length: blocks }, (_, b) => check(`${p.policy} 組 ${b + 1}`, litNightPct(run.trials(p.policy, b)), p.lo, 100)),
  );
}

/** ハードの段（hard と normal は同じ seed・組・つまみの表。両方で回した遊び方だけ） */
export function allyLadderChecks(hard: LandingRun, normal: LandingRun, pols: readonly LandingPolicy[]): AllyCheck[] {
  return ALLY_HARD_LADDER.filter((p) => pols.includes(p.policy)).map((p) => {
    const h = hard.pooled(p.policy).objPct;
    const nm = normal.pooled(p.policy).objPct;
    return check(`${p.policy} ハード ${h.toFixed(1)} − ノーマル ${nm.toFixed(1)}`, h - nm, -Infinity, p.hi);
  });
}
