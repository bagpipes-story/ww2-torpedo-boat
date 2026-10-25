// 夜の哨戒機（v0.6.7。jp_02「孤島の哨戒」。spec-v067 §F.4・§C.6）の模擬の帯: PATROL_CALIBRATION・PATROL_PAIRS。Phaser 非依存・window を読まない。
// 3 種の帯（v0.6.6 の systems/convoy-hard-calibration と同じ作法）: 設計の帯（design。意味のある閾値のまま。scripts/patrol-air-sim の TABLE=2 が N 400 × 2 組＝seed 1〜400・401〜800 の
// 組ごとに、tests/patrol-air-sim-a〜e が N 200・seed 1 で検査）・対の帯（PATROL_PAIRS。2 組を合わせた 800 夜。TABLE=2）・回帰の帯（regPct。N 200・seed 1 の沈没 % ± 4 点。tests）。
// 不変（spec C.6 の F1・F3・F6・F8・F9・F12・漂流 0・レーダーの発見 ≤ radar_passes）はどの台本も全夜で。掃き（F11）は TABLE=3（どの r も沈没 ≤ 20%・隣の r との差 ≤ 10 点）。
// 帯を外したら値を動かす前に模擬が spec §F.1 どおりかを確かめる（data は enemies.json の us_patrol_bomber・risk_events.json の patrol_air。動かしたら理由を source と CHANGELOG に）。
import type { PatrolCell } from '../core/patrol-air-sim-cell';
import type { PatrolSimSetup } from '../core/patrol-air-sim';

type Band = readonly [number, number];
const I = Infinity;
/** 帯を掛ける列（名前と値） */
const METRICS = {
  sunkPct: ['沈没 %', (c: PatrolCell) => c.sunkPct],
  homeBeforeDawnPct: ['夜明け前の帰投 %', (c: PatrolCell) => c.homeBeforeDawnPct],
  evadePct: ['回避 %', (c: PatrolCell) => c.evadePct],
  medHomeS: ['帰投の中央値 秒', (c: PatrolCell) => c.medHomeS],
  findsVisual: ['目の発見/夜', (c: PatrolCell) => c.findsVisual],
  hitsPerBomb: ['1 発の命中', (c: PatrolCell) => c.hitsPerBomb],
} as const;
export type PatrolMetric = keyof typeof METRICS;

export interface PatrolCalibrationRow {
  policy: string;
  /** spec §F.3 の ★（設計の行: HUD どおり・14 kt と止まる） */
  star: boolean;
  /** 設計の帯（閾値。N 400 の組ごと・tests の N 200） */
  design: Partial<Record<PatrolMetric, Band>>;
  /** 回帰の帯の中心（N 200・seed 1 の沈没 %。帯は ± REG_PTS 点） */
  regPct: number;
}

/** 回帰の帯の幅（点）・F1 の予告の最短（spec C.6。航跡 14.58・静音 16.53 秒）・F11 の掃きの上限と隣との差（点） */
export const PATROL_REG_PTS = 4;
export const PATROL_MIN_WARN_S = 14.5;
export const PATROL_SWEEP_MAX_SUNK_PCT = 20;
export const PATROL_SWEEP_MAX_STEP_PTS = 10;

const row = (policy: string, star: boolean, design: PatrolCalibrationRow['design'], regPct: number): PatrolCalibrationRow => ({ policy, star, design, regPct });

/**
 * spec-v067 §F.4 の帯（行の順は §F.3 の表）。設計: HUD どおり（hud~ ★）は沈没 4〜16%・夜明け前の帰投 ≥ 80%・回避 ≥ 75%・帰投の中央値 90〜115 秒・目の発見 0、
 * 14 kt と止まる（quiet~ ★）は 6〜22%・夜明け前 70〜95%・中央値 180〜215 秒、秒読みに 2 秒遅れる（hud@2.0~）は 20〜42%・目の発見 ≥ 0.6/夜、逃げるだけ（run~）は 25〜50%・回避 0、
 * 14 kt で止まらない（quiet_dodge~）35〜65%、まっすぐ ≥ 80%（1 発 0.40〜0.55）、投下で減速 ≥ 75%、巡航で転舵 ≥ 70%、14 kt のまま ≥ 90%、輪から離れる理想 ≤ 3%（1 発 ≤ 0.02＝F5）、
 * 夜明けまで止まる ≥ 95%。回帰の中心は本物の模擬の N 200・seed 1（試作 v2 の proto/out/v2-reg-n200-s1.txt と同じ値）
 */
