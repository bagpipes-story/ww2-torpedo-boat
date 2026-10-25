// jp_01 のハード（v0.6.6「日本ハードモード⑤：隼艇」。米PT 3 隻・隼艇・3 隻とも上陸で達成。spec-v066 §F.5）の模擬の帯: CONVOY_HARD_CALIBRATION。
// ノーマルの帯（systems/convoy-sim-setup の CONVOY_CALIBRATION・CONVOY_CLOSE_FIRE）は触らない（ノーマル同一の証拠）。v0.6.5 の systems/pt-engine-calibration と同じく別ファイル（convoy-sim-setup が 300 行に近い）。
// 2 種の帯: 回帰の帯（bands。本物の模擬の N 200 × 4 組＝seed 1・201・401・601 の最小〜最大に ±4 点・到達 ±0.1・隼艇の失った HP ±2。tests/convoy-sim-hard-* が N 200・seed 1 で検査）と
// 設計の帯（design・vs。閾値のまま。scripts/convoy-sim の HARD=1 TABLE=2 が N 400 で検査し、対の帯（vs）は seed 1〜400 と 401〜800 の 2 組とも満たす）。Phaser 非依存・window を読まない。
import type { GameData } from '../config/game-data';
import type { ConvoySimSetup } from '../core/convoy-sim';
import type { ConvoyCell } from '../core/convoy-sim-cell';
import type { ConvoyPolicy } from '../core/convoy-sim-policy';
import { convoyCalibrationRun, convoyInvariantMisses, type ConvoySimOverrides } from './convoy-sim-setup';

type Band = readonly [number, number];
/** 帯を掛ける列と表の名前（achievedPct は表ごとの達成: ハードは 3 隻とも上陸して帰投・ノーマルは 2 隻以上上陸して帰投） */
const HARD_METRICS = {
  arrivedMean: ['到達/3', (c: ConvoyCell) => c.arrivedMean],
  achievedPct: ['達成 %', (c: ConvoyCell) => c.achievedPct],
  sunkPct: ['自艇の沈没 %', (c: ConvoyCell) => c.sunkPct],
  gbSunkPct: ['隼艇の沈没 %', (c: ConvoyCell) => c.gunboat?.sunkPct ?? NaN],
  gbHpLost: ['隼艇の失った HP', (c: ConvoyCell) => c.gunboat?.hpLostMean ?? NaN],
} as const;
export type HardMetric = keyof typeof HARD_METRICS;
/** 対の帯の相手: off＝隼艇なしのハード（GUNBOAT_OFF。米PT 3 隻・ノルマ 3）、normal＝ノーマル（米PT 2 隻・ノルマ 2）。どちらも同じ seed */
export type HardPartner = 'off' | 'normal';
/** 対の帯: [列, 相手, 差の下限, 上限]（この行 − 相手。端を含む） */
type HardVs = readonly [HardMetric, HardPartner, number, number];

export interface ConvoyHardRow {
  policy: ConvoyPolicy;
  /** spec-v066 §F.5 の ★ */
  star: boolean;
  /** 設計の帯（閾値。N 400） */
  design: Partial<Record<HardMetric, Band>>;
  /** 回帰の帯（N 200 × 4 組の最小〜最大 ±4 点・到達 ±0.1・隼艇の失った HP ±2） */
  bands: Partial<Record<HardMetric, Band>>;
  /** 対の帯（設計。N 400 の 2 組とも） */
  vs: readonly HardVs[];
}

const I = Infinity;
/** 隼艇の沈没 % の上限（9 台本とも。試作は 0〜0.3%） */
export const GUNBOAT_SUNK_MAX_PCT = 1;
const GB: Partial<Record<HardMetric, Band>> = { gbSunkPct: [0, GUNBOAT_SUNK_MAX_PCT] };
const row = (policy: ConvoyPolicy, star: boolean, design: Partial<Record<HardMetric, Band>>, bands: Partial<Record<HardMetric, Band>>, vs: readonly HardVs[]): ConvoyHardRow => ({ policy, star, design: { ...design, ...GB }, bands, vs });

