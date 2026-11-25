// 砲台が生存者の海を撃つ（v0.8.5 IP2。us_07。実機 1 回目のユーザー「沿岸砲の砲撃が生存者に至近弾となったら1名ずつ死亡発生するようにしてください。」）: 砲台の隊の撃つ間隔の外の 1 本の時計。
// 自艇を撃てない砲台（気づいていない・射界の外・煙幕で線が切れた・沈み始めた）があり、救助の時間の内なら、interval_s ごとに 1 発、その砲台から残りのある群（射界の内）の 1 つへ撃つ。
// 撃つ砲台は前に撃った砲台の次から順に探す（ハードの 3 つの砲台は代わる代わる＝隊で 1 本の時計。3 倍にならない）。群は射界の内の残りのある群から一様に 1 つ（乱数 1 回）。
// 散布は今の砲の規則（距離に比例＝dispersion_m × 距離 / 有効射程）× dispersion_factor（動かない的へ撃ち慣れている）。見越しは無い（群は動かない）。弾は砲台の砲弾のプール（core/shells の
// launchShell。乱数 2 回）へ gunIndex SURVIVOR_SHELL_GUN で撃ち、飛行・着弾・艇への当たり・水柱・群の 1 名は自艇へ撃った弾と同じ道（core/shore-battery の弾の段・core/rescue の rescueShell）。
// 乱数は seed+48 の系列だけ（1 発 3 回＝群 1・散布 2。撃たなければ引かない）。最初の 1 発は始まりから interval_s の後（砲が群へ向くのを見せる）。間隔は負の残りを繰り越す（撃てない間は 0 で待つ）。
// Phaser 非依存・毎ステップ確保しない。
import type { RescueState } from './rescue';
import type { SeededRng } from './rng';
import { findFreeShell, launchShell } from './shells';
import type { ShoreBatteryParams, ShoreBatteryState } from './shore-battery';

/** 生存者の海への砲撃の乱数の系列（seed+48。v0.8.5 IP2。us_07 だけ） */
export const SURVIVOR_SHELL_SEED_OFFSET = 48;
/** 生存者の海へ撃った弾の印（砲弾の gunIndex。自艇へ撃った弾は 0） */
export const SURVIVOR_SHELL_GUN = 1;
/** 時計の比べの許し（固定ステップの 1/60 秒の和の丸め） */
const SHELL_TIME_EPS_S = 1e-6;

/** core が読む値（config/rescue-mission-data の RescueSetup.shelling がそのまま満たす。難易度で選んだ値） */
export interface SurvivorShellRules {
  readonly intervalS: number;
  readonly dispersionFactor: number;
}

export interface SurvivorShellState {
  /** 次の 1 発までの体感秒・次に探し始める砲台・撃った数・最後に撃った砲台と狙った点（絵の砲の向き） */
  cooldownS: number;
  next: number;
  shots: number;
  lastBattery: number;
  lastX: number;
  lastY: number;
}

/** 砲台を読む形（systems/shore-battery の ShoreBattery がそのまま満たす） */
export interface SurvivorShellBattery {
  readonly p: ShoreBatteryParams;
  readonly state: ShoreBatteryState;
}

export function createSurvivorShelling(r: SurvivorShellRules): SurvivorShellState {
  return { cooldownS: r.intervalS, next: 0, shots: 0, lastBattery: -1, lastX: NaN, lastY: NaN };
}

/** 砲台 b の射界の内で残りのある群の数（2 乗の距離・確保なし） */
export function survivorGroupsInArc(st: RescueState, p: ShoreBatteryParams): number {
  let n = 0;
  for (let i = 0; i < st.n; i++) {
    if (st.left[i]! <= 0) continue;
    const dx = st.gx[i]! - p.x;
    const dy = st.gy[i]! - p.y;
    if (dx * dx + dy * dy <= p.arc2) n++;
  }
  return n;
}

/** 射界の内で残りのある群の k 番目（0 始まり。無ければ −1） */
function groupInArcAt(st: RescueState, p: ShoreBatteryParams, k: number): number {
  let n = 0;
  for (let i = 0; i < st.n; i++) {
    if (st.left[i]! <= 0) continue;
    const dx = st.gx[i]! - p.x;
    const dy = st.gy[i]! - p.y;
    if (dx * dx + dy * dy > p.arc2) continue;
    if (n === k) return i;
    n++;
  }
  return -1;
}

/**
 * 固定ステップに 1 回（砲台の段の後）。free[k] は砲台 k がこのステップに自艇を撃てない（1）、running は救助の時間の内。撃った砲台の添字（撃たなければ −1）。
 * 撃てば onFire(砲台, 狙った群の中心 x, y)（絵の閃光・反動・砲の向き。乱数なし）
 */
export function stepSurvivorShelling(
  s: SurvivorShellState,
  r: SurvivorShellRules,
  bs: readonly SurvivorShellBattery[],
  free: Uint8Array,
  rescue: RescueState,
  running: boolean,
  rng: SeededRng,
  feelDt: number,
  onFire: (k: number, x: number, y: number) => void,
): number {
  const cd = Math.max(s.cooldownS - feelDt, -feelDt);
  s.cooldownS = cd;
  if (cd > SHELL_TIME_EPS_S) return -1;
  if (!running) {
    if (cd < 0) s.cooldownS = 0; // 救助の時間の外: 0 で待つ（繰り越さない）
    return -1;
  }
  const n = bs.length;
  for (let j = 0; j < n; j++) {
    const k = (s.next + j) % n;
    if (free[k] !== 1) continue;
    const b = bs[k]!;
    const m = survivorGroupsInArc(rescue, b.p);
    if (m === 0) continue;
    const sh = findFreeShell(b.state.shells);
    if (!sh) continue;
    const g = groupInArcAt(rescue, b.p, Math.min(m - 1, Math.floor(rng.next() * m)));
    const gx = rescue.gx[g]!;
    const gy = rescue.gy[g]!;
    const dx = gx - b.p.x;
    const dy = gy - b.p.y;
    const gun = b.p.gun;
    launchShell(sh, b.p.x, b.p.y, gx, gy, 0, 0, gun.shellSpeedMps, ((gun.dispersionM * Math.sqrt(dx * dx + dy * dy)) / gun.effectiveM) * r.dispersionFactor, SURVIVOR_SHELL_GUN, rng);
    s.cooldownS = cd + r.intervalS;
    s.next = (k + 1) % n;
    s.shots++;
    s.lastBattery = k;
    s.lastX = gx;
    s.lastY = gy;
    onFire(k, gx, gy);
    return k;
  }
  if (cd < 0) s.cooldownS = 0; // 撃てる砲台が無い: 0 で待つ（繰り越さない）
  return -1;
}
