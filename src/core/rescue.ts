// 生存者の救助（v0.8.5 S1。us_07「D-Day・生存者救助」。spec-v0850 §4.1）の純粋な規則。Phaser 非依存・毎ステップ確保しない（状態は createRescueState で 1 回。固定長の型付き配列）。
// - 拾う: 浮いていて、群の中心から pickup_m ＋ 艇の半長の内で、速さ ≤ pickup_max_kt の間、体感秒で per_person_s ごとに 1 名（乗せている < capacity の間）。一番近い群を 1 つだけ。
//   拾えない（離れた・速い・満員・沈んだ・群が空いた・ほかの群に替わった）ステップで時計は 0 に戻す（拾った 1 名ずつは数えたまま）。
// - 移す: フィッチの輪（ring_m）の内で速さ ≤ pickup_max_kt の間、transfer_per_person_s ごとに 1 名を「渡した」へ。輪を出れば時計は 0。
// - 砲撃: 砲台の着弾が群の shell_kill_m の内なら、その群（一番近い 1 群だけ）から 1 名を失う（rescueShell。S ボートの小口径の弾は数えない＝呼ばない）。
// - 救助の時間の終わり（世界の夜明けの時計。rescueTimeUp）: 残りの群はみな「他艦が拾った」へ。乗せている分はそのまま移せる。v0.8.5 IP3: 味方の艇（core/friendly-boats）が出ていれば
//   残りは海に置いたまま（艇が拾い続ける。自艇はもう拾わない＝拾うのは救助の時間の内だけ。終わりに海に残った人は Result の「味方の艇に任せた」）。
// - 終わり（finishRescue）: 帰投と同じに数える終わりは乗せている分も渡したに数える（沖の集合点で移す。設計の既定）。沈めば「沈没で失った」。漂流・座礁は乗せたまま。
// - 群の位置のずれ（rollRescueGroups）: 組み立ての時に 1 回、seed+47 の系列から群ごとに x・y の 2 回（±group_jitter_m の一様）。core/rescue-field が機雷の置き方の前に呼ぶ。ステップの中では引かない。
// 達成は core/mission-flow の rescueObjectiveDone（帰投と同じに数える終わりで渡した数 ≥ objective_delivered）。点は core/scoring の rescued（渡した 1 名ごと）。
import { endCountsAsReturn, type MissionEndReason } from './mission-flow';
import type { SeededRng } from './rng';

/** 救助と機雷原の乱数の系列（seed+47。v0.8.5。us_07 だけ。組み立ての時に 1 回: 群の位置のずれ → 機雷の置き方＝core/rescue-field） */
export const RESCUE_FIELD_SEED_OFFSET = 47;
/** 時計の比べの許し（固定ステップの 1/60 秒の和の丸め。core/column-screen と同じ） */
const RESCUE_TIME_EPS_S = 1e-6;

/** core が読む救助の値（config/rescue-mission-data の RescueSetup がそのまま満たす＝構造の型）。速さは m/s、距離の比べは 2 乗 */
export interface RescueRules {
  readonly groups: readonly { readonly x: number; readonly y: number; readonly count: number }[];
  readonly groupJitterM: number;
  readonly capacity: number;
  readonly pickupM: number;
  readonly pickupMaxMps: number;
  readonly perPersonS: number;
  readonly transferPerPersonS: number;
  readonly shellKill2: number;
  readonly objectiveDelivered: number;
  readonly fitch: { readonly x: number; readonly y: number; readonly ring2: number };
}