/**
 * spec-v066 §F.5 の帯（行の順は §F.5 の表）。設計: HUD どおり（shield_full ★）は 3 隻とも上陸して帰投 50〜70%・自艇の沈没 4〜15%、追うだけ（follow_full ★）は 25〜45%・≤ 12%、
 * ユーザーの型（shield_shoot）は 45〜65%・32〜50%、隠れる（none ★）は ≤ 18%・8〜18%、見捨てる（dash_home）は 0%・6〜15%。隼艇の沈没は 9 台本とも ≤ 1%。
 * 対の帯: 助けになる（隼艇なしより shield_full の達成 +6 点以上・沈没 −4 点以下、follow_full の沈没 −4 点以下、shield_shoot の沈没 −8 点以下）・救わない（none・dash_home は隼艇の有無で ±1 点）・
 * 達成でノーマルより厳しい（shield_full はノーマルの 2 隻以上で帰投 − 8 点以下、shield_shoot は − 3 点以下）・自艇に易しすぎない（shield_full・follow_full・far_full の沈没 ≥ ノーマル − 3 点、
 * follow_shoot・follow_dodge・shield_dodge は ≥ ノーマル − 9 点、shield_shoot は ≥ ノーマル）。
 * 回帰の帯の元（N 200 × 4 組の最小〜最大）: shield_full 到達 2.56〜2.60・達成 57.0〜60.5・沈没 8.5〜10.0・隼艇の HP 2.06〜3.06、follow_full 2.155〜2.215・31.5〜37.0・4.0〜8.0・2.98〜4.14、
 * shield_shoot 2.035〜2.155・53.5〜55.5・39.0〜43.0・1.52〜2.54、follow_shoot 1.995〜2.075・27.5〜32.0・13.5〜19.0・2.62〜3.22、far_full 2.025〜2.100・20.0〜28.0・8.0〜13.5・0.78〜1.14、
 * shield_dodge 2.125〜2.290・38.0〜41.0・7.0〜12.5・3.72〜4.92、follow_dodge 1.760〜1.890・14.0〜21.0・2.5〜5.5・4.78〜8.60、none 0.775〜0.885・11.0〜15.0・10.5〜15.5・0、dash_home 0・0・8.5〜11.5・0
 */
export const CONVOY_HARD_CALIBRATION: readonly ConvoyHardRow[] = [
  row('shield_full', true, { achievedPct: [50, 70], sunkPct: [4, 15] }, { arrivedMean: [2.46, 2.7], achievedPct: [53, 64.5], sunkPct: [4.5, 14], gbHpLost: [0, 5.1] },
    [['achievedPct', 'off', 6, I], ['sunkPct', 'off', -I, -4], ['achievedPct', 'normal', -I, -8], ['sunkPct', 'normal', -3, I]]),
  row('follow_full', true, { achievedPct: [25, 45], sunkPct: [0, 12] }, { arrivedMean: [2.05, 2.32], achievedPct: [27.5, 41], sunkPct: [0, 12], gbHpLost: [0.9, 6.2] },
    [['sunkPct', 'off', -I, -4], ['sunkPct', 'normal', -3, I]]),
  row('shield_shoot', false, { achievedPct: [45, 65], sunkPct: [32, 50] }, { arrivedMean: [1.93, 2.26], achievedPct: [49.5, 59.5], sunkPct: [35, 47], gbHpLost: [0, 4.6] },
    [['sunkPct', 'off', -I, -8], ['achievedPct', 'normal', -I, -3], ['sunkPct', 'normal', 0, I]]),
  row('follow_shoot', false, {}, { arrivedMean: [1.89, 2.18], achievedPct: [23.5, 36], sunkPct: [9.5, 23], gbHpLost: [0.6, 5.3] }, [['sunkPct', 'normal', -9, I]]),
  row('far_full', false, {}, { arrivedMean: [1.92, 2.2], achievedPct: [16, 32], sunkPct: [4, 17.5], gbHpLost: [0, 3.2] }, [['sunkPct', 'normal', -3, I]]),
  row('shield_dodge', false, {}, { arrivedMean: [2.02, 2.39], achievedPct: [34, 45], sunkPct: [3, 16.5], gbHpLost: [1.7, 7] }, [['sunkPct', 'normal', -9, I]]),
  row('follow_dodge', false, {}, { arrivedMean: [1.66, 1.99], achievedPct: [10, 25], sunkPct: [0, 9.5], gbHpLost: [2.7, 10.6] }, [['sunkPct', 'normal', -9, I]]),
  row('none', true, { achievedPct: [0, 18], sunkPct: [8, 18] }, { arrivedMean: [0.67, 0.99], achievedPct: [7, 19], sunkPct: [6.5, 19.5], gbHpLost: [0, 2] },
    [['achievedPct', 'off', -1, 1], ['sunkPct', 'off', -1, 1]]),
  row('dash_home', false, { achievedPct: [0, 0], sunkPct: [6, 15] }, { arrivedMean: [0, 0], achievedPct: [0, 0], sunkPct: [4.5, 15.5], gbHpLost: [0, 2] },
    [['achievedPct', 'off', -1, 1], ['sunkPct', 'off', -1, 1]]),
];

/** 計測（帯なし。spec-v066 §F.5）: 同じ物差し（3 隻とも上陸して帰投 %・到達）をハードとノーマルで並べる行、隼艇が自艇から 480 m の外にいた秒の割合（W7）を出す行 */
export const CONVOY_HARD_SAME_SCALE: readonly ConvoyPolicy[] = ['shield_full', 'follow_full', 'none', 'shield_dodge', 'shield_shoot'];
export const CONVOY_HARD_OFFSCREEN: readonly ConvoyPolicy[] = ['shield_full', 'follow_full', 'far_full', 'follow_shoot', 'follow_dodge'];
/** 自艇から視程の外での隼艇の発射が 0 の遊び方（HUD どおり） */
export const CONVOY_HARD_HUD: readonly ConvoyPolicy[] = ['shield_full'];

