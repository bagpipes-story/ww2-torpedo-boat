// S ボートの第二波（v0.8.5 IP2。us_07。実機 1 回目のユーザー「Sボートが一回退けると二度と来ないので第二波が来るようにしてください。」）: 凍結の米PT の AI（core/pt-boats ほか 20 本）は変えない。
// 第二波の S ボートは組み立ての時に同じ隊（PtSection）の後ろに足して確保し（sboatWaveParams で線と出発点を足した PtParams を組む）、出るまでは海域の外（PT_OUT）に置く
// （凍結の stepPtSection は PT_OUT を動かさず・見つけず・撃たない。絵は PT_OUT を描かない。去った数 q.out には数えない）。
// 第一波がみな去った（≥ PT_LEAVE＝フィッチの砲火で退いた・航過を使い切った・撃退・撃沈）時から体感秒で delay_s の後、救助の時間の内なら、第二波の全隻を哨戒（PT_PATROL）にする（1 回だけ。
// 第三波は無い）。救助の時間が先に終われば出ない。出た後は第一波と同じ凍結の AI・フィッチの砲火（core/sboat-cover）・夜明けの去り方。
// 第二波の出発点の揺らぎは seed+49 の系列（組み立ての時に 1 回: 線に沿って x・南北 y の 2 回。第一波の今夜の揺らぎ seed+16 は変えない）。東西の反転はしない（us_07 の mirror_chance 0）。
// 知られた違い: 凍結の AI の警戒の遅れは reaction_delay_s ＋ 添字 × wingman_delay_s なので、第二波の隊長の遅れは第一波の隻数ぶん長い（S ボート 1.5 + 2 × 3 ＝ 7.5 秒・ハード 10.5 秒）。
// Phaser 非依存・毎ステップ確保しない（確保は sboatWaveParams・createSboatWave の組み立ての 1 回だけ）。
import { ptStartAt, type PtParams } from './pt-data';
import { PT_LEAVE, PT_OUT, PT_PATROL, type PtSection } from './pt-boats';
import type { SeededRng } from './rng';

/** 第二波の出発点の揺らぎの系列（seed+49。v0.8.5 IP2。us_07 だけ） */
export const SBOAT_WAVE_SEED_OFFSET = 49;
/** 時計の比べの許し（固定ステップの 1/60 秒の和の丸め） */
const WAVE_TIME_EPS_S = 1e-6;

/** core が読む値（config/rescue-mission-data の RescueSetup.wave2 がそのまま満たす。線は第一波の隻数ぶん＝難易度で選んだ本数） */
export interface SboatWaveRules {
  readonly delayS: number;
  readonly legs: readonly (readonly number[])[];
  readonly jitterXM: number;
  readonly jitterYM: number;
}

export interface SboatWaveState {
  /** 第一波の隻数（第二波はこの添字から）・第二波の隻数 */
  readonly first: number;
  readonly n: number;
  /** 第一波がみな去った（時計が動く）・出るまでの体感秒・出た・出た通し番号（HUD の出来事）・救助の時間の終わりで出なかった */
  armed: boolean;
  leftS: number;
  spawned: boolean;
  seq: number;
  skipped: boolean;
}

/**
 * 組み立ての時に 1 回: 第一波（今夜の揺らぎ込みの p）の後ろに第二波の線と出発点を足した PtParams（count は第一波 ＋ 第二波）。
 * 揺らぎは rng（seed+49）から x → y の 2 回（±jitterXM・±jitterYM の一様。線ごとでなく波で 1 つ＝第一波と同じ形）。出発の位置は第一波と同じ start_along_m
 */
export function sboatWaveParams(p: PtParams, w: SboatWaveRules, rng: SeededRng): PtParams {
  const n1 = p.count;
  const n2 = w.legs.length;
  const n = n1 + n2;
  const dx = (rng.next() * 2 - 1) * w.jitterXM;
  const dy = (rng.next() * 2 - 1) * w.jitterYM;
  const wl = new Float64Array(4 * n2);
  for (let i = 0; i < n2; i++) for (let k = 0; k < 4; k++) wl[4 * i + k] = w.legs[i]![k]!;
  const wp: PtParams = { ...p, count: n2, legs: wl };
  const legs = new Float64Array(4 * n);
  const startX = new Float64Array(n);
  const startY = new Float64Array(n);
  const startHeadingDeg = new Float64Array(n);
  legs.set(p.legs.subarray(0, 4 * n1));
  startX.set(p.startX.subarray(0, n1));
  startY.set(p.startY.subarray(0, n1));
  startHeadingDeg.set(p.startHeadingDeg.subarray(0, n1));
  const s = { x0: 0, y0: 0, x1: 0, y1: 0, x: 0, y: 0, headingDeg: 0 };
  for (let i = 0; i < n2; i++) {
    ptStartAt(wp, i, dx, dy, false, s);
    const j = n1 + i;
    legs[4 * j] = s.x0;
    legs[4 * j + 1] = s.y0;
    legs[4 * j + 2] = s.x1;
    legs[4 * j + 3] = s.y1;
    startX[j] = s.x;
    startY[j] = s.y;
    startHeadingDeg[j] = s.headingDeg;
  }
  return { ...p, count: n, legs, startX, startY, startHeadingDeg };
}

/** 組み立ての時に 1 回（隊を作った直後）: 第二波を海域の外に置いて状態を作る。first は第一波の隻数 */
export function createSboatWave(q: PtSection, first: number): SboatWaveState {
  const n = q.boats.length - first;
  for (let i = first; i < q.boats.length; i++) q.boats[i]!.phase = PT_OUT;
  return { first, n, armed: false, leftS: 0, spawned: false, seq: 0, skipped: false };
}

/** 固定ステップに 1 回（凍結の stepPtSection とフィッチの砲火の後）。timeUp は救助の時間の終わり（夜明けのラッチ）。出したステップは true */
export function stepSboatWave(st: SboatWaveState, r: SboatWaveRules, q: PtSection, timeUp: boolean, feelDt: number): boolean {
  if (st.spawned || st.skipped) return false;
  if (timeUp) {
    st.skipped = true;
    return false;
  }
  if (!st.armed) {
    for (let i = 0; i < st.first; i++) if (q.boats[i]!.phase < PT_LEAVE) return false;
    st.armed = true;
    st.leftS = r.delayS;
  }
  st.leftS -= feelDt;
  if (st.leftS > WAVE_TIME_EPS_S) return false;
  for (let i = st.first; i < q.boats.length; i++) q.boats[i]!.phase = PT_PATROL;
  st.spawned = true;
  st.seq++;
  return true;
}

/** 今出ている（出た）隻数: 第一波 ＋ 出ていれば第二波（HUD・Result の隻数） */
export function sboatWaveAppeared(st: SboatWaveState): number {
  return st.first + (st.spawned ? st.n : 0);
}