export const PATROL_CALIBRATION: readonly PatrolCalibrationRow[] = [
  row('hud~', true, { sunkPct: [4, 16], homeBeforeDawnPct: [80, 100], evadePct: [75, 100], medHomeS: [90, 115], findsVisual: [0, 0] }, 11.5),
  row('hud', false, {}, 8.5),
  row('hud/0.35', false, {}, 1.5),
  row('hud/0.7', false, {}, 12.5),
  row('hud@2.0~', false, { sunkPct: [20, 42], findsVisual: [0.6, I] }, 31.0),
  row('quiet~', true, { sunkPct: [6, 22], homeBeforeDawnPct: [70, 95], medHomeS: [180, 215] }, 16.0),
  row('quiet_dodge~', false, { sunkPct: [35, 65] }, 48.5),
  row('quiet_nostop', false, { sunkPct: [90, 100] }, 98.0),
  row('run~', false, { sunkPct: [25, 50], evadePct: [0, 0] }, 34.5),
  row('run_straight', false, { sunkPct: [80, 100], hitsPerBomb: [0.4, 0.55] }, 97.0),
  row('run_slow', false, { sunkPct: [75, 100] }, 88.5),
  row('run_ring', false, { sunkPct: [0, 3], hitsPerBomb: [0, 0.02] }, 0.0),
  row('cruise~', false, { sunkPct: [70, 100] }, 88.0),
  row('pulse~', false, {}, 11.0),
  row('hide_wait', false, { sunkPct: [95, 100] }, 100),
];

/**
 * 対の帯（spec §F.4。[台本, 相手, 列, 差の下限, 上限]＝台本 − 相手、端を含む。2 組を合わせた夜で判定）: 逃げるだけに代価（run~ − hud~ ≥ +20）・止まることが効く（quiet_dodge~ − quiet~ ≥ +20）・
 * 減速は爆弾をかわさない（run_slow − run~ ≥ +30）・転舵は全速で（cruise~ − run~ ≥ +25）・秒読みに遅れると損（hud@2.0~ − hud~ ≥ +12）・隠れ方の 2 つの型がどちらも遊べる（quiet~ − hud~ が −3〜+12）・
 * pulse は抜け道でない（pulse~ − hud~ ≤ +5 かつ帰投の中央値が hud~ 以上。中央値は組の中央値の平均）
 */
export const PATROL_PAIRS: readonly (readonly [string, string, PatrolMetric, number, number])[] = [
  ['run~', 'hud~', 'sunkPct', 20, I],
  ['quiet_dodge~', 'quiet~', 'sunkPct', 20, I],
  ['run_slow', 'run~', 'sunkPct', 30, I],
  ['cruise~', 'run~', 'sunkPct', 25, I],
  ['hud@2.0~', 'hud~', 'sunkPct', 12, I],
  ['quiet~', 'hud~', 'sunkPct', -3, 12],
  ['pulse~', 'hud~', 'sunkPct', -I, 5],
  ['pulse~', 'hud~', 'medHomeS', 0, I],
];

const range = (b: Band): string => `${b[0] === -I ? '' : b[0]}〜${b[1] === I ? '' : b[1]}`;

function bandMisses(design: Partial<Record<PatrolMetric, Band>>, c: PatrolCell, what: string): string[] {
  const out: string[] = [];
  for (const [k, b] of Object.entries(design) as [PatrolMetric, Band][]) {
    const [label, f] = METRICS[k];
    const v = f(c);
    if (!(v >= b[0] && v <= b[1])) out.push(`${what} ${label} ${v.toFixed(k === 'hitsPerBomb' ? 3 : k === 'findsVisual' ? 2 : 1)}（帯 ${range(b)}）`);
  }
  return out;
}

