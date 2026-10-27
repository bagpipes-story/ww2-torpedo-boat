// 夜の哨戒機の出撃（v0.6.7。jp_02「孤島の哨戒」。docs/02 §6.8、spec-v067 §C.2）: 門番（core/patrol-air）が発見するたびに、夜明けの空襲の core（core/air-strike。1 字も変えない）を
// 外から 1 波だけ始め直す。機 i は発見の隊形の方位 + spawn_offsets_deg[i]・同じ距離に濃さ 1 で現れ（受け渡しで機が跳ばず、一度消えない）、旋回 → 爆撃進路 → 投下 → 去る。
// 次の波は出させない（世界側の読み口が出撃の段でなければ中断を立てる）。KPI（来た波・爆弾・命中・被害・転舵の秒）は夜の累計のまま、この出撃の分は SortieBase からの差。
// Phaser 非依存・乱数を引かない（散布は stepAirStrike が seed+23 の系列から）・確保しない（SortieBase は任務の始めに 1 回）。
import { AIR_STRIKE_FADE_S, allDone, bombInAir, startAirStrike, type AirStrikeParams, type AirStrikeState } from './air-strike';
import type { BoatState } from './boat-motion';
import { wrapDeg360 } from './units';

/** この出撃の始めの夜の累計（モード 33「爆弾 6 発 命中 1（HP −35）」は差を出す） */
export interface SortieBase {
  bombs0: number;
  hits0: number;
  damage0: number;
}

export function createSortieBase(): SortieBase {
  return { bombs0: 0, hits0: 0, damage0: 0 };
}

/**
 * 1 波だけの出撃を始める（発見の瞬間。bearingDeg・rM は門番の findBearingDeg・findR）。空中に爆弾があれば何も変えずに false（例外にしない＝固定ステップで投げない。
 * 呼び手は次のステップで試し直す）。それ以外は始め直して true: 機 i は方位 bearingDeg + spawnOffsetsDeg[i]・距離 rM（[run_radius_m, spawn_m] に収める）で接近を始め、
 * 接近の秒を AIR_STRIKE_FADE_S にして受け渡しの瞬間から濃さ 1（接近の秒は濃さにしか使わない）。base にこの瞬間の夜の累計を写す
 */
export function restartAirSortie(st: AirStrikeState, p: AirStrikeParams, player: BoatState, bearingDeg: number, rM: number, base: SortieBase): boolean {
  if (bombInAir(st)) return false;
  st.started = false;
  st.cancelled = false;
  st.wave = 0;
  startAirStrike(st, p, player);
  const r = rM < p.runRadiusM ? p.runRadiusM : rM > p.spawnM ? p.spawnM : rM;
  for (let i = 0; i < st.planes.length; i++) {
    const pl = st.planes[i]!;
    pl.bearingDeg = wrapDeg360(bearingDeg + p.spawnOffsetsDeg[i]!);
    pl.r = r;
    pl.timerS = AIR_STRIKE_FADE_S;
  }
  base.bombs0 = st.bombsDropped;
  base.hits0 = st.hitsPlayer;
  base.damage0 = st.damagePlayer;
  return true;
}

/** 出撃が終わった: 全部の爆撃進路を飛び、全機が去り、空中に爆弾が無い（始まる前は false） */
export function airSortieComplete(st: AirStrikeState): boolean {
  return st.started && st.nextRun === st.totalRuns && allDone(st) && !bombInAir(st);
}

/** この出撃の分: 落とした爆弾・自艇への命中・自艇の失った HP */
export function sortieBombs(st: AirStrikeState, base: SortieBase): number {
  return st.bombsDropped - base.bombs0;
}

export function sortieHits(st: AirStrikeState, base: SortieBase): number {
  return st.hitsPlayer - base.hits0;
}

export function sortieDamage(st: AirStrikeState, base: SortieBase): number {
  return st.damagePlayer - base.damage0;
}
