// T-14 の 13mm を撃つ遊び方の較正の帯（v0.6.3 実機 1 回目。spec r1 §G.4・G.5。tests/pt-gun-sim.test.ts が N 200 で検査し、scripts/pt-pass-sim.ts の TABLE=2 が表にする）。
// 撃ち返しは効くが（転舵しながら撃つと HP が減りにくい・何もしないより沈みにくい）、止まって撃ち合うのは罠（沈む）、PT を沈めるのはかなり難しい（どの行も撃沈の夜 16% 以下）。
// 対の帯は同じ seed の撃たない遊び方との差（この行 − 相手）。不変は撃たない表と同じ ptInvariantMisses。帯を外したら spec r1 §G.6 の順に data だけを直す（理由は source に）。Phaser 非依存。
import type { PtSimSetup } from '../core/pt-pass-sim';
import type { PtCell } from '../core/pt-sim-cell';
import type { PtGunPolicy, PtPolicy } from '../core/pt-sim-policy';
import { ptInvariantMisses } from './pt-pass-sim-setup';

type Band = readonly [number, number];
/** 帯を掛ける列（PtCell の名前）と表の名前 */
const METRICS = {
  sunkPct: '沈没 %', hpMean: 'HP の平均', homePct: '帰投 %', detectedPct: '発見 %', gunHits: '1 夜の命中', hitNightPct: '撃った夜のうち当てた夜 %',
  retiredPct: '撃退した夜 %', ptSunkPct: '撃沈した夜 %', flashFirstPct: '最初が閃光の夜 %',
} as const;
type Metric = keyof typeof METRICS;
/** 対の帯: [列, 相手の遊び方, 差の下限, 上限]（この行 − 相手。端を含む） */
type Vs = readonly [Metric, PtPolicy, number, number];

export interface PtGunCalibrationRow {
  policy: PtGunPolicy;
  /** spec r1 §G.4 の ★（最小の組） */
  star: boolean;
  bands: Partial<Record<Metric, Band>>;
  vs: readonly Vs[];
  /** 今の data の模擬の値（N 400・seed 1〜400。目安で、検査はしない）: [沈没 %, HP の平均, 1 夜の命中, 撃退した夜 %, 撃沈した夜 %] */
  proto: readonly [number, number, number, number, number];
}

/** どの行も PT を沈めた夜はこれ以下（「撃沈はかなり難しい」） */
export const PT_GUN_SUNK_NIGHT_MAX = 16;
const row = (policy: PtGunPolicy, star: boolean, bands: Partial<Record<Metric, Band>>, vs: readonly Vs[], proto: PtGunCalibrationRow['proto']): PtGunCalibrationRow => ({ policy, star, bands, vs, proto });

/**
 * spec r1 §G.4: 転舵しながら撃つ（★）は HUD どおりの転舵より HP が 0.5 以上減りにくく、1 夜 5〜14 発当たり、撃った夜はほぼ当たり、撃退は 12〜40% の夜。
 * 巡航のまま撃つは何もしないより 1 点以上沈みにくく HP も 1 以上。2 秒遅れでも撃てば悪くならない。止まって撃ち合う（★）は転舵して撃つより 15 点以上沈み HP も 6 以上（罠）。
 * 暗さに隠れて撃つ（★）は閃光でも発見はほとんど増えず（± 5 点）、最初が閃光の夜は 8〜35%
 */
export const PT_GUN_CALIBRATION: readonly PtGunCalibrationRow[] = [
  row('shoot_cruise', false, { retiredPct: [15, 50], ptSunkPct: [0, 10] }, [['sunkPct', 'cruise', -Infinity, -1], ['hpMean', 'cruise', -Infinity, -1]], [21.3, 37.7, 12.8, 28.8, 3.3]),
  row('turn_shoot', true, { sunkPct: [0, 5], gunHits: [5, 14], hitNightPct: [90, 100], retiredPct: [12, 40], ptSunkPct: [0, 8] }, [['hpMean', 'dodge_silent', -Infinity, -0.5]], [0.8, 16.5, 9.1, 22.3, 2.3]),
  row('react_shoot', false, { ptSunkPct: [0, 8] }, [['hpMean', 'react_full', -Infinity, 0]], [1.0, 18.0, 5.4, 13.0, 1.0]),
  row('late_shoot', false, {}, [['sunkPct', 'late_turn', -Infinity, 1]], [8.8, 31.6, 7.8, 22.0, 3.0]),
  row('stop_shoot', true, { ptSunkPct: [2, 16] }, [['sunkPct', 'turn_shoot', 15, Infinity], ['hpMean', 'turn_shoot', 6, Infinity]], [28.5, 30.1, 26.3, 68.0, 9.5]),
  row('fight', false, { sunkPct: [0, 8], ptSunkPct: [0, 10], homePct: [85, 100] }, [], [2.8, 20.3, 11.1, 27.3, 4.5]),
  row('silent_shoot', false, { ptSunkPct: [0, 12] }, [['sunkPct', 'silent', -Infinity, -8]], [27.3, 31.0, 18.9, 47.3, 5.5]),
  row('dark_shoot', true, { flashFirstPct: [8, 35], sunkPct: [0, 6] }, [['detectedPct', 'dark_stop', -5, 5]], [0.5, 7.2, 5.6, 13.3, 3.0]),
];

/** 撃つ遊び方の行の帯（対の帯は cell で相手の行を読む。同じ seed）・撃沈の上限・不変を外れた項目（空なら合格） */
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
  if (!(c.gunShots > 0)) out.push('13mm を撃たなかった');
  return [...out, ...ptInvariantMisses(c, s)];
}
