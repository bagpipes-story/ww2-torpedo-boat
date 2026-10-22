// T-14 の 13mm を撃つ遊び方の較正の帯（v0.6.3 実機 1 回目 spec r1 §G.4、実機 2 回目 spec r2 §H.2。tests/pt-sim-*.test.ts が N 200 で検査し、scripts/pt-pass-sim.ts の TABLE=2 が表にする）。
// 撃ち返すのが生還の道（同じ seed の撃たない行の半分以下しか沈まず HP も 4 以上減りにくい＝対の規則）、止まって撃ち合うのは罠のまま（転舵して撃つより 15 点以上沈む）だが何もしないよりは安全、
// PT を沈めるのはかなり難しい（どの行も撃沈の夜 16% 以下）。対の帯は同じ seed の撃たない遊び方と比べる。不変は撃たない表と同じ ptInvariantMisses。
// 帯を外したら spec r2 §H.2 の順に data だけを直す（理由は source に）。Phaser 非依存。
import type { PtSimSetup } from '../core/pt-pass-sim';
import type { PtCell } from '../core/pt-sim-cell';
import type { PtGunPolicy, PtNoGunPolicy, PtPolicy } from '../core/pt-sim-policy';
import { ptInvariantMisses } from './pt-pass-sim-setup';

type Band = readonly [number, number];
/** 帯を掛ける列（PtCell の名前）と表の名前 */
const METRICS = {
  sunkPct: '沈没 %', hpMean: 'HP の平均', homePct: '帰投 %', detectedPct: '発見 %', gunHits: '1 夜の命中', hitNightPct: '撃った夜のうち当てた夜 %',
  retiredPct: '撃退した夜 %', ptSunkPct: '撃沈した夜 %', flashFirstPct: '最初が閃光の夜 %', suppressions: '1 夜の制圧',
} as const;
type Metric = keyof typeof METRICS;
/** 対の帯: [列, 相手の遊び方, 差の下限, 上限]（この行 − 相手。端を含む） */
type Vs = readonly [Metric, PtPolicy, number, number];
/** 対の規則（spec r2 §H.2）: [撃たない行, 倍率 k, HP の差 h] で 沈没 ≤ k × 相手の沈没 + PT_GUN_PAIR_ADD かつ HP ≤ 相手の HP − h */
type Pair = readonly [PtNoGunPolicy, number, number];

export interface PtGunCalibrationRow {
  policy: PtGunPolicy;
  /** spec r2 §B.4・H.2 の ★（最小の組） */
  star: boolean;
  bands: Partial<Record<Metric, Band>>;
  vs: readonly Vs[];
  pair: Pair | null;
  /** 今の data の模擬の値（N 400・seed 1〜400。目安で、検査はしない）: [沈没 %, HP の平均, 1 夜の命中, 撃退した夜 %, 撃沈した夜 %] */
  proto: readonly [number, number, number, number, number];
}

/** どの行も PT を沈めた夜はこれ以下（「撃沈はかなり難しい」） */
export const PT_GUN_SUNK_NIGHT_MAX = 16;
/** 対の規則の沈没の足し（点。N 200 の揺らぎ） */
export const PT_GUN_PAIR_ADD = 2;
const HALF = 0.5;
const LOOSE = 0.65;
const HP_GAIN = 4;
const row = (policy: PtGunPolicy, star: boolean, bands: Partial<Record<Metric, Band>>, vs: readonly Vs[], pair: Pair | null, proto: PtGunCalibrationRow['proto']): PtGunCalibrationRow => ({ policy, star, bands, vs, pair, proto });

/**
 * spec r2 §H.2: 転舵しながら撃つ（★）は 0〜6% 沈み、撃退の夜 35〜65%・1 夜 10〜28 発当たる。撃たない行に撃ち返しを足すと半分以下（★ の対。2 秒遅れ・巡航のまま・静音のままは 0.65 倍）。
 * HUD の教える 14 kt＋撃つ（★）は 0〜10%・撃退 70% 以上・1 夜 2.5 回以上制圧。止まって撃ち合う（★）は 25〜50%（罠）で何もしない巡航より危なくない。暗さに隠れて撃つ（★）は発見が増えない。
 * 全速で逃げて撃つのは散るので帯だけ（≤ 25・≤ 20）
 */