/** 全夜の不変（spec C.6）を外れた項目（空なら合格） */
export function patrolInvariantMisses(c: PatrolCell, s: PatrolSimSetup): string[] {
  const out: string[] = [];
  if (c.minWarnS < PATROL_MIN_WARN_S) out.push(`F1 目の発見の予告 ${c.minWarnS.toFixed(2)} 秒 < ${PATROL_MIN_WARN_S}`);
  if (c.maxAttackNight > s.sortie.planes || c.maxAttackDawn > s.dawn.planes) out.push(`F3 攻撃できる機 夜 ${c.maxAttackNight}／夜明け ${c.maxAttackDawn}（上限 ${s.sortie.planes}／${s.dawn.planes}）`);
  if (c.overlapSteps > 0) out.push(`F3 夜の出撃と夜明けの攻撃が同時（${c.overlapSteps} ステップ）`);
  if (c.maxBombsAir > 1) out.push(`F3 空中の爆弾 ${c.maxBombsAir}`);
  if (c.drawMismatch > 0) out.push(`F6 +23 の回数が 2 × 投下 + 命中の抽選と合わない夜 ${c.drawMismatch}`);
  if (c.waveMismatch > 0) out.push(`F8 来た波 ≠ 発見の夜 ${c.waveMismatch}`);
  if (c.sunkFirePct > 0) out.push(`F9 火災の沈没 ${c.sunkFirePct.toFixed(1)}%`);
  if (c.restartFalse > 0) out.push(`F12 再出撃の遅れ ${c.restartFalse} 回`);
  if (c.driftPct > 0) out.push(`漂流 ${c.driftPct.toFixed(1)}%`);
  if (c.radarFindsMax > s.gate.radarPasses) out.push(`レーダーの発見 ${c.radarFindsMax} > radar_passes ${s.gate.radarPasses}`);
  return out;
}

/** 設計の行の帯と不変（scripts の TABLE=2 の組ごと） */
export function patrolDesignMisses(r: PatrolCalibrationRow, c: PatrolCell, s: PatrolSimSetup): string[] {
  return [...bandMisses(r.design, c, '設計'), ...patrolInvariantMisses(c, s)];
}

/** 回帰の帯（tests。N 200・seed 1）・設計の行の帯・不変 */
export function patrolRegressionMisses(r: PatrolCalibrationRow, c: PatrolCell, s: PatrolSimSetup): string[] {
  const reg: Band = [Math.max(0, r.regPct - PATROL_REG_PTS), Math.min(100, r.regPct + PATROL_REG_PTS)];
  return [...bandMisses({ sunkPct: reg }, c, '回帰'), ...patrolDesignMisses(r, c, s)];
}

/** 組を合わせた値（夜の数で重みづけした平均。% は合わせた夜の %。中央値は組の中央値の平均） */
export function pooledPatrol(cells: readonly PatrolCell[], k: PatrolMetric): number {
  if (cells.length === 0) return NaN;
  const f = METRICS[k][1];
  return cells.reduce((a, c) => a + f(c) * c.n, 0) / cells.reduce((a, c) => a + c.n, 0);
}

/** 対の帯の判定（cellsOf は台本の組の表。表の無い対は外れ）: 文（「対 run~ − hud~ の 沈没 % +25.3（帯 20〜）」）と合否 */
export function patrolPairChecks(cellsOf: (policy: string) => readonly PatrolCell[]): { text: string; ok: boolean }[] {
  return PATROL_PAIRS.map(([a, b, k, lo, hi]) => {
    const d = pooledPatrol(cellsOf(a), k) - pooledPatrol(cellsOf(b), k);
    return { text: `対 ${a} − ${b} の ${METRICS[k][0]} ${Number.isNaN(d) ? '（表が無い）' : `${d >= 0 ? '+' : ''}${d.toFixed(1)}`}（帯 ${range([lo, hi])}）`, ok: d >= lo && d <= hi };
  });
}

/** 掃き（F11。反応の秒の順の沈没 %）: どの r も ≤ 20%・隣との差 ≤ 10 点 */
export function patrolSweepMisses(sunkPcts: readonly number[]): string[] {
  const out: string[] = [];
  sunkPcts.forEach((v, i) => {
    if (v > PATROL_SWEEP_MAX_SUNK_PCT) out.push(`F11 ${i} 番目の r の沈没 ${v.toFixed(1)}% > ${PATROL_SWEEP_MAX_SUNK_PCT}`);
    if (i > 0 && Math.abs(v - sunkPcts[i - 1]!) > PATROL_SWEEP_MAX_STEP_PTS) out.push(`F11 ${i - 1} → ${i} 番目の r の差 ${Math.abs(v - sunkPcts[i - 1]!).toFixed(1)} 点 > ${PATROL_SWEEP_MAX_STEP_PTS}`);
  });
  return out;
}