export interface ConvoyHardRun {
  setup: ConvoySimSetup;
  cell: (policy: ConvoyPolicy) => ConvoyCell;
  partner: (k: HardPartner, policy: ConvoyPolicy) => ConvoyCell;
}

/** ハードの表を 1 回だけ回す口（tests と scripts）: ハード（隼艇あり）と対の相手（隼艇なし・ノーマル）。どれも初めて読んだときに n 夜（seed は seedBase から）回して覚える */
export function convoyHardCalibrationRun(data: GameData, missionId: string, n: number, seedBase: number, o: ConvoySimOverrides = {}): ConvoyHardRun {
  const main = convoyCalibrationRun(data, missionId, n, seedBase, { ...o, hard: true });
  if (!main.setup.gunboat) throw new Error(`${missionId} のハードに隼艇（v0_1_prototype.hard.gunboat）が無い（GUNBOAT_OFF の表に帯は掛けない）`);
  const off = convoyCalibrationRun(data, missionId, n, seedBase, { ...o, hard: true, gunboatOff: true });
  const normal = convoyCalibrationRun(data, missionId, n, seedBase, { ...o, hard: undefined, gunboatOff: undefined, pt3Off: undefined, gbFactor: undefined, gbCatchupM: undefined, gbSlow2: undefined });
  return { setup: main.setup, cell: main.cell, partner: (k, policy) => (k === 'off' ? off : normal).cell(policy) };
}

/** 回帰の帯（tests。N 200）: bands と design の行の帯（対の帯は読まない）・隼艇の沈没 ≤ 1%・不変を外れた項目（空なら合格） */
export function convoyHardRegressionMisses(r: ConvoyHardRow, run: ConvoyHardRun): string[] {
  const c = run.cell(r.policy);
  return [...bandMisses(r.bands, c, '回帰'), ...bandMisses(r.design, c, '設計'), ...convoyHardInvariantMisses(r.policy, c, run.setup)];
}

/** 設計の帯（scripts の TABLE=2。N 400）: design の帯・対の帯（相手は同じ seed）・不変を外れた項目（空なら合格） */
export function convoyHardDesignMisses(r: ConvoyHardRow, run: ConvoyHardRun): string[] {
  const c = run.cell(r.policy);
  const out = bandMisses(r.design, c, '設計');
  for (const [k, partner, lo, hi] of r.vs) {
    const [name, get] = HARD_METRICS[k];
    const v = get(c);
    const o = get(run.partner(partner, r.policy));
    const dv = v - o;
    if (!(dv >= lo && dv <= hi)) out.push(`${name} ${v.toFixed(1)}（${partner === 'off' ? '隼艇なし' : 'ノーマル'} ${o.toFixed(1)} との差 ${dv.toFixed(1)} が ${lo}〜${hi} の外）`);
  }
  return [...out, ...convoyHardInvariantMisses(r.policy, c, run.setup)];
}

function bandMisses(bands: Partial<Record<HardMetric, Band>>, c: ConvoyCell, kind: string): string[] {
  const out: string[] = [];
  for (const [k, b] of Object.entries(bands) as [HardMetric, Band][]) {
    const [name, get] = HARD_METRICS[k];
    const v = get(c);
    if (!(v >= b[0] && v <= b[1])) out.push(`${kind}: ${name} ${v.toFixed(2)}（帯 ${b[0]}〜${b[1]}）`);
  }
  return out;
}

/**
 * 不変（spec-v066 §F.5 の最終行。どの遊び方も）: ノーマルの不変（convoyInvariantMisses）に、隼艇への 1 回の攻撃の最大命中 × 被害 < 隼艇の HP・決着の後の隼艇の発射 0 と被弾 0・
 * 視程か射程の外への隼艇の発射 0・HUD どおりでは自艇の視程（900 m）の外での隼艇の発射 0
 */
export function convoyHardInvariantMisses(policy: ConvoyPolicy, c: ConvoyCell, s: ConvoySimSetup): string[] {
  const out = convoyInvariantMisses(c, s);
  const g = c.gunboat;
  const gb = s.gunboat;
  if (!g || !gb) return [...out, '隼艇の列が無い'];
  if (!(g.worstPassHits * s.pt.hit.damage < gb.hullHp)) out.push(`隼艇への 1 回の攻撃の命中 ${g.worstPassHits} 発（× ${s.pt.hit.damage} が HP ${gb.hullHp} 未満）`);
  if (g.postFire > 0 || g.postHits > 0) out.push(`決着の後の隼艇の発射 ${g.postFire}・被弾 ${g.postHits}`);
  if (g.beyond > 0) out.push(`視程か射程の外への隼艇の発射 ${g.beyond}`);
  if (CONVOY_HARD_HUD.includes(policy) && g.beyondPlayer > 0) out.push(`自艇の視程の外での隼艇の発射 ${g.beyondPlayer}（HUD どおりは 0）`);
  return out;
}