export interface RescueState {
  /** 群の数・今夜の中心（ずれ込み）・残りの人数 */
  n: number;
  gx: Float64Array;
  gy: Float64Array;
  left: Int16Array;
  /** 拾える距離の 2 乗（(pickup_m ＋ 艇の半長)²） */
  reach2: number;
  /** 乗せている・渡した（帰投で数えた分を含む）・うち帰投で数えた・砲撃で失った・他艦が拾った・沈没で失った */
  aboard: number;
  delivered: number;
  deliveredAtReturn: number;
  lostShell: number;
  byOthers: number;
  lostSunk: number;
  /** 拾っている群（−1 は無し）とその時計（体感秒）・移す時計・移している */
  pickGroup: number;
  pickS: number;
  transferS: number;
  transferring: boolean;
  /** 救助の時間が終わった・任務が終わった（finishRescue の後は何も変えない）・渡した数が達成の数に届いた */
  timeUp: boolean;
  ended: boolean;
  objectiveReached: boolean;
  /** 出来事の印（数の欄だけ。HUD は通し番号の変わりを見る）: 拾った 1 名ごと・今の（最後の）続けて拾った数、移した 1 名ごと・続けて移した数、砲撃で失った 1 名ごと・その群 */
  pickSeq: number;
  pickRun: number;
  transferSeq: number;
  transferRun: number;
  shellSeq: number;
  shellGroup: number;
}

/** 組み立ての時に 1 回: 群の中心は data のまま（ずれは rollRescueGroups）。boatHalfLengthM は自艇の半長 m */
export function createRescueState(r: RescueRules, boatHalfLengthM: number): RescueState {
  const n = r.groups.length;
  const st: RescueState = {
    n, gx: new Float64Array(n), gy: new Float64Array(n), left: new Int16Array(n), reach2: (r.pickupM + boatHalfLengthM) * (r.pickupM + boatHalfLengthM),
    aboard: 0, delivered: 0, deliveredAtReturn: 0, lostShell: 0, byOthers: 0, lostSunk: 0,
    pickGroup: -1, pickS: 0, transferS: 0, transferring: false, timeUp: false, ended: false, objectiveReached: false,
    pickSeq: 0, pickRun: 0, transferSeq: 0, transferRun: 0, shellSeq: 0, shellGroup: -1,
  };
  for (let i = 0; i < n; i++) {
    const g = r.groups[i]!;
    st.gx[i] = g.x;
    st.gy[i] = g.y;
    st.left[i] = g.count;
  }
  return st;
}

/** 組み立ての時に 1 回: 群ごとに x → y の 2 回（±groupJitterM の一様）。引く回数は 2 × 群の数で固定 */
export function rollRescueGroups(st: RescueState, r: RescueRules, rng: SeededRng): void {
  for (let i = 0; i < st.n; i++) {
    const g = r.groups[i]!;
    st.gx[i] = g.x + (rng.next() * 2 - 1) * r.groupJitterM;
    st.gy[i] = g.y + (rng.next() * 2 - 1) * r.groupJitterM;
  }
}

/** 残りのある群のうち (x, y) から一番近い群（2 乗の距離が maxD2 以下。同じ距離は添字の小さい方）。無ければ −1。HUD の端の印にも使える（maxD2 に Infinity） */
export function nearestRescueGroup(st: RescueState, x: number, y: number, maxD2: number): number {
  let best = -1;
  let bestD2 = maxD2;
  for (let i = 0; i < st.n; i++) {
    if (st.left[i]! <= 0) continue;
    const dx = st.gx[i]! - x;
    const dy = st.gy[i]! - y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= bestD2 && (best < 0 || d2 < bestD2)) {
      best = i;
      bestD2 = d2;
    }
  }
  return best;
}

/** 海に残っている人数（群の残りの和） */
export function rescueOnWater(st: RescueState): number {
  let s = 0;
  for (let i = 0; i < st.n; i++) s += st.left[i]!;
  return s;
}

/**
 * 固定ステップに 1 回（spec §4.0 の順で砲台の後）。(x, y) は自艇の中心、speedMps は自艇の速さ（m/s。艇の speedMps と同じ単位）、afloat は浮いている（沈み始めていない）、feelDt は体感秒。
 * 拾う（一番近い群 1 つ）→ 移す（フィッチの輪の内）の順。任務の終わりの後は何もしない
 */