export const PT_GUN_CALIBRATION: readonly PtGunCalibrationRow[] = [
  row('shoot_cruise', false, {}, [], ['cruise', LOOSE, 3], [21.8, 39.7, 12.0, 27.0, 2.8]),
  row('turn_shoot', true, { sunkPct: [0, 6], retiredPct: [35, 65], gunHits: [10, 28], hitNightPct: [90, 100] }, [], ['dodge_silent', HALF, HP_GAIN], [0.0, 13.4, 18.2, 52.5, 5.8]),
  row('react_shoot', false, {}, [], ['react_full', HALF, HP_GAIN], [8.3, 28.3, 11.8, 37.8, 2.0]),
  row('late_shoot', false, {}, [], ['late_turn', LOOSE, HP_GAIN], [25.3, 36.3, 13.9, 36.3, 5.0]),
  row('stop_shoot', true, { sunkPct: [25, 50], ptSunkPct: [2, 16] }, [['sunkPct', 'tc_shoot', 15, Infinity], ['sunkPct', 'cruise', -Infinity, 0]], null, [37.5, 32.5, 23.6, 64.0, 7.0]),
  row('fight', false, { sunkPct: [0, 6], homePct: [95, 100] }, [], null, [0.8, 14.5, 25.5, 77.5, 9.5]),
  row('silent_shoot', false, {}, [], ['silent', LOOSE, HP_GAIN], [9.3, 27.0, 21.4, 59.8, 5.5]),
  row('dark_shoot', true, { sunkPct: [0, 4], flashFirstPct: [8, 35] }, [['detectedPct', 'dark_stop', -5, 5]], null, [0.3, 5.2, 7.4, 21.0, 2.5]),
  row('tc_shoot', true, {}, [], ['turn_cruise', HALF, HP_GAIN], [10.0, 29.3, 13.1, 32.3, 4.0]),
  row('hold_shoot', true, {}, [], ['hold_cruise', HALF, HP_GAIN], [11.0, 30.2, 13.4, 31.8, 3.3]),
  row('holdfull_shoot', false, {}, [], ['hold_full', HALF, HP_GAIN], [7.3, 27.9, 11.6, 33.5, 4.0]),
  row('midfull_shoot', false, {}, [], ['mid_full', HALF, HP_GAIN], [11.0, 31.4, 11.7, 32.0, 2.8]),
  row('latefull_shoot', false, {}, [], ['late_full', LOOSE, HP_GAIN], [18.0, 33.3, 11.9, 30.5, 3.3]),
  row('flee_shoot', false, { sunkPct: [0, 25] }, [], null, [9.8, 32.5, 4.4, 13.3, 1.8]),
  row('fleedodge_shoot', false, { sunkPct: [0, 20] }, [], null, [6.5, 24.7, 4.9, 13.5, 2.0]),
  row('slow_shoot', true, { sunkPct: [0, 10], retiredPct: [70, 100], suppressions: [2.5, Infinity] }, [], null, [2.3, 20.7, 28.5, 87.5, 10.3]),
];

/** 撃つ遊び方の行の帯（対の帯・対の規則は cell で相手の行を読む。同じ seed）・撃沈の上限・不変を外れた項目（空なら合格） */
export function ptGunCalibrationMisses(r: PtGunCalibrationRow, cell: (policy: PtPolicy) => PtCell, s: PtSimSetup): string[] {
  const c = cell(r.policy);
  const out: string[] = [];
  const bands: readonly (readonly [Metric, Band])[] = [...(Object.entries(r.bands) as [Metric, Band][]), ['ptSunkPct', [0, PT_GUN_SUNK_NIGHT_MAX]]];
  for (const [k, b] of bands) if (!(c[k] >= b[0] && c[k] <= b[1])) out.push(`${METRICS[k]} ${c[k].toFixed(1)}（帯 ${b[0]}〜${b[1]}）`);
  for (const [k, other, lo, hi] of r.vs) {
    const o = cell(other)[k];
    const dv = c[k] - o;
    if (!(dv >= lo && dv <= hi)) out.push(`${METRICS[k]} ${c[k].toFixed(1)}（${other} ${o.toFixed(1)} との差 ${dv.toFixed(1)} が ${lo}〜${hi} の外）`);
  }
  if (r.pair) {
    const [other, k, h] = r.pair;
    const o = cell(other);
    if (!(c.sunkPct <= k * o.sunkPct + PT_GUN_PAIR_ADD)) out.push(`沈没 ${c.sunkPct.toFixed(1)}%（${other} ${o.sunkPct.toFixed(1)} の ${k} 倍 + ${PT_GUN_PAIR_ADD} 以下）`);
    if (!(c.hpMean <= o.hpMean - h)) out.push(`HP の平均 ${c.hpMean.toFixed(1)}（${other} ${o.hpMean.toFixed(1)} より ${h} 以上少なく）`);
  }
  if (!(c.gunShots > 0)) out.push('13mm を撃たなかった');
  return [...out, ...ptInvariantMisses(c, s)];
}