export function stepRescue(st: RescueState, r: RescueRules, x: number, y: number, speedMps: number, afloat: boolean, feelDt: number): void {
  if (st.ended) return;
  const slow = afloat && speedMps <= r.pickupMaxMps;
  // 拾う
  const g = slow && !st.timeUp && st.aboard < r.capacity ? nearestRescueGroup(st, x, y, st.reach2) : -1; // 救助の時間の後は拾わない（v0.8.5 IP3。それまでは海が空いていた＝同じ動き）
  if (g < 0) {
    st.pickGroup = -1;
    st.pickS = 0;
  } else {
    if (g !== st.pickGroup) {
      st.pickGroup = g;
      st.pickS = 0;
      st.pickRun = 0;
    }
    st.pickS += feelDt;
    while (st.pickS >= r.perPersonS - RESCUE_TIME_EPS_S && st.aboard < r.capacity && st.left[g]! > 0) {
      st.pickS -= r.perPersonS;
      st.left[g] = st.left[g]! - 1;
      st.aboard++;
      st.pickSeq++;
      st.pickRun++;
    }
    if (st.aboard >= r.capacity || st.left[g]! <= 0) {
      st.pickGroup = -1;
      st.pickS = 0;
    }
  }
  // 移す
  const fx = x - r.fitch.x;
  const fy = y - r.fitch.y;
  if (slow && st.aboard > 0 && fx * fx + fy * fy <= r.fitch.ring2) {
    if (!st.transferring) {
      st.transferring = true;
      st.transferS = 0;
      st.transferRun = 0;
    }
    st.transferS += feelDt;
    while (st.transferS >= r.transferPerPersonS - RESCUE_TIME_EPS_S && st.aboard > 0) {
      st.transferS -= r.transferPerPersonS;
      st.aboard--;
      st.delivered++;
      st.transferSeq++;
      st.transferRun++;
    }
    if (st.delivered >= r.objectiveDelivered) st.objectiveReached = true;
  } else {
    st.transferring = false;
    st.transferS = 0;
  }
}

/** 砲台の着弾 1 発（呼ぶのは砲台の砲弾だけ）。(x, y) から shell_kill_m の内で一番近い群から 1 名を失う。失った群の添字（無ければ −1） */
export function rescueShell(st: RescueState, r: RescueRules, x: number, y: number): number {
  if (st.ended) return -1;
  const g = nearestRescueGroup(st, x, y, r.shellKill2);
  if (g < 0) return -1;
  st.left[g] = st.left[g]! - 1;
  st.lostShell++;
  st.shellSeq++;
  st.shellGroup = g;
  if (st.pickGroup === g && st.left[g]! <= 0) {
    st.pickGroup = -1;
    st.pickS = 0;
  }
  return g;
}

/** 救助の時間の終わり（世界の夜明けのラッチ。1 回だけ効く）: 残りの群はみな他艦が拾った。乗せている分はそのまま。keepOnWater（味方の艇が出ている。v0.8.5 IP3）なら海に置いたまま */
export function rescueTimeUp(st: RescueState, keepOnWater = false): void {
  if (st.timeUp || st.ended) return;
  st.timeUp = true;
  st.pickGroup = -1;
  st.pickS = 0;
  if (keepOnWater) return;
  for (let i = 0; i < st.n; i++) {
    st.byOthers += st.left[i]!;
    st.left[i] = 0;
  }
  st.pickGroup = -1;
  st.pickS = 0;
}

/** 艇が浮いたまま終わる理由（漂流・座礁）。帰投と同じに数える終わりと、これ以外は沈没 */
export function rescueEndAfloat(reason: MissionEndReason): boolean {
  return reason === 'adrift' || reason === 'grounded';
}

/** 任務の終わり（1 回だけ効く）: 帰投と同じに数える終わりは乗せている分も渡したに、沈めば沈没で失ったに、漂流・座礁は乗せたまま */
export function finishRescue(st: RescueState, r: RescueRules, reason: MissionEndReason): void {
  if (st.ended) return;
  st.ended = true;
  st.pickGroup = -1;
  st.pickS = 0;
  st.transferring = false;
  st.transferS = 0;
  if (endCountsAsReturn(reason)) {
    st.deliveredAtReturn = st.aboard;
    st.delivered += st.aboard;
    st.aboard = 0;
    if (st.delivered >= r.objectiveDelivered) st.objectiveReached = true;
  } else if (!rescueEndAfloat(reason)) {
    st.lostSunk = st.aboard;
    st.aboard = 0;
  }
}
